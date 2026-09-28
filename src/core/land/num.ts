// Small exact helpers for the land's processes (PLAN §2.1, D15): only + − × ÷, Math.sqrt, floor,
// round, abs, min and max touch output. Angles come from the 8 flow directions or from the
// deterministic sine in math/detmath.ts. Ported from the M9 design prototype
// (investigation/generative/proto/num.ts).

import { cosDet, PI, sinDet } from "../math/detmath";

export const SQRT1_2 = Math.sqrt(0.5);

/** The 8 flow directions (PLAN §7.1), as unit vectors (x east, y north), east first, counter-clockwise. */
export const DIRS8: readonly (readonly [number, number])[] = [
  [1, 0], [SQRT1_2, SQRT1_2], [0, 1], [-SQRT1_2, SQRT1_2], [-1, 0], [-SQRT1_2, -SQRT1_2], [0, -1], [SQRT1_2, -SQRT1_2],
];
export const DIR_NAMES = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];

/** The four side-to-side neighbours. */
export const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

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
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from (x, y) to the segment a–b. */
export function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return dist(x, y, ax + t * vx, ay + t * vy);
}

/** Distance from (x, y) to a polyline. */
export function polyDist(x: number, y: number, pts: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const d = segDist(x, y, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Rounded to two decimals. */
export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The value at fraction `p` of a sorted array (floor index), as the prototype reads percentiles. */
export function pctSorted(sorted: ArrayLike<number>, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}
