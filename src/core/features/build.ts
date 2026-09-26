// The one build pipeline (PLAN §19.8): features in, terrain and entities out. Generation plans the
// features first (gen/riverValley.ts) and then runs this; the editor runs the same code after every
// edit. It is a pure function of its input: rebuilding a saved document reproduces the map exactly
// (PLAN §19.7).
//
// Steps: 1 base terrain (the fill, or an imported map's surface), 2 landforms, 3 set-piece terrain,
// 4 rivers and lakes, 5 the start bench, 6 sculpt edits, 7 integrity pass, 8 slopes (derived, then
// pinned and removed), 9 water sources and map objects, then the first pass of entity edits, 10 the canonical water
// settle with soil moisture and soil contamination, 11 resources placed on the simulated moisture,
// 12 the start, 13 the second pass of entity edits.
//
// `rebuild` is the incremental path over dirty regions (PLAN §19.7): terrain is rasterized again
// only inside the rectangles the changed features, sculpts and locks can touch (widened for the
// rasterizers that read further, and by one tile for the integrity pass); slopes, the water settle,
// moisture and each resource feature are reused when their inputs are unchanged. The property
// tests check that it equals a full build.

import { coordinatesForMinCorner, footprintTiles, ORIENTATIONS, rotate, slopeHighSide } from "../format/footprints";
import { blockObject, startingLocation, waterSource, slope, type EntitySpec } from "../format/entities";
import type { MapSpec } from "../spec/mapspec";
import { soilContamination } from "../sim/contamination";
import { moistureBarrier, waterModel, type MapObject } from "../sim/model";
import { moisture } from "../sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../sim/prefill";
import { previewSettle, staleWater } from "../sim/preview";
import { sameRetained, type RetainedWater, type WaterModel } from "../sim/water";
import { isForce } from "../forces/op";
import { DERIVED_SLOPES, entityId } from "./ids";
import { placeSlopes, SLOPE_RULES, START_CLEAR_RADIUS, type PlacedSlope, type SlopeRules } from "./slopes";
import { BUILDERS, orientationForHigh, type SetPieceBlock, type SetPieceSource } from "./setpieces";
import { applyEntityEdits, applySlopeEdits, entityTiles, orphansOf, type EntityEdit, type Orphan, type SlopeEdit } from "./edits";
import {
  applySculpt,
  edgeStep,
  integrityAt,
  lakeSpringTile,
  mouthTiles,
  rasterizeBench,
  rasterizeLake,
  rasterizeLandform,
  rasterizeRiver,
  sculptBounds,
  sculptReadsNeighbours,
  springTiles,
  terrainFootprint,
  type SculptEdit,
} from "./raster/terrain";
import { rasterizeResource, resourceOrder, type Placed } from "./raster/resources";
import { objectTiles, rasterizeObjects } from "./objects";
import { markBrushTiles, type BrushParams } from "./raster/brush";
import type { DistrictPlan } from "./setpieces/secondDistrict";
import { BuildTarget, clipRect, fullRegion, type FieldCache, type Rect, type TileRegion } from "./target";
import type { Feature, MapObjectFeature, SetPieceFeature, StartFeature } from "./schema";

export { BuildTarget } from "./target";
export { assignRuinHeights } from "./raster/resources";
export { MAX_TERRAIN } from "./raster/terrain";

export { START_CLEAR_RADIUS }; // PLAN §7.7: nothing within Chebyshev 3 of the start centre (features/slopes.ts)

export interface PlacedSource {
  x: number;
  y: number;
  z: number;
  strength: number;
  owner: string;
  template: "WaterSource" | "BadwaterSource";
}

/** An imported map (or a generation's stored base, opened by a newer generator) under the
 *  features: its surface, its caves and overhangs, and its objects. */
export interface BaseLayer {
  heights: Uint8Array;
  /** Columns that are not a plain run from z = 0: kept exactly, left alone by every tool. */
  columns: ReadonlyMap<number, Uint8Array>;
  entities: readonly EntitySpec[];
  /** Features the base already contains (a stored generation): not rasterized again. */
  frozen?: ReadonlySet<string>;
  /** The water the file stores on each tile's top (an imported map's own water): what the editor's
   *  water warm-starts from after the first edit (marked `preview`, so a canonical build never
   *  takes it for a settle). */
  water?: CanonicalWater;
}

/** What a regeneration kept of the previous generation inside locked regions (EDITOR_PLAN §3). */
export interface LockedLayer {
  mask: Uint8Array;
  /** The kept surface, valid where `mask` is set. */
  heights: Uint8Array;
  /** The kept generated objects (no slopes, no start: those are derived and planned again). */
  entities: readonly EntitySpec[];
}

export interface BuildInput {
  W: number;
  H: number;
  seed: number;
  features: readonly Feature[];
  base?: BaseLayer | null;
  sculpts?: readonly SculptEdit[];
  slopeEdits?: readonly SlopeEdit[];
  entityEdits?: readonly EntityEdit[];
  locked?: LockedLayer | null;
}

export interface BuildResult {
  W: number;
  H: number;
  seed: number;
  heights: Uint8Array;
  /** Settled water depth per tile: the canonical settle (PLAN §19.7), written into the file. */
  water: Float64Array;
  /** Contamination of that water, 0–1. */
  contamination: Float64Array;
  /** Soil moisture at steady state (> 0 = moist: living plants survive). */
  moisture: Float64Array;
  /** Soil contamination at steady state (> 0 kills plants). */
  soilContamination: Float64Array;
  /** The water model the settle ran on, and the settle itself (ticks, settled, saturation). */
  waterModel: WaterModel;
  settle: CanonicalWater;
  /** An imported map whose terrain and water objects are unchanged keeps the file's water: no
   *  settle ran, and the arrays above are empty unless resources needed them. */
  waterFromFile: boolean;
  /** Tiles taken by objects on the ground (start zone, slopes, sources, resources). */
  occupied: Uint8Array;
  channel: Uint8Array;
  entities: EntitySpec[];
  slopes: PlacedSlope[];
  sources: PlacedSource[];
  start?: { x: number; y: number; z: number; feature: string };
  notes: string[];
  /** Operations whose targets did not exist when this build applied them. */
  orphans: Orphan[];
  /** What changed since the build `rebuild` started from (null for a full build). */
  dirty: DirtyInfo | null;
  /** Everything a later `rebuild` reuses. */
  cache: BuildCache;
}

export interface DirtyInfo {
  /** Bounding rectangle of the tiles whose surface changed (null: none). */
  terrain: Rect | null;
  /** The region the terrain steps ran on. */
  region: Rect | null;
  water: boolean;
  entities: boolean;
  /** Bounding rectangle of the objects placed, moved or removed (null: none): an object placed by
   *  hand changes no ground, and its checks still belong to the edit. */
  objects: Rect | null;
}

