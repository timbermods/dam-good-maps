// A stuck basin's way out worn wider (PLAN §20 D350 (b)): the smallest local cut, as if water wore it.
import { describe, expect, it } from "vitest";
import { cutShape, cutShapeOk, risenBasin, wearOutlet } from "../../src/core/water/outletWear";

const W = 64;
const H = 64;

/** Ground at 8, a round basin (floor 4) holding water at 6.5, its only way out a one-tile channel at
 *  level 6 running east to the map's edge: the basin stands half a level over its spill level. */
function scene() {
  const h = new Uint8Array(W * H).fill(8);
  const depth = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((x - 24) ** 2 + (y - 32) ** 2 <= 15 * 15) {
        h[i] = 4;
        depth[i] = 2.5;
      }
    }
  for (let x = 39; x < W; x++) h[32 * W + x] = 6;
  return { h, depth };
}

describe("a basin's way out worn wider (D350 (b))", () => {
  it("finds the basin standing over its spill level", () => {
    const { h, depth } = scene();
    const b = risenBasin(h, W, H, depth)!;
    expect(b.level).toBe(6);
    expect(b.tiles.length).toBeGreaterThan(600);
  });

  it("widens the way out with stepped banks, its width changing smoothly, its sill short, and the basin keeps its level", () => {
    const { h, depth } = scene();
    const keep = new Uint8Array(W * H);
    keep[30 * W + 50] = 1;
    const w = wearOutlet(h, W, H, depth, { seed: 7, width: 7, keep })!;
    expect(w).not.toBeNull();
    expect(w.level).toBe(6);
    // at the basin's level within two tiles of it (the sill), a level under it past the shore (a
    // short sill: a long flat at the basin's level would hold its water up), never lower; only ever
    // lower than the ground was, never on what it keeps; the banks step back up a level a tile (a
    // worn slope, no wall)
    const basin = new Set(w.basin);
    const nearBasin = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (basin.has((y + dy) * W + x + dx)) return true;
      return false;
    };
    for (const i of w.cut) {
      expect(w.heights[i]).toBeGreaterThanOrEqual(nearBasin(i) ? 6 : 5);
      expect(w.heights[i]).toBeLessThan(h[i]);
      expect(keep[i]).toBe(0);
    }
    expect(w.cut.some((i) => w.heights[i] === 7)).toBe(true);
    // wider than the channel was, and a width that wanders (no straight notch)
    const widths: number[] = [];
    for (let x = 44; x < W - 2; x++) {
      let n = 0;
      for (let y = 0; y < H; y++) if (w.heights[y * W + x] === 5) n++;
      widths.push(n);
    }
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(3);
    // (a width that changes smoothly along the way, never tile by tile)
    expect(new Set(widths).size).toBeGreaterThan(1);
    for (let k = 1; k < widths.length; k++) expect(Math.abs(widths[k] - widths[k - 1])).toBeLessThanOrEqual(2);
    // the basin still spills at 6: nothing within two tiles of it went under its level
    const b2 = risenBasin(w.heights, W, H, depth);
    expect(b2?.level).toBe(6);
  });

  it("is one shape along the water's way out: no stray tiles, nothing off to its side (D360 (3))", () => {
    const { h, depth } = scene();
    for (const width of [7, 9, 17]) {
      const w = wearOutlet(h, W, H, depth, { seed: 11, width })!;
      expect(w).not.toBeNull();
      expect(cutShapeOk(cutShape(w.cut, w.route, W, H, width))).toBe(true);
    }
  });

  it("the check refuses the cut Lake Basin 128² seed 8 had (a blob and fragments beside it, captured 2026-09-30)", () => {
    // the capture's third panel (investigation/m9b/worn-way-out-lakeBasin-8-128.png before D360),
    // tile by tile: '#' the cut
    const rows = [
      ".................#.....#...##.......",
      "................###........#........",
      ".................###..#....##.......",
      ".................##.........#.......",
      "................#########...#.......",
      "..............#######.......#.......",
      "..............######.......#........",
      "..............######................",
      "..................#.................",
    ];
    const CW = rows[0].length;
    const cut: number[] = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => c === "#" && cut.push(y * CW + x)));
    const s = cutShape(cut, [], CW, rows.length);
    expect(s.regions).toBeGreaterThan(1);
    expect(s.strays).toBeGreaterThan(0);
    expect(cutShapeOk(s)).toBe(false);
  });

  it("does nothing where no basin stands over its spill level", () => {
    const { h } = scene();
    expect(wearOutlet(h, W, H, new Float64Array(W * H), { seed: 1, width: 7 })).toBeNull();
  });
});
