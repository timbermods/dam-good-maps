import { describe, expect, it } from "vitest";
import { bloomLevels, GAME_BLOOM, GAME_BLOOM_LOOKS, inverseTable } from "../../src/render3d/bloom";
import { gamePostRgb } from "../../src/render3d/palette";

const display = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

describe("the game's bloom (D497 as amended 2026-11-08)", () => {
  it("takes the game's values (tools/game-bloom.py): threshold 1.5 as URP converts it, intensity 50, scatter 0.55, clamp 2, 6 levels", () => {
    expect(GAME_BLOOM.threshold).toBeCloseTo(2.5372, 4);
    expect(GAME_BLOOM.intensity).toBe(50);
    expect(GAME_BLOOM.scatter).toBeCloseTo(0.545, 6);
    expect(GAME_BLOOM.clamp).toBe(2);
    expect(GAME_BLOOM.maxIterations).toBe(6);
    // Standard and High, as the game's default preset; the light look never (renderer.ts `blooms`)
    expect(GAME_BLOOM_LOOKS).toEqual({ standard: true, high: true });
  });

  it("builds URP's pyramid: half resolution, floor(log2 of its longer side) - 1 levels, at most 6", () => {
    expect(bloomLevels(640, 400)).toBe(6);
    expect(bloomLevels(40, 20)).toBe(4);
    expect(bloomLevels(2, 2)).toBe(1);
  });

  it("reads a canvas code back to the colour before the grade that the post chain turns into it", () => {
    const t = inverseTable();
    expect(t[0]).toBe(0);
    for (let k = 1; k < 256; k++) expect(t[k]).toBeGreaterThan(t[k - 1]);
    for (const k of [1, 20, 64, 128, 200, 240, 254]) {
      const back = gamePostRgb([display(t[k]), display(t[k]), display(t[k])])[0] * 255;
      expect(back).toBeCloseTo(k, 3);
    }
    // the last code: the least colour that rounds to it, a linear 1.75 (past it the chain changes nothing)
    const top = gamePostRgb([display(t[255]), display(t[255]), display(t[255])])[0] * 255;
    expect(top).toBeCloseTo(254.5, 3);
    expect(t[255]).toBeGreaterThan(1.7);
    expect(t[255]).toBeLessThan(1.8);
  });
});
