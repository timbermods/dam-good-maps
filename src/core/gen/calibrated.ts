// Calibrated targets (PLAN §4, §5): the TypeScript side of prototype/calibrated.py. The numbers come
// from investigation/calibration.json; tests/contract/calibrated.test.ts asserts the two agree.

/** Official size-class medians, interpolated in log(area) (PLAN §5 "size-aware"). The resource rows
 *  (scrap, trees, bushes, ruin field columns) are investigation/official-baselines.json's class
 *  medians: Nomads and Oasis left out (Kyler), and the clear outliers of each rate (Beaverome's trees,
 *  Lakes' bushes). */
export const SIZE_ANCHORS = [3750, 16384, 36864, 65536] as const;
export const DENSITY = {
  scrap_per_1k_tiles: [840, 705, 236, 235],
  trees_per_10k: [1715, 1061, 544, 559],
  bushes_per_10k: [265, 92, 40, 44],
  water_strength_per_10k: [5.0, 2.2, 1.2, 1.1],
  ruin_field_columns: [19, 32, 39, 42],
  /** Natural basins of 20+ tiles per map (analyze_maps.py `basins.count_ge20`; PLAN §5.3 Lakes and
   *  basins): the official size-class medians. */
  basins_ge20: [1.5, 4, 15.5, 15],
} as const;
export type DensityKey = keyof typeof DENSITY;

/** log(area) interpolation without Math.log: ln(a) − ln(b) = ln(a/b), and the anchors are fixed,
 *  so the interpolation weight is computed from a deterministic ln of a ratio. */
