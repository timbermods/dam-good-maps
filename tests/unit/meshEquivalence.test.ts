// The one mesher for runs (3D view, part 1; ROADMAP "Terrain above terrain", step 2): on every map
// without terrain above terrain it gives the same mesh as the heightfield mesher it replaced (kept as
// tests/fixtures/heightfieldMesher.ts), positions, normals and indices byte for byte, chunk by chunk,
// mine sites' pits included; on hand-made terrains with undersides (an overhang, a cave, a bridge, a
// floating run, and random caves across chunk edges) every exposed face is drawn exactly once, none
// between two solid voxels, each winding outward, undersides facing down.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { mineCutout } from "../../src/render3d/entities3d";
import { chunkCount, meshChunk, type MeshData, type TerrainSource } from "../../src/render3d/mesh";
import { entityView, LAYERS } from "../../src/render3d/model";
import { meshChunk as heightfieldChunk } from "../fixtures/heightfieldMesher";

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

describe("the mesher on maps without terrain above terrain", () => {
  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 1],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 256, 7],
  ];
  it.each(maps)("%s %i² seed %i: the same quads as the heightfield mesher", (theme, size, seed) => {
    const b = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const { W, H, heights } = b;
    const entities = entityView(b.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, owner: e.owner })));
    const src: TerrainSource = { W, H, heights, columns: new Map(), cutout: mineCutout(entities, W, H) };
    expect(src.cutout!.size, "a mine site's pit is in the comparison").toBeGreaterThan(0);
    const { nx, ny } = chunkCount(W, H);
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        const a = heightfieldChunk(src, cx, cy);
        const n = meshChunk(src, cx, cy);
        expect(n.quads, `chunk ${cx},${cy}`).toBe(a.quads);
        expect(bytes(n.positions).equals(bytes(a.positions)), `positions, chunk ${cx},${cy}`).toBe(true);
        expect(bytes(n.normals).equals(bytes(a.normals)), `normals, chunk ${cx},${cy}`).toBe(true);
        expect(bytes(n.indices).equals(bytes(a.indices)), `indices, chunk ${cx},${cy}`).toBe(true);
      }
  });
});

// ---- terrains with undersides ----

/** A terrain from a solid(x, y, z) rule: heights the top surface, a column for every tile that is not
 *  one solid run from z = 0 (as the worker sends them). */
function terrain(W: number, H: number, solid: (x: number, y: number, z: number) => boolean): TerrainSource {
  const heights = new Uint8Array(W * H);
  const columns = new Map<number, Uint8Array>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = new Uint8Array(LAYERS);
      let top = 0;
      for (let z = 0; z < LAYERS; z++) if (solid(x, y, z)) (c[z] = 1), (top = z + 1);
      heights[y * W + x] = top;
      if (c.subarray(0, top).some((v) => !v)) columns.set(y * W + x, c);
    }
  return { W, H, heights, columns };
}

/** Faces of one voxel's size, keyed "direction x y z" (the voxel the face belongs to). */
function expectedFaces(src: TerrainSource): Set<string> {
  const { W, H, heights, columns } = src;
  const solid = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || z < 0 || z >= LAYERS) return false;
    const c = columns.get(y * W + x);
    return c ? c[z] === 1 : z < heights[y * W + x];
  };
  const out = new Set<string>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // the map's floor under a column with air at its bottom
      if (!solid(x, y, 0)) out.add(`top ${x} ${y} -1`);
      for (let z = 0; z < LAYERS; z++) {
        if (!solid(x, y, z)) continue;
        if (!solid(x, y, z + 1)) out.add(`top ${x} ${y} ${z}`);
        if (z > 0 && !solid(x, y, z - 1)) out.add(`bottom ${x} ${y} ${z}`);
        if (!solid(x + 1, y, z)) out.add(`east ${x} ${y} ${z}`);
        if (!solid(x - 1, y, z)) out.add(`west ${x} ${y} ${z}`);
        if (!solid(x, y + 1, z)) out.add(`north ${x} ${y} ${z}`);
        if (!solid(x, y - 1, z)) out.add(`south ${x} ${y} ${z}`);
      }
    }
  return out;
}

