// Stage 4, the ladder (docs/PREMISES.md §2.2 stage 4, §4.2): each of the plan's works as a template on the land
// stages 1 and 2 built for it — its site (the tiles the player clears or builds on), what it does there, and what it
// buys, estimated without a settle. The water a work adds is known by number: `flowThrough` on the land with the work
// done and the works it needs (`prefillFrom`'s depths, each pond standing a head over its spill), against the same
// without it; the green is that water's reach by the game's soil rule (`soilReach`, a breadth-first reach checked
// against `sim/moisture.ts` `moisture`), counted in the work's own window. A reservoir work (a breach mended, a notch
// plugged, a raised sill, the megadam) holds water: its tile-levels by the same flow.
//
// The ground each kind needs is stage 2's (`raster/relief.ts`): a dry bed two deep with its bench at bed + 2 (a dam
// to pond, a notch's thread), an empty basin's beach at its sill + 1 under a bank (a levee), rows of Blockages that
// span their beds (`water.ts` `spanRow`). `layWorks` lays what the works themselves put on the land on day 1: a
// levee's basin banked, a dam's narrows and the pan behind it, a notch shut by a rock plug instead of Blockages where
// `NOTCH_SHUT` says so.

import { tilesToRuns, type Runs } from "../math/grid";
import { clusterSaturation } from "../sim/moisture";
import { flowThrough, prefillFrom } from "../sim/prefill";
import { designLevel } from "./levels";
import { near4, type WaterRaster } from "./raster/field";
import { pathLength, pointAt } from "./geom";
import type { PremisePlan, Point, Work, WorkKind, WorkRung } from "./types";
import { stageModel, type StageWater } from "./water";

/** How a notch is shut on day 1 (D513 (3), PREMISES §9 ruling 5): a row of Blockages the player clears, or, should
 *  clearing a Blockage prove no small work in the game, a rock plug a level high and two tiles thick the player digs
 *  out. One switch: `layWorks` lays the plug and `premiseMap` then places no Blockages on the notch. */
export const NOTCH_SHUT: "blockages" | "plug" = "blockages";

/** The head a pond stands over the spill it pours over (the settle: 0.05 to 0.6), so its ceiled surface is the
 *  soil's next level. */
const HEAD = 0.1;
/** The soil's furthest reach (2 × a full cluster's saturation of 8), and one tile more. */
const REACH = 17;
/** Depths that differ by less than this are the same water. */
const SAME = 0.02;

export interface WorkSite {
  id: string;
  kind: WorkKind;
  rung: WorkRung;
  on: string;
  region: string;
  /** The tiles the player clears or builds on. */
  tiles: number[];
  /** Clears a row of Blockages, digs out a plug, or builds (a dam, a levee) to `level`. */
  does: "clear" | "dig" | "build";
  level?: number;
  needs: string[];
  /** By number: tiles it turns green or wet, of them new water, and water it holds (tile-levels). */
  green: number;
  wet: number;
  reservoir: number;
  /** The tiles it turns green or wet, as runs (the ladder's readout shows them, §8). */
  reach: Runs;
  /** What stage 0's second pass estimated it buys where it sited it (`Work.estimate`), beside the measure (`green`). */
  estimate?: number;
  /** Its measure at or over the plan's floor (`gives`: green, or water held for a reservoir work). A floor, not a band
   *  (§4.2): what the ladder promises a player is that the work is worth building, so paying more is fine. */
  paid: boolean;
  /** Why it stands short, in one line, when it does. */
  note?: string;
}

export interface Ladder {
  works: WorkSite[];
  /** Day 1 by number: shares of the map's tiles that are water and moist ground (`spectrum`). */
  day1: { water: number; moist: number };
  /** The small irrigation works' and all works' green together, shares of the map. */
  small: number;
  together: number;
}

/** Day 1's shares by `spectrum` (§4.4): water 15 to 25 % of the map's tiles, moist ground 30 to 42 %. The moist
 *  ceiling by number stands `SPECTRUM_MARGIN` under 42, since the settle's share differs from the number's by up to a
 *  point (§2.2, "As built (step 5)"). */
export const SPECTRUM = { water: [0.15, 0.25], moist: [0.3, 0.42] } as const;
export const SPECTRUM_MARGIN = 0.01;

/** Why day 1 by number stands outside `spectrum`, in one line, or null: a plan whose map would be handed over too
 *  watered (or too dry) is drawn again before its settle (§2.2 stage 4). */
export function spectrumMiss(day1: Ladder["day1"]): string | null {
  const pc = (v: number) => `${(100 * v).toFixed(1)} %`;
  const { water, moist } = SPECTRUM;
  if (day1.water < water[0] || day1.water > water[1]) return `Day 1's water is ${pc(day1.water)} of the map (15 to 25 %)`;
  if (day1.moist > moist[1] - SPECTRUM_MARGIN) return `Day 1's moist ground is ${pc(day1.moist)} of the map (41 % at most by number, 42 % settled)`;
  if (day1.moist < moist[0]) return `Day 1's moist ground is ${pc(day1.moist)} of the map (30 % at least)`;
  return null;
}

