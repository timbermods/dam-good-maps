// Map look's third round (PLAN §20 D115) and Kyler's clean look: badwater darker than clean water
// of the same depth, as the game draws it by day (D496 amended 2026-11-07), and clean water keeps its see-through shallows so it
// reads apart from ground (it may be as dark as dry ground, as in the game); water partly bad
// turns smoothly from clean water to badwater, the badwater share blended between tiles (D177,
// which replaced each top showing its own tile's share); a slope's arrow is level and floats above the slope, pointing uphill, so it reads from
// any camera angle; ruins stand apart from contaminated ground; and the light look (software
// rendering) draws each model once, however many objects use it.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { buildEntities, SLOPE_ARROW_HEIGHT } from "../../src/render3d/entities3d";
import { sceneUniforms, terrainMaterial, waterMaterial } from "../../src/render3d/materials";
import { entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { CONTAMINATED_GROUND, CONTAMINATION, GROUND, RUIN, WATER_SURFACE, waterBody, waterOpacity } from "../../src/render3d/palette";
import { blendedBadwater, meshWaterChunk } from "../../src/render3d/waterMesh";
import { badwaterShown, cleanWaterShown } from "./waterShown";
import { cleanWaterBody, badwaterBody, waterGroundBehind } from "../../src/render3d/waterPalette";
import { plainLayers } from "../../src/render3d/waterLayers";
import { waterHooks } from "../../src/render3d/high/shaders";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** CIE L* of a display colour (sRGB). */
const lightness = (c: readonly number[]) => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

type Mesh = { name: string; count: number; geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } } };

