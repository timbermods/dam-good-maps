// Map look's fix round (PLAN §20 D114): every meaning reads in greyscale and with any colour
// blindness, never by colour alone. The meanings keep an order of lightness; contamination (a layer
// over the ground since Kyler's contamination round) reads by its veins; dam sites are hatched
// with a dark rim; dead trees, slope arrows and the start keep a minimum size from afar; the legend
// names every meaning the view draws.

import { describe, expect, it } from "vitest";
import { DataTexture, ShaderMaterial } from "three";
import { DAM } from "../../src/editor/tools";
import { buildEntities } from "../../src/render3d/entities3d";
import { fallMaterial, hatchMarks, sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { entityView } from "../../src/render3d/model";
import { CLEAR_WATER, badwaterBody } from "../../src/render3d/waterPalette";
import { contaminatedGround, contaminationVein, contaminationVeins, DAM_OVERLAY, DAM_SITE, damLegendSwatch, DEAD_TREE, GROUND, groundColor, HATCH, LIVING_TREE, cssColor, legendEntries, objectLegend, WATER, waterBody } from "../../src/render3d/palette";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

type Mesh = { name: string; count: number; geometry: { getAttribute(n: string): { array: ArrayLike<number>; itemSize: number } | undefined } };

describe("the meanings in lightness", () => {
  it("keep their order: dead trees, moist, dry ground, badwater", () => {
    expect(lum(DEAD_TREE)).toBeGreaterThan(lum(GROUND.moistLow) + 0.1);
    // grass over dry earth: 0.1, the game's own contrast (Kyler, batch 4's follow-up, loosened from 0.2 so
    // grass could come down toward the game's L* 50-55); the colour-blindness check below tells them apart
    expect(lum(GROUND.moistHigh)).toBeGreaterThan(lum(GROUND.dry) + 0.1);
    // badwater is #38's approved crimson (D177), lighter than the red-black it was, and still below
    // dry ground and clean shallows. Kyler accepted these margins while the order holds. FRAGILE:
    // dry ground clears its margin by only 0.0001 (0.1501 over 0.15)
    expect(lum(GROUND.dry)).toBeGreaterThan(lum(WATER.bad) + 0.15);
    // clean water's body is lighter than badwater's at every depth (Kyler's rule: badwater stays
    // clearly darker than clean water; the body is the colour the shader draws before its light)
    for (const d of [0.05, 0.25, 0.5, 1, 2, 3, 5]) expect(lum(waterBody(d, false)) - lum(waterBody(d, true))).toBeGreaterThan(0.05);
    // clean shallows over badwater: D304 narrowed this margin, but D310 restored it to its strictness
    // before D304 (never loosened) by darkening clean water and badwater's floor together
    expect(lum(WATER.shallow)).toBeGreaterThan(lum(WATER.bad) + 0.3);
    // living trees are dark, dead trees nearly white
    expect(lum(DEAD_TREE) - lum(LIVING_TREE)).toBeGreaterThan(0.55);
    // a dam site's stripes: light and dark
    expect(lum(DAM_SITE) - lum(HATCH.dark)).toBeGreaterThan(0.7);
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

  it("stays darker than clean clear water over any bed, in greyscale and every colour-blindness simulation", () => {
    for (const bed of [GROUND.underwater, GROUND.dry, GROUND.moistLow]) {
      const clean = over(bed, WATER.clearTint, CLEAR_WATER.opacity + CLEAR_WATER.ripple);
      const bad = over(bed, badwaterBody(0.25), CLEAR_WATER.badOpacity);
      for (const m of Object.values(sims)) expect(lstar(clean, m) - lstar(bad, m)).toBeGreaterThan(10);
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

describe("grass and dry earth, in greyscale and every colour-blindness simulation (D324's follow-up: the rule is 0.1)", () => {
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

  it("tell every grass from every patch of dry earth by 10 L* and 18 in Lab, in each simulation (the lowest of them, at 0.1, is 11 and 19)", () => {
    for (const grass of [GROUND.moistLow, GROUND.moistHigh])
      for (const dry of [GROUND.dry, GROUND.dryCool, GROUND.dryWarm])
        for (const m of Object.values(sims)) {
          const g = lab(grass, m);
          const d = lab(dry, m);
          expect(g[0] - d[0]).toBeGreaterThanOrEqual(10);
          expect(Math.hypot(g[0] - d[0], g[1] - d[1], g[2] - d[2])).toBeGreaterThanOrEqual(18);
        }
  });
});

describe("contamination", () => {
  // Kyler (contamination round): a layer over the ground, as in the game, never a solid rust fill
  const levels = [1 / 15, 0.2, 0.4, 0.6, 0.8, 1];
  const soils = [0, 15, 150]; // dry, moist at the edge, moist by the water

  it("is a layer: the ground's own look stays under it, its veins grow denser and brighter with contamination, wet and dry contaminated ground differ, and it reads in greyscale", () => {
    // the ground's own look stays underneath: moist ground stays grass, dry ground cracked earth,
    // only stained a little between the veins close up
    for (const m of soils) for (const c of [1, 120, 255]) expect(groundColor(m, c, false)).toEqual(groundColor(m, 0, false));
    for (const l of levels) expect(contaminationVeins(l).stain).toBeLessThanOrEqual(0.2);
    // denser and brighter as contamination rises
    for (let k = 1; k < levels.length; k++) {
      const a = contaminationVeins(levels[k - 1]);
      const b = contaminationVeins(levels[k]);
      for (const key of ["reach", "fine", "glowDry", "glowWet", "cover"] as const) expect(b[key]).toBeGreaterThanOrEqual(a[key]);
      expect(lum(contaminationVein(levels[k], false))).toBeGreaterThan(lum(contaminationVein(levels[k - 1], false)));
    }
    expect(contaminationVeins(1).reach - contaminationVeins(1 / 15).reach).toBeGreaterThan(0.5);
    expect(contaminationVeins(1).fine).toBe(1);
    expect(contaminationVeins(1 / 15).fine).toBe(0);
    for (const l of levels) {
      const dryVein = lum(contaminationVein(l, false));
      const wetVein = lum(contaminationVein(l, true));
      // wet and dry contaminated ground differ: glowing orange veins on earth, dark red through
      // grass, over grounds that differ too
      expect(dryVein - wetVein).toBeGreaterThan(0.2);
      expect(lum(contaminatedGround(150, l, false)) - lum(contaminatedGround(0, l, false))).toBeGreaterThan(0.15);
      // in greyscale: on dry earth light lines where clean earth has dark cracks; through grass
      // dark lines
      expect(dryVein - lum(GROUND.crack)).toBeGreaterThan(0.2);
      expect(dryVein).toBeGreaterThan(lum(contaminatedGround(0, l, false)) + 0.02);
      for (const m of [15, 150]) expect(lum(contaminatedGround(m, l, false)) - wetVein).toBeGreaterThan(0.25);
      // from afar, where the veins are too fine to see, the ground is darker than clean ground,
      // and still lighter than badwater (by 0.053 at the least, about 4 L*, since badwater is #38's
      // crimson, D177; by 0.18 before, when it was red-black)
      expect(lum(groundColor(0, 0, false)) - lum(contaminatedGround(0, l, true))).toBeGreaterThan(0.03);
      for (const m of [15, 150]) expect(lum(groundColor(m, 0, false)) - lum(contaminatedGround(m, l, true))).toBeGreaterThan(0.06);
      for (const m of soils) expect(lum(contaminatedGround(m, l, true))).toBeGreaterThan(lum(WATER.bad) + 0.05);
    }
    // the most contaminated: bright veins, and a clear stain from afar
    expect(lum(contaminationVein(1, false)) - lum(GROUND.dry)).toBeGreaterThan(0.2);
    expect(lum(GROUND.dry) - lum(contaminatedGround(0, 1, true))).toBeGreaterThan(0.09);
  });
});

describe("dam sites", () => {
  it("are hatched (alpha 255), in the editor and the preview alike", () => {
    expect(DAM_OVERLAY[3]).toBe(255);
    expect([...DAM]).toEqual([...DAM_OVERLAY]);
  });

  it("mark the hatched tiles and their neighbours, for the rim", () => {
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
    for (const want of [/Moist/, /Dry/, /Contaminated/, /^Water: darker is deeper/, /^Badwater$/, /mixed with badwater/, /Walls/, /dead/, /Living trees/, /The start/, /Slopes: arrows point uphill/, /Ruins/, /Mine site/, /Geothermal field/, /Water source/, /Badwater source/, /blocks/])
      expect(labels.some((l) => want.test(l)), String(want)).toBe(true);
    // the dam site's swatch is hatched light and dark
    const dam = decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(damLegendSwatch())![1]);
    expect(dam).toContain(cssColor(DAM_SITE));
    expect(dam).toContain(cssColor(HATCH.dark));
  });
});
