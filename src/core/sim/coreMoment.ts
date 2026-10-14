// Where an Unstable Core's moment falls against a drought or a badtide (the Weather view, D133, D339): the day-by-day
// view counts a hazard's own days, and a core goes off at a day of a cycle, so the view says where the core's moment
// stands against the hazard of that cycle. Pure: the map, the water and the core's explosion are never touched.
//
// The game's cycle (investigation/cycles/weather.ts `MODES`, `CycleClock`): a cycle is its temperate days, drawn
// uniformly from the difficulty's range, then its hazard, which starts once those days have passed. A core's countdown
// runs from the start of its cycle (`TimeActivatedComponent`: `CyclesUntilCountdownActivation`, `DaysUntilActivation`,
// read as `fluidTime.ts` does: it goes off once `days` days of that cycle have passed), so it falls `days - temperate`
// days into the cycle's hazard: a range, as the temperate days are drawn.

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
  /** The hazard day the core goes off on, soonest and latest, counting the hazard's first day as day 1; 0 or less is
   *  before the hazard starts. */
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
  // (the hazard starts when `temperate` days have passed, so its day 1 is cycle day temperate + 1)
  const earliest = core.days - longest + 1;
  const latest = core.days - shortest + 1;
  const when = latest <= 0 ? "before" : earliest > length ? "after" : "during";
  return { cycle: core.cycles, days: core.days, earliest, latest, when };
}

const HAZARD_WORDS: Record<Hazard, string> = { drought: "drought", badtide: "badtide" };
const whole = (n: number) => Math.round(n);

/** The moment in a few plain words, for the day box's note. */
export function coreMomentWords(m: CoreMoment, hazard: Hazard): string {
  const h = HAZARD_WORDS[hazard];
  const cycle = `Unstable core, cycle ${m.cycle}`;
  if (m.when === "before") {
    const nearest = whole(-m.latest + 1);
    const farthest = whole(-m.earliest + 1);
    return nearest >= farthest ? `${cycle}: goes off ${plural(Math.max(1, farthest))} before the ${h}` : `${cycle}: goes off ${Math.max(1, nearest)} to ${plural(farthest)} before the ${h}`;
  }
  if (m.when === "after") return `${cycle}: goes off after the ${h} has ended`;
  const a = Math.max(1, whole(m.earliest));
  const b = Math.max(a, whole(m.latest));
  const range = a === b ? `day ${a}` : `days ${a} to ${b}`;
  return m.earliest <= 0 ? `${cycle}: goes off before or on ${range} of the ${h}` : `${cycle}: goes off on ${range} of the ${h}`;
}

const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** Whether the held hazard day falls where the core may go off (the note lights up). */
export function coreMomentNow(m: CoreMoment, day: number): boolean {
  if (m.when !== "during") return false;
  const a = Math.max(1, whole(m.earliest));
  return day >= a && day <= Math.max(a, whole(m.latest));
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
