// The multi-core water (PLAN §10; #130's decomposition, on the Rust water): one simulation run on several
// threads, giving exactly the bytes it gives on one. Each thread runs the same single-threaded Rust module
// (rustWater.ts) on a strip of the map's rows plus HALO rows of each neighbour; after every tick each strip
// hands the rows next to its edges to its neighbours through a SharedArrayBuffer and takes theirs into its halo
// (`RustStrip.sync` brings its bookkeeping up to date). The water at a tile after a substep depends only on the
// water within two tiles of it before (its neighbours' flows, which read their neighbours), so after a tick the
// rows HALO = 4 from a strip's open edges are exactly the whole map's, and the strip's own rows are always exact.
// Every per-tile step reads only the substep's start (the order the lists are walked changes nothing), the
// sources run per tile in the emitters' order, and the strips never add floating point values across tiles, so
// the result is the single thread's by construction; tools/rust/water-identity.ts --threads and CI's
// determinism check (`chromium-threads`, `firefox-threads`) prove it byte for byte.
//
// Where it runs (#130's approved shape): only where it helps, in a worker that installed a pool
// (`installParallelWater`: the editor's generator worker, with helpers the page starts) on a cross-origin isolated page (the service worker,
// public/sw.js) in Chromium and Firefox, for maps of 256² and more (about 8 threads at 256², up to 16 at 512²)
// with enough water to share. Everywhere else, and whenever it can't, WaterSim runs the single thread, and the
// two hand over to each other between runs at any time with the same result. Node and the tools stay
// single-threaded (the identity check installs a pool to compare).

import { parallelWaterSupported, threadsFor } from "./parallelPolicy";
import { RustStrip, rustWater, sameBits, type RustModel, type RustRules } from "./rustWater";

export { parallelWaterSupported, threadsFor };

/** The rows of each neighbour a strip also runs: two substeps a tick, two rows of reach each. */
export const HALO = 4;
/** The fewest rows a strip owns (the identity checks go down to HALO, so small maps split too). */
const MIN_ROWS = 12;
/** The water a thread needs to be worth its exchange (wet tiles; the identity checks force threads). */
const WET_PER_THREAD = 1024;
/** Ticks between looks at whether the strips still share the water evenly. */
const REBALANCE_TICKS = 256;
/** How long a thread waits for the others at a tick before the run is given up and run on one thread (a
 *  helper that hangs without an error; one that fails is noticed within a slice, below). */
const WAIT_MS = 20_000;
/** Waits are cut into slices this long, to look for a helper that died between them. */
const SLICE_MS = 100;
const SPIN = 256;
/** The most threads, the coordinator's own included (#130: up to 16 at 512²). */
const MAX_THREADS = 16;

/** A helper thread as the coordinator sees it: a Worker, or Node's worker_threads Worker. */
export interface HelperPort {
  postMessage(message: unknown): void;
  terminate(): void;
}

/** A helper the page started, reached through a port (its worker's "stop" ends it). */
export function portHelper(port: MessagePort): HelperPort {
  return {
    postMessage: (m) => port.postMessage(m),
    terminate: () => {
      port.postMessage({ kind: "stop" });
      port.close();
    },
  };
}

export interface ParallelOptions {
  /** Starts one helper thread, whose messages go to `stripHelper()`'s handler. */
  spawn: () => HelperPort;
  /** Helpers already started (by the page, so they start while this thread is busy: a worker's own workers
   *  start only once it is idle); more are spawned when a bigger map needs them. */
  helpers?: HelperPort[];
  /** The identity checks: this many threads (the coordinator's own included) at every map size and any amount
   *  of water, with no isolation or engine checks. */
  threads?: number;
  /** Helpers started at once (more are started for bigger maps); default: those 256² uses. */
  eager?: number;
}

// ------------------------------------------------------------------------------------------ the barrier

const GEN = 0;
const COUNT = 1;
const ERR = 2;

/** Waits until all `parties` threads arrive; false when one of them failed (the run is then given up) or a
 *  helper died (`dead`: the pool's flags, whose DEAD entry a dying helper sets). */
