// The day the start's water goes in a drought, or badwater reaches it in a badtide (D133) for the map as it is:
// `sim/startWaterDay.ts` read with the map's start, its objects and its start's water rule. The worker feeds it the days
// of the hazard's run; contract tests ask it directly (D342).

import { StartWaterDays } from "../sim/startWaterDay";
import type { DayWater } from "../sim/firstDays";
import type { Hazard } from "../sim/weather";
import { startWaterWithin } from "./droughtLine";
import type { MapSession } from "./session";

/** A `StartWaterDays` for `hazard` on `s`, from Day 0's water `day0` (the water the hazard's run starts from, as the views
 *  read it: the water seen from above on a map with caves or overhangs). */
export function mapStartWaterDays(s: MapSession, hazard: Hazard, day0: DayWater): StartWaterDays {
  const b = s.built;
  return new StartWaterDays(hazard, day0, { W: b.W, H: b.H, heights: b.heights, objects: b.entities, start: b.start, within: startWaterWithin(s) });
}
