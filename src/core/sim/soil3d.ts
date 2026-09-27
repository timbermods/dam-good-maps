// Soil moisture and contamination per terrain run (D120; investigation/terrain3d/DESIGN.md §3.4,
// GAME_RULES.md §6): the game keeps one value per run top, slot j of tile i at j·N + i
// (`SoilMoistureSimulator`, `SoilContaminationSimulator`), with the runs laid out as
// `ColumnTerrainMap` does (sim/columns.ts `terrainColumns`). Two modes, as the water engine has:
//
// "port" (the default): the steady states of sim/moisture.ts and sim/contamination.ts with run tops
// as nodes, so on a heightfield (one run per tile) they give those modules' numbers bit for bit;
// on terrain above terrain they add the game's own rules (Timberborn 1.1.2.4,
// `MoistureCalculationTask`, `ContaminationCandidatesCountingTask`, read from the decompiled code
// and described, not copied). The heightfield modules approximate the game in three places, which
// "port" keeps: a contaminated wet tile spreads its value before its water's (1 − c) is applied (so
// moisture leaks through a badwater stream to the land beyond it), a diagonal step costs √2 (the
// game: 1.414), and clean water's own 2·sat is scaled by (1 − c) as well.
//
// "game": the game's own per-tick rules (the same task, in float32, with its decay and spreading
// rates), run from dry soil until nothing changes: what the game stores once the soil has settled.
// It reproduces the official maps' stored moisture (see docs/progress/terrain3d-a.md). Whether the
// build adopts it, on heightfields too, is Kyler's call at the wiring step (as D293 was for water).
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

import { MinHeap } from "../math/grid";
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

/** Whether tile i is a heightfield tile: one run and one water column. */
const heightfieldTile = (runs: TerrainColumns, wc: WaterColumns, i: number) => runs.count[i] === 1 && wc.count[i] === 1;

/** The water on and under each run: its own column (floor at the run's top) and the column below
 *  it (ceiling at the run's floor), as column ids or −1. In "port" mode a heightfield tile's run
 *  owns the tile's one column, as sim/moisture.ts pairs them (a Blockage raises the column's floor
 *  above the run's top), and `base` is where that water stands on: the run's top there, else the
 *  column's floor. */
