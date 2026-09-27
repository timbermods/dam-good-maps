// The canonical settle on stacked columns (D120, D27's shape; investigation/terrain3d/DESIGN.md §3.3,
// from the investigation's proto/prefill3d.ts): the water written into a file starts from a state
// computed from the terrain and the sources alone, then runs the exact simulation until the settle
// test passes. It is sim/prefill.ts's algorithm with columns as nodes and "the two columns overlap"
// (StackSim's edges) as the link, so on a heightfield, one column per tile, it gives the same
// numbers in the same order (the heap breaks ties by id, and slot 0's ids are the tile indices).
//
// - Spill levels: a priority flood from the columns of edge tiles that drain into the padding (an
//   emitter's edge tile is walled off). A column's level is the highest of its floor (raised by a
//   partial obstacle there) and the level it was reached from. A level above the column's ceiling
//   means it is full and under pressure: its head is ceiling + 8 × overflow. Columns no outlet
//   reaches (a sealed cave) keep their floor level: they start empty.
// - Paths: from every running emitter, water walks to overlapping columns whose spill level is not
//   higher. A column on a path below its spill level starts full (with overflow up to the cap); the
//   others start at min(1, 0.3·Q/w), w the shorter of the x and y runs of such columns through it.
// - A sealed basin then starts with the water it kept (the model's `retained`, on its tiles' top
//   columns).
// - The settle test (PLAN §11.3), counted over columns: between two checks 128 ticks apart the
//   volume changes by under 0.2%, and at most 0.5% of the map's tiles' worth of columns move by
//   more than 0.005. It runs in slices (`StackSettleRun.advance`), so the page can show its progress
//   and answer between slices while cave water settles (the official maps with the most water take
//   7–17 s of CPU); the result is the same whatever the slices.

import { MinHeap } from "../math/grid";
import { OPEN_CEILING } from "./columns";
import { MAX_PRESSURE, PRESSURE, SINK, StackSim, TICKS_PER_DAY, type StackMode, type StackModel, type StackState } from "./stack";
import type { SettleOptions, SettleResult } from "./water";

