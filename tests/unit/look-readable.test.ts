// Map look's fix round (PLAN §20 D114), as D334 re-bases it: the map's meanings read as they do in
// the game, by the game's own look and cues (D334 (2): no lightness gap or pattern beyond the game's;
// the colour-blindness simulations are information). Grass and dry earth keep their own colours,
// contamination reads by its orange-red veins over either soil, badwater by its crimson, dullness and
// bubbles; a hatched overlay (alpha 255) has a dark rim; dead trees, slope arrows and the start keep a
// minimum size from afar; the legend names every meaning the view draws.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { buildEntities } from "../../src/render3d/entities3d";
import { fallMaterial, hatchMarks, sceneUniforms, terrainMaterial, waterMaterial } from "../../src/render3d/materials";
import { entityView } from "../../src/render3d/model";
import { CLEAR_WATER, badwaterBody } from "../../src/render3d/waterPalette";
import { CONTAMINATION, contaminationVein, contaminationVeins, DEAD_TREE, GROUND, groundColor, LIVING_TREE, cssColor, legendEntries, objectLegend, WATER, waterBody, type Rgb } from "../../src/render3d/palette";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

type Mesh = { name: string; count: number; geometry: { getAttribute(n: string): { array: ArrayLike<number>; itemSize: number } | undefined } };

describe("the meanings", () => {
  // HSV hue in degrees
  const hue = (c: readonly number[]) => {
    const max = Math.max(...c);
    const d = max - Math.min(...c);
    if (!d) return 0;
    const h = max === c[0] ? 60 * (((c[1] - c[2]) / d) % 6) : max === c[1] ? 60 * ((c[2] - c[0]) / d + 2) : 60 * ((c[0] - c[1]) / d + 4);
    return h < 0 ? h + 360 : h;
  };

  it("keep the game's own cues (D334): green grass, warm earth, teal water, crimson badwater, pale dead trees", () => {
    // grass is green, dry earth warm brown to mauve, clean water teal-blue, badwater crimson: each
    // meaning its own hue, as in the game, with no lightness order asked between them (D334 (2))
    for (const g of [GROUND.moistLow, GROUND.moistHigh]) expect(hue(g) > 70 && hue(g) < 110, cssColor(g)).toBe(true);
    for (const d of [GROUND.dry, GROUND.dryWarm]) expect(hue(d)).toBeLessThan(40);
    expect(hue(GROUND.dryCool) > 300 || hue(GROUND.dryCool) < 40).toBe(true);
    for (const d of [0.05, 0.5, 2, 5]) expect(hue(waterBody(d, false)) > 170 && hue(waterBody(d, false)) < 210, `${d} deep`).toBe(true);
    for (const d of [0.05, 0.5, 2, 5]) expect(hue(waterBody(d, true)) < 15 || hue(waterBody(d, true)) > 350).toBe(true);
    // dead trees stand out pale against grass, living trees dark, dead trees nearly white
    expect(lum(DEAD_TREE)).toBeGreaterThan(lum(GROUND.moistLow) + 0.1);
    expect(lum(DEAD_TREE) - lum(LIVING_TREE)).toBeGreaterThan(0.55);
  });
});

