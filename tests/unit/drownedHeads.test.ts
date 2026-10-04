// An inflow's head under water held downstream (Canyon 256² seed 14): a lake whose rim stands two
// levels or more over the head's bed backs up the course to the edge, stands over the head's sources
// and runs off the map beside them, and its water never settles. Such a land is drawn again.
import { describe, expect, it } from "vitest";
import type { RiverFeature } from "../../src/core/features/schema";
import { drownedHeads } from "../../src/core/land/courses";

const W = 40;
const H = 40;
const N = W * H;

const river: RiverFeature = {
  id: "r-main",
  kind: "river",
  origin: "generated",
  locked: false,
  params: { path: [[-1, 20], [39, 20]], width: 3, bedDepth: 1, bedProfile: { start: 4, steps: [] }, flow: 2, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false },
};

/** Upland at 10; the river's channel along y 19–21 from the west edge, its bed at `bed`, falling
 *  to 2 past `rimAt`, where a rim at `rim` crosses it. */
function land(bed: number, rim: number, rimAt = 20): Uint8Array {
  const h = new Uint8Array(N).fill(10);
  for (let x = 0; x < W; x++) for (let y = 19; y <= 21; y++) h[y * W + x] = x < rimAt ? bed : x === rimAt ? rim : 2;
  return h;
}

describe("a river's head under a lake", () => {
  it("is found where a rim downstream holds water two levels over the head's bed", () => {
    expect(drownedHeads(land(4, 7), W, H, [river])).toEqual(["r-main"]);
  });

  it("is not found where the course runs down from its head, or the water held is shallow", () => {
    expect(drownedHeads(land(4, 2), W, H, [river])).toEqual([]);
    expect(drownedHeads(land(4, 5), W, H, [river])).toEqual([]);
  });

  it("reads only inflows from an edge", () => {
    const spring: RiverFeature = { ...river, id: "r-spring", params: { ...river.params, entry: { spring: [5, 20] } } };
    expect(drownedHeads(land(4, 7), W, H, [spring])).toEqual([]);
  });
});
