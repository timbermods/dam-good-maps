// Where a placement aims (D491): the level of the ground the pointer sees, so an object, a source or the start goes
// where the player points in 3D (a cave's floor through its mouth or under the level cut, the ground under a ledge),
// and the core decides whether it may stand there. Pure.

import type { MapView, TileHit } from "../../render3d";
import { LAYERS } from "../../render3d/model";

/** Tile `i`'s voxels as a mask (bit z set where voxel z is solid), or undefined for a tile that is one plain run from
 *  the bottom (not listed in `columns`, the map's columns with terrain above terrain). */
export function columnMaskAt(columns: MapView["columns"], i: number): number | undefined {
  const t = columns.tiles;
  let lo = 0;
  let hi = t.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] === i) {
      if (columns.masks && columns.masks.length === t.length) return columns.masks[mid];
      let m = 0;
      for (let z = 0, o = mid * LAYERS; z < LAYERS; z++) if (columns.voxels[o + z]) m |= 1 << z;
      return m;
    }
    if (t[mid] < i) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Whether tile `i` shows ground at or under a layer cut at `cut` (D207): a plain tile whose top is at or under it, or a
 *  column whose lowest run's top is (a cave's floor under a roof that rises past the cut, the ground under a ledge). */
export function seenUnderCut(i: number, cut: number, heights: ArrayLike<number>, columns: MapView["columns"]): boolean {
  if (heights[i] <= cut) return true;
  const mask = columnMaskAt(columns, i);
  if (mask === undefined) return false;
  let z = 0;
  while (z < LAYERS && !((mask >>> z) & 1)) z++;
  while (z < LAYERS && (mask >>> z) & 1) z++;
  return z <= cut;
}

/** The level a placement names for a hit of the voxel pick (`TileHit.level`, `run`): the top of the run hit when it lies
 *  below the tile's top (`top`), undefined on the top itself, where a placement names no level and stands as it always
 *  has. `mask` is the tile's whole column (`columnMaskAt`; undefined on a plain tile, whose one run is its top).
 *
 *  Under a layer cut the pick's runs end at the cut: where rock crosses the cut (its cap) the run's real top is the
 *  level, as the cap is that run's. A hit on a roof's underside aims at the ground under it. */
export function aimedLevel(hit: TileHit | null, top: number, mask: number | undefined): number | undefined {
  if (!hit || hit.level === undefined || mask === undefined) return undefined;
  let level: number;
  if (hit.face === "bottom" && hit.run) {
    // (the ground under the roof: the top of the run below its underside, or the map's floor)
    let z = hit.run.bottom - 1;
    while (z >= 0 && !((mask >>> z) & 1)) z--;
    level = z + 1;
  } else if (hit.layer === undefined) level = hit.level;
  else {
    // (the real top of the run the voxel hit belongs to, the cut's cap or not)
    let z = hit.layer;
    while (z + 1 < LAYERS && (mask >>> (z + 1)) & 1) z++;
    level = z + 1;
  }
  return level < top ? level : undefined;
}

/** `aimedLevel` for a hit on a map of width `W`, from the page's heights and columns. */
export function aimOf(hit: TileHit | null, W: number, heights: ArrayLike<number>, columns: MapView["columns"]): number | undefined {
  if (!hit) return undefined;
  const i = hit.y * W + hit.x;
  return aimedLevel(hit, heights[i], columnMaskAt(columns, i));
}

/** Whether the start's 3 × 3 tiles round its middle (x, y) touch a cave or an overhang (a tile listed in `columns`):
 *  there the core's rule answers (D491: the start stays on open ground), not the page's own check. */
export function startRoofed(columns: MapView["columns"], W: number, H: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && columnMaskAt(columns, (y + dy) * W + x + dx) !== undefined) return true;
  return false;
}
