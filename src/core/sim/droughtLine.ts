// The drought line (the Weather view, D133, D269; ROADMAP.md "Weather view"): where each lake and
// river's water will stand on the last day of a drought, which beds dry out, and which water is the
// start's. Read from two water states the editor already has, never simulated here: the map's settled
// water (day 0) and the Drought view's last day (`weather.ts` `HazardRun` with every source stopped,
// the run the worker keeps day by day). So the line and the Drought view's last day agree tile for
// tile: a tile holds water on the last day exactly when the view draws water there (deeper than
// `WATER_BODY`, render3d/model.ts `WET`). Every claim is the model's: the sources stop, the water
// drains through the map's edges and evaporates (the cycles investigation's verified rules, through
// `HazardRun`); nothing here promises a colony survives. On a map with caves or overhangs both are
// the water seen from above, each tile's top column (the Drought view's run is the stacked engine's
// there, #391), on the map's surface: the line runs on the water a player sees from above.

import { tileShoreWalk, walkDistance, walkWorld, PUMP_CLEAN, WATER_BODY, type WalkObject } from "../analysis/walk";
import { components } from "../analysis/regions";

/** Bits of `DroughtLine.line.sides`: the tile's side that faces land dry on the drought's last day. */
export const SIDE_WEST = 1; // towards x − 1
export const SIDE_EAST = 2; // towards x + 1
export const SIDE_NORTH = 4; // towards y − 1
export const SIDE_SOUTH = 8; // towards y + 1

/**
 * The drought line of a map, as plain data for the renderer (tile i is x + y·W, as everywhere).
 *
 * - `line`: the shore of the water left on the drought's last day. One entry per tile that still holds
 *   water then (last-day depth over `WATER_BODY`) with at least one 4-neighbour on the map that holds
 *   none: `tile`; `sides`, a bit per side facing such a neighbour (`SIDE_*`; the map's edge is never a
 *   shore); `level`, the height the water's surface stands at that day (ground + depth, as the view
 *   draws it); `start`, 1 when the water is the start's; `under`, 1 when today's (settled) water stands over that
 *   level (deeper there than on the last day by more than `UNDER_SLACK`: a lake that falls, its last day's shore
 *   inside today's lake), so the view draws the line as seen through today's water; `onWater`, a bit per side
 *   (`SIDE_*`) where today's water goes on across it (the tile and the neighbour beyond that side both hold water now:
 *   below a fall, a river's last day's shore in the middle of today's river), where the view draws it as faint as under
 *   today's water too, so an editing aid never reads as part of the water's look (planning, 2026-10-30). The faint
 *   line runs along those sides at `level`.
 * - `bed`: the ground the drought uncovers. One entry per tile that holds water now (the settled
 *   water, over `WATER_BODY`) and none on the last day: `tile`; `gone`, 1 when its whole body of
 *   water (4-connected, as now) holds none on the last day, the lake or river that dries out (the
 *   faint dry tint goes over these), 0 where the water only drew back; `start`, 1 on the start's water.
 * - `startWater`: how many of the tiles holding water now are the start's water (its bodies, below).
 * - `refused`: why there is no line, in one plain line, else null; a refused line has no entries.
 *   Every map has its line since #391 (caves and overhangs included), so the core gives null.
 *
 * The start's water is the lakes and rivers the start's pumps would draw from: each body of water
 * (4-connected, settled, over `WATER_BODY`) with a tile a pump on a shore reaches within the start's
 * water rule's walk (`walk.ts` `tileShoreWalk`: clean, at least 0.3 deep, 0–2 levels below the shore,
 * the shore within `within` tiles' walk over the map's own ground and slopes). On the last day, water
 * still joined to such a body is the start's too.
 */
export interface DroughtLine {
  W: number;
  H: number;
  /** The drought's length: the last day the line is read from. */
  days: number;
  line: {
    count: number;
    tile: Int32Array;
    sides: Uint8Array;
    level: Float32Array;
    start: Uint8Array;
    under: Uint8Array;
    onWater: Uint8Array;
    /** How deep today's water stands over the line's level (levels; 0 where it stands no higher). */
    over: Float32Array;
  };
  bed: { count: number; tile: Int32Array; gone: Uint8Array; start: Uint8Array };
  startWater: number;
  refused: string | null;
}

/** What the line is read from. */
export interface DroughtLineInput {
  W: number;
  H: number;
  /** The map's ground per tile (the view's water floor). */
  heights: ArrayLike<number>;
  /** The settled water (day 0): depth and contamination per tile. */
  settled: { depth: ArrayLike<number>; contamination: ArrayLike<number> };
  /** The depth per tile on the drought's last day, exactly as the Drought view's run left it. */
  last: ArrayLike<number>;
  days: number;
  /** The start's water, a mask over the tiles (`startWaterMask`), or null for none. */
  startWater: Uint8Array | null;
}

/** Today's water stands over the last day's shore when it is deeper there by more than this (levels). */
export const UNDER_SLACK = 0.05;

/** A line with nothing on it, and the reason when there is one. */
export function emptyDroughtLine(W: number, H: number, days: number, refused: string | null = null): DroughtLine {
  return {
    W,
    H,
    days,
    line: {
      count: 0,
      tile: new Int32Array(0),
      sides: new Uint8Array(0),
      level: new Float32Array(0),
      start: new Uint8Array(0),
      under: new Uint8Array(0),
      onWater: new Uint8Array(0),
      over: new Float32Array(0),
    },
    bed: {
      count: 0,
      tile: new Int32Array(0),
      gone: new Uint8Array(0),
      start: new Uint8Array(0),
    },
    startWater: 0,
    refused,
  };
}

