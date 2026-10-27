// The hollow under the pointer (hollow.ts; 3D view, "The hollow under the cursor"): which tiles within a cursor's reach
// have air under their top run, how thick their roof is and how high the air, on hand-made columns.

import { describe, expect, it } from "vitest";
import { blockReach, hollowFootprint, roofOf, roofTone } from "../../src/render3d/hollow";

/** A column's mask from its solid layers. */
const mask = (...solid: number[]): number => solid.reduce((m, z) => m | (1 << z), 0);
const span = (lo: number, hi: number): number[] => Array.from({ length: hi - lo }, (_, k) => lo + k);

describe("roofOf", () => {
  it("is null on plain columns and on air only between lower runs", () => {
    expect(roofOf(0)).toBeNull();
    expect(roofOf(mask(...span(0, 7)))).toBeNull();
    // (rock 0–1, air 2–3, rock 4–8 is a roof; but a top run standing on the floor with a pocket lower down is not this
    // column's case: the top run is 4–8, and its underside 4 has air under it)
    expect(roofOf(mask(0, 1, ...span(4, 9)))).toEqual({ top: 9, underside: 4, floor: 2 });
  });

  it("gives the roof's top, its underside and the floor under the air", () => {
    // a cave: rock 0–1, air 2–4, a roof 5–7 (three blocks thick over air three high)
    expect(roofOf(mask(0, 1, 5, 6, 7))).toEqual({ top: 8, underside: 5, floor: 2 });
    // an arch over the map's floor: air from 0
    expect(roofOf(mask(6, 7))).toEqual({ top: 8, underside: 6, floor: 0 });
    // two caves stacked: only the air right under the top run counts
    expect(roofOf(mask(0, 3, 4, 8))).toEqual({ top: 9, underside: 8, floor: 5 });
  });
});

describe("hollowFootprint", () => {
  // 10 × 8, ground at 6; a 3 × 2 cave at (4–6, 3–4) under a roof 5–7 (top 8); a thin roof at (7, 3) (rock 0–3, air 4–6, roof 7)
  const W = 10;
  const H = 8;
  const masks = new Uint32Array(W * H).fill(mask(...span(0, 6)));
  for (let y = 3; y <= 4; y++) for (let x = 4; x <= 6; x++) masks[y * W + x] = mask(0, 1, 5, 6, 7);
  masks[3 * W + 7] = mask(0, 1, 2, 3, 7);
  const plain = mask(...span(0, 6));
  const listed = (i: number) => masks[i] !== plain;
  const at = (i: number) => masks[i];

  it("finds every roofed tile whose middle is within the reach, with its thickness", () => {
    const all = hollowFootprint(W, H, listed, at, { x: 5.5, y: 4, radius: 4 });
    expect(all.map((t) => [t.x, t.y])).toEqual([[4, 3], [5, 3], [6, 3], [7, 3], [4, 4], [5, 4], [6, 4]]);
    const thin = all.find((t) => t.x === 7)!;
    expect(thin.top - thin.underside).toBe(1);
    expect(thin.underside - thin.floor).toBe(3);
    expect(all.filter((t) => t.x < 7).every((t) => t.top - t.underside === 3 && t.underside - t.floor === 3)).toBe(true);
  });

  it("keeps to the reach (a disc, or a square) and to the map", () => {
    expect(hollowFootprint(W, H, listed, at, { x: 4.5, y: 3.5, radius: 0.5 }).map((t) => [t.x, t.y])).toEqual([[4, 3]]);
    // (the disc of radius 1 at (5, 4) reaches the four tiles round that corner; the square of 1.5 round (5.5, 3.5) the whole 3 × 2 cave, not the thin roof two tiles east)
    expect(hollowFootprint(W, H, listed, at, { x: 5, y: 4, radius: 1 }).length).toBe(4);
    expect(hollowFootprint(W, H, listed, at, { x: 5.5, y: 3.5, radius: 1.5, square: true }).length).toBe(6);
    expect(hollowFootprint(W, H, listed, at, { x: 1, y: 1, radius: 2 })).toEqual([]);
    expect(hollowFootprint(W, H, listed, at, { x: -20, y: 4, radius: 3 })).toEqual([]);
  });

  it("leaves out a roof the cursor is under (aimed at a level below its underside)", () => {
    const reach = { x: 5.5, y: 4, radius: 4 };
    // aimed at the cave's floor (2): no roof counts; at the thin roof's floor (4): only the thick roof is above it
    expect(hollowFootprint(W, H, listed, at, { ...reach, aim: 2 })).toEqual([]);
    expect(hollowFootprint(W, H, listed, at, { ...reach, aim: 5 }).length).toBe(6);
    expect(hollowFootprint(W, H, listed, at, { ...reach, aim: 8 }).length).toBe(7);
  });

  it("reads the masks a layer cut leaves", () => {
    // cut at 6: the roofs above it are gone down to the cut, the thick roof is one block (5) over its air; cut at 5:
    // the cave opens, no roof left over it, and the thin roof is gone
    const cut = (c: number) => (i: number) => masks[i] & ((1 << c) - 1);
    const at6 = hollowFootprint(W, H, listed, cut(6), { x: 5.5, y: 4, radius: 4 });
    expect(at6.map((t) => t.top - t.underside)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(hollowFootprint(W, H, listed, cut(5), { x: 5.5, y: 4, radius: 4 })).toEqual([]);
  });
});

describe("the tone and the Block tool's reach", () => {
  it("fills a thin roof the most, fading to a wash at six blocks", () => {
    expect(roofTone(1)).toBeGreaterThan(roofTone(2));
    expect(roofTone(2)).toBeGreaterThan(roofTone(4));
    expect(roofTone(6)).toBe(roofTone(12));
    expect(roofTone(12)).toBeGreaterThan(0);
  });

  it("reaches a tile round the blocks, aimed at their lowest layer", () => {
    expect(blockReach([])).toBeNull();
    expect(blockReach([[4, 3, 7]])).toEqual({ x: 4.5, y: 3.5, radius: 1.5, square: true, aim: 7 });
    expect(blockReach([[4, 3, 7], [6, 3, 6]])).toEqual({ x: 5.5, y: 3.5, radius: 2.5, square: true, aim: 6 });
  });
});
