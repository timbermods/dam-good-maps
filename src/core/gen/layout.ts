// What every theme's planner shares (PLAN §5, §7.2–7.4): the settings turned into layout targets,
// terrace bands drawn from the terracing setting and fitted to the relief, the bed profile of a
// river with its falls, and the relief fit that checks the built terrain against its target.

import { buildTerrain } from "../features/build";
import type { Feature, TerraceBand } from "../features/schema";
import { round } from "../features/geometry";
import type { Rng } from "../math/rng";
import type { Difficulty, MapSpec } from "../spec/mapspec";
import { badwaterBudget } from "../resources/badwater";
import { density, LAKES, RESERVE, RIVER_FLOW_MULTIPLIER } from "./calibrated";

export { LAKES, RESERVE };

export interface LayoutTargets {
  W: number;
  H: number;
  /** Highest terrain (PLAN §5.2): nothing is built above it. */
  top: number;
  /** Surface height range p5–p95 the relief asks for: 7 + 0.08·relief, within what `top` allows. */
  range: number;
  /** Share of terrace rises that are one level (Terracing): 0.86 − 0.0059·terracing. */
  p1: number;
  /** Buildable land: the valley floor's half-width (× the side across the flow; a canyon's drawn
   *  floor × `canyon`, Tight being Canyon's preset), the wiggle of band edges in tiles, how jagged they are (the fine wiggle ×
   *  the wiggle, and its cell in tiles, `grain`), and where the cliffs go among the terrace rises (early: the first rise, at the
   *  valley floor's edge, so the start's walkable land ends there; late: after every one-level
   *  rise). */
  land: { floor: number; canyon: number; wobble: number; jag: number; grain: number; cliffs: CliffOrder };
  /** Meander amplitude as a share of the side across the flow (River style). */
  meander: number;
  /** Total river flow in blocks per second (River flow): the size-aware official median × the
   *  multiplier. */
  flow: number;
  /** Rivers entering on the map edge (Rivers). */
  rivers: number;
  waterfalls: MapSpec["settings"]["water"]["waterfalls"];
  /** Natural basins of 20+ tiles to aim for (Lakes and basins). */
  basins: number;
  reserve: number;
  difficulty: Difficulty;
  /** Badwater sources and each one's strength (resources/badwater.ts `badwaterBudget`: the official
   *  maps' by size, moved by the seed, scaled by the Badwater setting; none with No badwater, D200),
   *  and the least distance from the start (Badwater distance). */
  badwater: { sources: number; strength: number };
  badwaterDistance: number;
}

/** Where the terraces' cliffs (rises of 2+ levels) go among the drawn rises: the same rises in
 *  another order, so the terracing's one-level share stays. */
export type CliffOrder = "early" | "drawn" | "late";

const LAND = {
  tight: { floor: 0.16, canyon: 1, wobble: 4.2, jag: 0.9, grain: 5, cliffs: "early" },
  normal: { floor: 0.2, canyon: 1.1, wobble: 3.2, jag: 0.3, grain: 8, cliffs: "drawn" },
  generous: { floor: 0.25, canyon: 1.25, wobble: 2.2, jag: 0.15, grain: 8, cliffs: "late" },
} as const satisfies Record<string, LayoutTargets["land"]>;

/** Meander amplitudes (PLAN §5.3): straight ≤ 0.05·H, meandering 0.12–0.2·H. Braided rivers are
 *  the Delta's (roadmap M7): until then they meander. */
export const MEANDER = { straight: 0.03, meandering: 0.16, braided: 0.16 } as const;

export function layoutTargets(spec: MapSpec): LayoutTargets {
  const s = spec.settings;
  const W = spec.size.x;
  const H = spec.size.y;
  const area = W * H;
  const top = Math.min(16, s.terrain.highestTerrain);
  const flow = round(density("water_strength_per_10k", area) * (area / 1e4) * RIVER_FLOW_MULTIPLIER[s.water.riverFlow], 2);
  return {
    W,
    H,
    top,
    range: Math.max(3, Math.min(top - 1, Math.round(7 + 0.08 * s.terrain.relief))),
    p1: 0.86 - 0.0059 * s.terrain.terracing,
    land: LAND[s.terrain.buildableLand],
    meander: MEANDER[s.water.riverStyle],
    flow,
    rivers: s.water.rivers,
    waterfalls: s.water.waterfalls,
    basins: Math.round(LAKES[s.water.lakes] * density("basins_ge20", area)),
    reserve: RESERVE[s.water.droughtReserve],
    difficulty: spec.designedFor,
    badwater: (({ sources, strength }) => ({ sources, strength }))(badwaterBudget(W, H, s.hazards.badwater, spec.seed)),
    badwaterDistance: Math.max(s.hazards.badwaterDistance, s.start.rules.badwaterWithin),
  };
}

// ------------------------------------------------------------------------------------ terraces

/** Rises and width factors drawn once per layout, so fitting the relief never draws again. */
export interface BandDraws {
  rises: number[];
  widths: number[];
}

