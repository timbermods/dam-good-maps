// The wall with one gate's stage 1 (docs/PREMISES.md §5.1, §2.2): its water by number on the shared stage with the
// gate's own additions (the leat's bar, the Veil's foot, the first frame's beds), every `land` invariant on seeds 1 to 6
// at each size, the lake's floor by the drought it must last, the Still Pool read as a backwater, and a broken raster
// failing each of the gate's own `land` invariants. Settling the water as the game plays it is
// premiseGateWater.heavy.test.ts's.

import { describe, expect, it } from "vitest";
import { failing } from "../../src/core/premise/draw";
import { FRAME_DEEP, frameShallow, gateFirstWater, gateWater, GATE_WATER_CHECKS } from "../../src/core/premise/gateWater";
import { holdDeep } from "../../src/core/premise/levels";
import { gateOf, wallGate } from "../../src/core/premise/premises/wallGate";
import type { PremisePlan } from "../../src/core/premise/types";
import type { StageWater } from "../../src/core/premise/water";
import { WATER_CHECKS } from "../../src/core/premise/waterChecks";
import { hazardDays } from "../../src/core/sim/weather";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const spec = (seed: number, side: number): MapSpec => makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });

const first = (s: MapSpec): { plan: PremisePlan; water: StageWater } => {
  const r = gateFirstWater(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  return r;
};

const landFails = (s: MapSpec, plan: PremisePlan, water: StageWater) => failing(wallGate.invariants, "land", { spec: s, plan, water }).map((f) => f.id);

describe("The wall with one gate's water by number", () => {
  it("holds every land invariant on seeds 1 to 6 at 128², 192² and 256²", () => {
    for (const side of [128, 192, 256])
      for (let seed = 1; seed <= 6; seed++) {
        const s = spec(seed, side);
        const r = gateFirstWater(wallGate, s);
        if ("reason" in r) throw new Error(`seed ${seed} at ${side}²: ${r.reason}`);
        expect(landFails(s, r.plan, r.water), `seed ${seed} at ${side}²`).toEqual([]);
      }
  });

  it("lays the lake's floor by the drought it must last, and the cleft and the Still Pool a level deep", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      const s = makeSpec({ seed: 3, size: { x: 128, y: 128 }, theme: "any", premise: "any", designedFor: d });
      const { plan } = first(s);
      const b = (id: string) => plan.bodies.find((x) => x.id === id)!;
      expect(b("lake").deep).toBe(Math.min(b("lake").sill - 3, holdDeep(false, hazardDays(d, "drought"))));
      expect(b("pool").deep).toBe(1);
      expect(b("kettle").deep).toBe(1);
    }
  });

  it("bars the Gate a level over the lake's sill and the leat two over its bed, up to their rows", () => {
    const { plan, water } = first(spec(2, 192));
    const g = gateOf(plan)!;
    const r = water.raster;
    for (const [id, level] of [[g.gate, g.bar.level], [g.leat, g.leatBar]] as const) {
      const li = plan.links.findIndex((l) => l.id === id) + 1;
      const row = r.rows[id][0];
      const end = Math.min(...row.map((i) => r.along[i]));
      const head: number[] = [];
      for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li && r.along[i] >= 0 && r.along[i] < end) head.push(r.heights[i]);
      expect(head.length, `${id}'s head`).toBeGreaterThan(0);
      expect(Math.min(...head), `${id}'s bar`).toBeGreaterThanOrEqual(level);
    }
  });

  it("keeps the first frame's water under two (§5.1), but for the row that carries the fall to the drain", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { plan, water } = first(spec(seed, 128));
      const f = frameShallow(plan, water);
      expect(f.all).toBeGreaterThan(50);
      expect(f.shallow / f.all).toBeGreaterThanOrEqual(0.85);
    }
    expect(FRAME_DEEP).toBeLessThan(2);
  });

  it("reads the Still Pool as a backwater at its lake's level, where the shared check reads a pond at its rim", () => {
    const s = spec(1, 128);
    const { plan, water } = first(s);
    const shared = WATER_CHECKS.find((x) => x.id === "water.levels")!.test({ spec: s, plan, water });
    expect(shared.ok).toBe(false);
    if (!shared.ok) expect(shared.reason).toMatch(/kettle .* its rim 8/);
    expect(GATE_WATER_CHECKS.find((x) => x.id === "water.levels")!.test({ spec: s, plan, water }).ok).toBe(true);
  });
});

describe("Broken gate water fails its invariants", () => {
  const s = spec(2, 128);
  const { plan } = first(s);
  const fresh = () => gateWater(plan);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const g = gateOf(plan)!;

  const broken: [id: string, what: string, breakIt: (w: StageWater) => void][] = [
    ["water.levels", "the Low River's lip raised two over the lake's sill", (w) => {
      for (const i of w.raster.lips[g.low]) w.raster.heights[i] += 2;
    }],
    ["gate.dry", "the Gate's bar and rows dug to the slot's floor", (w) => {
      const r = w.raster;
      for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li(g.gate) && r.along[i] >= 0 && r.along[i] < 8) r.heights[i] = g.sill - 2;
      r.rows[g.gate] = [];
    }],
    ["frame.water", "the plunge pool's beds dug four under its sill", (w) => {
      const r = w.raster;
      const door = plan.bodies.findIndex((b) => b.id === g.door) + 1;
      for (let i = 0; i < r.W * r.H; i++) if (r.lake[i] === door && !r.crest[i]) r.heights[i] = g.sill - 3;
    }],
  ];

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      const w = fresh();
      breakIt(w);
      expect(landFails(s, plan, w)).toContain(id);
    });
});
