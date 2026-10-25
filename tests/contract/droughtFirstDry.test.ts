// The drought's first dry day per tile (D133: hovering water in the Drought view says "Dry on day 6" or "Lasts the
// drought"): the worker sends it with every drought day, read from the days its run keeps (no settle of its own), and it
// names, for each tile, the first day the Drought view's own water leaves it: the day's water as the page is sent it,
// "dry" as the view and the drought line read it (no depth over `WATER_BODY`). A badtide's days carry none.

import { afterEach, expect, it } from "vitest";
import { WATER_BODY } from "../../src/core/analysis/walk";
import { makeSpec } from "../../src/core/spec/mapspec";
import type { Hazard } from "../../src/core/sim/weather";
import type { WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

type DayEvent = Extract<ed.EditorEvent, { kind: "weather" }>;

/** The page asks to hold `day` (null: the default last day) of `hazard`, and gets the `weather` event as the page does. */
async function hold(hazard: Hazard, day: number | null): Promise<DayEvent> {
  let got: DayEvent | null = null;
  ed.listen((e) => {
    if (e.kind === "weather" && e.phase === "day" && e.hazard === hazard && (day === null ? e.day === e.days : e.day === day) && e.water) got = e;
  });
  try {
    ed.showWeatherDay(hazard, day);
    await until(() => got !== null, 120_000);
  } finally {
    ed.listen(null);
  }
  return got!;
}

/** The tiles holding water in a day's water as the page is sent it. */
function wetOf(w: WaterView): Uint8Array {
  const wet = new Uint8Array(W * W);
  for (let k = 0; k < w.count; k++) if (w.depth[k] > WATER_BODY) wet[w.tile[k]] = 1;
  return wet;
}

/** The first dry day of each tile from the days' water, Day 0 to the last one given. */
function expected(days: WaterView[]): Int16Array {
  const out = new Int16Array(W * W);
  const still = wetOf(days[0]);
  for (let d = 1; d < days.length; d++) {
    const wet = wetOf(days[d]);
    for (let i = 0; i < out.length; i++)
      if (still[i] && !wet[i]) {
        still[i] = 0;
        out[i] = d;
      }
  }
  return out;
}

afterEach(() => {
  ed.listen(null);
  ed.stopWeather();
  ed.closeSession();
});

it("a drought's days say when each tile's water goes, read from the days the view shows", async () => {
  // (a river that leaves pools as it drains: water going on several days, and water that lasts)
  await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
  ed.setAutoWater(false);
  ed.refine();
  const last = await hold("drought", null);
  const days = last.days;
  expect(last.firstDry, "the last day carries the first dry days").toBeInstanceOf(Int16Array);
  expect(last.firstDry!.length).toBe(W * W);
  expect(last.firstDryThrough).toBe(days);
  // every day the view shows, Day 0 the map's own water: each carries the same first dry days, through the default length
  const shown: WaterView[] = [];
  for (let d = 0; d <= days; d++) {
    const e = await hold("drought", d);
    expect(e.firstDryThrough, `day ${d}`).toBe(days);
    expect(Array.from(e.firstDry!), `day ${d}'s first dry days`).toEqual(Array.from(last.firstDry!));
    shown.push(e.water!);
  }
  const want = expected(shown);
  expect(Array.from(last.firstDry!)).toEqual(Array.from(want));
  // (the map has both: water gone on a day before the last, and water that lasts the drought)
  const day0 = wetOf(shown[0]);
  let going = 0;
  let lasting = 0;
  for (let i = 0; i < W * W; i++) {
    if (!day0[i]) expect(last.firstDry![i], "no water on Day 0: never dry").toBe(0);
    else if (last.firstDry![i] === 0) lasting++;
    else if (last.firstDry![i] < days) going++;
  }
  expect(going, "tiles dry before the last day").toBeGreaterThan(0);
  expect(lasting, "tiles that last the drought").toBeGreaterThan(0);
  // a day past the default length: the days seen grow with it, and no earlier first dry day moves
  const more = await hold("drought", days + 1);
  expect(more.firstDryThrough).toBe(days + 1);
  expect(Array.from(more.firstDry!)).toEqual(Array.from(expected([...shown, more.water!])));
  // a badtide's days carry none (Day 0: no badtide days simulated for it)
  const bad = await hold("badtide", 0);
  expect(bad.firstDry).toBeUndefined();
  expect(bad.firstDryThrough).toBeUndefined();
}, 300_000);
