// A gorge winds at the map's own scale (D(highlands-slot), land/hydro.ts `gorgeWander`): under 128² its meander's
// wavelength and its ends' taper shrink with the narrower side's ratio to 128, never under half; 128² and up keep them.
import { describe, expect, it } from "vitest";
import { gorgeWander, meanderPath, type Wander } from "../../src/core/land/hydro";

const wv: Wander = { amp: 2.87, minAmp: 2.01, cell: 27, widthVar: 0.32 };

describe("a gorge's wander", () => {
  it("draws its wavelength and taper at the map's scale under 128², never under half", () => {
    expect(gorgeWander(wv, 48, 48)).toEqual({ ...wv, cell: 13.5, taper: 4 });
    expect(gorgeWander(wv, 96, 96)).toEqual({ ...wv, cell: 20.25, taper: 5 });
    // a long map reads its narrower side
    expect(gorgeWander(wv, 64, 192).cell).toBe(13.5);
  });

  it("leaves 128² and up as they were", () => {
    expect(gorgeWander(wv, 128, 128)).toBe(wv);
    expect(gorgeWander(wv, 256, 128)).toBe(wv);
  });

  it("bends a straight 45° course more often at a small map's scale", () => {
    const n = 48;
    const h = new Uint8Array(n * n).fill(8);
    const line: [number, number][] = [];
    for (let k = 0; k <= 40; k++) line.push([4 + k, 4 + k]);
    // the sign changes of the course's offset from the diagonal: its bends
    const bends = (w: Wander) => {
      const off = meanderPath(line, h, n, n, w, 7).map(([x, y]) => (y - x) / Math.SQRT2);
      let c = 0;
      for (let k = 1; k < off.length; k++) if (Math.sign(off[k]) !== Math.sign(off[k - 1]) && Math.abs(off[k] - off[k - 1]) > 0) c++;
      return c;
    };
    expect(bends(gorgeWander(wv, n, n))).toBeGreaterThan(bends(wv));
  });
});
