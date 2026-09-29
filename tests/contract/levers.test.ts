// Items 24's and 47's numbers (PLAN §20 D325: computed in M9b, shown only in "The page is the
// editor"): the trees within the starting-logs floor's walk and the logs they hold, and the five
// difficulty levers, all read from the start's one walk.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { LOG_FLOOR, LOG_FLOOR_WALK } from "../../src/core/data/logFloor";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runFindVersion, runGenerate } from "../../src/worker/api";

describe("the start's numbers as data (items 24 and 47)", () => {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
  const a = r.analysis!;

  it("trees within walking reach and their logs: the floor's own count", () => {
    const floor = r.report.checks.find((c) => c.id === "start.wood_floor")!;
    expect(a.walkReach!.logs).toBe(floor.value);
    expect(a.walkReach!.logs).toBeGreaterThanOrEqual(LOG_FLOOR);
    expect(a.walkReach!.trees).toBeGreaterThan(0);
    expect(LOG_FLOOR_WALK).toBe(40);
  });

  it("the five levers, each from the checks' own numbers", () => {
    const l = a.levers!;
    expect(l.farmland).toBe(a.walkReach!.farmland);
    expect(l.buildable).toBe(a.walkReach!.level);
    expect(l.farmland).toBe(r.report.checks.find((c) => c.id === "start.farmland")!.value);
    expect(l.metal).not.toBeNull();
    expect(l.metal!).toBeGreaterThan(0);
    const bad = r.report.checks.find((c) => c.id === "start.badwater")!;
    expect(l.badwater).toBe(bad.value);
    expect(l.shelter === null || l.shelter > 0).toBe(true);
  });

  it("the worker's response carries them, for the map and for a version found in the background (#92's map card)", async () => {
    const spec = makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } });
    const resp = await runGenerate(spec);
    expect(resp.walkReach).toEqual(a.walkReach);
    expect(resp.levers).toEqual(a.levers);
    const v = await runFindVersion({ spec: resp.spec, intentions: resp.intentions, heights: resp.heights });
    if (v) {
      expect(v.walkReach).not.toBeNull();
      expect(v.levers).not.toBeNull();
      expect(v.levers!.farmland).toBe(v.walkReach!.farmland);
    }
  });
});
