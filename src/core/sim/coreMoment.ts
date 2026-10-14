// Where an Unstable Core's moment falls against a drought or a badtide (the Weather view, D133, D339): the day-by-day
// view counts a hazard's own days, and a core goes off at a day of a cycle, so the view says where the core's moment
// stands against the hazard of that cycle. Pure: the map, the water and the core's explosion are never touched.
//
// The game's cycle (investigation/cycles/weather.ts `MODES`, `CycleClock`): a cycle is its temperate days, drawn
// uniformly from the difficulty's range, then its hazard, which starts once those days have passed. A core's countdown
// runs from the start of its cycle (`TimedComponentActivator`, ActivatorSystem.cs: days count from day 1 of the core's
// cycle plus the day's progress), so it goes off `days - temperate` days into the cycle's hazard: a range, as the
// temperate days are drawn. The view's Day N means N days into the hazard (weather.ts), so hazard day N covers the
// offsets from N - 1 up to N.

import { CORE } from "../data/parity";
import type { Feature } from "../features/schema";
import type { Difficulty } from "../spec/mapspec";
import { hazardDays, type Hazard } from "./weather";

/** The temperate days a cycle opens with, [shortest, longest], by difficulty (investigation/cycles/weather.ts `MODES`). */
export const TEMPERATE_DAYS: Record<Difficulty, readonly [number, number]> = {
  easy: [16, 19],
  normal: [13, 17],
  hard: [5, 8],
};

export interface CoreMoment {
  /** The cycle the core's countdown starts in, and the days of it that pass first. */
  cycle: number;
  days: number;
  /** How far into the hazard the core goes off, soonest and latest, in days from the hazard's start (the game's
   *  `days - temperate`); below 0 is before the hazard starts. */
  earliest: number;
  latest: number;
  /** Against the hazard of that cycle (its default length): always before it starts, as it starts or while it runs,
   *  or after it ended. */
  when: "before" | "during" | "after";
}

/** Where a core that goes off `days` days into cycle `cycle` falls against that cycle's hazard on this difficulty. */
export function coreMoment(core: { cycles: number; days: number }, difficulty: Difficulty, hazard: Hazard): CoreMoment {
  const [shortest, longest] = TEMPERATE_DAYS[difficulty];
  const length = hazardDays(difficulty, hazard);
  // (the hazard starts once `temperate` days of the cycle have passed, and the core goes off once `days` have)
  const earliest = core.days - longest;
  const latest = core.days - shortest;
  const when = latest < 0 ? "before" : earliest >= length ? "after" : "during";
  return { cycle: core.cycles, days: core.days, earliest, latest, when };
}

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** The hazard days a core may go off on, [first, last] (day 1 when it may go off before the hazard starts). */
function hazardDayRange(m: CoreMoment): [number, number] {
  return [Math.floor(Math.max(m.earliest, 0)) + 1, Math.floor(m.latest) + 1];
}

/** The moment in a few plain words, for the day box's note. Which hazard a cycle brings is random, so a moment that does
 *  not depend on the hazard's length names both. */
export function coreMomentWords(m: CoreMoment, hazard: Hazard): string {
  const goes = "Unstable core: goes off";
  const of = `cycle ${m.cycle}'s drought or badtide`;
  if (m.when === "before") {
    const nearest = Math.max(1, Math.floor(-m.latest));
    const farthest = Math.max(1, Math.ceil(-m.earliest));
    return nearest >= farthest ? `${goes} ${plural(farthest)} before ${of}` : `${goes} ${nearest} to ${plural(farthest)} before ${of}`;
  }
  if (m.when === "after") return `${goes} after cycle ${m.cycle}'s ${hazard} has ended`;
  const [a, b] = hazardDayRange(m);
  const range = a === b ? `day ${a}` : `days ${a} to ${b}`;
  return m.earliest < 0 ? `${goes} before or on ${range} of ${of}` : `${goes} on ${range} of ${of}`;
}

/** Whether the held hazard day falls where the core may go off (the note lights up). */
export function coreMomentNow(m: CoreMoment, day: number): boolean {
  if (m.when !== "during") return false;
  const [a, b] = hazardDayRange(m);
  return day >= a && day <= b;
}

/** The Unstable Cores of a map's features (placed or from the generator's option) as their countdowns. A core a feature
 *  carries starts its countdown at the cycle it names, with the game's default days. */
export function coreCountdowns(features: readonly Feature[]): { cycles: number; days: number }[] {
  const out: { cycles: number; days: number }[] = [];
  for (const f of features) {
    if (f.kind !== "mapObject" || f.params.kind !== "unstableCore") continue;
    const count = "area" in f.params.placement ? 0 : 1;
    for (let i = 0; i < count; i++) out.push({ cycles: f.params.core?.cycles ?? CORE.cycles, days: CORE.days });
  }
  return out;
}

export interface CoreNote {
  text: string;
  /** The held day is where the core may go off. */
  now: boolean;
}

/** The notes the day box shows while `hazard` is held on `day`: one per distinct moment, the cores that share it counted. */
export function coreNotes(features: readonly Feature[], difficulty: Difficulty, hazard: Hazard, day: number | null): CoreNote[] {
  const groups = new Map<string, { moment: CoreMoment; n: number }>();
  for (const c of coreCountdowns(features)) {
    const k = `${c.cycles}:${c.days}`;
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { moment: coreMoment(c, difficulty, hazard), n: 1 });
  }
  return [...groups.values()].map(({ moment, n }) => ({
    text: coreMomentWords(moment, hazard) + (n > 1 ? ` (${n} cores)` : ""),
    now: day !== null && coreMomentNow(moment, day),
  }));
}
