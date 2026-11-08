// The surface the water's flow carries, as the game draws it (Q9 P5, P11; D496, D497): our own textures at the
// statistics measured in the game's (`python tools/game-water-shader.py --textures`, waterTextures.ts
// GAME_FLOW_TEXTURES), the game's flow (each column's outflows ÷ 14) and its two phases in both looks' shaders, and
// none of the terms the water had of our own (D334's light network, ribbons, swells, packets, streaks and crests).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { flowByte } from "../../src/render3d/high/bake";
import { gameFlowOf } from "../../src/render3d/current";
import { albedoOf, broadShare, featureTiles, fitAlbedo, GAME_BADWATER_TEXTURE as BAD_TEX, GAME_FLOW_TEXTURES as GAME, makeBadwaterTexture, makeWaterTexture, PATTERN_PERCENTILES, slopesOf, WATER_ALBEDO, WATER_FLOW, WATER_TEXTURE_SIZE } from "../../src/render3d/waterTextures";
import { badwaterBody, badwaterGlow, GAME_BADWATER, GAME_WATER, gameBadwaterColour, WATER, gameBadwaterEmission, gameCleanColour, gameDepthG, gameDepthR, WATER_LIGHT } from "../../src/render3d/waterPalette";
import { GAME_LIGHT, gameAmbient, LIGHT, sunlitTop, waterShown } from "../../src/render3d/palette";
import { dayLight } from "../../tools/game-day-light";

const N = WATER_TEXTURE_SIZE;
const data = makeWaterTexture(N);

function stats(f: Float64Array) {
  const s = Float64Array.from(f).sort();
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const spread = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const p = (q: number) => s[Math.floor(q * (n - 1))];
  return { mean, spread, p5: p(0.05), p50: p(0.5), p95: p(0.95) };
}

describe("the water's textures", () => {
  const n = N * N;
  const ch = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const luma = new Float64Array(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = albedoOf(data[i * 4], data[i * 4 + 1]);
    for (let k = 0; k < 3; k++) ch[k][i] = a[k] * 255;
    luma[i] = 0.2126 * ch[0][i] + 0.7152 * ch[1][i] + 0.0722 * ch[2][i];
    [sx[i], sy[i]] = slopesOf(data[i * 4 + 2], data[i * 4 + 3]);
  }

  it("make an albedo at the game's statistics: its mean, spread and percentiles per channel, and its feature size", () => {
    for (let k = 0; k < 3; k++) {
      const s = stats(ch[k]);
      const c = "rgb"[k];
      expect(Math.abs(s.mean - GAME.albedo.mean[k]), `${c} mean`).toBeLessThan(1);
      expect(Math.abs(s.spread / GAME.albedo.spread[k] - 1), `${c} spread`).toBeLessThan(0.15);
      expect(Math.abs(s.p5 - GAME.albedo.p5[k]), `${c} p5`).toBeLessThan(5);
      expect(Math.abs(s.p50 - GAME.albedo.p50[k]), `${c} p50`).toBeLessThan(5);
      expect(Math.abs(s.p95 - GAME.albedo.p95[k]), `${c} p95`).toBeLessThan(5);
    }
    expect(Math.abs(featureTiles(luma, N) / GAME.albedo.feature - 1)).toBeLessThan(0.25);
  });

  it("make the normal's slopes at the game's spread, percentiles and feature size", () => {
    for (const f of [sx, sy]) {
      const s = stats(f);
      expect(Math.abs(s.mean)).toBeLessThan(0.02);
      expect(Math.abs(s.spread / GAME.normal.spread - 1)).toBeLessThan(0.15);
      expect(Math.abs(s.p5 - GAME.normal.p5)).toBeLessThan(0.04);
      expect(Math.abs(s.p95 - GAME.normal.p95)).toBeLessThan(0.04);
      expect(Math.abs(featureTiles(f, N) / GAME.normal.feature - 1)).toBeLessThan(0.25);
    }
  });

  it("draw the albedo the shaders use from the fit to these bytes, and the placeholder at its mean", () => {
    const fit = fitAlbedo(data);
    for (let k = 0; k < 3; k++) {
      expect(fit.base[k]).toBeCloseTo(WATER_ALBEDO.base[k], 4);
      expect(fit.network[k]).toBeCloseTo(WATER_ALBEDO.network[k], 4);
      expect(fit.blobs[k]).toBeCloseTo(WATER_ALBEDO.blobs[k], 4);
      expect(WATER_ALBEDO.mean[k] * 255).toBeCloseTo(GAME.albedo.mean[k], 6);
    }
    let r = 0;
    let g = 0;
    for (let i = 0; i < n; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
    }
    expect(r / n).toBeCloseTo(WATER_ALBEDO.flat[0], 1);
    expect(g / n).toBeCloseTo(WATER_ALBEDO.flat[1], 1);
    const flat = albedoOf(WATER_ALBEDO.flat[0], WATER_ALBEDO.flat[1]);
    for (let k = 0; k < 3; k++) expect(flat[k] * 255).toBeCloseTo(GAME.albedo.mean[k], 1);
  });
});

