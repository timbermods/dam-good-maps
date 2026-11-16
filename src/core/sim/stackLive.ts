// The editor's live water on a map with caves or overhangs (D99, D197; D280's amendment lifted): after an edit the
// water flows on screen, frame by frame, by the game's rules on every water column, as a plain map's does with
// `PreviewJob` (preview.ts). It is a warm start: the water as it stood (the last settle, or the water still in flight)
// carried over to the map's new columns, then the stacked engine (stackWater.ts) run on from there, a few ticks at a
// time, until the canonical settle's own test says it stands still (`settleBegin` on from the state as written), the
// journey after an edit sooner by the preview's own rule (`preview`, as preview.ts `PreviewRun`), or `PREVIEW_JOB_DAYS`
// run out. While it flows the map's water stays the last settle carried over (features/build.ts); where an edit's
// journey comes to stand is the map's preview water (`settle`; src/worker/session.ts `stackPreview`, D453), as a
// heightfield's is, until the canonical settle of the map as it stands replaces it, byte for byte as before (prefill.ts,
// and its shortcut `settledAgain`), so the file and the settle never see this water (§19.7).
//
// A stroke being painted reshapes the tops of its tiles as it goes (`reshape`, terrain/runs.ts `reshapeTop`, what the
// brushes do on such a map): the engine is built again on the new terrain and the water carried over to it, as an
// edit's is.

import type { WaterColumns } from "./columns";
import { PREVIEW_JOB_DAYS, PREVIEW_MOVED, PREVIEW_TOL } from "./preview";
import { STACK_CHECK_TICKS, stackThreads, type StackThreads } from "./stackParallel";
import { columnFlows, columnOutflows, loadStack, retainedRows, staleStack, STACK_FIELD, STACK_INFO, STACK_OP, StackWater, type StackSettle } from "./stackWater";
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
 *  (the target's tile is the neighbour that way; an edge off the map's edge, where a river leaves it, has none: 63, a
 *  floor no column has, TERRAIN_LAYERS being 23). */
function edgeKey(N: number, column: number, floor: number, dir: number, targetFloor: number): number {
  return (((column % N) * 64 + floor) * 4 + dir) * 64 + targetFloor;
}

/** A build's column graph, as `carryMomentum` and `seedMomentum` read it. */
interface Graph {
  N: number;
  start: Uint32Array;
  target: Int32Array;
  dir: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
}

/** Each edge's key in its build (`edgeKey`). */
const keyOf = (g: Pick<Graph, "N" | "target" | "floor">, c: number, k: number, dir: number): number => {
  const t = g.target[k];
  return edgeKey(g.N, c, g.floor[c], dir, t >= 0 ? g.floor[t] : 63);
};

/** Each edge's momentum in `g` from the edge of `e` with the same key (`edgeKey`); none on an edge whose column or
 *  target is new (its ground changed). The edges off the map's edge carry theirs too: a river leaving the map kept
 *  running at the speed it had, not stopped at every build (#1181). */
function carryMomentum(g: Graph, e: EdgeMomentum, out: Float64Array): void {
  const old = new Map<number, number>();
  for (let c = 0; c + 1 < e.start.length; c++) for (let k = e.start[c]; k < e.start[c + 1]; k++) if (e.out[k] !== 0) old.set(keyOf({ N: g.N, ...e }, c, k, e.dir[k]), e.out[k]);
  if (!old.size) return;
  for (let c = 0; c + 1 < g.start.length; c++)
    for (let k = g.start[c]; k < g.start[c + 1]; k++) {
      const v = old.get(keyOf(g, c, k, g.dir[k]));
      if (v !== undefined) out[k] = v;
    }
}

/** Each edge's momentum in `g` from a settle's flows (four a column id, its column matched by tile and floor), on the
 *  water `depth`. A column whose water can leave the same way along several edges (a neighbour with a cave and the
 *  ground over it) shares that way's flow between them by how much of its water each target's room faces; none
 *  faces, evenly. */
