// A land whose own water floods past its theme's line (`water.no_flood`) is drawn again at the land stage, before
// its start, its badwater and its settle (D348; planning's ruling on #236, 2026-11-15): never shown and then failed
// on every attempt. Any 256² seed 4 is the first case: on generator 0.10.29 its second land's lakes stood over 61%
// of the map against Any's 55%, and it was shown and failed `water.no_flood` on six attempts across two rounds
// before a rescue round drew another land (8 attempts, 241 s). D530 records it, and with it the river cut to carry
// its water: River Valley 256² seed 4's main river (14.4 water/s through ten tiles) stood 1.1 deep along 400 tiles of
// flat bed on the beds' floor and spread over its floor a level up, a sheet under 0.2 deep over 24% of the map.
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { rulesFor } from "../../src/core/validate/playability";

describe("a land that floods on its own is turned down before it is shown, and a river is cut to carry its water (D530)", () => {
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

  it("River Valley 256² seed 4: the main river stays in its channel, no sheet over its floor", () => {
    const spec = makeSpec({ seed: 4, size: { x: 256, y: 256 }, theme: "riverValley" });
    const r = generate(spec);
    const w = r.built.water;
    let thin = 0;
    for (let i = 0; i < w.length; i++) if (w[i] > 0.05 && w[i] <= 0.2) thin++;
    expect(thin / w.length, "the share of the map under a sheet of water under 0.2 deep").toBeLessThan(0.02);
    const flood = r.report.checks.find((c) => c.id === "water.no_flood")!;
    expect(flood.ok, flood.message).toBe(true);
    expect(r.report.passed).toBe(true);
  });
});
