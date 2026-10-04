// The total water cap per theme (D369, `water.no_flood`): Islands' sea may be most of the map (0.70);
// Lake Basin and Any keep 0.55, the rest 0.35.
import { describe, expect, it } from "vitest";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { rulesFor } from "../../src/core/validate/playability";

describe("the water cap per theme (D369)", () => {
  it("lets Islands' sea cover up to 70% of the map, every other theme as it was", () => {
    const cap = (theme: ThemeId) => rulesFor(makeSpec({ seed: 1, theme, size: { x: 128, y: 128 } })).maxWaterShare;
    expect(cap("islands")).toBe(0.7);
    expect(cap("lakeBasin")).toBe(0.55);
    expect(cap("any")).toBe(0.55);
    for (const theme of ["riverValley", "canyon", "highlands", "delta"] as const) expect(cap(theme)).toBe(0.35);
  });
});
