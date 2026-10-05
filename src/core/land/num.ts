// Small exact helpers for the land's processes (PLAN §2.1, D15): only + − × ÷, portable.sqrt, floor,
// round, abs, min and max touch output. Angles come from the 8 flow directions or from the
// deterministic sine in math/detmath.ts. Ported from the M9 design prototype
// (investigation/generative/proto/num.ts).

import * as portable from "../math/portable";
import { cosDet, PI, sinDet } from "../math/detmath";

export const SQRT1_2 = portable.sqrt(0.5);

/** The 8 flow directions (PLAN §7.1), as unit vectors (x east, y north), east first, counter-clockwise. */
export const DIRS8: readonly (readonly [number, number])[] = [
  [1, 0], [SQRT1_2, SQRT1_2], [0, 1], [-SQRT1_2, SQRT1_2], [-1, 0], [-SQRT1_2, -SQRT1_2], [0, -1], [SQRT1_2, -SQRT1_2],
];

/** A smooth bump: 1 at s = 0, 0 from s = 1 on, (1 − s²)². */
export function bump(s: number): number {
  if (s >= 1) return 0;
  const q = 1 - s * s;
  return q * q;
}

/** A unit vector at `turns` of a full turn (deterministic sine). */
export function unit(turns: number): [number, number] {
  return [cosDet(2 * PI * turns), sinDet(2 * PI * turns)];
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return portable.sqrt(dx * dx + dy * dy);
}

/** The value at fraction `p` of a sorted array (floor index), as the prototype reads percentiles. */
export function pctSorted(sorted: ArrayLike<number>, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}
