// The landmarks every map has are drawn as the game's (D496, D178 amended): our own models at the game's measures, read
// from its models (StartingLocation.Model, WaterSource.Model, BadwaterSource.Model, UndergroundRuins.Model,
// WaterSeep.Model, BadwaterSeep.Model). The start is a lantern tower 4.37 high on its 3 × 3; a water source an outcrop
// of rock 1.0 high and about 1.15 across; a badwater source a flat crater 2.5 across; a mine site a pit 1.35 deep inside
// its frame with nothing standing over it (no scaffolding); a seep a slab at the ground round a heap of rocks to 0.57
// (water) or 0.40 (badwater). The relics are the game's: the small its fallen telescope (SmallRelic.Model), 0.29 high in
// its 2 × 1; the medium its crashed satellite (MediumRelic.Model), 0.6 high in its 3 × 2; the large its fallen dish
// antenna (LargeRelic.Model), 1.84 high in its 3 × 3. A blockage is its heap of rock (Blockage.Model), 1.08 high; a natural
// dam its low heap of brown rock with logs through it (NaturalDam.Model), 0.72 high.
// Standard's models are High's and the light look's too, and Standard's baked shadows are fitted to them.

import { describe, expect, it } from "vitest";
import { modelKeyOf, modelOf, modelTriangles } from "../../src/render3d/entities3d";
import { LARGE_RELIC_SHADOW } from "../../src/render3d/largeRelic";
import { litFraction, objectCasters, SHADOW_RES, shadowTops } from "../../src/render3d/light";
import { BLOCKAGE, LARGE_RELIC, LIGHT, MEDIUM_RELIC, NATURAL_DAM, SMALL_RELIC } from "../../src/render3d/palette";
import { entityView } from "../../src/render3d/model";
import { mediumRelicParts } from "../../src/render3d/smallRelics";

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

/** Standard's shadow of one object (its model centred `half` from its Coordinates' corner, turned Cw0) on flat ground
 *  as the shader draws it, bilinear between the bake's samples, against its model's own triangles projected along the
 *  sun onto the ground, which is what High's depth map casts: tiles² of each at 8 headings of the sun, 45° up. */
function shadowAreas(template: string, half: number, seen = false): [number, number][] {
  const W = 24;
  const H = 24;
  const G = 3;
  const [X0, Y0] = [10, 10];
  const heights = new Uint8Array(W * H).fill(G);
  const casters = objectCasters(W, H, entityView([{ template, x: X0, y: Y0, z: G, orientation: "Cw0", owner: "s" }]))!;
  const p = modelOf(template).pos;
  const tanE = Math.tan(LIGHT.sunElevation);
  const step = 0.05;
  const n = Math.round(14 / step);
  const R = SHADOW_RES;
  const out: [number, number][] = [];
  const at = (v: number) => Math.round((v - (X0 - 5.5)) / step - 0.5);
  // (the ground the model's triangles cover, cast along the sun's way (ux, uy) by their heights times `drop`)
  const cover = (ux: number, uy: number, drop: number) => {
    const shade = new Uint8Array(n * n);
    for (let k = 0; k < p.length; k += 9) {
      const t: number[] = [];
      for (let v = 0; v < 3; v++) {
        const h = (Math.max(0, p[k + 3 * v + 1]) / tanE) * drop;
        t.push(X0 + half + p[k + 3 * v] - ux * h, Y0 + half - p[k + 3 * v + 2] - uy * h);
      }
      const [ax, ay, bx, by, cx, cy] = t;
      const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(d) < 1e-12) continue;
      for (let j = Math.max(0, at(Math.min(ay, by, cy))); j <= Math.min(n - 1, at(Math.max(ay, by, cy)) + 1); j++)
        for (let i = Math.max(0, at(Math.min(ax, bx, cx))); i <= Math.min(n - 1, at(Math.max(ax, bx, cx)) + 1); i++) {
          const [x, y] = [X0 - 5.5 + (i + 0.5) * step, Y0 - 5.5 + (j + 0.5) * step];
          const w1 = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / d;
          const w2 = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / d;
          if (w1 >= 0 && w2 >= 0 && w1 + w2 <= 1) shade[j * n + i] = 1;
        }
    }
    return shade;
  };
  // (with `seen`, only the ground the model does not stand over: what is under it never shows)
  const under = seen ? cover(1, 0, 0) : new Uint8Array(n * n);
  for (let a = 0; a < 360; a += 45) {
    const [ux, uy] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
    // (the model's: x east, the model's z south, its parts under the ground cast from the ground)
    const shade = cover(ux, uy, 1);
    // (Standard's)
    const tops = shadowTops(W, H, heights, casters, LIGHT.sunElevation, { x: ux, y: uy });
    const T = (i: number, j: number) => tops[j * W * R + i];
    let standard = 0;
    let model = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [u, v] = [(X0 - 5.5 + (i + 0.5) * step) * R - 0.5, (Y0 - 5.5 + (j + 0.5) * step) * R - 0.5];
        const [i0, j0] = [Math.floor(u), Math.floor(v)];
        const [fu, fv] = [u - i0, v - j0];
        const top = (T(i0, j0) * (1 - fu) + T(i0 + 1, j0) * fu) * (1 - fv) + (T(i0, j0 + 1) * (1 - fu) + T(i0 + 1, j0 + 1) * fu) * fv;
        if (under[j * n + i]) continue;
        standard += (1 - litFraction(G, top, top)) * step * step;
        model += shade[j * n + i] * step * step;
      }
    out.push([standard, model]);
  }
  return out;
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

