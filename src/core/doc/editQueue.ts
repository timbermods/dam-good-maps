// The page's edits in one queue (the stroke pipeline's design, migration step 1; EDITOR_PLAN "Architecture", "The
// edit queue"). Headless: no DOM, no Comlink, no timers of its own. The map's worker, the clock and the page's drawing
// are given to it, so a test drives every interleaving with a worker as slow or as silent as it likes.
//
// - **One truth (I1).** `base` is the worker's land and terrain, assigned only from its answers and events, never painted
//   into. `shown` (with the terrain's `pre` and `protect` the page paints strokes on) is `base` with the overlays of the
//   tickets still unanswered laid on in order (I2): a stroke's overlay is the land it changed, before and after. An
//   answer sets `base`, drops its ticket's overlay and lays the rest again over the rectangle the two touched; a
//   refusal does the same with `base` unchanged, so the overlay simply goes. No counter, no flag, no whole-map compare.
// - **One order (I3).** Every edit, stroke, undo, redo and History jump is a ticket, numbered when the player acts and
//   sent in that order, one with the worker at a time. A stroke's ticket exists from pointer-down, so whatever the
//   player does next waits behind it without being told to. A stroke's water drafts belong to its ticket and go only
//   once the ticket before it has gone.
// - **Identity (I4).** Every call carries `{ epoch, ticket }`; an answer for another map (epoch) is dropped at one door.
// - **Moves name their step (I5).** Undo, redo and a jump record, when pressed, the step they mean (a step's `seq`, or a
//   ticket still on its way); when the move reaches the head every ticket before it has its answer, so the step is known,
//   or known never to have happened (refused, cancelled, timed out), and then the move does nothing: the player's wish
//   is already true. The worker's one call for all three is `moveTo(seq | null)`.
// - **Liveness (I7).** One watchdog, on the head ticket: a stroke let go whose last land is still coming (`closing`,
//   Naturalize) waits as long as its worker may take; a ticket with the map's worker waits `MAP_ANSWER_MS`. Then it is
//   refused with its one line, its overlay goes and the queue moves on. `idle()` always resolves.
// - **Nothing seen is lost (I8).** A press always makes a ticket (behind a landing stroke, it waits its turn to compose,
//   `composable`); a stroke let go is answered or refused with a line, never dropped; a map switch awaits `idle()`.
//
// The page's strokes, moves and edits are on it (step 2, src/editor/session/useSession.ts `edits`), and Naturalize's
// strokes through `StrokeFeed`, its landing a `closing` ticket under the one watchdog (step 3, src/editor/brushes.ts);
// every stroke's operation is composed complete on the page (step 4, raster/strokeComposer.ts), and an answer's land
// is the rectangle it changed, laid on `base` (step 4, landPatch.ts).

import type { BrushParams } from "../features/raster/brush";
import type { TerrainState } from "../features/raster/strokePreview";
import type { StandingObject } from "../features/raster/objectGround";
import { composeStroke } from "../features/raster/strokeComposer";
import { layLand, type Chain, type LandPatch } from "./landPatch";
import type { HistoryItem } from "./session";

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** What names a message's map and request: the worker's map (`epoch`, bumped whenever it takes another map) and the
 *  queue's ticket. */
export interface Envelope {
  epoch: number;
  ticket: number;
}

/** The line for a call meant for a map the worker no longer has open (a backstop: a map switch waits for the queue). */
export const STALE = "That edit was meant for the map before this one, so it was not made.";
/** The line for a ticket the map's worker never answered in time. */
export const MAP_SILENT = "The map stopped answering, so that edit was not made. Try it again.";
/** The line for a stroke whose last land never came in time (the Naturalize worker's line, remoteStroke.ts, is given
 *  where it applies). */
export const STROKE_SILENT = "That stroke never finished, so it was taken back. Paint it again.";
/** How long a ticket may be with the map's worker (ms): generous, an edit at 256² takes well under a second. */
export const MAP_ANSWER_MS = 30_000;
/** Answered strokes whose before and after the queue keeps, so their undo and redo show at once (U10: bounded). */
export const KEPT_STROKES = 8;

/** The land's bytes over a rectangle, row by row. */
export interface Patch {
  heights: Uint8Array;
  pre: Uint8Array;
  protect: Uint8Array;
}

/** A change to the land over a rectangle: its bytes before and after. Laid on, it writes `after` where it differs from
 *  `before`, channel by channel, and leaves the rest to what lies under it. */
export interface Overlay {
  rect: Rect;
  before: Patch;
  after: Patch;
}

/** A map as it opens in the editor (the worker's `SessionOpen`). */
export interface QueueOpen {
  epoch: number;
  view: { W: number; H: number; heights: Uint8Array };
  terrain: TerrainState;
  info: { history: HistoryItem[] };
  /** The numbers of the land and of its water (landPatch.ts): the first patches lay on them. */
  landSeq?: number;
  wetSeq?: number;
}

/** The parts of a worker's answer or event the queue reads (its `SessionUpdate`, `StaleAnswer` or an event). */
export interface MapAnswer {
  ok: boolean;
  errors: string[];
  epoch?: number;
  ticket?: number;
  stale?: true;
  /** The map's revision after the call (the worker's `info.version`). */
  rev?: number;
  /** The step the history stands at after the call (the one an edit made or joined), or null before the first. */
  step?: number | null;
  view?: { heights?: Uint8Array; terrain?: TerrainState; terrainRect?: Rect | null; land?: LandPatch; wet?: LandPatch; landSeq?: number; wetSeq?: number };
  info?: { history: HistoryItem[]; W?: number; H?: number };
}

/** A ticket's call to the map's worker: an edit by its name and arguments (the worker's API), or a move. */
export type MapCall = { kind: "edit"; name: string; args: unknown[] } | { kind: "moveTo"; step: number | null };

/** The map's worker, as the queue reaches it. */
export interface MapPort {
  send(env: Envelope, call: MapCall): Promise<MapAnswer>;
  /** A stroke's ground so far over `rect` (its water flows on it, D197): no answer. */
  draft?(env: Envelope, rect: Rect, heights: Uint8Array): void;
  /** The stroke whose drafts went was taken back: its water goes. */
  cancelDraft?(env: Envelope): void;
}

/** The clock: the page's `setTimeout`, a test's own. */
export interface QueueClock {
  now(): number;
  /** Calls `fn` once `ms` have passed; returns its cancel. */
  after(ms: number, fn: () => void): () => void;
}

