// The wall with one gate's stage 4 (docs/PREMISES.md §5.1): its ladder on the land (`gateWorks.ts` `gateLadder`), round
// 8's rungs each standing on the land with its gain by the lake stair's measures, the works invariants
// (`GATE_WORKS_CHECKS`) on seeds 2 at 128² and 1 at 192², a hand-broken ladder or land for each, and the map card's
// words.

import { describe, expect, it } from "vitest";
import { gateFirstWater } from "../../src/core/premise/gateWater";
import { gateLand } from "../../src/core/premise/gateLand";
import { GATE_WORKS_CHECKS, gateCard, gateLadder, gateWorksFailures, type GateWorksContext } from "../../src/core/premise/gateWorks";
import { gateOf, wallGate } from "../../src/core/premise/premises/wallGate";
import { makeSpec } from "../../src/core/spec/mapspec";

const ctxOf = (seed: number, side: number): GateWorksContext => {
  const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
  const r = gateFirstWater(wallGate, spec);
  if ("reason" in r) throw new Error(r.reason);
  const heights = gateLand(r.plan, r.water).heights;
  return { plan: r.plan, water: r.water, heights, ladder: gateLadder(r.plan, r.water, heights) };
};

describe("The wall with one gate's works", () => {
  const a = ctxOf(2, 128);
  const b = ctxOf(1, 192);

  it("holds every works invariant on seed 2 at 128² and seed 1 at 192² (at 128² a rung short of its floor is said)", () => {
    expect(gateWorksFailures(a).filter((f) => f.id !== "works.paid")).toEqual([]);
    expect(gateWorksFailures(b)).toEqual([]);
  });

  it("stands each of round 8's rungs on the land, the Gate and the leat greening the basin, the megadam holding water", () => {
    for (const c of [a, b]) {
      const w = (id: string) => c.ladder.works.find((x) => x.id === id)!;
      expect(c.ladder.works.map((x) => x.id)).toEqual(["neck", "gateOpen", "gateWhole", "leatOpen", "leatWhole", "megadam"]);
      expect(w("neck").tiles.length).toBeLessThanOrEqual(3);
      expect(w("gateOpen").green).toBeGreaterThan(0.03 * c.plan.W * 2);
      expect(w("leatOpen").green).toBeGreaterThan(0.03 * c.plan.W * 2);
      expect(w("megadam").reservoir).toBeGreaterThan(0);
      expect(w("megadam").level).toBe(gateOf(c.plan)!.megadam);
    }
  });

  it("words the card: its name, the Veil and the first rung, in the map's own names", () => {
    const card = gateCard(a.plan, "riverValley", a.ladder);
    expect(card.name).toBe("Wall with one gate");
    expect(card.style).toBe("River Valley");
    expect(card.landmark).toMatch(/-level fall from a cleft in the wall into .* at the start's door/);
    expect(card.first).toMatch(/^Before the first badtide, build a levee across .*'s inlet/);
    expect(card.line).toBe(a.plan.line);
  });
});

describe("Broken gate works fail their invariants", () => {
  const base = ctxOf(2, 128);
  const g = gateOf(base.plan)!;
  const copy = (): GateWorksContext => ({ ...base, heights: Uint8Array.from(base.heights), ladder: JSON.parse(JSON.stringify(base.ladder)) });
  const work = (c: GateWorksContext, id: string) => c.ladder.works.find((x) => x.id === id)!;

  const broken: [id: string, what: string, breakIt: (c: GateWorksContext) => void][] = [
    ["works.sites", "the leat's bar with no ground", (c) => (work(c, "leatOpen").tiles = [])],
    ["works.paid", "the megadam under its floor", (c) => (work(c, "megadam").paid = false)],
    ["neck.shuts", "the Still Pool's levee built at the lake's sill less one", (c) => (work(c, "neck").level = g.sill - 1)],
    ["gate.opens", "the Gate's bar never blasted", (c) => (work(c, "gateOpen").level = g.sill + 1)],
    ["basin.dry", "the Gate's and the leat's bars and rows dug out on day 1: the river and the springs run into the basin", (c) => {
      const pool = c.plan.bodies.find((b) => b.id === g.pool)!;
      for (const i of work(c, "gateOpen").tiles) c.heights[i] = g.sill - 2;
      for (const i of work(c, "leatOpen").tiles) c.heights[i] = pool.sill - 1;
    }],
  ];

  it("has one broken case for every works invariant", () => {
    expect(broken.map(([id]) => id).sort()).toEqual(GATE_WORKS_CHECKS.map((x) => x.id).sort());
  });

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      const c = copy();
      breakIt(c);
      expect(gateWorksFailures(c).map((f) => f.id)).toContain(id);
    });
});
