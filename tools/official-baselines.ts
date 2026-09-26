// The official maps' resources by map size (Kyler's "Resources like the official maps", 2026-09-25):
// trees, groves, berry bushes and patches, ruins and their fields, and mine sites, measured with
// src/core/resources/measure.ts. Writes investigation/official-baselines.json: aggregates only (the
// maps are local copies, not ours to share), plus which maps were left out and why.
//
//   npx tsx tools/official-baselines.ts [--dir <folder of official .timber files>] [--out investigation/official-baselines.json]
//
// The maps are read from investigation/raw/builtin (local only; the main checkout has them). Dev maps
// (names starting with "_") are skipped.
//
// By size: official densities fall with map size (small maps are packed 3–4× denser than 256² ones).
// Each rate is taken by size class, as the calibration table always has (small up to about 100²,
// medium 128², large 192² and 256×150, max 256²): the class medians, joined linearly in ln(area)
// between the classes' areas (src/core/gen/calibrated.ts `density`). How much maps of one size differ
// is measured where there are enough of them: in the large and max classes (five or six maps each),
// every map's rate ÷ its class median, pooled, as percentiles. A size's typical range is its median
// times the 25th and 75th percentile factors.
//
// Left out: Nomads and Oasis (Kyler: exceptional maps), and, for each rate, any other map that is a
// clear outlier on it: its rate ÷ the size trend (a power of the area fitted over every kept map) lies
// beyond Tukey's fences, 1.5 × the interquartile range outside the quartiles (on the log ratios).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readTimber } from "../src/core/format/timber";
import { groundOfFile, measureResources, MAP_TREES, RUIN_VARIANT_IDS, type ResourceMeasures } from "../src/core/resources/measure";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DIR = arg("dir", existsSync("investigation/raw/builtin") ? "investigation/raw/builtin" : "../DamGoodMaps/investigation/raw/builtin");
const OUT = arg("out", "investigation/official-baselines.json");
/** Kyler's exceptional maps. */
const EXCEPTIONAL: Record<string, string> = {
  Nomads: "exceptional by design (Kyler): a nomad map with unstable cores, few bushes and scattered small groves",
  Oasis: "exceptional by design (Kyler): a desert map around aquifers, with half its bushes stored dead",
};
const ANCHORS = { "96²": 96 * 96, "128²": 128 * 128, "192²": 192 * 192, "256²": 256 * 256 };

// ------------------------------------------------------------------------------------------ stats

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
function quantile(values: readonly number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = (s.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return s[lo] + (s[hi] - s[lo]) * (k - lo);
}
const median = (v: readonly number[]) => quantile(v, 0.5);
const Q = [0.1, 0.25, 0.5, 0.75, 0.9] as const;
const quantiles = (v: readonly number[], d = 3) => Object.fromEntries(Q.map((p) => [`p${Math.round(p * 100)}`, round(quantile(v, p), d)]));

/** Official size classes and the area each class's median stands at (calibrated.ts SIZE_ANCHORS). */
const CLASSES = ["small", "medium", "large", "max"] as const;
const CLASS_AREA = [3750, 16384, 36864, 65536];
/** Classes with enough maps to measure the spread among maps of one size. */
const SPREAD_CLASSES = new Set(["large", "max"]);

/** The class medians' rate at `area`: joined linearly in ln(area) between the classes, flat beyond. */
function curveAt(medians: readonly number[], area: number): number {
  const x = Math.log(area);
  const xs = CLASS_AREA.map((a) => Math.log(a));
  if (x <= xs[0]) return medians[0];
  for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return medians[k - 1] + ((x - xs[k - 1]) / (xs[k] - xs[k - 1])) * (medians[k] - medians[k - 1]);
  return medians[medians.length - 1];
}

/** The size trend for the outlier rule: ln(rate) fitted as a line in ln(area). */
function trend(points: { area: number; value: number }[]): (area: number) => number {
  const xs = points.map((p) => Math.log(p.area));
  const ys = points.map((p) => Math.log(p.value));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, k) => {
    sxy += (x - mx) * (ys[k] - my);
    sxx += (x - mx) * (x - mx);
  });
  const slope = sxx > 0 ? sxy / sxx : 0;
  return (area: number) => Math.exp(my + slope * (Math.log(area) - mx));
}

interface Fit {
  /** Each class's median rate: small, medium, large, max. */
  medians: number[];
  /** The large and max maps' rate ÷ their class median, as percentiles. */
  factors: Record<string, number>;
}

