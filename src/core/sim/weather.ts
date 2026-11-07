// The hazardous weather a map meets, for the editor's Drought and Badtide buttons (live editing,
// PLAN §20 D180 (8), D181 (3)). A small port of the cycles investigation, which is checked against
// the decompiled game (investigation/cycles/FIDELITY.md) and adopted for the Weather view (D133,
// D173); the Weather view extends this module rather than repeating it. src/ never imports from
// investigation/ (tests/unit/boundaries.test.ts), so each rule is copied here with its source.

import * as portable from "../math/portable";
import type { Difficulty } from "../spec/mapspec";
import { ColumnTerrain } from "../terrain/runs";
import { waterColumns } from "./columns";
import type { MapObject } from "./model";
import { gameSoil, stackedSoil, topRuns } from "./soil";
import type { Soil3d } from "./soil3d";
import { StackRun, type StackSettle } from "./stackWater";
import { TICKS_PER_DAY, WaterSim, type Emitter, type WaterModel, type WaterState } from "./water";

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
    return 1 / (portable.exp(x) + portable.exp(-x)) + 0.5;
  };
  if (sinceStart < 0.5) return shape(sinceStart);
  const toEnd = days - sinceStart;
  if (toEnd < 0.5) return shape(toEnd);
  return 1;
}

/** The water a hazard run has reached: per tile from above (each tile's top column on terrain above
 *  terrain, as the build's per-tile water reads a stacked settle), the outflows on a heightfield or an
 *  open field (4 per tile, `WaterSim.out`; null with caves), and every column on terrain above terrain
 *  (null on a heightfield). Copies, safe to keep. */
export interface HazardWater {
  depth: Float64Array;
  contamination: Float64Array;
  out: Float64Array | null;
  stack: StackSettle | null;
}

/** A hazard run on a map's water (the editor's Drought and Badtide, D180 (8), D181 (3)): its own
 *  simulation from `water`, on its own copies of the sources (a badtide changes what the clean ones
 *  give). A drought stops every source; a badtide gives each clean source `badtideContamination` for
 *  the time it has run, set before each step. On terrain above terrain (`WaterModel.stacked`, a map
 *  with caves or overhangs) the same rules run in the stacked-column engine (stackWater.ts `StackRun`)
 *  from `water.stack`, the water on every column; a heightfield runs `WaterSim`, as ever.
 *  `ticksPerDay` is the game's (TICKS_PER_DAY) unless a check runs it faster (the determinism cases).
 *  The caller paces the steps, shows the frames and disposes of the run when done. */
export class HazardRun {
  /** The heightfield's simulation, or null on terrain above terrain. */
  readonly sim: WaterSim | null;
  /** The stacked engine's run, or null on a heightfield. */
  readonly stack: StackRun | null;
  /** Ticks run so far. */
  ticks = 0;
  private readonly clean: Emitter[] = [];

  constructor(
    model: WaterModel,
    water: WaterState & { stack?: StackSettle | null },
    readonly hazard: Hazard,
    readonly days: number,
    readonly ticksPerDay = TICKS_PER_DAY,
  ) {
    if (model.stacked) {
      if (!water.stack) throw new Error("A map with caves or overhangs needs its water on every column for Drought and Badtide.");
      this.stack = new StackRun(model.W, model.H, model.stacked, water.stack);
      this.sim = null;
    } else {
      const own: WaterModel = { ...model, emitters: model.emitters.map((e) => ({ ...e })) };
      this.clean = own.emitters.filter((e) => e.contamination === 0);
      this.sim = new WaterSim(own, water);
      this.stack = null;
    }
  }

  /** The run's whole length, in ticks. */
  get total(): number {
    return this.days * this.ticksPerDay;
  }

  /** `ticks` more of the hazard; the contamination the clean sources gave during them (a badtide), or
   *  null (a drought). */
  step(ticks: number): number | null {
    let given: number | null = null;
    if (this.hazard === "badtide") given = badtideContamination(this.ticks / this.ticksPerDay, this.days);
    const scale = this.hazard === "drought" ? 0 : 1;
    if (this.stack) this.stack.run(ticks, scale, given);
    else {
      if (given !== null) for (const e of this.clean) e.contamination = given;
      this.sim!.run(ticks, scale);
    }
    this.ticks += ticks;
    return given;
  }

  /** `ticks` more with the hazard over: every source at its own strength, the clean ones clean again (the water
   *  a badtide left running on, Easy start's first badtide, D495). */
  after(ticks: number): void {
    if (this.stack) this.stack.run(ticks, 1, 0);
    else {
      for (const e of this.clean) e.contamination = 0;
      this.sim!.run(ticks, 1);
    }
    this.ticks += ticks;
  }

  /** The water as the run has left it (copies). */
  water(): HazardWater {
    if (this.stack) return { ...this.stack.top(), out: this.stack.outflows(), stack: this.stack.state() };
    const sim = this.sim!;
    return { depth: sim.D.slice(), contamination: sim.C.slice(), out: sim.out.slice(), stack: null };
  }

  /** Frees the simulation now (Wasm memory never shrinks); again is a no-op. */
  dispose(): void {
    this.sim?.dispose();
    this.stack?.close();
  }
}

/** The ground's moisture and contamination on a hazard's day, per tile from above (each tile's top run
 *  on terrain above terrain), for the view: the game's soil rules on the day's water, as the build's
 *  (soil.ts `gameSoil` on a heightfield, `stackedSoil` on every column's water with caves or
 *  overhangs, `runs` then holding every run top's). */
export function hazardSoil(model: WaterModel, heights: Uint8Array, w: HazardWater, objects: readonly MapObject[]): { moisture: Float64Array; contamination: Float64Array; runs: Soil3d | null } {
  if (model.stacked && w.stack) {
    const t = new ColumnTerrain(model.W, model.H, model.stacked.mask);
    const s = stackedSoil(t, waterColumns(t, objects), w.stack, objects);
    return { moisture: topRuns(s, s.moisture), contamination: topRuns(s, s.contamination), runs: s };
  }
  const s = gameSoil(model.W, model.H, heights, w.depth, w.contamination, objects);
  return { moisture: s.moisture, contamination: s.contamination, runs: null };
}
