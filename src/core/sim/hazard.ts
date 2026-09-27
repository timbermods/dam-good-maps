// A drought or a badtide, day by day (PLAN §20 D267, D268, D269): the editor's Drought and Badtide
// buttons show the hazard's last day at once, and a day strip steps through it from Day 0 (the map
// as it is). The weather rules are the ones core/sim/weather.ts ports from the cycles investigation:
// in a drought every source stops and the water drains and evaporates; in a badtide every clean
// source gives badwater along the game's curve, and it spreads through the water. The run keeps a
// few frames of each day (for the step from one day to the next) and notes, for every tile that
// holds water on Day 0, the day it dries (a drought) or turns bad (a badtide).

import { TICKS_PER_DAY, WaterSim, type Emitter, type WaterModel } from "./water";
import { badtideContamination, type Hazard } from "./weather";

/** A hazard's length in the day strip: 1 to 30 days (D267 (3)). */
export const HAZARD_MIN_DAYS = 1;
export const HAZARD_MAX_DAYS = 30;
/** Water shallower than this is dry, and water this contaminated or more is bad: the checks'
 *  thresholds (validate/playability.ts WET and BAD; a pump needs water cleaner than 0.05). */
export const DRY = 0.05;
export const BAD_WATER = 0.05;
/** In `change`: the tile held no water on Day 0; its water lasts the hazard (or stays clean); its
 *  water was already bad on Day 0. */
export const NOT_WATER = 0;
export const LASTS = 255;
export const ALREADY_BAD = 254;

export interface HazardSetup {
  model: WaterModel;
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
  hazard: Hazard;
  days: number;
  /** Frames kept within each day, its last the day's end (a divisor of TICKS_PER_DAY). */
  framesPerDay: number;
}

/** Frames a day can keep: divisors of TICKS_PER_DAY (768), fewest first. */
export const FRAME_CHOICES = [4, 6, 8, 12, 16, 24] as const;

/** A hazard run over its days: `step` runs the water to the next frame. */
export class HazardRun {
  readonly hazard: Hazard;
  readonly days: number;
  readonly framesPerDay: number;
  readonly sim: WaterSim;
  /** For each tile with water on Day 0, the day its water dries (a drought) or turns bad (a
   *  badtide); LASTS if it never does within the hazard; NOT_WATER elsewhere (ALREADY_BAD in a
   *  badtide for water bad on Day 0). */
  readonly change: Uint8Array;
  private readonly clean: Emitter[];
  private readonly gap: number;
  /** Ticks run so far. */
  ticks = 0;

  constructor(s: HazardSetup) {
    this.hazard = s.hazard;
    this.days = Math.max(HAZARD_MIN_DAYS, Math.min(HAZARD_MAX_DAYS, Math.round(s.days)));
    this.framesPerDay = s.framesPerDay;
    this.gap = TICKS_PER_DAY / s.framesPerDay;
    if (!Number.isInteger(this.gap)) throw new Error(`${s.framesPerDay} frames a day do not divide a day's ticks`);
    // the sources' own copies: a badtide changes what the clean ones give
    const model: WaterModel = { ...s.model, emitters: s.model.emitters.map((e) => ({ ...e })) };
    this.clean = model.emitters.filter((e) => e.contamination === 0);
    this.sim = new WaterSim(model, { depth: Float64Array.from(s.depth), contamination: Float64Array.from(s.contamination) });
    const N = this.sim.N;
    this.change = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!(s.depth[i] > DRY)) continue;
      this.change[i] = this.hazard === "badtide" && s.contamination[i] >= BAD_WATER ? ALREADY_BAD : LASTS;
    }
  }

  /** Whether every day has run. */
  get done(): boolean {
    return this.ticks >= this.days * TICKS_PER_DAY;
  }

  /** How far the run has come (0–1). */
  get progress(): number {
    return Math.min(1, this.ticks / (this.days * TICKS_PER_DAY));
  }

  /** Run the water to the next frame: the day it belongs to (1…days), its index in the day
   *  (0…framesPerDay − 1, the last the day's end), or null when every day has run. */
  step(): { day: number; frame: number } | null {
    if (this.done) return null;
    const drought = this.hazard === "drought";
    for (let k = 0; k < this.gap; k++) {
      // the badtide's curve, tick by tick (BadtideWaterSourceContaminationController)
      if (!drought) {
        const c = badtideContamination(this.ticks / TICKS_PER_DAY, this.days);
        for (const e of this.clean) e.contamination = c;
      }
      this.sim.run(1, drought ? 0 : 1);
      this.ticks++;
    }
    const day = Math.ceil(this.ticks / TICKS_PER_DAY - 1e-9);
    const frame = Math.round((this.ticks - (day - 1) * TICKS_PER_DAY) / this.gap) - 1;
    if (frame === this.framesPerDay - 1) this.noteDay(day);
    return { day, frame };
  }

  /** At the end of a day: the water that dried or turned bad that day. */
  private noteDay(day: number): void {
    const { D, C } = this.sim;
    const ch = this.change;
    const drought = this.hazard === "drought";
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] !== LASTS) continue;
      if (drought ? !(D[i] > DRY) : C[i] >= BAD_WATER) ch[i] = day;
    }
  }
}

/** Frames to keep each day, within a memory budget (bytes) for `wet` tiles of water over `days`
 *  (16 bytes a tile a frame: its index, floor, depth and contamination). */
export function framesPerDay(days: number, wet: number, budget = 48 * 1024 * 1024): number {
  const per = 16 * Math.max(1, wet) * Math.max(1, days);
  let best: number = FRAME_CHOICES[0];
  for (const f of FRAME_CHOICES) if (f * per <= budget) best = f;
  return best;
}

/** A note for a tile of water under the pointer while a hazard is shown (D267 (5)): when it dries
 *  or turns bad, in a few words; null for a tile with no water on Day 0. */
export function hazardNote(hazard: Hazard, change: number): string | null {
  if (change === NOT_WATER) return null;
  if (hazard === "drought") return change === LASTS ? "Lasts the drought" : `Dry on day ${change}`;
  if (change === ALREADY_BAD) return "Badwater already";
  return change === LASTS ? "Stays clean" : `Turns bad on day ${change}`;
}
