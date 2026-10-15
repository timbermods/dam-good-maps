// The level-slice cutaway (3D view, part 6; D207, D126): under a layer cut every voxel at or above the cut
// is gone. Through the cut the player sees down into caves and under overhangs, as in Timberborn's layer
// view; a cap is drawn at the cut only where solid rock crosses it.
//
// How it is drawn: the terrain's vertex shader folds everything above the cut down onto it (materials.ts,
// `w.y = min(w.y, slice)`), which gives a plain column exactly the clipped column's faces (its walls stop
// at the cut, its top lies on it). A column with terrain above terrain would get a lid at the cut over its
// cave (the roof run's top and underside folded down); the fragment shader drops a horizontal face at the
// cut wherever the voxel just below the cut is air (`cutFace` "gone"), so what is left is the clipped
// column's mesh: the cave's floor, its walls up to the cut, the undersides still below it. Nothing is
// remeshed when the level changes, so the level control stays a uniform. The light is the unsliced
// terrain's: the light volume (caveLight.ts) and the High look's shadows are never sliced.
//
// The picking agrees (pick.ts `pickTerrain` with `cut`: voxels at or above it are air, the cut a top where
// rock crosses it), and so do the Wand's `hasTopAt` and Select's ring (`aimedHeights` on the clipped masks):
// `tests/unit/cutaway.test.ts` casts rays against the faces drawn here. On a map without terrain above
// terrain the shader's branch is not compiled at all (`cutawayOn`): the same program as before.

import type { TerrainSource } from "./mesh";

/** What the terrain draws of a horizontal face that lies at a layer cut (`cut` ≥ 0) in a column (`mask`: bit z
 *  set when voxel z is solid; its top higher than the cut, or the face would not be at the cut): "gone" where the
 *  voxel just below the cut is air (a roof folded onto the cut over a cave: the cave shows), "cap" where solid
 *  rock crosses the cut (the hatched lid), "top" a run's own top at the cut (air above it). The map's floor counts
 *  as rock below level 0. The terrain shader's rule (materials.ts, `cutGone` and the hatch). */
export function cutFace(mask: number, cut: number): "gone" | "cap" | "top" {
  if (cut >= 1 && !((mask >>> (cut - 1)) & 1)) return "gone";
  return (mask >>> cut) & 1 ? "cap" : "top";
}

/** Whether a terrain needs the cutaway's shader branch: it has a column that is not one plain run from the
 *  bottom (the same test as the light volume, `CaveLight.build`). Elsewhere folding onto the cut is exact. */
export function cutawayOn(src: TerrainSource): boolean {
  return src.columns.size > 0;
}
