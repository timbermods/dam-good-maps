import { describe, expect, it } from "vitest";
import { bloomLevels, bloomLift, GAME_BLOOM, GAME_BLOOM_LOOKS, inverseTable } from "../../src/render3d/bloom";
import { BIRCH_BARK } from "../../src/render3d/entities3d";
import { paletteDefaults } from "../../src/render3d/high/models";
import { GAME_LIGHT, GAME_SKY, gameAmbient, gamePostRgb, LIGHT, MINE, RUIN, START, TREE_COLOURS } from "../../src/render3d/palette";

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

  // The renderer skips the bloom's passes unless an eruption's lava glows (renderer.ts `blooms`, D453): by day nothing
  // may pass the knee, or the skip would change a pixel. These hold the day's brightest under it, so a brighter colour
  // fails here rather than silently missing its bloom.
  const knee = GAME_BLOOM.threshold / 2;
  /** The brightest a face of colour `c` shows in the game's light by day (display values, its brightest channel): the
   *  ambient by its normal and the sun at `LIGHT.sunElevation` by n·L, over every normal (`upright`: level normals only,
   *  for posts, beams and trunks). Specular left out: a few thousandths on these. */
  const lit = (c: readonly number[], upright = false) => {
    const el = LIGHT.sunElevation;
    let best = 0;
    for (let i = 0; i <= 400; i++) {
      const y = upright ? 0 : -1 + (2 * i) / 400;
      const nl = upright ? Math.cos(el) : Math.max(0, Math.cos(Math.acos(y) - (Math.PI / 2 - el)));
      const a = gameAmbient(y);
      for (let k = 0; k < 3; k++) best = Math.max(best, c[k] * GAME_LIGHT.diffuse * (a[k] + GAME_LIGHT.sun[k] * nl));
    }
    return best;
  };
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const codeChange = (lift: number) => {
    const t = inverseTable();
    let worst = 0;
    for (let k = 0; k < 255; k++) worst = Math.max(worst, gamePostRgb([display(t[k] + lift), display(t[k] + lift), display(t[k] + lift)])[0] * 255 - k);
    return worst;
  };

  it("takes nothing under its knee (1.269), the prefilter's soft knee as URP's", () => {
    expect(knee).toBeCloseTo(1.2686, 4);
    expect(bloomLift(knee - 1e-6)).toBe(0);
    expect(bloomLift(1)).toBe(0);
    expect(bloomLift(knee + 0.05)).toBeGreaterThan(0);
    // (a source is clamped at 2 first, under the threshold: the knee's curve is all it ever feeds)
    expect(bloomLift(3)).toBe(bloomLift(2));
    expect(bloomLift(2)).toBeCloseTo((GAME_BLOOM.intensity * (2 - knee) ** 2) / (4 * knee), 2);
  });

  it("finds every model colour a face can turn to the sun under the knee in the game's light by day", () => {
    const faces: [string, readonly number[]][] = [
      ...Object.entries(START).map(([k, c]) => [`START.${k}`, c] as [string, readonly number[]]),
      ...Object.entries(TREE_COLOURS).map(([k, c]) => [`TREE_COLOURS.${k}`, c] as [string, readonly number[]]),
      // (a panel's shade at most 1.02: entities3d.ts storey)
      ["RUIN.panel", RUIN.panel.map((v) => v * 1.02)],
      ...MINE.rubble.map((c, k) => [`MINE.rubble.${k}`, c] as [string, readonly number[]]),
      ...(["wood", "earthTop", "seam", "ladder", "frame", "earth"] as const).map((k) => [`MINE.${k}`, MINE[k]] as [string, readonly number[]]),
      // High's models, all but the birch's bark (below) and its marks on it
      ...Object.entries(paletteDefaults)
        .filter(([k]) => !["birchBark", "birchDead"].includes(k))
        .map(([k, h]) => [`high.${k}`, hex(h)] as [string, readonly number[]]),
    ];
    for (const [name, c] of faces) expect(lit(c), name).toBeLessThan(knee);
    // the brightest: the mine's pale rubble, then the ruins' panels, High's berries and the start's roof
    expect(Math.max(...faces.map(([, c]) => lit(c)))).toBeLessThan(1.263);
  });

  it("holds the colours whose bound passes the knee at what every frame measured shows of them", () => {
    // These pass the knee only on a face square to the sun, which no frame of ~2,900 day views measured shows
    // (`.scratch` probe, 2026-11-08: ruins 1.20, birches 1.27, mines' roots in their pit): the ruins' rust skeleton
    // (upright posts, beams and struts, a shade at most 1.05) and a mine's pale roots (hanging cones), lit level; the
    // birch's bark stands in its crown's shade. Their bounds are held where they are, so none gets brighter unseen; the
    // birch's bark is the game's to follow (its mean albedo 0.525/0.474/0.392, `tools/game-model-albedo.py BirchMature`).
    expect(lit(RUIN.rust.map((v) => v * 1.05), true)).toBeLessThan(1.283);
    expect(lit(MINE.rootPale, true)).toBeLessThan(knee);
    expect(lit(BIRCH_BARK, true)).toBeLessThan(1.369);
    expect(lit(hex(paletteDefaults.birchBark), true)).toBeLessThan(1.42);
  });

  it("finds the sky's brightest, its clouds at their densest, at the knee's foot, where it changes no canvas code", () => {
    const C = GAME_SKY.clouds;
    const n = GAME_SKY.day.length;
    // a cloud's density at most: every octave of its shape at its top
    const cloud = Math.min(1, Math.max(0, 0.52 + 0.5 * C.spread + C.densityOffset) ** C.densityPower * C.blending);
    let sky = 0;
    for (let i = 0; i <= 10000; i++) {
      const e = i / 10000;
      const u = e * (n - 1);
      const k = Math.min(Math.floor(u), n - 2);
      const band = e > C.start[0] && e < C.end[1] ? 1 : 0;
      for (let ch = 0; ch < 3; ch++) sky = Math.max(sky, GAME_SKY.day[k][ch] + (GAME_SKY.day[k + 1][ch] - GAME_SKY.day[k][ch]) * (u - k) + band * cloud * GAME_LIGHT.sun[ch]);
    }
    expect(sky).toBeLessThan(knee + 0.003);
    // what that feeds the bloom moves no code of the canvas, however dark the pixel it lands on
    expect(codeChange(bloomLift(sky))).toBeLessThan(0.5);
  });
});
