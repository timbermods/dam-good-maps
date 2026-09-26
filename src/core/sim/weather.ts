// The hazardous weather a map meets, for the editor's Drought and Badtide buttons (live editing,
// PLAN §20 D180 (8), D181 (3)). A small port of the cycles investigation, which is checked against
// the decompiled game (investigation/cycles/FIDELITY.md) and adopted for the Weather view (D133,
// D173); the Weather view extends this module rather than repeating it. src/ never imports from
// investigation/ (tests/unit/boundaries.test.ts), so each rule is copied here with its source.

import type { Difficulty } from "../spec/mapspec";

export type Hazard = "drought" | "badtide";

/** Hazard lengths in days, [shortest, longest], by difficulty: GameModeSpec, as
 *  investigation/cycles/weather.ts `MODES` reads it (drought, badtide). */
export const HAZARD_DAYS: Record<Difficulty, Record<Hazard, readonly [number, number]>> = {
  easy: { drought: [2, 4], badtide: [1, 3] },
  normal: { drought: [5, 9], badtide: [4, 8] },
  hard: { drought: [15, 30], badtide: [15, 30] },
};

/** The length of a hazard once it has grown to full strength: the range's longest. The game draws
 *  each length uniformly in [h·shortest, h·longest], rounded away from zero, at least 1, where the
 *  handicap h grows to 1 over the first cycles (investigation/cycles/weather.ts `plan`, the
 *  hazard-length rule); a colony's longest is h = 1 at the top of the range. */
export function hazardDays(d: Difficulty, hazard: Hazard): number {
  return HAZARD_DAYS[d][hazard][1];
}

/** The contamination a clean water source gives during a badtide, `sinceStart` days into it and
 *  `days` long: 0.5 + 0.5·sech(17(t − 0.5)) over its first and last half day, 1 between
 *  (BadtideWaterSourceContaminationController.GetCurrentContamination; investigation/cycles/
 *  weather.ts `badtideContamination`, FIDELITY.md "Badtide contamination"). Every clean
 *  WaterSource and WaterSeep has this controller; a BadwaterSource does not; the sources go back to
 *  their own contamination when the badtide ends (investigation/cycles/model.ts, the badtide
 *  controllers). */
export function badtideContamination(sinceStart: number, days: number): number {
  const shape = (t: number) => {
    const x = 17 * (t - 0.5);
    return 1 / (Math.exp(x) + Math.exp(-x)) + 0.5;
  };
  if (sinceStart < 0.5) return shape(sinceStart);
  const toEnd = days - sinceStart;
  if (toEnd < 0.5) return shape(toEnd);
  return 1;
}
