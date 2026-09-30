// Painting objects by brush (PLAN §20 D235, D338): the plans a stroke makes. A scatter lands by density and fills
// gaps without stacking; Age is grown or mixed with the generator's saplings; a ruin field is grown as the
// generator grows one (calibrated field size, one level, the official gaps, storeys, models and turns); a thorn
// patch is shaped as the official maps' are (measured in docs/FINDINGS.md "Thorns").

import { describe, expect, it } from "vitest";
import { OFFICIAL_LAYOUT, RUIN_HEIGHT_SHARES, density as densityOf } from "../../src/core/gen/calibrated";
import { growthAt, planPaint, planRuinFields, planScatter, planThorns, scatterTiles, THORN_PATCH, WOODS_MIX, type PaintGround } from "../../src/core/gen/paint";

const W = 96;
const H = 96;
const N = W * H;

function ground(heights?: (x: number, y: number) => number, blocked: (x: number, y: number) => boolean = () => false): PaintGround {
  const h = new Uint8Array(N);
  const free = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      h[y * W + x] = heights ? heights(x, y) : 5;
      free[y * W + x] = blocked(x, y) ? 0 : 1;
    }
  return { W, H, heights: h, free };
}

/** The tiles within `r` of (cx, cy). */
function disc(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r) out.push(y * W + x);
  return out;
}

