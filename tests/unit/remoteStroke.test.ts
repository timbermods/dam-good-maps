// A Naturalize stroke weathered in the worker (D422, #868), through the edit queue (#922 step 3): one call is with
// the worker at a time, the dabs that come meanwhile wait as one batch, sent whole when its answer comes, so the land
// never falls seconds behind the cursor; the worker, pressing a batch dab by dab, builds exactly the land (and the
// record) it built from one call a batch, so what the page shows is what the operation builds. The stroke is a ticket
// from pointer-down: an undo pressed while it lands waits behind it, a press paints after it, a map switch waits for
// it, and a silent worker's stroke is taken back by the queue's one watchdog with its line.
//
// (Step 3 updated three tests that asserted the patches it removes (D148): an undo waiting for a stroke its worker
// never answered went ahead and took back the step before it, now it does nothing (#922 U1, planning's ruling 1); a
// press while a stroke landed was swallowed, now it paints (U6, ruling 2); the editor closing forgot a stroke let go,
// now a map switch waits for it to land (U5, ruling 3), and closing forgets only the stroke the button holds.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_WAIT_MS, answerBound, WEATHER_SILENT, WeatherStroke, type WeatheredLand } from "../../src/core/features/raster/remoteStroke";
import { integrityCandidate, StrokePreview, type TerrainState } from "../../src/core/features/raster/strokePreview";
import { integrityAt } from "../../src/core/features/raster/terrain";
import type { BrushParams, Rect } from "../../src/core/features/raster/brush";
import { cutRect, EditQueue, StrokeFeed, type FeedLanding, type MapAnswer, type MapPort, type QueueHost, type StrokeWorker } from "../../src/core/doc/editQueue";
import type { HistoryItem } from "../../src/core/doc/session";
import { BrushPainter, DEFAULT_BRUSH, type BrushSettings, type PainterHost, type Stroke } from "../../src/editor/brushes";
import type { MapRenderer } from "../../src/render3d";
import type { TileHit } from "../../src/render3d/pick";

/** The page's clock (the queue's watchdog): the page's `setTimeout`, which the fake timers drive. */
const clock = { now: () => Date.now(), after: (ms: number, fn: () => void) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
} };

/** The map's worker, as the queue reaches it: each edit a step, each move to the step it names; what it was sent. */
function mapWorker() {
  const calls: string[] = [];
  const history: HistoryItem[] = [];
  let seq = 0;
  const answer = (step: number | null): MapAnswer => ({ ok: true, errors: [], step, info: { history: history.map((h) => ({ ...h })) } });
  const port: MapPort = {
    send: async (_env, call) => {
      if (call.kind === "moveTo") {
        calls.push(`moveTo ${call.step}`);
        for (const h of history) h.applied = call.step !== null && h.seq! <= call.step;
        return answer(call.step);
      }
      calls.push(`${call.name} ${String(call.args[2] ?? "")}`.trim());
      history.splice(0, history.length, ...history.filter((h) => h.applied));
      history.push({ seq: ++seq, applied: true, label: String(call.args[2] ?? call.name), op: "brush" });
      return answer(seq);
    },
    draft: (env) => void calls.push(`draft ${env.ticket}`),
    cancelDraft: (env) => void calls.push(`cancelDraft ${env.ticket}`),
  };
  return { port, calls, history };
}

/** A queue on a map: its land, its terrain. */
function queueOn(heights: Uint8Array, state: TerrainState, W: number, H: number, port: MapPort = mapWorker().port, host: QueueHost = {}): EditQueue {
  return new EditQueue({ epoch: 1, view: { W, H, heights }, terrain: state, info: { history: [] } }, port, clock, host);
}

/** A flat terrain of W × H at `level`. */
function flat(W: number, H: number, level = 0): { state: TerrainState; heights: Uint8Array } {
  const pre = new Uint8Array(W * H).fill(level);
  const state: TerrainState = { pre, protect: new Uint8Array(W * H), channel: new Uint8Array(W * H), base: null, locked: null, columns: new Int32Array(0), water: null, moisture: null, top: 16 } as unknown as TerrainState;
  return { state, heights: pre.slice() };
}

