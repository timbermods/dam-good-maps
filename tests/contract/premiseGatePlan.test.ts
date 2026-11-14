// The wall with one gate's stage 0 (docs/PREMISES.md §5.1; its range, gap and basin since planning's ruling of
// 2026-11-11): its eligibility, its plans on seeds
// of each size holding every `plan` invariant, the seed varying its structure, a broken plan for every `plan`
// invariant, and the premise kept out of the players' choices until it makes a whole map.

import { describe, expect, it } from "vitest";
import { openingCamera } from "../../src/core/analysis/opening";
import { failing, firstPlan } from "../../src/core/premise/draw";
import { resolvePremise } from "../../src/core/premise/choice";
import { PREMISES } from "../../src/core/premise/premises";
import { DEV_PREMISES } from "../../src/core/premise/premises/dev";
import { GATE_ID, gateOf, wallGate, wallGateEligible } from "../../src/core/premise/premises/wallGate";
import type { PremisePlan } from "../../src/core/premise/types";
import { makeSpec, PREMISE_CHOICES, PREMISE_IDS, type MapSpec } from "../../src/core/spec/mapspec";

// a premise map's spec takes the premises' preset (Highest terrain 22): the range's peak stands at 18 or more
const spec = (seed: number, side: number, edit?: (s: MapSpec) => void): MapSpec => {
  const s = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
  edit?.(s);
  return s;
};

const planOf = (s: MapSpec): PremisePlan => {
  const r = firstPlan(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  return r.plan;
};

const fails = (s: MapSpec, plan: PremisePlan) => failing(wallGate.invariants, "plan", { spec: s, plan }).map((f) => f.id);

describe("The wall with one gate is not offered yet", () => {
  it("is in the dev list only: not a premise id, a choice, a library entry, or what Any resolves to", () => {
    expect(DEV_PREMISES[GATE_ID]).toBe(wallGate);
    expect(PREMISE_IDS as readonly string[]).not.toContain(GATE_ID);
    expect(PREMISE_CHOICES as readonly string[]).not.toContain(GATE_ID);
    expect(Object.keys(PREMISES)).not.toContain(GATE_ID);
    for (let seed = 1; seed <= 20; seed++) expect(resolvePremise({ seed, theme: "any", premise: "any" })).not.toMatchObject({ premise: GATE_ID });
  });
});

describe("The wall with one gate's eligibility", () => {
  it("draws on squares of 128 to 256 with the premises' preset", () => {
    for (const side of [128, 192, 256]) expect(wallGateEligible(spec(1, side))).toBeNull();
  });

  it("refuses with one line where a setting or size contradicts it", () => {
    const why = (s: MapSpec) => wallGateEligible(s);
    expect(why(spec(1, 96))).toMatch(/at least 128/);
    expect(why(spec(1, 320))).toMatch(/up to 256/);
    expect(why(makeSpec({ seed: 1, size: { x: 192, y: 160 }, theme: "any", premise: "any" }))).toMatch(/square/);
    expect(why(spec(1, 192, (s) => (s.settings.start.easyStart = true)))).toMatch(/Easy start/);
    expect(why(spec(1, 192, (s) => (s.settings.water.lakes = "none")))).toMatch(/Lakes is None/);
    expect(why(spec(1, 192, (s) => (s.settings.water.waterfalls = "off")))).toMatch(/Waterfalls is Off/);
    expect(why(spec(1, 192, (s) => (s.settings.water.sources = "none")))).toMatch(/Sources is None/);
    expect(why(spec(1, 192, (s) => (s.settings.terrain.highestTerrain = 16)))).toMatch(/too low for the wall/);
    expect(firstPlan(wallGate, spec(1, 96))).toHaveProperty("reason");
  });
});

describe("The wall with one gate's plans", () => {
  it("hold every plan invariant on seeds 1 to 24 at 128², 192² and 256²", () => {
    for (const side of [128, 192, 256])
      for (let seed = 1; seed <= 24; seed++) {
        const s = spec(seed, side);
        const plan = planOf(s);
        expect(fails(s, plan), `seed ${seed} at ${side}²`).toEqual([]);
        expect(plan.premise as string).toBe(GATE_ID);
      }
  });

  it("are the same plan for the same seed", () => {
    expect(JSON.stringify(planOf(spec(5, 192)))).toBe(JSON.stringify(planOf(spec(5, 192))));
  });

  it("vary in structure from seed to seed (the turn and mirror, the fall, the Low River's side, the gorge)", () => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const g = gateOf(planOf(spec(seed, 192)))!;
      keys.add(`${g.turn} ${g.mirror} ${g.drop} ${g.lowSide} ${g.slot.width}`);
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
  });
});

