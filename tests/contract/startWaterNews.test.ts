// The day the start's water goes or turns bad (D133's line under the day box) reaches the page when the background's days
// find it, while the page holds an earlier day: not only with the next day stepped to (#627's review). Each hazard's
// event carries its own day, the one its held days carry afterwards.

import { afterAll, beforeAll, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import type { Hazard } from "../../src/core/sim/weather";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

type StartEvent = Extract<ed.EditorEvent, { kind: "startWater" }>;
type DayEvent = Extract<ed.EditorEvent, { kind: "weather" }>;

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

/** The page holds `day` (null: the default last day) of `hazard`: the `weather` event it gets. */
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

// (the lake basin of weatherFirstDays.test.ts)
beforeAll(async () => {
  await runGenerate(makeSpec({ seed: 4, theme: "lakeBasin", size: { x: 64, y: 64 } }));
  ed.setAutoWater(false);
  ed.refine();
});

afterAll(() => {
  ed.listen(null);
  ed.stopWeather();
  ed.closeSession();
});

it("the start's water day reaches the page held on Day 0 as the background finds it", async () => {
  const day0 = await hold("drought", 0);
  expect(day0.startWaterDay, "nothing found on Day 0").toBe(0);
  const news: StartEvent[] = [];
  ed.listen((e) => void (e.kind === "startWater" && news.push(e)));
  await ed.prepareWeather();
  ed.listen(null);
  // the days the page gets afterwards say the same day
  const last: Partial<Record<Hazard, DayEvent>> = { drought: await hold("drought", null), badtide: await hold("badtide", null) };
  const found = (["drought", "badtide"] as const).filter((h) => last[h]!.startWaterDay! > 0);
  expect(found, "the map's start loses its water or has it turn bad").not.toEqual([]);
  for (const h of ["drought", "badtide"] as const) {
    const sent = news.filter((e) => e.hazard === h);
    if (!(last[h]!.startWaterDay! > 0)) expect(sent, `${h}: nothing to say`).toEqual([]);
    else expect(sent.map((e) => [e.day, e.version]), h).toEqual([[last[h]!.startWaterDay, day0.version]]);
  }
}, 300_000);
