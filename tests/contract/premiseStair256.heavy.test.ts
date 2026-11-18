// The lake stair at 256² (docs/PREMISES.md §3.3): seeds 1 to 3 in River Valley and in theme Any make
// a premise map, none falling back to the themes. Seed 2 fell back after 16 plans: its plans' side networks, sited on
// the skeleton's land without the start's walk, cut the start's lake shore beside the bench (walkable land 973 to 1,290
// against the 1,300 floor, where the skeleton gave 1,601 to 2,528), and the start's ways out were tried only on the
// map's four largest grounds, out of reach at 256² (`lakeStair.ts` `WALK_KEEP`, `frame.ts` `WAYS_OUT`). Then its
// plans missed `spectrum`'s moist floor (now by the map's side, D519) or lost the start's water on a drought's first
// day, the lake standing just over the shelf that rings it (`lakeStair.ts` `LANDING`).
// The plates are turned off the tile grid and their rims ragged at 256² as at 128² (D(plates-turned)): the uplands' rims
// in axis-parallel straight runs of 6 sides or more (`rimRuler`) stay under RIM_MOST. On the grid (before), these six
// read 25.7 to 30.4 %; turned and ragged, 16.3 to 19.0 %. Seed 2 fell back once the grade's turned noise reached its
// relief (D518's first cut); it holds with them now, so the 128² cap that guarded it is gone.

import { describe, expect, it } from "vitest";
import { generatePremise } from "../../src/core/premise/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { rimRuler, wetOf } from "../../src/core/validate/ruledLand";

const RIM_MOST = 0.2;

describe("The lake stair at 256²", () => {
  const cases: [ThemeId, number][] = [
    ["riverValley", 1],
    ["riverValley", 2],
    ["riverValley", 3],
    ["any", 1],
    ["any", 2],
    ["any", 3],
  ];
  for (const [theme, seed] of cases)
    it(`makes seed ${seed} in ${theme} without falling back`, () => {
      const r = generatePremise(makeSpec({ seed, size: { x: 256, y: 256 }, theme, premise: "lakeStair" }));
      expect("reason" in r ? r.reason : null).toBeNull();
      if ("reason" in r) return;
      expect(r.result.report.passed).toBe(true);
      expect(r.result.info.premise?.fellBack).toBeUndefined();
      const b = r.result.built;
      expect(rimRuler(b.heights, wetOf(b.settle.depth), b.W, b.H).share).toBeLessThan(RIM_MOST);
    });
});
