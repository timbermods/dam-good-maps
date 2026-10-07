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
//   left it out; `edgeSpill`, D303);
// - a partial obstacle (NaturalDam) read from the higher of the two floors up to the ceiled surface
//   (the port read it at the target's floor only: water from a higher floor passes over it);
// - the source step sets the old depth too (it only matters beside a partial obstacle).
// The game's fifth rule the port leaves out, direction limiters, needs a badtide drain's roofed
// cell, which a heightfield cannot hold (sim/columns.ts).
//
// The simulation runs in Rust in every engine, in Node and natively (rust/water, PLAN §20 D381, D441, D442;
// the TypeScript it replaced is tagged `ts-water-final`): the same expressions in the same order, so the same
// bytes (tests/unit/water-speedups.test.ts pins every byte; CI's three-engine determinism check, the Python
// oracle and tools/rust/water-identity.ts compare it). Only an *exact* active list is updated each substep:
// the tiles with water at the start of the substep, their 4-neighbours and the source tiles, kept up to date
// as tiles turn wet or dry (PLAN §10, D359). WaterSim keeps its arrays here; rustWater.ts copies them in and
// out round each run, and the simulation's own state (its wet and active lists, flows and evaporation
// modifiers) stays in Rust between runs. A caller changes the water by constructing a simulator (with its
// warm start) and may set `out` before running; the floor may change between runs (a carve); a model's
// emitters keep their tiles. The settle and its stopping test below stay TypeScript; the native batch runs
// the Rust port of them (tools/rust/native-water.ts).
//
// Multi-core (parallel.ts): in a worker with a pool of helper threads (the editor's, on a cross-origin isolated
// page in Chromium and Firefox), a big map's runs go to several threads, each running the same Rust on a strip
// of the map, with the same bytes; the single simulation and the threads hand the water over between runs at
// any time. Nothing about WaterSim changes for its callers.

import { waterThreads, type WaterThreads } from "./parallel";
import { RustSim } from "./rustWater";

export const DT = 0.3; // seconds per substep; 2 substeps per 0.6 s tick
export const K = 2.25 * DT; // flow factor, 0.675
export const SPILL = 0.1; // spill threshold onto dry ground of the same floor
export const KEEP = 0.999; // flow momentum kept per substep
export const BAL = 0.8; // outflow balancing against the reverse flow
export const TICKS_PER_DAY = 768;
/** A game day in seconds: its ticks, two substeps each. */
export const SECONDS_PER_DAY = TICKS_PER_DAY * 2 * DT;
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
}

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
  /** Water sealed basins keep from before they were sealed (a carve's oxbow lakes) and Fills, in
   *  order: the canonical settle starts their tiles from it (prefill.ts). */
  retained?: readonly RetainedWater[];
  /** Tiles whose unfed water the player removed (Remove unfed water, D387 (2)), ascending: once the
   *  canonical settle has run, the water no source feeds on them is taken away and the water settles
   *  on from there (prefill.ts `canonicalRun`), as the game's own would from a file without it. Water
   *  a source feeds is never taken. */
  drained?: readonly number[];
}

/** One stored change to a map's water, in the order its operations stand in the log: a lake that
 *  keeps its water (a carve's oxbow lake, D216; a Fill, D394), or tiles whose unfed water was
 *  removed (D387 (2)). */
export type KeptWater = { lake: RetainedWater } | { drain: readonly number[] };

/** A water model's `retained` and `drained` from the stored changes, in order: a lake keeps its
 *  water; a removal takes the tiles it names out of every lake before it and drains them; a later
 *  lake on those tiles keeps its water again. With lakes only, `retained` is the lakes as given (the
 *  same objects), so maps without a removal settle exactly as before. */
export function composeKept(list: readonly KeptWater[]): { retained?: RetainedWater[]; drained?: number[] } {
  if (!list.some((k) => "drain" in k)) {
    const lakes = list.map((k) => (k as { lake: RetainedWater }).lake);
    return lakes.length ? { retained: lakes } : {};
  }
  let retained: RetainedWater[] = [];
  const drained = new Set<number>();
  for (const k of list) {
    if ("lake" in k) {
      retained.push(k.lake);
      for (const i of k.lake.tiles) drained.delete(i);
      continue;
    }
    const gone = new Set(k.drain);
    for (const i of k.drain) drained.add(i);
    retained = retained
      .map((r) => {
        if (!r.tiles.some((i) => gone.has(i))) return r;
        const keep = r.tiles.map((i) => !gone.has(i));
        return { tiles: r.tiles.filter((_, j) => keep[j]), floor: r.floor.filter((_, j) => keep[j]), depth: r.depth.filter((_, j) => keep[j]), contamination: r.contamination.filter((_, j) => keep[j]) };
      })
      .filter((r) => r.tiles.length > 0);
  }
  return { ...(retained.length ? { retained } : {}), ...(drained.size ? { drained: [...drained].sort((a, b) => a - b) } : {}) };
}

