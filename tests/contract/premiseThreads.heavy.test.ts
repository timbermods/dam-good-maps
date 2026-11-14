// The premise mode's map on the water's threads is the one-thread map, byte for byte (D455): 256² seeds 2 and 3 in
// theme Any, whose start's drought gate runs days of the drought (`hold.ts` `startWaterGateSteps`). One side runs it
// all on one thread (`generatePremise`); the other on four threads (the settle and the drought, `withSmallMapThreads`),
// the drought run apart from the map by a runner as the page's generator runs it beside the map
// (`generatePremiseAsync`, worker/drought.worker.ts), every day of it run ahead of the gate's asking.

import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { afterAll, describe, expect, it } from "vitest";
import { generatePremise, generatePremiseAsync, type DroughtRunner } from "../../src/core/premise/generate";
import type { GateDay } from "../../src/core/premise/hold";
import { installParallelWater, parallelWaterStats, parallelWaterThreads, uninstallParallelWater, withoutParallelWater, withSmallMapThreads } from "../../src/core/sim/parallel";
import { TICKS_PER_DAY } from "../../src/core/sim/water";
import { HazardRun } from "../../src/core/sim/weather";
import { makeSpec } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** The drought run apart: every day run at once, on the threads, before the gate asks for any. */
const ahead: DroughtRunner = {
  start(model, depth, contamination, days) {
    const run = new HazardRun(model, { depth, contamination, stack: null } as never, "drought", days);
    const out: GateDay[] = [];
    for (let d = 0; d < days; d++) {
      withSmallMapThreads(() => run.step(TICKS_PER_DAY));
      out.push(run.water());
    }
    run.dispose();
    return { day: (k) => Promise.resolve(out[k - 1]), stop: () => {} };
  },
};

afterAll(() => uninstallParallelWater());

describe("the premise mode on the water's threads", () => {
  it("makes the one-thread map, its drought run beside it", async () => {
    const one: string[] = [];
    for (const seed of [2, 3]) {
      const r = withoutParallelWater(() => generatePremise(makeSpec({ seed, size: { x: 256, y: 256 }, theme: "any", premise: "lakeStair" })));
      if ("reason" in r) throw new Error(r.reason);
      one.push(sha(r.result.bytes));
    }
    const url = new URL("../unit/threads/strip-helper.mjs", import.meta.url);
    expect(installParallelWater({ threads: 4, spawn: () => { const w = new Worker(url); return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() }; } })).toBe(true);
    while (parallelWaterThreads() < 4) await new Promise((r) => setTimeout(r, 10));
    const ticks = parallelWaterStats.ticks;
    const many: string[] = [];
    for (const seed of [2, 3]) {
      const r = await generatePremiseAsync(makeSpec({ seed, size: { x: 256, y: 256 }, theme: "any", premise: "lakeStair" }), {}, ahead);
      if ("reason" in r) throw new Error(r.reason);
      many.push(sha(r.result.bytes));
    }
    // (the threads really ran: the settle's and the drought's ticks)
    expect(parallelWaterStats.ticks).toBeGreaterThan(ticks);
    expect(many).toEqual(one);
  });
});
