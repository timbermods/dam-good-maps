// The cave-ready terrain model (design version 2, task h; D118, D119 = P3D-1, I-1). The prototype
// keeps its terrain as solid runs per column, the game's own form (`ColumnTerrainMap`), even though
// M9's processes make only simple columns (one run from z = 0):
// - in memory: one 23-bit mask per tile (bit z set: voxel z is solid), `heights` derived from it
//   (the surface: the highest solid voxel + 1);
// - in the document (format 3): `TerrainData`, the surface per tile plus the runs of every tile that
//   is not one plain run from z = 0, bottom to top, as [floor, ceiling) pairs. A generated M9 map
//   stores an empty run list; a cave, an overhang or a tunnel is a tile with two runs or more, and
//   an arch's span is a run over air. Nothing in the format changes when they arrive (3D-b).
// - the writer's voxels come from the runs, and for simple columns they are the same bytes as
//   today's `voxelsFromHeights` (checked by check-v2.ts on every sample map).
//
// This file is the prototype of `core/terrain/runs.ts` (investigation/terrain3d/DESIGN.md §2.1) and
// of format 3's `TerrainData` (§2.2). docs/m9-design.md §12 says where each piece lands in M9a.

import { LAYERS } from "../../../src/core/format/world";

/** The game's 23 layers (22 + 1); layer 22 stays empty. */
export const TERRAIN_LAYERS = LAYERS;
const FULL = (1 << TERRAIN_LAYERS) - 1;

/** Format 3's terrain, for the document's `field` and `base` (DESIGN.md §2.2). */
export interface TerrainData {
  /** The surface per tile, base64, one byte per tile, row-major (as format 2's `heights`). */
  heights: string;
  /** Tiles that are not one plain run from z = 0, in index order: [tile, [floor0, ceil0, …]]. */
  runs: [number, number[]][];
}

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
    for (let i = 0; i < W * H; i++) mask[i] = h[i] >= TERRAIN_LAYERS ? FULL : (1 << h[i]) - 1;
    return new ColumnTerrain(W, H, mask);
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

  /** Carve voxels [z0, z1) of a tile (a cave, a tunnel; 3D-b's processes). */
  carve(i: number, z0: number, z1: number): void {
    for (let z = z0; z < z1; z++) this.mask[i] &= ~(1 << z);
  }

  fill(i: number, z0: number, z1: number): void {
    for (let z = z0; z < z1; z++) this.mask[i] |= 1 << z;
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

  static fromData(d: TerrainData, W: number, H: number): ColumnTerrain {
    const h = fromBase64(d.heights);
    const t = ColumnTerrain.fromHeights(h, W, H);
    for (const [i, r] of d.runs) {
      let m = 0;
      for (let k = 0; k + 1 < r.length; k += 2) for (let z = r[k]; z < r[k + 1]; z++) m |= 1 << z;
      t.mask[i] = m;
    }
    return t;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of bytes (runs in Node and in the browser alike). */
export function toBase64(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let k = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) | (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    if (k < out.length) out[k++] = (n >> 16) & 255;
    if (k < out.length) out[k++] = (n >> 8) & 255;
    if (k < out.length) out[k++] = n & 255;
  }
  return out;
}

/** The document's terrain in format 3 (a draft of M9a's project file): the field the processes
 *  made and the built base, both as heights plus runs. */
export interface Format3Terrain {
  formatVersion: 3;
  field: TerrainData;
  base: TerrainData;
}