function seedMomentum(g: Graph, s: StackSettle, depth: Float64Array, out: Float64Array): void {
  const N = g.N;
  const flows = s.flows!;
  if (s.count.length !== N) return;
  const share = new Float64Array(4);
  const ways = new Uint8Array(4);
  for (let c = 0; c + 1 < g.start.length; c++) {
    const a = g.start[c];
    const b = g.start[c + 1];
    if (a === b) continue;
    const i = c % N;
    let from = -1;
    for (let q = 0; q < s.count[i] && from < 0; q++) if (s.floor[q * N + i] === g.floor[c]) from = q * N + i;
    if (from < 0 || 4 * from + 3 >= flows.length) continue;
    // (the water's face toward each target: its depth over the column's floor, within the target's room)
    const lo = g.floor[c];
    const hi = lo + depth[c];
    const face = (k: number) => {
      const t = g.target[k];
      return t < 0 ? 0 : Math.max(0, Math.min(hi, g.ceil[t]) - Math.max(lo, g.floor[t]));
    };
    share.fill(0);
    ways.fill(0);
    for (let k = a; k < b; k++) {
      share[g.dir[k]] += face(k);
      ways[g.dir[k]]++;
    }
    for (let k = a; k < b; k++) {
      const d = g.dir[k];
      const f = flows[4 * from + d];
      out[k] = ways[d] === 1 ? f : share[d] > 0 ? (f * face(k)) / share[d] : f / ways[d];
    }
  }
}

/** A build of a map's columns in the engine: its columns and its graph (`Graph`). */
interface Built extends Graph {
  W: number;
  H: number;
  m: StackWater;
  count: Uint8Array;
  L: number;
}

/** The map's own water run on beside a force's, from the same water as if the force had gone no further
 *  (`StackLive.holdOwn`): `b`, its build, on `mask` (the front's walls as the force's run has them, the map's own
 *  ground) and `objects` (the map's own); `start`, the water it began with, on the columns it had then, with its flows
 *  and their momentum. */
interface OwnWater {
  b: Built;
  mask: Uint32Array;
  /** The terrain it is to run on (`reshape`'s `own`), where it differs from `mask` (a front's wall the force's run let
   *  go): let go there too before the water could reach it (`wallsOwn`). */
  want: Uint32Array | null;
  objects: Float64Array;
  start: { count: Uint8Array; floor: Int16Array; ceil: Int16Array; depth: Float64Array; overflow: Float64Array; contamination: Float64Array; flows: Float32Array; edges: EdgeMomentum };
}

/** One frame of the live water: every column (`stack`, not a settle), the water seen from above (each tile's top
 *  column, `depth` and `contamination`), and each column's outflows (four a column id, stackWater.ts `columnFlows`). */
export interface StackFrame {
  stack: LiveStack;
  depth: Float64Array;
  contamination: Float64Array;
  flows: Float32Array;
}

