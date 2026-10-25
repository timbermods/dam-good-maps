// Where a placement aims (D491, src/editor/shelf/aim.ts): the level of the ground the voxel pick hit, so the shelf, a
// source and a drag name a cave's floor and the core decides. On a tile without a cave, and on a tile's top, nothing is
// named: the placement stands as it always has.

import { describe, expect, it } from "vitest";
import { aimedLevel, aimOf, columnMaskAt } from "../../src/editor/shelf/aim";
import { pickTerrain, type TileHit } from "../../src/render3d/pick";
import { LAYERS } from "../../src/render3d/model";

/** Bits lo … hi − 1. */
const bits = (lo: number, hi: number) => ((1 << hi) - 1) ^ ((1 << lo) - 1);
// a cave: floor at 3 (voxels 0–2), air 3–6, a roof 7 (its top 8)
const CAVE = bits(0, 3) | bits(7, 8);
const hit = (h: Partial<TileHit>): TileHit => ({ x: 1, y: 0, point: [1.5, 0, -0.5], face: "top", t: 1, ...h });

describe("the level a placement aims at", () => {
  it("names a cave's floor, and nothing on the tile's top or on a plain tile", () => {
    expect(aimedLevel(hit({ run: { bottom: 0, top: 3 }, level: 3, layer: 2 }), 8, CAVE)).toBe(3);
    expect(aimedLevel(hit({ run: { bottom: 7, top: 8 }, level: 8, layer: 7 }), 8, CAVE)).toBeUndefined();
    expect(aimedLevel(hit({ run: { bottom: 0, top: 8 }, level: 8, layer: 7 }), 8, undefined)).toBeUndefined();
    expect(aimedLevel(null, 8, CAVE)).toBeUndefined();
    // (a wall of the floor's run: its top; the roof's underside: the floor under it)
    expect(aimedLevel(hit({ face: "side", side: "east", run: { bottom: 0, top: 3 }, level: 3, layer: 1 }), 8, CAVE)).toBe(3);
    expect(aimedLevel(hit({ face: "bottom", run: { bottom: 7, top: 8 }, level: 8, layer: 7 }), 8, CAVE)).toBe(3);
    // (the map's floor under air at the bottom)
    expect(aimedLevel(hit({ run: { bottom: 0, top: 0 }, level: 0 }), 8, bits(4, 8))).toBe(0);
  });

  it("under a layer cut, a cap names its run's real top", () => {
    // (a cut at 2 caps the cave floor's run: the pick's run ends at 2, the floor is at 3)
    expect(aimedLevel(hit({ run: { bottom: 0, top: 2 }, level: 2, layer: 1 }), 8, CAVE)).toBe(3);
    // (a cut at 7 caps the roof's run: its real top is the tile's top, no level)
    expect(aimedLevel(hit({ run: { bottom: 0, top: 7 }, level: 7, layer: 6 }), 8, bits(0, 8))).toBeUndefined();
  });

  it("through the voxel pick: a ray into a tunnel's mouth names its floor, the tile's mask from the page's columns", () => {
    // 3 tiles in a row: open ground at 3, then two tiles with a tunnel (floor 3, roof top 8)
    const W = 3;
    const masks = [bits(0, 3), CAVE, CAVE];
    const heights = Uint8Array.from([3, 8, 8]);
    const voxels = new Uint8Array(2 * LAYERS);
    for (let k = 0; k < 2; k++) for (let z = 0; z < LAYERS; z++) voxels[k * LAYERS + z] = (CAVE >>> z) & 1;
    const columns = { tiles: Int32Array.from([1, 2]), voxels };
    expect(columnMaskAt(columns, 1)).toBe(CAVE);
    expect(columnMaskAt(columns, 0)).toBeUndefined();
    // from over the open ground, looking east and a little down into the tunnel
    const ray = { origin: [0.2, 5, -0.5] as [number, number, number], direction: [1, -1.2, 0] as [number, number, number] };
    const h = pickTerrain(ray, W, 1, (i) => masks[i]);
    expect(h).toMatchObject({ x: 1, level: 3, face: "top" });
    expect(aimOf(h, W, heights, columns)).toBe(3);
    // the same ray on a map without the tunnel hits the cliff: the tile's top
    const flat = pickTerrain(ray, W, 1, (i) => (i === 0 ? bits(0, 3) : bits(0, 8)));
    expect(aimOf(flat, W, heights, { tiles: new Int32Array(0), voxels: new Uint8Array(0) })).toBeUndefined();
  });
});
