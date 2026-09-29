// The start's own land (the forces-preview feedback's item 47, PLAN §20 D325, D331): the moist
// farmland and the level building land within 20 tiles' walk of the start, with no stairs (the
// walk: analysis/walk.ts). Real places choose their start by it (tools/places/finish.ts, D331 (3)).
//
// M9b counts the same inside its validators (`start.farmland`, `start.level_land`, on
// feature/m9b's validate/playability.ts, with the same numbers). This is the callable piece; when M9b
// lands, those checks call it and the numbers live in one place.

import { reachAt } from "./walk";

/** Moist farmland (dry, clean soil the water keeps moist) a start wants within 20 tiles' walk: its
 *  first farmland without stairs (M9b's `FARMLAND_NEAR`). */
export const FARMLAND_NEAR = 100;
/** Level building land a start wants within 20 tiles' walk, as tiles of a level, dry 2×2: its first
 *  buildings without reshaping, the bench the settler asks for at Normal's start area (M9b's
 *  `LEVEL_LAND.normal`; 79 small, 180 large). */
export const LEVEL_LAND_NORMAL = 113;
/** Gatherers, lumberjacks and farmers work within 20 steps (validate/playability.ts `NEAR`). */
const NEAR = 20;
/** Water deeper than this is not dry land (validate/playability.ts `WET`). */
const WET = 0.05;

export interface StartLandInput {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** The start's walk (walk.ts `walkDistance`). */
  walk: Float64Array;
  /** The settled water's depth, and the soil it leaves. */
  depth: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** Tiles objects take (walk blockers, other objects), when any. */
  blocked?: Uint8Array | null;
}

/** The moist farmland and the level building land within 20 tiles' walk of the start. */
export function startLand(inp: StartLandInput): { farmland: number; level: number } {
  const { W, H, heights: h, walk, depth, moisture: M, soilContamination: SC } = inp;
  const N = W * H;
  const blocked = inp.blocked ?? null;
  const wet = (i: number) => depth[i] > WET;
  const free = (i: number) => !wet(i) && !blocked?.[i];
  const flat = new Uint8Array(N);
  for (let y = 0; y + 1 < H; y++)
    for (let x = 0; x + 1 < W; x++) {
      const i = y * W + x;
      const v = h[i];
      if (h[i + 1] !== v || h[i + W] !== v || h[i + W + 1] !== v) continue;
      if (!free(i) || !free(i + 1) || !free(i + W) || !free(i + W + 1)) continue;
      flat[i] = flat[i + 1] = flat[i + W] = flat[i + W + 1] = 1;
    }
  let farmland = 0;
  let level = 0;
  for (let i = 0; i < N; i++) {
    if (wet(i) || reachAt(walk, W, H, i) > NEAR) continue;
    if (M[i] > 0 && !(SC[i] > 0) && !blocked?.[i]) farmland++;
    if (flat[i]) level++;
  }
  return { farmland, level };
}
