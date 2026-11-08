// The day the start's water goes in a drought, or badwater reaches it in a badtide (D133: "Day 6: your start's water is
// gone", "Day 3: badwater reaches your start's water"). The start's water is the drought line's (`droughtLine.ts`
// `startWaterMask`): the lakes and rivers the start's pumps draw from on Day 0, a body of water with a tile a pump on a
// shore within the start's water rule's walk reaches (`walk.ts` `tileShoreWalk`: clean, at least 0.3 deep, the shore 0–2
// levels above the surface). Read from the days the views' runs keep (`weather.ts` `HazardRun`), one day after another as
// `firstDays.ts` does, each day the water seen from above (`stackWater.ts` `surfaceWater`); never simulated here.
//
// - Drought: the first day on which no tile of the day's water joined (4-connected, over `WATER_BODY`) to the start's
//   Day 0 water is one a pump reaches within the walk (the pump's reach on that day: clean, 0.3 deep, a shore in reach).
//   The water may lie on the map still (the hover's "Dry on day 6" is another thing: a tile with none at all); a pump
//   cannot draw from it.
// - Badtide: the first day badwater (`badWater`) stands on a tile of the start's water that was not bad on Day 0, where a
//   pump on a shore within the walk would draw it (the same reach, clean or not). Farmland is not claimed: the model has
//   no farmland, only the soil the badwater poisons.
// Neither claims anything when the start has no such water on Day 0 (no start, or none a pump reaches clean).

import { components } from "../analysis/regions";
import { PUMP_CLEAN, tileShoreWalk, WATER_BODY, type WalkObject } from "../analysis/walk";
import type { CoreNote } from "./coreMoment";
import { badWater, type DayWater } from "./firstDays";
import { startWalk, startWaterMask } from "./droughtLine";
import type { Hazard } from "./weather";

/** What the day is read from: the map and its start's water rule. */
export interface StartWaterInput {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  objects: readonly WalkObject[];
  start: { x: number; y: number } | null | undefined;
  /** The start's water rule's walk (`waterWithin`), in tiles. */
  within: number;
}

/** The day the start's water goes, or turns bad, as the page keeps it with a held hazard day. */
export interface HeldStartWater {
  hazard: Hazard;
  /** The map's version the day was worked out on. */
  version: number;
  /** The first day it happened (1 or more), or 0: not on any day worked out so far (Day 1 to `through`). */
  day: number;
}

export class StartWaterDays {
  /** The first day it happened (1 or more), 0 when not on any day seen so far, or at all. */
  day = 0;
  /** The last day seen (0: none yet). */
  through = 0;
  /** Whether the start has water a pump reaches on Day 0 (else there is nothing to lose: `day` stays 0). */
  readonly has: boolean;
  private readonly mask: Uint8Array;
  private readonly tiles: Int32Array;
  private readonly walk: Float64Array | null;
  private readonly wasBad: Uint8Array;

  constructor(private readonly hazard: Hazard, day0: DayWater, private readonly p: StartWaterInput) {
    const { W, H } = p;
    const N = W * H;
    // (the walk worked out once, for the mask and for the days)
    const walk = p.start ? startWalk(p.objects, p.heights, W, H, p.start) : undefined;
    this.mask = startWaterMask({ W, H, heights: p.heights, depth: day0.depth, contamination: day0.contamination, objects: p.objects, start: p.start, within: p.within, walk });
    const list: number[] = [];
    for (let i = 0; i < N; i++) if (this.mask[i]) list.push(i);
    this.tiles = Int32Array.from(list);
    this.has = list.length > 0;
    this.wasBad = new Uint8Array(N);
    for (const i of list) if (badWater(day0.depth[i], day0.contamination[i])) this.wasBad[i] = 1;
    this.walk = this.has && walk ? walk : null;
  }

  /** The next day's water (Day `through + 1`). */
  see(w: DayWater): void {
    const day = ++this.through;
    if (!this.has || this.day || !this.walk) return;
    if (this.hazard === "drought" ? this.goneOn(w) : this.badOn(w)) this.day = day;
  }

  /** Whether no tile of the water joined to the start's Day 0 water is one a pump reaches on this day. */
  private goneOn(w: DayWater): boolean {
    const { W, H, heights, within } = this.p;
    const N = W * H;
    const wet = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (w.depth[i] > WATER_BODY) wet[i] = 1;
    const { labels, sizes } = components(wet, W, H);
    const ours = new Uint8Array(sizes.length);
    for (const i of this.tiles) if (labels[i] >= 0) ours[labels[i]] = 1;
    for (let i = 0; i < N; i++) {
      if (labels[i] < 0 || !ours[labels[i]]) continue;
      if (tileShoreWalk(this.walk!, heights, W, H, i, w.depth[i], w.contamination[i] < PUMP_CLEAN) <= within) return false;
    }
    return true;
  }

  /** Whether badwater stands on a tile of the start's water a pump reaches, one that was not bad on Day 0. */
  private badOn(w: DayWater): boolean {
    const { W, H, heights, within } = this.p;
    for (const i of this.tiles) {
      if (this.wasBad[i] || !badWater(w.depth[i], w.contamination[i])) continue;
      if (tileShoreWalk(this.walk!, heights, W, H, i, w.depth[i], true) <= within) return true;
    }
    return false;
  }
}

/** The one line for the held hazard (D133), or null: "Day 6: your start's water is gone" in a drought, "Day 3: badwater
 *  reaches your start's water" in a badtide. Nothing while the hazard on screen is not the one the day was worked out for,
 *  for an older map (`version` is the map's now), or when it did not happen on any day worked out so far (not a guess:
 *  "can't tell yet" says nothing). */
export function startWaterWords(held: HeldStartWater | null, shown: Hazard | null, version: number): string | null {
  if (!held || shown !== held.hazard || held.version !== version || !(held.day > 0)) return null;
  return held.hazard === "drought" ? `Day ${held.day}: your start's water is gone` : `Day ${held.day}: badwater reaches your start's water`;
}

/** The line as a quiet note under the day box (the Unstable Core's moment shares it): none, or the one line. */
export function startWaterNotes(held: HeldStartWater | null, shown: Hazard | null, version: number): CoreNote[] {
  const text = startWaterWords(held, shown, version);
  return text ? [{ text, now: false }] : [];
}
