// Zooming about a point of the ground (the wheel's pointer): the target moves toward the point by the distance's ratio,
// stays inside the map, and does not move at all when the distance does not change (the zoom's limit).

import { describe, expect, it } from "vitest";
import { zoomTargetToward } from "../../src/render3d/framing";

const bounds = { W: 96, H: 96, maxY: 20 };

describe("zoomTargetToward", () => {
  it("moves the target toward the point by the distance's ratio", () => {
    const t = zoomTargetToward([48, 8, -48], [68, 12, -28], 100, 50, bounds);
    expect(t).toEqual([58, 10, -38]);
  });

  it("leaves the target where it is when the point is the target (zooming about the centre)", () => {
    expect(zoomTargetToward([48, 8, -48], [48, 8, -48], 100, 40, bounds)).toEqual([48, 8, -48]);
  });

  it("keeps the point under the pointer: the camera scales about it", () => {
    // the camera sits at target + offset*distance; scaled about the point, the ray through it keeps its direction
    const target: [number, number, number] = [30, 5, -60];
    const hit: [number, number, number] = [70, 9, -20];
    const offset = [0.3, 0.5, 0.8];
    const cam = (t: number[], d: number) => t.map((v, k) => v + offset[k] * d);
    const next = zoomTargetToward(target, hit, 90, 60, bounds);
    const a = cam(target, 90).map((v, k) => v - hit[k]);
    const b = cam(next, 60).map((v, k) => v - hit[k]);
    for (let k = 0; k < 3; k++) expect(b[k]).toBeCloseTo(a[k] * (60 / 90), 9);
  });

  it("moves nothing at the limit", () => {
    expect(zoomTargetToward([48, 8, -48], [68, 12, -28], 6, 6, bounds)).toEqual([48, 8, -48]);
  });

  it("zooming out moves the target away from the point, held inside the map", () => {
    expect(zoomTargetToward([90, 8, -90], [10, 2, -10], 50, 400, bounds)).toEqual([96, 20, -96]);
    expect(zoomTargetToward([10, 1, -10], [60, 8, -50], 50, 400, bounds)).toEqual([0, 0, 0]);
  });
});