describe("badwater seen through clear water (D324, feedback item 5: never a hatching)", () => {
  // Clear water (T, or under the brush) is see-through: clean water a faint blue tint over the bed,
  // badwater its murky crimson at CLEAR_WATER.badOpacity. With no pattern to tell them apart, the
  // lightness does it, in greyscale and in every colour-blindness simulation (Machado, Oliveira and
  // Fernandes 2009, severity 1, as the captures use), over the beds water lies on; colour, the dull
  // troughs and the slow bubbles come on top of that.
  const sims: Record<string, number[]> = {
    none: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lstar = (c: readonly number[], m: number[]) => {
    const l = c.map(lin);
    const s = [0, 1, 2].map((r) => Math.max(0, m[r * 3] * l[0] + m[r * 3 + 1] * l[1] + m[r * 3 + 2] * l[2]));
    const y = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  };
  const over = (bed: readonly number[], c: readonly number[], a: number) => bed.map((v, k) => v + (c[k] - v) * a);

  it("reads as badwater by its murk: darker than clean clear water over any bed (colour-blind lightness is information, D334 (2))", () => {
    for (const bed of [GROUND.underwater, GROUND.dry, GROUND.moistLow]) {
      const clean = over(bed, WATER.clearTint, CLEAR_WATER.opacity + CLEAR_WATER.ripple);
      const bad = over(bed, badwaterBody(0.25), CLEAR_WATER.badOpacity);
      // murkier than clean water in plain sight; in each simulation the difference is reported, not
      // held to a margin (the game guarantees none; badwater's troughs and bubbles, checked below,
      // carry it as the game's do)
      expect(lstar(clean, sims.none)).toBeGreaterThan(lstar(bad, sims.none));
      for (const m of Object.values(sims)) expect(Number.isFinite(lstar(clean, m) - lstar(bad, m))).toBe(true);
    }
  });

  it("has no stripe on badwater in any water shader (water, fall, and the lower-cost forms), and the palette defines none", () => {
    expect(Object.keys(CLEAR_WATER)).not.toContain("stripe");
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const u = sceneUniforms(1, 1, t(), t(), t(), t());
      for (const m of [waterMaterial(u, lite), fallMaterial(u, lite)]) expect(m.fragmentShader).not.toMatch(/CLEAR_STRIPE|fract\(\(g\.x - g\.y/);
      // badwater's murk, dull troughs and bubbles are what carry it through clear water
      expect(waterMaterial(u, lite).fragmentShader).toContain("bc += BADWATER_VEIN * bubbles * BADWATER_BUBBLES");
    }
  });
});

describe("grass and dry earth, in greyscale and every colour-blindness simulation (information since D334 (2))", () => {
  const sims: Record<string, number[]> = {
    none: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  };
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lab = (c: readonly number[], m: number[]) => {
    const l = c.map(lin);
    const s = [0, 1, 2].map((r) => Math.max(0, m[r * 3] * l[0] + m[r * 3 + 1] * l[1] + m[r * 3 + 2] * l[2]));
    const X = 0.4124 * s[0] + 0.3576 * s[1] + 0.1805 * s[2];
    const Y = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    const Z = 0.0193 * s[0] + 0.1192 * s[1] + 0.9505 * s[2];
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X / 0.9505) - f(Y)), 200 * (f(Y) - f(Z / 1.089))];
  };

  it("measure every grass against every patch of dry earth in each simulation, as information, from Kyler's accepted colours", () => {
    // the accepted inputs (D324's grass, D334's earth as D346 greyed it)
    expect(GROUND.moistLow).toEqual([0.445, 0.575, 0.28]);
    expect(GROUND.moistHigh).toEqual([0.415, 0.55, 0.265]);
    expect([GROUND.dry, GROUND.dryCool, GROUND.dryWarm]).toEqual([[0.463, 0.403, 0.367], [0.444, 0.414, 0.438], [0.52, 0.438, 0.375]]);
    // the matrix (L* gap, Lab distance) for each grass, patch and simulation: finite and within
    // range. D334 (2) asks for the game's own readability, with no gap: these numbers are reported
    // (docs/progress/high-look.md), not held to one; the captures judge the look
    const matrix: { gap: number; distance: number }[] = [];
    for (const grass of [GROUND.moistLow, GROUND.moistHigh])
      for (const dry of [GROUND.dry, GROUND.dryCool, GROUND.dryWarm])
        for (const m of Object.values(sims)) {
          const g = lab(grass, m);
          const d = lab(dry, m);
          for (const v of [...g, ...d]) expect(Number.isFinite(v)).toBe(true);
          expect(g[0]).toBeGreaterThanOrEqual(0);
          expect(g[0]).toBeLessThanOrEqual(100);
          matrix.push({ gap: g[0] - d[0], distance: Math.hypot(g[0] - d[0], g[1] - d[1], g[2] - d[2]) });
        }
    expect(matrix).toHaveLength(2 * 3 * 4);
  });
});

