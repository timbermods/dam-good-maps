// Size and Power (PLAN §20 D361 (3)): Size sets how far a force reaches, Power how strong it is within
// that. A force set larger than the size its Power gives keeps all of its reach, but acts in proportion:
// every level it changes is scaled by `strength`, 1 at Power 100 (the full force) and at the size Power
// gives (Auto, unchanged), and at Power 0 the square root of how much smaller the natural size is, so
// the gentlest effect still shows (D356) however large the Size. Craterize and Erupt use it as it is;
// Glaciate also scales below Power 60 (`glacierStrength`), so its Power makes a clear difference at any
// size. One rule for every force that has a Size; Quake has none (its Power sets its lift and slide).

import * as portable from "../math/portable";

/** How strongly a force acts at `power` when its Size is `size` and Power alone would give `natural`
 *  (0 to 1; 1 when the Size is Power's own or smaller). */
export function strength(power: number, size: number | null, natural: number): number {
  if (size === null || !(size > natural) || natural <= 0) return 1;
  const floor = portable.sqrt(natural / size);
  return floor + (1 - floor) * portable.pow(Math.max(0, Math.min(100, power)) / 100, 1.2);
}

/** Glaciate's: its depth also follows Power below 60 (Power 60, the default, and above as before;
 *  Power 0 about a sixth as deep), and never more than `strength` for its Size. */
export function glacierStrength(power: number, size: number | null, natural: number): number {
  const p = Math.max(0, Math.min(100, power));
  const own = p >= 60 ? 1 : 0.15 + 0.85 * portable.pow(p / 60, 1.2);
  return Math.min(own, strength(power, size, natural));
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
