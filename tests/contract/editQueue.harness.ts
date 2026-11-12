// The edit queue's harness (the stroke pipeline's design, §7): the real `EditQueue`, the real worker session
// (src/worker/session.ts, the map's worker as the page reaches it) and the real `WeatherHost` (the Naturalize worker),
// joined by channels a seeded scheduler delivers. Each channel keeps its order, as `postMessage` does; when each message
// and answer arrives is the scheduler's. Faults: either worker goes silent (a message it never takes), a stroke is
// refused (a ramped Flatten, which the worker refuses as it refuses ground that would fall), another map is opened.
// The page's part is played as step 2 and step 3 will play it: a hard stroke's preview paints `queue.shown` on
// `queue.terrain()`, a Naturalize stroke goes through `StrokeFeed`, a press behind a landing stroke waits its turn.
//
// The oracle: a second `MapSession`, given the same intents one at a time in the order made, with no delay: a refused
// intent skipped, a move resolved by the same rule (`target`) on its own history.

import { expect } from "vitest";
import { bakeLandforms } from "../../src/core/doc/bake";
import { decodeProject } from "../../src/core/doc/document";
import { EditQueue, patchOf, STALE, StrokeFeed, target, type Envelope, type MapAnswer, type MapCall, type QueueOpen, type Rect, type StepRef, type StrokeWorker, type TicketView } from "../../src/core/doc/editQueue";
import type { EditOp } from "../../src/core/doc/ops";
import { withSpringPools } from "../../src/core/doc/placing";
import { MapSession, STEP_GONE, type HistoryItem } from "../../src/core/doc/session";
import { newRampedStroke } from "../../src/core/doc/strokes";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { answerBound, WEATHER_SILENT, WeatherHost } from "../../src/core/features/raster/remoteStroke";
import { groundUnderObjects } from "../../src/core/features/raster/objectGround";
import { StrokePreview, type TerrainState } from "../../src/core/features/raster/strokePreview";
import { composeStroke } from "../../src/core/features/raster/strokeComposer";
import * as ed from "../../src/worker/session";
import { stable } from "../../src/core/collab";
import { projectDiff } from "./collabFixtures";

/** A seeded generator in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The test's clock: time moves only when the test says. */
export class Clock {
  t = 0;
  private timers: { at: number; fn: () => void; live: boolean }[] = [];
  now = (): number => this.t;
  after = (ms: number, fn: () => void): (() => void) => {
    const timer = { at: this.t + ms, fn, live: true };
    this.timers.push(timer);
    return () => void (timer.live = false);
  };
  /** When the next live timer fires, or null. */
  next(): number | null {
    const live = this.timers.filter((x) => x.live);
    return live.length ? Math.min(...live.map((x) => x.at)) : null;
  }
  advance(ms: number): void {
    const until = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.live && x.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      due.live = false;
      due.fn();
    }
    this.t = until;
    this.timers = this.timers.filter((x) => x.live);
  }
}

/** What the map's worker took, in the order it took it. */
export interface Received {
  kind: "call" | "draft" | "cancelDraft";
  epoch: number;
  ticket: number;
  name?: string;
}

type ToMap = { kind: "call"; env: Envelope; call: MapCall; resolve: (a: MapAnswer) => void } | { kind: "draft"; env: Envelope; rect: Rect; heights: Uint8Array } | { kind: "cancelDraft"; env: Envelope };
type FromMap = { answer: MapAnswer; resolve: (a: MapAnswer) => void; heights: Uint8Array | null; epoch: number };
type ToNat = { run: () => unknown; resolve: (v: unknown) => void };

/** The map worker's edits by name, as the generator worker's entry reaches them (worker/generator.worker.ts). */
const EDITS: Record<string, (...a: never[]) => ed.SessionUpdate> = {
  apply: ed.apply,
  applyAll: ed.applyAll,
  applyStep: ed.applyStep,
  moveTo: ed.moveTo,
  undo: ed.undo,
  redo: ed.redo,
};

/** The objects standing on the worker's map, as the page's mirror holds them. */
const entities = () => ed.collabSession()!.built.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped }));

