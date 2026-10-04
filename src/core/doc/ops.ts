// Edit operations (EDITOR_PLAN §3): small, serializable commands in one envelope, `{op, params}`.
// The validation report's one-click fixes use the same envelope (report.ts `FixOp`), so a fix is
// applied like any other edit. Operations are checked against their schema and the current map
// and rejected when invalid, never clamped silently (the set-piece builders are the one place that
// reduces values, and they report it).
//
// The document keeps an ordered log of applied operations. Feature operations change the document
// state and store undo data; sculpt, slope and entity operations are overlays that the build
// pipeline applies in log order (PLAN §19.8 steps 6, 8 and 13). The log replays only onto the land
// it was made on (undo and redo, reopening a project, share links): edits never replay onto new
// land (PLAN §20, D336), so there is no settings change among the operations. An operation whose
// target is gone is kept and flagged as orphaned, never dropped (PLAN §19.4). Locks and the retired
// regenerateRegion operation were removed (D253, D270): an old project that held one still opens,
// with its land as it was kept (document.ts).

import { CEILING } from "../format/world";
import { FOOTPRINTS, ORIENTATIONS, type Orientation } from "../format/footprints";
import { hasDefaults, type PlaceEntityParams } from "../features/edits";
import { checkChannel } from "../features/route";
import { checkSetPiece } from "../features/setpieces";
import { BUILT_OBJECTS, isLine, OBJECT_NAMES, objectTiles } from "../features/objects";
import { REQUIRED } from "../validate/checks";
import type { Feature, FeatureKind } from "../features/schema";
import type { Runs } from "../math/grid";
import { checkSchema, validateFeatures } from "../spec/schema";
import { brushProblems, type BrushParams } from "../features/raster/brush";
import { forceProblems, type ForceResultParams } from "../forces/op";
import { applyMergePatch, clone } from "../spec/mergepatch";
import { fedTiles } from "../sim/fed";
import { fillProblem } from "../sim/fill";
import type { RetainedWater, WaterModel } from "../sim/water";
import opsSchema from "./ops.schema.json" with { type: "json" };

export type OpOrigin = "user" | "claude" | "fix";
export type SculptMode = "raise" | "lower" | "flatten" | "terrace" | "smooth" | "naturalize";

export type { PlaceEntityParams };

export interface OpParams {
  addFeature: { feature: Feature; index?: number };
  /** A JSON Merge Patch on the feature's `params` and `locked`. */
  updateFeature: { id: string; patch: { params?: Record<string, unknown>; locked?: boolean } };
  deleteFeature: { id: string };
  reorderFeature: { id: string; index: number };
  sculpt: { mode: SculptMode; cells: Runs; amount?: number; level?: number; step?: number; /** The integrity pass leaves what this changed as it is (a single tile's pit stays a pit: Delete's ground, D323 item 1). */ exact?: boolean };
  /** A terrain brush stroke (live editing): the brush and its dabs (features/raster/brush.ts). */
  brush: BrushParams;
  /** A force of nature (Carve, Craterize, Erupt, Quake, Glaciate: D194, D202, D203, D206, D220, D246),
   *  its result stored literally (forces/op.ts). A project's `carve` operations, from before the forces
   *  shared this one, become this when it opens (doc/document.ts). */
  forceResult: ForceResultParams;
  placeEntity: PlaceEntityParams;
  /** `quiet`: only a force's own edit sets it (an object it carried that is gone, or whose new ground
   *  is taken, is left out); an operation in the log never does. */
  moveEntity: { id: string; x: number; y: number; orientation?: Orientation; quiet?: boolean };
  /** `quiet`: ids already gone are fine. Only a force's own edit sets it (its ground places the
   *  resources again); an operation in the log never does. */
  deleteEntities: { entities: string[]; quiet?: boolean };
  /** A JSON Merge Patch on the entity's components (BlockObject excluded: use moveEntity). `quiet`:
   *  only a force's own edit sets it (a tree it knocked down that is gone is fine). */
  setEntityProps: { id: string; components: Record<string, unknown>; quiet?: boolean };
  pinSlope: { x: number; y: number; orientation: Orientation };
  removeSlope: { x: number; y: number };
  /** Remove unfed water (D387 (2)): the water no source feeds, map-wide or within a selection, as
   *  the core question found it (doc/waterEdits.ts `unfedWater`). */
  removeUnfedWater: RemoveUnfedWaterParams;
  /** Fill (D387 (3), D394): a hollow filled with standing water to a level, with no source, stored
   *  as a sealed oxbow lake's water is (D216; doc/waterEdits.ts `planFill`). */
  fillHollow: FillHollowParams;
}