/** What the page hears from the queue. */
export interface QueueHost {
  /** The shown land changed over `rect` (redraw it), or everywhere (null: another map, a resync, a resize). */
  shown?(rect: Rect | null): void;
  /** A ticket was refused, timed out or went stale: its one line. */
  line?(text: string, ticket: number): void;
  /** A stroke let go never finished in time (its worker is silent: start another for the next stroke). */
  expired?(ticket: number): void;
  /** Every answer for the map open, after `base` took it, and the ticket it answers (null: an event, or late). */
  answer?(a: MapAnswer, ticket: TicketView | null): void;
  /** A patch of the land did not lay on the land `base` holds (an answer missed, or whole land from elsewhere): ask the
   *  worker for the whole land again (its `landNow`, taken as an event). */
  stale?(): void;
  /** The last ticket ended: nothing is on its way (the page has the session's land; its water's news may follow, the
   *  worker's `idleWater`). Once each time the queue goes idle. */
  idle?(): void;
}

/** A step of the history named for a move: a step the worker made (`seq`), or a ticket still on its way. */
export type StepRef = { seq: number } | { ticket: number };
export type Move = { kind: "undo"; of: StepRef } | { kind: "redo"; of: StepRef } | { kind: "jump"; to: StepRef | null };

export type TicketKind = "stroke" | "edit" | "move";
/** `open`: a stroke the button holds. `closing`: let go, its last land still coming. `ready`: waiting its turn. `sent`:
 *  with the map's worker. Then `done`, `refused` (by the worker, or timed out, or stale), `cancelled` (Esc, or a
 *  stroke that changed nothing) or `dropped` (a move whose step never happened). */
export type TicketState = "open" | "closing" | "ready" | "sent" | "done" | "refused" | "cancelled" | "dropped";

/** A ticket as the page and the tests see it. */
export interface TicketView {
  readonly id: number;
  readonly epoch: number;
  readonly kind: TicketKind;
  readonly state: TicketState;
  readonly call: MapCall | null;
  readonly move: Move | null;
  /** The step it made, joined or moved to (done), or null. */
  readonly step: number | null;
  readonly line: string | null;
  /** Its answer showed land other than the queue had shown (a wrong guess, lasting one round trip). */
  readonly mispredicted: boolean;
  /** No other ticket was waiting when it began, none was made before its answer, and nothing else changed the map. */
  readonly alone: boolean;
  /** It timed out (refused by the watchdog, not by the worker). */
  readonly timedOut: boolean;
}

/** A row of the history as the queue predicts it: the worker's steps, then the tickets on their way. */
export interface HistoryRow {
  ref: StepRef;
  applied: boolean;
  label: string;
}

interface Ticket {
  id: number;
  epoch: number;
  kind: TicketKind;
  state: TicketState;
  label: string;
  call: MapCall | null;
  overlay: Overlay | null;
  /** A stroke still being painted, or landing: the rectangle its preview has drawn into `shown`. */
  painted: Rect | null;
  /** A closing stroke: how long the watchdog waits for it, and the line it says when it gives up. */
  bound: number | null;
  silentLine: string;
  move: Move | null;
  /** Drafts of the stroke not yet sent (they wait for the ticket before it to go): their rectangle. */
  drafts: Rect | null;
  drafted: boolean;
  step: number | null;
  line: string | null;
  mispredicted: boolean;
  alone: boolean;
  timedOut: boolean;
}

/** A stroke answered: its land before and after, kept so its undo and redo show at once. */
interface Kept {
  seq: number;
  rect: Rect;
  before: Patch;
  after: Patch;
}

const DROP = Symbol("drop");

export interface QueueOptions {
  mapBound?: number;
  /** Keep every ticket's view (`log()`): the tests' oracle reads it. */
  log?: boolean;
}

export class EditQueue {
  /** The map open: the worker's epoch for it. */
  epoch: number;
  W: number;
  H: number;
  /** The worker's land and terrain (I1). */
  base: { heights: Uint8Array; terrain: TerrainState };
  /** What the page shows: `base` with the overlays laid on (the renderer and a stroke's preview hold this array; it
   *  is replaced only by another map, or a resize). */
  shown: Uint8Array;
  private shownPre: Uint8Array;
  private shownProtect: Uint8Array;
  /** The tickets not yet ended, in order; the head is the only one ever with the worker. */
  private tickets: Ticket[] = [];
  private nextId = 1;
  /** The worker's history, from its last answer. */
  private rows: HistoryItem[];
  /** A ticket's step, once it ended: the seq it made, or null when it never happened. */
  private resolved = new Map<number, number | null>();
  private kept: Kept[] = [];
  /** Land an answer changed under a stroke still being drawn: laid again once it lets go. */
  private deferred: Rect | null = null;
  private watch: { id: number; state: TicketState; cancel: () => void } | null = null;
  private idlers: (() => void)[] = [];
  /** A ticket was made since the queue was last idle (`QueueHost.idle` once on the way back). */
  private worked = false;
  /** Strokes waiting their turn to compose (`whenComposable`). */
  private composers: { id: number; resolve: (ok: boolean) => void }[] = [];
  /** Who waits for a ticket to end (`settled`). */
  private settlers = new Map<number, ((t: TicketView) => void)[]>();
  private readonly all: Ticket[] | null;
  private readonly mapBound: number;
  /** Answers that showed land other than the queue had shown, in any channel: the heights, or the terrain's `pre` or
   *  `protect` the page paints on (I6). */
  mispredictions = 0;
  /** Of those, the answers whose heights differed: the land the player saw change when the answer came (the page's
   *  `strokeMismatches`). Since step 4 the page sends a stroke complete (strokeComposer.ts), so a stroke `alone` is
   *  never guessed wrong in any channel. */
  landMispredictions = 0;
  /** Messages for another map that reached the door (and tickets a new map found waiting): never, in normal use. */
  staleDrops = 0;
  /** The numbers of the land and of its water `base` holds (landPatch.ts), each null when unknown. */
  private seqs: Record<Chain, number | null>;
  /** The patches `base` took (the page asks, so it never lays one twice, `took`). */
  private taken = new WeakSet<LandPatch>();
  /** Patches that did not lay on the land `base` held (the worker sent the whole land again). */
  landResends = 0;