describe("contamination", () => {
  // Kyler (contamination round): a layer over the ground, as in the game, never a solid rust fill;
  // D334: the game's own orange-red veins, through dry earth and grass alike
  const levels = [1 / 15, 0.2, 0.4, 0.6, 0.8, 1];
  const soils = [0, 15, 150]; // dry, moist at the edge, moist by the water

  it("is a layer: the ground's own look stays under and between its veins, which are orange-red over either soil and widen and glow more with contamination, and none at zero", () => {
    // the ground's own look stays underneath: moist ground stays grass, dry ground cracked earth,
    // and between the veins it is its own colour (no stain)
    for (const m of soils) for (const c of [1, 120, 255]) expect(groundColor(m, c, false)).toEqual(groundColor(m, 0, false));
    // none at zero: a vein over any soil is the soil itself; fully in from its onset
    expect(contaminationVeins(0).onset).toBe(0);
    for (const l of levels) expect(contaminationVeins(l).onset).toBe(1);
    for (const m of soils) expect(contaminationVein(0, groundColor(m, 0, false))).toEqual(groundColor(m, 0, false));
    // wider and glowing more as contamination rises (the veins half as wide again at the most)
    for (let k = 1; k < levels.length; k++) {
      const a = contaminationVeins(levels[k - 1]);
      const b = contaminationVeins(levels[k]);
      expect(b.width).toBeGreaterThan(a.width);
      expect(b.glow).toBeGreaterThan(a.glow);
    }
    expect(contaminationVeins(1).width / contaminationVeins(0).width).toBeGreaterThan(1.5);
    // orange-red over either soil: red well over green, green over blue, a hue from red to orange
    for (const m of soils)
      for (const l of levels) {
        const v = contaminationVein(l, groundColor(m, 0, false));
        for (const x of v) expect(x >= 0 && x <= 1).toBe(true);
        expect(v[0]).toBeGreaterThan(v[1] + 0.3);
        expect(v[1]).toBeGreaterThan(v[2]);
      }
    expect(cssColor(CONTAMINATION.vein)).toBe("#852109");
  });

  it("is drawn by the terrain shader from the same numbers, over dry earth and grass alike, in both full looks (the light look tints)", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    const gl = (c: Rgb) => `vec3(${c.map((v) => (Number.isInteger(v) ? `${v}.0` : String(Math.round(v * 1000) / 1000))).join(", ")})`;
    const src = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    // one vein field for both soils (no grass-only or earth-only veins), gated by the soil's own
    // contamination, never under water
    expect(src).toContain("if (bad > 0.0 && wet < 1.0) vein = veinsOf(g, lvl) * bad * (1.0 - wet);");
    expect(src).toContain(`c = mix(c, ${gl(CONTAMINATION.vein)}, vein.x * ${CONTAMINATION.cover});`);
    expect(src).toContain(`glow = vein.y * mix(${CONTAMINATION.glow[0]}, ${CONTAMINATION.glow[1]}, lvl);`);
    expect(src).toContain(`smoothstep(0.0, ${CONTAMINATION.onset}, lvl)`);
    // (the rendered sequence, clean to contaminated and back, in Standard and High: tests/e2e/look-high.spec.ts)
  });
});

