// The start under the pointer: its house, not only its pad. The tower stands on its 3×3, so a press on its roof, walls
// or lantern sees the house first; the ground the ray meets behind it may be tiles away, and the press would miss the
// start (showcase-craft gap 5).

import { LAYERS } from "../../render3d/model";
import { pickTerrain, type Ray, type TileHit } from "../../render3d/pick";

/** The heights the press takes the house to, in levels: the tower as drawn (render3d/entities3d.ts `startTower`, the
 *  game's StartingLocation model, D496): its walls and roof over the 3×3 to about two levels, the lantern tower on the
 *  middle tile to 4.37. Not the game's footprint (five levels over the whole 3×3), which would take presses on the
 *  ground seen above the walls. */
const HOUSE_LEVELS = 2;
const TOWER_LEVELS = 4;

/** The tile of the start's house the ray meets first, or null where the ray meets other ground (or nothing) first.
 *  `start` is the house's middle tile; the house stands on the ground there. A layer cut hides what is above it,
 *  the house's upper levels too, as the view draws it. */
export function houseHit(ray: Ray, W: number, H: number, heights: Uint8Array, start: { x: number; y: number }, cut?: number): TileHit | null {
  const g = heights[start.y * W + start.x];
  const mask = (levels: number) => (g + levels >= 31 ? 0x7fffffff : (1 << (g + levels)) - 1);
  const house = mask(HOUSE_LEVELS);
  const tower = mask(TOWER_LEVELS);
  const hit = pickTerrain(
    ray,
    W,
    H,
    (i) => {
      const ground = heights[i] >= 31 ? 0x7fffffff : (1 << heights[i]) - 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x === start.x && y === start.y) return ground | tower;
      return Math.abs(x - start.x) <= 1 && Math.abs(y - start.y) <= 1 ? ground | house : ground;
    },
    { cut, maxHeight: Math.max(Math.min(31, g + TOWER_LEVELS), LAYERS) },
  );
  return hit && Math.abs(hit.x - start.x) <= 1 && Math.abs(hit.y - start.y) <= 1 ? hit : null;
}