export interface RemoveUnfedWaterParams {
  /** The tiles of the unfed bodies of water taken (y·W + x), ascending: once the water settles, the
   *  water no source feeds on them is taken away (sim/water.ts WaterModel `drained`). */
  tiles: number[];
  /** Where it was asked: the selection's tiles as runs [y, x0, x1]; absent, the whole map. A body of
   *  water with a tile inside goes whole. */
  area?: Runs;
  /** How many bodies of water (pools) it takes, for the history. */
  pools?: number;
}

export interface FillHollowParams {
  /** The tile the fill was asked at, [x, y]. */
  at: [number, number];
  /** The water's surface. */
  level: number;
  /** The hollow's water (its tiles ascending, their floors, depths to the level, clean), as a carve
   *  stores its oxbow lake's: every settle starts the hollow from it. */
  lake: RetainedWater;
}

export type OpName = keyof OpParams;
export type EditOp = { [K in OpName]: { op: K; params: OpParams[K] } }[OpName];
export type OpOf<K extends OpName> = { op: K; params: OpParams[K] };

export interface UndoData {
  /** The force a "Try another" replaced, and where it stood in the sculpts and entity edits. */
  replaced?: { op: ForceOp; sculpt: number; entity: number };
  /** The feature before an update or a delete. */
  before?: Feature;
  /** Where the feature was (delete, reorder) or went (add). */
  index?: number;
}

interface Applied {
  /** Position-independent number of the operation within its document (1, 2, …). */
  seq: number;
  origin: OpOrigin;
  /** Plain-language label (fixes, Claude's proposals). */
  label?: string;
  undo?: UndoData;
  /** Why the operation has no effect: its target no longer exists (PLAN §19.4). */
  orphaned?: string;
  /** The `seq` of the first operation of the step it was applied in, when the step held several
   *  (one undo takes them all back, after a reopen too: D456); absent, it is a step of its own. The
   *  step's label is its first operation's `label`. */
  step?: number;
}

export type AppliedOp = EditOp & Applied;
export type AppliedOpOf<K extends OpName> = OpOf<K> & Applied;

export type SculptOp = AppliedOpOf<"sculpt"> | AppliedOpOf<"brush"> | AppliedOpOf<"forceResult">;
/** A force's operation. */
export type ForceOp = AppliedOpOf<"forceResult">;
export const isForceOp = (op: { op: string }): op is ForceOp => op.op === "forceResult";
export type SlopeOp = AppliedOpOf<"pinSlope"> | AppliedOpOf<"removeSlope">;
export type EntityOp = AppliedOpOf<"placeEntity"> | AppliedOpOf<"moveEntity"> | AppliedOpOf<"deleteEntities"> | AppliedOpOf<"setEntityProps">;
/** An operation that changes only the water (D387 (2) and (3)). */
export type WaterOp = AppliedOpOf<"removeUnfedWater"> | AppliedOpOf<"fillHollow">;

/** The document's current state: the generation's features with the log applied. */
export interface DocState {
  features: Feature[];
  sculpts: SculptOp[];
  slopeEdits: SlopeOp[];
  entityEdits: EntityOp[];
  /** Remove unfed water and Fill, in log order (the build makes the water model's stored water of
   *  them and the forces' oxbow lakes, by `seq`). */
  waterEdits: WaterOp[];
}

export function emptyState(features: readonly Feature[]): DocState {
  return { features: clone(features as Feature[]), sculpts: [], slopeEdits: [], entityEdits: [], waterEdits: [] };
}

// ----------------------------------------------------------------------------------- dependencies

/** Ids of the features `f` builds on (a river it follows, a set piece its bed step belongs to). */
export function dependenciesOf(f: Feature): string[] {
  const out: string[] = [];
  switch (f.kind) {
    case "landform":
      if (f.params.along) out.push(f.params.along.river);
      break;
    case "lake":
      if (f.params.river) out.push(f.params.river);
      if ("rivers" in f.params.inflow) out.push(...f.params.inflow.rivers);
      if (f.params.outlet.target) out.push(f.params.outlet.target);
      break;
    case "setPiece": {
      const r = f.params.plan.river;
      if (typeof r === "string") out.push(r);
      // the river or lake a standalone piece's channel drains into
      for (const k of ["outflowTo", "outletTo", "lake"]) {
        const to = f.params.plan[k];
        if (typeof to === "string" && to !== "edge" && to !== r) out.push(to);
      }
      break;
    }
    case "river": {
      for (const s of f.params.bedProfile.steps) if (s.setPiece) out.push(s.setPiece);
      const en = f.params.entry;
      if ("lake" in en) out.push(en.lake);
      const ex = f.params.exit;
      if ("lake" in ex) out.push(ex.lake);
      else if ("river" in ex) out.push(ex.river);
      break;
    }
    default:
      break;
  }
  return out;
}

/** Features that build on `id`. */
export function dependentsOf(features: readonly Feature[], id: string): Feature[] {
  return features.filter((f) => f.id !== id && dependenciesOf(f).includes(id));
}

// --------------------------------------------------------------------------------------- applying

