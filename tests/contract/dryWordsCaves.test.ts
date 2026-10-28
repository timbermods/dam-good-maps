// The Drought view's hover on a map with caves (D133): the run reads "wet on Day 0" itself, as the water on each tile's
// surface (a dry roof over a cave pool holds none), and sends it with the days (`firstDryWet0`), so the words never
// claim "Lasts the drought" over a roof, whatever pool lies under it. The words are checked against every day's water.

import { afterAll, afterEach, expect, it } from "vitest";
import { WATER_BODY } from "../../src/core/analysis/walk";
import { dryWords } from "../../src/core/sim/firstDays";
import { surfaceWater, type WaterView } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";
import { build, t3CaveWater } from "../../tools/terrain3d-maps";

async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

type DayEvent = Extract<ed.EditorEvent, { kind: "weather" }>;

async function hold(day: number | null): Promise<DayEvent> {
  let got: DayEvent | null = null;
  ed.listen((e) => {
    if (e.kind === "weather" && e.phase === "day" && e.hazard === "drought" && (day === null ? e.day === e.days : e.day === day) && e.water) got = e;
  });
  try {
    ed.showWeatherDay("drought", day);
    await until(() => got !== null, 120_000);
  } finally {
    ed.listen(null);
  }
  return got!;
}

afterEach(() => {
  ed.listen(null);
  ed.stopWeather();
});

afterAll(() => ed.closeSession());

it("a roof over a cave pool never reads 'Lasts the drought', and every 'Lasts' tile's water holds every day", async () => {
  ed.openTimber(build(t3CaveWater()).bytes, "T3 caves.timber");
  ed.setAutoWater(false);
  ed.settleWater();
  const last = await hold(null);
  const N = last.firstDry!.length;
  const W = Math.round(Math.sqrt(N));
  expect(W * W).toBe(N);
  expect(last.firstDryWet0).toBeDefined();
  expect(last.firstDryThrough!).toBeGreaterThanOrEqual(last.days);
  // every day's water, Day 0 to the last, as the page is sent it: the top-most wet column of each tile (the page's own read)
  const topWet = (w: WaterView) => surfaceWater(W, W, w).depth;
  const days: Float32Array[] = [];
  for (let d = 0; d <= last.days; d++) days.push(topWet((await hold(d)).water!));
  let roofs = 0;
  let lasts = 0;
  for (let i = 0; i < N; i++) {
    const words = dryWords(last.firstDry!, last.firstDryThrough!, last.days, i, last.firstDryWet0!);
    if (words === "Lasts the drought") {
      lasts++;
      // (water on its surface on Day 0, never gone: a wet column on every day)
      for (let d = 0; d <= last.days; d++) expect(days[d][i], `tile ${i} day ${d}`).toBeGreaterThan(WATER_BODY);
    }
    // a pool under a roof on Day 0 (a wet column, none on the surface) says nothing
    if (!last.firstDryWet0![i] && days[0][i] > WATER_BODY) {
      roofs++;
      expect(words, `tile ${i}`).toBeNull();
    }
  }
  expect(roofs, "the map has cave pools under roofs").toBeGreaterThan(0);
  expect(lasts, "and water that lasts").toBeGreaterThan(0);
}, 300_000);
