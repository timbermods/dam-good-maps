// Edit overlays the build pipeline applies on top of the features (PLAN §19.8): sculpt edits
// (step 6, raster/terrain.ts), slope overrides (step 8) and entity edits (step 13). They are the
// params of the document's operations (core/doc/ops.ts), in log order.
//
// Entity edits run in two passes. The first runs before the water settle, on everything placed so
// far (slopes, sources, an imported map's objects, hand-placed objects), so a deleted source or a
// placed Blockage changes the water. The second runs after the resources and the start, on the
// edits whose targets only exist then (a tree of a forest). An edit whose target exists in neither
// pass is orphaned (PLAN §19.4): kept in the document and reported, never dropped.

import { bush, entityJson, ruin, slope, tree, waterSource, type EntitySpec } from "../format/entities";
import { F, isObject, JsonFloat, type JsonObject, type JsonValue } from "../format/json";
import { FOOTPRINTS, footprintTiles, type Orientation } from "../format/footprints";
import { entityId } from "./ids";

export interface PlaceEntityParams {
  /** A random GUID made when the operation is made, stored so replays give the same Id (§19.4). */
  id: string;
  template: string;
  x: number;
  y: number;
  orientation: Orientation;
  flipped?: boolean;
  /** Components other than BlockObject, plain JSON (non-integer numbers are written as floats).
   *  When absent, the template's defaults. */
  components?: Record<string, unknown>;
}

export type SlopeEdit =
  | { seq: number; op: "pinSlope"; params: { x: number; y: number; orientation: Orientation } }
  | { seq: number; op: "removeSlope"; params: { x: number; y: number } };

export type EntityEdit =
  | { seq: number; op: "placeEntity"; params: PlaceEntityParams }
  | { seq: number; op: "moveEntity"; params: { id: string; x: number; y: number; orientation?: Orientation } }
  | { seq: number; op: "deleteEntities"; params: { entities: string[]; quiet?: boolean } }
  | { seq: number; op: "setEntityProps"; params: { id: string; components: Record<string, unknown> } };

export interface Orphan {
  seq: number;
  reason: string;
}

/** Owner of hand-placed entities and pinned slopes (never a feature id). */
export const PLACED = "placed";
export const PINNED_SLOPES = "pinned:slopes";

// ---------------------------------------------------------------------------------- JSON values

/** Plain JSON as game JSON: whole numbers stay integers, others become floats. */
export function toGameJson(v: unknown): JsonValue {
  if (typeof v === "number") return Number.isInteger(v) ? v : F(v);
  if (Array.isArray(v)) return v.map(toGameJson);
  if (v !== null && typeof v === "object") {
    const out: JsonObject = {};
    for (const k of Object.keys(v)) out[k] = toGameJson((v as Record<string, unknown>)[k]);
    return out;
  }
  return v as JsonValue;
}

/** A JSON Merge Patch of plain values onto game JSON. A number that replaces a float stays a float. */
export function mergeGame(target: JsonValue | undefined, patch: unknown): JsonValue {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    if (typeof patch === "number" && target instanceof JsonFloat) return F(patch);
    return toGameJson(patch);
  }
  const out: JsonObject = isObject(target) ? { ...target } : {};
  for (const k of Object.keys(patch)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v === null) delete out[k];
    else out[k] = mergeGame(out[k], v);
  }
  return out;
}

// ------------------------------------------------------------------------------ entity changes

/** An entity moved to (x, y, z), keeping everything else. Raw entities get an edited copy. */
export function movedEntity(e: EntitySpec, x: number, y: number, z: number, orientation = e.orientation): EntitySpec {
  if (!e.raw) return { ...e, x, y, z, orientation };
  const comps = e.raw.Components as JsonObject;
  const bo = isObject(comps.BlockObject) ? comps.BlockObject : {};
  const nb: JsonObject = {};
  let wroteOrientation = false;
  for (const k in bo) {
    if (k === "Coordinates") nb.Coordinates = { X: x, Y: y, Z: z };
    else if (k === "Orientation") {
      if (orientation !== "Cw0") nb.Orientation = orientation;
      wroteOrientation = true;
    } else nb[k] = bo[k];
  }
  if (!("Coordinates" in nb)) nb.Coordinates = { X: x, Y: y, Z: z };
  if (!wroteOrientation && orientation !== "Cw0") nb.Orientation = orientation;
  const nc: JsonObject = {};
  for (const k in comps) nc[k] = k === "BlockObject" ? nb : comps[k];
  if (!("BlockObject" in nc)) nc.BlockObject = nb;
  return { ...e, x, y, z, orientation, raw: { ...e.raw, Components: nc } };
}

