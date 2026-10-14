// The High look's visible seasons in the Weather view (D250 (1), D286 (4)): on a held Drought or Badtide day the plants
// whose ground has turned dry (a drought) or been poisoned (a badtide) show withered, as the dead trees and bushes the
// map already draws on dry ground, following the same soil the ground's colour reads. It is a view only: the map's own
// plants are never changed, and Day 0 (the map's own soil) shows them as they are.
//
// The rule is the generator's own (core/resources/baseline.ts: a tree or bush lives where `moisture > 0` and the soil is
// not contaminated). Succulents stay as they are (the game's desert plant; the generator places them on dry ground).

import { DEAD, type EntityView, type SoilView } from "./model";

/** The plants that wither where the ground dries or is poisoned. */
const WITHERS = new Set(["Pine", "Birch", "Oak", "BlueberryBush"]);

/** Whether a plant can live on tile `i` of this soil: moist and clean. */
export const livesOn = (soil: SoilView, i: number): boolean => soil.moisture[i] > 0 && soil.contamination[i] === 0;

/** A digest of the objects' flags (FNV-1a), to tell whether the same plants wither. */
export function flagsDigest(flags: Uint8Array): string {
  let h = 2166136261;
  for (let k = 0; k < flags.length; k++) h = Math.imul(h ^ flags[k], 16777619);
  return `${flags.length}:${h >>> 0}`;
}

/** How many plants `shown` draws withered that `e` does not. */
export function witheredCount(shown: EntityView, e: EntityView): number {
  let n = 0;
  for (let k = 0; k < shown.count; k++) if (shown.flags[k] !== e.flags[k]) n++;
  return n;
}

/** The objects with the plants that live on the map's own soil but not on the day's soil flagged dead: a view that
 *  shares every array with `e` but the flags, or `e` itself when nothing withers. */
export function witheredEntities(e: EntityView, own: SoilView, day: SoilView, W: number): EntityView {
  let flags: Uint8Array | null = null;
  for (let k = 0; k < e.count; k++) {
    if (e.flags[k] & DEAD) continue;
    if (!WITHERS.has(e.templates[e.template[k]])) continue;
    const x = e.x[k];
    const y = e.y[k];
    if (x < 0 || y < 0 || x >= W) continue;
    const i = y * W + x;
    if (i >= day.moisture.length || i >= own.moisture.length) continue;
    if (livesOn(own, i) && !livesOn(day, i)) {
      flags ??= e.flags.slice();
      flags[k] |= DEAD;
    }
  }
  return flags ? { ...e, flags } : e;
}
