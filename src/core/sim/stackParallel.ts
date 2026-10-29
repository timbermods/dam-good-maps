// The multi-core canonical settle of terrain above terrain (#380): the stacked engine (stackWater.ts) run on
// several threads, giving exactly the bytes it gives on one, as parallel.ts does for the heightfield (#130).
//
// Each thread runs the same single-threaded engine on a strip of the map's rows, plus HALO rows of each
// neighbour, built as a map of its own from those rows' terrain and objects with the stacked rules
// (stack_memory.rs `build`, b = 1). After every tick each strip hands its rows next to each neighbour (water,
// pressure, contamination, old depth and the momentum of their flows) to that neighbour through a
// SharedArrayBuffer and takes theirs into its halo (stack.rs `export_rows`, `import_rows`). A column's water
// after a substep depends only on the water within two tiles of it before (its own and its neighbours' flows),
// and its evaporation on which columns are wet within two tiles, so after a tick only the halo's rows can
// differ from the whole map's: the strip's own rows are always exact. The edge of a strip's halo is wrong from the first substep (it has no
// neighbours beyond, or the map's edge rules), and so, harmlessly, are the momentum of its flows there and the
// water a source cut by the strip's edge adds: neither reaches a strip's own rows within a tick. A source
// or seep that reaches a strip's own rows lies whole within its halo, its seep's anchor included. Every step
// reads only the substep's start and writes its own column (rust/water/src/stack.rs), so the strips never add
// floating point values across columns.
//
// The settle's checks every 128 ticks run on the whole map in the coordinating thread: the strips write their
// own rows back, and the whole map's engine takes them as ticks run elsewhere (stack_memory.rs op 8), with the
// checks it would have run itself. The pre-fill runs there too, once. If a thread fails, the settle starts
// again on one thread: the same input gives the same bytes either way. tools/rust/stack-identity.ts --threads
// checks it byte for byte.
//
// Where it runs: where the heightfield's threads run (parallel.ts, a worker with a pool, its policy in
// parallelPolicy.ts), from smaller maps on (`stackThreadsFor`: a stacked column costs more than a flat tile).

import { barrier, fail, HALO, sharedPool } from "./parallel";
import { stackThreadsFor } from "./parallelPolicy";
import { STACK_FIELD, STACK_OP, StackWater } from "./stackWater";

/** Ticks between the settle's checks (rust/water/src/stack_prefill.rs `SettleRun.every`). */
export const STACK_CHECK_TICKS = 128;
/** The fewest rows a strip owns (the identity checks go down to HALO). */
const MIN_ROWS = 12;
/** The wet columns a thread needs to be worth its exchange (the identity checks force threads). */
const WET_PER_THREAD = 1024;

/** Ticks run on several threads so far (the identity checks make sure the threads really ran). */
export const stackParallelStats = { ticks: 0 };

interface Strip {
  y0: number;
  y1: number;
}

/** One block of HALO rows a strip hands a neighbour (stack.rs `export_rows`): its first row, and where and
 *  how long it sits in the shared memory. */
interface Block {
  row: number;
  at: number;
  len: number;
}

/** What every thread of a job knows: the map, the strips and where things sit in the shared memory. */
interface StackJob {
  W: number;
  H: number;
  /** The most water columns of any tile. */
  L: number;
  mask: Uint32Array;
  objects: Float64Array;
  strips: Strip[];
  /** Per boundary j (between strips j and j + 1) and parity p: the block strip j hands down (`down[2j + p]`)
   *  and the one strip j + 1 hands up (`up[2j + p]`). */
  down: Block[];
  up: Block[];
  /** Where the columns the strips have wet start (L·W·H, 1 for wet; stack.rs `wet_ever`), each strip's own
   *  rows written by that strip: the settle's reach (stackWater.ts `StackSettle.reach`). */
  reachAt: number;
  /** Where each column's outflows start (4·L·W·H; stackWater.ts `columnFlows`), each strip's own rows written by that
   *  strip at the end of each run: exact there, as their water is. */
  flowsAt: number;
  /** The shared memory's length. It starts with the whole map's depth, pressure and contamination (slot by
   *  slot, L·W·H each): the pre-fill's, then each run's end. */
  length: number;
  /** The live water's (stackLive.ts), which runs on from water already flowing: per strip, where the whole map's
   *  block of its rows sits (`exportRows`, its flows' momentum and old depth with its water), which the strip takes
   *  in once built; and where the strip writes its own rows' block at the end of each run, which the whole map's
   *  engine takes back (`StackThreads.sync`). None for a settle, which starts from the pre-fill at rest. */
  seeds?: Block[];
  owns?: Block[];
}