function featureIndex(state: DocState, id: string): number {
  return state.features.findIndex((f) => f.id === id);
}

/** The feature after a merge patch on its params and `locked`. */
export function patchFeature(f: Feature, patch: OpParams["updateFeature"]["patch"]): Feature {
  const out = clone(f) as Feature;
  if (patch.params !== undefined) out.params = applyMergePatch(out.params, patch.params);
  if (patch.locked !== undefined) out.locked = patch.locked;
  return out;
}

/** Apply one log operation to the state. Its undo data is (re)computed; when its target no longer
 *  exists it is marked orphaned and changes nothing. */
export function applyOp(state: DocState, op: AppliedOp): void {
  delete op.undo;
  delete op.orphaned;
  switch (op.op) {
    case "addFeature": {
      const f = op.params.feature;
      if (featureIndex(state, f.id) >= 0) {
        op.orphaned = `a feature with the id ${f.id} already exists`;
        return;
      }
      const missing = dependenciesOf(f).filter((d) => featureIndex(state, d) < 0);
      if (missing.length) {
        op.orphaned = `it builds on ${missing.join(", ")}, which no longer exists`;
        return;
      }
      const index = Math.min(op.params.index ?? state.features.length, state.features.length);
      state.features.splice(index, 0, clone(f));
      op.undo = { index };
      return;
    }
    case "updateFeature": {
      const k = featureIndex(state, op.params.id);
      if (k < 0) {
        op.orphaned = `feature ${op.params.id} no longer exists`;
        return;
      }
      const before = state.features[k];
      const after = patchFeature(before, op.params.patch);
      const errors = validateFeatures([after]);
      if (errors.length) {
        op.orphaned = `the change no longer fits feature ${op.params.id}: ${errors[0].path} ${errors[0].message}`;
        return;
      }
      state.features[k] = after;
      op.undo = { before };
      return;
    }
    case "deleteFeature": {
      const k = featureIndex(state, op.params.id);
      if (k < 0) {
        op.orphaned = `feature ${op.params.id} no longer exists`;
        return;
      }
      const deps = dependentsOf(state.features, op.params.id);
      if (deps.length) {
        op.orphaned = `${deps.map((d) => d.id).join(", ")} now build on feature ${op.params.id}`;
        return;
      }
      const [before] = state.features.splice(k, 1);
      op.undo = { before, index: k };
      return;
    }
    case "reorderFeature": {
      const k = featureIndex(state, op.params.id);
      if (k < 0) {
        op.orphaned = `feature ${op.params.id} no longer exists`;
        return;
      }
      const [f] = state.features.splice(k, 1);
      state.features.splice(Math.min(op.params.index, state.features.length), 0, f);
      op.undo = { index: k };
      return;
    }
    case "sculpt":
    case "brush":
      state.sculpts.push(op);
      return;
    case "forceResult": {
      // Try another replaces the force before it: that one is left out while this one stands
      const r = op.params.replaces;
      if (r !== undefined) {
        const k = state.sculpts.findIndex((s) => isForceOp(s) && s.seq === r);
        if (k >= 0) {
          const replaced = state.sculpts[k] as ForceOp;
          const e = state.entityEdits.findIndex((x) => x.seq === r);
          state.sculpts.splice(k, 1);
          removeAllFromList(state.entityEdits, r);
          op.undo = { replaced: { op: replaced, sculpt: k, entity: e } };
        }
      }
      state.sculpts.push(op);
      state.entityEdits.push(...forceEntityEdits(op));
      return;
    }
    case "pinSlope":
    case "removeSlope":
      state.slopeEdits.push(op);
      return;
    case "placeEntity":
    case "moveEntity":
    case "deleteEntities":
    case "setEntityProps":
      state.entityEdits.push(op);
      return;
    case "removeUnfedWater":
    case "fillHollow":
      state.waterEdits.push(op);
      return;
    default:
      throw new Error(`${(op as { op: string }).op} is not a log operation`);
  }
}

/** A force's objects, as the entity edits the build applies (same seq): the objects that lost their
 *  ground go, the ones it carried move, the trees it knocked down die, and a carve's source is
 *  placed. Each is quiet: what the ground's resources placed again may have changed. */
function forceEntityEdits(op: ForceOp): EntityOp[] {
  const { seq, origin } = op;
  const out: EntityOp[] = [];
  const p = op.params;
  if (p.removed.length) out.push({ op: "deleteEntities", params: { entities: p.removed, quiet: true }, seq, origin });
  for (const m of p.moved ?? []) out.push({ op: "moveEntity", params: { id: m.id, x: m.x, y: m.y, quiet: true }, seq, origin });
  for (const f of p.felled ?? []) out.push({ op: "setEntityProps", params: { id: f.id, components: { LivingNaturalResource: { IsDead: true } }, quiet: true }, seq, origin });
  // a carve's source, and since D314 the rest of its row; Glaciate's springs (D246)
  for (const s of [...(p.source ? [p.source] : []), ...(p.sources ?? [])])
    out.push({ op: "placeEntity", params: { id: s.id, template: "WaterSource", x: s.x, y: s.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: s.strength, CurrentStrength: s.strength } } }, seq, origin });
  return out;
}

