// Size and Power (PLAN §20 D361 (3)): Size sets how far a force reaches, Power how strong it is within
// that. A force set larger than the size its Power gives keeps all of its reach, but acts in proportion:
// every level it changes is scaled by `strength`, 1 at Power 100 (the full force) and at the size Power
// gives (Auto, unchanged), and at Power 0 the square root of how much smaller the natural size is, so
// the gentlest effect still shows (D356) however large the Size. Craterize and Erupt use it as it is.
// Glaciate's Size is its width and its Power how deep it carves, neither driving the other (D368 (3)):
// `glacierStrength` and `glacierDeepening` follow Power alone. Quake has no Size (its Power sets its
// lift and slide).

/** How strongly a force acts at `power` when its Size is `size` and Power alone would give `natural`
 *  (0 to 1; 1 when the Size is Power's own or smaller). */
export function strength(power: number, size: number | null, natural: number): number {
  if (size === null || !(size > natural) || natural <= 0) return 1;
  const floor = Math.sqrt(natural / size);
  return floor + (1 - floor) * (Math.max(0, Math.min(100, power)) / 100) ** 1.2;
}

/** Glaciate's Power (D368 (3)): how deep the ice carves. Every level its glacier changes is scaled by
 *  this (`tempered`): about an eighth at Power 0, a light scour that still shows over all of its ground,
 *  rising evenly to 1 at Power 100, round 4's deep U-shaped valley in full (Power 60, the default, about
 *  two thirds as deep). Power alone: its Size (its width) never changes it. */
export function glacierStrength(power: number): number {
  return 0.12 + 0.88 * (Math.max(0, Math.min(100, power)) / 100);
}

/** The most levels Glaciate's Power lets its floor down below round 4's (at Power 100). */
export const GLACIER_DEEPEN_MAX = 6;

/** Glaciate's Power above 60 (D368 (3)): how many levels its floor is let down below round 4's, the
 *  whole floor together (its bars, tarn and river with it), so the valley stays U-shaped and only
 *  grows deeper: none at Power 60 and below, GLACIER_DEEPEN_MAX at 100. Power alone, as above. */
export function glacierDeepening(power: number): number {
  const p = Math.max(0, Math.min(100, power));
  return p <= 60 ? 0 : Math.round((GLACIER_DEEPEN_MAX * (p - 60)) / 40);
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
