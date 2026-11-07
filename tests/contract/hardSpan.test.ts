// A hard dab's tiles, row by row (D322, D453): `hardSpan` gives exactly the tiles the old test of every tile in the dab's
// box took (d² ≤ reach², round by distance, square by the larger offset), so a hard stroke's map is unchanged while a
// frame at Size 128 fills spans instead of testing some 67,000 tiles a dab.

import { describe, expect, it } from "vitest";
import { hardSpan } from "../../src/core/features/raster/brush";
import { mulberry } from "./brushRandom";

describe("a hard dab's row span", () => {
  it("is the tiles within reach, exactly as the box test took them", () => {
    const rand = mulberry(7);
    for (let n = 0; n < 4000; n++) {
      const reach = Math.floor(rand() * 520);
      const square = rand() < 0.3;
      const cx = Math.floor(rand() * 1100) - 30;
      const tx = Math.floor(cx / 4);
      const r = Math.ceil((reach + 2) / 4);
      const lo = Math.max(0, tx - r);
      const hi = Math.min(255, tx + r);
      const dy = Math.floor(rand() * (2 * reach + 9)) - reach - 4;
      const want: number[] = [];
      for (let x = lo; x <= hi; x++) {
        const dx = 4 * x + 2 - cx;
        const d2 = square ? Math.max(dx * dx, dy * dy) : dx * dx + dy * dy;
        if (d2 <= reach * reach) want.push(x);
      }
      const [a, b] = hardSpan(cx, dy, reach, square, lo, hi);
      const got: number[] = [];
      for (let x = a; x <= b; x++) got.push(x);
      expect(got, `cx ${cx} dy ${dy} reach ${reach} ${square ? "square" : "round"}`).toEqual(want);
    }
  });
});