describe("the small and medium relics at the game's measures", () => {
  const has = (key: string, c: readonly number[]) => {
    const col = modelOf(key).col;
    for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
    return false;
  };

  it("the small relic is the game's fallen telescope: 0.29 high, lying along its 2 × 1, in its colours", () => {
    const b = bounds(modelKeyOf("SmallRelic", 0));
    // (the game's model reaches from −0.06 to 0.29 up, x −0.84…0.82 and z −0.32…0.37 about its footprint's middle,
    // leaving out its footing of ground)
    expect(b.hi).toBeGreaterThan(0.27);
    expect(b.hi).toBeLessThan(0.31);
    expect(b.lo).toBeGreaterThan(-0.1);
    expect(b.x).toBeGreaterThan(1.6);
    expect(b.x).toBeLessThan(1.75);
    expect(b.z).toBeGreaterThan(0.7);
    expect(b.z).toBeLessThan(0.8);
    for (const c of [SMALL_RELIC.tube, SMALL_RELIC.collar, SMALL_RELIC.lens, SMALL_RELIC.leg, ...SMALL_RELIC.stone]) expect(has("SmallRelic", c)).toBe(true);
    expect(modelTriangles("SmallRelic")).toBeLessThanOrEqual(400);
  });

  it("the medium relic is the game's crashed satellite: 0.6 high, its panels across its 3 × 2, in its colours", () => {
    const b = bounds(modelKeyOf("MediumRelic", 0));
    // (the game's model reaches from −0.31 to 0.60 up, x −1.27…1.31 and z −0.68…0.82 about its footprint's middle,
    // leaving out its footing of ground)
    expect(b.hi).toBeGreaterThan(0.58);
    expect(b.hi).toBeLessThan(0.62);
    expect(b.lo).toBeGreaterThan(-0.32);
    expect(b.x).toBeGreaterThan(2.6);
    expect(b.x).toBeLessThan(2.85);
    expect(b.z).toBeGreaterThan(1.55);
    expect(b.z).toBeLessThan(1.75);
    for (const c of [MEDIUM_RELIC.body, MEDIUM_RELIC.cell, MEDIUM_RELIC.frame, MEDIUM_RELIC.dish, MEDIUM_RELIC.feed, ...MEDIUM_RELIC.stone]) expect(has("MediumRelic", c)).toBe(true);
    expect(modelTriangles("MediumRelic")).toBeLessThanOrEqual(600);
  });

  it("dips no solar cell below the ground, so the ground never shows through a panel", () => {
    // (each cell is four triangles round its dip, the one corner they share; a panel's own edge may sink, as the game's)
    const cells = mediumRelicParts().find((p) => p.colour === MEDIUM_RELIC.cell)!.points;
    expect(cells.length % 36).toBe(0);
    for (let k = 0; k < cells.length; k += 36) {
      const pts = Array.from({ length: 12 }, (_, i) => cells.slice(k + 3 * i, k + 3 * i + 3).join());
      const dip = pts.find((p) => [0, 1, 2, 3].every((t) => pts.slice(3 * t, 3 * t + 3).includes(p)))!;
      expect(dip).toBeDefined();
      expect(Number(dip.split(",")[1])).toBeGreaterThanOrEqual(0);
    }
  });

  // (lying on the ground, 0.29 and 0.6 high, what they cast past themselves is 0.14–0.31 and 0.16–0.49 tiles² by the
  // sun's heading: thin slivers and the satellite's body, which stands between two tiles' middles where no disc can)
  it("cast nothing in Standard's bake", () => {
    const e = entityView([
      { template: "SmallRelic", x: 2, y: 2, z: 3, orientation: "Cw0", owner: "s" },
      { template: "MediumRelic", x: 8, y: 8, z: 3, orientation: "Cw90", owner: "m" },
    ]);
    const casters = objectCasters(16, 16, e);
    expect(casters === null || casters.every((v) => v === 0)).toBe(true);
  });
});

