// Derived slopes (PLAN §7.5, build step 8). Beavers cannot cross even a 1-level step without a
// Slope, and player stairs cost 70 science. A slope stands on the low tile, its high side toward the
// higher neighbour; the tile behind its low side must be at the same level. Slopes are derived again
// after every terrain change, and the player's pinned and removed slopes apply on top (edits.ts).
//
// The rules (§7.5):
// 1–2. Label same-level regions (4-connected); two regions are neighbours where they differ by
//      exactly one level along a boundary.
// 3.   From the start's region, grow a tree over the regions whose boundary lies within 40 tiles of
//      the start (Chebyshev): one slope per tree edge, on the boundary pair nearest the start; a
//      long boundary (60+ pairs) gets a second one. Slopes stand at least 12 tiles apart. Out of
//      the start's own region, with the rivers given (`water`), the pair nearest the start and the
//      river together: the colony's way down to its water (the water rule, D153).
//      Targets are joined too, wherever they are: the regions of a landform with gentle or terraced
//      edges (its steps are "joined by slopes", PLAN §19.2) and, on an edited import, the ground the
//      edits changed.
// 4.   Beyond that, every region of 400+ tiles gets one slope toward its lowest neighbour.
// Slopes that already stand (a set piece's own stairs, an import's own slopes) join their regions
// without another slope.

import { levelRegions } from "../math/grid";
import type { Orientation } from "../format/footprints";
import { orientationForHigh } from "./setpieces";

export interface PlacedSlope {
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
}

export interface SlopeRules {
  /** The tree grows through boundaries within this Chebyshev distance of the start (§7.5: 40). */
  core: number;
  /** Regions of at least this many tiles beyond the core get one slope toward their lowest
   *  neighbour (§7.5: 400); 0 turns it off. */
  bigRegion: number;
  /** Tiles whose regions must be joined, wherever they are. */
  targets?: Uint8Array | null;
  /** Standing slopes as (low tile, high tile) pairs: their regions are joined already. */
  links?: readonly [number, number][];
  /** The rivers' channel tiles: the slopes out of the start's own region go toward them. */
  water?: Uint8Array | null;
}

/** Nothing stands within this Chebyshev distance of the start's centre, slopes included (PLAN §7.7);
 *  the build reserves it, and the editor's start indicators predict the slopes round it. */
export const START_CLEAR_RADIUS = 3;

/** §7.5 for generated and edited maps. */
export const SLOPE_RULES: SlopeRules = { core: 40, bigRegion: 400 };
/** Slopes stand at least this far apart (Manhattan), as in the prototype. */
const SPACING = 12;
/** A boundary this long gets a second slope. */
const LONG = 60;