/** A stroke the harness's pointer drew: held, or let go and waiting its turn to compose. */
interface PageStroke {
  id: number;
  naturalize: boolean;
  settings: Omit<BrushParams, "dabs">;
  /** Dabs not yet given to the preview (the stroke waits behind a landing one). */
  buffered: number[];
  dabs: number[];
  letGo: boolean;
  preview: StrokePreview | null;
  /** The terrain it began on (its `pre` and `protect` copied). */
  before: TerrainState | null;
  feed: StrokeFeed | null;
  /** The worker will refuse its operation (a fault: a ramped Flatten). */
  refused: boolean;
}

export const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

export interface HarnessOptions {
  log?: boolean;
  mapBound?: number;
}

export class Harness {
  readonly clock = new Clock();
  queue: EditQueue;
  readonly received: Received[] = [];
  readonly lines: string[] = [];
  /** Each map's project as it was opened, by epoch (the oracle starts from it). */
  readonly opened = new Map<number, Uint8Array>();
  private toMap: ToMap[] = [];
  private fromMap: FromMap[] = [];
  private toNat: ToNat[] = [];
  private fromNat: { value: unknown; resolve: (v: unknown) => void }[] = [];
  private nat = new WeatherHost();
  /** Faults: the next call to that worker is never taken (it hangs). */
  loseNextMap = false;
  loseNextNat = false;
  /** Strokes not yet composed or still held, in order. */
  strokes: PageStroke[] = [];
  /** The stroke the pointer holds, if any. */
  held: PageStroke | null = null;
  /** I1 broken on an answer's arrival: `base` was not the worker's land as it answered. */
  readonly i1: string[] = [];
  readonly feeds: StrokeFeed[] = [];

  constructor(project: Uint8Array, opts: HarnessOptions = {}) {
    ed.listen(null);
    const open = ed.openProject(project);
    this.opened.set(open.epoch, project);
    this.queue = new EditQueue(open as QueueOpen, this.port(), this.clock, { line: (t) => void this.lines.push(t), expired: () => this.restartNat(), stale: () => this.resendLand() }, { log: opts.log ?? true, mapBound: opts.mapBound });
  }

  get W(): number {
    return this.queue.W;
  }

  private port() {
    return {
      send: (env: Envelope, call: MapCall) => new Promise<MapAnswer>((resolve) => this.toMap.push({ kind: "call", env, call, resolve })),
      draft: (env: Envelope, rect: Rect, heights: Uint8Array) => void this.toMap.push({ kind: "draft", env, rect, heights }),
      cancelDraft: (env: Envelope) => void this.toMap.push({ kind: "cancelDraft", env }),
    };
  }

  private natWorker(): StrokeWorker {
    const call = <T>(run: () => T): Promise<T> => new Promise<T>((resolve) => this.toNat.push({ run, resolve: resolve as (v: unknown) => void }));
    // (each call reaches the worker running when it is taken: a restarted worker's own)
    return {
      begin: (id, settings, ground, state, heights, W, H) => call(() => this.nat.begin(settings, ground, state, heights, W, H, id)),
      add: (id, dabs, pressure) => call(() => this.nat.add(dabs, pressure, id)),
      finish: (id, rigid) => call(() => this.nat.finish(rigid, id)),
      end: (id) => call(() => this.nat.end(id)),
      cancel: (id) => void this.toNat.push({ run: () => this.nat.cancel(id), resolve: () => {} }),
    };
  }

  /** A patch of the land did not lay on the land the queue holds: the worker's whole land, as the page asks for it. */
  private resendLand(): void {
    const l = ed.landNow();
    queueMicrotask(() => this.queue.event({ ok: true, errors: [], epoch: l.epoch, view: l.view as MapAnswer["view"] }));
  }

  /** The Naturalize worker never answered a stroke in time: a fresh one (what was sent to the old one is gone). */
  private restartNat(): void {
    this.nat = new WeatherHost();
    this.toNat = [];
    this.fromNat = [];
  }

  // ---------------------------------------------------------------------------------------------- delivery

  /** The map's worker takes its next message. */
  deliverMap(): boolean {
    const m = this.toMap.shift();
    if (!m) return false;
    if (this.loseNextMap && m.kind === "call") {
      this.loseNextMap = false;
      return true;
    }
    if (m.kind === "draft") {
      // (the draft's water itself is the worker's; its order is what is checked here)
      this.received.push({ kind: "draft", epoch: m.env.epoch, ticket: m.env.ticket });
      return true;
    }
    if (m.kind === "cancelDraft") {
      this.received.push({ kind: "cancelDraft", epoch: m.env.epoch, ticket: m.env.ticket });
      return true;
    }
    const call = m.call;
    this.received.push({ kind: "call", epoch: m.env.epoch, ticket: m.env.ticket, name: call.kind === "edit" ? call.name : "moveTo" });
    const answer = ed.ticketed(m.env, () => (call.kind === "moveTo" ? ed.moveTo(call.step) : EDITS[call.name](...(call.args as never[]))));
    const s = ed.collabSession();
    this.fromMap.push({ answer, resolve: m.resolve, heights: s ? s.built.heights.slice() : null, epoch: ed.currentEpoch() });
    return true;
  }

