// What a new blank map may be (doc/blank.ts makes it): its sizes, its ground levels and the refusal's one line. Apart from
// blank.ts so the page's dialog reads them without loading the map builder.

import { CEILING } from "../format/world";
import { SIZE_PRESETS } from "../spec/mapspec";

/** The sizes a blank map is offered in: the generator's own (a square that side). */
export const BLANK_SIZES: readonly number[] = Object.values(SIZE_PRESETS);
/** The ground level a blank map starts at unless the player picks one: the middle of what the game's own editor edits,
 *  with room to cut lakes down as well as to raise hills (planning, 2026-11-11). */
export const BLANK_LEVEL = 8;
/** The highest ground a blank map starts at: the level the game's own map editor works up to. */
export const BLANK_MAX_LEVEL = 16;
export const BLANK_NAME = "Blank map";

/** Why a blank map of this size at this ground level can't be made, in one line, or null. */
export function blankProblem(size: number, level: number): string | null {
  if (!BLANK_SIZES.includes(size)) return `a blank map's size must be one of ${BLANK_SIZES.join(", ")}, not ${size}`;
  if (!Number.isInteger(level) || level < 1 || level > Math.min(BLANK_MAX_LEVEL, CEILING)) return `a blank map's ground level must be a whole number from 1 to ${Math.min(BLANK_MAX_LEVEL, CEILING)}, not ${level}`;
  return null;
}

