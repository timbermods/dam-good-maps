// The game's water rules on stacked columns (D120; investigation/terrain3d/GAME_RULES.md §3; ported
// from the investigation's proto/stackwater.ts): every air gap of a tile is a water column
// [floor, ceiling) (sim/columns.ts), and water moves only sideways, between columns of 4-neighbour
// tiles whose ranges overlap, never up or down within a tile. A column filled to its ceiling keeps
// the excess as overflow: pressure that counts 8× in the head, and whose share of a flow is divided
// by 8. Overflow is capped at (34 − ceiling)/8 and the rest is destroyed.
//
// The rules (Timberborn 1.1.2.4, read from the decompiled code; described, not copied):
// - `OutflowsUpdateTask.Outflow`/`GetOutflow`: for each wet column and each neighbour column, in
//   direction order (−y, −x, +y, +x) and slot order, skip columns whose ceiling is at or below the
//   origin's floor, and stop at the first whose floor is at or above the origin's surface. Flow =
//   0.999 × the stored momentum + 2.25·dt × the head difference, the pressure part of it divided by
//   8. Partial obstacles (height limits, looked up from the higher floor to the ceiled surface) and
//   direction limiters as in the game. Flows beyond what the column holds are scaled down.
// - `WaterParametersUpdateTask`: net flow minus evaporation (on every active column, dry or not),
//   times dt, through `WaterDepthSetter`; the momentum kept is max(0, f − 0.8 × the reverse flow),
//   per target column.
// - `UpdateWaterSourcesTask`: dt·S/N into the column that holds the source's cell; it sets the old
//   depth too.
// - The evaporation modifier (`WateredNeighborsCountingTask`, `ClusterSaturationCalculationTask`):
//   per column, from wet neighbour columns whose air gaps overlap it.
// - The map's padding is an open column that is never updated: it drains every gap that touches the
//   edge, except beside an emitter's tile (`WaterMapBoundary`), with the spill threshold too.
//
// Two modes. "game" (the default, D120) is the game's code. "port" performs, on a tile with one open
// column, exactly the operations of the heightfield port as it was before 3D-a (the five places
// where it simplified the game: evaporation only on wet tiles, no spill threshold at the padding,
// the partial obstacle read at the target's floor, the source step leaving the old depth, and no
// direction limiters); it exists so tests can prove the ports agree bit for bit.
//
// Exactness: only + − × ÷, min, max and ceil (PLAN §2.1), in a fixed order, so Node and every
// browser give the same bytes. Contamination uses the port's volume-weighted mix in both modes (the
// game also diffuses it).
//
// The fast path (level 2; level 1, a whole map of open columns, is stackModel.ts `openFieldModel`):
// a column is fast when its tile and the tile's 8 neighbours are each one open column [floor, 34)
// and neither it nor its 4 neighbours hold a partial obstacle or a direction limiter (every tile of
// a heightfield, and most of a cave map). There the general arithmetic reduces exactly: an open
// column holds no overflow (its water would stand above 34, 12 levels over the highest terrain), so
// the pressure terms are 0 and the head difference is the surfaces' (the guard `FAST_TOP` keeps
// that exact to the last bit); each direction has one target column; a neighbour counts as watered
// when its one column is wet; and its best watered count is that column's own. The edges stay as
// they are, so momentum stays keyed per edge. It gives the general loop's bits
// (tests/unit/stack.test.ts), at the heightfield engine's cost.

import { OPEN_CEILING, type WaterColumns } from "./columns";

export const DT = 0.3;
export const K = 2.25 * DT;
export const SPILL = 0.1;
export const KEEP = 0.999;
export const BAL = 0.8;
/** Overflow counts this many times in the head (`WaterOverflowCalculator`). */
export const PRESSURE = 8;
/** `WaterOverflowCalculator._maxPressure`: the total height + 1. */
export const MAX_PRESSURE = OPEN_CEILING;
export const TICKS_PER_DAY = 768;

export type StackMode = "port" | "game";

