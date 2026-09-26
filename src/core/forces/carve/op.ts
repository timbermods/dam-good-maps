// A carve as the document keeps it (D194, D199): one operation, one undo step, its result stored
// literally (force.ts), so a replay assigns it and never runs the carve again. The build applies
// its levels with the sculpts (step 6, the tiles kept out of the integrity pass, as a precise
// stroke's are), then its objects' changes with the entity edits (the objects that lost their
// ground, and the source it keeps). "Try another path" is a carve that replaces the last one: the
// document then leaves the earlier carve out, and undoing it brings that carve back. A carve that
// sealed an oxbow lake keeps the lake's water (`lake`, water.ts): the map's water settles from it.

import type { Rect } from "../../features/target";
import type { RetainedWater } from "../../sim/water";

export interface CarveParams {
  /** What the player asked for (a record: replay never runs the carve). */
  mode: "unleash" | "aim";
  origin: [number, number];
  end?: [number, number];
  power: number;
  wander: number;
  /** Nominal width in tiles, or null when it followed Power. */
  width: number | null;
  seed: number;
  walls: "steep" | "wide";
  defyGravity: boolean;
  dry: boolean;
  /** The layer showing when it ran (D207): the ground above it was left as it was. */
  cut?: number;
  /** Steps it ran (ten a second), and why it ended ("stopped" when the player stopped it). */
  steps: number;
  reason: string;
  /** Its result: the changed tiles, ascending, and their new levels. */
  tiles: number[];
  heights: number[];
  /** Objects that lost their ground. */
  removed: string[];
  /** Keep river: the water source it leaves at the origin (its strength follows the Width). */
  source?: { id: string; x: number; y: number; strength: number };
  /** The water its sealed oxbow lake keeps (its tiles ascending, their floors, depths and
   *  contamination then). */
  lake?: RetainedWater;
  /** Try another path: the carve (its operation's seq) this one replaces. */
  replaces?: number;
}

export function isCarve(p: object): p is CarveParams {
  return "tiles" in p && "heights" in p && "removed" in p;
}

/** The rectangle of tiles a carve changed (null: none). */
export function carveBounds(p: CarveParams, W: number): Rect | null {
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

/** Why a carve's result does not fit a W × H map with levels up to `maxLevel` (empty when it does). */
export function carveProblems(p: CarveParams, W: number, H: number, maxLevel: number): string[] {
  const inMap = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H;
  if (!inMap(p.origin[0], p.origin[1])) return ["the carve's origin is off the map"];
  if (p.mode === "aim" && (!p.end || !inMap(p.end[0], p.end[1]))) return ["an aimed carve needs its end point on the map"];
  if (p.tiles.length !== p.heights.length) return ["a carve needs a level for each of its tiles"];
  let last = -1;
  for (let k = 0; k < p.tiles.length; k++) {
    const i = p.tiles[k];
    if (!Number.isInteger(i) || i <= last || i >= W * H) return ["a carve's tiles must be on the map, in order, once each"];
    last = i;
    const h = p.heights[k];
    if (!Number.isInteger(h) || h < 0 || h > maxLevel) return [`a carve's levels are 0 to ${maxLevel}`];
  }
  if (p.source) {
    if (!inMap(p.source.x, p.source.y)) return ["the carve's source is off the map"];
    if (!(p.source.strength > 0 && p.source.strength <= 8)) return ["a carve's source gives 0 to 8 water a second"];
  }
  if (p.lake) {
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
