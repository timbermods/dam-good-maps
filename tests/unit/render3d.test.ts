// The 3D renderer's pure parts (EDITOR_PLAN §8): chunk meshing covers every tile top once and
// every exposed wall exactly, the voxel mesher faces only air, a dirty-chunk remesh equals a full
// remesh, water meshes follow the surface, and picking finds the tile under a ray.

import { describe, expect, it } from "vitest";
import { changedRect, chunkCount, CHUNK, dirtyChunks, meshChunk, type MeshData, type TerrainSource } from "../../src/render3d/mesh";
import { columnMap, entityView, surfaceWater, waterFromDepth, LAYERS } from "../../src/render3d/model";
import { pickHeightfield, pickPlane } from "../../src/render3d/pick";
import { lowerByTile, meshWaterChunk, changedWaterChunks } from "../../src/render3d/waterMesh";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHeights(W: number, H: number, seed: number): Uint8Array {
  const r = rng(seed);
  const h = new Uint8Array(W * H);
  // blocky terrain: patches of one height, so the greedy merge has work to do
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = Math.floor(((Math.floor(x / 5) * 7 + Math.floor(y / 4) * 3) % 9) + r() * 1.3);
  return h;
}

/** Areas of the faces of all chunks, by normal direction. */
function areas(src: TerrainSource): Record<string, number> {
  const { nx, ny } = chunkCount(src.W, src.H);
  const out: Record<string, number> = { top: 0, bottom: 0, east: 0, west: 0, north: 0, south: 0 };
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) addAreas(meshChunk(src, cx, cy), out);
  return out;
}

function addAreas(m: MeshData, out: Record<string, number>): void {
  for (let q = 0; q < m.quads; q++) {
    const p = m.positions.subarray(q * 12, q * 12 + 12);
    const n = m.normals.subarray(q * 12, q * 12 + 3);
    const xs = [p[0], p[3], p[6], p[9]];
    const ys = [p[1], p[4], p[7], p[10]];
    const zs = [p[2], p[5], p[8], p[11]];
    const span = (a: number[]) => Math.max(...a) - Math.min(...a);
    const key = n[1] > 0 ? "top" : n[1] < 0 ? "bottom" : n[0] > 0 ? "east" : n[0] < 0 ? "west" : n[2] < 0 ? "north" : "south";
    const area = n[1] !== 0 ? span(xs) * span(zs) : n[0] !== 0 ? span(ys) * span(zs) : span(xs) * span(ys);
    out[key] += area;
    // the quad's winding faces its normal: (b − a) × (c − a) points along n
    const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
    const e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    expect(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2]).toBeGreaterThan(0);
  }
}

function expectedWalls(W: number, H: number, h: Uint8Array): Record<string, number> {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : h[y * W + x]);
  const out = { east: 0, west: 0, north: 0, south: 0 };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = h[y * W + x];
      out.east += Math.max(0, v - at(x + 1, y));
      out.west += Math.max(0, v - at(x - 1, y));
      out.north += Math.max(0, v - at(x, y + 1));
      out.south += Math.max(0, v - at(x, y - 1));
    }
  return out;
}