/** What the works put on the land on day 1, beside stages 1 and 2: the rock plugs (`NOTCH_SHUT`), by link. */
export interface LaidWorks {
  plugs: Record<string, number[]>;
  /** Each levee's basin's banks (`bankBasin`): the tiles raised a level over its beach, by the levee's work id. */
  banks: Record<string, number[]>;
}

/** A channel's tiles across, `s` to `s + 1` along it. */
function band(r: WaterRaster, li: number, s: number, width = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li + 1 && r.along[i] >= s && r.along[i] < s + width) out.push(i);
  return out;
}

/** How far a megadam's wall may run each way from its slot to the gorge's shoulders, in tiles. */
const WALL_REACH = 48;

/** A wall across a channel at the point nearest `at`, square to its path: the tiles under `level` out to the first
 *  ground at `level` or over on each side (the shoulders), two tiles thick so no corner leaks; none where a side runs
 *  `WALL_REACH` tiles without a shoulder. */
function wallAcross(path: readonly Point[], at: [number, number], heights: Uint8Array, W: number, H: number, level: number): number[] {
  if (path.length < 2) return [];
  const len = pathLength(path);
  let best = Infinity;
  let s0 = 0;
  for (let s = 0; s <= len; s += 0.25) {
    const p = pointAt(path, s).p;
    const d = (p[0] - at[0]) * (p[0] - at[0]) + (p[1] - at[1]) * (p[1] - at[1]);
    if (d < best) [best, s0] = [d, s];
  }
  const out = new Set<number>();
  for (const ds of [0, 0.7]) {
    const { p, dir } = pointAt(path, s0 + ds);
    const n: Point = [-dir[1], dir[0]];
    for (const side of [1, -1]) {
      let met = false;
      for (let k = 0; k <= WALL_REACH; k += 0.5) {
        const x = Math.floor(p[0] + n[0] * k * side);
        const y = Math.floor(p[1] + n[1] * k * side);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const i = y * W + x;
        if (heights[i] >= level) {
          met = true;
          break;
        }
        out.add(i);
      }
      if (!met) return [];
    }
  }
  return [...out];
}

/** How far along a channel its own first tiles stand (past the body it leaves). */
function firstAlong(r: WaterRaster, li: number): number {
  let first = Infinity;
  for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li + 1 && r.along[i] < first) first = r.along[i];
  return first;
}

/** An empty basin's beach for its levee (§4.2), tiles past its outline. */
const BEACH = 3;

/** Lays the works' own ground on stage 2's: each levee's basin banked (`bankBasin`), each dam to pond's narrows and
 *  pan (`narrowsGround`), and a notch shut by a rock plug two tiles thick a level over its bed (its row and the band
 *  below it) where `NOTCH_SHUT` says so. */
export function layWorks(plan: PremisePlan, w: StageWater, heights: Uint8Array): LaidWorks {
  const plugs: Record<string, number[]> = {};
  const banks: Record<string, number[]> = {};
  const r = w.raster;
  for (const work of plan.works) {
    if (work.kind !== "levee" || work.rung === "first") continue;
    const bi = plan.bodies.findIndex((b) => b.id === work.on);
    const si = plan.links.findIndex((l) => l.from === work.on && l.id.startsWith("spill"));
    if (bi >= 0 && si >= 0) banks[work.id] = bankBasin(plan, r, heights, bi, si);
  }
  // each dam to pond's narrows and pan (`narrowsGround`), where its bed has room for one, never on ground stage 1
  // fixed (its guard and shores stand as laid, §2.2 stage 2)
  const { x: sx, y: sy } = plan.frame.start;
  const free = (i: number) => {
    const x = i % r.W;
    const y = (i - x) / r.W;
    return !r.lake[i] && !r.channel[i] && !r.crest[i] && !r.pool[i] && !r.ribbon[i] && !r.fixed[i] && (Math.abs(x - sx) > 3 || Math.abs(y - sy) > 3);
  };
  for (const work of plan.works) {
    if (work.kind !== "damToPond") continue;
    const li = plan.links.findIndex((l) => l.id === work.on);
    if (li < 0) continue;
    const at = nearestAlong(r, li, work.at);
    const first = firstAlong(r, li);
    const back = Math.min(NARROWS.back, Math.floor(at - first) - NARROWS.off);
    if (back < NARROWS.least) continue;
    const dam = band(r, li, at - 0.5);
    if (!dam.length) continue;
    const b = Math.min(...dam.map((i) => heights[i]));
    const bed: [number, number][] = [];
    for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li + 1) bed.push([i, r.along[i]]);
    const lay = narrowsFit(bed, at, b, r.W, r.H, (i) => heights[i], free, back);
    if (lay) for (const [i, v] of lay.ground) heights[i] = v;
  }
  if (NOTCH_SHUT !== "plug") return { plugs, banks };
  for (const work of plan.works) {
    if (work.kind !== "notch") continue;
    const li = plan.links.findIndex((l) => l.id === work.on);
    const row = r.rows[work.on]?.[0];
    if (li < 0 || !row?.length) continue;
    let end = -Infinity;
    for (const i of row) end = Math.max(end, r.along[i]);
    const tiles = [...row, ...band(r, li, end + 0.5)];
    for (const i of tiles) heights[i] += 1;
    plugs[work.on] = tiles;
  }
  return { plugs, banks };
}