export interface BuildOptions {
  /** Stop before resources (the planner uses the terrain, slopes and water to plan them). */
  stopBeforeResources?: boolean;
  /** Stop before the water settle (the planner looks for flat ground on the built terrain). */
  stopBeforeWater?: boolean;
  /** Reuse the canonical settle of a previous build of exactly the same terrain and sources. */
  settleCache?: SettleCache;
  /** "preview": a rebuild whose water changed warm-starts from the previous build's water
   *  (sim/preview.ts, the editor's preview) instead of running the canonical settle. The result is
   *  marked `settle.preview`; `rebuild` without it replaces preview water with the canonical settle
   *  (EDITOR_PLAN §6, PLAN §19.7). "defer" (live editing): no settle at all; the last settled water
   *  is carried over to the new ground (`staleWater`, marked `stale` and `preview`) and the editor
   *  settles it in the background, so an edit never waits on the water. */
  water?: "canonical" | "preview" | "defer";
}

/** The last canonical settle and the model it ran on. The settle depends only on the water model,
 *  so the planner's base build and the full build of the same attempt share it: the result is
 *  identical to settling again, only faster. */
export class SettleCache {
  private last: { model: WaterModel; emitters: string; water: CanonicalWater } | null = null;

  get(m: WaterModel): CanonicalWater | null {
    const l = this.last;
    return l && sameModel(l.model, l.emitters, m) ? l.water : null;
  }

  set(m: WaterModel, water: CanonicalWater): void {
    this.last = { model: { ...m, floor: m.floor.slice(), dam: m.dam ? m.dam.slice() : null }, emitters: JSON.stringify(m.emitters), water };
  }
}

function sameModel(a: WaterModel, aEmitters: string, m: WaterModel): boolean {
  if (a.W !== m.W || a.H !== m.H || aEmitters !== JSON.stringify(m.emitters)) return false;
  for (let i = 0; i < m.floor.length; i++) if (a.floor[i] !== m.floor[i]) return false;
  if (!!a.dam !== !!m.dam) return false;
  if (a.dam && m.dam) for (let i = 0; i < m.dam.length; i++) if (a.dam[i] !== m.dam[i]) return false;
  return sameRetained(a.retained, m.retained);
}

/** A built entity as a map object (for the water model and validation). */
export function toMapObject(e: EntitySpec): MapObject {
  if (e.raw) {
    const comps = (e.raw.Components ?? {}) as MapObject["components"];
    return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: comps };
  }
  return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } };
}

// ----------------------------------------------------------------------------------------- caches

interface TerrainCache {
  /** Heights after step 2 (the dam site reads them). */
  pre2: Uint8Array;
  /** Heights after step 6, before the integrity pass. */
  pre7: Uint8Array;
  heights: Uint8Array;
  protect: Uint8Array;
  channel: Uint8Array;
  notes: string[];
}

interface ResourceEntry {
  key: string;
  placed: Placed;
}

export interface BuildCache {
  /** JSON of every feature, and of the terrain features themselves (for their old footprints). */
  keys: Map<string, string>;
  terrainFeatures: Feature[];
  sculpts: string[];
  sculptEdits: SculptEdit[];
  base: BaseLayer | null;
  locked: LockedLayer | null;
  terrain: TerrainCache;
  fields: FieldCache;
  /** Tiles reserved before slopes, and the start and slope-radius the slopes were placed with. */
  reserved: Uint8Array;
  slopesKey: string;
  slopes: PlacedSlope[];
  settle: { model: WaterModel; emitters: string; water: CanonicalWater } | null;
  barrierKey: string;
  moisture: Float64Array | null;
  soil: Float64Array | null;
  /** Occupancy when the resources were placed, and each resource feature's output. */
  occupiedBeforeResources: Uint8Array | null;
  resources: Map<string, ResourceEntry>;
  resourceOrder: string[];
}

const isTerrainKind = (f: Feature) => f.kind === "landform" || f.kind === "setPiece" || f.kind === "lake" || f.kind === "river" || f.kind === "start";

// ------------------------------------------------------------------------------------ entry points

export function build(spec: MapSpec, features: readonly Feature[], opts: BuildOptions = {}): BuildResult {
  return buildMap({ W: spec.size.x, H: spec.size.y, seed: spec.seed, features }, opts);
}

/** A full build. */
export function buildMap(input: BuildInput, opts: BuildOptions = {}): BuildResult {
  return run(input, null, opts);
}

/** Build steps 1–7 only: the terrain of a full build, with its protected tiles and river channel
 *  (the planners measure and place on it before anything stands there). */
export function buildTerrain(input: BuildInput): { heights: Uint8Array; channel: Uint8Array; protect: Uint8Array } {
  const { terrain } = terrainStage(input, null, new Map());
  return { heights: terrain.heights, channel: terrain.channel, protect: terrain.protect };
}

/** The terrain `input` would build, worked out from `prev` round what differs (live editing: a
 *  shape tool shows its real result while it is dragged). Steps 1–7 only, the same code as a
 *  build: the heights are the ones a rebuild gives. `rect` bounds the tiles that can differ from
 *  `prev` (null: none). The document's caches are left as they are. */
export function previewTerrain(prev: BuildResult, input: BuildInput): { heights: Uint8Array; rect: Rect | null } {
  if (prev.W !== input.W || prev.H !== input.H) throw new Error("a preview keeps the map's size");
  // fields made for the shape being dragged stay out of the document's cache
  const fields: FieldCache = new Map(prev.cache.fields);
  const { terrain, region } = terrainStage(input, prev.cache, fields);
  if (!region) return { heights: prev.heights, rect: null };
  const { W, H } = input;
  return { heights: terrain.heights, rect: { x0: Math.max(0, region.x0 - 1), y0: Math.max(0, region.y0 - 1), x1: Math.min(W - 1, region.x1 + 1), y1: Math.min(H - 1, region.y1 + 1) } };
}

/** A whole build of `input` from `prev` that leaves `prev`'s caches as they are (live editing: a
 *  water tool's draft, whose water flows while it is drawn). Its water is `prev`'s, carried to the
 *  new ground ("defer"); its water model has the draft's sources. */
export function previewBuild(prev: BuildResult, input: BuildInput): BuildResult {
  const own: BuildResult = { ...prev, cache: { ...prev.cache, fields: new Map(prev.cache.fields) } };
  return rebuild(own, input, { water: "defer" });
}

/** An incremental build from `prev`, equal to a full build of `input` (PLAN §19.7); with
 *  `water: "preview"`, equal to it except for the water and what grows on it (see BuildOptions). */
export function rebuild(prev: BuildResult, input: BuildInput, opts: BuildOptions = {}): BuildResult {
  if (prev.W !== input.W || prev.H !== input.H || prev.seed !== input.seed) return run(input, null, { ...opts, water: "canonical" });
  return run(input, prev, opts);
}

