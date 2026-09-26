// Waterfalls with shape and volume (PLAN §20 D201) on generated maps: the flow over a fall's lip,
// which sets how far the fall reaches, is the water simulation's own outflow over that side. The
// view carries no flow: at a drop the simulation empties the lip tile every substep, so the lip's
// depth over the substep, shared by head among the sides it pours over (falls.ts `lipOutflow`), is
// the simulation's flow. The map's bytes stay as they were (tests/contract/look-mine-ruins.test.ts
// pins the live check's download).

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { lipAt, lipOutflow } from "../../src/render3d/falls";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";

/** The water mesher's sides (east, west, north, south) as the simulation's directions. */
const SIM_DIRECTION = [3, 1, 2, 0];
const SX = [1, -1, 0, 0];
const SY = [0, 0, 1, -1];

describe("the flow over a fall's lip", () => {
  it.each([
    ["canyon", 3],
    ["highlands", 2],
    ["lakeBasin", 3],
  ] as [ThemeId, number][])("%s %i: is the simulation's own outflow over that side", (theme, seed) => {
    const W = 128;
    const r = generate(makeSpec({ seed, theme, size: { x: W, y: W } }));
    const b = r.built;
    const sw = surfaceWater(W, W, waterFromDepth(b.heights, b.water, b.contamination));
    const out = b.settle.out!;
    const floor = b.waterModel.floor;
    const none = new Float32Array(W * W);
    const errors: number[] = [];
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++)
        for (let k = 0; k < 4; k++) {
          if (!lipAt(W, W, b.heights, sw, none, x, y, k)) continue;
          const i = y * W + x;
          const j = (y + SY[k]) * W + x + SX[k];
          // (where a full obstacle raises the water's floor the view draws the water on the ground,
          // under the obstacle: not a fall the simulation knows)
          if (floor[i] !== b.heights[i] || floor[j] !== b.heights[j]) continue;
          const sim = out[4 * i + SIM_DIRECTION[k]];
          errors.push(Math.abs(lipOutflow(W, W, b.heights, sw, x, y, k) - sim) / Math.max(sim, 0.05));
        }
    expect(errors.length).toBeGreaterThan(20);
    // within 5% at nine falls in ten, and within 15% at every one
    expect(errors.filter((e) => e <= 0.05).length / errors.length).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...errors)).toBeLessThan(0.15);
  });
});
