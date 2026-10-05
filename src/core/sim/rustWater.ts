// The Rust water's WebAssembly binding (PLAN §10, §20 D381, D441, D442): rust/water, compiled with strict
// floating point and embedded in ./waterWasm.ts by tools/rust/build.ts, so nothing is fetched and the core
// stays headless (Node, workers and every engine run the same module). WaterSim (water.ts) keeps its public
// arrays in JavaScript; each run copies what a caller may have changed (the floor, the partial obstacles, the
// depth, the badwater share, the outflows and the emitters' strengths and seep limits) into the simulation,
// runs it, and copies the water back. Everything else the simulation keeps between runs (its wet list, active
// list, flows and evaporation modifiers) stays in Rust, as it stayed inside the TypeScript simulation it
// replaced (tag `ts-water-final`).
//
// Formats: rust/water/src/protocol.rs.

import { WATER_WASM } from "./waterWasm";

interface Exports {
  memory: WebAssembly.Memory;
  water_alloc(len: number): number;
  water_dealloc(ptr: number, len: number): void;
  water_new(ptr: number, len: number): number;
  water_strip(ptr: number, len: number): number;
  water_sync(sim: number, lo: number, hi: number): void;
  water_seep(sim: number, k: number, set: number): number;
  water_free(sim: number): void;
  water_ptr(sim: number, which: number): number;
  water_run(sim: number, ticks: number, scale: number): void;
  water_saturation(sim: number, ptr: number): void;
  water_books(sim: number): number;
  water_canonical(ptr: number, len: number, outLen: number): number;
}

/** What a model carries into the simulation (water.ts `WaterModel`'s fields the simulation reads). */
export interface RustModel {
  W: number;
  H: number;
  floor: Float64Array;
  dam: Float64Array | null;
  emitters: readonly { cells: readonly number[]; strength: number; contamination: number; depthLimit?: { anchor: number; off: number; on: number } }[];
}

let module: Exports | null = null;

/** The instantiated module, compiled once per thread on first use. */
export function rustWater(): Exports {
  if (!module) {
    const text = atob(WATER_WASM);
    const bytes = new Uint8Array(text.length);
    for (let k = 0; k < text.length; k++) bytes[k] = text.charCodeAt(k);
    module = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports;
  }
  return module;
}

let runs: boolean | null = null;

/** Whether this thread can run the Rust water: false on a page whose policy refuses WebAssembly (the Claude
 *  artifact edition's). */
export function rustWaterRuns(): boolean {
  if (runs === null) {
    try {
      rustWater();
      runs = true;
    } catch {
      runs = false;
    }
  }
  return runs;
}

/** Writes little-endian values (protocol.rs's formats). */
export class Writer {
  private buf: ArrayBuffer;
  private view: DataView;
  at = 0;
  constructor(size: number) {
    this.buf = new ArrayBuffer(size);
    this.view = new DataView(this.buf);
  }
  u32(v: number): void {
    this.view.setUint32(this.at, v, true);
    this.at += 4;
  }
  f64(v: number): void {
    this.view.setFloat64(this.at, v, true);
    this.at += 8;
  }
  f64s(a: ArrayLike<number>): void {
    for (let k = 0; k < a.length; k++) this.f64(a[k]);
  }
  u32s(a: ArrayLike<number>): void {
    for (let k = 0; k < a.length; k++) this.u32(a[k]);
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.buf, 0, this.at);
  }
}

/** The encoded model's size in bytes. */
export function modelSize(m: RustModel): number {
  const n = m.W * m.H;
  let size = 12 + 8 * n * (m.dam ? 2 : 1) + 4;
  for (const e of m.emitters) size += 4 + 4 * e.cells.length + 8 + 8 + 4 + 4 + 8 + 8;
  return size;
}

export function writeModel(w: Writer, m: RustModel): void {
  w.u32(m.W);
  w.u32(m.H);
  w.u32(m.dam ? 1 : 0);
  w.f64s(m.floor);
  if (m.dam) w.f64s(m.dam);
  w.u32(m.emitters.length);
  for (const e of m.emitters) {
    w.u32(e.cells.length);
    w.u32s(e.cells);
    w.f64(e.strength);
    w.f64(e.contamination);
    const l = e.depthLimit;
    w.u32(l ? 1 : 0);
    w.u32(l ? l.anchor : 0);
    w.f64(l ? l.off : 0);
    w.f64(l ? l.on : 0);
  }
}

