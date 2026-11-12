// The lake stair at 256² (docs/PREMISES.md §3.3): seeds 1 to 3 in River Valley, and seeds 1 and 3 in theme Any, make
// a premise map, none falling back to the themes. Seed 2 fell back after 16 plans: its plans' side networks, sited on
// the skeleton's land without the start's walk, cut the start's lake shore beside the bench (walkable land 973 to 1,290
// against the 1,300 floor, where the skeleton gave 1,601 to 2,528), and the start's ways out were tried only on the
// map's four largest grounds, out of reach at 256² (`lakeStair.ts` `WALK_KEEP`, `frame.ts` `WAYS_OUT`). Theme Any's
// seed 2 still falls back (its plans then miss `spectrum`'s moist floor or fall back to the first pass's side network).

import { describe, expect, it } from "vitest";
import { generatePremise } from "../../src/core/premise/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

describe("The lake stair at 256²", () => {
  const cases: [ThemeId, number][] = [
    ["riverValley", 1],
    ["riverValley", 2],
    ["riverValley", 3],
    ["any", 1],
    ["any", 3],
  ];
  for (const [theme, seed] of cases)
    it(`makes seed ${seed} in ${theme} without falling back`, () => {
      const r = generatePremise(makeSpec({ seed, size: { x: 256, y: 256 }, theme, premise: "lakeStair" }));
      expect("reason" in r ? r.reason : null).toBeNull();
      if ("reason" in r) return;
      expect(r.result.report.passed).toBe(true);
      expect(r.result.info.premise?.fellBack).toBeUndefined();
    });
});