/** The map's columns on `mask` and `objects` built in the engine (`Built`); `kept`, the stored lakes' rows. */
function buildColumns(W: number, H: number, mask: Uint32Array, objects: Float64Array, kept: number[]): Built {
  const m = new StackWater(W, H, objects.length / 8, kept.length / 4);
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(objects);
    (m.view(STACK_FIELD.retained) as Float64Array).set(kept);
    m.op(STACK_OP.build, 0);
    if (m.info(STACK_INFO.stacked) !== 1) throw new Error("The map has no caves or overhangs.");
    const N = W * H;
    const count = m.copy(STACK_FIELD.count) as Uint8Array;
    let L = 1;
    for (let i = 0; i < N; i++) if (count[i] > L) L = count[i];
    return {
      m,
      W,
      H,
      N,
      L,
      count,
      floor: m.copy(STACK_FIELD.floor) as Int16Array,
      ceil: m.copy(STACK_FIELD.ceil) as Int16Array,
      start: m.copy(STACK_FIELD.graphStart) as Uint32Array,
      target: m.copy(STACK_FIELD.graphTarget) as Int32Array,
      dir: m.copy(STACK_FIELD.graphDirection) as Uint8Array,
    };
  } catch (e) {
    m.close();
    throw e;
  }
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
  private objects: Float64Array;
  private readonly kept: number[];
  private finished = false;
  /** On several threads (stackParallel.ts, `flowing`) where this thread has a pool, decided at the first run after each
   *  load (undefined), null on one; `since`, the ticks the strips ran since the run's last check, when the whole map's
   *  engine takes their water back with its momentum and checks it (`sync`, `elsewhere`), as the canonical settle's do. */
  private threads: StackThreads | null | undefined;
  private since = 0;
  /** Whether the strips have written their rows back since they last ran (they do only when asked: a check, a frame). */
  private reported = true;
  /** Ticks since the run's settle began (at a check when a multiple of STACK_CHECK_TICKS); and whether its threads
   *  failed (it stays on one thread then). A run on one thread for want of the budget's threads (the checks' settle held
   *  them) asks again at each check. */
  private begun = 0;
  private failed = false;
  /** The preview's stopping rule (`preview`): every column's water at the last check, to measure the next against. */
  private checked: Float64Array | null = null;
  /** A force's water (`holdOwn`): the map's own water run on beside it. */
  private own: OwnWater | null = null;

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
    /** The journey after an edit runs on several threads where there is a pool (a stroke's draft, built again as its
     *  ground changes, stays on one). */
    private readonly parallel = false,
    /** The journey after an edit stops by the preview's rule too, as a heightfield's does (preview.ts `PreviewRun`), at
     *  each of the run's checks (every STACK_CHECK_TICKS, where the strips hand their water back, so the same tick on
     *  any number of threads): the water's volume changed by under 0.2% since the last check, and at most
     *  PREVIEW_MOVED of the map's tiles have a column whose depth moved by more than PREVIEW_TOL. Its water is then the
     *  map's until the canonical settle replaces it (`settle`). */
    private readonly preview = false,
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
    const b = buildColumns(this.W, this.H, mask, this.objects, this.kept);
    this.count = b.count;
    this.floor = b.floor;
    this.ceil = b.ceil;
    this.start = b.start;
    this.target = b.target;
    this.dir = b.dir;
    this.L = b.L;
    return b.m;
  }

  /** The engine's column graph as it stands (`Graph`). */
  private graph(): Graph {
    return { N: this.N, start: this.start, target: this.target, dir: this.dir, floor: this.floor, ceil: this.ceil };
  }

  /** `from` carried over to the engine's columns, written in with its flows' momentum, and the run on from it begun. */
  private load(from: LiveStack, flows: StackSettle | null = null): void {
    this.threads?.free();
    this.threads = undefined;
    this.since = 0;
    this.begun = 0;
    loadStack(this.m, this, true, carryStack(from, this));
    const out = this.m.view(STACK_FIELD.momentum) as Float64Array;
    if (from.edges) carryMomentum(this.graph(), from.edges, out);
    else if (flows?.flows) seedMomentum(this.graph(), flows, this.m.view(STACK_FIELD.depth) as Float64Array, out);
    this.m.op(STACK_OP.settleBegin, this.days, 1);
    this.finished = false;
    this.checked = this.preview ? (this.m.copy(STACK_FIELD.depth) as Float64Array) : null;
  }

  /** The terrain under a stroke being painted or a force at work changed (`mask`, the whole map's), and with a force
   *  perhaps its objects (`objects`, stackWater.ts `stackObjectRows`: a source it took or moved): the engine is built
   *  on them again and the water as it stands carried over to it, its flows' momentum with it. */
  reshape(mask: Uint32Array, objects?: Float64Array, own?: Uint32Array): void {
    if (own && this.own) this.own.want = own;
    const now = this.raw();
    const was = this.objects;
    if (objects) this.objects = objects;
    let m: StackWater;
    try {
      m = this.build(mask);
    } catch (e) {
      this.objects = was;
      throw e;
    }
    this.m.close();
    this.m = m;
    this.mask = mask;
    this.load(now);
  }

  /** Run at most `ticks` more; true once the water stands still (the canonical settle's test) or its days ran out. */
  advance(ticks: number): boolean {
    if (this.finished) return true;
    const before = this.ticks;
    const done = this.run(ticks);
    const own = this.own;
    if (own && this.ticks > before) {
      // (the map's own water runs the same ticks, by the same rules as the settle's run, `Stack::run`)
      this.wallsOwn(own, this.ticks - before);
      own.b.m.op(STACK_OP.run, this.ticks - before, 1);
    }
    return done;
  }

  private run(ticks: number): boolean {
    let left = Math.max(0, Math.floor(ticks));
    const asking = this.parallel && !this.failed;
    if (this.threads === undefined || (this.threads === null && asking && this.begun % STACK_CHECK_TICKS === 0))
      this.threads = asking && this.m.info(STACK_INFO.settle) === 0 && this.m.info(STACK_INFO.maxTicks) % STACK_CHECK_TICKS === 0 ? stackThreads(this.m, this.W, this.H, this.mask, this.objects, true)?.watch(this) ?? null : null;
    while (this.threads && left > 0 && this.m.info(STACK_INFO.settle) === 0) {
      const n = Math.min(left, STACK_CHECK_TICKS - this.since);
      const check = this.since + n === STACK_CHECK_TICKS;
      if (!this.threads.run(n, check)) {
        this.single();
        break;
      }
      left -= n;
      this.since += n;
      this.begun += n;
      this.ticks += n;
      this.reported = check;
      if (check) {
        try {
          this.threads.sync(this.m);
        } catch {
          this.single();
          break;
        }
        this.m.op(STACK_OP.elsewhere, this.since);
        this.since = 0;
        // (a preview stops at each check, so its rule is tested at every one whatever `ticks` asks, as on one thread)
        if (this.preview) break;
      }
    }
    const m = this.m;
    if (!this.threads && left > 0 && m.info(STACK_INFO.settle) === 0) {
      // (on one thread for want of the budget's threads: to the next check, where it asks again)
      const n = (this.parallel && !this.failed) || this.preview ? Math.min(left, STACK_CHECK_TICKS - (this.begun % STACK_CHECK_TICKS)) : left;
      const before = m.info(STACK_INFO.ticks);
      m.op(STACK_OP.advance, n);
      const ran = m.info(STACK_INFO.ticks) - before;
      this.ticks += ran;
      this.begun += ran;
    }
    if (m.info(STACK_INFO.settle) !== 0 || this.stillByPreview()) {
      this.finished = true;
      this.threads?.free();
      this.threads = null;
    }
    return this.finished;
  }

  /** At a check of a run that stops by the preview's rule (`preview`): whether the water stands still by it. The whole
   *  map's engine holds the water there (the strips handed it back at the check). */
  private stillByPreview(): boolean {
    const was = this.checked;
    if (!was || this.begun === 0 || this.begun % STACK_CHECK_TICKS !== 0 || (this.threads && this.since !== 0)) return false;
    const d = this.m.view(STACK_FIELD.depth) as Float64Array;
    const N = this.N;
    let before = 0;
    let now = 0;
    const moved = new Uint8Array(N);
    let tiles = 0;
    for (let c = 0; c < d.length; c++) {
      before += was[c];
      now += d[c];
      const dd = d[c] - was[c];
      if ((dd > PREVIEW_TOL || dd < -PREVIEW_TOL) && !moved[c % N]) {
        moved[c % N] = 1;
        tiles++;
      }
    }
    was.set(d);
    // (as water.ts `SettleRun` measures it)
    const dv = Math.abs(now - before) / Math.max(now, 1e-9);
    return dv < 0.002 && tiles <= PREVIEW_MOVED * N;
  }

  /** The water as it stands as a settle of the map (the journey's end, `preview`): every column with its saturation and
   *  its outflows (four a column, and toward each target as the file stores them), but no `reach` or `start`, which only
   *  a canonical settle has (stackWater.ts `settledAgain`). */
  settle(): StackSettle {
    this.gather();
    this.m.op(STACK_OP.saturation);
    return { ...this.water(), sat: this.m.copy(STACK_FIELD.saturation) as Uint8Array, flows: columnFlows(this.m, true), outflows: columnOutflows(this.m) };
  }

  /** The strips' water since the run's last check, into the whole map's engine, its momentum with it: before it is read. */
  private gather(): void {
    if (!this.threads || this.since === 0 || !this.report()) return;
    try {
      this.threads.sync(this.m);
    } catch {
      this.single();
    }
  }

  /** The strips' rows written back, if they ran since they last were; false when a thread failed (on one thread then). */
  private report(): boolean {
    if (!this.threads || this.reported) return !!this.threads;
    if (this.threads.run(0, true)) {
      this.reported = true;
      return true;
    }
    this.single();
    return false;
  }

  /** A thread failed (the pool is given up): the run goes on on one thread, from the water as the strips last handed it
   *  back (a few ticks back), on an engine built again (the old one's settle runs on, and takes no new water). */
  private single(): void {
    this.failed = true;
    this.threads?.free();
    this.threads = null;
    this.since = 0;
    this.reshape(this.mask);
    this.threads = null;
  }

  /** Whether the water stands still (or ran out of days). */
  get done(): boolean {
    return this.finished;
  }

  /** The water as it stands, every column (copies), with its flows' momentum: a `StackSettle` that is not a settle,
   *  never written to a file. */
  state(): LiveStack {
    const now = this.raw();
    if (this.own) this.ownPlus(this.own, now, null, now.edges!.out);
    return now;
  }

  /** The water as the engine holds it, every column (copies), with its flows' momentum (`state` before `ownPlus`). */
  private raw(): LiveStack {
    this.gather();
    return { ...this.water(), edges: { start: this.start, target: this.target, dir: this.dir, floor: this.floor, out: this.m.copy(STACK_FIELD.momentum) as Float64Array } };
  }

  /** The water of a force on this map (src/worker/session.ts `startForceStack`) changes only by what the force does
   *  (#1181): from here, its water as it stands runs on beside it as well, the same ticks by the same rules, on the
   *  map's own ground and objects (`objects`: none of the force's sources), its front's walls let go as the force's are
   *  (`reshape`'s `own`), as if the force had gone no further. The water shown and handed on (`frame`, `state`) is the
   *  water as it is now with what the force changed added (its run's water less that one's, column by column: depth,
   *  pressure, badwater share, flows and their momentum); a column the force never reached is as it is now, to the last
   *  bit. A stream in a cave can swing a few thousandths about where the settle stopped it, some sixty ticks a swing
   *  (Highlands 96² seed 22's at (41–51, 68–69), 0.427 to 0.433 about the settle's 0.431, its run on alone settling
   *  to 0.4295): shown as it ran, it rose and fell while a force worked far from it, and was handed on part way through
   *  a swing. Call it before the first `advance`; not on several threads (a force's water runs on one). */
  holdOwn(objects: Float64Array): void {
    if (this.parallel) throw new Error("A force's water runs on one thread.");
    this.own?.b.m.close();
    this.own = null;
    const now = this.raw();
    const b = buildColumns(this.W, this.H, this.mask, objects, this.kept);
    try {
      loadStack(b.m, b, true, carryStack(now, b));
      carryMomentum(b, now.edges!, b.m.view(STACK_FIELD.momentum) as Float64Array);
      b.m.op(STACK_OP.accept);
      const start = {
        count: b.count,
        floor: b.floor,
        ceil: b.ceil,
        depth: b.m.copy(STACK_FIELD.depth) as Float64Array,
        overflow: b.m.copy(STACK_FIELD.overflow) as Float64Array,
        contamination: b.m.copy(STACK_FIELD.contamination) as Float64Array,
        flows: columnFlows(b.m, true),
        edges: { start: b.start, target: b.target, dir: b.dir, floor: b.floor, out: b.m.copy(STACK_FIELD.momentum) as Float64Array },
      };
      this.own = { b, mask: this.mask.slice(), want: null, objects, start };
    } catch (e) {
      b.m.close();
      throw e;
    }
  }

  /** The map's own water beside a force's (`holdOwn`) on `mask`: the walls of a carve's front let go there as in
   *  the force's run (src/worker/session.ts `forceStackMask`), its water as it stands carried over with its momentum,
   *  as `reshape` carries the force's. */
  private reshapeOwn(own: OwnWater, mask: Uint32Array): void {
    const old = own.b;
    const now: LiveStack = {
      W: this.W,
      H: this.H,
      L: old.L,
      stacked: true,
      count: old.count,
      floor: old.floor,
      ceil: old.ceil,
      depth: old.m.copy(STACK_FIELD.depth) as Float64Array,
      overflow: old.m.copy(STACK_FIELD.overflow) as Float64Array,
      contamination: old.m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: new Uint8Array(old.L * this.N),
      settled: false,
      ticks: this.ticks,
      edges: { start: old.start, target: old.target, dir: old.dir, floor: old.floor, out: old.m.copy(STACK_FIELD.momentum) as Float64Array },
    };
    const b = buildColumns(this.W, this.H, mask, own.objects, this.kept);
    try {
      loadStack(b.m, b, true, carryStack(now, b));
      carryMomentum(b, now.edges!, b.m.view(STACK_FIELD.momentum) as Float64Array);
      b.m.op(STACK_OP.accept);
    } catch (e) {
      b.m.close();
      throw e;
    }
    old.m.close();
    own.b = b;
    own.mask = mask.slice();
  }

  /** The front's walls the force's run let go (`OwnWater.want`) let go in the map's own run too, before it runs `ticks`
   *  more, where its water could reach them by then: within two tiles a tick (a tick is two of the engine's steps, and
   *  water moves a column a step) and one more of a wet column. A wall on dry ground no water reaches changes none of
   *  its ticks, to the last bit; building the engine again at every frame's let-go walls would cost as much as the
   *  force's own water. */
  private wallsOwn(own: OwnWater, ticks: number): void {
    const want = own.want;
    if (!want) return;
    const N = this.N;
    const W = this.W;
    const { b } = own;
    let pending = 0;
    for (let i = 0; i < N; i++) if (want[i] !== own.mask[i]) pending++;
    if (!pending) {
      own.want = null;
      return;
    }
    // (each tile's distance to the nearest wet column of the map's own water, in tiles, eight ways: two passes)
    const reach = 2 * ticks + 1;
    const far = reach + 1;
    const dist = new Int32Array(N).fill(far);
    const bd = b.m.view(STACK_FIELD.depth) as Float64Array;
    const bo = b.m.view(STACK_FIELD.overflow) as Float64Array;
    for (let i = 0; i < N; i++)
      for (let q = 0; q < b.count[i]; q++) {
        const c = q * N + i;
        if (bd[c] > 0 || bo[c] > 0) {
          dist[i] = 0;
          break;
        }
      }
    for (let i = 0; i < N; i++) {
      const x = i % W;
      let d = dist[i];
      if (x > 0 && dist[i - 1] + 1 < d) d = dist[i - 1] + 1;
      if (i >= W) {
        if (dist[i - W] + 1 < d) d = dist[i - W] + 1;
        if (x > 0 && dist[i - W - 1] + 1 < d) d = dist[i - W - 1] + 1;
        if (x < W - 1 && dist[i - W + 1] + 1 < d) d = dist[i - W + 1] + 1;
      }
      dist[i] = d;
    }
    for (let i = N - 1; i >= 0; i--) {
      const x = i % W;
      let d = dist[i];
      if (x < W - 1 && dist[i + 1] + 1 < d) d = dist[i + 1] + 1;
      if (i + W < N) {
        if (dist[i + W] + 1 < d) d = dist[i + W] + 1;
        if (x < W - 1 && dist[i + W + 1] + 1 < d) d = dist[i + W + 1] + 1;
        if (x > 0 && dist[i + W - 1] + 1 < d) d = dist[i + W - 1] + 1;
      }
      dist[i] = d;
    }
    let mask: Uint32Array | null = null;
    for (let i = 0; i < N; i++)
      if (want[i] !== own.mask[i] && dist[i] <= reach) {
        mask ??= own.mask.slice();
        mask[i] = want[i];
      }
    if (mask) this.reshapeOwn(own, mask);
  }

  /** `w` (this run's water, on its columns) as the map's own water began with what the force changed added
   *  (`holdOwn`): on each column the map's own run also has (the same tile, slot, floor and ceiling), its value as it
   *  began (none on a column it began without: a front's wall let go) plus this run's less the map's own; a column only
   *  this run has (the ground the force changed) as this run has it. Its flows (`flows`, four a column) or its edges'
   *  momentum (`out`) the same way. Each is kept to what the engine takes (no depth below none or over its room, no
   *  share over one, no flow back), as the water carried over to a new build is (`loadStack`). */
  private ownPlus(own: OwnWater, w: StackSettle, flows: Float32Array | null, out: Float64Array | null): void {
    const N = this.N;
    const { b, start } = own;
    const bd = b.m.view(STACK_FIELD.depth) as Float64Array;
    const bo = b.m.view(STACK_FIELD.overflow) as Float64Array;
    const bc = b.m.view(STACK_FIELD.contamination) as Float64Array;
    const bm = b.m.view(STACK_FIELD.momentum) as Float64Array;
    const sum = new Float64Array(4);
    // (each edge's momentum by its key, `edgeKey`: the map's own as it began, and as it is)
    let was: Map<number, number> | null = null;
    let is: Map<number, number> | null = null;
    if (out) {
      was = new Map();
      is = new Map();
      const e = start.edges;
      for (let c = 0; c + 1 < e.start.length; c++) for (let k = e.start[c]; k < e.start[c + 1]; k++) was.set(keyOf({ N, ...e }, c, k, e.dir[k]), e.out[k]);
      for (let c = 0; c + 1 < b.start.length; c++) for (let k = b.start[c]; k < b.start[c + 1]; k++) is.set(keyOf(b, c, k, b.dir[k]), bm[k]);
    }
    const g = this.graph();
    for (let i = 0; i < N; i++)
      for (let q = 0; q < this.count[i]; q++) {
        const c = q * N + i;
        const f = this.floor[c];
        const top = this.ceil[c];
        if (q >= b.count[i] || b.floor[c] !== f || b.ceil[c] !== top) continue;
        const began = q < start.count[i] && start.floor[c] === f && start.ceil[c] === top;
        const same = w.depth[c] === bd[c] && w.overflow[c] === bo[c] && w.contamination[c] === bc[c];
        const cap = top - f;
        const d = (began ? start.depth[c] : 0) + (w.depth[c] - bd[c]);
        w.depth[c] = d > 0 ? (d < cap ? d : cap) : 0;
        const o = (began ? start.overflow[c] : 0) + (w.overflow[c] - bo[c]);
        w.overflow[c] = o > 0 ? o : 0;
        const k = (began ? start.contamination[c] : 0) + (w.contamination[c] - bc[c]);
        w.contamination[c] = k > 0 ? (k < 1 ? k : 1) : 0;
        if (flows) {
          // (the map's own flows summed as `columnFlows` sums them, where its water differs from this run's: where it
          // doesn't, so do the flows, as near as the page draws them)
          if (same) for (let d4 = 4 * c; d4 < 4 * c + 4; d4++) flows[d4] = began ? start.flows[d4] : 0;
          else {
            sum.fill(0);
            for (let e = b.start[c]; e < b.start[c + 1]; e++) sum[b.dir[e]] += bm[e];
            for (let d = 0; d < 4; d++) flows[4 * c + d] = Math.max(0, (began ? start.flows[4 * c + d] : 0) + (flows[4 * c + d] - Math.fround(sum[d])));
          }
        }
        if (out && was && is)
          for (let k2 = this.start[c]; k2 < this.start[c + 1]; k2++) {
            const key = keyOf(g, c, k2, this.dir[k2]);
            const v = is.get(key);
            if (v !== undefined) out[k2] = Math.max(0, (began ? (was.get(key) ?? 0) : 0) + (out[k2] - v));
          }
      }
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
    // (between checks on several threads, the strips' water and outflows; their momentum stays theirs till asked for)
    const strips = this.threads && this.since > 0 && this.report() ? this.threads : null;
    strips?.write(this.m);
    const stack = this.water();
    const flows = strips ? strips.flows() : columnFlows(this.m, true);
    if (this.own) this.ownPlus(this.own, stack, flows, null);
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
    return { stack, depth, contamination, flows };
  }

  close(): void {
    this.threads?.free();
    this.threads = null;
    this.m.close();
    this.own?.b.m.close();
    this.own = null;
  }
}
