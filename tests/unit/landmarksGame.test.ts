// The landmarks every map has are drawn as the game's (D496, D178 amended): our own models at the game's measures, read
// from its models (StartingLocation.Model, WaterSource.Model, BadwaterSource.Model, UndergroundRuins.Model,
// WaterSeep.Model, BadwaterSeep.Model). The start is a lantern tower 4.37 high on its 3 × 3; a water source an outcrop
// of rock 1.0 high and about 1.15 across; a badwater source a flat crater 2.5 across; a mine site a pit 1.35 deep inside
// its frame with nothing standing over it (no scaffolding); a seep a slab at the ground round a heap of rocks to 0.57
// (water) or 0.40 (badwater). The large relic, the one relic drawn as the game's, is its fallen dish antenna
// (LargeRelic.Model): 1.84 high in its 3 × 3. Standard's models are High's and the light look's too.

import { describe, expect, it } from "vitest";
import { modelKeyOf, modelOf, modelTriangles } from "../../src/render3d/entities3d";
import { LARGE_RELIC_CASTS } from "../../src/render3d/largeRelic";
import { objectCasters } from "../../src/render3d/light";
import { LARGE_RELIC } from "../../src/render3d/palette";
import { entityView } from "../../src/render3d/model";

function bounds(key: string): { x: number; z: number; lo: number; hi: number } {
  const p = modelOf(key).pos;
  let x = 0;
  let z = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < p.length; k += 3) {
    x = Math.max(x, Math.abs(p[k]));
    z = Math.max(z, Math.abs(p[k + 2]));
    lo = Math.min(lo, p[k + 1]);
    hi = Math.max(hi, p[k + 1]);
  }
  return { x: 2 * x, z: 2 * z, lo, hi };
}

describe("the landmarks at the game's measures", () => {
  it("the start is the game's lantern tower: 4.37 high, within its 3 × 3", () => {
    const b = bounds(modelKeyOf("StartingLocation", 0));
    expect(b.hi).toBeCloseTo(4.37, 2);
    expect(b.lo).toBeCloseTo(0, 3);
    expect(Math.max(b.x, b.z)).toBeLessThanOrEqual(3 + 1e-6);
  });

  it("a water source is an outcrop of rock 1.0 high, about the game's 1.14 × 1.18 across", () => {
    const b = bounds("WaterSource");
    expect(b.hi).toBeGreaterThan(0.95);
    expect(b.hi).toBeLessThanOrEqual(1.02);
    expect(b.lo).toBeGreaterThan(-0.03);
    for (const w of [b.x, b.z]) {
      expect(w).toBeGreaterThan(1.0);
      expect(w).toBeLessThan(1.2);
    }
  });

  it("a badwater source is a flat crater about 2.5 across, no higher than the game's rim stones", () => {
    const b = bounds("BadwaterSource");
    expect(b.hi).toBeLessThanOrEqual(0.06);
    for (const w of [b.x, b.z]) {
      expect(w).toBeGreaterThan(2.4);
      expect(w).toBeLessThanOrEqual(2.8);
    }
  });

  it("a mine site is a pit 1.35 deep with nothing standing over it: the game's has no scaffolding", () => {
    const b = bounds("UndergroundRuins");
    expect(b.lo).toBeGreaterThanOrEqual(-1.4);
    expect(b.lo).toBeLessThanOrEqual(-1.35);
    expect(b.hi).toBeLessThanOrEqual(0.22);
  });

  it("a seep's rocks rise above its slab to the game's 0.57 (water) and 0.40 (badwater)", () => {
    expect(bounds("WaterSeep").hi).toBeCloseTo(0.57, 1);
    expect(bounds("BadwaterSeep").hi).toBeCloseTo(0.4, 1);
    expect(bounds("WaterSeep").hi).toBeLessThanOrEqual(0.58);
    expect(bounds("BadwaterSeep").hi).toBeLessThanOrEqual(0.41);
  });

  it("the large relic is the game's fallen dish: 1.84 high, its feet 0.24 into the ground, within its 3 × 3", () => {
    const b = bounds(modelKeyOf("LargeRelic", 0));
    // (the game's model reaches from −0.235 to 1.843, x from 0.10 to 2.90 and z from 0.12 to 2.57 of its footprint)
    expect(b.hi).toBeGreaterThan(1.82);
    expect(b.hi).toBeLessThan(1.87);
    expect(b.lo).toBeGreaterThan(-0.26);
    expect(b.lo).toBeLessThan(-0.21);
    expect(Math.max(b.x, b.z)).toBeLessThanOrEqual(3);
    expect(Math.max(b.x, b.z)).toBeGreaterThan(2.6);
    // (in the game's colours, its face's three bands and its steel, about half the game's 1,605 triangles)
    const col = modelOf("LargeRelic").col;
    const has = (c: readonly number[]) => {
      for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
      return false;
    };
    for (const c of [...LARGE_RELIC.face, LARGE_RELIC.steel, LARGE_RELIC.stone]) expect(has(c)).toBe(true);
    expect(modelTriangles("LargeRelic")).toBeLessThanOrEqual(1000);
  });
});

describe("the start's tower casts its shadow", () => {
  it("from its footprint's middle tile, the tower's height, its walls round it, turned as the start is", () => {
    const W = 32;
    const H = 32;
    for (const [orientation, mx, my] of [["Cw0", 11, 21], ["Cw180", 9, 19]] as const) {
      const e = entityView([{ template: "StartingLocation", x: 10, y: 20, z: 3, orientation, owner: "s" }]);
      const casters = objectCasters(W, H, e)!;
      expect(casters[my * W + mx]).toBeCloseTo(4.0, 5);
      // (its Coordinates' corner casts the walls since the start's shadow became its model's, D497, D148: it cast
      // nothing, the tower's tile alone)
      for (let y = my - 1; y <= my + 1; y++) for (let x = mx - 1; x <= mx + 1; x++) if (x !== mx || y !== my) expect(casters[y * W + x]).toBeCloseTo(1.4, 5);
      expect(casters[(my + 2) * W + mx]).toBe(0);
    }
  });
});

describe("the large relic's dish casts its shadow", () => {
  it("from each tile of its footprint, the dish's height there, turned as the relic is", () => {
    const W = 32;
    const H = 32;
    for (const [orientation, sx, sy] of [["Cw0", 1, 1], ["Cw180", -1, -1]] as const) {
      const e = entityView([{ template: "LargeRelic", x: 10, y: 20, z: 3, orientation, owner: "s" }]);
      const casters = objectCasters(W, H, e)!;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(casters[(20 + sy * j) * W + 10 + sx * i]).toBeCloseTo(LARGE_RELIC_CASTS[i][j], 5);
      // (its highest, the dish's back edge, over the footprint's corner; its mouth low across the far corner)
      expect(Math.max(...LARGE_RELIC_CASTS.flat())).toBeCloseTo(1.84, 2);
      expect(casters[(20 + sy * 3) * W + 10]).toBe(0);
    }
  });
});
