// The start's bench, for the map card (PLAN §5, §6). The measure of a whole map against its settings'
// targets (`measure`) is a tool's, in tools/lib/metrics.ts.

/** The start's bench (Start area, a preference since D211; the map card shows it): tiles at the
 *  district center's level within 8 tiles of its middle. */
export function startBench(h: ArrayLike<number>, W: number, H: number, st: { x: number; y: number; z: number }): number {
  let n = 0;
  for (let y = st.y - 8; y <= st.y + 8; y++)
    for (let x = st.x - 8; x <= st.x + 8; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((x - st.x) * (x - st.x) + (y - st.y) * (y - st.y) <= 64 && h[y * W + x] === st.z) n++;
    }
  return n;
}
