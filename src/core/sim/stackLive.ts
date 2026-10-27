// The editor's live water on a map with caves or overhangs (D99, D197; D280's amendment lifted): after an edit the
// water flows on screen, frame by frame, by the game's rules on every water column, as a plain map's does with
// `PreviewJob` (preview.ts). It is a warm start: the water as it stood (the last settle, or the water still in flight)
// carried over to the map's new columns, then the stacked engine (stackWater.ts) run on from there, a few ticks at a
// time, until the canonical settle's own test says it stands still (`settleBegin` on from the state as written) or
// `PREVIEW_JOB_DAYS` run out. It is only ever shown: the map's water stays the last canonical settle carried over
// (features/build.ts) until the canonical settle of the map as it stands replaces it, byte for byte as before
// (prefill.ts, and its shortcut `settledAgain`), so the file and the settle never see this water (§19.7).
//
// A stroke being painted reshapes the tops of its tiles as it goes (`reshape`, terrain/runs.ts `reshapeTop`, what the
// brushes do on such a map): the engine is built again on the new terrain and the water carried over to it, as an
// edit's is.

import type { WaterColumns } from "./columns";
import { PREVIEW_JOB_DAYS } from "./preview";
import { columnFlows, loadStack, retainedRows, staleStack, STACK_FIELD, STACK_INFO, STACK_OP, StackWater, type StackSettle } from "./stackWater";
import { sameRetained, type WaterModel } from "./water";

/** Water on stacked columns carried over to other columns of the same map (the map after an edit, or under a
 *  stroke): each tile's top column keeps the old water surface above its new floor (none where the floor rose over
 *  it), as preview.ts `staleWater` carries a heightfield's, and the columns under it keep what they held, matched by
 *  their floors (stackWater.ts `staleStack`). Never written to a file. */
export function carryStack(prev: StackSettle, cols: Pick<WaterColumns, "W" | "H" | "N" | "L" | "count" | "floor" | "ceil">): StackSettle {
  const N = cols.N;
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  if (prev.count.length === N)
    for (let i = 0; i < N; i++) {
      const n = cols.count[i];
      const pn = prev.count[i];
      if (!n || !pn) continue;
      const pt = (pn - 1) * N + i;
      const d0 = prev.depth[pt];
      if (!(d0 > 0)) continue;
      const f0 = prev.floor[pt];
      const f1 = cols.floor[(n - 1) * N + i];
      const surface = f0 + d0;
      depth[i] = f0 === f1 ? d0 : surface > f1 ? surface - f1 : 0;
      contamination[i] = prev.contamination[pt];
    }
  return staleStack(prev.count.length === N ? prev : null, { ...cols, heightLimit: null, dirLimit: null }, depth, contamination);
}

/** Whether two water models of a map keep the same water by the player's hand: the same stored lakes (a Fill, a carve's
 *  oxbow lake) and the same tiles a removal drained. Water flowing on one carries over to the other only then; a lake
 *  stored or water taken starts from the map's own carried-over water, which has them on their columns. */
export function sameKeptWater(a: WaterModel, b: WaterModel): boolean {
  const da = a.drained ?? [];
  const db = b.drained ?? [];
  return sameRetained(a.retained, b.retained) && da.length === db.length && da.every((v, k) => v === db[k]);
}

/** One frame of the live water: every column (`stack`, not a settle), the water seen from above (each tile's top
 *  column, `depth` and `contamination`), and each column's outflows (four a column id, stackWater.ts `columnFlows`). */
export interface StackFrame {
  stack: StackSettle;
  depth: Float64Array;
  contamination: Float64Array;
  flows: Float32Array;
}

/** The live water of a map with caves or overhangs (see the file comment). `close` it when done. */
export class StackLive {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  L = 1;
  count!: Uint8Array;
  floor!: Int16Array;
  ceil!: Int16Array;
  /** Ticks run since the water it started from. */
  ticks = 0;
  private m: StackWater;
  private mask: Uint32Array;
  private readonly objects: Float64Array;
  private readonly kept: number[];
  private finished = false;