/** A levee's site (§4.2): its basin's spill bed across its first tiles, where it stands under the basin's sill + 1. */
function leveeBand(r: WaterRaster, heights: ArrayLike<number>, si: number, sill: number): number[] {
  return band(r, si, firstAlong(r, si), LEVEE_BAND).filter((i) => heights[i] < sill + 1);
}
/** How far along its spill bed a levee spans. */
const LEVEE_BAND = 1.5;

/** A levee's basin (§4.2: "a beach at its sill + 1 and a rim over the beach"): the beach is the ground at its sill + 1
 *  or under it within `BEACH` tiles of its water, and the ground just past the beach stands a level over it, but for
 *  its spill bed, where the levee goes; so the water a levee holds rises over the beach and leaves only over the levee,
 *  down the bed. The water a levee holds backs up the beds that feed the basin (a notch's bed, a leat) as far as they
 *  stand at its sill + 1 or under: their banks there stand a level over the beach too (a dry bed's wadi, a level over
 *  its bed, let the levee's water out over it). The ground beside the levee and beside the spill bed below it, where
 *  the beach meets them, stands a level over the beach too: the levee's ends meet the bank, and the held water finds no
 *  way round it. Stage 2's envelope lets a lower valley's floor meet the beach: that ground is raised. Every water and
 *  every bed stand. */
function bankBasin(plan: PremisePlan, r: WaterRaster, heights: Uint8Array, bi: number, si: number): number[] {
  const { W, H } = r;
  const N = W * H;
  const sill = plan.bodies[bi].sill;
  const d = new Int16Array(N).fill(-1);
  let q: number[] = [];
  for (let i = 0; i < N; i++)
    if (r.lake[i] === bi + 1) {
      d[i] = 0;
      q.push(i);
    }
  const levee = firstAlong(r, si) + LEVEE_BAND;
  const site = leveeBand(r, heights, si, sill);
  const id = plan.bodies[bi].id;
  const feeds = (li: number) => plan.links[li].to === id;
  const nb = new Int32Array(4);
  const nb2 = new Int32Array(4);
  // (a tile beside the spill bed below the levee, or beside the levee, is where held water would go round it)
  const bySpill = (j: number) => {
    near4(W, H, j, nb2);
    for (const k of nb2) if (k >= 0 && r.channel[k] === si + 1) return true;
    return false;
  };
  const held: number[] = [];
  const raise: number[] = [];
  for (let k = 1; q.length; k++) {
    const next: number[] = [];
    for (const c of q) {
      near4(W, H, c, nb);
      for (const j of nb) {
        if (j < 0 || d[j] >= 0 || r.lake[j] || r.crest[j] || heights[j] > sill + 1) continue;
        if (r.channel[j]) {
          // (a bed that feeds the basin is followed as far as it stands low enough; the spill bed only to the levee)
          if (!(r.channel[j] === si + 1 ? r.along[j] < levee : feeds(r.channel[j] - 1))) continue;
        } else if (k > BEACH || r.channel[c] || bySpill(j)) {
          // (the ground beside the water only `BEACH` tiles out; a bed's banks and the levee's ends are the bank)
          d[j] = k;
          raise.push(j);
          continue;
        }
        d[j] = k;
        next.push(j);
        held.push(j);
      }
    }
    q = next;
  }
  for (const c of [...held, ...site]) {
    near4(W, H, c, nb);
    for (const j of nb) {
      if (j < 0 || d[j] >= 0 || r.lake[j] || r.channel[j] || r.crest[j] || heights[j] > sill + 1) continue;
      d[j] = BEACH + 1;
      raise.push(j);
    }
  }
  for (const j of raise) heights[j] = sill + 2;
  return raise;
}

// ------------------------------------------------------------------------------------------------- water by number

/** The water of one state of the land: depths and badwater, and the water its ponds hold (tile-levels). */
interface Water {
  depth: Float64Array;
  contamination: Float64Array;
  held: number;
}

/** A change to the land a work makes: tiles to a floor. */
type Change = [tile: number, floor: number][];

/** The water `flowThrough` gives the land `floor` with the plan's sources: `prefillFrom`'s depths, each pond a head
 *  over its spill. */
function waterOn(w: StageWater, floor: Float64Array): Water {
  const m = { ...stageModel(w), floor };
  const flow = flowThrough(m);
  const s = prefillFrom(m, flow);
  let held = 0;
  for (let i = 0; i < floor.length; i++)
    if (flow.path[i] && flow.level[i] > floor[i]) {
      held += flow.level[i] - floor[i];
      s.depth[i] += HEAD;
    }
  return { depth: s.depth as Float64Array, contamination: s.contamination as Float64Array, held };
}

// ------------------------------------------------------------------------------------------------- the soil's reach

