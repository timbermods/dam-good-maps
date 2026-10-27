// A map with caves settles at once after an edit that leaves its water as it was (D453): the last
// canonical settle stands for the new one, provably (sim/stackWater.ts `settledAgain`), with the same
// bytes as a settle from cold; an edit by the water settles in full. A project saved while the water
// settles reopens to the same file as one saved settled. The collaboration's settled hash covers the
// water under the roofs.

import { describe, expect, it } from "vitest";
import { settledHash } from "../../src/core/collab";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { canonicalRun, type CanonicalWater } from "../../src/core/sim/prefill";
import type { WaterModel } from "../../src/core/sim/water";
import { canonicalStackRun, REACH_MARGIN, settledAgain, type StackSettle } from "../../src/core/sim/stackWater";
import { makeSpec } from "../../src/core/spec/mapspec";
import { caveSession, dig, hillsides } from "./caveMap";

const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

/** The canonical settle of the map's water from cold. */
function cold(s: MapSession): CanonicalWater {
  const run = canonicalRun(s.built.waterModel);
  let w = run.advance(Infinity);
  while (!w) w = run.advance(Infinity);
  return w;
}

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function expectSame(a: StackSettle, b: StackSettle): void {
  for (const k of ["count", "floor", "ceil", "depth", "overflow", "contamination", "sat", "reach", "flows"] as const) expect(bytes(a[k]!).equals(bytes(b[k]!)), k).toBe(true);
  for (const k of ["ids", "depth", "overflow", "contamination"] as const) expect(bytes(a.start![k]).equals(bytes(b.start![k])), `start ${k}`).toBe(true);
  expect([a.L, a.settled, a.ticks]).toEqual([b.L, b.settled, b.ticks]);
}

/** How far (Chebyshev, in tiles) (x, y) lies from every column the settle wet. */
function fromReach(st: StackSettle, x: number, y: number): number {
  const N = st.W * st.H;
  let best = Infinity;
  for (let c = 0; c < st.reach!.length; c++) {
    if (!st.reach![c]) continue;
    const i = c % N;
    best = Math.min(best, Math.max(Math.abs((i % st.W) - x), Math.abs(Math.floor(i / st.W) - y)));
  }
  return best;
}

describe("a map with caves settles again at once when an edit leaves its water as it was (D453)", () => {
  it("an edit away from the water: the last settle, the same bytes as from cold; an edit by the water settles in full", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const h = hillsides(s)[0];
    expect(s.apply(dig(h.x, h.y, h.z, "-x")).errors).toEqual([]);
    const st = s.built.settle.stack!;
    expect(st.reach).toBeDefined();
    // the top block of a tile, taken off: the tiles nothing stands on, by their distance from the water's reach
    const W = s.built.W;
    const held = new Set(s.built.entities.map((e) => e.y * W + e.x));
    const tiles: { x: number; y: number; d: number }[] = [];
    for (let y = 3; y < s.built.H - 3; y++) for (let x = 3; x < W - 3; x++) if (!held.has(y * W + x) && s.plainAt(y * W + x)) tiles.push({ x, y, d: fromReach(st, x, y) });
    tiles.sort((a, b) => b.d - a.d);
    const top = (t: { x: number; y: number }) => dig(t.x, t.y, s.built.heights[t.y * W + t.x] - 1, "+z");
    // three in a row, each standing on the one before
    for (const far of [tiles[0], tiles[6], tiles[12]]) {
      expect(far.d).toBeGreaterThan(REACH_MARGIN + 2);
      const prev = { model: s.built.waterModel, water: s.built.settle };
      expect(s.apply(top(far)).errors).toEqual([]);
      const again = settledAgain(prev.water.stack!, prev.model, s.built.waterModel);
      expect(again).not.toBeNull();
      const c = cold(s);
      expectSame(again!, c.stack!);
      // (the build took it, and the map from above is the cold settle's too)
      expectSame(s.built.settle.stack!, c.stack!);
      expect(bytes(s.built.water).equals(bytes(c.depth))).toBe(true);
    }
    // by the water: no shortcut, and the settle is the cold one
    const near = tiles.find((t) => t.d === 1 && s.built.water[t.y * W + t.x] === 0)!;
    const before = { model: s.built.waterModel, water: s.built.settle };
    expect(s.apply(top(near)).errors).toEqual([]);
    expect(settledAgain(before.water.stack!, before.model, s.built.waterModel)).toBeNull();
    expectSame(s.built.settle.stack!, cold(s).stack!);
  }, 60000);

  it("a project saved while a hollowed map's water settles reopens to the same file as one saved settled", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const { x, y, z } = hillsides(s)[0];
    expect(s.apply(dig(x, y, z, "-x")).errors).toEqual([]);
    expect(s.waterPending).toBe(true);
    const run = s.canonicalRun();
    expect(run.advance(64)).toBeNull();
    const mid = s.project();
    let w = run.advance(Infinity);
    while (!w) w = run.advance(Infinity);
    expect(s.adoptWater(run.model, w)).toBe(true);
    const settled = s.project();
    const file = s.exportTimber().bytes;
    for (const p of [mid, settled]) {
      const again = MapSession.open(decodeProject(p));
      again.settleCanonical();
      expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(file))).toBe(true);
    }
  }, 60000);

  it("the collaboration's settled hash covers the water under a roof", () => {
    const s = caveSession();
    expect(s.apply(dig(10, 10, 7, "+z")).errors).toEqual([]);
    const st = s.built.settle.stack!;
    expect(st.stacked).toBe(true);
    const N = st.W * st.H;
    // a column under a roof: the lowest of a tile with two
    let c = -1;
    for (let i = 0; i < N && c < 0; i++) if (st.count[i] > 1) c = i;
    expect(c).toBeGreaterThanOrEqual(0);
    const hash = settledHash(s);
    const top = bytes(s.built.water).slice();
    const was = st.depth[c];
    st.depth[c] = was + 0.5;
    // (the map from above is as it was: a hash of it alone would not see it)
    expect(bytes(s.built.water).equals(top)).toBe(true);
    expect(settledHash(s)).not.toBe(hash);
    st.depth[c] = was;
    expect(settledHash(s)).toBe(hash);
  });
});

