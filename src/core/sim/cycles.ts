// The first ten cycles as a report (ROADMAP, "The tools the map needs"): a map played from its first hour through ten
// cycles of the game's weather, its water as the game runs it, and what that does to the start. A plain core question
// (D342 (3)): it reads the map and never changes it.
//
// The calendar and the sources are the game's (investigation/cycles/weather.ts and FIDELITY.md name the class behind
// each rule; src/ never imports from investigation/, so each rule is copied here with its source):
// - A new game starts at 04:00 on day 1 of cycle 1 (DayNightCycleSpec.HoursPassedOnNewGame). A cycle is its temperate
//   days, then its hazard, which starts at the start of cycle day temperate + 1 and ends with the cycle.
// - The first `randomizeAfter` hazards are droughts; after that a badtide comes with the streak rule's chance
//   (HazardousWeatherRandomizer). A hazard's length is drawn in [h·shortest, h·longest], rounded, at least 1, where the
//   handicap h grows from the difficulty's start to 1 over its first cycles (HazardousWeatherHelper).
// - Every source eases off over S / 2.67 days before a drought and back over the same after it, S its strength
//   (DroughtWaterStrengthModifier), and gives nothing during it; badwater sources too. In a badtide the clean sources
//   give `badtideContamination` (weather.ts).
// - The water runs in the engine the Drought and Badtide views run (weather.ts `HazardRun`): the canonical settle's
//   water on day 0, the stacked engine on a map with caves or overhangs.
//
// Which weather: the game draws it, so a report names its own. By default the hardest the game deals in its likeliest
// order (`hardestCycles`): each hazard at the longest its handicap allows, each temperate spell at its shortest, a
// badtide wherever the game's odds favour one. `drawnCycles` draws one with the game's odds from a seed instead.
//
// What it reports, read from the days one after another as the views read them (`startWaterDay.ts`, `withering.ts`):
// - each drought: the day the start's water is gone (no water a pump reaches, joined to the start's water on day 0);
// - each badtide: the day badwater reaches the start's water, while the badtide runs or after it, until the next hazard;
//   and the first day badwater reaches it at all, from any source in any weather;
// - what dies: the original plants the game's timers surely kill (dry too long, or contaminated), by cycle;
// - the shortest straight dam near the start whose reservoir holds a drought's need (`analysis/damsites.ts`).
//
// Not modelled: drinking, construction, regrowth, a powered aquifer drill, an Unstable Core's blast. On a map with caves
// or overhangs, timed sources and badtide drains stay as the map starts them.

import * as portable from "../math/portable";
import { Rng } from "../math/rng";
import type { Difficulty } from "../spec/mapspec";
import { TEMPERATE_DAYS } from "./coreMoment";
import { fluidModelAt } from "./fluidTime";
import type { DayWater } from "./firstDays";
import type { MapObject } from "./model";
import { surfaceWater, type StackSettle } from "./stackWater";
import { StartWaterDays, type StartWaterInput } from "./startWaterDay";
import { TICKS_PER_DAY, type WaterModel } from "./water";
import { badtideContamination, HAZARD_DAYS, HazardRun, hazardSoil, type Hazard, type HazardWater } from "./weather";
import { Withering, type DeathCause, type Plant } from "./withering";
import { shortestDam, type ShortestDam } from "../analysis/damsites";
import { FLUIDS } from "../data/parity";
import { timedOf } from "../format/entities";

/** How each difficulty's weather grows and turns (GameModeSpec, NewGameModes/GameMode.*; investigation/cycles/weather.ts
 *  `MODES`): the handicap each hazard starts at and the cycles it takes to reach 1, the cycles before a badtide may
 *  come, and a badtide's base chance. */
export const CYCLE_RULES: Record<Difficulty, { droughtHandicap: number; droughtCycles: number; badtideHandicap: number; badtideCycles: number; randomizeAfter: number; badtideChance: number }> = {
  easy: { droughtHandicap: 0.25, droughtCycles: 8, badtideHandicap: 0.3, badtideCycles: 6, randomizeAfter: 5, badtideChance: 0.4 },
  normal: { droughtHandicap: 0.38, droughtCycles: 5, badtideHandicap: 0.15, badtideCycles: 5, randomizeAfter: 4, badtideChance: 0.4 },
  hard: { droughtHandicap: 0.2, droughtCycles: 12, badtideHandicap: 0.4, badtideCycles: 9, randomizeAfter: 3, badtideChance: 0.4 },
};

