// How the camera frames a map of any size (D357, custom map sizes): the opening turn, the zoom limits and what a
// small map's framing must hold beyond its ground. Pure, so the headless tests can check them at 4x4 and 512x512.

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
