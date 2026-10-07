import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

describe("small starts prepared before the land is shown (D348, D363, D373)", () => {
  // (the last: whether the map also meets all three outcomes; Canyon 128² seed 9 misses its promise
  // since generation speed round 2 (#155) screens small Canyons' planned promise earlier, one of the
  // maps that round traded for Canyon 128²'s net gain; Islands 96² seed 4 meets all three again since
  // Islands round 5, D148)
  for (const [theme, seed, size, met] of [["any", 31, 96, true], ["islands", 4, 96, true], ["highlands", 14, 96, true], ["canyon", 17, 96, true], ["canyon", 9, 128, false]] as const)
    it(`${theme} ${size}² seed ${seed} passes without changing the shown land`, () => {
      const shown: Uint8Array[] = [];
      const r = generate(makeSpec({ theme: theme as ThemeId, seed, size: { x: size, y: size } }), {
        onLand: l => shown.push(l.heights.slice()),
      });
      expect(r.report.passed, r.report.checks.filter(c => !c.ok).map(c => c.message).join("; ")).toBe(true);
      expect(shown).toHaveLength(1);
      expect(r.built.heights).toEqual(shown[0]);
      expect(r.info.start?.levelled).toBe(false);
      expect(r.report.checks.find(c => c.id === "resources.mine_site")?.ok).toBe(true);
      expect(r.outcomes?.met).toBe(met);
    });
});