/** The cycles a report covers unless asked for another number. */
export const REPORT_CYCLES = 10;

/** One cycle: its temperate days, then its hazard and that hazard's days; `occurrence` counts that hazard so far. */
export interface CyclePlan {
  cycle: number;
  temperate: number;
  hazard: Hazard;
  days: number;
  occurrence: number;
}

/** The handicap of a hazard's `n`-th time (HazardousWeatherHelper.GetHandicapMultiplier): lerp(start, 1, (n − 1) / cycles). */
export function handicap(n: number, start: number, cycles: number): number {
  const t = cycles > 0 ? Math.min(1, Math.max(0, (n - 1) / cycles)) : 1;
  return start + (1 - start) * t;
}

/** The chance the next hazard is a badtide after `history`, most recent last (HazardousWeatherRandomizer): the base
 *  chance, halved when the streak so far is under 5% likely, none under 2.5%. */
export function badtideChance(history: readonly Hazard[], base: number): number {
  if (!history.length) return base;
  const last = history[history.length - 1];
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === last; i--) streak++;
  let p = last === "badtide" ? base : 1 - base;
  const likelihood = portable.pow(p, streak + 1);
  if (likelihood < 0.025) p = 0;
  else if (likelihood < 0.05) p *= 0.5;
  return last === "badtide" ? p : 1 - p;
}

/** A hazard's length on its `n`-th time, at `at` of its range (0 the shortest, 1 the longest): uniform in [h·shortest,
 *  h·longest], rounded, at least 1 (DroughtWeather/BadtideWeather.GetDurationAtCycle). */
export function hazardLength(d: Difficulty, hazard: Hazard, n: number, at: number): number {
  const r = CYCLE_RULES[d];
  const h = hazard === "drought" ? handicap(n, r.droughtHandicap, r.droughtCycles) : handicap(n, r.badtideHandicap, r.badtideCycles);
  const [lo, hi] = HAZARD_DAYS[d][hazard];
  return Math.max(1, Math.round(h * lo + (h * hi - h * lo) * at));
}

/** The hardest first `n` cycles the game deals, in its likeliest order: each temperate spell at its shortest, each
 *  hazard at the longest its handicap allows, a badtide wherever the game's odds favour one (Normal: droughts, with a
 *  badtide in cycle 6). */
export function hardestCycles(d: Difficulty, n = REPORT_CYCLES): CyclePlan[] {
  const r = CYCLE_RULES[d];
  const history: Hazard[] = [];
  const counts = { drought: 0, badtide: 0 };
  const out: CyclePlan[] = [];
  for (let cycle = 1; cycle <= n; cycle++) {
    const hazard: Hazard = cycle > r.randomizeAfter && badtideChance(history, r.badtideChance) > 0.5 ? "badtide" : "drought";
    const occurrence = ++counts[hazard];
    out.push({ cycle, temperate: TEMPERATE_DAYS[d][0], hazard, days: hazardLength(d, hazard, occurrence, 1), occurrence });
    history.push(hazard);
  }
  return out;
}

/** Mathf.Approximately. */
const approximately = (a: number, b: number) => Math.abs(b - a) < Math.max(1e-6 * Math.max(Math.abs(a), Math.abs(b)), 1.1920929e-7 * 8);

/** The first `n` cycles drawn with the game's odds from `seed`, in the game's order of draws (temperate days, then the
 *  badtide's chance when there is one to draw, then the length). A seeded generator stands in for Unity's: the odds
 *  match, the sequence cannot. */
export function drawnCycles(d: Difficulty, seed: number, n = REPORT_CYCLES): CyclePlan[] {
  const r = CYCLE_RULES[d];
  const rng = new Rng(seed);
  const history: Hazard[] = [];
  const counts = { drought: 0, badtide: 0 };
  const out: CyclePlan[] = [];
  for (let cycle = 1; cycle <= n; cycle++) {
    const temperate = rng.int(TEMPERATE_DAYS[d][0], TEMPERATE_DAYS[d][1] + 1);
    let hazard: Hazard = "drought";
    if (cycle > r.randomizeAfter) {
      const chance = badtideChance(history, r.badtideChance);
      if (approximately(chance, 1) || rng.float() < chance) hazard = "badtide";
    }
    const occurrence = ++counts[hazard];
    out.push({ cycle, temperate, hazard, days: hazardLength(d, hazard, occurrence, rng.float()), occurrence });
    history.push(hazard);
  }
  return out;
}

