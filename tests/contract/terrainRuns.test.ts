// Terrain as runs per tile (D119, src/core/terrain/runs.ts): the in-memory terrain is a voxel mask
// per tile with its surface, runs and voxels derived from it. A map of plain tiles is the heightfield
// it always was, byte for byte; a cave, an overhang or floating ground is kept exactly through the
// stored base and a build's new surface.

import { describe, expect, it } from "vitest";
import { baseFromFile, baseTerrain, fileFromBase } from "../../src/core/doc/base";
import type { TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, encodeWorld, GAME_VERSION, LAYERS, surfaceOf, voxelsFromHeights } from "../../src/core/format/world";
import { ColumnTerrain, terrainData } from "../../src/core/terrain/runs";

const W = 6;
const H = 4;
const N = W * H;

/** Ground at level 4, with a cave (tile 7: air at z 1–2), an overhang's tip floating over open air
 *  (tile 8: solid only at z 3), a column to the top layer (tile 9) and a bare tile (tile 10). */
function caveVoxels(): Uint8Array {
  const v = voxelsFromHeights(new Uint8Array(N).fill(4), W, H);
  v[1 * N + 7] = v[2 * N + 7] = 0;
  v[0 * N + 8] = v[1 * N + 8] = v[2 * N + 8] = 0;
  for (let z = 0; z < LAYERS; z++) v[z * N + 9] = 1;
  for (let z = 0; z < LAYERS; z++) v[z * N + 10] = 0;
  return v;
}

function fileOf(voxels: Uint8Array): TimberFile {
  return {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-07 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels, singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
}

describe("terrain as runs per tile (D119)", () => {
  it("a heightfield is one plain run per tile: the same voxels, no stored runs", () => {
    const heights = Uint8Array.from({ length: N }, (_, i) => (i * 7) % 23);
    const t = ColumnTerrain.fromHeights(heights, W, H);
    expect(t.allPlain()).toBe(true);
    expect([...t.notPlain()]).toEqual([]);
    expect(t.heights()).toEqual(heights);
    expect(t.voxels()).toEqual(voxelsFromHeights(heights, W, H));
    expect(t.toData()).toEqual(terrainData(heights));
    expect(t.runs(3)).toEqual([0, heights[3]]);
    expect(t.runs(0)).toEqual([]);
  });

  it("reads voxels as runs and writes the same voxels back", () => {
    const v = caveVoxels();
    const t = ColumnTerrain.fromVoxels(v, W, H);
    expect(t.voxels()).toEqual(v);
    expect(t.heights()).toEqual(surfaceOf({ sizeX: W, sizeY: H, layers: LAYERS, voxels: v }));
    expect([...t.notPlain()]).toEqual([7, 8]);
    expect(t.runs(7)).toEqual([0, 1, 3, 4]);
    expect(t.runs(8)).toEqual([3, 4]);
    expect(t.runs(9)).toEqual([0, LAYERS]);
    expect([0, 7, 8, 9, 10].map((i) => t.runCount(i))).toEqual([1, 2, 1, 1, 0]);
    expect([...t.column(7)].slice(0, 5)).toEqual([1, 0, 0, 1, 0]);
    // floating ground is not plain even with one run (the support rule must see it)
    expect(t.isPlain(8)).toBe(false);
    expect(t.isPlain(10)).toBe(true);
  });

  it("round-trips format 3's terrain, leaving out a run that names a tile off the map", () => {
    const t = ColumnTerrain.fromVoxels(caveVoxels(), W, H);
    const d = t.toData();
    expect(d.runs).toEqual([[7, [0, 1, 3, 4]], [8, [3, 4]]]);
    expect(ColumnTerrain.fromData(d, W, H).mask).toEqual(t.mask);
    expect(ColumnTerrain.fromData({ ...d, runs: [...d.runs, [N + 5, [2, 3]], [-1, [0, 1]]] }, W, H).mask).toEqual(t.mask);
    // voxels above the game's layers are left out
    expect(ColumnTerrain.fromData({ ...d, runs: [[7, [0, 1, 20, 40]]] }, W, H).runs(7)).toEqual([0, 1, 20, LAYERS]);
    expect(() => ColumnTerrain.fromData({ heights: "AAAA", runs: [] }, W, H)).toThrow(/wrong size/);
  });

  it("a build's new surface changes the plain tiles and keeps caves and overhangs exactly", () => {
    const base = ColumnTerrain.fromVoxels(caveVoxels(), W, H);
    const surface = base.heights();
    surface[0] = 9;
    surface[1] = 0;
    const built = base.withSurface(surface);
    expect(built.runs(0)).toEqual([0, 9]);
    expect(built.runs(1)).toEqual([]);
    expect(built.runs(7)).toEqual(base.runs(7));
    expect(built.runs(8)).toEqual(base.runs(8));
    expect(built.heights()).toEqual(surface);
    expect(base.runs(0)).toEqual([0, 4]); // the base itself is untouched
  });

  it("a stored base keeps a map with caves voxel for voxel", () => {
    const file = fileOf(caveVoxels());
    const base = baseFromFile(file, "import");
    expect(base.runs).toEqual([[7, [0, 1, 3, 4]], [8, [3, 4]]]);
    const t = baseTerrain(base);
    expect([...t.columns.keys()]).toEqual([7, 8]);
    expect(t.heights).toEqual(t.terrain.heights());
    expect(encodeWorld(fileFromBase(base).world)).toBe(encodeWorld(file.world));
  });
});
