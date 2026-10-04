// Remove unfed water and Fill on the editor's core (PLAN §20 D387 (2) and (3), D394; D342): the core
// questions report what each will do before it acts, each is one operation and one undo step, the
// water after it is what the game's rules make of the map, and project files rebuild it byte for
// byte. The engine's own rules are in tests/unit/fedFill.test.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp, OpOf } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { generate } from "../../src/core/gen/generate";
import { fedTiles, WATER } from "../../src/core/sim/fed";
import { fillDays } from "../../src/core/sim/fill";
import { TICKS_PER_DAY, waterSteady, WaterSim } from "../../src/core/sim/water";
import { makeSpec } from "../../src/core/spec/mapspec";

const N = 96;

function session(theme: "lakeBasin" | "riverValley", seed: number): MapSession {
  return MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: N, y: N } })));
}

/** The water the game's rules make of the map's stored water after `days`. */
function gameDays(s: MapSession, days: number): Float64Array {
  const b = s.built;
  const sim = new WaterSim(b.waterModel, { depth: b.water.slice(), contamination: b.contamination.slice() });
  if (b.settle.out) sim.out.set(b.settle.out);
  sim.run(days * TICKS_PER_DAY);
  return sim.D;
}

/** Dig `count` pits side by side (each 8×8, two levels deep) into a level plateau the editor
 *  flattens away from water: the hollows a Fill fills. Returns each pit's middle tile and its rim
 *  level. */
function digPits(s: MapSession, count: number): { at: [number, number]; level: number }[] {
  const b = s.built;
  const w = 12 * count + 4;
  for (let y0 = 6; y0 + 16 < N - 6; y0 += 2)
    for (let x0 = 6; x0 + w < N - 6; x0 += 2) {
      let ok = true;
      let hi = 0;
      let lo = 99;
      for (let y = y0 - 3; y < y0 + 15 && ok; y++)
        for (let x = x0 - 3; x < x0 + w + 3 && ok; x++) {
          const i = y * N + x;
          if (b.water[i] > 0) ok = false;
          hi = Math.max(hi, b.heights[i]);
          lo = Math.min(lo, b.heights[i]);
        }
      if (!ok || lo < 3 || hi - lo > 6) continue;
      if (b.entities.some((e) => e.template === "StartingLocation" && e.x > x0 - 8 && e.x < x0 + w + 8 && e.y > y0 - 8 && e.y < y0 + 20)) continue;
      const flat: [number, number, number][] = [];
      for (let y = y0; y < y0 + 12; y++) flat.push([y, x0, x0 + w - 1]);
      expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: flat, level: hi } }).errors).toEqual([]);
      const out: { at: [number, number]; level: number }[] = [];
      for (let k = 0; k < count; k++) {
        const px = x0 + 4 + 12 * k;
        const cells: [number, number, number][] = [];
        for (let y = y0 + 2; y < y0 + 10; y++) cells.push([y, px, px + 7]);
        expect(s.apply({ op: "sculpt", params: { mode: "lower", cells, amount: 2 } }).errors).toEqual([]);
        out.push({ at: [px + 3, y0 + 5], level: hi });
      }
      return out;
    }
  throw new Error("no plateau for the pits");
}

const bytesOf = (s: MapSession) => s.exportTimber().bytes;

