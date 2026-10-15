// A small imported map with a cave and an overhang, for the tests of the brushes on runs (D280 (3)):
// ground at level 8, a 6 × 6 cave (air at z 3–5 under a roof two layers thick, z 6–7) and, on the
// east, a ledge three tiles out from a cliff over lowland at level 2 (solid z 5–7 over air). Every
// voxel is held up (the support rule: each reaches the wall within 3 sideways steps).

import { MapSession } from "../../src/core/doc/session";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";

export const CAVE_W = 40;
export const CAVE_H = 40;
/** The cave's tiles (inclusive) and its air. */
export const CAVE = { x0: 15, y0: 15, x1: 20, y1: 20, air: [3, 6] as const };
/** The ledge's tiles (inclusive): solid from z 5 to 8 over the lowland's air. */
export const LEDGE = { x0: 30, y0: 10, x1: 32, y1: 14, solid: [5, 8] as const };
/** Where the lowland starts (x ≥ this, level 2). */
export const LOWLAND_X = 30;

export function caveVoxels(): Uint8Array {
  const W = CAVE_W;
  const H = CAVE_H;
  const N = W * H;
  const heights = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = x >= LOWLAND_X ? 2 : 8;
  const v = voxelsFromHeights(heights, W, H);
  for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = CAVE.x0; x <= CAVE.x1; x++) for (let z = CAVE.air[0]; z < CAVE.air[1]; z++) v[z * N + y * W + x] = 0;
  for (let y = LEDGE.y0; y <= LEDGE.y1; y++) for (let x = LEDGE.x0; x <= LEDGE.x1; x++) for (let z = LEDGE.solid[0]; z < LEDGE.solid[1]; z++) v[z * N + y * W + x] = 1;
  return v;
}

export function caveFile(voxels = caveVoxels()): TimberFile {
  return {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-14 00:00:00", sizeX: CAVE_W, sizeY: CAVE_H, layers: LAYERS, voxels, singletons: emptySimulationSingletons(CAVE_W, CAVE_H), entities: [] },
    extraFiles: [],
  };
}

export function caveSession(): MapSession {
  return MapSession.importMap(writeTimber(caveFile()), "cave.timber");
}
