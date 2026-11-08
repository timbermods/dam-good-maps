// Kyler's clean look: the 3D view opens clean, as close to the game as we can draw it with our own
// models: dead trees are bare trunks at their true size, ruins open scaffold towers, geothermal
// fields, relics, thorns and blockages world objects, dry ground a warm brown drifting to mauve (D334). The
// information layer (**Markers**: dam sites, slope arrows, level lines, far-off objects drawn
// larger) is off until the viewer or a tool turns it on, and the legend keeps its lines apart.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelTriangles } from "../../src/render3d/entities3d";
import { PAINTED_MEAN, paintedMean, STROKE_WIDEN_K, sceneUniforms, skyMaterial, terrainMaterial } from "../../src/render3d/materials";
import { desertByte } from "../../src/render3d/light";
import { entityView } from "../../src/render3d/model";
import { BLEND, DESERT, GAME_GROUND_MEAN, GAME_SKY, gamePostRgb, GROUND, legendEntries, NOISE_NODES, noiseMean, objectLegend, type Rgb } from "../../src/render3d/palette";

type Mesh = { name: string; count: number; geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } } };

const meshesOf = (list: Parameters<typeof entityView>[0], lite = false) =>
  new Map((buildEntities(entityView(list), new ShaderMaterial(), null, 0, lite).group.children as unknown as Mesh[]).map((m) => [m.name, m]));

/** A model's height and how far it reaches out from its trunk. */
function extent(m: Mesh): { height: number; reach: number } {
  const p = m.geometry.getAttribute("position").array;
  let height = 0;
  let reach = 0;
  for (let k = 0; k < p.length; k += 3) {
    height = Math.max(height, p[k + 1]);
    reach = Math.max(reach, Math.hypot(p[k], p[k + 2]));
  }
  return { height, reach };
}

