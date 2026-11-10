// Map look (ROADMAP "Map look", PLAN §20 D86): the soil colours and their legend, the height bands
// on the walls, the baked light (sky visibility and soft sun shadows, the same bytes every time),
// the water's foam flags, the models by species and dead state, the soil a file stores, and the
// hover text that says what the ground's colour means.

import { describe, expect, it } from "vitest";
import { storedSoil } from "../../src/core/format/world";
import { describeTile, entitiesByTile } from "../../src/editor/features";
import { buildEntities, modelKeyOf, modelTriangles } from "../../src/render3d/entities3d";
import { casterLevelsOf, decodeTop, DEFAULT_SUN, encodeTop, litFraction, objectCasters, PLANT_WIDEST, shadowMap, shadowTops, SHADOW_RES, soilNibbles, tileData, waterByte, withCasterLevels } from "../../src/render3d/light";
import { DEAD, entityView, soilView, surfaceWater, waterFromDepth, YOUNG } from "../../src/render3d/model";
import { cliffTint, objectTop, contaminationByte, contaminationVein, cssColor, DEAD_TREE, GROUND, groundColor, groundKind, legendEntries, LIGHT, moistureByte, sunlitTop, WALL, wallColor, waterBody } from "../../src/render3d/palette";
import { HIGH_WATER } from "../../src/render3d/waterPalette";
import { cleanWaterShown } from "./waterShown";
import { waterHooks } from "../../src/render3d/high/shaders";
import { dropFlags, EDGE_CURTAIN, meshWaterChunk, SHORE_BITS } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";
import { DataTexture, ShaderMaterial } from "three";
import { sceneUniforms, terrainMaterial, waterMaterial } from "../../src/render3d/materials";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe("a crisp map (D324's follow-up: tile edges, no blend across a whole tile)", () => {
  it("changes the soil at the tile's edge over a narrow band, and keeps the contamination's level smooth (no sky term since D497)", () => {
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    const src = terrainMaterial(sceneUniforms(1, 1, tex(), tex(), tex(), tex()), 0, 1).fragmentShader;
    // the soil's weights go through a band about a pixel wide (never under a twenty-fifth of a tile) at the edge
    expect(src).toContain("float bandW = max(0.04, 1.5 * max(fwidth(g.x), fwidth(g.y)));");
    expect(src).toContain("vec4 soil = flags0 * v00 + flags1 * v10 + flags2 * v01 + flags3 * v11;");
    // the contamination's level (shading) keeps the smooth, tile-wide weights; the sky's light is the game's ambient by the
    // normal, with no sky visibility blended in (D497)
    expect(src).not.toContain("float sky =");
    expect(src).toContain("float clev = (s0.y * w00 + s1.y * w10 + s2.y * w01 + s3.y * w11) / 15.0;");
    // and the contamination's edge is the game's blend across the tiles and its blending noise, with no wobble of our own
    // (D154 as amended 2026-11-07)
    expect(src).not.toContain("float edge = ((n1");
    expect(src).toContain("contamMap = tapBlend(g, ");
  });

  it("gives the grass-to-earth edge the game's painted shape (D324's note, D334): a slight irregular wobble along the tile's edge, the same from both tiles, and no rim (D135 as amended 2026-10-29: the game blends grass into desert by its share alone)", () => {
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    const src = terrainMaterial(sceneUniforms(1, 1, tex(), tex(), tex(), tex()), 0, 1).fragmentShader;
    // the wobble is world-anchored noise, signed by the side of the tile the point lies on, so the
    // two tiles either side of an edge agree on where it runs (smoothstep's symmetry about 0.5), a
    // twentieth of a tile at the most, within the narrow band
    expect(src).toContain("vec2 ws = smoothstep(vec2(0.5 - bandW), vec2(0.5 + bandW), w + edgeWave * sd * 0.105);");
    // no darker rim where grass meets earth (re-based from the rim, D148: the share now runs across whole tiles)
    expect(src).not.toContain("abs(soil.x - 0.5)");
    expect(src).toContain("c = ground;");
  });
});

