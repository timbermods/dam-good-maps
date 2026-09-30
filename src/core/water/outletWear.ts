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
import { distanceFrom, MinHeap } from "../math/grid";
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
  /** The path its water takes out: from the sill beside the basin to the way out, and on down. */
  route: number[];
}

/** Spill level of every tile: the lowest level water standing there drains at, through the map
 *  edge (priority flood). */
function spillOf(h: Uint8Array, W: number, H: number, noOutlet: Uint8Array | null = null): Int16Array {
  const N = W * H;
  const spill = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !noOutlet?.[i]) {
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
export function risenBasin(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>, noOutlet: Uint8Array | null = null): { tiles: number[]; level: number } | null {
  const N = W * H;
  const spill = spillOf(h, W, H, noOutlet);
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

/** The way out of the basin whose water rose over its spill level, worn `width` tiles wide, or null
 *  when there is none to wear. D360 (3): the cut is one shape that follows the water's path out, a
 *  channel smoothly widened as if water wore it: never blobs beside it, never stray tiles or
 *  fragments (`cutShape` checks it). */
export function wearOutlet(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>, opts: WearOptions): OutletWear | null {
  const N = W * H;
  // (the caller may name the stuck water itself: water still rising over a flat at its spill level,
  // which is no depression)
  const basin = opts.basin ?? risenBasin(h, W, H, depth, opts.noOutlet ?? null);
  if (!basin) return null;
  const S = basin.level;
  const inB = new Uint8Array(N);
  for (const i of basin.tiles) inB[i] = 1;
  const spill = spillOf(h, W, H, opts.noOutlet ?? null);
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
      let out = (x === 0 || y === 0 || x === W - 1 || y === H - 1) && !opts.noOutlet?.[c];
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
      const nk = k + 1 + 1.6 * (fbm(ns, xx, yy, 6, 2) + 1);
      if (nk < cost[j]) {
        cost[j] = nk;
        prev[j] = c;
        hp.push(nk, j);
      }
    }
  }
  if (end < 0) return null;
  // (from the sill beside the basin to the way out, in order)
  const route: number[] = [];
  for (let c = end; c >= 0 && !inB[c]; c = prev[c]) route.push(c);
  route.reverse();
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
  // the channel, as water wears it: within a width that widens and narrows smoothly along the way
  // (0.8–1.2 of the asked for, never tile by tile, on one bank) the ground comes down to the route's bed; beyond
  // it, a level more for each tile out, so the banks step back up (a worn slope, never a wall or a
  // square notch); a tile never goes up, and never below the bed. Past the basin's shore the bed runs
  // a level under its spill level, so the sill the water crosses is short (a long flat at the
  // basin's level takes a slope of water, a head the basin rises by, to carry the flow: the land
  // stage's widening does the same, land/levels.ts `widenOutlets`)
  const low = Math.max(opts.floor ?? 0, S - 1);
  const ws = hash32(opts.seed, "outlet-wear-width");
  const target = new Int16Array(N).fill(-1);
  const band: number[] = [];
  // (each band tile's nearest route tile, and how near: the side of the way it lies on)
  const nearest = new Int32Array(N).fill(-1);
  const nearD = new Float64Array(N).fill(Infinity);
  const half = opts.width / 2;
  const reach = wearReach(opts.width);
  const onRoute = new Uint8Array(N);
  for (const r of route) onRoute[r] = 1;
  route.forEach((r, k) => {
    const rx = r % W;
    const ry = (r - rx) / W;
    const bed = Math.min(h[r], nearB[r] ? S : low);
    const R = half * (0.8 + 0.2 * (fbm(ws, rx, ry, 12, 2) + 1));
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const xx = rx + dx;
        const yy = ry + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);
        const t = bed + Math.max(0, Math.ceil(d - R));
        const j = yy * W + xx;
        if (d < nearD[j]) {
          nearD[j] = d;
          nearest[j] = k;
        }
        if (t >= h[j]) continue;
        if (target[j] < 0) {
          band.push(j);
          target[j] = t;
        } else if (t < target[j]) target[j] = t;
      }
  });
  // (which side of the way a tile lies on: by the way's direction at its nearest route tile)
  const sideOf = (j: number): number => {
    const k = nearest[j];
    if (k < 0 || onRoute[j]) return 0;
    const a = route[Math.max(0, k - 2)];
    const b = route[Math.min(route.length - 1, k + 2)];
    const tx = (b % W) - (a % W);
    const ty = Math.floor(b / W) - Math.floor(a / W);
    const r = route[k];
    const cross = tx * (Math.floor(j / W) - Math.floor(r / W)) - ty * ((j % W) - (r % W));
    return cross >= 0 ? 1 : -1;
  };
  // water wears one bank: the way widened on one side only (the side that takes the less ground
  // away), a mouth or channel smoothly widened, never the two banks as a blob either side of it
  let best: OutletWear | null = null;
  for (const side of [1, -1]) {
    const out = h.slice();
    for (const j of band) {
      if (inB[j] || opts.keep?.[j]) continue;
      const s = sideOf(j);
      if (s !== 0 && s !== side) continue;
      const t = nearB[j] ? Math.max(target[j], S) : target[j];
      if (out[j] > t) out[j] = t;
    }
    const w = finish(out);
    if (w && (!best || w.cut.length < best.cut.length)) best = w;
  }
  return best;

  function finish(out: Uint8Array): OutletWear | null {
    // (where the cut would drain the basin all the same, the ground round what drained stays)
    for (let round = 0; round < 4; round++) {
      const after = spillOf(out, W, H, opts.noOutlet ?? null);
      const drained = basin!.tiles.filter((i) => after[i] < spill[i]);
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
    // one shape (D360 (3)): the largest piece of the worn ground stays, and whatever the kept
    // tiles, the drained basin's ground or ground already low along the way left apart from it
    // (stray tiles, fragments) stays as it was
    {
      const worn = new Uint8Array(N);
      for (const j of band) if (out[j] < h[j]) worn[j] = 1;
      const label = new Int32Array(N).fill(-1);
      let keepId = -1;
      let keepSize = 0;
      let id = 0;
      for (const s0 of band) {
        if (!worn[s0] || label[s0] >= 0) continue;
        const q = [s0];
        label[s0] = id;
        for (let k = 0; k < q.length; k++) {
          const c = q[k];
          const x = c % W;
          const y = (c - x) / W;
          for (const [dx, dy] of N4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!worn[j] || label[j] >= 0) continue;
            label[j] = id;
            q.push(j);
          }
        }
        if (q.length > keepSize) {
          keepId = id;
          keepSize = q.length;
        }
        id++;
      }
      for (const j of band) if (worn[j] && label[j] !== keepId) out[j] = h[j];
    }
    const cut: number[] = [];
    for (let i = 0; i < N; i++) if (out[i] !== h[i]) cut.push(i);
    if (!cut.length) return null;
    // (the shape it must have, D360 (3): the steps above make it, this proves it)
    if (!cutShapeOk(cutShape(cut, route, W, H, wearReach(opts.width)))) return null;
    // (and the basin still spills where it did: no way out opened under its level)
    const after = spillOf(out, W, H, opts.noOutlet ?? null);
    if (basin!.tiles.some((i) => after[i] < spill[i])) return null;
    return { heights: out, cut, basin: basin!.tiles, level: S, route };
  }
}

