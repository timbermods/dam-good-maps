// Size and Power (PLAN §20 D361 (3)): Size sets how far a force reaches, Power how strong it is within
// that. A force set larger than the size its Power gives keeps all of its reach, but acts in proportion:
// every level it changes is scaled by `strength`, 1 at Power 100 (the full force) and at the size Power
// gives (Auto, unchanged), and at Power 0 the square root of how much smaller the natural size is, so
// the gentlest effect still shows (D356) however large the Size. Craterize and Erupt use it as it is.
// Glaciate's Size is its width and its Power how deep it carves, neither driving the other (D368 (3)):
// `glacierDepth` and `glacierCut` follow Power alone. Quake has no Size (its Power sets its
// lift and slide).

import * as portable from "../math/portable";

/** How strongly a force acts at `power` when its Size is `size` and Power alone would give `natural`
 *  (0 to 1; 1 when the Size is Power's own or smaller). */
export function strength(power: number, size: number | null, natural: number): number {
  if (size === null || !(size > natural) || natural <= 0) return 1;
  const floor = portable.sqrt(natural / size);
  return floor + (1 - floor) * portable.pow(Math.max(0, Math.min(100, power)) / 100, 1.2);
}

/** Glaciate's Power (D368 (3), amended): how deep the ice carves, as the share of round 4's depth its
 *  valley keeps (`glaciate/shallow.ts`): its whole cross-section, floor, river channel, tarn and benches
 *  together, is lifted toward the land it runs down, so a gentler glacier is a shallower U and nothing
 *  else changes. 0 at Power 0 (a light scour, its floor a level under the valley's bottom), 1 at Power
 *  100 (round 4's deep U-shaped valley in full). Power alone: its Size (its width) never changes it. */
export function glacierDepth(power: number): number {
  return Math.max(0, Math.min(100, power)) / 100;
}

/** The most levels a gentler glacier cuts any tile by (its walls' height at most): 1 at Power 0, a
 *  light scour, 4 at Power 50, and no limit at Power 100 (its channels and pools two more). */
export function glacierCut(power: number): number {
  const t = glacierDepth(power);
  return t >= 1 ? Infinity : 1 + Math.round(10 * t);
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
