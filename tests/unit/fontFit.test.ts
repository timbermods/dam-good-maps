// Labels fit under any system font (src/ui/fontFit.ts): Segoe UI is left exactly as drawn, and a font as wide as Arial (Liberation
// Sans on Linux, 1.7% wider) is scaled too, which a dead band around Segoe UI's width once let clip the shelf's labels.

import { describe, expect, it } from "vitest";
import { fitScales, SEGOE_UI_WIDTH } from "../../src/ui/fontFit";

// what the sample measures at 100px in Chrome (Windows): Arial and Liberation Sans share Arial's widths
const ARIAL = 5004.296875;
const VERDANA = 5642.626953125;
const ROBOTO = 4504.296875;

describe("fitting the labels to the system font", () => {
  it("leaves Segoe UI, and any font narrower than it, exactly as drawn", () => {
    expect(fitScales(SEGOE_UI_WIDTH)).toEqual({ wide: 1, full: 1 });
    expect(fitScales(4918.896484375)).toEqual({ wide: 1, full: 1 });
    expect(fitScales(ROBOTO)).toEqual({ wide: 1, full: 1 });
  });

  it("scales an Arial-width font, so the shelf's labels no longer clip", () => {
    const { wide, full } = fitScales(ARIAL);
    expect(wide).toBeGreaterThan(1.01);
    // the shelf's rows have no slack: all of the extra width, and a little over
    expect(full).toBeGreaterThanOrEqual(ARIAL / SEGOE_UI_WIDTH);
  });

  it("scales a wider font more", () => {
    expect(fitScales(VERDANA).wide).toBeGreaterThan(fitScales(ARIAL).wide);
    expect(fitScales(VERDANA).full).toBeGreaterThan(fitScales(ARIAL).full);
  });
});
