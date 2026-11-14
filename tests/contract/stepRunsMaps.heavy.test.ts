// Step runs on every 128² default map, seeds 1 to 12 of each of the seven themes (the look round's item (b),
// 2026-11-13): no map carries more flights of even one-tile steps and stair edges at 45° (`validate/stepRuns.ts`) than
// the known list allows, and a map not on the list carries none. The list may only shrink (stepRunsKnown.ts). Nightly: 84 maps.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, THEMES } from "../../src/core/spec/mapspec";
import { wetOf } from "../../src/core/validate/ruledLand";
import { stairEdges, stepRuns } from "../../src/core/validate/stepRuns";
import { allowedRuns } from "./stepRunsKnown";

describe("step runs on the default maps", () => {
  for (const theme of THEMES)
    it(`${theme}, 128², seeds 1 to 12: none past the known list`, () => {
      const over: string[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const b = generate(
          makeSpec({ seed, size: { x: 128, y: 128 }, theme }),
        ).built;
        const wet = wetOf(b.settle.depth);
        const r = stepRuns(b.heights, wet, b.W, b.H);
        const e = stairEdges(b.heights, wet, b.W, b.H);
        const n = r.count + e.count;
        if (n > allowedRuns(theme, seed))
          over.push(
            `${theme} ${seed}: ${r.count} + ${e.count} (allowed ${allowedRuns(theme, seed)}), the first at ${JSON.stringify(r.runs[0] ?? e.edges[0])}`,
          );
      }
      expect(over).toEqual([]);
    });
});
