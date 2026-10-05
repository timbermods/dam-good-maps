// The start's middle tile (format/footprints.ts `startMiddleTile`): the district center's blocks at
// its own level, averaged. The editor once wrote it in closed form per orientation; the two agree in
// every orientation, so the closed form went.

import { describe, expect, it } from "vitest";
import { ORIENTATIONS, startMiddleTile, type Orientation } from "../../src/core/format/footprints";

const CLOSED_FORM: Record<Orientation, (x: number, y: number) => [number, number]> = {
  Cw0: (x, y) => [x + 1, y + 1],
  Cw90: (x, y) => [x + 1, y - 1],
  Cw180: (x, y) => [x - 1, y - 1],
  Cw270: (x, y) => [x - 1, y + 1],
};

describe("the start's middle tile", () => {
  it("is the closed form in all four orientations", () => {
    expect(ORIENTATIONS).toHaveLength(4);
    for (const orientation of ORIENTATIONS)
      for (const [x, y] of [[10, 20], [0, 0], [63, 5]] as const) expect(startMiddleTile({ x, y, orientation }), `${orientation} at ${x},${y}`).toEqual(CLOSED_FORM[orientation](x, y));
  });
});
