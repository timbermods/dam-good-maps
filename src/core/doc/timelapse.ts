// The build time-lapse (D205, D285 (4); its camera: D505): a map's edit history replayed from
// the generated map, step by step, for the page's recorder (src/editor/timelapse). Each step is the history's own
// operations, applied as the checks' replica follows a log (`MapSession.followLog`: rebuilt from where the map
// stood, as an edit is), so after the last step the replay is the map itself, byte for byte (D158, D455), and its
// water, settled, is the map's own (`finish`). What plays between the steps is presentation only and never
// changes the map: the order a step's changed tiles show in (a river cut downstream, a crater from its middle
// out, a stroke along its dabs) and the water flowing on the new land from the water in flight, as the live
// editor's flows (sim/preview.ts `PreviewJob`). Headless: it runs in the time-lapse's worker and in Node.

import { documentAt, type MapDocument } from "./document";
import type { AppliedOp } from "./ops";
import { MapSession } from "./session";
import { PreviewJob, type WarmState } from "../sim/preview";
import { carryStack, sameKeptWater, StackLive, type LiveStack } from "../sim/stackLive";
import { stackGraph, type StackSettle } from "../sim/stackWater";
import { keptOnStack } from "../sim/stackFed";
import type { WaterModel } from "../sim/water";
import type { EntitySpec } from "../format/entities";
import { sameMap } from "./stored";

/** What kind of edit a step is, for its pace and its camera. */
export type LapseKind = "force" | "land" | "objects" | "water" | "other";

/** A step of the history as the time-lapse plays it. */
export interface LapseStep {
  /** Its place in the history (0: the first step after the generated map). */
  index: number;
  label: string;
  kind: LapseKind;
  /** A force's verb (carve, craterize, …). */
  verb?: string;
  /** Where it happens, from its operations alone (`stepPlaces`): what the camera frames; null when they don't say
   *  (a feature's settings, the description, objects removed that were never placed where the log shows). */
  place: LapseBox | null;
}

/** A rectangle of tiles, inclusive. */
export interface LapseBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a step changed, worked out by applying it. */
export interface LapseChange extends LapseStep {
  /** The tiles whose ground changed, ascending, their levels before and after, and when each starts to change
   *  through the step (0–1: the reveal's order, `revealOrder`). */
  tiles: Int32Array;
  before: Uint8Array;
  after: Uint8Array;
  start: Float32Array;
  /** How much of the step each tile takes to change (0–1): a crater's bowl quickly, a volcano's swell slowly. */
  window: number;
  /** The progress (0–1) at which its objects, columns and settings show (all at once). */
  switchAt: number;
  /** Whether the columns (caves, overhangs, the Block tool's work) or the objects changed. */
  columns: boolean;
  objects: boolean;
  /** The tiles it touched, as a rectangle (land, objects, columns); null when nothing on the map shows it. */
  box: LapseBox | null;
}

/** The steps of a log: each operation alone, or with those applied in the same step (`AppliedOp.step`), as the
 *  session's history groups them (session.ts `stepsOf`). */
export function logSteps(log: readonly AppliedOp[]): AppliedOp[][] {
  const out: AppliedOp[][] = [];
  for (const op of log) {
    const last = out.at(-1);
    if (op.step !== undefined && op.step !== op.seq && last && last[0].seq === op.step) last.push(op);
    else out.push([op]);
  }
  return out;
}

function kindOf(ops: readonly AppliedOp[]): { kind: LapseKind; verb?: string } {
  const force = ops.find((o) => o.op === "forceResult");
  if (force && force.op === "forceResult") return { kind: "force", verb: force.params.verb };
  if (ops.some((o) => o.op === "brush" || o.op === "sculpt" || o.op === "blocks" || o.op === "crop" || o.op === "addFeature" || o.op === "updateFeature" || o.op === "deleteFeature" || o.op === "reorderFeature"))
    return { kind: "land" };
  if (ops.some((o) => o.op === "removeUnfedWater" || o.op === "fillHollow")) return { kind: "water" };
  if (ops.some((o) => o.op === "placeEntity" || o.op === "moveEntity" || o.op === "deleteEntities" || o.op === "setEntityProps" || o.op === "paintObjects" || o.op === "pinSlope" || o.op === "removeSlope"))
    return { kind: "objects" };
  return { kind: "other" };
}

function labelOfStep(ops: readonly AppliedOp[]): string {
  const first = ops[0] as AppliedOp & { label?: string };
  return first.label ?? first.op;
}