/** A worker whose calls answer only when the test says: what was sent, in order. */
function heldWorker() {
  const sent: { kind: string; dabs?: number[]; pressure?: number[] }[] = [];
  const answers: (() => void)[] = [];
  const later = <T>(v: T) => new Promise<T>((resolve) => answers.push(() => resolve(v)));
  const worker: StrokeWorker = {
    begin: () => {
      sent.push({ kind: "begin" });
      return later(undefined);
    },
    add: (_id, dabs, pressure) => {
      sent.push({ kind: "add", dabs: [...dabs], ...(pressure ? { pressure: [...pressure] } : {}) });
      return later(null);
    },
    finish: () => {
      sent.push({ kind: "finish" });
      return later(null);
    },
    end: () => {
      sent.push({ kind: "end" });
      return later(null);
    },
    cancel: () => void sent.push({ kind: "cancel" }),
  };
  /** The oldest call answers; then the page's chain moves on. */
  const answer = async () => {
    answers.shift()!();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { worker, sent, answer, waiting: () => answers.length };
}

const W = 8;
const settings = (): Omit<BrushParams, "dabs"> => ({ tool: "naturalize", size: 5, strength: 5, seed: 7, weathers: true });
/** A feed on a small flat map's queue, its stroke's ticket made. */
function feedOn(worker: StrokeWorker, onLand?: (r: Rect) => void) {
  const { state, heights } = flat(W, W);
  const q = queueOn(heights, state, W, W);
  const id = q.stroke("Naturalize");
  return { q, feed: new StrokeFeed(q, id, settings(), worker, (d) => answerBound(d, 5), WEATHER_SILENT, [], onLand) };
}
const turns = async (n = 20) => {
  for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0));
};

describe("the worker's stroke sends one call at a time (#868)", () => {
  it("dabs that come while a call is out wait as one batch, sent when it answers", async () => {
    const { worker, sent, answer, waiting } = heldWorker();
    const { feed } = feedOn(worker);
    feed.add([1, 1]);
    feed.add([2, 2, 3, 3]);
    feed.add([4, 4]);
    expect(sent.map((s) => s.kind)).toEqual(["begin"]);
    await answer(); // begin
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [1, 1, 2, 2, 3, 3, 4, 4] });
    feed.add([5, 5]);
    feed.add([6, 6]);
    expect(sent.length).toBe(2);
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [5, 5, 6, 6] });
    expect(sent.flatMap((s) => s.dabs ?? []).length / 2).toBe(6);
    await answer();
    expect(waiting()).toBe(0);
    expect(sent.length).toBe(3);
    expect(feed.maxOut).toBe(1);
  });

  it("a pen's pressures go with their dabs; a batch without them is its own call", async () => {
    const { worker, sent, answer } = heldWorker();
    const { feed } = feedOn(worker);
    feed.add([1, 1], [100]);
    feed.add([2, 2, 3, 3], [120, 140]);
    feed.add([4, 4]);
    feed.add([5, 5]);
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [1, 1, 2, 2, 3, 3], pressure: [100, 120, 140] });
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [4, 4, 5, 5] });
  });

  it("let go, the riding pieces go once every dab before them is in, then its end; a dab after it is let go never goes", async () => {
    const { worker, sent, answer, waiting } = heldWorker();
    const { feed } = feedOn(worker);
    feed.add([1, 1]);
    let asked = 0;
    void feed.end({ rigid: () => (asked++, [[0, 0, 2, 2]]) });
    feed.add([2, 2]);
    await answer(); // begin; the dabs go
    expect(asked).toBe(0);
    while (waiting()) await answer();
    expect(asked).toBe(1);
    expect(sent.map((s) => s.kind + (s.dabs ? s.dabs.join(",") : ""))).toEqual(["begin", "add1,1", "finish", "end"]);
  });

  it("Esc forgets the stroke: what was waiting is never sent, and its ticket goes", async () => {
    const { worker, sent, answer, waiting } = heldWorker();
    const { q, feed } = feedOn(worker);
    feed.add([1, 1]);
    await answer(); // begin; the first batch goes
    feed.add([2, 2]);
    feed.cancel();
    while (waiting()) await answer();
    expect(sent.map((s) => s.kind)).toEqual(["begin", "add", "cancel"]);
    expect(q.pending()).toBe(0);
  });
});

/** A small map: a hill beside a pond, the water where it stands, shown as the build shows it (its
 *  integrity pass over the whole map). */
