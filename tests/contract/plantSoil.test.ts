// Whether a plant lives on its soil (PLAN §20 D235, D342): the core's plain answer behind the page's
// "dry ground: these will die" warning. The rule is the game's, as the resource rasterizer keeps it.

import { describe, expect, it } from "vitest";
import { diesOnSoil, dyingTiles } from "../../src/core/doc/plantSoil";

const soil = {
  moisture: Uint8Array.from([1, 0, 1, 0]),
  contamination: Uint8Array.from([0, 0, 1, 0]),
};

describe("diesOnSoil / dyingTiles (D235)", () => {
  it("trees and bushes die on dry or contaminated soil, a succulent on moist or contaminated soil", () => {
    for (const t of ["Pine", "Birch", "Oak", "BlueberryBush"]) expect(dyingTiles(t, [0, 1, 2, 3], soil)).toEqual([1, 2, 3]);
    expect(dyingTiles("Succulent", [0, 1, 2, 3], soil)).toEqual([0, 2]);
    expect(diesOnSoil("Oak", soil, 0)).toBe(false);
  });

  it("leaves out tiles under water and tiles off the map", () => {
    const depth = Float32Array.from([0, 0.5, 0, 0.04]);
    expect(dyingTiles("Oak", [1, 3, -1, 9], soil, depth)).toEqual([3]);
  });
});