describe("Remove unfed water (D387 (2))", () => {
  let s: MapSession;
  let before: Float64Array;
  let fedBefore: Uint8Array;
  let removal: ReturnType<typeof unfedWater>;
  let fileBefore: Uint8Array;

  beforeAll(() => {
    // Lake Basin 2 (1 before M9b's maps, D148: its 96² map has no dry plateau for the two pits): rows
    // of grouped sources (D314), two badwater sources, and two Fills, pools no source's water
    // reaches (the canonical settle's pre-fill left such pools in hollows until D385, which takes
    // that water from nowhere away; a stored lake is the unfed water a map keeps)
    s = session("lakeBasin", 2);
    for (const p of digPits(s, 2)) expect(s.apply(planFill(s, p.at[0], p.at[1], p.level).op!).errors).toEqual([]);
    before = s.built.water.slice();
    fedBefore = fedTiles(s.built.waterModel, before);
    fileBefore = bytesOf(s);
    removal = unfedWater(s);
  });

  it("says what it will remove first: pools of unfed water and their tiles, none of them fed", () => {
    expect(removal.pools).toBeGreaterThanOrEqual(2);
    expect(removal.tiles).toBeGreaterThanOrEqual(30);
    expect(removal.volume).toBeGreaterThan(10);
    expect(removal.bodies).toHaveLength(removal.pools);
    expect(removal.op).not.toBeNull();
    for (const i of removal.op!.params.tiles) {
      expect(before[i]).toBeGreaterThan(0);
      expect(fedBefore[i]).toBe(0);
    }
    expect(removal.op!.params.pools).toBe(removal.pools);
    expect(removal.op!.params.area).toBeUndefined();
    // the water the grouped sources and the badwater sources feed is all fed, and none of it is taken
    const m = s.built.waterModel;
    const group = m.emitters.filter((e) => e.strength > 0 && e.contamination === 0 && e.cells.length === 1);
    const bad = m.emitters.filter((e) => e.strength > 0 && e.contamination > 0);
    expect(group.length).toBeGreaterThanOrEqual(3);
    expect(bad.length).toBeGreaterThanOrEqual(1);
    const taken = new Set(removal.op!.params.tiles);
    for (const only of [group, bad]) {
      const reach = fedTiles({ ...m, emitters: only }, before);
      let wet = 0;
      for (let i = 0; i < N * N; i++) {
        if (!reach[i] || !(before[i] > 0)) continue;
        wet++;
        expect(fedBefore[i]).toBe(1);
        expect(taken.has(i)).toBe(false);
      }
      expect(wet).toBeGreaterThan(20);
    }
  });

  it("is one operation and one undo step: the unfed water goes, fed water is untouched, and the game never brings it back", () => {
    const steps = s.history().length;
    const r = s.apply(removal.op!);
    expect(r.errors).toEqual([]);
    expect(s.history().length).toBe(steps + 1);
    expect(s.history().at(-1)!.label).toBe(`Remove unfed water, ${removal.pools} pools`);
    const after = s.built.water;
    const taken = new Set(removal.op!.params.tiles);
    for (const i of taken) expect(after[i]).toBeLessThanOrEqual(WATER);
    // (the settle ran a check or two on after taking it: fed water moves no more than the settle's
    // own test lets settled water move, at most 0.5% of it by over 0.005)
    let fed = 0;
    let moved = 0;
    for (let i = 0; i < N * N; i++) {
      if (taken.has(i) || !fedBefore[i] || !(before[i] > 0)) continue;
      fed++;
      const d = Math.abs(after[i] - before[i]);
      expect(d).toBeLessThan(0.01);
      if (d > 0.005) moved++;
      expect(after[i] > WATER).toBe(before[i] > WATER);
    }
    expect(moved).toBeLessThanOrEqual(0.005 * fed);
    // nothing unfed is left to remove
    expect(unfedWater(s).pools).toBe(0);
    // the game's rules from the stored water: five days on, still gone
    const later = gameDays(s, 5);
    for (const i of taken) expect(later[i]).toBeLessThanOrEqual(WATER);
  });

  it("a project file rebuilds it byte for byte, and one undo restores the map exactly", () => {
    const file = bytesOf(s);
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(Array.from(reopened.built.water)).toEqual(Array.from(s.built.water));
    expect(bytesOf(reopened)).toEqual(file);
    expect(s.undo()).toBe(true);
    expect(Array.from(s.built.water)).toEqual(Array.from(before));
    expect(bytesOf(s)).toEqual(fileBefore);
    expect(s.redo()).toBe(true);
    expect(bytesOf(s)).toEqual(file);
  });

  it("is refused, with a reason, for fed water or where there is none", () => {
    const fedTile = fedBefore.findIndex((f, i) => f === 1 && before[i] > 0.1);
    expect(fedTile).toBeGreaterThanOrEqual(0);
    const fed: EditOp = { op: "removeUnfedWater", params: { tiles: [fedTile] } };
    expect(s.check(fed)).toEqual(["one of those tiles holds water a source feeds: look again at what it would remove"]);
    const dry = before.findIndex((d) => d === 0);
    expect(s.check({ op: "removeUnfedWater", params: { tiles: [dry] } })).toEqual(["no unfed water stands there"]);
    expect(s.check({ op: "removeUnfedWater", params: { tiles: [5, 4] } })).toEqual(["the water's tiles must be ascending, each once"]);
    expect(s.check({ op: "removeUnfedWater", params: { tiles: [N * N] } })[0]).toMatch(/is not a tile of the 96×96 map/);
    expect(s.check({ op: "removeUnfedWater", params: { tiles: [] } })[0]).toMatch(/needs 1\+ items/);
  });
});

