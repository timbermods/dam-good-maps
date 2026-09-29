// Levels (docs/m9-design.md §4.5, §4.7): the field snapped to the game's terrain levels, and the
// natural ramps.
//
// The field is spread over the land's own span, from a low base to its top (16, or up to 22 at
// Verticality 70+, D172), with its own hypsometry: `eq` blends it toward equal area per level and
// `lean` tips the land toward uplands or lowlands. Near the top the land bends toward it instead of
// being cut flat. Benches of 2–5 levels (cliffs) cover the terraced share, taller as Verticality
// rises, with a drawn phase so benches never align across the map. Regions under 4 tiles merge;
// single-tile pits and spikes go, as the build's integrity pass would remove them.
//
// Natural ramps: where a cliff band cuts a big upland (or lowland) off from the land round it, a
// gully steps down the cliff along the gentlest line the land offers, one level every two tiles or
// more, three tiles wide. Its steps are slope targets: the build's derived slopes join every step
// of a ramp wherever it is (decisions-pending #62). An upland left without one needs stairs: a
// reward.
//
// Ported from the design version 2 prototype (investigation/generative/v2/levels.ts, with version
// 1's helpers from proto/levels.ts).

import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import { levelRegions, MinHeap } from "../math/grid";
import { stream } from "../math/rng";
import { clamp, N4, pctSorted, smoothstep } from "./num";
import type { Genome } from "./genome";

/** The rank of every value in [0, 1] (ties broken by index, so it is exact and stable). */
function ranks(v: Float64Array): Float64Array {
  const n = v.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
  const r = new Float64Array(n);
  for (let k = 0; k < n; k++) r[idx[k]] = k / (n - 1);
  return r;
}

export function snapLevels(E: Float64Array, g: Genome, seed: number, W: number, H: number): Uint8Array {
  const N = W * H;
  const sorted = Float64Array.from(E).sort();
  const lo = pctSorted(sorted, 0.02);
  const hi = pctSorted(sorted, 0.98);
  const span = Math.max(1e-6, hi - lo);
  const rk = ranks(E);
  const js = hash32(seed, "contour-jitter", g.variation);
  const ts = hash32(seed, "terrace-mask", g.variation);
  const top = g.top;
  const maxLv = Math.floor(top + 0.5);
  const out = new Uint8Array(N);
  const st = g.terrace.step;
  const phase = g.benchPhase * st;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lin = (E[i] - lo) / span;
      let t = (1 - g.hyps.eq) * lin + g.hyps.eq * rk[i];
      // the lean: t / (t + lean (1 − t)) on [0, 1], continued straight beyond it
      if (t > 0 && t < 1) t = t / (t + g.hyps.lean * (1 - t));
      let L = g.base + t * (top - g.base) + g.terrace.jitter * fbm(js, x, y, 7, 2);
      // near the top the land bends toward it instead of being cut flat there
      if (L > top - 1) {
        const over = L - (top - 1);
        L = top - 1 + over / (over + 1) + 0.49 * smoothstep(over / 2);
      }
      if (st > 1 && g.terrace.share > 0) {
        const m = smoothstep((fbm(ts, x, y, g.terrace.cell, 2) + 1) / 2 - (1 - g.terrace.share) + 0.5);
        if (m > 0.5) L = Math.floor((L - phase) / st + 0.5) * st + phase;
      }
      out[i] = clamp(Math.round(L), 1, maxLv);
    }
  // regions under 4 tiles merge (a 2×2 stack survives, as the build's integrity pass keeps it)
  mergeSmallRegions(out, W, H, 4);
  cleanPitsAndSpikes(out, W, H, null);
  return out;
}

// ------------------------------------------------------------------------------------ natural ramps

/** Components of land joined by steps of at most one level (the ground a beaver walks with
 *  slopes), water left out. */
export function footComponents(h: Uint8Array, W: number, H: number, water: Uint8Array): { lab: Int32Array; size: number[] } {
  const N = W * H;
  const lab = new Int32Array(N).fill(-1);
  const size: number[] = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || water[s]) continue;
    const id = size.length;
    const q = [s];
    lab[s] = id;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] >= 0 || water[j] || Math.abs(h[j] - h[i]) > 1) continue;
        lab[j] = id;
        q.push(j);
      }
    }
    size.push(q.length);
  }
  return { lab, size };
}