function barrier(ctl: Int32Array, parties: number, dead: Int32Array | null): boolean {
  if (Atomics.load(ctl, ERR)) return false;
  const gen = Atomics.load(ctl, GEN);
  if (Atomics.add(ctl, COUNT, 1) === parties - 1) {
    Atomics.store(ctl, COUNT, 0);
    Atomics.add(ctl, GEN, 1);
    Atomics.notify(ctl, GEN);
    return !Atomics.load(ctl, ERR);
  }
  for (let s = 0; s < SPIN; s++) if (Atomics.load(ctl, GEN) !== gen) return !Atomics.load(ctl, ERR);
  let waited = 0;
  while (Atomics.load(ctl, GEN) === gen) {
    if (Atomics.wait(ctl, GEN, gen, SLICE_MS) !== "timed-out" || Atomics.load(ctl, GEN) !== gen) continue;
    waited += SLICE_MS;
    if ((dead && Atomics.load(dead, DEAD)) || waited >= WAIT_MS) {
      fail(ctl);
      return false;
    }
  }
  return !Atomics.load(ctl, ERR);
}

/** Marks the run failed and wakes every thread waiting at a barrier. */
function fail(ctl: Int32Array): void {
  Atomics.store(ctl, ERR, 1);
  Atomics.add(ctl, GEN, 1);
  Atomics.notify(ctl, GEN);
}

// ------------------------------------------------------------------------------------- the shared state

/** Where each array sits in a job's shared Float64Array: the whole map's floor, partial obstacles, depth,
 *  contamination, outflows (4 per tile) and old depth, the emitters' parameters (4 each) and seep states, and
 *  the halo slots (per strip, two parities, its top and bottom rows: depth, old depth, contamination, 4
 *  outflows). Between runs it holds the simulation's whole state. */
interface Layout {
  floor: number;
  dam: number;
  d: number;
  c: number;
  out: number;
  dold: number;
  params: number;
  seeps: number;
  halo: number;
  length: number;
}

function layoutOf(W: number, H: number, hasDam: boolean, emitters: number, maxStrips: number): Layout {
  const n = W * H;
  let at = 0;
  const take = (len: number) => {
    const a = at;
    at += len;
    return a;
  };
  const L = {
    floor: take(n),
    dam: hasDam ? take(n) : -1,
    d: take(n),
    c: take(n),
    out: take(4 * n),
    dold: take(n),
    params: take(4 * emitters),
    seeps: take(emitters),
    halo: take(maxStrips * 4 * 7 * HALO * W),
    length: 0,
  };
  L.length = at;
  return L;
}

interface EmitterShape {
  cells: readonly number[];
  depthLimit?: { anchor: number; off: number; on: number };
}

/** What every thread of a job knows: the map, its rules, the emitters' tiles and where things sit. */
interface JobInfo {
  W: number;
  H: number;
  hasDam: boolean;
  rules: RustRules;
  emitters: EmitterShape[];
  layout: Layout;
}

interface Strip {
  y0: number;
  y1: number;
}

/** A strip in this thread: its Rust simulation over rows lo..hi (its own y0..y1 and the halo), and the run. */
class StripRunner {
  private readonly strip: RustStrip;
  private readonly lo: number;
  private readonly hi: number;
  private readonly y0: number;
  private readonly y1: number;
  /** Its emitters' indices in the map's list. */
  private readonly local: number[] = [];
  /** Its emitters (local indices) whose seep state it writes back. */
  private readonly writes: number[] = [];

  constructor(
    private readonly info: JobInfo,
    private readonly f: Float64Array,
    private readonly strips: readonly Strip[],
    private readonly index: number,
    seepWriter: readonly number[],
  ) {
    const { W, H, layout: L } = info;
    const { y0, y1 } = strips[index];
    this.y0 = y0;
    this.y1 = y1;
    this.lo = Math.max(0, y0 - HALO);
    this.hi = Math.min(H, y1 + HALO);
    const base = this.lo * W;
    const n = (this.hi - this.lo) * W;
    const emitters: RustModel["emitters"][number][] = [];
    const counts: number[] = [];
    info.emitters.forEach((e, k) => {
      const cells = e.cells.filter((i) => i >= base && i < base + n).map((i) => i - base);
      if (!cells.length) return;
      const lim = e.depthLimit;
      if (lim && (lim.anchor < base || lim.anchor >= base + n)) throw new Error("a seep's depth is read off its strip");
      if (lim && seepWriter[k] === index) this.writes.push(emitters.length);
      emitters.push({ cells, strength: 0, contamination: 0, ...(lim ? { depthLimit: { anchor: lim.anchor - base, off: lim.off, on: lim.on } } : {}) });
      this.local.push(k);
      counts.push(e.cells.length);
    });
    const at = (o: number, len: number) => this.f.subarray(o + base * len, o + (base + n) * len);
    const model: RustModel = { W, H: this.hi - this.lo, floor: at(L.floor, 1), dam: info.hasDam ? at(L.dam, 1) : null, emitters };
    this.strip = new RustStrip(model, at(L.d, 1), at(L.c, 1), info.rules, this.lo, H, counts);
    this.strip.view("out", 4 * n).set(at(L.out, 4));
    this.strip.view("dold", n).set(at(L.dold, 1));
    for (let m = 0; m < this.local.length; m++) this.strip.seep(m, this.f[L.seeps + this.local[m]] ? 1 : 0);
  }

