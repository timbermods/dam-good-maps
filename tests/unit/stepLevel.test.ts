// The layer control steps only through levels that hide something, then ∞ (src/editor/LayerWidget.tsx `stepLevel`).

import { describe, expect, it } from "vitest";
import { stepLevel, TOP_LEVEL } from "../../src/editor/LayerWidget";

/** Every value stepping up from `from` visits, to ∞ (null). */
function upFrom(from: number | null, highest: number): (number | null)[] {
  const out: (number | null)[] = [];
  let at = from;
  for (let guard = 0; guard < 40; guard++) {
    at = stepLevel(at, 1, highest);
    out.push(at);
    if (at === null) break;
  }
  return out;
}

describe("stepLevel", () => {
  it("steps up through the levels to the highest ground less one, then ∞, never above all the ground", () => {
    expect(upFrom(12, 15)).toEqual([13, 14, 15, null]);
    expect(upFrom(0, 2)).toEqual([1, 2, null]);
  });

  it("goes from ∞ down to the highest ground less one, and no higher than the game's top", () => {
    expect(stepLevel(null, -1, 15)).toBe(15);
    expect(stepLevel(null, -1, 40)).toBe(TOP_LEVEL);
    expect(stepLevel(null, 1, 15)).toBeNull();
  });

  it("steps down one level to 0 and stops there", () => {
    expect(stepLevel(15, -1, 15)).toBe(14);
    expect(stepLevel(0, -1, 15)).toBe(0);
  });

  it("a level already above the ground steps up to ∞", () => {
    expect(stepLevel(19, 1, 15)).toBeNull();
  });
});
