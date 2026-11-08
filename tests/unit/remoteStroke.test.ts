// A Naturalize stroke weathered in the worker (D422, #868): one call is with the worker at a time, the dabs
// that come meanwhile wait as one batch, sent whole when its answer comes, so the land never falls
// seconds behind the cursor; and the worker, pressing a batch dab by dab, builds exactly the land (and
// the record) it built from one call a batch, so what the page shows is what the operation builds.

import { describe, expect, it } from "vitest";
import { RemotePreview, type WeatherChannel, type WeatheredLand } from "../../src/core/features/raster/remoteStroke";
import { integrityCandidate, StrokePreview, type TerrainState } from "../../src/core/features/raster/strokePreview";
import { integrityAt } from "../../src/core/features/raster/terrain";
import type { BrushParams, Rect } from "../../src/core/features/raster/brush";

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
function land(): { state: TerrainState; heights: Uint8Array; N: number } {
  const N = 40;
  const pre = new Uint8Array(N * N);
  const water = new Float64Array(N * N);
  const moisture = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const hill = Math.max(0, 9 - Math.round(Math.hypot(x - 14, y - 18) / 2));
      pre[i] = 3 + hill + ((x * 7 + y * 13) % 3 === 0 ? 1 : 0);
      if (Math.hypot(x - 28, y - 20) < 5) {
        pre[i] = 2;
        water[i] = 1.5;
      }
      moisture[i] = Math.max(0, 1 - Math.hypot(x - 28, y - 20) / 12);
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
    end: () => turn(() => ({ pre: w!.preview.pre.slice(), protect: w!.preview.protect.slice() })),
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
