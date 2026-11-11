// The premise model's stage 2, relief between (docs/PREMISES.md §2.2, build step 3): the land round stage 1's water
// keeps every tile stage 1 fixed and stands every other tile at least at its guard, and the map it makes through the
// generator's own build passes the checks a premise map's ground must (no built dam wall, no edge wall, the start
// dry and level), its permanent badwater source in a niche out of every other source's flow.

import { describe, expect, it } from "vitest";
import { firstWater } from "../../src/core/premise/draw";
import { premiseMap } from "../../src/core/premise/map";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("Relief between (§2.2, stage 2) and the map through it", () => {
  const spec = makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any" });
  spec.premise = "lakeStair";
  const r = firstWater(lakeStair, spec);
  if ("reason" in r) throw new Error(r.reason);
  spec.settings.terrain.highestTerrain = r.plan.top;
  const m = premiseMap(spec, r.plan);
  const { W, H } = r.plan;

  it("keeps stage 1's ground and its guard", () => {
    const w = m.water.raster;
    const bypass = r.plan.links.findIndex((l) => l.kind === "bypass") + 1;
    for (let i = 0; i < W * H; i++) {
      // (the bypass's bed follows the land: it may only fall from where stage 1 laid it)
      if (w.channel[i] && w.channel[i] === bypass) expect(m.heights[i], `bypass ${i}`).toBeLessThanOrEqual(w.heights[i]);
      else if (w.fixed[i]) expect(m.heights[i], `fixed ${i}`).toBe(w.heights[i]);
    }
  });

  it("passes the ground's checks, the start's and the sources'", () => {
    for (const id of ["terrain.dam_wall", "terrain.edge_wall", "start.dry", "start.flat", "start.entrance", "water.source_in_flow", "water.settles", "water.no_flood"]) {
      const c = m.report.checks.find((k) => k.id === id);
      expect(c, id).toBeDefined();
      expect(c!.ok ? null : c!.message, id).toBeNull();
    }
    expect(m.built.entities.some((e) => e.template === "BadwaterSource")).toBe(true);
    expect(m.notes).toEqual([]);
  });
});
