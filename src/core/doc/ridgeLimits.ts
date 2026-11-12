// A ridge's limits (doc/ridge.ts plans it), apart from the planner so the page's row reads them alone.

export const RIDGE_MIN_HEIGHT = 2;
export const RIDGE_MAX_HEIGHT = 10;
export const RIDGE_MIN_WIDTH = 4;
export const RIDGE_MAX_WIDTH = 20;
/** The longest line a ridge follows, in tiles. */
export const RIDGE_MAX_LENGTH = 512;
/** The shortest, in tiles. */
export const RIDGE_MIN_LENGTH = 3;
/** Which side is steep: the side the drag curves away from (`auto`), or left or right of the drag's way. */
export type RidgeSteep = "auto" | "left" | "right";