/** The tiles the soil makes moist from `water` (the game's rule, `sim/moisture.ts` `moisture`: a wet tile's reach is
 *  twice its cluster's saturation, a tile beside water loses 6 for each level over the water's ceiled surface, and the
 *  reach spreads a tile at a time, 1 along and √2 across, 6 for each level climbed), read inside `box` [x0, y0, x1,
 *  y1] from the water inside it. A breadth-first reach in hundredths of a tile (buckets, no heap): 1 where moist, 2
 *  where wet. */
export function soilReach(heights: ArrayLike<number>, water: { depth: ArrayLike<number>; contamination: ArrayLike<number> }, W: number, H: number, box: [number, number, number, number] = [0, 0, W - 1, H - 1], sat?: Uint8Array): Uint8Array {
  const { depth, contamination: con } = water;
  const N = W * H;
  const [x0, y0, x1, y1] = box;
  const wet = new Uint8Array(N);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (depth[y * W + x] > 0) wet[y * W + x] = 1;
  const s = sat ?? clusterSaturation(wet, W, H);
  const M = new Int32Array(N);
  const fixed = new Uint8Array(N);
  const range = (j: number) => {
    const r = 2 * s[j];
    const c = con[j];
    return c >= 0.01 ? Math.floor(r * Math.min(1, Math.max(0, 1 - c / 0.53))) : r;
  };
  const ceilOf = (j: number) => Math.ceil(heights[j] + depth[j] - 1e-9);
  const buckets: number[][] = Array.from({ length: 1601 }, () => []);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (wet[i] && con[i] <= 0.01) {
        M[i] = 200 * s[i];
        fixed[i] = 1;
      }
    }
  const nb = new Int32Array(4);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (fixed[i]) {
        if (M[i] > 0) buckets[M[i]].push(i);
        continue;
      }
      let best = 0;
      near4(W, H, i, nb);
      for (const j of nb) {
        if (j < 0 || !wet[j]) continue;
        const v = 100 * range(j) - 600 * Math.max(0, heights[i] - ceilOf(j));
        if (v > best) best = v;
      }
      if (best > 0) {
        M[i] = best;
        buckets[best].push(i);
      }
    }
  for (let m = 1600; m > 0; m--) {
    const list = buckets[m];
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (M[i] !== m) continue;
      const x = i % W;
      const y = (i - x) / W;
      const base = heights[i] + Math.ceil(depth[i] - 1e-9);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < x0 || xx > x1 || yy < y0 || yy > y1) continue;
          const j = yy * W + xx;
          if (fixed[j]) continue;
          const v = m - (dx && dy ? 141 : 100) - 600 * Math.max(0, heights[j] - base);
          if (v > M[j]) {
            M[j] = v;
            buckets[v].push(j);
          }
        }
    }
    list.length = 0;
  }
  const out = new Uint8Array(N);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      out[i] = wet[i] ? 2 : M[i] > 0 ? 1 : 0;
    }
  return out;
}

/** What a change of water turns green or wet (`estimateGain`, §2.2 stage 4): the soil's reach of the water after
 *  against before, in the window round the tiles whose water differs; of them, the tiles newly water. */
export function estimateGain(heights: ArrayLike<number>, W: number, H: number, before: { depth: ArrayLike<number>; contamination: ArrayLike<number> }, after: { depth: ArrayLike<number>; contamination: ArrayLike<number> }): { green: number; wet: number; tiles: number[] } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < W * H; i++) {
    const a = before.depth[i];
    const b = after.depth[i];
    if (Math.abs(a - b) < SAME && a > 0 === b > 0 && Math.abs(before.contamination[i] - after.contamination[i]) < 0.01) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x0 > x1) return { green: 0, wet: 0, tiles: [] };
  // (counted within the soil's reach of the change; read from the water within its reach of those)
  const inner: [number, number, number, number] = [Math.max(0, x0 - REACH), Math.max(0, y0 - REACH), Math.min(W - 1, x1 + REACH), Math.min(H - 1, y1 + REACH)];
  const outer: [number, number, number, number] = [Math.max(0, inner[0] - REACH), Math.max(0, inner[1] - REACH), Math.min(W - 1, inner[2] + REACH), Math.min(H - 1, inner[3] + REACH)];
  const a = soilReach(heights, before, W, H, outer);
  const b = soilReach(heights, after, W, H, outer);
  const tiles: number[] = [];
  let wet = 0;
  for (let y = inner[1]; y <= inner[3]; y++)
    for (let x = inner[0]; x <= inner[2]; x++) {
      const i = y * W + x;
      if (b[i] && !a[i]) tiles.push(i);
      if (b[i] === 2 && a[i] !== 2) wet++;
    }
  return { green: tiles.length, wet, tiles };
}

// ------------------------------------------------------------------------------------------------- the templates

/** A fall's crest level as built: the commonest height of its lip. */
function crestOf(r: WaterRaster, heights: ArrayLike<number>, id: string): number {
  const count = new Map<number, number>();
  for (const i of r.lips[id] ?? []) count.set(heights[i], (count.get(heights[i]) ?? 0) + 1);
  let best = 0;
  let n = -1;
  for (const [h, c] of count) if (c > n) [best, n] = [h, c];
  return best;
}

