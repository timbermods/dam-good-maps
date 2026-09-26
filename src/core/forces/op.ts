// A force as the document keeps it (PLAN §20 D194, D202, D203, D206, D220): one operation,
// `forceResult`, one undo step, its result stored literally (from investigation/forces-core's
// `core/operation.ts`, fitted to the document: the build assigns it like the carve before it). The
// four forces share it: what the player asked for (the force, its settings and where: a record, since
// a replay never runs the force again), then what it left: the changed tiles and their levels, the
// fresh volcanic rock on them (rock.ts), the objects that lost their ground, the ones it carried (a
// Slide), the trees it knocked down (dead, lying away from the blow), and a carve's source and sealed
// oxbow lake. "Try another" replaces the force before it (`replaces`): undoing it brings that one
// back. The build applies its levels with the sculpts (step 6, kept out of the integrity pass) and its
// objects' changes with the entity edits.
//
// Projects saved with the `carve` operation before the forces shared this one still open and replay
// exactly: `carve` stays a document operation (carve/op.ts), applied the same way.

import type { Rect } from "../features/target";
import type { RetainedWater } from "../sim/water";
import type { CarveParams } from "./carve/op";

export type Verb = "carve" | "craterize" | "erupt" | "quake";
export const VERBS: readonly Verb[] = ["carve", "craterize", "erupt", "quake"];

/** Where a force was asked to act, in tiles: a carve's origin and aimed end, an impact and the way
 *  its impactor travelled (Aim), a vent, a painted fissure or fault (sub-tile points, to 0.01) and
 *  the side of the fault that moved. */
export interface ForceWhere {
  origin?: [number, number];
  end?: [number, number];
  path?: [number, number][];
  side?: 1 | -1;
}

/** A force's settings, as each force's options row sets them (the seed is its personality). */
export type ForceSettingsRecord =
  | { mode: "unleash" | "aim"; power: number; wander: number; width: number | null; seed: number; walls: "steep" | "wide"; defyGravity: boolean; dry: boolean }
  | { mode: "strike" | "aim"; power: number; size: number | null; walls: "steep" | "terraced"; centre: "auto" | "bowl" | "peak" | "ring" | "flat"; debris: "light" | "heavy"; rays: boolean; seed: number }
  | { mode: "vent" | "fissure"; power: number; shape: "steep" | "broad"; summit: "auto" | "peak" | "crater" | "caldera"; flows: "light" | "heavy"; ridges: boolean; seed: number }
  | { mode: "lift" | "slide"; power: number; scarp: "sheer" | "stepped"; seed: number };

export interface ForceResultParams {
  version: 1;
  verb: Verb;
  settings: ForceSettingsRecord;
  where: ForceWhere;
  /** The layer showing when it ran (D207): the ground above it was left as it was. */
  cut?: number;
  /** Steps it ran (ten a second), and why it ended ("stopped" when the player stopped it). */
  steps: number;
  reason: string;
  /** Its result: the changed tiles, ascending, and their new levels. */
  tiles: number[];
  heights: number[];
  /** Fresh volcanic rock where it changed: the tiles, ascending, and each one's levels of it now (a
   *  bit per level, rock.ts). */
  rock?: { tiles: number[]; bits: number[] };
  /** Objects that lost their ground. */
  removed: string[];
  /** Objects it carried (a Slide), and where they stand now. */
  moved?: { id: string; x: number; y: number }[];
  /** Trees it knocked down: dead now, lying along (dx, dy) (their pose is the editor's view). */
  felled?: { id: string; dx: number; dy: number }[];
  /** Carve's Keep river: the water source it leaves at the origin. */
  source?: { id: string; x: number; y: number; strength: number };
  /** Carve's sealed oxbow lake: the water it keeps (carve/water.ts). */
  lake?: RetainedWater;
  /** Try another: the force (its operation's seq) this one replaces. */
  replaces?: number;
}

/** The literal part the build assigns, common to `forceResult` and the older `carve`. */
export type ForceLiteral = Pick<ForceResultParams, "tiles" | "heights" | "removed" | "source" | "lake" | "replaces"> & Partial<Pick<ForceResultParams, "rock" | "moved" | "felled">>;

/** A force's result, `forceResult` or the older `carve` (their params carry tiles, heights and the
 *  objects they took). */
