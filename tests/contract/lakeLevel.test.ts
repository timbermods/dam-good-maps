// Lakes by number on the editor's core (D342; core/doc/lakeLevel.ts, core/sim/sill.ts): a lake is picked, its level
// typed, and its sill is cut down or raised so the lake holds there. Each is one `setLakeLevel` operation and one undo
// step; the settled water stands at the level (from it up to under a level above it) on every lake of a staircase;
// a project file rebuilds it byte for byte; and the land that can't hold a lake at a level is refused with one line.
//
// The map: a valley 24 tiles wide between walls at 18, running south to the map's edge, with four basins stepping
// down it, each closed by a rim four rows deep: floors 12, 8, 4 and 1, rims 17, 13, 5 and 2. Two sources (3 each) at
// the top. The four lakes are set to 15, 11, 7 and 3, a fall of four levels between each: the top two rims cut down,
// the bottom two raised.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyLakeLevel, planLakeLevel } from "../../src/core/doc/lakeLevel";
import type { OpOf } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { runsToTiles } from "../../src/core/math/grid";

const W = 48;
const H = 112;
const VALLEY = { x0: 12, x1: 35 };
const BASINS = [
  { y0: 4, y1: 25, floor: 12, rim: 17, level: 15 },
  { y0: 30, y1: 51, floor: 8, rim: 13, level: 11 },
  { y0: 56, y1: 77, floor: 4, rim: 5, level: 7 },
  { y0: 82, y1: 103, floor: 1, rim: 2, level: 3 },
];
/** A tile in the middle of each lake. */
const LAKE = BASINS.map((b) => [24, (b.y0 + b.y1) >> 1] as [number, number]);

/** The staircase map, opened as an import, with `sources` sources of strength `strength` at the top. `shape` changes
 *  the ground first. */
function staircase(opts: { sources?: number; strength?: number; shape?: (h: Uint8Array) => void } = {}): MapSession {
  const h = new Uint8Array(W * H).fill(18);
  BASINS.forEach((b, k) => {
    const end = k + 1 < BASINS.length ? BASINS[k + 1].y0 - 1 : H - 1;
    for (let y = b.y0; y <= end; y++) for (let x = VALLEY.x0; x <= VALLEY.x1; x++) h[y * W + x] = y <= b.y1 ? b.floor : b.rim;
  });
  opts.shape?.(h);
  const f: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-11-09 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(h, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
  const s = MapSession.importMap(writeTimber(f), "staircase.timber");
  const n = opts.sources ?? 2;
  for (let k = 0; k < n; k++) {
    const strength = opts.strength ?? 3;
    const id = `00000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`;
    const r = s.apply({ op: "placeEntity", params: { id, template: "WaterSource", x: 16 + 3 * k, y: 8, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } } });
    expect(r.errors).toEqual([]);
  }
  return s;
}

/** Where the map's water stands at a tile. */
const surfaceAt = (s: MapSession, [x, y]: [number, number]) => s.built.heights[y * W + x] + s.built.water[y * W + x];