describe("water", () => {
  it("draws badwater darker than clean water of the same depth, with see-through shallows, and no shore foam and no glints, as the game", () => {
    const depths = Array.from({ length: 100 }, (_, k) => 0.05 + k * 0.05);
    // the game's order by day (D496 amended 2026-11-07, from its own frames in the day's light, the six start shots
    // with badwater in view, `tools/water-pixel-judge.ts --water all`): badwater a level or two deep reads L* 27.5 to
    // clean water's 31.7 (73 and 10,063 tiles); only near sunset does it read lighter (islands-128-2-end, 33.3 to 28.2),
    // and the editor draws the day's light. The shipped colours (waterShown.ts: clean water the game's formula,
    // badwater Standard's choice) keep that order wherever the game's day frames have badwater, half a level to two
    // levels down; deeper, both bodies are near black and the sky's reflection decides (D148: this held badwater
    // lighter, from the near-sunset frame, for part of 2026-11-07, and 6 L* darker before)
    const gap = (d: number) => lightness(badwaterShown(d)) - lightness(cleanWaterShown(d));
    for (const d of depths) if (d >= 0.5 - 1e-9 && d <= 2 + 1e-9) expect(gap(d), `${d} deep`).toBeLessThan(0);
    // High too, by the game's formula since the game's light on its water (fix/water-sky, `GAME_BADWATER.use.high`;
    // D148: it held half a level to a level down for High's own crimson before), half a level to two levels down
    const highGap = (d: number) => lightness(badwaterShown(d, "high")) - lightness(cleanWaterShown(d, "high"));
    for (const d of depths) if (d >= 0.5 - 1e-9 && d <= 2 + 1e-9) expect(highGap(d), `High, ${d} deep`).toBeLessThan(0);
    // no foam along the shore in either look, and no glints of our own, as the game's water shader has neither: its
    // sheen is the sun's specular at its smoothness (D154 amended 2026-10-29 and 2026-11-07 by planning, D496's rule;
    // D148: this checked a shore foam line, then glints, until then; the glints read as white specks on a wide river)
    expect(WATER_SURFACE).not.toHaveProperty("shoreFoam");
    expect(WATER_SURFACE).not.toHaveProperty("glints");
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t())).fragmentShader;
    expect(shader).not.toMatch(/foam \+= \(1\.0 - smoothstep\([^)]*, shore\)\)/);
    expect(waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()).fragmentShader).not.toContain("smoothstep(0.015, 0.16, shore)");
    expect(shader).not.toContain("glints");
    // nor High's own twinkling flecks
    const high = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()).fragmentShader;
    expect(high).not.toContain("microFlecks");
    expect(high).not.toMatch(/HW_(BAD_)?GLINT/);
    // see-through as the game's High quality draws it (Q8): the ground behind shows by 0.175 at the water's
    // floor, thinning in step with depth to none at 5 levels, by the depth the view sees under the surface (viewDepth.ts,
    // Q9 P3): clearer where it sees less, and at the foot of a bank facing the camera, where it sees none, over a
    // seventh of the ground behind shows through (D148: by each bank's shallowing, 0.3 of the depth at a bank, before)
    for (const d of depths) {
      expect(waterOpacity(0)).toBeLessThan(1);
      expect(waterOpacity(0)).toBeLessThanOrEqual(waterOpacity(d));
    }
    expect(waterOpacity(0)).toBeLessThan(0.86);
    for (const d of [0.25, 1, 2.5, 5, 6]) expect(waterOpacity(d)).toBeCloseTo(1 - 0.175 * Math.max(0, 1 - d / 5), 9);
  });

  it("draws water of any depth as water, as the game does: no film, clean or bad, in every look (D154 as amended 2026-11-09)", () => {
    // the game marks every column deeper than 0 as water and draws it with its one opaque material, its see-through by
    // the depth seen behind it: a film a hundredth of a level deep is the same water as its body, not a faint tint over
    // its ground; its terrain shader has no input from the water, and its water clips hard at its floor (Q8; Q9 P14).
    // (D148: from #571 this held a film fading in by its own depth, under three hundredths of a level from 2026-10-29,
    // and the ground under it in the water's hue; the probe's ceiling frames showed the game's pond 0.01-0.03 deep at
    // L* 37.5, full water, where our film drew 45.8)
    for (const d of [0, 0.001, 0.005, 0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 1, 3]) expect(waterOpacity(d), `${d} deep`).toBeCloseTo(1 - 0.175 * (1 - d / 5), 9);
    // the shaders draw no film: the water's opacity is its see-through's by the depth seen, clean or bad; the light
    // look's opaque (the game's Low quality); the ground under water is the game's terrain, with no input from the
    // water (Q9 P14: no bed), tinted only as what shows behind the water
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const U = () => sceneUniforms(1, 1, t(), t(), t(), t());
    const water = [waterMaterial(U()).fragmentShader, waterMaterial(U(), true).fragmentShader, waterMaterial(U(), false, waterHooks()).fragmentShader];
    for (const f of water) {
      expect(f).toContain("float alpha = cleanWaterAlpha(d);");
      expect(f).not.toMatch(/waterFilm|WATER_FILM|badwaterAlpha/);
    }
    expect(water[1]).toContain("alpha = 1.0;");
    expect(water[2]).toContain("alpha = hlSurface.a;");
    for (const terrain of [terrainMaterial(U(), 0, 1).fragmentShader, terrainMaterial(U(), 0, 1, true).fragmentShader]) {
      expect(terrain).not.toMatch(/waterFilm|WATER_FILM|groundBed/);
      expect(terrain).toContain("#define WATER_BED 0");
      expect(terrain).toContain("float bed = wet * float(WATER_BED);");
    }
    expect(WATER_SURFACE.seeThrough).toBe(0.175);
  });

  it("shows the ground behind the water as the game's High quality does: overlaid with the water's colour, desaturated (WATER_SURFACE.behindTint)", () => {
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const y = (c: readonly number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const sat = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
    for (const ground of [GROUND.underwater, GROUND.grass, GROUND.dry])
      for (const water of [cleanWaterBody(0.25), cleanWaterBody(1), badwaterBody(0.25)]) {
        const b = waterGroundBehind(ground, water);
        // darker than the ground in the open (the overlay of a dark water colour), and greyer
        expect(y(b)).toBeLessThan(y(ground));
        expect(sat(b)).toBeLessThan(sat(ground) + 0.02);
      }
    // the shader draws it in the terrain under the water, never under clear water, where the frame's
    // water doesn't put it on itself (refraction.ts)
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const terrain = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    expect(terrain).toContain("ground = mix(ground, waterGroundBehind(ground, wc), behind);");
    expect(terrain).toContain("float behind = smoothstep(0.4, 0.6, soil.w) * (1.0 - clrBehind) * (1.0 - refractView.y);");
  });

  it("blends the badwater share between tiles on the tops, so water partly bad turns smoothly (D177)", () => {
    // four tiles in a row at one level: pure badwater, a third bad, a tenth bad, clean
    const W = 4;
    const heights = new Uint8Array([2, 2, 2, 2]);
    const shares = [1, 0.33, 0.1, 0];
    const view = waterFromDepth(heights, [0.6, 0.6, 0.6, 0.6], shares);
    const sw = surfaceWater(W, 1, view);
    const blended = blendedBadwater(W, 1, sw);
    const m = meshWaterChunk(W, 1, plainLayers(heights, sw), 0, 0);
    // each top's corner has the mean of the blended shares of the tiles round it; the west edge
    // of the row the first tile's, the east edge the last's
    const at = (x: number) => (x <= 0 ? blended[0] : x >= W ? blended[W - 1] : (blended[x - 1] + blended[x]) / 2);
    let tops = 0;
    for (let q = 0; q < m.quads; q++) {
      if (m.normals[q * 12 + 1] <= 0) continue;
      tops++;
      for (let v = 0; v < 4; v++) expect(m.data[(q * 4 + v) * 2 + 1]).toBeCloseTo(at(Math.round(m.positions[(q * 4 + v) * 3])), 5);
    }
    expect(tops).toBe(4);
    // the corners keep the order and soften the steps: from the badwater end to the clean end, no corner step above the
    // largest between two tiles; each tile's blend is its own share (BLEND_KERNEL, D154 as amended 2026-11-08: a
    // top in the open takes the game's blend, about a tile wide, in the shader, look-badwater.test.ts), so the clean end
    // stays clean (D148: re-based from the four-tile blend, whose corners reached the clean end)
    expect(Array.from(blended)).toEqual(Array.from(sw.contamination));
    const corners = [0, 1, 2, 3, 4].map(at);
    for (let k = 1; k < corners.length; k++) {
      expect(corners[k]).toBeLessThanOrEqual(corners[k - 1]);
      expect(corners[k - 1] - corners[k]).toBeLessThanOrEqual(1 - 0.33 + 1e-6);
    }
    expect(corners[0]).toBe(1);
    expect(corners[4]).toBe(0);
  });
});