const box = (tiles: number[]) => {
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

describe("trees, bushes and succulents by brush: density, gaps, age", () => {
  const g = ground();
  const region = disc(48, 48, 10);

  it("land by density, never on a tile that is not free, the same for the same seed", () => {
    const free = ground(undefined, (x, y) => (x + y) % 5 === 0);
    const a = scatterTiles(free, { region, density: 0.5, seed: 7, existing: 0 });
    expect(a).toEqual(scatterTiles(free, { region, density: 0.5, seed: 7, existing: 0 }));
    expect(a).not.toEqual(scatterTiles(free, { region, density: 0.5, seed: 8, existing: 0 }));
    for (const i of a) expect(free.free[i]).toBe(1);
    const plantable = region.filter((i) => free.free[i]).length;
    expect(a.length).toBe(Math.round(0.5 * plantable));
    // sparse to dense
    const counts = [0.1, 0.4, 0.8, 1].map((d) => scatterTiles(g, { region, density: d, seed: 1, existing: 0 }).length);
    expect(counts.every((c, k) => k === 0 || c > counts[k - 1])).toBe(true);
    expect(counts[3]).toBe(region.length);
  });

  it("is denser toward the middle of the stroke and ragged at its edge", () => {
    const t = scatterTiles(g, { region, density: 0.5, seed: 3, existing: 0 });
    const inner = t.filter((i) => Math.hypot((i % W) - 48, Math.floor(i / W) - 48) <= 5).length / disc(48, 48, 5).length;
    const outer = t.filter((i) => Math.hypot((i % W) - 48, Math.floor(i / W) - 48) > 8).length / region.filter((i) => Math.hypot((i % W) - 48, Math.floor(i / W) - 48) > 8).length;
    expect(inner).toBeGreaterThan(outer + 0.2);
  });

  it("painting over what is there fills the gaps up to the density and never stacks", () => {
    const first = scatterTiles(g, { region, density: 0.4, seed: 5, existing: 0 });
    // the second stroke, at the same density over the same ground: what stands counts, so it adds nothing
    const taken = new Uint8Array(N);
    for (const i of first) taken[i] = 1;
    const over: PaintGround = { ...g, free: Uint8Array.from(g.free, (v, i) => (taken[i] ? 0 : v)) };
    expect(scatterTiles(over, { region, density: 0.4, seed: 6, existing: first.length })).toEqual([]);
    // at a higher density it adds the difference, on free tiles only
    const more = scatterTiles(over, { region, density: 0.7, seed: 6, existing: first.length });
    expect(more.length).toBe(Math.round(0.7 * region.length) - first.length);
    for (const i of more) expect(taken[i]).toBe(0);
    expect(new Set([...first, ...more]).size).toBe(first.length + more.length);
  });

  it("Age: grown is the default; mixed is the generator's blend of saplings (35%, growth 0.2 to 0.95)", () => {
    const all = disc(48, 48, 14);
    const grown = planScatter(g, "trees", "Pine", "grown", { region: all, density: 1, seed: 2, existing: 0 });
    expect(grown.every((p) => !("Growable" in (p.components ?? {})))).toBe(true);
    const mixed = planScatter(g, "trees", "Pine", "mixed", { region: all, density: 1, seed: 2, existing: 0 });
    const young = mixed.filter((p) => "Growable" in (p.components ?? {}));
    expect(young.length / mixed.length).toBeGreaterThan(0.29);
    expect(young.length / mixed.length).toBeLessThan(0.41);
    for (const p of young) {
      const v = (p.components!.Growable as { GrowthProgress: number }).GrowthProgress;
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThan(0.95 + 1e-9);
    }
    expect(growthAt("grown", 1, 3, 4)).toBe(1);
  });

  it("Mixed woods paints the generator's own pine, birch and oak mix in one stroke; succulents and berries their own", () => {
    const woods = planScatter(g, "woods", "", "grown", { region: disc(48, 48, 20), density: 1, seed: 4, existing: 0 });
    const share = (t: string) => woods.filter((p) => p.template === t).length / woods.length;
    const total = WOODS_MIX.reduce((a, [, w]) => a + w, 0);
    for (const [s, w] of WOODS_MIX) expect(share(s)).toBeCloseTo(w / total, 1);
    expect(woods.every((p) => ["Pine", "Birch", "Oak"].includes(p.template))).toBe(true);
    expect(planScatter(g, "succulents", "Succulent", "grown", { region, density: 1, seed: 1, existing: 0 }).every((p) => p.template === "Succulent")).toBe(true);
    const bushes = planScatter(g, "bushes", "BlueberryBush", "grown", { region, density: 1, seed: 1, existing: 0 });
    expect(bushes.every((p) => p.template === "BlueberryBush")).toBe(true);
    // (about half ripe, as the generator's patches)
    const ripe = bushes.filter((p) => (p.components as { "Yielder:Gatherable": { Yield: { Amount: number } } })["Yielder:Gatherable"].Yield.Amount === 3).length / bushes.length;
    expect(ripe).toBeGreaterThan(0.4);
    expect(ripe).toBeLessThan(0.6);
  });
});

describe("a painted ruin field is a generated one: size, one level, gaps, storeys, models, turns", () => {
  const g = ground();
  // fifty strokes, each a disc of 12 tiles over open ground, at different places and seeds
  const fields = Array.from({ length: 50 }, (_, k) => planRuinFields(g, disc(20 + (k % 7) * 8, 20 + Math.floor(k / 7) * 9, 12), 1, 100 + k)).flat();
  const columns = fields.flatMap((f) => f.storeys.map((s, k) => ({ storeys: s, variant: f.variants[k], orientation: f.orientations[k] })));

  it("fields are of the calibrated size for the map, filling their box as the official ones do", () => {
    expect(fields.length).toBeGreaterThan(50);
    const sizes = fields.map((f) => f.tiles.length);
    const target = densityOf("ruin_field_columns", N);
    expect(median(sizes)).toBeGreaterThan(target * 0.6);
    expect(median(sizes)).toBeLessThan(target * 1.5);
    // official fields fill 0.56 of their box (25th 0.50, 75th 0.64); a painted one lands close
    const fill = fields.filter((f) => f.tiles.length >= 15).map((f) => f.tiles.length / (box(f.tiles).w * box(f.tiles).h));
    expect(mean(fill)).toBeGreaterThan(OFFICIAL_LAYOUT.fieldFill - 0.14);
    expect(mean(fill)).toBeLessThan(OFFICIAL_LAYOUT.fieldFill + 0.14);
  });

  it("the storeys follow the official shares, and the mean per field runs from short to tall like the official fields", () => {
    for (let s = 1; s <= 8; s++) {
      const got = columns.filter((c) => c.storeys === s).length / columns.length;
      expect(got, `H${s}`).toBeGreaterThan(RUIN_HEIGHT_SHARES[s - 1] - 0.05);
      expect(got, `H${s}`).toBeLessThan(RUIN_HEIGHT_SHARES[s - 1] + 0.05);
    }
    const means = fields.filter((f) => f.tiles.length >= 15).map((f) => mean(f.storeys));
    const [lo, hi] = OFFICIAL_LAYOUT.fieldMeanStoreys;
    expect(Math.min(...means)).toBeLessThan(lo + 0.6);
    expect(Math.max(...means)).toBeGreaterThan(hi - 0.6);
  });

  it("the models and turns are the official shares", () => {
    for (const [v, share] of Object.entries(OFFICIAL_LAYOUT.ruinVariants)) expect(columns.filter((c) => c.variant === v).length / columns.length, v).toBeCloseTo(share, 1);
    for (const [o, share] of Object.entries(OFFICIAL_LAYOUT.ruinOrientations)) expect(columns.filter((c) => c.orientation === o).length / columns.length, o).toBeGreaterThan(share - 0.06);
  });

  it("a field stands on one level, keeps a tile of moat from the next, and has gaps inside it", () => {
    const stepped = ground((x) => (x < 48 ? 4 : 7));
    const plan = planRuinFields(stepped, disc(48, 48, 16), 1, 9);
    expect(plan.length).toBeGreaterThan(1);
    for (const f of plan) expect(new Set(f.tiles.map((i) => stepped.heights[i])).size).toBe(1);
    const owner = new Map<number, number>();
    plan.forEach((f, k) => f.tiles.forEach((i) => owner.set(i, k)));
    for (const [i, k] of owner)
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const j = (Math.floor(i / W) + dy) * W + (i % W) + dx;
        if (owner.has(j)) expect(owner.get(j)).toBe(k);
      }
    // gaps: some interior tile of a field is missing (about 4 to 10 in a hundred of its blob)
    const holes = fields.reduce((a, f) => {
      const set = new Set(f.tiles);
      return a + f.tiles.filter((i) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => set.has(i + dx + dy * W)).length >= 3).length;
    }, 0);
    expect(holes).toBeGreaterThan(0);
  });

  it("never lands on a tile that is not free, and a stroke too small for a field places none", () => {
    const blocked = ground(undefined, (x, y) => Math.hypot(x - 48, y - 48) < 6);
    const plan = planRuinFields(blocked, disc(48, 48, 14), 1, 3);
    for (const f of plan) for (const i of f.tiles) expect(blocked.free[i]).toBe(1);
    expect(planRuinFields(g, disc(48, 48, 1), 1, 3).length).toBeLessThanOrEqual(1);
    expect(planPaint(g, { kind: "ruins", template: "", region: [], density: 1, age: "grown", seed: 1, existing: 0 })).toEqual([]);
  });
});

