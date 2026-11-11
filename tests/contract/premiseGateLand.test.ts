// The wall with one gate's stage 2 (docs/PREMISES.md §5.1): its land's invariants (`gateLand.ts` `GATE_LAND_CHECKS`) on
// seeds 1 to 4 at 128² and seed 1 at 192² and 256², and a hand-broken ground for each. The built map, its checks and
// its water settled on the land are premiseGateLand.heavy.test.ts's.

import { describe, expect, it } from "vitest";
import { gateFirstWater } from "../../src/core/premise/gateWater";
import { GATE_LAND_CHECKS, basinBeds, gateLand, gateLandFailures, gateZones, bedGround } from "../../src/core/premise/gateLand";
import { gateOf, wallGate } from "../../src/core/premise/premises/wallGate";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const spec = (seed: number, side: number): MapSpec => makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });

const landOf = (s: MapSpec) => {
  const r = gateFirstWater(wallGate, s);
  if ("reason" in r) throw new Error(r.reason);
  return { plan: r.plan, water: r.water, heights: gateLand(r.plan, r.water).heights };
};

describe("The wall with one gate's land", () => {
  for (const [side, seed] of [[128, 1], [128, 2], [128, 3], [128, 4], [192, 1], [256, 1]])
    it(`holds every land invariant: seed ${seed} at ${side}²`, () => {
      const s = spec(seed, side);
      const { plan, water, heights } = landOf(s);
      expect(gateLandFailures({ spec: s, plan, water, heights })).toEqual([]);
    });

  it("keeps every tile stage 1 fixed as stage 1 laid it, but the crest band's own rock", () => {
    const { plan, water, heights } = landOf(spec(2, 128));
    const r = water.raster;
    const { zone } = gateZones(plan);
    for (let i = 0; i < heights.length; i++) if (r.fixed[i] && zone[i] !== 1) expect(heights[i]).toBe(r.heights[i]);
  });
});

describe("Broken gate land fails its invariants", () => {
  const s = spec(2, 128);
  const base = landOf(s);
  const g = gateOf(base.plan)!;
  const { W, H } = base.plan;
  const r = base.water.raster;
  const { zone, rim } = gateZones(base.plan, g, bedGround(base.plan, base.water));
  const first = (pred: (i: number) => boolean) => {
    for (let i = 0; i < W * H; i++) if (pred(i)) return i;
    throw new Error("no such tile");
  };
  const near = (i: number, z: number) => [i - 1, i + 1, i - W, i + W].some((j) => j >= 0 && j < W * H && zone[j] === z);

  // one hand-broken ground for each land invariant, which must fail it: a drawn land always passes, so only these catch
  // an invariant that has stopped testing anything
  const broken: [id: string, what: string, breakIt: (h: Uint8Array) => void][] = [
    ["wall.faces", "a ledge two under the crest at the valley's foot", (h) => {
      const i = first((k) => zone[k] === 0 && !r.fixed[k] && near(k, 1) && Math.min(k % W, Math.floor(k / W)) > 10 && h[k - W] !== undefined);
      h[i] = g.crest - 2;
    }],
    ["wall.camera", "the crest worn down a level", (h) => {
      for (let i = 0; i < W * H; i++) if (zone[i] === 1 && h[i] === g.crest) h[i] = g.crest - 1;
    }],
    ["gate.slot", "a second gap through the wall", (h) => {
      const i = first((k) => zone[k] === 1 && !r.fixed[k] && h[k] === g.crest);
      h[i] = g.sill;
    }],
    ["basin.bowl", "a basin floor tile over the lake's sill + 1", (h) => {
      const i = first((k) => zone[k] === 2 && !rim[k] && !r.fixed[k]);
      h[i] = g.sill + 3;
    }],
    ["basin.terraces", "a floor tile within 3 of its bed stood up six over it", (h) => {
      const { dist, bed } = basinBeds(base.plan, base.water, gateZones(base.plan, g).zone);
      const i = first((k) => zone[k] === 2 && !rim[k] && !r.fixed[k] && dist[k] <= 3);
      h[i] = bed[i] + 6;
    }],
    ["valley.enclosed", "the band along the valley's edge worn down", (h) => {
      for (let i = 0; i < W * H; i++) {
        const x = i % W;
        const y = Math.floor(i / W);
        if (zone[i] === 0 && !r.fixed[i] && Math.min(x, y, W - 1 - x, H - 1 - y) < 8) h[i] = g.sill;
      }
    }],
    ["frame.lip", "the start's ground broken up for 6 tiles round it (stage 3 moves the start up to 4)", (h) => {
      const st = base.plan.frame.start;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) h[(st.y + dy) * W + st.x + dx] = st.z + ((st.x + dx + st.y + dy) & 1);
    }],
  ];

  it("has one broken ground for every land invariant", () => {
    expect(broken.map(([id]) => id).sort()).toEqual(GATE_LAND_CHECKS.map((x) => x.id).sort());
  });

  for (const [id, what, breakIt] of broken)
    it(`${id}: ${what}`, () => {
      const h = Uint8Array.from(base.heights);
      breakIt(h);
      expect(gateLandFailures({ spec: s, plan: base.plan, water: base.water, heights: h }).map((f) => f.id)).toContain(id);
    });
});
