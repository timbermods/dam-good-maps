// The walking graph from the start and the falls of a map (D132 (5); docs/m9-design.md §5): how far a
// beaver walks over the whole map (`reachWalk`: blocked footprints and the built slopes), and the
// surface drops of side-by-side wet tiles (`fallsOf`). Ported from the design version 2 prototype
// (investigation/generative/v2/vertical.ts).

import { walkDistance } from "./walk";
import { footprintTiles, FOOTPRINTS, slopeHighSide, type Orientation } from "../format/footprints";
import { WALK_BLOCKERS } from "../validate/playability";

export interface Obj {
  template: string;
  x: number;
  y: number;
  z?: number;
  orientation?: Orientation | string;
}

export function slopeLinks(objects: readonly Obj[], W: number, H: number): [number, number][] {
  const links: [number, number][] = [];
  for (const o of objects) {
    if (o.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(o.orientation as Orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([o.y * W + o.x, hy * W + hx]);
  }
  return links;
}

export function blockedOf(objects: readonly Obj[], W: number, H: number): Uint8Array {
  const blocked = new Uint8Array(W * H);
  for (const o of objects) {
    if (!WALK_BLOCKERS.has(o.template) || !FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o as never)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  return blocked;
}

/** Walking distance from the start over the whole map (no distance limit). */
export function reachWalk(h: Uint8Array, W: number, H: number, objects: readonly Obj[], start: { x: number; y: number }): Float64Array {
  return walkDistance(h, W, H, blockedOf(objects, W, H), slopeLinks(objects, W, H), start, 4 * (W + H));
}

/** Surface drops of 1.5 levels or more between side-by-side wet tiles (falls), per upper tile. */
export function fallsOf(h: ArrayLike<number>, D: ArrayLike<number>, W: number, H: number, min = 1.5): { i: number; drop: number }[] {
  const out: { i: number; drop: number }[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(D[i] >= 0.1)) continue;
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!(D[j] >= 0.1)) continue;
        const d = h[i] + D[i] - (h[j] + D[j]);
        if (d > best) best = d;
      }
      if (best >= min) out.push({ i, drop: Math.round(best * 100) / 100 });
    }
  return out;
}
