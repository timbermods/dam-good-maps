// The per-setting batch experiments (ROADMAP M6: "each setting moves its measured target in batch
// runs, a test per setting"). Each experiment generates the same seeds at two values of one
// setting (everything else at the theme's preset) and measures the target the setting maps to
// (PLAN §5), with the yardstick of the official calibration (src/core/analysis/metrics.ts).
//
// tests/contract/settings.test.ts runs every experiment on a few seeds; tools/settings-batch.ts
// runs them on more and writes the table in docs/progress.md.

import { measure, type MapMetrics } from "../src/core/analysis/metrics";
import { generate } from "../src/core/gen/generate";
import { makeSpec, type Difficulty, type MapSpec, type ThemeId } from "../src/core/spec/mapspec";

export interface Experiment {
  /** The setting, as the panel names it. */
  setting: string;
  /** What it maps to (PLAN §5), and how it is measured. */
  target: string;
  theme: ThemeId;
  designedFor?: Difficulty;
  /** Two values of the setting, low then high, as they are written on the panel. */
  values: [string, string];
  apply(spec: MapSpec, value: string): void;
  metric(m: MapMetrics, spec: MapSpec): number;
  /** "up": the metric's mean at the high value exceeds the low value's by at least `delta`;
   *  "down": falls by at least `delta`; "exact": every map's metric equals `expected(value)`. */
  expect: "up" | "down" | "exact";
  delta?: number;
  expected?: (value: string, spec: MapSpec) => number;
  /** Decimal places in the report. */
  digits?: number;
}

const num = (v: string) => Number(v);

