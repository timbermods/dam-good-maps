// A Delta's fan carries its water in every channel (PLAN §20 D447, D416): the main river's own course
// below the fan's apex is one of the fan's channels and holds water, as its arms do. On Delta 128²
// seed 4 and 96² seed 2 the main river stood dry from the apex down: its bed there lay above the arms'
// (cut from the apex's lake floor on seed 4), so the arms took all its water.

import { describe, expect, it } from "vitest";
import { STORY } from "../../src/core/analysis/story";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("a Delta's main river holds water below the fan's apex (D447)", () => {
  for (const [size, seed] of [
    [128, 4],
    [96, 2],
  ] as const)
    it(`Delta ${size}² seed ${seed}: the main river holds water on its course`, () => {
      const r = generate(makeSpec({ seed, theme: "delta", size: { x: size, y: size } }));
      expect(r.report.passed).toBe(true);
      expect(r.outcomes!.story.mainWet).toBeGreaterThanOrEqual(STORY.mainWet);
    });
});