export interface StackEmitter {
  /** Column ids (slot·N + tile) the strength is spread over, S/n each. */
  cols: number[];
  /** Every tile of the emitter, those whose cell is inside terrain too (the map-edge walls). */
  tiles: number[];
  /** Blocks of water per second at full strength (0 for sources that are off). */
  strength: number;
  /** 0 clean, 1 badwater. */
  contamination: number;
  /** Seeps: off while the water in the `anchor` column is deeper than `off`, back on below `on`. */
  depthLimit?: { anchor: number; off: number; on: number };
}

export interface StackModel {
  cols: WaterColumns;
  emitters: StackEmitter[];
}

export interface StackState {
  depth: Float64Array;
  overflow: Float64Array;
  contamination: Float64Array;
}

/** The target of an edge into the map's padding. */
export const SINK = -1;

/** The fast path's surfaces stay below this, so its head differences are the general loop's bit for
 *  bit (the pressure terms' comparisons against the ceiling 34 keep their sign); above it a column
 *  takes the general loop. Water never stands this high (terrain tops out at 22). */
const FAST_TOP = 33;

export interface StackOptions {
  /** The fast path for one-column tiles (default on). Off only to prove it gives the same bits. */
  fast?: boolean;
}

export class StackSim {
  readonly N: number;
  readonly W: number;
  readonly H: number;
  /** Column ids: L·N. */
  readonly M: number;
  readonly cols: WaterColumns;
  readonly mode: StackMode;
  readonly emitters: StackEmitter[];
  readonly Fl: Int16Array;
  readonly Ce: Int16Array;
  D: Float64Array;
  O: Float64Array;
  Dold: Float64Array;
  C: Float64Array;
  ticks = 0;

  /** Edges: the static candidate pairs of overlapping columns, grouped by origin column, in
   *  direction then slot order; `eTarget` SINK is the padding. */
  readonly eStart: Int32Array;
  readonly eTarget: Int32Array;
  readonly eDir: Uint8Array;
  readonly eRev: Int32Array;
  /** Momentum kept per edge (the game's ColumnOutflows, keyed by target column). */
  readonly out: Float64Array;
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
  private readonly sourceCols: Int32Array;
  private readonly seepOn: Uint8Array;
  /** Tiles that hold a partial obstacle or a direction limiter at some z (null when none). */
  private readonly limited: Uint8Array | null;
  /** Per tile: its one column takes the fast path (null when the fast path is off). */
  readonly fast: Uint8Array | null;