export function isForce(p: object): p is ForceLiteral {
  return "tiles" in p && "heights" in p && "removed" in p;
}

export function isForceResult(p: object): p is ForceResultParams {
  return isForce(p) && "verb" in p && "version" in p;
}

/** A `carve` of before the shared operation, in its shape. */
export function forceOfCarve(p: CarveParams): ForceResultParams {
  return {
    version: 1,
    verb: "carve",
    settings: { mode: p.mode, power: p.power, wander: p.wander, width: p.width, seed: p.seed, walls: p.walls, defyGravity: p.defyGravity, dry: p.dry },
    where: { origin: p.origin, ...(p.end ? { end: p.end } : {}) },
    ...(p.cut !== undefined ? { cut: p.cut } : {}),
    steps: p.steps,
    reason: p.reason,
    tiles: p.tiles,
    heights: p.heights,
    removed: p.removed,
    ...(p.source ? { source: p.source } : {}),
    ...(p.lake ? { lake: p.lake } : {}),
    ...(p.replaces !== undefined ? { replaces: p.replaces } : {}),
  };
}

/** The rectangle of tiles a force changed (null: none). */
export function forceBounds(p: Pick<ForceLiteral, "tiles">, W: number): Rect | null {
  if (!p.tiles.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of p.tiles) {
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const ENUMS: Record<Verb, Record<string, readonly string[]>> = {
  carve: { mode: ["unleash", "aim"], walls: ["steep", "wide"] },
  craterize: { mode: ["strike", "aim"], walls: ["steep", "terraced"], centre: ["auto", "bowl", "peak", "ring", "flat"], debris: ["light", "heavy"] },
  erupt: { mode: ["vent", "fissure"], shape: ["steep", "broad"], summit: ["auto", "peak", "crater", "caldera"], flows: ["light", "heavy"] },
  quake: { mode: ["lift", "slide"], scarp: ["sheer", "stepped"] },
};
const FLAGS: Record<Verb, readonly string[]> = { carve: ["defyGravity", "dry"], craterize: ["rays"], erupt: ["ridges"], quake: [] };

/** Why a force's settings are not ones its row could set (empty when they are). */
export function forceSettingsProblems(verb: Verb, s: Record<string, unknown>): string[] {
  const name = verb === "craterize" ? "an impact" : verb === "erupt" ? "an eruption" : `a ${verb}`;
  for (const [k, list] of Object.entries(ENUMS[verb])) if (!list.includes(s[k] as string)) return [`${name}'s ${k} is one of ${list.join(", ")}`];
  for (const k of FLAGS[verb]) if (typeof s[k] !== "boolean") return [`${name}'s ${k} is true or false`];
  const power = s.power as number;
  if (!(Number.isFinite(power) && power >= 0 && power <= 100)) return [`${name}'s power is 0 to 100`];
  const seed = s.seed as number;
  if (!(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)) return [`${name}'s seed is a whole number from 0 to 4294967295`];
  if (verb === "carve") {
    const w = s.width as number | null;
    if (!(Number.isFinite(s.wander as number) && (s.wander as number) >= 0 && (s.wander as number) <= 100)) return ["a carve's wander is 0 to 100"];
    if (w !== null && !(Number.isFinite(w) && w >= 2 && w <= 24)) return ["a carve's width is 2 to 24 tiles, or null (it follows Power)"];
  }
  if (verb === "craterize") {
    const size = s.size as number | null;
    if (size !== null && !(Number.isFinite(size) && size >= 4 && size <= 180)) return ["an impact's size is 4 to 180 tiles, or null (it follows Power)"];
  }
  return [];
}

/** Why a force's result does not fit a W × H map with levels up to `maxLevel` (empty when it does). */
export function forceProblems(p: ForceResultParams, W: number, H: number, maxLevel: number): string[] {
  const inMap = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H;
  if (p.version !== 1) return ["this force's operation is from a newer version of the editor"];
  if (!VERBS.includes(p.verb)) return [`${String(p.verb)} is not a force`];
  const errors = forceSettingsProblems(p.verb, p.settings as unknown as Record<string, unknown>);
  if (errors.length) return errors;
  const w = p.where;
  const mode = p.settings.mode;
  if (w.origin && !inMap(w.origin[0], w.origin[1])) return ["the force's point is off the map"];
  if (w.end && !inMap(w.end[0], w.end[1])) return ["the force's end point is off the map"];
  if (w.path && !(w.path.length >= 2 && w.path.length <= 512 && w.path.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= W - 1 && y <= H - 1))) return ["a painted line needs 2 to 512 points on the map"];
  if (p.verb === "quake") {
    if (!w.path) return ["a quake needs its fault"];
    if (w.side !== 1 && w.side !== -1) return ["a quake's side is 1 or -1"];
  } else if (!w.origin) return ["a force needs the point it started from"];
  if (p.verb === "erupt" && mode === "fissure" && !w.path) return ["a fissure needs its line"];
  if ((p.verb === "carve" || p.verb === "craterize") && mode === "aim" && !w.end) return ["an aimed force needs its end point"];
  if (p.tiles.length !== p.heights.length) return ["a force needs a level for each of its tiles"];
  let last = -1;
  for (let k = 0; k < p.tiles.length; k++) {
    const i = p.tiles[k];
    if (!Number.isInteger(i) || i <= last || i >= W * H) return ["a force's tiles must be on the map, in order, once each"];
    last = i;
    const h = p.heights[k];
    if (!Number.isInteger(h) || h < 0 || h > maxLevel) return [`a force's levels are 0 to ${maxLevel}`];
  }
  if (p.rock) {
    if (p.rock.tiles.length !== p.rock.bits.length) return ["a force's rock needs its levels for each of its tiles"];
    let prev = -1;
    for (let k = 0; k < p.rock.tiles.length; k++) {
      const i = p.rock.tiles[k];
      if (!Number.isInteger(i) || i <= prev || i >= W * H) return ["a force's rock tiles must be on the map, in order, once each"];
      prev = i;
      const b = p.rock.bits[k];
      if (!Number.isInteger(b) || b < 0 || b >= 2 ** 22) return ["a force's rock is a bit for each of the levels 0 to 21"];
    }
  }
  for (const m of p.moved ?? []) if (!inMap(m.x, m.y)) return ["an object a force carried must stay on the map"];
  for (const f of p.felled ?? []) if (!(Number.isFinite(f.dx) && Number.isFinite(f.dy) && Math.abs(f.dx) <= 1.5 && Math.abs(f.dy) <= 1.5)) return ["a felled tree lies along a direction of length 1 at most"];
  if (p.source) {
    if (p.verb !== "carve") return ["only a carve leaves a source"];
    if (!inMap(p.source.x, p.source.y)) return ["the carve's source is off the map"];
    if (!(p.source.strength > 0 && p.source.strength <= 8)) return ["a carve's source gives 0 to 8 water a second"];
  }
  if (p.lake) {
    if (p.verb !== "carve") return ["only a carve keeps an oxbow lake"];
    const { tiles, floor, depth, contamination } = p.lake;
    if (floor.length !== tiles.length || depth.length !== tiles.length || contamination.length !== tiles.length) return ["a carve's lake needs a floor, a depth and a contamination for each of its tiles"];
    let prev = -1;
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k];
      if (!Number.isInteger(i) || i <= prev || i >= W * H) return ["a carve's lake tiles must be on the map, in order, once each"];
      prev = i;
      if (!(floor[k] >= 0 && floor[k] <= 64)) return ["a carve's lake floors are 0 to 64"];
      if (!(depth[k] >= 0 && depth[k] <= 32)) return ["a carve's lake depths are 0 to 32"];
      if (!(contamination[k] >= 0 && contamination[k] <= 1)) return ["a carve's lake contamination is 0 to 1"];
    }
  }
  return [];
}

/** The history's word for a force (Try another's, a carve's own). */
export function forceLabel(p: ForceResultParams): string {
  if (p.replaces !== undefined) return p.verb === "carve" ? "Try another path" : "Try another";
  switch (p.verb) {
    case "carve":
      return (p.settings as { dry: boolean }).dry ? "Carve a dry canyon" : "Carve a river";
    case "craterize":
      return "Craterize";
    case "erupt":
      return p.settings.mode === "fissure" ? "Erupt a fissure" : "Erupt";
    case "quake":
      return p.settings.mode === "slide" ? "Quake: slide" : "Quake: lift";
  }
}
