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
// The canonical settle of a model with terrain above terrain runs here (prefill.ts, `WaterModel.stacked`):
// an imported map with caves or overhangs, once it is edited (features/build.ts). A heightfield never
// comes here. Its results on the
// game-verified fixtures (tests/golden/stacked-water.json) are checked natively and in WebAssembly on
// every push (tools/rust/stack-identity.ts), and in every browser engine (tools/determinism).

import { OPEN_CEILING, type VoxelMasks, type WaterColumns } from "./columns";
import { surfaceOf, type WorldModel } from "../format/world";
import { ColumnTerrain } from "../terrain/runs";
import { isDelayed, mapObjects, specifiedStrength, waterModel, type MapObject } from "./model";
import { rustWater } from "./rustWater";
import { STACK_CHECK_TICKS, stackThreads, type StackThreads } from "./stackParallel";
import { sameRetained, type RetainedWater, type StackedTerrain, type WaterModel } from "./water";

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
  rowsOut: 21,
  rowsIn: 22,
  reach: 23,
} as const;

/** The engine's operations: `build` (a: 0 the game's rules, 1 the port's; b: 1 the stacked rules even on
 *  an open field, a strip of a map with caves); `run` (a ticks, b scale); `prefill`; `settleBegin` (a: the
 *  most days; an open field takes 6, today's settle); `advance` (a: a tick budget, so a caller can show
 *  progress); `accept` (after writing state); `saturation`; `exportRows` (rows a..b as a block, `rowsOut`);
 *  `elsewhere` (a settle's water after a ticks run elsewhere, written whole: its checks run here); `inbox`
 *  (room for a block of a numbers, `rowsIn`); `importRows` (the block in `rowsIn` as rows a..b). The last
 *  four are the multi-core settle's (stackParallel.ts). */
export const STACK_OP = { build: 0, run: 1, prefill: 2, settleBegin: 3, advance: 4, accept: 5, saturation: 6, exportRows: 7, elsewhere: 8, inbox: 9, importRows: 10 } as const;

/** What `info` answers: ticks run; 0 an open field (today's simulation) or 1 stacked; the settle's
 *  state (0 running, 1 settled, 2 out of days); the settle's steady ticks (negative: none); its most
 *  ticks. */
export const STACK_INFO = { ticks: 0, stacked: 1, settle: 2, steadyTicks: 3, maxTicks: 4 } as const;

const TYPES = [Uint32Array, Float64Array, Float64Array, Uint8Array, Int16Array, Int16Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Uint32Array, Int32Array, Uint8Array, Int32Array, Float64Array, Uint8Array, Uint8Array, Int16Array, Int16Array, Uint8Array, Float64Array, Float64Array, Uint8Array] as const;

export type StackView = Uint8Array | Int16Array | Uint32Array | Int32Array | Float64Array;

/** Frees a map the caller dropped without closing (a settle a newer edit replaced). */
const dropped = typeof FinalizationRegistry === "undefined" ? null : new FinalizationRegistry<{ wasm: Exports; handle: number }>((m) => m.wasm.stack_free(m.handle));

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
    dropped?.register(this, { wasm: this.wasm, handle: this.handle }, this);
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
      dropped?.unregister(this);
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
 *  left out, and so is one outside the water's levels (below 0 or at 34 and above: a file from a
 *  taller, modded game). An emitter whose strength is not a number emits nothing; a strength below 0
 *  is a sink (D337), which takes water away. */
export function stackObjectRows(objects: readonly MapObject[]): Float64Array {
  const rows: number[] = [];
  for (const o of objects) {
    const kind = KINDS[o.template];
    if (kind === undefined || !(o.z >= 0 && o.z < OPEN_CEILING)) continue;
    let strength = kind >= 7 ? specifiedStrength(o.components) : 0;
    if (!Number.isFinite(strength)) strength = 0;
    rows.push(kind, o.x, o.y, o.z, ROTATIONS[o.orientation] ?? 0, o.flipped ? 1 : 0, isDelayed(o.components) ? 1 : 0, strength);
  }
  return Float64Array.from(rows);
}

/** What a map with caves or overhangs refuses for now, one plain line each (D280, Kyler 2026-10-07):
 *  each waits for its rule for water in caves. Whether a map is one is `cavesOf`. Drought, Badtide and
 *  the drought line have theirs (`StackRun`, #391). */
