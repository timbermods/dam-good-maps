// A Naturalize stroke weathered in the worker (D422, #868): one call is with the worker at a time, the dabs
// that come meanwhile wait as one batch, sent whole when its answer comes, so the land never falls
// seconds behind the cursor; and the worker, pressing a batch dab by dab, builds exactly the land (and
// the record) it built from one call a batch, so what the page shows is what the operation builds.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_WAIT_MS, answerBound, RemotePreview, WEATHER_SILENT, WeatherStroke, type WeatherChannel, type WeatheredLand } from "../../src/core/features/raster/remoteStroke";
import { integrityCandidate, StrokePreview, type TerrainState } from "../../src/core/features/raster/strokePreview";
import { integrityAt } from "../../src/core/features/raster/terrain";
import type { BrushParams, Rect } from "../../src/core/features/raster/brush";
import { BrushPainter, DEFAULT_BRUSH, type Stroke } from "../../src/editor/brushes";
import type { MapRenderer } from "../../src/render3d";
import type { TileHit } from "../../src/render3d/pick";

/** A worker whose calls answer only when the test says: what was sent, in order. */
function heldChannel() {
  const sent: { kind: string; dabs?: number[]; pressure?: number[] }[] = [];
  const answers: (() => void)[] = [];
  const later = <T>(v: T) => new Promise<T>((resolve) => answers.push(() => resolve(v)));
  const channel: WeatherChannel = {
    begin: () => {
      sent.push({ kind: "begin" });
      return later(undefined);
    },
    add: (dabs, pressure) => {
      sent.push({ kind: "add", dabs: [...dabs], ...(pressure ? { pressure: [...pressure] } : {}) });
      return later(null);
    },
    finish: () => {
      sent.push({ kind: "finish" });
      return later(null);
    },
    end: () => {
      sent.push({ kind: "end" });
      return Promise.resolve(null);
    },
    cancel: () => sent.push({ kind: "cancel" }),
  };
  /** The oldest call answers; then the page's chain moves on. */
  const answer = async () => {
    answers.shift()!();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { channel, sent, answer, waiting: () => answers.length };
}

const W = 8;
const settings = (): Omit<BrushParams, "dabs"> => ({ tool: "naturalize", size: 5, strength: 5, seed: 7, weathers: true });
const remote = (channel: WeatherChannel) => new RemotePreview(settings(), new Uint8Array(W * W), W, W, [], channel, () => {}, new Uint8Array(W * W), new Uint8Array(W * W));

describe("the worker's stroke sends one call at a time (#868)", () => {
  it("dabs that come while a call is out wait as one batch, sent when it answers", async () => {
    const { channel, sent, answer } = heldChannel();
    const p = remote(channel);
    p.add([1, 1]);
    p.add([2, 2, 3, 3]);
    p.add([4, 4]);
    expect(sent.map((s) => s.kind)).toEqual(["begin"]);
    await answer(); // begin
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [1, 1, 2, 2, 3, 3, 4, 4] });
    p.add([5, 5]);
    p.add([6, 6]);
    expect(sent.length).toBe(2);
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [5, 5, 6, 6] });
    expect(p.dabs).toBe(6);
    let settled = false;
    void p.settled().then(() => (settled = true));
    await answer();
    expect(settled).toBe(true);
    expect(sent.length).toBe(3);
  });

  it("a pen's pressures go with their dabs; a batch without them is its own call", async () => {
    const { channel, sent, answer } = heldChannel();
    const p = remote(channel);
    p.add([1, 1], [100]);
    p.add([2, 2, 3, 3], [120, 140]);
    p.add([4, 4]);
    p.add([5, 5]);
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [1, 1, 2, 2, 3, 3], pressure: [100, 120, 140] });
    await answer();
    expect(sent.at(-1)).toEqual({ kind: "add", dabs: [4, 4, 5, 5] });
  });

  it("the riding pieces go after every dab before them, and dabs after them after", async () => {
    const { channel, sent, answer, waiting } = heldChannel();
    const p = remote(channel);
    p.add([1, 1]);
    p.finish([]);
    p.add([2, 2]);
    while (waiting()) await answer();
    expect(sent.map((s) => s.kind + (s.dabs ? s.dabs.join(",") : ""))).toEqual(["begin", "add1,1", "finish", "add2,2"]);
  });

  it("Esc forgets the stroke: what was waiting is never sent", async () => {
    const { channel, sent, answer, waiting } = heldChannel();
    const p = remote(channel);
    p.add([1, 1]);
    await answer(); // begin; the first batch goes
    p.add([2, 2]);
    p.finish([]);
    expect(p.restore()).toBe(null);
    while (waiting()) await answer();
    await p.settled();
    expect(sent.map((s) => s.kind)).toEqual(["begin", "add", "cancel"]);
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

/** The worker's side in this process, as session.ts runs it: a preview of its own, answered after a turn. */
function workerChannel(state: TerrainState, heights: Uint8Array, N: number): WeatherChannel {
  let w: { preview: StrokePreview; shown: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null = null;
  const land = (r: Rect | null): WeatheredLand | null => {
    if (!r || !w) return null;
    const bw = r.x1 - r.x0 + 1;
    const out = new Uint8Array(bw * (r.y1 - r.y0 + 1));
    for (let y = r.y0; y <= r.y1; y++) out.set(w.shown.subarray(y * N + r.x0, y * N + r.x1 + 1), (y - r.y0) * bw);
    return { rect: r, heights: out, settings: { ...w.settings } };
  };
  const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));
  return {
    begin: (s, ground) =>
      turn(() => {
        const shown = heights.slice();
        const own = { ...s };
        w = { preview: new StrokePreview(own, { ...state, pre: state.pre.slice() }, shown, N, N, ground.map((r) => [r[0], r[1], r[2]])), shown, settings: own };
      }),
    add: (dabs, pressure) => turn(() => land(w!.preview.add(dabs, pressure))),
    finish: (rigid) => turn(() => land(w!.preview.finish(rigid))),
    end: () => turn(() => ({ pre: w!.preview.pre.slice(), protect: w!.preview.protect.slice(), settings: { ...w!.settings } })),
    cancel: () => (w = null),
  };
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
    // after: the page's RemotePreview, its dabs sent as they come, batched while a call is out
    const shown = heights.slice();
    const record = settings();
    const rects: Rect[] = [];
    const worker = workerChannel(state, heights, N);
    let calls = 0;
    const counted: WeatherChannel = { ...worker, add: (d, pr) => (calls++, worker.add(d, pr)) };
    const p = new RemotePreview(record, shown, N, N, [], counted, (r) => rects.push(r), state.pre.slice(), state.protect);
    for (let k = 0; k < dabs.length; k += 2) {
      p.add(dabs.slice(k, k + 2));
      // (a turn now and then: the worker answers; the first call carries several dabs)
      if (k % 8 === 6) await new Promise((r) => setTimeout(r, 0));
    }
    p.finish([]);
    await p.done();
    // (it did batch: fewer calls than the page's batches)
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThan(dabs.length / 4);
    expect(rects.length).toBeGreaterThan(0);
    expect(p.dabs).toBe(dabs.length / 2);
    expect(Buffer.from(shown).equals(Buffer.from(shownBefore))).toBe(true);
    expect(Buffer.from(p.pre).equals(Buffer.from(before.pre))).toBe(true);
    expect(Buffer.from(p.pre).equals(Buffer.from(direct.pre))).toBe(true);
    expect(JSON.stringify(record)).toBe(JSON.stringify(recordBefore));
    expect(JSON.stringify(record)).toBe(JSON.stringify(one));
    // (and the stroke did change the land)
    expect(p.changed()).toBeGreaterThan(0);
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
    const shown = heights.slice();
    const record = settings();
    const rects: Rect[] = [];
    const p = new RemotePreview(record, shown, N, N, [], workerChannel(state, heights, N), (r) => rects.push(r), state.pre.slice(), state.protect);
    p.add(dabs);
    await p.settled();
    const landed = rects.length;
    p.add(over);
    await p.settled();
    expect(rects.length).toBe(landed);
    p.finish([]);
    await p.done();
    expect(Buffer.from(shown).equals(Buffer.from(shownWorker))).toBe(true);
    expect(JSON.stringify(record)).toBe(JSON.stringify(recordWorker));
  });
});