// ------------------------------------------------------------------------------------ dirty region

class RegionBuilder {
  private mask: Uint8Array;
  private bounds: Rect | null = null;
  all = false;
  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.mask = new Uint8Array(W * H);
  }
  add(r: Rect | "all" | null): boolean {
    if (!r || this.all) return false;
    if (r === "all") {
      this.all = true;
      return true;
    }
    let grew = false;
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        const i = y * this.W + x;
        if (!this.mask[i]) {
          this.mask[i] = 1;
          grew = true;
        }
      }
    if (grew) {
      const b = this.bounds;
      this.bounds = b ? { x0: Math.min(b.x0, r.x0), y0: Math.min(b.y0, r.y0), x1: Math.max(b.x1, r.x1), y1: Math.max(b.y1, r.y1) } : { ...r };
    }
    return grew;
  }
  intersects(r: Rect | null): boolean {
    if (!r) return false;
    if (this.all) return true;
    if (!this.bounds) return false;
    for (let y = Math.max(r.y0, this.bounds.y0); y <= Math.min(r.y1, this.bounds.y1); y++)
      for (let x = Math.max(r.x0, this.bounds.x0); x <= Math.min(r.x1, this.bounds.x1); x++) if (this.mask[y * this.W + x]) return true;
    return false;
  }
  region(): TileRegion | null {
    if (this.all) return fullRegion(this.W, this.H);
    if (!this.bounds) return null;
    return { ...this.bounds, mask: this.mask };
  }
}

function featureKey(f: Feature): string {
  return JSON.stringify(f);
}

/** A sculpt edit's or stroke's params as a key (a stroke's dabs are long: each is written once). */
const paramKeys = new WeakMap<object, string>();
function paramsKey(p: object): string {
  let k = paramKeys.get(p);
  if (k === undefined) {
    k = JSON.stringify(p);
    paramKeys.set(p, k);
  }
  return k;
}

/** The tiles whose terrain may differ from the previous build's. */
function dirtyTerrain(prev: BuildCache, input: BuildInput, target: BuildTarget): TileRegion | null {
  const { W, H } = input;
  const rb = new RegionBuilder(W, H);
  if (prev.base !== (input.base ?? null)) return fullRegion(W, H);
  const oldById = new Map(prev.terrainFeatures.map((f) => [f.id, f]));
  const oldTarget = { W, H, river: (id: string) => { const f = oldById.get(id); return f && f.kind === "river" ? f : undefined; } };
  const frozen = input.base?.frozen;
  const current = input.features.filter((f) => isTerrainKind(f) && !frozen?.has(f.id));
  const footprintOf = (f: Feature, t: Pick<BuildTarget, "W" | "H" | "river">): Rect | "all" | null =>
    f.kind === "setPiece" ? (BUILDERS[f.params.kind]?.footprint(f, t as BuildTarget) ?? "all") : terrainFootprint(f, t);
  const changed = (f: Feature) => {
    rb.add(footprintOf(f, target));
    const old = oldById.get(f.id);
    if (old) rb.add(footprintOf(old, oldTarget as unknown as BuildTarget));
    // everything that builds on a changed river is rebuilt with it
    if (f.kind === "river") {
      for (const g of current) if (g.id !== f.id && dependsOn(g, f.id)) rb.add(footprintOf(g, target));
      for (const g of prev.terrainFeatures) if (g.id !== f.id && dependsOn(g, f.id)) rb.add(footprintOf(g, oldTarget as unknown as BuildTarget));
    }
  };
  const seen = new Set<string>();
  const oldOrder = prev.terrainFeatures.map((f) => f.id);
  const newIds = new Set(current.map((f) => f.id));
  const keptOld = oldOrder.filter((id) => newIds.has(id));
  const keptNew = current.map((f) => f.id).filter((id) => oldById.has(id));
  const reordered = keptOld.join() !== keptNew.join();
  for (const f of current) {
    seen.add(f.id);
    const old = oldById.get(f.id);
    if (!old || reordered || prev.keys.get(f.id) !== featureKey(f)) changed(f);
  }
  for (const old of prev.terrainFeatures) if (!seen.has(old.id)) changed(old);
  // sculpts: from the first difference on, old and new
  const sculpts = input.sculpts ?? [];
  let k = 0;
  while (k < sculpts.length && k < prev.sculpts.length && prev.sculpts[k] === paramsKey(sculpts[k].params)) k++;
  for (let j = k; j < sculpts.length; j++) {
    const r = sculptBounds(sculpts[j], W);
    if (r) rb.add(clipRect(r, W, H));
  }
  for (let j = k; j < prev.sculptEdits.length; j++) {
    const r = sculptBounds(prev.sculptEdits[j], W);
    if (r) rb.add(clipRect(r, W, H));
  }
  if (prev.locked !== (input.locked ?? null)) return fullRegion(W, H);
  // rasterizers that read beyond the tiles they write rebuild whole when the region touches them
  for (let grew = true; grew && !rb.all; ) {
    grew = false;
    for (const f of current) {
      if (f.kind !== "setPiece") continue;
      const fp = footprintOf(f, target);
      if (fp !== "all" && fp && rb.intersects(fp)) grew = rb.add(fp) || grew;
    }
    for (const s of sculpts) {
      if (!sculptReadsNeighbours(s)) continue;
      const sb = sculptBounds(s, W);
      const b = sb && clipRect(sb, W, H);
      if (b && rb.intersects(b)) grew = rb.add(b) || grew;
    }
  }
  return rb.region();
}

function dependsOn(f: Feature, riverId: string): boolean {
  if (f.kind === "landform") return f.params.along?.river === riverId;
  if (f.kind === "lake") return f.params.river === riverId;
  if (f.kind === "setPiece") return f.params.plan.river === riverId;
  return false;
}

// -------------------------------------------------------------------------------------- terrain

