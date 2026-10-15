// The start's one fit rule (PLAN §20 D342): edge, river, water and every other object's whole footprint stop the
// district center; plants and ruins of a generated map make room for it.

import { describe, expect, it } from "vitest";
import { makesRoomForStart, startFitProblem, type StartFitGround } from "../../src/core/doc/startFit";

const W = 20;
const ground = (over: Partial<StartFitGround> = {}): StartFitGround => ({ W, H: W, river: () => false, depth: () => 0, taken: () => false, ...over });

describe("startFitProblem", () => {
  it("fits on clear ground and refuses the edge, a river, water and an object on any of its tiles, the door too", () => {
    expect(startFitProblem(ground(), 10, 10, [11, 8])).toBeNull();
    expect(startFitProblem(ground(), 1, 10, [2, 8])).toBe("too close to the map edge");
    expect(startFitProblem(ground({ river: (i) => i === 9 * W + 9 }), 10, 10, [11, 8])).toBe("in a river");
    expect(startFitProblem(ground({ depth: (i) => (i === 11 * W + 11 ? 0.5 : 0) }), 10, 10, [11, 8])).toBe("under water");
    // (a corner of the 3×3 and the door tile each)
    expect(startFitProblem(ground({ taken: (i) => i === 11 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
    expect(startFitProblem(ground({ taken: (i) => i === 8 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
  });

  it("makes room only for a generated plant or ruin, and the start itself", () => {
    expect(makesRoomForStart("Pine", false)).toBe(true);
    expect(makesRoomForStart("Pine", true)).toBe(false);
    expect(makesRoomForStart("GeothermalField", false)).toBe(false);
    expect(makesRoomForStart("StartingLocation", true)).toBe(true);
  });
});
