// Versions (showcase: fearless iteration; PLAN §20 D336, D455, D456, D342): a map kept, or branched, at a step of its
// History. A version is an ordinary project in Your maps: the same land, the History's first steps replayed on it
// (`MapSession.versionProject`), named "<map name> — <step label>", with where it came from in its meta (`parent`).
// Nothing here changes a map, and there is no new file format. Plain data and functions: the page shows them.

import { gunzipSync, strFromU8 } from "fflate";
import type { VersionParent } from "../doc/document";
import type { YourMapEntry } from "./yourMaps";

export type { VersionParent };

/** Longest name a kept version gets (the same the tile's rename field allows). */
const NAME_MAX = 80;

/** The longest a tooltip may be (src/ui/Tooltip.tsx, D351). */
const TIP_MAX = 60;

/** "<map name> — <step label>", shortened at the map's name when too long for a name. */
export function versionName(map: string, label: string): string {
  const tail = ` — ${label}`;
  const room = NAME_MAX - tail.length;
  if (map.length <= room) return map + tail;
  return room >= 2 ? `${map.slice(0, room - 1).trimEnd()}…${tail}` : `${map}${tail}`.slice(0, NAME_MAX);
}

/** The quiet line under a kept version in Your maps: where it came from and the step it holds. */
export function parentLine(p: VersionParent): string {
  return `${p.name} · step ${p.steps}`;
}

/** The same in words, for the line's tooltip (a tooltip is a short phrase: the map's name is shortened to fit). */
export function parentFull(p: VersionParent): string {
  const tail = p.steps > 0 ? `, step ${p.steps}` : ", as it began";
  const room = TIP_MAX - "From ".length - tail.length;
  const name = p.name.length <= room ? p.name : `${p.name.slice(0, Math.max(1, room - 1)).trimEnd()}…`;
  return `From ${name}${tail}`;
}

/** A project file's parent (where a kept version came from), read without rebuilding the map; null if none. */
export function projectParent(project: Uint8Array): VersionParent | null {
  try {
    const text = strFromU8(project[0] === 0x1f && project[1] === 0x8b ? gunzipSync(project) : project);
    const p = (JSON.parse(text) as { meta?: { parent?: Partial<VersionParent> } }).meta?.parent;
    if (!p || typeof p.name !== "string" || typeof p.label !== "string" || typeof p.steps !== "number") return null;
    return { ...(typeof p.id === "string" ? { id: p.id } : {}), name: p.name, label: p.label, steps: p.steps };
  } catch {
    return null;
  }
}

/** The entry carrying its project's parent, so Your maps can say where a version came from (the same entry if the
 *  project has none and the entry none). */
export function withParent(entry: YourMapEntry, project: Uint8Array): YourMapEntry {
  const parent = projectParent(project);
  if (!parent) {
    if (!entry.parent) return entry;
    const { parent: _gone, ...rest } = entry;
    return rest;
  }
  return entry.parent && JSON.stringify(entry.parent) === JSON.stringify(parent) ? entry : { ...entry, parent };
}

/** Why two maps cannot be compared, or null when they can: the flip puts one map's land where the other's is, so the
 *  two must be the same size. */
export function compareProblem(open: { w: number; h: number } | undefined, other: { w: number; h: number } | undefined): string | null {
  if (!open || !other) return "That map's size is unknown";
  return open.w === other.w && open.h === other.h ? null : `Maps of different sizes can't be compared (${open.w}×${open.h} and ${other.w}×${other.h})`;
}
