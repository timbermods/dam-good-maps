// A press on the start's lodge takes the start (showcase-craft gap 5): the ray through the lodge's roof meets the
// ground tiles behind it, out of the start's reach by the ground alone; `houseHit` sees the lodge first.

import { describe, expect, it } from "vitest";
import { houseHit } from "../../src/editor/start/startPick";
import { pickEditing, type Ray } from "../../src/render3d/pick";

const W = 24;
const H = 24;
const heights = new Uint8Array(W * H).fill(3);
const start = { x: 10, y: 10 };

/** A ray from the south (grid y up the map is −z in the world), falling one level for every two tiles it travels north,
 *  through (x + 0.5, y + 0.5) at height `z`. */
function rayThrough(x: number, y: number, z: number): Ray {
  const back = 20;
  return { origin: [x + 0.5, z + back / 2, -(y + 0.5 - back)], direction: [0, -0.5, -1] };
}

describe("the start's lodge under the pointer", () => {
  it("a ray through the roof meets the lodge, where the ground alone is tiles behind", () => {
    const ray = rayThrough(start.x, start.y, 3 + 1.5);
    const ground = pickEditing(ray, W, H, heights)!;
    expect(Math.abs(ground.y - start.y)).toBeGreaterThan(1);
    const hit = houseHit(ray, W, H, heights, start);
    expect(hit).not.toBeNull();
    expect(Math.max(Math.abs(hit!.x - start.x), Math.abs(hit!.y - start.y))).toBeLessThanOrEqual(1);
  });

  it("a ray passing over the roof is not on the start", () => {
    expect(houseHit(rayThrough(start.x, start.y, 3 + 3), W, H, heights, start)).toBeNull();
  });

  it("a ray meeting other ground first is not on the start", () => {
    expect(houseHit(rayThrough(start.x + 4, start.y, 3 + 1.5), W, H, heights, start)).toBeNull();
  });
});
