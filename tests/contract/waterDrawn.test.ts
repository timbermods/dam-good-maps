// What you see is what you get (PERFECT "Water" 1): the view draws water wherever the game does. The game
// marks a column as water to draw when its depth is above 0 (Timberborn.WaterSystemRendering,
// `UpdateWaterTexturesTask.Run`: `if (waterDepth > 0f) _tilesWithWater[...] = true`, game 1.1.2.7), so a
// shallow sheet of 1 to 5 cm is drawn there too; hiding it here would show a map drier than the game's.

import { describe, expect, it } from "vitest";
import { waterFromDepth } from "../../src/render3d/model";

describe("water drawn as the game draws it", () => {
  it("every column of a shallow sheet is drawn, and only those with water", () => {
    const depth = [0, 0.002, 0.01, 0.03, 0.049, 0.2, 0];
    const view = waterFromDepth(new Uint8Array(depth.length).fill(4), depth, new Array(depth.length).fill(0));
    expect(Array.from(view.tile)).toEqual([1, 2, 3, 4, 5]);
  });
});
