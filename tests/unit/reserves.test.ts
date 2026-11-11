// The reserves are drawn as the game's (D178, D496): our own models at the game's measures, read from its models
// (ReservePile.Model, ReserveWarehouse.Model, ReserveTank.Model), in its colours, flipped as the game flips them; and
// their stock as the game's visualizers draw it (StockpileVisualization): the pile's dirt a heap that rises as it fills,
// its other goods stacked in layers of four over each tile, the warehouse's boxes in 36 columns, the tank none.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { entityView, FLIPPED, type EntityInput } from "../../src/render3d/model";
import { RESERVE } from "../../src/render3d/palette";
import { heapLift, PILE_GOODS, RESERVES, stockOf } from "../../src/render3d/reserves";

function bounds(pos: readonly number[]): { lo: number[]; hi: number[] } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pos.length; k++) {
    lo[k % 3] = Math.min(lo[k % 3], pos[k]);
    hi[k % 3] = Math.max(hi[k % 3], pos[k]);
  }
  return { lo, hi };
}

const hasColour = (col: readonly number[], c: readonly number[]) => {
  for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
  return false;
};

const built = (parts: { points: number[] }[]) => bounds(parts.flatMap((p) => p.points));

describe("the reserves at the game's measures", () => {
  it("each fills its 2 × 2 to the game's height: the pile's and the warehouse's arch 1.02, the tank's barrel 2.81", () => {
    // (centred on the footprint's middle, the map's +y our −z: the game's pile and warehouse 2 × 2 to their arch's
    // holder, the tank's barrel 1.54 across on legs splayed toward its corners, its pump house at the entrance, the front)
    for (const [t, top] of [["ReservePile", 1.018], ["ReserveWarehouse", 1.018], ["ReserveTank", 2.81]] as const) {
      const { lo, hi } = bounds(modelOf(t).pos);
      expect(hi[1]).toBeCloseTo(top, 2);
      expect(lo[1]).toBeGreaterThan(-0.03);
      for (const a of [0, 2]) {
        expect(lo[a]).toBeGreaterThanOrEqual(-1.001);
        expect(hi[a]).toBeLessThanOrEqual(1.011);
      }
    }
    const tank = bounds(modelOf("ReserveTank").pos);
    // (the ring round the barrel's base 1.68 across; its threshold stands out a little to the front)
    expect(tank.lo[0]).toBeCloseTo(-0.84, 1);
    expect(tank.hi[2]).toBeCloseTo(1.01, 2);
  });

  it("each is in the game's colours: grey-green boards in amber-brown frames, the pale sign at its entrance", () => {
    const shared = [RESERVE.frame, RESERVE.signOut, RESERVE.signIn, RESERVE.holder];
    const own: Record<string, readonly (readonly number[])[]> = {
      ReservePile: [RESERVE.post, RESERVE.dirtFloor, RESERVE.threshold.ReservePile],
      ReserveWarehouse: [RESERVE.post, RESERVE.floor, RESERVE.rope, RESERVE.tie, RESERVE.threshold.ReserveWarehouse],
      ReserveTank: [RESERVE.board, RESERVE.post, RESERVE.house, RESERVE.doorFrame, RESERVE.door, RESERVE.pipe, RESERVE.threshold.ReserveTank],
    };
    for (const t of RESERVES) for (const c of [...shared, ...own[t]]) expect(hasColour(modelOf(t).col, c)).toBe(true);
  });

  it("a flipped reserve is its model mirrored across its footprint, its entrance on the other half", () => {
    for (const t of RESERVES) {
      expect(modelKeyOf(t, FLIPPED)).toBe(`${t}.flipped`);
      expect(modelKeyOf(t, 0)).toBe(t);
      const p = modelOf(t).pos;
      const q = modelOf(`${t}.flipped`).pos;
      const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      const mirrored = new Set<string>();
      for (let k = 0; k < p.length; k += 3) mirrored.add(key(-p[k] + 0, p[k + 1], p[k + 2]));
      for (let k = 0; k < q.length; k += 3) expect(mirrored.has(key(q[k] + 0, q[k + 1], q[k + 2]))).toBe(true);
      // (the sign at the entrance: east of the middle unflipped, west of it flipped)
      const sign = (pos: readonly number[], col: readonly number[]) => {
        for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - RESERVE.signOut[0]) < 1e-3 && Math.abs(col[k + 1] - RESERVE.signOut[1]) < 1e-3) return pos[k];
        return NaN;
      };
      expect(sign(p, modelOf(t).col)).toBeGreaterThan(0);
      expect(sign(q, modelOf(`${t}.flipped`).col)).toBeLessThan(0);
    }
  });
});

