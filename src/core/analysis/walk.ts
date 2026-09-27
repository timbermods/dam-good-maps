// Walking distance from the start (PLAN §5.6, §11.4; D85): how far a beaver walks from the
// district center over land the colony can walk. Moves go to the 4 neighbours on the same level
// (1 tile) and to a diagonal neighbour when both tiles beside the diagonal are on that level too
// (√2); a slope joins its low tile and its high tile (1). Objects that block walking (Thorns,
// Blockage, relics, ...) are never entered. The map's Slope entities are its natural ramps: the
// walk takes them, and never a flight of stairs the player would have to build.
//
// Port of the workshop study's `walkDistance` (investigation/workshop/lib/measures.ts), bounded at
// `WALK_LIMIT` tiles. prototype/analysis.py `walk_distance` is the same rule; Dijkstra's result
// does not depend on the order ties pop, so both give the same distances bit for bit (the sums of
// 1 and √2 along the shortest path).

import { MinHeap } from "../math/grid";

/** Farther than this is "not within walking distance" (every threshold is 40 or less). */
export const WALK_LIMIT = 64;

const S2 = Math.SQRT2;
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Walking distance from the start's 3×3 (distance 0 on each of its tiles), Infinity beyond
 *  `limit` or where the walk cannot go. `links` are slope links (low tile, high tile). */
export function walkDistance(
  h: ArrayLike<number>,
  W: number,
  H: number,
  blocked: Uint8Array | null,
  links: readonly (readonly [number, number])[],
  start: { x: number; y: number },
  limit = WALK_LIMIT,
): Float64Array {
  const N = W * H;
  // slope links as a CSR adjacency list, in insertion order
  const count = new Int32Array(N + 1);
  for (const [a, b] of links) {
    count[a + 1]++;
    count[b + 1]++;
  }
  for (let i = 0; i < N; i++) count[i + 1] += count[i];
  const fill = count.slice(0, N);
  const adj = new Int32Array(count[N]);
  for (const [a, b] of links) {
    adj[fill[a]++] = b;
    adj[fill[b]++] = a;
  }
  const d = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  for (let y = start.y - 1; y <= start.y + 1; y++)
    for (let x = start.x - 1; x <= start.x + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      d[i] = 0;
      heap.push(0, i);
    }
  const free = (i: number, lv: number) => !(blocked && blocked[i]) && h[i] === lv;
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > d[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    const lv = h[c];
    for (const [dx, dy] of DIRS) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (!free(n, lv)) continue;
      if (dx && dy && !(free(y * W + xx, lv) && free(yy * W + x, lv))) continue;
      const nd = k + (dx && dy ? S2 : 1);
      if (nd < d[n] && nd <= limit) {
        d[n] = nd;
        heap.push(nd, n);
      }
    }
    for (let q = count[c]; q < count[c + 1]; q++) {
      const n = adj[q];
      if (blocked && blocked[n]) continue;
      const nd = k + 1;
      if (nd < d[n] && nd <= limit) {
        d[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return d;
}

/** How far a beaver walks to reach tile i: to the tile itself, or to a 4-neighbour and one more
 *  step (a tree on a ledge is cut from the ground beside it). */
export function reachAt(d: Float64Array, W: number, H: number, i: number): number {
  const x = i % W;
  const y = (i - x) / W;
  let best = d[i];
  if (x > 0 && d[i - 1] + 1 < best) best = d[i - 1] + 1;
  if (x + 1 < W && d[i + 1] + 1 < best) best = d[i + 1] + 1;
  if (y > 0 && d[i - W] + 1 < best) best = d[i - W] + 1;
  if (y + 1 < H && d[i + W] + 1 < best) best = d[i + W] + 1;
  return best;
}

/** Water a pump reaches (PLAN §5.6): clean (contamination under 0.05) and at least 0.3 deep. */
export const PUMP_DEPTH = 0.3;
export const PUMP_CLEAN = 0.05;
/** A pump on a shore reaches water whose surface stands 0–2 levels below the shore's ground (the
 *  Folktails WaterPump's pipe). */
export const PUMP_REACH = 2;

/** Requirement 1, the water rule (Kyler, 2026-09-25, D153, amending D85): the walk from the start to the
 *  nearest shore tile a beaver reaches on foot (`walk`: `walkDistance` over the map's own ground and
 *  its Slope entities, never player stairs) that touches (4-neighbour) clean pumpable water whose
 *  surface a pump on that shore reaches: 0–2 levels below the shore's own ground. The shore may be
 *  on any level the walk reaches. Returns the distance and the water tile, or Infinity and −1. */
export function pumpShoreDistance(
  walk: Float64Array,
  h: ArrayLike<number>,
  W: number,
  H: number,
  depth: ArrayLike<number>,
  contamination: ArrayLike<number>,
): { distance: number; tile: number } {
  let best = Infinity;
  let tile = -1;
  for (let i = 0; i < W * H; i++) {
    const d = depth[i];
    if (!(d >= PUMP_DEPTH) || !(contamination[i] < PUMP_CLEAN)) continue;
    const surface = h[i] + d;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) n = x > 0 ? i - 1 : -1;
      else if (k === 1) n = x + 1 < W ? i + 1 : -1;
      else if (k === 2) n = y > 0 ? i - W : -1;
      else n = y + 1 < H ? i + W : -1;
      if (n < 0 || !(walk[n] < best)) continue;
      const level = h[n];
      if (surface >= level - PUMP_REACH && surface <= level + 0.01) {
        best = walk[n];
        tile = i;
      }
    }
  }
  return { distance: best, tile };
}

/** Water deeper than this joins a body of water (`runningFlow`'s bodies, 4-connected). */
export const WATER_BODY = 0.001;

/** A tile's shortest walk to a shore from which a pump reaches its water at `d` deep (Infinity when
 *  none, or the water is not pumpable): `pumpShoreDistance` for one tile. */
function tileShoreWalk(walk: Float64Array, h: ArrayLike<number>, W: number, H: number, i: number, d: number, clean: boolean): number {
  if (!(d >= PUMP_DEPTH) || !clean) return Infinity;
  const surface = h[i] + d;
  const x = i % W;
  const y = (i - x) / W;
  let best = Infinity;
  for (let k = 0; k < 4; k++) {
    const n = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x + 1 < W ? i + 1 : -1) : k === 2 ? (y > 0 ? i - W : -1) : y + 1 < H ? i + W : -1;
    if (n < 0 || !(walk[n] < best)) continue;
    if (surface >= h[n] - PUMP_REACH && surface <= h[n] + 0.01) best = walk[n];
  }
  return best;
}

