// A drought or a badtide, day by day (PLAN §20 D267, D268, D269): the editor's Drought and Badtide
// buttons show the hazard's last day at once, and a day strip steps through it from Day 0 (the map
// as it is). The weather rules are the ones core/sim/weather.ts ports from the cycles investigation
// and the game (checked against the DGM Probe's games): before a drought every source eases down
// over its own transition (DroughtWaterStrengthModifier), then stops, and the water drains and
// evaporates; in a badtide every clean source gives badwater along the game's curve, and it spreads
// through the water. The run starts from the water the file holds, with its outflows (the game
// loads both). The run keeps a
// few frames of each day (for the step from one day to the next) and notes, for every tile that
// holds water on Day 0, the day it dries (a drought) or turns bad (a badtide).

import { TICKS_PER_DAY, WaterSim, type Emitter, type WaterModel } from "./water";
import { badtideContamination, droughtStrength, droughtTransitionDays, type Hazard } from "./weather";

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
  /** The water's outflow momentum, four per tile (`WaterSim.out`): the settle's own, as the file
   *  stores it and the game loads it; left out, the water starts at rest. */
  out?: ArrayLike<number>;
  hazard: Hazard;
  days: number;
  /** Frames kept within each day, its last the day's end (a divisor of TICKS_PER_DAY). */
  framesPerDay: number;
  /** Days before a drought the run starts from the given water, the sources easing down as the
   *  drought comes (`droughtStrength`): by default the longest source's ease, the map as it is being
   *  the water of the temperate days before it; the probe's games give their own (three temperate
   *  days from 04:00). A badtide starts at once. */
  lead?: number;
}

/** Frames a day can keep: divisors of TICKS_PER_DAY (768), fewest first. */
export const FRAME_CHOICES = [4, 6, 8, 12, 16, 24] as const;

/** A frame of a hazard run: the day it belongs to (1…days; the sources' ease before a drought
 *  belongs to day 1, the step from Day 0), its index in that day, whether it ends the day, and
 *  whether it is the moment the hazard starts (the ease's end). */
