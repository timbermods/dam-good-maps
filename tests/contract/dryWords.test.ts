// The Drought and Badtide views' hover words (D133): "Dry on day 6" and "Lasts the drought", from a tile's first dry
// day, how far the days are worked out and the drought's length; "Turns bad on day 4" from a tile's first bad day;
// nothing where it is not known, nothing on a tile without water or with badwater from Day 0.

import { expect, it } from "vitest";
import { BadDays, badWords, DryDays, dryWords } from "../../src/core/sim/firstDays";

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
  const water = (depth: number[]) => ({ depth, contamination: depth.map(() => 0) });
  const d = new DryDays(water([0.5, 0.5, 0, 0.5]));
  d.see(water([0.4, 0, 0, 0.4]));
  d.see(water([0.3, 0, 0, 0.3]));
  expect(dryWords(d.first, d.through, 3, 1, true)).toBe("Dry on day 1");
  expect(dryWords(d.first, d.through, 3, 0, true)).toBeNull();
  d.see(water([0.2, 0, 0, 0.2]));
  expect(dryWords(d.first, d.through, 3, 0, true)).toBe("Lasts the drought");
  expect(dryWords(d.first, d.through, 3, 2, false)).toBeNull();
});

it("badtide: a tile that turns bad says its day; clean water, water bad from Day 0 and days not worked out say nothing", () => {
  // tile 0 stays clean, tile 1 turns bad on day 2, tile 2 is bad from Day 0, tile 3 has no water
  const day = (c: number[], depth = [0.5, 0.5, 0.5, 0]) => ({ depth, contamination: c });
  const d = new BadDays(day([0, 0, 0.9, 0]));
  expect(badWords(d.first, 1)).toBeNull();
  d.see(day([0, 0.01, 0.9, 0]));
  expect(badWords(d.first, 1)).toBeNull();
  d.see(day([0, 0.2, 0.9, 0]));
  expect(badWords(d.first, 1)).toBe("Turns bad on day 2");
  expect(badWords(d.first, 0)).toBeNull();
  expect(badWords(d.first, 2)).toBeNull();
  expect(badWords(d.first, 3)).toBeNull();
});
