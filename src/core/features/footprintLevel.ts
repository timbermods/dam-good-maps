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

/** The lowest a dry tile may be cut to without letting water flow into it (PLAN §20 D345, B6): the
 *  surface of the highest wet tile beside it, rounded up to a level. A tile with no wet neighbour
 *  may go to 0. Water flows between the four neighbours, so those are the ones that count. */
export function floorBesideWater(heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, i: number): number {
  const x = i % W;
  const y = (i - x) / W;
  let floor = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx;
    if (water[j] > 0) floor = Math.max(floor, Math.ceil(heights[j] + water[j] - 1e-6));
  }
  return floor;
}

/** The level a placed object's footprint is made level at, without touching the water: the height
 *  most of it stands at (`modalLevel`), but no lower than any of its dry tiles can be cut beside
 *  water (`floorBesideWater`), so the ground under it is filled there instead. Null when the
 *  footprint stands in water and is not level already: levelling it would fill or drain water, so
 *  the placement is refused instead. */
export function platformLevel(heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, list: readonly number[]): number | null {
  const first = heights[list[0]];
  if (list.every((i) => heights[i] === first)) return first;
  if (list.some((i) => water[i] > 0)) return null;
  let level = modalLevel(list.map((i) => heights[i]));
  for (const i of list) level = Math.max(level, floorBesideWater(heights, water, W, H, i));
  return level;
}