  /** Runs ticks with the others, then writes its own rows back. A failure during the final
   *  commit can leave partial rows written; the coordinator keeps a separate private carry for retry. */
  run(ctl: Int32Array, dead: Int32Array | null, ticks: number, scale: number): boolean {
    const { info, f, lo, y0, y1, index } = this;
    const { W, layout: L } = info;
    const T = this.strips.length;
    const n = (this.hi - lo) * W;
    const base = lo * W;
    const s = this.strip;
    // what a caller may change between runs: the floor, the partial obstacles and the emitters' parameters
    s.view("floor", n).set(f.subarray(L.floor + base, L.floor + base + n));
    if (info.hasDam) s.view("dam", n).set(f.subarray(L.dam + base, L.dam + base + n));
    const p = s.view("params", 4 * this.local.length);
    for (let m = 0; m < this.local.length; m++) p.set(f.subarray(L.params + 4 * this.local[m], L.params + 4 * this.local[m] + 4), 4 * m);
    // (no call below allocates, so the views stay valid for the whole run)
    const d = s.view("d", n);
    const dold = s.view("dold", n);
    const c = s.view("c", n);
    const out = s.view("out", 4 * n);
    const rows = HALO * W;
    const slot = (j: number, side: number, parity: number) => L.halo + ((j * 2 + parity) * 2 + side) * 7 * rows;
    const put = (at: number, row: number) => {
      const k = (row - lo) * W;
      f.set(d.subarray(k, k + rows), at);
      f.set(dold.subarray(k, k + rows), at + rows);
      f.set(c.subarray(k, k + rows), at + 2 * rows);
      f.set(out.subarray(4 * k, 4 * (k + rows)), at + 3 * rows);
    };
    const take = (at: number, row: number) => {
      const k = (row - lo) * W;
      d.set(f.subarray(at, at + rows), k);
      dold.set(f.subarray(at + rows, at + 2 * rows), k);
      c.set(f.subarray(at + 2 * rows, at + 3 * rows), k);
      out.set(f.subarray(at + 3 * rows, at + 7 * rows), 4 * k);
      s.sync(row - lo, row - lo + HALO);
    };
    let parity = 0;
    for (let t = 0; t < ticks; t++) {
      s.run(1, scale);
      if (index > 0) put(slot(index, 0, parity), y0);
      if (index < T - 1) put(slot(index, 1, parity), y1 - HALO);
      if (!barrier(ctl, T, dead)) return false;
      if (index > 0) take(slot(index - 1, 1, parity), y0 - HALO);
      if (index < T - 1) take(slot(index + 1, 0, parity), y1);
      parity ^= 1;
    }
    // every thread ran every tick: only now is the shared state overwritten
    if (!barrier(ctl, T, dead)) return false;
    const k0 = (y0 - lo) * W;
    const k1 = (y1 - lo) * W;
    f.set(d.subarray(k0, k1), L.d + y0 * W);
    f.set(c.subarray(k0, k1), L.c + y0 * W);
    f.set(dold.subarray(k0, k1), L.dold + y0 * W);
    f.set(out.subarray(4 * k0, 4 * k1), L.out + 4 * y0 * W);
    for (const m of this.writes) f[L.seeps + this.local[m]] = s.seep(m);
    return barrier(ctl, T, dead);
  }

  free(): void {
    this.strip.free();
  }
}

// ------------------------------------------------------------------------------------------ the helpers