describe("the ground's colours", () => {
  it("keeps any moisture or contamination above zero, and none at zero", () => {
    expect(moistureByte(0)).toBe(0);
    expect(moistureByte(0.001)).toBe(1);
    expect(moistureByte(16)).toBe(240);
    expect(moistureByte(100)).toBe(255);
    expect(contaminationByte(0)).toBe(0);
    expect(contaminationByte(0.0001)).toBe(1);
    expect(contaminationByte(1)).toBe(255);
    const s = soilView([0, 0.2, 12], [0, 0, 0.5]);
    expect([...s.moisture]).toEqual([0, 3, 180]);
    expect([...s.contamination]).toEqual([0, 0, 128]);
  });

  it("maps soil to moist, dry, contaminated or under water, in the shader's order, keeping the ground's own colour under contamination", () => {
    expect(groundKind(0, 0, false)).toBe("dry");
    expect(groundKind(3, 0, false)).toBe("moist");
    expect(groundKind(3, 9, false)).toBe("contaminated");
    expect(groundKind(0, 9, false)).toBe("contaminated");
    expect(groundKind(200, 0, true)).toBe("underwater");
    expect(groundColor(0, 0, false)).toEqual(GROUND.dry);
    expect(groundColor(1, 0, false)).toEqual(GROUND.grass);
    expect(groundColor(150, 0, false)).toEqual(GROUND.grass);
    // contamination is a layer over the ground (Kyler's contamination round): the colour under it
    // is the soil's own
    expect(groundColor(40, 5, false)).toEqual(groundColor(40, 0, false));
    expect(groundColor(0, 5, false)).toEqual(GROUND.dry);
  });

  it("keeps each meaning its own look (D334, re-basing the greyscale gaps): cracked earth, one grass at every moisture, orange-red veins only where there is contamination, water darker with depth", () => {
    // dry earth stays cracked earth: its cracks darker than it
    expect(lum(GROUND.crack)).toBeLessThan(lum(GROUND.dry));
    // moist ground is the game's grass, the same at every moisture level (its terrain shader has no moisture term:
    // only the desert's share changes with it, D135 as amended)
    for (let m = 15; m <= 150; m += 15) expect(groundColor(m, 0, false)).toEqual(GROUND.grass);
    // no contamination, no vein; any contamination, the game's rusty veins through either soil (D154 as amended)
    for (const soil of [GROUND.dry, GROUND.grass]) {
      expect(contaminationVein(0, soil)).toEqual(soil);
      for (const l of [1 / 15, 0.5, 1]) {
        const v = contaminationVein(l, soil);
        expect(v[0]).toBeGreaterThan(v[1] + 0.15);
        expect(v[1]).toBeGreaterThan(v[2]);
      }
    }
    // the water darkens with depth: the shipped clean water, the game's formula (its `_DepthGradients` R ramp falling and
    // its colour going to navy), at a fixed light (D496; D148: this checked Standard's own body colours until the formula
    // shipped)
    for (let d = 0.1; d < 5; d += 0.1) expect(lum(cleanWaterShown(d))).toBeLessThanOrEqual(lum(cleanWaterShown(d - 0.1)) + 1e-9);
    expect(lum(cleanWaterShown(4))).toBeLessThan(lum(cleanWaterShown(0.1)));
  });

  it("draws High's water darker with depth too (D334's navy pools, re-basing the High-water lightness margins: the order, not a gap)", () => {
    // High's own ramp: shallow, a level deep, deep, each darker (Kyler's approved inputs)
    expect(HIGH_WATER.shallow).toEqual([0.13, 0.29, 0.36]);
    expect(HIGH_WATER.body).toEqual([0.08, 0.2, 0.28]);
    expect(HIGH_WATER.deep).toEqual([0.045, 0.12, 0.19]);
    expect(lum(HIGH_WATER.body)).toBeLessThan(lum(HIGH_WATER.shallow));
    expect(lum(HIGH_WATER.deep)).toBeLessThan(lum(HIGH_WATER.body));
    // the surface blends them by depth with weights that only rise, so the body darkens with depth
    // at any look and light; no colour of our own at a grazing angle (D496: the game's change with angle is its
    // reflection), only the albedo the flow carries, over its mean
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    const src = waterMaterial(sceneUniforms(1, 1, tex(), tex(), tex(), tex()), false, waterHooks()).fragmentShader;
    expect(src).toContain("float bodyDepth = smoothstep(0.25, 1.25, depth);");
    expect(src).toContain("float deep = smoothstep(1.0, 3.5, depth);");
    expect(src).toContain("vec3 body = mix(mix(HW_SHALLOW, HW_BODY, bodyDepth), HW_DEEP, deep);");
    expect(src).toContain("body *= albedo / WATER_ALBEDO_MEAN;");
    expect(src).not.toContain("HW_GRAZING");
    // (clean against bad in High is the game's readability, D334 (2): no order or gap between them;
    // the rendered deep-under-shallow evidence is tests/e2e/look-high.spec.ts)
  });

  it("tints the walls by height as the game's cliffs (D497): its gradient from level 0 to 22, lighter higher up", () => {
    expect(cliffTint(0)).toEqual(WALL.gradient.min);
    for (let k = 0; k < 3; k++) expect(cliffTint(22)[k]).toBeCloseTo(WALL.gradient.max[k], 6);
    for (let lv = 0; lv < 22; lv++) expect(lum(wallColor(lv + 1))).toBeGreaterThan(lum(wallColor(lv)));
  });

  it("the legend names each colour, for soil and for height colours", () => {
    const soil = legendEntries("moisture").map((e) => e.label);
    expect(soil).toEqual(["Moist ground", "Dry ground", "Contaminated ground", "Water", "Badwater", "Walls", "Dead trees"]);
    const height = legendEntries("height").map((e) => e.label);
    expect(height[0]).toBe("Ground height");
    expect(height).not.toContain("Moist ground");
    // (the ground as a sunlit top shows it: its colour is an albedo the light multiplies, D497)
    expect(legendEntries("moisture")[1].swatch).toContain(cssColor(sunlitTop(GROUND.dry)));
    // (as its top shows in the game's light, as the ground's swatches: D135 as amended 2026-11-09)
    expect(legendEntries("moisture").at(-1)!.swatch).toBe(cssColor(objectTop(DEAD_TREE)));
  });
});

