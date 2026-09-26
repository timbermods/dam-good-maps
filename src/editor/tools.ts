// What the editor's own tools share beside the brushes (EDITOR_PLAN §3, PLAN §20 D184): Source's
// options and the object it places, where an object stands when the pointer is on a tile, and the
// overlay the map shows its footprints, selections and problems in.

import { FOOTPRINTS, type Orientation } from "../core/format/footprints";
import type { ToolRequest } from "../worker/session";
import { DAM_OVERLAY } from "../render3d/palette";

/** Source's options: a source's water, clean or bad, and its strength in blocks per second
 *  (clean: one tile, at most 8; bad: 3 × 3, at most 72). */
export interface ToolOptions {
  sourceBad: boolean;
  sourceStrength: number;
  badwaterStrength: number;
}

/** A water source's strengths, blocks per second (one tile: at most 8, the game's most per tile),
 *  and a badwater source's (its 3 × 3 tiles: at most 72): the slider's steps, and scroll's. */
export const SOURCE_STRENGTHS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
export const BADWATER_STRENGTHS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 72];

export const DEFAULT_OPTIONS: ToolOptions = { sourceBad: false, sourceStrength: 1.5, badwaterStrength: 1 };

/** The Coordinates that centre a template's rotated footprint on the tile clicked. */
export function coordinatesAt(template: string, x: number, y: number, o: Orientation): [number, number] {
  const fp = FOOTPRINTS[template];
  if (!fp) return [x, y];
  const [sx, sy] = fp.size;
  const a = o === "Cw90" || o === "Cw270" ? sy : sx;
  const b = o === "Cw90" || o === "Cw270" ? sx : sy;
  const mx = x - Math.floor((a - 1) / 2);
  const my = y - Math.floor((b - 1) / 2);
  switch (o) {
    case "Cw0":
      return [mx, my];
    case "Cw90":
      return [mx, my + sx - 1];
    case "Cw180":
      return [mx + sx - 1, my + sy - 1];
    case "Cw270":
      return [mx + sy - 1, my];
  }
}

/** The source Source places at tile (x, y): a clean one on the tile, a bad one (3 × 3) round it. */
export function sourceRequest(o: ToolOptions, x: number, y: number): Extract<ToolRequest, { tool: "entity" }> {
  const s = o.sourceBad ? o.badwaterStrength : o.sourceStrength;
  const template = o.sourceBad ? "BadwaterSource" : "WaterSource";
  const [cx, cy] = coordinatesAt(template, x, y, "Cw0");
  return { tool: "entity", template, x: cx, y: cy, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: s, CurrentStrength: s } } };
}

// ---------------------------------------------------------------------------------- overlays

export type Rgba = [number, number, number, number];

/** A selection: its outline only, so its own ground shows through. */
export const SELECTED: Rgba = [255, 208, 90, 190];
export const MOVING: Rgba = [110, 214, 255, 150];
export const DRAWING: Rgba = [150, 235, 120, 140];
export const GOOD: Rgba = [80, 200, 90, 170];
export const BAD: Rgba = [230, 60, 50, 180];
/** Dam sites: alpha 255 draws them hatched light and dark with a dark rim (the 3D view), so they
 *  show on any ground or water in any colours (Map look, D114). */
export const DAM: Rgba = [...DAM_OVERLAY];
export const PROBLEM: Rgba = [230, 60, 50, 150];

export interface OverlayLayer {
  tiles: ArrayLike<number>;
  color: Rgba;
  /** Shift the tiles by (dx, dy) (a move preview). */
  dx?: number;
  dy?: number;
  /** Tint only the tiles on the edge of the set (a selection's outline). */
  outline?: boolean;
}

/** Paint the overlay texture: tint the tiles of each layer (later layers on top). */
export function paintOverlay(data: Uint8Array, W: number, H: number, layers: readonly OverlayLayer[]): void {
  data.fill(0);
  for (const l of layers) {
    const dx = l.dx ?? 0;
    const dy = l.dy ?? 0;
    let inSet: Uint8Array | null = null;
    if (l.outline) {
      inSet = new Uint8Array(W * H);
      for (let k = 0; k < l.tiles.length; k++) inSet[l.tiles[k]] = 1;
    }
    for (let k = 0; k < l.tiles.length; k++) {
      const i = l.tiles[k];
      if (inSet) {
        const ox = i % W;
        const oy = (i - ox) / W;
        const inner = ox > 0 && oy > 0 && ox < W - 1 && oy < H - 1 && inSet[i - 1] && inSet[i + 1] && inSet[i - W] && inSet[i + W];
        if (inner) continue;
      }
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 4;
      data[o] = l.color[0];
      data[o + 1] = l.color[1];
      data[o + 2] = l.color[2];
      data[o + 3] = l.color[3];
    }
  }
}
