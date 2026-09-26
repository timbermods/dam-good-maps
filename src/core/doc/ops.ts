// Edit operations (EDITOR_PLAN §3): small, serializable commands in one envelope, `{op, params}`.
// The validation report's one-click fixes use the same envelope (report.ts `FixOp`), so a fix is
// applied like any other edit. Operations are checked against their schema and the current map
// and rejected when invalid, never clamped silently (the set-piece builders are the one place that
// reduces values, and they report it).
//
// The document keeps an ordered log of applied operations. Feature and lock operations change the
// document state and store undo data; sculpt, slope and entity operations are overlays that the
// build pipeline applies in log order (PLAN §19.8 steps 6, 8 and 13). Replaying the log on a new
// generation (regeneration) re-applies every operation whose target still exists; the others are
// kept and flagged as orphaned, never dropped (PLAN §19.4).
//
// `specPatch` (change settings and regenerate) and `regenerateRegion` are not log operations:
// they replace the generation under the log (session.ts).

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
import { carveProblems, type CarveParams } from "../forces/carve/op";
import type { Region } from "../spec/mapspec";
import { applyMergePatch, clone } from "../spec/mergepatch";
import opsSchema from "./ops.schema.json" with { type: "json" };

export type OpOrigin = "user" | "claude" | "fix" | "stamp";
export type SculptMode = "raise" | "lower" | "flatten" | "terrace" | "smooth" | "naturalize";

/** A region protected from regeneration (EDITOR_PLAN §3). */
export interface Lock {
  id: string;
  region: Region;
}

export type { PlaceEntityParams };

export interface OpParams {
  addFeature: { feature: Feature; index?: number };
  /** A JSON Merge Patch on the feature's `params` and `locked`. */
  updateFeature: { id: string; patch: { params?: Record<string, unknown>; locked?: boolean } };
  deleteFeature: { id: string };
  reorderFeature: { id: string; index: number };
  sculpt: { mode: SculptMode; cells: Runs; amount?: number; level?: number; step?: number };
  /** A terrain brush stroke (live editing): the brush and its dabs (features/raster/brush.ts). */
  brush: BrushParams;
  /** A carve, a force of nature (D194, D199), its result stored literally (forces/carve/op.ts). */
  carve: CarveParams;
  placeEntity: PlaceEntityParams;
  moveEntity: { id: string; x: number; y: number; orientation?: Orientation };
  /** `quiet`: ids already gone are fine. Only a carve's own edit sets it (its ground places the
   *  resources again); an operation in the log never does. */
  deleteEntities: { entities: string[]; quiet?: boolean };
  /** A JSON Merge Patch on the entity's components (BlockObject excluded: use moveEntity). */
  setEntityProps: { id: string; components: Record<string, unknown> };
  pinSlope: { x: number; y: number; orientation: Orientation };
  removeSlope: { x: number; y: number };
  /** Set (or, with region null, remove) the lock with this id. */
  setLock: { id: string; region: Region | null };
  regenerateRegion: { area: Region; seedVariant: number; layers: ("terrain" | "water" | "resources")[] };
  /** A JSON Merge Patch on the MapSpec, then regenerate (PLAN §19.1). */
  specPatch: { patch: Record<string, unknown> };
}

export type OpName = keyof OpParams;
export type EditOp = { [K in OpName]: { op: K; params: OpParams[K] } }[OpName];
export type OpOf<K extends OpName> = { op: K; params: OpParams[K] };

export interface UndoData {
  /** The carve a "Try another path" replaced, and where it stood in the sculpts and entity edits. */
  replaced?: { op: AppliedOpOf<"carve">; sculpt: number; entity: number };
  /** The feature before an update or a delete. */
  before?: Feature;
  /** Where the feature was (delete, reorder) or went (add); where the lock was. */
  index?: number;
  /** The lock before a setLock (null: there was none). */
  lock?: Lock | null;
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
}

export type AppliedOp = EditOp & Applied;
export type AppliedOpOf<K extends OpName> = OpOf<K> & Applied;

/** Operations kept in the document's log and replayed on every generation. */
export const LOG_OPS: readonly OpName[] = [
  "addFeature", "updateFeature", "deleteFeature", "reorderFeature", "sculpt", "brush", "carve", "placeEntity", "moveEntity",
  "deleteEntities", "setEntityProps", "pinSlope", "removeSlope", "setLock",
];
export const ENTITY_OPS: readonly OpName[] = ["placeEntity", "moveEntity", "deleteEntities", "setEntityProps"];
export const SLOPE_OPS: readonly OpName[] = ["pinSlope", "removeSlope"];

export type SculptOp = AppliedOpOf<"sculpt"> | AppliedOpOf<"brush"> | AppliedOpOf<"carve">;
export type SlopeOp = AppliedOpOf<"pinSlope"> | AppliedOpOf<"removeSlope">;
export type EntityOp = AppliedOpOf<"placeEntity"> | AppliedOpOf<"moveEntity"> | AppliedOpOf<"deleteEntities"> | AppliedOpOf<"setEntityProps">;