  /** The water of `model` (a map with caves or overhangs) from `from`: water on the same map, on its columns or on
   *  the columns it had before an edit (carried over, `carryStack`). */
  constructor(
    readonly model: WaterModel,
    from: StackSettle,
    /** The most game days the water runs on while it still moves (the preview's, preview.ts). */
    private readonly days: number = PREVIEW_JOB_DAYS,
  ) {
    const t = model.stacked;
    if (!t) throw new Error("The map has no caves or overhangs.");
    this.W = model.W;
    this.H = model.H;
    this.N = model.W * model.H;
    this.mask = t.mask;
    this.objects = t.objects;
    this.kept = retainedRows(model.retained ?? []);
    this.m = this.build(this.mask);
    this.load(from);
  }

  private build(mask: Uint32Array): StackWater {
    const m = new StackWater(this.W, this.H, this.objects.length / 8, this.kept.length / 4);
    try {
      (m.view(STACK_FIELD.masks) as Uint32Array).set(mask);
      (m.view(STACK_FIELD.objects) as Float64Array).set(this.objects);
      (m.view(STACK_FIELD.retained) as Float64Array).set(this.kept);
      m.op(STACK_OP.build, 0);
      if (m.info(STACK_INFO.stacked) !== 1) throw new Error("The map has no caves or overhangs.");
      this.count = m.copy(STACK_FIELD.count) as Uint8Array;
      this.floor = m.copy(STACK_FIELD.floor) as Int16Array;
      this.ceil = m.copy(STACK_FIELD.ceil) as Int16Array;
      let L = 1;
      for (let i = 0; i < this.N; i++) if (this.count[i] > L) L = this.count[i];
      this.L = L;
      return m;
    } catch (e) {
      m.close();
      throw e;
    }
  }

  /** `from` carried over to the engine's columns, written in, and the run on from it begun. */
  private load(from: StackSettle): void {
    loadStack(this.m, this, true, carryStack(from, this));
    this.m.op(STACK_OP.settleBegin, this.days, 1);
    this.finished = false;
  }

  /** The terrain under a stroke being painted changed (`mask`, the whole map's): the engine is built on it again and
   *  the water as it stands carried over to it. */
  reshape(mask: Uint32Array): void {
    const now = this.state();
    const m = this.build(mask);
    this.m.close();
    this.m = m;
    this.mask = mask;
    this.load(now);
  }

  /** Run at most `ticks` more; true once the water stands still (the canonical settle's test) or its days ran out. */
  advance(ticks: number): boolean {
    if (this.finished) return true;
    const before = this.m.info(STACK_INFO.ticks);
    this.m.op(STACK_OP.advance, Math.max(0, Math.floor(ticks)));
    this.ticks += this.m.info(STACK_INFO.ticks) - before;
    if (this.m.info(STACK_INFO.settle) !== 0) this.finished = true;
    return this.finished;
  }

  /** Whether the water stands still (or ran out of days). */
  get done(): boolean {
    return this.finished;
  }

  /** The water as it stands, every column (copies): a `StackSettle` that is not a settle, never written to a file. */
  state(): StackSettle {
    const m = this.m;
    return {
      W: this.W,
      H: this.H,
      L: this.L,
      stacked: true,
      count: this.count,
      floor: this.floor,
      ceil: this.ceil,
      depth: m.copy(STACK_FIELD.depth) as Float64Array,
      overflow: m.copy(STACK_FIELD.overflow) as Float64Array,
      contamination: m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: new Uint8Array(this.L * this.N),
      settled: false,
      ticks: this.ticks,
    };
  }

  /** The water as it stands, to show (`StackFrame`). */
  frame(): StackFrame {
    const stack = this.state();
    const N = this.N;
    const depth = new Float64Array(N);
    const contamination = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const n = this.count[i];
      if (!n) continue;
      const c = (n - 1) * N + i;
      depth[i] = stack.depth[c];
      contamination[i] = stack.contamination[c];
    }
    return { stack, depth, contamination, flows: columnFlows(this.m, true) };
  }

  close(): void {
    this.m.close();
  }
}