function runWater(runs: TerrainColumns, wc: WaterColumns, port: boolean): { own: Int32Array; below: Int32Array; base: Int16Array } {
  const { N, T } = runs;
  const own = new Int32Array(T * N).fill(-1);
  const below = new Int32Array(T * N).fill(-1);
  const base = Int16Array.from(wc.floor);
  for (let i = 0; i < N; i++)
    for (let k = 0; k < runs.count[i]; k++) {
      const n = k * N + i;
      const top = runs.ceil[n];
      const bottom = runs.floor[n];
      if (port && heightfieldTile(runs, wc, i)) {
        own[n] = i;
        base[i] = top;
        continue;
      }
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
  return { own, below, base };
}

/** The column of neighbour tile j that run n (on a tile of `nodeRuns` runs) reads its water from:
 *  the topmost column of j with its floor at or below `top` passing `ok`, or, between two
 *  heightfield tiles, j's one column when it passes `ok`; −1 when none. */
function besideColumn(wc: WaterColumns, j: number, top: number, nodeRuns: number, ok: (id: number) => boolean): number {
  const N = wc.N;
  if (nodeRuns === 1 && wc.count[j] === 1) return ok(j) ? j : -1;
  for (let s = wc.count[j] - 1; s >= 0; s--) {
    const id = s * N + j;
    if (wc.floor[id] <= top && ok(id)) return id;
  }
  return -1;
}

const DIRS4: readonly [number, number][] = [[0, -1], [-1, 0], [0, 1], [1, 0]];

/** Steady-state moisture per run (slot-major, `runs.T`·N), from the water per column id. */
export function moisture3d(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null, sat: Uint8Array = columnSaturation(wc, depth)): Float64Array {
  const { W, H, N, T } = runs;
  const NN = T * N;
  const MC = wc.L * N;
  const { own, below, base } = runWater(runs, wc, true);
  const range = new Float64Array(MC);
  const surfCeil = new Int32Array(MC);
  for (let c = 0; c < MC; c++) {
    const cn = contamination[c];
    const r = 2 * sat[c];
    range[c] = cn >= 0.01 ? Math.floor(r * Math.min(1, Math.max(0, 1 - cn / 0.53))) : r;
    surfCeil[c] = Math.ceil(base[c] + depth[c] - 1e-9);
  }
  const wet = (c: number) => depth[c] > 0;
  const M = new Float64Array(NN);
  const fixed = new Uint8Array(NN);
  const heap = new MinHeap();
  for (let n = 0; n < NN; n++) {
    const i = n % N;
    if ((n - i) / N >= runs.count[i]) continue;
    const w = own[n];
    if (w >= 0 && wet(w) && contamination[w] <= 0.01) {
      M[n] = 2 * sat[w];
      fixed[n] = 1;
    }
    if (barrier && barrier.has(runs.ceil[n] * N + i)) {
      M[n] = 0;
      fixed[n] = 1;
    }
  }
  for (let n = 0; n < NN; n++) {
    const i = n % N;
    if ((n - i) / N >= runs.count[i]) continue;
    if (fixed[n]) {
      if (M[n] > 0) heap.push(-M[n], n);
      continue;
    }
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    let best = 0;
    // a full cave below the run, through its rock
    const b = below[n];
    if (b >= 0 && wet(b) && wc.floor[b] + depth[b] >= wc.ceil[b]) {
      const v = range[b] - 6 * (top - bottom - 1);
      if (v > best) best = v;
    }
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const w = besideColumn(wc, yy * W + xx, top, runs.count[i], wet);
      if (w < 0 || surfCeil[w] <= bottom) continue;
      const v = range[w] - 6 * Math.max(0, top - surfCeil[w]);
      if (v > best) best = v;
    }
    if (best > 0) {
      M[n] = best;
      heap.push(-best, n);
    }
  }
  while (heap.size > 0) {
    const n = heap.pop();
    const m = -heap.lastKey;
    if (m < M[n] - 1e-9) continue;
    const i = n % N;
    const x = i % W;
    const y = (i - x) / W;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    const w = own[n];
    const climbBase = top + Math.ceil((w >= 0 ? depth[w] : 0) - 1e-9);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        const cost = dx && dy ? Math.SQRT2 : 1;
        for (let k = 0; k < runs.count[j]; k++) {
          const t = k * N + j;
          if (bottom > runs.ceil[t]) continue;
          if (top < runs.floor[t]) break;
          if (fixed[t]) continue;
          const climb = Math.max(0, runs.ceil[t] - climbBase);
          const v = m - cost - 6 * climb;
          if (v > M[t] + 1e-9) {
            M[t] = v;
            heap.push(-v, t);
          }
        }
      }
    }
  }
  const out = new Float64Array(NN);
  for (let n = 0; n < NN; n++) {
    const w = own[n];
    let v = M[n] * (w >= 0 && wet(w) ? 1 - contamination[w] : 1);
    if (v < 0.01) v = 0;
    out[n] = v;
  }
  return out;
}

const SQRT2 = Math.SQRT2;

/** Steady-state soil contamination per run (slot-major, `runs.T`·N): only water with
 *  contamination ≥ 0.5 contaminates soil, 2·(c − 0.5) on and beside it, then −1/7 per tile (√2/7
 *  diagonally) and −5/7 per level climbed. */