describe("slopes", () => {
  const view = entityView([{ template: "Slope", x: 3, y: 3, z: 2, orientation: "Cw0", owner: "f" }]);
  const meshes = new Map((buildEntities(view, new ShaderMaterial()).group.children as unknown as Mesh[]).map((c) => [c.name, c]));

  it("have a level arrow just above the slope's top, pointing uphill", () => {
    expect(SLOPE_ARROW_HEIGHT).toBeGreaterThan(1);
    const g = meshes.get("Slope.mark")!.geometry;
    const nrm = g.getAttribute("normal").array;
    for (let k = 1; k < nrm.length; k += 3) expect(nrm[k]).toBeCloseTo(1, 5);
    // the tip is the vertex farthest toward the high side (+Z in the model), on the middle line
    const pos = g.getAttribute("position").array;
    let tip = 0;
    for (let k = 0; k < pos.length; k += 3) if (pos[k + 2] > pos[tip + 2]) tip = k;
    expect(pos[tip + 2]).toBeGreaterThan(0.4);
    expect(Math.abs(pos[tip])).toBeLessThan(0.01);
  });
});

describe("ruins", () => {
  // Kyler's ruins (D178): rusty posts and beige panels, his colours; they still stand apart from
  // contaminated ground in lightness, close up and from afar (each storey a lattice block, D305): its rusty veins and,
  // from afar, the pattern's mean over the soil (D154 as amended 2026-11-07: the game's pattern, no rust fill)
  it("stand apart from contaminated ground: rusty posts and beige panels far lighter, and the far block too", () => {
    for (const ground of [CONTAMINATED_GROUND.dry, CONTAMINATED_GROUND.grass, CONTAMINATION.vein]) {
      expect(lum(RUIN.rust)).toBeGreaterThan(lum(ground) + 0.12);
      // the panels the lightest of a ruin, as the game's are (since 2026-11-08 the game's colour, D496's rule, whose
      // readability D135 as amended accepts: the gap of 0.35 over the ground #e3cf96 kept is no longer ours to add)
      expect(lum(RUIN.panel)).toBeGreaterThan(lum(ground) + 0.2);
      expect(lum(RUIN.panel)).toBeGreaterThan(Math.max(lum(RUIN.rust), lum(RUIN.far)));
      // from afar a storey is a lattice block in the near skeleton's own muted rust (D305)
      expect(lum(RUIN.far)).toBeGreaterThan(lum(ground) + 0.12);
    }
    // the panels are beige, not rust: far less red for their lightness than the veins
    const hue = (c: readonly number[]) => (c[0] - c[2]) / lum(c);
    expect(hue(RUIN.panel)).toBeLessThan(hue(CONTAMINATION.vein) - 0.5);
  });
});

describe("the light look", () => {
  it("draws each model once, whatever the number of objects", () => {
    const list = Array.from({ length: 40 }, (_, k) => ({ template: k % 2 ? "Pine" : "Oak", x: k, y: k % 5, z: 2, orientation: "Cw0", owner: "f", dead: k % 4 === 0 }));
    const lite = buildEntities(entityView(list), new ShaderMaterial(), null, 0, true).group.children as unknown as Mesh[];
    const full = new Map((buildEntities(entityView(list), new ShaderMaterial()).group.children as unknown as Mesh[]).map((c) => [c.name, c.count]));
    for (const m of lite) {
      expect(m.count).toBe(1);
      const of = full.get(m.name.replace(/\.lite$/, ""))!;
      expect(of).toBeGreaterThan(0);
      expect(m.geometry.getAttribute("position").count % of).toBe(0);
    }
  });
});
