// Water rides the ground it stands on (waterMesh.ts `rideLand`): where the land drawn under a wet tile changes, its
// water stands on the new ground with its depth kept, in the same frame, whichever of the land and the water comes
// first; water standing on something else keeps its floor, and caves' water is left alone.

import { describe, expect, it } from "vitest";
import { surfaceWater, waterFromDepth, type WaterView } from "../../src/render3d/model";
import { rideLand } from "../../src/render3d/waterMesh";

const W = 8;
const H = 4;
const N = W * H;

function lake(): { was: Uint8Array; view: WaterView } {
  const was = new Uint8Array(N).fill(4);
  return { was, view: waterFromDepth(was, new Float64Array(N).fill(1.5), new Float64Array(N)) };
}

describe("water rides its land", () => {
  it("water on land that dropped or rose stands on it, its depth kept; elsewhere it stays", () => {
    const { was, view } = lake();
    const sw = surfaceWater(W, H, view);
    const now = was.slice();
    now[3] = 1;
    now[9] = 7;
    expect(rideLand(W, sw, was, now)).toBe(true);
    expect([sw.floor[3], sw.surface[3], sw.depth[3]]).toEqual([1, 2.5, 1.5]);
    expect([sw.floor[9], sw.surface[9]]).toEqual([7, 8.5]);
    expect([sw.floor[4], sw.surface[4]]).toEqual([4, 5.5]);
    // (again: nothing left to move)
    expect(rideLand(W, sw, now, now)).toBe(false);
  });

  it("water standing on something other than the old land keeps its floor; caves' water is left alone", () => {
    const { was, view } = lake();
    view.floor[5] = 6;
    const sw = surfaceWater(W, H, view);
    const now = was.slice();
    now[5] = 2;
    expect(rideLand(W, sw, was, now)).toBe(false);
    expect(sw.floor[5]).toBe(6);
    const caves: WaterView = { count: 2, tile: Int32Array.from([0, 0]), floor: Float32Array.from([4, 1]), depth: Float32Array.from([1, 1]), contamination: new Float32Array(2) };
    const under = surfaceWater(W, H, caves);
    const dropped = was.slice();
    dropped[0] = 2;
    expect(rideLand(W, under, was, dropped)).toBe(false);
  });
});
