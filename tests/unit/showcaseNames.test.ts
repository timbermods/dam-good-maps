// The names on the Showcase sheet: no two cards share one. A search's maps are siblings of one seed, which share the
// standout and so the title the seed picks, so the name maker steps along the titles with the variation (core/gen/names.ts);
// where two maps still draw one name (another standout's identical title, a variation a whole pool apart), the sheet
// keeps the better of the two (showcaseModel `bestOf`).

import { describe, expect, it } from "vitest";
import { bestOf } from "../../src/editor/generator/showcaseModel";
import type { Signature } from "../../src/core/analysis/signature";
import { mapWords, type PlayFacts } from "../../src/core/gen/names";
import { ACTIVE } from "../../src/core/land/intentions";
import type { ShowcaseView } from "../../src/worker/showcaseApi";

const sig: Signature = { valley: 0.25, canyon: 0, canyonShare: 0, high: 0.3, cliffs: 0.05, plateaus: 1, lakeShare: 0.1, bigLake: 0.01, mouths: 1, water: 0.12, mainBody: 0.1, apart: 0, islands: 0 };
const facts: PlayFacts = { W: 128, H: 128, start: { x: 60, y: 60 }, startDrought: true, bestDam: null, badwater: null, woods: null };

describe("names on the Showcase sheet", () => {
  it("a map's next two siblings, seeds 1 to 40, draw each its own name, and the same one every time", () => {
    for (const theme of ["riverValley", "lakeBasin", "any"] as const)
      for (const standout of [...ACTIVE, null])
        for (let seed = 1; seed <= 40; seed++) {
          const names = [0, 1, 2].map((variation) => mapWords({ seed, variation, theme, standout, signature: sig, facts }).name);
          expect(new Set(names).size, `${theme} ${standout} seed ${seed}: ${names.join(", ")}`).toBe(names.length);
          // (variation 0 is the name a map without one always had)
          expect(names[0]).toBe(mapWords({ seed, theme, standout, signature: sig, facts }).name);
          expect(mapWords({ seed, variation: 2, theme, standout, signature: sig, facts }).name).toBe(names[2]);
        }
  });

  it("the sheet never keeps two cards under one name: the better ranked stays", () => {
    const view = (variation: number, score: number, name: string): ShowcaseView => ({ index: variation, variation, spec: {} as ShowcaseView["spec"], passed: true, arc: null, score, note: "", name });
    const best = bestOf([[view(0, 5, "Lee Valley"), view(1, 6, "Lee Valley"), view(2, 4, "Cliff Foot Valley"), view(3, 3, "Quiet Valley"), view(4, 2, "Open Valley")]]);
    expect(best.map((v) => v.name)).toEqual(["Lee Valley", "Cliff Foot Valley", "Quiet Valley"]);
    expect(best[0].variation).toBe(1);
  });
});