// A stored lake whose rim was dug, on a long map (the engine review of #534's repro): the water is stored levelled at
// rest across dry ground the run never reached, so an edit in that ground changes the settle without touching the
// run's own water. It settles in full, and what the build keeps is the cold settle's (D453).
describe("a stored lake levelled across ground beyond the run's reach", () => {
  const W = 64;
  const H = 12;
  const N = W * H;
  /** Rock to 10 with the boxes (x0, x1, y0, y1, z0, z1) cut out (inclusive), as the engine's own tests carve. */
  function carve(cuts: readonly number[][]): Uint32Array {
    const mask = new Uint32Array(N).fill((1 << 10) - 1);
    for (const [x0, x1, y0, y1, z0, z1] of cuts) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) mask[y * W + x] &= ~(1 << z);
    return mask;
  }
  // the lake (floor 2, 3.5 deep, to 5.5) behind a rim dug to 3, a pit on 0 and a long shelf on 2 beyond
  const cuts = [[1, 4, 4, 7, 2, 5], [5, 5, 4, 7, 3, 5], [6, 9, 4, 7, 0, 5], [10, 58, 1, 10, 2, 5]];
  const tiles: number[] = [];
  for (let y = 4; y <= 7; y++) for (let x = 1; x <= 4; x++) tiles.push(y * W + x);
  const retained = [{ tiles, floor: tiles.map(() => 2), depth: tiles.map(() => 3.5), contamination: tiles.map(() => 0) }];
  const model = (mask: Uint32Array) => ({ W, H, retained, stacked: { mask, objects: new Float64Array(0) } }) as unknown as WaterModel;
  const settle = (mask: Uint32Array): StackSettle => {
    const run = canonicalStackRun(W, H, { mask, objects: new Float64Array(0) }, retained);
    let s = run.advance(1e6);
    while (!s) s = run.advance(1e6);
    return s;
  };

  it("an edit far from the run's water, inside the levelled ground, settles in full: the cold settle", () => {
    const a = carve(cuts);
    const was = settle(a);
    // the run wets only the near end of the shelf; the stored water stands over all of it
    const far = 5 * W + 55;
    expect(was.depth.some((d, k) => d > 0 && k % N === far)).toBe(true);
    expect(fromReach(was, 55, 5)).toBe(0);
    // a column dug inside the arena, 32 tiles from the run's water
    const b = carve(cuts);
    b[far] &= ~0b11;
    expect(settledAgain(was, model(a), model(b))).toBeNull();
    const cold = settle(b);
    expectSame(cold, settle(b));
    // (the dug column took water the old settle held, so the old one would have been wrong)
    expect(bytes(cold.depth).equals(bytes(was.depth))).toBe(false);
  }, 60000);

  it("the levelled water carries none of the run's momentum: no current is drawn on still water", () => {
    const s = settle(carve(cuts));
    let wet = 0;
    for (let k = 0; k < s.depth.length; k++) {
      if (s.depth[k] <= 0) continue;
      wet++;
      for (let d = 0; d < 4; d++) expect(s.flows![k * 4 + d], `column ${k} way ${d}`).toBe(0);
    }
    expect(wet).toBeGreaterThan(100);
  }, 60000);
});