export const CAVE_REFUSALS = {
  fill: "Fill isn't worked out for maps with caves yet",
  removeUnfed: "Removing unfed water isn't worked out for maps with caves yet",
} as const;

/** Whether a map's water is that of a map with caves or overhangs (some tile not one plain run from the
 *  bottom, `stackedModel`): the one predicate for what such a map still refuses (`CAVE_REFUSALS`). */
export function cavesOf(model: Pick<WaterModel, "stacked">): boolean {
  return !!model.stacked;
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
  /** A canonical settle's only (`canonicalStackRun`, `settledAgain`): 1 on every column that was wet at
   *  some substep of the settle (rust/water/src/stack.rs `wet_ever`), per column id. */
  reach?: Uint8Array;
  /** A canonical settle's only: the pre-fill it started from, its columns with any water, pressure or
   *  badwater share (ids ascending). */
  start?: StackStart;
  /** A canonical settle's only: each column's outflows at its end (`columnFlows`), four a column id. Only drawn
   *  (the 3D view's moving water and falls), never written to a file or read by the water. */
  flows?: Float32Array;
}

/** Each column's outflows, four a column id (slot·N + tile; the simulation's order −y, −x, +y, +x): the momentum of
 *  its flows each way summed (rust/water/src/stack.rs `out`, one a pair of columns that overlap, laid out by `start`
 *  and `dir`), the rate the file stores per column (`ColumnOutflows`) and the heightfield's `WaterSim.out` per tile.
 *  On an open field (today's simulation) the momentum is already four a tile. From `m` as it stands: its momentum is
 *  current only where it ran the ticks itself (not after ticks run elsewhere, stackParallel.ts gathers those). */
export function columnFlows(m: StackWater, stacked: boolean): Float32Array {
  if (!stacked) return Float32Array.from(m.view(STACK_FIELD.momentum) as Float64Array);
  const start = m.view(STACK_FIELD.graphStart) as Uint32Array;
  const dir = m.view(STACK_FIELD.graphDirection) as Uint8Array;
  const out = m.view(STACK_FIELD.momentum) as Float64Array;
  const size = start.length - 1;
  const flows = new Float32Array(size * 4);
  for (let c = 0; c < size; c++) for (let e = start[c]; e < start[c + 1]; e++) flows[c * 4 + dir[e]] += out[e];
  return flows;
}

/** A pre-fill, sparse: the columns where depth, pressure or contamination is not 0. */
export interface StackStart {
  ids: Uint32Array;
  depth: Float64Array;
  overflow: Float64Array;
  contamination: Float64Array;
}

function startOf(m: StackWater): StackStart {
  const d = m.view(STACK_FIELD.depth) as Float64Array;
  const o = m.view(STACK_FIELD.overflow) as Float64Array;
  const c = m.view(STACK_FIELD.contamination) as Float64Array;
  const ids: number[] = [];
  for (let k = 0; k < d.length; k++) if (d[k] !== 0 || o[k] !== 0 || c[k] !== 0) ids.push(k);
  const out: StackStart = { ids: Uint32Array.from(ids), depth: new Float64Array(ids.length), overflow: new Float64Array(ids.length), contamination: new Float64Array(ids.length) };
  for (let j = 0; j < ids.length; j++) {
    out.depth[j] = d[ids[j]];
    out.overflow[j] = o[ids[j]];
    out.contamination[j] = c[ids[j]];
  }
  return out;
}

/** The days a stacked canonical settle may take (#71's, which the probe's test maps were played
 *  with); an open field's is today's 6. */
export const STACK_SETTLE_DAYS = 4;

/** A water model with its terrain above terrain: `model` (the map from above, sim/model.ts) with the
 *  terrain's masks and the objects' rows when some tile is not one plain run from the bottom; the
 *  model itself, unchanged, on a heightfield. */
export function stackedModel(model: WaterModel, terrain: VoxelMasks, objects: readonly MapObject[]): WaterModel {
  const mask = terrain.mask;
  let plain = true;
  for (let i = 0; i < mask.length && plain; i++) if ((mask[i] & (mask[i] + 1)) !== 0) plain = false;
  return plain ? model : { ...model, stacked: { mask, objects: stackObjectRows(objects) } };
}