  /** The page takes the map worker's next answer. */
  async answerMap(): Promise<boolean> {
    const a = this.fromMap.shift();
    if (!a) return false;
    a.resolve(a.answer);
    await flush();
    if (a.heights && a.epoch === this.queue.epoch && !a.answer.stale && !Buffer.from(this.queue.base.heights).equals(Buffer.from(a.heights))) this.i1.push(`answer to ${a.answer.ticket}`);
    await this.compose();
    return true;
  }

  deliverNat(): boolean {
    const m = this.toNat.shift();
    if (!m) return false;
    if (this.loseNextNat) {
      this.loseNextNat = false;
      return true;
    }
    this.fromNat.push({ value: m.run(), resolve: m.resolve });
    return true;
  }

  async answerNat(): Promise<boolean> {
    const a = this.fromNat.shift();
    if (!a) return false;
    a.resolve(a.value);
    await flush();
    await this.compose();
    return true;
  }

  /** One message somewhere, the scheduler's pick. */
  async deliverOne(next: () => number): Promise<boolean> {
    const lanes = [this.toMap.length && "toMap", this.fromMap.length && "fromMap", this.toNat.length && "toNat", this.fromNat.length && "fromNat"].filter(Boolean) as string[];
    if (!lanes.length) return false;
    const lane = lanes[Math.floor(next() * lanes.length)];
    if (lane === "toMap") this.deliverMap();
    else if (lane === "fromMap") await this.answerMap();
    else if (lane === "toNat") this.deliverNat();
    else await this.answerNat();
    await flush();
    return true;
  }

  /** Everything delivered; the clock run on to the next timer when only a silent worker is left; until idle. */
  async settle(next: () => number = () => 0): Promise<void> {
    for (let guard = 0; guard < 100_000; guard++) {
      if (await this.deliverOne(next)) continue;
      await this.compose();
      // (composing may have sent something: delivered before any time passes)
      if (this.toMap.length || this.fromMap.length || this.toNat.length || this.fromNat.length) continue;
      if (!this.queue.pending() && !this.strokes.some((s) => s.letGo)) return;
      const due = this.clock.next();
      if (due === null) {
        if (this.queue.pending() && this.strokes.every((s) => !s.letGo) && this.held) return;
        throw new Error(`stuck: ${this.queue.pending()} tickets, ${this.strokes.length} strokes`);
      }
      this.clock.advance(due - this.clock.t);
      await flush();
    }
    throw new Error("never settled");
  }

  // ------------------------------------------------------------------------------------------- the page

  /** Pointer-down: a stroke's ticket at once, whatever is landing (I8). */
  press(tool: BrushParams["tool"], size: number, opts: { refused?: boolean; seed?: number } = {}): number {
    if (this.held) throw new Error("the pointer already holds a stroke");
    const naturalize = tool === "naturalize";
    const settings: Omit<BrushParams, "dabs"> = {
      tool,
      size,
      strength: 6,
      ...(naturalize ? { seed: opts.seed ?? 7, weathers: true as const } : {}),
      ...(tool === "flatten" ? { target: 4 } : {}),
    };
    const id = this.queue.stroke(tool);
    const s: PageStroke = { id, naturalize, settings, buffered: [], dabs: [], letGo: false, preview: null, before: null, feed: null, refused: !!opts.refused };
    this.strokes.push(s);
    this.held = s;
    void this.compose();
    return id;
  }

  /** The pointer moves: dabs at tiles (x, y), as the brush records them (×4). */
  async drag(points: [number, number][]): Promise<void> {
    const s = this.held;
    if (!s) return;
    const dabs = points.flatMap(([x, y]) => [Math.round((x + 0.5) * 4), Math.round((y + 0.5) * 4)]);
    s.buffered.push(...dabs);
    await this.compose();
  }