export interface Ramps {
  /** The ramps' steps as (low tile, high tile) pairs: slope targets (decisions-pending #62). */
  steps: [number, number][];
  /** Ramps cut, and uplands left to stairs. */
  cut: number;
  leftToStairs: number;
  /** The ramp tiles (kept off by the settler's clearing and by objects). */
  tiles: Uint8Array;
}

/**
 * Cut natural ramps. `water` marks channel and lake tiles (never touched); `keep` tiles are never
 * regraded. Each component of 200+ tiles not joined to the largest gets a ramp with the genome's
 * chance, up to 8 a map.
 */
export function naturalRamps(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, g: Genome, seed: number, attempt: number): Ramps {
  const N = W * H;
  const rng = stream(seed, "ramps", attempt, g.variation);
  const tiles = new Uint8Array(N);
  const steps: [number, number][] = [];
  let cut = 0;
  let left = 0;
  const minSize = Math.max(200, Math.round(N / 80));
  for (let round = 0; round < 8; round++) {
    const fc = footComponents(h, W, H, water);
    let main = 0;
    for (let k = 1; k < fc.size.length; k++) if (fc.size[k] > fc.size[main]) main = k;
    // the biggest component not yet joined, that has not been decided already
    const order = fc.size.map((s, k) => [s, k]).filter(([s, k]) => k !== main && s >= minSize).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    if (!order.length) break;
    let done = false;
    for (const [, comp] of order) {
      // one decision per component (its first tile keys it across rounds)
      let first = -1;
      for (let i = 0; i < N && first < 0; i++) if (fc.lab[i] === comp) first = i;
      if (tiles[first] === 2) continue;
      if (rng.float() >= g.ramps) {
        // left to stairs: mark it so the next rounds skip it
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      const path = rampPath(h, W, H, water, keep, fc.lab, comp, main);
      if (!path) {
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      // (a path too short for its drop is left to stairs; the prototype tried the same component
      // again every round, so one short path used up all eight)
      if (!cutRamp(h, W, H, water, keep, path, tiles, steps)) {
        for (let i = 0; i < N; i++) if (fc.lab[i] === comp) tiles[i] = tiles[i] || 2;
        left++;
        continue;
      }
      cut++;
      done = true;
      break;
    }
    if (!done) break;
  }
  // the marks of uplands left to stairs are not ramp tiles
  for (let i = 0; i < N; i++) if (tiles[i] === 2) tiles[i] = 0;
  return { steps, cut, leftToStairs: left, tiles };
}

/** The gentlest line from a component to the main one: side-to-side steps over land, each level
 *  climbed costing more the steeper it is, so the line finds the lowest part of the cliff. */
function rampPath(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, lab: Int32Array, from: number, to: number): number[] | null {
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    if (lab[i] !== from) continue;
    // start from the component's edge tiles
    const x = i % W;
    const y = (i - x) / W;
    let edge = false;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (lab[yy * W + xx] !== from) edge = true;
    }
    if (!edge) continue;
    cost[i] = 0;
    heap.push(0, i);
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > cost[c]) continue;
    if (lab[c] === to) {
      const out: number[] = [];
      for (let i = c; i >= 0; i = prev[i]) out.push(i);
      return out.reverse();
    }
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const j = yy * W + xx;
      if (water[j] || keep[j] || lab[j] === from) continue;
      const d = Math.abs(h[j] - h[c]);
      const nk = k + 1 + (d > 1 ? 4 * d : 0);
      if (nk < cost[j]) {
        cost[j] = nk;
        prev[j] = c;
        heap.push(nk, j);
      }
    }
  }
  return null;
}

/** Regrade a path into steps of one level, each at least two tiles long, three tiles wide; the
 *  path is extended into the land on both sides as far as the drop needs. */
