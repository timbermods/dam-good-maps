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

/** The momentum of the water's flows between columns (rust/water/src/stack.rs `out`, one an edge of the engine's column
 *  graph: `start` per column id, each edge's `target` column and direction `dir`), with the columns' floors, so that it
 *  carries over to another build of the same map's columns (`StackLive`). */
export interface EdgeMomentum {
  start: Uint32Array;
  target: Int32Array;
  dir: Uint8Array;
  floor: Int16Array;
  out: Float64Array;
}

/** Water on stacked columns as the live water holds it: with its flows' momentum, so a run built again on it carries
 *  on flowing (a stroke's tops reshaped, the next edit) instead of starting every river from rest. */
export type LiveStack = StackSettle & { edges?: EdgeMomentum };

/** An edge's key, the same in any build of the map: its column's tile and floor, its direction and its target's floor
 *  (the target's tile is the neighbour that way). */
function edgeKey(N: number, column: number, floor: number, dir: number, targetFloor: number): number {
  return (((column % N) * 64 + floor) * 4 + dir) * 64 + targetFloor;
}

/** One frame of the live water: every column (`stack`, not a settle), the water seen from above (each tile's top
 *  column, `depth` and `contamination`), and each column's outflows (four a column id, stackWater.ts `columnFlows`). */
export interface StackFrame {
  stack: LiveStack;
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
  /** The engine's column graph (`EdgeMomentum`), fixed for a build. */
  private start!: Uint32Array;
  private target!: Int32Array;
  private dir!: Uint8Array;
  /** Ticks run since the water it started from. */
  ticks = 0;
  private m: StackWater;
  private mask: Uint32Array;
  private readonly objects: Float64Array;
  private readonly kept: number[];
  private finished = false;

  /** The water of `model` (a map with caves or overhangs) from `from`: water on the same map, on its columns or on
   *  the columns it had before an edit (carried over, `carryStack`), its flows' momentum with it (`LiveStack.edges`);
   *  water without it (a settle carried over to an edit's columns) takes its flows from `flows`, a settle of the same
   *  map with its per-column flows (stackWater.ts `columnFlows`), as a heightfield's warm start takes its outflows
   *  (preview.ts). With neither, its rivers start from rest, and swell before they settle again. */
  constructor(
    readonly model: WaterModel,
    from: LiveStack,
    flows: StackSettle | null = null,
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
    this.load(from, flows);
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
      this.start = m.copy(STACK_FIELD.graphStart) as Uint32Array;
      this.target = m.copy(STACK_FIELD.graphTarget) as Int32Array;
      this.dir = m.copy(STACK_FIELD.graphDirection) as Uint8Array;
      let L = 1;
      for (let i = 0; i < this.N; i++) if (this.count[i] > L) L = this.count[i];
      this.L = L;
      return m;
    } catch (e) {
      m.close();
      throw e;
    }
  }

  /** `from` carried over to the engine's columns, written in with its flows' momentum, and the run on from it begun. */
  private load(from: LiveStack, flows: StackSettle | null = null): void {
    loadStack(this.m, this, true, carryStack(from, this));
    const out = this.m.view(STACK_FIELD.momentum) as Float64Array;
    if (from.edges) this.carryMomentum(from.edges, out);
    else if (flows?.flows) this.seedMomentum(flows, out);
    this.m.op(STACK_OP.settleBegin, this.days, 1);
    this.finished = false;
  }

  /** Each edge's momentum from the edge of `e` with the same key (`edgeKey`); none on an edge whose column or target
   *  is new (its ground changed). */
  private carryMomentum(e: EdgeMomentum, out: Float64Array): void {
    const N = this.N;
    const old = new Map<number, number>();
    for (let c = 0; c + 1 < e.start.length; c++)
      for (let k = e.start[c]; k < e.start[c + 1]; k++) if (e.out[k] !== 0 && e.target[k] >= 0) old.set(edgeKey(N, c, e.floor[c], e.dir[k], e.floor[e.target[k]]), e.out[k]);
    if (!old.size) return;
    for (let c = 0; c + 1 < this.start.length; c++)
      for (let k = this.start[c]; k < this.start[c + 1]; k++) {
        const t = this.target[k];
        if (t < 0) continue;
        const v = old.get(edgeKey(N, c, this.floor[c], this.dir[k], this.floor[t]));
        if (v !== undefined) out[k] = v;
      }
  }

  /** Each edge's momentum from a settle's flows (four a column id, its column matched by tile and floor). A column
   *  whose water can leave the same way along several edges (a neighbour with a cave and the ground over it) shares
   *  that way's flow between them by how much of its water each target's room faces; none faces, evenly. */
  private seedMomentum(s: StackSettle, out: Float64Array): void {
    const N = this.N;
    const flows = s.flows!;
    if (s.count.length !== N) return;
    const depth = this.m.view(STACK_FIELD.depth) as Float64Array;
    const share = new Float64Array(4);
    const ways = new Uint8Array(4);
    for (let c = 0; c + 1 < this.start.length; c++) {
      const a = this.start[c];
      const b = this.start[c + 1];
      if (a === b) continue;
      const i = c % N;
      let from = -1;
      for (let q = 0; q < s.count[i] && from < 0; q++) if (s.floor[q * N + i] === this.floor[c]) from = q * N + i;
      if (from < 0 || 4 * from + 3 >= flows.length) continue;
      // (the water's face toward each target: its depth over the column's floor, within the target's room)
      const lo = this.floor[c];
      const hi = lo + depth[c];
      const face = (k: number) => {
        const t = this.target[k];
        return t < 0 ? 0 : Math.max(0, Math.min(hi, this.ceil[t]) - Math.max(lo, this.floor[t]));
      };
      share.fill(0);
      ways.fill(0);
      for (let k = a; k < b; k++) {
        share[this.dir[k]] += face(k);
        ways[this.dir[k]]++;
      }
      for (let k = a; k < b; k++) {
        const d = this.dir[k];
        const f = flows[4 * from + d];
        out[k] = ways[d] === 1 ? f : share[d] > 0 ? (f * face(k)) / share[d] : f / ways[d];
      }
    }
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

  /** The water as it stands, every column (copies), with its flows' momentum: a `StackSettle` that is not a settle,
   *  never written to a file. */
  state(): LiveStack {
    return { ...this.water(), edges: { start: this.start, target: this.target, dir: this.dir, floor: this.floor, out: this.m.copy(STACK_FIELD.momentum) as Float64Array } };
  }

  /** The water as it stands, every column (copies), without its momentum. */
  private water(): StackSettle {
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

  /** The water as it stands, to show (`StackFrame`; its stack without the momentum: `state` carries that). */
  frame(): StackFrame {
    const stack = this.water();
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
