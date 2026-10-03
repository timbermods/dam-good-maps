// A lake its own river drains leaves its old bed standing beside the channel, a band of rock with
// the river cut through it (terrain.dam_wall). The plan counts that lake full, so the dam-wall check
// on the planned water passed, and the wall showed on the settled water only, on a land already
// shown: every attempt failed (Any 96² seed 18, Lake Basin 128² seed 5). The check also reads the
// pre-fill alone, the water the settle starts from, without its thin water.
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("a wall left by a drained lake", () => {
  it("is found before the land is shown, and the land drawn again", () => {
    for (const [theme, seed, size] of [
      ["any", 18, 96],
      ["lakeBasin", 5, 128],
    ] as const) {
      const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
      const wall = r.report.checks.find((c) => c.id === "terrain.dam_wall");
      expect(wall?.ok, `${theme} ${seed} at ${size}: ${wall?.message}`).toBe(true);
      expect(r.report.passed, `${theme} ${seed} at ${size} passes`).toBe(true);
    }
  });
});
