// The landmarks every map has are drawn as the game's (D496, D178 amended): our own models at the game's measures, read
// from its models (StartingLocation.Model, WaterSource.Model, BadwaterSource.Model, UndergroundRuins.Model,
// WaterSeep.Model, BadwaterSeep.Model). The start is a lantern tower 4.37 high on its 3 × 3; a water source an outcrop
// of rock 1.0 high and about 1.15 across; a badwater source a flat crater 2.5 across; a mine site a pit 1.35 deep inside
// its frame with nothing standing over it (no scaffolding); a seep a slab at the ground round a heap of rocks to 0.57
// (water) or 0.40 (badwater). The relics are the game's: the small its fallen telescope (SmallRelic.Model), 0.29 high in
// its 2 × 1; the medium its crashed satellite (MediumRelic.Model), 0.6 high in its 3 × 2; the large its fallen dish
// antenna (LargeRelic.Model), 1.84 high in its 3 × 3. A blockage is its heap of rock (Blockage.Model), 1.08 high; a natural
// dam its low heap of brown rock with logs through it (NaturalDam.Model), 0.72 high; a badtide drain its box of rusted
// plate 1 high over two tiles, a hood over its mouth (BadtideDrain.Model).
// Standard's models are High's and the light look's too, and Standard's baked shadows are fitted to them.

import { describe, expect, it } from "vitest";
import { modelKeyOf, modelOf, modelTriangles } from "../../src/render3d/entities3d";
import { LARGE_RELIC_SHADOW } from "../../src/render3d/largeRelic";
import { litFraction, objectCasters, SHADOW_RES, shadowTops } from "../../src/render3d/light";
import { BADTIDE_DRAIN, BLOCKAGE, LARGE_RELIC, LIGHT, MEDIUM_RELIC, NATURAL_DAM, SMALL_RELIC, UNSTABLE_CORE } from "../../src/render3d/palette";
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

/** Standard's shadow of one object (its model centred `half` from its Coordinates' corner, or (x, y) apart, turned
 *  Cw0) on flat ground as the shader draws it, bilinear between the bake's samples, against its model's own triangles
 *  projected along the sun onto the ground, which is what High's depth map casts: tiles² of each at 8 headings of the
 *  sun, 45° up. */
function shadowAreas(template: string, half: number | [number, number], seen = false): [number, number, number][] {
  const [hx, hy] = typeof half === "number" ? [half, half] : half;
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
  const out: [number, number, number][] = [];
  const at = (v: number) => Math.round((v - (X0 - 5.5)) / step - 0.5);
  // (the ground the model's triangles cover, cast along the sun's way (ux, uy) by their heights times `drop`)
  const cover = (ux: number, uy: number, drop: number) => {
    const shade = new Uint8Array(n * n);
    for (let k = 0; k < p.length; k += 9) {
      const t: number[] = [];
      for (let v = 0; v < 3; v++) {
        const h = (Math.max(0, p[k + 3 * v + 1]) / tanE) * drop;
        t.push(X0 + hx + p[k + 3 * v] - ux * h, Y0 + hy - p[k + 3 * v + 2] - uy * h);
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
    let both = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [u, v] = [(X0 - 5.5 + (i + 0.5) * step) * R - 0.5, (Y0 - 5.5 + (j + 0.5) * step) * R - 0.5];
        const [i0, j0] = [Math.floor(u), Math.floor(v)];
        const [fu, fv] = [u - i0, v - j0];
        const top = (T(i0, j0) * (1 - fu) + T(i0 + 1, j0) * fu) * (1 - fv) + (T(i0, j0 + 1) * (1 - fu) + T(i0 + 1, j0 + 1) * fu) * fv;
        if (under[j * n + i]) continue;
        const dark = 1 - litFraction(G, top, top);
        standard += dark * step * step;
        model += shade[j * n + i] * step * step;
        both += Math.min(dark, shade[j * n + i]) * step * step;
      }
    out.push([standard, model, both]);
  }
  return out;
}

/** Where Standard's shadow falls against its model's (`shadowAreas`), held round the compass: at every heading, at least
 *  `cover` of the model's shadow is under Standard's, and their overlap at least `iou` of the two together. As large is
 *  not enough: a shadow the size of the model's beside it would pass. (Two samples a tile, bilinear, blur a shadow
 *  narrower than a tile: none reaches 1.) */
function expectWhereItFalls(areas: [number, number, number][], cover: number, iou: number): void {
  for (const [s, m, both] of areas) {
    expect(both / m).toBeGreaterThan(cover);
    expect(both / (s + m - both)).toBeGreaterThan(iou);
  }
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
    // (where it falls: 0.64–0.78 of the model's shadow under it, IoU 0.54–0.64)
    expectWhereItFalls(areas, 0.6, 0.5);
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
    // (where it falls: 0.68–0.86 of the model's shadow under it, IoU 0.55–0.75)
    expectWhereItFalls(areas, 0.62, 0.5);
  });
});