export function contamination3d(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null): Float64Array {
  const { W, H, N, T } = runs;
  const NN = T * N;
  const MC = wc.L * N;
  const { own, below, base } = runWater(runs, wc, true);
  const bad = new Uint8Array(MC);
  const surfCeil = new Int32Array(MC);
  for (let c = 0; c < MC; c++) {
    bad[c] = depth[c] > 0 && contamination[c] >= 0.5 ? 1 : 0;
    surfCeil[c] = Math.ceil(base[c] + depth[c] - 1e-9);
  }
  // the run each water column stands on (its floor is that run's top), or −1
  const onRun = new Int32Array(MC).fill(-1);
  for (let n = 0; n < NN; n++) if (own[n] >= 0) onRun[own[n]] = n;
  const barred = (n: number) => barrier !== null && barrier.has(runs.ceil[n] * N + (n % N));
  const V = new Float64Array(NN);
  const heap = new MinHeap();
  const contaminated = (id: number) => depth[id] > 0 && contamination[id] > 0;
  // bad water, in column id order, seeds the run it stands on and the runs beside it that read it
  for (let w = 0; w < MC; w++) {
    if (!bad[w]) continue;
    const i = w % N;
    const x = i % W;
    const y = (i - x) / W;
    const v0 = 2 * (contamination[w] - 0.5);
    const n0 = onRun[w];
    if (n0 >= 0) {
      if (v0 > V[n0]) V[n0] = v0;
      heap.push(-V[n0], n0);
    }
    for (let k = 0; k < 4; k++) {
      const xx = k === 1 ? x - 1 : k === 3 ? x + 1 : x;
      const yy = k === 0 ? y - 1 : k === 2 ? y + 1 : y;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const j = yy * W + xx;
      for (let s = 0; s < runs.count[j]; s++) {
        const t = s * N + j;
        const o = own[t];
        if (o >= 0 && bad[o]) continue;
        const top = runs.ceil[t];
        // the water run t reads beside it must be this column
        const read = runs.count[j] === 1 && wc.count[i] === 1 ? (bad[i] ? i : -1) : besideColumn(wc, i, top, runs.count[j], contaminated);
        if (read !== w || surfCeil[w] <= runs.floor[t]) continue;
        const v = v0 - (5 / 7) * Math.max(0, top - surfCeil[w]);
        if (v > V[t]) {
          V[t] = v;
          heap.push(-v, t);
        }
      }
    }
  }
  // a full cave of bad water below a run, through its rock
  for (let n = 0; n < NN; n++) {
    const i = n % N;
    if ((n - i) / N >= runs.count[i]) continue;
    const b = below[n];
    if (b < 0 || !bad[b] || wc.floor[b] + depth[b] < wc.ceil[b]) continue;
    const v = 2 * (contamination[b] - 0.5) - (5 / 7) * (runs.ceil[n] - runs.floor[n] - 1);
    if (v > V[n]) {
      V[n] = v;
      heap.push(-v, n);
    }
  }
  while (heap.size > 0) {
    const n = heap.pop();
    const v0 = -heap.lastKey;
    if (v0 < V[n] - 1e-9) continue;
    const i = n % N;
    const x = i % W;
    const y = (i - x) / W;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        for (let k = 0; k < runs.count[j]; k++) {
          const t = k * N + j;
          if (bottom > runs.ceil[t]) continue;
          if (top < runs.floor[t]) break;
          if (barred(t)) continue;
          const v = v0 - (dx && dy ? SQRT2 : 1) / 7 - (5 / 7) * Math.max(0, runs.ceil[t] - top);
          if (v > V[t] + 1e-9) {
            V[t] = v;
            heap.push(-v, t);
          }
        }
      }
    }
  }
  for (let n = 0; n < NN; n++) if (V[n] < 0.001) V[n] = 0;
  return V;
}

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

/** The game's soil tasks run tick by tick from dry soil until nothing changes (at most `maxTicks`):
 *  only runs whose inputs changed are recomputed, which gives the same values as recomputing all. */
function settleTicks(runs: TerrainColumns, cell: (n: number, last: Float32Array) => number, maxTicks: number): Float32Array {
  const { W, H, N, T } = runs;
  const NN = T * N;
  const last = new Float32Array(NN);
  let active: number[] = [];
  for (let n = 0; n < NN; n++) if ((n - (n % N)) / N < runs.count[n % N]) active.push(n);
  const mark = new Int32Array(NN);
  let stamp = 0;
  for (let tick = 0; tick < maxTicks && active.length; tick++) {
    // every run of the tick reads the last tick's values; the new ones are applied after
    const changed: number[] = [];
    const values: number[] = [];
    for (const n of active) {
      const v = cell(n, last);
      if (v !== last[n]) {
        changed.push(n);
        values.push(v);
      }
    }
    for (let k = 0; k < changed.length; k++) last[changed[k]] = values[k];
    // a run depends on its own last value and on the runs of the 8 tiles round it
    stamp++;
    active = [];
    for (const n of changed) {
      const i = n % N;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          for (let k = 0; k < runs.count[j]; k++) {
            const m = k * N + j;
            if ((dx || dy || m === n) && mark[m] !== stamp) {
              mark[m] = stamp;
              active.push(m);
            }
          }
        }
      }
    }
  }
  return last;
}

