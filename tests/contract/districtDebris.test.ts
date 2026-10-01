// The debris before a second district (item 47's intention, a Blockage across the narrowest way to
// the site) is set after the mine sites: on Delta 128² seed 37 it stood across the colony's way to
// both, so every attempt on the shown land failed `resources.mine_site` (0 of 2 reached). The
// generator reads "reached" with the check's own function (D342) and leaves such debris out.
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("the debris before a second district", () => {
  it("never cuts the colony off from a mine site it reached (Delta 128² seed 37)", () => {
    const r = generate(makeSpec({ seed: 37, theme: "delta", size: { x: 128, y: 128 } }));
    const mines = r.report.checks.find((c) => c.id === "resources.mine_site");
    expect(mines?.ok, mines?.message).toBe(true);
    expect(r.report.passed).toBe(true);
  });
});
