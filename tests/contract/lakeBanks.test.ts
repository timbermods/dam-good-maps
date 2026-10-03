// A planned lake's banks are read alone before the land is shown (D209, D348): the channels that
// join a lake break its bank on the plan, and may settle too shallow to count. Canyon 128² seed 16's
// lake along a straight trough read 22 tiles straight on the plan and 47 once settled, over the limit
// of 44, on a land already shown: no attempt on it could pass.
import { describe, expect, it } from "vitest";
import { STRAIGHT_LIMITS } from "../../src/core/analysis/straight";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("a lake along a straight trough", () => {
  it("is drawn again before its land is shown (Canyon 128² seed 16)", () => {
    const r = generate(makeSpec({ seed: 16, theme: "canyon", size: { x: 128, y: 128 } }));
    expect(r.info.lakeStraight?.run ?? 0, "the shown land's lakes' longest straight bank").toBeLessThanOrEqual(STRAIGHT_LIMITS.run);
    expect(r.info.straight?.run ?? 0, "the settled water's longest straight bank").toBeLessThanOrEqual(STRAIGHT_LIMITS.run);
    expect(r.report.passed).toBe(true);
  });
});
