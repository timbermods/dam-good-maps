// The resource baseline (Kyler, 2026-09-25: "Resources like the official maps"): the budgets by map
// size and settings, the clusters (groves with clearings, patches beside water), the ruin fields'
// heights and models, and the mine-site guarantee (src/core/resources/baseline.ts). The official
// numbers are investigation/official-baselines.json (tools/official-baselines.ts).

import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { DENSITY, OFFICIAL_LAYOUT, officialRange, RUIN_HEIGHT_SHARES, SPREAD } from "../../src/core/gen/calibrated";
import { generate } from "../../src/core/gen/generate";
import { toTimberFile } from "../../src/core/gen/pack";
import { distanceFrom } from "../../src/core/math/grid";
import { stream } from "../../src/core/math/rng";
import { meanStoreys, pickMineSite, planGroves, planPatches, planRuinFields, resourceBudget, ruinColumns, storeyMix, type BaselineGround } from "../../src/core/resources/baseline";
import { isSapling, treeLogs } from "../../src/core/analysis/wood";
import { startingLocation } from "../../src/core/format/entities";
import { groundOfFile, measureResources, TOWER } from "../../src/core/resources/measure";
import { planMapResources } from "../../src/core/resources/plan";
import { decodeSpecFragment, defaultSettings, makeSpec, THEMES } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { blocks } from "../../src/core/validate/report";

const official = JSON.parse(readFileSync("investigation/official-baselines.json", "utf8"));
const settings = defaultSettings("riverValley", "normal", { x: 128, y: 128 }).resources;

/** A flat made-up map: moist ground within 16 tiles of a river along x = 20–22, dry beyond. */
function flatGround(W = 128, H = 128): BaselineGround & { waterDist: Float64Array } {
  const N = W * H;
  const water = new Float64Array(N);
  const moisture = new Float64Array(N);
  const heights = new Uint8Array(N).fill(4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x >= 20 && x <= 22) water[i] = 0.6;
      else if (Math.abs(x - 21) <= 18) moisture[i] = 1;
    }
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = water[i] > 0 ? 1 : 0;
  return { W, H, heights, water, moisture, soilContamination: new Float64Array(N), taken: new Uint8Array(N), waterDist: distanceFrom(wet, W, H) };
}

