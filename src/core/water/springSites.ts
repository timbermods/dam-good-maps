// Where a spring by the start may go (D330's fix): the one candidate rule that the generator's
// spring on a shown land (gen/generate.ts `springByStart`) and the fix on a map as edited
// (doc/waterFix.ts `waterFix`) share. Each caller keeps its own walk to a tile, its own extra
// filters, how many places it tries, and how it tries one (its strengths, its feature or its
// operations, its settle).

export interface SpringGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** The settled water's depth. */
  water: ArrayLike<number>;
  occupied: ArrayLike<number>;
  /** River channels: a dry riverbed ranks first. */
  channel: ArrayLike<number>;
  /** The centre tile of the start's 3×3. */
  start: { x: number; y: number };
}

/** The places for a spring by the start, best first, at most `tries`, each 6 tiles or more
 *  (Manhattan) from the ones before it: dry, free ground off the start's 5×5 that passes the
 *  caller's `keep`, that the colony walks to (`walkTo`) within `rule` less 4, in a riverbed or a
 *  hollow (half or more of the 24 tiles round it higher); a riverbed first, then the deeper hollow,
 *  then the shorter walk, then the lower tile index. `walkTo` is read only on tiles `keep` passed. */
export function springCandidates(g: SpringGround, rule: number, tries: number, walkTo: (i: number) => number, keep: (i: number) => boolean = () => true): number[] {
  const { W, H, heights: h, start } = g;
  const N = W * H;
  const cands: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (g.water[i] > 0.05 || g.occupied[i] || Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= 4) continue;
    if (!keep(i)) continue;
    const d = walkTo(i);
    if (!(d <= rule - 4)) continue;
    let lower = 0;
    let ring = 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        ring++;
        if (h[yy * W + xx] > h[i]) lower++;
      }
    const hollow = lower / Math.max(1, ring);
    if (!g.channel[i] && hollow < 0.5) continue;
    cands.push([(g.channel[i] ? 0 : 1000) - 100 * hollow + d, i]);
  }
  cands.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const picks: number[] = [];
  for (const [, i] of cands) {
    if (picks.some((j) => Math.abs((j % W) - (i % W)) + Math.abs(Math.floor(j / W) - Math.floor(i / W)) < 6)) continue;
    picks.push(i);
    if (picks.length >= tries) break;
  }
  return picks;
}