/** A notch's or breach's tiles a level under its crest and the crest's second row behind them: what shutting it
 *  raises (`water.ts` `stageModel`'s rule). */
function notchTiles(r: WaterRaster, heights: ArrayLike<number>, id: string): { tiles: number[]; crest: number } {
  const crest = crestOf(r, heights, id);
  const out = new Set<number>();
  const nb = new Int32Array(4);
  for (const i of r.notches[id] ?? []) {
    out.add(i);
    near4(r.W, r.H, i, nb);
    for (const j of nb) if (j >= 0 && r.crest[j] && heights[j] === crest - 1) out.add(j);
  }
  return { tiles: [...out], crest };
}

/** The channel tile nearest a point, and its distance along. */
function nearestAlong(r: WaterRaster, li: number, at: [number, number]): number {
  let best = Infinity;
  let s = 0;
  for (let i = 0; i < r.W * r.H; i++) {
    if (r.channel[i] !== li + 1) continue;
    const x = i % r.W;
    const y = (i - x) / r.W;
    const dx = x + 0.5 - at[0];
    const dy = y + 0.5 - at[1];
    const d = dx * dx + dy * dy;
    if (d < best) [best, s] = [d, r.along[i]];
  }
  return s;
}

/** A dam to pond's narrows (§4.2): the dam across the bed where its banks close in, two tiles of rock shoulder at the
 *  bench's level (bed + 2) each side, and behind it a pan, a flat a level over the bed (the dam's crest) that widens
 *  to `wide` tiles each side of the bed and closes again `back` tiles up it, under a rim at the bench's level. The bed
 *  through the pan stands at the dam's bed, a level under the pan, so the brook's own thread stays in its bed; the dam
 *  holds the water a level higher, over the pan, and the soil reads it at the bench's level. Without the pan a dam's
 *  pond is its bed's thread raised a level (0 to 250 tiles, step 8's measure); with it, the pan's water reaches the
 *  bench all round, and the bench round the pan is cut to the bench's level `bench` tiles out where it stands higher,
 *  so the pond's green is not stopped at the first step up. `least` is the shortest pan a bed has room for. */
export const NARROWS = { back: 15, least: 5, wide: 8, rim: 1.5, bench: 6, shoulder: 2.5, off: 6 } as const;

/** The longest narrows (`narrowsGround`) at `at` that stands whole on free ground, its pan `most` tiles back at most,
 *  shortened two at a time to `NARROWS.least`; none where every length meets other water or the start. The siting and
 *  the ladder both lay it this way, so the pan the plan weighed is the pan the land gets where the ground agrees. */
export function narrowsFit(bed: readonly (readonly [number, number])[], at: number, b: number, W: number, H: number, h: (i: number) => number, free: (i: number) => boolean, most: number): ReturnType<typeof narrowsGround> | undefined {
  for (let back = most; back >= NARROWS.least; back -= 2) {
    const lay = narrowsGround(bed, at, b, W, H, h, free, back);
    if (!lay.blocked && lay.pan.length) return lay;
  }
  return undefined;
}

/** The ground a dam to pond's narrows lays (`NARROWS`) on a dry bed: `bed` its tiles (three wide) with their distance
 *  along it, the dam at `at` along it on bed level `b`, `h` the land and `free` whether a tile may be laid (no other
 *  water, not the start's). The pan's tiles; the tiles laid; how many tiles it wanted that were not free; `back`. */
export function narrowsGround(bed: readonly (readonly [number, number])[], at: number, b: number, W: number, H: number, h: (i: number) => number, free: (i: number) => boolean, back: number = NARROWS.back): { ground: Map<number, number>; pan: number[]; blocked: number; back: number } {
  const ground = new Map<number, number>();
  const pan: number[] = [];
  let blocked = 0;
  const own = new Set<number>();
  for (const [i] of bed) own.add(i);
  // (the bed through the pan and a little past it stands at the dam's bed)
  const near: (readonly [number, number])[] = [];
  for (const t of bed) {
    const [i, s] = t;
    if (s < at - back - 4 || s > at + 3) continue;
    near.push(t);
    if (s >= at - back - 2 && s < at + 0.5 && h(i) > b) ground.set(i, b);
  }
  if (!near.length) return { ground, pan, blocked: 1, back };
  const reach = Math.ceil(NARROWS.wide + NARROWS.rim + NARROWS.bench + 2);
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const [i] of near) {
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const span = back + 0.5;
  for (let y = Math.max(0, y0 - reach); y <= Math.min(H - 1, y1 + reach); y++)
    for (let x = Math.max(0, x0 - reach); x <= Math.min(W - 1, x1 + reach); x++) {
      const j = y * W + x;
      if (own.has(j)) continue;
      // (the nearest bed tile: how far from the bed, and how far up it from the dam)
      let e = Infinity;
      let u = 0;
      for (const [i, s] of near) {
        const dx = (i % W) - x;
        const dy = Math.floor(i / W) - y;
        const d = dx * dx + dy * dy;
        if (d < e) [e, u] = [d, at - s];
      }
      // (distances compared squared: no root, D366)
      const within = (r: number) => e <= r * r;
      let v = -1;
      if (u >= 1.5 && u <= span) {
        // (the pan widens and closes again as a parabola along the bed)
        const t = (u - 1) / (span - 1);
        const wide = 4 * NARROWS.wide * t * (1 - t);
        if (within(wide + 0.5)) v = b + 1;
        else if (within(wide + 0.5 + NARROWS.rim)) v = Math.max(h(j), b + 3);
        else if (within(wide + 0.5 + NARROWS.rim + NARROWS.bench) && h(j) > b + 2) v = b + 2;
      } else if (u > -2 && u < 1.5 && within(NARROWS.shoulder)) v = Math.max(h(j), b + 3);
      else if (u > span && u <= span + 2 && within(NARROWS.rim + 1)) v = Math.max(h(j), b + 3);
      if (v < 0 || (v === h(j) && v !== b + 1)) continue;
      if (!free(j)) {
        // (the bench is cut where it can be; a pan, rim or shoulder must stand whole)
        if (v === b + 2 && h(j) > b + 2) continue;
        blocked++;
        continue;
      }
      if (v !== h(j)) ground.set(j, v);
      if (v === b + 1) pan.push(j);
    }
  return { ground, pan, blocked, back };
}