function terrainStage(input: BuildInput, prev: BuildCache | null, fields: FieldCache): { terrain: TerrainCache; region: TileRegion | null } {
  const { W, H, seed } = input;
  const N = W * H;
  const base = input.base ?? null;
  const frozen = base?.frozen;
  const live = (f: Feature) => !frozen?.has(f.id);
  const probe = new BuildTarget({ W, H, seed, features: input.features, heights: new Uint8Array(0), protectedMask: new Uint8Array(0), channel: new Uint8Array(0), region: fullRegion(W, H), fields });
  const region = prev ? dirtyTerrain(prev, input, probe) : fullRegion(W, H);
  if (prev && !region) return { terrain: prev.terrain, region: null };
  const reg = region!;
  const heights = prev ? prev.terrain.pre2.slice() : new Uint8Array(N);
  const protect = prev ? prev.terrain.protect.slice() : new Uint8Array(N);
  const channel = prev ? prev.terrain.channel.slice() : new Uint8Array(N);
  const locked = input.locked ?? null;
  const t = new BuildTarget({ W, H, seed, features: input.features, heights, protectedMask: protect, channel, region: reg, locked: locked?.mask, fields });

  // 1. base terrain: generated layouts cover every tile with their landforms, and the fill is a
  //    floor; an imported map starts from its own surface. Locked tiles keep the kept surface.
  t.forEach((i) => {
    heights[i] = locked && locked.mask[i] ? locked.heights[i] : base ? base.heights[i] : 2;
    protect[i] = 0;
    channel[i] = 0;
  });
  // 2. landforms, in document order
  for (const f of input.features) if (f.kind === "landform" && live(f)) rasterizeLandform(f, t);
  const pre2 = heights.slice();
  // 3. set-piece terrain
  for (const f of input.features) {
    if (f.kind !== "setPiece" || !live(f)) continue;
    const b = BUILDERS[f.params.kind];
    if (b) b.rasterize(f, t);
    else t.note(`set piece ${f.params.kind} (${f.id}) is not built by this version`);
  }
  // 4. rivers and lakes: lakes set their basin floor, then river beds carve (the river wins)
  for (const f of input.features) if (f.kind === "lake" && live(f)) rasterizeLake(f, t);
  for (const f of input.features) if (f.kind === "river" && live(f)) rasterizeRiver(f, t);
  // 5. the start bench (and, later, object pads)
  for (const f of input.features) if (f.kind === "start" && live(f)) rasterizeBench(f, t);
  // 6. sculpt edits and brush strokes, in order (the brushes leave an import's caves alone)
  const caves = base && base.columns.size ? (i: number) => base.columns.has(i) : undefined;
  for (const s of input.sculpts ?? []) applySculpt(s, t, caves);
  //    an imported map's caves and overhangs are left exactly as they are
  if (base) t.forEach((i) => {
    if (base.columns.has(i)) {
      heights[i] = base.heights[i];
      protect[i] = 1;
    }
  });
  let pre7: Uint8Array;
  if (prev) {
    pre7 = prev.terrain.pre7.slice();
    t.forEach((i) => (pre7[i] = heights[i]));
  } else pre7 = heights;

  // 7. integrity pass: clip to the editor limit and remove single-tile pits and spikes off channels.
  //    On an imported map only the tiles an edit changed take part.
  //    (tiles a regeneration kept under a lock are left as they were kept)
  const final = prev ? prev.terrain.heights.slice() : new Uint8Array(N);
  const lockMask = locked?.mask;
  const candidate = base ? (i: number) => pre7[i] !== base.heights[i] : lockMask ? (i: number) => !lockMask[i] : () => true;
  const r = { x0: Math.max(0, reg.x0 - 1), y0: Math.max(0, reg.y0 - 1), x1: Math.min(W - 1, reg.x1 + 1), y1: Math.min(H - 1, reg.y1 + 1) };
  integrityAt(pre7, final, W, H, protect, channel, candidate, r.x0, r.y0, r.x1, r.y1);
  return { terrain: { pre2, pre7, heights: final, protect, channel, notes: t.notes }, region: reg };
}

// --------------------------------------------------------------------------------------- pipeline