function cutRamp(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, path: number[], tiles: Uint8Array, steps: [number, number][]): boolean {
  const a = h[path[0]];
  const b = h[path[path.length - 1]];
  const drop = Math.abs(a - b);
  // extend each end straight on, inside its own ground, until the path is 2 tiles a level + 2
  const need = 2 * drop + 2;
  const q = path.slice();
  const extend = (atStart: boolean) => {
    const p0 = atStart ? q[0] : q[q.length - 1];
    const p1 = atStart ? q[1] : q[q.length - 2];
    const dx = (p0 % W) - (p1 % W);
    const dy = Math.floor(p0 / W) - Math.floor(p1 / W);
    const lv = h[p0];
    let x = p0 % W;
    let y = Math.floor(p0 / W);
    for (let n = 0; n < need; n++) {
      x += dx;
      y += dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) break;
      const j = y * W + x;
      if (water[j] || keep[j] || h[j] !== lv) break;
      if (atStart) q.unshift(j);
      else q.push(j);
      if (q.length >= need) break;
    }
  };
  if (q.length < need && q.length >= 2) {
    extend(true);
    extend(false);
  }
  const n = q.length;
  // a ramp climbs the cliff where two grounds meet: its route between them is no longer than the
  // ramp needs, and every tile of its path stands between its ends' levels. A longer route is a road
  // across the land, regraded straight with right-angle turns (Canyon 128² seed 12 got one 113 tiles
  // long); one over higher ground cuts a ruler-straight slot through it (Highlands 128² seed 16: a
  // 3-wide slot 25 tiles long and 9 deep, with water in it, D209); one over lower ground raises a
  // causeway. Such an upland is left to stairs
  if (path.length > need + 2) return false;
  const top = Math.max(a, b);
  const bottom = Math.min(a, b);
  for (const i of q) if (h[i] > top || h[i] < bottom) return false;
  // a level must span two tiles at least; where it cannot (too short a path), no ramp. The levels
  // share the path evenly (the prototype rounded a straight line, which left one-tile levels on
  // paths long enough for two-tile ones, and gave the ramp up)
  if (n < 2 * (drop + 1)) return false;
  const sgn = b > a ? 1 : -1;
  const lev = q.map((_, k) => a + sgn * Math.floor((k * (drop + 1)) / n));
  for (let k = 0; k < n; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox;
        const yy = y + oy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const j = yy * W + xx;
        if (water[j] || keep[j]) continue;
        // the middle line takes its level; the sides only where they would not stand above it
        if (ox === 0 && oy === 0) h[j] = lev[k];
        else if (Math.abs(h[j] - lev[k]) > 1) h[j] = lev[k];
        tiles[j] = 1;
      }
  }
  // each step: a slope on its low tile, facing up the path
  for (let k = 0; k + 1 < n; k++) {
    const hiT = lev[k] > lev[k + 1] ? q[k] : lev[k + 1] > lev[k] ? q[k + 1] : -1;
    if (hiT < 0) continue;
    const loT = hiT === q[k] ? q[k + 1] : q[k];
    steps.push([loT, hiT]);
  }
  return true;
}

/** The land runs on past the map's edge (Kyler, no edge walls): erosion never lowers the border
 *  tiles (they are outlets with nowhere to drain), and a channel's floor may stop a tile short of
 *  the edge, so a thin raised band can be left along it. Each of the two outer rows is lowered to
 *  the inward profile carried on (the next tile in, plus its rise toward the edge, never a fall), so
 *  land that rises toward the edge keeps rising and a band standing over the land inside it goes.
 *  Never raises a tile. Returns the number of tiles lowered. */
export function relaxEdges(h: Uint8Array, W: number, H: number): number {
  let n = 0;
  const edges: [number, (k: number, t: number) => number][] = [
    [H, (k, t) => k * W + t],
    [H, (k, t) => k * W + (W - 1 - t)],
    [W, (k, t) => t * W + k],
    [W, (k, t) => (H - 1 - t) * W + k],
  ];
  for (const [len, at] of edges)
    for (let k = 0; k < len; k++)
      for (let t = 1; t >= 0; t--) {
        const a = h[at(k, t + 1)];
        const b = h[at(k, t + 2)];
        const cap = a + Math.max(0, a - b);
        const i = at(k, t);
        if (h[i] > cap) {
          h[i] = cap;
          n++;
        }
      }
  return n;
}