describe("the water's flow", () => {
  it("is each column's outflow ÷ 14, averaged with its wet neighbours, as the game's vertex does", () => {
    // a 3 × 1 river flowing +x: every column hands 7 to its right (outflows in the order −y, −x, +y, +x)
    const W = 3;
    const H = 1;
    const out = new Float32Array(W * H * 4);
    for (let i = 0; i < W; i++) out[i * 4 + 3] = 7;
    const f = gameFlowOf(W, H, out, [1, 1, 1], WATER_FLOW.maxOutflow);
    for (let i = 0; i < W; i++) {
      expect(f[i * 2]).toBeCloseTo(0.5, 6);
      expect(f[i * 2 + 1]).toBe(0);
    }
    // a dry neighbour neither takes part nor gets a flow
    const g = gameFlowOf(W, H, out, [1, 1, 0], WATER_FLOW.maxOutflow);
    expect(g[4]).toBe(0);
    // flowing −y (toward the map's first row)
    const up = new Float32Array(4);
    up[0] = 14;
    expect(gameFlowOf(1, 1, up, [1], 14)[1]).toBeCloseTo(-1, 6);
  });

  it("is stored as a byte that keeps a slow drift's precision, and the shaders square it back", () => {
    expect(flowByte(0)).toBe(128);
    expect(flowByte(1)).toBe(255);
    expect(flowByte(-1)).toBe(1);
    expect(flowByte(2)).toBe(255);
    for (const f of [0.01, 0.05, 0.2, -0.3, 0.7]) {
      const e = (flowByte(f) - 128) / 127;
      expect(Math.abs(e * Math.abs(e) - f)).toBeLessThan(Math.max(0.01, Math.abs(f) * 0.05));
    }
  });
});

