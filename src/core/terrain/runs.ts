// Terrain as solid runs per tile (D119, P3D-1; investigation/terrain3d/DESIGN.md §2.1–2.2): the
// game's own form (`ColumnTerrainMap`). A tile's runs are its solid intervals [floor, ceiling),
// bottom to top: a heightfield tile is one run [0, h); a cave, an overhang or a tunnel is a tile
// with two runs or more; an arch's span is a run over air.
//
// - In memory: one 23-bit mask per tile (bit z set: voxel z is solid), the surface derived from it
//   (sim/columns.ts `VoxelMasks`). 3D-a moves the build onto it; M9a uses it for the document.
// - In the document (project format 3, `TerrainData`): the surface per tile, plus the runs of every
//   tile that is not one plain run from z = 0, in index order. A generated map without 3D forms
//   stores an empty list, so the format needs no change when terrain above terrain arrives (I-1).
//
// Ported from the design version 2 prototype (investigation/generative/v2/terrain.ts).

import { fromBase64, toBase64 } from "../format/base64";
import { LAYERS } from "../format/world";

/** The game's 23 layers (22 + 1); layer 22 stays empty. */
export const TERRAIN_LAYERS = LAYERS;

/** Format 3's terrain, for the document's `field` and `base` (DESIGN.md §2.2). */
export interface TerrainData {
  /** The surface per tile: base64, one byte per tile, row-major. */
  heights: string;
  /** Tiles that are not one plain run from z = 0, in index order: [tile, [floor0, ceil0, …]]. */
  runs: [number, number[]][];
}

/** The runs of one voxel column (LAYERS entries, 0 or 1), bottom to top. */
export function runsOfColumn(col: ArrayLike<number>): number[] {
  const out: number[] = [];
  let z = 0;
  while (z < col.length) {
    while (z < col.length && !col[z]) z++;
    if (z >= col.length) break;
    const f = z;
    while (z < col.length && col[z]) z++;
    out.push(f, z);
  }
  return out;
}

/** A voxel column (LAYERS entries) from its runs. */
export function columnOfRuns(runs: readonly number[], layers = TERRAIN_LAYERS): Uint8Array {
  const col = new Uint8Array(layers);
  for (let k = 0; k + 1 < runs.length; k += 2) for (let z = Math.max(0, runs[k]); z < Math.min(layers, runs[k + 1]); z++) col[z] = 1;
  return col;
}

/** Whether runs are one plain run from z = 0 (a heightfield tile). */
export function plainRuns(runs: readonly number[]): boolean {
  return runs.length === 0 || (runs.length === 2 && runs[0] === 0);
}

/** Format 3's terrain from surface heights and the voxel columns that are not plain. */
export function terrainData(heights: Uint8Array, columns: ReadonlyMap<number, ArrayLike<number>> = new Map()): TerrainData {
  const runs: [number, number[]][] = [];
  for (const i of [...columns.keys()].sort((a, b) => a - b)) {
    const r = runsOfColumn(columns.get(i)!);
    if (!plainRuns(r)) runs.push([i, r]);
  }
  return { heights: toBase64(heights), runs };
}

/** Surface heights and the voxel columns that are not plain, from format 3's terrain. */
export function terrainColumns(d: TerrainData, N: number): { heights: Uint8Array; columns: Map<number, Uint8Array> } {
  const heights = fromBase64(d.heights);
  if (heights.length !== N) throw new Error(`terrain heights have the wrong size (${heights.length}, not ${N})`);
  const columns = new Map<number, Uint8Array>();
  for (const [i, r] of d.runs) {
    if (!Number.isInteger(i) || i < 0 || i >= N) throw new Error(`terrain runs name tile ${String(i)}, outside the map`);
    columns.set(i, columnOfRuns(r));
  }
  return { heights, columns };
}