/** The water model of a file's world: its surface and objects (sim/model.ts), with its terrain above
 *  terrain when it has caves or overhangs (`stackedModel`). What the checks settle when no settle
 *  is handed to them (validate/rust.ts), and the editor's check of an imported map. */
export function worldWaterModel(w: WorldModel): WaterModel {
  const objects = mapObjects(w);
  return stackedModel(waterModel(w.sizeX, w.sizeY, surfaceOf(w), objects), ColumnTerrain.fromVoxels(w.voxels, w.sizeX, w.sizeY, w.layers), objects);
}

/** The most ticks one `advance` may be asked for (the engine's own limit). */
const MAX_ADVANCE = 10_000_000;

/** The canonical settle of terrain above terrain by the game's rules, in slices: the pre-fill, then
 *  ticks until the water stands still or the days run out. `advance` runs at most the ticks it is
 *  given and returns the settle once it is done; `ticks` over `maxTicks` is how far it is, for a
 *  caller to show. `retained` is water sealed basins keep (water.ts `RetainedWater`). */
export function canonicalStackRun(W: number, H: number, t: StackedTerrain, retained: readonly RetainedWater[] = []): { advance(ticks: number): StackSettle | null; readonly ticks: number; readonly maxTicks: number } {
  const kept = retainedRows(retained);
  const m = new StackWater(W, H, t.objects.length / 8, kept.length / 4);
  let done: StackSettle | null = null;
  let ticks = 0;
  let maxTicks = 1;
  let stacked = true;
  let start: StackStart | undefined;
  // on several threads where this thread has a pool (stackParallel.ts), decided at the first slice; `since`
  // counts the ticks the threads ran since the settle's last check
  let threads: StackThreads | null | undefined;
  let since = 0;
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(t.mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(t.objects);
    (m.view(STACK_FIELD.retained) as Float64Array).set(kept);
    m.op(STACK_OP.build, 0);
    stacked = m.info(STACK_INFO.stacked) === 1;
    m.op(STACK_OP.settleBegin, stacked ? STACK_SETTLE_DAYS : 6);
    maxTicks = Math.max(1, m.info(STACK_INFO.maxTicks));
    if (stacked) start = startOf(m);
  } catch (e) {
    m.close();
    throw e;
  }
  const run = {
    advance(budget: number): StackSettle | null {
      if (done) return done;
      try {
        if (threads === undefined) threads = stacked && m.info(STACK_INFO.settle) === 0 && maxTicks % STACK_CHECK_TICKS === 0 ? stackThreads(m, W, H, t.mask, t.objects)?.watch(run) ?? null : null;
        let left = Math.max(0, Math.min(MAX_ADVANCE, Math.floor(budget)));
        while (threads && left > 0 && m.info(STACK_INFO.settle) === 0) {
          const n = Math.min(left, STACK_CHECK_TICKS - since);
          if (!threads.run(n)) {
            // a thread failed: the settle starts again here, on one thread (the same bytes)
            threads = null;
            since = 0;
            m.op(STACK_OP.settleBegin, STACK_SETTLE_DAYS);
            break;
          }
          left -= n;
          since += n;
          ticks = m.info(STACK_INFO.ticks) + since;
          if (since === STACK_CHECK_TICKS) {
            threads.write(m);
            m.op(STACK_OP.elsewhere, since);
            since = 0;
            ticks = m.info(STACK_INFO.ticks);
          }
        }
        if (!threads && left > 0 && m.info(STACK_INFO.settle) === 0) {
          m.op(STACK_OP.advance, left);
          ticks = m.info(STACK_INFO.ticks);
          maxTicks = Math.max(maxTicks, m.info(STACK_INFO.maxTicks));
        }
        if (m.info(STACK_INFO.settle) === 0) return null;
        // (where the water went: this thread's own columns, and the strips' when they ran it)
        const reach = stacked ? (m.copy(STACK_FIELD.reach) as Uint8Array) : undefined;
        if (reach) threads?.reach(reach);
        // (each column's outflows: the strips' own rows' when they ran the last ticks, else this engine's)
        const flows = threads ? threads.flows() : columnFlows(m, stacked);
        threads?.free();
        threads = null;
        m.op(STACK_OP.saturation);
        const count = m.copy(STACK_FIELD.count) as Uint8Array;
        let L = 1;
        for (let i = 0; i < count.length; i++) if (count[i] > L) L = count[i];
        done = {
          W,
          H,
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
          ...(reach && start ? { reach, start } : {}),
          flows,
        };
        ticks = done.ticks;
        m.close();
        return done;
      } catch (e) {
        threads?.free();
        m.close();
        throw e;
      }
    },
    get ticks() {
      return ticks;
    },
    get maxTicks() {
      return maxTicks;
    },
  };
  return run;
}