export type StackMessage =
  | { kind: "stack-init"; job: number; sab: SharedArrayBuffer; ctl: SharedArrayBuffer; info: StackJob; index: number }
  | { kind: "stack-run"; job: number; ticks: number; report?: boolean }
  | { kind: "stack-free"; job: number };

/** A strip in this thread: the engine over rows lo..hi (its own y0..y1 and the halo), and the run. */
class StackStrip {
  private readonly m: StackWater;
  private readonly lo: number;
  private readonly hi: number;

  constructor(
    private readonly job: StackJob,
    private readonly f: Float64Array,
    private readonly index: number,
  ) {
    const { W, H, L, strips } = job;
    const { y0, y1 } = strips[index];
    this.lo = Math.max(0, y0 - HALO);
    this.hi = Math.min(H, y1 + HALO);
    const rows = this.hi - this.lo;
    const n = rows * W;
    // its rows' objects: every object whose footprint (at most three tiles from its anchor) may reach them
    const kept: number[] = [];
    for (let k = 0; k < job.objects.length; k += 8) {
      const y = job.objects[k + 2];
      if (y < this.lo - 4 || y >= this.hi + 4) continue;
      for (let j = 0; j < 8; j++) kept.push(job.objects[k + j]);
      kept[kept.length - 6] = y - this.lo;
    }
    const m = new StackWater(W, rows, kept.length / 8, 0);
    this.m = m;
    try {
      (m.view(STACK_FIELD.masks) as Uint32Array).set(job.mask.subarray(this.lo * W, this.hi * W));
      (m.view(STACK_FIELD.objects) as Float64Array).set(kept);
      m.op(STACK_OP.build, 0, 1);
      const count = m.view(STACK_FIELD.count) as Uint8Array;
      let levels = 0;
      for (let i = 0; i < n; i++) if (count[i] > levels) levels = count[i];
      if (levels > L) throw new Error("a strip's water columns differ from the map's");
      // the water as the pre-fill left it
      const N = W * H;
      const fields = [STACK_FIELD.depth, STACK_FIELD.overflow, STACK_FIELD.contamination];
      for (let q = 0; q < 3; q++) {
        const v = m.view(fields[q]) as Float64Array;
        for (let s = 0; s < levels; s++) v.set(f.subarray((q * L + s) * N + this.lo * W, (q * L + s) * N + this.hi * W), s * n);
      }
      m.op(STACK_OP.accept);
      // (water already flowing: its flows' momentum too, but on the strip's first and last rows, whose edges are not the map's)
      const seed = job.seeds?.[index];
      if (seed) {
        m.op(STACK_OP.inbox, seed.len);
        const v = f.subarray(seed.at, seed.at + seed.len);
        (m.view(STACK_FIELD.rowsIn) as Float64Array).set(v);
        m.op(STACK_OP.importRows, 0, rows);
        // (and the momentum of its first and last rows where they are the map's own, at its top and bottom edges: their
        // edges are the map's there, and a river leaving the map flows on)
        const momentum = m.view(STACK_FIELD.momentum) as Float64Array;
        const start = m.view(STACK_FIELD.graphStart) as Uint32Array;
        const theirs = v[0];
        let p = 3 + 4 * theirs * n;
        for (let s = 0; s < theirs; s++)
          for (let r = 0; r < rows; r++) {
            const len = v[p++];
            const edge = (r === 0 && this.lo === 0) || (r === rows - 1 && this.hi === H);
            if (edge && s < levels && start[s * n + (r + 1) * W] - start[s * n + r * W] === len) momentum.set(v.subarray(p, p + len), start[s * n + r * W]);
            p += len;
          }
      }
    } catch (e) {
      m.close();
      throw e;
    }
  }