describe("Lakes by number: four lakes stepping down a valley", () => {
  it("sets the lakes to 15, 11, 7 and 3, each one undo step, and the settled water stands at each level", () => {
    const s = staircase();
    const heights = s.built.heights.slice();
    // (as the map stands: the rims hold the lakes at 17, 13, 5 and 2)
    BASINS.forEach((b, k) => expect(Math.floor(surfaceAt(s, LAKE[k]))).toBe(b.rim));
    const steps = s.history().length;
    const ways: string[] = [];
    BASINS.forEach((b, k) => {
      const [x, y] = LAKE[k];
      const plan = planLakeLevel(s, x, y, b.level);
      expect(plan.reason).toBeNull();
      // (the question changes nothing)
      expect(s.history().length).toBe(steps + k);
      ways.push(plan.sill!);
      // its tiles are the sill's, between this lake and the next: a notch's crest at the level beside the lake, its
      // channel a level lower past it and its sides stepping up; a bank's spillway at the level, the rest a level higher
      // with a step down behind it
      const basin = (t: number) => t % W >= VALLEY.x0 && t % W <= VALLEY.x1 && Math.floor(t / W) >= b.y0 && Math.floor(t / W) <= b.y1;
      plan.tiles.forEach((i, j) => {
        expect(basin(i)).toBe(false);
        const beside = [i - W, i + W, i - 1, i + 1].some(basin);
        if (plan.sill === "cut") expect(plan.levels[j]).toBeGreaterThanOrEqual(beside ? b.level : b.level - 1);
        else expect(plan.levels[j]).toBeLessThanOrEqual(b.level + 1);
      });
      expect(plan.levels).toContain(b.level);
      expect(plan.levels).toContain(plan.sill === "cut" ? b.level - 1 : b.level + 1);
      expect(plan.surface).toBeGreaterThanOrEqual(b.level);
      expect(plan.surface).toBeLessThan(b.level + 1);
      expect(plan.lake).toContain(y * W + x);
      const r = applyLakeLevel(s, x, y, b.level);
      expect(r.errors).toEqual([]);
      // (setting the level is the question's answer, not measured again)
      expect(r.plan).toBe(plan);
      expect(s.history().length).toBe(steps + k + 1);
      expect(s.history().at(-1)!.label).toBe(`${plan.sill === "cut" ? "Cut" : "Raise"} a lake's sill to level ${b.level}`);
      plan.tiles.forEach((i, j) => expect(s.built.heights[i]).toBe(plan.levels[j]));
      // the map's water is the settle that confirmed it: where the plan said
      expect(surfaceAt(s, LAKE[k])).toBeCloseTo(plan.surface, 9);
    });
    expect(ways).toEqual(["cut", "cut", "raise", "raise"]);
    // every lake stands at its level once all four are set, a fall of four levels between each
    BASINS.forEach((b, k) => {
      const at = surfaceAt(s, LAKE[k]);
      expect(at, `lake ${k + 1}`).toBeGreaterThanOrEqual(b.level);
      expect(at, `lake ${k + 1}`).toBeLessThan(b.level + 1);
    });
    expect(s.waterPending).toBe(false);
    // one undo a lake, back to the map as it was
    for (let k = 0; k < BASINS.length; k++) expect(s.undo()).toBe(true);
    expect(Array.from(s.built.heights)).toEqual(Array.from(heights));
  });

  it("a project file rebuilds the lakes byte for byte", () => {
    const s = staircase();
    for (const [k, b] of BASINS.entries()) expect(applyLakeLevel(s, LAKE[k][0], LAKE[k][1], b.level).errors).toEqual([]);
    const reopened = MapSession.open(decodeProject(s.project()), { rebuild: true });
    expect(Array.from(reopened.built.heights)).toEqual(Array.from(s.built.heights));
    expect(Array.from(reopened.built.water)).toEqual(Array.from(s.built.water));
    expect(reopened.exportTimber().bytes).toEqual(s.exportTimber().bytes);
  });

  it("the water a lake's level leaves is the canonical settle: the same bytes as the operation applied on its own", () => {
    const s = staircase();
    const t = staircase();
    for (const [k, b] of BASINS.entries()) {
      const plan = planLakeLevel(s, LAKE[k][0], LAKE[k][1], b.level);
      expect(applyLakeLevel(s, LAKE[k][0], LAKE[k][1], b.level).errors).toEqual([]);
      // (the same operation, applied as any other is, settles the map afresh)
      expect(t.apply(plan.op!).errors).toEqual([]);
    }
    expect(Array.from(s.built.water)).toEqual(Array.from(t.built.water));
    expect(s.exportTimber().bytes).toEqual(t.exportTimber().bytes);
  });

  it("widens a cut notch for a strong river, so its water stands under a level over the sill", () => {
    // (four sources of 6: 24 blocks a second over the top rim)
    const s = staircase({ sources: 4, strength: 6 });
    const [x, y] = LAKE[0];
    const plan = planLakeLevel(s, x, y, 15);
    expect(plan.reason).toBeNull();
    expect(plan.sill).toBe("cut");
    expect(plan.width!).toBeGreaterThanOrEqual(8);
    expect(plan.surface).toBeLessThan(16);
    // a notch one tile wide, asked for, holds such a river a level and more over it: refused, with where it stands
    const narrow = planLakeLevel(s, x, y, 15, 1);
    expect(narrow.reason).toMatch(/^the lake at X 24 · Y 14 would stand at 1[6-9](\.\d+)? over a notch 1 tile wide, above level 15: its river needs a wider sill$/);
    expect(narrow.op).toBeNull();
  });
});