/** Copies `bytes` into the module's memory and calls `use` with their place; frees them afterwards. */
export function withBytes<T>(bytes: Uint8Array, use: (ptr: number, len: number) => T): T {
  const x = rustWater();
  const ptr = x.water_alloc(bytes.length);
  try {
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    return use(ptr, bytes.length);
  } finally {
    x.water_dealloc(ptr, bytes.length);
  }
}

const SIM_MAGIC = 0x534d4744; // "DGMS"

/** The rules a simulation runs, resolved (water.ts `WaterSimOptions`): the game's or the port's, and the
 *  spill threshold at the map's edge. */
export interface RustRules {
  game: boolean;
  edgeSpill: boolean;
}

function writeRules(w: Writer, r: RustRules): void {
  w.u32(r.game ? 1 : 0);
  w.u32(r.edgeSpill ? 1 : 0);
}

/** Whether two arrays hold the same bits (a fast exact comparison: what a direct edit of the water changes). */
export function sameBits(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  const x = new Int32Array(a.buffer, a.byteOffset, 2 * a.length);
  const y = new Int32Array(b.buffer, b.byteOffset, 2 * b.length);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// A Rust simulation is freed by `free` (WaterSim.dispose), or else when its WaterSim is collected. Wasm memory
// never shrinks, so code that makes and drops many simulations frees each when done with it.
const finalizer = new FinalizationRegistry<number>((handle) => rustWater().water_free(handle));

/** A Rust simulation: its handle and the places of its arrays (they never move). */
export class RustSim {
  private readonly handle: number;
  private freed = false;
  private adoptedPending = false;
  private readonly n: number;
  private readonly hasDam: boolean;
  private readonly ptrs: { d: number; dold: number; c: number; out: number; floor: number; dam: number; params: number };
  private readonly params: Float64Array;

  constructor(owner: object, m: RustModel, depth: Float64Array | null, contamination: Float64Array | null, rules: RustRules) {
    const n = m.W * m.H;
    const w = new Writer(4 + modelSize(m) + 8 + 4 + (depth ? 16 * n : 0));
    w.u32(SIM_MAGIC);
    writeModel(w, m);
    writeRules(w, rules);
    w.u32(depth ? 1 : 0);
    if (depth && contamination) {
      w.f64s(depth);
      w.f64s(contamination);
    }
    const x = rustWater();
    this.handle = withBytes(w.bytes(), (ptr, len) => x.water_new(ptr, len));
    finalizer.register(owner, this.handle, this);
    this.n = n;
    this.hasDam = !!m.dam;
    const at = (which: number) => x.water_ptr(this.handle, which);
    this.ptrs = { d: at(0), dold: at(1), c: at(2), out: at(3), floor: at(4), dam: at(5), params: at(6) };
    this.params = new Float64Array(4 * m.emitters.length);
  }

  /** Frees the Rust simulation now; again is a no-op. Using it afterwards throws. */
  free(): void {
    if (this.freed) return;
    this.freed = true;
    finalizer.unregister(this);
    rustWater().water_free(this.handle);
  }

  private f64(ptr: number, len: number): Float64Array {
    if (this.freed) throw new Error("This water simulation was disposed (WaterSim.dispose): make a new one to run water.");
    return new Float64Array(rustWater().memory.buffer, ptr, len);
  }

  /** Whether the caller's water differs from the water this simulation last held: a direct edit of the public
   *  arrays (water.ts keeps such a simulation on one thread: rebuilding the strips' occupancy from the edit
   *  would change the established one-thread bytes). */
  waterChanged(D: Float64Array, C: Float64Array, out: Float64Array): boolean {
    const { n, ptrs } = this;
    return !sameBits(D, this.f64(ptrs.d, n)) || !sameBits(C, this.f64(ptrs.c, n)) || !sameBits(out, this.f64(ptrs.out, 4 * n));
  }

  /** Sets the outflows (the water's momentum) this simulation holds, with `WaterSim.setOut`. */
  setOut(out: ArrayLike<number>): void {
    this.f64(this.ptrs.out, 4 * this.n).set(out);
  }

  /** Copies the caller's water and model into the simulation. */
  private copyIn(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array): void {
    // An adopted state has dirty evaporation modifiers. Flush them against committed depth
    // before copying a public edit; an ordinary run computes them itself, with unchanged bytes.
    if (this.adoptedPending && this.waterChanged(D, C, out)) {
      rustWater().water_books(this.handle);
      this.adoptedPending = false;
    }
    const { n, ptrs } = this;
    this.f64(ptrs.floor, n).set(m.floor);
    if (this.hasDam && m.dam) this.f64(ptrs.dam, n).set(m.dam);
    this.f64(ptrs.d, n).set(D);
    this.f64(ptrs.c, n).set(C);
    this.f64(ptrs.out, 4 * n).set(out);
  }

  /** `ticks` ticks at source scale `scale`; the water comes back into `D`, `C` and `out`. */
  run(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array, ticks: number, scale: number): void {
    this.copyIn(m, D, C, out);
    const p = this.params;
    for (let k = 0; k < m.emitters.length; k++) {
      const e = m.emitters[k];
      p[4 * k] = e.strength;
      p[4 * k + 1] = e.contamination;
      p[4 * k + 2] = e.depthLimit ? e.depthLimit.off : 0;
      p[4 * k + 3] = e.depthLimit ? e.depthLimit.on : 0;
    }
    if (p.length) this.f64(this.ptrs.params, p.length).set(p);
    const x = rustWater();
    let left = ticks;
    while (left > 0) {
      const step = left > 0x40000000 ? 0x40000000 : left;
      x.water_run(this.handle, step, scale);
      left -= step;
    }
    const { n, ptrs } = this;
    this.adoptedPending = false;
    D.set(this.f64(ptrs.d, n));
    C.set(this.f64(ptrs.c, n));
    out.set(this.f64(ptrs.out, 4 * n));
  }

  /** The cluster saturation of the water in `D`. */
  saturation(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array): Uint8Array {
    this.copyIn(m, D, C, out);
    const x = rustWater();
    const n = this.n;
    const ptr = x.water_alloc(n);
    try {
      x.water_saturation(this.handle, ptr);
      return new Uint8Array(x.memory.buffer, ptr, n).slice();
    } finally {
      x.water_dealloc(ptr, n);
    }
  }

  /** The simulation's bookkeeping against the same rebuilt from the water in `D` (the tests): null when they
   *  agree, else what differs and where. */
  booksError(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array): string | null {
    this.copyIn(m, D, C, out);
    const code = rustWater().water_books(this.handle);
    if (code === 0) return null;
    const what = ["", "the active list", "the wet list", "a wet-neighbour count", "an evaporation modifier"][Math.floor(code / 4294967296)];
    return `${what} at tile ${code % 4294967296}`;
  }

  /** The depth before the last substep (water.ts `Dold`), a copy. */
  dold(): Float64Array {
    return this.f64(this.ptrs.dold, this.n).slice();
  }

  /** Each emitter's seep state (1 on, 0 off; only a seep is ever off). */
  seeps(count: number): Uint8Array {
    const x = rustWater();
    const out = new Uint8Array(count);
    for (let k = 0; k < count; k++) out[k] = x.water_seep(this.handle, k, 2);
    return out;
  }

  /** Takes over water another simulation ran (the multi-core water's, parallel.ts): the caller's water and
   *  model, the depth before the last substep and the seeps' states, then the bookkeeping rebuilt to match. */
  adopt(m: RustModel, D: Float64Array, C: Float64Array, out: Float64Array, dold: Float64Array, seeps: Uint8Array): void {
    this.copyIn(m, D, C, out);
    this.f64(this.ptrs.dold, this.n).set(dold);
    const x = rustWater();
    for (let k = 0; k < seeps.length; k++) x.water_seep(this.handle, k, seeps[k] ? 1 : 0);
    x.water_sync(this.handle, 0, m.H);
    this.adoptedPending = true;
  }
}

/** One strip of a larger map in this thread's module (the multi-core water, parallel.ts; rust/water's
 *  `Sim::new_strip`): rows `lo..hi` of a map `mapH` rows high, each emitter its cells on them with the whole
 *  emitter's tile count. Its arrays are views of the module's memory, valid until the next call that can grow
 *  it, so they are taken afresh after each call. */
export class RustStrip {
  readonly handle: number;
  private readonly ptrs: { d: number; dold: number; c: number; out: number; floor: number; dam: number; params: number };
  private freed = false;

  constructor(
    m: RustModel,
    depth: Float64Array,
    contamination: Float64Array,
    rules: RustRules,
    lo: number,
    mapH: number,
    counts: readonly number[],
    readonly n = m.W * m.H,
  ) {
    const w = new Writer(4 + modelSize(m) + 8 + 16 * this.n + 8 + 4 * counts.length);
    w.u32(STRIP_MAGIC);
    writeModel(w, m);
    writeRules(w, rules);
    w.f64s(depth);
    w.f64s(contamination);
    w.u32(lo);
    w.u32(mapH);
    w.u32s(counts);
    const x = rustWater();
    this.handle = withBytes(w.bytes(), (ptr, len) => x.water_strip(ptr, len));
    const at = (which: number) => x.water_ptr(this.handle, which);
    this.ptrs = { d: at(0), dold: at(1), c: at(2), out: at(3), floor: at(4), dam: at(5), params: at(6) };
  }

  /** A view of one of its arrays: depth, old depth, contamination, outflows (4 per tile), floor, partial
   *  obstacles, emitter parameters (4 per emitter). */
  view(which: "d" | "dold" | "c" | "out" | "floor" | "dam" | "params", len: number): Float64Array {
    return new Float64Array(rustWater().memory.buffer, this.ptrs[which], len);
  }

  run(ticks: number, scale: number): void {
    rustWater().water_run(this.handle, ticks, scale);
  }

  /** The bookkeeping brought up to date with water written over its rows `lo..hi`. */
  sync(lo: number, hi: number): void {
    if (hi > lo) rustWater().water_sync(this.handle, lo, hi);
  }

  seep(k: number, set = 2): number {
    return rustWater().water_seep(this.handle, k, set);
  }

  free(): void {
    if (this.freed) return;
    this.freed = true;
    rustWater().water_free(this.handle);
  }
}

const STRIP_MAGIC = 0x544d4744; // "DGMT"

// ------------------------------------------------------------------------------- the canonical settle job

const CANONICAL_MAGIC = 0x434d4744; // "DGMC"

/** A canonical settle job (protocol.rs): the model, its stored lakes' tiles, its drained tiles and the
 *  pre-fill's water. */
export function encodeCanonicalJob(
  m: RustModel & { retained?: readonly { tiles: readonly number[] }[]; drained?: readonly number[] },
  depth: Float64Array,
  contamination: Float64Array,
  rules: RustRules = { game: true, edgeSpill: true },
): Uint8Array {
  const n = m.W * m.H;
  const lakes = m.retained ?? [];
  const drained = m.drained ?? [];
  let size = 4 + modelSize(m) + 8 + 4 + 4 + 4 * drained.length + 16 * n;
  for (const l of lakes) size += 4 + 4 * l.tiles.length;
  const w = new Writer(size);
  w.u32(CANONICAL_MAGIC);
  writeModel(w, m);
  writeRules(w, rules);
  w.u32(lakes.length);
  for (const l of lakes) {
    w.u32(l.tiles.length);
    w.u32s(l.tiles);
  }
  w.u32(drained.length);
  w.u32s(drained);
  w.f64s(depth);
  w.f64s(contamination);
  return w.bytes();
}

/** A canonical settle job's result (protocol.rs), in prefill.ts `CanonicalWater`'s shape and key order. */
export interface CanonicalBytes {
  settled: boolean;
  ticks: number;
  steadyTicks?: number;
  depth: Float64Array;
  contamination: Float64Array;
  sat: Uint8Array;
  out: Float64Array;
}

export function decodeCanonical(bytes: Uint8Array, n: number): CanonicalBytes {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength !== 24 + 49 * n) throw new Error(`a canonical settle result of ${bytes.byteLength} bytes for ${n} tiles`);
  const settled = v.getUint32(0, true) === 1;
  const ticks = v.getFloat64(4, true);
  const steady = v.getUint32(12, true) === 1 ? v.getFloat64(16, true) : undefined;
  const f64s = (at: number, len: number) => {
    const a = new Float64Array(len);
    for (let k = 0; k < len; k++) a[k] = v.getFloat64(at + 8 * k, true);
    return a;
  };
  const depth = f64s(24, n);
  const contamination = f64s(24 + 8 * n, n);
  const out = f64s(24 + 16 * n, 4 * n);
  const sat = bytes.slice(24 + 48 * n, 24 + 48 * n + n);
  return { settled, ticks, ...(steady !== undefined ? { steadyTicks: steady } : {}), depth, contamination, sat, out };
}

/** The whole canonical settle after its pre-fill, run by the Rust settle in WebAssembly in this thread (the
 *  native batch's code): its encoded result. */
export function canonicalBytesInWasm(job: Uint8Array): Uint8Array {
  const x = rustWater();
  const lenPtr = x.water_alloc(4);
  try {
    const ptr = withBytes(job, (p, len) => x.water_canonical(p, len, lenPtr));
    const len = new DataView(x.memory.buffer).getUint32(lenPtr, true);
    try {
      return new Uint8Array(x.memory.buffer, ptr, len).slice();
    } finally {
      x.water_dealloc(ptr, len);
    }
  } finally {
    x.water_dealloc(lenPtr, 4);
  }
}

/** The same, decoded. */
export function canonicalInWasm(job: Uint8Array, n: number): CanonicalBytes {
  return decodeCanonical(canonicalBytesInWasm(job), n);
}
