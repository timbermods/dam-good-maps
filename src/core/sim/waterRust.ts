// The Rust water as a drop-in for WaterSim (PLAN §20 D381, D442 (b)): the same public fields and methods
// (W, H, N, F, dam, emitters, D, C, out, Dold, ticks, run, saturation, volume, state), backed by rust/water
// through rustWater.ts. Not switched on yet: WaterSim (water.ts) still runs the TypeScript simulation
// everywhere. The switch, the identity run and the TypeScript's tag and deletion wait until M9b is on dev,
// whose water.ts (the game's rules) the Rust port must then match (rust/water was ported from dev's
// water.ts before M9b; Kyler, 2026-10-03).
//
// Its arrays stay in JavaScript; each run copies in what a caller may have changed (the floor, the partial
// obstacles, the depth, the badwater share, the outflows and the emitters' strengths and seep limits), runs
// in Rust and copies the water back. The simulation's own state (its wet list, flows and evaporation
// modifiers) stays in Rust between runs, as it stays inside WaterSim. A model's emitters keep their tiles.

import { RustSim } from "./rustWater";
import type { Emitter, WaterModel, WaterState } from "./water";

export class RustWaterSim {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  readonly F: Float64Array;
  readonly dam: Float64Array | null;
  readonly emitters: Emitter[];
  D: Float64Array;
  C: Float64Array;
  /** Stored outflow momentum, 4 per tile (index 4·i + k), as WaterSim's. */
  readonly out: Float64Array;
  ticks = 0;
  private readonly rust: RustSim;
  private readonly model: WaterModel;

  constructor(model: WaterModel, initial?: WaterState) {
    const N = model.W * model.H;
    this.W = model.W;
    this.H = model.H;
    this.N = N;
    this.F = model.floor;
    this.dam = model.dam;
    this.emitters = model.emitters;
    this.model = model;
    this.D = new Float64Array(N);
    this.C = new Float64Array(N);
    if (initial) {
      this.D.set(initial.depth);
      this.C.set(initial.contamination);
    }
    this.out = new Float64Array(4 * N);
    this.rust = new RustSim(this, model, initial ? this.D : null, initial ? this.C : null);
  }

  /** The depth before the last substep, per tile (a copy). */
  get Dold(): Float64Array {
    return this.rust.dold();
  }

  /** Cluster saturation per wet tile (0 elsewhere). */
  saturation(): Uint8Array {
    return this.rust.saturation(this.model, this.D, this.C, this.out);
  }

  /** Run `ticks` ticks (2 substeps each). `strengthScale` scales every source (0 = drought). */
  run(ticks: number, strengthScale = 1): this {
    const n = ticks > 0 ? Math.ceil(ticks) : 0;
    if (n > 0) this.rust.run(this.model, this.D, this.C, this.out, n, strengthScale);
    this.ticks += n;
    return this;
  }

  /** Total water, summed in index order. */
  volume(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.D[i];
    return s;
  }

  state(): WaterState {
    return { depth: this.D.slice(), contamination: this.C.slice() };
  }
}