  /** Hands its rows of block b to the shared memory. */
  private put(b: Block): void {
    this.m.op(STACK_OP.exportRows, b.row - this.lo, b.row - this.lo + HALO);
    const v = this.m.view(STACK_FIELD.rowsOut) as Float64Array;
    if (v.length !== b.len) throw new Error("a strip's water columns differ from the map's");
    this.f.set(v, b.at);
  }

  /** Takes block b into its halo rows. */
  private take(b: Block): void {
    this.m.op(STACK_OP.inbox, b.len);
    (this.m.view(STACK_FIELD.rowsIn) as Float64Array).set(this.f.subarray(b.at, b.at + b.len));
    this.m.op(STACK_OP.importRows, b.row - this.lo, b.row - this.lo + HALO);
  }

  /** Runs ticks with the others, then writes its own rows back (`report`; the live water asks only when it reads them). */
  run(ctl: Int32Array, dead: Int32Array | null, ticks: number, report = true): boolean {
    const { strips, down, up, W, H, L } = this.job;
    const j = this.index;
    const T = strips.length;
    let parity = 0;
    for (let t = 0; t < ticks; t++) {
      this.m.op(STACK_OP.run, 1, 1);
      if (j > 0) this.put(up[2 * (j - 1) + parity]);
      if (j < T - 1) this.put(down[2 * j + parity]);
      if (!barrier(ctl, T, dead)) return false;
      if (j > 0) this.take(down[2 * (j - 1) + parity]);
      if (j < T - 1) this.take(up[2 * j + parity]);
      parity ^= 1;
    }
    if (!barrier(ctl, T, dead)) return false;
    if (!report) return barrier(ctl, T, dead);
    // its own rows, from a block of them: [slots, rows, width], then depth, pressure and contamination
    const { y0, y1 } = strips[j];
    this.m.op(STACK_OP.exportRows, y0 - this.lo, y1 - this.lo);
    const v = this.m.view(STACK_FIELD.rowsOut) as Float64Array;
    const levels = v[0];
    const k = (y1 - y0) * W;
    const N = W * H;
    for (let q = 0; q < 3; q++)
      for (let s = 0; s < levels; s++) this.f.set(v.subarray(3 + (q * levels + s) * k, 3 + (q * levels + s + 1) * k), (q * L + s) * N + y0 * W);
    // (the live water's: the whole block, its momentum with it, for the whole map's engine to take back)
    const own = this.job.owns?.[j];
    if (own) {
      if (v.length !== own.len) throw new Error("a strip's water columns differ from the map's");
      this.f.set(v, own.at);
    }
    // and where its own rows have been wet (exact there, as their water is)
    const reach = this.m.view(STACK_FIELD.reach) as Uint8Array;
    const n = (this.hi - this.lo) * W;
    const at = this.job.reachAt + this.lo * W;
    for (let s = 0; s < reach.length / n; s++)
      for (let i = (y0 - this.lo) * W; i < (y1 - this.lo) * W; i++) if (reach[s * n + i]) this.f[at + s * N + i] = 1;
    // and its own columns' outflows, from the block's momentum (slot by slot and row by row, each row's count first):
    // each column's flows summed by their way (stackWater.ts `columnFlows`)
    const start = this.m.view(STACK_FIELD.graphStart) as Uint32Array;
    const dir = this.m.view(STACK_FIELD.graphDirection) as Uint8Array;
    const flowsAt = this.job.flowsAt;
    let p = 3 + 4 * levels * k;
    for (let s = 0; s < levels; s++)
      for (let r = y0 - this.lo; r < y1 - this.lo; r++) {
        const len = v[p++];
        const a = start[s * n + r * W];
        for (let x = 0; x < W; x++) {
          const c = s * n + r * W + x;
          const g = flowsAt + 4 * (s * N + (r + this.lo) * W + x);
          this.f[g] = this.f[g + 1] = this.f[g + 2] = this.f[g + 3] = 0;
          for (let e = start[c]; e < start[c + 1]; e++) this.f[g + dir[e]] += v[p + e - a];
        }
        p += len;
      }
    return barrier(ctl, T, dead);
  }

