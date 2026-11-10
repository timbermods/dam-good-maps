// Lakes by number on a generated map (core/sim/sill.ts): the Lake Basin's main lake, 192², seed 3, raised from 12 to
// 14. Its cheapest closure a level up stands far downstream; the bank is found at its outlet all the same, a ridge a
// level above the water with its spillway at 14, and the canonical settle holds the lake there.

import { describe, expect, it } from "vitest";
import { applyLakeLevel, planLakeLevel } from "../../src/core/doc/lakeLevel";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("Lakes by number on a generated map", () => {
  it("raises the Lake Basin's lake to 14 with a bank at its outlet", () => {
    const n = 192;
    const s = MapSession.fromGenerated(generate(makeSpec({ seed: 3, theme: "lakeBasin", size: { x: n, y: n } })));
    const plan = planLakeLevel(s, 129, 111, 14);
    expect(plan.reason).toBeNull();
    expect(plan.sill).toBe("raise");
    expect(plan.levels).toContain(15);
    expect(plan.levels).toContain(14);
    expect(plan.surface).toBeGreaterThanOrEqual(14);
    expect(plan.surface).toBeLessThan(15);
    expect(applyLakeLevel(s, 129, 111, 14).errors).toEqual([]);
  }, 240_000);
});
