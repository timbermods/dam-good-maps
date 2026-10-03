// A fall's lip pours the simulation's own outflow over that side (falls.ts `lipOutflow`, D353): the view carries
// each column's outflows from the water worker, so every lip, those over the map's edge included, pours what the
// settle does. Before, the flow was estimated from the lip's depth and gave the map's edge no share, so a lip
// pouring off the map was drawn several times too strong (M9b's finding: Highlands 128² seed 5 at (86, 127),
// 0.26 for the settle's 0.03; on dev's maps Highlands seed 8 at (63, 0), 1.52 for 0.21). M9b's map is pinned
// by look-waterfalls.test.ts once M9b and this meet.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { outflowsOf } from "../../src/render3d/current";
import { lipAt, lipOutflow } from "../../src/render3d/falls";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";

/** The water mesher's sides (east, west, north, south) as the simulation's directions. */
const SIM_DIRECTION = [3, 1, 2, 0];
const SX = [1, -1, 0, 0];
const SY = [0, 0, 1, -1];

describe("the flow over a fall's lip, with the settle's outflows", () => {
  it.each([
    ["highlands", 8, [63, 0]],
    ["delta", 4, [127, 90]],
    ["delta", 2, [127, 26]],
  ] as [ThemeId, number, [number, number]][])("%s %i: every lip, the map's edge included, pours the settle's outflow", (theme, seed, [ex, ey]) => {
    const W = 128;
    const b = generate(makeSpec({ seed, theme, size: { x: W, y: W } })).built;
    const out = b.settle.out!;
    const view = waterFromDepth(b.heights, b.water, b.contamination);
    view.outflow = outflowsOf(view, W, W, out)!;
    const sw = surfaceWater(W, W, view);
    const none = new Float32Array(W * W);
    let lips = 0;
    let edge = 0;
    let known = false;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++)
        for (let k = 0; k < 4; k++) {
          if (!lipAt(W, W, b.heights, sw, none, x, y, k)) continue;
          const i = y * W + x;
          const j = (y + SY[k]) * W + x + SX[k];
          if (b.waterModel.floor[i] !== b.heights[i] || b.waterModel.floor[j] !== b.heights[j]) continue;
          lips++;
          const sim = Math.fround(Math.max(0, out[4 * i + SIM_DIRECTION[k]]));
          expect(lipOutflow(W, W, b.heights, sw, x, y, k), `(${x}, ${y}) side ${k}`).toBe(sim);
          if (x === 0 || y === 0 || x === W - 1 || y === W - 1) edge++;
          if (x === ex && y === ey) known = true;
        }
    expect(lips).toBeGreaterThan(20);
    expect(edge).toBeGreaterThan(0);
    expect(known).toBe(true);
  });
});