describe("both looks' water shaders", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);
  const looks = [
    { look: "Standard", s: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false).fragmentShader },
    { look: "light", s: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), true).fragmentShader },
    { look: "High", s: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()).fragmentShader },
  ];

  it("carry the game's two phases of the flow (Q9 P5): t × 0.4, half a cycle apart, at xz × 0.06 − f × frac × 2", () => {
    for (const { look, s } of looks) {
      expect(s, look).toContain("uniform sampler2D waterTex;");
      expect(s, look).toContain("float ph = t * 0.4;");
      expect(s, look).toContain("float b = fract(ph + 0.5);");
      expect(s, look).toContain("pa = g + (fract(floor(ph) * vec2(0.3, 0.42)) - f * a * 2.0) / 0.06;");
      expect(s, look).toContain("pb = g + (fract(floor(ph + 0.5) * vec2(0.58, 0.73)) - f * b * 2.0) / 0.06;");
      expect(s, look).toContain("w = abs(2.0 * a - 1.0);");
      expect(s, look).toContain("waterPhases(g, flow, t, pa, pb, pw);");
      expect(s, look).toContain("surf = waterSurfaceAt(pa, pb, pw);");
      // the albedo multiplies the colour; the normal is the surface's, × 4 and × 2 more on badwater (P11)
      expect(s, look).toContain("vec3 albedo = waterAlbedo(surf);");
      expect(s, look).toContain("vec2 b = sl * 4.0 * (1.0 + share);");
      expect(s, look).toContain("N = waterFlowNormal(surf, cont);");
      expect(s, look).toMatch(/body \*= albedo \/ WATER_ALBEDO_MEAN;/);
    }
  });

  it("have none of the water's own terms (D334's, superseded by D496 and D497 for its water)", () => {
    const gone = [
      // Standard: its pale streaks, crests' light, slowed badwater ripples and own drift
      "WATER_PALE",
      "WATER_CREST",
      "crest",
      "float slow",
      "flowingAt",
      "waterCurrent",
      // High: its chop streaks, grazing and streak colours, light network, ribbons, swells, rolling packets, brightness
      // swing, still-water drift, its own ripples and a film's lifted opacity
      "chop(",
      "HW_GRAZING",
      "HW_STREAK",
      "cracks(flow",
      "ribbons",
      "rolling",
      "broad",
      "networkColour",
      "highlights",
      "vec2(0.018, -0.012)",
      "hlRippleNormal",
      "hlSheen",
      "hlRiver",
      "hlRough",
    ];
    for (const { look, s } of looks) for (const term of gone) expect(s, `${look}: ${term}`).not.toContain(term);
  });

  it("can draw clean water by the game's own formula (Q9 P4): lerp(#446C71, #000F48, d/5) × DepthGradients.R × 2", () => {
    for (const { look, s } of looks) {
      expect(s, look).toContain(`#define WATER_FORMULA ${GAME_WATER.use ? 1 : 0}`);
      expect(s, look).toContain("vec3 gameCleanColour(float depth)");
    }
    expect(gameDepthR(0)).toBeCloseTo(245 / 255, 6);
    expect(gameDepthR(5)).toBe(0);
    expect(gameDepthR(1)).toBeCloseTo(133.7 / 255, 6);
    const c = gameCleanColour(0);
    expect(c[0]).toBeCloseTo((0x44 / 255) * (245 / 255) * 2, 6);
    expect(c[2]).toBeCloseTo((0x71 / 255) * (245 / 255) * 2, 6);
  });
});