function run(input: BuildInput, prevResult: BuildResult | null, opts: BuildOptions): BuildResult {
  const prev = prevResult?.cache ?? null;
  const { W, H, seed } = input;
  const N = W * H;
  const base = input.base ?? null;
  const frozen = base?.frozen;
  const live = (f: Feature) => !frozen?.has(f.id);
  const features = input.features;
  const fields: FieldCache = prev ? prev.fields : new Map();

  const { terrain, region } = terrainStage(input, prev, fields);
  const heights = terrain.heights;
  const notes = terrain.notes.slice();
  const target = new BuildTarget({ W, H, seed, features, heights, protectedMask: terrain.protect, channel: terrain.channel, region: fullRegion(W, H), fields });

  // reserve the start zone and the river mouths before slopes are placed
  const reserved = new Uint8Array(N);
  const starts = features.filter((f): f is StartFeature => f.kind === "start" && live(f));
  const start = starts[0];
  let startInfo: BuildResult["start"];
  if (start) {
    const [cx, cy] = start.params.position;
    startInfo = { x: cx, y: cy, z: heights[cy * W + cx], feature: start.id };
    for (let y = cy - START_CLEAR_RADIUS; y <= cy + START_CLEAR_RADIUS; y++)
      for (let x = cx - START_CLEAR_RADIUS; x <= cx + START_CLEAR_RADIUS; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) reserved[y * W + x] = 1;
    // the tiles in front of the door stay free: the entrance and the 3×3 beyond it
    const [dx, dy] = rotate(start.params.orientation, 0, -1);
    const ax = cx + 3 * dx;
    const ay = cy + 3 * dy;
    for (let y = ay - 1; y <= ay + 1; y++)
      for (let x = ax - 1; x <= ax + 1; x++) if (x >= 0 && x < W && y >= 0 && y < H) reserved[y * W + x] = 1;
  }
  const mouths = new Map<string, number[]>();
  for (const f of features) {
    if (f.kind !== "river" || !live(f)) continue;
    const tiles = mouthTiles(f, target);
    mouths.set(f.id, tiles);
    for (const i of tiles) reserved[i] = 1;
    // a badwater river's sources reach two tiles inland
    if (f.params.badwater && "edge" in f.params.entry)
      for (const [x, y] of badwaterMouth(tiles, f.params.entry.edge, W, H, heights).groups) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) reserved[(y + dy) * W + x + dx] = 1;
  }
  //    springs: a river that starts inland, a lake fed by a spring
  const springs = new Map<string, number[]>();
  for (const f of features) {
    if (!live(f)) continue;
    let tiles: number[] = [];
    if (f.kind === "river") tiles = springTiles(f, target);
    else if (f.kind === "lake") {
      const i = lakeSpringTile(f, W, H);
      if (i !== null) tiles = [i];
    }
    if (!tiles.length) continue;
    springs.set(f.id, tiles);
    for (const i of tiles) reserved[i] = 1;
  }
  //    map objects (mine sites, relics, thorn belts, weirs, plugs, ...) take their tiles now, so the
  //    derived slopes go round them (PLAN §20, D69)
  const objectFeatures = features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && live(f));
  for (const f of objectFeatures) for (const [x, y] of objectTiles(f, W, H)) if (x >= 0 && x < W && y >= 0 && y < H) reserved[y * W + x] = 1;
  //    and the objects set pieces place themselves (a spillway's plug)
  const pieceBlocks: { feature: SetPieceFeature; block: SetPieceBlock }[] = [];
  for (const f of features) {
    if (f.kind !== "setPiece" || !live(f)) continue;
    for (const block of BUILDERS[f.params.kind]?.blocks?.(f) ?? []) {
      if (block.x < 0 || block.x >= W || block.y < 0 || block.y >= H) continue;
      pieceBlocks.push({ feature: f, block });
      reserved[block.y * W + block.x] = 1;
    }
  }
  const pieceSources: { feature: SetPieceFeature; src: SetPieceSource }[] = [];
  for (const f of features) {
    if (f.kind !== "setPiece" || !live(f)) continue;
    for (const src of BUILDERS[f.params.kind]?.sources?.(f) ?? []) {
      pieceSources.push({ feature: f, src });
      for (const [dx, dy] of src.tiles) {
        const x = src.x + dx;
        const y = src.y + dy;
        if (x >= 0 && x < W && y >= 0 && y < H) reserved[y * W + x] = 1;
      }
    }
  }

  // 8. slopes: the set pieces' own (stair notches, chains), then the derived ones (PLAN §7.5), then
  //    the player's pinned and removed slopes. An imported map keeps its own slopes; only the
  //    ground its edits changed gets new ones.
  const orphans: Orphan[] = [];
  let entities: EntitySpec[] = [];
  const links: [number, number][] = [];
  for (const f of features) {
    if (f.kind !== "setPiece" || !live(f)) continue;
    for (const s of BUILDERS[f.params.kind]?.slopes?.(f, heights, W, H, features) ?? []) {
      const i = s.y * W + s.x;
      const hi = (s.y + s.high[1]) * W + (s.x + s.high[0]);
      if (reserved[i]) continue;
      reserved[i] = 1;
      links.push([i, hi]);
      entities.push(slope({ id: entityId(f.id, "Slope", i), owner: f.id, x: s.x, y: s.y, z: heights[i], orientation: orientationForHigh(s.high[0], s.high[1]) }));
    }
  }
  // an imported map's objects keep their tiles (derived slopes go round them)
  if (base) for (const e of base.entities) for (const [x, y] of entityTiles(e)) if (x >= 0 && x < W && y >= 0 && y < H) reserved[y * W + x] = 1;
  const slopeStart = startInfo ?? (base ? importedStart(base, W, H) : undefined);
  let rules: SlopeRules | null = null;
  let slopesKey = "";
  if (slopeStart && !base) {
    const targets = landformTargets(features.filter(live), target);
    // the ground a walkable smooth stroke went over, and a ramped flatten's with the ground round
    // it (its rim steps down to that ground, D204): the natural slopes join their steps too
    for (const sc of input.sculpts ?? []) {
      const p = sc.params as BrushParams;
      if (!("dabs" in p)) continue;
      const walk = p.tool === "smooth" && p.walkable;
      const ramp = p.tool === "flatten" && p.edges === "ramped";
      if (!walk && !ramp) continue;
      targets.mask ??= new Uint8Array(N);
      if (walk) markBrushTiles(p, W, H, targets.mask);
      else {
        const own = new Uint8Array(N);
        markBrushTiles(p, W, H, own);
        for (let i = 0; i < N; i++) {
          if (!own[i]) continue;
          const x = i % W;
          const y = (i - x) / W;
          for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) targets.mask[yy * W + xx] = 1;
        }
      }
      targets.key += `|${walk ? "walk" : "ramp"}:${paramsKey(p)}`;
    }
    rules = { ...SLOPE_RULES, targets: targets.mask, links, water: terrain.channel };
    slopesKey = `${slopeStart.x},${slopeStart.y}|${targets.key}|${JSON.stringify(links)}`;
  } else if (slopeStart && base) {
    // an edited import: join the changed ground to the start's network (the file's own slopes and
    // the set pieces' stairs), nothing else
    let changed: Uint8Array | null = null;
    for (let i = 0; i < N; i++) {
      if (heights[i] !== base.heights[i] && !base.columns.has(i)) (changed ??= new Uint8Array(N))[i] = 1;
    }
    if (changed) {
      const own = fileSlopeLinks(base, heights, W, H);
      rules = { core: 0, bigRegion: 0, targets: changed, links: [...own, ...links] };
      slopesKey = `import:${slopeStart.x},${slopeStart.y}|${JSON.stringify(links)}`;
    }
  }
  let slopes: PlacedSlope[] = [];
  if (rules) {
    const reuse = prev && prev.slopesKey === slopesKey && sameBytes(prev.terrain.heights, heights) && sameBytes(prev.terrain.channel, terrain.channel) && sameBytes(prev.reserved, reserved);
    slopes = reuse ? prev.slopes : placeSlopes(heights, W, H, slopeStart!, reserved, rules);
  }
  for (const s of slopes) {
    const i = s.y * W + s.x;
    entities.push(slope({ id: entityId(DERIVED_SLOPES, "Slope", i), owner: DERIVED_SLOPES, x: s.x, y: s.y, z: s.z, orientation: s.orientation }));
  }

  // 9. water sources: a river entering on the map edge gets a source on every channel tile of its
  //    mouth (a sealed mouth, PLAN §7.6); the padding next to any other border tile drains.
  const sources: PlacedSource[] = [];
  for (const f of features) {
    if (f.kind !== "river" || !live(f)) continue;
    const tiles = mouths.get(f.id)!;
    if (!tiles.length) continue;
    // a badwater river: BadwaterSources (3×3) along its mouth, and a source at strength 0 on any
    // mouth tile left over, so the mouth stays sealed (EDITOR_PLAN §4's badwater toggle)
    const bad = f.params.badwater && "edge" in f.params.entry ? badwaterMouth(tiles, f.params.entry.edge, W, H, heights) : null;
    if (bad && bad.groups.length) {
      const each = Math.min(72, Math.round((f.params.flow / bad.groups.length) * 1000) / 1000);
      for (const [x, y] of bad.groups) {
        const i = y * W + x;
        sources.push({ x, y, z: heights[i], strength: each, owner: f.id, template: "BadwaterSource" });
        entities.push(waterSource({ id: entityId(f.id, "BadwaterSource", i), owner: f.id, x, y, z: heights[i], strength: each, bad: true }));
      }
      for (const i of bad.seals) {
        const x = i % W;
        const y = (i - x) / W;
        sources.push({ x, y, z: heights[i], strength: 0, owner: f.id, template: "WaterSource" });
        entities.push(waterSource({ id: entityId(f.id, "WaterSource", i), owner: f.id, x, y, z: heights[i], strength: 0 }));
      }
      continue;
    }
    const each = Math.min(8, Math.round((f.params.flow / tiles.length) * 1000) / 1000);
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      sources.push({ x, y, z: heights[i], strength: each, owner: f.id, template: "WaterSource" });
      entities.push(waterSource({ id: entityId(f.id, "WaterSource", i), owner: f.id, x, y, z: heights[i], strength: each }));
    }
  }
  //    springs: a river's first channel tiles, a lake's middle
  for (const f of features) {
    const tiles = springs.get(f.id);
    if (!tiles || (f.kind !== "river" && f.kind !== "lake")) continue;
    const flow = f.kind === "river" ? f.params.flow : "spring" in f.params.inflow ? f.params.inflow.spring : 0;
    const each = Math.min(8, Math.round((flow / tiles.length) * 1000) / 1000);
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      sources.push({ x, y, z: heights[i], strength: each, owner: f.id, template: "WaterSource" });
      entities.push(waterSource({ id: entityId(f.id, "WaterSource", i), owner: f.id, x, y, z: heights[i], strength: each }));
    }
  }
  //    set pieces add theirs (a waterfall's springs, badwater)
  for (const { feature, src } of pieceSources) {
    if (src.x < 0 || src.x >= W || src.y < 0 || src.y >= H) continue;
    const i = src.y * W + src.x;
    const bad = src.template === "BadwaterSource";
    sources.push({ x: src.x, y: src.y, z: heights[i], strength: src.strength, owner: feature.id, template: src.template });
    entities.push(waterSource({ id: entityId(feature.id, src.template, i), owner: feature.id, x: src.x, y: src.y, z: heights[i], strength: src.strength, bad }));
  }
  //    map objects: they hold water (a weir, a plug) and stop moisture (thorns), so they stand
  //    before the water settles
  for (const f of objectFeatures) entities.push(...rasterizeObjects(f, W, H, heights, input.locked?.mask ?? null));
  for (const { feature, block: b } of pieceBlocks) {
    const i = b.y * W + b.x;
    entities.push(blockObject({ id: entityId(feature.id, b.template, i), owner: feature.id, x: b.x, y: b.y, z: heights[i], template: b.template, orientation: ORIENTATIONS[b.turn & 3], flipped: b.flipped }));
  }
  //    what a regeneration kept in locked regions, and the imported map's own objects (snapped to
  //    the ground where an edit changed the surface under them)
  if (input.locked) entities.push(...input.locked.entities);
  if (base) for (const e of base.entities) entities.push(snapToGround(e, base, heights, W));
  //    slope overrides, then the first pass of entity edits
  const ground = { W, H, heights };
  if (input.slopeEdits?.length) entities = applySlopeEdits(entities, input.slopeEdits, ground, orphans);
  const passA = applyEntityEdits(entities, input.entityEdits ?? [], ground, true);
  entities = passA.entities;

  //    everything placed so far takes its tiles, and set pieces keep their bodies clear of resources
  const occupied = reserved.slice();
  for (const e of entities) for (const [x, y] of entityTiles(e)) if (x >= 0 && x < W && y >= 0 && y < H) occupied[y * W + x] = 1;
  for (const f of features) {
    if (f.kind !== "setPiece" || !live(f)) continue;
    for (const i of BUILDERS[f.params.kind]?.clears?.(f, W, H, features) ?? []) occupied[i] = 1;
  }
  const partial = { W, H, seed, heights, occupied, channel: terrain.channel, entities, slopes, sources, start: startInfo, notes, orphans };
  const makeCache = (over: Partial<BuildCache>): BuildCache => ({
    keys: new Map(features.map((f) => [f.id, featureKey(f)])),
    terrainFeatures: features.filter((f) => isTerrainKind(f) && live(f)).map((f) => JSON.parse(featureKey(f)) as Feature),
    sculpts: (input.sculpts ?? []).map((s) => paramsKey(s.params)),
    // (applied operations are never changed: their params are kept as they are)
    sculptEdits: (input.sculpts ?? []).map((s) => ({ params: s.params })),
    base,
    locked: input.locked ?? null,
    terrain,
    fields,
    reserved,
    slopesKey,
    slopes,
    settle: null,
    barrierKey: "",
    moisture: null,
    soil: null,
    occupiedBeforeResources: null,
    resources: new Map(),
    resourceOrder: [],
    ...over,
  });
  if (opts.stopBeforeWater) {
    const none = new Float64Array(N);
    const model = waterModel(W, H, heights, []);
    return {
      ...partial,
      water: none,
      contamination: none,
      moisture: none,
      soilContamination: none,
      waterModel: model,
      settle: { settled: false, ticks: 0, depth: none, contamination: none, sat: new Uint8Array(N) },
      waterFromFile: false,
      dirty: null,
      cache: makeCache({}),
    };
  }

  // 10. the canonical water settle (PLAN §19.7), then soil moisture and contamination on it
  const objects = entities.map(toMapObject);
  const model = waterModel(W, H, heights, objects);
  // the oxbow lakes the carves sealed keep their water (sim/water.ts RetainedWater)
  const retained: RetainedWater[] = [];
  for (const s of input.sculpts ?? []) if (isForce(s.params) && s.params.lake) retained.push(s.params.lake);
  if (retained.length) model.retained = retained;
  const emitters = JSON.stringify(model.emitters);
  const resourceFeatures = resourceOrder(features).filter(live);
  // an imported map keeps its file's water until its terrain or water objects change
  const fileWater = !!base && sameModelAsBase(base, model, W, H);
  const needWater = !fileWater || resourceFeatures.length > 0;
  let settle: CanonicalWater | null = null;
  let settleEntry = prev?.settle ?? null;
  if (needWater) {
    const preview = opts.water === "preview" || opts.water === "defer";
    // the previous water serves when nothing that moves water changed; preview water only in a
    // preview build (anything else gets the canonical settle)
    if (settleEntry && sameModel(settleEntry.model, settleEntry.emitters, model) && (preview || !settleEntry.water.preview)) settle = settleEntry.water;
    else {
      settle = opts.settleCache?.get(model) ?? null;
      let carried = false;
      if (!settle) {
        const warm = settleEntry && settleEntry.model.W === W && settleEntry.model.H === H;
        if (opts.water === "defer" && warm) {
          // the last settled water on the new ground; the entry stays the last settled state, so
          // the background settle (and an undo back to it) start from there
          settle = staleWater({ model: settleEntry!.model, water: settleEntry!.water }, model);
          carried = true;
        } else if (preview && warm) settle = previewSettle({ model: settleEntry!.model, water: settleEntry!.water }, model);
        else {
          settle = canonicalSettle(model);
          opts.settleCache?.set(model, settle);
        }
      }
      if (!carried) settleEntry = { model: { ...model, floor: model.floor.slice(), dam: model.dam ? model.dam.slice() : null }, emitters, water: settle };
    }
  } else settleEntry = null;
  // an imported map that keeps its file's water: that water is where the editor's next settle
  // starts from (the file's water is not a canonical settle, so only preview builds take it)
  if (fileWater && !settle && base?.water && (!settleEntry || !sameModel(settleEntry.model, settleEntry.emitters, model))) {
    settleEntry = { model: { ...model, floor: model.floor.slice(), dam: model.dam ? model.dam.slice() : null }, emitters, water: base.water };
  }
  const none = new Float64Array(N);
  const water = settle?.depth ?? none;
  const contamination = settle?.contamination ?? none;
  const barrier = moistureBarrier(W, H, objects);
  const barrierKey = barrier ? barrierString(barrier) : "";
  let moist: Float64Array;
  let soil: Float64Array;
  const reuseSoil = prev && prev.moisture && prev.soil && settle && prev.settle?.water === settle && prev.barrierKey === barrierKey && sameBytes(prev.terrain.heights, heights);
  if (!settle) {
    moist = none;
    soil = none;
  } else if (reuseSoil) {
    moist = prev!.moisture!;
    soil = prev!.soil!;
  } else {
    moist = moisture(heights, water, contamination, W, H, barrier);
    soil = soilContamination(heights, water, contamination, W, H, barrier);
  }
  const settleOut: CanonicalWater = settle ?? { settled: true, ticks: 0, depth: none, contamination: none, sat: new Uint8Array(N) };
  const withWater = {
    ...partial,
    water,
    contamination,
    moisture: moist,
    soilContamination: soil,
    waterModel: model,
    settle: settleOut,
    waterFromFile: fileWater,
  };
  if (opts.stopBeforeResources) {
    return { ...withWater, dirty: null, cache: makeCache({ settle: settleEntry, barrierKey, moisture: settle ? moist : null, soil: settle ? soil : null }) };
  }

  // 11. resources: berries, forests, ruin fields (map objects stood at step 9, D69). Each feature's
  //     output is reused when it and the ground under its area are unchanged.
  const occBefore = occupied.slice();
  const resources = new Map<string, ResourceEntry>();
  const order = resourceFeatures.map((f) => f.id);
  const g = { W, seed, heights, water, moisture: moist, soilContamination: soil, occupied, locked: input.locked?.mask ?? null };
  let changedTiles: Uint8Array | null = null;
  const orderSet = new Set(order);
  const reusable =
    !!prev &&
    !!prev.occupiedBeforeResources &&
    prev.locked === (input.locked ?? null) &&
    prev.base === base &&
    prev.resourceOrder.filter((id) => orderSet.has(id)).join() === order.filter((id) => prev.resources.has(id)).join();
  if (reusable) {
    changedTiles = new Uint8Array(N);
    const pw = prev!.settle?.water.depth ?? none;
    const pm = prev!.moisture ?? none;
    const ps = prev!.soil ?? none;
    const ph = prev!.terrain.heights;
    const po = prev!.occupiedBeforeResources!;
    for (let i = 0; i < N; i++) {
      if (ph[i] !== heights[i] || (pw[i] > 0) !== (water[i] > 0) || (pm[i] > 0) !== (moist[i] > 0) || (ps[i] > 0) !== (soil[i] > 0) || po[i] !== occBefore[i]) changedTiles[i] = 1;
    }
    // tiles freed by resource features that are gone
    for (const [id, e] of prev!.resources) if (!orderSet.has(id)) for (const i of e.placed.tiles) changedTiles[i] = 1;
  }
  const resourceEntities: EntitySpec[] = [];
  for (const f of resourceFeatures) {
    const key = featureKey(f);
    const old = reusable ? prev!.resources.get(f.id) : undefined;
    let placed: Placed;
    if (old && old.key === key && !touches(f.params.area, W, changedTiles!)) {
      placed = old.placed;
      for (const i of placed.tiles) occupied[i] = 1;
    } else {
      placed = rasterizeResource(f, g);
      if (changedTiles && old) markDifference(old.placed.tiles, placed.tiles, changedTiles);
      else if (changedTiles) for (const i of placed.tiles) changedTiles[i] = 1;
    }
    resources.set(f.id, { key, placed });
    resourceEntities.push(...placed.entities);
  }
  entities.push(...resourceEntities);

  // 12. the start entity
  if (start) {
    const [cx, cy] = start.params.position;
    const o = start.params.orientation;
    const [x, y] = coordinatesForMinCorner(3, 3, cx - 1, cy - 1, o);
    entities.push(startingLocation({ id: entityId(start.id, "StartingLocation", 0), owner: start.id, x, y, z: heights[cy * W + cx], orientation: o, player: start.params.player }));
  }

  // 13. the second pass of entity edits, on what only exists now
  const passB = applyEntityEdits(entities, passA.rest, ground, false);
  orphans.push(...orphansOf(passB.rest));
  orphans.sort((a, b) => a.seq - b.seq);

  const result: BuildResult = {
    ...withWater,
    entities: passB.entities,
    dirty: null,
    cache: makeCache({ settle: settleEntry, barrierKey, moisture: settle ? moist : null, soil: settle ? soil : null, occupiedBeforeResources: occBefore, resources, resourceOrder: order }),
  };
  if (prevResult) result.dirty = dirtyInfo(prevResult, result, region);
  return result;
}