  constructor(
    open: QueueOpen,
    private readonly port: MapPort,
    private readonly clock: QueueClock,
    private readonly host: QueueHost = {},
    opts: QueueOptions = {},
  ) {
    this.mapBound = opts.mapBound ?? MAP_ANSWER_MS;
    this.all = opts.log ? [] : null;
    this.epoch = open.epoch;
    this.W = open.view.W;
    this.H = open.view.H;
    this.base = { heights: open.view.heights.slice(), terrain: open.terrain };
    this.shown = open.view.heights.slice();
    this.shownPre = open.terrain.pre.slice();
    this.shownProtect = open.terrain.protect.slice();
    this.rows = open.info.history;
    this.seqs = { land: open.landSeq ?? null, wet: open.wetSeq ?? null };
  }

  // ------------------------------------------------------------------------------------------ what the page reads

  /** Did `base` take this patch already (an answer's, or an event's)? */
  took(p: LandPatch): boolean {
    return this.taken.has(p);
  }

  /** The terrain the page paints strokes on: the worker's, with the overlays' `pre` and `protect` laid on. */
  terrain(): TerrainState {
    return { ...this.base.terrain, pre: this.shownPre, protect: this.shownProtect };
  }

  /** Tickets not yet ended. */
  pending(): number {
    return this.tickets.length;
  }

  /** Every ticket made, as it stands (only with `log`). */
  log(): TicketView[] {
    return (this.all ?? []).map(view);
  }

  ticket(id: number): TicketView | null {
    const t = this.all?.find((k) => k.id === id) ?? this.tickets.find((k) => k.id === id);
    return t ? view(t) : null;
  }

  /** The history as it will stand once every ticket is answered as the queue expects: the worker's steps, then the
   *  tickets on their way; `cursor` is the last applied row (−1: before the first). */
  history(): { rows: HistoryRow[]; cursor: number } {
    let rows: HistoryRow[] = this.rows.map((h) => ({ ref: { seq: h.seq! }, applied: h.applied, label: h.label }));
    let cursor = rows.filter((r) => r.applied).length - 1;
    for (const t of this.tickets) {
      if (t.kind === "move") {
        const to = target(rows, cursor, t.move!, (id) => this.stepOf(id));
        if (to === DROP || to.kind === "gone") continue;
        cursor = to.index;
      } else {
        rows = rows.slice(0, cursor + 1);
        rows.push({ ref: { ticket: t.id }, applied: true, label: t.label });
        cursor++;
      }
      rows = rows.map((r, k) => (r.applied === k <= cursor ? r : { ...r, applied: k <= cursor }));
    }
    return { rows, cursor };
  }

  /** May this stroke begin to compose now? Not while a stroke before it is still being drawn or landing: its samples
   *  wait (they are never dropped, I8), and its preview starts from the land that stroke leaves. */
  composable(id: number): boolean {
    for (const t of this.tickets) {
      if (t.id === id) return true;
      if (t.kind === "stroke" && (t.state === "open" || t.state === "closing")) return false;
    }
    return true;
  }

  /** Resolves true once stroke `id` may compose (`composable`), or false once its ticket ended first (Esc, another
   *  map): a press behind a landing stroke composes then (I8). */
  whenComposable(id: number): Promise<boolean> {
    if (!this.live(id)) return Promise.resolve(false);
    if (this.composable(id)) return Promise.resolve(true);
    return new Promise((resolve) => this.composers.push({ id, resolve }));
  }

  /** Resolves once no ticket is left (a stroke the button still holds counts: `cancelOpen` lets it go as Esc). */
  idle(): Promise<void> {
    if (!this.tickets.length) return Promise.resolve();
    return new Promise((resolve) => this.idlers.push(resolve));
  }

  /** Resolves once ticket `id` has ended (answered, refused, cancelled or dropped), after the page heard its answer
   *  (`QueueHost.answer`): its view as it ended. A ticket that ended already, or never was, resolves at once (null when
   *  the queue no longer knows it). */
  settled(id: number): Promise<TicketView | null> {
    if (!this.live(id)) return Promise.resolve(this.ticket(id));
    return new Promise((resolve) => {
      const w = this.settlers.get(id);
      if (w) w.push(resolve);
      else this.settlers.set(id, [resolve]);
    });
  }

  // ------------------------------------------------------------------------------------------ what the page does

  /** Pointer-down: a stroke's ticket. Its preview paints into `shown` (on `terrain()`) as it is drawn, saying where
   *  (`painted`); `close` or `ready` when it lets go, `cancel` for Esc. */
  stroke(label = "Stroke"): number {
    return this.make("stroke", "open", label, null, null).id;
  }

  /** The stroke's preview drew into `shown` over `rect`. */
  painted(id: number, rect: Rect): void {
    const t = this.live(id);
    if (t && (t.state === "open" || t.state === "closing")) t.painted = grow(t.painted, rect);
  }

  /** Let go, its last land and its operation still to come (Naturalize): the watchdog gives it `bound` ms once it is
   *  the head, then takes it back with `silentLine`. */
  close(id: number, bound: number, silentLine = STROKE_SILENT): void {
    const t = this.live(id);
    if (!t || t.state !== "open") return;
    t.state = "closing";
    t.bound = bound;
    t.silentLine = silentLine;
    this.pump();
  }

  /** A closing stroke's worker took a call: it may take `bound` ms more from now. */
  due(id: number, bound: number): void {
    const t = this.live(id);
    if (!t || t.state !== "closing") return;
    t.bound = bound;
    if (this.watch?.id === id) this.disarm();
    this.pump();
  }

  /** The stroke's operation (a call the worker applies) and the land it changed. */
  ready(id: number, call: MapCall, overlay: Overlay): void {
    const t = this.live(id);
    if (!t || (t.state !== "open" && t.state !== "closing")) return;
    t.state = "ready";
    t.call = call;
    t.overlay = overlay;
    const r = grow(t.painted, overlay.rect);
    t.painted = null;
    if (this.watch?.id === id) this.disarm();
    this.refresh(r);
    this.laid();
    this.unblock();
    this.pump();
  }

  /** Esc, or a stroke that changed nothing: the ticket goes and the land it drew with it. */
  cancel(id: number, line?: string): void {
    const t = this.live(id);
    if (!t || (t.state !== "open" && t.state !== "closing" && t.state !== "ready")) return;
    this.end(t, "cancelled", line ?? null);
  }

  /** Every stroke the button holds is let go as Esc lets one go (the editor closes, a map is about to switch). */
  cancelOpen(): void {
    for (const t of [...this.tickets]) if (t.kind === "stroke" && t.state === "open") this.end(t, "cancelled", null);
  }

  /** Any other edit: the worker's call by name. */
  edit(name: string, args: unknown[], label = name): number {
    return this.make("edit", "ready", label, { kind: "edit", name, args }, null).id;
  }