  /** Let go. */
  async letGo(): Promise<void> {
    const s = this.held;
    if (!s) return;
    this.held = null;
    s.letGo = true;
    await this.compose();
  }

  /** Esc while painting: the stroke goes. */
  esc(): void {
    const s = this.held;
    if (!s) return;
    this.held = null;
    this.strokes.splice(this.strokes.indexOf(s), 1);
    if (s.feed) s.feed.cancel();
    else this.queue.cancel(s.id);
  }

  /** Undo, as the page does it: while painting, the stroke is cancelled instead. */
  undo(): number | null {
    if (this.held) return this.esc(), null;
    return this.queue.undo();
  }

  redo(): number | null {
    if (this.held) return null;
    return this.queue.redo();
  }

  jump(to: StepRef | null): number | null {
    if (this.held) return null;
    return this.queue.jump(to);
  }

  edit(name: string, args: unknown[], label?: string): number {
    return this.queue.edit(name, args, label);
  }

  /** The editor closes and opens again on the same map: a stroke the button holds goes, as Esc; the queue and what
   *  was let go stay (I8). */
  remount(): void {
    this.esc();
  }

  /** Another map: whatever was let go lands on the map it was painted on first (planning's ruling 3); then the worker
   *  opens the next and the queue starts on it. Returns the leaving map's project, as the worker saved it. */
  async switchMap(project: Uint8Array, next?: () => number): Promise<Uint8Array> {
    this.esc();
    await this.settle(next);
    await this.queue.idle();
    const leaving = ed.project().bytes;
    const open = ed.openProject(project);
    this.opened.set(open.epoch, project);
    this.queue.reopen(open as QueueOpen);
    return leaving;
  }

  /** Strokes whose turn has come begin to compose; those let go end. */
  async compose(): Promise<void> {
    for (const s of [...this.strokes]) {
      const t = this.queue.ticket(s.id);
      if (!t || (t.state !== "open" && t.state !== "closing")) {
        this.strokes.splice(this.strokes.indexOf(s), 1);
        continue;
      }
      if (!this.queue.composable(s.id)) return;
      if (s.naturalize) this.composeNature(s);
      else this.composeHard(s);
      if (s.letGo) this.strokes.splice(this.strokes.indexOf(s), 1);
      else return;
    }
  }

  private composeHard(s: PageStroke): void {
    const q = this.queue;
    if (!s.preview) {
      const t = q.terrain();
      s.before = { ...t, pre: t.pre.slice(), protect: t.protect.slice() };
      s.preview = new StrokePreview({ ...s.settings }, t, q.shown, q.W, q.H);
    }
    const p = s.preview;
    if (s.buffered.length) {
      const dabs = s.buffered.splice(0);
      s.dabs.push(...dabs);
      const r = p.add(dabs);
      if (r) {
        q.painted(s.id, r);
        q.draft(s.id, r);
      }
    }
    if (!s.letGo) return;
    // (the one composer, as the page composes it: the operation complete, and its land before and after)
    const c = composeStroke({ ...s.settings, dabs: s.dabs } as BrushParams, s.settings.tool, { start: p.start, shown: q.shown, pre: p.pre, protect: p.protect, bounds: p.bounds, finished: p.finished, before: s.before! }, { W: q.W, H: q.H, heights: p.start, terrain: s.before!, entities: entities() });
    if (!c.tiles) return q.cancel(s.id);
    const params = { ...c.params, ...(s.refused ? { tool: "flatten" as const, edges: "ramped" as const } : {}) } as BrushParams;
    const op: EditOp = { op: "brush", params };
    q.ready(s.id, { kind: "edit", name: "apply", args: [op, "user", s.settings.tool] }, c.overlay);
  }

  private composeNature(s: PageStroke): void {
    if (!s.feed) {
      // (the ground under objects stays as it is: the page hands the preview the same runs the core adds, D368 (8))
      const ground = groundUnderObjects(entities());
      s.feed = new StrokeFeed(this.queue, s.id, s.settings, this.natWorker(), (d) => answerBound(d, s.settings.size), WEATHER_SILENT, ground.map((r) => [r[0], r[1], r[2]] as [number, number, number]));
      this.feeds.push(s.feed);
    }
    if (s.buffered.length) {
      const dabs = s.buffered.splice(0);
      s.dabs.push(...dabs);
      s.feed.add(dabs);
    }
    if (s.letGo) void s.feed.end({ entities: entities() });
  }

