// Dam sites (PLAN §9.1, §11.3 `water.reservoir`): a straight dam across a channel, measured by the
// reservoir it would hold. Port of prototype/analysis.py `dam_candidate` / `dam_sites` (same
// sampling, same flood order), so both validators find the same sites; computed in Rust
// (rust/analysis, D391).

import { distanceFrom } from "../math/grid";
import { analyze } from "./rust/bridge";

export interface DamSite {
  x: number;
  y: number;
  dir: [number, number];
  /** Crest above the channel tile, in levels. */
  height: number;
  /** Tiles on the dam line. */
  length: number;
  /** Tiles the reservoir covers. */
  area: number;
  /** Blocks of water held up to the crest. */
  volume: number;
  /** Volume per dam tile. */
  ratio: number;
}

/** The best dam per sampled channel tile (every `stride`-th channel tile in index order, only those
 *  within `maxDist` of the start by `startDist`), sorted by volume per dam tile (stable), keeping only
 *  sites at least 8 tiles apart. With `minDepth`, only reservoirs at least that deep on average count
 *  (Hard: 3, PLAN §11.4).
 *
 *  A dam is a line through the tile along (dy, dx) — down, across or either diagonal — with its crest
 *  `height` levels over the tile; the line runs on until the ground reaches the crest on both sides (at
 *  most 10 tiles each way). Its reservoir is the ground below the crest joined to the side with the
 *  higher water (`surface`), and must not leak round the dam's ends or reach the map's edge, nor flood
 *  more than 6,000 tiles or 15% of a map larger than 200² (the dam-site basin cap, PLAN §9.1). */
export function damSites(
  h: Uint8Array,
  channel: Uint8Array,
  surface: Float64Array,
  W: number,
  H: number,
  startDist: Float64Array | null,
  maxDist = 60,
  heights: readonly number[] = [1, 2, 3],
  stride = 2,
  minRatio = 30,
  minDepth = 0,
): DamSite[] {
  const v = analyze("damSites", W, H, [maxDist, stride, minRatio, minDepth], [h, channel, surface, startDist ?? [], heights]);
  const sites: DamSite[] = [];
  for (let k = 0; k < v.length; k += 9)
    sites.push({ x: v[k], y: v[k + 1], dir: [v[k + 2], v[k + 3]], height: v[k + 4], length: v[k + 5], area: v[k + 6], volume: v[k + 7], ratio: v[k + 8] });
  return sites;
}

/** The shortest straight dam near a start whose reservoir holds a drought's need (the first ten cycles' report). */
export interface ShortestDam extends DamSite {
  /** The blocks of water a reservoir must hold for it to count (the checks' `water.reservoir` need). */
  need: number;
  /** How far its middle tile is from the start, in tiles. */
  distance: number;
}

/** Tiles from the start a dam is looked for within (investigation/WORKSHOP.md's "near the start"). */
export const DAM_WITHIN = 40;

/**
 * The shortest straight dam within `within` tiles of `start` whose reservoir holds `need` blocks (the checks' drought
 * need, `validate/playability.ts` `reservoirNeed`), or null when none does: every site `damSites` finds across clean
 * water (a tile over 0.05 deep, under 0.05 contaminated), crests 1 to 3 levels; of the shortest, the one holding most.
 * A dam is never drawn on the map (D287); this is a number for a report.
 */
export function shortestDam(
  heights: Uint8Array,
  depth: ArrayLike<number>,
  contamination: ArrayLike<number>,
  W: number,
  H: number,
  start: { x: number; y: number },
  need: number,
  within = DAM_WITHIN,
): ShortestDam | null {
  const N = W * H;
  const clean = new Uint8Array(N);
  const surface = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    clean[i] = depth[i] > 0.05 && contamination[i] < 0.05 ? 1 : 0;
    surface[i] = heights[i] + depth[i];
  }
  const near = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) near[y * W + x] = 1;
  const d = distanceFrom(near, W, H);
  // (every site, not only the best per sampled tile: no least ratio)
  const sites = damSites(heights, clean, surface, W, H, d, within, [1, 2, 3], 2, 0, 0);
  let best: DamSite | null = null;
  for (const s of sites) {
    if (s.volume < need || !(d[s.y * W + s.x] <= within)) continue;
    if (!best || s.length < best.length || (s.length === best.length && s.volume > best.volume)) best = s;
  }
  return best ? { ...best, need, distance: Math.round(d[best.y * W + best.x]) } : null;
}