function land(N = 40, px = 28, py = 20): { state: TerrainState; heights: Uint8Array; N: number } {
  const pre = new Uint8Array(N * N);
  const water = new Float64Array(N * N);
  const moisture = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const hill = Math.max(0, 9 - Math.round(Math.hypot(x - 14, y - 18) / 2));
      pre[i] = 3 + hill + ((x * 7 + y * 13) % 3 === 0 ? 1 : 0);
      if (Math.hypot(x - px, y - py) < 5) {
        pre[i] = 2;
        water[i] = 1.5;
      }
      moisture[i] = Math.max(0, 1 - Math.hypot(x - px, y - py) / 12);
    }
  const state: TerrainState = { pre, protect: new Uint8Array(N * N), channel: new Uint8Array(N * N), base: null, locked: null, columns: new Int32Array(0), water, moisture, top: 16 };
  const heights = pre.slice();
  integrityAt(pre, heights, N, N, state.protect, state.channel, integrityCandidate(state, pre), 0, 0, N - 1, N - 1, 16);
  return { state, heights, N };
}

/** A stroke across the hill toward the pond, held still at its end (quarter tiles). */
function strokeDabs(): number[] {
  const out: number[] = [];
  for (let k = 0; k <= 24; k++) out.push(Math.round((8 + k * 0.9) * 4), Math.round((14 + 6 * Math.sin(k / 4)) * 4));
  for (let k = 0; k < 6; k++) out.push(out[out.length - 2], out[out.length - 1]);
  return out;
}

/** naturalize.worker.ts's side in this process: its one stroke on the terrain and land the page sends with the start
 *  (copied, as a message copies them), each call answered a turn later. `log` records the calls. */
function ownWorker(log: string[] = []): StrokeWorker & { calls: () => number } {
  let stroke: WeatherStroke | null = null;
  let adds = 0;
  const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));
  return {
    begin: (_id, s, ground, state, heights, W, H) => {
      const sent = structuredClone({ s, ground, state, heights });
      return turn(() => void (stroke = new WeatherStroke(sent.s, sent.state, sent.heights, W, H, sent.ground)));
    },
    add: (_id, d, pr) => (adds++, log.push("add"), turn(() => structuredClone(stroke?.add(d, pr) ?? null))),
    finish: (_id, rigid) => (log.push("finish"), turn(() => structuredClone(stroke?.finish(rigid) ?? null))),
    end: (_id) => (
      log.push("end"),
      turn(() => {
        const r = stroke?.end() ?? null;
        stroke = null;
        return r;
      })
    ),
    cancel: () => {
      log.push("cancel");
      stroke = null;
    },
    calls: () => adds,
  };
}

/** The feed's stroke let go: what it landed with (the page's `landed`) and the land shown then; its ticket then ended
 *  (which lays its land back). */
async function landed(q: EditQueue, feed: StrokeFeed): Promise<FeedLanding & { shown: Uint8Array }> {
  let out: (FeedLanding & { shown: Uint8Array }) | null = null;
  const ok = await feed.end({ landed: (l) => ((out = { ...l, shown: q.shown.slice() }), q.cancel(feed.id)) });
  expect(ok).toBe(true);
  return out!;
}

