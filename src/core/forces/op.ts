// A force as the document keeps it (PLAN §20 D194, D202, D203, D206, D220): one operation,
// `forceResult`, one undo step, its result stored literally (from investigation/forces-core's
// `core/operation.ts`, fitted to the document). The five forces share it: what the player asked for
// (the force, its settings and where: a record, since a replay never runs the force again), then what
// it left: the changed tiles and their levels, the fresh volcanic rock on them (rock.ts), the objects
// that lost their ground, the ones it carried (a Slide), the trees it knocked down (dead, lying away
// from the blow), a carve's source and sealed oxbow lake, a glacier's springs and tarn. "Try another"
// replaces the force before it (`replaces`): undoing it brings that one back. The build applies its
// levels with the sculpts (step 6, kept out of the integrity pass) and its objects' changes with the
// entity edits.
//
// Projects saved with the `carve` operation, from before the forces shared this one, become
// `forceResult` when they open (`forceOfCarve`, doc/document.ts), and build exactly as they did.

import * as portable from "../math/portable";
import type { Rect } from "../features/target";
import type { RetainedWater } from "../sim/water";
import { forceSettingsProblems } from "./settings";

export { forceSettingsProblems };

export type Verb = "carve" | "craterize" | "erupt" | "quake" | "glaciate" | "rift" | "deposit";
export const VERBS: readonly Verb[] = ["carve", "craterize", "erupt", "quake", "glaciate", "rift", "deposit"];

/** Where a force was asked to act, in tiles: a carve's origin and aimed end, an impact and the way
 *  its impactor travelled (Aim), a vent, a painted fissure or fault (sub-tile points, to 0.01) and
 *  the side of the fault that moved. */
export interface ForceWhere {
  origin?: [number, number];
  end?: [number, number];
  path?: [number, number][];
  side?: 1 | -1;
  /** Unleash (D239): the placed source whose water the carve became (it stays; no source added). */
  source?: string;
}

/** A force's settings, as each force's options row sets them (the seed is its personality). */
export type ForceSettingsRecord =
  | { mode: "fan"; power: number; size: number | null; channels: "auto" | "few" | "many"; seed: number; floor: number }
  | { mode: "drop"; power: number; size: number | null; walls: "auto" | "sheer" | "stepped"; seed: number; floor: number }
  | { mode: "unleash" | "aim"; power: number; wander: number; width: number | null; seed: number; walls: "steep" | "wide"; defyGravity: boolean; dry: boolean; depth?: number | null; floor?: number; riverDepth?: number | null; banks?: number }
  | { mode: "strike" | "aim"; power: number; size: number | null; walls: "steep" | "terraced"; centre: "auto" | "bowl" | "peak" | "ring" | "flat"; debris: "light" | "heavy"; rays: boolean; seed: number; floor?: number }
  | { mode: "vent" | "fissure"; power: number; shape: "steep" | "broad"; summit: "auto" | "peak" | "crater" | "caldera"; flows: "light" | "heavy"; ridges: boolean; seed: number; size?: number | null; floor?: number }
  | { mode: "lift" | "slide"; power: number; scarp: "sheer" | "stepped"; seed: number; floor?: number }
  | { mode: "flow" | "aim"; power: number; size: number | null; meltwater: boolean; seed: number; benches?: "none" | "some" | "many"; steps?: "few" | "some" | "many"; tarn?: boolean; scree?: boolean; floor?: number };

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
  /** Carve's Keep river: the water source it leaves at the origin (the group's anchor since D314). */
  source?: { id: string; x: number; y: number; strength: number };
  /** Carve's Keep river since D314: the rest of its source group, a row across the flow beside the
   *  anchor (core/water/sourceGroups.ts), the strength shared (absent on carves from before); Glaciate's
   *  springs (D246): its cirque head's and its hanging valleys' (Meltwater). */
  sources?: { id: string; x: number; y: number; strength: number }[];
  /** Carve's sealed oxbow lake, Glaciate's tarn: the water it keeps (carve/run.ts `retained`). */
  lake?: RetainedWater;
  /** Try another: the force (its operation's seq) this one replaces. */
  replaces?: number;
}

/** A force's result (its params carry tiles, heights and the objects it took). */
export function isForce(p: object): p is ForceResultParams {
  return "tiles" in p && "heights" in p && "removed" in p;
}

/** A carve as a project saved before D220 keeps it: the `carve` operation's params, which opening the
 *  project turns into `forceResult` (`forceOfCarve`). */
export interface SavedCarve {
  mode: "unleash" | "aim";
  origin: [number, number];
  end?: [number, number];
  power: number;
  wander: number;
  width: number | null;
  depth?: number;
  floor?: number;
  riverDepth?: number | null;
  banks?: number;
  seed: number;
  walls: "steep" | "wide";
  defyGravity: boolean;
  dry: boolean;
  cut?: number;
  steps: number;
  reason: string;
  tiles: number[];
  heights: number[];
  removed: string[];
  source?: { id: string; x: number; y: number; strength: number };
  sources?: { id: string; x: number; y: number; strength: number }[];
  lake?: RetainedWater;
  replaces?: number;
}

