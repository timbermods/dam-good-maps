// A water or soil update rewrites only the tiles whose tile data changed (renderer.ts `bakeTiles`): after any series of
// water and soil changes, the tile data kept up that way, and the contamination outline redone round the changes, are
// byte for byte what baking the whole map gives.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { contaminationEdges, redoContaminationEdges } from "../../src/render3d/materials";
import { skyVisibility, tileData, tileDataChanges } from "../../src/render3d/light";
import { surfaceWater, type SoilView, type SurfaceWater, type WaterView } from "../../src/render3d/model";

let seed = 11;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A water view of random columns: mostly standing on the tile's top, some deeper (water in a cave under the top, which the
 *  tile data leaves off) and a few tiles with a second, lower column. */
function randomWater(heights: Uint8Array, share: number): WaterView {
  const tile: number[] = [];
  const floor: number[] = [];
  const depth: number[] = [];
  const contamination: number[] = [];
  for (let i = 0; i < heights.length; i++) {
    if (rnd() >= share) continue;
    const deep = rnd() < 0.1;
    tile.push(i);
    floor.push(deep ? Math.max(0, heights[i] - 2 - Math.floor(rnd() * 3)) : heights[i]);
    depth.push(0.05 + rnd() * 3);
    contamination.push(rnd() < 0.2 ? rnd() : 0);
    if (rnd() < 0.05) {
      tile.push(i);
      floor.push(Math.max(0, heights[i] - 4));
      depth.push(1);
      contamination.push(0);
    }
  }
  return {
    count: tile.length,
    tile: Int32Array.from(tile),
    floor: Float32Array.from(floor),
    depth: Float32Array.from(depth),
    contamination: Float32Array.from(contamination),
  };
}

function randomSoil(n: number, share: number): SoilView {
  const moisture = new Uint8Array(n);
  const contamination = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rnd() < share) moisture[i] = 1 + Math.floor(rnd() * 254);
    if (rnd() < share / 4) contamination[i] = 1 + Math.floor(rnd() * 254);
  }
  return { moisture, contamination };
}

/** `soil` with a few tiles' moisture and contamination changed (the moisture array reused in place, as a soil that grows is). */
function nudged(soil: SoilView, n: number): SoilView {
  const moisture = soil.moisture;
  const contamination = soil.contamination.slice();
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rnd() * moisture.length);
    moisture[i] = rnd() < 0.3 ? 0 : Math.floor(rnd() * 255);
    contamination[i] = rnd() < 0.5 ? 0 : Math.floor(rnd() * 255);
  }
  return { moisture, contamination };
}

describe("tile data kept up to the water and soil by the tiles that changed", () => {
  for (const [theme, size, s] of [["riverValley", 128, 3], ["lakeBasin", 96, 9]] as const) {
    it(`${theme} ${size}²: after each of 40 random water and soil changes, every byte equals a whole bake`, () => {
      seed = s;
      const { W, H, heights } = generate(makeSpec({ seed: s, theme, size: { x: size, y: size } })).built;
      const N = W * H;
      const sky = skyVisibility(W, H, heights);
      let soil: SoilView | null = null;
      let sw: SurfaceWater | null = null;
      const tiles = tileData(W, H, heights, sky, soil, sw);
      const edges = contaminationEdges(W, H, tiles);
      let touched = 0;
      for (let step = 0; step < 40; step++) {
        const kind = step % 4;
        // a new water of random reach (or none), new soil, a nudge to a few tiles of the soil, or both
        if (kind === 0 || kind === 3) sw = rnd() < 0.1 ? null : surfaceWater(W, H, randomWater(heights, rnd() * 0.5));
        if (kind === 1 || kind === 3) soil = rnd() < 0.1 ? null : randomSoil(N, rnd() * 0.6);
        if (kind === 2 && soil) soil = nudged(soil, 1 + Math.floor(rnd() * 40));
        const c = tileDataChanges(W, H, heights, sky, soil, sw, tiles);
        redoContaminationEdges(W, H, tiles, edges, c.edgeRows);
        touched += c.rows.reduce((a, r) => a + r.x1 - r.x0 + 1, 0);
        expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, heights, sky, soil, sw))), `tile data, step ${step}`).toBe(true);
        expect(Buffer.from(edges).equals(Buffer.from(contaminationEdges(W, H, tiles))), `outline, step ${step}`).toBe(true);
        // nothing changed since: nothing to rewrite
        expect(tileDataChanges(W, H, heights, sky, soil, sw, tiles)).toEqual({ rows: [], edgeRows: [] });
      }
      expect(touched).toBeGreaterThan(0);
    });
  }

  it("a few tiles' water: at most their rows are named, and the bytes still equal a whole bake", () => {
    seed = 5;
    const { W, H, heights } = generate(makeSpec({ seed: 5, theme: "riverValley", size: { x: 96, y: 96 } })).built;
    const sky = skyVisibility(W, H, heights);
    const base = randomWater(heights, 0.2);
    const sw0 = surfaceWater(W, H, base);
    const tiles = tileData(W, H, heights, sky, null, sw0);
    // the same water with the depth of three tiles changed
    const depth = base.depth.slice();
    for (const k of [7, 100, 300]) depth[k] += 0.5;
    const sw1 = surfaceWater(W, H, { ...base, depth });
    const c = tileDataChanges(W, H, heights, sky, null, sw1, tiles);
    expect(c.rows.length).toBeLessThanOrEqual(3);
    expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, heights, sky, null, sw1)))).toBe(true);
  });
});