describe("a batch builds the land one call a batch built (D422, #868)", () => {
  it("the page's land, its record and the heights before the integrity pass are the same, byte for byte", async () => {
    const { state, heights, N } = land();
    const dabs = strokeDabs();
    // before: one worker call for each batch the page sent (the page presses a frame's dabs together)
    const one = settings();
    const direct = new StrokePreview(one, { ...state, pre: state.pre.slice() }, heights.slice(), N, N, []);
    const shownBefore = heights.slice();
    // (the settings the preview is given are its record, as the worker's keeps it)
    const recordBefore = settings();
    const before = new StrokePreview(recordBefore, { ...state, pre: state.pre.slice() }, shownBefore, N, N, []);
    for (let k = 0; k < dabs.length; k += 2) before.add(dabs.slice(k, k + 2));
    // (and all its dabs in one call)
    direct.add(dabs);
    // after: the queue's feed, its dabs sent as they come, batched while a call is out
    const q = queueOn(heights.slice(), state, N, N);
    const rects: Rect[] = [];
    const worker = ownWorker();
    const feed = new StrokeFeed(q, q.stroke("Naturalize"), settings(), worker, (d) => answerBound(d, 5), WEATHER_SILENT, [], (r) => rects.push(r));
    for (let k = 0; k < dabs.length; k += 2) {
      feed.add(dabs.slice(k, k + 2));
      // (a turn now and then: the worker answers; the first call carries several dabs)
      if (k % 8 === 6) await new Promise((r) => setTimeout(r, 0));
    }
    const l = await landed(q, feed);
    // (it did batch: fewer calls than the page's batches)
    expect(worker.calls()).toBeGreaterThan(1);
    expect(worker.calls()).toBeLessThan(dabs.length / 4);
    expect(rects.length).toBeGreaterThan(0);
    expect(Buffer.from(l.shown).equals(Buffer.from(shownBefore))).toBe(true);
    expect(Buffer.from(l.pre).equals(Buffer.from(before.pre))).toBe(true);
    expect(Buffer.from(l.pre).equals(Buffer.from(direct.pre))).toBe(true);
    expect(JSON.stringify(l.settings)).toBe(JSON.stringify(recordBefore));
    expect(JSON.stringify(l.settings)).toBe(JSON.stringify(one));
    // (and the stroke did change the land)
    expect(Buffer.from(l.shown).equals(Buffer.from(heights))).toBe(false);
  });
});

describe("the page's record is the worker's, whatever its last call changed (#873)", () => {
  it("a last batch over the water that changes no tile still grows the record the operation keeps", async () => {
    const { state, heights, N } = land(64, 52, 20);
    // the stroke across the hill, then dabs out over the pond's flat floor, where nothing weathers
    const dabs = strokeDabs();
    const over: number[] = [];
    for (let y = 18; y <= 22; y++) over.push(52 * 4 + 2, y * 4 + 2);
    // the worker's record (and land), as one preview of every dab builds it
    const recordWorker = settings();
    const shownWorker = heights.slice();
    const worker = new StrokePreview(recordWorker, { ...state, pre: state.pre.slice() }, shownWorker, N, N, []);
    worker.add(dabs);
    const recordBeforeOver = JSON.stringify(recordWorker);
    expect(worker.add(over)).toBe(null);
    // (those dabs grew the record and changed nothing: the case the page missed)
    expect(JSON.stringify(recordWorker)).not.toBe(recordBeforeOver);
    // the page: the stroke, its answer in, then the batch over the water as its own last call
    const q = queueOn(heights.slice(), state, N, N);
    const rects: Rect[] = [];
    const feed = new StrokeFeed(q, q.stroke("Naturalize"), settings(), ownWorker(), (d) => answerBound(d, 5), WEATHER_SILENT, [], (r) => rects.push(r));
    feed.add(dabs);
    await turns();
    const shownAt = rects.length;
    expect(shownAt).toBeGreaterThan(0);
    feed.add(over);
    await turns();
    expect(rects.length).toBe(shownAt);
    const l = await landed(q, feed);
    expect(Buffer.from(l.shown).equals(Buffer.from(shownWorker))).toBe(true);
    expect(JSON.stringify(l.settings)).toBe(JSON.stringify(recordWorker));
  });
});

// ------------------------------------------------------------------------------------------- the page's painter

/** A renderer that picks the tile under a pointer at (x, y) on the queue's land and draws nothing. */
function rendererOn(shown: () => Uint8Array, N: number): MapRenderer {
  return new Proxy({ heightAt: (x: number, y: number) => shown()[y * N + x], pickAtLevel: (x: number, y: number, level: number) => ({ x: Math.floor(x), y: Math.floor(y), point: [x, level, -y] }), slice: null } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => {}),
  }) as unknown as MapRenderer;
}
const ev = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y, pointerType: "mouse", shiftKey: false, ctrlKey: false, metaKey: false }) as unknown as PointerEvent;

/** The page's painter on a queue, its commit as the page's (useReady.ts): the stroke's ticket ready with its
 *  operation and its land before and after. `tool` is the brush picked. */