const f = Math.fround;
/** DayNightCycle.DayLengthInSeconds: 768 ticks of TickTimeSpec 0.6 s, in float. */
const DAY_SECONDS = f(TICKS_PER_DAY * f(0.6));
/** WaterStrengthSpec: the most a source's strength changes a second, and the ramp's slowest share. */
const MAX_CHANGE = f(0.0058);
const MIN_SCALER = f(0.15);
/** DayNightCycleSpec.HoursPassedOnNewGame 4, as ticks: int(4 / 24 · 768). */
export const NEW_GAME_TICK = 128;

/** The days a source of strength `s` takes to ease off before a drought, and back after it
 *  (DroughtWaterStrengthModifier.GetTransitionTime). */
export function easingDays(s: number): number {
  return s / (DAY_SECONDS * MAX_CHANGE);
}

/** The eased share of the ramp done `progress` days in (DroughtWaterStrengthModifier.GetModifier). */
function eased(progress: number, transition: number, s: number): number {
  const scaler = (1 - MIN_SCALER) * (progress / transition) + MIN_SCALER;
  return (progress * DAY_SECONDS * MAX_CHANGE * scaler) / s;
}

/** The game's calendar over a plan: when each cycle and hazard starts, in days from the start of day 1. */
export class CycleCalendar {
  /** The day each cycle starts, and the plan's end (`starts[plans.length]`). */
  readonly starts: number[];

  constructor(readonly plans: readonly CyclePlan[]) {
    this.starts = [0];
    for (const p of plans) this.starts.push(this.starts[this.starts.length - 1] + p.temperate + p.days);
  }

  /** The days the plan covers. */
  get end(): number {
    return this.starts[this.plans.length];
  }

  /** The day cycle `k`'s hazard starts (k from 0). */
  hazardStart(k: number): number {
    return this.starts[k] + this.plans[k].temperate;
  }

  /** The cycle (from 0) a moment `t` days from the start of day 1 falls in (the last at the plan's end). */
  cycleAt(t: number): number {
    let k = 0;
    while (k < this.plans.length - 1 && t >= this.starts[k + 1]) k++;
    return k;
  }

  /** A source of strength `s`'s share of it at `t` (DroughtWaterStrengthModifier.GetStrengthModifier): none in a drought,
   *  easing off before one and back after it, else all of it. A sink (below 0) only stops in a drought. */
  sourceShare(s: number, t: number): number {
    const k = this.cycleAt(t);
    const plan = this.plans[k];
    const day = t - this.starts[k] + 1; // the partial cycle day
    if (day >= plan.temperate + 1) return plan.hazard === "drought" ? 0 : 1;
    if (!(s > 0)) return 1;
    const transition = easingDays(s);
    const rampStart = plan.temperate + 1 - transition;
    if (plan.hazard === "drought" && day >= rampStart) return 1 - eased(day - rampStart, transition, s);
    const since = day - 1;
    if (k > 0 && this.plans[k - 1].hazard === "drought" && since < transition) return eased(since, transition, s);
    return 1;
  }

  /** The contamination the clean sources give at `t`: a badtide's (weather.ts `badtideContamination`), else 0. */
  cleanContamination(t: number): number {
    const k = this.cycleAt(t);
    const plan = this.plans[k];
    const since = t - this.hazardStart(k);
    return plan.hazard === "badtide" && since >= 0 && since < plan.days ? badtideContamination(since, plan.days) : 0;
  }

  /** What day `d` (the day ending `d` days from the start of day 1, from 1) was: its cycle (from 1), its weather and its
   *  day in that weather (from 1). */
  dayOf(d: number): { cycle: number; weather: "temperate" | Hazard; day: number } {
    const k = this.cycleAt(d - 1);
    const into = d - this.hazardStart(k);
    return into > 0 ? { cycle: k + 1, weather: this.plans[k].hazard, day: into } : { cycle: k + 1, weather: "temperate", day: d - this.starts[k] };
  }
}

/** What the first ten cycles are read from: the map, its settled water and its start. */
export interface CyclesInput {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Every object, as the water and the soil read them. */
  objects: readonly MapObject[];
  /** The water model and the water day 0 starts from (the canonical settle, or an unedited import's own; every column
   *  of it on a map with caves or overhangs). */
  model: WaterModel;
  water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; stack?: StackSettle | null };
  /** The start, and its water rule's walk in tiles (`StartWaterInput`). */
  start: { x: number; y: number } | null | undefined;
  within: number;
  /** The original plants that can die (`withering.ts`). */
  plants: readonly Plant[];
  /** The blocks of water a dam's reservoir must hold to count (the checks' drought need, `Rules.reservoirNeed`). */
  need: number;
}