  /** Ctrl+Z: take back the step under the cursor as the player sees it. Null: nothing to take back. */
  undo(): number | null {
    const { rows, cursor } = this.history();
    return cursor < 0 ? null : this.move({ kind: "undo", of: rows[cursor].ref });
  }

  /** Ctrl+Y: bring back the step above the cursor. Null: nothing to bring back. */
  redo(): number | null {
    const { rows, cursor } = this.history();
    return cursor + 1 >= rows.length ? null : this.move({ kind: "redo", of: rows[cursor + 1].ref });
  }

  /** A History row: stand at that step (null: before the first). */
  jump(to: StepRef | null): number {
    return this.move({ kind: "jump", to });
  }

  /** A stroke's ground changed over `rect` (its water flows on it): sent with the stroke's `shown` once every ticket
   *  before it has gone to the worker, held (and joined) until then. */
  draft(id: number, rect: Rect): void {
    const t = this.live(id);
    if (!t || t.kind !== "stroke") return;
    t.drafts = grow(t.drafts, rect);
    this.flushDrafts();
  }

  /** Another map (the worker's open, with its epoch): whatever is left is refused as stale (a map switch awaits
   *  `idle()` first, so normally nothing is), and the queue starts again on the new map. */
  reopen(open: QueueOpen): void {
    for (const t of [...this.tickets]) {
      this.staleDrops++;
      this.end(t, "refused", STALE, false);
    }
    this.disarm();
    this.epoch = open.epoch;
    this.W = open.view.W;
    this.H = open.view.H;
    this.base = { heights: open.view.heights.slice(), terrain: open.terrain };
    this.shown = open.view.heights.slice();
    this.shownPre = open.terrain.pre.slice();
    this.shownProtect = open.terrain.protect.slice();
    this.rows = open.info.history;
    this.seqs = { land: open.landSeq ?? null, wet: open.wetSeq ?? null };
    this.resolved.clear();
    this.kept = [];
    this.deferred = null;
    this.host.shown?.(null);
    this.wake();
  }

  /** A shared session's land came (today's rule, D362): `base` is it, the kept strokes go, the overlays still on their
   *  way are laid on it again. */
  resync(land: { heights: Uint8Array; terrain: TerrainState }, history?: HistoryItem[]): void {
    this.base = { heights: land.heights, terrain: land.terrain };
    if (history) this.rows = history;
    this.kept = [];
    for (const t of this.tickets) t.alone = false;
    if (land.heights.length !== this.shown.length) return this.resize();
    this.refresh({ x0: 0, y0: 0, x1: this.W - 1, y1: this.H - 1 });
  }

  /** A shared session's update (D362): its land, whole or a patch on the land `base` holds, is `base` (`resync`). */
  resyncView(v: NonNullable<MapAnswer["view"]>, history?: HistoryItem[]): void {
    if (v.land || v.wet) {
      if (v.land) this.layPatch(v.land);
      if (v.wet) this.layPatch(v.wet);
    } else if (v.heights || v.terrain) {
      this.seqs = { land: v.landSeq ?? null, wet: v.wetSeq ?? null };
      this.base = { heights: v.heights ?? this.base.heights, terrain: v.terrain ?? this.base.terrain };
    }
    this.resync(this.base, history);
  }

  /** An event from the map's worker (its water, a check, a shared session's update): its land, if it carries any,
   *  is the worker's. */
  event(e: MapAnswer): void {
    if (e.epoch !== undefined && e.epoch !== this.epoch) {
      this.staleDrops++;
      return;
    }
    if (!e.view?.heights && !e.view?.terrain && !e.view?.land && !e.view?.wet && !e.info) return;
    for (const t of this.tickets) t.alone = false;
    const r = this.take(e);
    if (r) this.refresh(r);
    this.host.answer?.(e, null);
  }

  // ------------------------------------------------------------------------------------------------ the queue

  private make(kind: TicketKind, state: TicketState, label: string, call: MapCall | null, move: Move | null): Ticket {
    const alone = this.tickets.length === 0;
    for (const t of this.tickets) t.alone = false;
    const t: Ticket = { id: this.nextId++, epoch: this.epoch, kind, state, label, call, overlay: null, painted: null, bound: null, silentLine: STROKE_SILENT, move, drafts: null, drafted: false, step: null, line: null, mispredicted: false, alone, timedOut: false };
    this.tickets.push(t);
    this.all?.push(t);
    this.worked = true;
    // (shown at once when the queue holds the land of the step a move goes over, and the land stands as that step left
    // it: a recent stroke's undo or redo is one paste of a rectangle, D453)
    if (kind === "move") this.predict(t);
    this.pump();
    return t;
  }

  private move(m: Move): number {
    return this.make("move", "ready", m.kind, null, m).id;
  }

  private live(id: number): Ticket | null {
    return this.tickets.find((t) => t.id === id) ?? null;
  }

  private stepOf(id: number): number | null | undefined {
    return this.resolved.has(id) ? this.resolved.get(id)! : undefined;
  }

  /** Send the head when it is ready, one with the worker at a time; arm the watchdog on it. */
  private pump(): void {
    for (;;) {
      const t = this.tickets[0];
      if (!t) {
        this.disarm();
        this.wake();
        return;
      }
      if (t.state === "sent") return this.arm(t, this.mapBound, MAP_SILENT);
      if (t.state === "open") {
        this.disarm();
        return this.flushDrafts();
      }
      if (t.state === "closing") {
        this.flushDrafts();
        return t.bound === null ? this.disarm() : this.arm(t, t.bound, t.silentLine);
      }
      if (t.kind === "move") {
        const rows = this.rows.map((h) => ({ ref: { seq: h.seq! } as StepRef, applied: h.applied, label: h.label }));
        const to = target(rows, rows.filter((r) => r.applied).length - 1, t.move!, (id) => this.stepOf(id));
        if (to === DROP) {
          this.end(t, "dropped", null);
          continue;
        }
        t.call = { kind: "moveTo", step: to.seq };
      }
      this.send(t);
    }
  }

  private send(t: Ticket): void {
    t.state = "sent";
    this.flushDrafts();
    const env: Envelope = { epoch: t.epoch, ticket: t.id };
    const call = t.call!;
    this.port.send(env, call).then(
      (a) => this.receive(a, t),
      (e: unknown) => this.receive({ ok: false, errors: [e instanceof Error ? e.message : String(e)], epoch: t.epoch, ticket: t.id }, t),
    );
  }