/** Retained water as the engine takes it: (tile, floor, depth, contamination) rows, one a tile. */
function retainedRows(retained: readonly RetainedWater[]): number[] {
  // (a tile two lakes hold keeps the later one's water, as the pre-fill would leave it: the engine
  // takes at most one entry a tile)
  const last = new Map<number, number[]>();
  for (const r of retained)
    for (let k = 0; k < r.tiles.length; k++) {
      const f = r.floor[k];
      const d = r.depth[k];
      const c = r.contamination[k];
      // (water outside the water's levels, a file from a taller, modded game, is left out, as its objects are)
      if (!(f >= 0 && d >= 0 && f + d <= OPEN_CEILING && c >= 0 && c <= 1)) continue;
      last.delete(r.tiles[k]);
      last.set(r.tiles[k], [r.tiles[k], f, d, c]);
    }
  const kept: number[] = [];
  for (const row of last.values()) kept.push(...row);
  return kept;
}

/** Tiles (Chebyshev) within which no changed tile may lie of a settle's reach for that settle to be the
 *  new map's too (`settledAgain`): a substep's active columns lie within one tile of the wet ones (the
 *  active list), and each reads the columns and terrain within two tiles of it (stackParallel.ts), so
 *  three would do; two more to spare. */
export const REACH_MARGIN = 5;
/** Tiles round an emitter's anchor its columns can take (stackParallel.ts keeps four). */
const EMITTER_REACH = 4;

/** The canonical settle of `next`, when it is provably `prev`'s (the canonical settle of `prevModel`)
 *  with nothing changed: else null, and the settle runs (D453; its proof is D130's, bit for bit).
 *
 *  The canonical settle is a run from the pre-fill, so it is the same run when three things hold. The
 *  objects and the kept water are the same, and so the emitters. The pre-fill is the same on every
 *  column of every tile the edit left as it was (its terrain, and so its columns), and dry on the
 *  tiles it changed. And no tile the edit changed lies within `REACH_MARGIN` of any column the old run
 *  ever wet (`StackSettle.reach`) or of an emitter. A substep reads only the wet columns, their
 *  neighbours and the sources, and what lies within two tiles of them (rust/water/src/stack.rs `substep`;
 *  the multi-core settle rests on the same rule): by induction over the substeps every column then holds
 *  what it held in the old run, each changed tile's stays dry and as the pre-fill left it, the checks
 *  every 128 ticks see the same water (a dry column adds exactly 0 to the volume, and the columns that
 *  hold water keep their ids, slot · N + tile), and the run stops at the same tick with the same water.
 *  The saturation is worked out again on the new columns, as the settle itself ends. Every Block dig or
 *  build and every Erode cave away from the water then settles at once. */
