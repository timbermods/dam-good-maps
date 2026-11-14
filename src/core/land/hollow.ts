// A hollow's lake, as the hydrology plans it (land/hydro.ts `hollow`): the generator runs it in Rust
// (rust/analysis/src/land.rs, src/core/analysis/rust/bridge.ts `hollowInRust`); this TypeScript is its
// oracle, the same tiles in the same order (tests/unit/hollowRust.test.ts, tools/rust/analysis-jobs.ts).

import { N4 } from "../math/grid";

/** The tiles joined to `from` by side steps over ground lower than `below` (`from` itself whatever its height), in the
 *  order a breadth-first walk takes them, its neighbours in `N4`'s order. */
export function floodBelow(h: ArrayLike<number>, W: number, H: number, from: number, below: number): number[] {
  const seen = new Uint8Array(W * H);
  const q = [from];
  seen[from] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (seen[j] || h[j] >= below) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return q;
}

/** A hollow's lake: the tiles under `sill` joined to `seed`, its outlet cut a level at a time from the lowest of them
 *  (the first of the lowest, in the flood's order) while there are more of them than `budget` (not on a sea) or it
 *  stands over `maxSill`; null when the cut reaches its floor, it still stands over `maxSill`, or it has fewer than
 *  six tiles. */
export function hollowInTs(h: ArrayLike<number>, W: number, H: number, seed: number, sill: number, budget: number, maxSill: number, sea: boolean): { tiles: number[]; sill: number } | null {
  let tiles = floodBelow(h, W, H, seed, sill);
  while (((tiles.length > budget && !sea) || sill > maxSill) && sill > 1) {
    sill--;
    const lowest = tiles.reduce((m, i) => (h[i] < h[m] ? i : m), tiles[0]);
    if (h[lowest] >= sill) return null;
    tiles = floodBelow(h, W, H, lowest, sill);
  }
  if (sill > maxSill || tiles.length < 6) return null;
  return { tiles, sill };
}
