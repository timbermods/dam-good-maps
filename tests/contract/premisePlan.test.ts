// The premise model's stage 0 (docs/PREMISES.md §2.2, build step 1): the first frame's arithmetic from the opening
// camera, the lake stair's eligibility, its plans on a few seeds of each size holding every `plan` invariant, seeds
// varying its structure, broken plans failing, and the hand-built Four Lakes as a plan. The 600 plans of seeds 1 to
// 200 are premisePlan.heavy.test.ts's.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { frameAt, openingCamera } from "../../src/core/analysis/opening";
import { failing, firstPlan } from "../../src/core/premise/draw";
import { FRAME, frameCoefficients, frameLimit } from "../../src/core/premise/frame";
import { lakeStair, lakeStairEligible } from "../../src/core/premise/premises/lakeStair";
import type { PremisePlan } from "../../src/core/premise/types";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const spec = (seed: number, side: number, edit?: (s: MapSpec) => void): MapSpec => {
  const s = makeSpec({ seed, size: { x: side, y: side }, theme: "any" });
  s.premise = "lakeStair";
  edit?.(s);
  return s;
};

const planOf = (s: MapSpec): PremisePlan => {
  const r = firstPlan(lakeStair, s);
  if ("reason" in r) throw new Error(r.reason);
  return r.plan;
};

const fails = (s: MapSpec, plan: PremisePlan) => failing(lakeStair.invariants, "plan", { spec: s, plan }).map((f) => f.id);

describe("The first frame's arithmetic (§4.3)", () => {
  it("has the coefficients 0.4342, 0.577 and 1.0788 at the frame's top edge", () => {
    const c = frameCoefficients();
    expect(c.reach).toBeCloseTo(0.4342, 3);
    expect(c.run).toBeCloseTo(0.577, 3);
    expect(c.perLevel).toBeCloseTo(1.0788, 3);
  });

  it("gives the hand-built map's two measured limits: 5.3 from a start on 7, 9.5 from a balcony on 11", () => {
    expect(frameLimit(7, 14.3)).toBeCloseTo(5.31, 2);
    expect(frameLimit(11, 14.3)).toBeCloseTo(9.47, 2);
  });

  it("gives 7.6, 6.5 and 5.5 for a landmark of 6, 7 and 8 from a bench one over its lake", () => {
    const F = 6;
    expect(frameLimit(F + 1, F + 6 + FRAME.overLip)).toBeCloseTo(7.6, 0);
    expect(frameLimit(F + 1, F + 7 + FRAME.overLip)).toBeCloseTo(6.5, 0);
    expect(frameLimit(F + 1, F + 8 + FRAME.overLip)).toBeCloseTo(5.5, 0);
  });

  it("puts a point at the limit on the frame's top edge in the opening camera, at every turn", () => {
    for (const orientation of ["Cw0", "Cw90", "Cw180", "Cw270"] as const) {
      const start = { x: 60, y: 60, z: 9, orientation };
      const cam = openingCamera(start);
      const h = 17.3;
      const a = frameLimit(start.z, h);
      const p = frameAt(cam, start.x + 0.5 + a * cam.look[0], start.y + 0.5 + a * cam.look[1], h);
      expect(p!.v).toBeCloseTo(FRAME.vTop, 6);
    }
  });
});

describe("The lake stair's eligibility (§4.1, §1.3)", () => {
  it("draws on squares of 128 to 256 with the default settings", () => {
    for (const side of [128, 192, 256]) expect(lakeStairEligible(spec(1, side))).toBeNull();
  });

  it("refuses with one line where a setting or size contradicts it", () => {
    const why = (s: MapSpec) => lakeStairEligible(s);
    expect(why(spec(1, 96))).toMatch(/at least 128/);
    expect(why(spec(1, 320))).toMatch(/up to 256/);
    const oblong = makeSpec({ seed: 1, size: { x: 192, y: 160 }, theme: "any" });
    expect(why(oblong)).toMatch(/square/);
    expect(why(spec(1, 192, (s) => (s.settings.start.easyStart = true)))).toMatch(/Easy start/);
    expect(why(spec(1, 192, (s) => (s.settings.water.lakes = "none")))).toMatch(/Lakes is None/);
    expect(why(spec(1, 192, (s) => (s.settings.water.waterfalls = "off")))).toMatch(/Waterfalls is Off/);
    expect(why(spec(1, 192, (s) => (s.settings.water.sources = "none")))).toMatch(/Sources is None/);
    for (const s of [spec(1, 96), spec(1, 192, (x) => (x.settings.water.lakes = "none"))]) expect(firstPlan(lakeStair, s)).toHaveProperty("reason");
  });
});