export function settledAgain(prev: StackSettle, prevModel: WaterModel, next: WaterModel): StackSettle | null {
  const a = prevModel.stacked;
  const b = next.stacked;
  if (!a || !b || !prev.stacked || !prev.reach || !prev.start) return null;
  const { W, H } = next;
  const N = W * H;
  if (prevModel.W !== W || prevModel.H !== H || prev.W !== W || prev.H !== H) return null;
  if (a.objects.length !== b.objects.length || a.objects.some((v, k) => v !== b.objects[k])) return null;
  if (!sameRetained(prevModel.retained, next.retained) || next.drained?.length || prevModel.drained?.length) return null;
  // the tiles the edit changed: their terrain (then their columns, compared below too)
  const changed = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (a.mask[i] !== b.mask[i]) changed[i] = 1;
  // where the old run's water went, and the emitters
  const near = new Uint8Array(N);
  for (let c = 0; c < prev.reach.length; c++) if (prev.reach[c]) near[c % N] = 1;
  for (let k = 0; k < b.objects.length; k += 8) {
    // (the badtide drains too: whatever can take or give water)
    if (b.objects[k] < KINDS.BadtideDrain) continue;
    const x = b.objects[k + 1];
    const y = b.objects[k + 2];
    for (let yy = Math.max(0, y - EMITTER_REACH); yy <= Math.min(H - 1, y + EMITTER_REACH); yy++)
      for (let xx = Math.max(0, x - EMITTER_REACH); xx <= Math.min(W - 1, x + EMITTER_REACH); xx++) near[yy * W + xx] = 1;
  }
  const clear = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let yy = Math.max(0, y - REACH_MARGIN); yy <= Math.min(H - 1, y + REACH_MARGIN); yy++)
      for (let xx = Math.max(0, x - REACH_MARGIN); xx <= Math.min(W - 1, x + REACH_MARGIN); xx++) if (near[yy * W + xx]) return false;
    return true;
  };
  for (let i = 0; i < N; i++) if (changed[i] && !clear(i)) return null;
  const kept = retainedRows(next.retained ?? []);
  const m = new StackWater(W, H, b.objects.length / 8, kept.length / 4);
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(b.mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(b.objects);
    (m.view(STACK_FIELD.retained) as Float64Array).set(kept);
    m.op(STACK_OP.build, 0);
    if (m.info(STACK_INFO.stacked) !== 1) return null;
    const count = m.copy(STACK_FIELD.count) as Uint8Array;
    const floor = m.copy(STACK_FIELD.floor) as Int16Array;
    const ceil = m.copy(STACK_FIELD.ceil) as Int16Array;
    let L = 1;
    for (let i = 0; i < N; i++) if (count[i] > L) L = count[i];
    // a tile whose columns changed counts as changed, whatever its terrain
    for (let i = 0; i < N; i++) {
      if (changed[i]) continue;
      let same = count[i] === prev.count[i];
      for (let q = 0; same && q < count[i]; q++) same = floor[q * N + i] === prev.floor[q * N + i] && ceil[q * N + i] === prev.ceil[q * N + i];
      if (same) continue;
      if (!clear(i)) return null;
      changed[i] = 1;
    }
    m.op(STACK_OP.prefill);
    const d = m.view(STACK_FIELD.depth) as Float64Array;
    const o = m.view(STACK_FIELD.overflow) as Float64Array;
    const c = m.view(STACK_FIELD.contamination) as Float64Array;
    // the old pre-fill, whole, against the new one
    const M = prev.reach.length;
    const pd = new Float64Array(M);
    const po = new Float64Array(M);
    const pc = new Float64Array(M);
    const s0 = prev.start;
    for (let j = 0; j < s0.ids.length; j++) {
      pd[s0.ids[j]] = s0.depth[j];
      po[s0.ids[j]] = s0.overflow[j];
      pc[s0.ids[j]] = s0.contamination[j];
    }
    for (let i = 0; i < N; i++)
      for (let q = 0; q < L; q++) {
        const k = q * N + i;
        if (changed[i]) {
          if (d[k] !== 0 || o[k] !== 0) return null;
        } else if (k < M ? d[k] !== pd[k] || o[k] !== po[k] || c[k] !== pc[k] : d[k] !== 0 || o[k] !== 0 || c[k] !== 0) return null;
      }
    // (a column the old map has and the new one doesn't held nothing, nor started with anything)
    for (let k = L * N; k < M; k++) if (pd[k] !== 0 || po[k] !== 0 || pc[k] !== 0 || prev.depth[k] !== 0 || prev.overflow[k] !== 0 || prev.reach[k]) return null;
    const start = startOf(m);
    // the old run's water on the tiles left as they were; the pre-fill's (dry) on the changed ones
    const reach = new Uint8Array(L * N);
    // (and its outflows: the old run's momentum on the columns it wet, whose flows the edit never reached, none on the
    // changed tiles, which stay dry)
    const pf = prev.flows;
    const flows = pf ? new Float32Array(L * N * 4) : undefined;
    for (let i = 0; i < N; i++) {
      if (changed[i]) continue;
      for (let q = 0; q < count[i]; q++) {
        const k = q * N + i;
        d[k] = prev.depth[k];
        o[k] = prev.overflow[k];
        c[k] = prev.contamination[k];
        reach[k] = prev.reach[k];
        if (flows && pf) flows.set(pf.subarray(k * 4, k * 4 + 4), k * 4);
      }
    }
    m.op(STACK_OP.accept);
    m.op(STACK_OP.saturation);
    const done: StackSettle = {
      W,
      H,
      L,
      stacked: true,
      count,
      floor,
      ceil,
      depth: m.copy(STACK_FIELD.depth) as Float64Array,
      overflow: m.copy(STACK_FIELD.overflow) as Float64Array,
      contamination: m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: m.copy(STACK_FIELD.saturation) as Uint8Array,
      settled: prev.settled,
      ticks: prev.ticks,
      reach,
      start,
      ...(flows ? { flows } : {}),
    };
    return done;
  } finally {
    m.close();
  }
}