function removeAllFromList<T extends { seq: number }>(list: T[], seq: number): void {
  for (let k = list.length - 1; k >= 0; k--) if (list[k].seq === seq) list.splice(k, 1);
}

function removeFromList<T extends { seq: number }>(list: T[], seq: number): void {
  const k = list.findIndex((o) => o.seq === seq);
  if (k < 0) throw new Error(`operation ${seq} is not applied`);
  list.splice(k, 1);
}

/** Undo one applied log operation (the last one applied, in normal use). */
export function invertOp(state: DocState, op: AppliedOp): void {
  if (op.orphaned) return;
  switch (op.op) {
    case "addFeature":
      state.features.splice(featureIndex(state, op.params.feature.id), 1);
      return;
    case "updateFeature":
      state.features[featureIndex(state, op.params.id)] = op.undo!.before!;
      return;
    case "deleteFeature":
      state.features.splice(op.undo!.index!, 0, op.undo!.before!);
      return;
    case "reorderFeature": {
      const [f] = state.features.splice(featureIndex(state, op.params.id), 1);
      state.features.splice(op.undo!.index!, 0, f);
      return;
    }
    case "sculpt":
    case "brush":
      removeFromList(state.sculpts, op.seq);
      return;
    case "forceResult": {
      removeFromList(state.sculpts, op.seq);
      removeAllFromList(state.entityEdits, op.seq);
      // the force it replaced comes back where it was
      const r = op.undo?.replaced;
      if (r) {
        state.sculpts.splice(Math.min(r.sculpt, state.sculpts.length), 0, r.op);
        const edits = forceEntityEdits(r.op);
        if (edits.length) state.entityEdits.splice(r.entity >= 0 ? Math.min(r.entity, state.entityEdits.length) : state.entityEdits.length, 0, ...edits);
      }
      return;
    }
    case "pinSlope":
    case "removeSlope":
      removeFromList(state.slopeEdits, op.seq);
      return;
    case "placeEntity":
    case "moveEntity":
    case "deleteEntities":
    case "setEntityProps":
      removeFromList(state.entityEdits, op.seq);
      return;
    case "removeUnfedWater":
    case "fillHollow":
      removeFromList(state.waterEdits, op.seq);
      return;
    default:
      throw new Error(`${(op as { op: string }).op} is not a log operation`);
  }
}

/** Replay a log on the features of the generation it was made on (never onto new land, D336).
 *  Each operation's undo data and orphan flag are recomputed for the state (the operations are
 *  copied, the input is not changed). */
export function replay(baseFeatures: readonly Feature[], log: readonly AppliedOp[]): { state: DocState; log: AppliedOp[] } {
  const state = emptyState(baseFeatures);
  const out: AppliedOp[] = [];
  for (const op of log) {
    const copy = clone(op) as AppliedOp;
    applyOp(state, copy);
    out.push(copy);
  }
  return { state, log: out };
}

// -------------------------------------------------------------------------------------- validation

export interface OpContext {
  state: DocState;
  W: number;
  H: number;
  /** True for generated maps (the ones with a spec). */
  generated: boolean;
  /** Ids of the entities in the current build. */
  entityIds: ReadonlySet<string>;
  /** Tiles with a slope in the current build. */
  slopeTiles: ReadonlySet<number>;
  /** Columns the sculpt tools leave alone: imported caves and overhangs (EDITOR_PLAN §3). */
  lockedColumns: ReadonlySet<number> | null;
  /** Feature kinds this version builds when a player adds them. */
  buildableKinds?: readonly FeatureKind[];
  /** Starts on the map that are not a start feature (an imported map's own StartingLocation). */
  otherStarts?: number;
  /** Why the game would not keep an entity placed (or moved, by id) there, or null: the loader's
   *  rules on the current map (placing.ts `entityProblem`). */
  placement?: (p: { template?: string; id?: string; x: number; y: number; orientation?: Orientation; flipped?: boolean }) => string | null;
  /** The map's water model and its settled water now: Remove unfed water and Fill are checked
   *  against them (a removal takes no fed water; a fill's hollow is still the one it measured). */
  water?: { model: WaterModel; depth: ArrayLike<number> };
  /** The map's surface now: a sculpt that would raise ground past the ceiling is refused, never
   *  clamped (D342 (4)). */
  heights?: ArrayLike<number>;
  /** The objects a start feature builds (its StartingLocation), by id, and that feature's id. */
  startObjects?: ReadonlyMap<string, string>;
}

/** Why an object's components would not load or build: a source's strength must be a number, 0 or
 *  more. Null when they are fine. */