// -------------------------------------------------------------------------------------- helpers

/** Tiles of the landforms whose gentle or terraced edges are "joined by slopes" (PLAN §19.2): the
 *  derived slopes join their steps wherever they are. The key names them for slope reuse. */
function landformTargets(features: readonly Feature[], t: BuildTarget): { mask: Uint8Array | null; key: string } {
  let mask: Uint8Array | null = null;
  const keys: string[] = [];
  for (const f of features) {
    // a second district's site joins the start's network wherever it is (PLAN §7.5, §9.8)
    if (f.kind === "setPiece" && f.params.kind === "secondDistrict") {
      const p = f.params.plan as unknown as DistrictPlan;
      mask ??= new Uint8Array(t.W * t.H);
      if (p.x >= 0 && p.y >= 0 && p.x < t.W && p.y < t.H) mask[p.y * t.W + p.x] = 1;
      keys.push(f.id);
      continue;
    }
    if (f.kind !== "landform" || !f.params.outline || f.params.height === undefined || !edgeStep(f.params)) continue;
    const inward = t.inward(f.params.outline);
    mask ??= new Uint8Array(t.W * t.H);
    for (let i = 0; i < inward.length; i++) if (inward[i] > 0) mask[i] = 1;
    keys.push(f.id);
  }
  return { mask, key: keys.join(",") };
}