/** How far along its bed from the plan's point a dam may move to hold a pond that stays in its bed. */
const DAM_REACH = 2;
/** How far a dam's pond may reach from it before it counts as water let out of its bed: its narrows' pan, as far up
 *  the bed as it runs and as wide. */
const POND_REACH = NARROWS.back + NARROWS.wide;

/** A dam to pond's site (§4.2): a band across its dry bed near the plan's point, the dam a level over the bed there,
 *  where the pond it holds is the largest that stays in its bed (its water at the dam's crest reaches no ground down
 *  the bed, no other water and nothing past `POND_REACH` tiles), with the bench beside it at bed + 2. */
function damSite(r: WaterRaster, heights: ArrayLike<number>, li: number, at: [number, number]): { tiles: number[]; level: number; bench: number; pond: number; leaks: boolean } | null {
  const { W, H } = r;
  const s0 = nearestAlong(r, li, at);
  type Cand = { tiles: number[]; level: number; bench: number; pond: number; leaks: boolean };
  let best: Cand | null = null;
  const score = (c: Cand) => (c.leaks ? -1e6 : 0) + c.pond * 4 + c.bench;
  const nb = new Int32Array(4);
  // (near the plan's point: stage 0's second pass sites the dam where its pond pays, `siting.ts`)
  for (let o = -DAM_REACH; o <= DAM_REACH; o++) {
    const tiles = band(r, li, s0 + o - 0.5);
    if (!tiles.length) continue;
    const bed = Math.min(...tiles.map((i) => heights[i]));
    const crest = bed + 1;
    let a = Infinity;
    let b = -Infinity;
    for (const i of tiles) {
      a = Math.min(a, r.along[i]);
      b = Math.max(b, r.along[i]);
    }
    const tx = tiles[0] % W;
    const ty = (tiles[0] - tx) / W;
    // the pond: from the bed just above the band, over ground at the crest or under it
    const inBand = new Set(tiles);
    const seen = new Set<number>(tiles);
    const queue: number[] = [];
    for (let i = 0; i < W * H; i++) if (r.channel[i] === li + 1 && r.along[i] < a && r.along[i] >= a - 1.5 && heights[i] < crest) queue.push(i);
    for (const i of queue) seen.add(i);
    let pond = 0;
    let leaks = false;
    while (queue.length && !leaks) {
      const c = queue.pop()!;
      if (heights[c] < crest) pond++;
      near4(W, H, c, nb);
      for (const j of nb) {
        if (j < 0 || seen.has(j) || inBand.has(j) || heights[j] > crest) continue;
        const jx = j % W;
        const jy = (j - jx) / W;
        const far = Math.abs(jx - tx) > POND_REACH || Math.abs(jy - ty) > POND_REACH;
        // (backing up its own bed past `POND_REACH` is the pond's length, not a leak: it is not counted on)
        if (far && r.channel[j] === li + 1 && r.along[j] < a) continue;
        if ((r.channel[j] === li + 1 && r.along[j] > b) || r.lake[j] || (r.channel[j] && r.channel[j] !== li + 1) || far) {
          leaks = true;
          break;
        }
        seen.add(j);
        queue.push(j);
      }
    }
    // (the bench: ground at bed + 2 within 8 tiles of the band, off the bed)
    let bench = 0;
    const counted = new Set<number>();
    for (const t of tiles) {
      const x0 = t % W;
      const y0 = (t - x0) / W;
      for (let dy = -8; dy <= 8; dy++)
        for (let dx = -8; dx <= 8; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (counted.has(i) || r.channel[i] || r.lake[i]) continue;
          counted.add(i);
          if (heights[i] === bed + 2) bench++;
        }
    }
    const cand: Cand = { tiles, level: crest, bench, pond, leaks };
    if (!best || score(cand) > score(best)) best = cand;
  }
  return best;
}