describe("a hatched overlay (alpha 255)", () => {
  it("marks the hatched tiles and their neighbours, for the rim", () => {
    const W = 5;
    const H = 4;
    const overlay = new Uint8Array(W * H * 4);
    overlay.set([255, 214, 41, 255], (2 * W + 2) * 4); // (2, 2) hatched
    overlay.set([255, 208, 90, 105], (1 * W + 1) * 4); // a selection tint: not hatched
    const m = hatchMarks(W, H, overlay);
    const r = (x: number, y: number) => m[(y * W + x) * 4];
    const g = (x: number, y: number) => m[(y * W + x) * 4 + 1];
    expect(r(2, 2)).toBe(1);
    expect(r(1, 2)).toBe(2); // its east neighbour is hatched
    expect(r(3, 2)).toBe(4); // west
    expect(r(2, 1)).toBe(8); // north
    expect(r(2, 3)).toBe(16); // south
    expect(g(1, 1)).toBe(1); // north-east
    expect(g(3, 3)).toBe(8); // south-west
    expect(r(1, 1)).toBe(0);
    expect(r(0, 0) + g(0, 0)).toBe(0);
  });
});

describe("objects from afar", () => {
  const view = entityView([
    { template: "Pine", x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f" },
    { template: "Pine", x: 3, y: 1, z: 2, orientation: "Cw0", owner: "f", dead: true },
    { template: "Birch", x: 5, y: 1, z: 2, orientation: "Cw0", owner: "f", dead: true },
    { template: "Slope", x: 7, y: 1, z: 2, orientation: "Cw90", owner: "f" },
    { template: "StartingLocation", x: 10, y: 10, z: 2, orientation: "Cw0", owner: "s" },
    { template: "RuinColumnH2", x: 12, y: 1, z: 2, orientation: "Cw0", owner: "f" },
  ]);
  const meshes = new Map((buildEntities(view, new ShaderMaterial()).group.children as unknown as Mesh[]).map((c) => [c.name, c]));
  const grow = (name: string) => Array.from(meshes.get(name)!.geometry.getAttribute("grow")!.array);

  it("dead trees, slope arrows and the start have a minimum size; living trees and ruins do not", () => {
    expect(grow("Pine.dead")[0]).toBeGreaterThan(0);
    expect(grow("Birch.dead")[0]).toBeGreaterThan(0);
    expect(grow("start")[0]).toBeGreaterThan(0);
    expect(grow("Slope.mark")[0]).toBeGreaterThan(0);
    expect(grow("Pine")[0]).toBe(0);
    expect(grow("Slope")[0]).toBe(0);
    for (const [k, m] of meshes) if (k.startsWith("scaffold")) expect(grow(k)[0]).toBe(0);
    expect(meshes.get("Slope.mark")!.count).toBe(1);
  });

  it("a dead tree is ashen: pale all over, a body of bare wood and no green", () => {
    const col = meshes.get("Pine.dead")!.geometry.getAttribute("pcolor")!.array;
    for (let k = 0; k < col.length; k += 3) expect(lum([col[k], col[k + 1], col[k + 2]])).toBeGreaterThan(0.6);
    const living = meshes.get("Pine")!.geometry.getAttribute("pcolor")!.array;
    let dark = 0;
    for (let k = 0; k < living.length; k += 3) if (lum([living[k], living[k + 1], living[k + 2]]) < 0.35) dark++;
    expect(dark / (living.length / 3)).toBeGreaterThan(0.6);
  });
});

describe("the legend", () => {
  it("names every meaning the view draws", () => {
    const labels = [...legendEntries("moisture"), ...objectLegend()].map((e) => e.label);
    for (const want of [/^Moist ground$/, /^Dry ground$/, /^Contaminated ground$/, /^Water$/, /^Badwater$/, /^Mixed water$/, /^Walls$/, /^Dead trees$/, /^Trees and bushes$/, /^Start$/, /^Slope arrows$/, /^Ruins$/, /^Mine site$/, /^Geothermal field$/, /^Water source$/, /^Badwater source$/, /^Other objects$/])
      expect(labels.some((l) => want.test(l)), String(want)).toBe(true);
    // no dam site is drawn (D287)
    expect(labels.some((l) => /dam site/i.test(l))).toBe(false);
  });
});
