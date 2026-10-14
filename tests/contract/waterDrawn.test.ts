// What you see is what you get (PERFECT "Water" 1): the view draws water wherever the game does. The game
// marks a column as water to draw when its depth is above 0 (Timberborn.WaterSystemRendering,
// `UpdateWaterTexturesTask.Run`: `if (waterDepth > 0f) _tilesWithWater[...] = true`, game 1.1.2.7). The view
// draws above `WET` = 0.001 (render3d/model.ts); no settled column sits between 0 and 1 mm (Near Colca
// Canyon: 8,719 columns above 0, the same 8,719 above 0.001), so the two agree. This pins that a shallow
// sheet of 1 to 5 cm is drawn, as the game draws it, and that only a film under `WET` is left out.

import { describe, expect, it } from "vitest";
import { waterFromDepth } from "../../src/render3d/model";

describe("water drawn as the game draws it", () => {
  it("every column of a shallow sheet is drawn; a film under 1 mm and dry ground are not", () => {
    const depth = [0, 0.002, 0.01, 0.03, 0.049, 0.2, 0.0005, 0];
    const view = waterFromDepth(new Uint8Array(depth.length).fill(4), depth, new Array(depth.length).fill(0));
    expect(Array.from(view.tile)).toEqual([1, 2, 3, 4, 5]);
  });
});
