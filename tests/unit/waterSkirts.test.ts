// Water meets water with no window between (D154 as amended 2026-11-08, fallSlope.ts). A fall is the slope of the water
// below it, rising to meet the water above; where two tops' edges still part (a corner neighbour linked to one of them
// and not the other, or a neighbour not linked at all), the higher one hangs a skirt down to the lower one's height at
// each vertex, as the game's water vertex shader drops each tile's side skirt to its neighbour's. Before the skirts,
// the review of #867 counted 24 to 27 open edges at 256² (Canyon 3, Highlands 2) and 7 on Canyon 1 at 128², the cliff
// showing through each (and Canyon 2's narrow badwater fall at 128², tile 31,119, a pale sliver along its side).
//
// And the game's ceiling rule (`ProcessColumns`): a tile links a neighbour only where the neighbour's surface stands
// under its own ceiling, so a tunnel's water never rises into its roof toward higher open water outside.

import { describe, expect, it } from "vitest";
import { LAYERS, surfaceWater, waterFromDepth, type WaterView } from "../../src/render3d/model";
import { plainLayers, waterLayers } from "../../src/render3d/waterLayers";
import { meshed, openEdgesOn, openWaterEdges } from "../fixtures/openWaterEdges";

describe("no window between two waters", () => {
  it("a fall 10 → 5 with lower water beside its pool and dry ground beyond its top", () => {
    // 6 × 6: the upper water (x 0–2, y 0–2) on ground at 8 to 10; its pool (x 3–5, y 0–2) on ground at 3 to 5; lower
    // water (x 3–5, y 3–5) on ground at 1 to 2; dry ground at 11 beyond the top (x 0–2, y 3–5). The pool's corner tile
    // (3, 2) rises to 10 at its corner (3, 3) from the upper water across its west side; the lower water's tile (3, 3),
    // its corner neighbour (2, 2) not linked (dry ground at (2, 3) between), rises only to the pool's 5 there: a window
    // five levels tall, the pool's skirt closing it
    const W = 6;
    const H = 6;
    const heights = new Uint8Array(W * H);
    const depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (y < 3) [heights[i], depth[i]] = x < 3 ? [8, 2] : [3, 2];
        else [heights[i], depth[i]] = x < 3 ? [11, 0] : [1, 1];
      }
    const sw = surfaceWater(W, H, waterFromDepth(heights, depth, new Float32Array(W * H)));
    const layers = meshed(W, H, plainLayers(heights, sw));
    expect(openWaterEdges(W, H, layers)).toEqual([]);
    // the skirt: on the line y = 3 from (3, 3) at 10 down to the lower water's 5 there
    const m = layers[0].meshes[0];
    let skirt = false;
    for (let q = 0; q < m.quads; q++) {
      const p = (k: number, a: number) => m.positions[(q * 4 + k) * 3 + a];
      if (m.normals[q * 12 + 1] !== 0 || m.normals[q * 12 + 2] >= 0) continue;
      for (let k = 0; k < 4; k++) if (Math.abs(p(k, 0) - 3) < 1e-6 && Math.abs(p(k, 2) + 3) < 1e-6 && Math.abs(p(k, 1) - 10) < 1e-6) skirt ||= [0, 1, 2, 3].some((j) => Math.abs(p(j, 0) - 3) < 1e-6 && Math.abs(p(j, 1) - 5) < 1e-6);
    }
    expect(skirt, "the pool's skirt toward the lower water, from 10 down to 5 at (3, 3)").toBe(true);
  });

  // (the review's other maps, at 256² and Canyon 2 at 128², in waterSkirts.heavy.test.ts)
  it("canyon 128² seed 1: no open edge", () => expect(openEdgesOn("canyon", 128, 1)).toEqual([]));
});

describe("the ceiling rule", () => {
  it("a tunnel's water beside higher open water outside it stays flat under its roof", () => {
    // 8 × 3: a tunnel (x 0–3) through rock, its floor at 2 and its roof from 5 to 8, water standing in it to 4; outside
    // (x 4–7) open ground at 2, its water standing to 6, over the tunnel's ceiling. Without the rule the tunnel's last
    // tile rose to 6 at its mouth, a level into its roof
    const W = 8;
    const H = 3;
    const heights = new Uint8Array(W * H).fill(2);
    const columns = new Map<number, Uint8Array>();
    const tiles: number[] = [];
    const floor: number[] = [];
    const depth: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        tiles.push(i);
        floor.push(2);
        if (x < 4) {
          heights[i] = 8;
          columns.set(i, Uint8Array.from({ length: LAYERS }, (_, z) => (z < 2 || (z >= 5 && z < 8) ? 1 : 0)));
          depth.push(2);
        } else depth.push(4);
      }
    const view: WaterView = { count: tiles.length, tile: Int32Array.from(tiles), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: new Float32Array(tiles.length) };
    const sw = surfaceWater(W, H, view);
    const layers = waterLayers(W, H, heights, columns, view, sw);
    expect(layers.length, "the tunnel's water in a layer of its own").toBe(2);
    const tunnel = layers[1];
    expect(tunnel.sw.ceiling?.[3]).toBe(5);
    expect(tunnel.sw.surface[4], "the tunnel's layer sees the open water outside").toBe(6);
    const m = meshed(W, H, layers)[1].meshes[0];
    let top = -Infinity;
    for (let v = 0; v < m.quads * 4; v++) if (m.normals[v * 3 + 1] > 0 && m.positions[v * 3] <= 4 + 1e-6) top = Math.max(top, m.positions[v * 3 + 1]);
    expect(top, "the tunnel's top, flat at its water under its roof").toBeCloseTo(4, 5);
  });
});