  free(): void {
    this.m.close();
  }
}

/** A helper thread's handling of the stacked water's messages (parallel.ts `stripHelper` hands them here). */
export function stackStripHelper(): { handle(msg: StackMessage, flags: Int32Array | null): void; died(): void } {
  const jobs = new Map<number, { strip: StackStrip | null; ctl: Int32Array }>();
  return {
    handle(msg, flags) {
      if (msg.kind === "stack-init") {
        jobs.get(msg.job)?.strip?.free();
        let strip: StackStrip | null = null;
        try {
          strip = new StackStrip(msg.info, new Float64Array(msg.sab), msg.index);
        } catch {
          strip = null; // the run fails at once, and the coordinator settles on one thread
        }
        jobs.set(msg.job, { strip, ctl: new Int32Array(msg.ctl) });
        return;
      }
      const job = jobs.get(msg.job);
      if (msg.kind === "stack-free") {
        job?.strip?.free();
        jobs.delete(msg.job);
        return;
      }
      if (!job) return;
      try {
        if (!job.strip || !job.strip.run(job.ctl, flags, msg.ticks, msg.report ?? true)) fail(job.ctl);
      } catch {
        fail(job.ctl);
      }
    },
    died() {
      for (const job of jobs.values()) fail(job.ctl);
    },
  };
}

let jobIds = 0;
/** The settles on several threads not yet freed, oldest first. */
const live: StackThreads[] = [];
/** The most kept at once: a settle a newer edit replaced is dropped without being freed, and each holds an
 *  engine in every thread (at most 64 there); one dropped this way settles again on one thread if it runs. */
const MOST_LIVE = 2;

/** The settle's strips on several threads, or null when one thread is better (no pool, a small map, too
 *  little water) or a strip can't be built. `whole` is the whole map's engine after its pre-fill. `flowing`: the live
 *  water's (stackLive.ts), on from water already flowing: the strips take its flows' momentum too, and hand theirs back
 *  (`sync`). */