describe("the baked light", () => {
  const W = 24;
  const H = 20;
  const flat = new Uint8Array(W * H).fill(3);

  it("casts a pillar's shadow away from the sun (south-east), and never toward it", () => {
    const h = flat.slice();
    h[10 * W + 10] = 8; // a pillar 5 levels above the ground
    const hi = shadowTops(W, H, h, null, LIGHT.sunElevation + LIGHT.penumbra);
    const lo = shadowTops(W, H, h, null, LIGHT.sunElevation - LIGHT.penumbra);
    const R = SHADOW_RES;
    const lit = (x: number, y: number) => {
      const k = Math.floor((y + 0.5) * R) * W * R + Math.floor((x + 0.5) * R);
      return litFraction(3, hi[k], lo[k]);
    };
    // one and two tiles south-east of the pillar: in shadow; north-west, and far away: lit
    expect(lit(11, 9)).toBe(0);
    expect(lit(12, 8)).toBe(0);
    expect(lit(9, 11)).toBe(1);
    expect(lit(2, 2)).toBe(1);
  });

  it("softens a shadow's far end over the same width of ground under a low cliff and a high one, as the game's shadow map does (D497)", () => {
    // a plateau over x < 10, the ground east of it at 3; the sun from the north-west, 45° up: its shadow's edge runs
    // north-south, Hc / √2 east of the cliff, and along a row it turns to sun over LIGHT.edge / √2 of x (LIGHT.edge along the
    // sun's way)
    const R = SHADOW_RES;
    for (const cliff of [2, 8]) {
      const h = flat.slice();
      for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) h[y * W + x] = 3 + cliff;
      const hi = shadowTops(W, H, h, null, LIGHT.sunElevation + LIGHT.penumbra);
      const lo = shadowTops(W, H, h, null, LIGHT.sunElevation - LIGHT.penumbra);
      // (the shader's read of the map: bilinear between samples, at a row's sample centres)
      const y = 8 + 0.25;
      const lit = (x: number) => {
        const u = x * R - 0.5;
        const k0 = Math.floor(u);
        const t = u - k0;
        const row = Math.floor(y * R) * W * R;
        const top = (a: Float32Array) => a[row + k0] * (1 - t) + a[row + k0 + 1] * t;
        return litFraction(3, top(hi), top(lo));
      };
      const xs = Array.from({ length: 401 }, (_, k) => 10 + k / 50);
      const vs = xs.map(lit);
      for (let k = 1; k < vs.length; k++) expect(vs[k]).toBeGreaterThanOrEqual(vs[k - 1]);
      const first = xs[vs.findIndex((v) => v > 0)];
      const full = xs[vs.findIndex((v) => v >= 1)];
      // (within a tenth of a tile: where the edge falls between the map's samples, half a tile apart, the ground's own
      // tops round it bend the interpolated top a little; an angle's edge would widen with the cliff, 0.65 of x under
      // this eight-level one at 2°)
      expect(full - first, `a ${cliff}-level cliff`).toBeGreaterThanOrEqual(LIGHT.edge * Math.SQRT1_2 - 0.05);
      expect(full - first, `a ${cliff}-level cliff`).toBeLessThanOrEqual(LIGHT.edge * Math.SQRT1_2 + 0.1);
      expect((first + full) / 2, `a ${cliff}-level cliff`).toBeCloseTo(10 + cliff * Math.SQRT1_2, 1);
    }
  });

  it("bakes the same bytes every time, and trees and ruins cast shadows too", () => {
    const h = flat.slice();
    h[5 * W + 5] = 7;
    const e = entityView([
      { template: "Pine", x: 15, y: 12, z: 3, orientation: "Cw0", owner: "f" },
      { template: "RuinColumnH4", x: 3, y: 15, z: 3, orientation: "Cw0", owner: "f" },
      { template: "Pine", x: 18, y: 4, z: 3, orientation: "Cw0", owner: "f", dead: true },
    ]);
    const casters = objectCasters(W, H, e)!;
    expect(casters[12 * W + 15]).toBeGreaterThan(1);
    expect(casters[15 * W + 3]).toBeGreaterThan(3);
    expect(casters[4 * W + 18]).toBeLessThan(casters[12 * W + 15]);
    const a = shadowMap(W, H, h, casters);
    const b = shadowMap(W, H, h, objectCasters(W, H, e));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(a.length).toBe(W * SHADOW_RES * H * SHADOW_RES * 4);
    // the tree shades the ground to its south-east
    const noTree = shadowMap(W, H, h, null);
    expect(Buffer.from(a).equals(Buffer.from(noTree))).toBe(false);
  });

  it("casts a plant's shape, not its tile's column (D497: the game's shadows are its models')", () => {
    const u = DEFAULT_SUN;
    // (whether the ground at d tiles from a plant's middle away from the sun, and a across that way, is in shadow)
    const shaded = (bytes: Uint8Array, x: number, y: number, d: number, a = 0) => {
      const px = x + 0.5 - u.x * d + u.y * a;
      const py = y + 0.5 - u.y * d - u.x * a;
      return decodeTop(bytes[(Math.floor(py * SHADOW_RES) * W * SHADOW_RES + Math.floor(px * SHADOW_RES)) * 4]) > 3;
    };
    const one = (template: string) => objectCasters(W, H, entityView([{ template, x: 15, y: 12, z: 3, orientation: "Cw0", owner: "f" }]))!;
    const oak = one("Oak");
    const bytes = shadowMap(W, H, flat, oak);
    // an oak's crown (1.16 to 2.26 over the ground, at the sun's 45°) shades the ground 1 to 2.5 tiles off, not past 3
    for (const d of [1, 1.7, 2.4]) expect(shaded(bytes, 15, 12, d), `${d} tiles off`).toBe(true);
    expect(shaded(bytes, 15, 12, 3.4)).toBe(false);
    // nor a tile to either side of its shadow's middle, which the whole tile's column of its height shaded
    const column = withCasterLevels(oak.slice(), casterLevelsOf(oak)!.slice(0, W * H));
    const columns = shadowMap(W, H, flat, column);
    let shapeSamples = 0;
    let columnSamples = 0;
    for (let k = 0; k < W * H * SHADOW_RES * SHADOW_RES; k++) {
      if (decodeTop(bytes[k * 4]) > 3) shapeSamples++;
      if (decodeTop(columns[k * 4]) > 3) columnSamples++;
    }
    expect(shapeSamples).toBeGreaterThan(4);
    expect(shapeSamples).toBeLessThan(columnSamples);
    // a blueberry bush casts its low mound, which no column did (it had none)
    const bush = shadowMap(W, H, flat, one("BlueberryBush"));
    expect(shaded(bush, 15, 12, 0.5)).toBe(true);
    expect(shaded(bush, 15, 12, 1.5)).toBe(false);
  });

  it("casts a plant's shape on past where the ground drops away below it: off a bank's step, onto water", () => {
    const u = DEFAULT_SUN;
    // (ground 5 high up to just past the plant's middle along the sun's way, then `step` lower)
    const stepped = (step: number) => {
      const h = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = (15 - x) * u.x + (12 - y) * u.y > 0.6 ? 5 - step : 5;
      return h;
    };
    // (the shadow's top at d tiles from the plant's middle away from the sun)
    const topAt = (bytes: Uint8Array, d: number) => {
      const px = 15.5 - u.x * d;
      const py = 12.5 - u.y * d;
      return decodeTop(bytes[(Math.floor(py * SHADOW_RES) * W * SHADOW_RES + Math.floor(px * SHADOW_RES)) * 4]);
    };
    const pine = objectCasters(W, H, entityView([{ template: "Pine", x: 15, y: 12, z: 5, orientation: "Cw0", owner: "f" }]))!;
    // two levels down: the bank's own shadow ends 2.7 tiles off; the pine's whorls (1.1 to 2.7 over its level, 3.1 to
    // 4.7 over the ground below) shade it on to about 5, as its column did
    const low = stepped(2);
    const bytes = shadowMap(W, H, low, pine);
    const bank = shadowMap(W, H, low, null);
    for (const d of [3.5, 4, 4.5]) {
      expect(topAt(bank, d), `the bank alone, ${d} off`).toBeLessThan(3);
      expect(topAt(bytes, d), `${d} off`).toBeGreaterThan(3);
    }
    expect(topAt(bytes, 6)).toBeLessThan(3);
    // three levels down, the same past the bank's longer shadow
    const lower = shadowMap(W, H, stepped(3), pine);
    for (const d of [4.5, 5.25]) expect(topAt(lower, d), `${d} off, three levels down`).toBeGreaterThan(2);
    // onto water a level under the bank (its surface at 4 over ground 3): the whorls shade its surface 2.1 to 3.7 off
    for (const d of [2.5, 3, 3.5]) expect(topAt(bytes, d), `the water's surface, ${d} off`).toBeGreaterThan(4);
    expect(topAt(bytes, 5.5)).toBeLessThan(4);
  });

  it("casts a dead plant at its dead form's height (dying.ts DEAD_FORM), not a third of its living one", () => {
    const dead = objectCasters(W, H, entityView([{ template: "Pine", x: 15, y: 12, z: 3, orientation: "Cw0", owner: "f", dead: true }]))!;
    const alive = objectCasters(W, H, entityView([{ template: "Pine", x: 15, y: 12, z: 3, orientation: "Cw0", owner: "f" }]))!;
    expect(dead[12 * W + 15] / alive[12 * W + 15]).toBeCloseTo(0.79, 5);
  });

  it("casts no disc wide enough to reach samples an edit of its tile does not redo", () => {
    // (from a tile's middle to the nearest sample outside it: half a tile and half a sample)
    expect(PLANT_WIDEST).toBeLessThan(0.5 + 0.5 / SHADOW_RES);
    expect(PLANT_WIDEST).toBeGreaterThan(0.5);
  });

  it("encodes shadow tops within a tenth of a level", () => {
    for (const t of [-1.5, 0, 3.3, 12.8, 24]) expect(Math.abs(decodeTop(encodeTop(t)) - t)).toBeLessThan(0.06);
    expect(litFraction(5, 4, 4.5)).toBe(1);
    expect(litFraction(4, 4.5, 5.5)).toBe(0);
    expect(litFraction(5, 4.5, 5.5)).toBeCloseTo(0.5);
  });

  it("packs the tile data: height, soil, the game's desert intensity and the water over the top", () => {
    const heights = new Uint8Array([2, 2, 5, 1]);
    const soil = soilView([0, 3, 12, 0], [0, 0, 0, 0.4]);
    const sw = surfaceWater(4, 1, waterFromDepth(heights, [0, 0, 0, 0.8], [0, 0, 0, 0]));
    const d = tileData(4, 1, heights, soil, sw);
    expect([d[0], d[4], d[8], d[12]]).toEqual([2, 2, 5, 1]);
    expect(d[1]).toBe(0); // dry, clean
    expect(d[5] >> 4).toBe(3); // moist
    expect(d[9] >> 4).toBe(12);
    expect(d[13] & 15).toBeGreaterThan(0); // contaminated
    // B: the desert intensity, all of a dry top, 0.7 × (1 − 3/5) at moisture 3, none from 5 up (palette.ts DESERT)
    expect([d[2], d[6], d[10], d[14]]).toEqual([255, Math.round(0.28 * 255), 0, 255]);
    expect([d[3], d[7], d[11]]).toEqual([0, 0, 0]);
    expect(d[15]).toBe(waterByte(sw, heights, 3));
    expect(d[15]).toBeGreaterThan(40);
    expect(soilNibbles(1, 1)).toBe(0x11);
  });
});

