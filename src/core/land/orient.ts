// The map's orientation (M9b; PLAN §20 D275 (2)): flow-direction variety comes from turning or
// mirroring each map's land into one of its 8 orientations, not from separate machinery. The land the
// processes made is turned right after it is made, so everything found on it afterwards (the rivers
// and their edges, the start, the objects) is found on the turned land. A square map takes any of the
// 8, drawn evenly from a stream of its own, so all 8 appear and none takes more than its share; a map
// that is not square takes one of the 4 that keep its sides (as it is, turned half round, or mirrored
// either way).

import { stream } from "../math/rng";
import { DIRS8 } from "./num";

/** 0–3: turned 0, 90, 180 or 270 degrees counter-clockwise; +4: mirrored east to west first. */
export type Orientation = number;

export const ORIENTATION_NAMES = ["as made", "turned a quarter", "turned half round", "turned three quarters", "mirrored", "mirrored, turned a quarter", "mirrored, turned half round", "mirrored, turned three quarters"];

/** The orientation for a map's genome `k` (each new land draws its own). */
export function orientationOf(seed: number, k: number, W: number, H: number): Orientation {
  const r = stream(seed, "orientation", k).int(0, 8);
  // (a map that is not square: the four that keep its sides, 0, 2, 4, 6)
  return W === H ? r : (r >> 1) << 1;
}

/** Where tile (x, y) of the land as made lands after orientation `o`. */
export function orientXY(x: number, y: number, W: number, H: number, o: Orientation): [number, number] {
  let px = o & 4 ? W - 1 - x : x;
  let py = y;
  for (let r = 0; r < (o & 3); r++) {
    // a quarter turn counter-clockwise (square maps only)
    const nx = W - 1 - py;
    py = px;
    px = nx;
  }
  return [px, py];
}

/** The land turned into orientation `o`. */
export function orientField(E: Float64Array, W: number, H: number, o: Orientation): Float64Array {
  if (o === 0) return E;
  const out = new Float64Array(E.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [px, py] = orientXY(x, y, W, H, o);
      out[py * W + px] = E[y * W + x];
    }
  return out;
}

/** A flow direction (one of the 8, DIRS8's index) after orientation `o`. */
export function orientDir(d: number, o: Orientation): number {
  let [fx, fy] = DIRS8[d];
  if (o & 4) fx = -fx;
  for (let r = 0; r < (o & 3); r++) [fx, fy] = [-fy, fx];
  let best = 0;
  let bd = Infinity;
  DIRS8.forEach(([ax, ay], k) => {
    const dd = (ax - fx) * (ax - fx) + (ay - fy) * (ay - fy);
    if (dd < bd) {
      bd = dd;
      best = k;
    }
  });
  return best;
}
