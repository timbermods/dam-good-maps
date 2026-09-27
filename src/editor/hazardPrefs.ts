// What the Drought and Badtide day strip remembers (PLAN §20 D267 (3), D268): each hazard's length
// (1 to 30 days; by default Normal's longest, drought 9 and badtide 8) and the strip's Speed.

import { HAZARD_MAX_DAYS, HAZARD_MIN_DAYS } from "../core/sim/hazard";
import { hazardDays, type Hazard } from "../core/sim/weather";
import { DAY_SPEEDS, type DaySpeed } from "./dayPlayer";

const DAYS_KEY = "dgm.hazardDays";
const SPEED_KEY = "dgm.daySpeed";

export type HazardLengths = Record<Hazard, number>;

/** Normal's longest: drought 9, badtide 8. */
export const DEFAULT_LENGTHS: HazardLengths = { drought: hazardDays("normal", "drought"), badtide: hazardDays("normal", "badtide") };

const clampDays = (n: unknown, d: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(HAZARD_MIN_DAYS, Math.min(HAZARD_MAX_DAYS, Math.round(n))) : d);

export function loadLengths(): HazardLengths {
  try {
    const s = JSON.parse(localStorage.getItem(DAYS_KEY) ?? "null") as Partial<HazardLengths> | null;
    if (!s) return { ...DEFAULT_LENGTHS };
    return { drought: clampDays(s.drought, DEFAULT_LENGTHS.drought), badtide: clampDays(s.badtide, DEFAULT_LENGTHS.badtide) };
  } catch {
    return { ...DEFAULT_LENGTHS };
  }
}

export function saveLengths(l: HazardLengths): void {
  try {
    localStorage.setItem(DAYS_KEY, JSON.stringify(l));
  } catch {
    // (storage off: the length lasts until the page closes)
  }
}

export function loadDaySpeed(): DaySpeed {
  try {
    const s = localStorage.getItem(SPEED_KEY);
    return s && (DAY_SPEEDS as readonly string[]).includes(s) ? (s as DaySpeed) : "normal";
  } catch {
    return "normal";
  }
}

export function saveDaySpeed(s: DaySpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, s);
  } catch {
    // (storage off)
  }
}