describe("The lake stair's plans", () => {
  it("hold every plan invariant on seeds 1 to 6 at 128², 192² and 256²", () => {
    for (const side of [128, 192, 256])
      for (let seed = 1; seed <= 6; seed++) {
        const s = spec(seed, side);
        const plan = planOf(s);
        expect(fails(s, plan), `seed ${seed} at ${side}²`).toEqual([]);
        expect([6, 7]).toContain(plan.stair!.H);
      }
  });

  it("are the same plan for the same seed", () => {
    const s = spec(5, 192);
    expect(JSON.stringify(planOf(s))).toBe(JSON.stringify(planOf(spec(5, 192))));
  });

  it("vary in structure from seed to seed (§4.4: n and f, the valley, the start's lake, the landmark's source, the bypass)", () => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const plan = planOf(spec(seed, 192));
      const st = plan.stair!;
      const by = plan.links.find((l) => l.id === st.bypass)!;
      keys.add(`${st.f} ${st.shape} ${st.startLake} ${st.H} ${st.landmarkSource} ${by.to === st.gorge || by.to === "exit" ? "gorge" : "edge"}`);
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });
});

describe("Broken plans fail their invariants", () => {
  const s = spec(2, 192);
  const good = planOf(s);
  const copy = (): PremisePlan => JSON.parse(JSON.stringify(good));

  it("a landmark of 8", () => {
    const plan = copy();
    const lm = plan.links.find((l) => l.id === plan.frame.landmark)!;
    plan.stair!.H = 8;
    lm.fall!.height = 8;
    lm.fall!.crest += 1;
    expect(fails(s, plan)).toContain("stair.levels");
  });

  it("two bodies on top of each other", () => {
    const plan = copy();
    const tarn = plan.bodies.find((b) => b.kind === "tarn")!;
    const lake = plan.bodies.find((b) => b.kind === "lake")!;
    tarn.arms = [[[lake.arms[0][0][0], lake.arms[0][0][1], 4]]];
    expect(fails(s, plan)).toContain("plan.overlap");
  });

  it("a lip past the frame's top edge", () => {
    const plan = copy();
    const lm = plan.links.find((l) => l.id === plan.frame.landmark)!;
    const look = openingCamera(plan.frame.start).look;
    lm.fall!.lip = lm.fall!.lip.map(([x, y]) => [x + 3 * look[0], y + 3 * look[1]]) as [[number, number], [number, number]];
    expect(fails(s, plan)).toContain("frame.lip");
  });

  it("a gate left off, so the open bypass still leaves the badtide a way down the stair", () => {
    const plan = copy();
    plan.links.find((l) => l.id === plan.stair!.neck)!.gates = [];
    expect(fails(s, plan)).toContain("premise.graph");
  });

  it("a spring tarn whose run meets a lake", () => {
    const plan = copy();
    const run = plan.links.find((l) => l.kind === "brook" && l.wet && plan.exits.some((e) => e.id === l.to))!;
    run.to = plan.stair!.lakes[0];
    expect(fails(s, plan)).toContain("springs.side");
  });
});

describe("Four Lakes as a plan (tests/fixtures/four-lakes.plan.json)", () => {
  it("holds every plan invariant of the lake stair", () => {
    const plan = JSON.parse(readFileSync("tests/fixtures/four-lakes.plan.json", "utf8")) as PremisePlan;
    const s = makeSpec({ seed: plan.seed, size: { x: plan.W, y: plan.H }, theme: "any" });
    s.premise = "lakeStair";
    s.settings.terrain.highestTerrain = plan.top;
    expect(fails(s, plan)).toEqual([]);
    expect(plan.stair).toMatchObject({ n: 4, f: 4, startLake: "lake1", H: 7, landmarkSource: "pool" });
  });
});
