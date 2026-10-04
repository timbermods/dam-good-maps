// Dam sites (PLAN §9.1, §11.3 `water.reservoir`): a straight dam across a channel, measured by the
// reservoir it would hold. Port of prototype/analysis.py `dam_candidate` / `dam_sites` (same
// sampling, same flood order), so both validators find the same sites.

import { N4 } from "../math/grid";

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

const DAM_DIRS: readonly [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]]; // (dy, dx)

/** A dam line through (x, y) along (dy, dx), crest = h + height. The line extends until terrain
 *  reaches the crest on both sides (at most 10 tiles each way). The reservoir is the tile set below
 *  the crest connected to the higher-water side; it must not leak round the dam ends or reach the
 *  map edge. Null when there is no such dam. */
export function damCandidate(
  h: Uint8Array,
  surface: Float64Array,
  W: number,
  H: number,
  x: number,
  y: number,
  dy: number,
  dx: number,
  height: number,
  stamp: { seen: Int32Array; mark: number; queue: Int32Array },
  maxHalf = 10,
  maxFlood = 6000,
): DamSite | null {
  const inside = (xx: number, yy: number) => xx >= 0 && xx < W && yy >= 0 && yy < H;
  const crest = h[y * W + x] + height;
  const line: number[] = [y * W + x];
  for (const sgn of [1, -1]) {
    let k = 1;
    for (;;) {
      const yy = y + sgn * k * dy;
      const xx = x + sgn * k * dx;
      if (!inside(xx, yy) || k > maxHalf) return null;
      if (h[yy * W + xx] >= crest) break;
      line.push(yy * W + xx);
      k++;
    }
  }
  const onLine = (i: number) => line.includes(i);
  // the two sides of the centre tile; a diagonal line is watertight for 4-connected flow
  const [py, px] = dy === 0 ? [1, 0] : [0, 1];
  const sides: number[] = [];
  for (const [sy, sx] of [[y + py, x + px], [y - py, x - px]]) {
    if (inside(sx, sy) && !onLine(sy * W + sx)) sides.push(sy * W + sx);
  }
  if (sides.length < 2) return null;
  // Python's max()/min() keep the first of equal keys
  const up = surface[sides[1]] > surface[sides[0]] ? sides[1] : sides[0];
  const down = surface[sides[1]] < surface[sides[0]] ? sides[1] : sides[0];
  if (h[up] >= crest) return null;
  const mark = ++stamp.mark;
  const seen = stamp.seen;
  const queue = stamp.queue;
  seen[up] = mark;
  let count = 1;
  let head = 0;
  let tail = 0;
  queue[tail++] = up;
  let vol = 0;
  while (head < tail) {
    const c = queue[head++];
    vol += crest - h[c];
    if (count > maxFlood) return null;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [ddy, ddx] of N4) {
      const yy = cy + ddy;
      const xx = cx + ddx;
      if (!inside(xx, yy)) return null; // the reservoir spills off the map edge
      const n = yy * W + xx;
      if (seen[n] === mark || onLine(n) || h[n] >= crest) continue;
      if (n === down) return null; // water walks round the dam
      seen[n] = mark;
      count++;
      queue[tail++] = n;
    }
  }
  return { x, y, dir: [dy, dx], height, length: line.length, area: count, volume: vol, ratio: vol / line.length };
}

/** The largest reservoir a dam site may flood: 6,000 tiles (the prototype's limit), or 15% of the
 *  map on maps larger than 200² (the dam-site basin cap, PLAN §9.1). */
export function maxFloodFor(W: number, H: number): number {
  return Math.max(6000, Math.floor(0.15 * W * H));
}

/** The best dam per sampled channel tile (every `stride`-th channel tile in index order, only those
 *  within `maxDist` of the start by `startDist`), sorted by volume per dam tile, keeping only sites
 *  at least 8 tiles apart. With `minDepth`, only reservoirs at least that deep on average count
 *  (Hard: 3, PLAN §11.4). */
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
  const N = W * H;
  const stamp = { seen: new Int32Array(N), mark: 0, queue: new Int32Array(N) };
  const maxFlood = maxFloodFor(W, H);
  const found: DamSite[] = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (!channel[i]) continue;
    const sampled = k % stride === 0;
    k++;
    if (!sampled) continue;
    if (startDist && startDist[i] > maxDist) continue;
    const x = i % W;
    const y = (i - x) / W;
    let best: DamSite | null = null;
    for (const hh of heights) {
      for (const [dy, dx] of DAM_DIRS) {
        const c = damCandidate(h, surface, W, H, x, y, dy, dx, hh, stamp, 10, maxFlood);
        if (c && (minDepth <= 0 || c.volume / c.area >= minDepth) && (!best || c.ratio > best.ratio)) best = c;
      }
    }
    if (best && best.ratio >= minRatio) found.push(best);
  }
  found.sort((a, b) => b.ratio - a.ratio); // stable, like Python's sort
  const kept: DamSite[] = [];
  for (const c of found) {
    if (kept.every((q) => Math.max(Math.abs(c.x - q.x), Math.abs(c.y - q.y)) >= 8)) kept.push(c);
  }
  return kept;
}
