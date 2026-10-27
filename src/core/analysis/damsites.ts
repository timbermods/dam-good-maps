// Dam sites (PLAN §9.1, §11.3 `water.reservoir`): a straight dam across a channel, measured by the
// reservoir it would hold. Port of prototype/analysis.py `dam_candidate` / `dam_sites` (same
// sampling, same flood order), so both validators find the same sites; computed in Rust
// (rust/analysis, D391).

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
