// The core's binding to the stacked-column water engine (D120, D448): rust/water's `stack_*` modules,
// the water of terrain above terrain by the game's rules (air gaps as columns, overlap flow, pressure
// under roofs), in the same WebAssembly module as the heightfield water (./rustWater.ts, ./waterWasm.ts).
// A map whose every tile is one open column runs today's heightfield simulation unchanged inside the
// engine (rust/water/src/stack_engine.rs `open_field`).
//
// The engine owns its typed arrays; one call runs one operation (rust/water/src/stack_memory.rs). A
// view is a window into the module's memory: read or fill it at once and ask again after any
// operation, since memory may have moved. Every refusal is the engine's own one line (D342).
//
// Nothing in the app calls this yet: Foundations' next stage wires it in. Its results on the eight
// game-verified fixtures (tests/golden/stacked-water.json) are checked natively and in WebAssembly on
// every push (tools/rust/stack-identity.ts), and in every browser engine (tools/determinism).

import type { VoxelMasks } from "./columns";
import { isDelayed, specifiedStrength, type MapObject } from "./model";
import { rustWater } from "./rustWater";

interface Exports {
  memory: { buffer: ArrayBuffer };
  stack_create(w: number, h: number, objects: number, retained: number): number;
  stack_free(handle: number): number;
  stack_ptr(handle: number, field: number): number;
  stack_len(handle: number, field: number): number;
  stack_op(handle: number, op: number, a: number, b: number): number;
  stack_info(handle: number, query: number): number;
  stack_error_ptr(): number;
  stack_error_len(): number;
}

/** The engine's typed arrays, by number. Inputs, filled before `build`: the terrain's masks, the
 *  objects (`stackObjectRows`), retained water (tile, floor, depth, contamination) and the drained
 *  tiles. Geometry, read-only after `build`: the water columns per id (slot·N + tile) and the terrain
 *  runs. State, per column id, writable between runs (then `accept`): depth, overflow (a full cave's
 *  pressure), contamination. */
export const STACK_FIELD = {
  masks: 0,
  objects: 1,
  retained: 2,
  count: 3,
  floor: 4,
  ceil: 5,
  depth: 6,
  overflow: 7,
  contamination: 8,
  oldDepth: 9,
  momentum: 10,
  graphStart: 11,
  graphTarget: 12,
  graphDirection: 13,
  graphReverse: 14,
  emitters: 15,
  saturation: 16,
  runCount: 17,
  runFloor: 18,
  runTop: 19,
  drained: 20,
} as const;

/** The engine's operations: `build` (a: 0 the game's rules, 1 the port's); `run` (a ticks, b scale);
 *  `prefill`; `settleBegin` (a: the most days; an open field takes 6, today's settle); `advance` (a: a
 *  tick budget, so a caller can show progress); `accept` (after writing state); `saturation`. */
export const STACK_OP = { build: 0, run: 1, prefill: 2, settleBegin: 3, advance: 4, accept: 5, saturation: 6 } as const;

/** What `info` answers: ticks run; 0 an open field (today's simulation) or 1 stacked; the settle's
 *  state (0 running, 1 settled, 2 out of days); the settle's steady ticks (negative: none); its most
 *  ticks. */
export const STACK_INFO = { ticks: 0, stacked: 1, settle: 2, steadyTicks: 3, maxTicks: 4 } as const;

const TYPES = [Uint32Array, Float64Array, Float64Array, Uint8Array, Int16Array, Int16Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Uint32Array, Int32Array, Uint8Array, Int32Array, Float64Array, Uint8Array, Uint8Array, Int16Array, Int16Array, Uint8Array] as const;

export type StackView = Uint8Array | Int16Array | Uint32Array | Int32Array | Float64Array;

/** One map in the engine. `close` it when done: the engine holds at most 64. */
export class StackWater {
  private readonly wasm: Exports;
  private readonly handle: number;
  private open = true;

  constructor(
    readonly W: number,
    readonly H: number,
    objects = 0,
    retained = 0,
  ) {
    if (![W, H, objects, retained].every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff)) throw new Error("Water input counts are invalid.");
    this.wasm = rustWater() as unknown as Exports;
    this.handle = this.wasm.stack_create(W, H, objects, retained);
    if (!this.handle) throw new Error(this.error());
  }

  private error(): string {
    return new TextDecoder().decode(new Uint8Array(this.wasm.memory.buffer, this.wasm.stack_error_ptr(), this.wasm.stack_error_len()));
  }

  /** A window on one of the engine's arrays (`STACK_FIELD`): valid until the next operation. */
  view(field: number): StackView {
    if (!this.open || !Number.isInteger(field) || field < 0 || field >= TYPES.length) throw new Error("Water map handle or field is invalid.");
    const p = this.wasm.stack_ptr(this.handle, field);
    const n = this.wasm.stack_len(this.handle, field);
    if (!p) throw new Error(this.error());
    return new TYPES[field](this.wasm.memory.buffer, p, n);
  }

  /** A copy of one of the engine's arrays, safe to keep. */
  copy(field: number): StackView {
    return this.view(field).slice();
  }

  /** Run one operation (`STACK_OP`); a refusal throws the engine's one line. */
  op(op: number, a = 0, b = 0): this {
    if (!this.open || !Number.isInteger(op) || op < 0 || op > 0xffffffff) throw new Error("Water operation is unknown.");
    if (this.wasm.stack_op(this.handle, op, a, b)) throw new Error(this.error());
    return this;
  }

  /** One of the engine's answers (`STACK_INFO`). */
  info(query: number): number {
    if (!this.open || !Number.isInteger(query) || query < 0 || query > 4) throw new Error("Water map handle or query is invalid.");
    const v = this.wasm.stack_info(this.handle, query);
    const e = this.error();
    if (e) throw new Error(e);
    return v;
  }

  close(): void {
    if (this.open) {
      this.wasm.stack_free(this.handle);
      this.open = false;
    }
  }
}

