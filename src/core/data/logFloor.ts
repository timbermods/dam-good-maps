// The starting-logs floor (PLAN §20 D224, amended by D227), as `tools/log-floor.ts` computed it
// from the installed game's own blueprints and pinned it in log-floor.json: the logs a colony needs
// to reach a Forester by the worst still-viable route, plus the first essentials (a water pump, a
// dwelling and, for Iron Teeth, a Breeding Pod), plus 10%. Every map, at every difficulty, has at
// least this many logs within about 40 tiles' walk of the district center, over the map's ground and
// its natural slopes ("can I survive"; Minimum starting wood, within 20 tiles, is "how comfortable
// is it"). Rerun the tool when the game's version changes; nothing here hard-codes the numbers.

import data from "./log-floor.json" with { type: "json" };

/** The floor, in logs (178 for 1.1.2.4). */
export const LOG_FLOOR: number = data.floor;

/** The walk from the district center the floor's logs are counted within, in tiles (40). */
export const LOG_FLOOR_WALK: number = data.withinWalk;

/** The game version the floor was computed for. */
export const LOG_FLOOR_GAME_VERSION: string = data.gameVersion;

/** The logs a grown tree gives, by template, from the game's blueprints (Pine 2, Birch 1, Oak 8,
 *  Maple 6, ChestnutTree 4, Mangrove 2). */
export const LOGS_PER_TREE_SPECIES: Readonly<Record<string, number>> = data.logsPerTree;

/** Whether a dead grown tree keeps its logs, by template (every tree that gives logs does in
 *  1.1.2.4; only the Succulent loses its yield when it dies, and it gives no logs). */
export const DEAD_TREES_KEEP_LOGS: Readonly<Record<string, boolean>> = data.deadTreesKeepLogs;