type Message =
  | { kind: "hello"; ctl: SharedArrayBuffer; index: number }
  | { kind: "init"; job: number; sab: SharedArrayBuffer; ctl: SharedArrayBuffer; info: JobInfo; strips: Strip[]; index: number; seepWriter: number[] }
  | { kind: "run"; job: number; ticks: number; scale: number }
  | { kind: "free"; job: number }
  | { kind: "stop" };

/** A helper thread's message handler (src/worker/waterStrip.worker.ts in the browser; the identity check's
 *  worker_threads in Node): it holds a strip of each job it is given and runs it when asked. Its `died` is for
 *  the thread's uncaught errors: the pool is told at once, so no thread waits for it. */
export function stripHelper(): ((message: Message) => void) & { died(): void } {
  const jobs = new Map<number, { runner: StripRunner | null; ctl: Int32Array }>();
  let flags: Int32Array | null = null;
  const handle = (msg: Message) => {
    if (msg.kind === "hello") {
      rustWater();
      flags = new Int32Array(msg.ctl);
      Atomics.store(flags, msg.index, 1);
      return;
    }
    if (msg.kind === "init") {
      jobs.get(msg.job)?.runner?.free();
      const ctl = new Int32Array(msg.ctl);
      let runner: StripRunner | null = null;
      try {
        runner = new StripRunner(msg.info, new Float64Array(msg.sab), msg.strips, msg.index, msg.seepWriter);
      } catch {
        runner = null; // the next run fails at once, and the coordinator runs the water itself
      }
      jobs.set(msg.job, { runner, ctl });
      return;
    }
    if (msg.kind === "stop") return;
    const job = jobs.get(msg.job);
    if (msg.kind === "free") {
      job?.runner?.free();
      jobs.delete(msg.job);
      return;
    }
    if (!job) return;
    try {
      if (!job.runner || !job.runner.run(job.ctl, flags, msg.ticks, msg.scale)) fail(job.ctl);
    } catch {
      fail(job.ctl);
    }
  };
  return Object.assign(handle, {
    died() {
      if (flags) Atomics.store(flags, DEAD, 1);
      for (const job of jobs.values()) fail(job.ctl);
    },
  });
}

// --------------------------------------------------------------------------------------- the coordinator

/** The pool's flags: helper i sets entry i once it can run strips; a dying helper sets DEAD. */
const DEAD = MAX_THREADS;

class Pool {
  readonly helpers: HelperPort[] = [];
  readonly ready = new Int32Array(new SharedArrayBuffer(4 * (MAX_THREADS + 1)));
  broken = false;
  readonly cap: number;

  constructor(
    private readonly spawn: () => HelperPort,
    readonly forced: number | null,
  ) {
    const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    // the page's own thread keeps a core when it can
    this.cap = forced ?? Math.max(1, Math.min(MAX_THREADS, cores - 1));
  }

  /** Starts helpers until there are `count` (never more than the cap allows); when a helper can't be started,
   *  the water uses those it has (one thread when none). */
  grow(count: number): void {
    const want = Math.min(count, this.cap - 1);
    try {
      while (!this.noSpawn && this.helpers.length < want) this.add(this.spawn());
    } catch {
      this.noSpawn = true;
    }
  }
  private noSpawn = false;

  /** A helper died (its uncaught error): the water runs on one thread from now on. */
  get died(): boolean {
    return Atomics.load(this.ready, DEAD) !== 0;
  }

  add(h: HelperPort): void {
    try {
      h.postMessage({ kind: "hello", ctl: this.ready.buffer, index: this.helpers.length } satisfies Message);
    } catch (error) {
      try { h.terminate(); } catch { /* a failed port may already be closed */ }
      throw error;
    }
    this.helpers.push(h);
  }

  /** Threads available now, the coordinator's own included: it and the helpers ready in a row. */
  threads(): number {
    let k = 0;
    while (k < this.helpers.length && Atomics.load(this.ready, k)) k++;
    return k + 1;
  }

  /** A helper failed or stopped answering: the water runs on one thread from now on. */
  break(): void {
    this.broken = true;
    for (const h of this.helpers) {
      try { h.terminate(); } catch { /* continue releasing the rest of a failed pool */ }
    }
    this.helpers.length = 0;
  }
}

let pool: Pool | null = null;
let jobIds = 0;