function painterOn(q: EditQueue, N: number, weather: StrokeWorker, log: string[], more: Partial<PainterHost> = {}) {
  const brush: { current: BrushSettings } = { current: { ...DEFAULT_BRUSH, tool: "naturalize", strength: 10 } };
  const commits: { stroke: Stroke; shown: Uint8Array; pre: Uint8Array; terrainPre: Uint8Array }[] = [];
  const painter = new BrushPainter({
    renderer: rendererOn(() => q.shown, N),
    W: N,
    H: N,
    heights: () => q.shown,
    terrain: () => q.terrain(),
    edits: () => q,
    settings: () => brush.current,
    commit: (stroke, pre, protect, id) => {
      log.push(`commit ${stroke.params.tool}`);
      // (the land shown, the stroke's heights before the integrity pass, and the terrain it was painted on)
      commits.push({ stroke, shown: q.shown.slice(), pre: pre.slice(), terrainPre: q.terrain().pre.slice() });
      const t = q.terrain();
      q.ready(id, { kind: "edit", name: "apply", args: [{ op: "brush", params: stroke.params }, "user", stroke.label] }, {
        rect: stroke.rect,
        before: { heights: stroke.before.shown, pre: stroke.before.pre, protect: cutRect(t.protect, stroke.rect, N) },
        after: { heights: stroke.after.shown, pre: cutRect(pre, stroke.rect, N), protect: cutRect(protect, stroke.rect, N) },
      });
    },
    unchanged: () => void log.push("unchanged"),
    picked: () => {},
    strength: () => {},
    painting: (on) => void log.push(on ? "painting" : "painted"),
    objectGround: () => [],
    weather,
    ...more,
  });
  const hit = (x: number, y: number): TileHit => ({ x: Math.floor(x), y: Math.floor(y), point: [x, q.shown[Math.floor(y) * N + Math.floor(x)], -y], face: "top", t: 0 });
  /** A stroke along row y from x0 to x1, a frame or two a tile (`wait` lets the time pass); `up` lets it go. */
  const paint = async (y: number, x0: number, x1: number, wait: (ms: number) => Promise<unknown>, up = true) => {
    painter.tool.down(hit(x0, y), ev(x0, y));
    for (let x = x0 + 1; x <= x1; x += 1) {
      painter.tool.move(hit(x, y), ev(x, y));
      await wait(8);
    }
    if (up) painter.tool.up(hit(x1, y), ev(x1, y));
  };
  return { painter, brush, commits, paint };
}

const raf = globalThis.requestAnimationFrame;
const caf = globalThis.cancelAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((h: number) => clearTimeout(h)) as typeof cancelAnimationFrame;
});
afterEach(() => {
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = caf;
  vi.useRealTimers();
});
const frames = (n: number) => new Promise((r) => setTimeout(r, n * 4));