export function stackThreads(whole: StackWater, W: number, H: number, mask: Uint32Array, objects: Float64Array, flowing = false): StackThreads | null {
  const pool = sharedPool();
  if (!pool) return null;
  const N = W * H;
  const forced = pool.forced !== null;
  const minRows = forced ? HALO : MIN_ROWS;
  const most = Math.min(pool.forced ?? stackThreadsFor(N), Math.floor(H / minRows));
  if (most < 2) return null;
  pool.grow(most - 1);
  const count = whole.copy(STACK_FIELD.count) as Uint8Array;
  let L = 1;
  for (let i = 0; i < N; i++) if (count[i] > L) L = count[i];
  // the wet columns per row, from the pre-fill
  const depth = whole.view(STACK_FIELD.depth) as Float64Array;
  const rowWet = new Float64Array(H);
  let wet = 0;
  for (let s = 0; s < L; s++)
    for (let i = 0; i < N; i++)
      if (depth[s * N + i] > 0) {
        rowWet[Math.floor(i / W)]++;
        wet++;
      }
  let T = Math.min(most, pool.threads());
  if (!forced) T = Math.min(T, Math.floor(wet / WET_PER_THREAD));
  if (T < 2) return null;
  // each row's work: its water and its neighbours' (a strip runs the columns beside its water too), and a
  // little for the row itself
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
    const goal = (total * j) / T;
    while (y < H && acc < goal) acc += weight[y++];
    const y1 = Math.min(Math.max(y, y0 + minRows), H - minRows * (T - j));
    strips.push({ y0, y1 });
    y0 = y1;
  }
  strips.push({ y0, y1: H });
  // the shared memory: the whole map's water, then each boundary's blocks, two parities each way; a block's
  // length is its sender's (stack.rs `export_rows`: the sender's slots, and the map's edges on its own rows)
  const start = whole.copy(STACK_FIELD.graphStart) as Uint32Array;
  const levelsOf = (lo: number, hi: number) => {
    let k = 0;
    for (let i = lo * W; i < hi * W; i++) if (count[i] > k) k = count[i];
    return Math.max(1, k);
  };
  let at = 3 * L * N;
  const block = (row: number, sender: number): Block => {
    const s0 = strips[sender];
    const ls = levelsOf(Math.max(0, s0.y0 - HALO), Math.min(H, s0.y1 + HALO));
    let len = 3 + 4 * ls * HALO * W + ls * HALO;
    for (let s = 0; s < ls; s++) len += start[s * N + (row + HALO) * W] - start[s * N + row * W];
    const b = { row, at, len };
    at += len;
    return b;
  };
  const down: Block[] = [];
  const up: Block[] = [];
  for (let j = 0; j + 1 < strips.length; j++)
    for (let p = 0; p < 2; p++) {
      down.push(block(strips[j].y1 - HALO, j));
      up.push(block(strips[j].y1, j + 1));
    }
  const reachAt = at;
  at += L * N;
  const flowsAt = at;
  at += 4 * L * N;
  // (the live water's: each strip's rows from the whole map's engine, and room for its own rows' block, the length
  // export_rows gives it: its slots, then four numbers a column and each row's momentum with its count)
  let seeds: { block: Block; v: Float64Array }[] | undefined;
  let owns: Block[] | undefined;
  if (flowing) {
    seeds = [];
    owns = [];
    for (const s0 of strips) {
      const lo = Math.max(0, s0.y0 - HALO);
      const hi = Math.min(H, s0.y1 + HALO);
      whole.op(STACK_OP.exportRows, lo, hi);
      const v = (whole.view(STACK_FIELD.rowsOut) as Float64Array).slice();
      seeds.push({ block: { row: lo, at, len: v.length }, v });
      at += v.length;
      const ls = levelsOf(lo, hi);
      let len = 3 + 4 * ls * (s0.y1 - s0.y0) * W + ls * (s0.y1 - s0.y0);
      for (let s = 0; s < ls; s++) len += start[s * N + s0.y1 * W] - start[s * N + s0.y0 * W];
      owns.push({ row: s0.y0, at, len });
      at += len;
    }
  }
  while (live.length >= MOST_LIVE) live[0].free();
  const job: StackJob = { W, H, L, mask, objects, strips, down, up, reachAt, flowsAt, length: at, ...(seeds ? { seeds: seeds.map((x) => x.block), owns } : {}) };
  const f = new Float64Array(new SharedArrayBuffer(8 * job.length));
  const fields = [STACK_FIELD.depth, STACK_FIELD.overflow, STACK_FIELD.contamination];
  for (let q = 0; q < 3; q++) f.set((whole.view(fields[q]) as Float64Array).subarray(0, L * N), q * L * N);
  for (const x of seeds ?? []) f.set(x.v, x.block.at);
  try {
    return new StackThreads(pool, job, f);
  } catch {
    return null;
  }
}

const finalizer = typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry<StackThreads>((t) => t.free());

/** One settle's strips: the shared memory, its strip in this thread, and the runs. */
export class StackThreads {
  private readonly id = ++jobIds;
  private readonly ctl = new Int32Array(new SharedArrayBuffer(16));
  private readonly own: StackStrip;
  private freed = false;

  constructor(
    private readonly pool: NonNullable<ReturnType<typeof sharedPool>>,
    private readonly job: StackJob,
    private readonly f: Float64Array,
  ) {
    this.own = new StackStrip(job, f, 0);
    live.push(this);
    for (let j = 1; j < job.strips.length; j++)
      pool.helpers[j - 1].postMessage({ kind: "stack-init", job: this.id, sab: f.buffer as SharedArrayBuffer, ctl: this.ctl.buffer as SharedArrayBuffer, info: job, index: j } satisfies StackMessage);
  }

  /** Frees its strips when `owner` is dropped without `free` (a settle a newer edit replaced). */
  watch(owner: object): this {
    finalizer?.register(owner, this, this);
    return this;
  }

