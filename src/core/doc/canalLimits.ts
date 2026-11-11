// A canal's limits (doc/canal.ts plans it), apart from the planner so the page's row reads them alone.

export const CANAL_MAX_WIDTH = 6;
export const CANAL_MAX_DEPTH = 3;
/** How much deeper than its depth the bed may be cut to keep falling through a rise in the land. */
export const CANAL_CUTTING = 3;
/** The longest line of tiles a canal follows. */
export const CANAL_MAX_LENGTH = 1024;