/** The document's current state: the generation's features with the log applied. */
export interface DocState {
  features: Feature[];
  locks: Lock[];
  sculpts: SculptOp[];
  slopeEdits: SlopeOp[];
  entityEdits: EntityOp[];
}

export function emptyState(features: readonly Feature[]): DocState {
  return { features: clone(features as Feature[]), locks: [], sculpts: [], slopeEdits: [], entityEdits: [] };
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
    case "carve": {
      // another path replaces the carve before it: that one is left out while this one stands
      const r = op.params.replaces;
      if (r !== undefined) {
        const k = state.sculpts.findIndex((s) => s.op === "carve" && s.seq === r);
        if (k >= 0) {
          const replaced = state.sculpts[k] as AppliedOpOf<"carve">;
          const e = state.entityEdits.findIndex((x) => x.seq === r);
          state.sculpts.splice(k, 1);
          removeAllFromList(state.entityEdits, r);
          op.undo = { replaced: { op: replaced, sculpt: k, entity: e } };
        }
      }
      state.sculpts.push(op);
      state.entityEdits.push(...carveEntityEdits(op));
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
    case "setLock": {
      const k = state.locks.findIndex((l) => l.id === op.params.id);
      const before = k >= 0 ? state.locks[k] : null;
      if (op.params.region === null) {
        if (k < 0) {
          op.orphaned = `lock ${op.params.id} no longer exists`;
          return;
        }
        state.locks.splice(k, 1);
      } else if (k >= 0) state.locks[k] = { id: op.params.id, region: clone(op.params.region) };
      else state.locks.push({ id: op.params.id, region: clone(op.params.region) });
      op.undo = { lock: before, index: k };
      return;
    }
    default:
      throw new Error(`${op.op} is not a log operation`);
  }
}

/** A carve's objects, as the entity edits the build applies (same seq): the objects that lost their
 *  ground go, and its source is placed. */
function carveEntityEdits(op: AppliedOpOf<"carve">): EntityOp[] {
  const { seq, origin } = op;
  const out: EntityOp[] = [];
  const p = op.params;
  if (p.removed.length) out.push({ op: "deleteEntities", params: { entities: p.removed, quiet: true }, seq, origin });
  if (p.source) {
    const s = p.source;
    out.push({ op: "placeEntity", params: { id: s.id, template: "WaterSource", x: s.x, y: s.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: s.strength, CurrentStrength: s.strength } } }, seq, origin });
  }
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
    case "carve": {
      removeFromList(state.sculpts, op.seq);
      removeAllFromList(state.entityEdits, op.seq);
      // the carve it replaced comes back where it was
      const r = op.undo?.replaced;
      if (r) {
        state.sculpts.splice(Math.min(r.sculpt, state.sculpts.length), 0, r.op);
        const edits = carveEntityEdits(r.op);
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
    case "setLock": {
      const u = op.undo!;
      const k = state.locks.findIndex((l) => l.id === op.params.id);
      if (u.lock === null || u.lock === undefined) state.locks.splice(k, 1);
      else if (op.params.region === null) state.locks.splice(u.index!, 0, u.lock);
      else state.locks[k] = u.lock;
      return;
    }
    default:
      throw new Error(`${op.op} is not a log operation`);
  }
}

/** Replay a log on a generation's features. Each operation's undo data and orphan flag are
 *  recomputed for the new state (the operations are copied, the input is not changed). `fits`
 *  orphans the operations that no longer fit the map (a regeneration may change its size). */
export function replay(
  baseFeatures: readonly Feature[],
  log: readonly AppliedOp[],
  fits?: (op: AppliedOp) => string | null,
): { state: DocState; log: AppliedOp[] } {
  const state = emptyState(baseFeatures);
  const out: AppliedOp[] = [];
  for (const op of log) {
    const copy = clone(op) as AppliedOp;
    const misfit = fits?.(copy) ?? null;
    if (misfit) {
      delete copy.undo;
      copy.orphaned = misfit;
    } else applyOp(state, copy);
    out.push(copy);
  }
  return { state, log: out };
}