/** The drought line from the settled water and the drought's last day (see `DroughtLine`). */
export function droughtLine(p: DroughtLineInput): DroughtLine {
  const { W, H, heights, settled, last, days } = p;
  const N = W * H;
  const nowWet = new Uint8Array(N);
  const lastWet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (settled.depth[i] > WATER_BODY) nowWet[i] = 1;
    if (last[i] > WATER_BODY) lastWet[i] = 1;
  }
  // the bodies of water now, and which keep any water to the last day
  const { labels: now, sizes } = components(nowWet, W, H);
  const keeps = new Uint8Array(sizes.length);
  for (let i = 0; i < N; i++) if (lastWet[i] && now[i] >= 0) keeps[now[i]] = 1;
  // the start's water: its bodies now, and the water left joined to them on the last day
  const startNow = p.startWater;
  let startWater = 0;
  if (startNow) for (let i = 0; i < N; i++) if (startNow[i] && nowWet[i]) startWater++;
  const lastBodies = components(lastWet, W, H);
  const then = lastBodies.labels;
  const startThen = new Uint8Array(lastBodies.sizes.length);
  if (startNow) for (let i = 0; i < N; i++) if (lastWet[i] && startNow[i]) startThen[then[i]] = 1;
  // the shore on the last day
  const lt: number[] = [];
  const ls: number[] = [];
  const ll: number[] = [];
  const lst: number[] = [];
  const lu: number[] = [];
  const lw: number[] = [];
  const lo: number[] = [];
  // the beds it uncovers
  const bt: number[] = [];
  const bg: number[] = [];
  const bst: number[] = [];
  for (let i = 0; i < N; i++) {
    if (lastWet[i]) {
      const x = i % W;
      const y = (i - x) / W;
      let sides = 0;
      if (x > 0 && !lastWet[i - 1]) sides |= SIDE_WEST;
      if (x + 1 < W && !lastWet[i + 1]) sides |= SIDE_EAST;
      if (y > 0 && !lastWet[i - W]) sides |= SIDE_NORTH;
      if (y + 1 < H && !lastWet[i + W]) sides |= SIDE_SOUTH;
      if (!sides) continue;
      lt.push(i);
      ls.push(sides);
      ll.push(heights[i] + last[i]);
      lst.push(startThen[then[i]] || (startNow?.[i] ?? 0) ? 1 : 0);
      lu.push(settled.depth[i] > last[i] + UNDER_SLACK ? 1 : 0);
      let onWater = 0;
      if (nowWet[i]) {
        if (sides & SIDE_WEST && nowWet[i - 1]) onWater |= SIDE_WEST;
        if (sides & SIDE_EAST && nowWet[i + 1]) onWater |= SIDE_EAST;
        if (sides & SIDE_NORTH && nowWet[i - W]) onWater |= SIDE_NORTH;
        if (sides & SIDE_SOUTH && nowWet[i + W]) onWater |= SIDE_SOUTH;
      }
      lw.push(onWater);
      lo.push(Math.max(0, settled.depth[i] - last[i]));
    } else if (nowWet[i]) {
      bt.push(i);
      bg.push(keeps[now[i]] ? 0 : 1);
      bst.push(startNow?.[i] ? 1 : 0);
    }
  }
  return {
    W,
    H,
    days,
    line: {
      count: lt.length,
      tile: Int32Array.from(lt),
      sides: Uint8Array.from(ls),
      level: Float32Array.from(ll),
      start: Uint8Array.from(lst),
      under: Uint8Array.from(lu),
      onWater: Uint8Array.from(lw),
      over: Float32Array.from(lo),
    },
    bed: {
      count: bt.length,
      tile: Int32Array.from(bt),
      gone: Uint8Array.from(bg),
      start: Uint8Array.from(bst),
    },
    startWater,
    refused: null,
  };
}

/** The start's water (see `DroughtLine`): a mask of the settled bodies of water the start's pumps
 *  would draw from, within `within` tiles' walk (the start's water rule, `waterWithin`). All zero
 *  without a start, or with no such water. `walk`: the walk from the start (`startWalk`), when the caller
 *  has it already. */
export function startWaterMask(p: {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
  objects: readonly WalkObject[];
  start: { x: number; y: number } | null | undefined;
  within: number;
  walk?: Float64Array;
}): Uint8Array {
  const { W, H, heights, depth, contamination } = p;
  const N = W * H;
  const mask = new Uint8Array(N);
  if (!p.start) return mask;
  const walk = p.walk ?? startWalk(p.objects, heights, W, H, p.start);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (depth[i] > WATER_BODY) wet[i] = 1;
  const body = components(wet, W, H).labels;
  const ours = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (body[i] < 0 || ours.has(body[i])) continue;
    if (tileShoreWalk(walk, heights, W, H, i, depth[i], contamination[i] < PUMP_CLEAN) <= p.within) ours.add(body[i]);
  }
  if (ours.size) for (let i = 0; i < N; i++) if (body[i] >= 0 && ours.has(body[i])) mask[i] = 1;
  return mask;
}

/** The walk from the start over the map (`walk.ts` `walkDistance`, round its objects), in tiles. */
export function startWalk(objects: readonly WalkObject[], heights: ArrayLike<number>, W: number, H: number, start: { x: number; y: number }): Float64Array {
  const { blocked, links } = walkWorld(objects, W, H);
  return walkDistance(heights, W, H, blocked, links, start);
}