describe("a stroke with riding pieces keeps the worker's whole record (#875's review)", () => {
  it("the record the worker hands over at the end goes into the operation", async () => {
    // (the hill and its knobs, then flat ground out to the pond: nothing there weathers)
    const { state, N } = land(96, 80, 20);
    for (let y = 0; y < N; y++) for (let x = 34; x < N; x++) if (!state.water![y * N + x]) state.pre[y * N + x] = 3;
    const heights = state.pre.slice();
    integrityAt(state.pre, heights, N, N, state.protect, state.channel, integrityCandidate(state, state.pre), 0, 0, N - 1, N - 1, 16);
    // the worker (naturalize.worker.ts's core): what its last land carried, and the record it ends with
    let stroke: WeatherStroke | null = null;
    let lastLand: string | null = null;
    let ended: string | null = null;
    const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));
    const weather: StrokeWorker = {
      begin: (_id, s, ground, st, h) => turn(() => void (stroke = new WeatherStroke(s, { ...st, pre: st.pre.slice() }, h.slice(), N, N, ground))),
      add: (_id, d, p) =>
        turn(() => {
          const r = stroke!.add(d, p);
          if (r) lastLand = JSON.stringify(r.settings);
          return r;
        }),
      finish: (_id, rigid) => turn(() => stroke!.finish(rigid)),
      end: () =>
        turn(() => {
          const r = stroke!.end();
          ended = JSON.stringify(r.settings);
          return r;
        }),
      cancel: () => void (stroke = null),
    };
    const q = queueOn(heights, state, N, N);
    // (a 3 × 3 piece every few tiles along the hill: those the stroke changes ride it whole)
    const pieces: [number, number, number, number][] = [];
    for (let x = 8; x <= 28; x += 4) pieces.push([x, 15, x + 2, 17]);
    const { painter, commits } = painterOn(q, N, weather, [], { rides: () => pieces });
    const hit = (x: number, y: number): TileHit => ({ x: Math.floor(x), y: Math.floor(y), point: [x, q.shown[Math.floor(y) * N + Math.floor(x)], -y], face: "top", t: 0 });
    // across the hill, then out over the pond's flat floor, where nothing weathers but the record grows
    painter.tool.down(hit(8.5, 16.5), ev(8.5, 16.5));
    for (let x = 9.5; x <= 30.5; x += 1) {
      painter.tool.move(hit(x, 16.5), ev(x, 16.5));
      await frames(2);
    }
    for (const x of [40.5, 46.5]) {
      painter.tool.move(hit(x, 16.5), ev(x, 16.5));
      await frames(10);
    }
    const overLand = lastLand;
    painter.tool.move(hit(80.5, 20.5), ev(80.5, 20.5));
    await frames(10);
    painter.tool.up(hit(80.5, 20.5), ev(80.5, 20.5));
    for (let k = 0; k < 50 && !commits.length; k++) await frames(2);
    // (the dabs over the pond changed no land and grew the worker's record: what only the end hands over)
    expect(lastLand).toBe(overLand);
    expect(ended).not.toBe(lastLand);
    const params = commits[0].stroke.params;
    expect(params.rigid?.length).toBeGreaterThan(0);
    const record = JSON.parse(ended!) as Record<string, unknown>;
    for (const key of ["weathering", "shore", "pools", "moist"]) expect(JSON.stringify((params as unknown as Record<string, unknown>)[key])).toBe(JSON.stringify(record[key]));
  });
});

describe("a stroke on its way to the history is a ticket in the edit queue (#880, #922 step 3)", () => {
  /** A Naturalize stroke painted on the hill and let go, its last land and end still coming from its worker. */
  async function letGo() {
    const { state, heights, N } = land();
    const map = mapWorker();
    const q = queueOn(heights, state, N, N, map.port);
    const log: string[] = [];
    const page = painterOn(q, N, ownWorker(log), log);
    await page.paint(16.5, 8.5, 20.5, (ms) => frames(ms / 4));
    return { q, N, heights, map, log, ...page };
  }

  it("an undo and a redo pressed while it lands wait behind it, then act in the order pressed", async () => {
    const { q, map, log, painter } = await letGo();
    // (let go: its last land and its end are still coming from the worker; its ticket closes)
    expect(painter.painting).toBe(false);
    expect(log).not.toContain("commit naturalize");
    q.undo();
    q.redo();
    await q.idle();
    const at = (s: string) => log.indexOf(s);
    expect(at("end")).toBeGreaterThan(-1);
    expect(at("commit naturalize")).toBeGreaterThan(at("end"));
    // (the worker took the stroke, then the undo, then the redo)
    expect(map.calls.filter((c) => !c.startsWith("draft"))).toEqual([expect.stringMatching(/^apply Naturalize \d+ tiles?$/), "moveTo null", "moveTo 1"]);
    expect(map.history.map((h) => h.applied)).toEqual([true]);
  });

  it("a press while it lands paints (U6): it waits its turn, composes on the land the stroke left, and goes on the history after it", async () => {
    const { q, map, log, brush, commits, paint, painter } = await letGo();
    // Raise, at once, across the landing stroke's land
    brush.current = { ...DEFAULT_BRUSH, tool: "raise", target: "free", strength: 10 };
    await paint(16.5, 12.5, 18.5, (ms) => frames(ms / 4), false);
    expect(painter.painting).toBe(true);
    painter.tool.up(null, ev(18.5, 16.5));
    await q.idle();
    expect(log.filter((s) => s.startsWith("commit"))).toEqual(["commit naturalize", "commit raise"]);
    expect(map.calls.filter((c) => c.startsWith("apply")).map((c) => c.split(" ")[1])).toEqual(["Naturalize", "Raise"]);
    // (nothing of the press was lost, and it began on the land the Naturalize stroke left)
    const [nat, raise] = commits;
    expect(raise.stroke.params.dabs.length).toBeGreaterThan(2);
    expect(Buffer.from(raise.stroke.before.shown).equals(Buffer.from(cutRect(nat.shown, raise.stroke.rect, 40)))).toBe(true);
    expect(Buffer.from(raise.stroke.after.shown).equals(Buffer.from(raise.stroke.before.shown))).toBe(false);
    // (and on its terrain: the heights before the integrity pass the Naturalize stroke left, U4)
    expect(Buffer.from(cutRect(raise.terrainPre, nat.stroke.rect, 40)).equals(Buffer.from(cutRect(nat.pre, nat.stroke.rect, 40)))).toBe(true);
  });

  it("a map switch waits for it (U5): the queue is idle only once it landed and the map's worker took it", async () => {
    const { q, map } = await letGo();
    let idle = false;
    void q.idle().then(() => (idle = true));
    await Promise.resolve();
    expect(idle).toBe(false);
    for (let k = 0; k < 50 && !idle; k++) await frames(2);
    expect(idle).toBe(true);
    expect(map.calls.filter((c) => c.startsWith("apply"))).toHaveLength(1);
  });

  it("the editor closing forgets the stroke the button holds: its worker is told, and nothing of it goes on", async () => {
    const { state, heights, N } = land();
    const map = mapWorker();
    const q = queueOn(heights, state, N, N, map.port);
    const log: string[] = [];
    const { painter, paint } = painterOn(q, N, ownWorker(log), log);
    await paint(16.5, 8.5, 20.5, (ms) => frames(ms / 4), false);
    painter.close();
    const before = log.length;
    for (let k = 0; k < 20; k++) await frames(2);
    expect(log.slice(before - 1)).toEqual(["cancel"]);
    expect(log).not.toContain("end");
    expect(map.calls.filter((c) => c.startsWith("apply"))).toEqual([]);
  });
});

