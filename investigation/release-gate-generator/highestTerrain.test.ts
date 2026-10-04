// Highest terrain is a cap: "terrain never exceeds this" (PLAN §5.2; item 36, D172: it defaults to 16
// below Verticality 70, so the two never contradict). At Variety 100 the land rises past it: Any 96²
// seed 1 keeps Highest terrain 16 (Verticality 25, the default) and its land tops out at 21. The file
// then carries the tall note, and the game's map editor cannot edit the land above 16, which the
// player never asked for.
import { describe, expect, it } from "vitest";
import { generateLink } from "./genHelpers";

describe("Highest terrain caps the land (PLAN §5.2)", () => {
  it("Any 96² seed 1 at Variety 100 stays within its Highest terrain of 16", () => {
    const m = generateLink("s=1&t=any&z=96&vy=100");
    expect(m.r.spec.settings.terrain.highestTerrain).toBe(16);
    let top = 0;
    for (const v of m.surface) if (v > top) top = v;
    expect(top).toBeLessThanOrEqual(16);
  });
});
