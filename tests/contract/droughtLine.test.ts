// The drought line (D133, D269; ROADMAP.md "Weather view"): every lake and river's water on the last day of a
// drought, its shore, the beds that dry out and the start's water, read from the Drought view's own last day. On a
// few generated maps it matches the Drought view's last-day water tile for tile, marks the start's water, and leaves
// the map's bytes as they were; plain terrain without water has no line (a map with caves has its line too: caveImport.test.ts).

import { describe, expect, it } from "vitest";
import { droughtLine, startWaterMask, SIDE_EAST, SIDE_NORTH, SIDE_SOUTH, SIDE_WEST } from "../../src/core/sim/droughtLine";
import { mapDroughtLine } from "../../src/core/doc/droughtLine";
import { pumpShoreDistance, walkDistance, walkWorld, WATER_BODY } from "../../src/core/analysis/walk";
import { components } from "../../src/core/analysis/regions";
import { DIFFICULTY_RULES, makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import type { WaterView } from "../../src/render3d/model";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;

/** (the worker's loop yields through a message channel: wait by polling, not on a timer) */
async function until(done: () => boolean, ms: number) {
  const end = performance.now() + ms;
  while (!done() && performance.now() < end) await new Promise((r) => setTimeout(r, 2));
  expect(done(), "the worker's news came").toBe(true);
}

/** A generated map's drought as the page meets it: day 0's water, the Drought view's last day (the `weather` event's
 *  water) and the drought line the worker sends with it; each map's run once. */
const runs = new Map<string, Awaited<ReturnType<typeof runDrought>>>();
async function drought(seed: number, theme: ThemeId) {
  const key = `${theme} ${seed}`;
  if (!runs.has(key)) runs.set(key, await runDrought(seed, theme));
  return runs.get(key)!;
}
async function runDrought(seed: number, theme: ThemeId) {
  await runGenerate(makeSpec({ seed, theme, size: { x: W, y: W } }));
  ed.setAutoWater(false);
  const open = ed.refine();
  const bytes = ed.project().bytes;
  try {
    let lastDay: WaterView | null = null;
    let news: ed.DroughtLineNews | null = null;
    ed.listen((e) => {
      if (e.kind === "weather" && e.phase === "day" && e.hazard === "drought" && e.day === e.days && e.water) lastDay = e.water;
    });
    expect(ed.watchDroughtLine((n) => (news = n)), "no line before the drought's days are worked out").toBeNull();
    ed.showWeatherDay("drought", null);
    await until(() => !!lastDay && !!news, 60_000);
    // the map never changes
    expect(ed.project().bytes).toEqual(bytes);
    return { day0: open.view.water, last: lastDay! as WaterView, news: news! as ed.DroughtLineNews, bytes };
  } finally {
    ed.listen(null);
    ed.watchDroughtLine(null);
    ed.stopWeather();
    ed.closeSession();
  }
}

const wetSet = (w: WaterView) => {
  const s = new Set<number>();
  for (let k = 0; k < w.count; k++) if (w.depth[k] > WATER_BODY) s.add(w.tile[k]);
  return s;
};

describe("the drought line (D133, D269)", () => {
  // a lake that keeps water and a pool that dries; a river that leaves pools; the start's own water drying out
  // while other water stays; a river that dries out entirely
  for (const [theme, seed] of [
    ["lakeBasin", 4],
    ["riverValley", 3],
    ["delta", 1],
    ["riverValley", 1],
  ] as const)
    it(`matches the Drought view's last day tile for tile (${theme} ${seed})`, async () => {
      const { day0, last, news } = await drought(seed, theme);
      const L = news.line;
      expect(L.refused).toBeNull();
      expect(L.days).toBe(9);
      const then = wetSet(last);
      const now = wetSet(day0);
      const at = new Map<number, number>();
      for (let k = 0; k < last.count; k++) at.set(last.tile[k], k);
      // the shore: exactly the last day's water tiles with a dry side, each dry side marked, at the view's surface
      const want = new Map<number, number>();
      for (const i of then) {
        const x = i % W;
        const y = (i - x) / W;
        let sides = 0;
        if (x > 0 && !then.has(i - 1)) sides |= SIDE_WEST;
        if (x + 1 < W && !then.has(i + 1)) sides |= SIDE_EAST;
        if (y > 0 && !then.has(i - W)) sides |= SIDE_NORTH;
        if (y + 1 < W && !then.has(i + W)) sides |= SIDE_SOUTH;
        if (sides) want.set(i, sides);
      }
      const got = new Map<number, number>();
      for (let k = 0; k < L.line.count; k++) {
        got.set(L.line.tile[k], L.line.sides[k]);
        const v = at.get(L.line.tile[k])!;
        expect(L.line.level[k]).toBeCloseTo(last.floor[v] + last.depth[v], 4);
      }
      expect(got).toEqual(want);
      // the beds: exactly the water of day 0 the last day no longer has; a bed is gone when its whole body is
      const bed = new Set(L.bed.tile);
      expect(bed).toEqual(new Set([...now].filter((i) => !then.has(i))));
      const mask = new Uint8Array(W * W);
      for (const i of now) mask[i] = 1;
      const body = components(mask, W, W).labels;
      const keeps = new Set<number>();
      for (const i of then) if (body[i] >= 0) keeps.add(body[i]);
      for (let k = 0; k < L.bed.count; k++) expect(L.bed.gone[k], `bed tile ${L.bed.tile[k]}`).toBe(keeps.has(body[L.bed.tile[k]]) ? 0 : 1);
      if (theme === "lakeBasin") {
        expect(L.line.count, "the lake keeps water").toBeGreaterThan(100);
        expect(
          L.bed.gone.some((g) => g === 1),
          "a pool dries out",
        ).toBe(true);
      }
      if (theme === "riverValley" && seed === 1) expect(L.line.count, "the river dries out").toBe(0);
    });

  it("marks the start's water: the bodies the start's pumps draw from, and their water on the last day", async () => {
    const { news, bytes } = await drought(4, "lakeBasin");
    const L = news.line;
    // (the map as the worker has it, from its own project file)
    const s = MapSession.open(decodeProject(bytes));
    const b = s.built;
    // the start's nearest water a pump reaches (the start's water rule's own tile) is the start's, with its body
    const { blocked, links } = walkWorld(b.entities, W, W);
    const walk = walkDistance(b.heights, W, W, blocked, links, b.start!);
    const { tile } = pumpShoreDistance(walk, b.heights, W, W, b.water, b.contamination);
    expect(tile).toBeGreaterThanOrEqual(0);
    const within = s.effectiveSpec()!.settings.start.rules.waterWithin;
    const start = startWaterMask({
      W,
      H: W,
      heights: b.heights,
      depth: b.water,
      contamination: b.contamination,
      objects: b.entities,
      start: b.start,
      within,
    });
    expect(start[tile]).toBe(1);
    expect(L.startWater).toBe(start.reduce((a, v) => a + v, 0));
    expect(
      L.line.start.some((v) => v === 1),
      "the lake's line is the start's",
    ).toBe(true);
    for (let k = 0; k < L.bed.count; k++) expect(L.bed.start[k]).toBe(start[L.bed.tile[k]]);
    // the session's question gives the worker's line
    expect(mapDroughtLine(s, b.water, 9).startWater).toBe(L.startWater);
    // with no start, nothing is the start's
    const without = droughtLine({
      W,
      H: W,
      heights: b.heights,
      settled: { depth: b.water, contamination: b.contamination },
      last: b.water,
      days: 9,
      startWater: null,
    });
    expect(without.startWater).toBe(0);
    expect(without.line.start.every((v) => v === 0)).toBe(true);
  });

  it("plain terrain without water has no line", () => {
    const N = 32 * 32;
    const flat = {
      W: 32,
      H: 32,
      heights: new Uint8Array(N).fill(4),
      settled: {
        depth: new Float64Array(N),
        contamination: new Float64Array(N),
      },
      last: new Float64Array(N),
      days: 9,
      startWater: null,
    };
    const dry = droughtLine(flat);
    expect([dry.line.count, dry.bed.count, dry.startWater, dry.refused]).toEqual([0, 0, 0, null]);
    expect(DIFFICULTY_RULES.normal.waterWithin).toBeGreaterThan(0);
  });

  it("is only ever the map's line as it is: none yet when a map opens, none after an edit or once it closes", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.setAutoWater(false);
    const got: ed.DroughtLineNews[] = [];
    ed.watchDroughtLine((n) => got.push(n));
    try {
      // a map opening: an empty line for its version, until its own is worked out
      const open = ed.refine();
      expect(got.length).toBe(1);
      expect([got[0].version, got[0].line.line.count, got[0].line.bed.count, got[0].line.refused]).toEqual([open.info.version, 0, 0, null]);
      ed.showWeatherDay("drought", null);
      await until(() => got.length === 2, 60_000);
      expect(got[1].line.line.count).toBeGreaterThan(0);
      expect(ed.watchDroughtLine((n) => got.push(n))?.line).toBe(got[1].line);
      // an edit: the old line is no longer the map's
      const cells: [number, number, number][] = [[2, 2, 3]];
      expect(ed.apply({ op: "sculpt", params: { mode: "raise", cells, amount: 1 } }).errors).toEqual([]);
      expect(ed.watchDroughtLine((n) => got.push(n))).toBeNull();
      // a closed map has none
      ed.stopWeather();
      ed.closeSession();
      expect(ed.watchDroughtLine((n) => got.push(n))).toBeNull();
    } finally {
      ed.watchDroughtLine(null);
      ed.stopWeather();
      ed.closeSession();
    }
  });
});
