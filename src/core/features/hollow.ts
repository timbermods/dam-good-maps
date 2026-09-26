// The hollow round a spot on the map: the level water there fills it to before it spills (over the
// rim, to the map edge or into other water), and about how many tiles it covers (live editing: a
// drawn river's end, a lake filled by clicking its basin). A priority flood over the ground as it
// is, small and dependency-free so the page can run it under the pointer.

/** The hollow at (x, y): whether water there fills it (`fills`), to what level, over about how many
 *  tiles, and its lowest tile (where a spring fills it best). On a slope, water runs on downhill. */
export function hollowAt(heights: Uint8Array, water: ArrayLike<number> | null, W: number, H: number, x: number, y: number): { fills: boolean; level: number; tiles: number; low: number } {
  const N = W * H;
  // first down to the hollow's floor: the water there runs down before it rises
  let start = Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x));
  for (let guard = 0; guard < N; guard++) {
    const sx = start % W;
    let best = start;
    for (const j of [start - 1, start + 1, start - W, start + W]) {
      if (j < 0 || j >= N || (j === start - 1 && sx === 0) || (j === start + 1 && sx === W - 1)) continue;
      if (heights[j] < heights[best]) best = j;
    }
    if (best === start || (water && water[best] > 0.2)) break;
    start = best;
  }
  const low = start;
  const seen = new Uint8Array(N);
  // a bucket queue by level (0–255): the lowest rim first
  const buckets: number[][] = Array.from({ length: 256 }, () => []);
  let level = heights[start];
  buckets[level].push(start);
  seen[start] = 1;
  let tiles = 0;
  const floor = heights[start];
  for (let lv = level; lv < 256; lv++) {
    const b = buckets[lv];
    while (b.length) {
      const i = b.pop()!;
      // a way out: lower ground than the water has reached, the map edge, or other water
      const h = heights[i];
      const px = i % W;
      const py = (i - px) / W;
      if (i !== start && (h < level || px === 0 || py === 0 || px === W - 1 || py === H - 1 || (water && water[i] > 0.2))) {
        return { fills: level > floor, level, tiles, low };
      }
      level = Math.max(level, h);
      tiles++;
      if (tiles > N / 2) return { fills: true, level, tiles, low };
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j]) continue;
        if ((j === i - 1 && px === 0) || (j === i + 1 && px === W - 1)) continue;
        seen[j] = 1;
        buckets[Math.max(lv, heights[j])].push(j);
      }
    }
  }
  return { fills: level > floor, level, tiles, low };
}
