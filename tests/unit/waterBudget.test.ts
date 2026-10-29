// The water's threads the page shares between its workers (src/core/sim/parallel.ts `shareWaterBudget`,
// parallelPolicy.ts `newWaterBudget`): the editor's and the checks' together never run more than the budget; a job
// takes what is free, two at the least, the live water at most half, and gives them back; short of them, a simulation
// runs on one thread with the same bytes.

import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { WaterSim, type WaterModel, type WaterState } from "../../src/core/sim/water";
import { installParallelWater, parallelWaterStats, parallelWaterThreads, shareWaterBudget, sharedPool, uninstallParallelWater, withoutParallelWater } from "../../src/core/sim/parallel";
import { newWaterBudget } from "../../src/core/sim/parallelPolicy";

async function pool(threads: number): Promise<void> {
  const url = new URL("./threads/strip-helper.mjs", import.meta.url);
  expect(installParallelWater({ threads, spawn: () => { const w = new Worker(url); return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() }; } })).toBe(true);
  while (parallelWaterThreads() < threads) await new Promise((r) => setTimeout(r, 10));
}

afterEach(() => uninstallParallelWater());

describe("the water's threads shared between the page's workers", () => {
  it("a job takes what is free, two at the least, the live water at most half, and gives them back", async () => {
    await pool(4);
    shareWaterBudget(newWaterBudget(5));
    const p = sharedPool()!;
    expect(p.take(3)).toBe(3);
    expect(p.free()).toBe(2);
    expect(p.take(4)).toBe(2);
    // (one is not worth it: none)
    expect(p.free()).toBe(0);
    p.give(2);
    expect(p.take(2)).toBe(2);
    expect(p.take(2)).toBe(0);
    p.give(2);
    p.give(3);
    // (the live water, half of five)
    expect(p.take(5, true)).toBe(3);
    expect(p.free()).toBe(2);
  });

  it("short of threads a simulation runs on one, the same water, and on several once they are back", async () => {
    await pool(3);
    const sab = newWaterBudget(3);
    shareWaterBudget(sab);
    const W = 3, H = 9, N = W * H;
    const model: WaterModel = { W, H, floor: Float64Array.from({ length: N }, (_, i) => (i % 11) / 8), dam: null, emitters: [{ cells: [2 * W + 1, 6 * W + 1], strength: 1.5, contamination: 0.4 }] };
    const initial: WaterState = { depth: Float64Array.from({ length: N }, (_, i) => (i % 7 === 0 ? 0 : 0.3 + (i % 5) / 4)), contamination: Float64Array.from({ length: N }, (_, i) => (i % 5) / 5) };
    const a = new WaterSim(model, initial);
    const b = new WaterSim(structuredClone(model), initial);
    const p = sharedPool()!;
    // (the other worker holds them all)
    expect(p.take(3)).toBe(3);
    const before = parallelWaterStats.ticks;
    a.run(40);
    withoutParallelWater(() => b.run(40));
    expect(parallelWaterStats.ticks, "no threads were free").toBe(before);
    p.give(3);
    a.run(40);
    withoutParallelWater(() => b.run(40));
    expect(parallelWaterStats.ticks, "the threads ran once free").toBeGreaterThan(before);
    expect(Atomics.load(new Int32Array(sab), 0), "and were given back").toBe(3);
    for (const k of ["D", "C", "out"] as const) expect(Buffer.from(a[k].buffer).equals(Buffer.from(b[k].buffer)), k).toBe(true);
  });
});