describe("a stroke with riding pieces keeps the worker's whole record (#875's review)", () => {
  it("the record the worker hands over at the end goes into the operation", async () => {
    // (the hill and its knobs, then flat ground out to the pond: nothing there weathers)
    const { state, N } = land(96, 80, 20);
    for (let y = 0; y < N; y++) for (let x = 34; x < N; x++) if (!state.water![y * N + x]) state.pre[y * N + x] = 3;
    const heights = state.pre.slice();
    integrityAt(state.pre, heights, N, N, state.protect, state.channel, integrityCandidate(state, state.pre), 0, 0, N - 1, N - 1, 16);
    const shown = heights.slice();
    // the worker (naturalize.worker.ts's core): what its last land carried, and the record it ends with
    let stroke: WeatherStroke | null = null;
    let lastLand: string | null = null;
    let ended: string | null = null;
    const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));
    const weather: WeatherChannel = {
      begin: (s, ground) => turn(() => void (stroke = new WeatherStroke(s, { ...state, pre: state.pre.slice() }, heights.slice(), N, N, ground.map((r) => [r[0], r[1], r[2]])))),
      add: (d, p) =>
        turn(() => {
          const r = stroke!.add(d, p);
          if (r) lastLand = JSON.stringify(r.settings);
          return r;
        }),
      finish: (rigid) => turn(() => stroke!.finish(rigid)),
      end: () =>
        turn(() => {
          const r = stroke!.end();
          ended = JSON.stringify(r.settings);
          return r;
        }),
      cancel: () => void (stroke = null),
    };
    // the page: a painter whose renderer picks the tile under a pointer at (x, y) and draws nothing
    const renderer = new Proxy({ heightAt: (x: number, y: number) => shown[y * N + x], pickAtLevel: (x: number, y: number, level: number) => ({ x: Math.floor(x), y: Math.floor(y), point: [x, level, -y] }), slice: null } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => {}),
    }) as unknown as MapRenderer;
    // (a 3 × 3 piece every few tiles along the hill: those the stroke changes ride it whole)
    const pieces: [number, number, number, number][] = [];
    for (let x = 8; x <= 28; x += 4) pieces.push([x, 15, x + 2, 17]);
    let sent: Stroke | null = null;
    const painter = new BrushPainter({
      renderer,
      W: N,
      H: N,
      heights: () => shown,
      terrain: () => state,
      settings: () => ({ ...DEFAULT_BRUSH, tool: "naturalize", strength: 10 }),
      commit: (s) => void (sent = s),
      picked: () => {},
      strength: () => {},
      painting: () => {},
      rides: () => pieces,
      objectGround: () => [],
      weather,
    });
    const raf = globalThis.requestAnimationFrame;
    const caf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((h: number) => clearTimeout(h)) as typeof cancelAnimationFrame;
    try {
      const ev = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y, pointerType: "mouse", shiftKey: false, ctrlKey: false, metaKey: false }) as unknown as PointerEvent;
      const hit = (x: number, y: number): TileHit => ({ x: Math.floor(x), y: Math.floor(y), point: [x, shown[Math.floor(y) * N + Math.floor(x)], -y], face: "top", t: 0 });
      const frames = (n: number) => new Promise((r) => setTimeout(r, n * 4));
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
      for (let k = 0; k < 50 && !sent; k++) await frames(2);
      // (the dabs over the pond changed no land and grew the worker's record: what only the end hands over)
      expect(lastLand).toBe(overLand);
      expect(ended).not.toBe(lastLand);
      const params = sent!.params;
      expect(params.rigid?.length).toBeGreaterThan(0);
      const record = JSON.parse(ended!) as Record<string, unknown>;
      for (const key of ["weathering", "shore", "pools", "moist"]) expect(JSON.stringify((params as unknown as Record<string, unknown>)[key])).toBe(JSON.stringify(record[key]));
    } finally {
      globalThis.requestAnimationFrame = raf;
      globalThis.cancelAnimationFrame = caf;
    }
  });
});