describe("the reserves' stock as the game shows it", () => {
  const dirt = PILE_GOODS.indexOf("Dirt") + 1;
  const log = PILE_GOODS.indexOf("Log") + 1;
  const plank = PILE_GOODS.indexOf("Plank") + 1;

  it("the pile's dirt is a heap that rises from under its floor to its walls' height as it fills", () => {
    // (the game's `Dirt2x2`: 0.82 down, then 0.01 to 0.78 up by the stock's share to the 0.8th power)
    expect(heapLift(0)).toBeCloseTo(-0.81, 3);
    expect(heapLift(160)).toBeCloseTo(-0.04, 3);
    expect(heapLift(80)).toBeCloseTo(-0.81 + 0.77 * 0.5 ** 0.8, 3);
    expect(stockOf("ReservePile", dirt, 0)).toBeNull();
    const full = stockOf("ReservePile", dirt, 160)!;
    const { lo, hi } = built(full.parts());
    // (its top 0.84 over its place; full, 0.80 over the ground, above the pen's walls at 0.48 and under its arch)
    expect(hi[1] + full.lift).toBeCloseTo(0.801, 2);
    expect(lo[0]).toBeCloseTo(-0.95, 2);
    // (the same heap at any amount: one model, moved)
    expect(stockOf("ReservePile", dirt, 40)!.key).toBe(full.key);
  });

  it("the pile's other goods stack over each of its four tiles, four a layer, to 1.7 when full", () => {
    const full = stockOf("ReservePile", plank, 160)!;
    expect(full.lift).toBe(0);
    const { hi } = built(full.parts());
    expect(hi[1]).toBeCloseTo(1.7, 2);
    // (one good: a plank on one tile; each amount its own model)
    const one = stockOf("ReservePile", plank, 1)!;
    expect(one.key).not.toBe(full.key);
    const b = built(one.parts());
    expect(b.hi[1]).toBeCloseTo(0.17, 2);
    expect(b.hi[0] - b.lo[0]).toBeLessThan(1);
    expect(stockOf("ReservePile", plank, 0)).toBeNull();
    // (logs are round: their top a little under the layer's)
    expect(built(stockOf("ReservePile", log, 160)!.parts()).hi[1]).toBeGreaterThan(1.65);
    // (a good the game's pile does not show: none)
    expect(stockOf("ReservePile", 0, 100)).toBeNull();
  });

  it("a tile's last goods lie as the full layer under them, and turn to cross it once its four are there, as the game's", () => {
    // (the game's `GoodPileVariantsService`: one by one by `ShouldRotate(MaxLevels)`, its ten levels even, the way of
    // the top full layer, index 0; four, a full layer at index −1, crossing it)
    const plank = PILE_GOODS.indexOf("Plank") + 1;
    // (the way the j-th good laid lies, by its long side: the first tile's top full layer first, its last goods next;
    // a plank a box, 30 corners)
    const way = (n: number, j: number) => {
      const pos = stockOf("ReservePile", plank, n)!.parts().flatMap((p) => p.points).slice(90 * j, 90 * (j + 1));
      const xs = pos.filter((_, k) => k % 3 === 0);
      const zs = pos.filter((_, k) => k % 3 === 2);
      expect(Math.max(...pos.filter((_, k) => k % 3 === 1))).toBeCloseTo(j < 4 ? 0.17 : 0.34, 3);
      return Math.max(...xs) - Math.min(...xs) > Math.max(...zs) - Math.min(...zs) ? "x" : "z";
    };
    const under = way(28, 0);
    // (16 a layer over the four tiles, each tile's goods given in turn: 16 + 4k is k goods on each)
    for (const k of [1, 2, 3]) for (let j = 0; j < k; j++) expect(way(16 + 4 * k, 4 + j)).toBe(under);
    // (the fourth: the tile's four a full layer, crossing the one under it)
    const full = 16 + 4 * 3 + 1;
    for (let j = 0; j < 4; j++) expect(way(full, 4 + j)).not.toBe(under);
  });

  it("the warehouse's boxes rise in 36 columns, 144 boxes at most for its 200, the tank's stock unseen", () => {
    const full = stockOf("ReserveWarehouse", 0, 200)!;
    const { lo, hi } = built(full.parts());
    expect(hi[1]).toBeCloseTo(0.04 + 4 * 0.232, 3);
    expect(lo[1]).toBeCloseTo(0.05, 3);
    // (half full: every column two boxes high)
    expect(built(stockOf("ReserveWarehouse", 0, 100)!.parts()).hi[1]).toBeCloseTo(0.04 + 2 * 0.232, 3);
    expect(stockOf("ReserveWarehouse", 0, 0)).toBeNull();
    expect(stockOf("ReserveTank", 0, 300)).toBeNull();
  });

  it("the view carries each reserve's stock to its own batch, moved with it", () => {
    const list: EntityInput[] = [
      { template: "ReservePile", x: 4, y: 4, z: 2, orientation: "Cw0", owner: "s", stock: { good: "Dirt", amount: 160 } },
      { template: "ReservePile", x: 8, y: 4, z: 2, orientation: "Cw0", owner: "s", flipped: true, stock: { good: "Log", amount: 40 } },
      { template: "ReserveWarehouse", x: 12, y: 4, z: 2, orientation: "Cw90", owner: "s", stock: { good: "Berries", amount: 200 } },
      { template: "ReserveTank", x: 16, y: 4, z: 2, orientation: "Cw0", owner: "s", stock: { good: "Badwater", amount: 300 } },
    ];
    const view = entityView(list);
    expect([...view.stockGood!]).toEqual([1, 2, 0, 0]);
    expect([...view.stockAmount!]).toEqual([160, 40, 200, 300]);
    const names = new Set((buildEntities(view, new ShaderMaterial(), null, 0).group.children as unknown as { name: string }[]).map((m) => m.name));
    for (const n of ["ReservePile", "ReservePile.flipped", "ReserveWarehouse", "ReserveTank", "ReservePile.dirt", "ReservePile.Log.40.flipped", "ReserveWarehouse.boxes.144"]) expect(names.has(n)).toBe(true);
    expect([...names].filter((n) => n.startsWith("ReserveTank."))).toEqual([]);
  });
});
