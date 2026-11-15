// Shores that wander (src/core/land/shores.ts; planning's ruling of 2026-11-15, ruled water): a planned lake's straight
// shore is notched by taking ground only, its steps stay one level, and a shore that already wanders is left alone.

import { describe, expect, it } from "vitest";
import { bendShores, inStrip, outlines, straightRuns, SHORES } from "../../src/core/land/shores";
import type { Lake } from "../../src/core/land/hydro";

/** A 40 × 40 land: a lake (level 3, its water 2) west of a straight north–south shore at x = 15, a bank of level 4
 *  from there, and level 5 from x = 22 on. */
function boxLake(): {
  h: Uint8Array;
  water: Uint8Array;
  lakes: Lake[];
  W: number;
  H: number;
} {
  const W = 40,
    H = 40;
  const h = new Uint8Array(W * H);
  const water = new Uint8Array(W * H);
  const tiles: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const inLake = x >= 4 && x < 16 && y >= 6 && y < 34;
      h[i] = inLake ? 3 : x < 22 ? 4 : 5;
      if (inLake) {
        water[i] = 2;
        tiles.push(i);
      }
    }
  return { h, water, lakes: [{ tiles, outletBed: 2, river: "r" }], W, H };
}

describe("shores", () => {
  it("tells a digital straight line from a wandering one", () => {
    expect(
      inStrip([
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 1],
        [4, 2],
        [5, 2],
        [6, 3],
        [7, 3],
      ]),
    ).toBe(true);
    expect(
      inStrip([
        [0, 0],
        [1, 1],
        [2, 0],
        [3, 1],
        [4, 0],
        [5, 1],
      ]),
    ).toBe(false);
  });

  it("finds the straight stretches of a box lake's outline", () => {
    const { water, W, H } = boxLake();
    const lake = water.map((v) => (v === 2 ? 1 : 0));
    const loops = outlines(lake, W, H);
    expect(loops.length).toBe(1);
    expect(straightRuns(loops[0], W, SHORES.run).length).toBeGreaterThan(0);
  });

  it("notches a straight shore by taking ground only, every step one level", () => {
    const { h, water, lakes, W, H } = boxLake();
    const before = h.slice();
    const cut = bendShores(h, W, H, water, lakes, 7);
    expect(cut).toBeGreaterThan(0);
    for (let i = 0; i < W * H; i++) expect(h[i]).toBeLessThanOrEqual(before[i]);
    // the east shore now steps aside: its water reaches into the bank in places, and not in others
    const east = [];
    for (let y = 8; y < 32; y++) east.push(water[y * W + 16] === 2 ? 1 : 0);
    expect(east).toContain(1);
    expect(east).toContain(0);
    // no step of two levels between dry neighbours
    for (let y = 0; y < H; y++)
      for (let x = 0; x + 1 < W; x++) {
        const a = y * W + x,
          b = a + 1;
        if (!water[a] && !water[b]) expect(Math.abs(h[a] - h[b])).toBeLessThanOrEqual(1);
      }
    // the tiles the water took joined the lake
    expect(lakes[0].tiles.length).toBeGreaterThan(12 * 28);
  });
});
