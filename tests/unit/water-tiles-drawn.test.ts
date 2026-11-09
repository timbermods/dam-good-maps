// The terrain's tile data reads its water from the water as drawn (waterMesh.ts `DrawnWater`), never from newer water
// still with the mesh workers: the terrain draws a tile's bed as under water (soil.w) only where water is drawn over
// it, so spreading water never shows a bare grey band ahead of its mesh (renderer.ts `drawWater`, `bakeTiles`).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tileData } from "../../src/render3d/light";
import { CHUNK } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { drawnWater, drewChunk } from "../../src/render3d/waterMesh";

const W = 2 * CHUNK;
const H = CHUNK;
const heights = new Uint8Array(W * H).fill(4);
/** A flat map with water `d` deep on the tiles `d` says. */
function water(d: (x: number) => number) {
  const depth = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = d(x);
  return surfaceWater(W, H, waterFromDepth(heights, depth, new Float64Array(W * H)));
}
const wetBytes = (t: Uint8Array, x0: number, x1: number) => {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (t[(y * W + x) * 4 + 3] > 0) n++;
  return n;
};

describe("the tile data's water is the water drawn", () => {
  it("a chunk whose new mesh is still on its way keeps the bed of the water drawn over it", () => {
    // the batch sent: water on the first chunk's left half; the newest: spread across both chunks
    const sent = water((x) => (x < CHUNK / 2 ? 0.4 : 0));
    const newest = water((x) => (x < CHUNK + 8 ? 0.4 : 0));
    const drawn = drawnWater(W * H);
    // both chunks first drawn on the sent water, then the first chunk's newer mesh comes, the second's not yet
    drewChunk(W, H, drawn, sent, 0, 0);
    drewChunk(W, H, drawn, sent, 1, 0);
    drewChunk(W, H, drawn, newest, 0, 0);
    const t = tileData(W, H, heights, null, drawn);
    // the first chunk's bed under its new water, every tile of it; the second's dry, as the water drawn over it is
    expect(wetBytes(t, 0, CHUNK - 1)).toBe(CHUNK * H);
    expect(wetBytes(t, CHUNK, W - 1)).toBe(0);
    // and where the water drawn is the newest, the same bytes as the newest water's
    const same = tileData(W, H, heights, null, newest);
    for (let y = 0; y < H; y++) for (let x = 0; x < CHUNK; x++) expect(t[(y * W + x) * 4 + 3]).toBe(same[(y * W + x) * 4 + 3]);
  });

  it("water in a cave under a top stays out of the top's bytes when drawn (the floor goes with it)", () => {
    const sw = water((x) => (x < 4 ? 0.5 : 0));
    // (the first tile's water stands on a floor below its top)
    const cave = { ...sw, floor: sw.floor.slice() };
    cave.floor[0] = heights[0] - 2;
    const drawn = drawnWater(W * H);
    drewChunk(W, H, drawn, cave, 0, 0);
    expect(tileData(W, H, heights, null, drawn)[3]).toBe(0);
    expect(tileData(W, H, heights, null, drawn)[7]).toBe(tileData(W, H, heights, null, cave)[7]);
  });

  it("the renderer writes the tile data only from the water drawn, past the map's first bake", () => {
    const src = readFileSync(new URL("../../src/render3d/renderer.ts", import.meta.url), "utf8");
    const writes = src.match(/tileData(?:Rect|Changes)?\([^;]*\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(4);
    for (const w of writes) {
      if (w.startsWith("tileData(W, H, heights, soil, surface)")) continue;
      expect(w).toContain("this.waterShown");
    }
  });
});
