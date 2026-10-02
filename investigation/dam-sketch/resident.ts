// Headless use of rust-water's existing scalar ABI. State stays in Rust between slices.
// Avoids the browser adapter's four whole-grid copies on every weather tick.
import type { WaterModel, WaterState } from './local/runtime';
interface ABI {
  memory: WebAssembly.Memory; water_alloc(n: number): number; water_dealloc(p: number, n: number): void;
  water_new(p: number, n: number): number; water_free(h: number): void;
  water_run(h: number, ticks: number, scale: number): void;
  water_ptr(h: number, kind: number): number;
  water_emitter(h: number, i: number, s: number, c: number, anchor: number, off: number, on: number): void;
}
let arena: ABI | null = null;
/** Same DRW1 bytes as rust-water/protocol.ts, with bulk array copies on little-endian hosts. */
export function encodeResidentModel(model: WaterModel, state: WaterState, out?: Float64Array): Uint8Array {
  const N = model.W * model.H;
  const length = 20 + (7 + (model.dam ? 1 : 0)) * N * 8 +
    model.emitters.reduce((n, e) => n + 40 + e.cells.length * 4, 0);
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer); let at = 0;
  const u32 = (n: number) => { view.setUint32(at, n, true); at += 4; };
  const f64 = (n: number) => { view.setFloat64(at, n, true); at += 8; };
  const test = new Uint16Array([1]), little = new Uint8Array(test.buffer)[0] === 1;
  const array = (a: Float64Array | undefined, count = N) => {
    if (!a) { at += count * 8; return; }
    if (little) { bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at); at += a.byteLength; }
    else for (let k = 0; k < a.length; k++) f64(a[k]);
  };
  u32(0x31575244); u32(model.W); u32(model.H); u32(3 | (model.dam ? 4 : 0)); u32(model.emitters.length);
  array(model.floor); if (model.dam) array(model.dam); array(state.depth); array(state.contamination); array(out, 4 * N);
  for (const e of model.emitters) {
    u32(e.cells.length); for (const i of e.cells) u32(i);
    f64(e.strength); f64(e.contamination); u32(e.depthLimit?.anchor ?? 0xffffffff);
    f64(e.depthLimit?.off ?? 0); f64(e.depthLimit?.on ?? 0);
  }
  if (at !== length) throw Error('DRW1 length mismatch'); return bytes;
}
export function installResident(bytes: BufferSource) {
  const candidate = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports as unknown as ABI;
  for (const name of ['water_alloc', 'water_dealloc', 'water_new', 'water_free', 'water_run', 'water_ptr', 'water_emitter']) {
    if (typeof candidate[name as keyof ABI] !== 'function') throw Error('Rust ABI missing ' + name);
  }
  if (!(candidate.memory instanceof WebAssembly.Memory)) throw Error('Rust memory missing');
  arena = candidate;
}
export const hasResident = () => arena !== null;
export class ResidentWater {
  private readonly arena: ABI; private handle: number; ticks = 0;
  readonly N: number;
  constructor(readonly model: WaterModel, state: WaterState, out?: Float64Array) {
    if (!arena) throw Error('Rust was not installed');
    this.arena = arena; this.N = model.W * model.H;
    const bytes = encodeResidentModel(model, state, out);
    const p = this.arena.water_alloc(bytes.length);
    try {
      new Uint8Array(this.arena.memory.buffer, p, bytes.length).set(bytes);
      this.handle = this.arena.water_new(p, bytes.length);
      if (!this.handle) throw Error('Rust construction returned a null handle');
    } finally { this.arena.water_dealloc(p, bytes.length); }
  }
  private view(kind: number, n = this.N) {
    if (!this.handle) throw Error('Disposed Rust water');
    // Reacquire after every call that could grow the shared arena; no persistent typed views.
    return new Float64Array(this.arena.memory.buffer, this.arena.water_ptr(this.handle, kind), n);
  }
  get F() { return this.view(0); } get D() { return this.view(1); } get C() { return this.view(2); }
  get Dold() { return this.view(3); } get out() { return this.view(4, 4 * this.N); }
  run(n: number) { this.arena.water_run(this.handle, n, 1); this.ticks += n; }
  volume() { let v = 0; const d = this.D; for (let i = 0; i < d.length; i++) v += d[i]; return v; }
  force(strengths: readonly number[], contamination: readonly number[]) {
    for (let k = 0; k < strengths.length; k++) {
      const limit = this.model.emitters[k].depthLimit;
      this.arena.water_emitter(this.handle, k, strengths[k], contamination[k],
        limit?.anchor ?? 0xffffffff, limit?.off ?? 0, limit?.on ?? 0);
    }
  }
  dispose() { if (this.handle) { this.arena.water_free(this.handle); this.handle = 0; } }
}