/** The water of terrain above terrain run on from a given state by the game's rules, with the sources
 *  scaled and the clean ones' contamination set at each step: the weather's simulation on such a map
 *  (sim/weather.ts `HazardRun`). The sources stop or turn bad exactly as on a heightfield (the game's
 *  `DroughtWaterStrengthModifier` and `BadtideWaterSourceContaminationController` act on each source,
 *  whatever the ground around it), and every column evaporates by its own cluster saturation
 *  (`WaterParametersUpdateTask`, `WaterEvaporationCalculationTask`): rules the engine already runs,
 *  verified against the game on the fixtures. A map whose every tile is one open column runs today's
 *  heightfield simulation inside the engine, so its weather is the heightfield's, bit for bit. `close`
 *  it when done. */
export class StackRun {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  /** False on an open field: today's heightfield simulation runs, unchanged. */
  readonly stacked: boolean;
  readonly L: number;
  readonly count: Uint8Array;
  readonly floor: Int16Array;
  readonly ceil: Int16Array;
  /** Ticks run since the given state. */
  ticks = 0;
  private readonly m: StackWater;
  /** The emitters that give clean water (a badtide turns them bad), by the engine's order. */
  private readonly clean: number[] = [];

  /** The run from `from` (a settle, a file's stored water or water carried over, on the same columns). */
  constructor(W: number, H: number, t: StackedTerrain, from: StackSettle) {
    this.W = W;
    this.H = H;
    const N = (this.N = W * H);
    const m = (this.m = new StackWater(W, H, t.objects.length / 8, 0));
    try {
      (m.view(STACK_FIELD.masks) as Uint32Array).set(t.mask);
      (m.view(STACK_FIELD.objects) as Float64Array).set(t.objects);
      m.op(STACK_OP.build, 0);
      this.stacked = m.info(STACK_INFO.stacked) === 1;
      this.count = m.copy(STACK_FIELD.count) as Uint8Array;
      this.floor = m.copy(STACK_FIELD.floor) as Int16Array;
      this.ceil = m.copy(STACK_FIELD.ceil) as Int16Array;
      let L = 1;
      for (let i = 0; i < N; i++) if (this.count[i] > L) L = this.count[i];
      this.L = L;
      if (from.count.length !== N) throw new Error("The water to start from is for another map.");
      for (let i = 0; i < N; i++) if (from.count[i] !== this.count[i]) throw new Error("The water to start from is for another map.");
      // the state as the engine takes it: each column's water within its room, a full cave's pressure only
      // when it is full, none on an open field
      const depth = m.view(STACK_FIELD.depth) as Float64Array;
      const contamination = m.view(STACK_FIELD.contamination) as Float64Array;
      const overflow = this.stacked ? (m.view(STACK_FIELD.overflow) as Float64Array) : null;
      for (let i = 0; i < N; i++)
        for (let q = 0; q < this.count[i]; q++) {
          const c = q * N + i;
          const cap = this.ceil[c] - this.floor[c];
          const d0 = from.depth[c];
          const d = d0 > 0 ? (d0 < cap ? d0 : cap) : 0;
          const c0 = from.contamination[c];
          depth[c] = d;
          contamination[c] = c0 > 0 ? (c0 < 1 ? c0 : 1) : 0;
          if (overflow && d === cap) {
            const o = from.overflow[c];
            const most = (OPEN_CEILING - this.ceil[c]) / 8;
            overflow[c] = o > 0 ? (o < most ? o : most) : 0;
          }
        }
      m.op(STACK_OP.accept);
      const params = m.view(STACK_FIELD.emitters) as Float64Array;
      for (let k = 0; 4 * k < params.length; k++) if (params[4 * k + 1] === 0) this.clean.push(k);
    } catch (e) {
      m.close();
      throw e;
    }
  }

