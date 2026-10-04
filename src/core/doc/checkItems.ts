// The checks as the editor lists them (PLAN §19.5, EDITOR_PLAN §6): each failing check as an item with
// every one-click fix it has (the checks' own, a planting fix trimmed to where the game takes each
// plant, and the start's moves), the instant checks after an edit with the ones in the edit's region
// marked, and a full validation grouped as the export dialog shows it (an imported map's own problems
// apart, D43). Plain functions on the session's map; the worker adds its timing and versions.

import { blocks, failing, type CheckClass, type CheckResult, type FixOp } from "../validate/report";
import type { Validation } from "../validate/checks";
import { entityProblem } from "./placing";
import { moveStartNear, startMiddle } from "./start";
import type { MapSession } from "./session";

export interface CheckItem {
  id: string;
  class: CheckClass;
  message: string;
  where?: CheckResult["where"];
  /** A one-click fix: edit operations applied together as one undo step. */
  fix?: FixOp[];
  /** The problem lies in the region the last edit changed. */
  here?: boolean;
}

/** A rectangle of tiles, inclusive. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A validation grouped as the export dialog shows it. */
export interface CheckGroups {
  /** Load problems the edits made: export is blocked until they are fixed. */
  blocking: CheckItem[];
  /** Playability and design problems the edits made: the player confirms, and they are noted in
   *  the map's description. */
  warnings: CheckItem[];
  /** Advice that never blocks (plants.drought). */
  advisory: CheckItem[];
  /** Problems an imported map already had when it was opened: listed, never blamed on edits. */
  existing: CheckItem[];
  /** Why the water and start checks are only approximate on this map, or null (PLAN §11, D98). */
  approximate: string | null;
  checks: number;
}

/** The start checks a move fixes: its ground, its door, its dry ring, what covers it. */
const START_FIXABLE = new Set(["start.flat", "start.entrance", "start.dry", "start.clear"]);

/** A map with no start (D323 item 44): the checks say so in two words; the save says what to do. */
export const NO_START = "No start";
export const NO_START_REFUSAL = "Place a start first: pick the Start on the shelf";

/** A check as the editor lists it, with every fix it has: a planting fix only where the game takes
 *  each plant, the start moved to the nearest good spot for the start checks a move fixes, or near
 *  the water a pump reaches for `start.water`; entities named by id get their tiles. */
export function checkItem(s: MapSession, c: CheckResult): CheckItem {
  if (c.id === "start.count" && c.value === 0) c = { ...c, message: NO_START };
  let fix = c.fix?.length ? c.fix : undefined;
  // (a planting fix only where the game takes each plant: the rest of it still helps)
  if (fix && fix.some((op) => op.op === "placeEntity")) {
    const label = fix[0].label;
    fix = fix.filter((op) => op.op !== "placeEntity" || !entityProblem(s, op.params));
    fix = fix.length ? [{ ...fix[0], label }, ...fix.slice(1)] : undefined;
  }
  if (!fix && START_FIXABLE.has(c.id)) {
    const at = startMiddle(s);
    const ops = at ? moveStartNear(s, at[0], at[1]) : null;
    if (ops) fix = ops.map((op, k) => ({ ...op, label: k === 0 ? "Move the start to the nearest good spot" : "" }) as FixOp);
  }
  // water out of reach (D257: a force may carry it off): the start moved to the nearest good spot
  // by the nearest water a pump reaches
  const shore = c.where?.tiles?.[0];
  if (!fix && c.id === "start.water" && shore) {
    const ops = moveStartNear(s, shore[0], shore[1]);
    if (ops) fix = ops.map((op, k) => ({ ...op, label: k === 0 ? "Move the start near the water" : "" }) as FixOp);
  }
  // entities are named by id; the page finds them by their tiles
  let where = c.where;
  if (where?.entities?.length && !where.tiles?.length) {
    const want = new Set(where.entities.slice(0, 50));
    const tiles: [number, number][] = [];
    for (const e of s.built.entities) if (want.has(e.id)) tiles.push([e.x, e.y]);
    if (tiles.length) where = { ...where, tiles };
  }
  return { id: c.id, class: c.class, message: c.message, ...(where ? { where } : {}), ...(fix ? { fix } : {}) };
}