/** Why an operation's tiles no longer lie on a W × H map (null when they do). */
export function opFitsMap(op: EditOp, W: number, H: number): string | null {
  const inMap = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  switch (op.op) {
    case "addFeature": {
      const errors = featureGeometryProblems(op.params.feature, W, H);
      return errors.length ? `it no longer fits the map: ${errors[0]}` : null;
    }
    case "sculpt":
      return runsProblems(op.params.cells, W, H, "its cells").length ? "its cells are outside the map" : null;
    case "brush":
      return brushProblems(op.params, W, H).length ? "its dabs are outside the map" : null;
    case "carve":
      return carveProblems(op.params, W, H, 255).length ? "its tiles are outside the map" : null;
    case "placeEntity":
    case "moveEntity":
    case "pinSlope":
    case "removeSlope":
      return inMap(op.params.x, op.params.y) ? null : `(${op.params.x}, ${op.params.y}) is outside the map`;
    case "setLock":
      return op.params.region && runsProblems(op.params.region.runs, W, H, "its region").length ? "its region is outside the map" : null;
    default:
      return null;
  }
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

/** The highest level a carve may leave (a carve's fan builds to the in-game editor's 16). */
const CARVE_MAX_LEVEL = 22;

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
      return [];
    }
    case "brush":
      return brushProblems(op.params, W, H);
    case "carve": {
      const p = op.params;
      const errors = carveProblems(p, W, H, CARVE_MAX_LEVEL);
      if (errors.length) return errors;
      if (ctx.lockedColumns?.size) for (const i of p.tiles) if (ctx.lockedColumns.has(i)) return [`(${i % W}, ${Math.floor(i / W)}) has a cave or overhang, which a carve leaves as it is`];
      // another path starts from the land before the carve it replaces, whose objects may be gone now
      if (p.replaces === undefined) for (const id of p.removed) if (!ctx.entityIds.has(id)) return [`entity ${id} does not exist`];
      for (const id of p.removed) if (!GUID.test(id)) return [`${id} is not a lowercase GUID`];
      if (p.source) {
        if (!GUID.test(p.source.id)) return [`${p.source.id} is not a lowercase GUID`];
        if (ctx.entityIds.has(p.source.id) || state.entityEdits.some((e) => e.op === "placeEntity" && e.params.id === p.source!.id)) return [`an entity with the Id ${p.source.id} already exists`];
      }
      if (p.replaces !== undefined && !state.sculpts.some((s) => s.op === "carve" && s.seq === p.replaces)) return [`there is no carve ${p.replaces} to try another path for`];
      return [];
    }
    case "placeEntity": {
      const p = op.params;
      if (!GUID.test(p.id)) return [`${p.id} is not a lowercase GUID`];
      if (ctx.entityIds.has(p.id) || state.entityEdits.some((e) => e.op === "placeEntity" && e.params.id === p.id)) return [`an entity with the Id ${p.id} already exists`];
      if (!PLACEABLE.has(p.template) || !FOOTPRINTS[p.template]) return [`${p.template} cannot be placed by hand`];
      if (!inMap(p.x, p.y)) return [`(${p.x}, ${p.y}) is outside the map`];
      if (!ORIENTATIONS.includes(p.orientation)) return [`bad orientation ${String(p.orientation)}`];
      if (!p.components && !hasDefaults(p.template)) return [`${p.template} needs its components`];
      if (p.components) {
        const missing = (REQUIRED[p.template] ?? []).filter((c) => !(c in p.components!));
        if (missing.length) return [`${p.template} needs the components ${missing.join(", ")}`];
        if ("BlockObject" in p.components) return ["BlockObject comes from the operation's position"];
      }
      // an object the game would delete on load is refused
      const why = ctx.placement?.({ template: p.template, x: p.x, y: p.y, orientation: p.orientation, flipped: p.flipped });
      return why ? [`it can't stand there: ${why}`] : [];
    }
    case "moveEntity": {
      if (!ctx.entityIds.has(op.params.id)) return [`entity ${op.params.id} does not exist`];
      if (!inMap(op.params.x, op.params.y)) return [`(${op.params.x}, ${op.params.y}) is outside the map`];
      const why = ctx.placement?.({ id: op.params.id, x: op.params.x, y: op.params.y, orientation: op.params.orientation });
      return why ? [`it can't stand there: ${why}`] : [];
    }
    case "deleteEntities": {
      if ("quiet" in op.params) return ["quiet is a carve's own"];
      const missing = op.params.entities.filter((id) => !ctx.entityIds.has(id));
      return missing.length ? [`${missing.length} of the entities do not exist (${missing.slice(0, 3).join(", ")})`] : [];
    }
    case "setEntityProps":
      if (!ctx.entityIds.has(op.params.id)) return [`entity ${op.params.id} does not exist`];
      return "BlockObject" in op.params.components ? ["BlockObject changes through moveEntity"] : [];
    case "pinSlope":
      return inMap(op.params.x, op.params.y) ? [] : [`(${op.params.x}, ${op.params.y}) is outside the map`];
    case "removeSlope":
      return ctx.slopeTiles.has(op.params.y * W + op.params.x) ? [] : [`there is no slope at (${op.params.x}, ${op.params.y})`];
    case "setLock": {
      if (op.params.region === null) return state.locks.some((l) => l.id === op.params.id) ? [] : [`lock ${op.params.id} does not exist`];
      return runsProblems(op.params.region.runs, W, H, "the locked region");
    }
    case "regenerateRegion":
      return ["regenerating an area arrives in roadmap M11"];
    case "specPatch":
      return ctx.generated ? [] : ["an imported map has no settings to change"];
  }
}
