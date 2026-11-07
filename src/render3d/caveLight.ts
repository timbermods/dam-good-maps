// Light under roofs (3D terrain step 2, part 2; D126, D280 (2), D497): the sun in caves, under overhangs and arches,
// from Erode's light volume (investigation/erode/core/mesher.ts `lightVolume`, as investigation/3d-view adopted it).
// The game lights a roofed space as it lights open ground (D497: Unity's Trilight ambient by the face's normal,
// unoccluded), so the only light a roof changes is the sun's, which reaches in only where a ray toward it finds no
// rock. Two bytes a cell, W × H × LIGHT_LEVELS cells (x fastest, then y, then the level), a 3D texture the terrain
// shader reads half a cell along each face's normal:
// - R, air: 255 in any air (under a roof or open), 0 in rock (the shader's `roofedAir` reads it with the tile's top).
// - G, the sun: 255 where a ray toward the sun leaves the land without meeting rock, else 0, marched from every
//   roofed cell and every open cell beside one (all 26 round it: the filtering blends them); 255 in any other open
//   cell, 0 in rock.
// The shader's rule (materials.ts `caveAt`, mirrored by `caveSample` for the tests): only a face whose own air is
// roofed takes this sun; in open air, and so on every map without terrain above terrain, the baked shadow is used
// exactly as before (tests/unit/caveLight.test.ts).
//
// Only roofed air needs any work, and roofed air is only in the tiles that are not one plain run from z = 0
// (`TerrainSource.columns`): a map without them has no volume at all (`CaveLight.build` gives null). After an edit
// only the edited box is redone, and the sun of the cells beside it and of those whose ray crosses it (`relight`):
// the same bytes as building the whole volume again. Pure TypeScript.

import { columnMask, type TerrainSource } from "./mesh";
import { LAYERS } from "./model";
import { LIGHT } from "./palette";

/** Levels in the volume: the 23 layers and one of open sky over them. */
export const LIGHT_LEVELS = LAYERS + 1;

const OPEN = 255;
const MARCH = 0.34;

/** Toward the sun in tile space (x east, y north, z up). */
export const SUN_TILE: readonly [number, number, number] = [
  LIGHT.sunAzimuth[0] * Math.cos(LIGHT.sunElevation),
  LIGHT.sunAzimuth[1] * Math.cos(LIGHT.sunElevation),
  Math.sin(LIGHT.sunElevation),
];

/** How far a change reaches down-sun (tiles, east and south): the longest ray's run before it clears
 *  the top layer, and a step over. */
