// The Drought and Badtide views' hover words (D133): "Dry on day 6" and "Lasts the drought", from a tile's first dry
// day, how far the days are worked out and the drought's length; "Turns bad on day 4" from a tile's first bad day;
// nothing where it is not known, nothing on a tile without water or with badwater from Day 0.

import { expect, it } from "vitest";
import { BadDays, badWords, DryDays, dryWords, heldWords, type HeldFirstDays } from "../../src/core/sim/firstDays";

const firstDry = Int16Array.from([0, 6, 0, 2, 0]);
/** The run's Day 0 water (`DryDays.wet0`): tiles 0 to 3 hold water, tile 4 none. */
const wet0 = Uint8Array.from([1, 1, 1, 1, 0]);
/** A tile's Day 0 mask for the cases below that name it by `wet`. */
const mask = (wet: boolean) => (wet ? wet0 : Uint8Array.from([0, 0, 0, 0, 0]));

it("a tile that goes dry says its day, whatever else is worked out", () => {
  expect(dryWords(firstDry, 9, 9, 1, mask(true))).toBe("Dry on day 6");
  expect(dryWords(firstDry, 3, 9, 3, mask(true))).toBe("Dry on day 2");
  expect(dryWords(firstDry, 6, 9, 1, mask(true))).toBe("Dry on day 6");
});

it("water that lasts says so only once every day of the drought is worked out", () => {
  expect(dryWords(firstDry, 9, 9, 0, mask(true))).toBe("Lasts the drought");
  expect(dryWords(firstDry, 12, 9, 0, mask(true))).toBe("Lasts the drought");
  expect(dryWords(firstDry, 8, 9, 0, mask(true))).toBeNull();
  expect(dryWords(firstDry, 0, 9, 0, mask(true))).toBeNull();
});

it("a tile with no water on Day 0 says nothing", () => {
  expect(dryWords(firstDry, 9, 9, 2, mask(false))).toBeNull();
  expect(dryWords(firstDry, 3, 9, 4, mask(false))).toBeNull();
});

it("reads DryDays as the worker sends it", () => {
  const water = (depth: number[]) => ({ depth, contamination: depth.map(() => 0) });
  const d = new DryDays(water([0.5, 0.5, 0, 0.5]));
  d.see(water([0.4, 0, 0, 0.4]));
  d.see(water([0.3, 0, 0, 0.3]));
  expect(dryWords(d.first, d.through, 3, 1, d.wet0)).toBe("Dry on day 1");
  expect(dryWords(d.first, d.through, 3, 0, d.wet0)).toBeNull();
  d.see(water([0.2, 0, 0, 0.2]));
  expect(dryWords(d.first, d.through, 3, 0, d.wet0)).toBe("Lasts the drought");
  expect(dryWords(d.first, d.through, 3, 2, d.wet0)).toBeNull();
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

it("water that goes after the drought's last day lasts the drought; a tile with no water on Day 0 says nothing, whatever its 0 or day", () => {
  const wet0 = Uint8Array.from([1, 1, 0, 1, 0]);
  expect(dryWords(Int16Array.from([0, 6, 0, 12, 4]), 12, 9, 3, wet0)).toBe("Lasts the drought");
  expect(dryWords(Int16Array.from([0, 6, 0, 12, 4]), 12, 9, 1, wet0)).toBe("Dry on day 6");
  expect(dryWords(Int16Array.from([0, 6, 0, 12, 4]), 12, 9, 2, wet0)).toBeNull();
  expect(dryWords(Int16Array.from([0, 6, 0, 12, 4]), 12, 9, 4, wet0)).toBeNull();
});

it("days worked out on an older map say nothing; the map's own days, and only the hazard on screen, say their words", () => {
  const drought: HeldFirstDays = { hazard: "drought", version: 4, first: Int16Array.from([0, 6]), wet0: Uint8Array.from([1, 1]), through: 9, days: 9 };
  const badtide: HeldFirstDays = { hazard: "badtide", version: 4, first: Int16Array.from([0, 3]), wet0: null, through: 8, days: 8 };
  // the days' own map
  expect(heldWords(drought, "drought", 4, 0)).toBe("Lasts the drought");
  expect(heldWords(drought, "drought", 4, 1)).toBe("Dry on day 6");
  expect(heldWords(badtide, "badtide", 4, 1)).toBe("Turns bad on day 3");
  // an edit while the view is held: the map is version 5, the days are version 4's
  expect(heldWords(drought, "drought", 5, 0)).toBeNull();
  expect(heldWords(drought, "drought", 5, 1)).toBeNull();
  expect(heldWords(badtide, "badtide", 5, 1)).toBeNull();
  // the other hazard on screen, or none, or no days yet
  expect(heldWords(drought, "badtide", 4, 1)).toBeNull();
  expect(heldWords(drought, null, 4, 1)).toBeNull();
  expect(heldWords(null, "drought", 4, 1)).toBeNull();
});