describe("terrain meshing (32×32 chunks)", () => {
  it("covers every tile top once and every exposed wall exactly, winding outward", () => {
    for (const [W, H, seed] of [[64, 64, 1], [70, 45, 2], [96, 33, 3]]) {
      const heights = randomHeights(W, H, seed);
      const src: TerrainSource = { W, H, heights, columns: new Map() };
      const a = areas(src);
      expect(a.top).toBe(W * H);
      expect(a.bottom).toBe(0);
      const e = expectedWalls(W, H, heights);
      expect({ east: a.east, west: a.west, north: a.north, south: a.south }).toEqual(e);
    }
  });

  it("merges flat ground into one top face per chunk", () => {
    const W = 64;
    const src: TerrainSource = { W, H: W, heights: new Uint8Array(W * W).fill(3), columns: new Map() };
    let tops = 0;
    for (let cy = 0; cy < 2; cy++)
      for (let cx = 0; cx < 2; cx++) {
        const m = meshChunk(src, cx, cy);
        for (let q = 0; q < m.quads; q++) if (m.normals[q * 12 + 1] > 0) tops++;
        // one top face and one skirt wall on each of the chunk's two map-border sides
        expect(m.quads).toBe(3);
      }
    expect(tops).toBe(4);
  });

  it("meshes voxel columns (caves, overhangs) face by face against air only", () => {
    const W = 8;
    const H = 8;
    const heights = new Uint8Array(W * H).fill(4);
    const cave = new Uint8Array(LAYERS);
    // solid 0–1, air 2–3, solid 4–6: a cave with a roof, surface 7
    for (const z of [0, 1, 4, 5, 6]) cave[z] = 1;
    const i = 3 * W + 3;
    heights[i] = 7;
    const columns = new Map([[i, cave]]);
    const src: TerrainSource = { W, H, heights, columns };
    const a = areas(src);
    // tops: 63 plain tiles plus the column's two runs (at 2 and 7)
    expect(a.top).toBe(63 + 2);
    // one cave ceiling
    expect(a.bottom).toBe(1);
    // sides of the column: above the neighbours (4, 5, 6) on 4 sides; the cave's air (2, 3) shows
    // the neighbours' walls toward it: 2 levels on 4 sides
    const sides = a.east + a.west + a.north + a.south;
    const border = 4 * 8 * 4; // the map's skirt: 32 border tiles of height 4
    expect(sides).toBe(border + 3 * 4 + 2 * 4);
  });

  it("remeshing the dirty chunks equals meshing everything again", () => {
    const W = 100;
    const H = 70;
    const a = randomHeights(W, H, 9);
    const b = a.slice();
    for (let y = 30; y <= 33; y++) for (let x = 31; x <= 40; x++) b[y * W + x] = 12;
    const rect = changedRect(W, H, a, b)!;
    expect(rect).toEqual({ x0: 31, y0: 30, x1: 40, y1: 33 });
    const dirty = new Set(dirtyChunks(W, H, rect).map(([x, y]) => `${x},${y}`));
    const { nx, ny } = chunkCount(W, H);
    const srcA: TerrainSource = { W, H, heights: a, columns: new Map() };
    const srcB: TerrainSource = { W, H, heights: b, columns: new Map() };
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        if (dirty.has(`${cx},${cy}`)) continue;
        expect(Buffer.from(meshChunk(srcA, cx, cy).positions.buffer).equals(Buffer.from(meshChunk(srcB, cx, cy).positions.buffer)), `chunk ${cx},${cy}`).toBe(true);
      }
    // a change on a chunk edge also dirties the neighbour whose walls face it
    const edge = dirtyChunks(W, H, { x0: CHUNK, y0: 5, x1: CHUNK, y1: 5 }).map((c) => c.join(","));
    expect(edge).toEqual(["0,0", "1,0"]);
  });
});

describe("water meshing", () => {
  it("puts one quad per wet tile at its surface, with curtains toward lower neighbours", () => {
    const W = 6;
    const H = 1;
    const heights = new Uint8Array([5, 5, 3, 3, 3, 3]);
    const depth = [0.5, 0.5, 0.4, 0.4, 0, 0];
    const view = waterFromDepth(heights, depth, [0, 0, 0, 0.5, 0, 0]);
    expect(view.count).toBe(4);
    const sw = surfaceWater(W, H, view);
    expect(sw.surface[0]).toBeCloseTo(5.5);
    expect(Number.isNaN(sw.surface[4])).toBe(true);
    const m = meshWaterChunk(W, H, heights, sw, view, lowerByTile(sw, view), 0, 0);
    let tops = 0;
    let curtains = 0;
    for (let q = 0; q < m.quads; q++) (m.normals[q * 12 + 1] > 0 ? tops++ : curtains++);
    expect(tops).toBe(4);
    // tile 1 falls to tile 2 (5.5 → 3.4); tile 3 meets dry ground at 3; every tile at the map's
    // south and north edges and the west end has the outside below it
    expect(curtains).toBeGreaterThanOrEqual(2 + 4 * 2 + 1);
    // a change of one tile's water dirties its chunk only
    const view2 = waterFromDepth(heights, [0.5, 0.5, 0.4, 0.45, 0, 0], [0, 0, 0, 0.5, 0, 0]);
    expect([...changedWaterChunks(W, H, sw, surfaceWater(W, H, view2), 0, 0)]).toEqual(["0,0"]);
  });
});