/** A path as points in tiles, and how far along it each point is (0–1). */
function along(points: readonly (readonly [number, number])[]): { pts: readonly (readonly [number, number])[]; at: Float64Array } {
  const at = new Float64Array(points.length);
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    total += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    at[k] = total;
  }
  if (total > 0) for (let k = 0; k < at.length; k++) at[k] /= total;
  return { pts: points, at };
}

/** How far along a path (0–1) the nearest point to (x, y) is: the nearest segment, and the place on it. */
function placeOn(p: { pts: readonly (readonly [number, number])[]; at: Float64Array }, x: number, y: number): number {
  const { pts, at } = p;
  if (pts.length === 1) return 0;
  let best = Infinity;
  let place = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1];
    const [bx, by] = pts[k];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const d = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
    if (d < best) {
      best = d;
      place = at[k - 1] + (at[k] - at[k - 1]) * t;
    }
  }
  return place;
}

/** Outward from (cx, cy): 0 at the middle, `spread` at the farthest tile. */
function radial(tiles: Int32Array, W: number, cx: number, cy: number, spread: number): Float32Array {
  const out = new Float32Array(tiles.length);
  let far = 0;
  for (let k = 0; k < tiles.length; k++) {
    const x = tiles[k] % W;
    const y = (tiles[k] - x) / W;
    out[k] = Math.hypot(x - cx, y - cy);
    if (out[k] > far) far = out[k];
  }
  for (let k = 0; k < out.length; k++) out[k] = far > 0 ? (out[k] / far) * spread : 0;
  return out;
}

function centreOf(tiles: Int32Array, W: number): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const i of tiles) {
    const x = i % W;
    sx += x;
    sy += (i - x) / W;
  }
  return tiles.length ? [sx / tiles.length, sy / tiles.length] : [0, 0];
}

/** When each changed tile of a step starts to change (0–1), and how long it takes (`window`): the step's own
 *  shape, from its operations. A river carves downstream and a glacier advances along its path; a fault cracks
 *  along its line; a crater, an eruption, a fan and erosion spread from where they struck; a stroke follows its
 *  dabs; anything else grows from its middle. Presentation only: what each tile ends as is the step's. */
export function revealOrder(ops: readonly AppliedOp[], tiles: Int32Array, W: number): { start: Float32Array; window: number } {
  const force = ops.find((o) => o.op === "forceResult");
  if (force && force.op === "forceResult") {
    const { verb, where } = force.params;
    const path = where.path && where.path.length > 1 ? where.path : where.origin && where.end ? [where.origin, where.end] : null;
    if (path && (verb === "carve" || verb === "quake" || verb === "glaciate" || verb === "rift")) {
      const p = along(path);
      const start = new Float32Array(tiles.length);
      for (let k = 0; k < tiles.length; k++) {
        const x = tiles[k] % W;
        start[k] = placeOn(p, x, (tiles[k] - x) / W);
      }
      return { start, window: verb === "quake" ? 0.25 : 0.35 };
    }
    const [cx, cy] = where.origin ?? centreOf(tiles, W);
    // (a crater's bowl at once, its rim thrown out; a volcano swells as one; the rest spread out from where they began)
    if (verb === "craterize") return { start: radial(tiles, W, cx, cy, 1), window: 0.3 };
    if (verb === "erupt") return { start: radial(tiles, W, cx, cy, 1), window: 0.85 };
    return { start: radial(tiles, W, cx, cy, 1), window: 0.5 };
  }
  const brush = ops.find((o) => o.op === "brush");
  if (brush && brush.op === "brush" && brush.params.dabs.length >= 4 && brush.params.shape !== "area") {
    const d = brush.params.dabs;
    const pts: [number, number][] = [];
    // (quarter tiles; a long stroke's dabs thinned to a path of at most 256 points)
    const stride = Math.max(1, Math.floor(d.length / 2 / 256));
    for (let k = 0; k + 1 < d.length; k += 2 * stride) pts.push([(d[k] - 2) / 4, (d[k + 1] - 2) / 4]);
    if (pts.length > 1) {
      const p = along(pts);
      const start = new Float32Array(tiles.length);
      for (let k = 0; k < tiles.length; k++) {
        const x = tiles[k] % W;
        start[k] = placeOn(p, x, (tiles[k] - x) / W);
      }
      return { start, window: 0.4 };
    }
  }
  const [cx, cy] = centreOf(tiles, W);
  return { start: radial(tiles, W, cx, cy, 1), window: 0.5 };
}

