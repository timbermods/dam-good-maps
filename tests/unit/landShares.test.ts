// The land's shares (core/analysis/landShares.ts): the three shares cover the map and their per cents add up to 100.

import { expect, it } from "vitest";
import { landShares, shareWords } from "../../src/core/analysis/landShares";

it("counts water, moist and dry ground, living trees and the logs grown trees hold", () => {
  const s = landShares(9, (i) => i < 3, (i) => i < 5, [
    { template: "Oak", dead: false, young: false },
    { template: "Pine", dead: false, young: true },
    { template: "Birch", dead: true, young: false },
    { template: "BlueberryBush", dead: false, young: false },
  ]);
  expect(s).toEqual({ tiles: 9, water: 3, moist: 2, dry: 4, trees: 2, logs: 9 });
  expect(shareWords(s)).toEqual(["33%", "22%", "45%"]);
  expect(shareWords({ tiles: 1000, water: 3, moist: 0, dry: 997 })).toEqual(["under 1%", "0%", "100%"]);
});