  /** The one door: an answer for another map is dropped; every other answer's land is the worker's, taken in the
   *  order it came (the worker sends what changed since it last sent), whether or not its ticket is still waiting. */
  private receive(a: MapAnswer, t: Ticket): void {
    if (t.epoch !== this.epoch || (a.epoch !== undefined && a.epoch !== this.epoch)) {
      this.staleDrops++;
      return;
    }
    const before = this.base;
    const r = this.take(a);
    const waiting = t.state === "sent";
    if (a.ok && !a.stale) {
      const step = a.step ?? null;
      if (t.kind !== "move") this.resolved.set(t.id, step);
      if (waiting || t.timedOut) {
        t.state = "done";
        t.step = step;
      }
      // (a stroke answered: its land before and after, as the worker made it, for its undo and redo)
      if (t.kind === "stroke" && step !== null && t.overlay) this.keep(step, grow(r, t.overlay.rect)!, before, this.base);
    }
    if (!waiting) {
      // (late: the watchdog gave up on it, but the worker took it after all; its land is the truth all the same)
      if (r) this.refresh(r);
      this.host.answer?.(a, view(t));
      return;
    }
    this.disarm();
    if (!a.ok || a.stale) {
      const line = a.stale ? STALE : (a.errors[0] ?? null);
      if (a.stale) this.staleDrops++;
      this.end(t, "refused", line, false, r);
    } else {
      const predicted = !!t.overlay;
      this.tickets.splice(this.tickets.indexOf(t), 1);
      const changed = this.refresh(grow(r, t.overlay?.rect ?? null));
      // (I6: a stroke `alone` is never guessed wrong: the one composer builds its operation complete on the page, and
      // its land before and after as the build leaves it, step 4)
      if (predicted && changed) {
        t.mispredicted = true;
        this.mispredictions++;
        if (changed === "land") this.landMispredictions++;
      }
      t.overlay = null;
    }
    this.host.answer?.(a, view(t));
    this.settle(t);
    this.pump();
  }

  /** `base` takes an answer's land; returns the rectangle it changed (null: none). */
  private take(a: MapAnswer): Rect | null {
    if (a.info?.history) this.rows = a.info.history;
    const v = a.view;
    if (!v) return null;
    if (v.land || v.wet) return grow(v.land ? this.layPatch(v.land) : null, v.wet ? this.layPatch(v.wet) : null);
    if (v.heights || v.terrain) this.seqs = { land: v.landSeq ?? null, wet: v.wetSeq ?? null };
    let r: Rect | null = null;
    const terrain = v.terrain ?? this.base.terrain;
    if (v.heights && v.heights.length !== this.base.heights.length) {
      // (a crop: another size, the same map)
      if (a.info?.W && a.info.H) {
        this.W = a.info.W;
        this.H = a.info.H;
      }
      this.base = { heights: v.heights, terrain };
      this.kept = [];
      for (const t of this.tickets) t.overlay = null;
      this.resize();
      return null;
    }
    if (v.heights) {
      r = v.terrainRect === undefined || v.terrainRect === null ? diffRect(this.base.heights, v.heights, this.W) : v.terrainRect;
      this.base = { ...this.base, heights: v.heights };
    }
    if (v.terrain) {
      r = grow(r, diffRect(this.base.terrain.pre, v.terrain.pre, this.W));
      r = grow(r, diffRect(this.base.terrain.protect, v.terrain.protect, this.W));
      this.base = { ...this.base, terrain: v.terrain };
    }
    return r;
  }

  /** `base` takes a patch of the land (I1: the worker's, laid byte for byte); one made against other land is not laid,
   *  and the whole land is asked for. Returns the rectangle of shown land it may change (null: none). */
  private layPatch(p: LandPatch): Rect | null {
    if (this.taken.has(p)) return null;
    this.taken.add(p);
    const at = this.seqs[p.chain];
    // (the same patch again, a copy of it: the land it makes is the land `base` holds)
    if (at === p.seq) return null;
    if (at === null || p.from !== at) {
      this.seqs[p.chain] = null;
      this.landResends++;
      this.host.stale?.();
      return null;
    }
    this.base = layLand(this.base, p, this.W);
    this.seqs[p.chain] = p.seq;
    // (the shown land and the terrain the page paints on: the patch's rectangle, or everywhere when one came whole)
    if (p.whole.pre !== undefined || p.whole.protect !== undefined) return { x0: 0, y0: 0, x1: this.W - 1, y1: this.H - 1 };
    return p.heights || p.dense.pre || p.dense.protect ? { ...p.rect } : null;
  }

  private resize(): void {
    this.shown = this.base.heights.slice();
    this.shownPre = this.base.terrain.pre.slice();
    this.shownProtect = this.base.terrain.protect.slice();
    this.deferred = null;
    this.host.shown?.(null);
  }

  /** A ticket ends: out of the queue, its overlay and the land it drew go, the watchdog moves on. */
  private end(t: Ticket, state: TicketState, line: string | null, pump = true, changed: Rect | null = null): void {
    const k = this.tickets.indexOf(t);
    if (k < 0) return;
    this.tickets.splice(k, 1);
    if (this.watch?.id === t.id) this.disarm();
    const was = t.state;
    t.state = state;
    t.line = line;
    if (state !== "done" && t.kind !== "move") this.resolved.set(t.id, null);
    if (t.drafted && state !== "done" && state !== "dropped") this.port.cancelDraft?.({ epoch: t.epoch, ticket: t.id });
    const r = grow(grow(changed, t.painted), t.overlay?.rect ?? null);
    t.painted = null;
    t.overlay = null;
    t.drafts = null;
    if (r && t.epoch === this.epoch) this.refresh(r);
    if (was === "open" || was === "closing") this.laid();
    this.unblock();
    if (line) this.host.line?.(line, t.id);
    // (its waiters resume once this turn is over: a refused answer is heard first, `receive`)
    this.settle(t);
    if (pump) this.pump();
  }

  private settle(t: Ticket): void {
    const w = this.settlers.get(t.id);
    if (!w) return;
    this.settlers.delete(t.id);
    const v = view(t);
    for (const f of w) f(v);
  }

  private arm(t: Ticket, ms: number, line: string): void {
    // (one watch per ticket and phase: a closing stroke's bound is its worker's; once sent, the map's)
    if (this.watch?.id === t.id && this.watch.state === t.state) return;
    this.disarm();
    const cancel = this.clock.after(ms, () => {
      if (this.watch?.id !== t.id) return;
      this.watch = null;
      t.timedOut = true;
      if (t.state === "closing") this.host.expired?.(t.id);
      this.end(t, "refused", line);
    });
    this.watch = { id: t.id, state: t.state, cancel };
  }

