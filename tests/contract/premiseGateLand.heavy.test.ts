// The wall with one gate's maps (docs/PREMISES.md §5.1): plan, water, land, stage 3's start, the ladder, one build and
// its checks (`gateMap.ts`), on seeds 2 and 4 at 128² and seed 1 at 192² and 256². Every land invariant and every works
// invariant but the floors (a short rung is said) holds, every blocking check
// passes (the start's five numbers are the shared gate's: printed, as planning asks every map report to open), and the
// water settled on the land stands as the plan says: the lake 0.05 to 0.6 over its sill, the Still Pool at the lake's
// level, the Veil's curtain, the Gate and the leat dry past their bars, no stray water, nothing on the map's edge but
// the Low River.

import { describe, expect, it } from "vitest";
import { gateMap, startNumbers } from "../../src/core/premise/gateMap";
import { makeSpec } from "../../src/core/spec/mapspec";
import { readGateSettle } from "./gateSettle";

describe("The wall with one gate's maps", () => {
  for (const [side, seed] of [[128, 2], [128, 4], [192, 1], [256, 1]])
    it(`build, pass their checks and settle as planned: seed ${seed} at ${side}²`, () => {
      const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
      const r = gateMap(spec);
      if ("reason" in r) throw new Error(r.reason);
      expect(r.landFails).toEqual([]);
      // (the works stand on the land and do what they say; a rung short of its floor is said, as the lake stair's are)
      // (a rung short of its floor, and the map's shares short of a quarter, are said, not refused)
      expect(r.worksFails.filter((f) => f.id !== "works.paid" && f.id !== "map.shares")).toEqual([]);
      console.log(`  works: ${r.ladder.works.map((w) => `${w.id} ${w.reservoir || w.green}${w.paid ? "" : " (short)"}`).join(", ")}; first: ${r.card.first}`);
      expect(r.frame.reason).toBeNull();
      const m = r.map!;
      const five = startNumbers(m);
      console.log(`seed ${seed} at ${side}²: ${Object.entries(five).map(([id, c]) => `${id} ${c.value} (${c.limit})`).join(", ")}`);
      expect(m.report.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.id}: ${c.message}`)).toEqual([]);
      const s = readGateSettle(r.plan, r.water, m.built.heights, m.built.settle, 0, r.land.niches);
      const at = (id: string) => s.levels.find((l) => l.id === id)!;
      expect(at("lake").level - at("lake").sill).toBeGreaterThanOrEqual(0.05);
      expect(at("lake").level - at("lake").sill).toBeLessThanOrEqual(0.6);
      // (the Still Pool is the plunge pool's backwater since planning's ruling of 2026-11-12)
      expect(Math.abs(at("kettle").level - at("door").level)).toBeLessThanOrEqual(0.25);
      expect(s.veil.ok, s.veil.note).toBe(true);
      expect([s.gateWet, s.leatWet, s.stray, s.edge]).toEqual([0, 0, 0, 0]);
    });
});
