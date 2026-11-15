// The poisoned floodplain's stage 0 (docs/design/poisoned-floodplain.md §9 row 1): its eligibility, its plans on seeds
// of each size holding every `plan` invariant, the seed varying its structure, day 1's bands by the plan's arithmetic
// inside the design's, a hand-broken plan for every `plan` invariant, its diagram, and the premise kept out of the
// players' choices until it makes a whole map.

import { describe, expect, it } from "vitest";
import { openingCamera } from "../../src/core/analysis/opening";
import { resolvePremise } from "../../src/core/premise/choice";
import { planSvg } from "../../src/core/premise/diagram";
import { failing, firstPlan } from "../../src/core/premise/draw";
import { pathLength } from "../../src/core/premise/geom";
import { PREMISES } from "../../src/core/premise/premises";
import { DEV_PREMISES } from "../../src/core/premise/premises/dev";
import { PLAIN_ID, plainOf, plainOverlays, plainShares, poisonedPlain, poisonedPlainEligible } from "../../src/core/premise/premises/poisonedPlain";
import type { PremisePlan } from "../../src/core/premise/types";
import { BED_FLOOR } from "../../src/core/land/genome";
import { makeSpec, PREMISE_CHOICES, PREMISE_IDS, type MapSpec } from "../../src/core/spec/mapspec";

// a premise map's spec takes the premises' preset (Highest terrain 22)
const spec = (seed: number, side: number, edit?: (s: MapSpec) => void): MapSpec => {
  const s = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
  edit?.(s);
  return s;
};

const planOf = (s: MapSpec): PremisePlan => {
  const r = firstPlan(poisonedPlain, s);
  if ("reason" in r) throw new Error(r.reason);
  return r.plan;
};

const fails = (s: MapSpec, plan: PremisePlan) => failing(poisonedPlain.invariants, "plan", { spec: s, plan }).map((f) => f.id);

describe("The poisoned floodplain is not offered yet", () => {
  it("is in the dev list only: not a premise id, a choice, a library entry, or what Any resolves to", () => {
    expect(DEV_PREMISES[PLAIN_ID]).toBe(poisonedPlain);
    expect(PREMISE_IDS as readonly string[]).not.toContain(PLAIN_ID);
    expect(PREMISE_CHOICES as readonly string[]).not.toContain(PLAIN_ID);
    expect(Object.keys(PREMISES)).not.toContain(PLAIN_ID);
    for (let seed = 1; seed <= 20; seed++) expect(resolvePremise({ seed, theme: "any", premise: "any" })).not.toMatchObject({ premise: PLAIN_ID });
  });
});

describe("The poisoned floodplain's eligibility", () => {
  it("draws on squares of 128 to 256 with the premises' preset", () => {
    for (const side of [128, 192, 256]) expect(poisonedPlainEligible(spec(1, side))).toBeNull();
  });

  it("refuses with one line where a setting or size contradicts it", () => {
    const why = (s: MapSpec) => poisonedPlainEligible(s);
    expect(why(spec(1, 96))).toMatch(/at least 128/);
    expect(why(spec(1, 320))).toMatch(/up to 256/);
    expect(why(makeSpec({ seed: 1, size: { x: 192, y: 160 }, theme: "any", premise: "any" }))).toMatch(/square/);
    expect(why(spec(1, 192, (s) => (s.settings.hazards.badwater = "off")))).toMatch(/Badwater is Off/);
    expect(why(spec(1, 192, (s) => (s.settings.water.rivers = 0)))).toMatch(/Rivers is 0/);
    expect(why(spec(1, 192, (s) => (s.settings.terrain.highestTerrain = 8)))).toMatch(/too low/);
    expect(firstPlan(poisonedPlain, spec(1, 96))).toHaveProperty("reason");
  });
});