  private disarm(): void {
    this.watch?.cancel();
    this.watch = null;
  }

  /** A stroke let go or ended: the presses waiting behind it whose turn has come compose (or hear theirs ended). */
  private unblock(): void {
    if (!this.composers.length) return;
    const go: (() => void)[] = [];
    const wait: typeof this.composers = [];
    for (const c of this.composers) {
      const live = !!this.live(c.id);
      if (live && !this.composable(c.id)) wait.push(c);
      else go.push(() => c.resolve(live));
    }
    this.composers = wait;
    for (const f of go) f();
  }

  private wake(): void {
    if (this.tickets.length) return;
    const w = this.idlers.splice(0);
    for (const f of w) f();
    if (!this.worked) return;
    this.worked = false;
    this.host.idle?.();
  }

  /** Drafts may go for a stroke once every ticket before it has gone to the worker. */
  private flushDrafts(): void {
    for (let k = 0; k < this.tickets.length; k++) {
      const t = this.tickets[k];
      if (t.drafts && t.kind === "stroke" && (t.state === "open" || t.state === "closing")) {
        const r = t.drafts;
        t.drafts = null;
        t.drafted = true;
        this.port.draft?.({ epoch: t.epoch, ticket: t.id }, r, cutRect(this.shown, r, this.W));
      }
      if (t.state !== "sent") return;
    }
  }

  private keep(seq: number, r: Rect, before: EditQueue["base"], after: EditQueue["base"]): void {
    this.kept = this.kept.filter((k) => k.seq !== seq);
    this.kept.push({ seq, rect: r, before: patchOf(before.heights, before.terrain, r, this.W), after: patchOf(after.heights, after.terrain, r, this.W) });
    if (this.kept.length > KEPT_STROKES) this.kept.shift();
  }

  /** A move's land, shown at once when the queue holds the step's before and after and the land stands as `from`. */
  private predict(t: Ticket): void {
    const m = t.move!;
    if (m.kind === "jump") return;
    const ref = m.of;
    let o: { rect: Rect; before: Patch; after: Patch } | null = null;
    if ("ticket" in ref) {
      const s = this.live(ref.ticket);
      if (s?.overlay && s.kind === "stroke") o = s.overlay;
    } else o = this.kept.find((k) => k.seq === ref.seq) ?? null;
    if (!o) return;
    const [from, to] = m.kind === "undo" ? [o.after, o.before] : [o.before, o.after];
    if (this.painting(o.rect) || !this.stands(o.rect, from)) return;
    t.overlay = { rect: o.rect, before: from, after: to };
    this.refresh(o.rect);
  }

  /** Does the shown land over `r` equal `p`, byte for byte? */
  private stands(r: Rect, p: Patch): boolean {
    const now = patchOf(this.shown, { pre: this.shownPre, protect: this.shownProtect }, r, this.W);
    return same(now.heights, p.heights) && same(now.pre, p.pre) && same(now.protect, p.protect);
  }

  /** Is a stroke being drawn (or landing) over `r`? Its preview owns those bytes of `shown` until it lets go. */
  private painting(r: Rect): boolean {
    return this.tickets.some((t) => (t.state === "open" || t.state === "closing") && t.painted && meets(t.painted, r));
  }

  /** A stroke let go or ended: the land deferred under it is laid now. */
  private laid(): void {
    const d = this.deferred;
    if (!d || this.painting(d)) return;
    this.deferred = null;
    this.refresh(d);
  }

  /** `shown` over `r` := `base`, then each waiting overlay laid on in order. Returns whether a byte changed: "land"
   *  when the heights did, else true when only `pre` or `protect` did, else false. */
  private refresh(r: Rect | null): boolean | "land" {
    if (!r) return false;
    r = clip(r, this.W, this.H);
    if (!r) return false;
    if (this.painting(r)) {
      this.deferred = grow(this.deferred, r);
      return false;
    }
    const W = this.W;
    const old = patchOf(this.shown, { pre: this.shownPre, protect: this.shownProtect }, r, W);
    const { heights, terrain } = this.base;
    for (let y = r.y0; y <= r.y1; y++) {
      const a = y * W + r.x0;
      const b = y * W + r.x1 + 1;
      this.shown.set(heights.subarray(a, b), a);
      this.shownPre.set(terrain.pre.subarray(a, b), a);
      this.shownProtect.set(terrain.protect.subarray(a, b), a);
    }
    for (const t of this.tickets) if (t.overlay && meets(t.overlay.rect, r)) this.lay(t.overlay, r);
    const now = patchOf(this.shown, { pre: this.shownPre, protect: this.shownProtect }, r, W);
    if (!same(old.heights, now.heights)) {
      this.host.shown?.(r);
      return "land";
    }
    return !same(old.pre, now.pre) || !same(old.protect, now.protect);
  }

  /** An overlay laid on inside `r`: its `after` wherever it differs from its `before`, channel by channel. */
  private lay(o: Overlay, r: Rect): void {
    const W = this.W;
    const x0 = Math.max(r.x0, o.rect.x0);
    const x1 = Math.min(r.x1, o.rect.x1);
    const y0 = Math.max(r.y0, o.rect.y0);
    const y1 = Math.min(r.y1, o.rect.y1);
    const bw = o.rect.x1 - o.rect.x0 + 1;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const j = (y - o.rect.y0) * bw + (x - o.rect.x0);
        if (o.after.heights[j] !== o.before.heights[j]) this.shown[i] = o.after.heights[j];
        if (o.after.pre[j] !== o.before.pre[j]) this.shownPre[i] = o.after.pre[j];
        if (o.after.protect[j] !== o.before.protect[j]) this.shownProtect[i] = o.after.protect[j];
      }
  }
}

// ------------------------------------------------------------------------------------------------- moves

/** Where a move leaves the history, given its rows and cursor: the row index the cursor goes to and its seq (null:
 *  before the first step); `gone` for a jump to a step the worker no longer has (it refuses it with STEP_GONE); DROP
 *  when the move's step never happened, or the move would change nothing. The one rule for the queue, its predicted
 *  history and the tests' sequential oracle. `stepOf` resolves a ticket: its seq, null when it never happened,
 *  undefined while it is on its way (then the rows name it). */
