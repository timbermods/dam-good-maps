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
import { HALO } from "./parallel";
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
  const N = g.N;
  const slots = e.start.length - 1;
  for (let c = 0; c + 1 < g.start.length; c++) {
    const a = g.start[c];
    const b = g.start[c + 1];
    if (a === b) continue;
    // (its column in `e`: the same tile and floor; an edge there: the same direction and target floor)
    const f = g.floor[c];
    let oc = -1;
    for (let q = c % N; q < slots && oc < 0; q += N) if (e.floor[q] === f && e.start[q] < e.start[q + 1]) oc = q;
    if (oc < 0) continue;
    const oa = e.start[oc];
    const ob = e.start[oc + 1];
    for (let k = a; k < b; k++) {
      const t = g.target[k];
      const tf = t >= 0 ? g.floor[t] : 63;
      const d = g.dir[k];
      for (let j = oa; j < ob; j++) {
        if (e.dir[j] !== d) continue;
        const u = e.target[j];
        if ((u >= 0 ? e.floor[u] : 63) !== tf) continue;
        if (e.out[j] !== 0) out[k] = e.out[j];
        break;
      }
    }
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

/** The map's own water beside a force's run, as if the force had gone no further (`StackLive.holdOwn`): `start`, the
 *  water as the force began, on the columns it had then, with its flows and their momentum; `want`, the terrain the
 *  map's own water stands on (the map's own ground, the front's walls as the force's run has them); `objects`, the
 *  map's own; `strip`, the rows where the force's water may differ from it, run there (none before the force changes
 *  anything); `was`, `start`'s momentum by edge (`edgeKey`), once asked for. */
interface OwnWater {
  start: { count: Uint8Array; floor: Int16Array; ceil: Int16Array; depth: Float64Array; overflow: Float64Array; contamination: Float64Array; flows: Float32Array; edges: EdgeMomentum };
  want: Uint32Array;
  objects: Float64Array;
  strip: OwnStrip | null;
  was?: Map<number, number>;
  wet?: Int32Array;
}

/** The map's own water run on a strip of the map's rows (`OwnWater.strip`), as the multi-core settle runs a strip
 *  (stackParallel.ts): rows `lo` to `hi`, its own rows `y0` to `y1` and HALO rows of the force's run's water on each
 *  side that is not the map's edge, taken in after every tick; `mask`, its rows' terrain as it is built; `ran`, whether
 *  it ran a tick since; `waiting`, the tiles (of its rows) where `OwnWater.want` differs from `mask`, for that `want`;
 *  `safeTo`, the tick (`StackLive.ticks`) to which it may run without them (`StackLive.ownSafe`). */
interface OwnStrip extends Built {
  lo: number;
  hi: number;
  y0: number;
  y1: number;
  mask: Uint32Array;
  ran: boolean;
  waiting?: { want: Uint32Array; at: number[]; near: boolean };
  safeTo: number;
  seen?: Int32Array;
  stamp: number;
}

/** Rows kept between the force's changes and the edge of the strip's own rows (`OwnStrip`); rows at that edge checked
 *  after every tick (a difference there grows the strip by GROW_ROWS): water that differs moves at most HALO rows a
 *  tick, so it never reaches the halo, where the force's water stands for the map's own. */
const STRIP_MARGIN = 8;
const BAND_ROWS = 4;
const GROW_ROWS = 16;

/** The map's rows `lo` to `hi` (`mask`, theirs) built in the engine as a map of their own, as the multi-core settle
 *  builds a strip (stackParallel.ts): with every object whose footprint may reach them, the stacked rules (build b = 1)
 *  and no stored lakes (a run does not read them); its own rows `y0` to `y1`. */
function stripColumns(W: number, H: number, lo: number, hi: number, y0: number, y1: number, mask: Uint32Array, objects: Float64Array): OwnStrip {
  const kept: number[] = [];
  for (let k = 0; k + 7 < objects.length; k += 8) {
    const y = objects[k + 2];
    if (y < lo - 4 || y >= hi + 4) continue;
    for (let j = 0; j < 8; j++) kept.push(objects[k + j]);
    kept[kept.length - 6] = y - lo;
  }
  const rows = hi - lo;
  const m = new StackWater(W, rows, kept.length / 8, 0);
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(kept);
    m.op(STACK_OP.build, 0, 1);
    const n = W * rows;
    const count = m.copy(STACK_FIELD.count) as Uint8Array;
    let L = 1;
    for (let i = 0; i < n; i++) if (count[i] > L) L = count[i];
    m.op(STACK_OP.accept);
    return {
      m,
      W,
      H: rows,
      N: n,
      L,
      count,
      floor: m.copy(STACK_FIELD.floor) as Int16Array,
      ceil: m.copy(STACK_FIELD.ceil) as Int16Array,
      start: m.copy(STACK_FIELD.graphStart) as Uint32Array,
      target: m.copy(STACK_FIELD.graphTarget) as Int32Array,
      dir: m.copy(STACK_FIELD.graphDirection) as Uint8Array,
      lo,
      hi,
      y0,
      y1,
      mask: mask.slice(),
      ran: false,
      safeTo: 0,
      stamp: 0,
    };
  } catch (e) {
    m.close();
    throw e;
  }
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
    if (this.own) {
      if (own) this.own.want = own;
      // (the strip over every row the force now changes, from the water before it does)
      this.ownCover(this.own, mask, objects ?? this.objects);
    }
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
    const own = this.own;
    if (!own?.strip) return this.run(ticks);
    // (the map's own water on its strip beside the force's, the walls the force let go let go on it before they could
    // matter, `ownSafe`)
    let left = Math.max(0, Math.floor(ticks));
    while (left > 0 && !this.finished) {
      let s = own.strip!;
      let k = this.ownSafe(own, s, left);
      if (k === 0) {
        this.ownWalls(own, s);
        s = own.strip!;
        k = left;
      }
      const before = this.ticks;
      if (s.lo === 0 && s.hi === this.H) {
        // (the whole map: no halo to take, so the same ticks in one run, as the force's)
        this.run(k);
        if (this.ticks === before) break;
        s.m.op(STACK_OP.run, this.ticks - before, 1);
        s.ran = true;
        left -= this.ticks - before;
      } else {
        // (a tick at a time, its halo taken from the force's water after each)
        this.run(1);
        if (this.ticks === before) break;
        this.ownTick(own);
        left--;
      }
    }
    return this.finished;
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
   *  (#1181). The map's own water runs on beside it, the same ticks by the same rules, on the map's own ground and
   *  objects (`objects`: none of the force's sources), its front's walls let go as the force's are (`reshape`'s `own`),
   *  as if the force had gone no further. The water shown and handed on (`frame`, `state`) is the water as the force
   *  began with what the force changed added (its run's water less the map's own, column by column: depth, pressure,
   *  badwater share, flows and their momentum), so a column the force never reached is as it began, to the last bit. A
   *  stream in a cave can swing a few thousandths about where the settle stopped it, some sixty ticks a swing
   *  (Highlands 96² seed 22's at (41–51, 68–69), 0.427 to 0.433 about the settle's 0.431, its rest 0.4295), and every
   *  wet column changes at every tick (it evaporates as its sources feed it), so there is no water at rest to skip:
   *  shown as it ran, the stream rose and fell while a force worked far from it, and was handed on part way through a
   *  swing.
   *
   *  Where the force's water does not differ from the map's own, it is the map's own, to the last bit: so the map's own
   *  runs only on a strip of rows round what the force changed (`OwnStrip`), as the multi-core settle runs a strip
   *  (stackParallel.ts, the same bytes as the whole map), its halo taken from the force's water after every tick, and
   *  grows as the difference does, however small (a carve's reach covers a 96² map's rows within about a hundred
   *  ticks, the last of it a few units in the fifteenth place); none runs before the force changes anything. The
   *  front's walls the force lets go go on the strip only just before its water could reach them (`ownSafe`,
   *  `ownWalls`), so a wall that water never comes near costs no build. Call it before the first `advance`; not on
   *  several threads (a force's water runs on one). */
  holdOwn(objects: Float64Array): void {
    if (this.parallel) throw new Error("A force's water runs on one thread.");
    this.own?.strip?.m.close();
    this.own = null;
    const now = this.raw();
    this.own = {
      start: { count: this.count, floor: this.floor, ceil: this.ceil, depth: now.depth, overflow: now.overflow, contamination: now.contamination, flows: columnFlows(this.m, true), edges: now.edges! },
      want: this.mask.slice(),
      objects,
      strip: null,
    };
    this.ownCover(this.own, this.mask, this.objects);
  }

  /** The rows the force's run on `mask` and `objects` changes against the map's own (`OwnWater.want`, its objects),
   *  with STRIP_MARGIN rows each way: [first, last) or null. An object's footprint reaches at most three tiles from
   *  its anchor. */
  private ownChanges(own: OwnWater, mask: Uint32Array, objects: Float64Array): [number, number] | null {
    const W = this.W;
    let y0 = this.H;
    let y1 = -1;
    for (let i = 0; i < mask.length; i++)
      if (mask[i] !== own.want[i]) {
        const y = (i / W) | 0;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    const rows = (o: Float64Array) => {
      const out = new Map<string, number>();
      for (let k = 0; k + 7 < o.length; k += 8) {
        const key = Array.prototype.join.call(o.subarray(k, k + 8), ",");
        out.set(key, (out.get(key) ?? 0) + 1);
      }
      return out;
    };
    const a = rows(objects);
    const b = rows(own.objects);
    for (const [m, n] of [
      [a, b],
      [b, a],
    ])
      for (const [key, k] of m)
        if ((n.get(key) ?? 0) !== k) {
          const y = Number(key.split(",")[2]);
          if (y - 4 < y0) y0 = y - 4;
          if (y + 4 > y1) y1 = y + 4;
        }
    if (y1 < 0) return null;
    return [Math.max(0, y0 - STRIP_MARGIN), Math.min(this.H, y1 + 1 + STRIP_MARGIN)];
  }

  /** The strip's own rows over every row the force's run on `mask` and `objects` changes (`ownChanges`), made or grown
   *  from the force's water as it stands, which is the map's own outside the strip (call it before the force's run
   *  takes the change). */
  private ownCover(own: OwnWater, mask: Uint32Array, objects: Float64Array): void {
    const rows = this.ownChanges(own, mask, objects);
    if (!rows) return;
    const s = own.strip;
    if (s && rows[0] >= s.y0 && rows[1] <= s.y1) return;
    this.ownStrip(own, s ? Math.min(s.y0, rows[0]) : rows[0], s ? Math.max(s.y1, rows[1]) : rows[1]);
  }

  /** The strip on own rows `a` to `b` (to the map's edge when within HALO + GROW_ROWS of it): its water the strip's own where it
   *  had rows of its own, the force's elsewhere (the map's own there). */
  private ownStrip(own: OwnWater, a: number, b: number): void {
    const { W, H } = this;
    // (to the map's edge when near it: a strip of a few rows there would cost its halo's exchange at every tick)
    const y0 = a <= HALO + GROW_ROWS ? 0 : a;
    const y1 = b >= H - HALO - GROW_ROWS ? H : b;
    const lo = Math.max(0, y0 - HALO);
    const hi = Math.min(H, y1 + HALO);
    const old = own.strip;
    // its terrain: the strip's own where it had rows of its own (a front's wall not yet let go there), the force's run's
    // elsewhere (the map's own: none of the force's changes lie there)
    const mask = this.mask.slice(lo * W, hi * W);
    if (old) mask.set(old.mask.subarray((old.y0 - old.lo) * W, (old.y1 - old.lo) * W), (old.y0 - lo) * W);
    const s = stripColumns(W, H, lo, hi, y0, y1, mask, own.objects);
    try {
      if (old) {
        if (lo < old.y0) this.ownTake(s, this.m, lo, old.y0, 0);
        this.ownTake(s, old.m, old.y0, old.y1, old.lo);
        if (old.y1 < hi) this.ownTake(s, this.m, old.y1, hi, 0);
      } else this.ownTake(s, this.m, lo, hi, 0);
    } catch (e) {
      s.m.close();
      throw e;
    }
    old?.m.close();
    own.strip = s;
  }

  /** Rows `r0` to `r1` of the map (of `from`, an engine whose first row is the map's row `base`) into the strip `s`, as
   *  the strips hand them on (stack.rs `export_rows`, `import_rows`), with the momentum of the strip's first and last
   *  rows where they are the map's top and bottom rows (their edges are the map's there; import_rows keeps a strip's
   *  own). */
  private ownTake(s: OwnStrip, from: StackWater, r0: number, r1: number, base: number): void {
    if (r1 <= r0) return;
    from.op(STACK_OP.exportRows, r0 - base, r1 - base);
    const v = (from.view(STACK_FIELD.rowsOut) as Float64Array).slice();
    s.m.op(STACK_OP.inbox, v.length);
    (s.m.view(STACK_FIELD.rowsIn) as Float64Array).set(v);
    s.m.op(STACK_OP.importRows, r0 - s.lo, r1 - s.lo);
    const W = this.W;
    const rows = s.hi - s.lo;
    const edge = (r: number) => (r === 0 && s.lo === 0) || (r === this.H - 1 && s.hi === this.H);
    if (!edge(r0) && !edge(r1 - 1)) return;
    const momentum = s.m.view(STACK_FIELD.momentum) as Float64Array;
    const n = rows * W;
    const theirs = v[0];
    let p = 3 + 4 * theirs * (r1 - r0) * W;
    for (let q = 0; q < theirs; q++)
      for (let r = r0; r < r1; r++) {
        const len = v[p++];
        const lr = r - s.lo;
        if (edge(r) && q < s.L && s.start[q * n + (lr + 1) * W] - s.start[q * n + lr * W] === len) momentum.set(v.subarray(p, p + len), s.start[q * n + lr * W]);
        p += len;
      }
  }

  /** How many of the next `ticks` ticks the strip may run before the front's walls the force's run let go
   *  (`OwnWater.want`) must go on it too: all of them while none waits; none while one waits in its halo or the rows
   *  next to it (their columns must be the force's run's there); elsewhere, by the water it holds now: water moves at
   *  most a column a step, two steps a tick, and a step reads the columns two round each wet one, so a wall more than
   *  2·k + 2 tiles (either way, diagonals one) from every wet column enters none of the next k ticks, and changes none
   *  of them, to the last bit. Its halo counts as wet throughout (the force's water comes in there after every tick).
   *  The answer holds for those k ticks (`OwnStrip.safeTo`) and is asked again after them, by the water then, so a wall
   *  near water that stays where it is never needs a build. */
  private ownSafe(own: OwnWater, s: OwnStrip, ticks: number): number {
    const W = this.W;
    const { lo, hi } = s;
    const rows = hi - lo;
    const n = rows * W;
    const top = lo > 0 ? s.y0 - lo : 0;
    const bottom = hi < this.H ? s.y1 - lo : rows;
    // (the walls waiting, found once for each strip and each `want`; whether one is in its halo or the BAND_ROWS
    // rows next to it)
    if (s.waiting?.want !== own.want) {
      const want = own.want.subarray(lo * W, hi * W);
      const at: number[] = [];
      let near = false;
      for (let i = 0; i < n; i++)
        if (want[i] !== s.mask[i]) {
          at.push(i);
          const r = (i / W) | 0;
          if ((lo > 0 && r < top + BAND_ROWS) || (hi < this.H && r >= bottom - BAND_ROWS)) near = true;
        }
      s.waiting = { want: own.want, at, near };
      s.safeTo = this.ticks;
    }
    const { at, near } = s.waiting;
    if (!at.length) return ticks;
    if (near) return 0;
    if (s.safeTo > this.ticks) return Math.min(ticks, s.safeTo - this.ticks);
    // (a column is wet: depth or pressure above none; once the strip has run a tick, every column wet since it was
    // built, stack.rs `wet_ever`, which holds every one wet now and reads without the engine checking its water again)
    const ever = s.ran ? (s.m.view(STACK_FIELD.reach) as Uint8Array) : null;
    const d = ever ? null : (s.m.view(STACK_FIELD.depth) as Float64Array);
    const o = ever ? null : (s.m.view(STACK_FIELD.overflow) as Float64Array);
    const L = s.L;
    const wet = (i: number): boolean => {
      const r = (i / W) | 0;
      if (r < top || r >= bottom) return true;
      for (let c = i; c < L * n; c += n) if (ever ? ever[c] !== 0 : d![c] > 0 || o![c] > 0) return true;
      return false;
    };
    // (the nearest wet tile to any wall waiting, out to 2·ticks + 2: ring by ring out from all of them at once)
    const R = 2 * ticks + 2;
    const seen = (s.seen ??= new Int32Array(n));
    const mark = ++s.stamp;
    let ring: number[] = at.slice();
    for (const i of ring) seen[i] = mark;
    let best = R + 1;
    for (let r = 0; r <= R && ring.length; r++) {
      if (ring.some(wet)) {
        best = r;
        break;
      }
      const next: number[] = [];
      for (const i of ring) {
        const x = i % W;
        const y = (i / W) | 0;
        for (let yy = y > 0 ? y - 1 : 0; yy <= y + 1 && yy < rows; yy++)
          for (let xx = x > 0 ? x - 1 : 0; xx <= x + 1 && xx < W; xx++) {
            const j = yy * W + xx;
            if (seen[j] === mark) continue;
            seen[j] = mark;
            next.push(j);
          }
      }
      ring = next;
    }
    // (the most ticks k with best > 2·k + 2)
    const k = Math.max(0, Math.floor((best - 3) / 2));
    s.safeTo = this.ticks + k;
    return Math.min(ticks, k);
  }

  /** The front's walls the force's run let go let go on the strip too (`ownSafe` says when): all of those waiting at
   *  once (the far ones change nothing either way), one build for as many as can wait, the strip's water carried over
   *  to it with its momentum. */
  private ownWalls(own: OwnWater, s: OwnStrip): void {
    const W = this.W;
    const { lo, hi } = s;
    const rows = hi - lo;
    const n = rows * W;
    const mask = own.want.slice(lo * W, hi * W);
    // (built again on them, its water carried over with its momentum, as `reshape` carries the force's)
    const now: LiveStack = {
      W,
      H: rows,
      L: s.L,
      stacked: true,
      count: s.count,
      floor: s.floor,
      ceil: s.ceil,
      depth: s.m.copy(STACK_FIELD.depth) as Float64Array,
      overflow: s.m.copy(STACK_FIELD.overflow) as Float64Array,
      contamination: s.m.copy(STACK_FIELD.contamination) as Float64Array,
      sat: new Uint8Array(s.L * n),
      settled: false,
      ticks: this.ticks,
      edges: { start: s.start, target: s.target, dir: s.dir, floor: s.floor, out: s.m.copy(STACK_FIELD.momentum) as Float64Array },
    };
    const t = stripColumns(W, this.H, lo, hi, s.y0, s.y1, mask, own.objects);
    try {
      loadStack(t.m, t, true, carryStack(now, t));
      carryMomentum(t, now.edges!, t.m.view(STACK_FIELD.momentum) as Float64Array);
      t.m.op(STACK_OP.accept);
    } catch (e) {
      t.m.close();
      throw e;
    }
    s.m.close();
    own.strip = t;
  }

  /** A tick of the map's own water on its strip, after the force's run's: its halo then taken from the force's water
   *  (the map's own there), and the rows next to it checked: where they differ from the force's, the strip grows. */
  private ownTick(own: OwnWater): void {
    const s = own.strip!;
    s.m.op(STACK_OP.run, 1, 1);
    s.ran = true;
    if (s.lo > 0) this.ownTake(s, this.m, s.lo, s.y0, 0);
    if (s.hi < this.H) this.ownTake(s, this.m, s.y1, s.hi, 0);
    const differs = (r0: number, r1: number) => {
      this.m.op(STACK_OP.exportRows, r0, r1);
      const a = this.m.view(STACK_FIELD.rowsOut) as Float64Array;
      const av = a.slice();
      s.m.op(STACK_OP.exportRows, r0 - s.lo, r1 - s.lo);
      const b = s.m.view(STACK_FIELD.rowsOut) as Float64Array;
      if (av.length !== b.length) return true;
      for (let k = 0; k < b.length; k++) if (av[k] !== b[k]) return true;
      return false;
    };
    const up = s.lo > 0 && differs(s.y0, s.y0 + BAND_ROWS);
    const down = s.hi < this.H && differs(s.y1 - BAND_ROWS, s.y1);
    if (up || down) this.ownStrip(own, up ? s.y0 - GROW_ROWS : s.y0, down ? s.y1 + GROW_ROWS : s.y1);
  }

  /** The columns (slot·N + tile) where the water as the force began is not none (`OwnWater.start`: depth, pressure,
   *  badwater share or flows). */
  private ownWet(own: OwnWater): Int32Array {
    if (own.wet) return own.wet;
    const { start } = own;
    const at: number[] = [];
    for (let c = 0; c < start.depth.length; c++)
      if (start.depth[c] !== 0 || start.overflow[c] !== 0 || start.contamination[c] !== 0 || start.flows[4 * c] !== 0 || start.flows[4 * c + 1] !== 0 || start.flows[4 * c + 2] !== 0 || start.flows[4 * c + 3] !== 0) at.push(c);
    return (own.wet = Int32Array.from(at));
  }

  /** `w` (this run's water, on its columns) as the water as the force began with what the force changed added
   *  (`holdOwn`): on each column of the strip's own rows that the map's own also has (the same tile, slot, floor and
   *  ceiling), its value as it began (none on a column it began without: a front's wall let go) plus this run's less
   *  the map's own; on every column outside them (where this run's water is the map's own) its value as it began; a
   *  column only this run has (the ground the force changed) as this run has it. Its flows (`flows`, four a column) or
   *  its edges' momentum (`out`) the same way. Each is kept to what the engine takes (no depth below none or over its
   *  room, no share over one, no flow back), as the water carried over to a new build is (`loadStack`). */
  private ownPlus(own: OwnWater, w: StackSettle, flows: Float32Array | null, out: Float64Array | null): void {
    const { N, W } = this;
    const { start, strip: s } = own;
    const n = s ? (s.hi - s.lo) * W : 0;
    const bd = s ? (s.m.view(STACK_FIELD.depth) as Float64Array) : null;
    const bo = s ? (s.m.view(STACK_FIELD.overflow) as Float64Array) : null;
    const bc = s ? (s.m.view(STACK_FIELD.contamination) as Float64Array) : null;
    const bm = s ? (s.m.view(STACK_FIELD.momentum) as Float64Array) : null;
    const first = s && s.lo > 0 ? s.y0 * W : s ? 0 : N;
    const last = s && s.hi < this.H ? s.y1 * W : s ? N : N;
    const off = s ? s.lo * W : 0;
    const sum = new Float64Array(4);
    // (each edge's momentum by its key, `edgeKey`: as the map's own began, and as it is on the strip)
    let was: Map<number, number> | null = null;
    let is: Map<number, number> | null = null;
    if (out) {
      was = own.was ??= (() => {
        const m = new Map<number, number>();
        const e = start.edges;
        const eg = { N, ...e };
        for (let c = 0; c + 1 < e.start.length; c++) for (let k = e.start[c]; k < e.start[c + 1]; k++) if (e.out[k] !== 0) m.set(keyOf(eg, c, k, e.dir[k]), e.out[k]);
        return m;
      })();
      if (s && bm) {
        is = new Map();
        for (let c = 0; c + 1 < s.start.length; c++) {
          const tile = (c % n) + off;
          for (let k = s.start[c]; k < s.start[c + 1]; k++) {
            const t = s.target[k];
            is.set(edgeKey(N, tile, s.floor[c], s.dir[k], t >= 0 ? s.floor[t] : 63), bm[k]);
          }
        }
      }
    }
    const g = this.graph();
    // (a frame, on the force's columns laid out as they began: outside the strip's own rows the water as it began,
    // copied whole, then none on a column it began without where it began with water; then the strip's own rows)
    const fast = !out && w.depth.length === start.depth.length;
    if (fast) {
      for (let q = 0; q < this.L; q++)
        for (const [a, b] of [
          [q * N, q * N + first],
          [q * N + last, (q + 1) * N],
        ]) {
          if (b <= a) continue;
          w.depth.set(start.depth.subarray(a, b), a);
          w.overflow.set(start.overflow.subarray(a, b), a);
          w.contamination.set(start.contamination.subarray(a, b), a);
          if (flows) flows.set(start.flows.subarray(4 * a, 4 * b), 4 * a);
        }
      for (const c of this.ownWet(own)) {
        const i = c % N;
        if (i >= first && i < last) continue;
        const q = (c - i) / N;
        if (q < this.count[i] && q < start.count[i] && start.floor[c] === this.floor[c] && start.ceil[c] === this.ceil[c]) continue;
        w.depth[c] = 0;
        w.overflow[c] = 0;
        w.contamination[c] = 0;
        if (flows) flows.fill(0, 4 * c, 4 * c + 4);
      }
    }
    for (let i = fast ? first : 0; i < (fast ? last : N); i++)
      for (let q = 0; q < this.count[i]; q++) {
        const c = q * N + i;
        const f = this.floor[c];
        const top = this.ceil[c];
        const began = q < start.count[i] && start.floor[c] === f && start.ceil[c] === top;
        if (i < first || i >= last) {
          // (the map's own water, as it began)
          w.depth[c] = began ? start.depth[c] : 0;
          w.overflow[c] = began ? start.overflow[c] : 0;
          w.contamination[c] = began ? start.contamination[c] : 0;
          if (flows) for (let d4 = 4 * c; d4 < 4 * c + 4; d4++) flows[d4] = began ? start.flows[d4] : 0;
          if (out && was) for (let k2 = this.start[c]; k2 < this.start[c + 1]; k2++) out[k2] = began ? (was.get(keyOf(g, c, k2, this.dir[k2])) ?? 0) : 0;
          continue;
        }
        const li = i - off;
        const b = q * n + li;
        if (!s || !bd || !bo || !bc || !bm || q >= s.count[li] || s.floor[b] !== f || s.ceil[b] !== top) continue;
        const same = w.depth[c] === bd[b] && w.overflow[c] === bo[b] && w.contamination[c] === bc[b];
        const cap = top - f;
        const d = (began ? start.depth[c] : 0) + (w.depth[c] - bd[b]);
        w.depth[c] = d > 0 ? (d < cap ? d : cap) : 0;
        const o = (began ? start.overflow[c] : 0) + (w.overflow[c] - bo[b]);
        w.overflow[c] = o > 0 ? o : 0;
        const k = (began ? start.contamination[c] : 0) + (w.contamination[c] - bc[b]);
        w.contamination[c] = k > 0 ? (k < 1 ? k : 1) : 0;
        if (flows) {
          // (the map's own flows summed as `columnFlows` sums them, where its water differs from this run's: where it
          // doesn't, so do the flows, as near as the page draws them)
          if (same) for (let d4 = 4 * c; d4 < 4 * c + 4; d4++) flows[d4] = began ? start.flows[d4] : 0;
          else {
            sum.fill(0);
            for (let e = s.start[b]; e < s.start[b + 1]; e++) sum[s.dir[e]] += bm[e];
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
    this.own?.strip?.m.close();
    this.own = null;
  }
}