/** A saved `carve` as the shared operation: the build applies it exactly as it applied the `carve`. */
export function forceOfCarve(p: SavedCarve): ForceResultParams {
  return {
    version: 1,
    verb: "carve",
    settings: { mode: p.mode, power: p.power, wander: p.wander, width: p.width, seed: p.seed, walls: p.walls, defyGravity: p.defyGravity, dry: p.dry, ...(p.depth != null ? { depth: p.depth } : {}), ...(p.floor != null ? { floor: p.floor } : {}), ...(p.riverDepth !== undefined ? { riverDepth: p.riverDepth } : {}), ...(p.banks != null ? { banks: p.banks } : {}) },
    where: { origin: p.origin, ...(p.end ? { end: p.end } : {}) },
    ...(p.cut !== undefined ? { cut: p.cut } : {}),
    steps: p.steps,
    reason: p.reason,
    tiles: p.tiles,
    heights: p.heights,
    removed: p.removed,
    ...(p.source ? { source: p.source } : {}),
    ...(p.sources?.length ? { sources: p.sources } : {}),
    ...(p.lake ? { lake: p.lake } : {}),
    ...(p.replaces !== undefined ? { replaces: p.replaces } : {}),
  };
}

/** The rectangle of tiles a force changed (null: none). */
export function forceBounds(p: Pick<ForceResultParams, "tiles">, W: number): Rect | null {
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
  if (w.path && !(w.path.length >= ((p.verb === "rift" || p.verb === "deposit") ? 1 : 2) && w.path.length <= 512 && w.path.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= W - 1 && y <= H - 1))) return [p.verb === "rift" || p.verb === "deposit" ? "a rift's or deposit's line needs 1 to 512 points on the map" : "a painted line needs 2 to 512 points on the map"];
  if (p.verb === "deposit" && !w.path?.length) return ["a deposit needs its origin"];
  if (p.verb === "rift" && !w.path?.length) return ["a rift needs its fault"];
  if (p.verb === "quake") {
    if (!w.path) return ["a quake needs its fault"];
    if (w.side !== 1 && w.side !== -1) return ["a quake's side is 1 or -1"];
  } else if (p.verb !== "rift" && p.verb !== "deposit" && !w.origin) return ["a force needs the point it started from"];
  if (p.verb === "erupt" && mode === "fissure" && !w.path) return ["a fissure needs its line"];
  if ((p.verb === "carve" || p.verb === "craterize" || p.verb === "glaciate") && mode === "aim" && !w.end) return ["an aimed force needs its end point"];
  if (w.source !== undefined && !(p.verb === "carve" && typeof w.source === "string" && w.source.length > 0 && !p.source)) return ["only a carve unleashes a source (named by its id), and it adds none of its own"];
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
      if (!Number.isInteger(b) || b < 0 || b >= portable.pow(2, 22)) return ["a force's rock is a bit for each of the levels 0 to 21"];
    }
  }
  for (const m of p.moved ?? []) if (!inMap(m.x, m.y)) return ["an object a force carried must stay on the map"];
  for (const f of p.felled ?? []) if (!(Number.isFinite(f.dx) && Number.isFinite(f.dy) && Math.abs(f.dx) <= 1.5 && Math.abs(f.dy) <= 1.5)) return ["a felled tree lies along a direction of length 1 at most"];
  // a carve that keeps its river leaves the rest of its row (D314); a glacier leaves its springs (D246)
  if (p.sources !== undefined && p.verb !== "glaciate") {
    if (p.verb !== "carve" || !p.source) return ["only a carve that keeps its river, or a glacier, leaves a row of sources"];
    if (!Array.isArray(p.sources) || p.sources.length > 15) return ["a carve's row has at most 16 sources"];
    for (const s of p.sources) {
      if (!inMap(s.x, s.y)) return ["the carve's source is off the map"];
      if (!(s.strength > 0 && s.strength <= 8)) return ["a carve's source gives 0 to 8 water a second"];
    }
  }
  if (p.source) {
    if (p.verb !== "carve") return ["only a carve leaves a source"];
    if (!inMap(p.source.x, p.source.y)) return ["the carve's source is off the map"];
    if (!(p.source.strength > 0 && p.source.strength <= 8)) return ["a carve's source gives 0 to 8 water a second"];
  }
  if (p.sources && p.verb === "glaciate") {
    if (!Array.isArray(p.sources) || p.sources.length > 256) return ["a glacier leaves 256 springs at most"];
    for (const q of p.sources) {
      if (!inMap(q.x, q.y)) return ["a glacier's spring is off the map"];
      if (!(q.strength > 0 && q.strength <= 8)) return ["a glacier's spring gives 0 to 8 water a second"];
    }
    if (new Set(p.sources.map((q) => q.id)).size !== p.sources.length) return ["a glacier's springs each have their own id"];
  }
  if (p.lake) {
    if (p.verb !== "carve" && p.verb !== "glaciate") return ["only a carve or a glacier keeps a lake"];
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
  if (p.replaces !== undefined) return p.verb === "carve" ? (p.where.source ? "Try another course" : "Try another path") : "Try another";
  switch (p.verb) {
    case "carve":
      return p.where.source ? "Unleash a source" : (p.settings as { dry: boolean }).dry ? "Carve a dry canyon" : "Carve a river";
    case "craterize":
      return "Craterize";
    case "erupt":
      return (p.settings as { mode?: string }).mode === "fissure" ? "Erupt a fissure" : "Erupt";
    case "quake":
      return (p.settings as { mode?: string }).mode === "slide" ? "Quake: slide" : "Quake: lift";
    case "glaciate":
      return "Glaciate";
    case "rift":
      return "Rift";
    case "deposit":
      return "Deposit";
  }
}