export function target(
  rows: readonly HistoryRow[],
  cursor: number,
  m: Move,
  stepOf: (ticket: number) => number | null | undefined,
): { kind: "at"; index: number; seq: number | null } | { kind: "gone"; seq: number } | typeof DROP {
  const find = (ref: StepRef): number | null => {
    if ("ticket" in ref) {
      const id = ref.ticket;
      const k = rows.findIndex((r) => "ticket" in r.ref && r.ref.ticket === id);
      if (k >= 0) return k;
      const s = stepOf(id);
      if (s === null || s === undefined) return null;
      ref = { seq: s };
    }
    const seq = ref.seq;
    const k = rows.findIndex((r) => "seq" in r.ref && r.ref.seq === seq);
    return k < 0 ? -1 : k;
  };
  const seqAt = (k: number): number | null => (k < 0 ? null : "seq" in rows[k].ref ? (rows[k].ref as { seq: number }).seq : null);
  if (m.kind === "jump") {
    if (m.to === null) return cursor === -1 ? DROP : { kind: "at", index: -1, seq: null };
    const k = find(m.to);
    if (k === null) return DROP;
    if (k < 0) return "seq" in m.to ? { kind: "gone", seq: m.to.seq } : DROP;
    return k === cursor ? DROP : { kind: "at", index: k, seq: seqAt(k) };
  }
  const k = find(m.of);
  if (k === null || k < 0) return DROP;
  if (m.kind === "undo") return k > cursor ? DROP : { kind: "at", index: k - 1, seq: seqAt(k - 1) };
  return k <= cursor ? DROP : { kind: "at", index: k, seq: seqAt(k) };
}

// -------------------------------------------------------------------------------------------- the land's bytes

function view(t: Ticket): TicketView {
  return { id: t.id, epoch: t.epoch, kind: t.kind, state: t.state, call: t.call, move: t.move, step: t.step, line: t.line, mispredicted: t.mispredicted, alone: t.alone, timedOut: t.timedOut };
}

