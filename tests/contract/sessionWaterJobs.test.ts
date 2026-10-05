// The editor's session releases the multi-core water's jobs it no longer needs (src/worker/session.ts): a
// cancelled Drought or Badtide view, and a draft stroke's water when another map opens or the map closes. Without
// it the helpers keep the old simulations' strips (Wasm memory never shrinks) until the garbage collector runs,
// or until a later draft. From the merge review (investigation/merge-review, F5, F6).

import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { WaterSim } from "../../src/core/sim/water";
import { installParallelWater, parallelWaterThreads, uninstallParallelWater } from "../../src/core/sim/parallel";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

let helper: Worker;
const jobs = () => new Promise<number>((r) => (helper.once("message", (m: { jobs: number }) => r(m.jobs)), helper.postMessage({ kind: "inspect" })));

beforeEach(async () => {
  await runGenerate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 64, y: 64 } }));
  ed.refine();
  const url = new URL("../unit/threads/strip-helper.mjs", import.meta.url);
  installParallelWater({ threads: 2, spawn: () => ((helper = new Worker(url)), { postMessage: (m) => helper.postMessage(m), terminate: () => void helper.terminate() }) });
  while (parallelWaterThreads() < 2) await new Promise((r) => setTimeout(r, 10));
  // every slice ends after one step, so the water runs a slice at a time under the fake timers
  vi.useFakeTimers();
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => ++clock);
});

afterEach(() => {
  ed.stopWeather();
  ed.cancelDraft();
  ed.closeSession();
  vi.useRealTimers();
  vi.restoreAllMocks();
  uninstallParallelWater();
});

it("Drought and Badtide each keep one simulation while the map is open, and both are freed with it (F5)", async () => {
  const dispose = vi.spyOn(WaterSim.prototype, "dispose");
  for (let k = 0; k < 8; k++) {
    ed.showWeatherDay(k % 2 ? "drought" : "badtide", 1);
    await vi.runAllTimersAsync();
    ed.stopWeather();
  }
  // (each hazard's days are kept until the map changes: switching back is instant, Kyler, 2026-10-04)
  expect(dispose.mock.calls.length).toBe(0);
  ed.closeSession();
  await vi.runAllTimersAsync();
  expect(dispose.mock.calls.length).toBe(2);
  expect(await jobs()).toBe(0);
});

it("opening another map or closing this one frees a draft stroke's water job (F6)", async () => {
  const saved = ed.project().bytes;
  for (const action of ["open", "close"] as const) {
    ed.draftStroke({ x0: 30, y0: 30, x1: 30, y1: 30 }, new Uint8Array([4]));
    await vi.advanceTimersToNextTimerAsync();
    expect(await jobs(), `${action}: the draft's water runs on the helper`).toBe(1);
    if (action === "open") ed.openProject(saved);
    else ed.closeSession();
    await vi.runAllTimersAsync();
    expect(await jobs(), `${action}: the draft's job is released`).toBe(0);
  }
});