/** Where each step happens, from its operations alone, before any is applied (the time-lapse plans its camera with
 *  them): a force's changed tiles and its path, a stroke's dabs and its size, a sculpt's, a paint's or a selection's
 *  runs, the blocks it changed, an object's place (those placed or moved earlier in the log, or standing on the
 *  generated map, found by id), a slope's, a fill's, the water it removed, a crop's rectangle. Null where the
 *  operations name no place. */
export function stepPlaces(groups: readonly (readonly AppliedOp[])[], W: number, H: number, start: readonly EntitySpec[]): (LapseBox | null)[] {
  const at = new Map<string, [number, number]>();
  for (const e of start) if (e.id) at.set(e.id, [e.x, e.y]);
  const clampBox = (b: LapseBox): LapseBox => ({ x0: Math.max(0, Math.floor(b.x0)), y0: Math.max(0, Math.floor(b.y0)), x1: Math.min(W - 1, Math.ceil(b.x1)), y1: Math.min(H - 1, Math.ceil(b.y1)) });
  return groups.map((ops) => {
    let box: LapseBox | null = null;
    const add = (x0: number, y0: number, x1 = x0, y1 = y0) => {
      box = box ? { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) } : { x0, y0, x1, y1 };
    };
    const tile = (i: number) => add(i % W, Math.floor(i / W));
    const runs = (r: readonly (readonly [number, number, number])[] | undefined) => r?.forEach(([y, x0, x1]) => add(x0, y, x1, y));
    for (const op of ops) {
      switch (op.op) {
        case "forceResult": {
          const p = op.params;
          if (p.tiles.length) {
            // (ascending: the first and last rows, and every tile's column)
            let x0 = W;
            let x1 = 0;
            for (const i of p.tiles) {
              const x = i % W;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
            }
            add(x0, Math.floor(p.tiles[0] / W), x1, Math.floor(p.tiles[p.tiles.length - 1] / W));
          }
          for (const pt of [p.where.origin, p.where.end, ...(p.where.path ?? [])]) if (pt) add(pt[0], pt[1]);
          p.runs?.tiles.forEach(tile);
          break;
        }
        case "brush": {
          const d = op.params.dabs;
          const r = op.params.size;
          for (let k = 0; k + 1 < d.length; k += 2) add((d[k] - 2) / 4 - r, (d[k + 1] - 2) / 4 - r, (d[k] - 2) / 4 + r, (d[k + 1] - 2) / 4 + r);
          break;
        }
        case "sculpt":
          runs(op.params.cells);
          break;
        case "paintObjects":
          runs(op.params.area);
          break;
        case "blocks": {
          const c = op.params.cells;
          if (c) for (let k = 0; k < c.length; k += 2) tile(c[k]);
          else for (const [x, y] of op.params.at) add(x - op.params.size, y - op.params.size, x + op.params.size, y + op.params.size);
          break;
        }
        case "placeEntity":
          add(op.params.x, op.params.y);
          at.set(op.params.id, [op.params.x, op.params.y]);
          break;
        case "moveEntity": {
          const was = at.get(op.params.id);
          if (was) add(was[0], was[1]);
          add(op.params.x, op.params.y);
          at.set(op.params.id, [op.params.x, op.params.y]);
          break;
        }
        case "setEntityProps":
        case "deleteEntities":
          for (const id of op.op === "deleteEntities" ? op.params.entities : [op.params.id]) {
            const was = at.get(id);
            if (was) add(was[0], was[1]);
          }
          break;
        case "pinSlope":
        case "removeSlope":
          add(op.params.x, op.params.y);
          break;
        case "fillHollow":
          add(op.params.at[0], op.params.at[1]);
          op.params.lake?.tiles?.forEach(tile);
          break;
        case "removeUnfedWater":
          op.params.tiles.forEach(tile);
          break;
        case "crop":
          add(op.params.x, op.params.y, op.params.x + op.params.w - 1, op.params.y + op.params.h - 1);
          break;
        default:
          break;
      }
    }
    return box ? clampBox(box) : null;
  });
}

const smooth = (v: number) => v * v * (3 - 2 * v);

/** A step's ground at `progress` (0–1) through it, written into `heights` (the map's levels as shown): each
 *  changed tile moves level by level from its old level to its new one in its own window. At 1, every tile is
 *  the step's. */
export function heightsAt(c: Pick<LapseChange, "tiles" | "before" | "after" | "start" | "window">, progress: number, heights: Uint8Array): boolean {
  const w = Math.max(1e-6, c.window);
  let changed = false;
  for (let k = 0; k < c.tiles.length; k++) {
    const t0 = c.start[k] * (1 - w);
    const f = progress >= 1 ? 1 : Math.max(0, Math.min(1, (progress - t0) / w));
    const a = c.before[k];
    const h = a + Math.round((c.after[k] - a) * smooth(f));
    const i = c.tiles[k];
    if (heights[i] !== h) {
      heights[i] = h;
      changed = true;
    }
  }
  return changed;
}

