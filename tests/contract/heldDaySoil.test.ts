// The held Drought and Badtide day is what the map would give (EDITOR_PLAN §5; PERFECT, "what you see is what you get"):
// a day held right after an edit, once the water has settled, is the day a saved and reopened map holds; and a day's soil
// is the game's soil on that day's water, the very function the map's own soil is built with (`soilOnWater`), Day 0 the
// map's own soil tile for tile, a Thorns line shielding the day's soil as it shields the map's.

import { afterEach, describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { soilOnWater } from "../../src/core/features/build";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import type { Hazard } from "../../src/core/sim/weather";
import type { SoilView, WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { map } from "./gateHelpers";

const W = 64;
const DAY = 3;

interface Day {
  water: WaterView;
  soil: SoilView;
}

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

/** The page asks to hold `day` of `hazard`, and gets it as the page does: the `weather` event's water and soil. */
async function hold(hazard: Hazard, day: number): Promise<Day> {
  let got: Day | null = null;
  ed.listen((e) => {
    if (e.kind === "weather" && e.phase === "day" && e.hazard === hazard && e.day === day && e.water && e.soil) got = { water: e.water, soil: e.soil };
  });
  try {
    ed.showWeatherDay(hazard, day);
    await until(() => got !== null, 120_000);
  } finally {
    ed.listen(null);
    ed.stopWeather();
  }
  return got!;
}

/** Every array of a day, as bytes. */
function bytesOf(d: Day): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of [...Object.entries(d.water), ...Object.entries(d.soil).map(([k, v]) => ["soil." + k, v] as const)]) {
    if (ArrayBuffer.isView(v)) out[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
    else out[k] = String(v);
  }
  return out;
}

function expectSame(a: Day, b: Day, what: string) {
  const x = bytesOf(a);
  const y = bytesOf(b);
  expect(Object.keys(x), what).toEqual(Object.keys(y));
  for (const k of Object.keys(x)) expect(x[k] === y[k], `${what}: ${k}`).toBe(true);
}

/** Lower the ground around a deep water tile (an edit that moves the water, which then settles again). */
function lowerAtWater(): void {
  const view = ed.sessionView().view;
  const v = view.water;
  // (open water, not a cave's pool under its roof, D488: lowering a roof leaves the pool's water as it is)
  const caved = new Set(view.columns.tiles);
  let at = -1;
  for (let k = 0; k < v.count && at < 0; k++) {
    const i = v.tile[k];
    if (caved.has(i)) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (v.depth[k] > 0.3 && x > 8 && y > 8 && x < W - 8 && y < W - 8) at = i;
  }
  expect(at, "a deep water tile").toBeGreaterThanOrEqual(0);
  const x = at % W;
  const y = (at / W) | 0;
  const cells: [number, number, number][] = [];
  for (let yy = y - 1; yy <= y + 1; yy++) cells.push([yy, x - 1, x + 1]);
  expect(ed.apply({ op: "sculpt", params: { mode: "lower", cells, amount: 2 } }).ok).toBe(true);
}

/** The reopened map's canonical water in place (the project opens on its saved water, and the canonical settle follows). */
async function settled(): Promise<void> {
  if (ed.waterSettling()) ed.settleWater();
  else await ed.backgroundCheck();
}

afterEach(() => {
  ed.listen(null);
  ed.stopWeather();
  ed.closeSession();
});

describe("a held day is the day the saved and reopened map holds", () => {
  // (Lake Basin seed 5 since 3D forms grow at the default Verticality, D488, D148: seed 4 has a spring cave, and on a map
  // with caves an edit has no live water, worker/session.ts `kickWater`: the background check's settle puts it in place)
  for (const [seed, theme] of [[3, "riverValley"], [5, "lakeBasin"]] as [number, ThemeId][]) {
    it(`${theme} ${seed}: an edit, the day held while the water settles, then again once it has: the reopened map's day, byte for byte`, async () => {
      await runGenerate(makeSpec({ seed, theme, size: { x: W, y: W } }));
      ed.refine();
      lowerAtWater();
      expect(ed.waterSettling(), "the edit's water is still settling").toBe(true);
      // held at each stage the water goes through (the ground's carried-over water, the preview's settle); the canonical
      // settle then lands without a new version, and a run from the earlier water must not outlive it
      for (const hazard of ["drought", "badtide"] as const) await hold(hazard, DAY);
      ed.settleWater();
      expect(ed.waterSettling()).toBe(false);
      for (const hazard of ["drought", "badtide"] as const) await hold(hazard, DAY);
      await ed.backgroundCheck();
      const after: Record<string, Day> = {};
      for (const hazard of ["drought", "badtide"] as const) after[hazard] = await hold(hazard, DAY);
      const saved = ed.project().bytes;
      ed.openProject(saved);
      await settled();
      for (const hazard of ["drought", "badtide"] as const) expectSame(after[hazard], await hold(hazard, DAY), `${hazard} day ${DAY} after the reopen`);
    }, 300_000);
  }

  it("an unedited import: a day held, saved, reopened, held again", async () => {
    ed.openTimber(map(2, W).bytes, "opened.timber");
    await settled();
    const first: Record<string, Day> = {};
    for (const hazard of ["drought", "badtide"] as const) first[hazard] = await hold(hazard, DAY);
    const saved = ed.project().bytes;
    ed.openProject(saved);
    await settled();
    for (const hazard of ["drought", "badtide"] as const) expectSame(first[hazard], await hold(hazard, DAY), `${hazard} day ${DAY} of the import after the reopen`);
  }, 300_000);
});

describe("a held day's soil is the map's own rules on that day's water", () => {
  it("Day 0 is the map's own soil, tile for tile (the page's and the core's), on a generated map and an edited one", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    const open = ed.refine();
    const own = (soil: SoilView) => [Buffer.from(soil.moisture).toString("base64"), Buffer.from(soil.contamination).toString("base64")];
    expect(own((await hold("badtide", 0)).soil)).toEqual(own(open.view.soil!));
    lowerAtWater();
    ed.settleWater();
    const edited = ed.sessionView().view.soil!;
    expect(own((await hold("drought", 0)).soil)).toEqual(own(edited));
    // (the core: the held day's function on the map's own settled water is the map's soil, with no saturation passed in)
    const s = MapSession.open(decodeProject(ed.project().bytes));
    s.settleCanonical();
    const b = s.built;
    const on = soilOnWater(b, b.water, b.contamination);
    expect(Array.from(on.moisture)).toEqual(Array.from(b.moisture));
    expect(Array.from(on.contamination)).toEqual(Array.from(b.soilContamination));
  }, 300_000);

  it("a Thorns line shields a held day's soil as it shields the map's own", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    ed.settleWater();
    const bare = await hold("badtide", 8);
    // land the badtide spoils on its last day: Thorns go there
    const wet = new Set<number>();
    for (let k = 0; k < bare.water.count; k++) wet.add(bare.water.tile[k]);
    const chosen: number[] = [];
    for (let i = 0; i < W * W && chosen.length < 12; i++) {
      if (bare.soil.contamination[i] > 0 && !wet.has(i)) chosen.push(i);
    }
    expect(chosen.length, "tiles the badtide spoils on land").toBeGreaterThan(0);
    let placed = 0;
    for (const i of chosen) {
      const r = ed.apply({ op: "placeEntity", params: { id: crypto.randomUUID(), template: "Thorns", x: i % W, y: (i / W) | 0, orientation: "Cw0" } });
      if (r.ok) placed++;
    }
    expect(placed, "Thorns placed").toBeGreaterThan(0);
    ed.settleWater();
    const own = ed.sessionView().view.soil!;
    const shielded = await hold("badtide", 8);
    const s = MapSession.open(decodeProject(ed.project().bytes));
    s.settleCanonical();
    const thorns = s.built.entities.filter((e) => e.template === "Thorns").map((e) => e.y * W + e.x);
    expect(thorns.length).toBeGreaterThan(0);
    let shields = 0;
    for (const i of thorns) {
      // (the map's own soil, and the day's, hold none on a Thorns tile)
      expect(own.moisture[i], `the map's moisture under Thorns at ${i}`).toBe(0);
      expect(own.contamination[i], `the map's contamination under Thorns at ${i}`).toBe(0);
      expect(shielded.soil.moisture[i], `the day's moisture under Thorns at ${i}`).toBe(0);
      expect(shielded.soil.contamination[i], `the day's contamination under Thorns at ${i}`).toBe(0);
      if (bare.soil.contamination[i] > 0) shields++;
    }
    expect(shields, "Thorns that held back soil the bare day had").toBeGreaterThan(0);
  }, 300_000);
});