/** An entity with a merge patch on its components (BlockObject excluded). */
export function patchedEntity(e: EntitySpec, patch: Record<string, unknown>): EntitySpec {
  if (e.raw) {
    const comps = mergeGame(e.raw.Components, patch) as JsonObject;
    return { ...e, raw: { ...e.raw, Components: comps } };
  }
  const before: JsonObject = { ...(e.before ?? {}) };
  let components: JsonObject = { ...e.components };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (k in before) {
      if (v === null) delete before[k];
      else before[k] = mergeGame(before[k], v);
    } else if (v === null) {
      const { [k]: _gone, ...rest } = components;
      components = rest;
    } else components[k] = mergeGame(components[k], v);
  }
  return { ...e, before: Object.keys(before).length ? before : undefined, components };
}

// ------------------------------------------------------------------------------ placed entities

/** Components other than BlockObject for a template with a sensible default, or null. */
function defaultEntity(p: PlaceEntityParams, z: number): EntitySpec | null {
  const b = { id: p.id, owner: PLACED, x: p.x, y: p.y, z };
  const t = p.template;
  if (t === "Pine" || t === "Birch" || t === "Oak" || t === "Succulent") return tree({ ...b, species: t });
  if (t === "BlueberryBush") return bush({ ...b, ripe: true });
  const m = /^RuinColumnH([1-8])$/.exec(t);
  if (m) return ruin({ ...b, height: Number(m[1]), variant: "A", orientation: p.orientation });
  if (t === "WaterSource") return waterSource({ ...b, strength: 1 });
  if (t === "BadwaterSource") return waterSource({ ...b, strength: 1, bad: true });
  if (t === "Slope") return slope({ ...b, orientation: p.orientation });
  const blockOnly = ["Blockage", "NaturalDam", "Thorns", "SmallRelic", "MediumRelic", "LargeRelic", "GeothermalField", "UndergroundRuins", "NaturalOverhang2x1", "NaturalOverhang3x1", "NaturalOverhang4x1"];
  if (blockOnly.includes(t)) return { ...b, template: t, orientation: "Cw0", flipped: false, components: {} };
  return null;
}

/** The entity a placeEntity edit makes, standing on the ground at its Coordinates tile. */
export function placedEntity(p: PlaceEntityParams, z: number): EntitySpec {
  const fp = FOOTPRINTS[p.template];
  const flipped = !!p.flipped && !!fp?.flippable;
  if (p.components) {
    const comps = toGameJson(p.components) as JsonObject;
    const before: JsonObject = {};
    const rest: JsonObject = {};
    for (const k in comps) (k === "WaterSource" ? before : rest)[k] = comps[k];
    return {
      id: p.id,
      owner: PLACED,
      template: p.template,
      x: p.x,
      y: p.y,
      z,
      orientation: p.orientation,
      flipped,
      components: rest,
      before: Object.keys(before).length ? before : undefined,
    };
  }
  const d = defaultEntity(p, z);
  if (!d) throw new Error(`${p.template} needs its components`);
  return { ...d, orientation: p.orientation, flipped };
}

export function hasDefaults(template: string): boolean {
  return defaultEntity({ id: "", template, x: 0, y: 0, orientation: "Cw0" }, 0) !== null;
}

/** 2-D tiles an entity covers (none for templates without a footprint). */
export function entityTiles(e: EntitySpec): [number, number][] {
  if (!FOOTPRINTS[e.template]) return [];
  if (e.raw && !isObject((e.raw.Components as JsonObject | undefined)?.BlockObject)) return [];
  return footprintTiles(e.template, { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped });
}

