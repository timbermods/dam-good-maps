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

/** A standing form: a stack, butte, mesa or peak standing 5 levels or more over the ground 7 tiles
 *  round it, on at most `most` tiles: the landmark intention's reading (land/intentions.ts), the
 *  opening shot's (analysis/opening.ts, D493) and Showcase mode's. */
export interface StandingForm {
  /** Its tiles, in flood order. */
  tiles: number[];
  /** Its highest tile over its ring, and that height in levels. */
  peak: number;
  prominence: number;
}

/** The 16 offsets of the ring 7 tiles round a tile. */
const RING7: readonly [number, number][] = (() => {
  const a = [1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38, 0, 0.38, 0.71, 0.92];
  const b = [0, 0.38, 0.71, 0.92, 1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38];
  return a.map((v, k) => [Math.round(7 * v), Math.round(7 * b[k])] as [number, number]);
})();

/** The map's standing forms, most prominent first (ties by their first tile). */
export function standingForms(h: ArrayLike<number>, W: number, H: number, most = 300): StandingForm[] {
  const N = W * H;
  const over = new Int16Array(N);
  const top = new Uint8Array(N);
  for (let y = 7; y < H - 7; y++)
    for (let x = 7; x < W - 7; x++) {
      const i = y * W + x;
      let lo = 99;
      for (const [dx, dy] of RING7) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
      over[i] = h[i] - lo;
      if (over[i] >= 5) top[i] = 1;
    }
  const forms: StandingForm[] = [];
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!top[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || !top[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length > most) continue;
    let peak = q[0];
    for (const i of q) if (over[i] > over[peak]) peak = i;
    forms.push({ tiles: q, peak, prominence: over[peak] });
  }
  return forms.sort((a, b) => b.prominence - a.prominence || a.tiles[0] - b.tiles[0]);
}