describe("grass by moisture, as the game's terrain draws it (D135 as amended 2026-10-29)", () => {
  // SoilMoistureSystem.UpdateDesertIntensity: desert 1 at moisture 0, (1 - m / 5) x 0.7 at 0 < m <= 5, 0 above
  const desert = (m: number) => (m === 0 ? 1 : m <= DESERT.threshold ? (1 - m / DESERT.threshold) * DESERT.max : 0);
  const grassOf = (m: number) => (m < 0.5 ? 0 : 1 - DESERT.max * Math.max(0, 1 - m / DESERT.threshold));
  it("takes the game's threshold and most desert, and the shader's grass is one minus its desert at every level", () => {
    expect(DESERT).toEqual({ threshold: 5, max: 0.7 });
    for (let m = 0; m <= 15; m++) expect(grassOf(m), `moisture ${m}`).toBeCloseTo(1 - desert(m), 9);
    const u = sceneUniforms(1, 1, new DataTexture(), new DataTexture(), new DataTexture(), new DataTexture());
    const shader = terrainMaterial(u, 0, 1).fragmentShader;
    expect(shader).toContain("float grassOf(float m)");
    // (a top's share comes from the tile data's desert byte, its moisture unrounded, as the game takes it: light.ts
    // desertByte; grassOf stays for the run tops' soil, which carries only the whole level)
    expect(shader).toContain("vec4(grassAt(s0), s0.x,");
    for (let m = 0; m <= 15; m += 0.2) expect(desertByte(Math.round(m * 15)) / 255, `moisture ${m.toFixed(1)}`).toBeCloseTo(desert(Math.round(m * 15) / 15), 2);
    expect(desertByte(Math.round(1.4 * 15))).toBe(Math.round(desert(1.4) * 255));
  });

  it("blends tile to tile as the game's terrain does: four taps a fifth of a tile round the point, its noise and softness", () => {
    // TerrainMaterialMapSpec: BlendingMargin 0.2, BlendingNoiseMultiplier 0.96, BlendingSoftness 5.8; its BlendingNoise
    // texture's mean and spread (2026-11-08)
    expect(BLEND).toEqual({ margin: 0.2, noise: 0.96, softness: 5.8, noiseMean: 0.473, noiseSpread: 0.081 });
    const u = sceneUniforms(1, 1, new DataTexture(), new DataTexture(), new DataTexture(), new DataTexture());
    const shader = terrainMaterial(u, 0, 1).fragmentShader;
    expect(shader).toContain("float desertBlend(vec2 g, vec4 desert)");
    expect(shader).toContain("vec2 q = g + 0.2 *");
    expect(shader).toMatch(/\+ 0\.96 \* \(blendNoise\(g\) - 0\.5\) - 0\.5\) \* 5\.8 \+ 0\.5/);
    // a top and a cave's floor both take it (the game's desert map is 3D)
    expect(shader.match(/= 1\.0 - desertBlend\(g,/g)?.length).toBe(2);
  });

  it("meets a cave's floor at a cave's mouth without a seam: each side reads the other's desert as its own blend does", () => {
    const u = sceneUniforms(1, 1, new DataTexture(), new DataTexture(), new DataTexture(), new DataTexture());
    const shader = terrainMaterial(u, 0, 1).fragmentShader;
    // the floor reads an open top beside it at its level by the top's own desert intensity (its moisture unrounded),
    // not its whole level
    expect(shader).toContain("return vec4(m, r.x - m * 16.0, r.y > 1.5 ? 1.0 : 0.0, 1.0 - grassOf(m));");
    expect(shader).toContain("floorSoil.x = 1.0 - desertBlend(g, vec4(q0.w, rx1 > 0.5 ? q1.w : 1.0, ry1 > 0.5 ? q2.w : 1.0, rd1 > 0.5 ? q3.w : 1.0));");
    // and the open top reads the floor standing at its level in a taller neighbour, not desert
    for (const tap of ["desertTaps.y = runDesert(tile + vec2(sd.x, 0.0), h0, 1.0)", "desertTaps.z = runDesert(tile + vec2(0.0, sd.y), h0, 1.0)", "desertTaps.w = runDesert(tile + sd, h0, 1.0)"])
      expect(shader).toContain(tap);
    expect(shader).toContain("soil.x = 1.0 - desertBlend(g, desertTaps);");
  });

  it("draws the light look's share as the game's noisy blend gives it on average", () => {
    // the full looks' share by moisture, measured in the page (tools/ground-variation.ts, the game's formula with its
    // noise): 0.36, 0.66, 0.88, 0.97 and 0.99 at moisture 1, 1.5, 2, 2.5 and 3
    const share = (m: number) => 1 - noiseMean(desert(m), BLEND.noise, 0.5, BLEND.softness);
    [0.36, 0.66, 0.88, 0.97, 0.99].forEach((want, k) => expect(Math.abs(share(1 + k / 2) - want), `moisture ${1 + k / 2}`).toBeLessThan(0.03));
    expect(share(0)).toBeCloseTo(0, 9);
    expect(share(5)).toBeCloseTo(1, 9);
    // (the nodes weigh to one, so a share held at 0 or 1 stays there)
    expect(NOISE_NODES.reduce((s, [, w]) => s + w, 0)).toBeCloseTo(1, 5);
    const u = sceneUniforms(1, 1, new DataTexture(), new DataTexture(), new DataTexture(), new DataTexture());
    const lite = terrainMaterial(u, 0, 1, true).fragmentShader;
    expect(lite).toContain("vec4 soil = vec4(1.0 - desertMean(s0.w), s0.x,");
    expect(lite).toContain("float desertMean(float d) {\n        return noiseMean(d, 0.96, 0.5, 5.8);");
    expect(lite).toContain(`float a = (v + k * (${BLEND.noiseMean} - mid) - 0.5) * softness + 0.5;`);
  });

  it("can draw every top at the game's texture means, for the pixel judge alone (off in every look)", () => {
    // TerrainURP: base × GrassDetailsAlbedo × 2, the 64² mips' means (Grass 67.4/72.9/24.8, Desert 62.5/52.2/41.7,
    // the detail 140.5)
    const k = (140.5 / 255) * 2;
    [67.4, 72.9, 24.8].forEach((v, i) => expect(GAME_GROUND_MEAN.grass[i] * 255).toBeCloseTo(v * k, 0));
    [62.5, 52.2, 41.7].forEach((v, i) => expect(GAME_GROUND_MEAN.dry[i] * 255).toBeCloseTo(v * k, 0));
    const u = sceneUniforms(1, 1, new DataTexture(), new DataTexture(), new DataTexture(), new DataTexture());
    for (const lite of [false, true]) expect(terrainMaterial(u, 0, 1, lite).fragmentShader).toContain("#define GROUND_MEANS 0");
  });
});

