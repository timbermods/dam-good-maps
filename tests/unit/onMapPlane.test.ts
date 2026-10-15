// A pointer that misses the terrain zooms about the ground plane only where the plane is on the map: just below the
// horizon the plane is thousands of tiles away.

import { describe, expect, it } from "vitest";
import { onMapPlane, zoomTargetToward } from "../../src/render3d/framing";

describe("onMapPlane", () => {
  it("is true on the map and a margin round it, false far past it", () => {
    expect(onMapPlane([48, 8, -48], 96, 96)).toBe(true);
    expect(onMapPlane([100, 8, 4], 96, 96)).toBe(true);
    expect(onMapPlane([48, 8, -2000], 96, 96)).toBe(false);
    expect(onMapPlane([-300, 8, -48], 96, 96)).toBe(false);
  });

  it("a point near the horizon, off the map, is not a zoom point: the centre zoom leaves the target", () => {
    const target: [number, number, number] = [48, 8, -48];
    const far: [number, number, number] = [60, 8, -3000];
    const bounds = { W: 96, H: 96, maxY: 20 };
    // zoomed about it, the target is thrown across the map; about the centre (no point), it stays
    expect(onMapPlane(far, 96, 96)).toBe(false);
    expect(zoomTargetToward(target, far, 150, 130, bounds)[2]).not.toBe(-48);
  });
});
