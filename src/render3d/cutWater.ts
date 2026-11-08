// Water under a layer cut (D207; 3D view, part 6 and "Water sliced by the cut"). Every voxel at or above the cut is
// gone, the water's too: a lake or a river whose surface stands over the cut and whose floor lies below it is drawn
// sliced, its water up to the cut, its surface lying flat on the cut, the bed under it seen through it as under any
// water. A column whose floor is at the cut or above it is gone with the ground it stands on.
//
// How it is drawn: the water's vertex shader (materials.ts `waterMaterial`) folds such a column's top and sides down
// onto the cut, as the terrain's folds the ground, from each vertex's own column (its floor, `WaterMeshData.cut`): the
// top lies on the cut, shallower by what the cut took away (`cutCornerDepth`), and its sides stop at the cut. A gone
// column's sides fold flat, so one hanging below its floor (to lower water in front of a cliff) leaves nothing. Nothing
// is remeshed when the level changes: the cut stays one uniform. A fall is the slope of the water below it (D154 as
// amended 2026-11-08; fallSlope.ts), a top whose vertices stand over their own column's surface: each is sliced onto
// the cut by its own height and floor, so a fall under the cut lies flat on it, its depth there what is seen behind it from the cut, as
// from its own height (`cutSlopeDepth`: against the cliff, shallow); the Flow view's streaks follow the same rule (motion.ts). The terrain counts a top as under water exactly where this draws water over it
// (`bedAtCut`; materials.ts `soilOf` and the run tops' `groundAt`), so a sliced lake's bed reads as a bed.
//
// These functions are the shaders' rules in plain code, for the tests (tests/unit/cutWater.test.ts).

import { OPENING } from "../core/analysis/opening";
import type { SurfaceWater } from "./model";

/** How far over the cut a water surface may stand and still be drawn whole (the water's shader, `soilOf`): a film
 *  lying on ground at the cut is drawn as it is. */
export const CUT_SLACK = 0.05;

/** Where a water column with its floor at `floor` and its surface at `surface` is drawn under a cut at `cut` (null: no
 *  cut): at its own surface where that stands at most `CUT_SLACK` over the cut; at the cut where its floor is below the
 *  cut (the column sliced); nowhere (null) where its floor is at the cut or above it. */
export function surfaceAtCut(floor: number, surface: number, cut: number | null): number | null {
  if (cut === null || surface <= cut + CUT_SLACK) return surface;
  return floor < cut ? cut : null;
}

/** The depth a top's corner is drawn with when its column is sliced from `surface` down to `drawn`: the corner's depth
 *  (`depth`, shared with the water round the corner, dry ground counting as none: waterMesh.ts `corner`) less what the
 *  cut took off the water among them (`share`, the corner's wet share), never below none. Where every tile round the
 *  corner is the same water, its mean depth below the cut, so neighbouring tops still meet at their corners. */
export function cutCornerDepth(depth: number, share: number, surface: number, drawn: number): number {
  return Math.max(0, depth - (surface - drawn) * share);
}

/** The tangent of the game's camera's pitch (its opening's, 60° below the horizon: core/analysis/opening.ts), for a fall's
 *  slope's seen depth (fallSlope.ts `slopeHeights`, and `cutSlopeDepth` under the cut). */
export const VIEW_TAN = Math.tan((OPENING.pitch * Math.PI) / 180);

/** The cut share a fall's slope vertex carries (one raised over its own surface, fallSlope.ts) in place of its wet
 *  share: under −0.5 (`SLOPE_SHARE` or less), so the water's shader knows it, and holding what its seen depth is made
 *  of, so the shader can see it again from the cut (`cutSlopeDepth`): whether it is inner (a third in from the side it
 *  rose to) and how far its height stands over the floor of the water it rose to (`back`, from −0.5 up to 63). */
export const SLOPE_SHARE = -1;
export function slopeCutShare(inner: boolean, back: number): number {
  return SLOPE_SHARE - (inner ? 64 : 0) - (Math.min(63, Math.max(-0.5, back)) + 0.5);
}

/** The depth a fall's slope vertex at `height`, its cut share `share` (`slopeCutShare`), over a floor at `floor` is
 *  drawn with when sliced onto the cut at `drawn`: what is seen behind it from there, as `slopeHeights` sees it from
 *  its height. The view from the cut toward the step drops a third × tan(pitch) by the side it rose to where it is
 *  inner (none at the edge): it meets the cliff there where the upper water's floor stands over that (most often, the
 *  cut being below the upper floor: shallow, as the uncut slope's lip), else it goes on into the upper water to its
 *  floor; never deeper than the cut over its own floor. */
export function cutSlopeDepth(floor: number, height: number, share: number, drawn: number): number {
  const v = SLOPE_SHARE - share;
  const u = v > 63.75 ? VIEW_TAN / 3 : 0;
  const back = height - ((v % 64) - 0.5);
  return Math.max(0.05, Math.min(drawn - floor, Math.max(u, drawn - back)));
}

/** Whether ground whose top is at `top`, with water standing on it to `surface` (NaN: dry), is drawn as a bed under
 *  water under a cut at `cut` (null: no cut): where the water over it is drawn (`surfaceAtCut`), its floor the top. */
export function bedAtCut(top: number, surface: number, cut: number | null): boolean {
  return surface === surface && surfaceAtCut(top, surface, cut) !== null;
}

/** The water a tool stands on at tile `i` (a force's cursor, `pickSurface`; its ring): the tile's surface water as
 *  drawn under a cut at `cut` (null: no cut), from the water view alone, never from a drawn mesh, so it is the same
 *  whether or not the water's chunk is meshed yet; null where there is none to stand on (dry, a film, or the cut took it
 *  all). With no cut, the surface wherever the water is over 0.05 deep, as before the cut drew water. */
export function waterLevelAt(sw: Pick<SurfaceWater, "surface" | "floor" | "depth">, i: number, cut: number | null): number | null {
  return sw.depth[i] > 0.05 ? surfaceAtCut(sw.floor[i], sw.surface[i], cut) : null;
}

/** The level a force's ring lies on at tile `i`: the ground (at most the cut), or the water drawn over it
 *  (`waterLevelAt`). */
export function ringLevelAt(heights: ArrayLike<number>, sw: Pick<SurfaceWater, "surface" | "floor" | "depth">, i: number, cut: number | null): number {
  const top = cut === null ? heights[i] : Math.min(heights[i], cut);
  const water = waterLevelAt(sw, i, cut);
  return water === null ? top : Math.max(top, water);
}
