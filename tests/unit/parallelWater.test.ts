// The multi-core water's edges (src/core/sim/parallel.ts, water.ts): an edited simulation, a helper whose
// messages throw, a helper lost at the final commit. Each must give the one-thread water's bytes exactly (D130).
// From the merge review (investigation/merge-review, F1–F3); its 128-case shape matrix stays there.

import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { WaterSim, type WaterModel, type WaterState } from "../../src/core/sim/water";
import { installParallelWater, parallelWaterStats, parallelWaterThreads, uninstallParallelWater, withoutParallelWater } from "../../src/core/sim/parallel";

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** Every array the simulation holds, the old depth and the saturation included, byte for byte. */
function expectSame(a: WaterSim, b: WaterSim, what: string): void {
  for (const k of ["D", "C", "out", "Dold"] as const) expect(bytes(a[k]).equals(bytes(b[k])), `${what}: ${k}`).toBe(true);
  expect(bytes(a.saturation()).equals(bytes(b.saturation())), `${what}: saturation`).toBe(true);
}

async function pool(threads: number, helper = "./threads/strip-helper.mjs"): Promise<void> {
  const url = new URL(helper, import.meta.url);
  expect(installParallelWater({ threads, spawn: () => { const w = new Worker(url); return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() }; } })).toBe(true);
  while (parallelWaterThreads() < threads) await new Promise((r) => setTimeout(r, 10));
}

/** A 3 × 9 map with a dam, two-tile source and water nearly everywhere (two strips of four rows and more). */
function fixture(): { model: WaterModel; initial: WaterState } {
  const W = 3, H = 9, N = W * H;
  return {
    model: { W, H, floor: Float64Array.from({ length: N }, (_, i) => (i % 11) / 8), dam: Float64Array.from({ length: N }, (_, i) => (i % 19 === 0 ? 0.65 : -1)), emitters: [{ cells: [2 * W + 1, 6 * W + 1], strength: 1.5, contamination: 0.4 }] },
    initial: { depth: Float64Array.from({ length: N }, (_, i) => (i % 7 === 0 ? 0 : 0.3 + (i % 5) / 4)), contamination: Float64Array.from({ length: N }, (_, i) => (i % 5) / 5) },
  };
}

/** The same map run twice: on the threads (`a`) and on one thread (`b`). */
function pair(model: WaterModel, initial: WaterState): [WaterSim, WaterSim] {
  return [new WaterSim(model, initial), new WaterSim(structuredClone(model), initial)];
}
const both = (a: WaterSim, b: WaterSim, ticks: number, scale = 1) => (a.run(ticks, scale), withoutParallelWater(() => b.run(ticks, scale)));

afterEach(() => uninstallParallelWater());

describe("the multi-core water", () => {
  it("takes a direct edit of the water between slices exactly as one thread does (F1)", async () => {
    await pool(2);
    const { model, initial } = fixture();
    const [a, b] = pair(model, initial);
    try {
      both(a, b, 1);
      expectSame(a, b, "before the edit");
      a.D[13] = b.D[13] = 3;
      a.C[13] = b.C[13] = 0.9;
      a.out[52] = b.out[52] = 0.4;
      both(a, b, 1);
      expectSame(a, b, "after the edit");
      both(a, b, 3);
      expectSame(a, b, "after more ticks");
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("keeps the one-thread bytes when an edit wets or dries a tile, before or after a run (F1)", async () => {
    await pool(2);
    const W = 3, H = 9, N = W * H;
    const floor = new Float64Array(N).fill(9);
    floor[13] = 0;
    for (const dries of [true, false])
      for (const readDold of [false, true])
        for (const beforeFirstRun of [false, true]) {
          const name = `${dries ? "wet to dry" : "dry to wet"}${readDold ? ", Dold read" : ""}${beforeFirstRun ? ", before the first run" : ""}`;
          const initial = { depth: new Float64Array(N), contamination: new Float64Array(N) };
          initial.depth[13] = 0.5;
          const [a, b] = pair({ W, H, floor: floor.slice(), dam: null, emitters: [{ cells: [13], strength: 2, contamination: 0.5 }] }, initial);
          try {
            if (!beforeFirstRun) both(a, b, 1);
            if (readDold) void (a.Dold, b.Dold);
            const i = dries ? 13 : 12;
            a.D[i] = b.D[i] = dries ? 0 : 3;
            a.C[i] = b.C[i] = 0.9;
            both(a, b, 1);
            expectSame(a, b, name);
            both(a, b, 3);
            expectSame(a, b, `${name}, continued`);
          } finally {
            a.dispose();
            b.dispose();
          }
        }
  });

  it("stays on several threads when the outflows are set through setOut, with the same bytes", async () => {
    await pool(2);
    const { model, initial } = fixture();
    const [a, b] = pair(model, initial);
    const momentum = Float64Array.from({ length: 4 * 27 }, (_, k) => (k % 9) / 20);
    try {
      a.setOut(momentum);
      b.setOut(momentum);
      const runs = parallelWaterStats.runs;
      both(a, b, 2);
      expectSame(a, b, "momentum before the first run");
      expect(parallelWaterStats.runs, "the threads ran").toBeGreaterThan(runs);
      a.setOut(momentum);
      b.setOut(momentum);
      const again = parallelWaterStats.runs;
      both(a, b, 3);
      expectSame(a, b, "momentum between slices");
      expect(parallelWaterStats.runs, "the threads still run").toBeGreaterThan(again);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("falls back to one thread with the same bytes when a helper's messages throw (F2)", () => {
    let stopped = 0;
    const throwing = {
      postMessage(m: { kind: string; ctl?: SharedArrayBuffer; index?: number }) {
        if (m.kind !== "hello") throw new Error("port closed");
        Atomics.store(new Int32Array(m.ctl!), m.index!, 1);
      },
      terminate() {
        stopped++;
      },
    };
    expect(installParallelWater({ threads: 2, helpers: [throwing], spawn: () => { throw new Error("blocked"); } })).toBe(true);
    const { model, initial } = fixture();
    const [a, b] = pair(model, initial);
    try {
      both(a, b, 1);
      expectSame(a, b, "after the failed dispatch");
      expect(stopped, "the failed helper was stopped").toBeGreaterThan(0);
      expect(parallelWaterThreads()).toBe(1);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it("retries from the run's start when a helper fails at the final commit (F3)", async () => {
    await pool(2, "./threads/commit-failure-helper.mjs");
    const W = 3, H = 9, N = W * H;
    const floor = new Float64Array(N).fill(9);
    floor[13] = 0;
    const model: WaterModel = { W, H, floor, dam: null, emitters: [{ cells: [13], strength: 5, contamination: 0.6, depthLimit: { anchor: 13, off: 0.9, on: 0.5 } }] };
    const [a, b] = pair(model, { depth: Float64Array.from({ length: N }, (_, i) => (i === 13 ? 0.4 : 0)), contamination: new Float64Array(N) });
    try {
      both(a, b, 1, 0.08);
      // (depth only: reading Dold or the saturation here would hand the single thread the good run's carry)
      expect(bytes(a.D).equals(bytes(b.D)), "the good run").toBe(true);
      both(a, b, 2);
      expectSame(a, b, "after the failed commit");
      expect(parallelWaterThreads()).toBe(1);
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});
