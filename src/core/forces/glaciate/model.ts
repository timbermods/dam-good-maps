// Glaciate's settings, their checks and the shapes of its plan (PLAN §20 D246, D291, D292; from
// investigation/glaciate round 4, #69). A glacier follows the valleys already there (Flow: a click on
// high ground) or grinds through ridges the way it was dragged (Aim); the map's own drainage, never the
// variation seed, chooses a mountain route, and on flat ground a seeded choice of lower ground or an edge
// gives Try another somewhere else to go. Planned in Rust (rust/forces, D381; run.ts); the TypeScript
// planner it replaced is tag `ts-forces-final`.

import { forceSettingsProblem, GLACIATE_SIZE_MAX, GLACIATE_SIZE_MIN } from "../settings";

/** What the row sets (D289: Power, Size, Meltwater; Try another's seed), and the gesture's mode: a
 *  click Flows, a drag Aims (D258; there is no Mode control). */
export interface GlaciateSettings {
  mode: "flow" | "aim";
  power: number;
  /** The trough's width in tiles, or null: Auto (GLACIATE_AUTO_SIZE, whatever the Power). */
  size: number | null;
  meltwater: boolean;
  seed: number;
  /** Its details behind More (D309), each drawn from the land and the seed unless pinned
   *  (nature.ts); each absent, round 4's (what the investigation built). */
  benches?: GlaciateDetails["benches"];
  steps?: GlaciateDetails["steps"];
  tarn?: boolean;
  scree?: boolean;
  /** The Floor (D321, item 40, floor.ts): nothing it does goes below this level; absent, 1. */
  floor?: number;
}

/** Glaciate's details (D309): the benches on its walls' soft rock (none, some stretches as round 4
 *  had them, or most of it); the steps its floor drops by (few, round 4's, many); a tarn in its
 *  cirque; scree cones at its walls' feet. */
export interface GlaciateDetails {
  benches: "none" | "some" | "many";
  steps: "few" | "some" | "many";
  tarn: boolean;
  scree: boolean;
}

/** Where it was asked to act: the head (a tile), and an Aim's end. */
export interface GlaciateIntent {
  origin: number;
  end?: number;
  /** Its drawn path's tiles between the origin and an Aim's end (D321, item 41), in order: the
   *  glacier follows a smooth curve along them. */
  via?: number[];
}

/** The most tiles of a drawn path a glacier takes between its ends. */
export const GLACIATE_PATH_MAX = 128;

export interface Point {
  x: number;
  y: number;
}

/** A station along the trough: its place, its share of the way (0–1), its half-width, its floor level
 *  and the rim beside it. */
export interface Station extends Point {
  s: number;
  r: number;
  floor: number;
  outlet: number;
}

export interface Basin {
  tiles: number[];
  floor: number;
  outlet: number;
  depth: number;
  fed: boolean;
}

/** A hanging side valley: its mouth on the rim, where its water lands, its spring (Meltwater). */
export interface Hanging {
  mouth: number;
  lip: number;
  landing: number;
  source: number | null;
  catchment: number;
  drop: number;
  s: number;
  wet: boolean;
  channel: number[];
  joinLength: number;
}

/** Its defaults: Power 60, a middle depth like the other forces' (Power 100 is round 4's glacier in full,
 *  the deep U-shaped valley Kyler approved; lower Powers lift it toward a light scour, D368 (3)), Auto
 *  size, Meltwater on, and the demo's first personality. */
export const GLACIATE_DEFAULTS: GlaciateSettings = { mode: "flow", power: 60, size: null, meltwater: true, seed: 891 };

/** Size's range in tiles (the row's slider; settings.ts). */
export { GLACIATE_SIZE_MAX, GLACIATE_SIZE_MIN };


/** Try another's next personality (the investigation's series). */
export const glaciateNextSeed = (s: number) => (Math.imul(s, 1664525) + 1013904223) >>> 0;

/** The trough's width on Auto: round 4's at its default Power (D368 (3): Size is how wide, Power how
 *  deep, and neither drives the other, so Auto no longer follows Power). */
export const GLACIATE_AUTO_SIZE = 30;

/** The trough's width: set, or Auto (30, whatever the Power). */
export const sizeOf = (s: Pick<GlaciateSettings, "size">) => s.size ?? GLACIATE_AUTO_SIZE;

/** Why these settings and gesture are not ones the row and the land could give (null when they are). */
export function glaciateProblem(W: number, H: number, s: GlaciateSettings, intent: GlaciateIntent): string | null {
  const n = W * H;
  const why = forceSettingsProblem("glaciate", s as unknown as Record<string, unknown>);
  if (why) return why;
  if (!(Number.isInteger(intent.origin) && intent.origin >= 0 && intent.origin < n)) return "the glacier's head is off the map";
  if (s.mode === "aim" && !(Number.isInteger(intent.end) && intent.end! >= 0 && intent.end! < n && intent.end !== intent.origin)) return "an aimed glacier needs its end on the map";
  if (intent.via !== undefined) {
    if (s.mode !== "aim") return "only an aimed glacier follows a drawn path";
    if (!(Array.isArray(intent.via) && intent.via.length <= GLACIATE_PATH_MAX && intent.via.every((i) => Number.isInteger(i) && i >= 0 && i < n))) return `a glacier's path is up to ${GLACIATE_PATH_MAX} tiles on the map`;
    const all = [intent.origin, ...intent.via, intent.end];
    if (all.some((i, k) => k > 0 && i === all[k - 1])) return "a glacier's path moves on from each of its tiles to the next";
  }
  return null;
}