export const EXPERIMENTS: Experiment[] = [
  {
    setting: "Relief",
    target: "height range p5–p95 = 7 + 0.08·relief levels",
    theme: "riverValley",
    values: ["20", "90"],
    apply: (s, v) => (s.settings.terrain.relief = num(v)),
    metric: (m) => m.heightRange,
    expect: "up",
    delta: 3,
    digits: 1,
  },
  {
    setting: "Highest terrain",
    target: "terrain never above it (the highest tile)",
    theme: "riverValley",
    values: ["11", "16"],
    apply: (s, v) => (s.settings.terrain.highestTerrain = num(v)),
    metric: (m) => m.maxHeight,
    expect: "exact",
    expected: (v) => num(v),
  },
  {
    setting: "Terracing",
    target: "share of height steps that are one level = 0.86 − 0.0059·terracing",
    theme: "riverValley",
    values: ["10", "90"],
    apply: (s, v) => (s.settings.terrain.terracing = num(v)),
    metric: (m) => m.step1Share,
    expect: "down",
    delta: 0.1,
    digits: 3,
  },
  {
    setting: "Buildable land",
    target: "flat share 0.40 / 0.52 / 0.60 (tiles whose 8 neighbours share their level)",
    theme: "riverValley",
    values: ["tight", "generous"],
    apply: (s, v) => (s.settings.terrain.buildableLand = v as MapSpec["settings"]["terrain"]["buildableLand"]),
    metric: (m) => m.flatShare,
    expect: "up",
    delta: 0.03,
    digits: 3,
  },
  {
    setting: "Buildable land (reach)",
    target: "land walkable from the start: at least 750 / 1,300 / 2,500 tiles",
    theme: "riverValley",
    values: ["tight", "generous"],
    apply: (s, v) => (s.settings.terrain.buildableLand = v as MapSpec["settings"]["terrain"]["buildableLand"]),
    metric: (m) => m.reach,
    expect: "up",
    delta: 500,
  },
  {
    setting: "Rivers",
    target: "rivers entering on the map edge (0: a spring feeds the river)",
    theme: "riverValley",
    values: ["0", "3"],
    apply: (s, v) => (s.settings.water.rivers = num(v)),
    metric: (m) => m.edgeRivers,
    expect: "exact",
    expected: (v) => num(v),
  },
  {
    setting: "River style",
    target: "meander amplitude: straight ≤ 0.05·H, meandering 0.12–0.2·H (largest distance from the source–outlet line ÷ H)",
    theme: "riverValley",
    values: ["straight", "meandering"],
    apply: (s, v) => (s.settings.water.riverStyle = v as MapSpec["settings"]["water"]["riverStyle"]),
    metric: (m) => m.meander,
    expect: "up",
    delta: 0.08,
    digits: 3,
  },
  {
    setting: "River style (braided)",
    target: "a braided river splits into 2–4 channels across a low plain: rivers leaving by the map edge",
    theme: "riverValley",
    values: ["meandering", "braided"],
    apply: (s, v) => (s.settings.water.riverStyle = v as MapSpec["settings"]["water"]["riverStyle"]),
    metric: (m) => m.edgeExits,
    expect: "up",
    delta: 1,
    digits: 1,
  },
  {
    setting: "River flow",
    target: "total strength of the rivers' sources = 0.6× / 1× / 2× / 4× the size-aware official median",
    theme: "riverValley",
    values: ["trickle", "lush"],
    apply: (s, v) => (s.settings.water.riverFlow = v as MapSpec["settings"]["water"]["riverFlow"]),
    metric: (m) => m.cleanStrength,
    expect: "up",
    delta: 5,
    digits: 2,
  },
  {
    setting: "Drought reserve",
    target: "stored water near the start: the best of the dam site within 40 tiles and the natural water kept through the drought",
    theme: "riverValley",
    values: ["scarce", "plenty"],
    apply: (s, v) => (s.settings.water.droughtReserve = v as MapSpec["settings"]["water"]["droughtReserve"]),
    metric: (m) => Math.max(m.bestDam, m.natural),
    expect: "up",
    delta: 200,
  },
  {
    setting: "Lakes and basins",
    target: "natural basins of 20+ tiles: 0 / 0.5× / 1× / 2× the official median for the size",
    theme: "riverValley",
    values: ["none", "many"],
    apply: (s, v) => (s.settings.water.lakes = v as MapSpec["settings"]["water"]["lakes"]),
    metric: (m) => m.basins20,
    expect: "up",
    delta: 3,
    digits: 1,
  },
  {
    setting: "Waterfalls",
    target: "river bed drops of 2+ levels: 0 / 1–2 / 3–6",
    theme: "riverValley",
    values: ["off", "many"],
    apply: (s, v) => (s.settings.water.waterfalls = v as MapSpec["settings"]["water"]["waterfalls"]),
    metric: (m) => m.bedDrops2,
    expect: "up",
    delta: 2.5,
    digits: 1,
  },
  {
    setting: "Badwater",
    target: "badwater-to-clean strength ratio 0 / 0.3 / 0.65 / 1.2",
    theme: "riverValley",
    values: ["off", "high"],
    apply: (s, v) => (s.settings.hazards.badwater = v as MapSpec["settings"]["hazards"]["badwater"]),
    metric: (m) => (m.cleanStrength > 0 ? m.badwaterStrength / m.cleanStrength : 0),
    expect: "up",
    delta: 0.6,
    digits: 2,
  },
  {
    setting: "Badwater distance",
    target: "least distance from the start to badwater or contaminated soil",
    theme: "riverValley",
    values: ["20", "50"],
    apply: (s, v) => (s.settings.hazards.badwaterDistance = num(v)),
    metric: (m) => (Number.isFinite(m.badwaterDistance) ? m.badwaterDistance : 200),
    expect: "up",
    delta: 15,
    digits: 1,
  },
  {
    setting: "Thorn belts",
    target: "1–3 belts of 13–40 thorns, 20+ tiles from the start: thorns on the map",
    theme: "riverValley",
    values: ["off", "some"],
    apply: (s, v) => (s.settings.hazards.thornBelts = v as MapSpec["settings"]["hazards"]["thornBelts"]),
    metric: (m) => m.thorns,
    expect: "up",
    delta: 13,
    digits: 1,
  },
  {
    setting: "Unstable cores",
    target: "1–4 cores, 40+ tiles from the start: cores on the map",
    theme: "riverValley",
    values: ["off", "on"],
    apply: (s, v) => (s.settings.hazards.unstableCores = v as MapSpec["settings"]["hazards"]["unstableCores"]),
    metric: (m) => m.cores,
    expect: "up",
    delta: 1,
    digits: 1,
  },
  {
    setting: "Forest density",
    target: "trees per 10k tiles, size-aware (medium 1,061 at 100%, which the seed moves within the official maps' typical range, 980–1,240)",
    theme: "riverValley",
    values: ["50", "200"],
    apply: (s, v) => (s.settings.resources.forestDensity = num(v)),
    metric: (m) => m.treesPer10k,
    expect: "up",
    delta: 500,
  },
  {
    setting: "Grove size",
    target: "median grove 20 / 40 / 80 trees away from the start (a grove: trees within 2 tiles of each other; official median 40)",
    theme: "riverValley",
    values: ["scattered", "bigWoods"],
    apply: (s, v) => (s.settings.resources.groveSize = v as MapSpec["settings"]["resources"]["groveSize"]),
    metric: (m) => m.groveMedian,
    expect: "up",
    delta: 6,
    digits: 1,
  },
  {
    setting: "Species mix",
    target: "share of each species among the trees (here: Birch weight 0 vs 100, the rest 0)",
    theme: "riverValley",
    values: ["pine", "birch"],
    apply: (s, v) => (s.settings.resources.speciesMix = v === "birch" ? { pine: 0, birch: 100, oak: 0, succulent: 0 } : { pine: 100, birch: 0, oak: 0, succulent: 0 }),
    metric: (m) => m.species.birch,
    expect: "up",
    delta: 0.9,
    digits: 3,
  },
  {
    setting: "Berries near start",
    target: "living berry bushes within 20 tiles of the start",
    theme: "riverValley",
    values: ["20", "100"],
    apply: (s, v) => (s.settings.resources.berriesNearStart = num(v)),
    metric: (m) => m.bushesNearStart,
    expect: "up",
    delta: 30,
  },
  {
    setting: "Berry bushes elsewhere",
    target: "berry bushes per 10k tiles, size-aware (medium 92 at 100%, which the seed moves within the official maps' typical range, 90–98)",
    theme: "riverValley",
    values: ["50", "300"],
    apply: (s, v) => (s.settings.resources.berryBushes = num(v)),
    metric: (m) => m.bushesPer10k,
    expect: "up",
    delta: 80,
  },
  {
    setting: "Ruins and scrap",
    target: "scrap per 1k tiles, size-aware (medium 705 at 100%, which the seed moves within the official maps' typical range, 530–990)",
    theme: "riverValley",
    values: ["25", "300"],
    apply: (s, v) => (s.settings.resources.ruins = num(v)),
    metric: (m) => m.scrapPer1k,
    expect: "up",
    delta: 600,
  },
  {
    setting: "Relics",
    target: "0–3 small, 0–2 medium and 0–1 large relics, in their distance bands: relics on the map",
    theme: "riverValley",
    values: ["off", "some"],
    apply: (s, v) => (s.settings.resources.relics = v as MapSpec["settings"]["resources"]["relics"]),
    metric: (m) => m.relics,
    expect: "up",
    delta: 1,
    digits: 1,
  },
  {
    setting: "Geothermal fields",
    target: "1–3 fields per map, 30–120 tiles out, on flat dry ground: fields on the map",
    theme: "riverValley",
    values: ["off", "some"],
    apply: (s, v) => (s.settings.resources.geothermal = v as MapSpec["settings"]["resources"]["geothermal"]),
    metric: (m) => m.geothermal,
    expect: "up",
    delta: 0.9,
    digits: 1,
  },
  {
    setting: "Mine sites",
    target: "mine sites (UndergroundRuins) on flat ground 60+ tiles out: 1–4, at least one on every map",
    theme: "riverValley",
    values: ["1", "3"],
    apply: (s, v) => (s.settings.resources.mineSites = num(v)),
    metric: (m) => m.mines,
    expect: "up",
    delta: 1.5,
    digits: 1,
  },
  {
    setting: "Start area",
    target: "the start's bench: radius 5 / 6 / 8 (tiles at the start's level within 8)",
    theme: "riverValley",
    values: ["small", "large"],
    apply: (s, v) => (s.settings.start.area = v as MapSpec["settings"]["start"]["area"]),
    metric: (m) => m.benchTiles,
    expect: "up",
    delta: 60,
  },
  {
    setting: "Water without stairs",
    target: "tiles' walk over the map's own ground and slopes to a shore touching clean water a pump there reaches (D85, amended by D153)",
    theme: "riverValley",
    values: ["8", "20"],
    apply: (s, v) => (s.settings.start.rules.waterWithin = num(v)),
    metric: (m) => m.waterDistance,
    expect: "up",
    delta: 1.5,
    digits: 1,
  },
  {
    setting: "Minimum starting wood",
    target: "logs of the grown trees within 20 tiles' walk of the start (D164)",
    theme: "riverValley",
    values: ["40", "240"],
    apply: (s, v) => (s.settings.start.rules.woodWithin20 = num(v)),
    metric: (m) => m.woodNearStart,
    expect: "up",
    delta: 60,
  },
  {
    setting: "Minimum starting bushes",
    target: "living berry bushes within 20 tiles' walk of the start (D85)",
    theme: "riverValley",
    values: ["10", "80"],
    apply: (s, v) => {
      s.settings.start.rules.bushesWithin20 = num(v);
      s.settings.resources.berriesNearStart = 20;
    },
    metric: (m) => m.bushesNearStart,
    expect: "up",
    delta: 30,
  },
  {
    setting: "Start rules: no badwater within",
    target: "least distance from the start to badwater or contaminated soil",
    theme: "riverValley",
    values: ["15", "50"],
    apply: (s, v) => {
      s.settings.start.rules.badwaterWithin = num(v);
      s.settings.hazards.badwaterDistance = 15;
    },
    metric: (m) => (Number.isFinite(m.badwaterDistance) ? m.badwaterDistance : 200),
    expect: "up",
    delta: 15,
    digits: 1,
  },
  {
    setting: "Start rules: no ruins within",
    target: "distance from the start to the nearest ruin column",
    theme: "riverValley",
    values: ["5", "40"],
    apply: (s, v) => (s.settings.start.rules.ruinsWithin = num(v)),
    metric: (m) => (Number.isFinite(m.ruinsNearest) ? m.ruinsNearest : 200),
    expect: "up",
    delta: 15,
    digits: 1,
  },
  {
    setting: "Designed for",
    target: "stored water near the start (Easy needs 86 × the reserve, Hard 1,174 × it at 3 deep)",
    theme: "riverValley",
    values: ["easy", "hard"],
    apply: () => undefined,
    metric: (m) => Math.max(m.bestDam, m.natural),
    expect: "up",
    delta: 300,
  },
  {
    setting: "Theme",
    target: "water share (target River Valley 0.12, Lake Basin 0.30)",
    theme: "riverValley",
    values: ["riverValley", "lakeBasin"],
    apply: () => undefined,
    metric: (m) => m.waterShare,
    expect: "up",
    delta: 0.12,
    digits: 3,
  },
];

