// Soil moisture and contamination per terrain run (D120; investigation/terrain3d/DESIGN.md §3.4,
// GAME_RULES.md §6): the game keeps one value per run top, slot j of tile i at j·N + i
// (`SoilMoistureSimulator`, `SoilContaminationSimulator`), with the runs laid out as
// `ColumnTerrainMap` does (sim/columns.ts `terrainColumns`).
//
// The game's own per-tick rules (Timberborn 1.1.2.4, `MoistureCalculationTask`,
// `ContaminationCandidatesCountingTask`, read from the decompiled code and described, not copied;
// the same task, in float32, with its decay and spreading rates), run from dry soil until nothing
// changes: what the game stores once the soil has settled. It reproduces the official maps' stored
// moisture (see docs/progress/terrain3d-a.md). (The earlier "port" mode, which gave sim/moisture.ts's
// and sim/contamination.ts's numbers, was unreachable and is gone.)
//
// The rules, per run (its floor and its top):
// - A run's own water is the water column whose floor is the run's top (`TryGetColumnWithFloorAt
//   Height`): clean, it fixes the run's moisture at 2·sat of that column; any contamination scales
//   the run's moisture by 1 − c.
// - Water under the run: when the column whose ceiling is the run's floor is full, the run gets
//   its range less 6 per level of rock above the first (a roof 1, 2 or 3 thick over a sat-8 cave
//   gives 16, 10 or 4); contamination 2(c − 0.5) less 5/7 per level.
// - Water beside the run: on each 4-neighbour tile, the topmost wet column whose floor is at or
//   below the run's top, if its ceiled surface is above the run's floor (for contamination, the
//   topmost contaminated column), less 6 (5/7) per level the run's top stands above that surface.
//   Between two tiles of a heightfield (the run's tile one run, the neighbour one water column) the
//   neighbour's water counts whatever its floor, as sim/moisture.ts has it; the stored moisture of
//   the official maps confirms that model on heightfields (notes/water_and_soil.md Q3).
// - Spread: from the runs of the 8 neighbour tiles that overlap the run ([floor, top] against
//   [floor, top], both ends inclusive), 1 or √2 per step (1/7 or √2/7 for contamination) plus 6
//   (5/7) per level the run's top stands above the neighbour's top; for moisture the neighbour's
//   water there counts as height. Downhill is free.
//
// Barriers (Thorns: BlockFullMoisture and a soil barrier) are cells z·N + tile, the object's own
// cell: the run whose top is that z stays at 0 moisture and takes no contamination by spreading, as
// in the heightfield modules. The game's other barrier (`BlockAboveMoisture`, player buildings) is
// not on maps.

import { terrainColumns, type TerrainColumns, type VoxelMasks, type WaterColumns } from "./columns";
import { objectTile, type MapObject } from "./model";

/** Cluster saturation per water column id (0 where dry): the game's rule on stacked columns, as
 *  StackSim computes it (`WateredNeighborsCountingTask`, `ClusterSaturationCalculationTask`): a
 *  neighbour tile counts as watered when one of its wet columns overlaps the column (when its slot-0
 *  floor is at or above the column's floor, only slot 0 is tested), and a column's saturation is the
 *  largest of its own count and its 4-neighbours' best overlapping counts less 1, at most 8. On a
 *  heightfield it is sim/moisture.ts `clusterSaturation`. */