/** Two models keep the same stored water: their lakes (`retained`) and their drained tiles. */
export function sameKeptWater(a: Pick<WaterModel, "retained" | "drained">, b: Pick<WaterModel, "retained" | "drained">): boolean {
  if (!sameRetained(a.retained, b.retained)) return false;
  const x = a.drained ?? [];
  const y = b.drained ?? [];
  if (x.length !== y.length) return false;
  for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
  return true;
}

/** Water a sealed basin keeps from before it was sealed (a carve's oxbow lake, D199, D216; a Fill,
 *  D394). With no source feeding it, a basin cut off from its river would start the canonical
 *  settle dry; its tiles start with the water that stood there instead, up to the surface it had
 *  (`floor` plus `depth`) on the ground as it is now, and it evaporates as the game's water does.
 *  Stored with the operation that sealed (or filled) it, so the same document always settles the
 *  same. */
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
  C: Float64Array;
  /** Stored outflow momentum, 4 per tile (index 4·i + k). */
  readonly out: Float64Array;
  ticks = 0;
  /** The game's rules (D293, D311), or the port's. */
  readonly rules: WaterRules;
  /** The game's spill threshold at the map's edge too (its padding is an open column, floor 0, never wet:
   *  water on a floor-0 tile at the edge keeps its last 0.1 there, as it would beside a dry tile on the
   *  same floor). The game's rule (D303), with the game's rules; the port left it out. */
  readonly edgeSpill: boolean;
  /** The simulation itself, in Rust (rustWater.ts). */
  private readonly rust: RustSim;
  private readonly model: WaterModel;
  /** The runs on several threads (parallel.ts), once this thread has a pool and the map is big enough. */
  private threads: WaterThreads | null = null;
  /** The Rust simulation above holds the water as it stands (false once the threads ran last). */
  private singleFresh = true;
  /** `D`, `C` or `out` were written directly: this simulation stays on one thread, its established bytes. */
  private editedSingle = false;

  constructor(model: WaterModel, initial?: WaterState, opts: WaterSimOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_WATER_RULES;
    const game = this.rules === "game";
    this.edgeSpill = game;
    const N = model.W * model.H;
    this.W = model.W;
    this.H = model.H;
    this.N = N;
    this.F = model.floor;
    this.dam = model.dam;
    this.emitters = model.emitters;
    this.model = model;
    this.D = new Float64Array(N);
    this.C = new Float64Array(N);
    if (initial) {
      this.D.set(initial.depth);
      this.C.set(initial.contamination);
    }
    this.out = new Float64Array(4 * N);
    this.rust = new RustSim(this, model, initial ? this.D : null, initial ? this.C : null, { game, edgeSpill: this.edgeSpill });
  }

  /** The depth before the last substep, per tile (a copy). */
  get Dold(): Float64Array {
    this.freshSingle();
    return this.rust.dold();
  }

  /** Cluster saturation per wet tile (0 elsewhere): WN = 1 + wet 8-neighbours,
   *  sat = min(8, max(WN, max over 4-neighbours of WN − 1)). */
  saturation(): Uint8Array {
    this.freshSingle();
    return this.rust.saturation(this.model, this.D, this.C, this.out);
  }

  /** Run `ticks` ticks (2 substeps each). `strengthScale` scales every source (0 = drought). */
  run(ticks: number, strengthScale = 1): this {
    const n = ticks > 0 ? Math.ceil(ticks) : 0;
    if (n > 0 && !this.runThreaded(n, strengthScale)) {
      this.freshSingle();
      this.rust.run(this.model, this.D, this.C, this.out, n, strengthScale);
      this.threads?.invalidate();
    }
    this.ticks += n;
    return this;
  }

  /** Sets the stored outflows (`out`, the water's momentum): the way to change them, which keeps the multi-core
   *  water in step. Writing `D`, `C` or `out` directly keeps this simulation on one thread from then on
   *  (rebuilding the strips from such an edit would change the one-thread bytes). */
  setOut(out: ArrayLike<number>): void {
    this.freshSingle();
    this.out.set(out);
    this.rust.setOut(this.out);
    this.threads?.invalidate();
  }

  /** The run on several threads, when this thread has a pool and they take it (parallel.ts); the same water. */
  private runThreaded(n: number, scale: number): boolean {
    if (this.editedSingle) return false;
    this.threads ??= waterThreads(this, this.model, { game: this.rules === "game", edgeSpill: this.edgeSpill });
    if (!this.threads) return false;
    // a direct edit of the water since it last ran: the established one-thread bytes, on one thread from now on
    if ((this.singleFresh && this.rust.waterChanged(this.D, this.C, this.out)) || this.threads.changed(this.D, this.C, this.out)) {
      this.editedSingle = true;
      return false;
    }
    const ok = this.threads.run(this.model, this.D, this.C, this.out, n, scale, () => {
      if (!this.singleFresh) throw new Error("the multi-core water lost track of which thread ran last");
      return { dold: this.rust.dold(), seeps: this.rust.seeps(this.emitters.length) };
    });
    if (ok) this.singleFresh = false;
    return ok;
  }

  /** The Rust simulation takes over the water the threads ran last. */
  private freshSingle(): void {
    if (this.singleFresh || !this.threads) return;
    const { dold, seeps, water } = this.threads.carry(this.D, this.C, this.out);
    if (water) this.editedSingle = true;
    // First restore bookkeeping from committed water; run/saturation then copies any public edit.
    this.rust.adopt(this.model, water?.depth ?? this.D, water?.contamination ?? this.C, water?.out ?? this.out, dold, seeps);
    this.singleFresh = true;
  }

  /** Frees the Rust simulation now (Wasm memory never shrinks, so code that makes and drops many simulations
   *  calls it when done); again is a no-op. Its arrays (D, C, out) stay readable; running it, its saturation
   *  and Dold throw afterwards. Without it the simulation is freed when this object is collected. */
  dispose(): void {
    this.threads?.free();
    this.rust.free();
  }

  /** The simulation's kept-up bookkeeping (D359) against the same rebuilt from its water: null when they
   *  agree, else what differs (tests/unit/water-speedups.test.ts). */
  booksError(): string | null {
    this.freshSingle();
    return this.rust.booksError(this.model, this.D, this.C, this.out);
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
  /** The kept tiles of the map's sealed basins (`sealedTiles`: a carve's oxbow lakes, Fills). What
   *  they lose to evaporation is not the water changing (D222, D413): the settle stops at the first
   *  check where only that still changed (`steadyApartFromSealed`). */
  sealed?: readonly number[];
}

