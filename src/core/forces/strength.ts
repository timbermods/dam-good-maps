// Size and Power (PLAN §20 D361 (3)): Size sets how far a force reaches, Power how strong it is within
// that. A force set larger than the size its Power gives keeps all of its reach, but acts in proportion:
// every level it changes is scaled by `strength`, 1 at Power 100 (the full force) and at the size Power
// gives (Auto, unchanged), and at Power 0 the square root of how much smaller the natural size is, so
// the gentlest effect still shows (D356) however large the Size. Craterize and Erupt use it as it is.
// Glaciate's Size is its width and its Power how deep it carves, neither driving the other (D368 (3)):
// `glacierStrength` follows Power alone. Quake has no Size (its Power sets its
// lift and slide).

/** How strongly a force acts at `power` when its Size is `size` and Power alone would give `natural`
 *  (0 to 1; 1 when the Size is Power's own or smaller). */
export function strength(power: number, size: number | null, natural: number): number {
  if (size === null || !(size > natural) || natural <= 0) return 1;
  const floor = Math.sqrt(natural / size);
  return floor + (1 - floor) * (Math.max(0, Math.min(100, power)) / 100) ** 1.2;
}

/** Glaciate's Power (D368 (3)): how deep the ice carves. Every level its glacier (round 4's, always
 *  planned as deep as round 4 made it) changes is scaled by this (`tempered`): about an eighth at Power
 *  0, a light scour that still shows over all of its ground, rising evenly to 1 at Power 100, its
 *  default, round 4's deep U-shaped valley in full. Power alone: its Size (its width) never changes it. */
export function glacierStrength(power: number): number {
  return 0.12 + 0.88 * (Math.max(0, Math.min(100, power)) / 100);
}

/** A level changed by `strength`: the ground before, moved `k` of the way to the force's level, and at
 *  least a level wherever the force moves it by a level or more, so a gentle force still shows over all
 *  of its reach (D356): Power scales how deep, never whether. */
export function tempered(before: number, after: number, k: number): number {
  if (k >= 1) return after;
  const d = after - before;
  if (Math.abs(d) < 0.5) return before + d * k;
  const scaled = d * k;
  return before + (Math.abs(scaled) >= 1 ? scaled : Math.sign(d));
}
