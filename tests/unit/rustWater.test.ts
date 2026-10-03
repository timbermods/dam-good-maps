// The Rust water's binding loads and runs in Node (PLAN §20 D381, D442 (b)). Not switched on yet: WaterSim
// still runs the TypeScript simulation, so this checks only the wiring; tools/rust/check.ts checks that the
// Rust water gives the same bytes natively, in Node's WebAssembly and in each engine, and
// tools/rust/water-identity.ts compares it with the app's water (the adoption's identity run, after M9b).

import { describe, expect, it } from "vitest";
import { rustWaterRuns } from "../../src/core/sim/rustWater";
import type { WaterModel } from "../../src/core/sim/water";
import { RustWaterSim } from "../../src/core/sim/waterRust";

describe("the Rust water's binding", () => {
  it("loads in Node and runs a source into a basin, exposing depth, badwater, outflows and saturation", () => {
    expect(rustWaterRuns()).toBe(true);
    const W = 9;
    const H = 7;
    const floor = new Float64Array(W * H).fill(3);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) floor[y * W + x] = 1;
    const model: WaterModel = { W, H, floor, dam: null, emitters: [{ cells: [3 * W + 4], strength: 1, contamination: 0.25 }] };
    const sim = new RustWaterSim(model);
    sim.run(200);
    expect(sim.ticks).toBe(200);
    expect(sim.out.length).toBe(4 * W * H);
    expect(sim.volume()).toBeGreaterThan(0);
    expect(sim.D[3 * W + 4]).toBeGreaterThan(0);
    expect(sim.C[3 * W + 4]).toBeCloseTo(0.25, 3);
    expect(sim.Dold.length).toBe(W * H);
    expect(Math.max(...sim.saturation())).toBeGreaterThan(0);
    // a caller's change to the water between runs is what the next run starts from
    sim.D.fill(0);
    sim.C.fill(0);
    sim.out.fill(0);
    sim.run(1, 0);
    expect(sim.volume()).toBe(0);
  });
});