  /** How many messages wait in each channel. */
  inFlight(): number {
    return this.toMap.length + this.fromMap.length + this.toNat.length + this.fromNat.length;
  }
}

// ------------------------------------------------------------------------------------------------- checks

/** I3: the map's worker took the tickets in the order they were made, each once, and nothing of a ticket before the
 *  ticket ahead of it had been sent. */
export function checkOrder(received: readonly Received[]): string[] {
  const out: string[] = [];
  const calls = new Set<string>();
  let last = 0;
  let lastEpoch = -1;
  for (const r of received) {
    if (r.epoch !== lastEpoch) {
      lastEpoch = r.epoch;
      last = 0;
    }
    const key = `${r.epoch}:${r.ticket}`;
    if (r.kind === "call") {
      if (calls.has(key)) out.push(`ticket ${key} taken twice`);
      calls.add(key);
      if (r.ticket < last) out.push(`ticket ${key} taken after ${r.epoch}:${last}`);
      last = Math.max(last, r.ticket);
    } else if (r.ticket < last) out.push(`a ${r.kind} of ${key} came after ticket ${r.epoch}:${last}`);
  }
  return out;
}

/** I2 at quiescence: what the page shows, the terrain it paints on and its history are the worker's, byte for byte. */
export function checkConverged(h: Harness, where: string): void {
  const q = h.queue;
  expect(q.pending(), `${where}: tickets left`).toBe(0);
  const now = ed.terrainNow();
  expect(Buffer.from(q.shown).equals(Buffer.from(now.heights)), `${where}: shown is the worker's land`).toBe(true);
  expect(Buffer.from(q.base.heights).equals(Buffer.from(now.heights)), `${where}: base is the worker's land`).toBe(true);
  expect(Buffer.from(q.terrain().pre).equals(Buffer.from(now.terrain.pre)), `${where}: pre is the worker's`).toBe(true);
  expect(Buffer.from(q.terrain().protect).equals(Buffer.from(now.terrain.protect)), `${where}: protect is the worker's`).toBe(true);
  // (every tile map of the terrain the page paints on, laid from the answers' patches, #922 step 4; but the settled
  // water's depth and moisture, which come with the water's news, a channel the harness does not deliver)
  for (const k of ["channel", "floor", "worn", "base", "locked", "field"] as const) {
    const a = q.base.terrain[k] as ArrayLike<number> | null | undefined;
    const b = now.terrain[k] as ArrayLike<number> | null | undefined;
    expect(!a === !b, `${where}: ${k} is there as the worker's`).toBe(true);
    if (a && b) expect(Buffer.from(new Uint8Array((a as Uint8Array).buffer, (a as Uint8Array).byteOffset, (a as Uint8Array).byteLength)).equals(Buffer.from(new Uint8Array((b as Uint8Array).buffer, (b as Uint8Array).byteOffset, (b as Uint8Array).byteLength))), `${where}: ${k} is the worker's`).toBe(true);
  }
  expect(JSON.stringify(q.base.terrain.rockHold ?? null), `${where}: the rock's holds are the worker's`).toBe(JSON.stringify(now.terrain.rockHold ?? null));
  expect(q.landResends, `${where}: every patch laid on the land it was made against`).toBe(0);
  const rows = q.history();
  const worker = ed.sessionInfo().history;
  expect(rows.rows.map((r) => [("seq" in r.ref ? r.ref.seq : -1), r.applied]), `${where}: history`).toEqual(worker.map((w) => [w.seq, w.applied]));
}

/** I6: a stroke answered with nothing else between its start and its answer was guessed right, and the session logged
 *  its operation as the page sent it (since step 4 the one composer completes it on the page, strokeComposer.ts: before,
 *  where the worker completed the operation, adding what only it worked out, the guess could differ). */
export function checkGuesses(h: Harness, epoch: number): string[] {
  const log = ed.collabSession()!.document.edits;
  const out: string[] = [];
  for (const t of h.queue.log()) {
    if (t.epoch !== epoch || t.kind !== "stroke" || t.state !== "done") continue;
    const e = log.find((o) => o.seq === t.step);
    if (!e) continue;
    const sent = (t.call as { args: unknown[] }).args[0];
    if (stable({ op: e.op, params: e.params }) !== stable(sent)) out.push(`stroke ${t.id}: the session logged another operation than the page sent`);
    if (t.alone && t.mispredicted) out.push(`stroke ${t.id} was alone and guessed wrong`);
  }
  return out;
}

