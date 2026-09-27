// Map look (ROADMAP "Map look", PLAN §20 D86): the soil colours and their legend, the height bands
// on the walls, the baked light (sky visibility and soft sun shadows, the same bytes every time),
// the water's foam flags, the models by species and dead state, the soil a file stores, and the
// hover text that says what the ground's colour means.

import { describe, expect, it } from "vitest";
import { storedSoil } from "../../src/core/format/world";
import { describeTile, entitiesByTile } from "../../src/editor/features";
import { buildEntities, modelKeyOf, modelTriangles } from "../../src/render3d/entities3d";
import { decodeTop, encodeTop, litFraction, objectCasters, shadowMap, shadowTops, SHADOW_RES, skyVisibility, soilNibbles, tileData, waterByte } from "../../src/render3d/light";
import { DEAD, entityView, soilView, surfaceWater, waterFromDepth, YOUNG } from "../../src/render3d/model";
import { contaminationByte, contaminationVein, cssColor, DEAD_TREE, GROUND, groundColor, groundKind, legendEntries, LIGHT, moistureByte, wallColor, WATER, waterBody } from "../../src/render3d/palette";
import { FALL_STRIDE } from "../../src/render3d/falls";
import { dropFlags, EDGE_CURTAIN, FALL_IN_BITS, LIP_BITS, lowerByTile, meshWaterChunk, SHORE_BITS } from "../../src/render3d/waterMesh";
import { ShaderMaterial } from "three";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

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
    expect(groundColor(1, 0, false)).toEqual(GROUND.moistLow);
    expect(groundColor(150, 0, false)).toEqual(GROUND.moistHigh);
    // contamination is a layer over the ground (Kyler's contamination round): the colour under it
    // is the soil's own
    expect(groundColor(40, 5, false)).toEqual(groundColor(40, 0, false));
    expect(groundColor(0, 5, false)).toEqual(GROUND.dry);
  });

  it("keeps the meanings apart in brightness too (greyscale): grass, earth and its cracks, contamination's veins, water", () => {
    // moist grass is the lightest ground, then dry earth
    expect(lum(GROUND.moistHigh) - lum(GROUND.dry)).toBeGreaterThan(0.08);
    // dry earth's cracks are darker than it; contamination's veins glow lighter than their rust
    // rims, so on dry earth they are light lines where clean earth has dark ones, and through
    // grass they are dark lines
    expect(lum(GROUND.crack)).toBeLessThan(lum(GROUND.dry) - 0.15);
    expect(lum(GROUND.contaminatedGlow)).toBeGreaterThan(lum(GROUND.contaminated) + 0.3);
    for (const l of [1 / 15, 0.5, 1]) {
      expect(lum(contaminationVein(l, false)) - lum(GROUND.crack)).toBeGreaterThan(0.2);
      expect(lum(GROUND.moistHigh) - lum(contaminationVein(l, true))).toBeGreaterThan(0.3);
    }
    // badwater is darker than clean water of the same depth: the water's body colours, a level deep
    expect(lum(WATER.shallow) - lum(WATER.bad)).toBeGreaterThan(0.2);
    expect(lum(waterBody(1, false)) - lum(waterBody(1, true))).toBeGreaterThan(0.06);
  });

  it("bands the walls by level: neighbouring levels differ, higher is lighter", () => {
    for (let lv = 0; lv < 22; lv++) expect(Math.abs(lum(wallColor(lv)) - lum(wallColor(lv + 1)))).toBeGreaterThan(0.03);
    expect(lum(wallColor(16))).toBeGreaterThan(lum(wallColor(0)));
  });

  it("the legend says what each colour means, for soil and for height colours", () => {
    const soil = legendEntries("moisture").map((e) => e.label);
    expect(soil).toEqual(["Moist ground: plants grow", "Dry ground: plants die", "Contaminated ground: plants die", "Water: darker is deeper", "Badwater", "Walls: one band per level", "Bare pale trees: dead"]);
    const height = legendEntries("height").map((e) => e.label);
    expect(height[0]).toBe("Ground by height: low to high");
    expect(height).not.toContain("Moist ground: plants grow");
    expect(legendEntries("moisture")[1].swatch).toContain(cssColor(GROUND.dry));
    expect(legendEntries("moisture").at(-1)!.swatch).toBe(cssColor(DEAD_TREE));
  });
});

