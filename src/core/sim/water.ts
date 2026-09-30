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
// The game's rules (PLAN §20 D293, D303, D308, D311: one water model everywhere, the game's; read
// from Timberborn 1.1.2.4's code by the 3D engine's study, investigation/terrain3d/GAME_RULES.md §3,
// and proved on its stacked engine, sim/stack.ts on feature/terrain3d-a). The port as it was before
// M9b simplified the game in four places a heightfield holds; `rules: "port"` keeps them, and
// "game" is the game's code (`DEFAULT_WATER_RULES` says which a caller gets when it does not ask;
// a map converted or built under one keeps being settled with it, `rules` passed explicitly):
// - evaporation on every active tile, a dry tile that receives water too (the port: wet tiles only);
// - the spill threshold at the map's edge too, where a floor-0 tile meets the padding (the port
//   left it out; `edgeSpill`, taken from feature/weather-days' drought run, D303);
// - a partial obstacle (NaturalDam) read from the higher of the two floors up to the ceiled surface
//   (the port read it at the target's floor only: water from a higher floor passes over it);
// - the source step sets the old depth too (it only matters beside a partial obstacle).
// The game's fifth rule the port leaves out, direction limiters, needs a badtide drain's roofed
// cell, which a heightfield cannot hold (sim/columns.ts).
//
// Speed: only an *exact* active list is updated each substep: the tiles with water at the start of
// the substep, their 4-neighbours, and the source tiles. Every other tile is dry and cannot change,
// so the result is identical to updating the whole grid (PLAN §10: a list rebuilt once per tick
// changed the settled volume by 5%). An interior tile counts its wet neighbours directly, and the
// outflows' direction loop is written out (PLAN §20 D130): exact rewrites, proved bit for bit
// against the loops they replace (tests/unit/water-speedups.test.ts).

export const DT = 0.3; // seconds per substep; 2 substeps per 0.6 s tick
export const K = 2.25 * DT; // flow factor, 0.675
export const SPILL = 0.1; // spill threshold onto dry ground of the same floor
export const KEEP = 0.999; // flow momentum kept per substep
export const BAL = 0.8; // outflow balancing against the reverse flow
export const TICKS_PER_DAY = 768;
/** The game days the canonical settle may run before its water counts as not settling (PLAN §10,
 *  §11.3; D358: 6, 4 before 2026-10-01). It stops at the first check that passes, so a map whose
 *  water settles sooner is the same whatever the limit. */
export const SETTLE_DAYS = 6;

/** Which rules the simulator runs: the game's (D293, D311), or the port's as it was before M9b. */
export type WaterRules = "game" | "port";

/** The rules a simulator runs when its caller does not say: the game's, since M9b's switch (D308,
 *  D311). A map built under the port's keeps them where it is settled again (the Real places, until
 *  Real places 2 converts them under the game's). */
export const DEFAULT_WATER_RULES: WaterRules = "game";