  constructor(model: StackModel, mode: StackMode = "game", opts: StackOptions = {}) {
    const wc = model.cols;
    this.cols = wc;
    this.mode = mode;
    this.W = wc.W;
    this.H = wc.H;
    this.N = wc.N;
    this.M = wc.L * wc.N;
    this.Fl = wc.floor;
    this.Ce = wc.ceil;
    this.emitters = model.emitters;
    const { W, H, N, M } = this;
    this.D = new Float64Array(M);
    this.O = new Float64Array(M);
    this.Dold = new Float64Array(M);
    this.C = new Float64Array(M);

    // WaterMapBoundary: the padding beside every emitter tile is solid, also for emitters that are off
    const wall = new Uint8Array(N);
    for (const e of model.emitters) {
      for (const i of e.tiles) {
        const x = i % W;
        const y = (i - x) / W;
        if (y === 0) wall[i] |= 1;
        if (x === 0) wall[i] |= 2;
        if (y === H - 1) wall[i] |= 4;
        if (x === W - 1) wall[i] |= 8;
      }
    }

    // candidate edges, in column id order (slot-major)
    const start = new Int32Array(M + 1);
    const tgt: number[] = [];
    const dir: number[] = [];
    for (let s = 0; s < wc.L; s++) {
      for (let i = 0; i < N; i++) {
        const c = s * N + i;
        start[c] = tgt.length;
        if (s >= wc.count[i]) continue;
        const fc = wc.floor[c];
        const cc = wc.ceil[c];
        const x = i % W;
        const y = (i - x) / W;
        for (let k = 0; k < 4; k++) {
          let n = -1;
          if (k === 0) n = y > 0 ? i - W : -1;
          else if (k === 1) n = x > 0 ? i - 1 : -1;
          else if (k === 2) n = y < H - 1 ? i + W : -1;
          else n = x < W - 1 ? i + 1 : -1;
          if (n < 0) {
            if (!(wall[i] & (1 << k))) {
              tgt.push(SINK);
              dir.push(k);
            }
            continue;
          }
          for (let t = 0; t < wc.count[n]; t++) {
            const id = t * N + n;
            if (wc.ceil[id] <= fc) continue;
            if (wc.floor[id] >= cc) break;
            tgt.push(id);
            dir.push(k);
          }
        }
      }
    }
    start[M] = tgt.length;
    this.eStart = start;
    this.eTarget = Int32Array.from(tgt);
    this.eDir = Uint8Array.from(dir);
    const E = tgt.length;
    const rev = new Int32Array(E).fill(-1);
    for (let c = 0; c < M; c++) {
      for (let e = start[c]; e < start[c + 1]; e++) {
        const t = this.eTarget[e];
        if (t === SINK) continue;
        const back = (this.eDir[e] + 2) & 3;
        for (let r = start[t]; r < start[t + 1]; r++) {
          if (this.eTarget[r] === c && this.eDir[r] === back) {
            rev[e] = r;
            break;
          }
        }
      }
    }
    this.eRev = rev;
    this.out = new Float64Array(E);
    this.f = new Float64Array(E);
    this.Cnew = new Float64Array(M);
    this.mod = new Float64Array(M).fill(1);
    this.wn = new Int32Array(M);
    this.mark = new Int32Array(M);
    this.wet = new Int32Array(M);
    this.prevWet = new Int32Array(M);
    this.active = new Int32Array(M);
    this.modSet = new Int32Array(M);
    this.seepOn = new Uint8Array(model.emitters.length).fill(1);
    const seen = new Uint8Array(M);
    const sc: number[] = [];
    for (const e of model.emitters)
      for (const c of e.cols)
        if (!seen[c]) {
          seen[c] = 1;
          sc.push(c);
        }
    this.sourceCols = Int32Array.from(sc);
    let limited: Uint8Array | null = null;
    for (const m of [wc.heightLimit, wc.dirLimit]) if (m) for (const key of m.keys()) (limited ??= new Uint8Array(N))[key % N] = 1;
    this.limited = limited;

    // the fast path: one open column on the tile and on its 8 neighbours, no limits on it or its 4
    this.fast = null;
    if (opts.fast ?? true) {
      const open = new Uint8Array(N);
      for (let i = 0; i < N; i++) open[i] = wc.count[i] === 1 && wc.ceil[i] === OPEN_CEILING && !(limited && limited[i]) ? 1 : 0;
      const fast = new Uint8Array(N);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!open[i]) continue;
          let ok = true;
          for (let dy = -1; dy <= 1 && ok; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= W) continue;
              if (!open[yy * W + xx]) {
                ok = false;
                break;
              }
            }
          }
          if (ok) fast[i] = 1;
        }
      this.fast = fast;
    }
  }

  /** Start from a state (depth, overflow and contamination per column id). */
  setState(s: StackState): void {
    this.D.set(s.depth);
    this.O.set(s.overflow);
    this.C.set(s.contamination);
    this.Dold.set(s.depth);
    this.wetCount = 0;
    for (let c = 0; c < this.M; c++) if (this.D[c] + this.O[c] > 0) this.wet[this.wetCount++] = c;
  }

  state(): StackState {
    return { depth: this.D.slice(), overflow: this.O.slice(), contamination: this.C.slice() };
  }

  /** Start from stored momentum (a file's `ColumnOutflows`): each entry names its origin column and
   *  its target, a column (slot, tile) or the padding (tile −1, on the origin's side `side`: 0 −y,
   *  1 −x, 2 +y, 3 +x). Returns how many entries fit no edge (0 on the official maps: every stored
   *  target lies on this graph). */
  setMomentum(flows: readonly { from: number; toTile: number; toSlot: number; side?: number; flow: number }[]): number {
    const N = this.N;
    let dropped = 0;
    for (const m of flows) {
      const target = m.toTile < 0 ? SINK : m.toSlot * N + m.toTile;
      let found = -1;
      if (m.from >= 0 && m.from < this.M) {
        for (let e = this.eStart[m.from]; e < this.eStart[m.from + 1]; e++) {
          if (this.eTarget[e] !== target || (target === SINK && m.side !== undefined && this.eDir[e] !== m.side)) continue;
          found = e;
          break;
        }
      }
      if (found >= 0) this.out[found] = m.flow;
      else dropped++;
    }
    return dropped;
  }

  // ------------------------------------------------------------------ evaporation modifier

  /** `IsNeighborWatered`: a neighbour tile counts when one of its wet columns overlaps column c.
   *  Quirk kept: when the neighbour's slot-0 floor is at or above c's floor, only slot 0 is tested. */
  private neighbourWet(c: number, t: number): boolean {
    const { N, Fl, Ce, D } = this;
    const fc = Fl[c];
    const cc = Ce[c];
    if (Fl[t] >= fc) return cc > Fl[t] && D[t] > 0;
    for (let s = this.cols.count[t] - 1; s >= 0; s--) {
      const id = s * N + t;
      if (Fl[id] < cc && Ce[id] > fc && D[id] > 0) return true;
    }
    return false;
  }

  private computeWn(): void {
    const { W, H, N, wn, D } = this;
    const fast = this.fast;
    for (let k = 0; k < this.wetCount; k++) {
      const c = this.wet[k];
      if (!(D[c] > 0)) {
        wn[c] = 0;
        continue;
      }
      const i = c % N;
      const x = i % W;
      const y = (i - x) / W;
      let n = 1;
      if (fast !== null && c < N && fast[c] === 1) {
        // every neighbour is one open column: it is watered when that column is wet
        if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
          n += +(D[c - W - 1] > 0) + +(D[c - W] > 0) + +(D[c - W + 1] > 0) + +(D[c - 1] > 0) + +(D[c + 1] > 0) + +(D[c + W - 1] > 0) + +(D[c + W] > 0) + +(D[c + W + 1] > 0);
        } else {
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const xx = x + dx;
              if (xx >= 0 && xx < W && D[yy * W + xx] > 0) n++;
            }
          }
        }
        wn[c] = n;
        continue;
      }
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx >= 0 && xx < W && this.neighbourWet(c, yy * W + xx)) n++;
        }
      }
      wn[c] = n;
    }
  }

  /** `ClusterSaturationCalculationTask.GetWateredNeighbors`: the largest count among the wet
   *  columns of tile t that overlap column c. */
  private bestWn(c: number, t: number): number {
    const { N, Fl, Ce, D, wn } = this;
    const fc = Fl[c];
    const cc = Ce[c];
    let best = 0;
    for (let s = 0; s < this.cols.count[t]; s++) {
      const id = s * N + t;
      if (D[id] > 0 && wn[id] > best && Ce[id] > fc && Fl[id] < cc) best = wn[id];
    }
    return best;
  }

  private satAt(c: number): number {
    const { W, H, N, wn } = this;
    const i = c % N;
    const x = i % W;
    const y = (i - x) / W;
    let best = wn[c];
    const fast = this.fast;
    if (fast !== null && c < N && fast[c] === 1) {
      // every 4-neighbour is one open column: its best watered count is that column's own
      const D = this.D;
      if (y > 0 && D[c - W] > 0 && wn[c - W] - 1 > best) best = wn[c - W] - 1;
      if (x > 0 && D[c - 1] > 0 && wn[c - 1] - 1 > best) best = wn[c - 1] - 1;
      if (y < H - 1 && D[c + W] > 0 && wn[c + W] - 1 > best) best = wn[c + W] - 1;
      if (x < W - 1 && D[c + 1] > 0 && wn[c + 1] - 1 > best) best = wn[c + 1] - 1;
      return best < 8 ? best : 8;
    }
    if (y > 0) {
      const b = this.bestWn(c, i - W);
      if (b - 1 > best) best = b - 1;
    }
    if (x > 0) {
      const b = this.bestWn(c, i - 1);
      if (b - 1 > best) best = b - 1;
    }
    if (y < H - 1) {
      const b = this.bestWn(c, i + W);
      if (b - 1 > best) best = b - 1;
    }
    if (x < W - 1) {
      const b = this.bestWn(c, i + 1);
      if (b - 1 > best) best = b - 1;
    }
    return best < 8 ? best : 8;
  }

  /** Cluster saturation per column id (0 where dry). */
  saturation(): Uint8Array {
    const sat = new Uint8Array(this.M);
    this.computeWn();
    for (let k = 0; k < this.wetCount; k++) {
      const c = this.wet[k];
      if (this.D[c] > 0) sat[c] = this.satAt(c);
    }
    return sat;
  }

  private updateEvapMod(): void {
    const mod = this.mod;
    for (let k = 0; k < this.modSetCount; k++) mod[this.modSet[k]] = 1;
    this.modSetCount = 0;
    this.computeWn();
    for (let k = 0; k < this.wetCount; k++) {
      const c = this.wet[k];
      if (!(this.D[c] > 0)) continue;
      const t = 10 - this.satAt(c);
      mod[c] = 0.0595 * (t * t) + 0.101 * t + 0.72;
      this.modSet[this.modSetCount++] = c;
    }
  }

  // ------------------------------------------------------------------ one substep

  private buildActive(): void {
    const { mark } = this;
    const s = ++this.stamp;
    let n = 0;
    const act = this.active;
    for (let k = 0; k < this.wetCount; k++) {
      const c = this.wet[k];
      if (mark[c] !== s) {
        mark[c] = s;
        act[n++] = c;
      }
      for (let e = this.eStart[c]; e < this.eStart[c + 1]; e++) {
        const t = this.eTarget[e];
        if (t >= 0 && mark[t] !== s) {
          mark[t] = s;
          act[n++] = t;
        }
      }
    }
    for (let k = 0; k < this.sourceCols.length; k++) {
      const c = this.sourceCols[k];
      if (mark[c] !== s) {
        mark[c] = s;
        act[n++] = c;
      }
    }
    this.activeCount = n;
  }

  /** `FlowLimitCalculator.GetHeightLimit`: the partial obstacle a flow from c into t meets, or −1. */
  private heightLimit(c: number, t: number, Hc: number): number {
    const hl = this.cols.heightLimit!;
    const N = this.N;
    const tile = t % N;
    if (this.mode === "port") {
      const ft = this.Fl[t];
      return ft < Math.ceil(Hc) ? (hl.get(ft * N + tile) ?? -1) : -1;
    }
    const base = Math.max(this.Fl[c], this.Fl[t]);
    const top = Math.ceil(Hc);
    for (let z = base; z < top; z++) {
      const v = hl.get(z * N + tile);
      if (v !== undefined) return v;
    }
    return -1;
  }

  /** `CanInflowInDirection` and `CanOutflowInDirection` of the direction limiters. */
  private dirAllowed(c: number, t: number, k: number): boolean {
    const dl = this.cols.dirLimit;
    if (!dl || this.mode === "port") return true;
    const N = this.N;
    const lt = t >= 0 ? dl.get(this.Fl[t] * N + (t % N)) : undefined;
    if (lt !== undefined && lt !== k) return false;
    const lo = dl.get(this.Fl[c] * N + (c % N));
    if (lo !== undefined && lo !== k && lo !== ((k + 2) & 3)) return false;
    return true;
  }

  private substep(scale: number): void {
    const { Fl, Ce, D, O, C, out, f, mod, eStart, eTarget, eRev, N } = this;
    const game = this.mode === "game";
    const limited = this.limited;
    const fast = this.fast;
    for (let k = 0; k < this.prevWetCount; k++) {
      const c = this.prevWet[k];
      for (let e = eStart[c]; e < eStart[c + 1]; e++) f[e] = 0;
    }
    this.buildActive();

    // 1. outflows of every wet column, from the start-of-substep state
    for (let w = 0; w < this.wetCount; w++) {
      const c = this.wet[w];
      const Fc = Fl[c];
      const Dc = D[c];
      const Oc = O[c];
      const Hc = Fc + Dc;
      const Pc = Oc * PRESSURE;
      const e0 = eStart[c];
      const e1 = eStart[c + 1];
      let s = 0;
      let done = false;
      if (fast !== null && c < N && fast[c] === 1 && Hc < FAST_TOP) {
        // the fast path: no pressure, no limits, one open column in each direction
        done = true;
        for (let e = e0; e < e1; e++) {
          const t = eTarget[e];
          const sink = t === SINK;
          const Ft = sink ? 0 : Fl[t];
          if (Ft >= Hc) {
            f[e] = 0;
            continue;
          }
          const Dt = sink ? 0 : D[t];
          const Ht = Ft + Dt;
          if (Ht >= FAST_TOP) {
            done = false;
            break;
          }
          let ev = Hc - Ht;
          if ((game || !sink) && Dt === 0 && Ft === Fc) ev = ev - SPILL;
          const fk = KEEP * out[e] + K * ev;
          const v = fk > 0 ? fk : 0;
          f[e] = v;
          s += v;
        }
      }
      const lc = !done && limited !== null && limited[c % N] === 1;
      if (!done) s = 0;
      for (let e = done ? e1 : e0; e < e1; e++) {
        const t = eTarget[e];
        const sink = t === SINK;
        const Ft = sink ? 0 : Fl[t];
        const lt = !sink && limited !== null && limited[t % N] === 1;
        if (Ft >= Hc || ((lc || lt) && !this.dirAllowed(c, t, this.eDir[e]))) {
          f[e] = 0;
          continue;
        }
        const Dt = sink ? 0 : D[t];
        const Ot = sink ? 0 : O[t];
        const Ct = sink ? OPEN_CEILING : Ce[t];
        const Ht = Ft + Dt;
        const Pt = Ot * PRESSURE;
        const d5 = Hc + Pc - (Ht + Pt);
        let ev: number;
        if (d5 > 0) {
          const n7 = d5 - (Ct - Ht);
          const n8 = d5 > Pc ? Pc : d5;
          const n9 = n8 > n7 ? n8 : n7;
          ev = d5 - n9 + n9 / PRESSURE;
        } else {
          const n12 = -d5;
          const n13 = n12 - (Ce[c] - Hc);
          const n14 = n12 < Pt ? n12 : Pt;
          const n15 = n14 > n13 ? n14 : n13;
          ev = d5 + n15 - n15 / PRESSURE;
        }
        const prev = KEEP * out[e];
        let fk: number;
        const lim = lt && this.cols.heightLimit ? this.heightLimit(c, t, Hc) : -1;
        if (lim >= 0) {
          const hd = Hc + Pc - Ft;
          if (hd < lim) {
            const a = clamp01(clamp01((lim - hd) / 0.1) * clamp(1 - 2.25 * (Hc - (Fc + this.Dold[c])), 0.5, 2));
            fk = 0.995 * prev - 0.02 * a;
          } else {
            if (hd - lim < 0.1 && ev > 0) ev = ev * ((hd - lim) / 0.1);
            fk = 0.995 * prev + K * ev;
          }
        } else {
          if ((game || !sink) && Dt + Ot === 0 && Ft === Fc) ev = ev - SPILL;
          fk = prev + K * ev;
        }
        const v = fk > 0 ? fk : 0;
        f[e] = v;
        s += v;
      }
      // a column never gives more than it holds
      const have = Dc + Oc;
      if (game) {
        // the game scales by have / (s·dt) when that is under 1, which it is exactly when have is
        // under s·dt (a correctly rounded quotient of doubles a < b stays below 1)
        const sd = s * DT;
        if (s > 0 && have < sd) {
          const r = have / sd;
          for (let e = e0; e < e1; e++) f[e] *= r;
        }
      } else if (s * DT > have) {
        const r = have / Math.max(s * DT, 1e-12);
        for (let e = e0; e < e1; e++) f[e] *= r;
      }
    }

    // 2. depth, overflow, contamination and kept momentum of every active column
    const Cnew = this.Cnew;
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      let outsum = 0;
      let insum = 0;
      let cin = 0;
      for (let e = eStart[c]; e < eStart[c + 1]; e++) {
        const fe = f[e];
        const r = eRev[e];
        const fin = r >= 0 ? f[r] : 0;
        outsum += fe;
        insum += fin;
        if (fin !== 0) cin += fin * C[eTarget[e]];
        out[e] = Math.max(0, fe - BAL * fin);
      }
      const Dc = D[c];
      const Vc = Dc + O[c];
      const rem0 = Vc - outsum * DT;
      const remaining = rem0 > 0 ? rem0 : 0;
      this.Dold[c] = Dc;
      let net = insum - outsum;
      if (game || Dc > 0) net = net - (Dc < 0.02 ? 1e-3 : 1e-4) * mod[c];
      const d1 = Vc + net * DT;
      const tot = d1 > 0 ? d1 : 0;
      const cap = Ce[c] - Fl[c];
      let newD: number;
      if (tot > cap) {
        newD = cap;
        const maxO = (MAX_PRESSURE - Ce[c]) / PRESSURE;
        const o = tot - cap;
        O[c] = o > maxO ? maxO : o;
      } else {
        newD = tot;
        O[c] = 0;
      }
      const vol = newD + O[c];
      const mass = C[c] * remaining + cin * DT;
      Cnew[c] = vol > 1e-9 ? clamp01(mass / Math.max(vol, 1e-9)) : 0;
      D[c] = newD;
    }
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      C[c] = Cnew[c];
    }

    // 3. sources add dt·S/n to the column that holds their cell
    for (let e = 0; e < this.emitters.length; e++) {
      const src = this.emitters[e];
      if (!this.seepOn[e] || !src.cols.length) continue;
      const add = (DT * src.strength * scale) / src.cols.length;
      if (!(add > 0)) continue;
      for (const c of src.cols) {
        const d0 = D[c];
        const v0 = d0 + O[c];
        if (game) this.Dold[c] = d0;
        C[c] = (C[c] * v0 + src.contamination * add) / (v0 + add);
        const tot = v0 + add;
        const cap = Ce[c] - Fl[c];
        if (tot > cap) {
          D[c] = cap;
          const maxO = (MAX_PRESSURE - Ce[c]) / PRESSURE;
          const o = tot - cap;
          O[c] = o > maxO ? maxO : o;
        } else {
          D[c] = tot;
          O[c] = 0;
        }
      }
    }

    const t = this.prevWet;
    this.prevWet = this.wet;
    this.prevWetCount = this.wetCount;
    this.wet = t;
    let n = 0;
    for (let a = 0; a < this.activeCount; a++) {
      const c = this.active[a];
      if (D[c] + O[c] > 0) this.wet[n++] = c;
    }
    this.wetCount = n;
  }

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

  /** Total water (depth and overflow), summed in column id order. */
  volume(): number {
    let s = 0;
    for (let c = 0; c < this.M; c++) s += this.D[c] + this.O[c];
    return s;
  }

  /** Water leaving the map per second in the last substep (flows into the padding). */
  edgeOutflow(): number {
    let s = 0;
    for (let e = 0; e < this.eTarget.length; e++) if (this.eTarget[e] === SINK) s += this.f[e];
    return s;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
