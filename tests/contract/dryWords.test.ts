// The Drought view's hover words (D133): "Dry on day 6" and "Lasts the drought", from a tile's first dry day, how far
// the days are worked out and the drought's length; nothing where it is not known, nothing on a tile without water.

import { expect, it } from "vitest";
import { DryDays, dryWords } from "../../src/core/sim/droughtLine";

const firstDry = Int16Array.from([0, 6, 0, 2, 0]);

it("a tile that goes dry says its day, whatever else is worked out", () => {
  expect(dryWords(firstDry, 9, 9, 1, true)).toBe("Dry on day 6");
  expect(dryWords(firstDry, 3, 9, 3, true)).toBe("Dry on day 2");
  expect(dryWords(firstDry, 6, 9, 1, true)).toBe("Dry on day 6");
});

it("water that lasts says so only once every day of the drought is worked out", () => {
  expect(dryWords(firstDry, 9, 9, 0, true)).toBe("Lasts the drought");
  expect(dryWords(firstDry, 12, 9, 0, true)).toBe("Lasts the drought");
  expect(dryWords(firstDry, 8, 9, 0, true)).toBeNull();
  expect(dryWords(firstDry, 0, 9, 0, true)).toBeNull();
});

it("a tile with no water on Day 0 says nothing", () => {
  expect(dryWords(firstDry, 9, 9, 2, false)).toBeNull();
  expect(dryWords(firstDry, 3, 9, 4, false)).toBeNull();
});

it("reads DryDays as the worker sends it", () => {
  const d = new DryDays([0.5, 0.5, 0, 0.5]);
  d.see([0.4, 0, 0, 0.4]);
  d.see([0.3, 0, 0, 0.3]);
  expect(dryWords(d.firstDry, d.through, 3, 1, true)).toBe("Dry on day 1");
  expect(dryWords(d.firstDry, d.through, 3, 0, true)).toBeNull();
  d.see([0.2, 0, 0, 0.2]);
  expect(dryWords(d.firstDry, d.through, 3, 0, true)).toBe("Lasts the drought");
  expect(dryWords(d.firstDry, d.through, 3, 2, false)).toBeNull();
});