describe("The poisoned floodplain's plans", () => {
  it("hold every plan invariant on seeds 1 to 12 at 128², 192² and 256², with the floor and day 1's bands inside the design's", () => {
    for (const side of [128, 192, 256])
      for (let seed = 1; seed <= 12; seed++) {
        const s = spec(seed, side);
        const plan = planOf(s);
        expect(fails(s, plan), `seed ${seed} at ${side}²`).toEqual([]);
        expect(plan.premise as string).toBe(PLAIN_ID);
        // the design's §2 by the plan's arithmetic: dead 8 to 25 %, dry 30 % or more of the plain and the backswamp,
        // the floor 20 to 30 % of the map at every size
        const sh = plainShares(plan)!;
        expect(sh.floor, `floor, seed ${seed} at ${side}²`).toBeGreaterThanOrEqual(0.2);
        expect(sh.floor, `floor, seed ${seed} at ${side}²`).toBeLessThanOrEqual(0.3);
        expect(sh.dead, `dead, seed ${seed} at ${side}²`).toBeGreaterThanOrEqual(0.08);
        expect(sh.dead, `dead, seed ${seed} at ${side}²`).toBeLessThanOrEqual(0.25);
        expect(sh.dry, `dry, seed ${seed} at ${side}²`).toBeGreaterThanOrEqual(0.3);
      }
  });

  it("are the same plan for the same seed", () => {
    expect(JSON.stringify(planOf(spec(5, 192)))).toBe(JSON.stringify(planOf(spec(5, 192))));
  });

  it("vary in structure from seed to seed (the turn and mirror, the red stream's end, the Dry Fork's side)", () => {
    const keys = new Set<string>();
    const ends = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const p = plainOf(planOf(spec(seed, 192)))!;
      keys.add(`${p.turn} ${p.mirror} ${p.red.end} ${p.col.side}`);
      ends.add(p.red.end);
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
    expect([...ends].sort()).toEqual(["exit", "join"]);
  });

  it("draw as a diagram with the plain's own pieces and the red water in red", () => {
    const plan = planOf(spec(1, 128));
    const svg = planSvg(plan, 4, plainOverlays(plan));
    expect(svg).toContain("#c0392b");
    for (const words of ["search window", "dead band", "slough", "levee"]) expect(svg).toContain(words);
  });
});

