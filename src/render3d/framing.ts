// How the camera frames a map of any size (D357, custom map sizes): the opening turn, the zoom limits and what a
// small map's framing must hold beyond its ground. Pure, so the headless tests can check them at 4x4 and 512x512.

import { orbitEye } from "./cameraClamp";
import type { EntityView } from "./model";

/** The game's default camera: turned 30 degrees east of north (Map look, D86). */
export const DEFAULT_YAW = -Math.PI / 6;

/** A map at least this many times longer than wide is turned to lie along the view's long side (a strip drawn at the
 *  default turn is a thin slanted line over a quarter of the view). The standard shapes and the wide 2:1 valley keep the
 *  default. */
export const LONG_MAP_RATIO = 3;

/** A little off square-on, so a long map still reads as a solid and not a flat band. */
const LONG_MAP_SKEW = 0.2;

/** The turn Reset view and a new map open with: the default, except for a long map, which lies along the view's
 *  longer side (`aspect`: the canvas's width over its height). East-west maps then run left to right with north behind
 *  (turn 0); north-south maps run left to right with north to the left (turn -90 degrees), or up the view on a tall canvas. */
export function openingYaw(W: number, H: number, aspect: number): number {
  const long = Math.max(W, H);
  const short = Math.min(W, H);
  if (long < LONG_MAP_RATIO * short) return DEFAULT_YAW;
  const eastWest = W >= H;
  const wide = aspect >= 1;
  // the long axis along the view's long side: east-west along the width needs turn 0, north-south needs a quarter turn
  const quarter = eastWest === wide ? 0 : -Math.PI / 2;
  return quarter - LONG_MAP_SKEW;
}

/** The nearest and farthest the camera's distance may be: the zoom's limits. The farthest is three map lengths, and
 *  never less than a view that holds the smallest maps whole with their objects. */
export function zoomLimits(W: number, H: number): { min: number; max: number } {
  return { min: 6, max: Math.max(Math.max(W, H) * 3, 48) };
}

/** The camera's new target when the wheel zooms about a point of the ground (the point under the pointer): the
 *  target moves toward it by the same ratio as the distance, so the point stays under the pointer. Pure. `hit` and
 *  `target` are scene points (x east, y up, z south); the target stays inside the map (`W`, `H`) and between the
 *  floor and `maxY`. At the zoom's limit (the distance does not change) nothing moves, not even the target. */
export function zoomTargetToward(
  target: readonly [number, number, number],
  hit: readonly [number, number, number],
  oldDistance: number,
  newDistance: number,
  bounds: { W: number; H: number; maxY: number },
): [number, number, number] {
  if (!(oldDistance > 0) || !(newDistance > 0) || newDistance === oldDistance) return [target[0], target[1], target[2]];
  const r = newDistance / oldDistance;
  const at = (k: number) => hit[k] + (target[k] - hit[k]) * r;
  return [Math.min(bounds.W, Math.max(0, at(0))), Math.min(bounds.maxY, Math.max(0, at(1))), Math.min(0, Math.max(-bounds.H, at(2)))];
}

/** The nearest a zoom in brings the camera's eye to the ground under the pointer, in tiles: twice the clearance it keeps
 *  from rock (cameraClamp.ts), so the zoom stops short of the surface and never pushes the eye into it. */
export const ZOOM_NEAREST = 1.6;

/** The distance a zoom in about a point goes to (`to`, from `from`), stopping short of that point: the eye, `gap` from
 *  it now, comes no nearer to it than `nearest` (the eye scales toward it by the distance's ratio, as
 *  `zoomTargetToward` moves the target). A zoom out, or one already that near, keeps `to` and `from`. Pure. */
export function zoomStopShort(from: number, to: number, gap: number, nearest = ZOOM_NEAREST): number {
  if (!(to < from) || !(gap > 0)) return to;
  return Math.max(to, from * Math.min(1, nearest / gap));
}

/** One step of the wheel (or + and -) by `factor` (below 1 in), about `hit()`, the ground under the pointer (null: about
 *  the screen's centre): the view's new distance and target, or null where nothing moves (the zoom's limit). `held` is
 *  where the rock holds the camera along its arm (cameraClamp.ts `armReach`; the view's distance where nothing holds
 *  it). A zoom in starts from where the camera is drawn (else the first turns in would do nothing until the distance
 *  came down to it) and stops short of the ground under the pointer; a zoom out starts from the view's own distance, so
 *  it carries the camera's place on out of the rock that held it, as far as it would go without rock. Pure: the
 *  renderer's `zoom` is this. */