  /** `ticks` more, every source's strength times `scale` (0: a drought), the clean sources giving water
   *  of contamination `cleanContamination` (a badtide), or their own (null). */
  run(ticks: number, scale: number, cleanContamination: number | null = null): this {
    if (cleanContamination !== null) {
      const params = this.m.view(STACK_FIELD.emitters) as Float64Array;
      for (const k of this.clean) params[4 * k + 1] = cleanContamination;
    }
    const n = ticks > 0 ? Math.ceil(ticks) : 0;
    for (let left = n; left > 0; left -= MAX_ADVANCE) this.m.op(STACK_OP.run, Math.min(left, MAX_ADVANCE), scale);
    this.ticks += n;
    return this;
  }

  /** The water as it stands, every column (copies, with its cluster saturation): a `StackSettle` that is
   *  not a settle (`settled` false), never written to a file. */
  state(): StackSettle {
    this.m.op(STACK_OP.saturation);
    const overflow = this.stacked ? (this.m.copy(STACK_FIELD.overflow) as Float64Array) : new Float64Array(this.L * this.N);
    return {
      W: this.W,
      H: this.H,
      L: this.L,
      stacked: this.stacked,
      count: this.count,
      floor: this.floor,
      ceil: this.ceil,
      depth: this.m.copy(STACK_FIELD.depth) as Float64Array,
      overflow,
      contamination: this.m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: this.m.copy(STACK_FIELD.saturation) as Uint8Array,
      settled: false,
      ticks: this.ticks,
    };
  }

  /** The water from above, each tile's top column (as the build's per-tile water reads a stacked settle). */
  top(): { depth: Float64Array; contamination: Float64Array } {
    const N = this.N;
    const d = this.m.view(STACK_FIELD.depth) as Float64Array;
    const c = this.m.view(STACK_FIELD.contamination) as Float64Array;
    const depth = new Float64Array(N);
    const contamination = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      if (!this.count[i]) continue;
      const k = (this.count[i] - 1) * N + i;
      depth[i] = d[k];
      contamination[i] = c[k];
    }
    return { depth, contamination };
  }

  /** The water's stored outflows on an open field (4 per tile, as `WaterSim.out`), else null: the
   *  stacked engine's momentum is per column pair, which the view's moving water does not read. */
  outflows(): Float64Array | null {
    return this.stacked ? null : (this.m.copy(STACK_FIELD.momentum) as Float64Array);
  }

  close(): void {
    this.m.close();
  }
}

/** The canonical settle of a map by the game's rules, whole (`canonicalStackRun` to its end). */
export function canonicalStackSettle(t: VoxelMasks, objects: readonly MapObject[]): StackSettle {
  const run = canonicalStackRun(t.W, t.H, { mask: t.mask, objects: stackObjectRows(objects) });
  let r = run.advance(MAX_ADVANCE);
  while (!r) r = run.advance(MAX_ADVANCE);
  return r;
}

/** Water on stacked columns that is not a settle of them, on the columns `cols`: a file's own stored
 *  water (`stored`, world.ts `storedWater`: each entry on the column whose floor it names, or the one
 *  it stands in), or water carried over from other columns (`staleStack`). Never written to a file. */
export function storedStack(cols: WaterColumns, stored: { tile: ArrayLike<number>; floor: ArrayLike<number>; depth: ArrayLike<number>; contamination: ArrayLike<number>; overflow?: ArrayLike<number> }): StackSettle {
  const { W, H, N, L } = cols;
  const out = emptyStack(cols);
  for (let k = 0; k < stored.tile.length; k++) {
    const i = stored.tile[k];
    const f = stored.floor[k];
    let slot = -1;
    for (let q = 0; q < cols.count[i] && slot < 0; q++) if (cols.floor[q * N + i] === f) slot = q;
    for (let q = 0; q < cols.count[i] && slot < 0; q++) if (cols.floor[q * N + i] <= f && cols.ceil[q * N + i] > f) slot = q;
    // (a token without its floor, an old file's: the tile's top column)
    if (slot < 0 && f < 0 && cols.count[i]) slot = cols.count[i] - 1;
    if (slot < 0) continue;
    out.depth[slot * N + i] = stored.depth[k];
    out.contamination[slot * N + i] = stored.contamination[k];
    // (a full cave's pressure, on a column its water fills, as the engine holds it: a column under pressure is full,
    // whatever its rounded token says)
    const o = stored.overflow?.[k] ?? 0;
    const cap = cols.ceil[slot * N + i] - cols.floor[slot * N + i];
    if (o > 0 && stored.depth[k] >= cap - 1e-3) {
      out.depth[slot * N + i] = cap;
      out.overflow[slot * N + i] = o;
    }
  }
  return { ...out, W, H, L };
}