describe("the badtide drain at the game's measures", () => {
  it("is the game's box of rusted plate: 1 high over its two tiles, its hood 0.37 out, in its colours, about its triangles", () => {
    const p = modelOf("BadtideDrain").pos;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k++) {
      lo[k % 3] = Math.min(lo[k % 3], p[k]);
      hi[k % 3] = Math.max(hi[k % 3], p[k]);
    }
    // (centred on its footprint's middle tile, the map's +y our −z: the game's box x −0.5…0.5, 0…1 up, from the back of
    // its first tile to the front of its second, z 1.5…−0.5, and its hood to −0.87, over the third)
    for (const [v, want] of [[lo[0], -0.5], [hi[0], 0.5], [lo[1], 0], [hi[1], 1], [hi[2], 1.5], [lo[2], -0.87]]) expect(Math.abs(v - want)).toBeLessThan(0.01);
    const col = modelOf("BadtideDrain").col;
    const has = (c: readonly number[]) => {
      for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
      return false;
    };
    for (const c of Object.values(BADTIDE_DRAIN)) expect(has(c)).toBe(true);
    // (the game's has 391)
    expect(modelTriangles("BadtideDrain")).toBeLessThanOrEqual(300);
  });

  // (it cast none before; a disc over each of its two tiles, nothing on its own: on the ground it does not stand over,
  // 0.97–1.19 a heading as fitted, longest with the sun along it, 1.00 in all)
  it("casts Standard's shadow about as large as its model's round the compass", () => {
    const areas = shadowAreas("BadtideDrain", [0.5, 1.5], true);
    const ratios = areas.map(([s, m]) => s / m);
    const all = areas.reduce((t, [s]) => t + s, 0) / areas.reduce((t, [, m]) => t + m, 0);
    expect(Math.min(...ratios)).toBeGreaterThan(0.9);
    expect(Math.max(...ratios)).toBeLessThan(1.25);
    expect(all).toBeGreaterThan(0.95);
    expect(all).toBeLessThan(1.05);
    // (where it falls: 0.79–0.95 of the model's shadow under it, IoU 0.66–0.83)
    expectWhereItFalls(areas, 0.75, 0.6);
  });
});

