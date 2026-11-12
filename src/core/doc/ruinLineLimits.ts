// A ruin line's limits (doc/ruinLine.ts lays it), apart from the planner so the page's row reads them alone.

export const RUIN_LINE_SPACING = { min: 1, max: 8, default: 3 } as const;
/** The share of the piers knocked out, at most (the two ends always stand). */
export const RUIN_LINE_BREAK = { min: 0, max: 0.8, default: 0.3 } as const;
/** The tallest ruin column the game has, in levels. */
export const RUIN_MAX_HEIGHT = 8;
