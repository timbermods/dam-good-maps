// A map's resource amounts (Kyler's "Resources like the official maps", 2026-09-25): the official
// median for its size (the calibration table, investigation/official-baselines.json), moved within
// the official maps' typical range (their 25th to 75th percentile) by the seed, so maps differ, then
// scaled by its setting (Forests, Berries, Ruins). Light enough for the settings panel;
// resources/baseline.ts places them.

import { lnDet, officialRange, OFFICIAL_LAYOUT as L } from "../gen/calibrated";
import { expDet } from "../math/detmath";
import { stream } from "../math/rng";
import type { Settings } from "../spec/mapspec";

export { officialRange };

/** The settings the baseline reads: the Resources group of a map's settings. */
export type ResourceSettings = Pick<Settings["resources"], "forestDensity" | "berryBushes" | "ruins" | "mineSites" | "groveSize" | "speciesMix">;

export interface ResourceBudget {
  area: number;
  /** Trees in all, and how many of them alive (the rest stored dead on dry ground, or succulents). */
  trees: number;
  living: number;
  bushes: number;
  scrap: number;
  mineSites: number;
  /** Where the seed put this map within the official typical range: 0 at its 25th percentile, 1 at
   *  its 75th. */
  place: { trees: number; bushes: number; scrap: number; living: number };
  /** The official maps' typical range at this size (their 25th to 75th percentile), at 100%. */
  official: { trees: [number, number]; bushes: [number, number]; scrap: [number, number] };
}

/** Between lo and hi at t in [0, 1], evenly in ln (a ratio, so a factor of the median). */
function between(lo: number, hi: number, t: number): number {
  return lo * expDet(t * lnDet(hi / lo));
}

/** A map's resource amounts for its size and settings (see the file's header). The seed alone moves
 *  them within the typical range, so a map keeps its amounts whatever attempt the generator took. */
export function resourceBudget(W: number, H: number, s: ResourceSettings, seed: number): ResourceBudget {
  const area = W * H;
  const rng = stream(seed, "resources", "budget");
  const u = { trees: rng.float(), bushes: rng.float(), scrap: rng.float(), living: rng.float() };
  const t = officialRange("trees", area);
  const b = officialRange("bushes", area);
  const r = officialRange("scrap", area);
  const trees = Math.round(between(t.low, t.high, u.trees) * (s.forestDensity / 100));
  const living = Math.round(trees * (L.livingShare[0] + (L.livingShare[1] - L.livingShare[0]) * u.living));
  return {
    area,
    trees,
    living,
    bushes: Math.round(between(b.low, b.high, u.bushes) * (s.berryBushes / 100)),
    scrap: Math.round(between(r.low, r.high, u.scrap) * (s.ruins / 100)),
    mineSites: Math.max(1, Math.min(4, Math.round(s.mineSites))),
    place: u,
    official: { trees: [t.low, t.high], bushes: [b.low, b.high], scrap: [r.low, r.high] },
  };
}