export interface WearOptions {
  seed: number;
  width: number;
  keep?: Uint8Array | null;
  noOutlet?: Uint8Array | null;
  basin?: { tiles: number[]; level: number } | null;
  floor?: number;
}

/** How a cut sits against the path its water takes out (D360 (3)): how many shapes its tiles make
 *  (4-connected), its stray tiles (no other cut tile beside them), and its tiles farther than `reach`
 *  from the path (blobs off to its side). */
export interface CutShape {
  regions: number;
  strays: number;
  offPath: number;
}

export function cutShape(cut: readonly number[], path: readonly number[], W: number, H: number, reach = Infinity): CutShape {
  const N = W * H;
  const inCut = new Uint8Array(N);
  for (const i of cut) inCut[i] = 1;
  const onPath = new Uint8Array(N);
  for (const i of path) onPath[i] = 1;
  const seen = new Uint8Array(N);
  let regions = 0;
  for (const s0 of cut) {
    if (seen[s0]) continue;
    regions++;
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
        if (seen[j] || !inCut[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  let strays = 0;
  for (const i of cut) {
    const x = i % W;
    const y = (i - x) / W;
    let beside = false;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && inCut[yy * W + xx]) beside = true;
    }
    if (!beside) strays++;
  }
  let offPath = 0;
  if (path.length && Number.isFinite(reach)) {
    const d = distanceFrom(onPath, W, H);
    for (const i of cut) if (d[i] > reach) offPath++;
  }
  return { regions, strays, offPath };
}

/** How far from its path a worn way out `width` tiles wide reaches: its widest (1.2 of half the
 *  width) and the banks stepping back up six levels beyond. */
export function wearReach(width: number): number {
  return Math.ceil((width / 2) * 1.2) + 6;
}

/** A cut of the shape D360 (3) asks: one shape along the path, no stray tiles, nothing off to its side. */
export function cutShapeOk(s: CutShape): boolean {
  return s.regions === 1 && s.strays === 0 && s.offPath === 0;
}
