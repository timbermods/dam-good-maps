// The game's water rules on a heightfield (PLAN §10; notes/water_and_soil.md, "Simplified water
// simulation spec"): one water column per tile, flows by head difference with momentum, map edges
// that drain except beside a source cell. An exact port of prototype/watersim.py, which reproduced
// the game's own save of a generated map to 0.001 depth after 975 ticks from empty.
//
// Exactness: every operation mirrors the Python in the same order (numpy's elementwise arithmetic
// is plain IEEE double arithmetic, and its axis-0 sums add the four directions in order), so the
// two agree bit for bit on the golden fixtures (tests/unit/water.test.ts). Only + − × ÷, min, max
// and ceil are used (PLAN §2.1), so Node and every browser give the same bytes.
//
// Speed: only an *exact* active list is updated each substep: the tiles with water at the start of
// the substep, their 4-neighbours, and the source tiles. Every other tile is dry and cannot change,
// so the result is identical to updating the whole grid (PLAN §10: a list rebuilt once per tick
// changed the settled volume by 5%).

export const DT = 0.3; // seconds per substep; 2 substeps per 0.6 s tick
export const K = 2.25 * DT; // flow factor, 0.675
export const SPILL = 0.1; // spill threshold onto dry ground of the same floor
export const KEEP = 0.999; // flow momentum kept per substep
export const BAL = 0.8; // outflow balancing against the reverse flow
export const TICKS_PER_DAY = 768;

/** Direction k: 0 = −y, 1 = −x, 2 = +y, 3 = +x; OPP[k] is the reverse direction. */
const OPP = [2, 3, 0, 1];

/** A water emitter: a WaterSource, BadwaterSource, seep, ... as the tiles it emits into. */
export interface Emitter {
  /** Tile indices (y·W + x) the strength is spread over, S/N each. */
  cells: number[];
  /** Blocks of water per second at full strength (0 for sources that are off). */
  strength: number;
  /** Contamination of the emitted water: 0 clean, 1 badwater. */
  contamination: number;
  /** Seeps: off while the water at `anchor` is deeper than `off`, back on below `on`. */
  depthLimit?: { anchor: number; off: number; on: number };
}

export interface WaterModel {
  W: number;
  H: number;
  /** Floor of the water column per tile: the terrain surface, raised by full obstacles. */
  floor: Float64Array;
  /** Height of a partial obstacle (NaturalDam 0.65) above the floor, or −1 where there is none. */
  dam: Float64Array | null;
  /** Every emitter. The out-of-map sides of each emitter tile are walls, also for emitters that
   *  are switched off (WaterMapBoundary decorates every water source). */
  emitters: Emitter[];
  /** Water sealed basins keep from before they were sealed (a carve's oxbow lakes), in order: the
   *  canonical settle starts their tiles from it (prefill.ts). */
  retained?: readonly RetainedWater[];
}

/** Water a sealed basin keeps from before it was sealed (a carve's oxbow lake, D199, D216). With no
 *  source feeding it, a basin cut off from its river would start the canonical settle dry; its
 *  tiles start with the water that stood there instead, up to the surface it had (`floor` plus
 *  `depth`) on the ground as it is now, and it evaporates as the game's water does. Stored with the
 *  operation that sealed it, so the same document always settles the same. */
export interface RetainedWater {
  /** Tile indices, ascending. */
  tiles: readonly number[];
  /** Each tile's floor when the water was kept. */
  floor: readonly number[];
  depth: readonly number[];
  contamination: readonly number[];
}