describe("the clean view", () => {
  it("opens with the information layer off", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    expect(sceneUniforms(1, 1, t(), t(), t(), t()).markers.value).toBe(0);
  });

  it("draws dead trees as bare trunks, no larger than the living tree", () => {
    const at = (template: string, dead: boolean) => ({ template, x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f", dead });
    for (const species of ["Pine", "Birch", "Oak"]) {
      const living = extent(meshesOf([at(species, false)]).get(species)!);
      const dead = extent(meshesOf([at(species, true)]).get(`${species}.dead`)!);
      expect(dead.height, species).toBeLessThanOrEqual(living.height * 1.05);
      // bare: no body of wood round the trunk
      expect(dead.reach, species).toBeLessThan(living.reach);
      expect(modelTriangles(`${species}.dead`)).toBeLessThanOrEqual(64);
    }
  });

  it("draws geothermal fields, relics, thorns and blockages as world objects", () => {
    const list = [
      { template: "GeothermalField", x: 2, y: 2, z: 2, orientation: "Cw0", owner: "f" },
      { template: "SmallRelic", x: 8, y: 2, z: 2, orientation: "Cw90", owner: "f" },
      { template: "MediumRelic", x: 12, y: 2, z: 2, orientation: "Cw0", owner: "f" },
      { template: "LargeRelic", x: 16, y: 2, z: 2, orientation: "Cw0", owner: "f" },
      { template: "Thorns", x: 20, y: 2, z: 2, orientation: "Cw0", owner: "f" },
      { template: "Blockage", x: 22, y: 2, z: 2, orientation: "Cw0", owner: "f" },
    ];
    const names = [...meshesOf(list).keys()].sort();
    expect(names).toEqual(["GeothermalField", "LargeRelic", "MediumRelic", "SmallRelic", "Thorns", "block.rubble"]);
    // a blockage is still a block (its model key), drawn as a heap of stones
    expect(modelKeyOf("Blockage", 0)).toBe("block");
    // the light look draws each once
    for (const m of meshesOf(list, true).values()) expect(m.count).toBe(1);
  });

  it("keeps ruins as open scaffold, a storey per level", () => {
    const m = meshesOf([{ template: "RuinColumnH4", x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f" }]);
    const storeys = [...m.entries()].filter(([k]) => k.startsWith("scaffold")).reduce((s, [, x]) => s + x.count, 0);
    expect(storeys).toBe(4);
  });

  it("colours dry ground a warm brown drifting to mauve and tan, cracked dark, as Timberborn's references (D334)", () => {
    // Kyler's approved inputs (D334: the earth may be warm brown and mauve; D346: a little greyer from above), scaled
    // together to the game's Desert texture (D497: their pattern's mean albedo is the texture's, tools/albedo-means.ts)
    expect(GROUND.dry).toEqual([0.293, 0.242, 0.193]);
    expect(GROUND.dryCool).toEqual([0.281, 0.249, 0.23]);
    expect(GROUND.dryWarm).toEqual([0.33, 0.264, 0.197]);
    expect(GROUND.crack).toEqual([0.12, 0.085, 0.066]);
    // three patches that differ, each darker at its cracks
    const patches = [GROUND.dry, GROUND.dryCool, GROUND.dryWarm];
    expect(new Set(patches.map((c) => c.join())).size).toBe(3);
    const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const c of patches) expect(lum(GROUND.crack)).toBeLessThan(lum(c));
    // the clean terrain shader drifts between all three and draws its crack network over them
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const src = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    const gl = (c: Rgb) => `vec3(${c.map((v) => (Number.isInteger(v) ? `${v}.0` : String(Math.round(v * 1000) / 1000))).join(", ")})`;
    for (const c of [...patches, GROUND.crack]) expect(src).toContain(gl(c));
    expect(src).toContain("vec2 dry = cracks(g * 3.1);");
    // (as deep from afar as near: the cracks' mean holds at every distance, as the game's textures' does, fix/land-tone)
    expect(src).toContain(`c = mix(c, ${gl(GROUND.crack)}, dry.x * 0.78);`);
  });

  it("draws grass as the game's terrain shader does (D497, fix/land-tone): one colour at every moisture, its mean the same at every distance", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const src = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1, lite).fragmentShader;
      // (the game has no moisture term: moisture only sets the desert's share)
      expect(src).not.toContain("(s.y - 1.0) / 9.0");
      expect(src).toContain(`vec3(${GROUND.grass.join(", ")})`);
    }
    // the painted strokes fade from afar to their own mean, never to nothing (a texture's mips keep its mean)
    expect(PAINTED_MEAN).toBeGreaterThan(0.005);
    expect(PAINTED_MEAN).toBeLessThan(0.01);
    const src = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    expect(src).toContain(`mix(${PAINTED_MEAN}, painted * (0.08 + bladeHash * 0.16) - widened, detail)`);
    // up close the strokes keep their width plus a pixel's footprint (legible at a grazing view, as dev drew them), and
    // what that widening adds is taken off: the fit is within 2 % of the strokes' own growth at every footprint
    expect(src).toContain("1.0 - smoothstep(0.04, 0.04 + bladeAA, abs(bf.x + bf.y * 0.25))");
    for (const aa of [0.025, 0.1, 0.3, 0.5, 0.8, 1.2]) {
      const grow = paintedMean(aa) / paintedMean(0) - 1;
      expect(Math.abs((12.5 * aa) / (1 + STROKE_WIDEN_K * aa * aa) - grow) / grow).toBeLessThan(0.02);
    }
  });

  it("draws the game's sky round the map (D497): blue overhead, paler at the horizon, the game's own colour straight down", () => {
    const day = GAME_SKY.day;
    const zenith = day[day.length - 1];
    const horizon = day[(day.length - 1) / 2];
    expect(zenith[2]).toBeGreaterThan(zenith[0] + 0.3);
    expect(horizon[0]).toBeGreaterThan(zenith[0]);
    // straight down, graded by the game's post chain, it is the colour behind the map in the game's own shots (47, 90, 133)
    const below = gamePostRgb(day[0] as unknown as Rgb).map((v) => Math.round(v * 255));
    for (const [k, game] of [47, 90, 133].entries()) expect(Math.abs(below[k] - game)).toBeLessThanOrEqual(2);
    const sky = skyMaterial();
    expect(sky.depthWrite).toBe(false);
    sky.dispose();
  });
});

describe("the legend", () => {
  it("keeps the lines that show only with Markers apart", () => {
    const all = [...legendEntries("moisture"), ...objectLegend()];
    const marked = all.filter((e) => e.markers).map((e) => e.label);
    expect(marked).toEqual(["Slope arrows", "Wall levels", "Contamination edge", "Mine site outline"]);
    const clean = all.filter((e) => !e.markers).map((e) => e.label);
    for (const want of ["Moist ground", "Dry ground", "Contaminated ground", "Water", "Badwater", "Mixed water", "Dead trees", "Trees and bushes", "Start", "Slope", "Ruins", "Geothermal field", "Relic", "Thorns"]) expect(clean, want).toContain(want);
  });
});
