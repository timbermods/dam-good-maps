// What a generated map measures against the targets its settings map to (PLAN §5, §6): the
// yardstick of the per-setting batch tests (ROADMAP M6) and of `tools/settings-batch.ts`. The
// terrain and water measures follow investigation/analyze_maps.py, so a generated map is measured
// the way the official maps were calibrated.

import type { EntitySpec } from "../format/entities";
import type { Feature, RiverFeature } from "../features/schema";
import { waterModel } from "../sim/model";
import { spillLevels } from "../sim/prefill";
import type { ValidationReport } from "../validate/report";
import type { PlayabilityAnalysis } from "../validate/playability";
import { components } from "./regions";

/** The calibration's wet depth (investigation/calibration.json `method.wet_depth`). */
const CAL_WET = 0.1;

export interface MapMetrics {
  /** Surface height p95 − p5, in levels (PLAN §5.2 Relief). */
  heightRange: number;
  /** Share of tiles with a 4-neighbour 2+ levels away (Relief). */
  cliffShare: number;
  /** Share of height steps between 4-neighbours that are one level (Terracing). */
  step1Share: number;
  /** Share of tiles whose 8 neighbours share their height (Buildable land). */
  flatShare: number;
  maxHeight: number;
  /** Dry tiles walkable from the start (the `start.reach` check). */
  reach: number;
  /** River features, and those entering on the map edge (Rivers). */
  rivers: number;
  edgeRivers: number;
  /** The main river's largest distance from its source–outlet line, as a share of the map side
   *  across it, and its length over that line (River style). */
  meander: number;
  sinuosity: number;
  /** Total strength of clean and of badwater sources, blocks per second (River flow, Badwater). */
  cleanStrength: number;
  badwaterStrength: number;
  badwaterSources: number;
  /** Natural basins of 20+ tiles: depressions that hold water without a dam (Lakes and basins). */
  basins20: number;
  /** Lake features of their own (not a planned reservoir). */
  lakes: number;
  /** Falls in the settled water (surface drop of 1.5 or more, 8-connected clusters) and river bed
   *  steps of 2+ levels (Waterfalls). */
  waterfalls: number;
  bedDrops2: number;
  waterShare: number;
  /** Stored water near the start: the best dam site within 40 tiles and the natural water kept
   *  through the drought (Drought reserve). */
  bestDam: number;
  bestDamDepth: number;
  natural: number;
  damSites: number;
  /** The start's distance to badwater or contaminated soil, and to pumpable clean water. */
  badwaterDistance: number;
  waterDistance: number;
  treesPer10k: number;
  livingShare: number;
  groveMedian: number;
  species: { pine: number; birch: number; oak: number; succulent: number };
  bushesNearStart: number;
  /** Living trees within 20 tiles' walk of the start, and starting wood: the logs of the grown
   *  trees there (D164). */
  treesNearStart: number;
  woodNearStart: number;
  bushesPer10k: number;
  scrapPer1k: number;
  ruinsNearest: number;
  /** Tiles of the start's bench: at the start's level within 8 tiles (Start area). */
  benchTiles: number;
  /** The map objects (Thorn belts, Unstable cores, Relics, Geothermal fields, Mine sites) and the
   *  water leaving by the map edge, as separate wet stretches of the border (River style: a braided
   *  river's delta has 2–4). */
  thorns: number;
  cores: number;
  relics: number;
  geothermal: number;
  mines: number;
  edgeExits: number;
}

export interface Measurable {
  features: readonly Feature[];
  built: {
    W: number;
    H: number;
    heights: Uint8Array;
    water: Float64Array;
    entities: readonly EntitySpec[];
    /** (with their tiles where known: a source's tile is not water leaving the map) */
    sources: readonly { strength: number; template: string; x?: number; y?: number }[];
    start?: { x: number; y: number; z: number };
  };
  report: ValidationReport;
  analysis: PlayabilityAnalysis | null;
}

/** p-th percentile with linear interpolation (numpy's default), truncated to an integer as
 *  analyze_maps.py does for the height range. */
