// The pattern contaminated ground takes (D154, D334 as amended 2026-11-07): ours, made in code to the statistics the
// game's own `SoilContamination` texture has (src/render3d/soilTexture.ts `GAME_SOIL_TEXTURE`, measured by
// `python tools/game-water-shader.py --soil`): its cover, its mean alpha, its soft edge, its crack and between colours.

import { describe, expect, it } from "vitest";
import { GAME_SOIL_TEXTURE, makeSoilTexture } from "../../src/render3d/soilTexture";
import { CONTAMINATION } from "../../src/render3d/palette";

describe("the contamination pattern", () => {
  const size = 256;
  const data = makeSoilTexture(size);
  const n = size * size;

  it("covers the ground as the game's does: a fifth in its cracks, the same mean alpha, a soft edge as narrow", () => {
    let over = 0;
    let soft = 0;
    let alpha = 0;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3];
      if (a > 128) over++;
      if (a >= 8 && a <= 240) soft++;
      alpha += a;
    }
    expect(over / n).toBeCloseTo(GAME_SOIL_TEXTURE.cover, 2);
    expect(Math.abs(alpha / n / 255 - GAME_SOIL_TEXTURE.meanAlpha)).toBeLessThan(0.02);
    expect(Math.abs(soft / n - GAME_SOIL_TEXTURE.soft)).toBeLessThan(0.03);
    // (the light look's mean and the palette read the same numbers)
    expect(CONTAMINATION.cover).toBe(GAME_SOIL_TEXTURE.cover);
    expect(CONTAMINATION.meanAlpha).toBe(GAME_SOIL_TEXTURE.meanAlpha);
  });

  it("is the game's dark rust in its cracks and the game's brown between them", () => {
    const inCrack = [0, 0, 0];
    const between = [0, 0, 0];
    let ni = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3];
      const to = a > 128 ? inCrack : a < 8 ? between : null;
      if (!to) continue;
      for (let c = 0; c < 3; c++) to[c] += data[i * 4 + c];
      if (a > 128) ni++;
      else nb++;
    }
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(inCrack[c] / ni - GAME_SOIL_TEXTURE.vein[c])).toBeLessThan(4);
      expect(Math.abs(between[c] / nb - GAME_SOIL_TEXTURE.between[c])).toBeLessThan(2);
    }
  });

  it("tiles: its left edge meets its right and its top its bottom with no seam", () => {
    let jump = 0;
    let inside = 0;
    for (let y = 0; y < size; y++) {
      jump += Math.abs(data[(y * size + size - 1) * 4 + 3] - data[y * size * 4 + 3]);
      inside += Math.abs(data[(y * size + 100) * 4 + 3] - data[(y * size + 101) * 4 + 3]);
    }
    for (let x = 0; x < size; x++) jump += Math.abs(data[((size - 1) * size + x) * 4 + 3] - data[x * 4 + 3]);
    // (a seam is a jump no greater than between any two neighbouring texels inside)
    expect(jump / (2 * size)).toBeLessThan((inside / size) * 2 + 4);
  });
});