export function zoomStep(
  view: { mode: "orbit" | "top"; target: readonly [number, number, number]; yaw: number; pitch: number; distance: number },
  factor: number,
  held: number,
  hit: () => { point: readonly [number, number, number]; maxY: number } | null,
  limits: { min: number; max: number },
  bounds: { W: number; H: number },
): { distance: number; target: [number, number, number] } | null {
  const from = factor < 1 && held < view.distance ? Math.max(limits.min, held) : view.distance;
  // (a framing wider than the limit, the whole map in a wide window, is not snapped to it by the first turn)
  let distance = Math.min(Math.max(limits.max, from), Math.max(limits.min, from * factor));
  if (distance === from) return null;
  const at = hit();
  // in, it stops short of the ground under the pointer
  if (at && view.mode === "orbit") distance = zoomStopShort(from, distance, Math.hypot(...orbitEye(view.target, view.yaw, view.pitch, from).map((c, k) => c - at.point[k])));
  if (distance === from) return null;
  if (!at) return { distance, target: [view.target[0], view.target[1], view.target[2]] };
  const target = zoomTargetToward(view.target, at.point, from, distance, { W: bounds.W, H: bounds.H, maxY: at.maxY });
  // (the top-down view looks straight down: its height is not part of what the pointer sees)
  if (view.mode === "top") target[1] = view.target[1];
  return { distance, target };
}

/** Whether a point of the ground plane is on the map (with a margin of a few tiles): a pointer that misses the terrain
 *  zooms about the plane only there. Just below the horizon the plane is thousands of tiles away, and a zoom about it
 *  would throw the view across the map. `point` is a scene point (z south). */
export function onMapPlane(point: readonly [number, number, number], W: number, H: number, margin = 8): boolean {
  return point[0] >= -margin && point[0] <= W + margin && point[2] <= margin && point[2] >= -H - margin;
}

/** Maps up to this long a side are framed with their objects, which are a real share of them (a start is a building
 *  seven levels high on a 4-tile map). Larger maps frame by their ground alone, as they always have. */
export const FRAME_OBJECTS_BELOW = 64;

/** The tops of the objects (x, y, z in the scene's own axes, three to a point), for a small map's framing. */
export function objectOutline(W: number, H: number, e: EntityView | null): number[] {
  if (!e || !e.count || Math.max(W, H) >= FRAME_OBJECTS_BELOW) return [];
  const pts: number[] = [];
  for (let k = 0; k < e.count; k++) {
    const top = e.z[k] + (e.templates[e.template[k]] === "StartingLocation" ? 7 : 2.5);
    pts.push(e.x[k] + 0.5, top, -(e.y[k] + 0.5));
  }
  return pts;
}

/** The perspective camera's vertical field of view (degrees), and the top-down camera's half-height as a fraction of the
 *  view's distance: together they say how far apart the two views' zoom scales sit. */
export const PERSP_FOV_DEG = 40;
export const ORTHO_HALF_PER_DISTANCE = 0.42;

/** The distance that shows the same ground scale at the middle of the view in the other mode (D492): the angled view
 *  at `distance` spans 2 * distance * tan(fov / 2) of ground across the canvas's height at its centre (across its
 *  width, whatever the tilt); the top-down view spans 2 * 0.42 * distance. Pure, and its own inverse going back. */
export function distanceForMode(distance: number, to: "orbit" | "top"): number {
  const k = (2 * Math.tan((PERSP_FOV_DEG * Math.PI) / 360)) / (2 * ORTHO_HALF_PER_DISTANCE);
  return to === "top" ? distance * k : distance / k;
}

/** The view after switching mode, keeping the point at the centre and the zoom (D492): only the tilt changes, the target,
 *  the turn and the pitch stay and the distance is converted so the ground scale at the centre stays. The distance is held
 *  to the zoom's limits `limits`, so it is never nearer than the wheel goes (a camera inside a cliff has no distance), but a
 *  distance already past the farthest limit (a wide framing) is not snapped in. */
export function viewAfterModeSwitch<V extends { mode: "orbit" | "top"; distance: number }>(view: V, mode: "orbit" | "top", limits: { min: number; max: number }): V {
  if (view.mode === mode) return view;
  const distance = Math.min(Math.max(limits.max, view.distance), Math.max(limits.min, distanceForMode(view.distance, mode)));
  return { ...view, mode, distance };
}