describe("a stroke on its way to the history (#880)", () => {
  it("taken back while its last land is coming, it builds nothing and the worker is never asked for its end", async () => {
    const { channel, sent, answer, waiting } = heldChannel();
    let landed = 0;
    const p = new RemotePreview(settings(), new Uint8Array(W * W), W, W, [], channel, () => landed++, new Uint8Array(W * W), new Uint8Array(W * W));
    p.add([1, 1]);
    p.finish([]);
    const done = p.done();
    await answer(); // begin; the dabs go
    p.restore();
    while (waiting()) await answer();
    expect(await done).toBe(false);
    expect(sent.map((s) => s.kind)).toEqual(["begin", "add", "cancel"]);
    expect(landed).toBe(0);
  });

  const frames = (n: number) => new Promise((r) => setTimeout(r, n * 4));
  /** A Naturalize stroke painted on the hill and let go (the painter's host records what reaches the page); the
   *  worker answers a turn later, as naturalize.worker.ts does. */
  async function letGo() {
    const { state, heights, N } = land();
    const shown = heights.slice();
    const log: string[] = [];
    // (naturalize.worker.ts's side: its one stroke, each call answered a turn later)
    let stroke: WeatherStroke | null = null;
    const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));
    const weather: WeatherChannel = {
      begin: (s, ground) => turn(() => void (stroke = new WeatherStroke(s, { ...state, pre: state.pre.slice() }, heights.slice(), N, N, ground.map((r) => [r[0], r[1], r[2]])))),
      add: (d, pr) => (log.push("add"), turn(() => stroke?.add(d, pr) ?? null)),
      finish: (rigid) => (log.push("finish"), turn(() => stroke?.finish(rigid) ?? null)),
      end: () =>
        (log.push("end"),
        turn(() => {
          const r = stroke?.end() ?? null;
          stroke = null;
          return r;
        })),
      cancel: () => {
        log.push("cancel");
        stroke = null;
      },
    };
    const renderer = new Proxy({ heightAt: (x: number, y: number) => shown[y * N + x], pickAtLevel: (x: number, y: number, level: number) => ({ x: Math.floor(x), y: Math.floor(y), point: [x, level, -y] }), slice: null } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => {}),
    }) as unknown as MapRenderer;
    const painter = new BrushPainter({
      renderer,
      W: N,
      H: N,
      heights: () => shown,
      terrain: () => state,
      settings: () => ({ ...DEFAULT_BRUSH, tool: "naturalize", strength: 10 }),
      commit: () => void log.push("commit"),
      picked: () => {},
      strength: () => {},
      painting: () => {},
      draft: () => void log.push("draft"),
      objectGround: () => [],
      weather,
    });
    const ev = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y, pointerType: "mouse", shiftKey: false, ctrlKey: false, metaKey: false }) as unknown as PointerEvent;
    const hit = (x: number, y: number): TileHit => ({ x: Math.floor(x), y: Math.floor(y), point: [x, shown[Math.floor(y) * N + Math.floor(x)], -y], face: "top", t: 0 });
    painter.tool.down(hit(8.5, 16.5), ev(8.5, 16.5));
    for (let x = 9.5; x <= 20.5; x += 1) {
      painter.tool.move(hit(x, 16.5), ev(x, 16.5));
      await frames(2);
    }
    painter.tool.up(hit(20.5, 16.5), ev(20.5, 16.5));
    return { painter, log };
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
  });

  it("an undo and a redo pressed before it lands wait for it, then act in the order pressed", async () => {
    const { painter, log } = await letGo();
    // (let go: its last land and its end are still coming from the worker)
    expect(painter.busy).toBe(true);
    expect(log).not.toContain("commit");
    const undo = painter.afterLanding(() => void log.push("undo"));
    const redo = painter.afterLanding(() => void log.push("redo"));
    expect(log.filter((s) => s === "undo" || s === "redo")).toEqual([]);
    await undo;
    await redo;
    const at = (s: string) => log.indexOf(s);
    expect(at("end")).toBeGreaterThan(-1);
    expect(at("commit")).toBeGreaterThan(at("end"));
    expect(at("undo")).toBeGreaterThan(at("commit"));
    expect(at("redo")).toBeGreaterThan(at("undo"));
    // (with nothing on its way: at once)
    expect(painter.busy).toBe(false);
    let now = false;
    void painter.afterLanding(() => void (now = true));
    expect(now).toBe(true);
  });

  it("the editor closing forgets it, as Esc does: no land, draft, end, operation or waiting undo reaches the next", async () => {
    const { painter, log } = await letGo();
    expect(painter.busy).toBe(true);
    const undo = painter.afterLanding(() => void log.push("undo"));
    const before = log.length;
    painter.drop();
    await undo;
    for (let k = 0; k < 20; k++) await frames(2);
    expect(log.slice(before)).toEqual(["cancel"]);
    expect(painter.busy).toBe(false);
  });
});

