// No map keeps water that nothing feeds (PLAN §20 D420, with D385): every body of water a generated
// map stores has a source standing on it. Any 96² seed 1 at Relief 100 stores two one-tile pits at
// the edge of a lake, each full to its rim (1.0 deep at level 7, the lake beside it at 6.29), sealed
// by ground at 8 and 9, with no source: water from nowhere, which the game only evaporates.
import { describe, expect, it } from "vitest";
import { at, generateLink, wetBodies } from "./genHelpers";

describe("no water that nothing feeds (D420)", () => {
  it("Any 96² seed 1, Relief 100: every body of stored water has a source on it", () => {
    const m = generateLink("s=1&t=any&z=96&rl=100");
    expect(m.r.report.passed).toBe(true);
    const unfed = wetBodies(m).filter((b) => !b.fed);
    expect(unfed.map((b) => `${b.tiles.length} tiles at ${at(m.W, b.tiles[0])}, ${b.deepest.toFixed(2)} deep`)).toEqual([]);
  });
});
