// The map's shape (D357, custom map sizes part 2; src/core/land/shape.ts, orient.ts): a long map's water runs its
// length, its start leans where its theme wants it, and every orientation keeps a map that is not square on the map.

import { describe, expect, it } from "vitest";
import { drawGenome } from "../../src/core/land/genome";
import { orientXY } from "../../src/core/land/orient";
import { alongLongAxis, mapShape, startAlong } from "../../src/core/land/shape";
import { DIRS8 } from "../../src/core/land/num";

describe("the map's shape", () => {
  it("every orientation a map that is not square takes keeps each tile on the map", () => {
    for (const [W, H] of [[256, 128], [64, 256], [100, 60]])
      for (const o of [0, 2, 4, 6])
        for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [17, 9]]) {
          const [px, py] = orientXY(x, y, W, H, o);
          expect(px >= 0 && px < W && py >= 0 && py < H, `${W}×${H} o${o} (${x}, ${y}) → (${px}, ${py})`).toBe(true);
        }
  });

  it("a long map's flow runs along its length, whatever was drawn", () => {
    expect(mapShape(128, 128).long).toBe(false);
    expect(mapShape(160, 200).long).toBe(false);
    expect(mapShape(200, 129).long).toBe(true);
    for (let d = 0; d < 8; d++) {
      expect(DIRS8[alongLongAxis(d, 256, 128)][1]).toBe(0);
      expect(DIRS8[alongLongAxis(d, 64, 256)][0]).toBe(0);
    }
    for (let seed = 1; seed <= 6; seed++) expect(DIRS8[drawGenome("riverValley", seed, 64, 256, 0).flowDir][0]).toBe(0);
  });

  it("a long map's start leans to an end or the middle by its theme, and a square one's not at all", () => {
    expect(startAlong("riverValley", 128, 64, 256, 128)).toBeGreaterThan(0.95);
    expect(startAlong("riverValley", 10, 64, 256, 128)).toBe(0);
    expect(startAlong("canyon", 10, 64, 256, 128)).toBeGreaterThan(0.8);
    expect(startAlong("canyon", 128, 64, 256, 128)).toBe(0);
    expect(startAlong("canyon", 10, 64, 128, 128)).toBe(0);
  });
});
