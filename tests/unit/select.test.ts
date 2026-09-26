// The Select tool's tiles (PLAN §20 D184): a rectangle, a freehand outline, the same level; added
// and taken away; its size in words (D183).

import { describe, expect, it } from "vitest";
import { outlineTiles, rectTilesBetween, sameLevelTiles, Selection, sizeWords } from "../../src/editor/select";

const W = 20;
const H = 16;

describe("the Select tool", () => {
  it("a rectangle either way round, clipped to the map", () => {
    expect(rectTilesBetween([2, 3], [4, 4], W, H)).toEqual([62, 63, 64, 82, 83, 84]);
    expect(rectTilesBetween([4, 4], [2, 3], W, H)).toEqual(rectTilesBetween([2, 3], [4, 4], W, H));
    expect(rectTilesBetween([18, 14], [25, 30], W, H).length).toBe(4);
  });

  it("a freehand outline takes its inside and its line", () => {
    const t = outlineTiles([[2, 2], [10, 2], [10, 8], [2, 8]], W, H);
    expect(t).toContain(5 * W + 5);
    expect(t).toContain(2 * W + 2);
    expect(t).not.toContain(12 * W + 12);
  });

  it("the same level: the ground at the clicked level joined to it", () => {
    const h = new Uint8Array(W * H).fill(3);
    for (let x = 0; x < W; x++) h[8 * W + x] = 5;
    const t = sameLevelTiles(h, W, H, 4, 4);
    expect(t.length).toBe(8 * W);
    expect(t).not.toContain(10 * W + 4);
  });

  it("adds, takes away, and says its size", () => {
    const s = new Selection(W, H);
    s.apply(rectTilesBetween([0, 0], [11, 7], W, H), "set");
    expect(sizeWords(s.size()!)).toBe("12 × 8 tiles");
    s.apply(rectTilesBetween([0, 0], [1, 1], W, H), "subtract");
    expect(sizeWords(s.size()!)).toBe("12 × 8 tiles (92)");
    s.apply(rectTilesBetween([15, 10], [15, 10], W, H), "add");
    expect(s.count).toBe(93);
    s.clear();
    expect(s.size()).toBeNull();
  });
});