/** The objects, each its id (or its place when it has none) and how it stands. */
function objectKeys(list: readonly EntitySpec[]): Map<string, { x: number; y: number; key: string }> {
  const out = new Map<string, { x: number; y: number; key: string }>();
  list.forEach((e, k) => out.set(e.id || `#${k}`, { x: e.x, y: e.y, key: `${e.template} ${e.x} ${e.y} ${e.z} ${e.orientation} ${e.flipped} ${JSON.stringify(e.components)}` }));
  return out;
}

/** The tiles where two sets of columns differ. */
function columnTiles(a: ReadonlyMap<number, Uint8Array>, b: ReadonlyMap<number, Uint8Array>): number[] {
  if (a === b) return [];
  const out: number[] = [];
  for (const i of new Set([...a.keys(), ...b.keys()])) {
    const p = a.get(i);
    const q = b.get(i);
    if (!p || !q || p.length !== q.length || p.some((v, k) => v !== q[k])) out.push(i);
  }
  return out;
}

/** Live water as the editor's view takes it (worker/session.ts `waterOf`): the water from above per tile, and on a map
 *  with caves or overhangs every column's with its outflows. */
export interface LapseWater {
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
  stack?: StackSettle | null;
  out: ArrayLike<number> | null;
}

/** How many ticks the water may run on one step at most, whatever its frames ask for (four game days). */
const MOST_TICKS = 4 * 768;

/** The replay: the generated map, then each step of the history in turn. */
export class TimelapseReplay {
  /** The map itself, as the document opens. */
  readonly target: MapSession;
  /** The replay's map, as it stands after `at` steps. */
  readonly map: MapSession;
  readonly steps: readonly LapseStep[];
  private readonly groups: AppliedOp[][];
  private done = 0;
  private flowing: PreviewJob | null = null;
  private flowModel: WaterModel | null = null;

  private constructor(doc: MapDocument) {
    this.target = MapSession.open(doc);
    // (the current generation's land: a cropped map's replay starts from its crop, D340, the crop its first edit, which
    // the document keeps; its water the generation's own as saved, never settled again)
    this.map = MapSession.open(documentAt(doc, doc.prior ? 1 : 0), { deferWater: true });
    this.map.setWaterMode("defer");
    const shared = this.map.logOps.length;
    this.groups = logSteps(this.target.logOps.slice(shared));
    const places = stepPlaces(this.groups, this.map.size.x, this.map.size.y, this.map.built.entities);
    this.steps = this.groups.map((ops, index) => ({ index, label: labelOfStep(ops), ...kindOf(ops), place: places[index] }));
  }

  /** The replay of a document (`decodeProject`'s): the map itself opened, and the generated map built with its
   *  saved water. */
  static open(doc: MapDocument): TimelapseReplay {
    return new TimelapseReplay(doc);
  }

  get W(): number {
    return this.map.size.x;
  }
  get H(): number {
    return this.map.size.y;
  }

  /** Steps applied so far. */
  get at(): number {
    return this.done;
  }