export function placeSlopes(h: Uint8Array, W: number, H: number, start: { x: number; y: number }, occupied: Uint8Array, rules: SlopeRules): PlacedSlope[] {
  const { labels, size } = levelRegions(h, W, H);
  const R = size.length;
  // boundary pairs between regions one level apart: key low·R + high -> [lowTile, dx, dy][]
  const pairs = new Map<number, [number, number, number][]>();
  const adj: number[][] = Array.from({ length: R }, () => []);
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const [dx, dy] of dirs) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        if (h[j] !== h[i] + 1) continue;
        const a = labels[i];
        const b = labels[j];
        const key = a * R + b;
        let list = pairs.get(key);
        if (!list) {
          pairs.set(key, (list = []));
          adj[a].push(b);
          adj[b].push(a);
        }
        list.push([i, dx, dy]);
      }
    }
  }
  for (const list of adj) list.sort((a, b) => a - b);
  const between = (a: number, b: number) => [...(pairs.get(a * R + b) ?? []), ...(pairs.get(b * R + a) ?? [])];
  // regions joined by standing slopes
  const linked: number[][] = Array.from({ length: R }, () => []);
  for (const [lo, hi] of rules.links ?? []) {
    const a = labels[lo];
    const b = labels[hi];
    if (a === b) continue;
    linked[a].push(b);
    linked[b].push(a);
  }
  for (const list of linked) list.sort((a, b) => a - b);

  // union-find: a region is joined when it is in the start region's set
  const parent = Int32Array.from({ length: R }, (_, k) => k);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const root = labels[start.y * W + start.x];
  const joined = (r: number) => find(r) === find(root);

  const placed: PlacedSlope[] = [];
  const used: [number, number][] = [];
  const occ = occupied.slice();
  // steps from each tile to the nearest river tile (4-neighbour), for the slopes out of the start's
  // region: integers only, so every browser places the same slopes
  const toWater = rules.water && rules.water.some((v) => v === 1) ? stepsFrom(rules.water, W, H) : null;
  const tryPlace = (cand: [number, number, number][], extra: boolean, towardWater = false): number => {
    const scored = cand
      .map((c) => {
        const x = c[0] % W;
        const y = (c[0] - x) / W;
        const d2 = (x - start.x) ** 2 + (y - start.y) ** 2;
        const toward = towardWater && toWater ? Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) + toWater[c[0]] : 0;
        return { c, x, y, d2, toward };
      })
      .sort((p, q) => p.toward - q.toward || p.d2 - q.d2 || p.c[0] - q.c[0] || p.c[1] - q.c[1] || p.c[2] - q.c[2]);
    let n = 0;
    for (const { c, x, y } of scored) {
      const [i, dx, dy] = c;
      const lx = x - dx;
      const ly = y - dy;
      if (lx < 0 || lx >= W || ly < 0 || ly >= H) continue;
      const li = ly * W + lx;
      if (occ[i] || occ[li] || h[li] !== h[i]) continue;
      if (used.some(([ux, uy]) => Math.abs(x - ux) + Math.abs(y - uy) < SPACING)) continue;
      placed.push({ x, y, z: h[i], orientation: orientationForHigh(dx, dy) });
      occ[i] = 1;
      used.push([x, y]);
      n++;
      if (n >= (extra ? 2 : 1)) break;
    }
    return n;
  };
  const inCore = (cand: [number, number, number][]) =>
    cand.filter(([i]) => {
      const x = i % W;
      const y = (i - x) / W;
      return Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= rules.core;
    });

  // 3. the tree from the start's region, through the core; standing slopes join for free
  const order: number[] = [root];
  let frontier = [root];
  while (frontier.length) {
    const next: number[] = [];
    for (const r of frontier) {
      for (const n of linked[r]) {
        if (joined(n)) continue;
        union(root, n);
        next.push(n);
      }
      for (const n of adj[r]) {
        if (joined(n)) continue;
        const cand = inCore(between(r, n));
        if (cand.length && tryPlace(cand, cand.length > LONG, r === root)) {
          union(root, n);
          next.push(n);
        }
      }
    }
    order.push(...next);
    frontier = next;
  }
  //    targets: grown from the joined regions into target regions, anywhere on the map
  if (rules.targets) {
    const target = new Uint8Array(R);
    let any = false;
    for (let i = 0; i < labels.length; i++) {
      if (rules.targets[i]) {
        target[labels[i]] = 1;
        any = true;
      }
    }
    if (any) {
      const queue = order.slice();
      for (let q = 0; q < queue.length; q++) {
        const r = queue[q];
        for (const n of [...linked[r], ...adj[r]]) {
          if (joined(n) || !target[n]) continue;
          const cand = linked[r].includes(n) ? null : between(r, n);
          if (cand && !tryPlace(cand, cand.length > LONG)) continue;
          union(root, n);
          queue.push(n);
        }
      }
    }
  }
  // 4. beyond the core, one slope from every region of 400+ tiles toward its lowest neighbour,
  //    nearest the start first
  if (rules.bigRegion > 0) {
    const dist = new Float64Array(R).fill(Infinity);
    for (let i = 0; i < labels.length; i++) {
      const x = i % W;
      const y = (i - x) / W;
      const d = Math.max(Math.abs(x - start.x), Math.abs(y - start.y));
      if (d < dist[labels[i]]) dist[labels[i]] = d;
    }
    const big: number[] = [];
    for (let r = 0; r < R; r++) if (size[r] >= rules.bigRegion) big.push(r);
    big.sort((a, b) => dist[a] - dist[b] || a - b);
    const level = new Int32Array(R);
    for (let i = 0; i < labels.length; i++) level[labels[i]] = h[i];
    for (const r of big) {
      if (joined(r)) continue;
      const ns = adj[r].slice().sort((a, b) => level[a] - level[b] || (joined(a) ? 0 : 1) - (joined(b) ? 0 : 1) || a - b);
      for (const n of ns) {
        const cand = between(r, n);
        if (tryPlace(cand, false)) {
          union(r, n);
          break;
        }
      }
    }
  }
  return placed;
}

/** 4-neighbour steps from every tile to the nearest set tile of `mask` (a large number where none
 *  is reachable). */