/** Spill level of every column id (0 on ids beyond a tile's columns). */
export function stackSpillLevels(sim: StackSim): Float64Array {
  const { N, M, W, H, Fl } = sim;
  const cols = sim.cols;
  const level = new Float64Array(M);
  for (let c = 0; c < M; c++) {
    const i = c % N;
    if ((c - i) / N >= cols.count[i]) continue;
    let lim = 0;
    if (cols.heightLimit) {
      const v = cols.heightLimit.get(Fl[c] * N + i);
      if (v !== undefined) lim = v;
    }
    level[c] = Fl[c] + lim;
  }
  const filled = level.slice();
  const seen = new Uint8Array(M);
  const heap = new MinHeap();
  // the outlets: columns of edge tiles with an edge into the padding, in column id order
  for (let s = 0; s < cols.L; s++) {
    for (let i = 0; i < N; i++) {
      if (s >= cols.count[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (!(x === 0 || y === 0 || x === W - 1 || y === H - 1)) continue;
      const c = s * N + i;
      let outlet = false;
      for (let e = sim.eStart[c]; e < sim.eStart[c + 1]; e++) if (sim.eTarget[e] === SINK) outlet = true;
      if (!outlet) continue;
      seen[c] = 1;
      heap.push(filled[c], c);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const lv = heap.lastKey;
    for (let e = sim.eStart[c]; e < sim.eStart[c + 1]; e++) {
      const t = sim.eTarget[e];
      if (t < 0 || seen[t]) continue;
      seen[t] = 1;
      if (filled[t] < lv) filled[t] = lv;
      heap.push(filled[t], t);
    }
  }
  return filled;
}

/** The deterministic starting state of the canonical settle (see the file comment). */
export function stackPrefill(sim: StackSim, retained: StackModel["retained"] = undefined): StackState {
  const { N, M, Fl, Ce } = sim;
  const spill = stackSpillLevels(sim);
  // flow through each column: the strength of every emitter whose water passes it
  const q = new Float64Array(M);
  const qBad = new Float64Array(M);
  const path = new Uint8Array(M);
  const mark = new Int32Array(M);
  const queue = new Int32Array(M);
  let stamp = 0;
  for (const em of sim.emitters) {
    if (!(em.strength > 0)) continue;
    stamp++;
    let head = 0;
    let tail = 0;
    for (const c of em.cols)
      if (mark[c] !== stamp) {
        mark[c] = stamp;
        queue[tail++] = c;
      }
    while (head < tail) {
      const c = queue[head++];
      q[c] += em.strength;
      if (em.contamination > 0) qBad[c] += em.strength * em.contamination;
      path[c] = 1;
      for (let e = sim.eStart[c]; e < sim.eStart[c + 1]; e++) {
        const t = sim.eTarget[e];
        if (t < 0 || mark[t] === stamp || spill[t] > spill[c]) continue;
        mark[t] = stamp;
        queue[tail++] = t;
      }
    }
  }
  // open-channel columns (on a path, not in a depression), and their runs along x and y: through
  // the first open column of the tile beside them that overlaps them (on a heightfield, the tile
  // runs of sim/prefill.ts)
  const open = new Uint8Array(M);
  for (let c = 0; c < M; c++) open[c] = path[c] && !(spill[c] > Fl[c]) ? 1 : 0;
  const next = (c: number, k: number): number => {
    for (let e = sim.eStart[c]; e < sim.eStart[c + 1]; e++) {
      if (sim.eDir[e] !== k) continue;
      const t = sim.eTarget[e];
      if (t >= 0 && open[t]) return t;
    }
    return -1;
  };
  // the number of steps from c in direction k before the chain of open columns ends, memoized (a
  // chain moves one tile a step in one direction, so it never loops)
  const chain = [new Int32Array(M).fill(-1), new Int32Array(M).fill(-1), new Int32Array(M).fill(-1), new Int32Array(M).fill(-1)];
  const stack: number[] = [];
  const chainLen = (c0: number, k: number): number => {
    const memo = chain[k];
    let c = c0;
    let n = 0;
    while (memo[c] < 0) {
      const t = next(c, k);
      if (t < 0) {
        memo[c] = 0;
        break;
      }
      stack.push(c);
      c = t;
    }
    n = memo[c];
    while (stack.length) {
      n++;
      memo[stack.pop()!] = n;
    }
    return memo[c0];
  };
  const depth = new Float64Array(M);
  const overflow = new Float64Array(M);
  const contamination = new Float64Array(M);
  for (let c = 0; c < M; c++) {
    if (!path[c]) continue;
    let d: number;
    const cap = Ce[c] - Fl[c];
    if (spill[c] > Fl[c]) {
      d = spill[c] - Fl[c];
      if (d > cap) {
        if (Ce[c] < OPEN_CEILING) {
          const o = (spill[c] - Ce[c]) / PRESSURE;
          const maxO = (MAX_PRESSURE - Ce[c]) / PRESSURE;
          overflow[c] = o > maxO ? maxO : o;
        }
        d = cap;
      }
    } else {
      const rx = 1 + chainLen(c, 1) + chainLen(c, 3);
      const ry = 1 + chainLen(c, 0) + chainLen(c, 2);
      const w = rx < ry ? rx : ry;
      d = (0.3 * q[c]) / w;
      if (d > 1) d = 1;
      if (d > cap) d = cap;
    }
    depth[c] = d;
    contamination[c] = d > 0 && q[c] > 0 ? qBad[c] / q[c] : 0;
  }
  // a sealed basin starts with the water it kept, up to the surface it had, on its tiles' top columns
  const cols = sim.cols;
  for (const lake of retained ?? [])
    for (let k = 0; k < lake.tiles.length; k++) {
      const i = lake.tiles[k];
      const c = (cols.count[i] - 1) * N + i;
      if (Fl[c] === lake.floor[k]) {
        depth[c] = lake.depth[k];
        contamination[c] = lake.contamination[k];
      } else {
        let d = lake.floor[k] + lake.depth[k] - Fl[c];
        if (d > Ce[c] - Fl[c]) d = Ce[c] - Fl[c];
        depth[c] = d > 0 ? d : 0;
        contamination[c] = d > 0 ? lake.contamination[k] : 0;
      }
    }
  return { depth, overflow, contamination };
}

/** The top columns of a model's sealed basins (its `retained` water), ascending; undefined when it
 *  has none, which leaves the settle exactly as it was. */
export function stackSealedColumns(m: StackModel): number[] | undefined {
  if (!m.retained?.length) return undefined;
  const { N, count } = m.cols;
  const all = new Set<number>();
  for (const r of m.retained) for (const i of r.tiles) all.add((count[i] - 1) * N + i);
  return [...all].sort((a, b) => a - b);
}

/** Whether the water changed between two checks only by sealed basins evaporating (D222; water.ts
 *  `steadyApartFromSealed` on columns). A sealed basin is the water round a basin's kept columns
 *  (linked columns wet at either check) while it holds no running source's column and touches no
 *  map edge; its columns that lost water are left out of the settle's test. */
export function stackSteadyApartFromSealed(sim: StackSim, prevD: Float64Array, prevO: Float64Array, vol: number, sealed: readonly number[], tol: number, movedShare: number): boolean {
  const { W, H, N, M, D, O } = sim;
  const feeds = new Uint8Array(M);
  for (const e of sim.emitters) if (e.strength > 0) for (const c of e.cols) feeds[c] = 1;
  const wet = (c: number) => D[c] > 0 || prevD[c] > 0;
  const drying = new Uint8Array(M);
  const seen = new Uint8Array(M);
  const queue = new Int32Array(M);
  for (const s of sealed) {
    if (seen[s] || !wet(s)) continue;
    seen[s] = 1;
    queue[0] = s;
    let tail = 1;
    let open = false;
    for (let h = 0; h < tail; h++) {
      const c = queue[h];
      const i = c % N;
      const x = i % W;
      const y = (i - x) / W;
      if (feeds[c] || x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
      for (let e = sim.eStart[c]; e < sim.eStart[c + 1]; e++) {
        const t = sim.eTarget[e];
        if (t < 0 || seen[t] || !wet(t)) continue;
        seen[t] = 1;
        queue[tail++] = t;
      }
    }
    if (open) continue;
    for (let h = 0; h < tail; h++) {
      const c = queue[h];
      if (!(D[c] > prevD[c])) drying[c] = 1;
    }
  }
  let rest = 0;
  let restPrev = 0;
  let moved = 0;
  for (let c = 0; c < M; c++) {
    if (drying[c]) continue;
    rest += D[c] + O[c];
    restPrev += prevD[c] + prevO[c];
    if (Math.abs(D[c] - prevD[c]) > tol) moved++;
  }
  const dv = Math.abs(rest - restPrev) / Math.max(vol, 1e-9);
  return dv < 0.002 && moved <= movedShare * N;
}

/** Run with sources on until the water stops changing (see the file comment), in slices: `advance`
 *  runs at most the ticks it is given and stops at the check that settles. The ticks and the checks
 *  are the same whatever the slices, so the result is too. `progress` (0–1) is for the page. */
export class StackSettleRun {
  readonly every: number;
  readonly checks: number;
  private readonly tol: number;
  private readonly movedShare: number;
  private readonly sealed: readonly number[] | null;
  private readonly untilSteady: boolean;
  private steadyTicks: number | undefined;
  private prevD: Float64Array;
  private prevO: Float64Array;
  private prevVol: number;
  private k = 0;
  private sinceCheck = 0;
  private result: SettleResult | null = null;

  constructor(
    readonly sim: StackSim,
    opts: SettleOptions = {},
  ) {
    const maxDays = opts.maxDays ?? 4;
    this.tol = opts.tol ?? 0.005;
    this.movedShare = opts.movedShare ?? 0.005;
    this.sealed = opts.sealed?.length ? opts.sealed : null;
    this.untilSteady = opts.untilSteady ?? false;
    this.every = opts.checkEvery ?? 128;
    this.checks = Math.floor((maxDays * TICKS_PER_DAY) / this.every);
    this.prevD = sim.D.slice();
    this.prevO = sim.O.slice();
    this.prevVol = sim.volume();
    if (this.checks <= 0) this.result = { settled: false, ticks: sim.ticks };
  }

  /** The most ticks the settle can take. */
  get maxTicks(): number {
    return this.checks * this.every;
  }

  /** Ticks run so far. */
  get ticks(): number {
    return this.k * this.every + this.sinceCheck;
  }

  /** How far the settle has gone, 0–1: 1 once it has finished (it usually stops well before its
   *  most ticks, so the page shows this against a time, not as a promise). */
  get progress(): number {
    return this.result ? 1 : this.maxTicks > 0 ? this.ticks / this.maxTicks : 1;
  }

  get done(): SettleResult | null {
    return this.result;
  }

  /** Run at most `ticks` more ticks; the result when the settle has finished, else null. */
  advance(ticks: number): SettleResult | null {
    const sim = this.sim;
    let left = ticks;
    while (!this.result && left > 0) {
      const n = Math.min(left, this.every - this.sinceCheck);
      sim.run(n);
      this.sinceCheck += n;
      left -= n;
      if (this.sinceCheck < this.every) break;
      this.sinceCheck = 0;
      const vol = sim.volume();
      const dv = Math.abs(vol - this.prevVol) / Math.max(vol, 1e-9);
      let moved = 0;
      const D = sim.D;
      const prev = this.prevD;
      for (let c = 0; c < sim.M; c++) if (Math.abs(D[c] - prev[c]) > this.tol) moved++;
      this.k++;
      if (dv < 0.002 && moved <= this.movedShare * sim.N) this.result = { settled: true, ticks: sim.ticks };
      else {
        if (this.sealed && this.steadyTicks === undefined && stackSteadyApartFromSealed(sim, prev, this.prevO, vol, this.sealed, this.tol, this.movedShare)) {
          this.steadyTicks = sim.ticks;
          if (this.untilSteady) this.result = { settled: false, ticks: sim.ticks, steadyTicks: sim.ticks };
        }
        if (!this.result && this.k >= this.checks) this.result = { settled: false, ticks: sim.ticks, ...(this.steadyTicks !== undefined ? { steadyTicks: this.steadyTicks } : {}) };
      }
      if (!this.result) {
        this.prevD = D.slice();
        this.prevO = sim.O.slice();
        this.prevVol = vol;
      }
    }
    return this.result;
  }
}

export interface CanonicalStackWater extends SettleResult {
  /** Per column id (slot·N + tile). */
  depth: Float64Array;
  overflow: Float64Array;
  contamination: Float64Array;
  /** Cluster saturation of the settled water, per column id (moisture and evaporation). */
  sat: Uint8Array;
  /** The settled momentum, per edge of the engine (`StackSim.out`). */
  out: Float64Array;
  /** The engine the water settled in: its columns and edges, for the writer. */
  sim: StackSim;
}

export interface CanonicalStackRun {
  /** Run at most `ticks` more ticks; the settled water once finished, else null. */
  advance(ticks: number): CanonicalStackWater | null;
  readonly ticks: number;
  readonly maxTicks: number;
  /** 0–1, for the page's progress. */
  readonly progress: number;
}

/** The canonical settle in slices: the pre-fill, then the exact simulation until it settles (at
 *  most `maxDays`, 4 by default, checked every 128 ticks). The same model always gives the same
 *  bytes, whatever the slices. "game" mode is the game's rules (D120); "port" mode gives exactly
 *  sim/prefill.ts `canonicalRun`'s water on a heightfield. */
export function canonicalStackRun(m: StackModel, opts: { mode?: StackMode; maxDays?: number } = {}): CanonicalStackRun {
  const sim = new StackSim(m, opts.mode ?? "game");
  sim.setState(stackPrefill(sim, m.retained));
  const run = new StackSettleRun(sim, { sealed: stackSealedColumns(m), ...(opts.maxDays !== undefined ? { maxDays: opts.maxDays } : {}) });
  let done: CanonicalStackWater | null = null;
  return {
    advance(ticks: number): CanonicalStackWater | null {
      if (done) return done;
      const r = run.advance(ticks);
      if (r) done = { ...r, depth: sim.D, overflow: sim.O, contamination: sim.C, sat: sim.saturation(), out: sim.out.slice(), sim };
      return done;
    },
    get ticks() {
      return run.ticks;
    },
    get maxTicks() {
      return run.maxTicks;
    },
    get progress() {
      return run.progress;
    },
  };
}

/** The canonical settle in one go (`canonicalStackRun` to the end). */
export function canonicalStackSettle(m: StackModel, opts: { mode?: StackMode; maxDays?: number } = {}): CanonicalStackWater {
  const run = canonicalStackRun(m, opts);
  let r = run.advance(Infinity);
  while (!r) r = run.advance(Infinity);
  return r;
}
