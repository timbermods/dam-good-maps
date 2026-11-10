// The landmarks every map has are drawn as the game's (D496, D178 amended): our own models at the game's measures, read
// from its models (StartingLocation.Model, WaterSource.Model, BadwaterSource.Model, UndergroundRuins.Model,
// WaterSeep.Model, BadwaterSeep.Model). The start is a lantern tower 4.37 high on its 3 × 3; a water source an outcrop
// of rock 1.0 high and about 1.15 across; a badwater source a flat crater 2.5 across; a mine site a pit 1.35 deep inside
// its frame with nothing standing over it (no scaffolding); a seep a slab at the ground round a heap of rocks to 0.57
// (water) or 0.40 (badwater). Standard's models are High's and the light look's too.

import { describe, expect, it } from "vitest";
import { modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { objectCasters } from "../../src/render3d/light";
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