function componentProblem(components: Record<string, unknown>): string | null {
  for (const key of ["WaterSource", "BadwaterSource"]) {
    const c = components[key];
    if (c === undefined) continue;
    if (!c || typeof c !== "object") return `${key} must be an object`;
    for (const field of ["SpecifiedStrength", "CurrentStrength"]) {
      const v = (c as Record<string, unknown>)[field];
      if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v >= 0)) return `${key}.${field} must be a number, 0 or more`;
    }
  }
  return null;
}

/** Kinds a player can add in this version. */
export const ADDABLE_KINDS: readonly FeatureKind[] = ["river", "lake", "landform", "setPiece", "forest", "berryPatch", "ruinField", "mapObject", "start"];

/** Templates a player may place by hand: the common set, minus the start (it is a feature). */
export const PLACEABLE = new Set([
  "Pine", "Birch", "Oak", "Succulent", "BlueberryBush", "Blockage", "GeothermalField", "LargeRelic", "MediumRelic", "SmallRelic",
  "NaturalDam", "NaturalOverhang2x1", "NaturalOverhang3x1", "NaturalOverhang4x1", "Slope", "Thorns", "UnstableCore",
  "RuinColumnH1", "RuinColumnH2", "RuinColumnH3", "RuinColumnH4", "RuinColumnH5", "RuinColumnH6", "RuinColumnH7", "RuinColumnH8",
  "UndergroundRuins", "BadwaterSource", "WaterSource", "WaterSeep", "BadwaterSeep",
]);

/** The highest level a force may leave: the editor's one ceiling (D244). */
const FORCE_MAX_LEVEL = CEILING;

/** Largest number of tiles one operation may touch. */
export const MAX_OP_TILES = 256 * 256;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPS_SCHEMA = opsSchema as Record<string, unknown>;

function runsProblems(runs: Runs, W: number, H: number, what: string): string[] {
  let n = 0;
  for (const [y, x0, x1] of runs) {
    if (y < 0 || y >= H || x0 < 0 || x1 >= W || x0 > x1) return [`${what}: the run [${y}, ${x0}, ${x1}] is outside the ${W}×${H} map`];
    n += x1 - x0 + 1;
  }
  if (n === 0) return [`${what} is empty`];
  if (n > MAX_OP_TILES) return [`${what} covers ${n} tiles, more than one operation may change`];
  return [];
}

/** How far past each map edge a generated feature's outline may reach (decisions-pending #30):
 *  one map side. Lake Basin's terrace rings and highlands reach past the map; the rasterizers clip
 *  them to it, and the editor changes and locks them like any feature. Outlines the player draws
 *  stay on the map: on its tiles' outer edges at most (a rectangle over the edge tiles reaches
 *  −0.5 and W − 0.5, as the drawing tools make it). */
export function outlineBounds(f: Feature, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } {
  return f.origin === "generated" ? { x0: -W, y0: -H, x1: 2 * W - 1, y1: 2 * H - 1 } : { x0: -0.5, y0: -0.5, x1: W - 0.5, y1: H - 0.5 };
}

