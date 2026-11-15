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

/** How far from the water, in steps between neighbours, its bank reaches (D(new-bank)). */
export const BANK_REACH = 2;

/** Whether dry tile `i` is part of the bank that holds the water (D(new-bank)): within `BANK_REACH`
 *  steps of a wet tile and no higher than that water's surface rounded up to a level, so the water
 *  rests against it, runs along it or spreads over it as it rises. Raising it narrows the water's
 *  course and lifts it; lowering it lets the water out. A levelling leaves such a tile as it is.
 *  Higher ground, a cliff above the water, is not part of it: it may be raised, and cut no lower
 *  than the water beside it (`floorBesideWater`). */
export function holdsWater(heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, i: number): boolean {
  if (water[i] > 0) return false;
  const x = i % W;
  const y = (i - x) / W;
  const h = heights[i];
  for (let dy = -BANK_REACH; dy <= BANK_REACH; dy++)
    for (let dx = -BANK_REACH; dx <= BANK_REACH; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > BANK_REACH || (dx === 0 && dy === 0)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (water[j] > 0 && h <= Math.ceil(heights[j] + water[j] - 1e-6)) return true;
    }
  return false;
}

/** The level a placed object's footprint is made level at, or why it can't be levelled without
 *  moving the water: `wet` when the footprint stands in water and is not level already (levelling
 *  it would fill or drain water), `bank` when it stands on the bank that holds the water
 *  (`holdsWater`) and no level keeps that bank as it is. Otherwise the height most of it stands at
 *  (`modalLevel`), but no lower than any of its dry tiles can be cut beside water
 *  (`floorBesideWater`), so the ground under it is filled there instead; on the bank, the bank's
 *  own height. */
export function platformPlan(heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, list: readonly number[]): { level: number } | { refused: "wet" | "bank" } {
  const first = heights[list[0]];
  if (list.every((i) => heights[i] === first)) return { level: first };
  if (list.some((i) => water[i] > 0)) return { refused: "wet" };
  const bank = list.filter((i) => holdsWater(heights, water, W, H, i));
  if (bank.length) {
    const level = heights[bank[0]];
    if (bank.some((i) => heights[i] !== level)) return { refused: "bank" };
    for (const i of list) if (heights[i] > level && level < floorBesideWater(heights, water, W, H, i)) return { refused: "bank" };
    return { level };
  }
  let level = modalLevel(list.map((i) => heights[i]));
  for (const i of list) level = Math.max(level, floorBesideWater(heights, water, W, H, i));
  return { level };
}

/** The level a placed object's footprint is made level at (`platformPlan`), or null when it can't
 *  be levelled without moving the water, so the placement is refused instead. */
export function platformLevel(heights: ArrayLike<number>, water: ArrayLike<number>, W: number, H: number, list: readonly number[]): number | null {
  const plan = platformPlan(heights, water, W, H, list);
  return "level" in plan ? plan.level : null;
}