export function columnSaturation(wc: WaterColumns, depth: ArrayLike<number>): Uint8Array {
  const { W, H, N, L, count, floor: Fl, ceil: Ce } = wc;
  const M = L * N;
  const wn = new Int32Array(M);
  const neighbourWet = (c: number, t: number): boolean => {
    const fc = Fl[c];
    const cc = Ce[c];
    if (Fl[t] >= fc) return cc > Fl[t] && depth[t] > 0;
    for (let s = count[t] - 1; s >= 0; s--) {
      const id = s * N + t;
      if (Fl[id] < cc && Ce[id] > fc && depth[id] > 0) return true;
    }
    return false;
  };
  const bestWn = (c: number, t: number): number => {
    const fc = Fl[c];
    const cc = Ce[c];
    let best = 0;
    for (let s = 0; s < count[t]; s++) {
      const id = s * N + t;
      if (depth[id] > 0 && wn[id] > best && Ce[id] > fc && Fl[id] < cc) best = wn[id];
    }
    return best;
  };
  for (let c = 0; c < M; c++) {
    if (!(depth[c] > 0)) continue;
    const i = c % N;
    const x = i % W;
    const y = (i - x) / W;
    let n = 1;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        if (xx >= 0 && xx < W && neighbourWet(c, yy * W + xx)) n++;
      }
    }
    wn[c] = n;
  }
  const sat = new Uint8Array(M);
  for (let c = 0; c < M; c++) {
    if (!(depth[c] > 0)) continue;
    const i = c % N;
    const x = i % W;
    const y = (i - x) / W;
    let best = wn[c];
    if (y > 0) best = Math.max(best, bestWn(c, i - W) - 1);
    if (x > 0) best = Math.max(best, bestWn(c, i - 1) - 1);
    if (y < H - 1) best = Math.max(best, bestWn(c, i + W) - 1);
    if (x < W - 1) best = Math.max(best, bestWn(c, i + 1) - 1);
    sat[c] = best < 8 ? best : 8;
  }
  return sat;
}

/** The soil barriers of a map's objects (Thorns), as cells z·N + tile; null when there are none. */
export function soilBarrierCells(W: number, H: number, objects: readonly MapObject[]): Set<number> | null {
  let out: Set<number> | null = null;
  for (const o of objects) {
    if (o.template !== "Thorns") continue;
    const [x, y] = objectTile(o, 0, 0);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    (out ??= new Set()).add(o.z * W * H + y * W + x);
  }
  return out;
}

/** The water on and under each run: its own column (floor at the run's top) and the column below
 *  it (ceiling at the run's floor), as column ids or −1. */
function runWater(runs: TerrainColumns, wc: WaterColumns): { own: Int32Array; below: Int32Array } {
  const { N, T } = runs;
  const own = new Int32Array(T * N).fill(-1);
  const below = new Int32Array(T * N).fill(-1);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < runs.count[i]; k++) {
      const n = k * N + i;
      const top = runs.ceil[n];
      const bottom = runs.floor[n];
      for (let s = 0; s < wc.count[i]; s++) {
        const id = s * N + i;
        if (wc.floor[id] === top) {
          own[n] = id;
          break;
        }
        if (wc.floor[id] > top) break;
      }
      for (let s = 0; s < wc.count[i]; s++) {
        const id = s * N + i;
        if (wc.ceil[id] === bottom) {
          below[n] = id;
          break;
        }
        if (wc.ceil[id] > bottom) break;
      }
    }
  return { own, below };
}

const DIRS4: readonly [number, number][] = [[0, -1], [-1, 0], [0, 1], [1, 0]];

// ------------------------------------------------------------------------------ "game" mode

const f32 = Math.fround;
/** `TickService.TickIntervalInSeconds`. */
const TICK = f32(0.6);
const M_DECAY = f32(f32(1.25) * TICK);
const M_SPREAD = f32(f32(6.66) * TICK);
const M_SCALER = f32(1 / f32(0.53));
const M_MIN_WATER = f32(0.01);
const M_MIN = f32(0.01);
const M_DIAG = f32(1.414);
const C_DECAY = f32(f32(0.033) * TICK);
const C_SPREAD = f32(f32(0.066) * TICK);
const C_MAX = f32(1 - f32(0.001));
const C_REG = f32(1 / 7);
const C_DIAG = f32(f32(Math.SQRT2) / 7);
const C_VERT = f32(5 / 7);
const C_MIN_WATER = 0.5;
const C_SCALER = f32(1 / (1 - 0.5));
const C_THRESHOLD = f32(0.001);
/** The spread's neighbour order (`MoistureCalculationTask`): −y, −x, +x, +y, then the diagonals. */
const SPREAD8: readonly [number, number, boolean][] = [[0, -1, false], [-1, 0, false], [1, 0, false], [0, 1, false], [-1, -1, true], [1, -1, true], [-1, 1, true], [1, 1, true]];