describe("Broken wall-with-one-gate plans fail their invariants", () => {
  const s = spec(2, 192);
  const good = planOf(s);
  const copy = (): PremisePlan => JSON.parse(JSON.stringify(good));
  const link = (plan: PremisePlan, id: string) => plan.links.find((l) => l.id === id)!;
  const body = (plan: PremisePlan, id: string) => plan.bodies.find((b) => b.id === id)!;
  const g = (plan: PremisePlan) => gateOf(plan)!;

  // one hand-broken plan for each `plan` invariant: a drawn plan always passes, so only these catch an invariant that
  // has stopped testing anything
  const broken: [id: string, what: string, breakIt: (plan: PremisePlan) => void][] = [
    ["plan.levels", "the Gate Bed rising", (plan) => {
      const bed = link(plan, "gate").bed as number[];
      bed[bed.length - 1] = bed[0] + 1;
    }],
    ["plan.floor", "the lake dug under the floor", (plan) => {
      body(plan, "lake").deep = 5;
    }],
    ["plan.overlap", "the Still Pool on the lake", (plan) => {
      const lake = body(plan, "lake");
      body(plan, "kettle").arms = [[[lake.arms[0][1][0], lake.arms[0][1][1], 3]]];
    }],
    ["plan.graph", "a brook leading nowhere", (plan) => {
      link(plan, "brook1").to = "nowhere";
    }],
    ["plan.works", "a work that needs itself", (plan) => {
      plan.works[plan.works.length - 1].needs = [plan.works[plan.works.length - 1].id];
    }],
    ["plan.skeleton", "water leaving by an edge the plan calls a ridge", (plan) => {
      plan.edges[plan.exits[0].edge] = "ridge";
    }],
    ["gate.levels", "a peak of 16", (plan) => {
      g(plan).crest = 16;
      plan.ridges.find((r) => r.id === "wall")!.top = 16;
    }],
    ["range.spine", "the range's spine drawn straight along the grid", (plan) => {
      const R = g(plan).range;
      R.v = R.v.map(() => R.v[0]);
    }],
    ["wall.camera", "the start turned away from the wall", (plan) => {
      plan.frame.start.orientation = (["Cw180", "Cw270", "Cw0", "Cw90"] as const)[g(plan).turn];
    }],
    ["valley.brooks", "a brook drawn as a sawtooth, six tiles a leg, left and right by turns", (plan) => {
      // (the longest southern brook: a short tributary has too few bends to read)
      const brooks = plan.links.filter((k) => /^brook\d/.test(k.id));
      const span = (k: (typeof brooks)[number]) => Math.hypot(k.path![k.path!.length - 1][0] - k.path![0][0], k.path![k.path!.length - 1][1] - k.path![0][1]);
      const l = brooks.reduce((x, y) => (span(y) > span(x) ? y : x));
      const [a, b] = [l.path![0], l.path![l.path!.length - 1]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.round(L / 6);
      l.path = Array.from({ length: n + 1 }, (_, k) => {
        const off = k === 0 || k === n ? 0 : k % 2 ? 2.5 : -2.5;
        return [a[0] + ((b[0] - a[0]) * k) / n - ((b[1] - a[1]) / L) * off, a[1] + ((b[1] - a[1]) * k) / n + ((b[0] - a[0]) / L) * off];
      });
      l.halves = l.path.map(() => 1.5);
      l.bed = l.path.map(() => (l.bed as number[])[0]);
    }],
    ["valley.water", "the lake drawn one width along its length", (plan) => {
      const lake = body(plan, "lake");
      lake.arms[0] = lake.arms[0].map(([x, y]) => [x, y, 6]);
    }],
    ["range.spurs", "the range's spurs all toward the valley", (plan) => {
      for (const sp of gateOf(plan)!.spurs) sp.side = 0;
    }],
    ["valley.water", "the plunge pool's brook straight into the lake, one step", (plan) => {
      const out = plan.links.find((l) => l.id === "outflow")!;
      out.to = "lake";
      plan.links = plan.links.filter((l) => l.id !== "cascade");
      plan.bodies = plan.bodies.filter((b) => b.id !== "steps");
    }],
    ["valley.water", "the plunge pool's brook four wide the whole way", (plan) => {
      const out = plan.links.find((l) => l.id === "outflow")!;
      out.path = [out.path![0], ...Array.from({ length: 4 }, (_, k) => [out.path![0][0] + 3 * (k + 1), out.path![0][1]] as [number, number])];
      out.halves = out.path.map(() => 2);
    }],
    ["valley.water", "a southern brook one width on its whole course", (plan) => {
      const b = plan.links.find((l) => l.id === "brook1")!;
      b.halves = b.path!.map(() => 1);
    }],
    ["valley.water", "a southern brook 4 and 5 wide by turns past its head", (plan) => {
      const b = plan.links.find((l) => l.id === "brook1")!;
      b.halves = b.path!.map((_, k) => (k < 2 ? 1.4 : k % 2 ? 2 : 2.5));
    }],
    ["valley.water", "a brook joining another a level and more under the other's bed there", (plan) => {
      // (a brook of its own, neither a tributary nor a trunk, its last reach at the lake's sill, marked as ending on
      // another 12 tiles down that one's course: a confluence meets at one level, two springs to a bed)
      const brooks = plan.links.filter((l) => /^brook\d/.test(l.id));
      const single = brooks.find((l) => !l.joins && !brooks.some((k) => k.joins?.link === l.id))!;
      single.joins = { link: brooks.find((l) => l !== single)!.id, at: 12 };
    }],
    ["valley.water", "the plunge pool's brook two wide", (plan) => {
      const out = plan.links.find((l) => l.id === "outflow")!;
      out.halves = out.path!.map((_, k) => (k % 2 ? 1 : 1.5));
    }],
    ["frame.lip", "a lip past the frame's top edge", (plan) => {
      const veil = link(plan, "veil");
      const look = openingCamera(plan.frame.start).look;
      veil.fall!.lip = veil.fall!.lip.map(([x, y]) => [x + 4 * look[0], y + 4 * look[1]]) as [[number, number], [number, number]];
    }],
    ["gate.gap", "a gorge 8 wide", (plan) => {
      g(plan).slot.width = 8;
      link(plan, "gate").half = 4;
    }],
    ["basin.bowl", "the playa's shoreline benches two wide", (plan) => {
      g(plan).pan.shore = 2;
    }],
    ["start.neck", "an inlet 4 wide", (plan) => {
      link(plan, "inlet").half = 2;
    }],
    ["leat.own", "the leat with no row of Blockages at its head", (plan) => {
      link(plan, "leat").rows = [];
    }],
    ["valley.enclosed", "a spur lower than the megadam's water + 3", (plan) => {
      plan.ridges.find((r) => r.id === "spur")!.top = g(plan).megadam + 2;
    }],
    ["gate.ladder", "the leat's whole share needing nothing", (plan) => {
      plan.works.find((w) => w.id === "leatWhole")!.needs = [];
    }],
    ["gate.skeleton", "a far side that is not dry for good", (plan) => {
      plan.regions.find((r) => r.role === "dry")!.dayOne = "dry";
    }],
  ];

  it("has a broken plan for every plan invariant (one or more)", () => {
    const ids = wallGate.invariants.filter((inv) => inv.at === "plan").map((inv) => inv.id);
    expect([...new Set(broken.map(([id]) => id))].sort()).toEqual([...ids].sort());
  });

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      const plan = copy();
      breakIt(plan);
      expect(fails(s, plan)).toContain(id);
    });
});
