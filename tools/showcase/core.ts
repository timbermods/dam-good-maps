// What the showcase scripts take from the core, in one place: `run.mjs` bundles this file once, so a change to a
// map's script runs in seconds. Everything here is the core's own (src/core, the MCP server's wrappers over it and
// the tools' PNG writer): the scripts change a map only through `MapSession` operations (D342).

export { MapSession } from "../../src/core/doc/session";
export type { EditOp } from "../../src/core/doc/ops";
export { writeTimber, readTimber, type TimberFile } from "../../src/core/format/timber";
export { emptySimulationSingletons, settledSimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
export { applyOps, checksOf, exportFiles, rowOf, Refused } from "../../mcp/src/maps";
export { HazardRun, hazardSoil, hazardDays, HAZARD_DAYS } from "../../src/core/sim/weather";
export { TICKS_PER_DAY } from "../../src/core/sim/water";
export { openingCamera, openingFrame, frameAt, fallInView, prepareOpening, openingShotScore, VISTA_ZOOM } from "../../src/core/analysis/opening";
export { fallsOf } from "../../src/core/analysis/vertical";
export { shadeTiles } from "../../src/core/render/shade";
export { encodePng } from "../png";
export { startMiddleTile, ORIENTATIONS, FOOTPRINTS } from "../../src/core/format/footprints";
export { mapObjects } from "../../src/core/sim/model";
export { toMapObject } from "../../src/core/features/build";
export { decodeProject } from "../../src/core/doc/document";
export { blockFalls } from "../../src/core/doc/blockTool";