/** The spread's graph: for every run, the runs of its 8 neighbour tiles that overlap it ([floor,
 *  top] against [floor, top], both ends inclusive), in the game's order, as edges `start[n]` to
 *  `start[n + 1]`; `diag` marks a diagonal step. Overlap is symmetric, so a run's edges are also
 *  the runs it feeds. `nodes` lists every run. Built once per terrain (moisture and contamination
 *  share it). */
interface SpreadGraph {
  start: Int32Array;
  to: Int32Array;
  diag: Uint8Array;
  nodes: Int32Array;
}

const graphs = new WeakMap<TerrainColumns, SpreadGraph>();

function spreadGraph(runs: TerrainColumns): SpreadGraph {
  const cached = graphs.get(runs);
  if (cached) return cached;
  const { W, H, N, T, count, floor, ceil } = runs;
  const NN = T * N;
  const DX = SPREAD8.map((d) => d[0]);
  const DY = SPREAD8.map((d) => d[1]);
  const start = new Int32Array(NN + 1);
  let nodeCount = 0;
  // two passes: count the edges, then fill them
  for (let pass = 0; pass < 2; pass++) {
    const to = pass ? new Int32Array(start[NN]) : null;
    const diag = pass ? new Uint8Array(start[NN]) : null;
    const nodes = pass ? new Int32Array(nodeCount) : null;
    let e = 0;
    let a = 0;
    for (let n = 0; n < NN; n++) {
      if (pass) {
        if (start[n] !== e) throw new Error("spread graph: counts differ");
      } else start[n] = e;
      const i = n % N;
      if ((n - i) / N >= count[i]) continue;
      if (nodes) nodes[a] = n;
      a++;
      const top = ceil[n];
      const bottom = floor[n];
      const x = i % W;
      const y = (i - x) / W;
      for (let d = 0; d < 8; d++) {
        const xx = x + DX[d];
        const yy = y + DY[d];
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        for (let k = 0; k < count[j]; k++) {
          const r = k * N + j;
          if (ceil[r] < bottom) continue;
          if (floor[r] > top) break;
          if (to) {
            to[e] = r;
            diag![e] = d >= 4 ? 1 : 0;
          }
          e++;
        }
      }
    }
    if (!pass) {
      start[NN] = e;
      nodeCount = a;
    } else {
      const g = { start, to: to!, diag: diag!, nodes: nodes! };
      graphs.set(runs, g);
      return g;
    }
  }
  throw new Error("unreachable");
}

/** The game's soil tasks run tick by tick from dry soil until nothing changes (at most `maxTicks`):
 *  only runs whose inputs changed (a run itself, or a run it reads) are recomputed, which gives the
 *  same values as recomputing all. */
function settleTicks(g: SpreadGraph, NN: number, cell: (n: number, last: Float32Array) => number, maxTicks: number): Float32Array {
  const last = new Float32Array(NN);
  let active = new Int32Array(NN);
  active.set(g.nodes);
  let activeCount = g.nodes.length;
  let nextActive = new Int32Array(NN);
  const changed = new Int32Array(NN);
  const values = new Float32Array(NN);
  const mark = new Int32Array(NN);
  let stamp = 0;
  for (let tick = 0; tick < maxTicks && activeCount; tick++) {
    // every run of the tick reads the last tick's values; the new ones are applied after
    let nc = 0;
    for (let a = 0; a < activeCount; a++) {
      const n = active[a];
      const v = cell(n, last);
      if (v !== last[n]) {
        changed[nc] = n;
        values[nc++] = v;
      }
    }
    for (let k = 0; k < nc; k++) last[changed[k]] = values[k];
    stamp++;
    let na = 0;
    for (let k = 0; k < nc; k++) {
      const n = changed[k];
      if (mark[n] !== stamp) {
        mark[n] = stamp;
        nextActive[na++] = n;
      }
      for (let e = g.start[n]; e < g.start[n + 1]; e++) {
        const r = g.to[e];
        if (mark[r] !== stamp) {
          mark[r] = stamp;
          nextActive[na++] = r;
        }
      }
    }
    const t = active;
    active = nextActive;
    nextActive = t;
    activeCount = na;
  }
  return last;
}