export interface DroughtResult {
  cycle: number;
  /** Which drought this is (1 the first). */
  occurrence: number;
  days: number;
  /** The drought's day the start's water is gone (0: gone before it began, as the sources eased off), or null: it lasts. */
  goneOnDay: number | null;
}

export interface BadtideResult {
  cycle: number;
  occurrence: number;
  days: number;
  /** The day, counted from the badtide's start, badwater first stands in the start's water (after the badtide's last
   *  day: the badwater it left reached it later), or null: not before the next hazard. */
  reachesOnDay: number | null;
}

/** A day of the run: the game's day (from 1), its cycle, its weather and its day in that weather. */
export interface ReportDay {
  gameDay: number;
  cycle: number;
  weather: "temperate" | Hazard;
  day: number;
}

/** The plants of one species that died in one cycle's weather, of one cause. */
export interface Deaths {
  cycle: number;
  weather: "temperate" | Hazard;
  template: string;
  cause: DeathCause;
  count: number;
}

export interface CyclesReport {
  difficulty: Difficulty;
  /** The weather played: the hardest in its likeliest order, or drawn from a seed. */
  weather: { kind: "hardest" } | { kind: "drawn"; seed: number };
  cycles: CyclePlan[];
  /** The game days the run covers (the last day of the last cycle). */
  days: number;
  /** Whether the start has water a pump reaches on day 0: without it there is nothing to lose or spoil. */
  startWater: boolean;
  droughts: DroughtResult[];
  badtides: BadtideResult[];
  /** The first day badwater stands in the start's water, from any source in any weather, or null: never. */
  badwater: ReportDay | null;
  /** The original plants that die, by cycle, weather, species and cause, in the order they die. */
  deaths: Deaths[];
  /** The original plants that can die, and those that did, by species. */
  plants: Record<string, { total: number; dead: number }>;
  /** The shortest straight dam near the start that holds a drought's need, on day 0's water, or null: none does. */
  dam: ShortestDam | null;
}

/** The water as the views read it on a day (a map with caves or overhangs: seen from above, `surfaceWater`). */
function seen(w: { depth: ArrayLike<number>; contamination: ArrayLike<number>; stack?: StackSettle | null }, heights: ArrayLike<number>): DayWater {
  return w.stack ? surfaceWater(w.stack, heights) : w;
}

/** Ticks a step runs at most while a source eases or a badtide's contamination turns (the game sets both every tick). */
const FINE_TICKS = 16;

/**
 * The first ten cycles, run a slice at a time (`advance`), so a worker can yield between slices; `report` once `done`.
 * `dispose` frees the water when done (or abandoned).
 */
export class CyclesRun {
  readonly calendar: CycleCalendar;
  /** Ticks from the start of day 1 the run has reached, and the tick it ends at. */
  tick = NEW_GAME_TICK;
  readonly endTick: number;
  private readonly run: HazardRun;
  /** Every source's own strength (the engine's order), and the heightfield's sources that wait for a time or a badtide
   *  (their strength then comes from the game's timeline, `fluidModelAt`). */
  private readonly base: Float64Array;
  private readonly timeline: boolean;
  /** The windows where a step is at most FINE_TICKS long, in ticks, in order. */
  private readonly fine: [number, number][] = [];
  private readonly day0: DayWater;
  private readonly startWater: StartWaterInput;
  private readonly hasStartWater: boolean;
  private readonly droughts = new Map<number, StartWaterDays>();
  private readonly badtides = new Map<number, StartWaterDays>();
  private readonly anyBadwater: StartWaterDays;
  private readonly withering: Withering;

