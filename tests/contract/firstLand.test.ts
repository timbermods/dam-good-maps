// The first land shown is the map (D348): the land the first look shows is the land the player gets,
// byte for byte, apart from its water and the two repairs the settled water may need, each bounded
// and each saying which tiles it touched: the worn way out (D350 (b), D360; within D358's cap) and
// the plug opened (D274, D350; an object, its own tiles only, which leaves the ground as it is). The
// badwater hollows are dug before the land is shown, and a start on the shown land needs no
// levelling but as a last resort.
import { describe, expect, it } from "vitest";
import { WEAR_MOST } from "../../src/core/gen/generate";
import { AVAILABLE_THEMES, type ThemeId } from "../../src/core/spec/mapspec";
import { changedSinceShown } from "./firstLandShown";

describe("the first land shown is the map (D348)", () => {
  for (const size of [96, 128])
    it(`at ${size}², every theme: the land at the end is the land shown, but for the worn way out`, () => {
      for (const theme of AVAILABLE_THEMES)
        for (const seed of [1, 2]) {
          const { changed, levelled, worn } = changedSinceShown(theme as ThemeId, seed, size);
          expect(levelled, `${theme} ${seed} ${size}²: a levelled start`).toBe(false);
          expect(worn, `${theme} ${seed} ${size}²: the worn way out within its cap`).toBeLessThanOrEqual(WEAR_MOST);
          expect(worn, `${theme} 1 256²: the worn way out within its cap`).toBeLessThanOrEqual(WEAR_MOST);
      expect(changed.length, `${theme} ${seed} ${size}²: tiles changed since the land was shown`).toBe(0);
        }
    });
});