/** Level regions smaller than `min` tiles take the most common level round them. */
export function mergeSmallRegions(h: Uint8Array, W: number, H: number, min: number, keep: Uint8Array | null = null): void {
  for (let pass = 0; pass < 3; pass++) {
    const { labels, size } = levelRegions(h, W, H);
    let changed = false;
    const votes = new Map<number, Map<number, number>>();
    for (let i = 0; i < W * H; i++) {
      if (size[labels[i]] >= min || keep?.[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (labels[j] === labels[i]) continue;
        const m = votes.get(labels[i]) ?? votes.set(labels[i], new Map()).get(labels[i])!;
        m.set(h[j], (m.get(h[j]) ?? 0) + 1);
      }
    }
    const to = new Map<number, number>();
    for (const [lab, m] of votes) {
      let best = -1;
      let bn = -1;
      for (const [lv, n] of [...m].sort((a, b) => a[0] - b[0])) if (n > bn) {
        bn = n;
        best = lv;
      }
      if (best >= 0) to.set(lab, best);
    }
    for (let i = 0; i < W * H; i++) {
      const v = to.get(labels[i]);
      if (v !== undefined && !keep?.[i]) {
        h[i] = v;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** The build's integrity rule (raster/terrain.ts `integrityAt`): a tile lower than all four
 *  neighbours rises to the lowest, one higher than all four falls to the highest. */
export function cleanPitsAndSpikes(h: Uint8Array, W: number, H: number, keep: Uint8Array | null): number {
  let changed = 0;
  for (let pass = 0; pass < 4; pass++) {
    const src = h.slice();
    let n = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (keep?.[i]) continue;
        const a = src[i - 1];
        const b = src[i + 1];
        const c = src[i - W];
        const d = src[i + W];
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        if (src[i] < lo) {
          h[i] = lo;
          n++;
        } else if (src[i] > hi) {
          h[i] = hi;
          n++;
        }
      }
    changed += n;
    if (!n) break;
  }
  return changed;
}

/** Fill every closed hollow that holds no planned water (`keep`), up to its spill level: a dry hollow
 *  below a source is pre-filled by the canonical settle and then only evaporates, so the water would
 *  never settle (water.settles). Open valleys stay: a dam across one is still a reservoir. Returns the
 *  number of tiles raised. */
export function fillDryHollows(h: Uint8Array, W: number, H: number, keep: Uint8Array): number {
  const N = W * H;
  // priority flood from the edge through the kept water too (it drains through its outlet)
  const filled = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
      filled[i] = h[i];
      heap.push(h[i], i);
    }
  }
  while (heap.size) {
    const c = heap.pop();
    const lv = heap.lastKey;
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (filled[j] >= 0) continue;
      filled[j] = h[j] > lv ? h[j] : lv;
      heap.push(filled[j], j);
    }
  }
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (keep[i] || filled[i] <= h[i]) continue;
    h[i] = filled[i];
    n++;
  }
  return n;
}

/** Outlets for the broad basins that hold water (M9a: water that settles). A basin whose spill level
 *  is a wide flat (a sea's shelf at its rim's level) sends its water out as a sheet over the whole
 *  flat, and the sheet takes days to settle (the check's four days are not enough on a sea). Each
 *  such basin gets a channel a level below the flat, winding across it from the basin to where the
 *  land falls away or to the map edge, so its water leaves by one outlet as a river's does. Only
 *  basins of `minArea` tiles or more whose flat at the spill level is `minFlat` tiles or more; the
 *  tiles of `keep` (the river channels) are never cut, a lake's shallow shore may be. Returns the
 *  tiles cut. */
export function carveOutlets(h: Uint8Array, W: number, H: number, keep: Uint8Array, seed: number, width = 5, minArea = 300, minFlat = 120): number {
  const N = W * H;
  // spill levels from the draining map edge (priority flood)
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
  // basins: connected tiles standing below their spill level
  const label = new Int32Array(N).fill(-1);
  const basins: { tiles: number[]; level: number }[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] >= 0 || !(spill[s0] > h[s0])) continue;
    const id = basins.length;
    const tiles = [s0];
    label[s0] = id;
    for (let q = 0; q < tiles.length; q++) {
      const c = tiles[q];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] >= 0 || !(spill[j] > h[j]) || spill[j] !== spill[s0]) continue;
        label[j] = id;
        tiles.push(j);
      }
    }
    basins.push({ tiles, level: spill[s0] });
  }
  let cut = 0;
  basins.forEach((b, id) => {
    if (b.tiles.length < minArea || b.level < 1) return;
    const S = b.level;
    // the flat at the spill level joined to the basin: a sheet of water would spread over all of it
    const seen = new Uint8Array(N);
    const q: number[] = [];
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || label[j] === id || h[j] !== S || spill[j] !== S) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    for (let k = 0; k < q.length && q.length < minFlat; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || label[j] === id || h[j] !== S || spill[j] !== S) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length < minFlat) return;
    // the flat at the spill level joined to the basin, and a way across it to lower ground or the
    // map edge (cheapest by a noisy cost, so the channel winds)
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    for (const i of b.tiles) {
      cost[i] = 0;
      hp.push(0, i);
    }
    let end = -1;
    const ns = hash32(seed, "outlet", id);
    while (hp.size) {
      const c = hp.pop();
      const k = hp.lastKey;
      if (k > cost[c]) continue;
      const x = c % W;
      const y = (c - x) / W;
      if (label[c] !== id) {
        // lower ground beside it, or the map's edge: the way out
        let out = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && spill[yy * W + xx] < S && label[yy * W + xx] !== id) out = true;
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
        if (label[j] === id || h[j] !== S || spill[j] !== S || cost[j] <= k) continue;
        const nk = k + 1 + 1.2 * (fbm(ns, xx, yy, 7, 2) + 1);
        if (nk < cost[j]) {
          cost[j] = nk;
          prev[j] = c;
          hp.push(nk, j);
        }
      }
    }
    if (end < 0) return;
    // cut the way at a level below the flat, `width` tiles wide (never the kept water)
    const r = (width - 1) / 2;
    for (let c = end; c >= 0 && label[c] !== id; c = prev[c]) {
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dy * dy > r * r + 0.5) continue;
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (keep[j] || h[j] !== S || label[j] === id) continue;
          h[j] = S - 1;
          cut++;
        }
    }
  });
  return cut;
}