describe("the unstable core at the game's measures", () => {
  it("is the game's ball of metal panels: 0.96 high, about 1.5 across, in its colours, about its triangles", () => {
    const p = modelOf("UnstableCore").pos;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k++) {
      lo[k % 3] = Math.min(lo[k % 3], p[k]);
      hi[k % 3] = Math.max(hi[k % 3], p[k]);
    }
    // (centred on its footprint's middle, the map's +y our −z: the game's ball and studs, without its footing of ground,
    // x −0.75…0.75, −0.03…0.96 up, z −0.77…0.71)
    for (const [v, want] of [[lo[0], -0.753], [hi[0], 0.747], [lo[1], -0.034], [hi[1], 0.962], [lo[2], -0.774], [hi[2], 0.71]]) expect(Math.abs(v - want)).toBeLessThan(0.02);
    const col = modelOf("UnstableCore").col;
    const has = (c: readonly number[]) => {
      for (let k = 0; k < col.length; k += 3) if (Math.abs(col[k] - c[0]) < 1e-3 && Math.abs(col[k + 1] - c[1]) < 1e-3 && Math.abs(col[k + 2] - c[2]) < 1e-3) return true;
      return false;
    };
    for (const c of Object.values(UNSTABLE_CORE)) expect(has(c)).toBe(true);
    // (the game's has 1,740, its footing's among them)
    expect(modelTriangles("UnstableCore")).toBeLessThanOrEqual(380);
  });

  // (it cast none before; a disc over each of its four tiles, moved toward the footprint's middle: on the ground it does
  // not stand over, 0.87–1.03 a heading as fitted, 0.96 in all)
  it("casts Standard's shadow about as large as its model's round the compass, from its four tiles as it turns", () => {
    const areas = shadowAreas("UnstableCore", 1, true);
    const ratios = areas.map(([s, m]) => s / m);
    const all = areas.reduce((t, [s]) => t + s, 0) / areas.reduce((t, [, m]) => t + m, 0);
    expect(Math.min(...ratios)).toBeGreaterThan(0.8);
    expect(Math.max(...ratios)).toBeLessThan(1.1);
    expect(all).toBeGreaterThan(0.92);
    expect(all).toBeLessThan(1.02);
    // (where it falls: 0.73–0.78 of the model's shadow under it, IoU 0.57–0.71; cast from its tiles' middles and lit
    // under the ball it shaded a band round its footprint the size of the model's shadow but 0.10–0.19 of it, IoU
    // 0.06–0.10)
    expectWhereItFalls(areas, 0.68, 0.52);
    const W = 32;
    const H = 32;
    for (const [orientation, sx, sy] of [["Cw0", 1, 1], ["Cw90", 1, -1], ["Cw180", -1, -1]] as const) {
      const casters = objectCasters(W, H, entityView([{ template: "UnstableCore", x: 10, y: 20, z: 3, orientation, owner: "s" }]))!;
      const cast = [...casters.keys()].filter((i) => casters[i] > 0).sort((a, b) => a - b);
      const want = [0, 1].flatMap((j) => [0, 1].map((i) => (20 + sy * j) * W + 10 + sx * i)).sort((a, b) => a - b);
      expect(cast).toEqual(want);
    }
  });

  // (the samples under the ball are shaded only to 0.4 over its level, under its faces there: they read the bake where
  // they are, and its sunlit ones stay lit, as the game's, lit by its model's own shadow; 0.997 as fitted, 0.84 with
  // the samples under it shaded to the discs' tops)
  it("leaves its own sunlit faces lit in Standard's bake round the compass", () => {
    const W = 24;
    const H = 24;
    const G = 3;
    const [X0, Y0] = [10, 10];
    const heights = new Uint8Array(W * H).fill(G);
    const casters = objectCasters(W, H, entityView([{ template: "UnstableCore", x: X0, y: Y0, z: G, orientation: "Cw0", owner: "s" }]))!;
    const p = modelOf("UnstableCore").pos;
    const R = SHADOW_RES;
    const [ce, se] = [Math.cos(LIGHT.sunElevation), Math.sin(LIGHT.sunElevation)];
    for (let a = 0; a < 360; a += 45) {
      const [ux, uy] = [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
      const tops = shadowTops(W, H, heights, casters, LIGHT.sunElevation, { x: ux, y: uy });
      const T = (i: number, j: number) => tops[j * W * R + i];
      // (toward the sun in our frame: the map's +y our −z)
      const L = [ux * ce, se, -uy * ce];
      let lit = 0;
      let all = 0;
      for (let k = 0; k < p.length; k += 9) {
        const e1 = [p[k + 3] - p[k], p[k + 4] - p[k + 1], p[k + 5] - p[k + 2]];
        const e2 = [p[k + 6] - p[k], p[k + 7] - p[k + 1], p[k + 8] - p[k + 2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const l = Math.hypot(n[0], n[1], n[2]);
        const nl = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / l;
        if (!(nl > 0.1)) continue;
        const [x, y, z] = [(p[k] + p[k + 3] + p[k + 6]) / 3, (p[k + 1] + p[k + 4] + p[k + 7]) / 3, (p[k + 2] + p[k + 5] + p[k + 8]) / 3];
        const [u, v] = [(X0 + 1 + x) * R - 0.5, (Y0 + 1 - z) * R - 0.5];
        const [i0, j0] = [Math.floor(u), Math.floor(v)];
        const [fu, fv] = [u - i0, v - j0];
        const top = (T(i0, j0) * (1 - fu) + T(i0 + 1, j0) * fu) * (1 - fv) + (T(i0, j0 + 1) * (1 - fu) + T(i0 + 1, j0 + 1) * fu) * fv;
        lit += (l / 2) * nl * litFraction(G + Math.max(0, y), top, top);
        all += (l / 2) * nl;
      }
      expect(lit / all).toBeGreaterThan(0.97);
    }
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
    // (where it falls: 0.53–0.71 of the model's shadow under it, IoU 0.43–0.54, the dish's rim a thin shadow)
    expectWhereItFalls(areas, 0.48, 0.38);
  });
});