/** Moisture per run by the game's own rules at their steady state ("game" mode). What a run gets
 *  from water (its own, the cave below, the 4 neighbours) does not change from tick to tick, so it
 *  is found once; each tick only spreads. */
export function moisture3dGame(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null, sat: Uint8Array = columnSaturation(wc, depth), maxTicks = 3000): Float64Array {
  const { W, H, N, T } = runs;
  const NN = T * N;
  const g = spreadGraph(runs);
  const { own, below } = runWater(runs, wc);
  const D = Float32Array.from(depth);
  const C = Float32Array.from(contamination);
  const initialRange = (c: number) => f32(2 * sat[c]);
  // GetMoisture: the range of a water column, cut by its contamination
  const range = (c: number): number => {
    const cn = C[c];
    if (cn < M_MIN_WATER) return Math.trunc(initialRange(c));
    const s = f32(cn * M_SCALER);
    if (s >= 1) return 0;
    return Math.trunc(f32(initialRange(c) * f32(1 - s)));
  };
  // per run: a fixed value (a barrier, or clean water of its own), else its water term and its
  // water's (1 - c); and the height a neighbour's spread climbs from (its top plus its water)
  const fixed = new Float32Array(NN).fill(NaN);
  const num = new Float64Array(NN);
  const keep = new Float32Array(NN);
  const climbBase = new Int32Array(NN);
  for (let a = 0; a < g.nodes.length; a++) {
    const n = g.nodes[a];
    const i = n % N;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    const w = own[n];
    climbBase[n] = top + Math.ceil(w >= 0 ? D[w] : 0);
    if (barrier && barrier.has(top * N + i)) {
      fixed[n] = 0;
      continue;
    }
    if (w >= 0 && D[w] > 0 && C[w] <= M_MIN_WATER) {
      fixed[n] = Math.trunc(initialRange(w));
      continue;
    }
    keep[n] = f32(1 - (w >= 0 ? C[w] : 0));
    let v = 0;
    const b = below[n];
    if (b >= 0 && f32(D[b] + wc.floor[b]) >= wc.ceil[b]) v = range(b) - (top - bottom - 1) * 6;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      if (v >= 16) break;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const j = yy * W + xx;
      // GetMoistureFromWater: the topmost wet column at or below the run's top
      let c = -1;
      for (let s = wc.count[j] - 1; s >= 0; s--) {
        const id = s * N + j;
        if (wc.floor[id] <= top && D[id] > 0) {
          c = id;
          break;
        }
      }
      if (c < 0) continue;
      const surface = Math.ceil(f32(wc.floor[c] + D[c]));
      if (surface <= bottom) continue;
      const m = range(c) - Math.max(0, top - surface) * 6;
      if (m > v) v = m;
    }
    num[n] = v;
  }
  const cell = (n: number, last: Float32Array): number => {
    const f = fixed[n];
    if (f === f) return f;
    const water = num[n];
    let spread = 0;
    if (water < 16) {
      const top = runs.ceil[n];
      for (let e = g.start[n]; e < g.start[n + 1]; e++) {
        const r = g.to[e];
        const m = last[r];
        if (m === 0) continue;
        const cost = g.diag[e] ? M_DIAG : 1;
        const climb = top - climbBase[r];
        const v = climb < 0 ? f32(m - cost) : f32(f32(m - climb * 6) - cost);
        if (v > spread) spread = v;
      }
    }
    const was = last[n];
    let decayed = f32(was - M_DECAY);
    if (decayed < 0) decayed = 0;
    let v = decayed;
    if (water > decayed && water >= spread) {
      const cap = f32(was + M_SPREAD);
      v = water > cap ? cap : water;
    } else if (spread > decayed) v = spread;
    const out = f32(v * keep[n]);
    return out < M_MIN ? 0 : out;
  };
  return Float64Array.from(settleTicks(g, NN, cell, maxTicks));
}

