// Unusual shapes beautiful (D488, custom sizes part 2): the themes' promises judged by what fits a long map,
// Lake Basin's own layouts down a long map, and the square maps left alone (their bytes are pinned by the
// golden fixtures; here, that the rules they read did not move).

import { describe, expect, it } from "vitest";
import { PROMISES, promiseSides } from "../../src/core/gen/outcomes";
import type { Signature } from "../../src/core/analysis/signature";
import { drawGenome, leanGenome } from "../../src/core/land/genome";
import { LONG_LAKE_LAYOUTS, longLakeLayout, shapeLakeBasin } from "../../src/core/land/lakeBasin";
import { smallness } from "../../src/core/land/highlands";
import { makeSpec } from "../../src/core/spec/mapspec";

const sig = (s: Partial<Signature>): Signature => ({ valley: 0, canyon: 0, canyonShare: 0, high: 0, cliffs: 0, plateaus: 0, lakeShare: 0, bigLake: 0, mouths: 0, water: 0, mainBody: 0, apart: 0, islands: 0, ...s });

describe("unusual shapes (D488)", () => {
  it("a square or nearly square map's promises read its short side, as before", () => {
    for (const [W, H] of [[96, 96], [128, 128], [256, 256], [128, 160], [200, 160]]) {
      const side = Math.min(W, H);
      expect(promiseSides(W, H)).toEqual({ across: side, course: side, area: side });
    }
    expect(smallness(96, 96)).toBe(1);
    expect(smallness(112, 112)).toBe(0.5);
    expect(smallness(128, 150)).toBe(0);
  });

  it("a thin Canyon walled for a real stretch, and a thin Highlands of tall benches, keep their promise", () => {
    // (48×256 seeds 1 and 2 before: walled for 119 and 155 tiles of courses meandering 590 tiles, judged
    // against the 48-tile side's line of a third of the course)
    expect(PROMISES.canyon.holds(sig({ canyon: 119, canyonShare: 0.201 }), 48, 256)).toBe(true);
    expect(PROMISES.canyon.holds(sig({ canyon: 155, canyonShare: 0.279 }), 48, 256)).toBe(true);
    // (a few walled tiles is no canyon on any shape)
    expect(PROMISES.canyon.holds(sig({ canyon: 7, canyonShare: 0.117 }), 48, 256)).toBe(false);
    expect(PROMISES.highlands.holds(sig({ high: 0.65, plateaus: 8, cliffs: 0.12 }), 48, 256)).toBe(true);
    // (the valley is read across the river: a strip's narrow side still)
    expect(PROMISES.riverValley.holds(sig({ valley: 0.35 }), 48, 256)).toBe(true);
    expect(PROMISES.riverValley.holds(sig({ valley: 0.25 }), 48, 256)).toBe(false);
  });

  it("a long Lake Basin draws every layout across seeds, its lakes spread along its length", () => {
    const seen = new Set<string>();
    const along: number[] = [];
    for (let seed = 1; seed <= 24; seed++) {
      const layout = longLakeLayout(seed, 0, 0);
      expect(LONG_LAKE_LAYOUTS).toContain(layout);
      seen.add(layout);
      const settings = makeSpec({ seed, theme: "lakeBasin", size: { x: 48, y: 256 } }).settings;
      const g = drawGenome("lakeBasin", seed, 48, 256, 0);
      leanGenome(g, settings, 48, 256, seed, 0, "normal");
      shapeLakeBasin(g, settings, 48, 256, seed, 0, "normal");
      const lakes = g.parts.filter((p) => p.kind === "basin");
      if (layout === "steps") expect(lakes.length, `seed ${seed} steps`).toBeGreaterThanOrEqual(2);
      else expect(lakes.length, `seed ${seed} ${layout}`).toBe(layout === "pair" ? 2 : 1);
      for (const p of g.parts) if (p.kind === "isle") expect(p.at[0] >= 0.1 && p.at[0] <= 0.9, `seed ${seed}: a hollow inside the strip`).toBe(true);
      along.push(g.focus[1]);
      expect(g.tiltKind).toBe("radial");
    }
    expect(seen.size).toBe(LONG_LAKE_LAYOUTS.length);
    // (the lowest lake anywhere from near one end to near the other, not the middle every time)
    expect(Math.min(...along)).toBeLessThan(0.3);
    expect(Math.max(...along)).toBeGreaterThan(0.7);
  });
});