/** The objects that shape water columns or emit, by the engine's codes (rust/water/src/columns.rs). */
const KINDS: Record<string, number> = {
  Blockage: 1,
  NaturalDam: 2,
  NaturalOverhang2x1: 3,
  NaturalOverhang3x1: 4,
  NaturalOverhang4x1: 5,
  BadtideDrain: 6,
  WaterSource: 7,
  BadwaterSource: 8,
  WaterSeep: 9,
  BadwaterSeep: 10,
  Aquifer: 11,
};
const ROTATIONS: Record<string, number> = { Cw0: 0, Cw90: 1, Cw180: 2, Cw270: 3 };

/** The map's objects as the engine takes them, in file order: eight numbers each (kind, x, y, z,
 *  rotation, flipped, delayed, strength). Objects that neither shape a water column nor emit are
 *  left out. An emitter whose strength is not a number emits nothing; a sink (a strength below 0)
 *  has no stacked form yet and is refused. */
export function stackObjectRows(objects: readonly MapObject[]): Float64Array {
  const rows: number[] = [];
  for (const o of objects) {
    const kind = KINDS[o.template];
    if (kind === undefined) continue;
    let strength = kind >= 7 ? specifiedStrength(o.components) : 0;
    if (!Number.isFinite(strength)) strength = 0;
    if (strength < 0) throw new Error(`${o.template} at (${o.x}, ${o.y}) takes water away, which stacked water does not model yet`);
    rows.push(kind, o.x, o.y, o.z, ROTATIONS[o.orientation] ?? 0, o.flipped ? 1 : 0, isDelayed(o.components) ? 1 : 0, strength);
  }
  return Float64Array.from(rows);
}

/** A settle on stacked columns: geometry and water per column id (slot·N + tile). */
export interface StackSettle {
  W: number;
  H: number;
  /** The most water columns of any tile. */
  L: number;
  /** False on an open field: today's heightfield simulation ran, unchanged. */
  stacked: boolean;
  count: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
  depth: Float64Array;
  /** A full cave's pressure, 0 in the open. */
  overflow: Float64Array;
  contamination: Float64Array;
  /** Cluster saturation of the settled water. */
  sat: Uint8Array;
  settled: boolean;
  ticks: number;
}

/** The days a stacked canonical settle may take (#71's, which the probe's test maps were played
 *  with); an open field's is today's 6. */
export const STACK_SETTLE_DAYS = 4;

/** The canonical settle of a map by the game's rules: the pre-fill, then ticks until the water stands
 *  still or the days run out. It runs `slice` ticks at a time and tells `progress` the ticks so far
 *  and the most there can be, so a caller can show it and stay responsive. */
export function canonicalStackSettle(t: VoxelMasks, objects: readonly MapObject[], opts: { slice?: number; progress?: (ticks: number, max: number) => void } = {}): StackSettle {
  const rows = stackObjectRows(objects);
  const m = new StackWater(t.W, t.H, rows.length / 8, 0);
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(t.mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(rows);
    m.op(STACK_OP.build, 0);
    const stacked = m.info(STACK_INFO.stacked) === 1;
    m.op(STACK_OP.settleBegin, stacked ? STACK_SETTLE_DAYS : 6);
    const slice = opts.slice ?? 10_000_000;
    while (m.info(STACK_INFO.settle) === 0) {
      m.op(STACK_OP.advance, slice);
      opts.progress?.(m.info(STACK_INFO.ticks), m.info(STACK_INFO.maxTicks));
    }
    m.op(STACK_OP.saturation);
    const count = m.copy(STACK_FIELD.count) as Uint8Array;
    let L = 1;
    for (let i = 0; i < count.length; i++) if (count[i] > L) L = count[i];
    return {
      W: t.W,
      H: t.H,
      L,
      stacked,
      count,
      floor: m.copy(STACK_FIELD.floor) as Int16Array,
      ceil: m.copy(STACK_FIELD.ceil) as Int16Array,
      depth: m.copy(STACK_FIELD.depth) as Float64Array,
      overflow: m.copy(STACK_FIELD.overflow) as Float64Array,
      contamination: m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: m.copy(STACK_FIELD.saturation) as Uint8Array,
      settled: m.info(STACK_INFO.settle) === 1,
      ticks: m.info(STACK_INFO.ticks),
    };
  } finally {
    m.close();
  }
}
