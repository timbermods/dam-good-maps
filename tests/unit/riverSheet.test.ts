// A river spreading as a shallow sheet over a flat (D372): a land whose river would spread over a flat
// larger than about 5% of the map is drawn again before it is shown; deep standing water with banks of
// the same area is no sheet.
import { describe, expect, it } from "vitest";
import { riverSheet, SHEET_MOST } from "../../src/core/land/sheets";

const W = 100;
const H = 100;
const N = W * H;

/** Upland at 8; a river's channel at 4 along y = 50; a flat or a lake of `area` tiles beside it. */
function land(kind: "flat" | "banked" | "lake"): { h: Uint8Array; water: Uint8Array } {
  const h = new Uint8Array(N).fill(8);
  const water = new Uint8Array(N);
  for (let x = 0; x < W; x++) {
    h[50 * W + x] = 4;
    water[50 * W + x] = 1;
  }
  // (a flat of 30 × 20 = 600 tiles, 6% of the map, north of the river)
  for (let y = 51; y <= 70; y++)
    for (let x = 20; x < 50; x++) {
      const i = y * W + x;
      if (kind === "flat") h[i] = 4;
      else if (kind === "banked") h[i] = 5;
      else {
        h[i] = 2;
        water[i] = 2;
      }
    }
  return { h, water };
}

describe("a river's sheet over a flat (D372)", () => {
  it("finds a flat at the river's own level larger than 5% of the map", () => {
    const { h, water } = land("flat");
    expect(riverSheet(h, W, H, water).share).toBeGreaterThan(SHEET_MOST);
  });
  it("reads no sheet where a bank a level over the river holds it, or where the water is a deep lake", () => {
    for (const kind of ["banked", "lake"] as const) {
      const { h, water } = land(kind);
      expect(riverSheet(h, W, H, water).share, kind).toBeLessThan(SHEET_MOST);
    }
  });
});
