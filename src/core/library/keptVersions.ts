// Versions (showcase: fearless iteration; PLAN §20 D336, D455, D456, D342): a map kept, or branched, at a step of its
// History. A version is an ordinary project in Your maps: the same land, the History's first steps replayed on it
// (`MapSession.versionProject`), named "<map name> — <step label>", with where it came from in its meta (`parent`).
// Nothing here changes a map, and there is no new file format. Plain data and functions: the page shows them.

import type { VersionParent } from "../doc/document";

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

/** The step a kept version holds, as its quiet line ends, and "edited" once the version has been edited since it was
 *  kept: the line's name gives way to it, so it is always read. */
export function parentStep(p: VersionParent, editedSince = false): string {
  return ` · step ${p.steps}${editedSince ? " · edited" : ""}`;
}

/** The quiet line under a kept version in Your maps: where it came from and the step it holds. */
export function parentLine(p: VersionParent, editedSince = false): string {
  return `${p.name}${parentStep(p, editedSince)}`;
}

/** A kept version's name in its two parts, the map's name and the step ("<map name>", "— <step label>"); null when the
 *  name is not of that form. Where the tile cannot hold the whole name, it cuts the map's name and keeps the step, which
 *  is what tells the versions of one map apart. */
export function splitVersionName(name: string): { head: string; tail: string } | null {
  const i = name.lastIndexOf(" — ");
  if (i <= 0) return null;
  const head = name.slice(0, i).trimEnd();
  const tail = name.slice(i + 1).trim();
  return head && tail.length > 1 ? { head, tail } : null;
}

/** A name for a tooltip when the tile cuts it: the whole name, or at most TIP_MAX characters of it with the end of the
 *  map's name left out, the step kept. */
export function nameTip(name: string): string {
  if (name.length <= TIP_MAX) return name;
  const parts = splitVersionName(name);
  if (parts) {
    const room = TIP_MAX - parts.tail.length - 2;
    if (room >= 8) return `${parts.head.slice(0, room - 1).trimEnd()}… ${parts.tail}`;
  }
  return `${name.slice(0, TIP_MAX - 1).trimEnd()}…`;
}

/** The same in words, for the line's tooltip (a tooltip is a short phrase: the map's name is shortened to fit). */
export function parentFull(p: VersionParent, editedSince = false): string {
  const tail = (p.steps > 0 ? `, step ${p.steps}` : ", as it began") + (editedSince ? ", edited since" : "");
  const room = TIP_MAX - "From ".length - tail.length;
  const name = p.name.length <= room ? p.name : `${p.name.slice(0, Math.max(1, room - 1)).trimEnd()}…`;
  return `From ${name}${tail}`;
}

/** Why two maps cannot be compared, or null when they can: the flip puts one map's land where the other's is, so the
 *  two must be the same size. */
export function compareProblem(open: { w: number; h: number } | undefined, other: { w: number; h: number } | undefined): string | null {
  if (!open || !other) return "That map's size is unknown";
  return open.w === other.w && open.h === other.h ? null : `Maps of different sizes can't be compared (${open.w}×${open.h} and ${other.w}×${other.h})`;
}