function fitClasses(points: { area: number; value: number; cls: string }[]): Fit {
  const medians = CLASSES.map((c) => median(points.filter((p) => p.cls === c).map((p) => p.value)));
  const res = points.filter((p) => SPREAD_CLASSES.has(p.cls)).map((p) => p.value / curveAt(medians, p.area));
  return { medians: medians.map((v) => round(v, 2)), factors: quantiles(res) };
}
const fitAt = (f: Fit, area: number, factor = "p50") => curveAt(f.medians, area) * (factor === "p50" ? 1 : f.factors[factor]);

// ------------------------------------------------------------------------------------------ maps

interface MapRow {
  name: string;
  area: number;
  sizeClass: string;
  m: ResourceMeasures;
}
const sizeClass = (area: number) => (area <= 12_000 ? "small" : area <= 20_000 ? "medium" : area <= 45_000 ? "large" : "max");

const files = readdirSync(DIR).filter((n) => n.endsWith(".timber") && !n.startsWith("_")).sort();
if (!files.length) throw new Error(`no official maps in ${DIR}`);
const all: MapRow[] = files.map((f) => {
  const file = readTimber(new Uint8Array(readFileSync(join(DIR, f))));
  const m = measureResources(groundOfFile(file));
  return { name: f.slice(0, -7), area: m.area, sizeClass: sizeClass(m.area), m };
});
const kept = all.filter((r) => !(r.name in EXCEPTIONAL));

// ------------------------------------------------------------------------ rates by size, outliers

type Rate = { key: string; what: string; of: (m: ResourceMeasures) => number };
const per1k = (n: number, m: ResourceMeasures) => (1000 * n) / m.area;
const RATES: Rate[] = [
  { key: "trees_per_1k", what: "trees per 1,000 tiles", of: (m) => per1k(m.trees.total, m) },
  { key: "groves_per_map", what: "groves (trees within 2 tiles of each other, 5 or more) per map", of: (m) => m.trees.groves.count },
  { key: "bushes_per_1k", what: "berry bushes per 1,000 tiles", of: (m) => per1k(m.bushes.total, m) },
  { key: "patches_per_map", what: "berry patches (bushes within 2 tiles of each other, 3 or more) per map", of: (m) => m.bushes.patches.count },
  { key: "scrap_per_1k", what: "scrap per 1,000 tiles (15 per storey)", of: (m) => per1k(m.ruins.scrap, m) },
  { key: "ruin_columns_per_1k", what: "ruin columns per 1,000 tiles", of: (m) => per1k(m.ruins.columns, m) },
  { key: "ruin_fields_per_map", what: "ruin fields (10 or more touching columns) per map", of: (m) => m.ruins.fields.length },
];

const outliers: Record<string, { map: string; ratio: number }[]> = {};
const fits: Record<string, Fit & { what: string; maps: number; bySize: Record<string, number>; classes: Record<string, { n: number; min: number; median: number; max: number }> }> = {};
for (const r of RATES) {
  const pts = kept.map((row) => ({ name: row.name, area: row.area, value: r.of(row.m), cls: row.sizeClass }));
  const t = trend(pts);
  const logs = pts.map((p) => Math.log(p.value / t(p.area)));
  const q1 = quantile(logs, 0.25);
  const q3 = quantile(logs, 0.75);
  const out = pts.filter((_, k) => logs[k] < q1 - 1.5 * (q3 - q1) || logs[k] > q3 + 1.5 * (q3 - q1));
  outliers[r.key] = out.map((p) => ({ map: p.name, ratio: round(p.value / t(p.area), 2) }));
  const use = pts.filter((p) => !out.includes(p));
  const f = fitClasses(use);
  const classes: Record<string, { n: number; min: number; median: number; max: number }> = {};
  for (const c of CLASSES) {
    const v = use.filter((p) => p.cls === c).map((p) => p.value);
    if (v.length) classes[c] = { n: v.length, min: round(Math.min(...v), 1), median: round(median(v), 1), max: round(Math.max(...v), 1) };
  }
  const bySize: Record<string, number> = {};
  for (const [label, area] of Object.entries(ANCHORS)) for (const p of ["p25", "p50", "p75"]) bySize[`${label} ${p}`] = round(fitAt(f, area, p), 1);
  fits[r.key] = { what: r.what, maps: use.length, ...f, bySize, classes };
}

// ---------------------------------------------------------------------- shares and distributions

