// One strength number everywhere (PLAN §20 D361, item 6): the settings row, the scroll's note and the
// marker's label say the same thing about the source being pointed at, and in a row say whether the
// scroll changes this source or the whole row, with both numbers.

import { describe, expect, it } from "vitest";
import { sourceStrengths, sourceStrengthWords, withOwnStrength, type SourceGroup } from "../../src/editor/features";

const row: SourceGroup = { members: [4, 5, 6, 7], tiles: [], x: 10, y: 10, z: 3, strength: 1, bad: false };
const strengths: Record<number, number> = { 4: 0.25, 5: 0.25, 6: 0.25, 7: 0.25, 9: 8 };

describe("a source's strength in words", () => {
  it("a source in a row says its own and the row's, as the label's total", () => {
    const s = sourceStrengths([row], (k) => strengths[k], 5)!;
    expect(s).toEqual({ own: 0.25, row: row.strength, count: 4, bad: false });
    expect(sourceStrengthWords(s)).toBe("this source 0.25 · row 1 water/s");
  });

  it("a lone source says just its strength, never a default that is not its own", () => {
    const lone: SourceGroup = { members: [9], tiles: [], x: 30, y: 4, z: 2, strength: 8, bad: true };
    const s = sourceStrengths([row, lone], (k) => strengths[k], 9)!;
    expect(sourceStrengthWords(s)).toBe("8 badwater/s");
  });

  it("scrolling one source moves its number and the row's total, live", () => {
    const s = sourceStrengths([row], (k) => strengths[k], 6)!;
    expect(sourceStrengthWords(withOwnStrength(s, 0.5))).toBe("this source 0.5 · row 1.25 water/s");
    expect(sourceStrengthWords(withOwnStrength(s, 1))).toBe("this source 1 · row 1.75 water/s");
  });

  it("a thing that is no source has none", () => {
    expect(sourceStrengths([row], (k) => strengths[k], 99)).toBeNull();
  });
});