/** Moisture per run by the game's own rules at their steady state ("game" mode). */
export function moisture3dGame(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null, sat: Uint8Array = columnSaturation(wc, depth), maxTicks = 3000): Float64Array {
  const { W, H, N } = runs;
  const { own, below } = runWater(runs, wc, false);
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
  const cell = (n: number, last: Float32Array): number => {
    const i = n % N;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    if (barrier && barrier.has(top * N + i)) return 0;
    const w = own[n];
    if (w >= 0 && D[w] > 0 && C[w] <= M_MIN_WATER) return Math.trunc(initialRange(w));
    let num = 0;
    const b = below[n];
    if (b >= 0 && f32(D[b] + wc.floor[b]) >= wc.ceil[b]) num = range(b) - (top - bottom - 1) * 6;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      if (num >= 16) break;
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
      const v = range(c) - Math.max(0, top - surface) * 6;
      if (v > num) num = v;
    }
    let spread = 0;
    if (num < 16) {
      for (const [dx, dy, diag] of SPREAD8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        const cost = diag ? M_DIAG : 1;
        for (let k = 0; k < runs.count[j]; k++) {
          const r = k * N + j;
          const rt = runs.ceil[r];
          if (rt < bottom) continue;
          if (runs.floor[r] > top) break;
          const m = last[r];
          if (m === 0) continue;
          const up = top - rt;
          let v: number;
          if (up < 0) v = f32(m - cost);
          else {
            const wr = own[r];
            const credit = Math.ceil(wr >= 0 ? D[wr] : 0);
            const climb = up - credit;
            v = climb < 0 ? f32(m - cost) : f32(f32(m - climb * 6) - cost);
          }
          if (v > spread) spread = v;
        }
      }
    }
    const was = last[n];
    let decayed = f32(was - M_DECAY);
    if (decayed < 0) decayed = 0;
    let v = decayed;
    if (num > decayed && num >= spread) {
      const cap = f32(was + M_SPREAD);
      v = num > cap ? cap : num;
    } else if (spread > decayed) v = spread;
    const cn = w >= 0 ? C[w] : 0;
    const out = f32(v * f32(1 - cn));
    return out < M_MIN ? 0 : out;
  };
  return Float64Array.from(settleTicks(runs, cell, maxTicks));
}

/** Soil contamination per run by the game's own rules at their steady state ("game" mode): the
 *  candidates' fixed point, which the levels equalize to (0 below the threshold). */
export function contamination3dGame(runs: TerrainColumns, wc: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>, barrier: ReadonlySet<number> | null = null, maxTicks = 3000): Float64Array {
  const { W, H, N } = runs;
  const { below } = runWater(runs, wc, false);
  const D = Float32Array.from(depth);
  const C = Float32Array.from(contamination);
  const cell = (n: number, last: Float32Array): number => {
    const i = n % N;
    const top = runs.ceil[n];
    const bottom = runs.floor[n];
    if (barrier && barrier.has(top * N + i)) return 0;
    let num = 0;
    const b = below[n];
    if (b >= 0 && f32(D[b] + wc.floor[b]) >= wc.ceil[b]) {
      const s = f32(C[b] - C_MIN_WATER);
      num = s < 0 ? 0 : f32(f32(s * C_SCALER) - f32((top - bottom - 1) * C_VERT));
    }
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS4) {
      if (num >= C_MAX) break;
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
      const v = up < 0 ? scaled : f32(scaled - f32(up * C_VERT));
      if (v > num) num = v;
    }
    let spread = 0;
    if (num < C_MAX) {
      for (const [dx, dy, diag] of SPREAD8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        const cost = diag ? C_DIAG : C_REG;
        for (let k = 0; k < runs.count[j]; k++) {
          const r = k * N + j;
          const rt = runs.ceil[r];
          if (rt < bottom) continue;
          if (runs.floor[r] > top) break;
          const climb = Math.max(0, top - rt);
          const v = f32(f32(last[r] - f32(climb * C_VERT)) - cost);
          if (v > spread) spread = v;
        }
      }
    }
    const was = last[n];
    let decayed = f32(was - C_DECAY);
    if (decayed < 0) decayed = 0;
    if (num > decayed && num >= spread) {
      const cap = f32(was + C_SPREAD);
      return num > cap ? cap : num;
    }
    return spread > decayed ? spread : decayed;
  };
  const cand = settleTicks(runs, cell, maxTicks);
  const out = new Float64Array(cand.length);
  for (let n = 0; n < cand.length; n++) out[n] = cand[n] < C_THRESHOLD ? 0 : cand[n];
  return out;
}

export type SoilMode = "port" | "game";

export interface Soil3d {
  runs: TerrainColumns;
  /** Per run, slot-major (`runs.T`·N). */
  moisture: Float64Array;
  contamination: Float64Array;
}

/** Moisture and contamination per run of a map's settled water (per water column id). */
export function soil3d(t: VoxelMasks, wc: WaterColumns, water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; sat?: Uint8Array }, objects: readonly MapObject[] = [], mode: SoilMode = "port"): Soil3d {
  const runs = terrainColumns(t);
  const barrier = soilBarrierCells(t.W, t.H, objects);
  const sat = water.sat ?? columnSaturation(wc, water.depth);
  if (mode === "game")
    return {
      runs,
      moisture: moisture3dGame(runs, wc, water.depth, water.contamination, barrier, sat),
      contamination: contamination3dGame(runs, wc, water.depth, water.contamination, barrier),
    };
  return {
    runs,
    moisture: moisture3d(runs, wc, water.depth, water.contamination, barrier, sat),
    contamination: contamination3d(runs, wc, water.depth, water.contamination, barrier),
  };
}
