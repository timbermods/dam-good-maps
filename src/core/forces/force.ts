// The forces of nature (PLAN §20 D194, D202, D203, D206, D246): Carve, Craterize, Erupt, Quake and
// Glaciate, built on this one shared core. A force is a run: it starts from the map as it stands and works on its own
// copy, a step at a time (ten steps are one second of the force on every machine, whatever the
// frame rate), until it ends by itself or the player stops it. Nothing it does depends on wall
// time, frames or effects, so the same input and the same number of steps give the same land.
//
// What a force leaves is literal (its result, result.ts): the tiles it changed and their new levels,
// the objects that lost their ground, and what it added (a carve's source). The document keeps that
// result as one operation (op.ts), which replays by assigning it, never by running the force again, so a
// later change to a force's rules never changes a map already made. The start's footprint and its
// margin are never touched, nor the land above the layer showing (D207), nor an imported map's
// caves.

import type { EntitySpec } from "../format/entities";
import { CEILING } from "../format/world";
import { JsonFloat } from "../format/json";
import type { WaterState } from "../sim/water";
import { footprint, type Fallen } from "./objects";

/** Steps of a force in one second of it (the player's pace changes only how fast they are shown). */
export const STEPS_PER_SECOND = 10;

/** The map a force works on: its ground, its objects, its water (the preview's), and its range. */
export interface ForceMap {
  W: number;
  H: number;
  heights: Uint8Array;
  entities: EntitySpec[];
  water: WaterState;
  /** The highest level a force may build to: the editor's one ceiling (D244). */
  maxHeight: number;
  /** Hardness (0–1) of each whole level, when the map has its rock layers (absent: derived). */
  rockLayers?: number[];
  /** Fresh volcanic rock, a bit per level of each tile (rock.ts); absent: none. */
  lava?: Uint32Array;
  /** Trees knocked down by earlier forces, as they lie (objects.ts). */
  fallen?: Fallen[];
  /** Ids the document has used besides the objects standing (an object placed and since removed,
   *  `MapSession.usedEntityIds`): a force naming new objects skips them, as the operation's check
   *  refuses them. Absent: only the standing objects' ids are taken. */
  usedIds?: ReadonlySet<string>;
}

/** The highest level a force builds to: the editor's one ceiling on every map, D172's tall maximum
 *  (D244; before it 16, or a tall map's own top). A map a force raises past 16 becomes tall. */
export function forceCeiling(_heights?: ArrayLike<number>): number {
  return CEILING;
}

/** A force's map with everything the verbs read filled in. */
export interface FullForceMap extends ForceMap {
  rockLayers: number[];
  lava: Uint32Array;
  fallen: Fallen[];
}

/** Objects as plain JSON (a force works on copies; the exact numbers of a file stay in the map's). */
export const plainEntities = (e: readonly EntitySpec[]): EntitySpec[] => JSON.parse(JSON.stringify(e, (_k, v) => (v instanceof JsonFloat ? v.value : v)));

/** A copy of a force's map that shares nothing with it. */
export function snapshotMap<T extends ForceMap>(m: T): T {
  return {
    ...m,
    heights: m.heights.slice(),
    entities: plainEntities(m.entities),
    ...(m.rockLayers ? { rockLayers: m.rockLayers.slice() } : {}),
    ...(m.fallen ? { fallen: structuredClone(m.fallen) } : {}),
    ...(m.lava ? { lava: m.lava.slice() } : {}),
    water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() },
  };
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
  /** Its water is badwater (an unleashed badwater source's carve): the effects' surge is murky. */
  bad?: boolean;
}

/** The tiles an object stands on (objects.ts `footprint`). */
export const entityTiles = (W: number, H: number, e: Pick<EntitySpec, "template" | "x" | "y" | "orientation" | "flipped">): number[] => footprint({ W, H }, e);

/** The ground no force touches: `also` (the land above the layer showing, an imported map's
 *  caves). The start's is not among it: a force is bound only by nature, and the start is carried
 *  to level ground when a force breaks its own (D257). */
export function protectedGround(m: Pick<ForceMap, "W" | "H">, also: Uint8Array | null = null): Uint8Array {
  return also ? also.slice() : new Uint8Array(m.W * m.H);
}
