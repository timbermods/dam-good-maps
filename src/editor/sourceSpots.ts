// The map's water and badwater sources as the page's tools see them (PLAN §20 D249): where each one
// stands, its tiles, which one the pointer targets, and which ones a brush with **Clear sources**
// presses on.
//
// - Easy to hit: the pointer over water or bare ground within about two tiles of a source targets
//   it, above or under water; a direct hit on any other object wins (a tree on a bank is still the
//   tree); the nearest source wins.
// - A brush with Clear sources takes every source with a tile under the brush (the same tiles the
//   stroke presses on: `dabPresses`, `markBrushTiles`).

import { dabPresses, type BrushParams } from "../core/features/raster/brush";
import { footprintTiles, type Orientation } from "../core/format/footprints";
import { ORIENTATION_NAMES, type EntityView } from "../render3d/model";

export interface SourceSpot {
  /** The object's index in the page's objects. */
  k: number;
  /** Where it stands (its Coordinates tile) and that tile's index. */
  x: number;
  y: number;
  corner: number;
  bad: boolean;
  /** Its tiles (a badwater source covers 3 × 3), as indices, and their rectangle [x0, y0, x1, y1]. */
  tiles: number[];
  rect: [number, number, number, number];
}

/** How far from a source the pointer still targets it, in tiles (by the larger of the two
 *  distances to its nearest tile). */
export const SOURCE_REACH = 2;

export const isSource = (template: string) => template === "WaterSource" || template === "BadwaterSource";

/** Every water and badwater source on the map. */
export function sourceSpots(e: EntityView, W: number, H: number): SourceSpot[] {
  const out: SourceSpot[] = [];
  for (let k = 0; k < e.count; k++) {
    const template = e.templates[e.template[k]];
    if (!isSource(template)) continue;
    const tl = footprintTiles(template, { template, x: e.x[k], y: e.y[k], z: 0, orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: false }).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
    if (!tl.length) continue;
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (const [x, y] of tl) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    out.push({ k, x: e.x[k], y: e.y[k], corner: e.y[k] * W + e.x[k], bad: template === "BadwaterSource", tiles: tl.map(([x, y]) => y * W + x), rect: [x0, y0, x1, y1] });
  }
  return out;
}

/** The source the pointer on tile (x, y) targets (D249), or null: one standing there; else, unless
 *  another object stands there (`covered`), the nearest within `SOURCE_REACH` tiles. */
export function targetSource(spots: readonly SourceSpot[], x: number, y: number, W: number, covered: boolean): SourceSpot | null {
  const i = y * W + x;
  let best: SourceSpot | null = null;
  let bestD = Infinity;
  for (const s of spots) {
    if (s.tiles.includes(i)) return s;
    if (covered) continue;
    const [x0, y0, x1, y1] = s.rect;
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
    if (Math.max(dx, dy) > SOURCE_REACH) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** The sources with a tile among `tiles`. */
export function sourcesOn(spots: readonly SourceSpot[], tiles: Iterable<number>): SourceSpot[] {
  const want = new Set(tiles);
  return spots.filter((s) => s.tiles.some((i) => want.has(i)));
}

/** The sources a brush pressing at these dabs (quarter tiles: [x0, y0, x1, y1, …]) takes with Clear
 *  sources on. */
export function sourcesPressed(spots: readonly SourceSpot[], p: Pick<BrushParams, "size" | "shape" | "precise">, dabs: ArrayLike<number>, W: number): SourceSpot[] {
  const reach = Math.ceil(p.size) + 1;
  return spots.filter((s) => {
    const [x0, y0, x1, y1] = s.rect;
    for (let k = 0; k + 1 < dabs.length; k += 2) {
      const cx = dabs[k];
      const cy = dabs[k + 1];
      const tx = Math.floor(cx / 4);
      const ty = Math.floor(cy / 4);
      if (tx < x0 - reach || tx > x1 + reach || ty < y0 - reach || ty > y1 + reach) continue;
      for (const i of s.tiles) if (dabPresses(p, cx, cy, i % W, Math.floor(i / W))) return true;
    }
    return false;
  });
}