/** A badwater river's sources on its mouth: BadwaterSources (3×3, placed Cw0 with their minimum
 *  corner at each group) covering the mouth's border tiles three at a time and reaching two tiles
 *  inland, and the tiles left over (fewer than three), which get a source at strength 0 so the
 *  mouth stays sealed. */
export function badwaterMouth(tiles: readonly number[], edge: "west" | "east" | "south" | "north", W: number, H: number, heights: ArrayLike<number>): { groups: [number, number][]; seals: number[] } {
  const sorted = [...tiles].sort((a, b) => a - b);
  const groups: [number, number][] = [];
  const seals: number[] = [];
  let k = 0;
  const level = (x: number, y: number) => {
    const lv = heights[y * W + x];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (heights[(y + dy) * W + x + dx] !== lv) return false;
    return true;
  };
  while (k < sorted.length) {
    // three consecutive border tiles, their 3×3 level (a BadwaterSource stands on flat ground)
    const a = sorted[k];
    const step = edge === "west" || edge === "east" ? W : 1;
    const x = a % W;
    const y = (a - x) / W;
    const at: [number, number] = edge === "west" ? [0, y] : edge === "east" ? [W - 3, y] : edge === "south" ? [x, 0] : [x, H - 3];
    if (k + 2 < sorted.length && sorted[k + 1] === a + step && sorted[k + 2] === a + 2 * step && level(at[0], at[1])) {
      groups.push(at);
      k += 3;
    } else {
      seals.push(a);
      k++;
    }
  }
  return { groups, seals };
}