/**
 * The water rule with Kyler's D302 (amending D153): `pumpShoreDistance` over the water a start may
 * count, never a sealed puddle. Water counts when its body of water (4-connected, over 0.001 deep, as
 * `runningFlow` finds it) is fed by a running source (an emitter of strength over 0 with a cell in the
 * body), or is a lake that lasts the rule's drought: one of its tiles a pump reaches from a shore within
 * `within` tiles' walk now is still one after the drought (`after`: `droughtStorage` for the rule's
 * days, the sources off). Returns the distance and tile of the nearest water that counts, and the walk
 * to the nearest water the rule leaves out when it is nearer (`puddle`; Infinity otherwise).
 */
export function startWaterShore(
  walk: Float64Array,
  h: ArrayLike<number>,
  W: number,
  H: number,
  depth: ArrayLike<number>,
  contamination: ArrayLike<number>,
  emitters: readonly { cells: readonly number[]; strength: number }[],
  after: ArrayLike<number>,
  within: number,
): { distance: number; tile: number; puddle: number } {
  const N = W * H;
  // the bodies of water
  const body = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let bodies = 0;
  for (let s = 0; s < N; s++) {
    if (body[s] >= 0 || !(depth[s] > WATER_BODY)) continue;
    const k = bodies++;
    body[s] = k;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      const y = (i - x) / W;
      for (let m = 0; m < 4; m++) {
        const n = m === 0 ? (x > 0 ? i - 1 : -1) : m === 1 ? (x + 1 < W ? i + 1 : -1) : m === 2 ? (y > 0 ? i - W : -1) : y + 1 < H ? i + W : -1;
        if (n < 0 || body[n] >= 0 || !(depth[n] > WATER_BODY)) continue;
        body[n] = k;
        queue[tail++] = n;
      }
    }
  }
  // fed by a running source, or lasting the drought within the walk
  const counts = new Uint8Array(bodies);
  for (const e of emitters) if (e.strength > 0) for (const c of e.cells) if (c >= 0 && c < N && body[c] >= 0) counts[body[c]] = 1;
  const now = new Float64Array(N).fill(Infinity);
  for (let i = 0; i < N; i++) {
    if (body[i] < 0) continue;
    const clean = contamination[i] < PUMP_CLEAN;
    const w = tileShoreWalk(walk, h, W, H, i, depth[i], clean);
    now[i] = w;
    if (!counts[body[i]] && w <= within && tileShoreWalk(walk, h, W, H, i, after[i], clean) <= within) counts[body[i]] = 1;
  }
  let distance = Infinity;
  let tile = -1;
  let puddle = Infinity;
  for (let i = 0; i < N; i++) {
    if (!(now[i] < Infinity)) continue;
    if (counts[body[i]]) {
      if (now[i] < distance) {
        distance = now[i];
        tile = i;
      }
    } else if (now[i] < puddle) puddle = now[i];
  }
  return { distance, tile, puddle: puddle < distance ? puddle : Infinity };
}

/** The water rule before Kyler's amendment of 2026-09-25 (D153): the walk on the start's own level
 *  (`flat`, `walkDistance` without links) to the nearest shore tile on that level (`level`) that
 *  touches a tile of `water`. No check uses it; the landscapes survey
 *  (investigation/landscapes/lib/convert.ts) still places real-place starts with it. */
export function shoreDistance(flat: Float64Array, h: ArrayLike<number>, W: number, H: number, water: Uint8Array, level: number): { distance: number; tile: number } {
  let best = Infinity;
  let tile = -1;
  for (let i = 0; i < W * H; i++) {
    if (!water[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) n = x > 0 ? i - 1 : -1;
      else if (k === 1) n = x + 1 < W ? i + 1 : -1;
      else if (k === 2) n = y > 0 ? i - W : -1;
      else n = y + 1 < H ? i + W : -1;
      if (n < 0 || h[n] !== level) continue;
      if (flat[n] < best) {
        best = flat[n];
        tile = i;
      }
    }
  }
  return { distance: best, tile };
}