/** Gives this thread a pool of helper threads for the water (once; again is a no-op). Returns whether the
 *  water may now run on several threads here. */
export function installParallelWater(opts: ParallelOptions): boolean {
  if (pool) return !pool.broken;
  const forced = opts.threads ?? null;
  if (forced === null && !parallelWaterSupported()) return false;
  if (forced !== null && forced < 2) return false;
  pool = new Pool(opts.spawn, forced);
  try {
    for (const h of opts.helpers ?? []) {
      if (pool.helpers.length < pool.cap - 1) pool.add(h);
      else h.terminate();
    }
  } catch {
    pool.break();
    for (const h of opts.helpers ?? []) { try { h.terminate(); } catch { /* already closed */ } }
    return false;
  }
  pool.grow(opts.eager ?? (forced ?? threadsFor(256 * 256)) - 1);
  return true;
}

/** Ends the pool (the identity check, when done). */
export function uninstallParallelWater(): void {
  pool?.break();
  pool = null;
}

/** Threads the water can use now, the coordinator's own included (1 without a pool or once it broke). */
export function parallelWaterThreads(): number {
  return pool && !pool.broken ? pool.threads() : 1;
}

/** Ticks and runs on several threads in this thread so far (the identity checks make sure the threads really
 *  ran). */
export const parallelWaterStats = { ticks: 0, runs: 0 };

/** Runs `fn` with the water on one thread whatever the pool (the identity checks' single side). */
export function withoutParallelWater<T>(fn: () => T): T {
  const was = paused;
  paused = true;
  try {
    return fn();
  } finally {
    paused = was;
  }
}
let paused = false;

const finalizer = new FinalizationRegistry<WaterThreads>((t) => t.free());

/** A simulation's threads, when this thread has a pool and its map could use one; else null (it runs on one). */
export function waterThreads(owner: object, info: { W: number; H: number; dam: Float64Array | null; emitters: readonly EmitterShape[] }, rules: RustRules): WaterThreads | null {
  if (!pool || pool.broken) return null;
  const n = info.W * info.H;
  const most = pool.forced ?? threadsFor(n);
  const minRows = pool.forced !== null ? HALO : MIN_ROWS;
  const cap = Math.min(most, Math.floor(info.H / minRows));
  if (cap < 2) return null;
  pool.grow(cap - 1);
  const t = new WaterThreads(pool, info, rules, cap, minRows);
  finalizer.register(owner, t, t);
  return t;
}

/** One simulation's strips: its shared state, its strip in this thread, and the run. */
export class WaterThreads {
  private readonly id = ++jobIds;
  private readonly info: JobInfo;
  /** The shared state, made at the first run that uses the threads (until then a map runs on one thread). */
  private shared: Float64Array | null = null;
  private readonly ctl = new Int32Array(new SharedArrayBuffer(16));
  private strips: Strip[] | null = null;
  private seepWriter: number[] = [];
  private own: StripRunner | null = null;
  /** The shared state and the strips hold the simulation's water as it stands. */
  private fresh = false;
  private sinceInit = 0;
  private dead = false;
  private freed = false;
  private failedCarry: { dold: Float64Array; seeps: Uint8Array } | null = null;

  constructor(
    private readonly pool: Pool,
    model: { W: number; H: number; dam: Float64Array | null; emitters: readonly EmitterShape[] },
    rules: RustRules,
    private readonly most: number,
    private readonly minRows: number,
  ) {
    const emitters = model.emitters.map((e) => ({ cells: e.cells.slice(), ...(e.depthLimit ? { depthLimit: { ...e.depthLimit } } : {}) }));
    const layout = layoutOf(model.W, model.H, !!model.dam, emitters.length, most);
    this.info = { W: model.W, H: model.H, hasDam: !!model.dam, rules, emitters, layout };
  }

  private get f(): Float64Array {
    this.shared ??= new Float64Array(new SharedArrayBuffer(8 * this.info.layout.length));
    return this.shared;
  }

  /** The single thread ran last: the next run here starts from its water. */
  invalidate(): void {
    this.fresh = false;
  }

