// A river spreading as a shallow sheet over a flat (D372): where the ground beside a river stands at
// its bed's own level with no bank, its water spreads over all of that flat, a sheet about a level
// deep or less, which fills for days and never settles within the canonical settle (Canyon 256²
// seeds 14 and 22: 5,568 and 11,232 tiles rising). A land whose river would spread over a flat larger
// than `SHEET_MOST` of the map is drawn again before it is shown, as a sea over its shelf is. Read from
// the land and the water planned on it; deep standing water with banks (lakes, seas, ponds: the
// planned lakes) is no sheet.

/** The most of the map a river's sheet may spread over (D372: about 5%). */
export const SHEET_MOST = 0.05;

/**
 * The largest flat a river would spread over as a sheet, in tiles: of the ground standing at one
 * level, joined at that level (four ways), not planned lake, the pieces a river's channel runs on at
 * their own level. `water` is the hydrology's plan: channels 1, lakes 2, cleared floors 3.
 */
export function riverSheet(h: ArrayLike<number>, W: number, H: number, water: ArrayLike<number>): { tiles: number; share: number; at: number } {
  const N = W * H;
  const seen = new Uint8Array(N);
  const q = new Int32Array(N);
  let best = 0;
  let at = -1;
  for (let s = 0; s < N; s++) {
    if (seen[s] || water[s] !== 1) continue;
    // (the flat this channel tile runs on at its own level)
    const L = h[s];
    let head = 0;
    let tail = 0;
    q[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const i = q[head++];
      const x = i % W;
      const y = (i - x) / W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W);
      if (y < H - 1) push(i + W);
    }
    if (tail > best) {
      best = tail;
      at = s;
    }
    function push(j: number): void {
      if (seen[j] || water[j] === 2 || h[j] !== L) return;
      seen[j] = 1;
      q[tail++] = j;
    }
  }
  return { tiles: best, share: N ? best / N : 0, at };
}
