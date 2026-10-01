// The first land shown is the map (D348) at 256², every theme: the heavy suite's share of
// firstLand.test.ts (a 256² map takes most of a minute to settle).
import { describe, expect, it } from "vitest";
import { WEAR_MOST } from "../../src/core/gen/generate";
import { AVAILABLE_THEMES, type ThemeId } from "../../src/core/spec/mapspec";
import { changedSinceShown } from "./firstLandShown";

describe("the first land shown is the map (D348), at 256²", () => {
  it("every theme: the land at the end is the land shown, but for the worn way out", () => {
    for (const theme of AVAILABLE_THEMES) {
      const { changed, levelled, worn, mainKept } = changedSinceShown(theme as ThemeId, 1, 256);
      expect(mainKept, `${theme} 1 256²: the main river kept`).toBe(true);
      expect(levelled, `${theme} 1 256²: a levelled start`).toBe(false);
      expect(worn, `${theme} 1 256²: the worn way out within its cap`).toBeLessThanOrEqual(WEAR_MOST);
      expect(changed.length, `${theme} 1 256²: tiles changed since the land was shown`).toBe(0);
    }
  });
});