/** The mesh's quads cut into faces of one voxel's size, counted; each quad checked to wind outward. */
function drawnFaces(m: MeshData, into: Map<string, number>): void {
  for (let q = 0; q < m.quads; q++) {
    const p = m.positions.subarray(q * 12, q * 12 + 12);
    const n = m.normals.subarray(q * 12, q * 12 + 3);
    const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
    const e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    expect(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2], "winds toward its normal").toBeGreaterThan(0);
    // tile space: x = X, y = −Z, z = Y
    const xs = [p[0], p[3], p[6], p[9]];
    const ys = [-p[2], -p[5], -p[8], -p[11]];
    const zs = [p[1], p[4], p[7], p[10]];
    const [xa, xb, ya, yb, za, zb] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    const add = (k: string) => into.set(k, (into.get(k) ?? 0) + 1);
    if (n[1] !== 0) {
      // a top at level za belongs to voxel za − 1; an underside at za to voxel za
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) add(n[1] > 0 ? `top ${x} ${y} ${za - 1}` : `bottom ${x} ${y} ${za}`);
    } else if (n[0] !== 0) {
      for (let z = za; z < zb; z++) for (let y = ya; y < yb; y++) add(n[0] > 0 ? `east ${xa - 1} ${y} ${z}` : `west ${xa} ${y} ${z}`);
    } else {
      for (let z = za; z < zb; z++) for (let x = xa; x < xb; x++) add(n[2] < 0 ? `north ${x} ${ya - 1} ${z}` : `south ${x} ${ya} ${z}`);
    }
  }
}

function expectExact(src: TerrainSource): number {
  const drawn = new Map<string, number>();
  const { nx, ny } = chunkCount(src.W, src.H);
  let quads = 0;
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const m = meshChunk(src, cx, cy);
      quads += m.quads;
      drawnFaces(m, drawn);
    }
  const want = expectedFaces(src);
  const twice = [...drawn].filter(([, c]) => c > 1).map(([k]) => k);
  const extra = [...drawn.keys()].filter((k) => !want.has(k));
  const missing = [...want].filter((k) => !drawn.has(k));
  expect(twice, "faces drawn more than once").toEqual([]);
  expect(extra, "faces between solid voxels").toEqual([]);
  expect(missing, "exposed faces not drawn").toEqual([]);
  return quads;
}

describe("the mesher on runs with undersides", () => {
  const W = 12;
  const H = 10;
  const ground = (z: number) => z < 3;

  it("an overhang: a shelf of rock over open ground, its roof facing down", () => {
    const src = terrain(W, H, (x, y, z) => ground(z) || (x >= 6 && z < 8) || (x >= 3 && x < 6 && y >= 2 && y < 8 && z >= 6 && z < 8));
    expect(src.columns.size).toBe(18);
    expectExact(src);
    // the shelf's underside: one rectangle 3 × 6 at level 6, facing down
    const roofs: number[][] = [];
    const m = meshChunk(src, 0, 0);
    for (let q = 0; q < m.quads; q++) if (m.normals[q * 12 + 1] < 0) roofs.push(Array.from(m.positions.subarray(q * 12, q * 12 + 12)));
    expect(roofs).toHaveLength(1);
    expect(new Set(roofs[0].filter((_, k) => k % 3 === 1))).toEqual(new Set([6]));
  });

  it("a cave: a chamber under a hill, open at one side", () => {
    expectExact(terrain(W, H, (x, y, z) => ground(z) || (x >= 2 && x < 10 && y >= 2 && y < 8 && z < 9 && !(x >= 3 && y >= 4 && y < 6 && z >= 3 && z < 6))));
  });

  it("a bridge: an arch over a gorge", () => {
    expectExact(terrain(W, H, (x, y, z) => z < 1 || ((x < 4 || x >= 8) && z < 7) || (y >= 4 && y < 6 && z >= 5 && z < 7)));
  });

  it("a floating run, and a column with air at its bottom (the map's floor drawn under it)", () => {
    expectExact(terrain(W, H, (x, y, z) => ground(z) || (x === 5 && y === 5 && z >= 7 && z < 9)));
    expectExact(terrain(W, H, (x, y, z) => (x === 4 && y === 4 ? z >= 2 && z < 5 : ground(z))));
  });

  it("random caves across chunk edges", () => {
    let s = 7;
    const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const W2 = 70;
    const H2 = 45;
    const holes = new Set<string>();
    for (let k = 0; k < 900; k++) holes.add(`${Math.floor(r() * W2)} ${Math.floor(r() * H2)} ${1 + Math.floor(r() * 10)}`);
    const tall = (x: number, y: number) => 6 + ((x * 7 + y * 3) % 6);
    expectExact(terrain(W2, H2, (x, y, z) => z < tall(x, y) && !holes.has(`${x} ${y} ${z}`)));
  });

  it("a cave's walls merge along its edge, not voxel by voxel", () => {
    // a tunnel 8 long under a ridge: its two side walls are one quad each
    const src = terrain(W, H, (x, y, z) => ground(z) || (z < 7 && !(y === 5 && x >= 2 && x < 10 && z >= 3 && z < 5)));
    const quads = expectExact(src);
    // faces of one voxel's size would be 8 × 2 per wall side, 32 for the tunnel's walls alone
    expect(quads).toBeLessThan(30);
  });
});