/** The spec of one run: the experiment's theme (or the value, for Theme and Designed for) at its
 *  preset, then the setting applied. */
export function specFor(e: Experiment, value: string, seed: number, size: number): MapSpec {
  const theme = e.setting === "Theme" ? (value as ThemeId) : e.theme;
  const designedFor = e.setting === "Designed for" ? (value as Difficulty) : (e.designedFor ?? "normal");
  const spec = makeSpec({ seed, size: { x: size, y: size }, theme, designedFor });
  e.apply(spec, value);
  return spec;
}

export interface Outcome {
  experiment: Experiment;
  means: [number, number];
  values: [number[], number[]];
  failed: number;
  ok: boolean;
  why: string;
}

export function runExperiment(e: Experiment, seeds: readonly number[], size: number): Outcome {
  const values: [number[], number[]] = [[], []];
  let failed = 0;
  for (let k = 0; k < 2; k++)
    for (const seed of seeds) {
      const spec = specFor(e, e.values[k], seed, size);
      const r = generate(spec);
      if (!r.report.passed) failed++;
      values[k].push(e.metric(measure(r), r.spec));
    }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const means: [number, number] = [mean(values[0]), mean(values[1])];
  let ok: boolean;
  let why: string;
  if (e.expect === "exact") {
    const bad: string[] = [];
    for (let k = 0; k < 2; k++) {
      const want = e.expected!(e.values[k], specFor(e, e.values[k], seeds[0], size));
      for (const v of values[k]) if (v !== want) bad.push(`${e.values[k]}: ${v} (want ${want})`);
    }
    ok = bad.length === 0;
    why = ok ? "every map equals its target" : bad.slice(0, 4).join("; ");
  } else {
    const d = e.expect === "up" ? means[1] - means[0] : means[0] - means[1];
    ok = d >= (e.delta ?? 0);
    why = `moved ${d.toFixed(e.digits ?? 0)} (at least ${e.delta})`;
  }
  return { experiment: e, means, values, failed, ok, why };
}
