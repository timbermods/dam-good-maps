// Ruler-straight channels (D209; src/core/analysis/straight.ts): straight banks at any angle and
// canals (parallel straight banks facing each other) are found; meandering channels and the map's
// own border are not.

import { describe, expect, it } from "vitest";
import { bankContours, straightness } from "../../src/core/analysis/straight";
import { sinDet } from "../../src/core/math/detmath";

const W = 96;
const H = 96;

/** Water along a centreline y = f(x) (or x = f(y) with `vertical`), `half` tiles either side. */
function channel(f: (t: number) => number, half: number, from = 8, to = 88, vertical = false): Float64Array {
  const d = new Float64Array(W * H);
  for (let t = from; t <= to; t++) {
    const c = f(t);
    for (let o = Math.ceil(c - half); o <= Math.floor(c + half); o++) {
      const [x, y] = vertical ? [o, t] : [t, o];
      if (x >= 0 && y >= 0 && x < W && y < H) d[y * W + x] = 1;
    }
  }
  return d;
}

describe("straight channels", () => {
  it("finds a ruler-straight channel along the grid, and its parallel banks as a canal", () => {
    const s = straightness(W, H, channel(() => 48, 2));
    expect(s.longest!.length).toBeGreaterThanOrEqual(80);
    expect(s.canal!.length).toBeGreaterThanOrEqual(75);
    expect(s.canal!.width).toBeGreaterThanOrEqual(4);
  });

  it("finds a straight channel at 45° and at an odd angle", () => {
    const d45 = straightness(W, H, channel((t) => t, 2, 10, 80));
    expect(d45.longest!.length).toBeGreaterThanOrEqual(100);
    expect(d45.canal!.length).toBeGreaterThan(40);
    const odd = straightness(W, H, channel((t) => 20 + 0.37 * t, 2, 4, 90));
    expect(odd.longest!.length).toBeGreaterThanOrEqual(80);
    expect(odd.canal!.length).toBeGreaterThan(50);
  });

  it("finds no long straight bank on a meandering channel", () => {
    const m = straightness(W, H, channel((t) => 48 + 5 * sinDet((6.283185307179586 * t) / 24) + 2 * sinDet((6.283185307179586 * t) / 9), 2));
    expect(m.longest!.length).toBeLessThan(24);
    expect(m.canal?.length ?? 0).toBeLessThan(16);
  });

  it("never counts the map's border as a bank", () => {
    const d = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < 30; x++) if ((x - 10) * (x - 10) + (y - 48) * (y - 48) < 30 * 30 + 12 * Math.abs(y - 48)) d[y * W + x] = 1;
    for (const chain of bankContours(W, H, (i) => d[i] > 0))
      for (let k = 0; k + 1 < chain.length; k++) {
        const [ax, ay] = chain[k];
        const [bx, by] = chain[k + 1];
        // no edge runs along x = 0, y = 0 or the far sides
        expect(ax === bx && (ax === 0 || ax === W)).toBe(false);
        expect(ay === by && (ay === 0 || ay === H)).toBe(false);
      }
  });

  it("is a pure function of the water", () => {
    const d = channel((t) => 30 + 0.5 * t, 3);
    expect(JSON.stringify(straightness(W, H, d))).toBe(JSON.stringify(straightness(W, H, d)));
  });
});