describe("water's flags", () => {
  // (D148: a fall was a curtain carrying its drop in its flags; from D201 it poured from the lip as a fall of its own,
  // its foot and brink marked for foam; since D201's amendment (2026-10-29) it is a curtain again, as the game draws
  // it, with no foam)
  it("marks shores, a curtain's drop, and no curtain at a fall (the water below rises to it: fallSlope.ts)", () => {
    // west to east: a pool at 6 (surface 6.5) falls to a river at 3 (surface 3.5), beside dry
    // ground at 7 on the north side of the pool
    const W = 4;
    const H = 2;
    const heights = new Uint8Array([6, 6, 3, 3, 7, 7, 7, 7]);
    const view = waterFromDepth(heights, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
    const sw = surfaceWater(W, H, view);
    const m = meshWaterChunk(W, H, plainLayers(heights, sw), 0, 0);
    const tops = new Map<number, number>();
    const curtains: number[] = [];
    let lip = -Infinity;
    for (let q = 0; q < m.quads; q++) {
      const x = Math.min(m.positions[q * 12], m.positions[q * 12 + 3], m.positions[q * 12 + 6]);
      if (m.normals[q * 12 + 1] > 0) {
        tops.set(Math.floor(x + 1e-6), m.flags[q * 4]);
        for (let v = 0; v < 4; v++) if (Math.abs(m.positions[(q * 4 + v) * 3] - 2) < 1e-6 && x >= 2 - 1e-6) lip = Math.max(lip, m.positions[(q * 4 + v) * 3 + 1]);
      } else if (m.normals[q * 12] > 0 && Math.abs(m.positions[q * 12] - 2) < 0.1) curtains.push(m.flags[q * 4]);
    }
    // the pool's tiles meet dry ground to the north, and no top carries any other mark
    expect(tops.get(0)! & SHORE_BITS[2]).toBeTruthy();
    expect(tops.get(1)! & SHORE_BITS[2]).toBeTruthy();
    for (const [, flags] of tops) expect(flags & ~15).toBe(0);
    // the fall is the river's tile rising to the pool's surface at the lip (D154 as amended 2026-11-08): no curtain
    expect(curtains).toEqual([]);
    expect(lip).toBeCloseTo(6.5, 5);
    // a curtain's flags are its drop, and none at the map's edge
    expect(dropFlags(6.5, 3.5, false)).toBe(90);
    expect(dropFlags(3, 0, true)).toBe(EDGE_CURTAIN);
  });
});

describe("the models", () => {
  it("draws trees by species, dead trees bare, ruins as scaffold storeys, and the start as its own", () => {
    expect(modelKeyOf("Pine", 0)).toBe("Pine");
    expect(modelKeyOf("Pine", DEAD)).toBe("Pine.dead");
    expect(modelKeyOf("Birch", DEAD)).toBe("Birch.dead");
    expect(modelKeyOf("Oak", YOUNG)).toBe("Oak");
    expect(modelKeyOf("Succulent", DEAD)).toBe("Succulent.dead");
    expect(modelKeyOf("BlueberryBush", 0)).toBe("BlueberryBush");
    expect(modelKeyOf("RuinColumnH5", 0)).toBe("ruin");
    expect(modelKeyOf("StartingLocation", 0)).toBe("start");
    expect(modelKeyOf("Slope", 0)).toBe("Slope");
    expect(modelKeyOf("Blockage", 0)).toBe("block");
    expect(modelKeyOf("SomethingNew", 0)).toBe("block");
    // small enough for tens of thousands of trees
    for (const k of ["Pine", "Birch", "Oak", "BlueberryBush", "Pine.dead", "Birch.dead", "Oak.dead"]) expect(modelTriangles(k)).toBeLessThanOrEqual(64);
  });

  it("builds living and dead trees apart: a dead tree has no green crown", () => {
    const e = entityView([
      { template: "Oak", x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f" },
      { template: "Oak", x: 3, y: 1, z: 2, orientation: "Cw0", owner: "f", dead: true },
      { template: "RuinColumnH3", x: 5, y: 1, z: 2, orientation: "Cw0", owner: "f" },
      { template: "StartingLocation", x: 8, y: 8, z: 2, orientation: "Cw90", owner: "s" },
    ]);
    const { group, instances } = buildEntities(e, new ShaderMaterial());
    expect(instances).toBe(4);
    const byName = new Map(group.children.map((c) => [c.name, c as unknown as { geometry: { getAttribute(n: string): { array: ArrayLike<number> } }; count: number }]));
    const greenish = (name: string) => {
      const col = byName.get(name)!.geometry.getAttribute("pcolor").array;
      let n = 0;
      // (the game's olive greens, D135 as amended 2026-10-29: green over red and blue by 0.043 of the game's albedo, drawn
      // straight since 2026-11-09, when the models came into the game's light; until then at our grass's lightness, and
      // the margin with it)
      const margin = 0.043;
      for (let k = 0; k < col.length; k += 3) if (col[k + 1] > col[k] + margin && col[k + 1] > col[k + 2] + margin) n++;
      return n;
    };
    expect(greenish("Oak")).toBeGreaterThan(0);
    expect(greenish("Oak.dead")).toBe(0);
    // a ruin three high is three storeys of scaffold, one per level
    const storeys = [...byName.entries()].filter(([k]) => k.startsWith("scaffold")).reduce((s, [, m]) => s + m.count, 0);
    expect(storeys).toBe(3);
    expect(byName.get("start")!.count).toBe(1);
    expect(byName.get("start.entrance")!.count).toBe(1);
  });

  it("has lighter models for software rendering, dead trees still bare", () => {
    const e = entityView([
      { template: "Oak", x: 1, y: 1, z: 2, orientation: "Cw0", owner: "f" },
      { template: "Oak", x: 3, y: 1, z: 2, orientation: "Cw0", owner: "f", dead: true },
      { template: "RuinColumnH3", x: 5, y: 1, z: 2, orientation: "Cw0", owner: "f" },
    ]);
    const { group } = buildEntities(e, new ShaderMaterial(), null, 0, true);
    const byName = new Map(group.children.map((c) => [c.name, c as unknown as { geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } }; count: number }]));
    expect([...byName.keys()].sort()).toEqual(["Oak.dead.lite", "Oak.lite", "ruin.lite"]);
    const col = byName.get("Oak.dead.lite")!.geometry.getAttribute("pcolor").array;
    for (let k = 0; k < col.length; k += 3) expect(col[k + 1] > col[k] + 0.12 && col[k + 1] > col[k + 2] + 0.12).toBe(false);
    expect(byName.get("ruin.lite")!.count).toBe(1);
    expect(byName.get("Oak.lite")!.geometry.getAttribute("position").count / 3).toBeLessThan(modelTriangles("Oak"));
  });

  it("places the same instances every time (jitter comes from the tile)", () => {
    const e = entityView(Array.from({ length: 30 }, (_, k) => ({ template: k % 3 ? "Pine" : "Birch", x: k, y: k % 7, z: 2, orientation: "Cw0", owner: "f", dead: k % 5 === 0 })));
    const a = buildEntities(e, new ShaderMaterial()).group.children.map((c) => Array.from((c as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array));
    const b = buildEntities(e, new ShaderMaterial()).group.children.map((c) => Array.from((c as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array));
    expect(a).toEqual(b);
  });
});

describe("the soil a file stores", () => {
  it("reads each tile's top slot of moisture and contamination", () => {
    const singletons = {
      SoilMoistureSimulator: { Size: 2, MoistureLevels: { Array: "0 3 7 0 5 9 0 0" } },
      SoilContaminationSimulator: { Size: 2, ContaminationLevels: { Array: "0 0 0.5 0 0 0 0 1" } },
    };
    const s = storedSoil(singletons, 2, 2);
    expect([...s.moisture]).toEqual([0, 3, 7, 0]);
    expect([...s.contamination]).toEqual([0, 0, 0.5, 0]);
    // tile 3 has a second floor under a roof: its top is slot 1
    const top = storedSoil(singletons, 2, 2, (i) => (i === 3 ? 1 : 0));
    expect(top.contamination[3]).toBe(1);
    expect(top.moisture[1]).toBe(3);
    // an array that does not fit the map reads as dry
    expect([...storedSoil({ SoilMoistureSimulator: { MoistureLevels: { Array: "1 2 3" } } }, 2, 2).moisture]).toEqual([0, 0, 0, 0]);
  });
});

describe("the hover text", () => {
  it("names the soil the ground's colour shows", () => {
    const W = 4;
    const H = 1;
    const heights = new Uint8Array([3, 3, 3, 2]);
    const water = surfaceWater(W, H, waterFromDepth(heights, [0, 0, 0, 0.7], [0, 0, 0, 0]));
    const entities = entityView([]);
    const ctx = { W, H, heights, water, entities, entitiesAt: entitiesByTile(entities, W), index: null, soil: soilView([0, 4, 4, 16], [0, 0, 0.3, 0]) };
    expect(describeTile(ctx, 0, 0)).toBe("Height 3, dry soil");
    expect(describeTile(ctx, 1, 0)).toBe("Height 3, moist soil");
    expect(describeTile(ctx, 2, 0)).toBe("Height 3, contaminated soil");
    expect(describeTile(ctx, 3, 0)).toBe("Height 2, water 0.7 deep");
  });
});