/** The water standing on the map's ground, per tile: a tile's one column, or the column whose floor is the tile's
 *  height (`heights`, the terrain's surface), else none. What a reading on the ground compares day by day (the drought line): the same
 *  column on both sides, never the water under a NaturalOverhang on one and the water on its top on the other. */
export function surfaceWater(s: StackSettle, heights: ArrayLike<number>): { depth: Float64Array; contamination: Float64Array } {
  const N = s.W * s.H;
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  for (let i = 0; i < N; i++)
    for (let q = s.count[i] - 1; q >= 0; q--) {
      const c = q * N + i;
      if (s.count[i] > 1 && s.floor[c] !== heights[i]) continue;
      depth[i] = s.depth[c];
      contamination[i] = s.contamination[c];
      break;
    }
  return { depth, contamination };
}

/** The water of stacked columns seen through the roofs: per tile, its highest wet column's depth and
 *  contamination (none: a dry tile). A river under a bridge or through a tunnel is
 *  then one water with the stretches before and after it, as the map's own stored water is read at
 *  any level (analysis/mechanics.ts `storedWetMask`). What the checks read until they walk the floor
 *  graph (Foundations' stage 3); the build's own water stays each tile's top column. */
export function seenThroughRoofs(s: StackSettle): { depth: Float64Array; contamination: Float64Array } {
  const N = s.W * s.H;
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  for (let i = 0; i < N; i++)
    for (let q = s.count[i] - 1; q >= 0; q--) {
      const c = q * N + i;
      if (!(s.depth[c] > 0)) continue;
      depth[i] = s.depth[c];
      contamination[i] = s.contamination[c];
      break;
    }
  return { depth, contamination };
}

function emptyStack(cols: WaterColumns): StackSettle {
  const M = cols.L * cols.N;
  return { W: cols.W, H: cols.H, L: cols.L, stacked: true, count: cols.count, floor: cols.floor, ceil: cols.ceil, depth: new Float64Array(M), overflow: new Float64Array(M), contamination: new Float64Array(M), sat: new Uint8Array(M), settled: false, ticks: 0 };
}

/** The last water on stacked columns carried over to the map as it now stands (`cols`), to show until
 *  it settles again: each tile's top column holds the water seen from above (`depth` and
 *  `contamination` per tile, preview.ts `staleWater`), and the columns under it keep what they held
 *  (`prev`, by their floors; null: nothing). Never written to a file. */
export function staleStack(prev: StackSettle | null | undefined, cols: WaterColumns, depth: ArrayLike<number>, contamination: ArrayLike<number>): StackSettle {
  const N = cols.N;
  const out = emptyStack(cols);
  const same = !!prev && prev.L === cols.L && prev.count.length === N;
  for (let i = 0; i < N; i++) {
    const n = cols.count[i];
    if (!n) continue;
    const top = (n - 1) * N + i;
    if (prev && n > 1) {
      for (let q = 0; q < n - 1; q++) {
        const c = q * N + i;
        // the column it was: the same slot when the tile's columns are as they were, else by its floor
        let from = same && prev.count[i] === n && prev.floor[c] === cols.floor[c] && prev.ceil[c] === cols.ceil[c] ? c : -1;
        for (let p = 0; from < 0 && p < prev.count[i]; p++) if (prev.floor[p * N + i] === cols.floor[c]) from = p * N + i;
        if (from < 0) continue;
        const cap = cols.ceil[c] - cols.floor[c];
        out.depth[c] = prev.depth[from] < cap ? prev.depth[from] : cap;
        out.contamination[c] = prev.contamination[from];
        if (prev.ceil[from] === cols.ceil[c]) out.overflow[c] = prev.overflow[from];
      }
    }
    const cap = cols.ceil[top] - cols.floor[top];
    out.depth[top] = depth[i] < cap ? depth[i] : cap;
    out.contamination[top] = contamination[i];
  }
  return out;
}