  /** The state only the simulation itself holds (the old depth and the seeps), from the last run here, for the
   *  single thread to take over; after a failed run, the run's start (kept outside the shared memory). `water`
   *  is the water the threads last held when the caller's `D`, `C` or `out` were edited directly since. */
  carry(D: Float64Array, C: Float64Array, out: Float64Array): { dold: Float64Array; seeps: Uint8Array; water?: { depth: Float64Array; contamination: Float64Array; out: Float64Array } } {
    if (this.failedCarry) return this.failedCarry;
    const { layout: L, W, H, emitters } = this.info;
    const f = this.f, n = W * H;
    const water = this.changed(D, C, out) ? { depth: f.subarray(L.d, L.d + n), contamination: f.subarray(L.c, L.c + n), out: f.subarray(L.out, L.out + 4 * n) } : undefined;
    return { dold: f.slice(L.dold, L.dold + n), seeps: Uint8Array.from(f.subarray(L.seeps, L.seeps + emitters.length)), water };
  }

  /** Whether the caller's water differs from the water the threads hold (a direct edit since they last ran). */
  changed(D: Float64Array, C: Float64Array, out: Float64Array): boolean {
    if (!this.fresh || !this.shared) return false;
    const f = this.shared, L = this.info.layout, n = this.info.W * this.info.H;
    return !sameBits(D, f.subarray(L.d, L.d + n)) || !sameBits(C, f.subarray(L.c, L.c + n)) || !sameBits(out, f.subarray(L.out, L.out + 4 * n));
  }

  /** Runs `ticks` ticks on several threads, the water back in D, C and out; false when it doesn't (too little
   *  water to share, a seep across strips, no helpers ready, or a thread failed), and the caller runs them on
   *  one. `single` gives the old depth and the seeps' states when the single thread ran last. */
  run(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array, ticks: number, scale: number, single: () => { dold: Float64Array; seeps: Uint8Array }): boolean {
    if (this.pool.died && !this.pool.broken) this.pool.break();
    if (this.dead || this.freed || this.pool.broken || paused) return false;
    const { W, H, layout: L } = this.info;
    const N = W * H;
    // Public water edits preserve the established single-thread bookkeeping.
    if (this.changed(D, C, out)) return false;
    const replan = !this.fresh || this.sinceInit >= REBALANCE_TICKS;
    const strips0 = replan ? this.plan(D) : null;
    if (replan && !strips0) return false;
    // (the shared state is made here, once the threads are really used)
    const f = this.f;
    // A helper can fail after another strip wrote its final rows. Public water has not been
    // overwritten yet; preserve the private carry too, so a single-thread retry starts exactly.
    const checkpoint = f.slice(L.dold, L.seeps + this.info.emitters.length);
    let ok = false;
    try {
      if (strips0) {
        const strips = strips0;
        if (!this.fresh) {
          const s = single();
          f.set(D, L.d);
          f.set(C, L.c);
          f.set(out, L.out);
          f.set(s.dold, L.dold);
          for (let k = 0; k < s.seeps.length; k++) f[L.seeps + k] = s.seeps[k];
        }
        if (!this.fresh || !sameStrips(strips, this.strips)) this.init(strips);
        this.sinceInit = 0;
      }
      const strips = this.strips!;
      f.set(m.floor, L.floor);
      if (m.dam) f.set(m.dam, L.dam);
      for (let k = 0; k < m.emitters.length; k++) {
        const e = m.emitters[k];
        const at = L.params + 4 * k;
        f[at] = e.strength;
        f[at + 1] = e.contamination;
        f[at + 2] = e.depthLimit ? e.depthLimit.off : 0;
        f[at + 3] = e.depthLimit ? e.depthLimit.on : 0;
      }
      for (let j = 1; j < strips.length; j++) this.pool.helpers[j - 1].postMessage({ kind: "run", job: this.id, ticks, scale } satisfies Message);
      ok = this.own!.run(this.ctl, this.pool.ready, ticks, scale);
    } catch {
      ok = false;
    }
    if (!ok) {
      // Keep private carry outside shared memory: another strip may still be exiting its failed run.
      this.failedCarry = { dold: checkpoint.slice(0, N), seeps: Uint8Array.from(checkpoint.subarray(N + 4 * this.info.emitters.length)) };
      // The public water still holds the run's start; retry all ticks on one thread.
      fail(this.ctl);
      this.dead = true;
      this.pool.break();
      return false;
    }
    D.set(f.subarray(L.d, L.d + N));
    C.set(f.subarray(L.c, L.c + N));
    out.set(f.subarray(L.out, L.out + 4 * N));
    this.sinceInit += ticks;
    parallelWaterStats.ticks += ticks;
    parallelWaterStats.runs++;
    return true;
  }