function featureGeometryProblems(f: Feature, W: number, H: number): string[] {
  const inMap = (p: readonly number[]) => p[0] >= 0 && p[0] <= W - 1 && p[1] >= 0 && p[1] <= H - 1;
  const ob = outlineBounds(f, W, H);
  const inBounds = (p: readonly number[]) => p[0] >= ob.x0 && p[0] <= ob.x1 && p[1] >= ob.y0 && p[1] <= ob.y1;
  const p = f.params as unknown as Record<string, unknown>;
  switch (f.kind) {
    case "forest":
    case "berryPatch":
    case "ruinField":
      return runsProblems(f.params.area, W, H, `${f.kind} area`);
    case "start":
      return inMap(f.params.position) ? [] : [`the start at (${f.params.position.join(", ")}) is outside the map`];
    case "landform":
      if (f.params.outline && !f.params.outline.every(inBounds)) return [f.origin === "generated" ? "the landform's outline reaches more than a map side past the edge" : "the landform's outline leaves the map"];
      if (!f.params.along && (!f.params.outline || f.params.height === undefined)) return ["a landform needs an outline and a height"];
      return [];
    case "lake": {
      if (!f.params.outline.every(inBounds)) return [f.origin === "generated" ? "the lake's outline reaches more than a map side past the edge" : "the lake's outline leaves the map"];
      if (!inMap(f.params.outlet.at)) return ["the lake's outlet is off the map"];
      const o = f.params.outlet;
      if (o.path || o.levels || o.width) {
        if (!o.path || !o.levels || !o.width) return ["the lake's outlet channel needs its tiles, levels and width"];
        const errors = checkChannel({ tiles: o.path, levels: o.levels, width: o.width, to: o.to }, W, H);
        if (errors.length) return errors;
        if (o.levels[0] > o.sill) return ["the lake's outlet channel starts above its sill"];
      }
      return [];
    }
    case "river": {
      const rp = f.params;
      if (!rp.path.every((q) => q[0] >= -1 && q[0] <= W && q[1] >= -1 && q[1] <= H)) return ["the river's path leaves the map"];
      let bed = rp.bedProfile.start;
      for (const s of rp.bedProfile.steps) bed -= s.drop;
      if (bed < 0) return ["the river's bed would drop below level 0"];
      for (let k = 1; k < rp.bedProfile.steps.length; k++) if (rp.bedProfile.steps[k].at < rp.bedProfile.steps[k - 1].at) return ["the river's bed steps must run from source to outlet"];
      const onEdge = (q: readonly number[], e: string) => (e === "west" ? q[0] <= 0.5 : e === "east" ? q[0] >= W - 1.5 : e === "south" ? q[1] <= 0.5 : q[1] >= H - 1.5);
      if ("edge" in rp.entry && !onEdge(rp.path[0], rp.entry.edge)) return [`the river enters from the ${rp.entry.edge} edge, so its path must start there`];
      if ("edge" in rp.exit && !onEdge(rp.path[rp.path.length - 1], rp.exit.edge)) return [`the river leaves by the ${rp.exit.edge} edge, so its path must end there`];
      if (rp.flow > 8 * 256) return ["the river's flow is more than its sources can carry"];
      return [];
    }
    case "setPiece":
      return checkSetPiece(f, W, H);
    case "mapObject": {
      const m = f.params;
      if (!BUILT_OBJECTS.includes(m.kind)) return [`${OBJECT_NAMES[m.kind].toLowerCase()}s come in a later version`];
      if (isLine(m.kind) !== "area" in m.placement) return [isLine(m.kind) ? `a ${OBJECT_NAMES[m.kind].toLowerCase()} covers an area of tiles` : `a ${OBJECT_NAMES[m.kind].toLowerCase()} stands at one place, with an orientation`];
      if (m.core && m.kind !== "unstableCore") return ["only an unstable core has a countdown and a radius"];
      if ("area" in m.placement) return runsProblems(m.placement.area, W, H, `${OBJECT_NAMES[m.kind].toLowerCase()} tiles`);
      return objectTiles(f, W, H).every(([x, y]) => x >= 0 && y >= 0 && x < W && y < H) ? [] : [`the ${OBJECT_NAMES[m.kind].toLowerCase()} does not fit on the map there`];
    }
    default:
      return p ? [] : ["no params"];
  }
}