describe("heightfield picking", () => {
  const W = 20;
  const H = 10;
  const heights = new Uint8Array(W * H).fill(2);
  heights[5 * W + 10] = 9; // a pillar at (10, 5)

  it("a ray straight down hits the tile below", () => {
    const hit = pickHeightfield({ origin: [3.5, 100, -(7 + 0.5)], direction: [0, -1, 0] }, W, H, heights)!;
    expect([hit.x, hit.y, hit.face]).toEqual([3, 7, "top"]);
    expect(hit.point[1]).toBe(2);
    const top = pickHeightfield({ origin: [10.5, 100, -5.5], direction: [0, -1, 0] }, W, H, heights)!;
    expect([top.x, top.y, top.point[1]]).toEqual([10, 5, 9]);
  });

  it("an oblique ray stops at a wall in its way", () => {
    // from the west, low, heading east along row 5: it meets the pillar's west wall
    const d = [1, -0.3, 0];
    const hit = pickHeightfield({ origin: [0.5, 6, -5.5], direction: d as [number, number, number] }, W, H, heights)!;
    expect([hit.x, hit.y, hit.face]).toEqual([10, 5, "side"]);
    // the same ray one row north passes the pillar and lands on the ground further east
    const past = pickHeightfield({ origin: [0.5, 6, -6.5], direction: d as [number, number, number] }, W, H, heights)!;
    expect(past.y).toBe(6);
    expect(past.x).toBeGreaterThan(10);
    expect(past.face).toBe("top");
  });

  it("misses off the map, and picks on a level plane", () => {
    expect(pickHeightfield({ origin: [-5, 10, 5], direction: [0, -1, 0] }, W, H, heights)).toBeNull();
    expect(pickPlane({ origin: [4.2, 10, -3.7], direction: [0, -1, 0] }, 2)).toMatchObject({ x: 4, y: 3 });
  });
});

describe("the map view", () => {
  it("packs entities into tables and flags", () => {
    const v = entityView([
      { template: "Pine", x: 1, y: 2, z: 3, orientation: "Cw0", owner: "f-a" },
      { template: "Pine", x: 4, y: 5, z: 3, orientation: "Cw180", owner: "f-a", dead: true },
      { template: "Slope", x: 6, y: 7, z: 2, orientation: "Cw270", owner: "derived" },
    ]);
    expect(v.count).toBe(3);
    expect(v.templates).toEqual(["Pine", "Slope"]);
    expect(v.owners).toEqual(["f-a", "derived"]);
    expect([...v.orientation]).toEqual([0, 2, 3]);
    expect([...v.flags]).toEqual([0, 1, 0]);
  });

  it("maps voxel columns by tile", () => {
    const voxels = new Uint8Array(2 * LAYERS);
    voxels[LAYERS + 4] = 1;
    const m = columnMap({ tiles: new Int32Array([7, 9]), voxels });
    expect(m.get(9)![4]).toBe(1);
    expect(m.get(7)![4]).toBe(0);
  });
});

describe("live editing: the light is redone round a change only", () => {
  it("the sky, and the shadows of both suns, redone round changed tiles equal a whole bake", async () => {
    const { skyVisibility, skyVisibilityRect, shadowMap, shadowPairRect, objectCasters, SKY_REACH } = await import("../../src/render3d/light");
    const W = 60;
    const H = 50;
    const heights = new Uint8Array(W * H);
    let s = 7;
    const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < heights.length; i++) heights[i] = 2 + Math.floor(rand() * 5);
    const tops = { hi: new Float32Array(0), lo: new Float32Array(0) };
    const bytes = shadowMap(W, H, heights, null, tops);
    const sky = skyVisibility(W, H, heights);
    // a tall mound in the middle, and a pit near the north-west corner
    const changes: [number, number, number, number][] = [[20, 18, 27, 25], [2, 44, 4, 47]];
    for (const [x0, y0, x1, y1] of changes) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) heights[y * W + x] = x0 === 2 ? 0 : 16;
      skyVisibilityRect(W, H, heights, sky, x0 - SKY_REACH, y0 - SKY_REACH, x1 + SKY_REACH, y1 + SKY_REACH);
      shadowPairRect(tops, bytes, W, H, heights, null, x0, y0, x1, y1);
    }
    expect(Array.from(sky)).toEqual(Array.from(skyVisibility(W, H, heights)));
    expect(Array.from(bytes)).toEqual(Array.from(shadowMap(W, H, heights, null)));
    void objectCasters;
  });
});
