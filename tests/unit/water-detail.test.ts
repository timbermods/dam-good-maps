// The game's still detail albedo on its water (Q9 P6, fix/water-detail, fix/water-detail-resolution; D496, D497): its
// `PhysicalWaterDetailAlbedo` at xz × 0.015, not carried by the flow, overlaid on clean water's colour × its albedo and
// on badwater's base colour. Ours is made in code at the game's statistics and size (waterTextures.ts
// `makeDetailField`, 2048² as the game's: 31 texels a tile; tools/game-water-shader.py --textures measures the game's:
// numbers only), and both looks, the light look too, draw its pattern, not its mean.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DataTexture, RedFormat } from "three";
import { badwaterPatternTexture, detailTexture, fillDetailTexture, sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { runBake } from "../../src/render3d/high/bake";
import { waterHooks } from "../../src/render3d/high/shaders";
import { GAME_BADWATER } from "../../src/render3d/waterPalette";
import {
  broadShare,
  DETAIL_COLOUR,
  DETAIL_FINE_BANDS,
  DETAIL_FLAT,
  DETAIL_PATTERN,
  DETAIL_STORE,
  DETAIL_TEXTURE_SIZE as N,
  detailOf,
  featureTiles,
  GAME_DETAIL_TEXTURE as G,
  makeBadwaterTexture,
  makeDetailField,
  PATTERN_PERCENTILES,
  powerByBand,
} from "../../src/render3d/waterTextures";

const REPEAT = 1 / G.tiling;
const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
const U = () => sceneUniforms(1, 1, tex(), tex(), tex(), tex());

describe("the still detail albedo (Q9 P6)", () => {
  // (the bytes as stored, its texture's one channel, which the shaders read)
  const bytes = makeDetailField(N);
  const [lo, hi] = DETAIL_STORE;
  const score = Float64Array.from(bytes, (b) => lo + ((hi - lo) * b) / 255);
  const n = score.length;
  const sd = (f: ArrayLike<number>) => {
    let m = 0;
    for (let i = 0; i < f.length; i++) m += f[i] / f.length;
    let q = 0;
    for (let i = 0; i < f.length; i++) q += (f[i] - m) ** 2;
    return Math.sqrt(q / f.length);
  };

  it("is the bytes it was made as when the look was judged (a speed-up of its making never changes them)", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("b6b1412297c4fbf8711d8fe87a2b2fa051abecd0ccc35600526793191e4fc838");
  });

  it("holds the game's resolution and its power by scale, down to the fine swirl under a quarter of a tile", () => {
    // (the game's 2048² over 66.7 tiles: 31 texels a tile, where a 512² held 7.7 and nothing under 0.26 tiles)
    expect(N).toBe(2048);
    expect(bytes.length).toBe(N * N);
    const power = powerByBand(score, N, REPEAT, DETAIL_FINE_BANDS);
    expect(power.length).toBe(G.first.power.length);
    G.first.power.forEach((want, k) => expect(Math.abs(power[k] - want), `${DETAIL_FINE_BANDS[k]}-${DETAIL_FINE_BANDS[k + 1]} tiles`).toBeLessThan(Math.max(0.003, want * 0.1)));
    // (the three bands under half a tile, which the game's texture holds and a 512² couldn't, carry its 5.6 %)
    expect(power.slice(7).reduce((a, b) => a + b, 0)).toBeGreaterThan(0.05);
  });

  it("is a pattern of our own at the game's statistics: its first component's distribution, feature scale and breadth", () => {
    // (stored within its range: its brightest texel the pattern's top, its darkest near the game's darkest, none past an
    // end wrapped round to the other)
    let [min, max] = [255, 0];
    for (const b of bytes) (min = Math.min(min, b)), (max = Math.max(max, b));
    const byte = (v: number) => (255 * (v - lo)) / (hi - lo);
    expect(max).toBeLessThanOrEqual(Math.ceil(byte(DETAIL_PATTERN.top + 1)));
    expect(min).toBeLessThanOrEqual(Math.ceil(byte(G.first.range[0] + 1)));
    const mean = score.reduce((a, v) => a + v, 0) / n;
    const spread = sd(score);
    expect(Math.abs(mean)).toBeLessThan(0.3);
    expect(Math.abs(spread / G.first.spread - 1)).toBeLessThan(0.05);
    const sorted = Float64Array.from(score).sort();
    PATTERN_PERCENTILES.forEach((q, k) => expect(Math.abs(sorted[Math.floor(q * (n - 1))] - G.first.percentiles[k]), `${q}`).toBeLessThan(1.5));
    // (clouds about 1.5 tiles across at their half-width, most of their spread broad: several tiles; measured on the
    // field averaged 4 × 4, which blurs it by a few hundredths of a tile, each share over the whole field's spread)
    const M = N / 4;
    const down = new Float64Array(M * M);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) down[(y >> 2) * M + (x >> 2)] += score[y * N + x] / 16;
    expect(Math.abs(featureTiles(down, M, REPEAT) / G.first.feature - 1)).toBeLessThan(0.1);
    const ratio = sd(down) / spread;
    [0.25, 0.5, 1, 2, 4].forEach((sigma, k) => expect(Math.abs(broadShare(down, M, sigma, REPEAT) * ratio - G.first.broad[k]), `${sigma}`).toBeLessThan(0.04));
  });

  it("draws the game's colours from it: the mean and spread of each channel, the second component by the first", () => {
    const count = new Float64Array(256);
    for (const b of bytes) count[b]++;
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    for (let b = 0; b < 256; b++) if (count[b]) detailOf(b).forEach((v, k) => ((sum[k] += count[b] * v * 255), (sq[k] += count[b] * (v * 255) ** 2)));
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

  it("has a texture of its own, one byte a texel, made in the textures' worker, flat at its mean until then", () => {
    const t = detailTexture();
    expect(U().detailTex.value).toBe(t);
    expect(t.format).toBe(RedFormat);
    expect(t.image.width).toBe(1);
    expect((t.image.data as Uint8Array)[0]).toBe(DETAIL_FLAT);
    // (badwater's texture no longer carries it: its B is unused)
    expect(makeBadwaterTexture(64).filter((_, i) => i % 4 === 2).every((b) => b === 0)).toBe(true);
    expect((badwaterPatternTexture().image.data as Uint8Array)[2]).toBe(0);
    // (the bake's job, with the sources' pattern only for the light look, which makes no other)
    const r = runBake({ id: 1, kind: "detailTexture", shape: false });
    if (r.kind !== "detailTexture") throw new Error(r.kind);
    expect(r.size).toBe(N);
    expect(r.shape).toBeNull();
    fillDetailTexture(r.detail, r.size);
    expect([t.image.width, t.image.height]).toEqual([N, N]);
    expect(t.image.data).toBe(r.detail);
    expect(t.minFilter).not.toBe(t.magFilter);
  });

  it("is drawn in both looks and the light look, at the game's scale, still, over clean water and badwater alike", () => {
    for (const [look, s] of [
      ["Standard", waterMaterial(U(), false).fragmentShader],
      ["light", waterMaterial(U(), true).fragmentShader],
      ["High", waterMaterial(U(), false, waterHooks()).fragmentShader],
    ] as const) {
      // (at xz × 0.015, the game's `_DetailAlbedoTexTiling`: one repeat 66.7 tiles; by the point, not the flow's phases)
      expect(G.tiling).toBe(0.015);
      expect(s, look).toContain("float b = texture2D(detailTex, g * 0.015).r;");
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
