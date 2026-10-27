// Each tile's first dry day in a drought and first bad day in a badtide (D133: hovering water in the Drought view says
// "Dry on day 6" or "Lasts the drought", in the Badtide view when it turns bad): the worker sends them with every day of
// the hazard, read from the days its run keeps (no settle of its own). For each tile they name the first day the view's
// own water leaves it, or turns bad: the day's water as the page is sent it, "dry" as the view and the drought line read
// it (no depth over `WATER_BODY`), "bad" as the hover reads badwater (`badWater`). Each hazard carries only its own.

import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { WATER_BODY } from "../../src/core/analysis/walk";
import { badWater } from "../../src/core/sim/firstDays";
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

/** The first bad day of each tile from the days' water, Day 0 to the last one given (0: never, or bad on Day 0). */
function expectedBad(days: WaterView[]): Int16Array {
  const out = new Int16Array(W * W);
  const bad = (w: WaterView) => {
    const b = new Uint8Array(W * W);
    for (let k = 0; k < w.count; k++) if (badWater(w.depth[k], w.contamination[k])) b[w.tile[k]] = 1;
    return b;
  };
  const clean = bad(days[0]).map((v) => 1 - v);
  for (let d = 1; d < days.length; d++) {
    const b = bad(days[d]);
    for (let i = 0; i < out.length; i++)
      if (clean[i] && b[i]) {
        clean[i] = 0;
        out[i] = d;
      }
  }
  return out;
}

// (a lake basin: water going on several days and water that lasts the drought; in a badtide its water turns bad on
// days 1 to 3, the lake last)
beforeAll(async () => {
  await runGenerate(makeSpec({ seed: 4, theme: "lakeBasin", size: { x: W, y: W } }));
  ed.setAutoWater(false);
  ed.refine();
});

afterEach(() => {
  ed.listen(null);
  ed.stopWeather();
});

afterAll(() => ed.closeSession());

it("a drought's days say when each tile's water goes, read from the days the view shows", async () => {
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
  expect(last.firstBad).toBeUndefined();
  expect(last.firstBadThrough).toBeUndefined();
}, 300_000);

it("a badtide's days say when each tile's water turns bad, read from the days the view shows", async () => {
  const last = await hold("badtide", null);
  const days = last.days;
  expect(last.firstBad, "the last day carries the first bad days").toBeInstanceOf(Int16Array);
  expect(last.firstBad!.length).toBe(W * W);
  expect(last.firstBadThrough).toBe(days);
  expect(last.firstDry).toBeUndefined();
  const shown: WaterView[] = [];
  for (let d = 0; d <= days; d++) {
    const e = await hold("badtide", d);
    expect(e.firstBadThrough, `day ${d}`).toBe(days);
    expect(Array.from(e.firstBad!), `day ${d}'s first bad days`).toEqual(Array.from(last.firstBad!));
    shown.push(e.water!);
  }
  expect(Array.from(last.firstBad!)).toEqual(Array.from(expectedBad(shown)));
  // (the badwater spreads: tiles turn bad on more than one day, the map's own badwater on Day 0 is never "turned")
  const turned = new Set<number>();
  for (let i = 0; i < W * W; i++) if (last.firstBad![i]) turned.add(last.firstBad![i]);
  expect(turned.size, "days on which water turns bad").toBeGreaterThan(1);
  const day0 = shown[0];
  for (let k = 0; k < day0.count; k++) if (badWater(day0.depth[k], day0.contamination[k])) expect(last.firstBad![day0.tile[k]]).toBe(0);
  // a day past the default length extends it, no earlier day moving
  const more = await hold("badtide", days + 1);
  expect(more.firstBadThrough).toBe(days + 1);
  expect(Array.from(more.firstBad!)).toEqual(Array.from(expectedBad([...shown, more.water!])));
}, 300_000);
