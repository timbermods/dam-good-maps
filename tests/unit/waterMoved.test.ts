// Moving water is drawn again only where it moved (renderer.updateWaterSoon, waterMesh.ts `waterMovedChunks`):
// against what each chunk was drawn with, a visible difference (wet or dry, or more than MOVED_WATER), reaching
// six tiles past it; with no tolerance, any difference at all (the water put in place is drawn exactly).

import { describe, expect, it } from "vitest";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { drawnWater, drewChunk, MOVED_WATER, waterMovedChunks } from "../../src/render3d/waterMesh";

const W = 96;
const H = 64;
/** A flat map with water `d` deep on the tiles `wet` says. */
function water(d: (x: number, y: number) => number) {
  const heights = new Uint8Array(W * H).fill(4);
  const depth = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = d(x, y);
  return surfaceWater(W, H, waterFromDepth(heights, depth, new Float64Array(W * H)));
}
/** What is drawn when every chunk was drawn on `sw`. */
function drawnOn(sw: ReturnType<typeof water>) {
  const drawn = drawnWater(W * H);
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 3; cx++) drewChunk(W, H, drawn, sw, cx, cy);
  return drawn;
}

describe("moving water drawn again where it moved", () => {
  it("nothing when it is what was drawn; a change under the tolerance only when none is allowed", () => {
    const a = water((x) => (x < 40 ? 0.5 : 0));
    expect(waterMovedChunks(W, H, drawnOn(a), a, MOVED_WATER).size).toBe(0);
    const b = water((x) => (x < 40 ? 0.5 + MOVED_WATER.level / 2 : 0));
    expect(waterMovedChunks(W, H, drawnOn(a), b, MOVED_WATER).size).toBe(0);
    expect([...waterMovedChunks(W, H, drawnOn(a), b, { level: 0, share: 0 })].sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });

  it("a tile turning wet counts however thin, and so do the chunks within six tiles of it", () => {
    const a = water(() => 0);
    const b = water((x, y) => (x === 30 && y === 10 ? 0.002 : 0));
    // (tile 30 is two from chunk 1's edge at 32: both chunks; row 10 is far from row 32)
    expect([...waterMovedChunks(W, H, drawnOn(a), b, MOVED_WATER)].sort()).toEqual(["0,0", "1,0"]);
  });

  it("small changes that each stay under the tolerance still add up against what is drawn", () => {
    const a = water((x) => (x < 20 ? 0.5 : 0));
    const drawn = drawnOn(a);
    // three updates of a little each: the drawn chunk is compared with what it shows, not the last update
    const later = water((x) => (x < 20 ? 0.5 + 3 * (MOVED_WATER.level * 0.6) : 0));
    expect(waterMovedChunks(W, H, drawn, later, MOVED_WATER).has("0,0")).toBe(true);
  });
});