/** Two models keep the same retained water. */
export function sameRetained(a: readonly RetainedWater[] | undefined, b: readonly RetainedWater[] | undefined): boolean {
  if (a === b) return true;
  if (!a?.length || !b?.length) return !a?.length && !b?.length;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface WaterState {
  depth: Float64Array;
  contamination: Float64Array;
}

export class WaterSim {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  readonly F: Float64Array;
  readonly dam: Float64Array | null;
  readonly emitters: Emitter[];
  D: Float64Array;
  Dold: Float64Array;
  C: Float64Array;
  /** Stored outflow momentum, 4 per tile (index 4·i + k). */
  readonly out: Float64Array;
  ticks = 0;

  /** Wall bits per tile: bit k set = the out-of-map neighbour in direction k is solid. */
  private readonly wall: Uint8Array;
  private readonly f: Float64Array;
  private readonly Cnew: Float64Array;
  private readonly mod: Float64Array;
  private readonly wn: Int32Array;
  private readonly mark: Int32Array;
  private stamp = 0;
  private wet: Int32Array;
  private wetCount = 0;
  private prevWet: Int32Array;
  private prevWetCount = 0;
  private active: Int32Array;
  private activeCount = 0;
  private modSet: Int32Array;
  private modSetCount = 0;
  private readonly sourceCells: Int32Array;
  /** Seep on/off state per emitter (1 = on). */
  private readonly seepOn: Uint8Array;

  constructor(model: WaterModel, initial?: WaterState) {
    const { W, H } = model;
    const N = W * H;
    this.W = W;
    this.H = H;
    this.N = N;
    this.F = model.floor;
    this.dam = model.dam;
    this.emitters = model.emitters;
    this.D = new Float64Array(N);
    this.Dold = new Float64Array(N);
    this.C = new Float64Array(N);
    if (initial) {
      this.D.set(initial.depth);
      this.C.set(initial.contamination);
    }
    this.out = new Float64Array(4 * N);
    this.f = new Float64Array(4 * N);
    this.Cnew = new Float64Array(N);
    this.mod = new Float64Array(N).fill(1);
    this.wn = new Int32Array(N);
    this.mark = new Int32Array(N);
    this.wet = new Int32Array(N);
    this.prevWet = new Int32Array(N);
    this.active = new Int32Array(N);
    this.modSet = new Int32Array(N);
    this.seepOn = new Uint8Array(model.emitters.length).fill(1);
    // the map edge drains water, except the padding next to a source cell, which is solid
    this.wall = new Uint8Array(N);
    const cells: number[] = [];
    const seen = new Uint8Array(N);
    for (const e of model.emitters) {
      for (const i of e.cells) {
        const x = i % W;
        const y = (i - x) / W;
        if (y === 0) this.wall[i] |= 1;
        if (x === 0) this.wall[i] |= 2;
        if (y === H - 1) this.wall[i] |= 4;
        if (x === W - 1) this.wall[i] |= 8;
        if (!seen[i]) {
          seen[i] = 1;
          cells.push(i);
        }
      }
    }
    this.sourceCells = Int32Array.from(cells);
    for (let i = 0; i < N; i++) if (this.D[i] > 0) this.wet[this.wetCount++] = i;
  }

  /** Cluster saturation per wet tile (0 elsewhere): WN = 1 + wet 8-neighbours,
   *  sat = min(8, max(WN, max over 4-neighbours of WN − 1)). */
  saturation(): Uint8Array {
    const sat = new Uint8Array(this.N);
    this.computeWn();
    for (let k = 0; k < this.wetCount; k++) {
      const i = this.wet[k];
      sat[i] = this.satAt(i);
    }
    return sat;
  }

  private computeWn(): void {
    const { W, H, D, wn } = this;
    for (let k = 0; k < this.wetCount; k++) {
      const i = this.wet[k];
      const x = i % W;
      const y = (i - x) / W;
      let c = 1;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx >= 0 && xx < W && D[yy * W + xx] > 0) c++;
        }
      }
      wn[i] = c;
    }
  }

  private satAt(i: number): number {
    const { W, H, D, wn } = this;
    const x = i % W;
    const y = (i - x) / W;
    let best = wn[i];
    if (y > 0 && D[i - W] > 0 && wn[i - W] - 1 > best) best = wn[i - W] - 1;
    if (x > 0 && D[i - 1] > 0 && wn[i - 1] - 1 > best) best = wn[i - 1] - 1;
    if (y < H - 1 && D[i + W] > 0 && wn[i + W] - 1 > best) best = wn[i + W] - 1;
    if (x < W - 1 && D[i + 1] > 0 && wn[i + 1] - 1 > best) best = wn[i + 1] - 1;
    return best < 8 ? best : 8;
  }

  /** The evaporation modifier from cluster saturation, recomputed once per tick. */
  private updateEvapMod(): void {
    const mod = this.mod;
    for (let k = 0; k < this.modSetCount; k++) mod[this.modSet[k]] = 1;
    this.modSetCount = 0;
    this.computeWn();
    for (let k = 0; k < this.wetCount; k++) {
      const i = this.wet[k];
      const t = 10 - this.satAt(i);
      mod[i] = 0.0595 * (t * t) + 0.101 * t + 0.72;
      this.modSet[this.modSetCount++] = i;
    }
  }

  private buildActive(): void {
    const { W, H, mark } = this;
    const s = ++this.stamp;
    let n = 0;
    const act = this.active;
    const add = (i: number) => {
      if (mark[i] !== s) {
        mark[i] = s;
        act[n++] = i;
      }
    };
    for (let k = 0; k < this.wetCount; k++) {
      const i = this.wet[k];
      add(i);
      const x = i % W;
      const y = (i - x) / W;
      if (y > 0) add(i - W);
      if (x > 0) add(i - 1);
      if (y < H - 1) add(i + W);
      if (x < W - 1) add(i + 1);
    }
    for (let k = 0; k < this.sourceCells.length; k++) add(this.sourceCells[k]);
    this.activeCount = n;
  }

  private substep(scale: number): void {
    const { W, H, F, D, C, out, f, wall, mod, dam } = this;
    // flows of the tiles that had water last substep are stale: clear them
    for (let k = 0; k < this.prevWetCount; k++) {
      const b = 4 * this.prevWet[k];
      f[b] = 0;
      f[b + 1] = 0;
      f[b + 2] = 0;
      f[b + 3] = 0;
    }
    this.buildActive();

    // 1. outflows of every wet tile, from the start-of-substep state
    for (let w = 0; w < this.wetCount; w++) {
      const c = this.wet[w];
      const x = c % W;
      const y = (c - x) / W;
      const Fc = F[c];
      const Dc = D[c];
      const Hc = Fc + Dc;
      const b = 4 * c;
      for (let k = 0; k < 4; k++) {
        let n = -1;
        if (k === 0) n = y > 0 ? c - W : -1;
        else if (k === 1) n = x > 0 ? c - 1 : -1;
        else if (k === 2) n = y < H - 1 ? c + W : -1;
        else n = x < W - 1 ? c + 1 : -1;
        const inside = n >= 0;
        const Fn = inside ? F[n] : 0;
        const Dn = inside ? D[n] : 0;
        const Hn = inside ? Fn + Dn : 0;
        if (wall[c] & (1 << k) || Fn >= Hc) {
          f[b + k] = 0;
          continue;
        }
        let e = Hc - Hn;
        const prev = KEEP * out[b + k];
        let fk: number;
        const lim = inside && dam ? dam[n] : -1;
        if (lim >= 0 && Fn < Math.ceil(Hc)) {
          // a partial obstacle (NaturalDam) in the target tile
          const hd = Hc - Fn;
          if (hd < lim) {
            const a = clamp01(clamp01((lim - hd) / 0.1) * clamp(1 - 2.25 * (Hc - (Fc + this.Dold[c])), 0.5, 2));
            fk = 0.995 * prev - 0.02 * a;
          } else {
            if (hd - lim < 0.1 && e > 0) e = e * ((hd - lim) / 0.1);
            fk = 0.995 * prev + K * e;
          }
        } else {
          if (inside && Dn === 0 && Fn === Fc) e = e - SPILL;
          fk = prev + K * e;
        }
        f[b + k] = fk > 0 ? fk : 0;
      }
      // a tile never gives more than it has
      const s = f[b] + f[b + 1] + f[b + 2] + f[b + 3];
      if (s * DT > Dc) {
        const r = Dc / Math.max(s * DT, 1e-12);
        f[b] *= r;
        f[b + 1] *= r;
        f[b + 2] *= r;
        f[b + 3] *= r;
      }
    }

    // 2. depth, contamination and stored momentum of every active tile
    const Cnew = this.Cnew;
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      const x = c % W;
      const y = (c - x) / W;
      const b = 4 * c;
      const n0 = y > 0 ? c - W : -1;
      const n1 = x > 0 ? c - 1 : -1;
      const n2 = y < H - 1 ? c + W : -1;
      const n3 = x < W - 1 ? c + 1 : -1;
      // inflow from direction k is the neighbour's outflow in the opposite direction
      const in0 = n0 >= 0 ? f[4 * n0 + 2] : 0;
      const in1 = n1 >= 0 ? f[4 * n1 + 3] : 0;
      const in2 = n2 >= 0 ? f[4 * n2 + 0] : 0;
      const in3 = n3 >= 0 ? f[4 * n3 + 1] : 0;
      const f0 = f[b];
      const f1 = f[b + 1];
      const f2 = f[b + 2];
      const f3 = f[b + 3];
      const outsum = f0 + f1 + f2 + f3;
      const insum = in0 + in1 + in2 + in3;
      const cin =
        0 +
        in0 * (n0 >= 0 ? C[n0] : 0) +
        in1 * (n1 >= 0 ? C[n1] : 0) +
        in2 * (n2 >= 0 ? C[n2] : 0) +
        in3 * (n3 >= 0 ? C[n3] : 0);
      const Dc = D[c];
      const rem0 = Dc - outsum * DT;
      const remaining = rem0 > 0 ? rem0 : 0;
      out[b] = Math.max(0, f0 - BAL * in0);
      out[b + 1] = Math.max(0, f1 - BAL * in1);
      out[b + 2] = Math.max(0, f2 - BAL * in2);
      out[b + 3] = Math.max(0, f3 - BAL * in3);
      this.Dold[c] = Dc;
      let net = insum - outsum;
      if (Dc > 0) net = net - (Dc < 0.02 ? 1e-3 : 1e-4) * mod[c];
      const d1 = Dc + net * DT;
      const newD = d1 > 0 ? d1 : 0;
      const mass = C[c] * remaining + cin * DT;
      Cnew[c] = newD > 1e-9 ? clamp01(mass / Math.max(newD, 1e-9)) : 0;
      D[c] = newD;
    }
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      C[c] = Cnew[c];
    }

    // 3. sources add dt·S/N to each of their tiles
    for (let e = 0; e < this.emitters.length; e++) {
      const src = this.emitters[e];
      if (!this.seepOn[e]) continue;
      const add = (DT * src.strength * scale) / src.cells.length;
      if (!(add > 0)) continue; // a source that is off (or a drought) adds nothing
      for (const i of src.cells) {
        const d0 = D[i];
        C[i] = (C[i] * d0 + src.contamination * add) / (d0 + add);
        D[i] = d0 + add;
      }
    }

    // the wet list for the next substep: every wet tile is in the active list
    const t = this.prevWet;
    this.prevWet = this.wet;
    this.prevWetCount = this.wetCount;
    this.wet = t;
    let n = 0;
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      if (D[c] > 0) this.wet[n++] = c;
    }
    this.wetCount = n;
  }

  /** Seeps switch off above their depth limit and back on below the restart depth. */
  private updateSeeps(): void {
    for (let e = 0; e < this.emitters.length; e++) {
      const lim = this.emitters[e].depthLimit;
      if (!lim) continue;
      const d = this.D[lim.anchor];
      if (d > lim.off) this.seepOn[e] = 0;
      else if (d < lim.on) this.seepOn[e] = 1;
    }
  }

  /** Run `ticks` ticks (2 substeps each). `strengthScale` scales every source (0 = drought). */
  run(ticks: number, strengthScale = 1): this {
    for (let t = 0; t < ticks; t++) {
      this.updateSeeps();
      this.updateEvapMod();
      this.substep(strengthScale);
      this.substep(strengthScale);
      this.ticks++;
    }
    return this;
  }

  /** Total water, summed in index order (numpy's cumsum order, used by the Python oracle). */
  volume(): number {
    let s = 0;
    for (let i = 0; i < this.N; i++) s += this.D[i];
    return s;
  }

  state(): WaterState {
    return { depth: this.D.slice(), contamination: this.C.slice() };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ------------------------------------------------------------------------------------------ settle

export interface SettleOptions {
  /** Give up after this many game days (PLAN §11.3: 4). */
  maxDays?: number;
  /** Largest depth change between checks that counts as still (PLAN §11.3: 0.005). */
  tol?: number;
  /** Ticks between checks (PLAN §11.3: 128). */
  checkEvery?: number;
  /** Share of tiles that may still move by more than `tol` (PLAN §11.3: 0.005). */
  movedShare?: number;
}

export interface SettleResult {
  settled: boolean;
  ticks: number;
}

/** Run with sources on until the water stops changing (PLAN §11.3): between two checks 128 ticks
 *  apart, the total volume changes by under 0.2% and at least 99.5% of tiles change by at most
 *  `tol`. A strict max-change test never passes: thin sheets at spill thresholds keep flickering
 *  by a few hundredths. */
export function settle(sim: WaterSim, opts: SettleOptions = {}): SettleResult {
  const run = new SettleRun(sim, opts);
  let out: SettleResult | null = null;
  while (!out) out = run.advance(Infinity);
  return out;
}

/** The settle of `settle`, in steps: `advance` runs at most the ticks it is given and stops at the
 *  check that settles, so the editor's worker can run the canonical settle a slice at a time,
 *  answer the page between slices, and give up when a newer edit arrives (EDITOR_PLAN §6). The
 *  ticks and the checks are the same whatever the slices, so the result is too. */
export class SettleRun {
  readonly every: number;
  readonly checks: number;
  private readonly tol: number;
  private readonly movedShare: number;
  private prev: Float64Array;
  private prevVol: number;
  private k = 0;
  private sinceCheck = 0;
  private result: SettleResult | null = null;

  constructor(
    readonly sim: WaterSim,
    opts: SettleOptions = {},
  ) {
    const maxDays = opts.maxDays ?? 4;
    this.tol = opts.tol ?? 0.005;
    this.movedShare = opts.movedShare ?? 0.005;
    this.every = opts.checkEvery ?? 128;
    this.checks = Math.floor((maxDays * TICKS_PER_DAY) / this.every);
    this.prev = sim.D.slice();
    this.prevVol = sim.volume();
    if (this.checks <= 0) this.result = { settled: false, ticks: sim.ticks };
  }

  /** The most ticks the settle can take. */
  get maxTicks(): number {
    return this.checks * this.every;
  }

  /** Ticks run so far, and whether it has finished. */
  get ticks(): number {
    return this.k * this.every + this.sinceCheck;
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
      const prev = this.prev;
      for (let i = 0; i < sim.N; i++) if (Math.abs(D[i] - prev[i]) > this.tol) moved++;
      this.k++;
      if (dv < 0.002 && moved <= this.movedShare * sim.N) this.result = { settled: true, ticks: sim.ticks };
      else if (this.k >= this.checks) this.result = { settled: false, ticks: sim.ticks };
      else {
        this.prev = D.slice();
        this.prevVol = vol;
      }
    }
    return this.result;
  }
}