/** Why an operation cannot be applied now (empty when it can). */
export function validateOp(op: EditOp, ctx: OpContext): string[] {
  const schemaErrors = checkSchema(OPS_SCHEMA, op);
  if (schemaErrors.length) return schemaErrors.map((e) => `${op.op ?? "operation"}${e.path}: ${e.message}`);
  const { state, W, H } = ctx;
  const inMap = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const featureById = (id: string) => state.features.find((f) => f.id === id);
  switch (op.op) {
    case "addFeature": {
      const f = op.params.feature;
      const errors = validateFeatures([f]).map((e) => `feature${e.path.replace(/^\/0/, "")}: ${e.message}`);
      if (errors.length) return errors;
      if (f.origin === "generated") return ["only the generator makes generated features"];
      if (featureById(f.id)) return [`a feature with the id ${f.id} already exists`];
      if (!(ctx.buildableKinds ?? ADDABLE_KINDS).includes(f.kind)) return [`${f.kind} features arrive in a later version (roadmap M7)`];
      if (f.kind === "start" && (state.features.some((g) => g.kind === "start") || (ctx.otherStarts ?? 0) > 0)) return ["the map already has its start: move it instead (vanilla maps have exactly one)"];
      const missing = dependenciesOf(f).filter((d) => !featureById(d));
      if (missing.length) return [`it builds on ${missing.join(", ")}, which does not exist`];
      if (op.params.index !== undefined && op.params.index > state.features.length) return [`index ${op.params.index} is past the end of the feature list`];
      return featureGeometryProblems(f, W, H);
    }
    case "updateFeature": {
      const f = featureById(op.params.id);
      if (!f) return [`feature ${op.params.id} does not exist`];
      const after = patchFeature(f, op.params.patch);
      const errors = validateFeatures([after]).map((e) => `feature${e.path.replace(/^\/0/, "")}: ${e.message}`);
      if (errors.length) return errors;
      const missing = dependenciesOf(after).filter((d) => !featureById(d));
      if (missing.length) return [`it would build on ${missing.join(", ")}, which does not exist`];
      if (after.kind === "mapObject" && f.kind === "mapObject" && after.params.kind !== f.params.kind) return ["a map object keeps its kind: delete it and add another"];
      if (after.kind === "setPiece" && f.kind === "setPiece" && after.params.kind !== f.params.kind) return ["a set piece keeps its kind: delete it and add another"];
      return featureGeometryProblems(after, W, H);
    }
    case "deleteFeature": {
      if (!featureById(op.params.id)) return [`feature ${op.params.id} does not exist`];
      const deps = dependentsOf(state.features, op.params.id);
      return deps.length ? [`${deps.map((d) => `${d.kind} ${d.id}`).join(", ")} build on it: delete or change them first`] : [];
    }
    case "reorderFeature":
      if (!featureById(op.params.id)) return [`feature ${op.params.id} does not exist`];
      return op.params.index >= state.features.length ? [`index ${op.params.index} is past the end of the feature list`] : [];
    case "sculpt": {
      const p = op.params;
      if (p.mode === "naturalize") return ["the naturalize brush arrives in roadmap M10"];
      const errors = runsProblems(p.cells, W, H, "sculpt cells");
      if (errors.length) return errors;
      if ((p.mode === "raise" || p.mode === "lower") && p.amount === undefined) return [`${p.mode} needs an amount`];
      if (p.mode === "flatten" && p.level === undefined) return ["flatten needs a level"];
      if (p.mode === "terrace" && p.step === undefined) return ["terrace needs a step"];
      if (ctx.lockedColumns?.size) {
        for (const [y, x0, x1] of p.cells) for (let x = x0; x <= x1; x++) {
          if (ctx.lockedColumns.has(y * W + x)) return [`(${x}, ${y}) has a cave or overhang, which the sculpt tools leave as it is`];
        }
      }
      // (raised past the ceiling, a tile would stop short of what the step says)
      if (ctx.heights && p.mode === "raise" && p.amount! > 0) {
        for (const [y, x0, x1] of p.cells) for (let x = x0; x <= x1; x++) {
          const h = ctx.heights[y * W + x];
          if (h + p.amount! > CEILING) return [h >= CEILING ? `(${x}, ${y}) is at the ceiling (level ${CEILING}) already` : `(${x}, ${y}) would go above the ceiling (level ${CEILING})`];
        }
      }
      return [];
    }
    case "brush":
      return brushProblems(op.params, W, H);
    case "forceResult": {
      const p = op.params;
      const errors = forceProblems(p, W, H, FORCE_MAX_LEVEL);
      if (errors.length) return errors;
      if (ctx.lockedColumns?.size) for (const i of p.tiles) if (ctx.lockedColumns.has(i)) return [`(${i % W}, ${Math.floor(i / W)}) has a cave or overhang, which a force leaves as it is`];
      // Try another starts from the land before the force it replaces, whose objects may be gone now
      if (p.replaces === undefined) {
        if (p.where.source !== undefined && !ctx.entityIds.has(p.where.source)) return [`there is no source ${p.where.source} to unleash`];
        for (const id of p.removed) if (!ctx.entityIds.has(id)) return [`entity ${id} does not exist`];
        for (const m of p.moved ?? []) if (!ctx.entityIds.has(m.id)) return [`entity ${m.id} does not exist`];
        for (const f of p.felled ?? []) if (!ctx.entityIds.has(f.id)) return [`entity ${f.id} does not exist`];
      }
      for (const id of [...p.removed, ...(p.moved ?? []).map((m) => m.id), ...(p.felled ?? []).map((f) => f.id)]) if (!GUID.test(id)) return [`${id} is not a lowercase GUID`];
      for (const src of [...(p.source ? [p.source] : []), ...(p.sources ?? [])]) {
        if (!GUID.test(src.id)) return [`${src.id} is not a lowercase GUID`];
        if (ctx.entityIds.has(src.id) || state.entityEdits.some((e) => e.op === "placeEntity" && e.params.id === src.id)) return [`an entity with the Id ${src.id} already exists`];
      }
      if (p.replaces !== undefined && !state.sculpts.some((s) => isForceOp(s) && s.seq === p.replaces)) return [`there is no force ${p.replaces} to try another for`];
      return [];
    }
    case "placeEntity": {
      const p = op.params;
      if (!GUID.test(p.id)) return [`${p.id} is not a lowercase GUID`];
      if (ctx.entityIds.has(p.id) || state.entityEdits.some((e) => e.op === "placeEntity" && e.params.id === p.id)) return [`an entity with the Id ${p.id} already exists`];
      // (the start too, on a map that has none: its own was deleted, D323 item 44)
      const noStart = p.template === "StartingLocation" && !state.features.some((f) => f.kind === "start") && (ctx.otherStarts ?? 0) === 0;
      if (!(PLACEABLE.has(p.template) || noStart) || !FOOTPRINTS[p.template]) return [`${p.template} cannot be placed by hand`];
      if (!inMap(p.x, p.y)) return [`(${p.x}, ${p.y}) is outside the map`];
      if (!ORIENTATIONS.includes(p.orientation)) return [`bad orientation ${String(p.orientation)}`];
      if (!p.components && !hasDefaults(p.template)) return [`${p.template} needs its components`];
      if (p.components) {
        const missing = (REQUIRED[p.template] ?? []).filter((c) => !(c in p.components!));
        if (missing.length) return [`${p.template} needs the components ${missing.join(", ")}`];
        if ("BlockObject" in p.components) return ["BlockObject comes from the operation's position"];
        const bad = componentProblem(p.components);
        if (bad) return [bad];
      }
      // an object the game would delete on load is refused
      const why = ctx.placement?.({ template: p.template, x: p.x, y: p.y, orientation: p.orientation, flipped: p.flipped });
      return why ? [why] : [];
    }
    case "moveEntity": {
      if (!ctx.entityIds.has(op.params.id)) return [`entity ${op.params.id} does not exist`];
      if (!inMap(op.params.x, op.params.y)) return [`(${op.params.x}, ${op.params.y}) is outside the map`];
      const why = ctx.placement?.({ id: op.params.id, x: op.params.x, y: op.params.y, orientation: op.params.orientation });
      return why ? [why] : [];
    }
    case "deleteEntities": {
      if ("quiet" in op.params) return ["quiet is a carve's own"];
      // (a start feature's own object goes with its feature, so a start can be placed again)
      const start = op.params.entities.find((id) => ctx.startObjects?.has(id));
      if (start) return [`the start is removed with its feature (deleteFeature ${ctx.startObjects!.get(start)})`];
      const missing = op.params.entities.filter((id) => !ctx.entityIds.has(id));
      return missing.length ? [`${missing.length} of the entities do not exist (${missing.slice(0, 3).join(", ")})`] : [];
    }
    case "setEntityProps": {
      if (!ctx.entityIds.has(op.params.id)) return [`entity ${op.params.id} does not exist`];
      if ("BlockObject" in op.params.components) return ["BlockObject changes through moveEntity"];
      const bad = componentProblem(op.params.components);
      return bad ? [bad] : [];
    }
    case "pinSlope":
      return inMap(op.params.x, op.params.y) ? [] : [`(${op.params.x}, ${op.params.y}) is outside the map`];
    case "removeSlope":
      return ctx.slopeTiles.has(op.params.y * W + op.params.x) ? [] : [`there is no slope at (${op.params.x}, ${op.params.y})`];
    case "removeUnfedWater": {
      const p = op.params;
      const errors = ascendingTiles(p.tiles, W, H, "the water's tiles");
      if (errors.length) return errors;
      if (p.area) {
        const e = runsProblems(p.area, W, H, "the selection");
        if (e.length) return e;
      }
      if (ctx.water) {
        const fed = fedTiles(ctx.water.model, ctx.water.depth);
        const d = ctx.water.depth;
        let fedCount = 0;
        let unfed = 0;
        for (const i of p.tiles) {
          if (!(d[i] > 0)) continue;
          if (fed[i]) fedCount++;
          else unfed++;
        }
        if (fedCount) return [`${fedCount === 1 ? "one of those tiles holds" : `${fedCount} of those tiles hold`} water a source feeds: look again at what it would remove`];
        if (!unfed) return ["no unfed water stands there"];
      }
      return [];
    }
    case "fillHollow": {
      const p = op.params;
      const [x, y] = p.at;
      if (!inMap(x, y)) return [`(${x}, ${y}) is off the map`];
      const l = p.lake;
      if (l.floor.length !== l.tiles.length || l.depth.length !== l.tiles.length || l.contamination.length !== l.tiles.length) return ["the fill's tiles, floors, depths and contamination must match one for one"];
      const errors = ascendingTiles(l.tiles, W, H, "the fill's tiles");
      if (errors.length) return errors;
      if (!l.tiles.includes(y * W + x)) return [`the fill's tiles must hold (${x}, ${y}), where it was asked`];
      for (let k = 0; k < l.tiles.length; k++) {
        if (!(l.depth[k] > 0) || Math.abs(l.floor[k] + l.depth[k] - p.level) > 1e-9) return ["the fill's water must stand at its level on every tile"];
        if (l.contamination[k] !== 0) return ["a fill is clean water"];
      }
      if (ctx.lockedColumns?.size) for (const i of l.tiles) if (ctx.lockedColumns.has(i)) return [`(${i % W}, ${Math.floor(i / W)}) has a cave or overhang, which a fill leaves as it is`];
      if (ctx.water) {
        const why = fillProblem(ctx.water.model, p.at, p.level, l);
        if (why) return [why];
      }
      return [];
    }
  }
}

/** Tile indices on a W×H map, ascending, each once. */
function ascendingTiles(tiles: readonly number[], W: number, H: number, what: string): string[] {
  if (!tiles.length) return [`${what} are none`];
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k];
    if (!Number.isInteger(i) || i < 0 || i >= W * H) return [`${what}: ${i} is not a tile of the ${W}×${H} map`];
    if (k > 0 && i <= tiles[k - 1]) return [`${what} must be ascending, each once`];
  }
  return [];
}
