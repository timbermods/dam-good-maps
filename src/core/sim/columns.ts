// Water columns of a map with terrain above terrain (D120; investigation/terrain3d/GAME_RULES.md §3.1),
// built by the game's own rules (Timberborn 1.1.2.4, `WaterSimulator.CreateColumns` and the obstacle
// methods): every tile starts as one open column [0, 34) (34 = the total height 33 plus 1); each
// solid voxel is added as a full obstacle, bottom to top; then the map objects add theirs, in file
// order. A full obstacle fills one cell, splitting, shrinking or removing the column it falls in; a
// horizontal obstacle at z splits a column at z without filling a cell (a roof of no thickness). The
// columns are the air gaps: slot k is the k-th from the bottom, which is how the file stores water
// (`WaterMapNew`, index slot·X·Y + y·X + x). A heightfield tile is one open column from its surface.
//
// Objects (the blueprints' `WaterObstacleSpec` and `FinishableHorizontalWaterObstacleSpec`):
// - Blockage: a full obstacle at its cell;
// - NaturalDam: a partial obstacle (height limit) 0.65 at its cell (model.ts `NATURAL_DAM_HEIGHT`);
// - NaturalOverhang2x1–4x1: a full obstacle at the base, a horizontal one at z + 1 over every tile;
// - BadtideDrain: a full obstacle at the back (0, 0), horizontal obstacles at (0, 1) at z and z + 1,
//   and a direction limiter at the emitter cell (0, 1, z).

import { NATURAL_DAM_HEIGHT, objectTile, type MapObject } from "./model";
import type { Orientation } from "../format/footprints";

/** Voxel layers of the terrain (the game's 22 + 1). */
export const TERRAIN_LAYERS = 23;
/** `WaterSimulator._maxColumnHeight`: the total height 33 + 1, the ceiling of an open column. */
export const OPEN_CEILING = 34;

/** The terrain the water columns are built from: bit z of `mask[i]` set when voxel z of tile i is
 *  solid. */
export interface VoxelMasks {
  W: number;
  H: number;
  mask: Uint32Array;
}

/** Voxel masks of a heightfield: tile i solid from z = 0 to its height. */
export function heightMasks(W: number, H: number, heights: ArrayLike<number>): VoxelMasks {
  const N = W * H;
  const mask = new Uint32Array(N);
  for (let i = 0; i < N; i++) mask[i] = (1 << Math.min(TERRAIN_LAYERS, Math.max(0, heights[i]))) - 1;
  return { W, H, mask };
}

/** Water columns per tile, slot-major like the game (column id = slot·N + tile). */
export interface WaterColumns {
  W: number;
  H: number;
  N: number;
  /** The most columns of any tile (the file's `Levels` is at least this). */
  L: number;
  count: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
  /** Partial obstacles (NaturalDam) by cell (z·N + tile): their height limit. Null when none. */
  heightLimit: Map<number, number> | null;
  /** Direction limiters (badtide drains' emitter cells) by cell (z·N + tile): the direction
   *  0 −y, 1 −x, 2 +y, 3 +x. Null when none. */
  dirLimit: Map<number, number> | null;
}

/** Local obstacle layout of the templates that change water columns. */
const OBSTACLES: Record<string, { full?: [number, number][]; partial?: { at: [number, number]; height: number }; horizontal?: [number, number, number][] }> = {
  Blockage: { full: [[0, 0]] },
  NaturalDam: { partial: { at: [0, 0], height: NATURAL_DAM_HEIGHT } },
  NaturalOverhang2x1: { full: [[0, 0]], horizontal: [[0, 0, 1], [0, 1, 1]] },
  NaturalOverhang3x1: { full: [[0, 0]], horizontal: [[0, 0, 1], [0, 1, 1], [0, 2, 1]] },
  NaturalOverhang4x1: { full: [[0, 0]], horizontal: [[0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1]] },
  BadtideDrain: { full: [[0, 0]], horizontal: [[0, 1, 0], [0, 1, 1]] },
};

/** Flow direction of a drain's limiter, from its orientation: 0 −y, 1 −x, 2 +y, 3 +x. */
const DIR_OF_ORIENTATION: Record<Orientation, number> = { Cw0: 2, Cw90: 3, Cw180: 0, Cw270: 1 };

