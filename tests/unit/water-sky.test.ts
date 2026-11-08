// The game's light on its water (Q9 P15, fix/water-sky; D496, D497): its reflection probe by the reflected direction,
// URP's environment term and the sun's GGX glint, in both looks' shaders, and each look's choice of them held to the
// pixel judge's numbers (waterPalette.ts WATER_LIGHT).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { GAME_ENV } from "../../src/render3d/palette";
import { WATER, WATER_LIGHT, WATER_PROBE } from "../../src/render3d/waterPalette";

const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
const U = () => sceneUniforms(1, 1, tex(), tex(), tex(), tex());

/** The probe's colour at a height and mip, straight between its knots (the shader's waterProbeAt). */
function probeAt(y: number, mip: number): number[] {
  const h = WATER_PROBE.heights;
  const row = (m: number) => {
    const c = WATER_PROBE.colours[m];
    for (let i = 1; i < h.length; i++) if (y <= h[i]) return [0, 1, 2].map((k) => c[i - 1][k] + ((c[i][k] - c[i - 1][k]) * (y - h[i - 1])) / (h[i] - h[i - 1]));
    return [...c[c.length - 1]];
  };
  const m = Math.min(6, Math.max(4, mip));
  const [a, b, t] = m < 5 ? [row(0), row(1), m - 4] : [row(1), row(2), m - 5];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
}

describe("the game's light on its water (Q9 P15)", () => {
  it("reads the game's probe by height, the roughest mip the terrain's own (GAME_ENV, the same probe)", () => {
    const rough = WATER_PROBE.colours[2];
    const at = (y: number) => rough[WATER_PROBE.heights.indexOf(y)];
    for (const [y, want] of [
      [1, GAME_ENV.up],
      [0, GAME_ENV.side],
      [-1, GAME_ENV.down],
    ] as const)
      for (let k = 0; k < 3; k++) expect(Math.abs(at(y)[k] - want[k]), `height ${y}`).toBeLessThan(0.0015);
    // (the one colour Standard reflected before, toward 60° up at the water's mip, is the probe's there)
    const sixty = probeAt(Math.sin(Math.PI / 3), 5.29);
    for (let k = 0; k < 3; k++) expect(Math.abs(sixty[k] - WATER.sky[k])).toBeLessThan(0.02);
    // its horizon's haze is lighter than its zenith at the water's mip, its ground below darker: a grazing look reflects
    // the haze, a ripple turned down the ground
    const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(lum(probeAt(0.15, 5.29))).toBeGreaterThan(lum(probeAt(1, 5.29)) + 0.04);
    expect(lum(probeAt(-0.5, 5.29))).toBeLessThan(lum(probeAt(0, 5.29)) - 0.05);
  });

  it("is URP's environment term in the shared water GLSL: the probe by reflect(−V, N) at URP's mip, × (f0 × head-on + (grazing − f0) × (1 − N·V)^4) / (1 + roughness²)", () => {
    const s = waterMaterial(U(), false).fragmentShader;
    for (const line of [
      "float mip = clamp(pr * (1.7 - 0.7 * pr) * 6.0, 4.0, 6.0);",
      "float r = max(pr * pr, 0.0078125);",
      "float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);",
      "float grazing = clamp(smoothness + 0.04, 0.0, 1.0);",
      "return 1.0 * waterProbeAt(reflect(-V, N), smoothness) * (0.04 * headOn + (grazing - 0.04) * fresnel) / (1.0 + r * r);",
      // (the sun's GGX, URP's: f0 × roughness² / (d² × max(0.1, (L·H)²) × (4 roughness + 2)) × N·L)
      "return r2 / (d * d * max(0.1, LoH * LoH) * (4.0 * r + 2.0)) * 0.04 * max(dot(N, L), 0.0);",
    ])
      expect(s).toContain(line);
    expect(s).toContain(`#define WATER_GAME_LIGHT ${WATER_LIGHT.game.standard ? 1 : 0}`);
    expect(s).toContain(`#define WATER_HELD ${WATER_LIGHT.held.standard ? 1 : 0}`);
    // (the diffuse share, the water's own at its metallic 0 where held: URP's 0.96 × (1 − metallic))
    expect(WATER_LIGHT.diffuse).toBe(0.96);
    expect(s).toContain("float gameWaterDiffuse = 0.96;");
  });

  it("is drawn in High's water: the probe by the reflected direction, the head-on part by its switch, the sun's GGX glint by its shadow, the highlight in the game's sun colour", () => {
    const s = waterMaterial(U(), false, waterHooks()).fragmentShader;
    expect(s).toContain(`#define WATER_GAME_LIGHT_HIGH ${WATER_LIGHT.game.high ? 1 : 0}`);
    expect(s).toContain(`#define WATER_HELD_HIGH ${WATER_LIGHT.held.high ? 1 : 0}`);
    for (const line of [
      "#if WATER_GAME_LIGHT_HIGH",
      "vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(N, V, tint);",
      "colour += highlight * gameWaterLight(N, lit);",
      "colour += waterEnvironment(N, V, smoothness, float(WATER_HELD_HIGH));",
      "colour += GAME_SUN_COLOUR * waterSunGlint(N, V, sunDir, smoothness) * lit;",
      // (its smoothness the Standard surface's, toward badwater's by High's own share)
      "float hlSmooth = mix(clamp(WATER_SMOOTHNESS + (gloss - 0.5) * WATER_SMOOTHNESS_SPREAD, 0.0, 1.0), BADWATER_SMOOTHNESS, waterTint(hlBad) * bpat.x);",
    ])
      expect(s).toContain(line);
    // (the diffuse share by High's own switch)
    expect(s).toMatch(/#if WATER_HELD_HIGH\s+gameWaterDiffuse = 0\.96;/);
  });
});