/** The failing checks as items; with `region`, those in it (a tile of the problem within a tile of the
 *  rectangle) are marked `here`. */
export function checkItems(s: MapSession, checks: readonly CheckResult[], region: TileRect | null): CheckItem[] {
  const items: CheckItem[] = [];
  const at = new Map<string, [number, number]>();
  for (const e of s.built.entities) at.set(e.id, [e.x, e.y]);
  for (const c of checks) {
    if (!failing(c)) continue;
    const item = checkItem(s, c);
    if (region) item.here = inRegion(c.where, region, at);
    items.push(item);
  }
  return items;
}

function inRegion(where: CheckResult["where"], r: TileRect, at: Map<string, [number, number]>): boolean {
  const pts: [number, number][] = [...(where?.tiles ?? [])];
  for (const id of where?.entities ?? []) {
    const p = at.get(id);
    if (p) pts.push(p);
  }
  return pts.some(([x, y]) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1);
}

/** The rectangle the last edit changed (the features it changed, old and new, the ground and the
 *  objects), or null. */
export function editRegion(s: MapSession): TileRect | null {
  const d = s.built.dirty;
  const parts = d ? [d.region, d.terrain, d.objects].filter((r): r is NonNullable<typeof r> => !!r) : [];
  return parts.length ? { x0: Math.min(...parts.map((r) => r.x0)), y0: Math.min(...parts.map((r) => r.y0)), x1: Math.max(...parts.map((r) => r.x1)), y1: Math.max(...parts.map((r) => r.y1)) } : null;
}

/** The instant checks (EDITOR_PLAN §6): the load and design classes of the map as it now stands,
 *  without the water settle or a drawn thumbnail (`MapSession.validate`'s `loadOnly`), the problems in
 *  the region the edit changed marked `here`. */
export function instantChecks(s: MapSession): { items: CheckItem[]; region: TileRect | null } {
  const region = editRegion(s);
  const v = s.validate("export", { loadOnly: true });
  return { items: checkItems(s, v.report.checks, region), region };
}

/** Whether a failing check was already failing, over the same things, when the map was opened. */
function existedBefore(c: CheckResult, before: Validation): boolean {
  const o = before.report.checks.find((x) => x.id === c.id);
  if (!o || o.ok || o.applicable === false) return false;
  const keys = (w: CheckResult["where"]) => [...(w?.entities ?? []), ...(w?.tiles ?? []).map((t) => t.join(",")), ...(w?.feature ? [w.feature] : [])];
  const now = keys(c.where);
  if (!now.length) return String(c.value) === String(o.value) && c.message === o.message;
  const had = new Set(keys(o.where));
  return now.every((k) => had.has(k));
}

/** A validation grouped as the export dialog shows it (PLAN §19.5, D43); `before` is an imported
 *  map's validation as it was opened (its own problems are `existing`), null otherwise. */
export function groupChecks(s: MapSession, v: Validation, before: Validation | null): CheckGroups {
  const out: CheckGroups = {
    blocking: [],
    warnings: [],
    advisory: [],
    existing: [],
    approximate: v.report.checks.find((c) => c.approximate)?.approximate ?? null,
    checks: 0,
  };
  for (const c of v.report.checks) {
    if (c.applicable === false) continue;
    out.checks++;
    if (c.ok) continue;
    if (before && existedBefore(c, before)) out.existing.push(checkItem(s, c));
    else if (c.advisory) out.advisory.push(checkItem(s, c));
    else if (blocks("export", c)) out.blocking.push(checkItem(s, c));
    else out.warnings.push(checkItem(s, c));
  }
  return out;
}
