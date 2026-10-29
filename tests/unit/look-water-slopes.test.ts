// Map look's third round (PLAN §20 D115) and Kyler's clean look: badwater stays clearly darker
// than clean water, and clean water keeps its shore foam, glints and see-through shallows so it
// reads apart from ground (it may be as dark as dry ground, as in the game); water partly bad
// turns smoothly from clean water to badwater, the badwater share blended between tiles (D177,
// which replaced each top showing its own tile's share); a slope's arrow is level and floats above the slope, pointing uphill, so it reads from
// any camera angle; ruins stand apart from contaminated ground; and the light look (software
// rendering) draws each model once, however many objects use it.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { buildEntities, SLOPE_ARROW_HEIGHT } from "../../src/render3d/entities3d";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { GROUND, RUIN, WATER_SURFACE, waterBody, waterOpacity } from "../../src/render3d/palette";
import { blendedBadwater, meshWaterChunk } from "../../src/render3d/waterMesh";
import { waterFilmGround } from "../../src/render3d/waterPalette";
import { plainLayers } from "../../src/render3d/waterLayers";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** CIE L* of a display colour (sRGB). */
const lightness = (c: readonly number[]) => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

type Mesh = { name: string; count: number; geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } } };

describe("water", () => {
  it("keeps badwater clearly darker than clean water, which has shore foam, glints and see-through shallows", () => {
    const depths = Array.from({ length: 100 }, (_, k) => 0.05 + k * 0.05);
    // badwater's body at least 6 L* darker than clean water's at any depth, open or by a bank
    // (7.7 at the least, in deep water; the lit views show about 18)
    for (const d of depths) for (const fromBank of [0, 0.2, 1]) expect(lightness(waterBody(d, false, fromBank)) - lightness(waterBody(d, true)), `${d} deep`).toBeGreaterThan(6);
    // foam along the shore and just off it, and glints, in the water shader
    expect(WATER_SURFACE.shoreFoam).toBeGreaterThan(0.3);
    expect(WATER_SURFACE.brokenFoam).toBeGreaterThan(0.3);
    expect(WATER_SURFACE.glints).toBeGreaterThan(0.3);
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t())).fragmentShader;
    const num = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
    expect(shader).toContain(`mix(${num(WATER_SURFACE.shoreFoam)}, 0.45, bad)`);
    expect(shader).toContain(`* ${num(WATER_SURFACE.brokenFoam)} * (1.0 - bad)`);
    expect(shader).toContain(`glints * ${num(WATER_SURFACE.glints)}`);
    // see-through: never opaque, clearer toward the banks, and at a bank of water a level deep
    // or shallower the bed shows through
    for (const d of depths) {
      expect(waterOpacity(d, 0)).toBeLessThan(1);
      expect(waterOpacity(d, 0)).toBeLessThanOrEqual(waterOpacity(d, 1));
    }
    for (const d of [0.1, 0.25, 0.5, 1]) expect(waterOpacity(d, 0)).toBeLessThan(0.8);
  });

  it("draws water of any depth as water, as the game does (D496, WATER_FILM): only a sliver fades in, smoothly; badwater murkier", () => {
    // the game draws a film a tenth of a level deep as water, not a faint tint over its ground (#571's thin
    // films went with D496): from a fiftieth of a level the body's own opacity
    const S = WATER_SURFACE;
    for (const d of [0.02, 0.03, 0.05, 0.1]) {
      expect(waterOpacity(d), `${d} deep`).toBeCloseTo(S.clearest + (S.deepest - S.clearest) * (1 - Math.exp(-d * S.absorb)), 9);
      // badwater stays murkier than clean water as thin
      expect(waterOpacity(d, 1, 1)).toBeGreaterThan(waterOpacity(d) + 0.2);
    }
    // a sliver fades in: under the body's opacity, rising with depth to it
    expect(waterOpacity(0.005)).toBeLessThan(waterOpacity(0.02));
    let last = waterOpacity(0);
    for (let d = 0.002; d <= 0.6; d += 0.002) {
      const a = waterOpacity(d);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
    // a quarter of a level deep and deeper: the body's own opacity, as before
    for (const d of [0.25, 0.5, 1, 3]) expect(waterOpacity(d)).toBeCloseTo(S.clearest + (S.deepest - S.clearest) * (1 - Math.exp(-d * S.absorb)), 9);
    // the shader reads the same curve
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t())).fragmentShader;
    expect(shader).toContain("float alpha = mix(WATER_FILM_CLEAN, cleanWaterAlpha(absorb), film);");
    expect(shader).toContain("return max(mix(min(WATER_FILM_BAD, body), body, waterFilm(depth)), grazing * ");
  });

  it("draws the ground under a film in the water's hue (D154): teal, crimson, mixed water through the warm midpoint, never purple or mauve-grey", () => {
    /** Hue in degrees (0 red, 120 green, 240 blue) and saturation (max - min) of a display colour. */
    const hue = (c: readonly number[]) => {
      const [r, g, b] = c;
      const mx = Math.max(r, g, b);
      const d = mx - Math.min(r, g, b);
      if (d < 1e-6) return { h: 0, s: 0 };
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return { h: (h * 60 + 360) % 360, s: d };
    };
    for (const ground of [GROUND.moistLow, GROUND.moistHigh, GROUND.dry, GROUND.contaminated]) {
      // clean: a teal-green, the grass's hue only partly kept; badwater: crimson whatever the ground
      const clean = hue(waterFilmGround(ground, 0));
      expect(clean.h, `clean over ${ground}`).toBeGreaterThan(130);
      expect(clean.h).toBeLessThan(200);
      const bad = hue(waterFilmGround(ground, 1));
      expect(bad.h < 20 || bad.h > 350, `badwater over ${ground}: ${bad.h}`).toBe(true);
      // mixed water: never purple or mauve (hues 250-345 with any colour to them)
      for (let s = 0.05; s < 1; s += 0.05) {
        const m = hue(waterFilmGround(ground, s));
        if (m.s > 0.02) expect(m.h > 250 && m.h < 345, `share ${s.toFixed(2)} over ${ground}: ${m.h}`).toBe(false);
      }
    }
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
    // the blend keeps the order and softens the steps: from the badwater end to the clean end,
    // no corner step above a third
    const corners = [0, 1, 2, 3, 4].map(at);
    for (let k = 1; k < corners.length; k++) {
      expect(corners[k]).toBeLessThanOrEqual(corners[k - 1]);
      expect(corners[k - 1] - corners[k]).toBeLessThan(0.34);
    }
    expect(corners[0]).toBeGreaterThan(0.5);
    expect(corners[4]).toBeGreaterThan(0);
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
  // rusty contaminated ground in lightness, close up and from afar (each storey a lattice block, D305)
  it("stand apart from rusty contaminated ground: rusty posts and beige panels far lighter, and the far block too", () => {
    expect(lum(RUIN.rust)).toBeGreaterThan(lum(GROUND.contaminated) + 0.12);
    expect(lum(RUIN.panel)).toBeGreaterThan(lum(GROUND.contaminated) + 0.35);
    // from afar a storey is a lattice block in the near skeleton's own muted rust (D305)
    expect(lum(RUIN.far)).toBeGreaterThan(lum(GROUND.contaminated) + 0.12);
    // the panels are beige, not rust: far less red for their lightness
    const hue = (c: readonly number[]) => (c[0] - c[2]) / lum(c);
    expect(hue(RUIN.panel)).toBeLessThan(hue(GROUND.contaminated) - 0.5);
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