describe("a worker that never answers (#884): the queue's one watchdog", () => {
  /** A worker that takes the stroke's start, then answers nothing (it died, or hangs), or answers each kind of call
   *  the given ms after it is sent: what was sent, in order. */
  function silentWorker(late: { add: number; finish: number; end: number } | null = null): { worker: StrokeWorker; sent: string[] } {
    const sent: string[] = [];
    const answer = <T,>(kind: "add" | "finish" | "end", v: T) => (sent.push(kind), late === null ? new Promise<T>(() => {}) : new Promise<T>((resolve) => setTimeout(() => resolve(v), late[kind])));
    const worker: StrokeWorker = {
      begin: () => (sent.push("begin"), Promise.resolve()),
      add: () => answer("add", null as WeatheredLand | null),
      finish: () => answer("finish", null as WeatheredLand | null),
      end: () => answer("end", { pre: new Uint8Array(W * W), protect: new Uint8Array(W * W), settings: settings() }),
      cancel: () => void sent.push("cancel"),
    };
    return { worker, sent };
  }
  /** A queue on a small map that hears its lines and its silent strokes (the page starts the worker again). */
  function watched(port?: MapPort) {
    const lines: string[] = [];
    let restarts = 0;
    const { state, heights } = flat(W, W, 3);
    const q = queueOn(heights, state, W, W, port, { line: (t) => void lines.push(t), expired: () => void restarts++ });
    return { q, lines, restarts: () => restarts };
  }

  it("let go, it waits for a call only as long as the call can take, then is taken back with its line and the worker started again", async () => {
    vi.useFakeTimers();
    const { worker, sent } = silentWorker();
    const { q, lines, restarts } = watched();
    let landed = 0;
    const feed = new StrokeFeed(q, q.stroke("Naturalize"), settings(), worker, (d) => answerBound(d, 5), WEATHER_SILENT, [], () => landed++);
    feed.add([4, 4]);
    await vi.advanceTimersByTimeAsync(0);
    let result: boolean | null = null;
    void feed.end().then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(answerBound(1, 5) - 5);
    expect(result).toBe(null);
    await vi.advanceTimersByTimeAsync(10);
    expect(result).toBe(false);
    expect(lines).toEqual([WEATHER_SILENT]);
    expect(restarts()).toBe(1);
    expect(sent).toEqual(["begin", "add"]);
    expect(landed).toBe(0);
    expect(q.shown.every((v) => v === 3)).toBe(true);
    expect(q.pending()).toBe(0);
  });

  it("a slow worker that answers within the bound is waited for: a 30-dab batch at Size 128, 12 s a call", async () => {
    vi.useFakeTimers();
    // (measured, #884: such a batch took 2.2 s at 256², 2.87 s at 512²)
    expect(answerBound(30, 128)).toBeGreaterThan(12000);
    const { worker, sent } = silentWorker({ add: 12000, finish: 0, end: 50 });
    const { q, lines, restarts } = watched();
    const feed = new StrokeFeed(q, q.stroke("Naturalize"), { ...settings(), size: 128 }, worker, (d) => answerBound(d, 128), WEATHER_SILENT);
    feed.add(Array.from({ length: 60 }, (_, k) => k % 8));
    let result: boolean | null = null;
    void feed.end({ landed: () => q.cancel(feed.id) }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(12000 + 100);
    expect(result).toBe(true);
    expect(sent).toEqual(["begin", "add", "finish", "end"]);
    expect(lines).toEqual([]);
    expect(restarts()).toBe(0);
  });

  it("its end, which costs nothing, waits only a call's few seconds", async () => {
    vi.useFakeTimers();
    const { worker, sent } = silentWorker({ add: 0, finish: 0, end: ANSWER_WAIT_MS + 1000 });
    const { q, lines, restarts } = watched();
    const feed = new StrokeFeed(q, q.stroke("Naturalize"), settings(), worker, (d) => answerBound(d, 5), WEATHER_SILENT);
    feed.add([4, 4]);
    let result: boolean | null = null;
    void feed.end({ landed: () => q.cancel(feed.id) }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS - 100);
    expect(result).toBe(null);
    await vi.advanceTimersByTimeAsync(200);
    expect(result).toBe(false);
    expect(sent).toEqual(["begin", "add", "finish", "end"]);
    expect(lines).toEqual([WEATHER_SILENT]);
    expect(restarts()).toBe(1);
  });

  it("an undo pressed while it lands does nothing once it is taken back (U1); a press meanwhile paints once it is (U6)", async () => {
    vi.useFakeTimers();
    const { state, heights, N } = land();
    const map = mapWorker();
    const lines: string[] = [];
    let restarts = 0;
    const q = queueOn(heights, state, N, N, map.port, { line: (t) => void lines.push(t), expired: () => void restarts++ });
    // (a step before it, which the undo must leave as it is)
    q.edit("apply", [{ op: "deleteEntities", params: { entities: [] } }, "user", "Before"]);
    await vi.advanceTimersByTimeAsync(0);
    const log: string[] = [];
    const silent = (() => {
      const w = ownWorker(log);
      return { ...w, add: () => (log.push("add"), new Promise<null>(() => {})) } as StrokeWorker;
    })();
    const { brush, commits, paint } = painterOn(q, N, silent, log);
    const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
    await paint(16.5, 8.5, 20.5, wait);
    q.undo();
    // (a few seconds on: still waiting; a Raise pressed now waits its turn)
    await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS - 1000);
    expect(map.calls).toEqual(["apply Before"]);
    brush.current = { ...DEFAULT_BRUSH, tool: "raise", target: "free", strength: 10 };
    await paint(16.5, 12.5, 18.5, wait);
    expect(commits).toEqual([]);
    // (past the bound: taken back as Esc takes one back, its one line said; the undo does nothing; the Raise paints)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lines).toEqual([WEATHER_SILENT]);
    expect(restarts).toBe(1);
    expect(commits.map((c) => c.stroke.params.tool)).toEqual(["raise"]);
    expect(map.calls.filter((c) => !c.startsWith("draft") && !c.startsWith("cancelDraft")).map((c) => c.split(" ")[0] + " " + c.split(" ")[1])).toEqual(["apply Before", "apply Raise"]);
    expect(map.history.map((h) => [h.label.split(" ")[0], h.applied])).toEqual([
      ["Before", true],
      ["Raise", true],
    ]);
    // (the Raise began on the land as it was before the Naturalize stroke: its land was laid back)
    const r = commits[0].stroke;
    expect(Buffer.from(r.before.shown).equals(Buffer.from(cutRect(heights, r.rect, N)))).toBe(true);
    expect(q.pending()).toBe(0);
  });
});