/** The centre of an imported map's start, when it has exactly one. */
function importedStart(base: BaseLayer, W: number, H: number): { x: number; y: number } | undefined {
  const starts = base.entities.filter((e) => e.template === "StartingLocation");
  if (starts.length !== 1) return undefined;
  const s = starts[0];
  const tiles = footprintTiles("StartingLocation", { template: s.template, x: s.x, y: s.y, z: s.z, orientation: s.orientation, flipped: s.flipped });
  let sx = 0;
  let sy = 0;
  for (const [x, y] of tiles) {
    sx += x;
    sy += y;
  }
  const x = Math.round(sx / tiles.length);
  const y = Math.round(sy / tiles.length);
  return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : undefined;
}

/** An imported map's own slopes that still join a 1-level step on the current terrain, as (low
 *  tile, high tile) pairs. */
function fileSlopeLinks(base: BaseLayer, heights: Uint8Array, W: number, H: number): [number, number][] {
  const out: [number, number][] = [];
  for (const e of base.entities) {
    if (e.template !== "Slope" || e.x < 0 || e.y < 0 || e.x >= W || e.y >= H) continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    const i = e.y * W + e.x;
    if (heights[i] === e.z && heights[hy * W + hx] === e.z + 1) out.push([i, hy * W + hx]);
  }
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function barrierString(b: Uint8Array): string {
  const on: number[] = [];
  for (let i = 0; i < b.length; i++) if (b[i]) on.push(i);
  return on.join(",");
}

function touches(runs: [number, number, number][], W: number, mask: Uint8Array): boolean {
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) if (mask[y * W + x]) return true;
  return false;
}

function markDifference(a: readonly number[], b: readonly number[], mask: Uint8Array): void {
  const sa = new Set(a);
  const sb = new Set(b);
  for (const i of a) if (!sb.has(i)) mask[i] = 1;
  for (const i of b) if (!sa.has(i)) mask[i] = 1;
}

/** An imported object stays where it was, unless an edit changed the surface of its tile and it
 *  stood on that surface: then it moves to the new ground (EDITOR_PLAN §3, conflict rules). */
function snapToGround(e: EntitySpec, base: BaseLayer, heights: Uint8Array, W: number): EntitySpec {
  if (!e.raw) return e;
  const i = e.y * W + e.x;
  if (i < 0 || i >= heights.length || base.columns.has(i)) return e;
  const was = base.heights[i];
  const now = heights[i];
  if (was === now || e.z !== was) return e;
  const comps = e.raw.Components as Record<string, unknown> | undefined;
  const bo = comps?.BlockObject as Record<string, unknown> | undefined;
  if (!bo) return e;
  const nb: Record<string, unknown> = {};
  for (const k of Object.keys(bo)) nb[k] = k === "Coordinates" ? { X: e.x, Y: e.y, Z: now } : bo[k];
  const nc: Record<string, unknown> = {};
  for (const k of Object.keys(comps!)) nc[k] = k === "BlockObject" ? nb : comps![k];
  return { ...e, z: now, raw: { ...e.raw, Components: nc as EntitySpec["components"] } };
}

const baseModels = new WeakMap<BaseLayer, { model: WaterModel; emitters: string }>();

function sameModelAsBase(base: BaseLayer, model: WaterModel, W: number, H: number): boolean {
  let bm = baseModels.get(base);
  if (!bm) {
    const m = waterModel(W, H, base.heights, base.entities.map(toMapObject));
    bm = { model: m, emitters: JSON.stringify(m.emitters) };
    baseModels.set(base, bm);
  }
  return sameModel(bm.model, bm.emitters, model);
}

function dirtyInfo(prev: BuildResult, next: BuildResult, region: TileRegion | null): DirtyInfo {
  const { W, H } = next;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (prev.heights[i] !== next.heights[i]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  let water = prev.water !== next.water;
  if (water && prev.water.length === next.water.length) {
    water = false;
    for (let i = 0; i < next.water.length && !water; i++) if (prev.water[i] !== next.water[i]) water = true;
  }
  let entities = prev.entities.length !== next.entities.length;
  for (let k = 0; k < next.entities.length && !entities; k++) if (entitySignature(prev.entities[k]) !== entitySignature(next.entities[k])) entities = true;
  // where objects came, went or moved (their corners)
  let objects: Rect | null = null;
  if (entities) {
    const was = new Map<string, string>();
    for (const e of prev.entities) was.set(e.id, `${e.template}|${e.x}|${e.y}|${e.z}|${e.orientation}`);
    const mark = (x: number, y: number) => {
      if (!objects) objects = { x0: x, y0: y, x1: x, y1: y };
      else objects = { x0: Math.min(objects.x0, x), y0: Math.min(objects.y0, y), x1: Math.max(objects.x1, x), y1: Math.max(objects.y1, y) };
    };
    const seen = new Set<string>();
    for (const e of next.entities) {
      seen.add(e.id);
      const w = was.get(e.id);
      if (w !== `${e.template}|${e.x}|${e.y}|${e.z}|${e.orientation}`) mark(e.x, e.y);
    }
    for (const e of prev.entities) if (!seen.has(e.id)) mark(e.x, e.y);
  }
  return {
    terrain: x1 >= 0 ? { x0, y0, x1, y1 } : null,
    region: region ? { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 } : null,
    water,
    entities,
    objects,
  };
}

function entitySignature(e: EntitySpec): string {
  return e.raw ? JSON.stringify([e.id, e.x, e.y, e.z, e.orientation]) + String(e.raw === undefined) : JSON.stringify([e.id, e.template, e.x, e.y, e.z, e.orientation, e.flipped, e.before, e.components]);
}

export type { Rect };