/** A cleared link's head, as the water reads it: stage 1 holds a shut link's bed up to its first row at the level its
 *  body's water stands (`headHolds`), over the body's sill where it stands well over it (the springs' pool with one way
 *  out stands 1.3 over). `flowThrough`'s levels are static, its bodies on their sills, so the head the body's water
 *  pours over once the row is cleared reads as the sill. */
function headOpen(plan: PremisePlan, w: StageWater, heights: ArrayLike<number>, li: number): Change {
  const r = w.raster;
  const l = plan.links[li];
  const from = plan.bodies.find((b) => b.id === l.from);
  const row = r.rows[l.id]?.[0];
  if (!from || !row?.length) return [];
  const level = designLevel(w.table, from);
  let end = -Infinity;
  for (const i of row) if (r.channel[i] === li + 1) end = Math.max(end, r.along[i]);
  const out: Change = [];
  for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li + 1 && r.along[i] <= end + 1 && heights[i] > from.sill && heights[i] < level) out.push([i, from.sill]);
  return out;
}

/** The plan's works as templates on the land: each one's site, what it does and what it buys by number, in the
 *  order the plan lists them; and day 1's water and moist shares (`spectrum`). `heights` is the land as built
 *  (stages 2 and 3, the works' own ground laid). */
/** Day 1's floor: the land, every row shut (a Blockage is a level of floor), every notch and breach shut too, so the
 *  lakes stand on their sills (an open notch's share is the table's: `flowThrough`'s levels are static). */
function dayOneFloor(w: StageWater, heights: Uint8Array, laid: LaidWorks): { base: Float64Array; shut: Record<string, { tiles: number[]; crest: number }> } {
  const r = w.raster;
  const base = Float64Array.from(heights);
  for (const [id, rows] of Object.entries(r.rows)) {
    if (laid.plugs[id]) continue;
    for (const row of rows) for (const i of row) base[i] = heights[i] + 1;
  }
  const shut: Record<string, { tiles: number[]; crest: number }> = {};
  for (const id of Object.keys(r.notches)) {
    shut[id] = notchTiles(r, heights, id);
    for (const i of shut[id].tiles) base[i] = Math.max(base[i], shut[id].crest);
  }
  return { base, shut };
}

/** Day 1's soil by number on a land (`soilReach` of day 1's water: 2 water, 1 moist, 0 dry), as the ladder reads it:
 *  what stage 0's second pass sites the works against (`siting.ts`). */
export function dayOneSoil(w: StageWater, heights: Uint8Array, laid: LaidWorks = { plugs: {}, banks: {} }): Uint8Array {
  const water = waterOn(w, dayOneFloor(w, heights, laid).base);
  return soilReach(heights, water, w.raster.W, w.raster.H);
}

