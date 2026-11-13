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
    return { day0: open.view.water, last: lastDay! as WaterView, news: news! as ed.DroughtLineNews, bytes, seen: { heights: open.view.heights, caved: new Set(open.view.columns.tiles) } };
  } finally {
    ed.listen(null);
    ed.watchDroughtLine(null);
    ed.stopWeather();
    ed.closeSession();
  }
}

/** The tiles a column of the view stands for as the line reads them: on a map with caves or overhangs (D488 grows them at
 *  the default Verticality too) the water seen from above, a caved tile's column standing on its top only, never a
 *  cave's pool under its roof (stackWater.ts `surfaceWater`). */
interface Seen {
  heights: ArrayLike<number>;
  caved: ReadonlySet<number>;
}
const shows = (w: WaterView, k: number, v: Seen) => !v.caved.has(w.tile[k]) || w.floor[k] === v.heights[w.tile[k]];
const wetSet = (w: WaterView, v: Seen) => {
  const s = new Set<number>();
  for (let k = 0; k < w.count; k++) if (w.depth[k] > WATER_BODY && shows(w, k, v)) s.add(w.tile[k]);
  return s;
};

describe("the drought line (D133, D269)", () => {
  // a lake that keeps water and a pool that dries; a river that leaves pools; the start's own water drying out
  // while other water stays; a river that dries out entirely
  // (River Valley 15 for 1 since generator 0.10.6, D498, D148: seed 1's river still dries out, but a badwater pool beside it
  // holds 66 tiles of water through the drought, so its line is not empty; seed 15 has no water left on the last day;
  // Lake Basin 5 for 4 and River Valley 4 for 3 since generator 0.10.7, D502, D148: seed 4's pools no longer dry out,
  // and seed 3's river now dries out entirely, as do River Valley 64² seeds 2 and 6; Lake Basin 1 for 5 and River Valley 6
  // for 15 on D502's narrowed maps, D148: the start moved again and seed 5's pools no longer dry out (seed 1's do, and its
  // lake keeps 148 tiles of shore), seed 15 keeps 24 tiles of water on the last day and seed 6's river dries out entirely;
  // Lake Basin 14 for 1 and River Valley 3 for 4 since generator 0.10.16's ground with grade, D148: no pool of Lake Basin
  // seeds 1–13 dries out now (seed 14's do, 55 bed tiles gone, and its lake keeps 201 tiles of shore), and River Valley 4's
  // river dries out entirely, as 2, 6 and 10 do; seed 3's line keeps 23 tiles of shore while the start's 341 tiles of water dry out;
  // Lake Basin 3 for 14 and River Valley 2 for 6 since generator 0.10.20's contour edges, D518, D148: no pool of Lake Basin 14
  // dries out now (a lake keeps 161 tiles of shore, no bed tile gone); of Lake Basin seeds 1–30 the pools dry out in 3, 5, 6, 9,
  // 15, 18, 20, 25, 27 and 29, and seed 3 is the first (its lake keeps 193 tiles of shore); River Valley 6's river keeps 27 tiles
  // of water on the last day now; of River Valley seeds 1–30 the river dries out entirely in 2, 3, 5, 12, 15, 16, 17, 20, 21, 24
  // and 27, and seed 2 is the first; River Valley 3 stays in the list, dry as well now;
  // Lake Basin 1 for 3 and River Valley 7 for 2 since the D518 mends (compact hills, no broad wash flats, dead-stand
  // knots), D148: no pool of Lake Basin 3 dries out now (a lake keeps 199 tiles of shore, no bed tile gone); of Lake Basin
  // seeds 1–30 the pools dry out in 1, 7, 8, 9, 11, 12, 20, 21 and 26–29, and seed 1 is the first (its lake keeps 189 tiles of
  // shore); River Valley 2's river keeps 23 tiles of water on the last day now; of River Valley seeds 1–30 the river dries out
  // entirely in 3, 7, 16, 17 and 20, and seed 7 is the first after seed 3, which stays in the list;
  // Lake Basin 3 for 1 since generator 0.10.21's look round (D518: the land's long straight steps jog), D148: no pool of Lake Basin 1
  // dries out now; of Lake Basin seeds 1–15 the pools dry out in 3, 7 and 8, and seed 3 is the first)
  for (const [theme, seed] of [
    ["lakeBasin", 3],
    ["riverValley", 3],
    ["delta", 1],
    ["riverValley", 7],
  ] as const)
    it(`matches the Drought view's last day tile for tile (${theme} ${seed})`, async () => {
      const { day0, last, news, seen } = await drought(seed, theme);
      const L = news.line;
      expect(L.refused).toBeNull();
      expect(L.days).toBe(9);
      const then = wetSet(last, seen);
      const now = wetSet(day0, seen);
      const at = new Map<number, number>();
      for (let k = 0; k < last.count; k++) if (shows(last, k, seen)) at.set(last.tile[k], k);
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
      if (theme === "riverValley" && seed === 7) expect(L.line.count, "the river dries out").toBe(0);
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

  it("marks a shore under today's water from the line's own two days, whatever water the view shows", () => {
    // a 6 × 1 trench: today 2 deep along tiles 1–4, on the last day 0.5 deep on tiles 2–3 only (a falling lake), and
    // a second trench kept as it is (tiles 7–10 of a second row, the same depth both days)
    const Wt = 12;
    const heights = new Uint8Array(Wt * 2).fill(5);
    const depth = new Float32Array(Wt * 2);
    const last = new Float32Array(Wt * 2);
    for (const i of [1, 2, 3, 4]) {
      heights[i] = 3;
      depth[i] = 2;
    }
    for (const i of [2, 3]) last[i] = 0.5;
    for (const i of [Wt + 7, Wt + 8, Wt + 9, Wt + 10]) {
      heights[i] = 3;
      depth[i] = 1;
      last[i] = 1;
    }
    const L = droughtLine({ W: Wt, H: 2, heights, settled: { depth, contamination: new Float32Array(Wt * 2) }, last, days: 9, startWater: null });
    const under = new Map<number, number>();
    for (let k = 0; k < L.line.count; k++) under.set(L.line.tile[k], L.line.under[k]);
    expect(under.get(2)).toBe(1);
    expect(under.get(3)).toBe(1);
    expect(under.get(Wt + 7)).toBe(0);
    expect(under.get(Wt + 10)).toBe(0);
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
    // (River Valley 3 for 4 since generator 0.10.16's ground with grade, D148: seed 4's river dries out entirely, so its
    // line is empty; seed 3's keeps water; seed 1 since generator 0.10.20's contour edges, D518, D148: seed 3's river dries out
    // entirely now, its line empty; of seeds 1–30 seed 1 is the first whose line keeps water, 57 tiles of it)
    await runGenerate(makeSpec({ seed: 1, theme: "riverValley", size: { x: W, y: W } }));
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
