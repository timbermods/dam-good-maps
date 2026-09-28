// Terrain as solid runs per tile (D119, P3D-1; investigation/terrain3d/DESIGN.md §2.1–2.2): the
// game's own form (`ColumnTerrainMap`). A tile's runs are its solid intervals [floor, ceiling),
// bottom to top: a heightfield tile is one run [0, h); a cave, an overhang or a tunnel is a tile
// with two runs or more; an arch's span is a run over air.
//
// - In memory (`ColumnTerrain`): one 23-bit mask per tile (bit z set: voxel z is solid), the
//   surface derived from it. 3D-a moves the build onto it; M9a uses it for the document.
// - In the document (project format 3, `TerrainData`): the surface per tile, plus the runs of every
//   tile that is not one plain run from z = 0, in index order. A generated map without 3D forms
//   stores an empty list, so the format needs no change when terrain above terrain arrives (I-1).
//
// Ported from the design version 2 prototype (investigation/generative/v2/terrain.ts).

import { fromBase64, toBase64 } from "../format/base64";
import { LAYERS } from "../format/world";

/** The game's 23 layers (22 + 1); layer 22 stays empty. */
export const TERRAIN_LAYERS = LAYERS;
const FULL = 2 ** TERRAIN_LAYERS - 1;

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

/** The terrain in memory: one voxel mask per tile. */
export class ColumnTerrain {
  readonly N: number;
  constructor(
    readonly W: number,
    readonly H: number,
    /** Bit z of mask[i] set: voxel (x, y, z) is solid. */
    readonly mask: Uint32Array,
  ) {
    this.N = W * H;
  }

  static fromHeights(h: ArrayLike<number>, W: number, H: number): ColumnTerrain {
    const mask = new Uint32Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = h[i] >= TERRAIN_LAYERS ? FULL : 2 ** h[i] - 1;
    return new ColumnTerrain(W, H, mask);
  }

  static fromData(d: TerrainData, W: number, H: number): ColumnTerrain {
    const t = ColumnTerrain.fromHeights(fromBase64(d.heights), W, H);
    for (const [i, r] of d.runs) {
      let m = 0;
      for (let k = 0; k + 1 < r.length; k += 2) for (let z = r[k]; z < r[k + 1]; z++) m |= 1 << z;
      t.mask[i] = m >>> 0;
    }
    return t;
  }

  /** The surface of a tile: the first free layer above its highest solid voxel. */
  surface(i: number): number {
    const m = this.mask[i];
    return m === 0 ? 0 : 32 - Math.clz32(m);
  }

  heights(): Uint8Array {
    const out = new Uint8Array(this.N);
    for (let i = 0; i < this.N; i++) out[i] = this.surface(i);
    return out;
  }

  /** One solid run from z = 0 (a heightfield tile). */
  isPlain(i: number): boolean {
    const m = this.mask[i];
    return (m & (m + 1)) === 0;
  }

  /** The solid runs of a tile, bottom to top, as [floor, ceiling) pairs. */
  runs(i: number): number[] {
    const m = this.mask[i];
    const out: number[] = [];
    let z = 0;
    while (z < TERRAIN_LAYERS) {
      while (z < TERRAIN_LAYERS && !(m & (1 << z))) z++;
      if (z >= TERRAIN_LAYERS) break;
      const f = z;
      while (z < TERRAIN_LAYERS && m & (1 << z)) z++;
      out.push(f, z);
    }
    return out;
  }

  solid(i: number, z: number): boolean {
    return !!(this.mask[i] & (1 << z));
  }

  /** The writer's voxels (layer-major, as world.ts `voxelsFromHeights`). */
  voxels(layers = TERRAIN_LAYERS): Uint8Array {
    const out = new Uint8Array(this.N * layers);
    for (let i = 0; i < this.N; i++) {
      const m = this.mask[i];
      for (let z = 0; z < layers; z++) if (m & (1 << z)) out[z * this.N + i] = 1;
    }
    return out;
  }

  toData(): TerrainData {
    const runs: [number, number[]][] = [];
    for (let i = 0; i < this.N; i++) if (!this.isPlain(i)) runs.push([i, this.runs(i)]);
    return { heights: toBase64(this.heights()), runs };
  }
}