  constructor(readonly input: CyclesInput, readonly plans: readonly CyclePlan[], readonly weather: CyclesReport["weather"], readonly difficulty: Difficulty) {
    if (!plans.length) throw new Error("A report needs at least one cycle.");
    const { W, H, heights, model } = input;
    this.calendar = new CycleCalendar(plans);
    this.endTick = this.calendar.end * TICKS_PER_DAY;
    this.run = new HazardRun(model, { depth: Float64Array.from(input.water.depth), contamination: Float64Array.from(input.water.contamination), stack: input.water.stack ?? null }, "drought", Infinity);
    this.base = this.run.strengths();
    // (the heightfield's model holds a timed source or a badtide drain at 0; the game's timeline turns them on)
    this.timeline = !model.stacked && input.objects.some((o) => FLUIDS[o.template]?.tiles && (FLUIDS[o.template].activeIn || timedOf(o.components).enabled));
    const most = this.base.reduce((a, s) => Math.max(a, s), 0);
    const ease = Math.ceil(easingDays(most) * TICKS_PER_DAY) + FINE_TICKS;
    const half = TICKS_PER_DAY / 2 + FINE_TICKS;
    plans.forEach((p, k) => {
      const at = this.calendar.hazardStart(k) * TICKS_PER_DAY;
      const end = this.calendar.starts[k + 1] * TICKS_PER_DAY;
      if (p.hazard === "drought") this.fine.push([at - ease, at], [end, end + ease]);
      else this.fine.push([at, at + half], [end - half, end]);
    });
    this.fine.sort((a, b) => a[0] - b[0]);
    this.day0 = seen(input.water, heights);
    this.startWater = { W, H, heights, objects: input.objects, start: input.start, within: input.within };
    this.anyBadwater = new StartWaterDays("badtide", this.day0, this.startWater);
    this.hasStartWater = this.anyBadwater.has;
    this.withering = new Withering(input.plants);
    if (input.plants.length) this.withering.see(this.soil(this.dayWater()));
  }

  /** The share of the run done, 0 to 1. */
  get progress(): number {
    return (this.tick - NEW_GAME_TICK) / (this.endTick - NEW_GAME_TICK);
  }

  get done(): boolean {
    return this.tick >= this.endTick;
  }

  /** Up to `ticks` more of the run (whole steps; a day's reading at each day's end). True once it is done. */
  advance(ticks: number): boolean {
    const until = Math.min(this.endTick, this.tick + Math.max(1, ticks));
    while (this.tick < until) {
      const t = this.tick;
      const nextDay = (Math.floor(t / TICKS_PER_DAY) + 1) * TICKS_PER_DAY;
      let to = nextDay;
      for (const [a, b] of this.fine) {
        if (t >= a && t < b) to = Math.min(to, t + FINE_TICKS, b);
        else if (a > t) to = Math.min(to, a);
      }
      const n = to - t;
      const mid = (t + n / 2) / TICKS_PER_DAY;
      const base = this.timeline ? this.timelineStrengths(mid) : this.base;
      const strengths = Float64Array.from(base, (s) => s * this.calendar.sourceShare(s, mid));
      this.run.runWith(n, strengths, this.calendar.cleanContamination(mid));
      this.tick = to;
      if (to === nextDay) this.endOfDay(to / TICKS_PER_DAY);
    }
    return this.done;
  }

  /** Every source's own strength at `t` days on the game's timeline (a timed source once its time has come, a badtide
   *  drain in a badtide), drought or not: the share comes after. */
  private timelineStrengths(t: number): Float64Array {
    const { W, H, heights, objects } = this.input;
    const k = this.calendar.cycleAt(t);
    const plan = this.plans[k];
    const badtide = plan.hazard === "badtide" && t >= this.calendar.hazardStart(k);
    const r = fluidModelAt(W, H, heights, objects, { cycle: k + 1, day: t - this.calendar.starts[k], cycleStartDays: this.calendar.starts.slice(0, k + 1), weather: badtide ? "badtide" : "temperate" });
    if (!r.ok || r.model.emitters.length !== this.base.length) return this.base;
    return Float64Array.from(r.model.emitters, (e) => e.strength);
  }

  /** The water now, as the soil reads it. */
  private dayWater(): HazardWater {
    if (this.run.stack) return { ...this.run.stack.top(), out: null, stack: this.run.stack.state() };
    const sim = this.run.sim!;
    return { depth: sim.D, contamination: sim.C, out: null, stack: null };
  }

  /** The soil the plants stand on (the game's soil rules on the water now, weather.ts `hazardSoil`). */
  private soil(w: HazardWater): { moisture: ArrayLike<number>; contamination: ArrayLike<number> } {
    return hazardSoil(this.input.model, this.input.heights, w, this.input.objects);
  }

