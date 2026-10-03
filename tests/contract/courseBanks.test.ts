// A river's water runs its planned course (PLAN §20 D447, D273 (1)): no lower water beside a channel
// takes its water before its course ends. Delta 96² seed 20: an oxbow's upstream end touched the
// spring river's channel above the bend, so the water ran through the oxbow and the bend stood dry
// (the river held water on 55% of its course). Delta 96² seed 10: a spring river ran beside the main
// river it joins, its bed above the main river's with no bank between, so its water fell into the
// main river at once and the rest of its course stood dry (44%).

import { describe, expect, it } from "vitest";
import { STORY } from "../../src/core/analysis/story";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("a river's water runs its planned course: no lower water beside its channel takes it (D447)", () => {
  for (const [size, seed, what] of [
    [96, 20, "an oxbow kept off the channel above its join"],
    [96, 10, "a tributary beside the river it joins"],
  ] as const)
    it(`Delta ${size}² seed ${seed}: ${what}`, () => {
      const r = generate(makeSpec({ seed, theme: "delta", size: { x: size, y: size } }));
      expect(r.report.passed).toBe(true);
      expect(r.outcomes!.story.leastWet).toBeGreaterThanOrEqual(STORY.riverWet);
    });
});