describe("Lakes by number: the land that can't hold a lake at a level is refused with one line", () => {
  it("a level at or below the lake's floor", () => {
    const s = staircase();
    expect(planLakeLevel(s, 24, 14, 12).reason).toBe("level 12 is at or below the ground at X 24 · Y 14, which stands at 12");
  });

  it("a lake that already spills at the level", () => {
    const s = staircase();
    expect(planLakeLevel(s, 24, 14, 17).reason).toBe("the lake at X 24 · Y 14 already spills at level 17");
  });

  it("a basin that leaks elsewhere below the level", () => {
    // (a side channel from the third basin east through the wall to the map's edge, its floor at 5)
    const s = staircase({ shape: (h) => {
      for (let y = 64; y <= 66; y++) for (let x = VALLEY.x1 + 1; x < W; x++) h[y * W + x] = 5;
    } });
    const plan = planLakeLevel(s, LAKE[2][0], LAKE[2][1], 7);
    expect(plan.reason).toMatch(/^at level 7 the lake would also spill at X \d+ · Y \d+, where the ground stands at 5: one sill can't hold it$/);
    expect(plan.op).toBeNull();
  });

  it("a level above every rim: the water would spill off the map", () => {
    const s = staircase();
    expect(planLakeLevel(s, 24, 14, 19).reason).toMatch(/^at level 19 the water would spill off the map at X \d+ · Y \d+$/);
    expect(planLakeLevel(s, 24, 14, 23).reason).toBe("the level must be a whole number from 1 to 22");
  });

  it("a width for a lake whose sill must be raised", () => {
    const s = staircase();
    expect(planLakeLevel(s, LAKE[2][0], LAKE[2][1], 7, 4).reason).toBe("the lake at X 24 · Y 66 spills below level 7: its sill is raised across the outlet, which has no width");
  });

  it("a notch that would drain another lake", () => {
    // (a pond in the valley's east wall beside the top rim, fed by its own source, spilling east at 16 to the map's
    // edge; a notch the valley's width cuts its banks down into the pond's wall)
    const s = staircase({ shape: (h) => {
      for (let y = 26; y <= 29; y++) for (let x = 37; x <= 39; x++) h[y * W + x] = 14;
      for (let x = 40; x < W; x++) h[27 * W + x] = 16;
    } });
    expect(s.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000099", template: "WaterSource", x: 38, y: 28, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } }).errors).toEqual([]);
    expect(Math.floor(surfaceAt(s, [37, 27]))).toBe(16);
    expect(planLakeLevel(s, LAKE[0][0], LAKE[0][1], 15, 24).reason).toMatch(/^the notch would also drain the lake at X 3[7-9] · Y 2[6-9] from level 16 to 1[45]$/);
  });

  it("a lake no source feeds", () => {
    const s = staircase({ sources: 0 });
    expect(planLakeLevel(s, 24, 14, 15).reason).toBe("no water reaches the lake at X 24 · Y 14: a source must feed it");
  });

  it("a raised sill too short for its river", () => {
    // (the second basin's outlet narrowed to a gorge two tiles wide, with four sources of 6 above it)
    const s = staircase({ sources: 4, strength: 6, shape: (h) => {
      for (let y = 52; y <= 55; y++) for (let x = VALLEY.x0; x <= VALLEY.x1; x++) h[y * W + x] = x === 23 || x === 24 ? 9 : 18;
    } });
    const plan = planLakeLevel(s, LAKE[1][0], LAKE[1][1], 11);
    expect(plan.sill).toBe("raise");
    expect(plan.reason).toMatch(/^the lake at X 24 · Y 40 would stand at 1[2-9](\.\d+)? over a spillway 2 tiles wide, above level 11: its river needs a wider sill$/);
  });

  it("an operation whose sill no longer fits the map", () => {
    const s = staircase();
    const plan = planLakeLevel(s, LAKE[0][0], LAKE[0][1], 15);
    const op = plan.op!;
    // (the rim lowered by hand first: the sill measured before is not the one the map now needs)
    const rim = runsToTiles(op.params.cells, W);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[27, 20, 20]], level: 16, exact: true } }).errors).toEqual([]);
    expect(s.apply(op).errors).toEqual(["the lake's sill is no longer the one measured: set its level again"]);
    // and an operation that names no sill's own tiles, or a width on a raise, is refused by the engine
    const forged: OpOf<"setLakeLevel"> = { ...op, params: { ...op.params, cells: [[Math.floor(rim[0] / W), 0, 0]], levels: [15] } };
    expect(s.apply(forged).errors).toEqual(["the lake's sill is no longer the one measured: set its level again"]);
    expect(s.apply({ ...op, params: { ...op.params, levels: op.params.levels.slice(1) } }).errors).toEqual(["the sill needs one level for each of its cells"]);
    expect(s.apply({ op: "setLakeLevel", params: { ...op.params, sill: "raise" } }).errors).toEqual(["a raised sill spans the outlet: only a cut has a width"]);
  });
});
