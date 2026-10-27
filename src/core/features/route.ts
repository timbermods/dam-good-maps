// Outflow channels: the way a badwater hollow's or a lake's water leaves (PLAN §9.5 badwater
// outlets, lakes by outlet sill). A route is stored in the feature (the generator's, or an old
// project's drawn lake's); rebuilds carve the stored route and never plan it again (PLAN §19.3).
//
// The carve: every route tile gets a channel of `width` tiles across (a square of side `width`
// around it, width 1, 3 or 5), at a bed level that never rises along the route, and the tiles
// around the channel are raised to one level above the bed where they are lower (banks), so the
// water stays in it. A bed that follows the ground down where the ground falls, and cuts through it
// where it rises, drains whatever the terrain.

import type { BuildTarget } from "./target";
import type { Feature } from "./schema";

export interface ChannelPlan {
  /** Route tiles from the first tile outside the piece to the outlet, as x0, y0, x1, y1, … */
  tiles: number[];
  /** Bed level per route tile, never rising along the route. */
  levels: number[];
  /** Channel width in tiles: 1, 3 or 5. */
  width: number;
  /** Where the water goes: "edge", or the id of the river or lake it joins. */
  to: string;
}

// ------------------------------------------------------------------------------------ carving

/** The tiles a carved channel writes: channel tiles with their bed, and bank tiles with the level
 *  they are raised to (at least). Computed from the plan alone, so every rebuild agrees. */
export function channelTiles(c: ChannelPlan, W: number, H: number): { bed: Map<number, number>; bank: Map<number, number> } {
  const r = (c.width - 1) >> 1;
  const bed = new Map<number, number>();
  const bank = new Map<number, number>();
  const n = c.levels.length;
  for (let k = 0; k < n; k++) {
    const x = c.tiles[2 * k];
    const y = c.tiles[2 * k + 1];
    const lv = c.levels[k];
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx;
        if (Math.abs(dx) <= r && Math.abs(dy) <= r) {
          const b = bed.get(i);
          if (b === undefined || lv < b) bed.set(i, lv);
        } else {
          const b = bank.get(i);
          if (b === undefined || lv + 1 > b) bank.set(i, lv + 1);
        }
      }
  }
  for (const i of bed.keys()) bank.delete(i);
  return { bed, bank };
}

/** Carve a stored channel into the target: beds exactly, banks raised where lower. Tiles in `keep`
 *  (the piece's own body, written after) and the last route tile's goal water are left to their
 *  owners. */
export function carveChannel(c: ChannelPlan, t: BuildTarget, f: Feature, keep?: (i: number) => boolean): void {
  const { bed, bank } = channelTiles(c, t.W, t.H);
  const h = t.heights;
  for (const [i, lv] of bed) {
    if (!t.inRegion(i) || !t.writable(i, f) || keep?.(i)) continue;
    // the channel never fills a river's or lake's water it drains into
    if (t.channel[i] && h[i] <= lv) continue;
    h[i] = lv;
    t.protect(i);
  }
  for (const [i, lv] of bank) {
    if (!t.inRegion(i) || !t.writable(i, f) || keep?.(i) || t.channel[i]) continue;
    if (h[i] < lv) h[i] = lv;
  }
}

/** The bounding rectangle of a stored channel, with its banks. */
export function channelBounds(c: ChannelPlan): { x0: number; y0: number; x1: number; y1: number } | null {
  const n = c.levels.length;
  if (!n) return null;
  const r = ((c.width - 1) >> 1) + 1;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const x = c.tiles[2 * k];
    const y = c.tiles[2 * k + 1];
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  }
  return { x0, y0, x1, y1 };
}

/** Problems of a stored channel: on the map, levels 0–16 and never rising, width 1, 3 or 5. */
export function checkChannel(c: ChannelPlan, W: number, H: number): string[] {
  if (!Array.isArray(c.tiles) || !Array.isArray(c.levels) || c.tiles.length !== 2 * c.levels.length || c.levels.length === 0) return ["the outflow channel is malformed"];
  if (![1, 3, 5].includes(c.width)) return ["the outflow channel is 1, 3 or 5 tiles wide"];
  for (let k = 0; k < c.levels.length; k++) {
    const x = c.tiles[2 * k];
    const y = c.tiles[2 * k + 1];
    if (!Number.isInteger(x) || !Number.isInteger(y) || !(x >= 0 && y >= 0 && x < W && y < H)) return ["the outflow channel leaves the map"];
    const lv = c.levels[k];
    if (!Number.isInteger(lv) || lv < 0 || lv > 16) return ["the outflow channel's levels are 0–16"];
    if (k > 0 && lv > c.levels[k - 1]) return ["the outflow channel's bed rises: water would not drain"];
    if (k > 0 && Math.abs(x - c.tiles[2 * k - 2]) + Math.abs(y - c.tiles[2 * k - 1]) !== 1) return ["the outflow channel's tiles must join side to side"];
  }
  return [];
}