/** Soil contamination per run by the game's own rules at their steady state ("game" mode): the
 *  candidates' fixed point, which the levels equalize to (0 below the threshold). As for moisture,
 *  the water terms are found once. */
export function contamination3dGame(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null, maxTicks = 3000): Float64Array {
  const { W, H, N, T } = runs;
  const NN = T * N;
  const g = spreadGraph(runs);
  const { below } = runWater(runs, wc);
  const D = Float32Array.from(depth);
  const C = Float32Array.from(contamination);
  const barred = new Uint8Array(NN);
  const num = new Float32Array(NN);
  for (let a = 0; a < g.nodes.length; a++) {
    const n = g.nodes[a];
    const i = n % N;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    if (barrier && barrier.has(top * N + i)) {
      barred[n] = 1;
      continue;
    }
    let v = 0;
    const b = below[n];
    if (b >= 0 && f32(D[b] + wc.floor[b]) >= wc.ceil[b]) {
      const s = f32(C[b] - C_MIN_WATER);
      v = s < 0 ? 0 : f32(f32(s * C_SCALER) - f32((top - bottom - 1) * C_VERT));
    }
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      if (v >= C_MAX) break;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const j = yy * W + xx;
      // GetContaminationFromWater: the topmost contaminated column at or below the run's top
      let c = -1;
      for (let s = wc.count[j] - 1; s >= 0; s--) {
        const id = s * N + j;
        if (wc.floor[id] <= top && C[id] > 0) {
          c = id;
          break;
        }
      }
      if (c < 0) continue;
      const s = f32(C[c] - C_MIN_WATER);
      if (s < 0) continue;
      const surface = D[c] > 0 ? Math.ceil(f32(wc.floor[c] + D[c])) : 0;
      if (surface <= bottom) continue;
      const scaled = f32(s * C_SCALER);
      const up = top - surface;
      const m = up < 0 ? scaled : f32(scaled - f32(up * C_VERT));
      if (m > v) v = m;
    }
    num[n] = v;
  }
  // what the climb costs a spread along each edge (no credit for water)
  const climbCost = new Float32Array(g.to.length);
  for (let a = 0; a < g.nodes.length; a++) {
    const n = g.nodes[a];
    for (let e = g.start[n]; e < g.start[n + 1]; e++) climbCost[e] = f32(Math.max(0, runs.ceil[n] - runs.ceil[g.to[e]]) * C_VERT);
  }
  const cell = (n: number, last: Float32Array): number => {
    if (barred[n]) return 0;
    const water = num[n];
    let spread = 0;
    if (water < C_MAX) {
      for (let e = g.start[n]; e < g.start[n + 1]; e++) {
        const v = f32(f32(last[g.to[e]] - climbCost[e]) - (g.diag[e] ? C_DIAG : C_REG));
        if (v > spread) spread = v;
      }
    }
    const was = last[n];
    let decayed = f32(was - C_DECAY);
    if (decayed < 0) decayed = 0;
    if (water > decayed && water >= spread) {
      const cap = f32(was + C_SPREAD);
      return water > cap ? cap : water;
    }
    return spread > decayed ? spread : decayed;
  };
  const cand = settleTicks(g, NN, cell, maxTicks);
  const out = new Float64Array(cand.length);
  for (let n = 0; n < cand.length; n++) out[n] = cand[n] < C_THRESHOLD ? 0 : cand[n];
  return out;
}

export interface Soil3d {
  runs: TerrainColumns;
  /** Per run, slot-major (`runs.T`·N). */
  moisture: Float64Array;
  contamination: Float64Array;
}

/** Moisture and contamination per run of a map's settled water (per water column id). */
export function soil3d(t: VoxelMasks, wc: WaterColumns, water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; sat?: Uint8Array }, objects: readonly MapObject[] = []): Soil3d {
  const runs = terrainColumns(t);
  const barrier = soilBarrierCells(t.W, t.H, objects);
  const sat = water.sat ?? columnSaturation(wc, water.depth);
  return {
    runs,
    moisture: moisture3dGame(runs, wc, water.depth, water.contamination, barrier, sat),
    contamination: contamination3dGame(runs, wc, water.depth, water.contamination, barrier),
  };
}
