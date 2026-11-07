// The start under the pointer: its house, not only its pad. The lodge stands on its 3×3 deck, so a press on its roof
// or walls sees the house first; the ground the ray meets behind it may be tiles away, and the press would miss the
// start (showcase-craft gap 5).

import { LAYERS } from "../../render3d/model";
import { pickTerrain, type Ray, type TileHit } from "../../render3d/pick";

/** The height the press takes the house to, in levels: the lodge as drawn, its roof and chimney about two levels high
 *  (render3d/entities3d.ts `districtCenter`). Not the game's footprint (five levels of the district center's
 *  building), which would take presses on the ground seen above the lodge. */
const HOUSE_LEVELS = 2;

/** The tile of the start's house the ray meets first, or null where the ray meets other ground (or nothing) first.
 *  `start` is the house's middle tile; the house stands on the ground there. A layer cut hides what is above it,
 *  the house's upper levels too, as the view draws it. */
export function houseHit(ray: Ray, W: number, H: number, heights: Uint8Array, start: { x: number; y: number }, cut?: number): TileHit | null {
  const g = heights[start.y * W + start.x];
  const top = Math.min(31, g + HOUSE_LEVELS);
  const house = top >= 31 ? 0x7fffffff : (1 << top) - 1;
  const hit = pickTerrain(
    ray,
    W,
    H,
    (i) => {
      const ground = heights[i] >= 31 ? 0x7fffffff : (1 << heights[i]) - 1;
      const x = i % W;
      const y = (i - x) / W;
      return Math.abs(x - start.x) <= 1 && Math.abs(y - start.y) <= 1 ? ground | house : ground;
    },
    { cut, maxHeight: Math.max(top, LAYERS) },
  );
  return hit && Math.abs(hit.x - start.x) <= 1 && Math.abs(hit.y - start.y) <= 1 ? hit : null;
}
