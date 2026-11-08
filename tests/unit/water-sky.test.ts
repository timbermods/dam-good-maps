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
  const ms = WATER_PROBE.mips;
  const m = Math.min(ms[ms.length - 1], Math.max(ms[0], mip));
  let k = 0;
  while (k < ms.length - 2 && m >= ms[k + 1]) k++;
  const [a, b] = [row(k), row(k + 1)];
  return [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * (m - ms[k]));
}

describe("the game's light on its water (Q9 P15)", () => {
  it("reads the game's probe by height, the roughest mip the terrain's own (GAME_ENV, the same probe)", () => {
    const rough = WATER_PROBE.colours[WATER_PROBE.mips.indexOf(6)];
    const at = (y: number) => rough[(WATER_PROBE.heights as readonly number[]).indexOf(y)];
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
      // (URP's mip, from 3: the glossiest clean water, smoothness 0.55, reads near 3.7)
      "float mip = clamp(pr * (1.7 - 0.7 * pr) * 6.0, 3.0, 6.0);",
      "float r = max(pr * pr, 0.0078125);",
      "float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);",
      "float grazing = clamp(smoothness + 0.04, 0.0, 1.0);",
      "return 1.0 * waterProbeAt(reflect(-V, N), smoothness) * (0.04 * headOn + (grazing - 0.04) * fresnel) / (1.0 + r * r);",
      // (the sun's GGX, URP's: f0 × roughness² / (d² × max(0.1, (L·H)²) × (4 roughness + 2)) × N·L)
      "return r2 / (d * d * max(0.1, LoH * LoH) * (4.0 * r + 2.0)) * 0.04 * max(dot(N, L), 0.0);",
    ])
      expect(s).toContain(line);
    // (the roughness floor URP's, 0.0078125, in the environment term, its grazing part alone and the glint alike)
    expect(s.match(/float r = max\(pr \* pr, 0\.0078125\);/g)?.length).toBe(3);
    expect(s).not.toContain("max(pr * pr, 0.002)");
    // (the probe read from mip 3, the glossiest water's, to 6, the roughest)
    expect([...WATER_PROBE.mips]).toEqual([3, 4, 5, 6]);
    expect(s).toContain(`#define WATER_GAME_LIGHT ${WATER_LIGHT.game.standard ? 1 : 0}`);
    expect(s).toContain(`#define WATER_HELD ${WATER_LIGHT.held.standard ? 1 : 0}`);
    // (the diffuse share, the water's own at its metallic 0 where held: URP's 0.96 × (1 − metallic))
    expect(WATER_LIGHT.diffuse).toBe(0.96);
    expect(s).toContain("float gameWaterDiffuse = 0.96;");
    // (P6: clean water's colour × the albedo overlaid with the still detail, as badwater's is, by its switch; its
    // pattern: water-detail.test.ts)
    expect(s).toContain(`#define WATER_DETAIL ${WATER_LIGHT.detail.standard ? 1 : 0}`);
    expect(s).toContain("a = mix(a, waterDetailOverlay(a), gameWaterDetail);");
    expect(s).toContain("return mix(2.0 * a * waterDetail, 1.0 - 2.0 * (1.0 - a) * (1.0 - waterDetail), step(0.5, a));");
  });

  it("is drawn in High's water: the probe by the reflected direction, the head-on part by its switch, the sun's GGX glint by its shadow, the highlight in the game's sun colour", () => {
    const s = waterMaterial(U(), false, waterHooks()).fragmentShader;
    expect(s).toContain(`#define WATER_GAME_LIGHT_HIGH ${WATER_LIGHT.game.high ? 1 : 0}`);
    expect(s).toContain(`#define WATER_HELD_HIGH ${WATER_LIGHT.held.high ? 1 : 0}`);
    for (const line of [
      "#if WATER_GAME_LIGHT_HIGH",
      // (× 1 − the game's waterfall mask, Q9 P1)
      "vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(N, V, tint) * (1.0 - waterFall);",
      "colour += highlight * gameWaterLight(N, lit);",
      "colour += waterEnvironment(N, V, smoothness, float(WATER_HELD_HIGH));",
      "colour += GAME_SUN_COLOUR * waterSunGlint(N, V, sunDir, smoothness) * lit;",
      // (its smoothness the Standard surface's, toward badwater's by High's own share)
      "float hlSmooth = mix(clamp(WATER_SMOOTHNESS + (gloss - 0.5) * WATER_SMOOTHNESS_SPREAD, 0.0, 1.0), BADWATER_SMOOTHNESS, waterTint(hlBad) * bpat.x);",
    ])
      expect(s).toContain(line);
    // (the diffuse share by High's own switch)
    expect(s).toMatch(/#if WATER_HELD_HIGH\s+gameWaterDiffuse = 0\.96;/);
    expect(s).toContain(`#define WATER_DETAIL_HIGH ${WATER_LIGHT.detail.high ? 1 : 0}`);
    expect(s).toContain("gameWaterDetail = float(WATER_DETAIL_HIGH);");
  });
});

describe("each look's choice of the game's light on its water", () => {
  it("is the one the pixel judge found nearest the game's frames over all the look's water (WATER_LIGHT.judged)", () => {
    const J = WATER_LIGHT.judged;
    // (fewest terms last: within the judge's 0.1 the more of the game's own terms wins)
    const order = ["all", "full", "detail", "game", "dev"] as const;
    for (const look of ["standard", "high"] as const) {
      const over = (k: (typeof order)[number]) => Math.sqrt((J[look].clean[k] ** 2 * J.tiles.clean + J[look].bad[k] ** 2 * J.tiles.bad) / (J.tiles.clean + J.tiles.bad));
      const best = Math.min(...order.map(over));
      const pick = order.find((k) => over(k) <= best + 0.1)!;
      expect(
        { game: WATER_LIGHT.game[look], held: WATER_LIGHT.held[look], detail: WATER_LIGHT.detail[look] },
        look,
      ).toEqual({ game: ["game", "full", "all"].includes(pick), held: ["full", "all"].includes(pick), detail: ["detail", "all"].includes(pick) });
    }
  });
});

describe("the gap between clean water and badwater by day (D496)", () => {
  it("is the game's on screen, a level or two deep, within the spread of the game's own frames, in both looks", () => {
    const G = WATER_LIGHT.gap;
    // (the game's gap on its six day-lit start shots with badwater in view, 4.7 L* (D496's 4.2): its shots' clean
    // water and badwater bound what the frames allow, 3.1 to 6.5)
    const low = G.game.cleanShots[0] - G.game.badShots[1];
    const high = G.game.cleanShots[1] - G.game.badShots[0];
    expect(G.game.clean - G.game.bad).toBeGreaterThan(low);
    expect(G.game.clean - G.game.bad).toBeLessThan(high);
    // (High too since its poisoned bed went, fix/water-shore: its gap was 7.1, its badwater over a darker bed)
    for (const look of ["standard", "high"] as const) {
      const gap = G[look].clean - G[look].bad;
      expect(gap, look).toBeGreaterThanOrEqual(low - 1e-9);
      expect(gap, look).toBeLessThanOrEqual(high + 1e-9);
    }
  });
});