describe("badwater as the game draws it (Q9 P9)", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);
  const looks = [
    { look: "Standard", s: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false).fragmentShader },
    { look: "High", s: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()).fragmentShader },
  ];
  const bad = makeBadwaterTexture(N);
  const n = N * N;
  const base = new Float64Array(n);
  const glow = new Float64Array(n);
  for (let i = 0; i < n; i++) (base[i] = bad[i * 4]), (glow[i] = bad[i * 4 + 1]);
  const percentile = (f: Float64Array, q: number) => {
    const s = Float64Array.from(f).sort();
    return s[Math.floor(q * (s.length - 1))];
  };

  it("has a pattern of our own at the game's statistics: R the base colour's mottle, G the emissive detail's lines", () => {
    for (const [f, G] of [[base, BAD_TEX.base], [glow, BAD_TEX.glow]] as const) {
      const s = stats(f);
      expect(Math.abs(s.mean - G.mean)).toBeLessThan(1);
      expect(Math.abs(s.spread / G.spread - 1)).toBeLessThan(0.05);
      PATTERN_PERCENTILES.forEach((q, k) => expect(Math.abs(percentile(f, q) - G.percentiles[k]), `${q}`).toBeLessThan(3));
      expect(Math.abs(featureTiles(f, N) / G.feature - 1)).toBeLessThan(0.2);
      expect(Math.abs(broadShare(f, N) - G.broad)).toBeLessThan(0.05);
    }
    // most of the glow is black, as the game's
    expect(Math.abs(glow.filter((v) => v === 0).length / n - BAD_TEX.glow.zero)).toBeLessThan(0.05);
  });

  it("carries the pattern by the flow in both looks, its colour by each look's judged choice (GAME_BADWATER.use)", () => {
    for (const { look, s } of looks) {
      expect(s, look).toContain(`#define BADWATER_FORMULA ${GAME_BADWATER.use.standard ? 1 : 0}`);
      expect(s, look).toContain(`#define BADWATER_FORMULA_HIGH ${GAME_BADWATER.use.high ? 1 : 0}`);
      expect(s, look).toContain("vec2 badwaterPatternAt(vec2 pa, vec2 pb, float w)");
      expect(s, look).toContain("gameBadwaterEmission(");
    }
    // High's surface takes its own switch, Standard's its own
    expect(waterHooks().waterDecl).toMatch(/#if BADWATER_FORMULA_HIGH\n\s*badBody = gameBadwaterColour\(/);
    expect(looks[0].s).toMatch(/#if BADWATER_FORMULA\n\s*murky = gameBadwaterColour\(/);
    // the game's own colour, as read (ps 680-790): pure badwater a level deep at the pattern's mean
    const k = GAME_BADWATER.colorA.map((a, i) => (a + (GAME_BADWATER.colorB[i] - a) * GAME_BADWATER.pattern[0]) * GAME_BADWATER.intensity[1]);
    const over = k.map((v, i) => 2 * v * GAME_BADWATER.detail[i]);
    const c = gameBadwaterColour(1, 1);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo((k[i] + (over[i] - k[i]) * 0.5) * gameDepthG(1), 6);
    // its emissive detail, unlit, from the pattern's G and the grid: none on clean water
    expect(gameBadwaterEmission(0)).toEqual([0, 0, 0]);
    expect(gameBadwaterEmission(1)[0]).toBeGreaterThan(gameBadwaterEmission(1)[2]);
  });

  it("ships in each look the colour the pixel judge found closer to the game's frames in that look", () => {
    const J = GAME_BADWATER.judged;
    // (a switch for each look, planning 2026-11-07: the formula ships in a look where its distance to the game's pixels,
    // over every judged tile, in the game's light at each frame's hour, is the smaller in that look; it is in both since
    // the game's light on the water, fix/water-sky; High's crimson before)
    const over = (look: "standard" | "high", k: "ours" | "formula") => Math.sqrt(([J.atHour, J.day] as const).reduce((s, set) => s + set[look][k] ** 2 * set.tiles, 0) / (J.atHour.tiles + J.day.tiles));
    expect(GAME_BADWATER.use.standard).toBe(over("standard", "formula") < over("standard", "ours"));
    expect(GAME_BADWATER.use.high).toBe(over("high", "formula") < over("high", "ours"));
    // the shipped path (waterShown, the Standard look's, which the legend and the look tests read) draws pure badwater
    // by Standard's switch: the game's formula in the game's light, or our crimson darkened by the game's G ramp in our
    // own; red over green over blue, darker deeper, either way
    const up = Math.sin(LIGHT.sunElevation);
    for (const d of [0.5, 1, 2, 3]) {
      const shown = waterShown(d, 1, false);
      const ours = badwaterGlow(badwaterBody(d), WATER.bad, d, 1).map((v, k) => v * (LIGHT.sky[k] * 1.2 + LIGHT.sun[k] * 0.3 * up));
      // (at the water's own diffuse share where Standard draws it, WATER_LIGHT.held: 0.96 for the terrain's 0.912)
      const share = WATER_LIGHT.held.standard ? WATER_LIGHT.diffuse / GAME_LIGHT.diffuse : 1;
      const want = GAME_BADWATER.use.standard ? sunlitTop(gameBadwaterColour(d, 1)).map((v) => v * share) : ours;
      for (let k = 0; k < 3; k++) expect(shown[k]).toBeCloseTo(want[k], 6);
      expect(shown[0]).toBeGreaterThan(shown[1]);
      expect(shown[1]).toBeGreaterThan(shown[2]);
      if (d > 0.5) expect(shown[0]).toBeLessThan(waterShown(d / 2, 1, false)[0]);
    }
    // the formula is lit by the game's light (both looks' gameWaterLight), so it turns redder at the hours most of the
    // judged frames fall at (a sunrise: tools/game-day-light.ts), as their red-brown is against the day's near-neutral
    // grey; our crimson is lit by our own light and stays as it is at any hour
    const at = (light: ReturnType<typeof dayLight>) => {
      const body = gameBadwaterColour(1, 1);
      const amb = gameAmbient(1, light.sh);
      return body.map((v, k) => v * GAME_LIGHT.diffuse * (amb[k] + light.sun[k] * Math.sin((light.angle * Math.PI) / 180)));
    };
    const [day, sunrise] = [at(dayLight(0.5, null)), at(dayLight(13, null))];
    for (let k = 0; k < 3; k++) expect(day[k]).toBeCloseTo(sunlitTop(gameBadwaterColour(1, 1))[k], 6);
    expect(sunrise[0] / sunrise[2]).toBeGreaterThan((day[0] / day[2]) * 1.2);
  });
});