describe("Fill (D387 (3), D394) and Remove unfed water within a selection", () => {
  let s: MapSession;
  let pits: { at: [number, number]; level: number }[];

  beforeAll(() => {
    // (River Valley 7 on 0.8.1's maps, D148: River Valley 2's map has no dry plateau for the two pits)
    s = session("riverValley", 7);
    pits = digPits(s, 2);
  });

  it("says why when the hollow doesn't hold water at that level", () => {
    const [{ at, level }] = pits;
    const floor = s.built.waterModel.floor[at[1] * N + at[0]];
    expect(floor).toBe(level - 2);
    expect(planFill(s, at[0], at[1], level + 0.5).reason).toMatch(/^at level \d+(\.5)? the water would spill off the map at \(\d+, \d+\): the hollow doesn't hold it$/);
    expect(planFill(s, at[0], at[1], floor).reason).toBe(`level ${floor} is at or below the ground at (${at[0]}, ${at[1]}), which stands at ${floor}`);
    expect(planFill(s, at[0], at[1], floor - 1).reason).toMatch(/is at or below the ground/);
    expect(planFill(s, N, 3, level).reason).toBe(`(${N}, 3) is off the map`);
  });

  it("is one operation and one undo step, says how long it lasts, and is stored at its level and evaporates from there by the game's rules (D222, D413)", () => {
    // (a level below the rim: the pit filled one level deep)
    const at = pits[0].at;
    const level = pits[0].level - 1;
    const before = s.built.water.slice();
    const plan = planFill(s, at[0], at[1], level);
    expect(plan.reason).toBeNull();
    expect(plan.tiles).toBe(64);
    expect(plan.volume).toBeCloseTo(64, 6);
    expect(plan.days).toBeCloseTo(fillDays(N, N, plan.op!.params.lake), 9);
    expect(plan.days).toBeGreaterThan(10);
    expect(plan.days).toBeLessThan(25);
    const steps = s.history().length;
    expect(s.apply(plan.op!).errors).toEqual([]);
    expect(s.history().length).toBe(steps + 1);
    expect(s.history().at(-1)!.label).toBe("Fill a hollow");
    const lake = plan.op!.params.lake;
    const floor = s.built.waterModel.floor;
    // the water stands in the hollow at exactly its level: a sealed lake only evaporating has
    // settled, so the settle stores it as it started (D222, D413), and the check says so
    for (const i of lake.tiles) expect(floor[i] + s.built.water[i]).toBe(level);
    expect(waterSteady(s.built.settle)).toBe(true);
    const settles = s.validate().report.checks.find((c) => c.id === "water.settles")!;
    expect(settles.ok).toBe(true);
    // the game's rules from the stored level: it sinks a day at a time and is gone in about the days
    // the question said
    let days = 0;
    const b = s.built;
    const sim = new WaterSim(b.waterModel, { depth: b.water.slice(), contamination: b.contamination.slice() });
    if (b.settle.out) sim.out.set(b.settle.out);
    const vol = () => lake.tiles.reduce((t, i) => t + sim.D[i], 0);
    let last = vol();
    while (vol() > 0 && days < 40) {
      sim.run(TICKS_PER_DAY);
      days++;
      expect(vol()).toBeLessThan(last);
      last = vol();
    }
    expect(vol()).toBe(0);
    expect(Math.abs(days - plan.days)).toBeLessThan(Math.max(2, plan.days * 0.08));
    // undo: exactly the map before
    s.undo();
    expect(Array.from(s.built.water)).toEqual(Array.from(before));
    s.redo();
  });

  it("is refused when its hollow is no longer the one it measured", () => {
    const [, { at, level }] = pits;
    const plan = planFill(s, at[0], at[1], level);
    expect(plan.reason).toBeNull();
    const op = plan.op!;
    const tampered: OpOf<"fillHollow"> = { op: "fillHollow", params: { ...op.params, lake: { ...op.params.lake, tiles: op.params.lake.tiles.slice(1), floor: op.params.lake.floor.slice(1), depth: op.params.lake.depth.slice(1), contamination: op.params.lake.contamination.slice(1) } } };
    const errors = s.check(tampered);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/hollow is no longer the one measured|must hold/);
    expect(s.check({ op: "fillHollow", params: { ...op.params, level: level - 0.5 } })).toEqual(["the fill's water must stand at its level on every tile"]);
    // the ground changed under it since it was measured
    const [y, x0] = [at[1] - 1, at[0] - 1];
    const r = s.apply({ op: "sculpt", params: { mode: "lower", cells: [[y, x0, x0 + 2], [y + 1, x0, x0 + 2], [y + 2, x0, x0 + 2]], amount: 1 } });
    expect(r.errors).toEqual([]);
    expect(s.check(op)).toEqual(["the hollow is no longer the one measured: measure the fill again"]);
    s.undo();
    expect(s.check(op)).toEqual([]);
  });

  it("Remove unfed water takes a Fill too, within a selection: the pools it touches, whole, and nothing outside", () => {
    const [a, b] = pits;
    // fill the second pit as well: two pools of unfed water on the plateau
    expect(s.apply(planFill(s, b.at[0], b.at[1], b.level).op!).errors).toEqual([]);
    const both = unfedWater(s);
    expect(both.pools).toBeGreaterThanOrEqual(2);
    const tileA = a.at[1] * N + a.at[0];
    const tileB = b.at[1] * N + b.at[0];
    // a selection over one corner tile of the first pit takes that pool whole, and only it
    const corner = { x0: a.at[0] - 3, y0: a.at[1] - 3, x1: a.at[0] - 3, y1: a.at[1] - 3 };
    const one = unfedWater(s, corner);
    expect(one.pools).toBe(1);
    expect(one.tiles).toBe(64);
    expect(one.op!.params.area).toEqual([[corner.y0, corner.x0, corner.x0]]);
    expect(one.op!.params.tiles).toContain(tileA);
    expect(one.op!.params.tiles).not.toContain(tileB);
    const beforeB = s.built.water[tileB];
    expect(s.apply(one.op!).errors).toEqual([]);
    expect(s.built.water[tileA]).toBe(0);
    for (const i of one.op!.params.tiles) expect(s.built.water[i]).toBe(0);
    expect(Math.abs(s.built.water[tileB] - beforeB)).toBeLessThan(0.005);
    expect(s.built.water[tileB]).toBeGreaterThan(1.5);
    // the selection's tiles (any iterable) work the same, and a dry selection takes nothing
    expect(unfedWater(s, [tileB]).pools).toBe(1);
    const dry = unfedWater(s, { x0: 0, y0: 0, x1: 2, y1: 2 });
    expect(dry.pools).toBe(0);
    expect(dry.op).toBeNull();
    // the first pit can be filled again: a later Fill keeps its water
    const again = planFill(s, a.at[0], a.at[1], a.level);
    expect(again.reason).toBeNull();
    expect(s.apply(again.op!).errors).toEqual([]);
    expect(s.built.water[tileA]).toBeGreaterThan(1.5);
    s.undo();
    s.undo();
    expect(s.built.water[tileA]).toBeGreaterThan(0.5);
  });

  it("shows at once in the editor's live water, before the water settles again", () => {
    const live = MapSession.open(decodeProject(s.project()));
    live.setWaterMode("defer");
    const [a] = pits;
    const tileA = a.at[1] * N + a.at[0];
    const take = unfedWater(live, [tileA]);
    expect(take.pools).toBe(1);
    expect(live.apply(take.op!).errors).toEqual([]);
    expect(live.waterStale).toBe(true);
    expect(live.built.water[tileA]).toBe(0);
    live.settleCanonical();
    expect(live.built.water[tileA]).toBe(0);
    const fill = planFill(live, a.at[0], a.at[1], a.level);
    expect(live.apply(fill.op!).errors).toEqual([]);
    expect(live.built.water[tileA]).toBe(2);
  });

  it("the same edits give the same file, byte for byte, every time", () => {
    const dug = session("riverValley", 7);
    const p = digPits(dug, 2);
    const start = dug.project();
    const run = () => {
      const t = MapSession.open(decodeProject(start));
      t.apply(planFill(t, p[0].at[0], p[0].at[1], p[0].level).op!);
      t.apply(planFill(t, p[1].at[0], p[1].at[1], p[1].level).op!);
      t.apply(unfedWater(t, [p[0].at[1] * N + p[0].at[0]]).op!);
      return t;
    };
    const one = run();
    const two = run();
    expect(bytesOf(two)).toEqual(bytesOf(one));
    expect(bytesOf(MapSession.open(decodeProject(one.project())))).toEqual(bytesOf(one));
  });
});