  /** Apply the next step, as the checks' replica follows a log; what it changed, or null after the last. */
  next(): LapseChange | null {
    if (this.done >= this.groups.length) return null;
    const ops = this.groups[this.done];
    const step = this.steps[this.done];
    const s = this.map;
    const W = s.size.x;
    const before = s.built.heights.slice();
    const cols = s.columns;
    const objs = objectKeys(s.built.entities);
    // (the log as it stands, its own operations: the build keeps every one it already has, `relog`)
    s.followLog([...s.logOps, ...ops], this.target.nextSeq);
    this.done++;
    const after = s.built.heights;
    const changed: number[] = [];
    if (after.length === before.length) for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) changed.push(i);
    const tiles = Int32Array.from(changed);
    const colTiles = after.length === before.length ? columnTiles(cols, s.columns) : [];
    const objsAfter = objectKeys(s.built.entities);
    const objTiles: number[] = [];
    for (const [id, o] of objs) {
      const n = objsAfter.get(id);
      if (!n || n.key !== o.key) objTiles.push(o.y * W + o.x);
      if (n && n.key !== o.key) objTiles.push(n.y * W + n.x);
    }
    for (const [id, n] of objsAfter) if (!objs.has(id)) objTiles.push(n.y * W + n.x);
    let box: LapseChange["box"] = null;
    for (const i of [...changed, ...colTiles, ...objTiles]) {
      const x = i % W;
      const y = (i - x) / W;
      box = box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
    }
    const { start, window } = revealOrder(ops, tiles, W);
    return {
      ...step,
      tiles,
      before: Uint8Array.from(changed, (i) => before[i]),
      after: Uint8Array.from(changed, (i) => after[i]),
      start,
      window,
      switchAt: step.kind === "force" ? 0.6 : step.kind === "objects" ? 0.15 : 0.5,
      columns: colTiles.length > 0,
      objects: objTiles.length > 0,
      box,
    };
  }

  /** The water flowing on the map as it stands after the last step applied: `ticks` more of the live editor's
   *  water (worker/session.ts `runWater`, `runStack`), from the water in flight carried over to the new land, or the
   *  map's own; the water from above per tile as it then stands (`depth`, `contamination`) and, on a map with caves or
   *  overhangs, every column's (`stack`, its outflows in `flows`), as the editor's view of live water takes them
   *  (worker/session.ts `waterOf`). Null on a map with no water. Never changes the map. */
  flow(ticks: number): LapseWater | null {
    const s = this.map;
    const model = s.built.waterModel;
    const t = Math.max(0, Math.min(MOST_TICKS, Math.round(ticks)));
    if (model.stacked) {
      if (this.stackModel !== model) {
        const start = this.stackStart(model);
        this.dropFlow();
        this.stack = start ? new StackLive(model, start.from, start.flows) : null;
        this.stackModel = model;
      }
      const live = this.stack;
      if (!live) return null;
      if (t) live.advance(t);
      const f = live.frame();
      return { depth: f.depth, contamination: f.contamination, stack: { ...f.stack, flows: f.flows }, out: null };
    }
    if (this.flowModel !== model) {
      const from: WarmState | null = this.flowing?.state() ?? s.lastSettled();
      this.dropFlow();
      this.flowing = from ? new PreviewJob(from, model) : null;
      this.flowModel = model;
    }
    const job = this.flowing;
    if (!job) return null;
    if (t) job.advance(t);
    return { depth: job.sim.D, contamination: job.sim.C, out: job.sim.out };
  }

  private stack: StackLive | null = null;
  private stackModel: WaterModel | null = null;
  /** Where the stacked water last stood, and the model it ran on, once its run is replaced. */
  private stackRest: { model: WaterModel; stack: LiveStack } | null = null;

  /** Where the stacked live water starts after a step (worker/session.ts `stackStart`): the water in flight with its
   *  momentum, carried over to the new columns, a stored lake or the water a Fill or a removal took put on it; else
   *  the map's own carried-over water with its last settle's flows. */
  private stackStart(model: WaterModel): { from: LiveStack; flows: StackSettle | null } | null {
    const flowing = this.stack && this.stackModel ? { model: this.stackModel, stack: this.stack.state() } : this.stackRest;
    if (flowing && sameKeptWater(flowing.model, model)) return { from: flowing.stack, flows: null };
    if (flowing) {
      const g = stackGraph(model);
      const carried: LiveStack = { ...carryStack(flowing.stack, g), ...(flowing.stack.edges ? { edges: flowing.stack.edges } : {}) };
      if (model.retained?.length || model.drained?.length) keptOnStack(g, carried, model.retained, model.drained);
      return { from: carried, flows: null };
    }
    const from = this.map.built.settle.stack;
    return from ? { from, flows: this.map.lastSettled()?.water.stack ?? null } : null;
  }

  private dropFlow(): void {
    if (this.stack && this.stackModel) this.stackRest = { model: this.stackModel, stack: this.stack.state() };
    this.stack?.close();
    this.stack = null;
    this.stackModel = null;
    this.flowing?.dispose();
    this.flowing = null;
    this.flowModel = null;
  }

  /** After the last step: whether the replay is the map itself, byte for byte (`MapSession.replayMatchesStored`'s
   *  comparison: land, water, soil, objects), the water settled canonically first (the map's own settle: seconds on a
   *  large map); with `water: false`, the land, blocks and objects alone, at once (the recorder's check: its last
   *  frame shows the map's own water). */
  finish(opts: { water?: boolean } = {}): boolean {
    this.dropFlow();
    this.stackRest = null;
    const water = opts.water ?? true;
    if (water) {
      this.map.settleCanonical();
      this.target.settleCanonical();
    }
    return this.done === this.groups.length && sameMap(this.map.built, this.target.built, { water });
  }
}
