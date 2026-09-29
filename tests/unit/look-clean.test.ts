// Kyler's clean look: the 3D view opens clean, as close to the game as we can draw it with our own
// models: dead trees are bare trunks at their true size, ruins open scaffold towers, geothermal
// fields, relics, thorns and blockages world objects, dry ground a warm brown drifting to mauve (D334). The
// information layer (**Markers**: dam sites, slope arrows, level lines, far-off objects drawn
// larger) is off until the viewer or a tool turns it on, and the legend keeps its lines apart.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { buildEntities, modelKeyOf, modelTriangles } from "../../src/render3d/entities3d";
import { sceneUniforms, skyMaterial, terrainMaterial } from "../../src/render3d/materials";
import { entityView } from "../../src/render3d/model";
import { GROUND, legendEntries, objectLegend, SKY, type Rgb } from "../../src/render3d/palette";

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
    // Kyler's approved inputs (investigation/high-soul, D334: the earth may be warm brown and mauve)
    expect(GROUND.dry).toEqual([0.48, 0.405, 0.35]);
    expect(GROUND.dryCool).toEqual([0.46, 0.415, 0.445]);
    expect(GROUND.dryWarm).toEqual([0.54, 0.44, 0.345]);
    expect(GROUND.crack).toEqual([0.19, 0.14, 0.125]);
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
    expect(src).toContain(`c = mix(c, ${gl(GROUND.crack)}, dry.x * (0.58 + 0.20 * detail));`);
  });

  it("draws a sky round the map: blue overhead, paler at the horizon", () => {
    expect(SKY.zenith[2]).toBeGreaterThan(SKY.zenith[0] + 0.3);
    expect(SKY.horizon[0]).toBeGreaterThan(SKY.zenith[0]);
    const sky = skyMaterial();
    expect(sky.depthWrite).toBe(false);
    sky.dispose();
  });
});

describe("the legend", () => {
  it("keeps the lines that show only with Markers apart", () => {
    const all = [...legendEntries("moisture"), ...objectLegend()];
    const marked = all.filter((e) => e.markers).map((e) => e.label);
    expect(marked).toContain("Slopes: arrows point uphill");
    expect(marked.some((l) => /pale line at every level/.test(l))).toBe(true);
    const clean = all.filter((e) => !e.markers).map((e) => e.label);
    for (const want of [/Moist/, /Dry/, /Contaminated/, /^Water: darker is deeper/, /^Badwater$/, /mixed with badwater/, /dead/, /Living trees/, /The start/, /Slopes: stone ramps/, /Ruins/, /Geothermal field/, /Relic/, /Thorns/]) expect(clean.some((l) => want.test(l)), String(want)).toBe(true);
  });
});
