// A force has a visible effect wherever it is used (PLAN §20 D356), the nightly's sweep: every theme at
// 128², each force at low, mid and high Power at random places and on each kind of ground (flat, water,
// a peak, a slope, the map's edge, beside the start), headless and on fixed seeds. What it found doing
// nothing is KNOWN in forceEverywhere.ts, for Kyler; anything else fails.

import { describe, expect, it } from "vitest";
import { THEMES } from "../../src/core/spec/mapspec";
import { describe as line, sweep, unexpected } from "./forceEverywhere";

describe("every force has a visible effect wherever it is used, every theme (D356)", () => {
  for (const theme of THEMES.filter((t) => t !== "any"))
    it(`${theme} 128²: every use changes the land visibly`, async () => {
      const o = await sweep(theme, 128, 5, 4);
      expect(unexpected(o).map(line)).toEqual([]);
    }, 1_200_000);
});
