// A water or soil update rewrites only the tiles whose tile data changed (renderer.ts `bakeTiles`): after any series of
// water and soil changes, the tile data kept up that way, and the contamination outline redone round the changes, are
// byte for byte what baking the whole map gives.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { contaminationEdges, contaminationEdgesRect, redoContaminationEdges } from "../../src/render3d/materials";
import { tileData, tileDataChanges, tileDataRect } from "../../src/render3d/light";
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
      let soil: SoilView | null = null;
      let sw: SurfaceWater | null = null;
      const tiles = tileData(W, H, heights, soil, sw);
      const edges = contaminationEdges(W, H, tiles);
      let touched = 0;
      for (let step = 0; step < 40; step++) {
        const kind = step % 4;
        // a new water of random reach (or none), new soil, a nudge to a few tiles of the soil, or both
        if (kind === 0 || kind === 3) sw = rnd() < 0.1 ? null : surfaceWater(W, H, randomWater(heights, rnd() * 0.5));
        if (kind === 1 || kind === 3) soil = rnd() < 0.1 ? null : randomSoil(N, rnd() * 0.6);
        if (kind === 2 && soil) soil = nudged(soil, 1 + Math.floor(rnd() * 40));
        const c = tileDataChanges(W, H, heights, soil, sw, tiles);
        redoContaminationEdges(W, H, tiles, edges, c.edgeRows);
        touched += c.rows.reduce((a, r) => a + r.x1 - r.x0 + 1, 0);
        expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, heights, soil, sw))), `tile data, step ${step}`).toBe(true);
        expect(Buffer.from(edges).equals(Buffer.from(contaminationEdges(W, H, tiles))), `outline, step ${step}`).toBe(true);
        // nothing changed since: nothing to rewrite
        expect(tileDataChanges(W, H, heights, soil, sw, tiles)).toEqual({ rows: [], edgeRows: [] });
      }
      expect(touched).toBeGreaterThan(0);
    });
  }

  it("tile data rewritten in place over a box (a water chunk drawn anew, a stroke's rows), then a whole compare: the outline is still a whole bake's", () => {
    // (renderer.ts `waterTiles` and `flushTerrain` write the new water's tile data over a box at once; the compare after it then
    // finds those tiles current, so the outline round the box is redone with them, `edgesAround`: one more tile all round)
    seed = 23;
    const { W, H, heights } = generate(makeSpec({ seed: 23, theme: "riverValley", size: { x: 96, y: 96 } })).built;
    let soil: SoilView | null = randomSoil(W * H, 0.4);
    let sw: SurfaceWater | null = surfaceWater(W, H, randomWater(heights, 0.2));
    const tiles = tileData(W, H, heights, soil, sw);
    const edges = contaminationEdges(W, H, tiles);
    for (let step = 0; step < 40; step++) {
      sw = surfaceWater(W, H, randomWater(heights, rnd() * 0.5));
      if (step % 5 === 0) soil = randomSoil(W * H, rnd() * 0.6);
      // a few boxes written in place, as a stroke's water chunks are, each with the outline round it
      for (let k = Math.floor(rnd() * 4); k > 0; k--) {
        const x0 = Math.floor(rnd() * W) - 1;
        const y0 = Math.floor(rnd() * H) - 1;
        const x1 = x0 + 1 + Math.floor(rnd() * 17);
        const y1 = y0 + 1 + Math.floor(rnd() * 17);
        tileDataRect(W, H, heights, soil, sw, tiles, x0, y0, x1, y1);
        contaminationEdgesRect(W, H, tiles, edges, x0 - 1, y0 - 1, x1 + 1, y1 + 1);
      }
      const c = tileDataChanges(W, H, heights, soil, sw, tiles);
      redoContaminationEdges(W, H, tiles, edges, c.edgeRows);
      expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, heights, soil, sw))), `tile data, step ${step}`).toBe(true);
      expect(Buffer.from(edges).equals(Buffer.from(contaminationEdges(W, H, tiles))), `outline, step ${step}`).toBe(true);
    }
  });

  it("a few tiles' water: at most their rows are named, and the bytes still equal a whole bake", () => {
    seed = 5;
    const { W, H, heights } = generate(makeSpec({ seed: 5, theme: "riverValley", size: { x: 96, y: 96 } })).built;
    const base = randomWater(heights, 0.2);
    const sw0 = surfaceWater(W, H, base);
    const tiles = tileData(W, H, heights, null, sw0);
    // the same water with the depth of three tiles changed
    const depth = base.depth.slice();
    for (const k of [7, 100, 300]) depth[k] += 0.5;
    const sw1 = surfaceWater(W, H, { ...base, depth });
    const c = tileDataChanges(W, H, heights, null, sw1, tiles);
    expect(c.rows.length).toBeLessThanOrEqual(3);
    expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, heights, null, sw1)))).toBe(true);
  });
});
