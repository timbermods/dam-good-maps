// The water journey's easing frames (waterPlayer.ts), blended in typed arrays and only when shown (R1, the
// performance audit's water blending): the same water as the original blend, column for column, with the
// outflows blended too (D353), caves' several columns a tile included: since water per column (3D view, part 4)
// a column on a tile with several blends from the earlier column on its own floor, never from the lake on its roof.

import { describe, expect, it, vi } from "vitest";
import { blendWater, WaterPlayer } from "../../src/editor/waterPlayer";
import type { WaterView } from "../../src/render3d/model";

/** The original blend, as it was before R1 (with the current, D353), a tile with several columns pairing each with the
 *  earlier one on its own floor (3D view, part 4). */
function original(a: WaterView, b: WaterView, t: number): WaterView {
  const all = new Map<number, number[]>();
  for (let k = 0; k < a.count; k++) all.set(a.tile[k], [...(all.get(a.tile[k]) ?? []), k]);
  const inB = new Map<number, number>();
  for (let k = 0; k < b.count; k++) inB.set(b.tile[k], (inB.get(b.tile[k]) ?? 0) + 1);
  const at = {
    get: (i: number, k: number): number | undefined => {
      const list = all.get(i);
      if (!list) return undefined;
      if (list.length === 1 && inB.get(i) === 1) return list[0];
      return [...list].reverse().find((q) => Math.abs(a.floor[q] - b.floor[k]) < 0.5);
    },
  };
  const tiles: number[] = [];
  const floor: number[] = [];
  const depth: number[] = [];
  const contamination: number[] = [];
  const outflow: number[] = [];
  const ca = a.outflow;
  const cb = b.outflow;
  const paired = new Set<number>();
  for (let k = 0; k < b.count; k++) {
    const i = b.tile[k];
    const j = at.get(i, k);
    if (j !== undefined) paired.add(j);
    tiles.push(i);
    floor.push(b.floor[k]);
    depth.push((j === undefined ? 0 : a.depth[j]) * (1 - t) + b.depth[k] * t);
    contamination.push((j === undefined ? b.contamination[k] : a.contamination[j]) * (1 - t) + b.contamination[k] * t);
    if (cb) for (let c = 0; c < 4; c++) outflow.push((j === undefined || !ca ? cb[k * 4 + c] : ca[j * 4 + c]) * (1 - t) + cb[k * 4 + c] * t);
  }
  for (let k = 0; k < a.count; k++) {
    const i = a.tile[k];
    if (paired.has(k)) continue;
    const d = a.depth[k] * (1 - t);
    if (d <= 0.001) continue;
    tiles.push(i);
    floor.push(a.floor[k]);
    depth.push(d);
    contamination.push(a.contamination[k]);
    if (cb) for (let c = 0; c < 4; c++) outflow.push(ca ? ca[k * 4 + c] : 0);
  }
  const w: WaterView = { count: tiles.length, tile: Int32Array.from(tiles), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(contamination) };
  if (cb) w.outflow = Float32Array.from(outflow);
  return w;
}

let seed = 11;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** Random water over `N` tiles: some dry, a few tiles with two columns (caves). */
function view(N: number, withCurrent: boolean): WaterView {
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) {
    if (rnd() < 0.4) continue;
    tiles.push(i);
    if (rnd() < 0.03) tiles.push(i);
  }
  const n = tiles.length;
  const w: WaterView = {
    count: n,
    tile: Int32Array.from(tiles),
    floor: Float32Array.from(tiles, () => Math.floor(rnd() * 20)),
    depth: Float32Array.from(tiles, () => (rnd() < 0.1 ? rnd() * 0.002 : rnd() * 3)),
    contamination: Float32Array.from(tiles, () => (rnd() < 0.7 ? 0 : rnd())),
  };
  if (withCurrent) w.outflow = Float32Array.from({ length: n * 4 }, () => rnd() * 3);
  return w;
}

const same = (x: WaterView, y: WaterView) => {
  expect(x.count).toBe(y.count);
  for (const k of ["tile", "floor", "depth", "contamination", "outflow"] as const) {
    const p = x[k];
    const q = y[k];
    expect(!!p).toBe(!!q);
    if (p && q) expect(Buffer.from(p.buffer, p.byteOffset, p.byteLength).equals(Buffer.from(q.buffer, q.byteOffset, q.byteLength))).toBe(true);
  }
};

describe("the journey's easing frames (R1)", () => {
  it("blend as the original did, with and without the outflows, at every step", () => {
    for (const N of [50, 4096, 70000])
      for (const [ca, cb] of [
        [true, true],
        [false, true],
        [true, false],
        [false, false],
      ]) {
        const a = view(N, ca);
        const b = view(N, cb);
        for (const t of [0, 1 / 17, 0.5, 16 / 17, 1]) same(blendWater(a, b, t), original(a, b, t));
      }
  });

  it("ease a cave's pool from its own water, never from the lake on its roof", () => {
    // tile 5: a pool on the cave's floor at 2 (to its ceiling at 4) under a lake on the roof at 8
    const col = (floor: number[], depth: number[], bad: number[]): WaterView => ({ count: floor.length, tile: Int32Array.from(floor, () => 5), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(bad) });
    const a = col([2, 8], [1.5, 2], [0, 1]);
    const b = col([2, 8], [2, 1], [0.2, 1]);
    const w = blendWater(a, b, 0.5);
    expect([...w.depth]).toEqual([1.75, 1.5]);
    expect(w.contamination[0]).toBeCloseTo(0.1);
    // the lake gone: the pool still eases from itself, and the lake fades out
    const c = blendWater(a, col([2], [2], [0]), 0.5);
    expect([...c.depth]).toEqual([1.75, 1]);
    expect([...c.floor]).toEqual([2, 8]);
    // a heightfield tile whose land moved: its one column eases from its one column, as ever
    const d = blendWater(col([3], [1], [0]), col([4], [2], [0]), 0.5);
    expect([...d.depth]).toEqual([1.5]);
  });

  it("blend the same twice in a row (nothing left over from the last blend)", () => {
    const a = view(3000, true);
    const b = view(3000, true);
    const c = view(5000, true);
    blendWater(c, a, 0.3);
    same(blendWater(a, b, 0.4), original(a, b, 0.4));
  });

  it("are made only when shown: skipping to the settled water blends none of them", () => {
    // (the player's clock runs on the page's timers)
    vi.stubGlobal("window", globalThis);
    const shown: WaterView[] = [];
    const p = new WaterPlayer({ show: (f) => shown.push(f.water), changed: () => undefined });
    const a = view(2000, true);
    const b = view(2000, true);
    p.begin({ water: a, done: 0 });
    let blended = 0;
    p.push({ water: b, done: 1, final: () => undefined });
    // (each easing frame's water is a getter until it is read)
    for (const f of (p as unknown as { frames: { water: WaterView }[] }).frames.slice(1, -1)) {
      const d = Object.getOwnPropertyDescriptor(f, "water");
      if (d?.get) blended++;
    }
    expect(blended).toBe(16);
    p.skip();
    expect(shown[shown.length - 1]).toBe(b);
    p.clear();
    vi.unstubAllGlobals();
  });
});
