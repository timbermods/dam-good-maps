// The shared 3D renderer (PLAN §3 `render3d`, EDITOR_PLAN §8). This module pulls in three.js, so
// the pages load it lazily: the generator's 3D toggle and the editor import it on demand.

export { MapRenderer, wheelDelta, type BuildStats, type FrameStats, type PointerTool, type ViewMode, type ViewState } from "./renderer";
export type { TileHit } from "./pick";
export * from "./model";
