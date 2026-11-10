// The cliffs' normal map (src/render3d/cliffNormal.ts, D497): ours to the game's `Cliff_N` as tools/game-cliff-normal.py
// --measure reads it (numbers only): its slopes' spread and mean, their power by wavelength, the spread its mips keep
// (the GPU's box filter thins it with distance as the game's stored mips do), and one height's two slopes. The offline
// judge (tools/game-cliff-normal.py) lights a wall through it within 0.5 % of the game's at 10 to 100 tiles away.

import { describe, expect, it } from "vitest";
import { CLIFF_NORMAL_SIZE, cliffByte, GAME_CLIFF_NORMAL as G, makeCliffNormal } from "../../src/render3d/cliffNormal";
import { powerByBand } from "../../src/render3d/waterTextures";

const N = CLIFF_NORMAL_SIZE;
const bytes = makeCliffNormal(N);
/** The slopes as the terrain shader reads them (a byte / 255 × 2 − 1). */
const slopes = [0, 1].map((axis) => Float64Array.from({ length: N * N }, (_, i) => (bytes[i * 2 + axis] / 255) * 2 - 1));

function box(f: Float64Array, size: number): Float64Array {
  const m = size / 2;
  const out = new Float64Array(m * m);
  for (let y = 0; y < m; y++)
    for (let x = 0; x < m; x++) {
      const i = 2 * y * size + 2 * x;
      out[y * m + x] = (f[i] + f[i + 1] + f[i + size] + f[i + size + 1]) / 4;
    }
  return out;
}

function meanSpread(f: Float64Array): [number, number] {
  let m = 0;
  for (const v of f) m += v / f.length;
  let q = 0;
  for (const v of f) q += (v - m) * (v - m);
  return [m, Math.sqrt(q / f.length)];
}

describe("the cliffs' normal map", () => {
  it("has the game's slopes: their spread in its mip of 128 texels a tile and their mean tilt", () => {
    for (const axis of [0, 1] as const) {
      const [m, s] = meanSpread(slopes[axis]);
      expect(s, `axis ${axis}: spread`).toBeGreaterThan(G.spread[axis] * 0.98);
      expect(s, `axis ${axis}: spread`).toBeLessThan(G.spread[axis] * 1.02);
      expect(Math.abs(m - G.mean[axis]), `axis ${axis}: mean`).toBeLessThan(0.002);
    }
  });

  it("carries the game's power by wavelength, each band within 0.01", () => {
    for (const axis of [0, 1] as const) {
      const p = powerByBand(slopes[axis], N, 1 / G.tiling, G.bands);
      p.forEach((v, b) => expect(Math.abs(v - G.power[b]), `axis ${axis}, band ${G.bands[b]}–${G.bands[b + 1]} tiles`).toBeLessThan(0.01));
    }
  });

  it("thins with distance as the game's mips do: each mip's spread within 0.02 of the game's at the same texels a tile", () => {
    let f: Float64Array = slopes[0];
    let size = N;
    // (ours starts at the game's first mip, 1024²)
    for (let k = 1; k <= 6; k++) {
      expect(Math.abs(meanSpread(f)[1] - G.mips[k]), `the game's mip ${k} (${2048 >> k}²)`).toBeLessThan(0.02);
      f = box(f, size);
      size /= 2;
    }
  });

  it("is one height's two slopes (its x along u and y along v, as a gradient's)", () => {
    // a gradient field's curl is nothing: ∂x/∂v = ∂y/∂u, so the two cross differences, each across the same 2×2 texels,
    // agree far more than chance
    let same = 0;
    let all = 0;
    const x = slopes[0];
    const y = slopes[1];
    for (let r = 0; r < N - 1; r += 3)
      for (let c = 0; c < N - 1; c += 3) {
        const i = r * N + c;
        const a = (x[i + N] + x[i + N + 1] - x[i] - x[i + 1]) / 2;
        const b = (y[i + 1] + y[i + N + 1] - y[i] - y[i + N]) / 2;
        same += a * b;
        all += (a * a + b * b) / 2;
      }
    expect(same / all).toBeGreaterThan(0.9);
  });

  it("stores a slope as the game does, flat at its mean until made", () => {
    expect(cliffByte(0)).toBe(128);
    expect(cliffByte(-1)).toBe(0);
    expect(cliffByte(1)).toBe(255);
    expect(cliffByte(G.mean[0])).toBe(127);
  });
});