describe("the resource baseline (Kyler, 2026-09-25)", () => {
  it("the calibration table is the measured official baseline", () => {
    const r = official.rates;
    expect([...DENSITY.trees_per_10k]).toEqual(r.trees_per_1k.medians.map((v: number) => Math.round(v * 10)));
    expect([...DENSITY.bushes_per_10k]).toEqual(r.bushes_per_1k.medians.map((v: number) => Math.round(v * 10)));
    expect([...DENSITY.scrap_per_1k_tiles]).toEqual(r.scrap_per_1k.medians.map((v: number) => Math.round(v)));
    expect([...SPREAD.trees]).toEqual([r.trees_per_1k.factors.p25, r.trees_per_1k.factors.p75]);
    expect([...SPREAD.bushes]).toEqual([r.bushes_per_1k.factors.p25, r.bushes_per_1k.factors.p75]);
    expect([...SPREAD.scrap]).toEqual([r.scrap_per_1k.factors.p25, r.scrap_per_1k.factors.p75]);
    expect(RUIN_HEIGHT_SHARES).toEqual(Object.values(official.ruins.storeys));
    expect([...OFFICIAL_LAYOUT.livingShare]).toEqual([official.trees.livingShare.p25, official.trees.livingShare.p75]);
    expect(Object.values(OFFICIAL_LAYOUT.ruinVariants)).toEqual(Object.values(official.ruins.variants));
    // Nomads and Oasis are left out, and each left-out map says why
    expect(Object.keys(official.leftOut.maps).sort()).toEqual(["Nomads", "Oasis"]);
    expect(official.maps.kept).not.toContain("Nomads");
  });

  it("budgets scale with the map's size, land in the official typical range and differ by seed", () => {
    let last = Infinity;
    for (const side of [96, 128, 192, 256]) {
      const area = side * side;
      const t = officialRange("trees", area);
      // denser on small maps (per tile); the official large and max maps are about as dense
      expect(t.median / area).toBeLessThan(1.05 * last);
      last = t.median / area;
      const seen = new Set<number>();
      for (let seed = 1; seed <= 40; seed++) {
        const b = resourceBudget(side, side, settings, seed);
        for (const k of ["trees", "bushes", "scrap"] as const) {
          const r = officialRange(k, area);
          expect(b[k], `${k} at ${side}², seed ${seed}`).toBeGreaterThanOrEqual(Math.floor(r.low));
          expect(b[k], `${k} at ${side}², seed ${seed}`).toBeLessThanOrEqual(Math.ceil(r.high));
        }
        expect(b.living / b.trees).toBeGreaterThanOrEqual(OFFICIAL_LAYOUT.livingShare[0] - 0.01);
        expect(b.living / b.trees).toBeLessThanOrEqual(OFFICIAL_LAYOUT.livingShare[1] + 0.01);
        seen.add(b.trees);
      }
      // maps vary: not every map hits the median
      expect(seen.size).toBeGreaterThan(30);
    }
    // the same seed, the same amounts; the settings move them around the baseline
    expect(resourceBudget(128, 128, settings, 7)).toEqual(resourceBudget(128, 128, settings, 7));
    const base = resourceBudget(128, 128, settings, 7);
    const more = resourceBudget(128, 128, { ...settings, forestDensity: 200, berryBushes: 300, ruins: 50 }, 7);
    expect(more.trees).toBeCloseTo(2 * base.trees, -1);
    expect(more.bushes).toBeCloseTo(3 * base.bushes, -1);
    expect(more.scrap).toBeCloseTo(0.5 * base.scrap, -1);
  });

  it("mine sites: one to four, never none", () => {
    expect(resourceBudget(128, 128, { ...settings, mineSites: 0 }, 1).mineSites).toBe(1);
    expect(resourceBudget(128, 128, { ...settings, mineSites: 9 }, 1).mineSites).toBe(4);
    // an old share link asking for none asks for one, and says nothing is wrong
    const d = decodeSpecFragment("v=0.6.0&s=5&t=canyon&z=128&d=n&ms=0")!;
    expect(d.spec.settings.resources.mineSites).toBe(1);
    expect(d.problems).toEqual([]);
  });

  it("groves: one species each, clearings between them, thinning from the heart; alive on moist ground, dead on dry", () => {
    const g = flatGround();
    const groves = planGroves(g, { living: 500, dry: 900 }, { rng: stream(3, "groves"), groveSize: "normal", speciesMix: settings.speciesMix, waterDist: g.waterDist });
    const moist = (i: number) => g.moisture[i] > 0;
    let living = 0;
    let dry = 0;
    for (const gr of groves) {
      expect(gr.tiles.every((i) => moist(i) === gr.living), "a grove stays on its kind of ground").toBe(true);
      if (gr.living) living += gr.tiles.length;
      else dry += gr.tiles.length;
      if (gr.living) expect(gr.species).not.toBe("Succulent");
    }
    expect(living).toBeGreaterThanOrEqual(480);
    expect(dry).toBeGreaterThanOrEqual(870);
    // measured as the official maps are: groves apart, about as full as theirs (0.41)
    const objects = groves.flatMap((gr) => gr.tiles.map((i) => ({ template: gr.species, x: i % g.W, y: Math.floor(i / g.W), z: 4, orientation: "Cw0" as const, flipped: false, components: {} })));
    const m = measureResources({ W: g.W, H: g.H, heights: g.heights, depth: g.water, moisture: g.moisture, objects });
    expect(m.trees.groves.gaps.every((c) => c >= 2)).toBe(true);
    expect(m.trees.groveFill).toBeGreaterThan(0.33);
    expect(m.trees.groveFill).toBeLessThan(0.5);
    const sizes = m.trees.groves.sizes;
    expect(sizes[sizes.length >> 1]).toBeGreaterThan(20);
    expect(m.trees.groveDominant).toBe(1);
  });

  it("berry patches: a few large patches beside water", () => {
    const g = flatGround();
    const patches = planPatches(g, 150, { rng: stream(4, "patches"), waterDist: g.waterDist });
    const bushes = patches.reduce((a, p) => a + p.tiles.length, 0);
    expect(bushes).toBeGreaterThanOrEqual(145);
    expect(patches.length).toBeGreaterThanOrEqual(2);
    expect(patches.length).toBeLessThanOrEqual(6);
    const near = patches.flatMap((p) => p.tiles).filter((i) => g.waterDist[i] <= 8).length;
    expect(near / bushes).toBeGreaterThan(0.8);
  });

  it("ruin heights: the official storey mix, a few towers among shorter columns, and mixed models", () => {
    const W = 64;
    const tiles: number[] = [];
    for (let y = 20; y < 27; y++) for (let x = 20; x < 27; x++) if ((x + y) % 5) tiles.push(y * W + x);
    const counts = new Array<number>(8).fill(0);
    let withTowers = 0;
    let steps = 0;
    let stepN = 0;
    const variants = new Map<string, number>();
    const fields = 300;
    for (let k = 0; k < fields; k++) {
      const c = ruinColumns(tiles, W, stream(k, "field"), 0);
      for (const h of c.storeys) counts[h - 1]++;
      if (c.storeys.some((h) => h >= TOWER)) withTowers++;
      for (const v of c.variants) variants.set(v, (variants.get(v) ?? 0) + 1);
      expect(c.scrap).toBe(15 * c.storeys.reduce((a, b) => a + b, 0));
      const at = new Map(tiles.map((t, j) => [t, c.storeys[j]]));
      for (const t of tiles)
        for (const d of [1, W, W + 1, W - 1]) {
          const n = at.get(t + d);
          if (n !== undefined && Math.abs(((t + d) % W) - (t % W)) <= 1) {
            steps += Math.abs(n - at.get(t)!);
            stepN++;
          }
        }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    counts.forEach((n, k) => expect(Math.abs(n / total - RUIN_HEIGHT_SHARES[k]), `H${k + 1}`).toBeLessThan(0.015));
    // a few towers in nearly every field (official: 89% of fields have one)
    expect(withTowers / fields).toBeGreaterThan(0.85);
    // neighbours differ about as much as the official ones (1.8 storeys; 25th–75th 1.4–2.1)
    expect(steps / stepN).toBeGreaterThan(1.4);
    expect(steps / stepN).toBeLessThan(2.3);
    // every model, A a little more often
    expect(variants.size).toBe(5);
    expect(variants.get("A")! / total).toBeGreaterThan(0.22);
    // tallness moves a field between short and tall (official fields: 2.2 to 3.9 storeys on average)
    expect(meanStoreys(-1)).toBeGreaterThan(2.2);
    expect(meanStoreys(-1)).toBeLessThan(2.6);
    expect(meanStoreys(1)).toBeGreaterThan(3.6);
    expect(meanStoreys(1)).toBeLessThan(3.95);
    expect(storeyMix(0)).toEqual(RUIN_HEIGHT_SHARES);
  });

  it("ruin fields hold the scrap asked for, each on one level, never touching", () => {
    const g = flatGround();
    for (let i = 0; i < g.W * g.H; i++) if (i % g.W > 90) (g.heights as Uint8Array)[i] = 6;
    const W = g.W;
    const rngOf = (tiles: number[]) => stream(9, "field", tiles[0]);
    const r = planRuinFields(g, 12000, { rng: stream(9, "ruins"), minStart: 0, fieldMedian: 32, scrapOf: (tiles, t) => ruinColumns(tiles, W, rngOf(tiles), t).scrap });
    const got = r.fields.reduce((a, f) => a + ruinColumns(f.tiles, W, rngOf(f.tiles), f.tallness).scrap, 0);
    expect(got).toBe(r.scrap);
    expect(got).toBeGreaterThan(0.9 * 12000);
    expect(got).toBeLessThan(1.15 * 12000);
    const owner = new Map<number, number>();
    r.fields.forEach((f, k) => {
      expect(new Set(f.tiles.map((i) => g.heights[i])).size).toBe(1);
      expect(f.tiles.every((i) => !(g.moisture[i] > 0))).toBe(true);
      for (const i of f.tiles) owner.set(i, k);
    });
    for (const [i, k] of owner)
      for (const d of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) {
        const o = owner.get(i + d);
        if (o !== undefined) expect(o).toBe(k);
      }
  });

  it("a mine site goes on flat dry ground in its band, on ground the colony walks to first", () => {
    const W = 96;
    const H = 96;
    const N = W * H;
    const heights = new Uint8Array(N).fill(3);
    // a raised block the colony cannot walk onto (no slopes) in the east
    for (let y = 0; y < H; y++) for (let x = 70; x < W; x++) heights[y * W + x] = 6;
    const start = new Uint8Array(N);
    start[48 * W + 10] = 1;
    const sd = distanceFrom(start, W, H);
    const regions = new Int32Array(N).map((_, i) => (heights[i] === 3 ? 0 : 1));
    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (i % W < 2 || i % W > W - 3 || i < 2 * W || i >= N - 2 * W) blocked[i] = 1;
    const spot = pickMineSite({ W, H, heights, blocked, startDist: sd, regions, root: 0 }, stream(1, "mine"), { lo: 46, hi: Infinity }, () => true)!;
    expect(spot).not.toBeNull();
    expect(spot.reachable).toBe(true);
    const lv = new Set(spot.tiles.map(([x, y]) => heights[y * W + x]));
    expect([...lv]).toEqual([3]);
    for (const [x, y] of spot.tiles) expect(sd[y * W + x]).toBeGreaterThanOrEqual(46);
    // with no reachable ground in the band, the unreachable ground still takes one
    const far = pickMineSite({ W, H, heights, blocked, startDist: sd, regions, root: 0 }, stream(1, "mine"), { lo: 80, hi: Infinity }, () => true)!;
    expect(far.reachable).toBe(false);
  });

  it("on a map the generator did not plan (a Real place), one call places everything, near the start first", () => {
    const g = flatGround(96, 96);
    const W = 96;
    const H = 96;
    const start = { x: 30, y: 48 };
    const startEntity = startingLocation({ id: "s", owner: "t", x: 29, y: 47, z: 4, orientation: "Cw0" });
    const r = planMapResources({ W, H, heights: g.heights as Uint8Array, water: g.water, moisture: g.moisture, soilContamination: g.soilContamination, entities: [startEntity], start, settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources, seed: 5, nearStart: { wood: 108, bushes: 48 }, ruinsClear: 22, badwater: { setting: "normal", within: 15 } });
    expect(r.mines.length).toBeGreaterThanOrEqual(1);
    expect(r.entities.filter((e) => e.template === "UndergroundRuins").length).toBe(r.mines.length);
    // flat ground has no hollow or side valley for a badwater spring (D200): none, and the water as it was
    expect(r.badwater).toEqual([]);
    expect(r.water).toBeNull();
    // starting wood (logs of grown trees, D164) and living bushes within 20 tiles of the start (the
    // ground is flat: the walk is straight), and a share of the living trees stored as saplings
    const near = (e: { x: number; y: number }) => Math.max(Math.abs(e.x - start.x), Math.abs(e.y - start.y)) <= 20;
    const woodNear = r.entities.filter((e) => near(e) && !isSapling(e.components)).reduce((a, e) => a + treeLogs(e.template, e.components), 0);
    const bushesNear = r.entities.filter((e) => e.template === "BlueberryBush" && near(e)).length;
    expect(woodNear).toBeGreaterThanOrEqual(108);
    expect(bushesNear).toBeGreaterThanOrEqual(30);
    const living = r.entities.filter((e) => ["Pine", "Birch", "Oak"].includes(e.template) && !e.components.LivingNaturalResource);
    const young = living.filter((e) => isSapling(e.components)).length / living.length;
    expect(young).toBeGreaterThan(0.25);
    expect(young).toBeLessThan(0.45);
    // nothing on the start or in the water, and one object a tile
    const tiles = r.entities.filter((e) => e.template !== "UndergroundRuins").map((e) => e.y * W + e.x);
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(tiles.every((i) => !(g.water[i] > 0))).toBe(true);
    expect(tiles.every((i) => Math.abs((i % W) - start.x) > 2 || Math.abs(Math.floor(i / W) - start.y) > 2)).toBe(true);
    // the same input, the same entities
    const again = planMapResources({ W, H, heights: g.heights as Uint8Array, water: g.water, moisture: g.moisture, soilContamination: g.soilContamination, entities: [startEntity], start, settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources, seed: 5, nearStart: { wood: 108, bushes: 48 }, ruinsClear: 22, badwater: { setting: "normal", within: 15 } });
    expect(again.entities.map((e) => `${e.id}:${e.template}`)).toEqual(r.entities.map((e) => `${e.id}:${e.template}`));
  });

  it("every generated map has a mine site; a map without one fails resources.mine_site, which blocks generation and warns on export", () => {
    for (const theme of THEMES) {
      const r = generate(makeSpec({ seed: 11, theme, size: { x: 96, y: 96 } }));
      expect(r.report.passed, theme).toBe(true);
      const mines = r.built.entities.filter((e) => e.template === "UndergroundRuins").length;
      expect(mines, theme).toBeGreaterThanOrEqual(1);
      expect(r.report.checks.find((c) => c.id === "resources.mine_site")!.ok).toBe(true);
    }
    const r = generate(makeSpec({ seed: 12, size: { x: 96, y: 96 } }));
    const file = toTimberFile(r.spec, r.built);
    file.world.entities = file.world.entities.filter((e) => e.Template !== "UndergroundRuins");
    const none = readTimber(writeTimber(file));
    for (const profile of ["generate", "export", "import"] as const) {
      const v = validateMap(none, { profile, spec: r.spec, designedFor: "normal" });
      const c = v.report.checks.find((x) => x.id === "resources.mine_site")!;
      expect(c.ok).toBe(false);
      expect(blocks(profile, c)).toBe(profile === "generate");
      expect(c.severity).toBe(profile === "generate" ? "error" : "warning");
    }
  });

  it("a project file saved asking for no mine sites opens asking for one", () => {
    const r = generate(makeSpec({ seed: 13, size: { x: 96, y: 96 } }));
    const doc = JSON.parse(strFromU8(gunzipSync(encodeProject(generatedDocument(r)))));
    doc.spec.settings.resources.mineSites = 0;
    const back = decodeProject(gzipSync(strToU8(JSON.stringify(doc))));
    expect(back.spec!.settings.resources.mineSites).toBe(1);
  });

  it("generated maps carry the official amounts for their size, in groves with clearings and patches", () => {
    for (const [theme, side, seed] of [["riverValley", 128, 3], ["lakeBasin", 128, 4], ["canyon", 96, 5], ["highlands", 192, 6]] as const) {
      const r = generate(makeSpec({ seed, theme, size: { x: side, y: side } }));
      expect(r.report.passed).toBe(true);
      const m = measureResources(groundOfFile(r.file));
      const s = r.spec.settings.resources;
      const area = side * side;
      const t = officialRange("trees", area);
      expect(m.trees.total, `${theme} trees`).toBeGreaterThan(0.85 * t.low * (s.forestDensity / 100));
      expect(m.trees.total, `${theme} trees`).toBeLessThan(1.1 * t.high * (s.forestDensity / 100));
      const sc = officialRange("scrap", area);
      expect(m.ruins.scrap, `${theme} scrap`).toBeGreaterThan(0.85 * sc.low * (s.ruins / 100));
      expect(m.ruins.scrap, `${theme} scrap`).toBeLessThan(1.15 * sc.high * (s.ruins / 100));
      // about two thirds of pines, birches and oaks stored dead; groves as full as the official ones
      expect(m.trees.deadShare).toBeGreaterThan(0.5);
      expect(m.trees.groveFill).toBeLessThan(0.52);
      expect(m.trees.groves.gaps.every((c) => c >= 1)).toBe(true);
      expect(m.bushes.patches.count).toBeLessThanOrEqual(10);
      expect(m.mines.count).toBeGreaterThanOrEqual(1);
    }
  });
});
