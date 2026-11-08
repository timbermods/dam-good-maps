// The game's still detail albedo on its water (Q9 P6, fix/water-detail; D496, D497): its `PhysicalWaterDetailAlbedo`
// at xz × 0.015, not carried by the flow, overlaid on clean water's colour × its albedo and on badwater's base colour.
// Ours is made in code at the game's statistics (waterTextures.ts `makeDetailField`; tools/game-water-shader.py
// --textures measures the game's: numbers only), and both looks, the light look too, draw its pattern, not its mean.

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { badwaterPatternTexture, sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { GAME_BADWATER } from "../../src/render3d/waterPalette";
import { broadShare, DETAIL_COLOUR, DETAIL_FLAT, DETAIL_STORE, detailOf, featureTiles, GAME_DETAIL_TEXTURE as G, makeBadwaterTexture, makeDetailField, PATTERN_PERCENTILES } from "../../src/render3d/waterTextures";

const N = 512;
const REPEAT = 1 / G.tiling;
const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
const U = () => sceneUniforms(1, 1, tex(), tex(), tex(), tex());

describe("the still detail albedo (Q9 P6)", () => {
  const bytes = makeDetailField(N).map(Math.round);
  const [lo, hi] = DETAIL_STORE;
  const score = bytes.map((b) => lo + ((hi - lo) * b) / 255);

  it("is a pattern of our own at the game's statistics: its first component's distribution, feature scale and breadth", () => {
    const n = score.length;
    const mean = score.reduce((a, v) => a + v, 0) / n;
    const spread = Math.sqrt(score.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    expect(Math.abs(mean)).toBeLessThan(0.3);
    expect(Math.abs(spread / G.first.spread - 1)).toBeLessThan(0.05);
    const sorted = Float64Array.from(score).sort();
    PATTERN_PERCENTILES.forEach((q, k) => expect(Math.abs(sorted[Math.floor(q * (n - 1))] - G.first.percentiles[k]), `${q}`).toBeLessThan(1.5));
    // (clouds about 1.5 tiles across at their half-width, most of their spread broad: several tiles)
    expect(Math.abs(featureTiles(score, N, REPEAT) / G.first.feature - 1)).toBeLessThan(0.1);
    [0.25, 0.5, 1, 2, 4].forEach((sigma, k) => expect(Math.abs(broadShare(score, N, sigma, REPEAT) - G.first.broad[k]), `${sigma}`).toBeLessThan(0.04));
  });

  it("draws the game's colours from it: the mean and spread of each channel, the second component by the first", () => {
    const n = bytes.length;
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    for (const b of bytes) detailOf(b).forEach((v, k) => ((sum[k] += v * 255), (sq[k] += (v * 255) ** 2)));
    for (let k = 0; k < 3; k++) {
      const m = sum[k] / n;
      expect(Math.abs(m - G.mean[k]), `mean ${k}`).toBeLessThan(0.5);
      expect(Math.abs(Math.sqrt(sq[k] / n - m * m) / G.spread[k] - 1), `spread ${k}`).toBeLessThan(0.08);
    }
    // the shader's polynomial is detailOf multiplied out; the mean byte draws the game's mean, the texture until made
    for (const b of [0, 37, DETAIL_FLAT, 200, 255]) {
      const x = b / 255;
      const want = detailOf(b);
      for (let k = 0; k < 3; k++) expect(DETAIL_COLOUR.base[k] + DETAIL_COLOUR.lin[k] * x + DETAIL_COLOUR.quad[k] * x * x).toBeCloseTo(want[k], 6);
    }
    detailOf(DETAIL_FLAT).forEach((v, k) => expect(Math.abs(v * 255 - (G.mean[k] + G.second.axis[k] * G.second.fromFirst[0]))).toBeLessThan(0.6));
    // (badwater's mean overlay, and every shader that doesn't sample it, take the texture's mean)
    GAME_BADWATER.detail.forEach((v, k) => expect(v).toBeCloseTo(G.mean[k] / 255, 6));
  });

  it("rides in badwater's texture's B, made in the bake worker, flat at its mean until then", () => {
    const bad = makeBadwaterTexture(64);
    const field = makeDetailField(64);
    for (const i of [0, 100, 2000, 4095]) expect(bad[i * 4 + 2]).toBe(Math.round(field[i]));
    const flat = badwaterPatternTexture().image.data as Uint8Array;
    expect(flat[2]).toBe(DETAIL_FLAT);
  });

  it("is drawn in both looks and the light look, at the game's scale, still, over clean water and badwater alike", () => {
    for (const [look, s] of [
      ["Standard", waterMaterial(U(), false).fragmentShader],
      ["light", waterMaterial(U(), true).fragmentShader],
      ["High", waterMaterial(U(), false, waterHooks()).fragmentShader],
    ] as const) {
      // (at xz × 0.015, the game's `_DetailAlbedoTexTiling`: one repeat 66.7 tiles; by the point, not the flow's phases)
      expect(G.tiling).toBe(0.015);
      expect(s, look).toContain("float b = texture2D(badwaterTex, g * 0.015).b;");
      expect(s, look).toContain("waterDetail = waterDetailAt(g);");
      // (before any of the flow's samples the light look leaves out: the game's Low quality draws it too)
      const main = s.slice(s.indexOf("void main()"));
      expect(main.indexOf("waterDetail = waterDetailAt(g);"), look).toBeLessThan(main.indexOf("#if !LITE"));
      // (clean water's overlay and badwater's both read it)
      expect(s, look).toContain("return mix(2.0 * a * waterDetail, 1.0 - 2.0 * (1.0 - a) * (1.0 - waterDetail), step(0.5, a));");
      expect(s, look).toContain("vec3 over = waterDetailOverlay(col);");
      expect(s, look).toContain("a = mix(a, waterDetailOverlay(a), gameWaterDetail);");
    }
  });
});
