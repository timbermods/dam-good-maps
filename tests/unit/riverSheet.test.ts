// A shallow sheet over a flat (D372): a planned lake standing at its level over a broad flat spreads
// over it as a sheet about a level deep or less; a land with one over about 5% of the map is drawn
// again; the deep water a lake's banks hold, of the same area, is no sheet.
import { describe, expect, it } from "vitest";
import type { Hydro } from "../../src/core/land/hydro";
import { shallowSheet, SHEET_MOST } from "../../src/core/land/sheets";

const W = 100;
const H = 100;
const N = W * H;

/** Upland at 8; a planned lake (outlet bed 4: it stands at 4.6) at 2, and beside it a flat of 600
 *  tiles (6% of the map) at 4, under its level, or at 5, over it. */
function land(flat: number): { h: Uint8Array; hy: Pick<Hydro, "lakes" | "rivers"> } {
  const h = new Uint8Array(N).fill(8);
  const tiles: number[] = [];
  for (let y = 40; y <= 49; y++)
    for (let x = 20; x < 50; x++) {
      h[y * W + x] = 2;
      tiles.push(y * W + x);
    }
  for (let y = 50; y <= 69; y++) for (let x = 20; x < 50; x++) h[y * W + x] = flat;
  return { h, hy: { lakes: [{ tiles, outletBed: 4, river: "r" }], rivers: [] } };
}

describe("a shallow sheet over a flat (D372)", () => {
  it("is found where a planned lake's level stands over a flat larger than 5% of the map", () => {
    const { h, hy } = land(4);
    expect(shallowSheet(h, W, H, hy).share).toBeGreaterThan(SHEET_MOST);
  });
  it("is not found where the flat stands over the lake's level, or for the lake's own deep water", () => {
    const { h, hy } = land(5);
    expect(shallowSheet(h, W, H, hy).share).toBeLessThan(SHEET_MOST);
  });
});
