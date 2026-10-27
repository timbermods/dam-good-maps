// The Floor (PLAN §20 D321, item 40; core/forces/floor.ts, lifted from Erode round 6): every force
// that digs keeps to it. Nothing a force does goes below it; where it would, the result runs
// shallower there instead of stopping; ground already below it is left as it is. 1 by default, a
// whole level up to the ceiling; its operation keeps it, and the schema and the engine agree.

import { describe, expect, it } from "vitest";
import { DEFAULTS as CARVE_DEFAULTS, CarveRun } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { FLOOR_DEFAULT, floorProblem, forceFloor, holdAtFloor } from "../../src/core/forces/floor";
import { snapshotMap } from "../../src/core/forces/force";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { GlaciateRun } from "../../src/core/forces/glaciate/run";
import { forceSettingsProblems } from "../../src/core/forces/op";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { CraterRun, EruptRun, QuakeRun } from "../../src/core/forces/runs";
import { CEILING } from "../../src/core/format/world";
import { fixture } from "./forceFixtures";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { study } from "./carveFixtures";

/** No tile below `floor` that wasn't already, and how many tiles the force changed. */
function keptTo(before: ArrayLike<number>, after: ArrayLike<number>, floor: number): { below: number; changed: number } {
  let below = 0;
  let changed = 0;
  for (let i = 0; i < after.length; i++) {
    if (after[i] !== before[i]) changed++;
    if (after[i] < Math.min(before[i], floor)) below++;
  }
  return { below, changed };
}

describe("the Floor (D321, item 40)", () => {
  it("1 by default; a whole level from 1 to the ceiling; the rule holds a lowered tile at it, never raising ground already below", () => {
    expect(forceFloor({})).toBe(FLOOR_DEFAULT);
    expect(FLOOR_DEFAULT).toBe(1);
    expect(forceFloor({ floor: 4 })).toBe(4);
    expect(forceFloor({ floor: 99 })).toBe(CEILING);
    expect(floorProblem(undefined)).toBeNull();
    expect(floorProblem(3)).toBeNull();
    expect(floorProblem(0)).not.toBeNull();
    expect(floorProblem(2.5)).not.toBeNull();
    expect(floorProblem(CEILING + 1)).not.toBeNull();
    const before = Uint8Array.from([5, 5, 1, 0, 8]);
    const after = Uint8Array.from([2, 6, 0, 0, 3]);
    expect(holdAtFloor(before, after, 3)).toBe(2);
    expect(Array.from(after)).toEqual([3, 6, 1, 0, 3]);
    expect(forceSettingsProblems("quake", { ...QUAKE_DEFAULTS, floor: 4 })).toEqual([]);
    expect(forceSettingsProblems("quake", { ...QUAKE_DEFAULTS, floor: 0 }).length).toBe(1);
  });

  it("Craterize, Erupt, Quake and Glaciate keep to it, running shallower where it stops them, never stopping", () => {
    const m = fixture("river", 96);
    const at = 48 * 96 + 30;
    const path = [{ x: 4, y: 40 }, { x: 91, y: 52 }];
    const cases: [string, (floor: number | undefined) => { final(): { heights: Uint8Array } | null; finishAll(): unknown }][] = [
      ["craterize", (floor) => new CraterRun(snapshotMap(m), { ...CRATER_DEFAULTS, power: 100, floor }, { origin: at })],
      ["erupt", (floor) => new EruptRun(snapshotMap(m), { ...ERUPT_DEFAULTS, power: 90, summit: "caldera", floor }, { origin: at })],
      ["quake lift", (floor) => new QuakeRun(snapshotMap(m), { ...QUAKE_DEFAULTS, power: 100, floor }, { side: -1, path })],
      ["quake slide", (floor) => new QuakeRun(snapshotMap(m), { ...QUAKE_DEFAULTS, mode: "slide", power: 100, floor }, { side: 1, path })],
      ["glaciate", (floor) => new GlaciateRun(snapshotMap(m), { ...GLACIATE_DEFAULTS, power: 100, floor }, { origin: 10 * 96 + 60 })],
    ];
    let tried = 0;
    for (const [name, make] of cases) {
      const deep = make(undefined);
      deep.finishAll();
      const d = deep.final()!.heights;
      // the deepest it goes on its own, and a Floor above that
      let low = 99;
      for (let i = 0; i < d.length; i++) if (d[i] < m.heights[i]) low = Math.min(low, d[i]);
      if (low === 99) continue;
      tried++;
      const floor = Math.min(CEILING, low + 2);
      const held = make(floor);
      held.finishAll();
      const h = held.final()!.heights;
      const r = keptTo(m.heights, h, floor);
      expect(r.below, name).toBe(0);
      expect(r.changed, name).toBeGreaterThan(0);
      expect(keptTo(m.heights, d, 1).below, `${name} at the default floor`).toBe(0);
    }
    expect(tried).toBeGreaterThanOrEqual(4);
  });

  it("Carve keeps to it: its river runs shallower along it, and carries on", () => {
    const m = study("mountain", 96);
    const W = 96;
    const run = (floor?: number) => {
      const r = new CarveRun(m, { ...CARVE_DEFAULTS, power: 100, width: 10, floor }, { origin: 88 * W + 48 });
      while (!r.done) r.step();
      return r;
    };
    const deep = run();
    let low = 99;
    for (let i = 0; i < m.heights.length; i++) if (deep.map.heights[i] < m.heights[i]) low = Math.min(low, deep.map.heights[i]);
    const floor = low + 3;
    const held = run(floor);
    const r = keptTo(m.heights, held.map.heights, floor);
    expect(r.below).toBe(0);
    expect(r.changed).toBeGreaterThan(50);
    // it still ran its course (it never stopped at the floor)
    expect(held.metrics.distance).toBeGreaterThan(deep.metrics.distance * 0.5);
    expect(() => new CarveRun(m, { ...CARVE_DEFAULTS, floor: 0 }, { origin: 88 * W + 48 })).toThrow();
  });

  it("its operation keeps it when it isn't 1; Try another takes the row's Floor now (back at 1: none in the record)", async () => {
    await runGenerate(makeSpec({ seed: 4242, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const last = () => MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    const keep = () => {
      for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
      const r = ed.forceStop();
      expect(r.errors).toEqual([]);
    };
    expect(ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 40, floor: 3 }, origin: [30, 60], cut: null, natural: true }).errors).toEqual([]);
    keep();
    expect((last().settings as { floor?: number }).floor).toBe(3);
    expect(ed.forceAgain({ walls: null, centre: null, debris: null, rays: null, floor: undefined }).errors).toEqual([]);
    keep();
    expect("floor" in last().settings).toBe(false);
    expect(ed.forceAgain({ walls: null, centre: null, debris: null, rays: null, floor: 5 }).errors).toEqual([]);
    keep();
    expect((last().settings as { floor?: number }).floor).toBe(5);
    ed.settleWater();
  });
});
