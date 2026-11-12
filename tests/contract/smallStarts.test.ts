import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

describe("small starts prepared before the land is shown (D348, D363, D373)", () => {
  // (the last: whether the map also meets all three outcomes; Canyon 128Â² seed 9 missed its promise
  // from generation speed round 2 (#155) until the Canyon height round cut its gorge into a plateau
  // (investigation/canyon-highlands-height), where it met all three until Canyon's gorge and lakes
  // for Kyler's second look drew its land anew (it misses one again); Islands 96Â² seed 4 meets all
  // three again since Islands round 5, D148; since generator 0.10.17's start floors, D515, D148: Canyon 128Â² seed 9 meets
  // all three again, its main river holding all its water, and Canyon 96Â² seed 17 misses its water story, its start
  // moved to a bench that clears the floor, away from the river, and the spring by the start that gives it water holds
  // 46% of the map's water as a second system; both still pass on the land first shown; since generator 0.10.20's contour edges, D518, D148: Canyon 96² seed 17 meets all
  // three again, so seed 2 stands for it, the first of Canyon 96² seeds 1–18 that passes on the land first shown and misses
  // an outcome: 2, 12 and 16 do)
  for (const [theme, seed, size, met] of [["any", 31, 96, true], ["islands", 4, 96, true], ["highlands", 14, 96, true], ["canyon", 2, 96, false], ["canyon", 9, 128, true]] as const)
    it(`${theme} ${size}Â² seed ${seed} passes without changing the shown land`, () => {
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
