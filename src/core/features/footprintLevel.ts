// The level a placed object's footprint is made level at (PLAN §20 D328): the height most of its
// tiles already stand at; of equal shares, the one that moves the ground least. Shared by the
// placement itself (`levelFootprint`, core/doc/placing.ts) and the ghost the page shows.

/** The height most of `heights` stand at; of equal shares, the one whose farthest tile is nearest
 *  (the lower on a tie). */
export function modalLevel(heights: readonly number[]): number {
  const counts = new Map<number, number>();
  for (const h of heights) counts.set(h, (counts.get(h) ?? 0) + 1);
  const most = Math.max(...counts.values());
  let level = Math.min(...heights);
  let reach = Infinity;
  for (const [hv, c] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (c !== most) continue;
    let far = 0;
    for (const h of heights) far = Math.max(far, Math.abs(h - hv));
    if (far < reach) {
      reach = far;
      level = hv;
    }
  }
  return level;
}