export function grow(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function meets(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

function clip(r: Rect, W: number, H: number): Rect | null {
  const c = { x0: Math.max(0, r.x0), y0: Math.max(0, r.y0), x1: Math.min(W - 1, r.x1), y1: Math.min(H - 1, r.y1) };
  return c.x0 > c.x1 || c.y0 > c.y1 ? null : c;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The bytes of `a` over `r`, row by row. */
export function cutRect(a: Uint8Array, r: Rect, W: number): Uint8Array {
  const bw = r.x1 - r.x0 + 1;
  const out = new Uint8Array(bw * (r.y1 - r.y0 + 1));
  for (let y = r.y0; y <= r.y1; y++) out.set(a.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * bw);
  return out;
}

/** The land over `r`: heights, and the terrain's `pre` and `protect`. */
export function patchOf(heights: Uint8Array, terrain: Pick<TerrainState, "pre" | "protect">, r: Rect, W: number): Patch {
  return { heights: cutRect(heights, r, W), pre: cutRect(terrain.pre, r, W), protect: cutRect(terrain.protect, r, W) };
}

/** The rectangle where two maps' bytes differ, or null. */
function diffRect(a: Uint8Array, b: Uint8Array, W: number): Rect | null {
  let r: Rect | null = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    r = r ? { x0: Math.min(r.x0, x), y0: Math.min(r.y0, y), x1: Math.max(r.x1, x), y1: Math.max(r.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
  }
  return r;
}

// ------------------------------------------------------------------------------------- a stroke's worker

/** A worker that composes a stroke away from the page (Naturalize's, D422), as the feed reaches it: each call names
 *  its stroke, and a call for a stroke the worker no longer holds changes nothing (remoteStroke.ts `WeatherHost`). */
export interface StrokeWorker {
  begin(id: number, settings: Omit<BrushParams, "dabs">, ground: [number, number, number][], state: TerrainState, heights: Uint8Array, W: number, H: number): Promise<void>;
  add(id: number, dabs: number[], pressure?: number[]): Promise<{ rect: Rect; heights: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null>;
  finish(id: number, rigid: [number, number, number, number][]): Promise<{ rect: Rect; heights: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null>;
  end(id: number): Promise<{ pre: Uint8Array; protect: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null>;
  cancel(id: number): void;
}

/** A piece that rides a stroke whole and level (D249): its rectangle [x0, y0, x1, y1]. */
export type Rigid = [number, number, number, number];

/** A Naturalize stroke's last land and its record are in (`StrokeFeed.end`'s `landed`): what its operation is built
 *  from. */
export interface FeedLanding {
  /** The shown heights as the stroke began, and the terrain's `pre` and `protect` then. */
  start: Uint8Array;
  before: { pre: Uint8Array; protect: Uint8Array };
  /** The rectangle its land changed (null: none came). */
  bounds: Rect | null;
  /** The worker's heights before the integrity pass, and its protected tiles (the whole map). */
  pre: Uint8Array;
  protect: Uint8Array;
  /** The worker's whole record (#873), with the pieces that rode it whole (`rigid`) when any did. */
  settings: Omit<BrushParams, "dabs">;
}

/** A Naturalize stroke through the queue (I9): one call with its worker at a time, the dabs that come meanwhile joined
 *  into one batch sent when it answers; its land drawn into `shown` as it comes (`onLand` says where). Let go, its
 *  ticket is `closing` until the worker's last land and its record come, then `ready` with its operation, built once
 *  from the worker's whole record (#873). `bound(dabs)` is how long one call may take (remoteStroke.ts
 *  `answerBound`): the queue's one watchdog gives each call let go that long, and takes the stroke back with
 *  `silentLine` when it passes. */
export class StrokeFeed {
  private waiting: { dabs: number[]; pressure: number[] | undefined } | null = null;
  private dabs: number[] = [];
  private pressure: number[] | null = null;
  /** The shown heights as the stroke began. */
  readonly start: Uint8Array;
  private before: { pre: Uint8Array; protect: Uint8Array };
  /** The terrain it was painted on (its holds, the settled water, `worn`: what its operation is completed from). */
  private readonly terrainAt: TerrainState;
  private changed: Rect | null = null;
  private letGo = false;
  private gone = false;
  /** Its operation went to the queue (`ready`, or the page's `landed`). */
  private landed = false;
  private chain: Promise<unknown>;
  /** How many dabs the call with the worker now carries (its bound), or null when none is out. */
  private outDabs: number | null = null;
  /** The most calls ever with the worker at once (a test reads it: never more than one). */
  maxOut = 0;
  private outNow = 0;

  constructor(
    private readonly queue: EditQueue,
    readonly id: number,
    private readonly settings: Omit<BrushParams, "dabs">,
    private readonly worker: StrokeWorker,
    private readonly bound: (dabs: number) => number,
    private readonly silentLine: string,
    ground: [number, number, number][] = [],
    private readonly onLand?: (rect: Rect) => void,
  ) {
    const t = queue.terrain();
    this.start = queue.shown.slice();
    this.before = { pre: t.pre.slice(), protect: t.protect.slice() };
    this.terrainAt = { ...t, ...this.before };
    const state: TerrainState = { ...t, pre: t.pre.slice(), protect: t.protect.slice() };
    this.chain = this.call(0, () => worker.begin(id, { ...settings }, ground, state, queue.shown.slice(), queue.W, queue.H));
  }

  /** The rectangle of shown heights its land changed so far (null: none yet). */
  get bounds(): Rect | null {
    return this.changed;
  }

  /** More dabs (tile × 4 pairs, as the brush records them). */
  add(dabs: number[], pressure?: number[]): void {
    if (this.gone || this.letGo || !dabs.length) return;
    this.dabs.push(...dabs);
    if (pressure) (this.pressure ??= []).push(...pressure);
    const w = this.waiting;
    // (a batch either has a pressure for every dab or none: one without joins one with only as its own call)
    if (w && !w.pressure === !pressure) {
      w.dabs.push(...dabs);
      if (w.pressure && pressure) w.pressure.push(...pressure);
      return;
    }
    const batch = { dabs: [...dabs], pressure: pressure ? [...pressure] : undefined };
    this.waiting = batch;
    this.chain = this.chain.then(() => this.sendWaiting(batch));
  }

  /** Dabs sent but not yet answered, and waiting: how far the land trails the pointer. */
  lag(): number {
    return (this.waiting?.dabs.length ?? 0) >> 1;
  }

  /** Let go: the ticket closes; once its dabs' land is in, the pieces that ride it whole (`rigid`, D249) go, then the
   *  operation follows the last land, composed and completed by the one composer (strokeComposer.ts) on the map it was
   *  painted on (`entities`: the objects standing). `landed`, when given, builds the operation instead of the feed (the
   *  page: its call) and must make the ticket ready or cancel it. Resolves true once it landed, false when it was taken
   *  back first (Esc, its worker silent past its bound, another map). */
  end(opts: { rigid?: () => Rigid[]; landed?: (l: FeedLanding) => void; entities?: readonly StandingObject[] } = {}): Promise<boolean> {
    if (this.gone || this.letGo) return Promise.resolve(this.landed);
    this.letGo = true;
    // (a call still out when it is let go has its own bound: a long press's batch may take seconds)
    this.queue.close(this.id, this.bound(this.outDabs ?? 0), this.silentLine);
    let rigid: Rigid[] = [];
    this.chain = this.chain
      .then(() => {
        if (this.gone || !this.alive()) return null;
        rigid = opts.rigid?.() ?? [];
        return this.call(rigid.length, () => this.worker.finish(this.id, rigid));
      })
      .then((land) => this.land(land))
      .then(() => (this.gone || !this.alive() ? null : this.call(0, () => this.worker.end(this.id))))
      .then((rec) => this.ready(rec, rigid, opts.landed, opts.entities ?? []));
    // (a worker that fails or never answers: the watchdog ends the ticket, and that is the answer)
    const ended = this.queue.settled(this.id).then(() => this.landed);
    const done = this.chain.then(
      () => this.landed,
      () => ended,
    );
    return Promise.race([done, ended]);
  }

  /** Esc: the stroke goes, and its worker forgets it. */
  cancel(): void {
    if (this.gone) return;
    this.gone = true;
    this.worker.cancel(this.id);
    this.queue.cancel(this.id);
  }

  /** The editor closes: the worker forgets the stroke (the queue goes with the editor). */
  forget(): void {
    if (this.gone) return;
    this.gone = true;
    this.worker.cancel(this.id);
  }

  private call<T>(dabs: number, send: () => Promise<T>): Promise<T> {
    this.outNow++;
    this.maxOut = Math.max(this.maxOut, this.outNow);
    this.outDabs = dabs;
    if (this.letGo) this.queue.due(this.id, this.bound(dabs));
    const p = send();
    const done = () => {
      this.outNow--;
      this.outDabs = null;
    };
    p.then(done, done);
    return p;
  }

  private async sendWaiting(w: { dabs: number[]; pressure: number[] | undefined }): Promise<void> {
    // (the batch goes: what comes from now on waits for its answer)
    if (this.waiting === w) this.waiting = null;
    if (this.gone || !this.alive()) return;
    const land = await this.call(w.dabs.length >> 1, () => this.worker.add(this.id, w.dabs, w.pressure));
    this.land(land);
  }

  /** Is its ticket still the queue's? (Taken back by the watchdog, or the map switched: no.) */
  private alive(): boolean {
    const t = this.queue.ticket(this.id);
    if (t && (t.state === "open" || t.state === "closing")) return true;
    this.gone = true;
    return false;
  }

  private land(land: { rect: Rect; heights: Uint8Array } | null): void {
    if (!land || this.gone || !this.alive()) return;
    const { rect, heights } = land;
    const W = this.queue.W;
    const bw = rect.x1 - rect.x0 + 1;
    for (let y = rect.y0; y <= rect.y1; y++) this.queue.shown.set(heights.subarray((y - rect.y0) * bw, (y - rect.y0 + 1) * bw), y * W + rect.x0);
    this.changed = grow(this.changed, rect);
    this.queue.painted(this.id, rect);
    this.onLand?.(rect);
    this.queue.draft(this.id, rect);
  }

  private ready(rec: { pre: Uint8Array; protect: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null, rigid: Rigid[], landed: ((l: FeedLanding) => void) | undefined, entities: readonly StandingObject[]): void {
    if (this.gone || !this.alive()) return;
    this.gone = true;
    const b = this.changed;
    if (!rec || (!b && !landed)) return this.queue.cancel(this.id);
    const settings = rigid.length ? { ...rec.settings, rigid } : rec.settings;
    this.landed = true;
    if (landed) return landed({ start: this.start, before: this.before, bounds: b, pre: rec.pre, protect: rec.protect, settings });
    const q = this.queue;
    const params: BrushParams = { ...settings, ...(this.pressure ? { pressure: this.pressure } : {}), dabs: this.dabs };
    const c = composeStroke(params, "Naturalize", { start: this.start, shown: q.shown, pre: rec.pre, protect: rec.protect, bounds: b, before: this.terrainAt }, { W: q.W, H: q.H, heights: this.start, terrain: this.terrainAt, entities });
    if (!c.tiles) return q.cancel(this.id);
    q.ready(this.id, { kind: "edit", name: "apply", args: [{ op: "brush", params: c.params }, "user", c.label] }, c.overlay);
  }
}
