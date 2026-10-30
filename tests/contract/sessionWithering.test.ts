// The plants a held Drought day has surely killed, as the session worker sends them (src/worker/session.ts, D250): each earlier
// day's soil is worked out off the worker, a day at a time, and the dead tiles follow the day in a `withered` event; a press or a
// key stops the work and the next idle moment takes it up; a map with caves gets its day soil but no withering yet.

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { WITHERING_SPECIES } from "../../src/core/sim/withering";
import { runGenerate } from "../../src/worker/api";
import { computeDaySoil, type SoilJob } from "../../src/worker/daySoil";
import * as ed from "../../src/worker/session";

// a map the stacked water model owns, for the cave test: the one predicate for a map with caves says so
let caves = false;
vi.mock("../../src/core/sim/stackWater", async (original) => {
  const real = await original<typeof import("../../src/core/sim/stackWater")>();
  return { ...real, cavesOf: (m: Parameters<typeof real.cavesOf>[0]) => caves || real.cavesOf(m) };
});

let events: ed.EditorEvent[] = [];
const dayEvent = (day: number) => events.find((e): e is Extract<ed.EditorEvent, { kind: "weather" }> => e.kind === "weather" && e.phase === "day" && e.day === day);
const witheredEvent = (day: number) => events.find((e): e is Extract<ed.EditorEvent, { kind: "withered" }> => e.kind === "withered" && e.day === day);
async function until<T>(get: () => T | undefined, what: string, ms = 90_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
/** The tiles of the plants that can wither, on the open map. */
const plantTiles = () => {
  const v = ed.sessionView().view;
  const W = v.W;
  const out = new Set<number>();
  for (let k = 0; k < v.entities.count; k++) if (WITHERING_SPECIES.has(v.entities.templates[v.entities.template[k]])) out.add(v.entities.y[k] * W + v.entities.x[k]);
  return out;
};

beforeEach(async () => {
  caves = false;
  events = [];
  // (seed 2 on 0.10.6's maps, D148: seed 1's River Valley now has caves, which the withering leaves out, `stackedMap`)
  await runGenerate(makeSpec({ seed: 2, theme: "riverValley", size: { x: 64, y: 64 } }));
  ed.refine();
  ed.setSoilRunner(null);
  ed.listen((e) => events.push(e));
});

afterEach(() => {
  ed.stopWeather();
  ed.listen(null);
  ed.setSoilRunner(null);
  ed.closeSession();
});

it("a held day's dead plants follow it in a withered event, on plants only, none on a normal drought's 9 days and some by day 30", async () => {
  ed.showWeatherDay("drought", 9);
  await until(() => dayEvent(9), "day 9");
  // (the day itself comes without them while the earlier days' soil is worked out; they follow)
  expect(dayEvent(9)!.withered).toBeUndefined();
  expect((await until(() => witheredEvent(9), "day 9's withered plants")).tiles.length).toBe(0);
  ed.showWeatherDay("drought", 30);
  await until(() => dayEvent(30), "day 30");
  const dead = (await until(() => witheredEvent(30), "day 30's withered plants")).tiles;
  expect(dead.length).toBeGreaterThan(0);
  const plants = plantTiles();
  for (const t of dead) expect(plants.has(t), `tile ${t} holds a plant`).toBe(true);
  // (stepping back to a day whose soil is cached sends its list with the day itself, and day 0 an empty one)
  ed.showWeatherDay("drought", 9);
  await until(() => events.filter((e) => e.kind === "weather" && e.phase === "day" && e.day === 9).length > 1 || undefined, "day 9 again");
  expect(events.filter((e) => e.kind === "weather" && e.phase === "day" && e.day === 9).at(-1)).toMatchObject({ withered: expect.any(Int32Array) });
  ed.showWeatherDay("drought", 0);
  await until(() => dayEvent(0), "day 0");
  expect(dayEvent(0)!.withered?.length).toBe(0);
});

it("a map with caves has no withering: its day carries an empty list and no withered event follows", async () => {
  caves = true;
  ed.showWeatherDay("drought", 12);
  const day = await until(() => dayEvent(12), "day 12");
  expect(day.withered).toBeInstanceOf(Int32Array);
  expect(day.withered!.length).toBe(0);
  await new Promise((r) => setTimeout(r, 300));
  expect(events.some((e) => e.kind === "withered")).toBe(false);
});

it("a press or a key stops the work, and the next idle moment takes it up again", async () => {
  // the shown day's soil comes at once; every other job waits for the gate
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  ed.setSoilRunner(async (job: SoilJob) => {
    if (first) first = false;
    else await gate;
    return computeDaySoil(job);
  });
  ed.showWeatherDay("drought", 12);
  await until(() => dayEvent(12), "day 12");
  ed.stopWeatherPrep();
  release();
  await new Promise((r) => setTimeout(r, 400));
  expect(witheredEvent(12), "held back while Kyler is busy").toBeUndefined();
  void ed.prepareWeather();
  await until(() => witheredEvent(12), "the withered plants once idle");
  ed.stopWeatherPrep();
});

it("a press and release while a day's soil is being worked out does not stall the withering", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let first = true;
  ed.setSoilRunner(async (job: SoilJob) => {
    if (first) first = false;
    else await gate;
    return computeDaySoil(job);
  });
  ed.showWeatherDay("drought", 12);
  await until(() => dayEvent(12), "day 12");
  // (the press and the release both come while a job waits; the loop wakes after them)
  ed.stopWeatherPrep();
  void ed.prepareWeather();
  release();
  await until(() => witheredEvent(12), "the withered plants after a short press");
  ed.stopWeatherPrep();
});

it("a soil worker that fails twice gives the day as it is held, without soil of its own or withered plants, and never works the soil out here", async () => {
  let tries = 0;
  ed.setSoilRunner(() => {
    tries++;
    return Promise.reject(new Error("worker gone"));
  });
  ed.showWeatherDay("drought", 6);
  const day = await until(() => dayEvent(6), "day 6");
  expect(day.water).toBeDefined();
  expect(day.soil).toBeDefined();
  expect(day.withered).toBeUndefined();
  await new Promise((r) => setTimeout(r, 300));
  expect(events.some((e) => e.kind === "withered")).toBe(false);
  expect(tries).toBeGreaterThan(0);
});
