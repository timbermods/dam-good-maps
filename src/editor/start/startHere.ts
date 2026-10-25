// The start's place on the map.

import type { Orientation } from "../../core/format/footprints";

/** The start's middle tile, its facing and the entity or feature it belongs to. */
export interface StartHere {
  x: number;
  y: number;
  orientation: Orientation;
  /** The start feature (generated maps), or null for an imported map's own StartingLocation. */
  feature: string | null;
  /** Whose objects the fit check leaves out: the start feature's id, or null for an imported start (every imported
   *  object is owned by "import", so the start is left out by what it is, not by owner). */
  owner: string | null;
}

/** Where a map without a start would put one: facing as a new start does. */
export const NO_START_HERE: StartHere = { x: -1, y: -1, orientation: "Cw0", feature: null, owner: null };
