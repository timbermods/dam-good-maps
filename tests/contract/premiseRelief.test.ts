// The premise model's stage 2, relief between (docs/PREMISES.md §2.2, build step 3): the land round stage 1's water
// keeps every tile stage 1 fixed (but the beds that follow the land, which only fall, with their wadis) and stands every
// other tile at least at its guard, and the map it makes through the
// generator's own build passes the checks a premise map's ground must (no built dam wall, no edge wall, the start
// dry and level), its permanent badwater source in a niche out of every other source's flow.

import { describe, expect, it } from "vitest";
import { firstWater } from "../../src/core/premise/draw";
import { premiseLand, premiseMap } from "../../src/core/premise/map";
import { followsLand } from "../../src/core/premise/raster/relief";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("Relief between (§2.2, stage 2) and the map through it", () => {
  const spec = makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any" });
  spec.premise = "lakeStair";
  const r = firstWater(lakeStair, spec);
  if ("reason" in r) throw new Error(r.reason);
  spec.settings.terrain.highestTerrain = r.plan.top;
  const land = premiseLand(r.plan);
  const m = premiseMap(spec, r.plan, land);
  const { W, H } = r.plan;

  it("keeps stage 1's ground and its guard", () => {
    const w = m.water.raster;
    // (the bypass's bed and each dry brook's follow the land: they may only fall from where stage 1 laid them, and
    // their wadi strips beside them with them; every other tile stage 1 fixed stands)
    const follows = new Set(r.plan.links.flatMap((l, k) => (followsLand(l, l.wet && !(m.water.table.links[l.id]?.shut ?? false)) ? [k + 1] : [])));
    const nearFollow = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const j = (y + dy) * W + x + dx;
          if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && follows.has(w.channel[j])) return true;
        }
      return false;
    };
    // (and a levee's basin's banks, raised a level over its beach: the works' own ground, `layWorks`)
    const banked = new Set(Object.values(land.laid.banks).flat());
    for (let i = 0; i < W * H; i++) {
      if (banked.has(i)) continue;
      if (w.channel[i] && follows.has(w.channel[i])) expect(m.heights[i], `bed ${i}`).toBeLessThanOrEqual(w.heights[i]);
      else if (w.fixed[i] && !(w.channel[i] === 0 && !w.lake[i] && nearFollow(i) && m.heights[i] < w.heights[i])) expect(m.heights[i], `fixed ${i}`).toBe(w.heights[i]);
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
