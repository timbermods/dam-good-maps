// Mine sites is a count the player sets, 2–4 (PLAN §5.5; D200, item 47): the map has that many. Lake
// Basin 96² seed 1 at Mine sites 4 places three, without a word (the check only asks that two be
// reached). 1 of 9 maps at Mine sites 4 in the extremes sweep.
import { describe, expect, it } from "vitest";
import { generateLink } from "./genHelpers";

describe("Mine sites places the number set (PLAN §5.5)", () => {
  it("Lake Basin 96² seed 1 at Mine sites 4 has four mine sites", () => {
    const m = generateLink("s=1&t=lakeBasin&z=96&ms=4");
    expect(m.r.report.passed).toBe(true);
    expect(m.objects.filter((o) => o.template === "UndergroundRuins").length).toBe(4);
  });
});
