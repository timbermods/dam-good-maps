// The High look's seasons on a held Drought or Badtide day (D250, D286 (4); #67 stage 4, investigation/maplook-finish
// seasons.ts, as adopted): pale dusty dry ground with straw where grass stood and a heat shimmer over it in a drought,
// a faint sickly sky in a badtide. Plants withering is the other part (core/sim/withering.ts, Forest.setDead). What is
// drawn follows the day's actual soil and water, never a made-up height or front, and only in the High look
// (Standard stays as it is, D242). Contamination is the veins in every look (D334).

import type { SoilView } from "../model";

/** How far a badtide's sky is pulled toward a sickly green-yellow (the investigation's slight mix). */
export const SICKLY_SKY = 0.095;

export interface SeasonDay {
  W: number;
  H: number;
  /** The map's own soil, and the held day's. */
  own: SoilView;
  day: SoilView;
  /** The day's surface water per tile (depth over the surface, and contamination 0–1). */
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
}

/** The tile mask the ground shader reads, nearest-sampled so drying never crosses a moist tile: R 255 where the day's
 *  ground is dry (moisture 0) with no water on it, G 255 where water is, A 255 where the map's own soil was moist
 *  (grass that withers to straw). With the counts of dry tiles and of contaminated water tiles. */
export function seasonMask(s: SeasonDay, into?: Uint8Array): { bytes: Uint8Array; dry: number; badWater: number } {
  const n = s.W * s.H;
  const bytes = into && into.length === n * 4 ? into : new Uint8Array(n * 4);
  let dry = 0;
  let badWater = 0;
  for (let i = 0; i < n; i++) {
    const water = s.depth[i] > 0.001;
    const dried = s.day.moisture[i] === 0 && !water;
    bytes[i * 4] = dried ? 255 : 0;
    bytes[i * 4 + 1] = water ? 255 : 0;
    bytes[i * 4 + 2] = 0;
    bytes[i * 4 + 3] = s.own.moisture[i] > 0 ? 255 : 0;
    if (dried) dry++;
    if (water && s.contamination[i] > 0) badWater++;
  }
  return { bytes, dry, badWater };
}

export interface SeasonSwitches {
  dryGround: boolean;
  heat: boolean;
  badtideSky: boolean;
}

/** What each effect draws on this hazard: dry ground and straw and the shimmer in a drought; the sickly sky in a badtide that has
 *  badwater. The shimmer is still when the player asked for reduced motion. */
export function seasonLook(hazard: "drought" | "badtide" | null, e: SeasonSwitches, motion: boolean, badWater: number): { dry: number; heat: number; sickly: number } {
  const drought = hazard === "drought";
  return {
    dry: drought && e.dryGround ? 1 : 0,
    heat: drought && e.heat && motion ? 1 : 0,
    sickly: hazard === "badtide" && e.badtideSky && badWater > 0 ? SICKLY_SKY : 0,
  };
}