  /** Day `d` has ended (`d` days from the start of day 1): read it. */
  private endOfDay(d: number): void {
    const w = this.dayWater();
    const water = seen(w, this.input.heights);
    const cal = this.calendar;
    // (a drought's trackers see the water as it begins, then each of its days; a badtide's each of its days and those
    // after it, until the next hazard begins)
    for (let k = 0; k < this.plans.length; k++) {
      const at = cal.hazardStart(k);
      if (this.plans[k].hazard === "drought") {
        if (d === at) this.droughts.set(k, new StartWaterDays("drought", this.day0, this.startWater));
        if (d >= at && d <= cal.starts[k + 1]) this.droughts.get(k)?.see(water);
      } else {
        if (d === at) this.badtides.set(k, new StartWaterDays("badtide", this.day0, this.startWater));
        const next = k + 1 < this.plans.length ? cal.hazardStart(k + 1) : cal.end;
        if (d > at && d <= next) this.badtides.get(k)?.see(water);
      }
    }
    this.anyBadwater.see(water);
    if (this.input.plants.length) this.withering.see(this.soil(w));
  }

  report(): CyclesReport {
    if (!this.done) throw new Error("The run has not reached the end of its last cycle.");
    const cal = this.calendar;
    const droughts: DroughtResult[] = [];
    const badtides: BadtideResult[] = [];
    this.plans.forEach((p, k) => {
      if (p.hazard === "drought") {
        const t = this.droughts.get(k);
        // (its first sight is the water as the drought begins: day 0)
        const day = t && t.day > 0 ? t.day - 1 : null;
        droughts.push({ cycle: p.cycle, occurrence: p.occurrence, days: p.days, goneOnDay: this.hasStartWater ? day : null });
      } else {
        const t = this.badtides.get(k);
        badtides.push({ cycle: p.cycle, occurrence: p.occurrence, days: p.days, reachesOnDay: t && t.day > 0 ? t.day : null });
      }
    });
    const first = this.anyBadwater.day;
    const badwater = first > 0 ? { gameDay: first, ...cal.dayOf(first) } : null;
    // (the run's first reading is day 1's end: the game's day 1 began at 04:00)
    const deaths: Deaths[] = [];
    const plants: CyclesReport["plants"] = {};
    const order = [...this.input.plants.keys()].sort((a, b) => this.withering.day[a] - this.withering.day[b] || a - b);
    for (const n of order) {
      const p = this.input.plants[n];
      const tally = (plants[p.template] ??= { total: 0, dead: 0 });
      tally.total++;
      const d = this.withering.day[n];
      if (!d) continue;
      tally.dead++;
      const when = cal.dayOf(d);
      const cause = this.withering.cause[n]!;
      const last = deaths.find((x) => x.cycle === when.cycle && x.weather === when.weather && x.template === p.template && x.cause === cause);
      if (last) last.count++;
      else deaths.push({ cycle: when.cycle, weather: when.weather, template: p.template, cause, count: 1 });
    }
    return {
      difficulty: this.difficulty,
      weather: this.weather,
      cycles: this.plans.map((p) => ({ ...p })),
      days: cal.end,
      startWater: this.hasStartWater,
      droughts,
      badtides,
      badwater,
      deaths,
      plants,
      dam: this.input.start ? shortestDam(this.input.heights, this.day0.depth, this.day0.contamination, this.input.W, this.input.H, this.input.start, this.input.need) : null,
    };
  }

  dispose(): void {
    this.run.dispose();
  }
}

/** The first ten cycles of `input` (or `plans`' cycles), at once: the run, read to its end. */
export function cyclesReport(input: CyclesInput, difficulty: Difficulty = "normal", opts: { seed?: number; cycles?: number } = {}): CyclesReport {
  const run = startCycles(input, difficulty, opts);
  try {
    run.advance(Infinity);
    return run.report();
  } finally {
    run.dispose();
  }
}

/** The run of the first ten cycles (`opts.cycles` of them): the hardest weather in its likeliest order, or drawn from
 *  `opts.seed` with the game's odds. */
export function startCycles(input: CyclesInput, difficulty: Difficulty = "normal", opts: { seed?: number; cycles?: number } = {}): CyclesRun {
  const n = opts.cycles ?? REPORT_CYCLES;
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("A report covers 1 to 100 cycles.");
  const plans = opts.seed === undefined ? hardestCycles(difficulty, n) : drawnCycles(difficulty, opts.seed, n);
  return new CyclesRun(input, plans, opts.seed === undefined ? { kind: "hardest" } : { kind: "drawn", seed: opts.seed }, difficulty);
}
