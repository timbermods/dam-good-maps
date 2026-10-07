// The walking graph from the start and the falls of a map (D132 (5); docs/m9-design.md §5): how far a
// beaver walks over the whole map (`reachWalk`: blocked footprints and the built slopes), and the
// surface drops of side-by-side wet tiles (`fallsOf`). Ported from the design version 2 prototype
// (investigation/generative/v2/vertical.ts).

import { walkDistance, walkWorld, type WalkObject } from "./walk";

/** Walking distance from the start over the whole map (no distance limit). */
export function reachWalk(h: Uint8Array, W: number, H: number, objects: readonly WalkObject[], start: { x: number; y: number }): Float64Array {
  const { blocked, links } = walkWorld(objects, W, H);
  return walkDistance(h, W, H, blocked, links, start, 4 * (W + H));
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
