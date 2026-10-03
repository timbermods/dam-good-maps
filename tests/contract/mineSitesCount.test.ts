// Mine sites is a count the player sets, 2–4 (PLAN §5.5; D200, item 47): the map has that many, the
// ones beyond the pair nearer or farther than the band where it has no room. Lake Basin 96² seed 1 at
// Mine sites 4 placed three, without a word (the release-gate generator hunt's finding 6).
import { describe, expect, it } from "vitest";
import { generateLink } from "./genHelpers";

describe("Mine sites places the number set (PLAN §5.5)", () => {
  it("Lake Basin 96² seed 1 at Mine sites 4 has four mine sites", () => {
    const m = generateLink("s=1&t=lakeBasin&z=96&ms=4");
    expect(m.r.report.passed).toBe(true);
    expect(m.objects.filter((o) => o.template === "UndergroundRuins").length).toBe(4);
  });
});