export interface HazardFrame {
  day: number;
  frame: number;
  end: boolean;
  start: boolean;
}

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
  /** Ticks before the hazard starts (the sources' ease down before a drought). */
  readonly lead: number;
  /** Frames of day 1 before the hazard starts. */
  readonly leadFrames: number;
  private readonly emitters: Emitter[];
  /** Each emitter's full strength and the strength its ease is timed by. */
  private readonly full: { strength: number; specified: number }[];
  /** Which emitters give clean water of their own (a badtide turns them bad). */
  private readonly clean: boolean[];
  private readonly frames: HazardFrame[] = [];
  private readonly at: number[] = [];
  private next = 0;
  /** Ticks run so far. */
  ticks = 0;

  constructor(s: HazardSetup) {
    this.hazard = s.hazard;
    this.days = Math.max(HAZARD_MIN_DAYS, Math.min(HAZARD_MAX_DAYS, Math.round(s.days)));
    this.framesPerDay = s.framesPerDay;
    const gap = TICKS_PER_DAY / s.framesPerDay;
    if (!Number.isInteger(gap)) throw new Error(`${s.framesPerDay} frames a day do not divide a day's ticks`);
    // the sources' own copies: a hazard changes what they give
    const model: WaterModel = { ...s.model, emitters: s.model.emitters.map((e) => ({ ...e })) };
    this.emitters = model.emitters;
    this.full = model.emitters.map((e) => ({ strength: e.strength, specified: e.specified ?? e.strength }));
    this.clean = model.emitters.map((e) => e.contamination === 0);
    // a drought: the sources ease down first, over the longest of their eases (or the lead given)
    let lead = 0;
    if (s.hazard === "drought") {
      const longest = Math.max(0, ...this.full.map((e) => (e.strength > 0 ? droughtTransitionDays(e.specified) : 0)));
      lead = Math.max(0, Math.round((s.lead ?? longest) * TICKS_PER_DAY));
    }
    this.lead = lead;
    // (the game's own edge rule: a draining river keeps its last 0.1 on the map's edge, WaterSim)
    this.sim = new WaterSim(model, { depth: Float64Array.from(s.depth), contamination: Float64Array.from(s.contamination) }, { edgeSpill: true });
    if (s.out && s.out.length === this.sim.out.length) this.sim.out.set(s.out);
    // the frames: the ease's (as many as a day's, spread over it), then each day's
    const leadFrames = lead > 0 ? Math.min(s.framesPerDay, lead) : 0;
    for (let k = 1; k <= leadFrames; k++) {
      this.at.push(Math.round((lead * k) / leadFrames));
      this.frames.push({ day: 1, frame: k - 1, end: false, start: k === leadFrames });
    }
    for (let d = 1; d <= this.days; d++)
      for (let k = 1; k <= s.framesPerDay; k++) {
        this.at.push(lead + (d - 1) * TICKS_PER_DAY + k * gap);
        this.frames.push({ day: d, frame: (d === 1 ? leadFrames : 0) + k - 1, end: k === s.framesPerDay, start: false });
      }
    this.leadFrames = leadFrames;
    const N = this.sim.N;
    this.change = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!(s.depth[i] > DRY)) continue;
      this.change[i] = this.hazard === "badtide" && s.contamination[i] >= BAD_WATER ? ALREADY_BAD : LASTS;
    }
  }

  /** Whether every day has run. */
  get done(): boolean {
    return this.next >= this.frames.length;
  }

  /** How far the run has come (0–1). */
  get progress(): number {
    return Math.min(1, this.ticks / (this.lead + this.days * TICKS_PER_DAY));
  }

  /** Run the water to the next frame, or null when every day has run. */
  step(): HazardFrame | null {
    if (this.done) return null;
    const until = this.at[this.next];
    const f = this.frames[this.next++];
    const drought = this.hazard === "drought";
    while (this.ticks < until) {
      // the sources for this tick, on the game's clock (the tick's time, after the clock moves):
      // x days from the hazard's start
      const x = (this.ticks + 1 - this.lead) / TICKS_PER_DAY;
      for (let k = 0; k < this.emitters.length; k++) {
        const e = this.emitters[k];
        const full = this.full[k];
        if (drought) e.strength = full.strength > 0 ? Math.min(full.strength, full.specified * droughtStrength(x, full.specified)) : 0;
        // the badtide's curve, tick by tick (BadtideWaterSourceContaminationController): every clean
        // source and seep
        else if (this.clean[k]) e.contamination = badtideContamination(x, this.days);
      }
      this.sim.run(1);
      this.ticks++;
    }
    if (f.end) this.noteDay(f.day);
    return f;
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

/** Flooded floor on a day of the hazard (D307): ground dry on Day 0 (`change` NOT_WATER) that is wet
 *  on this day (`depth`, per tile) and joined, through this day's water (4-neighbours), to water
 *  that was already there on Day 0: a river's refill spilling onto its floodplain. 1 where so. */
export function floodedTiles(W: number, H: number, change: ArrayLike<number>, depth: ArrayLike<number>): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  const seen = new Uint8Array(N);
  const stack: number[] = [];
  for (let i = 0; i < N; i++) {
    if (change[i] === NOT_WATER || !(depth[i] > DRY)) continue;
    seen[i] = 1;
    stack.push(i);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x + 1 < W ? i + 1 : -1) : k === 2 ? (y > 0 ? i - W : -1) : y + 1 < H ? i + W : -1;
      if (n < 0 || seen[n] || !(depth[n] > DRY)) continue;
      seen[n] = 1;
      if (change[n] === NOT_WATER) out[n] = 1;
      stack.push(n);
    }
  }
  return out;
}

/** What hovering flooded floor says (D307). */
export const FLOODS_NOTE = "Floods when the river refills";