describe("a worker that never answers (#884)", () => {
  /** A worker that takes the stroke's start, then answers nothing (it died, or hangs), or answers each kind of call
   *  the given ms after it is sent: what was sent, in order, and how often it was started again. */
  function silentChannel(late: { add: number; finish: number; end: number } | null = null) {
    const sent: string[] = [];
    let restarts = 0;
    const answer = <T,>(kind: "add" | "finish" | "end", v: T) => (sent.push(kind), late === null ? new Promise<T>(() => {}) : new Promise<T>((resolve) => setTimeout(() => resolve(v), late[kind])));
    const channel: WeatherChannel = {
      begin: () => (sent.push("begin"), Promise.resolve()),
      add: () => answer("add", null),
      finish: () => answer("finish", null),
      end: () => answer("end", null),
      cancel: () => void sent.push("cancel"),
      restart: () => void restarts++,
    };
    return { channel, sent, restarts: () => restarts };
  }
  afterEach(() => vi.useRealTimers());

  it("let go, it waits for a call only as long as the call can take, then is taken back and the worker started again", async () => {
    vi.useFakeTimers();
    const { channel, sent, restarts } = silentChannel();
    const heights = new Uint8Array(W * W).fill(3);
    let landed = 0;
    const p = new RemotePreview(settings(), heights, W, W, [], channel, () => landed++, new Uint8Array(W * W), new Uint8Array(W * W));
    p.add([4, 4]);
    p.finish([]);
    let result: boolean | null = null;
    void p.done().then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(answerBound(1, 5) - 5);
    expect(result).toBe(null);
    await vi.advanceTimersByTimeAsync(10);
    expect(result).toBe(false);
    expect(p.silent).toBe(true);
    expect(sent).toEqual(["begin", "add", "cancel"]);
    expect(restarts()).toBe(1);
    expect(landed).toBe(0);
    expect(heights.every((v) => v === 3)).toBe(true);
  });

  it("a slow worker that answers within the bound is waited for: a 30-dab batch at Size 128, 12 s a call", async () => {
    vi.useFakeTimers();
    // (measured, #884: such a batch took 2.2 s)
    expect(answerBound(30, 128)).toBeGreaterThan(12000);
    const { channel, sent, restarts } = silentChannel({ add: 12000, finish: 0, end: 50 });
    const p = new RemotePreview({ ...settings(), size: 128 }, new Uint8Array(W * W), W, W, [], channel, () => {}, new Uint8Array(W * W), new Uint8Array(W * W));
    p.add(Array.from({ length: 60 }, (_, k) => k % 8));
    let result: boolean | null = null;
    void p.done().then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(12000 + 100);
    expect(result).toBe(true);
    expect(p.silent).toBe(false);
    expect(sent).toEqual(["begin", "add", "end"]);
    expect(restarts()).toBe(0);
  });

  it("its end, which costs nothing, waits only a call's few seconds", async () => {
    vi.useFakeTimers();
    const { channel, sent, restarts } = silentChannel({ add: 0, finish: 0, end: ANSWER_WAIT_MS + 1000 });
    const p = remote(channel);
    p.add([4, 4]);
    let result: boolean | null = null;
    void p.done().then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS - 100);
    expect(result).toBe(null);
    await vi.advanceTimersByTimeAsync(200);
    expect(result).toBe(false);
    expect(sent).toEqual(["begin", "add", "end", "cancel"]);
    expect(restarts()).toBe(1);
  });

  /** The page's painter with that worker: a Naturalize stroke painted on the hill and let go. */
  async function letGoSilent() {
    const { state, heights, N } = land();
    const shown = heights.slice();
    const log: string[] = [];
    const { channel, sent, restarts } = silentChannel();
    const renderer = new Proxy({ heightAt: (x: number, y: number) => shown[y * N + x], pickAtLevel: (x: number, y: number, level: number) => ({ x: Math.floor(x), y: Math.floor(y), point: [x, level, -y] }), slice: null } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : () => {}),
    }) as unknown as MapRenderer;
    const painter = new BrushPainter({
      renderer,
      W: N,
      H: N,
      heights: () => shown,
      terrain: () => state,
      settings: () => ({ ...DEFAULT_BRUSH, tool: "naturalize", strength: 10 }),
      commit: () => void log.push("commit"),
      picked: () => {},
      strength: () => {},
      painting: (on) => void log.push(on ? "painting" : "painted"),
      draft: () => void log.push("draft"),
      cancelDraft: () => void log.push("cancelDraft"),
      refuse: (text) => void log.push(`refuse: ${text}`),
      objectGround: () => [],
      weather: channel,
    });
    const ev = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y, pointerType: "mouse", shiftKey: false, ctrlKey: false, metaKey: false }) as unknown as PointerEvent;
    const hit = (x: number, y: number): TileHit => ({ x: Math.floor(x), y: Math.floor(y), point: [x, shown[Math.floor(y) * N + Math.floor(x)], -y], face: "top", t: 0 });
    const stroke = async () => {
      painter.tool.down(hit(8.5, 16.5), ev(8.5, 16.5));
      for (let x = 9.5; x <= 20.5; x += 1) {
        painter.tool.move(hit(x, 16.5), ev(x, 16.5));
        await vi.advanceTimersByTimeAsync(8);
      }
      painter.tool.up(hit(20.5, 16.5), ev(20.5, 16.5));
    };
    await stroke();
    return { painter, log, sent, restarts, shown, heights, stroke };
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
  });

  it("the undo waiting for it goes ahead once it is taken back with one line, and the next stroke paints", async () => {
    vi.useFakeTimers();
    const { painter, log, sent, restarts, shown, heights, stroke } = await letGoSilent();
    expect(painter.busy).toBe(true);
    void painter.afterLanding(() => void log.push("undo"));
    // (a few seconds on: still waiting, and a new stroke waits too)
    await vi.advanceTimersByTimeAsync(ANSWER_WAIT_MS - 1000);
    expect(log).not.toContain("undo");
    const begun = sent.filter((s) => s === "begin").length;
    await stroke();
    expect(sent.filter((s) => s === "begin").length).toBe(begun);
    // (past the bound: taken back as Esc takes one back, the one line said, then the undo)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log).toContain("undo");
    expect(log).not.toContain("commit");
    expect(log.filter((s) => s.startsWith("refuse"))).toEqual([`refuse: ${WEATHER_SILENT}`]);
    expect(log).toContain("cancelDraft");
    expect(log.indexOf("undo")).toBeGreaterThan(log.indexOf(`refuse: ${WEATHER_SILENT}`));
    expect(sent.at(-1)).toBe("cancel");
    expect(restarts()).toBe(1);
    expect(Buffer.from(shown).equals(Buffer.from(heights))).toBe(true);
    expect(painter.busy).toBe(false);
    // the next stroke starts on the worker started again
    await stroke();
    expect(sent.filter((s) => s === "begin").length).toBe(begun + 1);
  });
});
