// Terrain as solid runs per tile (D119, P3D-1; investigation/terrain3d/DESIGN.md §2.1–2.2): the
// game's own form (`ColumnTerrainMap`). A tile's runs are its solid intervals [floor, ceiling),
// bottom to top: a heightfield tile is one run [0, h); a cave, an overhang or a tunnel is a tile
// with two runs or more; an arch's span is a run over air.
//
// - In memory: one 23-bit mask per tile (bit z set: voxel z is solid), the surface derived from it
//   (`ColumnTerrain`; sim/columns.ts `VoxelMasks` is its shape). It is the terrain of a stored base
//   (doc/base.ts), of the build's base layer and of the map a session exports; the build's own steps
//   still shape the surface only (the brushes move onto runs in step 3, D280), so a build's terrain is
//   its surface with the base's other tiles kept (`withSurface`).
// - In the document (project format 3, `TerrainData`): the surface per tile, plus the runs of every
//   tile that is not one plain run from z = 0, in index order. A generated map without 3D forms
//   stores an empty list, so the format needs no change when terrain above terrain arrives (I-1).
//
// Ported from the design version 2 prototype (investigation/generative/v2/terrain.ts).

import { fromBase64, toBase64 } from "../format/base64";
import { LAYERS } from "../format/world";

/** The game's 23 layers (22 + 1); layer 22 stays empty. */
export const TERRAIN_LAYERS = LAYERS;
const FULL = (1 << TERRAIN_LAYERS) - 1;

/** The mask of one plain run from z = 0 up to `h` (a heightfield tile of that surface). */
function plainMask(h: number): number {
  return h >= TERRAIN_LAYERS ? FULL : h > 0 ? (1 << h) - 1 : 0;
}

/** The mask of a tile's runs ([floor, ceiling) pairs); voxels outside the layers are left out. */
function maskOfRuns(r: readonly number[]): number {
  let m = 0;
  for (let k = 0; k + 1 < r.length; k += 2) for (let z = Math.max(0, r[k]); z < Math.min(TERRAIN_LAYERS, r[k + 1]); z++) m |= 1 << z;
  return m;
}

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

/** The terrain in memory: one voxel mask per tile, with its runs and surface derived from it (D119). */
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
    for (let i = 0; i < W * H; i++) mask[i] = plainMask(h[i]);
    return new ColumnTerrain(W, H, mask);
  }

  /** From format 3's terrain. A run that names a tile off the map is left out (it was never drawn),
   *  as saved projects always opened; `terrainColumns` refuses one. */
  static fromData(d: TerrainData, W: number, H: number): ColumnTerrain {
    const heights = fromBase64(d.heights);
    if (heights.length !== W * H) throw new Error(`terrain heights have the wrong size (${heights.length}, not ${W * H})`);
    const t = ColumnTerrain.fromHeights(heights, W, H);
    for (const [i, r] of d.runs) if (Number.isInteger(i) && i >= 0 && i < t.N) t.mask[i] = maskOfRuns(r);
    return t;
  }

  /** From a world's voxels (layer-major, `layers` planes of W·H; format/world.ts). */
  static fromVoxels(voxels: ArrayLike<number>, W: number, H: number, layers = TERRAIN_LAYERS): ColumnTerrain {
    if (layers > TERRAIN_LAYERS) throw new Error(`expected at most ${TERRAIN_LAYERS} layers, got ${layers}`);
    const N = W * H;
    const mask = new Uint32Array(N);
    for (let z = 0; z < layers; z++) {
      const bit = 1 << z;
      const at = z * N;
      for (let i = 0; i < N; i++) if (voxels[at + i]) mask[i] |= bit;
    }
    return new ColumnTerrain(W, H, mask);
  }

  /** This terrain under a new surface: every plain tile becomes one run up to `heights`, and the
   *  tiles that are not plain (caves, overhangs) are kept exactly. What a build makes of its base
   *  while its steps shape the surface only; there the build keeps those tiles' surface too, so
   *  `heights()` of the result is `heights`. */
  withSurface(heights: ArrayLike<number>): ColumnTerrain {
    const mask = new Uint32Array(this.N);
    for (let i = 0; i < this.N; i++) mask[i] = this.isPlain(i) ? plainMask(heights[i]) : this.mask[i];
    return new ColumnTerrain(this.W, this.H, mask);
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

  /** Whether every tile is plain (a heightfield: every generated map today). */
  allPlain(): boolean {
    const mask = this.mask;
    for (let i = 0; i < mask.length; i++) if ((mask[i] & (mask[i] + 1)) !== 0) return false;
    return true;
  }

  /** The tiles that are not plain, ascending. */
  notPlain(): Int32Array {
    const out: number[] = [];
    for (let i = 0; i < this.N; i++) if (!this.isPlain(i)) out.push(i);
    return Int32Array.from(out);
  }

  /** How many runs a tile has (0 for an empty tile). */
  runCount(i: number): number {
    const m = this.mask[i];
    // a run starts at every solid voxel with air (or the bottom) below it
    let starts = m & ~(m << 1);
    let n = 0;
    for (; starts; starts &= starts - 1) n++;
    return n;
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

  /** One tile's voxels, bottom to top (the form the 3D view's voxel mesher takes). */
  column(i: number, layers = TERRAIN_LAYERS): Uint8Array {
    const m = this.mask[i];
    const col = new Uint8Array(layers);
    for (let z = 0; z < layers && z < TERRAIN_LAYERS; z++) if (m & (1 << z)) col[z] = 1;
    return col;
  }

  /** The writer's voxels (layer-major, as world.ts `voxelsFromHeights`). */
  voxels(layers = TERRAIN_LAYERS): Uint8Array {
    const out = new Uint8Array(this.N * layers);
    for (let i = 0; i < this.N; i++) {
      const m = this.mask[i];
      for (let z = 0; z < layers && z < TERRAIN_LAYERS; z++) if (m & (1 << z)) out[z * this.N + i] = 1;
    }
    return out;
  }

  toData(): TerrainData {
    const runs: [number, number[]][] = [];
    for (let i = 0; i < this.N; i++) if (!this.isPlain(i)) runs.push([i, this.runs(i)]);
    return { heights: toBase64(this.heights()), runs };
  }
}