/** Band rises: one level with probability p1 (the terracing), otherwise a cliff of 2 (70%) or 3. */
export function drawBands(rng: Rng, p1: number, n = 32): BandDraws {
  const rises: number[] = [];
  const widths: number[] = [];
  for (let k = 0; k < n; k++) {
    rises.push(rng.float() < p1 ? 1 : rng.float() < 0.7 ? 2 : 3);
    widths.push(rng.range(0.7, 1.3));
  }
  return { rises, widths };
}

/** The bands that rise `lift` levels: the drawn rises in order (the last one cut to fit), spaced
 *  so the top is reached `span` tiles past the valley floor's edge. `first` forces the first rise
 *  (a canyon's wall, a Hard basin's cliff), and `ones` one-level rises after it. `cliffs` reorders
 *  the drawn rises (Buildable land): "early" moves the first cliff to the first of them, "late"
 *  puts every cliff after the one-level rises. */
export function bandsFor(d: BandDraws, lift: number, span: number, first?: number, ones = 0, cliffs: CliffOrder = "drawn"): TerraceBand[] {
  const rises: number[] = [];
  let sum = 0;
  if (first !== undefined && lift > 0) {
    rises.push(Math.min(first, lift));
    sum = rises[0];
  }
  // `ones` one-level rises next (a canyon's rim terraces, joined to its wall's top by slopes)
  for (let k = 0; k < ones && sum < lift; k++) {
    rises.push(1);
    sum++;
  }
  for (let k = 0; sum < lift && k < d.rises.length; k++) {
    const r = Math.min(d.rises[k], lift - sum);
    rises.push(r);
    sum += r;
  }
  if (sum < lift) rises.push(lift - sum);
  const fixed = (first !== undefined && lift > 0 ? 1 : 0) + ones;
  if (cliffs === "late") {
    const free = rises.slice(fixed);
    let k = fixed;
    for (const r of free) if (r === 1) rises[k++] = r;
    for (const r of free) if (r > 1) rises[k++] = r;
  } else if (cliffs === "early") {
    let j = fixed;
    while (j < rises.length && rises[j] === 1) j++;
    // the first cliff becomes the first drawn rise, at the valley floor's edge
    if (j < rises.length && j > fixed) {
      const r = rises[j];
      for (let k = j; k > fixed; k--) rises[k] = rises[k - 1];
      rises[fixed] = r;
    }
  }
  const n = rises.length;
  let weight = 0;
  for (let k = 0; k < n; k++) weight += d.widths[k % d.widths.length];
  const unit = n ? span / weight : 0;
  const out: TerraceBand[] = [];
  let at = 0;
  for (let k = 0; k < n; k++) {
    out.push({ at: round(at, 2), rise: rises[k] });
    at += unit * d.widths[k % d.widths.length];
  }
  return out;
}

// ------------------------------------------------------------------------------------ the relief

/** Surface height p95 − p5 (numpy's linear percentile, truncated, as analyze_maps.py measures it). */
export function heightRange(h: Uint8Array): number {
  const counts = new Int32Array(24);
  for (let i = 0; i < h.length; i++) counts[h[i]]++;
  const at = (p: number) => {
    const pos = (p / 100) * (h.length - 1);
    const lo = Math.floor(pos);
    const a = valueAt(counts, lo);
    const b = valueAt(counts, Math.min(h.length - 1, lo + 1));
    return a + (pos - lo) * (b - a);
  };
  return Math.trunc(at(95) - at(5));
}

function valueAt(counts: Int32Array, rank: number): number {
  let acc = 0;
  for (let v = 0; v < counts.length; v++) {
    acc += counts[v];
    if (rank < acc) return v;
  }
  return counts.length - 1;
}

/** The relief fit (PLAN §7.4 step 4): build the layout's terrain for a level offset, measure its
 *  height range, and move the offset toward the target, at most `tries` builds. Returns the
 *  layout with the best range (the first on a tie). */
export function fitRelief<T extends { features: Feature[] }>(
  make: (shift: number) => T | null,
  target: number,
  W: number,
  H: number,
  seed: number,
  limits: { min: number; max: number },
  tries = 3,
): T | null {
  let best: { layout: T; err: number } | null = null;
  let shift = 0;
  const seen = new Set<number>();
  for (let k = 0; k < tries && !seen.has(shift); k++) {
    seen.add(shift);
    const layout = make(shift);
    if (!layout) break;
    const range = heightRange(buildTerrain({ W, H, seed, features: layout.features }).heights);
    const err = range - target;
    if (!best || Math.abs(err) < Math.abs(best.err)) best = { layout, err };
    if (Math.abs(err) <= 1) break;
    // a range too large lifts the low ground (a positive shift); too small lowers it
    const next = Math.min(limits.max, Math.max(limits.min, shift + err));
    if (next === shift) break;
    shift = next;
  }
  return best?.layout ?? null;
}

// ------------------------------------------------------------------------------------ falls

/** How many falls (bed steps of 2+ levels) the Waterfalls setting asks for on the main river, and
 *  how many 1-level steps stand in for them when it is off (PLAN §5.3: 0 / 1–2 / 3–6). */
export function fallCount(t: LayoutTargets, rng: Rng, room: number): number {
  if (t.waterfalls === "off") return 0;
  if (t.waterfalls === "few") return 2;
  return Math.min(room, 3 + rng.int(0, 4));
}
