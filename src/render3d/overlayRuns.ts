// The overlay on one run (3D view, part 5): a selection taken on a run (the Wand on a cave's floor, a ledge under an
// overhang) names the ground at a level in each of its tiles (the page's `Selection.levels`), and is drawn on that
// ground: its tint and outline on the run's top and walls and on the water over it; the rest of the column (the roof
// over the cave, its underside, its walls) is drawn as the land outside the selection. Only a column with terrain
// above terrain is drawn this way; a plain column takes the overlay on its whole column, as every plain map does.
// Pure TypeScript besides the texture.

import type { DataTexture } from "three";
import { overlayTexture } from "./materials";
import { columnMask, type TerrainSource } from "./mesh";
import { LAYERS } from "./model";

/** The run of a column that holds the ground at `level` (`mask`: the column's voxels, bit z solid): the solid run whose
 *  voxels reach up to it (`bottom` < level ≤ `top`: the run topped at it, or one a layer cut at that level caps), or
 *  the map's floor under air at level 0 (`bottom` = `top` = 0); with `above`, the underside of the next run up (255:
 *  none, open sky). Null where the column has no ground at that level. */
export function runHolding(mask: number, level: number): { bottom: number; top: number; above: number } | null {
  const solid = (z: number) => z >= 0 && z < LAYERS && ((mask >>> z) & 1) === 1;
  let bottom: number;
  let top: number;
  if (level === 0) {
    if (solid(0)) return null;
    bottom = top = 0;
  } else {
    if (!solid(level - 1)) return null;
    bottom = level - 1;
    while (solid(bottom - 1)) bottom--;
    top = level;
    while (solid(top)) top++;
  }
  let above = top;
  while (above < LAYERS && !solid(above)) above++;
  return { bottom, top, above: above < LAYERS ? above : 255 };
}

/** The shaders' bytes (RGBA a tile, `overlayRuns`): R 255 where the tile's overlay names one run, G its top, B its
 *  bottom, A the underside of the run above it (255: none). `levels`: level + 1 a tile, 0 where none is named. Only
 *  columns with terrain above terrain are written; elsewhere, and where the column has no ground at the level, the
 *  overlay covers the whole column. Returns whether any tile names a run. */
export function overlayRunBytes(src: TerrainSource, levels: Uint8Array, out: Uint8Array): boolean {
  out.fill(0);
  let any = false;
  for (const i of src.columns.keys()) {
    const l = levels[i];
    if (!l) continue;
    const r = runHolding(columnMask(src, i), l - 1);
    if (!r) continue;
    out[i * 4] = 255;
    out[i * 4 + 1] = r.top;
    out[i * 4 + 2] = r.bottom;
    out[i * 4 + 3] = r.above;
    any = true;
  }
  return any;
}

/** The `overlayRuns` texture the renderer keeps: made when a selection first names a run on a map with terrain above
 *  terrain, rewritten when the selection or the columns change, the placeholder bound again when there is none. */
export class OverlayRuns {
  private tex: DataTexture | null = null;
  private levels: Uint8Array | null = null;
  private readonly placeholder: DataTexture;

  constructor(private readonly uniform: { value: DataTexture }) {
    this.placeholder = uniform.value;
  }

  /** The levels a selection names (level + 1 a tile, 0 none; null: none), on the map's terrain as it stands. */
  set(src: TerrainSource | null, levels: Uint8Array | null): void {
    this.levels = levels;
    this.refresh(src);
  }

  /** The columns changed (an edit reshaped a roof): the runs named are found again. */
  refresh(src: TerrainSource | null): void {
    const levels = this.levels;
    if (!src || !levels || levels.length !== src.W * src.H || src.columns.size === 0) {
      this.uniform.value = this.placeholder;
      return;
    }
    if (!this.tex || this.tex.image.width !== src.W || this.tex.image.height !== src.H) {
      this.tex?.dispose();
      this.tex = overlayTexture(src.W, src.H);
    }
    const any = overlayRunBytes(src, levels, this.tex.image.data as Uint8Array);
    this.tex.needsUpdate = true;
    this.uniform.value = any ? this.tex : this.placeholder;
  }

  dispose(): void {
    this.tex?.dispose();
    this.tex = null;
    this.levels = null;
    this.uniform.value = this.placeholder;
  }
}
