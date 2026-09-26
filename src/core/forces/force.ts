// The forces of nature (PLAN §20 D194, D202, D203, D206): Carve, Craterize, Quake and Erupt, built on
// this one shared core. A force is a run: it starts from the map as it stands and works on its own
// copy, a step at a time (ten steps are one second of the force on every machine, whatever the
// frame rate), until it ends by itself or the player stops it. Nothing it does depends on wall
// time, frames or effects, so the same input and the same number of steps give the same land.
//
// What a force leaves is literal (its result): the tiles it changed and their new levels, the
// objects that lost their ground, and what it added (a carve's source). The document keeps that
// result as one operation, which replays by assigning it, never by running the force again, so a
// later change to a force's rules never changes a map already made. The start's footprint and its
// margin are never touched, nor the land above the layer showing (D207), nor an imported map's
// caves.

import type { EntitySpec } from "../format/entities";
import { FOOTPRINTS } from "../format/footprints";
import { objectTile } from "../sim/model";
import type { WaterState } from "../sim/water";

/** Steps of a force in one second of it (the player's pace changes only how fast they are shown). */
export const STEPS_PER_SECOND = 10;

/** The map a force works on: its ground, its objects, its water (the preview's), and its range. */
export interface ForceMap {
  W: number;
  H: number;
  heights: Uint8Array;
  entities: EntitySpec[];
  water: WaterState;
  /** The highest level a force may build to (16; 22 on tall maps). */
  maxHeight: number;
  /** Hardness (0–1) of each whole level, when the map has its rock layers (absent: derived). */
  rockLayers?: number[];
}

/** One stream of a force's head (a carve splits into two round a hard rock core). */
export interface Lane {
  x: number;
  y: number;
  width: number;
}

/** Where a force's front is and what it is doing there (for the camera and the effects). */
export interface ForceHead {
  x: number;
  y: number;
  z: number;
  /** Its heading. */
  dx: number;
  dy: number;
  width: number;
  event: "surge" | "breakthrough" | "waterfall" | "rock" | "split" | "rapids" | "oxbow";
  /** Blocks cut at the front in the last step (the effects' dust). */
  cut: number;
  lanes?: Lane[];
}

/** A force at work, as the editor drives it: a step at a time on its own copy of the map. */
export interface ForceRun {
  readonly map: ForceMap;
  /** The ground when it started. */
  readonly original: Uint8Array;
  readonly head: ForceHead;
  /** It has ended by itself (and its last changes have settled). */
  readonly done: boolean;
  /** Why it ended ("destination", "lake", "power spent", …), once it has. */
  readonly reason: string;
  readonly steps: number;
  /** One step: the tiles whose ground changed. */
  step(): number[];
  /** The objects it added to the map (a carve's source), by id. */
  readonly added: readonly string[];
}

/** The tiles an object stands on. */
export function entityTiles(W: number, H: number, e: Pick<EntitySpec, "template" | "x" | "y" | "orientation" | "flipped">): number[] {
  const fp = FOOTPRINTS[e.template]?.size ?? [1, 1, 1];
  const out: number[] = [];
  for (let y = 0; y < fp[1]; y++)
    for (let x = 0; x < fp[0]; x++) {
      const [xx, yy] = objectTile(e as Parameters<typeof objectTile>[0], x, y);
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) out.push(yy * W + xx);
    }
  return out;
}

/** The ground no force touches: the start's footprint and a tile round it, and `also` (the land
 *  above the layer showing, an imported map's caves). */
export function protectedGround(m: Pick<ForceMap, "W" | "H" | "entities">, also: Uint8Array | null = null): Uint8Array {
  const keep = also ? also.slice() : new Uint8Array(m.W * m.H);
  for (const e of m.entities)
    if (e.template === "StartingLocation")
      for (const i of entityTiles(m.W, m.H, e))
        for (let y = -1; y <= 1; y++)
          for (let x = -1; x <= 1; x++) {
            const xx = (i % m.W) + x;
            const yy = Math.floor(i / m.W) + y;
            if (xx >= 0 && yy >= 0 && xx < m.W && yy < m.H) keep[yy * m.W + xx] = 1;
          }
  return keep;
}

/** What a force left, literally: the changed tiles (sorted) and their new levels, the objects that
 *  lost their ground, and the ones it added. */
export interface ForceResult {
  tiles: number[];
  heights: number[];
  removed: string[];
  added: EntitySpec[];
}

/** A run's result against the map it started from. `keepIds` are objects the result never lists
 *  as removed (the ones the build derives again from the ground, such as its slopes). */
export function forceResult(before: Pick<ForceMap, "heights" | "entities">, run: ForceRun, keepIds: (e: EntitySpec) => boolean = () => false): ForceResult {
  const tiles: number[] = [];
  const heights: number[] = [];
  const after = run.map.heights;
  for (let i = 0; i < after.length; i++)
    if (after[i] !== before.heights[i]) {
      tiles.push(i);
      heights.push(after[i]);
    }
  const still = new Set(run.map.entities.map((e) => e.id));
  const removed = before.entities.filter((e) => !still.has(e.id) && !keepIds(e)).map((e) => e.id);
  const added = run.map.entities.filter((e) => run.added.includes(e.id));
  return { tiles, heights, removed, added };
}