export function waterColumns(t: VoxelMasks, objects: readonly MapObject[]): WaterColumns {
  const { W, H, mask } = t;
  const N = W * H;
  // most tiles are one gap from their surface up: keep only the others as lists
  const lists = new Map<number, number[]>();
  const simpleFloor = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    if ((m & (m + 1)) === 0) {
      // one solid run from z = 0 (or none): one open column from the surface
      simpleFloor[i] = m === 0 ? 0 : 32 - Math.clz32(m);
      continue;
    }
    // the air gaps of a tile with runs above air: the game adds each solid voxel bottom to top
    const c: number[] = [];
    let z = 0;
    while (z < OPEN_CEILING) {
      while (z < TERRAIN_LAYERS && m & (1 << z)) z++;
      if (z >= OPEN_CEILING) break;
      const f = z;
      while (z < OPEN_CEILING && !(z < TERRAIN_LAYERS && m & (1 << z))) z++;
      c.push(f, z);
    }
    lists.set(i, c);
  }
  const list = (i: number): number[] => {
    let c = lists.get(i);
    if (!c) {
      c = [simpleFloor[i], OPEN_CEILING];
      lists.set(i, c);
    }
    return c;
  };
  const find = (c: number[], z: number): number => {
    for (let k = 0; k < c.length; k += 2) {
      if (z < c[k]) break;
      if (z < c[k + 1]) return k;
    }
    return -1;
  };
  // WaterSimulator.AddFullObstacleInternal
  const addFull = (i: number, z: number) => {
    const c = list(i);
    const k = find(c, z);
    if (k < 0) return; // inside terrain: the game throws; a valid map never does this
    if (c[k] === z) {
      if (c[k + 1] - 1 === z) c.splice(k, 2);
      else c[k] = z + 1;
    } else if (c[k + 1] - 1 === z) {
      c[k + 1] = z;
    } else {
      const top = c[k + 1];
      c[k + 1] = z;
      c.splice(k + 2, 0, z + 1, top);
    }
  };
  // WaterSimulator.AddHorizontalObstacleInternal: only the first obstacle at a cell splits
  const hcount = new Map<number, number>();
  const addHorizontal = (i: number, z: number) => {
    const key = z * N + i;
    const n = (hcount.get(key) ?? 0) + 1;
    hcount.set(key, n);
    if (n !== 1) return;
    const c = list(i);
    const k = find(c, z);
    if (k < 0 || c[k] === z) return;
    const top = c[k + 1];
    c[k + 1] = z;
    c.splice(k + 2, 0, z, top);
  };

  let heightLimit: Map<number, number> | null = null;
  let dirLimit: Map<number, number> | null = null;
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  for (const o of objects) {
    const rule = OBSTACLES[o.template];
    if (!rule) continue;
    for (const [lx, ly] of rule.full ?? []) {
      const [x, y] = objectTile(o, lx, ly);
      if (inside(x, y)) addFull(y * W + x, o.z);
    }
    if (rule.partial) {
      const [x, y] = objectTile(o, rule.partial.at[0], rule.partial.at[1]);
      if (inside(x, y)) (heightLimit ??= new Map()).set(o.z * N + y * W + x, rule.partial.height);
    }
    for (const [lx, ly, lz] of rule.horizontal ?? []) {
      const [x, y] = objectTile(o, lx, ly);
      if (inside(x, y)) addHorizontal(y * W + x, o.z + lz);
    }
    if (o.template === "BadtideDrain") {
      const [x, y] = objectTile(o, 0, 1);
      if (inside(x, y)) (dirLimit ??= new Map()).set(o.z * N + y * W + x, DIR_OF_ORIENTATION[o.orientation]);
    }
  }

  let L = 1;
  for (const c of lists.values()) if (c.length / 2 > L) L = c.length / 2;
  const count = new Uint8Array(N);
  const floor = new Int16Array(L * N);
  const ceil = new Int16Array(L * N);
  for (let i = 0; i < N; i++) {
    const c = lists.get(i);
    if (!c) {
      count[i] = 1;
      floor[i] = simpleFloor[i];
      ceil[i] = OPEN_CEILING;
      continue;
    }
    count[i] = c.length / 2;
    for (let k = 0; k < c.length / 2; k++) {
      floor[k * N + i] = c[2 * k];
      ceil[k * N + i] = c[2 * k + 1];
    }
  }
  return { W, H, N, L, count, floor, ceil, heightLimit, dirLimit };
}

/** The game's terrain columns (`ColumnTerrainMap.LoadColumns`): the solid runs of each tile
 *  [floor, ceiling), bottom to top, where run 0 always starts at z = 0 and is empty (floor 0,
 *  ceiling 0) when the bottom voxel is air. Soil moisture and contamination are stored per run, slot
 *  j of tile i at j·N + i, the ceiling being the run's top (its walking surface). */
export interface TerrainColumns {
  W: number;
  H: number;
  N: number;
  /** The most runs of any tile (the file's soil `Size`). */
  T: number;
  count: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
}

export function terrainColumns(t: VoxelMasks): TerrainColumns {
  const { W, H, mask } = t;
  const N = W * H;
  let T = 1;
  const count = new Uint8Array(N);
  const runs: number[][] = new Array(N);
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    if ((m & (m + 1)) === 0) {
      count[i] = 1;
      continue;
    }
    const r: number[] = [];
    let solid = true;
    let f = 0;
    for (let z = 0; z < TERRAIN_LAYERS; z++) {
      if (m & (1 << z)) {
        if (!solid) f = z;
        solid = true;
      } else {
        if (solid) r.push(f, z);
        solid = false;
      }
    }
    if (solid) r.push(f, TERRAIN_LAYERS);
    runs[i] = r;
    count[i] = r.length / 2;
    if (count[i] > T) T = count[i];
  }
  const floor = new Int16Array(T * N);
  const ceil = new Int16Array(T * N);
  for (let i = 0; i < N; i++) {
    const r = runs[i];
    if (!r) {
      const m = mask[i];
      ceil[i] = m === 0 ? 0 : 32 - Math.clz32(m);
      continue;
    }
    for (let k = 0; k < r.length / 2; k++) {
      floor[k * N + i] = r[2 * k];
      ceil[k * N + i] = r[2 * k + 1];
    }
  }
  return { W, H, N, T, count, floor, ceil };
}