function stepsFrom(mask: Uint8Array, W: number, H: number): Int32Array {
  const N = W * H;
  const d = new Int32Array(N).fill(1 << 20);
  const queue = new Int32Array(N);
  let tail = 0;
  for (let i = 0; i < N; i++)
    if (mask[i]) {
      d[i] = 0;
      queue[tail++] = i;
    }
  for (let head = 0; head < tail; head++) {
    const c = queue[head];
    const x = c % W;
    const nd = d[c] + 1;
    const nb = [x > 0 ? c - 1 : -1, x + 1 < W ? c + 1 : -1, c >= W ? c - W : -1, c + W < N ? c + W : -1];
    for (const n of nb) {
      if (n < 0 || d[n] <= nd) continue;
      d[n] = nd;
      queue[tail++] = n;
    }
  }
  return d;
}

// ------------------------------------------------------------------ a ramped Flatten's own slopes

/** A ramped Flatten's slopes stand at least this far apart along a stretch of its rim (D270). */
export const RIM_SPACING = 6;

/** A slope a stroke lays: its tile and its orientation (an index into ORIENTATIONS: its high side
 *  Cw0 north, Cw90 west, Cw180 south, Cw270 east). */
export type RimSlope = [number, number, number];

const RIM_DIRS: readonly [number, number, number][] = [
  [0, -1, 0],
  [-1, 0, 1],
  [0, 1, 2],
  [1, 0, 3],
];

/** The slopes a ramped Flatten lays along its own rim (D270): wherever the ground it shaped (`own`:
 *  the tiles it pressed on) meets ground one level lower (the pad's rim stepping down, and its last
 *  step onto the ground round it), a slope on the low tile, its high side on the step, the tile
 *  behind it at its own level; spaced along each stretch of rim (the low tiles of one level facing
 *  one way, joined corner to corner): its middle when it is short, else every `RIM_SPACING` tiles,
 *  so the pad is walkable from every side that has such ground. `occupied`: tiles where nothing may
 *  stand (objects, water, round the start). Deterministic, from the heights after the stroke. */
export function rimSlopes(h: Uint8Array, W: number, H: number, own: Uint8Array, occupied: Uint8Array): RimSlope[] {
  // candidates: low tile, orientation, level
  const groups = new Map<number, number[]>();
  const orient = new Map<number, number>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (occupied[i]) continue;
      for (const [dx, dy, o] of RIM_DIRS) {
        const hx = x + dx;
        const hy = y + dy;
        const bx = x - dx;
        const by = y - dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
        const j = hy * W + hx;
        const k = by * W + bx;
        if (!own[i] && !own[j]) continue;
        if (h[j] !== h[i] + 1 || h[k] !== h[i] || occupied[k]) continue;
        const key = o * 64 + h[i];
        let g = groups.get(key);
        if (!g) groups.set(key, (g = []));
        g.push(i);
        if (!orient.has(i)) orient.set(i, o);
      }
    }
  const out: RimSlope[] = [];
  const taken = new Uint8Array(W * H);
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const o = Math.floor(key / 64);
    const [dx] = RIM_DIRS[o];
    const tiles = groups.get(key)!;
    const index = new Map(tiles.map((t, n) => [t, n]));
    // stretches: the low tiles joined corner to corner
    const seen = new Uint8Array(tiles.length);
    for (let n = 0; n < tiles.length; n++) {
      if (seen[n]) continue;
      const stretch: number[] = [];
      const stack = [n];
      seen[n] = 1;
      while (stack.length) {
        const m = stack.pop()!;
        const t = tiles[m];
        stretch.push(t);
        const x = t % W;
        const y = (t - x) / W;
        for (let yy = y - 1; yy <= y + 1; yy++)
          for (let xx = x - 1; xx <= x + 1; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const q = index.get(yy * W + xx);
            if (q !== undefined && !seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          }
      }
      // along the stretch: by the coordinate across the slopes' way (x for north and south, y for
      // east and west), then the other
      const along = (t: number) => (dx === 0 ? (t % W) * H + Math.floor(t / W) : Math.floor(t / W) * W + (t % W));
      stretch.sort((a, b) => along(a) - along(b));
      const want: number[] = [];
      if (stretch.length <= RIM_SPACING) want.push(Math.floor((stretch.length - 1) / 2));
      else for (let p = Math.floor(RIM_SPACING / 2); p < stretch.length; p += RIM_SPACING) want.push(p);
      for (const p of want) {
        // the wanted place, or the nearest free one after it in the stretch
        for (let q = p; q < stretch.length; q++) {
          const t = stretch[q];
          const x = t % W;
          const y = (t - x) / W;
          const [ddx, ddy] = RIM_DIRS[o];
          const k = (y - ddy) * W + (x - ddx);
          if (taken[t] || taken[k]) continue;
          taken[t] = 1;
          taken[k] = 1;
          out.push([x, y, o]);
          break;
        }
      }
    }
  }
  return out.sort((a, b) => a[1] * W + a[0] - (b[1] * W + b[0]) || a[2] - b[2]);
}