/** The oracle: the same intents, one at a time, in the order made, with no delay. Returns its session. */
export function oracle(project: Uint8Array, tickets: readonly TicketView[]): { session: MapSession; disagree: string[] } {
  const s = MapSession.open(decodeProject(project), { deferWater: true });
  bakeLandforms(s);
  s.setWaterMode("defer");
  const steps = new Map<number, number | null>();
  const disagree: string[] = [];
  const head = (): number | null => s.history().filter((x) => x.applied).at(-1)?.seq ?? null;
  for (const t of [...tickets].sort((a, b) => a.id - b.id)) {
    // (never reached the worker: Esc, a stroke that changed nothing, a timeout, another map)
    if (t.state === "cancelled" || t.timedOut || (t.state === "refused" && t.line === STALE)) {
      steps.set(t.id, null);
      continue;
    }
    if (t.kind === "move") {
      const rows = s.history().map((x) => ({ ref: { seq: x.seq! } as StepRef, applied: x.applied, label: x.label }));
      const to = target(rows, rows.filter((r) => r.applied).length - 1, t.move!, (id) => (steps.has(id) ? steps.get(id)! : undefined));
      if (typeof to === "symbol") {
        if (t.state !== "dropped") disagree.push(`move ${t.id}: the oracle drops it, the queue ${t.state}`);
        continue;
      }
      if (to.kind === "gone") {
        if (t.state !== "refused" || t.line !== STEP_GONE) disagree.push(`move ${t.id}: the oracle finds its step gone, the queue ${t.state}`);
        continue;
      }
      const r = s.moveTo(to.seq);
      const ok = !r.errors.length;
      if (ok !== (t.state === "done")) disagree.push(`move ${t.id}: the oracle ${ok ? "moves" : "refuses"}, the queue ${t.state}`);
      continue;
    }
    const call = t.call!;
    if (call.kind !== "edit") throw new Error("an edit with a move's call");
    let ok: boolean;
    if (call.name === "apply") {
      const [op, origin, label] = call.args as [EditOp, "user", string];
      ok = !newRampedStroke(op) && s.apply(op, origin, label).ok;
    } else if (call.name === "applyAll") {
      const [ops, label] = call.args as [EditOp[], string];
      ok = s.applyAll(withSpringPools(s, ops), "user", label).ok;
    } else throw new Error(`the oracle has no ${call.name}`);
    if (ok !== (t.state === "done")) disagree.push(`${t.kind} ${t.id} (${call.name}): the oracle ${ok ? "applies" : "refuses"} it, the queue ${t.state} ${t.line ?? ""}`);
    steps.set(t.id, ok ? head() : null);
  }
  return { session: s, disagree };
}

/** The worker's map against the oracle's: the land, the history, and the project, which reopens byte for byte (I10). */
export function checkOracle(h: Harness, epoch: number, where: string): void {
  const project = h.opened.get(epoch)!;
  const { session, disagree } = oracle(project, h.queue.log().filter((t) => t.epoch === epoch));
  expect(disagree, `${where}: the queue and the oracle`).toEqual([]);
  expect(checkGuesses(h, epoch), `${where}: I6`).toEqual([]);
  const worker = ed.collabSession()!;
  expect(Buffer.from(worker.built.heights).equals(Buffer.from(session.built.heights)), `${where}: land`).toBe(true);
  const rows = (x: HistoryItem[]) => x.map((r) => `${r.seq}:${r.applied ? "+" : "-"}:${r.label}`);
  expect(rows(worker.history()), `${where}: history`).toEqual(rows(session.history()));
  const bytes = worker.project();
  expect(projectDiff(bytes, session.project()), `${where}: project`).toBe("");
  // (I10: the project saved reopens to the same map, its log replayed afresh to the same land byte for byte, D455)
  const again = MapSession.open(decodeProject(bytes));
  expect(Buffer.from(again.built.heights).equals(Buffer.from(worker.built.heights)), `${where}: reopened land`).toBe(true);
  const replayed = MapSession.open(decodeProject(bytes), { rebuild: true });
  expect(Buffer.from(replayed.built.heights).equals(Buffer.from(worker.built.heights)), `${where}: replayed land`).toBe(true);
  expect(projectDiff(again.project(), bytes, ["stored"]), `${where}: reopened project`).toBe("");
}