function percentile(sorted: Uint8Array, p: number): number {
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

function checkValue(report: ValidationReport, id: string): number {
  const c = report.checks.find((r) => r.id === id);
  return typeof c?.value === "number" ? c.value : Infinity;
}

export function measure(m: Measurable): MapMetrics {
  const { W, H, heights: h, water } = m.built;
  const N = W * H;
  // ---- terrain
  const sorted = h.slice().sort();
  const heightRange = Math.trunc(percentile(sorted, 95) - percentile(sorted, 5));
  let cliff = 0;
  let flat = 0;
  let steps = 0;
  let steps1 = 0;
  let maxHeight = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      if (v > maxHeight) maxHeight = v;
      let isCliff = false;
      let isFlat = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const yy = Math.min(H - 1, Math.max(0, y + dy));
          const n = h[yy * W + xx];
          if (n !== v) isFlat = false;
          if ((!dx || !dy) && Math.abs(n - v) >= 2) isCliff = true;
        }
      if (isCliff) cliff++;
      if (isFlat) flat++;
      if (x + 1 < W) {
        const d = Math.abs(h[i + 1] - v);
        if (d > 0) {
          steps++;
          if (d === 1) steps1++;
        }
      }
      if (y + 1 < H) {
        const d = Math.abs(h[i + W] - v);
        if (d > 0) {
          steps++;
          if (d === 1) steps1++;
        }
      }
    }

  // ---- rivers
  const rivers = m.features.filter((f): f is RiverFeature => f.kind === "river");
  const edgeRivers = rivers.filter((r) => "edge" in r.params.entry).length;
  const main = rivers.find((r) => r.role === "river/main") ?? rivers[0];
  let meander = 0;
  let sinuosity = 1;
  if (main) {
    const p = main.params.path;
    const [ax, ay] = p[0];
    const [bx, by] = p[p.length - 1];
    const cl = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
    let len = 0;
    let dev = 0;
    for (let k = 0; k < p.length; k++) {
      const d = Math.abs((p[k][0] - ax) * (by - ay) - (p[k][1] - ay) * (bx - ax)) / cl;
      if (d > dev) dev = d;
      if (k > 0) len += Math.sqrt((p[k][0] - p[k - 1][0]) ** 2 + (p[k][1] - p[k - 1][1]) ** 2);
    }
    const across = Math.abs(bx - ax) >= Math.abs(by - ay) ? H : W;
    meander = dev / across;
    sinuosity = len / cl;
  }
  let bedDrops2 = 0;
  for (const r of rivers) for (const s of r.params.bedProfile.steps) if (s.drop >= 2) bedDrops2++;

  // ---- water
  let cleanStrength = 0;
  let badwaterStrength = 0;
  let badwaterSources = 0;
  for (const s of m.built.sources) {
    if (s.template === "BadwaterSource") {
      badwaterStrength += s.strength;
      badwaterSources++;
    } else cleanStrength += s.strength;
  }
  // natural basins: a priority flood of the terrain alone (analyze_maps.py `basins.count_ge20`)
  const spill = spillLevels(waterModel(W, H, h, []));
  const basin = new Uint8Array(N);
  for (let i = 0; i < N; i++) basin[i] = spill[i] > h[i] ? 1 : 0;
  const bs = components(basin, W, H, false);
  const basins20 = bs.sizes.filter((s) => s >= 20).length;
  // falls: neighbouring wet tiles whose surfaces differ by 1.5 or more (analyze_maps.py)
  const fall = new Uint8Array(N);
  let wet = 0;
  for (let i = 0; i < N; i++) {
    if (!(water[i] >= CAL_WET)) continue;
    wet++;
    const x = i % W;
    const y = (i - x) / W;
    const s = h[i] + water[i];
    const nb = [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1];
    for (const n of nb) if (n >= 0 && water[n] >= CAL_WET && s - (h[n] + water[n]) >= 1.5) fall[i] = 1;
  }
  const falls = components(fall, W, H, true).sizes.length;

  // ---- storage near the start
  const a = m.analysis;
  const bestDam = a?.bestDam?.volume ?? 0;
  const bestDamDepth = a?.bestDam ? a.bestDam.volume / Math.max(1, a.bestDam.area) : 0;

  // ---- resources
  let trees = 0;
  let living = 0;
  let bushes = 0;
  let scrap = 0;
  const sp = { pine: 0, birch: 0, oak: 0, succulent: 0 };
  let ruinsNearest = Infinity;
  const sd = a?.startDistance ?? null;
  for (const e of m.built.entities) {
    const t = e.template;
    if (t === "Pine" || t === "Birch" || t === "Oak" || t === "Succulent") {
      trees++;
      sp[t.toLowerCase() as keyof typeof sp]++;
      const lnr = e.components.LivingNaturalResource as { IsDead?: boolean } | undefined;
      if (!lnr?.IsDead) living++;
    } else if (t === "BlueberryBush") bushes++;
    else if (t.startsWith("RuinColumnH")) {
      scrap += 15 * Number(t.slice(11));
      if (sd && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H) ruinsNearest = Math.min(ruinsNearest, sd[e.y * W + e.x]);
    }
  }
  const groves = m.features.filter((f) => f.kind === "forest" && f.origin === "generated").map((f) => (f.kind === "forest" ? (f.params.groveSize ?? 0) : 0));
  groves.sort((p, q) => p - q);
  const groveMedian = groves.length ? groves[groves.length >> 1] : 0;

  // ---- the start's bench
  const benchTiles = m.built.start ? startBench(h, W, H, m.built.start) : 0;

  // ---- the water leaving by the map edge: separate wet stretches of the border, apart from the
  //      sources' own tiles (a river's mouth, each channel of a delta; from M9a a delta's channels
  //      are the land's, not features of their own)
  const source = new Uint8Array(N);
  for (const s of m.built.sources) if (s.x !== undefined && s.y !== undefined && s.x >= 0 && s.y >= 0 && s.x < W && s.y < H) source[s.y * W + s.x] = 1;
  const ring: number[] = [];
  for (let x = 0; x < W; x++) ring.push(x);
  for (let y = 1; y < H; y++) ring.push(y * W + W - 1);
  for (let x = W - 2; x >= 0; x--) ring.push((H - 1) * W + x);
  for (let y = H - 2; y >= 1; y--) ring.push(y * W);
  // (a stretch of two tiles or more: a single wet tile beside a river's mouth is its spill; the
  // water leaving is thin, since an edge tile passes all its water on each substep, so any depth
  // of 0.02 or more counts)
  const out = ring.map((i) => (water[i] >= 0.02 && !source[i] ? 1 : 0));
  let edgeExits = 0;
  const L = out.length;
  const k0 = out.findIndex((v) => v === 0);
  if (k0 < 0) edgeExits = 1;
  else
    for (let n = 0; n < L; ) {
      const k = (k0 + n) % L;
      if (!out[k]) {
        n++;
        continue;
      }
      let run = 0;
      while (n < L && out[(k0 + n) % L]) {
        run++;
        n++;
      }
      if (run >= 2) edgeExits++;
    }

  // ---- the 1.0 map objects (PLAN §5.4–5.5)
  const count = (re: RegExp) => m.built.entities.filter((e) => re.test(e.template)).length;
  const per10k = 1e4 / N;
  return {
    thorns: count(/^Thorns$/),
    cores: count(/^UnstableCore$/),
    relics: count(/^(Small|Medium|Large)Relic$/),
    geothermal: count(/^GeothermalField$/),
    mines: count(/^UndergroundRuins$/),
    edgeExits,
    heightRange,
    cliffShare: cliff / N,
    step1Share: steps ? steps1 / steps : 0,
    flatShare: flat / N,
    maxHeight,
    reach: checkValue(m.report, "start.reach"),
    rivers: rivers.length,
    edgeRivers,
    meander,
    sinuosity,
    cleanStrength,
    badwaterStrength,
    badwaterSources,
    basins20,
    lakes: m.features.filter((f) => f.kind === "lake" && !f.params.planned).length,
    waterfalls: falls,
    bedDrops2,
    waterShare: wet / N,
    bestDam,
    bestDamDepth,
    natural: a?.naturalStorage ?? 0,
    damSites: a?.damSites.length ?? 0,
    badwaterDistance: checkValue(m.report, "start.badwater"),
    waterDistance: a?.waterDistance ?? Infinity,
    treesPer10k: trees * per10k,
    livingShare: trees ? living / trees : 0,
    groveMedian,
    species: trees
      ? { pine: sp.pine / trees, birch: sp.birch / trees, oak: sp.oak / trees, succulent: sp.succulent / trees }
      : { pine: 0, birch: 0, oak: 0, succulent: 0 },
    bushesNearStart: checkValue(m.report, "start.food"),
    treesNearStart: a ? a.treesNear : Infinity,
    woodNearStart: checkValue(m.report, "start.wood"),
    bushesPer10k: bushes * per10k,
    scrapPer1k: (scrap * 1e3) / N,
    ruinsNearest,
    benchTiles,
  };
}

/** The start's bench (Start area, a preference since D211; the map card shows it): tiles at the
 *  district center's level within 8 tiles of its middle. */
export function startBench(h: ArrayLike<number>, W: number, H: number, st: { x: number; y: number; z: number }): number {
  let n = 0;
  for (let y = st.y - 8; y <= st.y + 8; y++)
    for (let x = st.x - 8; x <= st.x + 8; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if ((x - st.x) * (x - st.x) + (y - st.y) * (y - st.y) <= 64 && h[y * W + x] === st.z) n++;
    }
  return n;
}
