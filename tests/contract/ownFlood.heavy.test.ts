// A land whose own water floods past its theme's line (`water.no_flood`) is drawn again at the land stage, before
// its start, its badwater and its settle (D348; planning's ruling on #236, 2026-11-15): never shown and then failed
// on every attempt. Any 256² seed 4 is the first case: on generator 0.10.29 its second land's lakes stood over 61%
// of the map against Any's 55%, and it was shown and failed `water.no_flood` on six attempts across two rounds
// before a rescue round drew another land (8 attempts, 241 s). D530 records it.
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { rulesFor } from "../../src/core/validate/playability";

describe("a land that floods on its own is turned down before it is shown (D530)", () => {
  it("Any 256² seed 4: the flooded land is drawn again at the land stage, and the kept map passes water.no_flood", () => {
    const spec = makeSpec({ seed: 4, size: { x: 256, y: 256 }, theme: "any" });
    const line = rulesFor(spec).maxWaterShare;
    const refused: number[] = [];
    let shownFloods = 0;
    const r = generate(spec, {
      onAttempt: (a) => {
        if (a.result.info.stage === "a flooded land (planned)") {
          expect(a.land, "refused before it was shown").toBe("drawn");
          expect(a.result.info.ownFlood!, "its own water over the line").toBeGreaterThan(line);
          refused.push(a.attempt);
        }
        if (a.failed.includes("water.no_flood")) shownFloods++;
      },
    });
    expect(refused.length, "the flooded land refused at the land stage").toBeGreaterThan(0);
    expect(shownFloods, "no attempt failed water.no_flood").toBe(0);
    const flood = r.report.checks.find((c) => c.id === "water.no_flood")!;
    expect(flood.ok, flood.message).toBe(true);
    expect(r.report.passed).toBe(true);
  });
});
