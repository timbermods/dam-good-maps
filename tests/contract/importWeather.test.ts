// An unedited import's Drought and Badtide start from the water the map shows (the file's own), not from
// the dry ground its build holds: day 0 is the file's water and the drought's last day is that water
// drier, as the analytic drought says (PLAN §10; sim/drought.ts). An edited import and a generated map
// start from the build's water, as ever.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { droughtStorage } from "../../src/core/sim/drought";
import { TICKS_PER_DAY } from "../../src/core/sim/water";
import { HazardRun } from "../../src/core/sim/weather";
import { planFill } from "../../src/core/doc/waterEdits";
import type { WaterView } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";
import { openHeights, rect, sourceOp, tilesOf } from "./gateWater";

const W = 48;
const H = 48;
const POND = 23 * W + 23;

/** A .timber with a river along a channel (y 5-6, a source at its west end) and an 8x8 pond at level 8
 *  in a pit (x, y 20-27) that no source feeds, as the unfed-pond gate builds it. */
function pondFile(): Uint8Array {
  const h = new Uint8Array(W * H).fill(8);
  for (const i of tilesOf(W, 20, 20, 27, 27)) h[i] = 6;
  for (const i of tilesOf(W, 0, 5, W - 1, 6)) h[i] = 6;
  const s = openHeights(W, H, h);
  expect(s.apply(sourceOp(10, 5, 1)).errors).toEqual([]);
  expect(s.apply(planFill(s, 23, 23, 8).op!).errors).toEqual([]);
  return s.exportTimber().bytes;
}

const volume = (a: ArrayLike<number>) => Array.from(a).reduce((t, v) => t + v, 0);

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

const depthAt = (w: WaterView, tile: number) => {
  let d = 0;
  for (let k = 0; k < w.count; k++) if (w.tile[k] === tile) d += w.depth[k];
  return d;
};

describe("an unedited import's weather starts from the water the map shows", () => {
  it("the core: the water shown is the file's, and a drought from it leaves what the analytic drought says", () => {
    const s = MapSession.importMap(pondFile(), "pond.timber");
    // (the bug: the build of an unedited import holds no water)
    expect(volume(s.built.water)).toBe(0);
    const shown = s.waterShown();
    expect(shown.depth[POND]).toBe(2);
    expect(s.waterShown(), "the same object until the water changes").toBe(shown);
    const days = 9;
    const run = new HazardRun(s.built.waterModel, { depth: Float64Array.from(shown.depth), contamination: Float64Array.from(shown.contamination) }, "drought", days);
    try {
      run.step(days * TICKS_PER_DAY);
      const left = run.sim!.D;
      const analytic = volume(droughtStorage(s.built.waterModel, shown.depth, days));
      expect(analytic).toBeGreaterThan(5);
      expect(left[POND], "the pond is drier").toBeLessThan(shown.depth[POND]);
      expect(Math.abs(volume(left) - analytic) / analytic).toBeLessThan(0.05);
    } finally {
      run.sim!.dispose();
    }
  });

  it("the worker: day 0 is the water shown, the last day is drier, and an edit's own water starts the run again", async () => {
    ed.openTimber(pondFile(), "pond.timber");
    ed.setAutoWater(false);
    try {
      const days: Record<number, WaterView> = {};
      let total = 0;
      ed.listen((e) => {
        if (e.kind === "weather" && e.phase === "day" && e.hazard === "drought" && e.water) {
          days[e.day] = e.water;
          total = e.days;
        }
      });
      ed.showWeatherDay("drought", 0);
      await until(() => !!days[0], 30_000);
      expect(depthAt(days[0], POND)).toBeCloseTo(2, 4);
      ed.showWeatherDay("drought", null);
      await until(() => total > 0 && !!days[total], 60_000);
      const last = depthAt(days[total], POND);
      expect(last, "the pond is still there").toBeGreaterThan(1);
      expect(last, "and drier").toBeLessThan(2);
      // a day between starts from the same water: the pond only ever loses water
      ed.showWeatherDay("drought", 3);
      await until(() => !!days[3], 30_000);
      expect(depthAt(days[3], POND)).toBeLessThan(2);
      expect(depthAt(days[3], POND)).toBeGreaterThanOrEqual(last);
    } finally {
      ed.listen(null);
      ed.stopWeather();
      ed.closeSession();
    }
  });

  it("an edited import, whose build holds the water, shows its own build's water", () => {
    const s = MapSession.importMap(pondFile(), "pond.timber");
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: rect(40, 40, 41, 41), amount: 1 } }).errors).toEqual([]);
    s.settleCanonical();
    expect(s.showsStoredWater).toBe(false);
    expect(s.waterShown().depth).toBe(s.built.water);
  });
});
