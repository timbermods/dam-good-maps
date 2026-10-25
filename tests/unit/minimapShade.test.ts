// The minimap's water pass shades only the tiles the water moved on (D453): after any run of passes over changing water,
// the image holds exactly the colours of one whole shade of the last water (`shadeTiles`, north at the top), the rows it
// says it shaded hold every pixel that changed (the page puts only those), and water that shows the same shades nothing.

import { describe, expect, it } from "vitest";
import { groundShade, shadeRgba, shadeTiles } from "../../src/core/render/shade";

/** A small deterministic random source. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** `shadeTiles`' colours as an image: RGBA, north (the last row of tiles) at the top. */
function wholeImage(heights: Uint8Array, W: number, H: number, water: Float32Array | null): Uint8ClampedArray {
  const t = shadeTiles(heights, W, H, water);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      out.set([t[i * 3], t[i * 3 + 1], t[i * 3 + 2], 255], ((H - 1 - y) * W + x) * 4);
    }
  return out;
}

/** The image rows where two images differ. */
function rowsChanged(a: Uint8ClampedArray, b: Uint8ClampedArray, W: number): number[] {
  const rows = new Set<number>();
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) rows.add(Math.floor(k / 4 / W));
  return [...rows];
}

describe("the minimap's water pass", () => {
  it("gives a whole shade's bytes after any run of passes, and says which rows it shaded", () => {
    const W = 37;
    const H = 23;
    const r = rng(7);
    const heights = new Uint8Array(W * H).map(() => 3 + Math.floor(r() * 12));
    const ground = groundShade(heights, W, H);
    const shown = new Float64Array(W * H).fill(NaN);
    const out = new Uint8ClampedArray(W * H * 4);

    // the first pass shades every pixel
    expect(shadeRgba(ground, W, H, null, shown, out)).toEqual({ y0: 0, y1: H });
    expect(out).toEqual(wholeImage(heights, W, H, null));

    let water = new Float32Array(W * H);
    for (let step = 0; step < 60; step++) {
      water = water.slice();
      // water spreads over a patch or drains from it, and a few tiles change by too little to show
      const x0 = Math.floor(r() * W);
      const y0 = Math.floor(r() * H);
      for (let y = y0; y < Math.min(H, y0 + 1 + Math.floor(r() * 6)); y++)
        for (let x = x0; x < Math.min(W, x0 + 1 + Math.floor(r() * 9)); x++) water[y * W + x] = r() < 0.3 ? 0 : r() * 4;
      for (let k = 0; k < 3; k++) water[Math.floor(r() * W * H)] = r() * 0.05;
      // (now and then the map has no water at all)
      const now = step % 9 === 8 ? null : water;
      const before = out.slice();
      const rows = shadeRgba(ground, W, H, now, shown, out);
      expect(out, `pass ${step}`).toEqual(wholeImage(heights, W, H, now));
      for (const row of rowsChanged(before, out, W)) {
        expect(rows, `pass ${step}`).not.toBeNull();
        expect(row, `pass ${step}`).toBeGreaterThanOrEqual(rows!.y0);
        expect(row, `pass ${step}`).toBeLessThan(rows!.y1);
      }
    }

    // the same water again shades nothing; water too shallow to show is no water
    shadeRgba(ground, W, H, water, shown, out);
    expect(shadeRgba(ground, W, H, water, shown, out)).toBeNull();
    shadeRgba(ground, W, H, null, shown, out);
    expect(shadeRgba(ground, W, H, new Float32Array(W * H).fill(0.04), shown, out)).toBeNull();
  });
});
