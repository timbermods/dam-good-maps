// Water under a layer cut (D207; 3D view, part 6 and "Water sliced by the cut"). Every voxel at or above the cut is
// gone, the water's too: a lake or a river whose surface stands over the cut and whose floor lies below it is drawn
// sliced, its water up to the cut, its surface lying flat on the cut, the bed under it seen through it as under any
// water. A column whose floor is at the cut or above it is gone with the ground it stands on.
//
// How it is drawn: the water's vertex shader (materials.ts `waterMaterial`) folds such a column's top and sides down
// onto the cut, as the terrain's folds the ground, from each vertex's own column (its floor, `WaterMeshData.cut`): the
// top lies on the cut, shallower by what the cut took away (`cutCornerDepth`), and its sides stop at the cut. A gone
// column's sides fold flat, so one hanging below its floor (to lower water in front of a cliff) leaves nothing. Nothing
// is remeshed when the level changes: the cut stays one uniform. A fall whose lip stands over the cut is gone; its
// landing stays where its pool is below the cut (`fallSheetCut`). The ribbons and the Flow view's streaks follow the
// same rule (motion.ts). The terrain counts a top as under water exactly where this draws water over it
// (`bedAtCut`; materials.ts `soilOf` and the run tops' `groundAt`), so a sliced lake's bed reads as a bed.
//
// These functions are the shaders' rules in plain code, for the tests (tests/unit/cutWater.test.ts).

/** How far over the cut a water surface may stand and still be drawn whole (the water's, the falls' and the ribbons'
 *  shaders, `soilOf`): a film lying on ground at the cut is drawn as it is. */
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

/** Whether ground whose top is at `top`, with water standing on it to `surface` (NaN: dry), is drawn as a bed under
 *  water under a cut at `cut` (null: no cut): where the water over it is drawn (`surfaceAtCut`), its floor the top. */
export function bedAtCut(top: number, surface: number, cut: number | null): boolean {
  return surface === surface && surfaceAtCut(top, surface, cut) !== null;
}

/** What a fall draws under a cut at `cut` (null: no cut), its lip at `lip` (the higher end's) and its pool at `pool`:
 *  "whole" where its lip is within `CUT_SLACK` of the cut or below; "landing" (its splash and crown only) where the
 *  lip stands over the cut and the pool not; "none" where the pool stands over the cut too. */
export function fallSheetCut(lip: number, pool: number, cut: number | null): "whole" | "landing" | "none" {
  if (cut === null || lip <= cut + CUT_SLACK) return "whole";
  return pool <= cut + CUT_SLACK ? "landing" : "none";
}
