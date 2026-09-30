// A basin's way out worn wider (PLAN §20 D350 (b)): the automatic repair, like the spring by the
// start (D330), for a shown land whose water does not settle because a basin's way out is too
// narrow for what flows into it: the basin rises over its spill level, a level at most, and fills
// for days. The repair widens that way out with the smallest local cut, as if the water had worn
// it: along the route the water leaves by, the banks above the route's own bed are taken down to
// it, by a width that wanders (never a straight notch). It never cuts below the route's bed, never
// lowers the ground within two tiles of the basin below its spill level (the basin keeps its
// level), and leaves `keep` (sources, the start, hollows, the player's ground) as it is. A core
// function (D342): the generator applies it as the map arrives; the editor could offer it as a fix.

import { hash32 } from "../math/hash";
import { MinHeap } from "../math/grid";
import { fbm } from "../math/noise";

const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface OutletWear {
  /** The ground with the way out worn wider. */
  heights: Uint8Array;
  /** The tiles lowered, ascending. */
  cut: number[];
  /** The basin whose water rose over its spill level, and that level. */
  basin: number[];
  level: number;
}

/** Spill level of every tile: the lowest level water standing there drains at, through the map
 *  edge (priority flood). */
function spillOf(h: Uint8Array, W: number, H: number): Int16Array {
  const N = W * H;
  const spill = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
      spill[i] = h[i];
      heap.push(h[i], i);
    }
  }
  while (heap.size) {
    const c = heap.pop();
    const lv = heap.lastKey;
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (spill[j] >= 0) continue;
      spill[j] = h[j] > lv ? h[j] : lv;
      heap.push(spill[j], j);
    }
  }
  return spill;
}

/** The largest basin (tiles below their spill level) whose water stands over that level (0.05 or
 *  more), and the level. */
export function risenBasin(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>): { tiles: number[]; level: number } | null {
  const N = W * H;
  const spill = spillOf(h, W, H);
  const risen = new Uint8Array(N);
  // (a basin's tiles: below their spill level; a river's own channel stands over its spill level
  // wherever its water runs, and is no basin)
  for (let i = 0; i < N; i++) if (spill[i] > h[i] && depth[i] > 0.05 && h[i] + depth[i] > spill[i] + 0.05) risen[i] = 1;
  const seen = new Uint8Array(N);
  let best: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!risen[s0] || seen[s0]) continue;
    const q = [s0];
    seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (risen[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    if (q.length > best.length) best = q;
  }
  if (best.length < 20) return null;
  const count = new Map<number, number>();
  for (const i of best) count.set(spill[i], (count.get(spill[i]) ?? 0) + 1);
  const level = [...count].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
  // (and the water standing with it over the flat at its spill level: one surface, within 0.15 of
  // the depression's, joined to it; the rivers running in stand higher, the way out lower)
  const surf = best.map((i) => h[i] + depth[i]).sort((a, c) => a - c);
  const mid = surf[surf.length >> 1];
  const inB = new Uint8Array(N);
  for (const i of best) inB[i] = 1;
  const q = best.slice();
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (inB[j] || !(depth[j] > 0.05) || h[j] > level || Math.abs(h[j] + depth[j] - mid) > 0.15) continue;
      inB[j] = 1;
      q.push(j);
    }
  }
  return { tiles: q.sort((a, c) => a - c), level };
}

/** The way out of the basin whose water rose over its spill level, worn `width` tiles wide (a
 *  wandering width round it), or null when there is none to wear. */