export interface WaterSimOptions {
  rules?: WaterRules;
  /** The spill threshold at the map's edge (D303): the game's rule, on with the game's rules unless
   *  it is given (feature/weather-days' drought run passes it explicitly). */
  edgeSpill?: boolean;
}

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

  /** The game's rules (D293, D311), or the port's. */
  readonly rules: WaterRules;
  /** The game's spill threshold at the map's edge too (its padding is an open column, floor 0,
   *  never wet: water on a floor-0 tile at the edge keeps its last 0.1 there, as it would beside a
   *  dry tile on the same floor). The game's rule (D303); the port left it out. */
  readonly edgeSpill: boolean;
  private readonly game: boolean;

  constructor(model: WaterModel, initial?: WaterState, opts: WaterSimOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_WATER_RULES;
    this.game = this.rules === "game";
    this.edgeSpill = opts.edgeSpill ?? this.game;
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
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) {
        // an interior tile has all eight neighbours: count them directly (an integer count, so
        // the order of the additions cannot change it; PLAN §20 D130)
        c += +(D[i - W - 1] > 0) + +(D[i - W] > 0) + +(D[i - W + 1] > 0)
          + +(D[i - 1] > 0) + +(D[i + 1] > 0)
          + +(D[i + W - 1] > 0) + +(D[i + W] > 0) + +(D[i + W + 1] > 0);
      } else {
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx;
            if (xx >= 0 && xx < W && D[yy * W + xx] > 0) c++;
          }
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

  /** The outflow of wet tile `c` (floor `Fc`, surface `Hc`) into a neighbour holding a partial
   *  obstacle (NaturalDam) of height `lim` on floor `Fn`: `e` is the head difference and `prev` the
   *  momentum kept from the last substep. */
  private damFlow(c: number, Fc: number, Hc: number, Fn: number, lim: number, e: number, prev: number): number {
    const hd = Hc - Fn;
    if (hd < lim) {
      const a = clamp01(clamp01((lim - hd) / 0.1) * clamp(1 - 2.25 * (Hc - (Fc + this.Dold[c])), 0.5, 2));
      return 0.995 * prev - 0.02 * a;
    }
    if (hd - lim < 0.1 && e > 0) e = e * ((hd - lim) / 0.1);
    return 0.995 * prev + K * e;
  }

  private substep(scale: number): void {
    const { W, H, F, D, C, out, f, wall, mod, dam, game, edgeSpill } = this;
    // flows of the tiles that had water last substep are stale: clear them
    for (let k = 0; k < this.prevWetCount; k++) {
      const b = 4 * this.prevWet[k];
      f[b] = 0;
      f[b + 1] = 0;
      f[b + 2] = 0;
      f[b + 3] = 0;
    }
    this.buildActive();

    // 1. outflows of every wet tile, from the start-of-substep state: the four directions written
    //    out in order (−y, −x, +y, +x), each the same steps (PLAN §20 D130)
    for (let w = 0; w < this.wetCount; w++) {
      const c = this.wet[w];
      const x = c % W;
      const y = (c - x) / W;
      const Fc = F[c];
      const Dc = D[c];
      const Hc = Fc + Dc;
      const b = 4 * c;
      const wc = wall[c];
      // −y
      {
        const n = y > 0 ? c - W : -1;
        const inside = n >= 0;
        const Fn = inside ? F[n] : 0;
        const Dn = inside ? D[n] : 0;
        const Hn = inside ? Fn + Dn : 0;
        if (wc & 1 || Fn >= Hc) f[b] = 0;
        else {
          let e = Hc - Hn;
          const prev = KEEP * out[b];
          let fk: number;
          const lim = inside && dam ? dam[n] : -1;
          if (lim >= 0 && Fn < Math.ceil(Hc) && (!game || Fc <= Fn)) fk = this.damFlow(c, Fc, Hc, Fn, lim, e, prev);
          else {
            if ((inside || edgeSpill) && Dn === 0 && Fn === Fc) e = e - SPILL;
            fk = prev + K * e;
          }
          f[b] = fk > 0 ? fk : 0;
        }
      }
      // −x
      {
        const n = x > 0 ? c - 1 : -1;
        const inside = n >= 0;
        const Fn = inside ? F[n] : 0;
        const Dn = inside ? D[n] : 0;
        const Hn = inside ? Fn + Dn : 0;
        if (wc & 2 || Fn >= Hc) f[b + 1] = 0;
        else {
          let e = Hc - Hn;
          const prev = KEEP * out[b + 1];
          let fk: number;
          const lim = inside && dam ? dam[n] : -1;
          if (lim >= 0 && Fn < Math.ceil(Hc) && (!game || Fc <= Fn)) fk = this.damFlow(c, Fc, Hc, Fn, lim, e, prev);
          else {
            if ((inside || edgeSpill) && Dn === 0 && Fn === Fc) e = e - SPILL;
            fk = prev + K * e;
          }
          f[b + 1] = fk > 0 ? fk : 0;
        }
      }
      // +y
      {
        const n = y < H - 1 ? c + W : -1;
        const inside = n >= 0;
        const Fn = inside ? F[n] : 0;
        const Dn = inside ? D[n] : 0;
        const Hn = inside ? Fn + Dn : 0;
        if (wc & 4 || Fn >= Hc) f[b + 2] = 0;
        else {
          let e = Hc - Hn;
          const prev = KEEP * out[b + 2];
          let fk: number;
          const lim = inside && dam ? dam[n] : -1;
          if (lim >= 0 && Fn < Math.ceil(Hc) && (!game || Fc <= Fn)) fk = this.damFlow(c, Fc, Hc, Fn, lim, e, prev);
          else {
            if ((inside || edgeSpill) && Dn === 0 && Fn === Fc) e = e - SPILL;
            fk = prev + K * e;
          }
          f[b + 2] = fk > 0 ? fk : 0;
        }
      }
      // +x
      {
        const n = x < W - 1 ? c + 1 : -1;
        const inside = n >= 0;
        const Fn = inside ? F[n] : 0;
        const Dn = inside ? D[n] : 0;
        const Hn = inside ? Fn + Dn : 0;
        if (wc & 8 || Fn >= Hc) f[b + 3] = 0;
        else {
          let e = Hc - Hn;
          const prev = KEEP * out[b + 3];
          let fk: number;
          const lim = inside && dam ? dam[n] : -1;
          if (lim >= 0 && Fn < Math.ceil(Hc) && (!game || Fc <= Fn)) fk = this.damFlow(c, Fc, Hc, Fn, lim, e, prev);
          else {
            if ((inside || edgeSpill) && Dn === 0 && Fn === Fc) e = e - SPILL;
            fk = prev + K * e;
          }
          f[b + 3] = fk > 0 ? fk : 0;
        }
      }
      // a tile never gives more than it has (the game scales by have / (s·dt) when that is under
      // 1; the port guarded the quotient, which differs only below 1e-12)
      const s = f[b] + f[b + 1] + f[b + 2] + f[b + 3];
      if (game) {
        const sd = s * DT;
        if (s > 0 && Dc < sd) {
          const r = Dc / sd;
          f[b] *= r;
          f[b + 1] *= r;
          f[b + 2] *= r;
          f[b + 3] *= r;
        }
      } else if (s * DT > Dc) {
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
      // (the game: every active tile evaporates, a dry one that receives water too)
      if (game || Dc > 0) net = net - (Dc < 0.02 ? 1e-3 : 1e-4) * mod[c];
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
        if (game) this.Dold[i] = d0;
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
  /** Give up after this many game days (PLAN §11.3: `SETTLE_DAYS`). */
  maxDays?: number;
  /** Largest depth change between checks that counts as still (PLAN §11.3: 0.005). */
  tol?: number;
  /** Ticks between checks (PLAN §11.3: 128). */
  checkEvery?: number;
  /** Share of tiles that may still move by more than `tol` (PLAN §11.3: 0.005). */
  movedShare?: number;
  /** The kept tiles of the map's sealed basins (`sealedTiles`: a carve's oxbow lakes). What they
   *  lose to evaporation is not the water changing (D222): see `steadyApartFromSealed`. */
  sealed?: readonly number[];
  /** Stop at the first check where the water is steady apart from sealed basins evaporating (the
   *  editor's preview). The canonical settle runs on to its own test instead: the water a file
   *  gets is the water at the tick that test gives (§19.7), so this never changes it. */
  untilSteady?: boolean;
}

export interface SettleResult {
  /** The settle's own test passed (PLAN §11.3), at the check `ticks` gives. */
  settled: boolean;
  /** Ticks run: the water is the water at this tick. */
  ticks: number;
  /** When the settle's test had not passed but, at a check, the water was steady apart from sealed
   *  basins evaporating (D222): that check's tick. Such water has settled: only real flow is the
   *  water still changing (`waterSteady`). */
  steadyTicks?: number;
}

/** Whether a settle's water has settled (`water.settles`, the editor's quiet dot): its test passed,
 *  or all that still changed was sealed basins evaporating (D222). */
export function waterSteady(r: SettleResult): boolean {
  return r.settled || r.steadyTicks !== undefined;
}

/** The kept tiles of a model's sealed basins (its `retained` water), ascending; undefined when it
 *  has none, which leaves the settle exactly as it was (every generated map). */
export function sealedTiles(m: WaterModel): number[] | undefined {
  if (!m.retained?.length) return undefined;
  const all = new Set<number>();
  for (const r of m.retained) for (const i of r.tiles) all.add(i);
  return [...all].sort((a, b) => a - b);
}

/** Whether the water changed between two checks only by sealed basins evaporating (D222). A sealed
 *  basin is the water round a basin's kept tiles (4-connected tiles wet at either check) while it
 *  holds no running source's tile and reaches no map edge: nothing flows in or out, so all it can
 *  lose is what evaporates. Its tiles that lost water are left out of the settle's test (the tiles
 *  moved and the volume change); its tiles that rose (water still running inside it) and every
 *  other tile count as before. `prototype/watersim.py` (`steady_apart_from_sealed`) is the same. */
export function steadyApartFromSealed(sim: WaterSim, prev: Float64Array, vol: number, sealed: readonly number[], tol: number, movedShare: number): boolean {
  const { W, H, N, D } = sim;
  const feeds = new Uint8Array(N);
  for (const e of sim.emitters) if (e.strength > 0) for (const i of e.cells) feeds[i] = 1;
  const wet = (i: number) => D[i] > 0 || prev[i] > 0;
  const drying = new Uint8Array(N);
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  for (const s of sealed) {
    if (seen[s] || !wet(s)) continue;
    seen[s] = 1;
    queue[0] = s;
    let tail = 1;
    let open = false;
    for (let h = 0; h < tail; h++) {
      const c = queue[h];
      const x = c % W;
      const y = (c - x) / W;
      if (feeds[c] || x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
      for (let k = 0; k < 4; k++) {
        let n: number;
        if (k === 0) n = y > 0 ? c - W : -1;
        else if (k === 1) n = x > 0 ? c - 1 : -1;
        else if (k === 2) n = y < H - 1 ? c + W : -1;
        else n = x < W - 1 ? c + 1 : -1;
        if (n < 0 || seen[n] || !wet(n)) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    if (open) continue;
    for (let h = 0; h < tail; h++) {
      const i = queue[h];
      if (!(D[i] > prev[i])) drying[i] = 1;
    }
  }
  // the settle's test on everything else, summed in index order as the Python does
  let rest = 0;
  let restPrev = 0;
  let moved = 0;
  for (let i = 0; i < N; i++) {
    if (drying[i]) continue;
    rest += D[i];
    restPrev += prev[i];
    if (Math.abs(D[i] - prev[i]) > tol) moved++;
  }
  const dv = Math.abs(rest - restPrev) / Math.max(vol, 1e-9);
  return dv < 0.002 && moved <= movedShare * N;
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
 *  ticks and the checks are the same whatever the slices, so the result is too. With sealed basins
 *  it also notes the first check where only their evaporation still changed (`steadyTicks`). */
export class SettleRun {
  readonly every: number;
  readonly checks: number;
  private readonly tol: number;
  private readonly movedShare: number;
  private readonly sealed: readonly number[] | null;
  private readonly untilSteady: boolean;
  private steadyTicks: number | undefined;
  private prev: Float64Array;
  private prevVol: number;
  private k = 0;
  private sinceCheck = 0;
  private result: SettleResult | null = null;

  constructor(
    readonly sim: WaterSim,
    opts: SettleOptions = {},
  ) {
    const maxDays = opts.maxDays ?? SETTLE_DAYS;
    this.tol = opts.tol ?? 0.005;
    this.movedShare = opts.movedShare ?? 0.005;
    this.sealed = opts.sealed?.length ? opts.sealed : null;
    this.untilSteady = opts.untilSteady ?? false;
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
      else {
        // only sealed basins evaporating: steady (D222); the canonical settle still runs on to its
        // own test, so its water is what it always was
        if (this.sealed && this.steadyTicks === undefined && steadyApartFromSealed(sim, prev, vol, this.sealed, this.tol, this.movedShare)) {
          this.steadyTicks = sim.ticks;
          if (this.untilSteady) this.result = { settled: false, ticks: sim.ticks, steadyTicks: sim.ticks };
        }
        if (!this.result && this.k >= this.checks) this.result = { settled: false, ticks: sim.ticks, ...(this.steadyTicks !== undefined ? { steadyTicks: this.steadyTicks } : {}) };
      }
      if (!this.result) {
        this.prev = D.slice();
        this.prevVol = vol;
      }
    }
    return this.result;
  }
}