describe("the blockage at the game's measures", () => {
  it("is the game's heap of rock: 1.08 high, overhanging its tile, in its colours, about its triangles", () => {
    const b = bounds(modelKeyOf("Blockage", 0));
    // (the game's model reaches from −0.02 to 1.08 up, and its shards x −1.06…0.80 and z −0.78…0.93 about its tile's
    // middle)
    expect(b.hi).toBeGreaterThan(1.05);
    expect(b.hi).toBeLessThan(1.1);
    expect(b.lo).toBeGreaterThan(-0.12);
    expect(b.x).toBeGreaterThan(2.0);
    expect(b.x).toBeLessThan(2.2);
    expect(b.z).toBeGreaterThan(1.75);
    expect(b.z).toBeLessThan(1.95);
    const col = modelOf("Blockage").col;
    const has = (c: readonly number[]) => {
      for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
      return false;
    };
    for (const c of [...BLOCKAGE.rock, BLOCKAGE.post, ...BLOCKAGE.shard]) expect(has(c)).toBe(true);
    expect(modelTriangles("Blockage")).toBeLessThanOrEqual(220);
  });

  // (it cast none before; one disc as wide as a disc may be, nothing on its own tile, its shards reaching past it: on
  // the ground it does not stand over, 0.84–0.99 a heading as fitted, 0.93 in all)
  it("casts Standard's shadow about as large as its model's round the compass", () => {
    const areas = shadowAreas("Blockage", 0.5, true);
    const ratios = areas.map(([s, m]) => s / m);
    const all = areas.reduce((t, [s]) => t + s, 0) / areas.reduce((t, [, m]) => t + m, 0);
    expect(Math.min(...ratios)).toBeGreaterThan(0.8);
    expect(Math.max(...ratios)).toBeLessThan(1.05);
    expect(all).toBeGreaterThan(0.85);
    expect(all).toBeLessThan(1.05);
  });
});

describe("the natural dam at the game's measures", () => {
  it("is the game's low heap with logs through it: 0.72 high, overhanging its tile, in its colours, about its triangles", () => {
    // (a model of its own, D178 as amended 2026-11-10, D148: it was a block's heap of grey stones)
    expect(modelKeyOf("NaturalDam", 0)).toBe("NaturalDam");
    const b = bounds("NaturalDam");
    // (the game's model reaches 0.72 up, and its logs x −0.68…0.73 and z −0.63…0.69 about its tile's middle: 1.45 and
    // 1.37 across, as `bounds` measures)
    expect(b.hi).toBeGreaterThan(0.69);
    expect(b.hi).toBeLessThan(0.75);
    expect(b.lo).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeGreaterThan(1.38);
    expect(b.x).toBeLessThan(1.52);
    expect(b.z).toBeGreaterThan(1.3);
    expect(b.z).toBeLessThan(1.45);
    const col = modelOf("NaturalDam").col;
    const has = (c: readonly number[]) => {
      for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
      return false;
    };
    for (const c of [...NATURAL_DAM.rock, NATURAL_DAM.log, ...NATURAL_DAM.stone, ...NATURAL_DAM.shard]) expect(has(c)).toBe(true);
    // (the game's has 179)
    expect(modelTriangles("NaturalDam")).toBeLessThanOrEqual(200);
  });

  // (it cast none before; two discs, its foot as wide as a disc may be, nothing on its own tile: on the ground it does
  // not stand over, 0.84–1.00 a heading as fitted, 0.92 in all)
  it("casts Standard's shadow about as large as its model's round the compass", () => {
    const areas = shadowAreas("NaturalDam", 0.5, true);
    const ratios = areas.map(([s, m]) => s / m);
    const all = areas.reduce((t, [s]) => t + s, 0) / areas.reduce((t, [, m]) => t + m, 0);
    expect(Math.min(...ratios)).toBeGreaterThan(0.8);
    expect(Math.max(...ratios)).toBeLessThan(1.05);
    expect(all).toBeGreaterThan(0.85);
    expect(all).toBeLessThan(1.0);
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
  it("from the tiles of its footprint its fitted discs stand on, turned as the relic is", () => {
    const W = 32;
    const H = 32;
    for (const [orientation, sx, sy] of [["Cw0", 1, 1], ["Cw180", -1, -1]] as const) {
      const e = entityView([{ template: "LargeRelic", x: 10, y: 20, z: 3, orientation, owner: "s" }]);
      const casters = objectCasters(W, H, e)!;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const discs = LARGE_RELIC_SHADOW[i][j];
          expect(casters[(20 + sy * j) * W + 10 + sx * i]).toBeCloseTo(discs.length ? Math.max(...discs.map((d) => d[1])) : 0, 5);
        }
      expect(casters[(20 + sy * 3) * W + 10]).toBe(0);
    }
  });

  // (Standard's shadow as the shader draws it against the model's own, `shadowAreas`. Its columns had cast 1.8–2.9
  // times the model's)
  it("as large as the model's own shadow round the compass, not a column's", () => {
    const areas = shadowAreas("LargeRelic", 1.5);
    const ratios = areas.map(([s, m]) => s / m);
    const all = areas.reduce((t, [s]) => t + s, 0) / areas.reduce((t, [, m]) => t + m, 0);
    // (round discs cannot turn with the shell: each heading within 0.6 to 1.25 of the model's, 0.67 to 1.14 as fitted;
    // in all within a tenth, 0.93)
    expect(Math.min(...ratios)).toBeGreaterThan(0.6);
    expect(Math.max(...ratios)).toBeLessThan(1.25);
    expect(all).toBeGreaterThan(0.9);
    expect(all).toBeLessThan(1.1);
  });
});
