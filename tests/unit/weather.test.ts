// The hazards the editor's Drought and Badtide buttons play (core/sim/weather.ts), against the rules
// ported from the cycles investigation: the lengths by difficulty and the badtide's curve.

import { describe, expect, it } from "vitest";
import { DROUGHT } from "../../src/core/gen/calibrated";
import { badtideContamination, hazardDays } from "../../src/core/sim/weather";

describe("the weather the buttons play", () => {
  it("a hazard's length is the longest of its difficulty's range; a drought's is the one the reservoirs are sized for", () => {
    expect(hazardDays("normal", "badtide")).toBe(8);
    expect(hazardDays("hard", "badtide")).toBe(30);
    for (const d of ["easy", "normal", "hard"] as const) expect(hazardDays(d, "drought")).toBe(DROUGHT[d].days);
  });

  it("a badtide's contamination rises from 0.5 to 1 over its first half day, holds, and falls back over its last", () => {
    expect(badtideContamination(0, 8)).toBeCloseTo(0.5, 3);
    expect(badtideContamination(0.25, 8)).toBeGreaterThan(0.5);
    expect(badtideContamination(0.25, 8)).toBeLessThan(1);
    expect(badtideContamination(0.5, 8)).toBe(1);
    expect(badtideContamination(4, 8)).toBe(1);
    expect(badtideContamination(7.75, 8)).toBeCloseTo(badtideContamination(0.25, 8), 9);
    expect(badtideContamination(8, 8)).toBeCloseTo(0.5, 3);
  });
});