export function ladderOf(plan: PremisePlan, w: StageWater, heights: Uint8Array, laid: LaidWorks = { plugs: {}, banks: {} }): Ladder {
  const r = w.raster;
  const { W, H } = plan;
  const N = W * H;
  // day 1 (`dayOneFloor`)
  const { base, shut } = dayOneFloor(w, heights, laid);
  const byId = new Map(plan.works.map((x) => [x.id, x]));
  const linkIndex = (id: string) => plan.links.findIndex((l) => l.id === id);

  // each work's site and its change to the land
  const sites = new Map<string, { site: WorkSite; change: Change; reservoir: boolean }>();
  for (const work of plan.works) {
    const site: WorkSite = { id: work.id, kind: work.kind, rung: work.rung, on: work.on, region: work.region, tiles: [], does: "clear", needs: work.needs, green: 0, wet: 0, reservoir: 0, reach: [], paid: false, ...(work.estimate !== undefined ? { estimate: work.estimate } : {}) };
    const change: Change = [];
    let reservoir = false;
    const li = linkIndex(work.on);
    if (work.kind === "notch" || work.kind === "leat") {
      const plug = laid.plugs[work.on];
      if (plug) {
        site.does = "dig";
        site.tiles = plug;
        for (const i of plug) change.push([i, heights[i] - 1]);
      } else {
        site.tiles = r.rows[work.on]?.[0] ?? [];
        for (const i of site.tiles) change.push([i, heights[i]]);
      }
    } else if (work.kind === "bypass") {
      site.tiles = (r.rows[work.on] ?? []).flat();
      for (const i of site.tiles) change.push([i, heights[i]]);
    }
    if ((work.kind === "notch" || work.kind === "leat" || work.kind === "bypass") && li >= 0) change.push(...headOpen(plan, w, heights, li));
    if (work.kind === "damToPond" && li >= 0) {
      const d = damSite(r, heights, li, work.at);
      if (d) {
        site.does = "build";
        site.tiles = d.tiles;
        site.level = d.level;
        for (const i of d.tiles) change.push([i, Math.max(heights[i], d.level)]);
        if (d.leaks) site.note = "its pond runs out of its bed at every place along it";
        else if (d.bench < 8) site.note = `its bench at bed + 2 is ${d.bench} tiles (8 asked)`;
      }
    } else if (work.kind === "levee" && work.rung !== "first") {
      // at the basin's spill point: across the spill bed's first tiles, to the beach (its sill + 1)
      const body = plan.bodies.find((b) => b.id === work.on);
      const si = plan.links.findIndex((l) => l.from === work.on && l.id.startsWith("spill"));
      if (body && si >= 0) {
        site.does = "build";
        site.level = body.sill + 1;
        site.tiles = leveeBand(r, heights, si, body.sill);
        for (const i of site.tiles) change.push([i, body.sill + 1]);
      }
    } else if (work.kind === "breach") {
      // a breach mended or a notch plugged: it is shut on day 1 here, so its water is what opening it loses
      reservoir = true;
      site.does = "build";
      const n = shut[work.on];
      if (n) {
        site.tiles = (r.notches[work.on] ?? []).slice();
        site.level = n.crest;
        for (const i of n.tiles) change.push([i, heights[i]]);
      }
    } else if (work.kind === "raisedSill") {
      reservoir = true;
      site.does = "build";
      const crest = crestOf(r, heights, work.on);
      site.level = crest + 1;
      site.tiles = [...new Set([...(r.lips[work.on] ?? []), ...(r.notches[work.on] ?? [])])];
      for (const i of site.tiles) change.push([i, crest + 1]);
    } else if (work.kind === "megadam" && li >= 0) {
      reservoir = true;
      site.does = "build";
      const from = plan.bodies.find((b) => b.id === plan.links[li].from);
      const lakes = plan.stair?.lakes ?? [];
      const next = plan.bodies.find((b) => b.id === lakes[lakes.indexOf(from?.id ?? "") + 1]);
      site.level = next ? next.sill : (from?.sill ?? 0) + 3;
      const wall = wallAcross(plan.links[li].path ?? [], work.at, heights, W, H, site.level);
      if (wall.length) {
        site.tiles = wall;
        for (const i of site.tiles) change.push([i, site.level]);
      } else site.note = `no shoulders at ${site.level} within ${WALL_REACH} tiles of the slot`;
    }
    sites.set(work.id, { site, change, reservoir });
  }

  // the land with a set of works done (each change in the plan's order)
  const floorWith = (done: Set<string>): Float64Array => {
    const f = Float64Array.from(base);
    for (const work of plan.works) {
      if (!done.has(work.id)) continue;
      const s = sites.get(work.id)!;
      // (a breach's change opens it: done, it stays shut as on day 1)
      if (s.site.kind === "breach") continue;
      for (const [i, v] of s.change) f[i] = v;
    }
    return f;
  };
  const needsOf = (id: string, out = new Set<string>()): Set<string> => {
    for (const n of byId.get(id)?.needs ?? []) {
      if (out.has(n)) continue;
      out.add(n);
      needsOf(n, out);
    }
    return out;
  };
  const cache = new Map<string, Water>();
  const waterWith = (done: Set<string>): Water => {
    const key = [...done].sort().join(",");
    let v = cache.get(key);
    if (!v) {
      v = waterOn(w, floorWith(done));
      cache.set(key, v);
    }
    return v;
  };

  const day1 = waterWith(new Set());
  for (const work of plan.works) {
    const s = sites.get(work.id)!;
    const site = s.site;
    if (!site.tiles.length) {
      site.note = site.note ?? (work.rung === "first" && work.kind === "levee" ? "the Still Pool comes with its set piece (build step 7)" : "no site on the land");
      continue;
    }
    const needs = needsOf(work.id);
    const before = waterWith(needs);
    let after: Water;
    if (site.kind === "breach") {
      // (opened, against the day-1 shut)
      const f = floorWith(needs);
      for (const [i, v] of s.change) f[i] = v;
      after = waterOn(w, f);
      site.reservoir = Math.max(0, Math.round(before.held - after.held));
    } else {
      after = waterWith(new Set([...needs, work.id]));
      const gain = estimateGain(heights, W, H, before, after);
      site.green = gain.green;
      site.wet = gain.wet;
      site.reach = tilesToRuns(gain.tiles, W);
      if (s.reservoir) site.reservoir = Math.max(0, Math.round(after.held - before.held));
    }
    const range = s.reservoir ? work.gives.reservoir : work.gives.green;
    const v = s.reservoir ? site.reservoir : site.green;
    site.paid = !!range && v >= range[0];
    if (!site.paid && range && !site.note) site.note = `${s.reservoir ? "holds" : "greens"} ${v}, under its floor of ${range[0]}`;
  }

  // day 1's shares, and the works' green as shares
  const soil = soilReach(heights, day1, W, H);
  let water = 0;
  let moist = 0;
  for (let i = 0; i < N; i++) {
    if (soil[i] === 2) water++;
    else if (soil[i] === 1) moist++;
  }
  const works = plan.works.map((x) => sites.get(x.id)!.site);
  const small = works.filter((x) => x.rung === "small" && (x.kind === "notch" || x.kind === "damToPond" || x.kind === "levee")).reduce((t, x) => t + x.green, 0);
  const together = works.reduce((t, x) => t + x.green, 0);
  return { works, day1: { water: water / N, moist: moist / N }, small: small / N, together: together / N };
}

export type { Work };