export function density(key: DensityKey, area: number): number {
  const ys = DENSITY[key];
  const a = Math.max(area, 1);
  if (a <= SIZE_ANCHORS[0]) return ys[0];
  for (let i = 1; i < SIZE_ANCHORS.length; i++) {
    if (a <= SIZE_ANCHORS[i]) {
      const t = lnDet(a / SIZE_ANCHORS[i - 1]) / lnDet(SIZE_ANCHORS[i] / SIZE_ANCHORS[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

/** Natural log for x in [1, 64] by halving to [1, 2) and the atanh series (basic operations only). */
export function lnDet(x: number): number {
  if (x <= 0) throw new Error("lnDet of a non-positive number");
  let k = 0;
  while (x >= 2) {
    x /= 2;
    k++;
  }
  while (x < 1) {
    x *= 2;
    k--;
  }
  const z = (x - 1) / (x + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let n = 1; n < 60; n += 2) {
    sum += term / n;
    term *= z2;
  }
  return 2 * sum + k * 0.6931471805599453;
}

/** Official ruin column height shares H1…H8 (official-baselines.json `ruins.storeys`, Nomads and
 *  Oasis left out). */
export const RUIN_HEIGHT_SHARES = [0.284, 0.221, 0.163, 0.1, 0.084, 0.06, 0.038, 0.05];

/** How far official maps of one size spread around their size's median: the 25th and 75th
 *  percentile factors (official-baselines.json `rates.*.factors`, measured on the large and max
 *  maps, five or six of each). A map's amount lands between them: its typical range. */
export const SPREAD = {
  trees: [0.923, 1.171],
  bushes: [0.977, 1.07],
  scrap: [0.752, 1.407],
} as const;

/** The official median and typical range (25th to 75th percentile) of a resource at a map's size:
 *  trees, berry bushes, or scrap. */
export function officialRange(kind: "trees" | "bushes" | "scrap", area: number): { median: number; low: number; high: number } {
  const median = kind === "trees" ? (density("trees_per_10k", area) * area) / 1e4 : kind === "bushes" ? (density("bushes_per_10k", area) * area) / 1e4 : (density("scrap_per_1k_tiles", area) * area) / 1e3;
  const [lo, hi] = SPREAD[kind];
  return { median, low: median * lo, high: median * hi };
}

/** How the official maps lay out their resources (official-baselines.json; Kyler's "Resources like
 *  the official maps", 2026-09-25). Groves are trees within 2 tiles of each other, patches bushes
 *  within 2 tiles, fields ruin columns that touch. */
export const OFFICIAL_LAYOUT = {
  /** Share of all trees alive: 25th and 75th percentiles (about two thirds of pines, birches and
   *  oaks are stored dead). */
  livingShare: [0.267, 0.434],
  /** Trees per grove: median, log-normal spread and cap (median 40; 25th 18, 75th 81; the largest
   *  grove of a map about 212). */
  grove: { median: 40, sigma: 0.9, cap: 250 },
  /** Mean share of a grove tree's eight neighbours that hold a tree. */
  groveFill: 0.41,
  /** Living trees on at most this share of moist land (official 25th–75th 0.13–0.19, 90th 0.21). */
  moistCover: 0.25,
  /** Bushes per patch: median, spread and cap (median 46; 25th 35, 75th 58; the largest about 64). */
  patch: { median: 44, sigma: 0.3, cap: 80 },
  /** Mean share of a patch bush's eight neighbours that hold a bush. */
  patchFill: 0.63,
  /** Bushes stand this near water (median 4 tiles). */
  patchWater: 4,
  /** Model variants A–E: A a little more often than the rest. */
  ruinVariants: { A: 0.261, B: 0.188, C: 0.185, D: 0.182, E: 0.184 },
  /** Ruin orientations: mostly as the editor places them, Cw0. */
  ruinOrientations: { Cw0: 0.593, Cw90: 0.139, Cw180: 0.098, Cw270: 0.17 },
  /** A field's columns fill this share of their bounding box (25th 0.50, 75th 0.64). */
  fieldFill: 0.56,
  /** Mean storeys per field: 10th and 90th percentiles (some fields short, some tall). */
  fieldMeanStoreys: [2.19, 3.88],
} as const;

export const RUINS = {
  singlesShare: 0.05,
  centerBias: 0.35,
  holeShare: 0.05,
  compactness: 2 as const,
  minStartDist: 22, // official nearest ruin to the start: p10 22
  minFieldSpacing: 18,
  sizeFactors: [0.6, 0.8, 1.0, 1.2, 1.5, 1.9],
};

export const FOREST = {
  livingShare: 0.4,
  youngShare: 0.35,
  grove: { scattered: { median: 6, cap: 120 }, normal: { median: 10, cap: 180 }, bigWoods: { median: 20, cap: 300 } },
  nearStart: { radius: 18, minLiving: 40 },
};

export const BUSHES = {
  patchMedian: 20,
  nearStartRadius: 16,
};

export const RIVER_FLOW_MULTIPLIER = { trickle: 0.6, normal: 1, strong: 2, lush: 4 } as const;

/** The strongest river an official map has, blocks of water per second: about its whole water
 *  (water_strength_per_10k × area, about 7 on 256²). A drawn river may be stronger, and says so. */
export const OFFICIAL_FLOW = 8;

/** Badwater-to-clean strength ratio by the Badwater setting (PLAN §5.4; official median 0.65). */
export const BADWATER_RATIO = { off: 0, low: 0.3, normal: 0.65, high: 1.2 } as const;

/** Drought reserve multipliers (PLAN §5.3). */
export const RESERVE = { scarce: 1, normal: 1.5, plenty: 3 } as const;
/** Lakes and basins: multipliers on the official natural-basin median for the size (PLAN §5.3). */
export const LAKES = { none: 0, few: 0.5, some: 1, many: 2 } as const;

/** Stored water a colony needs through the worst drought (PLAN §11.4). */
export const DROUGHT = {
  easy: { days: 4, colony: 40 },
  normal: { days: 9, colony: 50 },
  hard: { days: 30, colony: 50 },
} as const;

export function reservoirNeeded(d: keyof typeof DROUGHT): number {
  const { days, colony } = DROUGHT[d];
  const span = days + 0.5;
  const drink = colony * 0.424 * span;
  return Math.round(drink + (drink / 2) * 0.0535 * span);
}

/** Reachable land for Buildable land = Tight / Normal / Generous (PLAN §5.2). */
export const REACH_MIN = { tight: 750, normal: 1300, generous: 2500 } as const;