const pooled = (rows: MapRow[], f: (m: ResourceMeasures) => number[]) => rows.flatMap((r) => f(r.m));
const perMap = (rows: MapRow[], f: (m: ResourceMeasures) => number | null) => rows.map((r) => f(r.m)).filter((v): v is number => v !== null && Number.isFinite(v));
const shareOf = (counts: Record<string, number>[], keys: readonly string[]) => {
  const tot = keys.map((k) => counts.reduce((a, c) => a + (c[k] ?? 0), 0));
  const sum = tot.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map((k, i) => [k, round(tot[i] / sum)]));
};

const treeRows = kept;
const species = shareOf(
  treeRows.map((r) => Object.fromEntries(MAP_TREES.map((s) => [s, r.m.trees.bySpecies[s].total]))),
  MAP_TREES,
);
const deadBySpecies = Object.fromEntries(
  MAP_TREES.map((s) => {
    const t = treeRows.reduce((a, r) => a + r.m.trees.bySpecies[s].total, 0);
    const d = treeRows.reduce((a, r) => a + r.m.trees.bySpecies[s].dead, 0);
    return [s, round(t ? d / t : 0)];
  }),
);
const storeyCounts = kept.map((r) => Object.fromEntries(r.m.ruins.storeys.map((n, k) => [`H${k + 1}`, n])));
const fieldsAll = kept.flatMap((r) => r.m.ruins.fields.map((f) => ({ ...f, map: r.name, area: r.area })));

