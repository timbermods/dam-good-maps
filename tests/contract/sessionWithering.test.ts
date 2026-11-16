// The plants a held Drought day has surely killed, as the session worker sends them (src/worker/session.ts, D250): each earlier
// day's soil is worked out off the worker, a day at a time, and the dead plants' cells (level × W × H + tile) follow the day in a
// `withered` event; a press or a key stops the work and the next idle moment takes it up. On a map with caves or overhangs each
// plant withers by its own ground, a cave floor's run top, not its roof's (until #404's follow-up, 2026-11-16, such a map withered
// nothing: its test is the cave map's below, D148).
//
// The map is a fixture (tests/fixtures/projects/riverValley-64-2; `fixtureInEditor`): the subject is the session worker's withering, not
// the generator, so a land change moves nothing here (D148). The cave map is built here, as the probe's test maps are
// (tools/terrain3d-maps.ts).

import { afterEach, beforeEach, expect, it } from "vitest";
import { WITHERING_SPECIES } from "../../src/core/sim/withering";
import { computeDaySoil, type SoilJob } from "../../src/worker/daySoil";
import * as ed from "../../src/worker/session";
import { build, Scene, type Terrain3dMap } from "../../tools/terrain3d-maps";
import { fixtureInEditor } from "../fixtureEditor";

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
/** The cells (level × W × H + tile) of the plants that can wither, on the open map. */
const plantCells = () => {
  const v = ed.sessionView().view;
  const N = v.W * v.H;
  const out = new Set<number>();
  for (let k = 0; k < v.entities.count; k++) if (WITHERING_SPECIES.has(v.entities.templates[v.entities.template[k]])) out.add(v.entities.z[k] * N + v.entities.y[k] * v.W + v.entities.x[k]);
  return out;
};

/** A 32² map with a hill 14 high and a cave inside it (floor 6, air 6 to 8, a roof 9 to 13), a stream in a groove at 5 from a
 *  source in the cave out to the map's east edge, and two plants on one tile, (14, 13): a birch on the cave's floor beside the
 *  stream and a pine on the roof's top, far above any water. */
function caveMap(): Uint8Array {
  const s = new Scene(32, 32, 6);
  s.start(28, 28, 6);
  s.box(8, 8, 20, 20, 6, 14).box(10, 12, 18, 15, 6, 9, false);
  s.box(10, 14, 31, 14, 5, 6, false).box(19, 14, 20, 14, 5, 9, false);
  s.source("stream", 11, 14, 5, 1);
  s.plant("cave birch", "Birch", 14, 13, 6).plant("top pine", "Pine", 14, 13, 14);
  const m: Terrain3dMap = { id: "cave-withering", title: "", tests: "", scene: s, days: 1, snapshots: [], checks: [], focus: [], samples: [], water: "settled" };
  return build(m).bytes;
}

beforeEach(async () => {
  events = [];
  // (seed 2 on 0.10.6's maps, D148: seed 1's River Valley has caves, whose withering is the cave map's test below)
  fixtureInEditor("riverValley", 64, 2);
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
  const plants = plantCells();
  for (const c of dead) expect(plants.has(c), `cell ${c} holds a plant`).toBe(true);
  // (stepping back to a day whose soil is cached sends its list with the day itself, and day 0 an empty one)
  ed.showWeatherDay("drought", 9);
  await until(() => events.filter((e) => e.kind === "weather" && e.phase === "day" && e.day === 9).length > 1 || undefined, "day 9 again");
  expect(events.filter((e) => e.kind === "weather" && e.phase === "day" && e.day === 9).at(-1)).toMatchObject({ withered: expect.any(Int32Array) });
  ed.showWeatherDay("drought", 0);
  await until(() => dayEvent(0), "day 0");
  expect(dayEvent(0)!.withered?.length).toBe(0);
});

it("on a map with caves a plant withers by its own ground: the birch on the cave's floor dies of the badtide's poison, the pine on the roof above it, on the same tile, lives", async () => {
  ed.closeSession();
  ed.openTimber(caveMap(), "cave.timber");
  ed.setAutoWater(false);
  const N = 32 * 32;
  const tile = 13 * 32 + 14;
  const birch = 6 * N + tile;
  const pine = 14 * N + tile;
  expect(plantCells()).toEqual(new Set([birch, pine]));
  // day 2: the cave's floor has been poisoned two days running, its roof's top never (the top's soil is the tile's own)
  ed.showWeatherDay("badtide", 2);
  const day = await until(() => dayEvent(2), "day 2");
  const runs = day.soil!.runs!;
  const r = [...runs.tile].findIndex((t, k) => t === tile && runs.level[k] === 6);
  expect(runs.contamination[r], "the cave's floor is poisoned").toBeGreaterThan(0);
  expect(day.soil!.contamination[tile], "the roof's top is clean").toBe(0);
  // (day 1's soil is not cached yet: the list follows the day, worked out on this worker a day at a time)
  expect(day.withered).toBeUndefined();
  expect(Array.from((await until(() => witheredEvent(2), "day 2's withered plants")).tiles)).toEqual([birch]);
  // day 1, cached now, comes with its list: one day of poison kills nothing yet
  ed.showWeatherDay("badtide", 1);
  expect(Array.from((await until(() => dayEvent(1), "day 1")).withered!)).toEqual([]);
});

it("on a map with caves, where the days' soil is worked out on this worker, a press or a key stops that work, and the next idle moment takes it up again", async () => {
  ed.closeSession();
  ed.openTimber(caveMap(), "cave.timber");
  ed.setAutoWater(false);
  // (the press comes while the days are simulated: the day is still shown, its withered plants wait)
  ed.showWeatherDay("badtide", 6);
  ed.stopWeatherPrep();
  await until(() => dayEvent(6), "day 6");
  await new Promise((r) => setTimeout(r, 400));
  expect(witheredEvent(6), "held back while Kyler is busy").toBeUndefined();
  void ed.prepareWeather();
  expect(Array.from((await until(() => witheredEvent(6), "the withered plants once idle")).tiles)).toEqual([6 * 32 * 32 + 13 * 32 + 14]);
  ed.stopWeatherPrep();
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