// ---------------------------------------------------------------------------------- applying

export interface EditGround {
  W: number;
  H: number;
  heights: Uint8Array;
}

/** Slope overrides (step 8) on a list that holds the map's slopes. Returns the new list. */
export function applySlopeEdits(entities: EntitySpec[], edits: readonly SlopeEdit[], g: EditGround, orphans: Orphan[]): EntitySpec[] {
  let list = entities;
  for (const ed of edits) {
    const { x, y } = ed.params;
    const k = list.findIndex((e) => e.template === "Slope" && e.x === x && e.y === y);
    if (ed.op === "removeSlope") {
      if (k < 0) {
        orphans.push({ seq: ed.seq, reason: `there is no longer a slope at (${x}, ${y})` });
        continue;
      }
      list = list.filter((_, j) => j !== k);
      continue;
    }
    const i = y * g.W + x;
    if (k >= 0) {
      list = list.slice();
      list[k] = movedEntity(list[k], x, y, g.heights[i], ed.params.orientation);
    } else {
      list = [...list, slope({ id: entityId(PINNED_SLOPES, "Slope", i), owner: PINNED_SLOPES, x, y, z: g.heights[i], orientation: ed.params.orientation })];
    }
  }
  return list;
}

/** One pass of entity edits. Edits (or the ids of a delete) whose targets are not in the list are
 *  returned as `rest` for the next pass. */
export function applyEntityEdits(
  entities: EntitySpec[],
  edits: readonly EntityEdit[],
  g: EditGround,
  allowPlace: boolean,
): { entities: EntitySpec[]; rest: EntityEdit[] } {
  const list = entities.slice();
  const at = new Map<string, number>();
  list.forEach((e, k) => at.set(e.id, k));
  const removed = new Set<number>();
  const rest: EntityEdit[] = [];
  const find = (id: string) => {
    const k = at.get(id);
    return k === undefined || removed.has(k) ? -1 : k;
  };
  for (const ed of edits) {
    switch (ed.op) {
      case "placeEntity": {
        if (!allowPlace) {
          rest.push(ed);
          break;
        }
        const p = ed.params;
        at.set(p.id, list.length);
        list.push(placedEntity(p, g.heights[p.y * g.W + p.x]));
        break;
      }
      case "moveEntity": {
        const k = find(ed.params.id);
        if (k < 0) {
          rest.push(ed);
          break;
        }
        const { x, y } = ed.params;
        list[k] = movedEntity(list[k], x, y, g.heights[y * g.W + x], ed.params.orientation ?? list[k].orientation);
        break;
      }
      case "setEntityProps": {
        const k = find(ed.params.id);
        if (k < 0) {
          rest.push(ed);
          break;
        }
        list[k] = patchedEntity(list[k], ed.params.components);
        break;
      }
      case "deleteEntities": {
        const missing: string[] = [];
        for (const id of ed.params.entities) {
          const k = find(id);
          if (k < 0) missing.push(id);
          else removed.add(k);
        }
        // a carve's (quiet) edit finds what is still there: the resources its ground placed again
        // may be gone, and that is fine
        if (missing.length && !(ed.params.quiet && !allowPlace)) rest.push({ ...ed, params: { ...ed.params, entities: missing } });
        break;
      }
    }
  }
  return { entities: removed.size ? list.filter((_, k) => !removed.has(k)) : list, rest };
}

/** Why the leftover edits of the last pass found nothing. */
export function orphansOf(rest: readonly EntityEdit[]): Orphan[] {
  return rest.map((ed) => {
    switch (ed.op) {
      case "deleteEntities":
        return { seq: ed.seq, reason: `${ed.params.entities.length} of its entities no longer exist` };
      case "placeEntity":
        return { seq: ed.seq, reason: "it was not placed" };
      default:
        return { seq: ed.seq, reason: `entity ${ed.params.id} no longer exists` };
    }
  });
}

export { entityJson };