/** The lakes of `lakes` that no river's water reaches on the land as it is now: the water from each
 *  river's head (its mouth tile on the edge, its spring) runs downhill or level on the land filled to
 *  its spill levels, as the canonical pre-fill runs it (sim/prefill.ts; `sealed` edge tiles, a river's
 *  mouth, are not outlets, as the sources' own tiles are not). The land has changed since
 *  the hydrology found its lakes (other rivers cut, edges relaxed, small regions merged), and a lake
 *  its river no longer runs into fills only by seeping over a bank, for days. */
export function unreachedLakes(h: Uint8Array, W: number, H: number, heads: readonly number[], lakes: readonly { tiles: number[] }[], sealed: Uint8Array | null = null): number[] {
  const N = W * H;
  const spill = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !sealed?.[i]) {
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
  const path = new Uint8Array(N);
  const q: number[] = [];
  for (const i of heads)
    if (i >= 0 && i < N && !path[i]) {
      path[i] = 1;
      q.push(i);
    }
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (path[j] || spill[j] > spill[c]) continue;
      path[j] = 1;
      q.push(j);
    }
  }
  const out: number[] = [];
  lakes.forEach((lk, k) => {
    if (!lk.tiles.some((i) => path[i])) out.push(k);
  });
  return out;
}

/** Spill levels from the draining map edge (priority flood): the lowest level water standing on a
 *  tile drains at. */
