// A small imported map with a cave and an overhang, for the tests of the brushes on runs (D280 (3)):
// ground at level 8, a 6 × 6 cave (air at z 3–5 under a roof two layers thick, z 6–7) and, on the
// east, a ledge three tiles out from a cliff over lowland at level 2 (solid z 5–7 over air). Every
// voxel is held up (the support rule: each reaches the wall within 3 sideways steps).

import type { BlocksParams } from "../../src/core/doc/blockTool";
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

/** A Block dig of the block at (x, y, z), from `side`. */
export const dig = (x: number, y: number, z: number, side: BlocksParams["side"]) => ({ op: "blocks" as const, params: { mode: "remove", side, at: [[x, y, z]], size: 1 } as BlocksParams });

/** The dry feet of hillsides, nothing near, each face `rise`+ higher to the east, in row order: the block
 *  at the foot's level in the face is dug from the side, a roof over the hollow. */
export function hillsides(s: MapSession, rise = 3): { x: number; y: number; z: number }[] {
  const b = s.built;
  const W = b.W;
  const near = new Set<number>();
  for (const e of b.entities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near.add((e.y + dy) * W + e.x + dx);
  const out: { x: number; y: number; z: number }[] = [];
  for (let y = 6; y < b.H - 6; y++)
    for (let x = 6; x < W - 6; x++) {
      const i = y * W + x;
      const f = i + 1;
      if (b.heights[f] - b.heights[i] < rise || b.heights[f + 1] < b.heights[f] || b.water[i] > 0 || b.water[f] > 0 || b.channel[i] || near.has(i) || near.has(f)) continue;
      if (b.heights[f - W] !== b.heights[f] || b.heights[f + W] !== b.heights[f]) continue;
      out.push({ x: x + 1, y, z: b.heights[i] });
    }
  return out;
}

/** The first of `hillsides`. */
export function hillside(s: MapSession, rise = 3): { x: number; y: number; z: number } {
  const h = hillsides(s, rise)[0];
  if (!h) throw new Error("no hillside");
  return h;
}

/** A dry, level 3 × 3 patch of ground and its ring, nothing on or near it, well above the water and away from the
 *  edge: a pit can be dug there, two deep, with a hollow under the ground east of it (`pitAndFill` in the tests). */
export function levelPatch(s: MapSession): { x: number; y: number; h: number } {
  const b = s.built;
  const W = b.W;
  const near = new Set<number>();
  for (const e of b.entities) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) near.add((e.y + dy) * W + e.x + dx);
  for (let y = 8; y < b.H - 8; y++)
    for (let x = 8; x < W - 8; x++) {
      const h = b.heights[y * W + x];
      let ok = h >= 6;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 4 && ok; dx++) {
          const i = (y + dy) * W + x + dx;
          if (b.heights[i] !== h || b.water[i] > 0 || b.channel[i] || near.has(i)) ok = false;
        }
      if (ok) return { x, y, h };
    }
  throw new Error("no patch");
}