export const SUN_REACH = Math.ceil(((LAYERS - 0.5) / SUN_TILE[2] + MARCH) * Math.max(Math.abs(SUN_TILE[0]), Math.abs(SUN_TILE[1]))) + 1;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export class CaveLight {
  readonly W: number;
  readonly H: number;
  readonly D = LIGHT_LEVELS;
  /** RG bytes per cell (the texture's data). */
  readonly data: Uint8Array;
  /** Each tile's column mask (bit z: voxel z solid). */
  private readonly masks: Uint32Array;
  /** 1 on tiles that can hold roofed air (the columns that are not plain, and any that came to hold it since), 2 on
   *  their neighbours, 0 elsewhere. A tile never leaves them, which changes no byte. */
  private readonly near: Uint8Array;
  /** On those tiles, the highest level an open cell beside roofed air can have (one over the highest
   *  roofed cell round it). */
  private readonly besideTop: Uint8Array;
  /** At least the highest top on the map, raised as edits raise the land (never lowered: it only bounds
   *  the rays): a ray toward the sun above it has left the land. The shader's march stops there too. */
  get highest(): number {
    return this.maxTop;
  }
  private maxTop = 0;

  private constructor(src: TerrainSource) {
    const { W, H } = src;
    this.W = W;
    this.H = H;
    this.data = new Uint8Array(W * H * LIGHT_LEVELS * 2);
    this.masks = new Uint32Array(W * H);
    this.near = new Uint8Array(W * H);
    this.besideTop = new Uint8Array(W * H);
    for (const i of src.columns.keys()) this.joinNear(i, columnMask(src, i));
  }

  /** Tile i, whose column `m` holds roofed air, and the tiles round it, join the ones the sun is marched in. */
  private joinNear(i: number, m: number): void {
    const { W, H } = this;
    const top = 32 - Math.clz32(m);
    const air = ~m & ((1 << top) - 1);
    if (!air) return;
    const roof = 32 - Math.clz32(air);
    const x = i % W;
    const y = (i - x) / W;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
      for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
        const j = yy * W + xx;
        if (!this.near[j]) this.near[j] = 2;
        if (roof > this.besideTop[j]) this.besideTop[j] = roof;
      }
    this.near[i] = 1;
  }

  /** The volume of a terrain, or null when it has no air under a roof (every column one plain run; `force`: build it
   *  anyway, for the tests). */
  static build(src: TerrainSource, force = false): CaveLight | null {
    if (!src.columns.size && !force) return null;
    const v = new CaveLight(src);
    v.relight(src, { x0: 0, y0: 0, x1: src.W - 1, y1: src.H - 1 });
    return v;
  }

  /** The top of tile i's column (the first level over its highest rock). */
  top(i: number): number {
    return 32 - Math.clz32(this.masks[i]);
  }

  /** Whether cell (x, y, z) is air under a roof (in the map). */
  private roofed(x: number, y: number, z: number): boolean {
    const m = this.masks[y * this.W + x];
    return z < 32 - Math.clz32(m) && !((m >>> z) & 1);
  }

  /** The tiles in `rect` changed: redo their cells, and the sun of the cells beside them and of those whose ray
   *  crosses them. Returns the tiles whose cells may have changed (every level), for the upload. */
  relight(src: TerrainSource, rect: Rect): Rect {
    const { W, H, D, data, masks, near } = this;
    const N = W * H;
    const x0 = Math.max(0, rect.x0);
    const y0 = Math.max(0, rect.y0);
    const x1 = Math.min(W - 1, rect.x1);
    const y1 = Math.min(H - 1, rect.y1);
    // 1. the changed tiles' cells: rock, or air (its sun below)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const m = (masks[i] = columnMask(src, i));
        const top = 32 - Math.clz32(m);
        if (top > this.maxTop) this.maxTop = top;
        // (a column that came to hold roofed air, a Block dig or an Erode cave, joins the tiles the sun is marched in)
        if (near[i] !== 1) this.joinNear(i, m);
        for (let z = 0; z < D; z++) {
          const o = (z * N + i) * 2;
          if (z < LAYERS && (m >>> z) & 1) data[o] = data[o + 1] = 0;
          else (data[o] = OPEN), (data[o + 1] = z >= top ? OPEN : 0);
        }
      }
    // what the change reaches: the cells beside it, and the sun's rays from down-sun
    const [sx, sy, sz] = SUN_TILE;
    const R: Rect = {
      x0: Math.max(0, Math.min(x0 - 1, sx > 0 ? x0 - SUN_REACH : x0)),
      x1: Math.min(W - 1, Math.max(x1 + 1, sx < 0 ? x1 + SUN_REACH : x1)),
      y0: Math.max(0, Math.min(y0 - 1, sy > 0 ? y0 - SUN_REACH : y0)),
      y1: Math.min(H - 1, Math.max(y1 + 1, sy < 0 ? y1 + SUN_REACH : y1)),
    };
    // 2. the sun: march every roofed cell, and every open cell beside one, toward the sun; away from the changed tiles
    // and the ones beside them, only the cells whose ray crosses them
    for (let y = R.y0; y <= R.y1; y++)
      for (let x = R.x0; x <= R.x1; x++) {
        const i = y * W + x;
        if (!near[i]) continue;
        const changed = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
        const top = this.top(i);
        const zTop = Math.min(D - 1, this.besideTop[i]);
        for (let z = 0; z <= zTop; z++) {
          const o = (z * N + i) * 2;
          if (data[o] === 0) continue;
          if (!changed) {
            // the tiles the ray's run can cross, a step over
            const run = Math.max(0, this.maxTop - z - 0.5) / sz + MARCH;
            const ex = Math.floor(x + 0.5 + sx * run);
            const ey = Math.floor(y + 0.5 + sy * run);
            if (Math.max(x, ex) < x0 || Math.min(x, ex) > x1 || Math.max(y, ey) < y0 || Math.min(y, ey) > y1) continue;
          }
          data[o + 1] = z >= top && !this.roofedBeside(x, y, z) ? OPEN : this.sunlit(x, y, z) ? OPEN : 0;
        }
      }
    return R;
  }

  /** Whether any of the 26 cells round (x, y, z) is roofed air. */
  private roofedBeside(x: number, y: number, z: number): boolean {
    const { W, H, D } = this;
    for (let dz = -1; dz <= 1; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz >= D) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (this.roofed(xx, yy, zz)) return true;
        }
      }
    }
    return false;
  }

  /** Whether a ray from the middle of cell (x, y, z) toward the sun leaves the land without meeting rock. */
  private sunlit(x: number, y: number, z: number): boolean {
    const { W, H, masks, maxTop } = this;
    const [sx, sy, sz] = SUN_TILE;
    let px = x + 0.5;
    let py = y + 0.5;
    let pz = z + 0.5;
    for (;;) {
      px += sx * MARCH;
      py += sy * MARCH;
      pz += sz * MARCH;
      if (pz >= maxTop || px < 0 || py < 0 || px >= W || py >= H) return true;
      if ((masks[Math.floor(py) * W + Math.floor(px)] >>> Math.floor(pz)) & 1) return false;
    }
  }
}

