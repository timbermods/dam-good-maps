// Carve clicked at the map's edge (PLAN §20 D360 (1a), from D356's check): a river unleashed where its
// water would run straight off the map carved almost nothing. Such a click carves inward instead: the
// river is aimed into the map (cutting through rises, as a drawn river does), toward the lowest ground
// the land offers that way, so its channel shows even at low Power and its water runs into the map.
// A plain function of the ground; the editor's worker turns the click into that aimed carve, and the
// operation keeps it, so projects replay exactly.

import * as portable from "../../math/portable";
import { drainage } from "../drainage";

/** How near the edge (tiles) a click is looked at. */
export const EDGE_NEAR = 8;

/** Whether water at `origin` runs off the map within a few tiles (its drainage reaches the edge). */
export function runsOffEdge(heights: ArrayLike<number>, W: number, H: number, origin: number): boolean {
  const x = origin % W;
  const y = Math.floor(origin / W);
  const d = Math.min(x, y, W - 1 - x, H - 1 - y);
  if (d > EDGE_NEAR) return false;
  if (d === 0) return true;
  const { rcv } = drainage(heights, W, H, 0.0001);
  let i = origin;
  for (let k = 0; k <= d + 4; k++) {
    if (rcv[i] < 0) {
      const ix = i % W;
      const iy = Math.floor(i / W);
      return ix === 0 || iy === 0 || ix === W - 1 || iy === H - 1;
    }
    i = rcv[i];
  }
  return false;
}

/** Where a river clicked at `origin` should aim into the map, or null when its water runs into the map
 *  by itself. Inward from the nearest edge, within 60° of straight in, the lowest ground at the
 *  river's reach (longer with Power); ties go to the straightest. */
export function edgeAim(heights: ArrayLike<number>, W: number, H: number, origin: number, power: number): number | null {
  if (!runsOffEdge(heights, W, H, origin)) return null;
  const x = origin % W;
  const y = Math.floor(origin / W);
  // the inward direction: away from the nearest edge (a corner: away from both)
  const dl = x;
  const dr = W - 1 - x;
  const dt = y;
  const db = H - 1 - y;
  const near = Math.min(dl, dr, dt, db);
  let nx = (dl === near ? 1 : 0) - (dr === near ? 1 : 0);
  let ny = (dt === near ? 1 : 0) - (db === near ? 1 : 0);
  const n = portable.hypot(nx, ny) || 1;
  nx /= n;
  ny /= n;
  const inward = portable.atan2(ny, nx);
  const reach = Math.min(Math.min(W, H) * 0.45, 18 + 0.5 * power);
  let best: number | null = null;
  let score = Infinity;
  for (let k = -4; k <= 4; k++) {
    const a = inward + (k * Math.PI) / 12;
    const ex = Math.round(x + portable.cos(a) * reach);
    const ey = Math.round(y + portable.sin(a) * reach);
    if (ex < 2 || ey < 2 || ex > W - 3 || ey > H - 3) continue;
    const s = heights[ey * W + ex] + Math.abs(k) * 0.01;
    if (s < score) {
      score = s;
      best = ey * W + ex;
    }
  }
  return best;
}
