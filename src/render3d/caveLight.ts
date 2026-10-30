// Light under roofs (3D terrain step 2, part 2; D126, D280 (2), D497): which air is under a roof, for caves, overhangs
// and arches, from Erode's light volume (investigation/erode/core/mesher.ts `lightVolume`, as investigation/3d-view
// adopted it). The game lights a roofed space as it lights open ground (D497: Unity's Trilight ambient by the face's
// normal, unoccluded), so the only light a roof changes is the sun's, which reaches in only where a ray toward it finds
// no rock: the shaders march that ray through this volume (materials.ts `sunMarch`), whichever way the sun stands as
// it turns with the camera. Two bytes a cell, W × H × LIGHT_LEVELS cells (x fastest, then y, then the level), a 3D
// texture: R and G 255 in air (under a roof or open), 0 in rock (the shader's `roofedAir` reads it with the tile's
// top).
// The shader's rule (materials.ts `caveAt`, mirrored by `caveSample` for the tests): only a face whose own air is
// roofed takes the volume; in open air, and so on every map without terrain above terrain, the baked light is used
// exactly as before (tests/unit/caveLight.test.ts).
//
// Only roofed air needs any work, and roofed air is only in the tiles that are not one plain run from z = 0
// (`TerrainSource.columns`): a map without them has no volume at all (`CaveLight.build` gives null). After an edit
// only the edited tiles' cells are redone (`relight`): the same bytes as building the whole volume again. Pure
// TypeScript.

import { columnMask, type TerrainSource } from "./mesh";
import { LAYERS } from "./model";

/** Levels in the volume: the 23 layers and one of open sky over them. */
export const LIGHT_LEVELS = LAYERS + 1;

const OPEN = 255;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export class CaveLight {
  readonly W: number;
  readonly H: number;
  readonly D = LIGHT_LEVELS;
  /** RG bytes per cell (the texture's data). */
  readonly data: Uint8Array;
  /** Each tile's column mask (bit z: voxel z solid). */
  private readonly masks: Uint32Array;
  /** At least the highest top on the map, raised as edits raise the land (never lowered: it only bounds
   *  the rays): a ray toward the sun above it has left the land. The shader's march stops there. */
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

  /** The tiles in `rect` changed: redo their cells. Returns the tiles whose cells may have changed (every level), for
   *  the upload. */
  relight(src: TerrainSource, rect: Rect): Rect {
    const { W, H, D, data, masks } = this;
    const N = W * H;
    const x0 = Math.max(0, rect.x0);
    const y0 = Math.max(0, rect.y0);
    const x1 = Math.min(W - 1, rect.x1);
    const y1 = Math.min(H - 1, rect.y1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const m = (masks[i] = columnMask(src, i));
        const top = 32 - Math.clz32(m);
        if (top > this.maxTop) this.maxTop = top;
        for (let z = 0; z < D; z++) {
          const o = (z * N + i) * 2;
          data[o] = data[o + 1] = z < LAYERS && (m >>> z) & 1 ? 0 : OPEN;
        }
      }
    return { x0, y0, x1, y1 };
  }
}

/** What the terrain shader takes from the volume for a point on a face (materials.ts `caveAt`, in the same steps):
 *  null where the face's own air (half a cell along its normal) is open (at or over its tile's top), or rock, or
 *  outside the map, so the baked light stands; else the filtered air (1 in air, both channels). World space as the
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