/** What the terrain shader takes from the volume for a point on a face (materials.ts `caveAt`, in the same steps):
 *  null where the face's own air (half a cell along its normal) is open (at or over its tile's top), or rock, or
 *  outside the map, so the baked light stands; else the filtered air (1 in air) and sun (0–1). World space as the
 *  view's: X = x, Y = height, Z = −y. */
export function caveSample(v: CaveLight | null, world: readonly [number, number, number], normal: readonly [number, number, number]): [number, number] | null {
  if (!v) return null;
  const q = [world[0] + normal[0] * 0.5, -world[2] - normal[2] * 0.5, world[1] + normal[1] * 0.5];
  const size = [v.W, v.H, v.D];
  const c = q.map(Math.floor);
  if (c.some((k, a) => k < 0 || k >= size[a])) return null;
  const N = v.W * v.H;
  const at = (x: number, y: number, z: number, ch: number) => v.data[(z * N + y * v.W + x) * 2 + ch];
  if (c[2] >= v.top(c[1] * v.W + c[0]) || at(c[0], c[1], c[2], 0) === 0) return null;
  // trilinear between the texel centres, clamped to the edge (the texture's LinearFilter)
  const f = q.map((k) => k - 0.5);
  const i0 = f.map(Math.floor);
  const t = f.map((k, a) => k - i0[a]);
  const out: [number, number] = [0, 0];
  for (let ch = 0; ch < 2; ch++) {
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const ix = Math.min(size[0] - 1, Math.max(0, i0[0] + (k & 1)));
      const iy = Math.min(size[1] - 1, Math.max(0, i0[1] + ((k >> 1) & 1)));
      const iz = Math.min(size[2] - 1, Math.max(0, i0[2] + ((k >> 2) & 1)));
      const w = (k & 1 ? t[0] : 1 - t[0]) * ((k >> 1) & 1 ? t[1] : 1 - t[1]) * ((k >> 2) & 1 ? t[2] : 1 - t[2]);
      s += w * at(ix, iy, iz, ch);
    }
    out[ch] = s / 255;
  }
  return out;
}