  /** Runs `ticks` ticks on every strip, each writing its own rows back after (`report`; 0 ticks: only that); false when
   *  a thread failed (the pool is then given up). */
  run(ticks: number, report = true): boolean {
    if (this.freed || this.pool.died) return false;
    let ok = false;
    try {
      for (let j = 1; j < this.job.strips.length; j++) this.pool.helpers[j - 1].postMessage({ kind: "stack-run", job: this.id, ticks, report } satisfies StackMessage);
      ok = this.own.run(this.ctl, this.pool.ready, ticks, report);
    } catch {
      ok = false;
    }
    if (!ok) {
      fail(this.ctl);
      this.pool.break();
      this.free();
      return false;
    }
    stackParallelStats.ticks += ticks;
    return true;
  }

  /** The whole map's depth, pressure and contamination after the last run, into `whole`'s state. */
  write(whole: StackWater): void {
    const n = this.job.L * this.job.W * this.job.H;
    (whole.view(STACK_FIELD.depth) as Float64Array).set(this.f.subarray(0, n));
    (whole.view(STACK_FIELD.overflow) as Float64Array).set(this.f.subarray(n, 2 * n));
    (whole.view(STACK_FIELD.contamination) as Float64Array).set(this.f.subarray(2 * n, 3 * n));
  }

  /** The whole map's water after the last run, its old depth and its flows' momentum with it, written into `whole`'s
   *  engine as the strips' depth is (`write`): each strip's own rows, from its block (stack.rs `export_rows`; a row's
   *  edges are the same in a strip as in the whole map). The live water's (`flowing`); the run's bookkeeping is the
   *  caller's (`elsewhere`). */
  sync(whole: StackWater): void {
    const { W, H } = this.job;
    const N = W * H;
    const fields = [STACK_FIELD.depth, STACK_FIELD.overflow, STACK_FIELD.contamination, STACK_FIELD.oldDepth].map((q) => whole.view(q) as Float64Array);
    const momentum = whole.view(STACK_FIELD.momentum) as Float64Array;
    const start = whole.view(STACK_FIELD.graphStart) as Uint32Array;
    for (const b of this.job.owns ?? []) {
      const { y0, y1 } = this.job.strips.find((s) => s.y0 === b.row)!;
      const v = this.f.subarray(b.at, b.at + b.len);
      const levels = v[0];
      const k = (y1 - y0) * W;
      for (let q = 0; q < 4; q++) for (let s = 0; s < levels; s++) fields[q].set(v.subarray(3 + (q * levels + s) * k, 3 + (q * levels + s + 1) * k), s * N + y0 * W);
      let p = 3 + 4 * levels * k;
      for (let s = 0; s < levels; s++)
        for (let r = y0; r < y1; r++) {
          const len = v[p++];
          const a = start[s * N + r * W];
          if (start[s * N + (r + 1) * W] - a !== len) throw new Error("a strip's water columns differ from the map's");
          momentum.set(v.subarray(p, p + len), a);
          p += len;
        }
    }
  }

  /** Marks in `into` (the whole map's reach, L·W·H) every column a strip has wet. */
  reach(into: Uint8Array): void {
    const n = this.job.L * this.job.W * this.job.H;
    const at = this.job.reachAt;
    for (let k = 0; k < n && k < into.length; k++) if (this.f[at + k]) into[k] = 1;
  }

  /** Each column's outflows after the last run (4·L·W·H; stackWater.ts `columnFlows`), from the strips' own rows. */
  flows(): Float32Array {
    const at = this.job.flowsAt;
    return Float32Array.from(this.f.subarray(at, at + 4 * this.job.L * this.job.W * this.job.H));
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    finalizer?.unregister(this);
    const k = live.indexOf(this);
    if (k >= 0) live.splice(k, 1);
    this.own.free();
    try {
      for (let j = 1; j < this.job.strips.length; j++) this.pool.helpers[j - 1]?.postMessage({ kind: "stack-free", job: this.id } satisfies StackMessage);
    } catch {
      this.pool.break();
    }
  }
}
