// A drawn lake's limits (doc/lake.ts plans it), apart from the planner so the page's row reads them alone.

/** The deepest its channel lies under the lake's level. */
export const LAKE_MAX_DEPTH = 5;
/** How many levels a gap in its rim may be raised to make the rim whole; a lower gap is refused, named. */
export const LAKE_RIM_RAISE = 3;
/** The fewest and the most tiles a drawn outline may take in. */
export const LAKE_MIN_TILES = 4;
export const LAKE_MAX_TILES = 16384;
/** The most points an outline keeps. */
export const LAKE_MAX_POINTS = 512;
