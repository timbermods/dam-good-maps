// One strength number everywhere (PLAN §20 D361, item 6; D368 (4)): the settings row, the scroll's note and the
// marker's label say the same thing about the source being pointed at, and in a row say whether the
// scroll changes this source or the whole row, with both numbers. They all read one value: the page's copy of
// the objects, with the strengths set on it and still on their way to the worker on top.

import { describe, expect, it } from "vitest";
import { sourceGroups, sourceStrengths, sourceStrengthWords, strengthKey, strengthReader, type SourceGroup } from "../../src/editor/features";
import { entityView } from "../../src/render3d/model";

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

  it("scrolling one source moves its number and the row's total at once, notch by notch, from the one value", () => {
    const W = 32;
    const heights = new Uint8Array(W * W).fill(4);
    const src = (x: number, strength: number) => ({ template: "WaterSource", x, y: 10, z: 4, orientation: "Cw0", owner: "", strength });
    const v = entityView([src(5, 1), src(6, 1), src(7, 1), src(20, 1)]);
    const pending = new Map<string, number>();
    const read = strengthReader(v, pending);
    for (const [own, k] of [
      [1.5, 1],
      [2, 1],
      [3, 1],
      [8, 3],
    ] as const) {
      // (a notch: the page sets it at once, before the worker answers)
      pending.set(strengthKey(v.x[k], v.y[k]), own);
      const groups = sourceGroups(v, W, heights, read);
      const s = sourceStrengths(groups, read, k)!;
      const label = groups.find((g) => g.members.includes(k))!.strength;
      expect(s.own).toBe(own);
      expect(s.row).toBe(label);
    }
    expect(sourceStrengthWords(sourceStrengths(sourceGroups(v, W, heights, read), read, 1)!)).toBe("this source 3 · row 5 water/s");
    expect(sourceStrengthWords(sourceStrengths(sourceGroups(v, W, heights, read), read, 3)!)).toBe("8 water/s");
    // the worker answered: its own number stands
    pending.clear();
    expect(sourceStrengths(sourceGroups(v, W, heights, read), read, 1)!.row).toBe(3);
  });

  it("a thing that is no source has none", () => {
    expect(sourceStrengths([row], (k) => strengths[k], 99)).toBeNull();
  });
});