describe("the baked light", () => {
  const W = 24;
  const H = 20;
  const flat = new Uint8Array(W * H).fill(3);

  it("sees the whole sky on flat ground and less at the bottom of a pit", () => {
    expect([...new Set(skyVisibility(W, H, flat))]).toEqual([255]);
    const pit = flat.slice();
    pit[10 * W + 10] = 0;
    const sky = skyVisibility(W, H, pit);
    expect(sky[10 * W + 10]).toBeLessThan(160);
    expect(sky[10 * W + 14]).toBe(255);
  });

  it("casts a pillar's shadow away from the sun (south-east), softly, and never toward it", () => {
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
    // the far end of the shadow is soft: along the diagonal it lightens step by step
    const along = [1, 2, 3, 4, 5, 6].map((d) => lit(10 + d, 10 - d));
    expect(along[0]).toBe(0);
    expect(along.at(-1)).toBe(1);
    for (let k = 1; k < along.length; k++) expect(along[k]).toBeGreaterThanOrEqual(along[k - 1]);
    expect(along.some((v) => v > 0 && v < 1)).toBe(true);
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
    const sky1 = skyVisibility(W, H, h);
    expect(Buffer.from(sky1).equals(Buffer.from(skyVisibility(W, H, h)))).toBe(true);
    // the tree shades the ground to its south-east
    const noTree = shadowMap(W, H, h, null);
    expect(Buffer.from(a).equals(Buffer.from(noTree))).toBe(false);
  });

  it("encodes shadow tops within a tenth of a level", () => {
    for (const t of [-1.5, 0, 3.3, 12.8, 24]) expect(Math.abs(decodeTop(encodeTop(t)) - t)).toBeLessThan(0.06);
    expect(litFraction(5, 4, 4.5)).toBe(1);
    expect(litFraction(4, 4.5, 5.5)).toBe(0);
    expect(litFraction(5, 4.5, 5.5)).toBeCloseTo(0.5);
  });

  it("packs the tile data: height, soil, sky, and water over the top", () => {
    const heights = new Uint8Array([2, 2, 5, 1]);
    const soil = soilView([0, 3, 12, 0], [0, 0, 0, 0.4]);
    const sw = surfaceWater(4, 1, waterFromDepth(heights, [0, 0, 0, 0.8], [0, 0, 0, 0]));
    const d = tileData(4, 1, heights, new Uint8Array([255, 200, 100, 50]), soil, sw);
    expect([d[0], d[4], d[8], d[12]]).toEqual([2, 2, 5, 1]);
    expect(d[1]).toBe(0); // dry, clean
    expect(d[5] >> 4).toBe(3); // moist
    expect(d[9] >> 4).toBe(12);
    expect(d[13] & 15).toBeGreaterThan(0); // contaminated
    expect([d[2], d[6], d[10], d[14]]).toEqual([255, 200, 100, 50]);
    expect([d[3], d[7], d[11]]).toEqual([0, 0, 0]);
    expect(d[15]).toBe(waterByte(sw, heights, 3));
    expect(d[15]).toBeGreaterThan(40);
    expect(soilNibbles(1, 1)).toBe(0x11);
  });
});

describe("water foam", () => {
  // (D148: a fall was a curtain carrying its drop in its flags; since D201 it pours from the lip as
  // a fall of its own, which carries its lip's and its landing's surfaces, and its brink is marked)
  it("marks shores, the foot of falls and their brinks, and the drop of each fall", () => {
    // west to east: a pool at 6 (surface 6.5) falls to a river at 3 (surface 3.5), beside dry
    // ground at 7 on the north side of the pool
    const W = 4;
    const H = 2;
    const heights = new Uint8Array([6, 6, 3, 3, 7, 7, 7, 7]);
    const view = waterFromDepth(heights, [0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]);
    const sw = surfaceWater(W, H, view);
    const m = meshWaterChunk(W, H, heights, sw, view, lowerByTile(sw, view), 0, 0);
    const tops = new Map<number, number>();
    const curtains: number[] = [];
    for (let q = 0; q < m.quads; q++) {
      const x = Math.min(m.positions[q * 12], m.positions[q * 12 + 3], m.positions[q * 12 + 6]);
      if (m.normals[q * 12 + 1] > 0) tops.set(Math.round(x), m.flags[q * 4]);
      else if (m.normals[q * 12] > 0 && Math.abs(m.positions[q * 12] - 2) < 0.1) curtains.push(m.flags[q * 4]);
    }
    // the pool's tiles meet dry ground to the north; the river's first tile takes the fall, and the
    // pool's last tile is its brink
    expect(tops.get(0)! & SHORE_BITS[2]).toBeTruthy();
    expect(tops.get(1)! & SHORE_BITS[2]).toBeTruthy();
    expect(tops.get(2)! & FALL_IN_BITS[1]).toBeTruthy();
    expect(tops.get(3)! & FALL_IN_BITS[1]).toBeFalsy();
    expect(tops.get(1)! & LIP_BITS[0]).toBeTruthy();
    expect(tops.get(0)! & LIP_BITS[0]).toBeFalsy();
    // the fall pours from the pool's surface down to the river's, 3 levels: no curtain hangs there
    expect(curtains).toEqual([]);
    expect(m.fallCount).toBe(1);
    const f = m.falls.subarray(0, FALL_STRIDE);
    expect(f[4] - f[6]).toBeCloseTo(3, 5);
    expect(f[5] - f[7]).toBeCloseTo(3, 5);
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
    for (const k of ["Pine", "Birch", "Oak", "Succulent", "BlueberryBush", "Pine.dead", "Birch.dead", "Oak.dead"]) expect(modelTriangles(k)).toBeLessThanOrEqual(64);
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
      for (let k = 0; k < col.length; k += 3) if (col[k + 1] > col[k] + 0.12 && col[k + 1] > col[k + 2] + 0.12) n++;
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