describe("Broken poisoned-floodplain plans fail their invariants", () => {
  const s = spec(2, 192);
  const good = planOf(s);
  // (a seed whose red stream joins the river, and one whose red stream leaves by its own exit)
  const byEnd = (end: "join" | "exit") => {
    for (let seed = 1; seed <= 24; seed++) {
      const sp = spec(seed, 192);
      const plan = planOf(sp);
      if (plainOf(plan)!.red.end === end) return { sp, plan };
    }
    throw new Error(`no ${end} in 24 seeds`);
  };
  const joined = byEnd("join");
  const own = byEnd("exit");
  const copy = (plan: PremisePlan = good): PremisePlan => JSON.parse(JSON.stringify(plan));
  const link = (plan: PremisePlan, id: string) => plan.links.find((l) => l.id === id)!;
  const body = (plan: PremisePlan, id: string) => plan.bodies.find((b) => b.id === id)!;
  const p = (plan: PremisePlan) => plainOf(plan)!;

  // one hand-broken plan for each `plan` invariant: a drawn plan always passes, so only these catch an invariant that
  // has stopped testing anything
  const broken: [id: string, what: string, breakIt: (plan: PremisePlan) => void, base?: () => { sp: MapSpec; plan: PremisePlan }][] = [
    ["plan.levels", "the river's bed rising to its exit", (plan) => {
      const bed = link(plan, "river").bed as number[];
      bed[bed.length - 1] = bed[0] + 1;
    }],
    ["plan.floor", "the Red Fall's pool dug under the floor", (plan) => {
      // (its bed dug a level under the floor, wherever the backswamp stands)
      const pool = body(plan, "redPool");
      pool.deep = pool.sill - BED_FLOOR + 1;
    }],
    ["plan.overlap", "the Red Fall's pool on the Red Spring", (plan) => {
      body(plan, "redPool").arms = JSON.parse(JSON.stringify(body(plan, "redSpring").arms));
    }],
    ["plan.graph", "the red stream leading nowhere", (plan) => {
      link(plan, "red").to = "nowhere";
    }],
    ["plan.works", "a work that needs itself", (plan) => {
      plan.works[0].needs = [plan.works[0].id];
    }],
    ["plan.skeleton", "water leaving by an edge the plan calls a ridge", (plan) => {
      plan.edges[plan.exits[0].edge] = "ridge";
    }],
    ["plain.levels", "the plain-side levee's crest one height the whole way", (plan) => {
      const lv = p(plan).levee;
      lv.plain = [{ from: lv.from, to: lv.to, over: 1 }];
    }],
    ["plain.levels", "the col a level over the narrows' floor", (plan) => {
      p(plan).col.level = p(plan).gulch.narrows.floor + 1;
    }],
    ["plain.levels", "the terrace a level over the plain", (plan) => {
      p(plan).terraceLevel = p(plan).L + 1;
    }],
    ["plain.levels", "a straight step for a riser", (plan) => {
      p(plan).risers[0].amp = 0;
    }],
    ["plain.width", "the far wall's foot drawn in by 0.4 of P", (plan) => {
      p(plan).far = p(plan).far.map((v) => v - 0.4 * p(plan).P);
    }],
    ["plain.width", "a corridor: the valley turned onto the grid", (plan) => {
      p(plan).angle = 0;
    }],
    ["wall.wanders", "a straight far wall: its foot ruled from end to end", (plan) => {
      const far = p(plan).far;
      const n = far.length - 1;
      p(plan).far = far.map((_, k) => far[0] + ((far[n] - far[0]) * k) / n);
    }],
    ["wall.wanders", "a straight near wall: its foot laid on the valley's axis", (plan) => {
      p(plan).near = [...p(plan).axis];
    }],
    ["plain.width", "a plain of 25", (plan) => {
      p(plan).P = 25;
    }],
    ["plain.width", "no dead band on day 1 (the red stream said to leave the backswamp at the Red Fall's foot)", (plan) => {
      p(plan).red.swampTo = p(plan).gulch.mouth;
    }, () => own],
    ["stream.join", "the red stream joining the river halfway along it", (plan) => {
      const red = link(plan, "red");
      red.joins!.at = pathLength(link(plan, "river").path!) / 2;
    }, () => joined],
    ["stream.join", "a red stream said to leave by its own exit that joins the river", (plan) => {
      link(plan, "red").joins = { link: "river", at: pathLength(link(plan, "river").path!) * 0.8 };
    }, () => own],
    ["start.badwater", "the start on the plain, not on its terrace", (plan) => {
      plan.frame.start.z = p(plan).L;
    }],
    ["start.badwater", "the search window starting beside the start", (plan) => {
      p(plan).window.from = p(plan).terrace[1];
    }],
    ["frame.fall", "the Red Fall's lip 40 tiles further along the camera's look", (plan) => {
      const fall = link(plan, "redFall").fall!;
      const look = openingCamera(plan.frame.start).look;
      fall.lip = fall.lip.map(([x, y]) => [x + 40 * look[0], y + 40 * look[1]]) as [[number, number], [number, number]];
    }],
    ["poisoned.ladder", "the turn a dam of 8 tiles", (plan) => {
      plan.works.find((w) => w.id === "turn")!.tiles = 8;
    }],
    ["poisoned.ladder", "the river in needing the turn", (plan) => {
      plan.works.find((w) => w.id === "riverIn")!.needs = ["turn"];
    }],
  ];

  it("has a broken plan for every plan invariant (one or more)", () => {
    const ids = poisonedPlain.invariants.filter((inv) => inv.at === "plan").map((inv) => inv.id);
    expect([...new Set(broken.map(([id]) => id))].sort()).toEqual([...ids].sort());
  });

  for (const [id, what, breakIt, base] of broken)
    it(`${id}: ${what}`, () => {
      const { sp, plan: from } = base ? base() : { sp: s, plan: good };
      expect(fails(sp, from)).toEqual([]);
      const plan = copy(from);
      breakIt(plan);
      expect(fails(sp, plan)).toContain(id);
    });
});
