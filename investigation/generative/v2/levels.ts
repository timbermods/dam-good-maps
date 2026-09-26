// Levels, design version 2. The field is spread over the land's own span, from a low base to a top
// of 15–16 (to 22 at Verticality 70+, D172), with its own hypsometry: `eq` blends the field toward
// equal area per level, which widens the spread version 1 lost to a bell-shaped field (height range
// medians 7–11 against 13 official and 14 workshop), and `lean` tips the land toward uplands or
// lowlands. Benches of 2–5 levels (cliffs) cover the terraced share, taller as Verticality rises.
//
// Natural ramps: where a cliff band cuts a big upland (or lowland) off from the land round it, a
// gully steps down the cliff along the gentlest line the land offers, one level every two tiles or
// more, and its steps get slopes (M9a's derived-slope rule for ramps; the prototype pins them). An
// upland left without a ramp needs stairs: a reward (the vertical-reach measure counts both).

import { hash32 } from "../../../src/core/math/hash";
import { fbm } from "../../../src/core/math/noise";
import { MinHeap } from "../../../src/core/math/grid";
import { stream } from "../../../src/core/math/rng";
import type { SlopeEdit } from "../../../src/core/features/edits";
import { orientationForHigh } from "../../../src/core/features/setpieces";
import { cleanPitsAndSpikes, mergeSmallRegions } from "../proto/levels";
import { clamp, smoothstep } from "../proto/num";
import type { GenomeV2 } from "./genome";

/** The rank of every value in [0, 1] (ties broken by index, so it is exact and stable). */
function ranks(v: Float64Array): Float64Array {
  const n = v.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
  const r = new Float64Array(n);
  for (let k = 0; k < n; k++) r[idx[k]] = k / (n - 1);
  return r;
}

function pct(sorted: Float64Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

export function snapLevelsV2(E: Float64Array, g: GenomeV2, seed: number, W: number, H: number): Uint8Array {
  const N = W * H;
  const sorted = Float64Array.from(E).sort();
  const lo = pct(sorted, 0.02);
  const hi = pct(sorted, 0.98);
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

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

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
  /** Pinned slopes on the ramps' steps. */
  slopes: SlopeEdit[];
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
export function naturalRamps(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, g: GenomeV2, seed: number, attempt: number): Ramps {
  const N = W * H;
  const rng = stream(seed, "ramps", attempt, g.variation);
  const tiles = new Uint8Array(N);
  const slopes: SlopeEdit[] = [];
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
      cutRamp(h, W, H, water, keep, path, tiles, slopes);
      cut++;
      done = true;
      break;
    }
    if (!done) break;
  }
  // the marks of uplands left to stairs are not ramp tiles
  for (let i = 0; i < N; i++) if (tiles[i] === 2) tiles[i] = 0;
  return { slopes, cut, leftToStairs: left, tiles };
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
function cutRamp(h: Uint8Array, W: number, H: number, water: Uint8Array, keep: Uint8Array, path: number[], tiles: Uint8Array, slopes: SlopeEdit[]): void {
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
  const lev = q.map((_, k) => Math.round(a + ((b - a) * k) / Math.max(1, n - 1)));
  // a level must span two tiles at least; where it cannot (too short a path), leave the ramp
  for (let k = 1; k + 1 < n; k++) if (lev[k] !== lev[k - 1] && lev[k] !== lev[k + 1]) return;
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
  // slopes on each step's low tile, facing up the path
  for (let k = 0; k + 1 < n; k++) {
    const hiT = lev[k] > lev[k + 1] ? q[k] : lev[k + 1] > lev[k] ? q[k + 1] : -1;
    if (hiT < 0) continue;
    const loT = hiT === q[k] ? q[k + 1] : q[k];
    const dx = (hiT % W) - (loT % W);
    const dy = Math.floor(hiT / W) - Math.floor(loT / W);
    slopes.push({ seq: 0, op: "pinSlope", params: { x: loT % W, y: Math.floor(loT / W), orientation: orientationForHigh(dx, dy) } });
  }
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

export { N4 };
