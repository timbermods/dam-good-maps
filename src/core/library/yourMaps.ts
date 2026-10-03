// Your maps (PLAN §20 D234, amended by D330; docs/UI-BRIEF.md §3, §6): every edited map, kept in this
// browser. This is the plain model the page and any other caller share (D342 (3)): what an entry
// holds, which maps are kept (the last 30 unstarred; a star keeps a map for good; the oldest
// unstarred drop off, never the one just saved), the list's order, and the words for a save that
// failed. The store itself is a platform adapter (src/platform/yourMaps.ts: IndexedDB); the
// background saving is `saver.ts`.

import { gunzipSync, strFromU8 } from "fflate";

/** Unstarred maps kept (D234 (4)). */
export const KEEP = 30;

export interface YourMapEntry {
  id: string;
  name: string;
  /** Where the map came from (a generated map, a real place, an imported .timber). */
  kind: "generated" | "place" | "import";
  /** ISO times: first kept, and last edited. */
  createdAt: string;
  editedAt: string;
  starred: boolean;
  /** A PNG data URL (`thumbnailDataUrl`), or null. */
  thumbnail: string | null;
  /** Changes with every saved version of the map (the page's count of its edits works). */
  revision: number;
  /** The revision last saved to Timberborn, or null: the list marks a map whose latest version is
   *  already in the game (D234 (3)). */
  savedToTimberborn: number | null;
  /** The project file's size in bytes. */
  bytes: number;
  /** The map's width and height in tiles ("128�128"); absent only for a map whose project can't be read (the list shows nothing). */
  size?: { w: number; h: number };
}

/** A project file's map size, read from its base header without rebuilding the map; null if unreadable. */
export function projectSize(project: Uint8Array): { w: number; h: number } | null {
  try {
    const text = strFromU8(project[0] === 0x1f && project[1] === 0x8b ? gunzipSync(project) : project);
    const base = (JSON.parse(text) as { base?: { sizeX?: unknown; sizeY?: unknown } }).base;
    const w = base?.sizeX, h = base?.sizeY;
    return typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

/** The entry with its size filled from the project when it has none (the same entry if nothing to add). */
export function withSize(entry: YourMapEntry, project: Uint8Array): YourMapEntry {
  if (entry.size) return entry;
  const size = projectSize(project);
  return size ? { ...entry, size } : entry;
}

/** A project file's stored map name, read without rebuilding the map; null if unreadable or absent. */
export function projectName(project: Uint8Array): string | null {
  try {
    const text = strFromU8(project[0] === 0x1f && project[1] === 0x8b ? gunzipSync(project) : project);
    const name = (JSON.parse(text) as { meta?: { name?: unknown } }).meta?.name;
    return typeof name === "string" && name.trim() ? name : null;
  } catch {
    return null;
  }
}

/** The entry named as its project file's stored name says (D443): a rename in the editor reaches
 *  Your maps on the next save (the same entry if the names agree). */
export function withStoredName(entry: YourMapEntry, project: Uint8Array): YourMapEntry {
  const name = projectName(project);
  return name && name !== entry.name ? { ...entry, name } : entry;
}

/** A save that could not be kept: storage is full (say so plainly), or there is no browser storage
 *  at all (a private window, blocked site data). */
export type StoreResult = { ok: true } | { ok: false; reason: "full" | "unavailable" };

/** A removed map, held so the removal can be undone. */
export interface Removed {
  entry: YourMapEntry;
  project: Uint8Array;
}

/** The words for a save that failed (D234 (5)). */
export function storeProblem(r: StoreResult): string | null {
  if (r.ok) return null;
  return r.reason === "full"
    ? "Browser storage is full, so Your maps can't keep this map. Unstar some maps, or download them as project files."
    : "This browser isn't keeping Your maps (private window or blocked site data). Download the project file to keep a map.";
}

/** Which entries drop off: all but the newest `KEEP` unstarred ones (starred maps always stay).
 *  `keep` is never dropped (the map just saved). */
export function toDrop(entries: readonly YourMapEntry[], keep?: string): string[] {
  const unstarred = entries.filter((e) => !e.starred && e.id !== keep).sort((a, b) => b.editedAt.localeCompare(a.editedAt));
  const room = keep && entries.some((e) => e.id === keep && !e.starred) ? KEEP - 1 : KEEP;
  return unstarred.slice(Math.max(0, room)).map((e) => e.id);
}

/** The list's order: newest edit first. */
export function byEdited(entries: readonly YourMapEntry[]): YourMapEntry[] {
  return [...entries].sort((a, b) => b.editedAt.localeCompare(a.editedAt));
}


export interface YourMapsStore {
  /** Every entry, newest edit first ([] without storage). */
  list(): Promise<YourMapEntry[]>;
  /** A map's project file, or null. */
  project(id: string): Promise<Uint8Array | null>;
  /** Keep a map (a new one, or a new version of one), then drop the oldest unstarred past `KEEP`. */
  put(entry: YourMapEntry, project: Uint8Array): Promise<StoreResult>;
  rename(id: string, name: string): Promise<StoreResult>;
  star(id: string, starred: boolean): Promise<StoreResult>;
  /** The latest version was saved to Timberborn. */
  markSaved(id: string, revision: number): Promise<StoreResult>;
  /** A copy under a new id and name (to try an idea without risking the original). */
  copy(id: string, copy: { id: string; name: string; at: string }): Promise<StoreResult>;
  /** Remove a map; the result undoes it with `restore`. Null when there was nothing to remove. */
  remove(id: string): Promise<Removed | null>;
  restore(r: Removed): Promise<StoreResult>;
}

/** A new entry's id. */
export function newMapId(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return `m${a[0].toString(36)}${a[1].toString(36)}`;
}