function edgeSpill(h: Uint8Array, W: number, H: number): Int16Array {
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

/** A sea's way out, as wide as its water needs (the canonical settle, PLAN §10): a broad basin
 *  starts full to its spill level, and its water then rises until its outlet passes the flow that
 *  comes in, by as much as a level where the outlet is a river's width (Islands 256² seed 1: the sea
 *  rose a whole level and settled after 6,144 ticks, past the settle's four days). A lip passes
 *  about 3 blocks a second per tile of width and block of depth, so the way out (sill, lips, pools
 *  and the mouth at the map edge) is made 1.6 tiles wide per block a second of the map's flow (7–41
 *  tiles): that sea then rises a third of a level and settles after 2,432 ticks. The route is the
 *  water's own way down to the map edge (never through higher ground, spill levels never rising),
 *  winding by noise; the land within half the width of it takes the level of the route beside it,
 *  a level below the sea's once past the sea's own shore (so the sill is short: a long flat at the
 *  sea's level takes a slope of water to carry the flow), never below the sea's level within two
 *  tiles of it and never on `keep`. A large lake of `lakes` whose floor is at its outlet's level is
 *  such a body too (its water stands as a sheet over the flat). A widening that would drain the
 *  sea or a kept lake is undone. */
export function widenOutlets(h: Uint8Array, W: number, H: number, keep: Uint8Array, seed: number, flow: number, lakes: readonly (readonly number[])[] = [], minArea = 2500): number {
  const N = W * H;
  let spill = edgeSpill(h, W, H);
  const label = new Int32Array(N).fill(-1);
  const basins: { tiles: number[]; level: number; sheet?: boolean }[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (label[s0] >= 0 || !(spill[s0] > h[s0])) continue;
    const id = basins.length;
    const tiles = [s0];
    label[s0] = id;
    for (let q = 0; q < tiles.length; q++) {
      const c = tiles[q];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] >= 0 || !(spill[j] > h[j]) || spill[j] !== spill[s0]) continue;
        label[j] = id;
        tiles.push(j);
      }
    }
    basins.push({ tiles, level: spill[s0] });
  }
  // a large lake of the hydrology whose floor is its outlet's level stands as a sheet over it, not
  // in a basin: it is a water body of its own, at that level
  for (const lk of lakes) {
    if (lk.length < minArea) continue;
    let flat = 0;
    for (const i of lk) if (label[i] < 0 && spill[i] === h[i]) flat++;
    if (flat < minArea / 2) continue;
    const count = new Map<number, number>();
    for (const i of lk) count.set(spill[i], (count.get(spill[i]) ?? 0) + 1);
    const S = [...count].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0][0];
    const id = basins.length;
    const tiles: number[] = [];
    for (const i of lk)
      if (label[i] < 0 && spill[i] === S) {
        label[i] = id;
        tiles.push(i);
      }
    basins.push({ tiles, level: S, sheet: true });
  }
  let lowered = 0;
  basins.forEach((b, id) => {
    if (b.tiles.length < (b.sheet ? minArea / 2 : minArea)) return;
    const S = b.level;
    const width = Math.max(7, Math.min(41, Math.round(Math.max(1.6 * flow, b.tiles.length / 1000)))) | 1;
    const R = (width - 1) / 2;
    // the route: from the basin down to the map edge, never up (spill levels never rise along it,
    // and no tile above the sea's level), cheapest by a noisy cost
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    for (const i of b.tiles) {
      cost[i] = 0;
      hp.push(0, i);
    }
    const ns = hash32(seed, "widen", id);
    let end = -1;
    while (hp.size) {
      const c = hp.pop();
      const k = hp.lastKey;
      if (k > cost[c]) continue;
      const x = c % W;
      const y = (c - x) / W;
      if (label[c] !== id && (x === 0 || y === 0 || x === W - 1 || y === H - 1) && !keep[c]) {
        end = c;
        break;
      }
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (label[j] === id || h[j] > S || spill[j] > spill[c] || cost[j] <= k) continue;
        const nk = k + 1 + 3 * (fbm(ns, xx, yy, Math.max(12, width), 2) + 1);
        if (nk < cost[j]) {
          cost[j] = nk;
          prev[j] = c;
          hp.push(nk, j);
        }
      }
    }
    if (end < 0) return;
    const route: number[] = [];
    for (let c = end; c >= 0 && label[c] !== id; c = prev[c]) route.push(c);
    // next to the sea the land stays at its spill level: the sea keeps its level
    const nearSea = new Uint8Array(N);
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) nearSea[yy * W + xx] = 1;
        }
    }
    // each tile within R of the route takes the level of the route tile nearest it; the route
    // itself runs a level below the sea's once past its sill, so the sill is short and as wide as
    // the route (a long flat at the sea's level takes a slope of water to carry the flow)
    const best = new Float64Array(N).fill(Infinity);
    const target = new Int16Array(N).fill(-1);
    const band: number[] = [];
    const Ri = Math.ceil(R);
    for (const r of route) {
      const rx = r % W;
      const ry = (r - rx) / W;
      for (let dy = -Ri; dy <= Ri; dy++)
        for (let dx = -Ri; dx <= Ri; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R + 0.5) continue;
          const xx = rx + dx;
          const yy = ry + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (target[j] < 0) band.push(j);
          if (d2 < best[j]) {
            best[j] = d2;
            target[j] = h[r] >= S && !nearSea[r] ? Math.max(0, S - 1) : h[r];
          }
        }
    }
    const before = h.slice();
    const inBand = new Uint8Array(N);
    let n = 0;
    for (const j of band) {
      inBand[j] = 1;
      if (label[j] === id || keep[j]) continue;
      const t = nearSea[j] ? Math.max(target[j], S) : target[j];
      if (h[j] > t) {
        h[j] = t;
        n++;
      }
    }
    if (!n) return;
    // undone if it drains the sea or a kept lake (a hollow beside the route may join it)
    const after = edgeSpill(h, W, H);
    let drained = false;
    for (let i = 0; i < N && !drained; i++) if ((label[i] === id || (keep[i] && !inBand[i])) && spill[i] > before[i] && after[i] < spill[i]) drained = true;
    if (drained) {
      h.set(before);
      return;
    }
    spill = after;
    lowered += n;
  });
  return lowered;
}