  /** The strips for the water as it stands: as many threads as the water is worth, each strip's rows holding
   *  about the same water; null when one thread is better (too little water, or a seep whose depth would be
   *  read off a strip that runs it). */
  private plan(D: Float64Array): Strip[] | null {
    const { W, H, emitters } = this.info;
    const forced = this.pool.forced !== null;
    const rowWet = new Float64Array(H);
    let wet = 0;
    for (let y = 0; y < H; y++) {
      let k = 0;
      for (let i = y * W; i < (y + 1) * W; i++) if (D[i] > 0) k++;
      rowWet[y] = k;
      wet += k;
    }
    let T = Math.min(this.most, this.pool.threads());
    if (!forced) T = Math.min(T, Math.floor(wet / WET_PER_THREAD));
    if (T < 2) return null;
    // each row's work: its water and its neighbours' (a strip runs the tiles beside its water too), and a little
    // for the row itself
    const weight = new Float64Array(H);
    let total = 0;
    for (let y = 0; y < H; y++) {
      weight[y] = rowWet[y] + (y > 0 ? rowWet[y - 1] : 0) + (y < H - 1 ? rowWet[y + 1] : 0) + W / 16;
      total += weight[y];
    }
    const strips: Strip[] = [];
    let y0 = 0;
    let y = 0;
    let acc = 0;
    for (let j = 1; j < T; j++) {
      // the first row where the work so far reaches its share, at least minRows from its neighbours
      const goal = (total * j) / T;
      while (y < H && acc < goal) acc += weight[y++];
      const y1 = Math.min(Math.max(y, y0 + this.minRows), H - this.minRows * (T - j));
      strips.push({ y0, y1 });
      y0 = y1;
    }
    strips.push({ y0, y1: H });
    // a seep reads its depth at its anchor: every strip that runs any of its tiles must hold the anchor
    this.seepWriter = emitters.map(() => -1);
    for (let k = 0; k < emitters.length; k++) {
      const e = emitters[k];
      if (!e.depthLimit || !e.cells.length) continue;
      const rows = e.cells.map((i) => Math.floor(i / W));
      const top = Math.min(...rows);
      const bottom = Math.max(...rows);
      const ra = Math.floor(e.depthLimit.anchor / W);
      for (let j = 0; j < strips.length; j++) {
        const lo = Math.max(0, strips[j].y0 - HALO);
        const hi = Math.min(H, strips[j].y1 + HALO);
        if (bottom < lo || top >= hi) continue;
        if (ra < lo || ra >= hi) return null;
        if (this.seepWriter[k] < 0) this.seepWriter[k] = j;
      }
    }
    return strips;
  }

  /** Gives each thread its strip of the shared state. */
  private init(strips: Strip[]): void {
    const before = this.strips?.length ?? 1;
    this.strips = strips;
    for (let j = 1; j < strips.length; j++)
      this.pool.helpers[j - 1].postMessage({ kind: "init", job: this.id, sab: this.f.buffer as SharedArrayBuffer, ctl: this.ctl.buffer as SharedArrayBuffer, info: this.info, strips, index: j, seepWriter: this.seepWriter } satisfies Message);
    for (let j = strips.length; j < before; j++) this.pool.helpers[j - 1]?.postMessage({ kind: "free", job: this.id } satisfies Message);
    this.own?.free();
    this.own = null;
    this.own = new StripRunner(this.info, this.f, strips, 0, this.seepWriter);
    this.fresh = true;
  }

  /** Frees its strips in every thread; again is a no-op. */
  free(): void {
    if (this.freed) return;
    this.freed = true;
    finalizer.unregister(this);
    this.own?.free();
    this.own = null;
    const used = this.strips?.length ?? 1;
    if (!this.pool.broken) {
      try {
        for (let j = 1; j < used; j++) this.pool.helpers[j - 1]?.postMessage({ kind: "free", job: this.id } satisfies Message);
      } catch { this.pool.break(); }
    }
  }
}

function sameStrips(a: readonly Strip[], b: readonly Strip[] | null): boolean {
  return !!b && a.length === b.length && a.every((s, k) => s.y0 === b[k].y0 && s.y1 === b[k].y1);
}
