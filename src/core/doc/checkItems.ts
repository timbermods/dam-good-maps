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
  /** A real place's own problem, there when it was opened: listed, never noted in the exported map's
   *  description, so an unedited place exports as the same file (D3). */
  own?: boolean;
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
  return { id: c.id, class: c.class, message: rowWords(c.id, c.message), ...(where ? { where } : {}), ...(fix ? { fix } : {}) };
}

/** A row's words as the editor lists them, the same on every map: the two berry rows count by the same
 *  measure (20 tiles' walk) and say which bushes each counts (those that thrive; every living one), and
 *  the edge wall names its edges once. */
export function rowWords(id: string, message: string): string {
  // (a file whose own water has fewer levels than its caves need, from another tool: no tile to show, and
  // the editor writes its water on every column once an edit moves the water, #435)
  if (id === "file.arrays") return message.replace(/^(Water saved with \d+ levels?), the terrain needs (\d+)$/, "$1, the caves need $2: an edit to the ground saves it again");
  if (id === "start.food") return message.replace(/^(\d+) living blueberry bush(es)? /, (_, n: string, es?: string) => `${n} blueberry bush${es ?? ""} ${es ? "thrive" : "thrives"} `);
  if (id === "plants.drought")
    return message
      .replace(/^(\d+) blueberry bush(es)? near the start dry out /, (_, n: string, es?: string) => `${n} living blueberry bush${es ?? ""} within 20 tiles' walk of the start ${es ? "dry out" : "dries out"} `)
      .replace(/(\d+)-day/, "$1‑day");
  if (id === "terrain.edge_wall") {
    const edges = [...message.matchAll(/(south|north|west|east) edge \((\d+)%\)/g)].map((m) => ({ side: m[1], share: Number(m[2]) }));
    if (!edges.length) return message;
    const shares = edges.map((e) => e.share);
    if (edges.length === 4) {
      const lo = Math.min(...shares);
      const hi = Math.max(...shares);
      return `Walls hold back water on all four edges (${lo === hi ? lo : `${lo}–${hi}`}% of each edge)`;
    }
    if (edges.length === 1) return `A wall holds back water on the ${edges[0].side} edge (${shares[0]}%)`;
    const and = (xs: string[]) => `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
    return `Walls hold back water on the ${and(edges.map((e) => e.side))} edges (${and(shares.map((v) => `${v}%`))})`;
  }
  return message;
}

/** The berry rows side by side where a group holds both (the drought row right after the food row). */
function berriesTogether(items: CheckItem[]): CheckItem[] {
  const food = items.findIndex((c) => c.id === "start.food");
  const drought = items.findIndex((c) => c.id === "plants.drought");
  if (food < 0 || drought < 0 || drought === food + 1) return items;
  const rest = items.filter((_, k) => k !== drought);
  rest.splice(rest.findIndex((c) => c.id === "start.food") + 1, 0, items[drought]);
  return rest;
}

/** A check that names several things, one line each (the checks' own message, a line break between), as
 *  one item per thing, each with its own place for Show. The fix goes on the first row in `region` (the
 *  first row when none is), so "This edit made" keeps it. A closing "and 3 more" joins the last row's words.
 *  The place is the check's tile or entity at the same position. */
export function checkRows(s: MapSession, c: CheckResult, region: TileRect | null = null): CheckItem[] {
  const item = checkItem(s, c);
  const at = new Map<string, [number, number]>();
  for (const e of s.built.entities) at.set(e.id, [e.x, e.y]);
  const lines = item.message.split("\n");
  let rows: CheckItem[];
  if (lines.length < 2) rows = [item];
  else {
    let more = "";
    if (/^and \d+ more$/.test(lines[lines.length - 1])) more = ` (${lines.pop()})`;
    const tiles = c.where?.tiles;
    const ids = c.where?.entities;
    rows = lines.map((message, k): CheckItem => {
      const pt = tiles?.length ? tiles[k] : ids?.[k] ? at.get(ids[k]) : undefined;
      const text = k === lines.length - 1 ? message + more : message;
      return { id: item.id, class: item.class, message: text, ...(pt ? { where: { tiles: [pt], ...(!tiles?.length && ids?.[k] ? { entities: [ids[k]] } : {}) } } : {}) };
    });
    if (item.fix) rows[0].fix = item.fix;
  }
  if (region) {
    for (const r of rows) r.here = inRegion(r.where ?? c.where, region, at);
    if (rows.length > 1 && item.fix) {
      const first = rows.find((r) => r.here) ?? rows[0];
      delete rows[0].fix;
      first.fix = item.fix;
    }
  }
  return rows;
}

/** The failing checks as items; with `region`, those in it (a tile of the problem within a tile of the
 *  rectangle) are marked `here`. */
export function checkItems(s: MapSession, checks: readonly CheckResult[], region: TileRect | null): CheckItem[] {
  const items: CheckItem[] = [];
  for (const c of checks) {
    if (!failing(c)) continue;
    items.push(...checkRows(s, c, region));
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

/** What a real place warns of besides the load checks (D245, D331, PERFECT "Real places"): the
 *  starting-logs floor, the water floor (water a pump can reach from the start) and water that keeps
 *  moving, the misses that would sink a player who goes straight to the game. */
export const PLACE_WARNING_CHECKS: ReadonlySet<string> = new Set(["start.wood_floor", "start.water", "water.settles"]);

/** A validation grouped as the export dialog shows it (PLAN §19.5, D43); `before` is an imported
 *  map's validation as it was opened (its own problems are `existing`), null otherwise. A real place
 *  (`DocMeta.place`) is a map we made and the player gets, so its problems are never "in the map when
 *  you opened it" (D245, D331): a load problem blocks, a miss in `PLACE_WARNING_CHECKS` is a warning,
 *  and every other row is information, worded as a fact (`informationMessage`). */
export function groupChecks(s: MapSession, v: Validation, before: Validation | null): CheckGroups {
  const place = !!s.meta.place;
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
    const rows = checkRows(s, c);
    if (place) {
      if (c.class === "load") out.blocking.push(...rows);
      else if (!c.advisory && PLACE_WARNING_CHECKS.has(c.id)) out.warnings.push(...(before && existedBefore(c, before) ? rows.map((r) => ({ ...r, own: true })) : rows));
      else out.advisory.push(...rows.map(informationItem));
    } else if (before && existedBefore(c, before)) out.existing.push(...rows);
    else if (c.advisory) out.advisory.push(...rows);
    else if (blocks("export", c)) out.blocking.push(...rows);
    else out.warnings.push(...rows);
  }
  // (a place's start with no clean water says so once: its store-water row repeats the warning)
  if (place && out.warnings.some((c) => c.id === "start.water")) out.advisory = out.advisory.filter((c) => c.id !== "water.storage_possible");
  for (const g of ["blocking", "warnings", "advisory", "existing"] as const) out[g] = berriesTogether(out[g]);
  return out;
}

/** A row as information (a real place's Good to know): its words a fact (`informationMessage`), with no
 *  fix (a fact asks for nothing; the warnings keep theirs). */
function informationItem(item: CheckItem): CheckItem {
  const { fix: _fix, ...rest } = item;
  return { ...rest, message: informationMessage(item.message) };
}

/** A row's words where it is information (a real place's Good to know, D245): the fact without the
 *  target that would read as failed ("124 logs within 20 tiles' walk of the start", "No mine sites").
 *  A generated map's rows keep their pass/fail words. */
export function informationMessage(message: string): string {
  if (/^0( of 0)? mine sites\b/.test(message)) return "No mine sites";
  return message
    .replace(/ \((at least|[A-Z][a-z]+ allows) [^)]*\)$/, "")
    .replace(/, (at least [^,]+ needed|at least \d+%|aim for [^,]+)$/, "");
}