export interface SettleResult {
  /** The settle's own test passed (PLAN §11.3), at the check `ticks` gives. */
  settled: boolean;
  /** Ticks run: the water is the water at this tick. */
  ticks: number;
  /** When the settle stopped because, at a check, the water was steady apart from sealed basins
   *  evaporating (D222, D413), though its own test had not passed: that check's tick (`ticks` too).
   *  Such water has settled: only real flow is the water still changing (`waterSteady`). */
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

/** The sealed basins at a check (D222): the water round each of a basin's kept tiles (4-connected
 *  tiles wet at either check, `prev` or now) while it holds no running source's tile and reaches no
 *  map edge: nothing flows in or out, so all it can lose is what evaporates. `closed` marks every
 *  tile of such a basin; `drying` those of its tiles that did not rise (only lost water). The one
 *  definition: the settle's stopping test (`steadyApartFromSealed`), `water.settles` and the water
 *  the canonical settle stores (prefill.ts `canonicalRun`) all use it. `prototype/watersim.py`
 *  (`sealed_basins`) is the same. */
export function sealedBasins(sim: WaterSim, prev: Float64Array, sealed: readonly number[]): { closed: Uint8Array; drying: Uint8Array } {
  const { W, H, N, D } = sim;
  const feeds = new Uint8Array(N);
  for (const e of sim.emitters) if (e.strength > 0) for (const i of e.cells) feeds[i] = 1;
  const wet = (i: number) => D[i] > 0 || prev[i] > 0;
  const closed = new Uint8Array(N);
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
      closed[i] = 1;
      if (!(D[i] > prev[i])) drying[i] = 1;
    }
  }
  return { closed, drying };
}

/** Whether the water changed between two checks only by sealed basins evaporating (D222, D413):
 *  the settle's test on everything but the tiles of a sealed basin (`sealedBasins`) that lost water
 *  (its tiles that rose, water still running inside it, count as before): the rest's volume changes
 *  by under 0.2% of the rest and at most `movedShare` of the map's tiles move by over `tol`. So the
 *  water that flows stops on the same check as on the map without the basin. `prototype/watersim.py`
 *  (`steady_apart_from_sealed`) is the same. */
export function steadyApartFromSealed(sim: WaterSim, prev: Float64Array, sealed: readonly number[], tol: number, movedShare: number): boolean {
  const { N, D } = sim;
  const { drying } = sealedBasins(sim, prev, sealed);
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
  const dv = Math.abs(rest - restPrev) / Math.max(rest, 1e-9);
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
 *  it also stops at the first check where only their evaporation still changed (`steadyTicks`,
 *  D222, D413). */
export class SettleRun {
  readonly every: number;
  readonly checks: number;
  private readonly tol: number;
  private readonly movedShare: number;
  private readonly sealed: readonly number[] | null;
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

  /** Once it has finished, the sealed basins at its last check (`sealedBasins`' `closed`: the
   *  water round the kept tiles that nothing flows into or out of); null without sealed basins or
   *  before it has finished. */
  closedBasins(): Uint8Array | null {
    if (!this.result || !this.sealed) return null;
    return sealedBasins(this.sim, this.prev, this.sealed).closed;
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
      // only sealed basins evaporating: the water has settled (D222, D413)
      else if (this.sealed && steadyApartFromSealed(sim, prev, this.sealed, this.tol, this.movedShare)) this.result = { settled: false, ticks: sim.ticks, steadyTicks: sim.ticks };
      else if (this.k >= this.checks) this.result = { settled: false, ticks: sim.ticks };
      if (!this.result) {
        this.prev = D.slice();
        this.prevVol = vol;
      }
    }
    return this.result;
  }
}