const out = {
  generated: "tools/official-baselines.ts",
  source: "the official maps of Timberborn 1.1.2.4 (investigation/raw/builtin, local only); aggregates only",
  method: {
    size: "rates by size class (small up to 12,000 tiles, medium to 20,000, large to 45,000, max above): the class medians, joined linearly in ln(area) between 3,750, 16,384, 36,864 and 65,536 tiles; factors are the large and max maps' rate ÷ their class median (five or six maps each), as percentiles; bySize is the median at each size times the p25 and p75 factors",
    grove: "trees within 2 tiles of each other (Chebyshev), 5 or more; a clearing is the gap between a grove's nearest tree and the nearest tree of another grove, less one",
    patch: "berry bushes within 2 tiles of each other, 3 or more",
    field: "ruin columns that touch (Chebyshev 1), 10 or more; scrap is 15 per storey; a tower is 6 storeys or more",
    dead: "LivingNaturalResource.IsDead",
    outliers: "a map is left out of a rate when its rate ÷ the size trend (ln(rate) fitted as a line in ln(area) over every kept map) lies beyond Tukey's fences: 1.5 × the interquartile range of the log ratios outside the quartiles",
  },
  maps: { measured: all.length, kept: kept.map((r) => r.name), sizes: Object.fromEntries(kept.map((r) => [r.name, `${r.m.W}×${r.m.H}`])) },
  leftOut: { maps: EXCEPTIONAL, byRate: outliers },
  rates: fits,
  trees: {
    livingShare: quantiles(perMap(treeRows, (m) => (m.trees.total ? m.trees.living / m.trees.total : null))),
    deadShareOfPineBirchOak: quantiles(perMap(treeRows, (m) => m.trees.deadShare)),
    deadShareBySpecies: deadBySpecies,
    youngShareOfLiving: quantiles(perMap(treeRows, (m) => (m.trees.living ? m.trees.young / m.trees.living : null))),
    species,
    livingOnMoist: quantiles(perMap(treeRows, (m) => m.trees.livingOnMoist)),
    deadOnDry: quantiles(perMap(treeRows, (m) => m.trees.deadOnDry)),
    moistCover: quantiles(perMap(treeRows, (m) => m.trees.moistCover)),
    dryCover: quantiles(perMap(treeRows, (m) => m.trees.dryCover)),
    groveSize: quantiles(pooled(treeRows, (m) => m.trees.groves.sizes), 1),
    groveSizeMedianPerMap: quantiles(perMap(treeRows, (m) => median(m.trees.groves.sizes)), 1),
    largestGrove: quantiles(perMap(treeRows, (m) => Math.max(...m.trees.groves.sizes)), 1),
    inGroves: quantiles(perMap(treeRows, (m) => m.trees.groves.inGroups)),
    groveFill: quantiles(perMap(treeRows, (m) => m.trees.groveFill)),
    clearing: quantiles(pooled(treeRows, (m) => m.trees.groves.gaps), 1),
    clearingMedianPerMap: quantiles(perMap(treeRows, (m) => median(m.trees.groves.gaps)), 1),
    groveDominantSpecies: quantiles(perMap(treeRows, (m) => m.trees.groveDominant)),
  },
  bushes: {
    livingShare: quantiles(perMap(kept, (m) => (m.bushes.total ? m.bushes.living / m.bushes.total : null))),
    moistCover: quantiles(perMap(kept, (m) => m.bushes.moistCover)),
    patchFill: quantiles(perMap(kept, (m) => m.bushes.patchFill)),
    toWater: quantiles(perMap(kept, (m) => m.bushes.toWater), 1),
    patchSize: quantiles(pooled(kept, (m) => m.bushes.patches.sizes), 1),
    patchSizeMedianPerMap: quantiles(perMap(kept, (m) => median(m.bushes.patches.sizes)), 1),
    largestPatch: quantiles(perMap(kept, (m) => Math.max(...m.bushes.patches.sizes)), 1),
    inPatches: quantiles(perMap(kept, (m) => m.bushes.patches.inGroups)),
    clearing: quantiles(pooled(kept, (m) => m.bushes.patches.gaps), 1),
  },
  ruins: {
    storeys: shareOf(storeyCounts, ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"]),
    meanStoreys: quantiles(perMap(kept, (m) => (m.ruins.columns ? m.ruins.scrap / 15 / m.ruins.columns : null))),
    variants: shareOf(kept.map((r) => r.m.ruins.variants), RUIN_VARIANT_IDS),
    orientations: shareOf(kept.map((r) => r.m.ruins.orientations), ["Cw0", "Cw90", "Cw180", "Cw270"]),
    inFields: quantiles(perMap(kept, (m) => m.ruins.inFields)),
    field: {
      count: fieldsAll.length,
      columns: quantiles(fieldsAll.map((f) => f.columns), 1),
      scrap: quantiles(fieldsAll.map((f) => f.scrap), 0),
      fill: quantiles(fieldsAll.map((f) => f.fill)),
      aspect: quantiles(fieldsAll.map((f) => f.aspect)),
      meanStoreys: quantiles(fieldsAll.map((f) => f.meanStoreys)),
      sdStoreys: quantiles(fieldsAll.map((f) => f.sdStoreys)),
      maxStoreys: quantiles(fieldsAll.map((f) => f.maxStoreys), 1),
      towers: quantiles(fieldsAll.map((f) => f.towers), 1),
      towerShare: quantiles(fieldsAll.map((f) => f.towers / f.columns)),
      withoutTowers: round(fieldsAll.filter((f) => f.towers === 0).length / fieldsAll.length),
      neighbourStep: quantiles(fieldsAll.map((f) => f.neighbourStep)),
      variants: quantiles(fieldsAll.map((f) => f.variants), 1),
      largestPerMap: quantiles(perMap(kept, (m) => (m.ruins.fields.length ? m.ruins.fields[0].columns : null)), 1),
      columnsBySize: Object.fromEntries(
        CLASSES.map((c) => {
          const v = kept.filter((r) => r.sizeClass === c).flatMap((r) => r.m.ruins.fields.map((f) => f.columns));
          return [c, { fields: v.length, ...quantiles(v, 1) }];
        }),
      ),
    },
  },
  mines: {
    perMap: Object.fromEntries(
      ["small", "medium", "large", "max"].map((c) => {
        const v = kept.filter((r) => r.sizeClass === c).map((r) => r.m.mines.count);
        return [c, { n: v.length, min: Math.min(...v), median: median(v), max: Math.max(...v) }];
      }),
    ),
    fromStart: quantiles(pooled(kept, (m) => m.mines.fromStart), 1),
    nearestFromStart: quantiles(perMap(kept, (m) => (m.mines.fromStart.length ? m.mines.fromStart[0] : null)), 1),
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT}: ${all.length} maps measured, ${kept.length} kept`);
for (const [k, f] of Object.entries(fits)) {
  const o = outliers[k].length ? ` (left out: ${outliers[k].map((x) => `${x.map} ×${x.ratio}`).join(", ")})` : "";
  console.log(`${k.padEnd(22)} medians ${f.medians.join(" / ")} p10 ×${f.factors.p10} p25 ×${f.factors.p25} p75 ×${f.factors.p75} p90 ×${f.factors.p90}${o}`);
  console.log(`  ${Object.entries(f.bySize).map(([a, v]) => `${a} ${v}`).join(", ")}`);
}
if (process.argv.includes("--maps")) {
  for (const r of all) {
    const m = r.m;
    console.log(
      `${r.name.padEnd(16)} ${m.W}x${m.H} trees ${m.trees.total} living ${(m.trees.living / m.trees.total).toFixed(2)} groves ${m.trees.groves.count} bushes ${m.bushes.total} patches ${m.bushes.patches.count} scrap ${m.ruins.scrap} cols ${m.ruins.columns} fields ${m.ruins.fields.length} mines ${m.mines.count}`,
    );
  }
}
