// Water rides the ground it stands on (waterMesh.ts `rideLand`): where the land drawn under a wet tile changes, its
// water stands on the new ground with its depth kept, in the same frame, whichever of the land and the water comes
// first; water standing on something else keeps its floor, and so does water under a roof (its floor is not the tile's
// top), while the lake on the roof rides the roof (3D view, part 4). A held weather day's water never rides (D133,
// `holdLand`): its surface stays, land raised to it holds none, land under it holds water up to it.

import { describe, expect, it } from "vitest";
import { surfaceWater, waterFromDepth, type WaterView } from "../../src/render3d/model";
import { heldSurfaceOf, holdLand, rideLand } from "../../src/render3d/waterMesh";

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

  it("water standing on something other than the old land keeps its floor; a cave's water is left alone, the lake on its roof rides", () => {
    const { was, view } = lake();
    view.floor[5] = 6;
    const sw = surfaceWater(W, H, view);
    const now = was.slice();
    now[5] = 2;
    expect(rideLand(W, sw, was, now)).toBe(false);
    expect(sw.floor[5]).toBe(6);
    // tile 0: a lake on the roof at 4 over a cave's pool at 1; tile 1: a cave's pool at 1 under a dry roof at 4
    const caves: WaterView = { count: 3, tile: Int32Array.from([0, 0, 1]), floor: Float32Array.from([4, 1, 1]), depth: Float32Array.from([1, 1, 1]), contamination: new Float32Array(3) };
    const under = surfaceWater(W, H, caves);
    const dropped = was.slice();
    dropped[0] = 3;
    dropped[1] = 3;
    expect(rideLand(W, under, was, dropped)).toBe(true);
    expect([under.floor[0], under.surface[0]]).toEqual([3, 4]);
    expect([under.floor[1], under.surface[1]]).toEqual([1, 2]);
  });
});

describe("a held day's water keeps its surface (D133)", () => {
  it("land raised to the surface or above holds none, land under it fills to it, dry land stays dry, land put back has its water back", () => {
    const was = new Uint8Array(N).fill(4);
    const depth = new Float64Array(N).fill(1.5);
    // (tile 7 dry on the day)
    depth[7] = 0;
    const sw = surfaceWater(W, H, waterFromDepth(was, depth, new Float64Array(N)));
    const held = heldSurfaceOf(sw, was);
    expect(held[0]).toBe(5.5);
    expect(held[7]).toBeNaN();
    const now = was.slice();
    now[1] = 15; // raised above the surface
    now[2] = 5; // raised, still under it
    now[4] = 1; // lowered under it
    now[7] = 0; // dry land lowered
    expect(holdLand(W, sw, held, was, now)).toBe(true);
    // raised above: no water, and the readout's water is gone with it
    expect(sw.surface[1]).toBeNaN();
    expect(sw.depth[1]).toBe(0);
    // raised, still under: water up to the surface
    expect([sw.floor[2], sw.surface[2], sw.depth[2]]).toEqual([5, 5.5, 0.5]);
    // lowered: the same surface, deeper
    expect([sw.floor[4], sw.surface[4], sw.depth[4]]).toEqual([1, 5.5, 4.5]);
    // untouched and dry tiles as they were
    expect([sw.floor[3], sw.surface[3], sw.depth[3]]).toEqual([4, 5.5, 1.5]);
    expect(sw.surface[7]).toBeNaN();
    // the raised tile put back: the day's water there again
    const back = now.slice();
    back[1] = 4;
    expect(holdLand(W, sw, held, now, back)).toBe(true);
    expect([sw.floor[1], sw.surface[1], sw.depth[1]]).toEqual([4, 5.5, 1.5]);
  });

  it("a held day worked out on the land before an edit stands on the land drawn with its surface kept; a cave's water is left alone", () => {
    const { was, view } = lake();
    const now = was.slice();
    now[0] = 9;
    now[1] = 2;
    const sw = surfaceWater(W, H, view);
    const held = heldSurfaceOf(sw, now, was);
    expect(holdLand(W, sw, held, was, now)).toBe(true);
    expect(sw.surface[0]).toBeNaN();
    expect([sw.floor[1], sw.surface[1], sw.depth[1]]).toEqual([2, 5.5, 3.5]);
    // tile 1: a cave's pool at 1 under a roof at 4, which the edit raises
    const caves: WaterView = { count: 1, tile: Int32Array.from([1]), floor: Float32Array.from([1]), depth: Float32Array.from([1]), contamination: new Float32Array(1) };
    const under = surfaceWater(W, H, caves);
    const raised = was.slice();
    raised[1] = 8;
    expect(holdLand(W, under, heldSurfaceOf(under, was), was, raised)).toBe(false);
    expect([under.floor[1], under.surface[1]]).toEqual([1, 2]);
  });
});
