// Distance to a polyline (a river's path, a ridge's line): one rule for the land's field and the
// build's edge mouths.

import * as portable from "./portable";

/** Distance from (x, y) to the polyline through `pts` (Infinity with fewer than two points): each
 *  segment's nearest point by projection, clamped to the segment, the least squared distance, then
 *  one square root (portable.sqrt is exact, so it equals the least of each segment's distance). */
export function polyDist(x: number, y: number, pts: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const ax = pts[k][0];
    const ay = pts[k][1];
    const vx = pts[k + 1][0] - ax;
    const vy = pts[k + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * vx - x;
    const py = ay + t * vy - y;
    const dd = px * px + py * py;
    if (dd < best) best = dd;
  }
  return portable.sqrt(best);
}