describe("a painted thorn patch is shaped as the official maps' (223 patches on eight maps)", () => {
  const g = ground();
  const plan = Array.from({ length: 40 }, (_, k) => planThorns(g, disc(14 + (k % 6) * 14, 14 + Math.floor(k / 6) * 12, 9), 0.6, 300 + k));
  const patches = plan.flatMap((p) => {
    // the patches of a stroke: thorns within a tile of each other (8-connected)
    const set = new Set(p.map((o) => o.tile));
    const seen = new Set<number>();
    const out: number[][] = [];
    for (const t of set) {
      if (seen.has(t)) continue;
      const comp: number[] = [];
      const stack = [t];
      seen.add(t);
      while (stack.length) {
        const i = stack.pop()!;
        comp.push(i);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dx + dy * W;
            if ((dx || dy) && set.has(j) && !seen.has(j)) (seen.add(j), stack.push(j));
          }
      }
      out.push(comp);
    }
    return out;
  });

  it("patches of about 7 tiles (3 to 13 in the middle of the official ones), blotchy, about twice as long as wide", () => {
    expect(patches.length).toBeGreaterThan(60);
    const sizes = patches.map((c) => c.length);
    expect(median(sizes)).toBeGreaterThanOrEqual(5);
    expect(median(sizes)).toBeLessThanOrEqual(10);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(THORN_PATCH.max);
    const big = patches.filter((c) => c.length >= 8);
    const fill = big.map((c) => c.length / (box(c).w * box(c).h));
    expect(mean(fill)).toBeGreaterThan(0.42);
    expect(mean(fill)).toBeLessThan(0.78);
    // how much of a thorn's eight neighbours hold a thorn: the official patches' median is 3.5 of 8
    const nb = big.map((c) => {
      const s = new Set(c);
      return c.reduce((a, i) => a + [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (dx || dy) && s.has(i + dx + dy * W) ? 1 : 0)).reduce<number>((p, v) => p + v, 0), 0) / c.length;
    });
    expect(mean(nb)).toBeGreaterThan(2.4);
    expect(mean(nb)).toBeLessThan(4.5);
  });

  it("each thorn is turned and flipped at random, only on free ground, and a click's one thorn is the shelf's own", () => {
    const flat = plan.flat();
    for (const o of flat) expect(o.template).toBe("Thorns");
    expect(new Set(flat.map((o) => o.orientation)).size).toBe(4);
    const flips = flat.filter((o) => o.flipped).length / flat.length;
    expect(flips).toBeGreaterThan(0.35);
    expect(flips).toBeLessThan(0.65);
    const blocked = ground(undefined, (x) => x < 48);
    for (const o of planThorns(blocked, disc(48, 48, 12), 1, 2)) expect(blocked.free[o.tile]).toBe(1);
  });

  it("the density sets how much of the stroke they cover: sparse to dense", () => {
    const region = disc(48, 48, 16);
    const at = (d: number) => planThorns(g, region, d, 5).length;
    expect(at(1)).toBeGreaterThan(at(0.5));
    expect(at(0.5)).toBeGreaterThan(at(0.1));
    expect(at(1) / region.length).toBeLessThan(0.55);
  });
});
