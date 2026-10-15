// The Block tool's aim (3D step 3, D488): the block whose face the pointer is on, from the 3D picker's hit.
// On hand-made columns with overhangs, caves and a floating run, a ray at the centre of every exposed face
// of every block (from just outside it) must give that block and that side; the map's floor under air, the
// sky and a hit that names no run give none.

import { describe, expect, it } from "vitest";
import { columnMask, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";
import { blockAim, pickTerrain, type BlockFace, type Ray, type TileHit } from "../../src/render3d/pick";

type V = [number, number, number];

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

const W = 12;
const H = 10;
const ground = (z: number) => z < 3;
const terrains: [string, TerrainSource][] = [
  ["an overhang", terrain(W, H, (x, y, z) => ground(z) || (x >= 6 && z < 8) || (x >= 3 && x < 6 && y >= 2 && y < 8 && z >= 6 && z < 8))],
  ["a cave open at one side", terrain(W, H, (x, y, z) => ground(z) || (x >= 2 && x < 10 && y >= 2 && y < 8 && z < 9 && !(x >= 3 && y >= 4 && y < 6 && z >= 3 && z < 6)))],
  ["a floating run and a column with air at its bottom", terrain(W, H, (x, y, z) => (x === 4 && y === 4 ? z >= 2 && z < 5 : ground(z) || (x === 8 && y === 7 && z >= 7 && z < 9)))],
  ["a flat map", terrain(W, H, (_x, _y, z) => z < 4)],
];

const STEP: Record<BlockFace, V> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
const SIDES = Object.keys(STEP) as BlockFace[];

/** The ray that meets the face of block (x, y, z) facing `side` at its centre, from 1½ blocks outside it. */
function rayAt(x: number, y: number, z: number, side: BlockFace): Ray {
  // tile space: x east, y north, z up; world: X = x, Y = z, Z = −y
  const n = STEP[side];
  const c: V = [x + 0.5 + n[0] * 1.5, y + 0.5 + n[1] * 1.5, z + 0.5 + n[2] * 1.5];
  return { origin: [c[0], c[2], -c[1]], direction: [-n[0], -n[2], n[1]] };
}

describe("the block a pointer is on", () => {
  it.each(terrains)("%s: a ray at each exposed face of each block gives that block and that side", (_name, src) => {
    const solid = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z < LAYERS && ((columnMask(src, y * W + x) >>> z) & 1) === 1;
    const mask = (i: number) => columnMask(src, i);
    let checked = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let z = 0; z < LAYERS; z++) {
          if (!solid(x, y, z)) continue;
          for (const side of SIDES) {
            const s = STEP[side];
            if (solid(x + s[0], y + s[1], z + s[2])) continue;
            const hit = pickTerrain(rayAt(x, y, z, side), W, H, mask);
            expect(blockAim(hit), `block ${x},${y},${z} ${side}`).toEqual({ at: [x, y, z], side });
            checked++;
          }
        }
    expect(checked).toBeGreaterThan(200);
  });

  it("names the ground's own layers: the top of a level-4 tile is layer 3, a wall is the layer hit", () => {
    const flat = terrains[3][1];
    const mask = (i: number) => columnMask(flat, i);
    expect(blockAim(pickTerrain({ origin: [4.5, 10, -4.5], direction: [0, -1, 0] }, W, H, mask))).toEqual({ at: [4, 4, 3], side: "+z" });
    // along z = 1.5 from the west: the west face of tile (0, 4), layer 1
    expect(blockAim(pickTerrain({ origin: [-3, 1.5, -4.5], direction: [1, 0, 0] }, W, H, mask))).toEqual({ at: [0, 4, 1], side: "-x" });
  });

  it("gives none for the sky, off the map, the map's floor under air and a hit that names no run", () => {
    const air = terrains[2][1];
    const mask = (i: number) => columnMask(air, i);
    expect(blockAim(null)).toBeNull();
    expect(blockAim(pickTerrain({ origin: [4.5, 30, -4.5], direction: [0, 1, 0] }, W, H, mask))).toBeNull();
    expect(blockAim(pickTerrain({ origin: [-5, 5, -4.5], direction: [-1, 0, 0] }, W, H, mask))).toBeNull();
    // beneath the floating run (tile 4, 4: solid at layers 2…4) the map's floor is what the ray lands on
    const floor = pickTerrain({ origin: [4.5, 1.5, -4.5 + 0.2], direction: [0.01, -1, 0] }, W, H, mask)!;
    expect([floor.face, floor.level]).toEqual(["top", 0]);
    expect(blockAim(floor)).toBeNull();
    const noRun: TileHit = { x: 1, y: 1, point: [1.5, 3, -1.5], face: "top", level: 3, t: 1 };
    expect(blockAim(noRun)).toBeNull();
  });

  it("a hit that names no layer takes the layer from where it hit, inside its run", () => {
    const hit: TileHit = { x: 2, y: 3, point: [2, 4.9, -3.5], face: "side", side: "west", run: { bottom: 2, top: 5 }, level: 5, t: 1 };
    expect(blockAim(hit)).toEqual({ at: [2, 3, 4], side: "-x" });
    expect(blockAim({ ...hit, point: [2, 7, -3.5] })).toEqual({ at: [2, 3, 4], side: "-x" });
    expect(blockAim({ ...hit, side: "north" })?.side).toBe("+y");
    expect(blockAim({ ...hit, side: "south" })?.side).toBe("-y");
    expect(blockAim({ ...hit, side: "east" })?.side).toBe("+x");
  });
});
