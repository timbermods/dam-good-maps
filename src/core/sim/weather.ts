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

const f32 = Math.fround;
/** DayNightCycle.DayLengthInSeconds: 768 ticks × TickTimeSpec 0.6 s, in float. */
const DAY_SECONDS = f32(768 * f32(0.6));
/** WaterStrengthSpec: MaxWaterSourceChangePerSecond and MinWaterSourceChangeScaler. */
const MAX_CHANGE = f32(0.0058);
const MIN_SCALER = f32(0.15);

/** How many days a source of specified strength `strength` takes to ease down before a drought
 *  (DroughtWaterStrengthModifier.GetTransitionTime: S / (day length · max change a second), about
 *  S / 2.67; investigation/cycles/weather.ts `transitionDays`, FIDELITY.md "Drought ramp"). */
export function droughtTransitionDays(strength: number): number {
  return strength / (DAY_SECONDS * MAX_CHANGE);
}

/** The share of its specified strength a source gives `x` days from a drought's start (x < 0
 *  before it): the game eases it down over its transition before the drought, by 1 − p(0.85p +
 *  0.15) of the way p through it, and stops it for the drought
 *  (DroughtWaterStrengthModifier.GetStrengthModifier and GetModifier; investigation/cycles/weather.ts
 *  `droughtModifier`). The ease back up after a drought is outside a drought's own days. */
export function droughtStrength(x: number, strength: number): number {
  if (x >= 0) return 0;
  if (!(strength > 0)) return 1;
  const transition = droughtTransitionDays(strength);
  const progress = x + transition;
  if (progress < 0) return 1;
  const scaler = (1 - MIN_SCALER) * (progress / transition) + MIN_SCALER;
  return 1 - (progress * DAY_SECONDS * MAX_CHANGE * scaler) / strength;
}