export function wearOutlet(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>, opts: { seed: number; width: number; keep?: Uint8Array | null }): OutletWear | null {
  const N = W * H;
  const basin = risenBasin(h, W, H, depth);
  if (!basin) return null;
  const S = basin.level;
  const inB = new Uint8Array(N);
  for (const i of basin.tiles) inB[i] = 1;
  const spill = spillOf(h, W, H);
  // the route the water leaves by: from the basin over ground at or under its level, to lower ground
  // or the map's edge, cheapest by a noisy cost so it follows the land's own way out
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const hp = new MinHeap();
  for (const i of basin.tiles) {
    cost[i] = 0;
    hp.push(0, i);
  }
  const ns = hash32(opts.seed, "outlet-wear-route");
  let end = -1;
  while (hp.size) {
    const c = hp.pop();
    const k = hp.lastKey;
    if (k > cost[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    if (!inB[c]) {
      let out = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && spill[yy * W + xx] < S && !inB[yy * W + xx]) out = true;
      }
      if (out) {
        end = c;
        break;
      }
    }
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (inB[j] || h[j] > S || cost[j] <= k) continue;
      const nk = k + 1 + 0.8 * (fbm(ns, xx, yy, 7, 2) + 1);
      if (nk < cost[j]) {
        cost[j] = nk;
        prev[j] = c;
        hp.push(nk, j);
      }
    }
  }
  if (end < 0) return null;
  const route: number[] = [];
  for (let c = end; c >= 0 && !inB[c]; c = prev[c]) route.push(c);
  // (and on down the way the water runs from there, twice the width: the widened sill needs a way
  // down as wide as itself)
  {
    const on = new Set(route);
    let c = end;
    for (let k = 0; k < 2 * opts.width; k++) {
      const x = c % W;
      const y = (c - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) break;
      let next = -1;
      for (const [dx, dy] of N4) {
        const j = (y + dy) * W + x + dx;
        if (inB[j] || on.has(j) || h[j] > h[c]) continue;
        if (next < 0 || h[j] < h[next] || (h[j] === h[next] && spill[j] < spill[next])) next = j;
      }
      if (next < 0) break;
      on.add(next);
      route.push(next);
      c = next;
    }
  }
  // within two tiles of the basin the ground stays at its level or above: the basin keeps its level
  const nearB = new Uint8Array(N);
  for (const i of basin.tiles) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) nearB[yy * W + xx] = 1;
      }
  }
  // each tile within the wandering half-width of the route takes the route's bed nearest it, where
  // it stands higher
  const ws = hash32(opts.seed, "outlet-wear-width");
  const best = new Float64Array(N).fill(Infinity);
  const target = new Int16Array(N).fill(-1);
  const band: number[] = [];
  const half = opts.width / 2;
  const reach = Math.ceil(half * 1.4) + 1;
  for (const r of route) {
    const rx = r % W;
    const ry = (r - rx) / W;
    // (a width that wanders along the way, 0.6–1.4 of the asked for)
    const R = half * (0.6 + 0.4 * (fbm(ws, rx, ry, 9, 2) + 1));
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const d2 = dx * dx + dy * dy;
        // (a ragged edge: each bank tile's own reach wanders a little too)
        const edge = R + 0.7 * fbm(ws + 1, rx + dx, ry + dy, 3, 1);
        if (d2 > edge * edge) continue;
        const xx = rx + dx;
        const yy = ry + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (target[j] < 0) band.push(j);
        if (d2 < best[j]) {
          best[j] = d2;
          target[j] = Math.min(h[r], S);
        }
      }
  }
  const out = h.slice();
  for (const j of band) {
    if (inB[j] || opts.keep?.[j]) continue;
    const t = nearB[j] ? Math.max(target[j], S) : target[j];
    if (out[j] > t) out[j] = t;
  }
  // (where the cut would drain the basin all the same, the ground round what drained stays)
  for (let round = 0; round < 4; round++) {
    const after = spillOf(out, W, H);
    const drained = basin.tiles.filter((i) => after[i] < spill[i]);
    if (!drained.length) break;
    if (round === 3) return null;
    const near = new Uint8Array(N);
    for (const i of drained) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1;
        }
    }
    for (const j of band) if (near[j]) out[j] = h[j];
  }
  const cut: number[] = [];
  for (let i = 0; i < N; i++) if (out[i] !== h[i]) cut.push(i);
  if (!cut.length) return null;
  return { heights: out, cut, basin: basin.tiles, level: S };
}
