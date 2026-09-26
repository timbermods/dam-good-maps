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
// without another slope. A generated map's natural ramps (M9a, decisions-pending #62) get a slope on
// every step that still stands, before anything else, wherever they are: a ramp is a staircase the
// land made, not a boundary the spacing rule may skip.

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
  /** Natural ramps' steps as (low tile, high tile) pairs: a slope on each one that still stands. */
  ramps?: readonly (readonly [number, number])[] | null;
  /** A brush's walkable ground (D204's ramped rim, a walkable smooth): its steps are joined by
   *  slopes wherever it is, not only where the start's ground reaches it. */
  walkTargets?: Uint8Array | null;
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
  // the ramps' steps first: a slope on each step whose ground still steps as the ramp cut it (the
  // high tile one level up, the tile behind the low one level with it), joining its regions
  for (const [lo, hi] of rules.ramps ?? []) {
    const x = lo % W;
    const y = (lo - x) / W;
    const dx = (hi % W) - x;
    const dy = Math.floor(hi / W) - y;
    if (Math.abs(dx) + Math.abs(dy) !== 1 || h[hi] !== h[lo] + 1) continue;
    const bx = x - dx;
    const by = y - dy;
    if (bx < 0 || by < 0 || bx >= W || by >= H || h[by * W + bx] !== h[lo] || occ[lo] || occ[by * W + bx]) continue;
    placed.push({ x, y, z: h[lo], orientation: orientationForHigh(dx, dy) });
    occ[lo] = 1;
    used.push([x, y]);
    const a = labels[lo];
    const b = labels[hi];
    linked[a].push(b);
    linked[b].push(a);
  }
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
  //    a brush's walkable ground: its steps joined to the ground beside them wherever it is (on
  //    M9a's terraced land a stroke beyond the core often stands off the start's network; its steps
  //    are still the player's way up, D204)
  if (rules.walkTargets) {
    const wt = new Uint8Array(R);
    for (let i = 0; i < labels.length; i++) if (rules.walkTargets[i]) wt[labels[i]] = 1;
    for (let r = 0; r < R; r++) {
      if (!wt[r]) continue;
      for (const n of adj[r]) {
        if (find(r) === find(n)) continue;
        if (linked[r].includes(n)) {
          union(r, n);
          continue;
        }
        const cand = between(r, n);
        if (cand.length && tryPlace(cand, false)) union(r, n);
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
