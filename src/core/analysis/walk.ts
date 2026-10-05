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

import { entityTiles } from "../features/edits";
import { slopeHighSide, type Orientation } from "../format/footprints";
import type { JsonObject } from "../format/json";
import { MinHeap, N8 } from "../math/grid";
import { components } from "./regions";

/** Farther than this is "not within walking distance" (every threshold is 40 or less). */
export const WALK_LIMIT = 64;

/** Objects that block walking: a beaver never enters a tile their footprint covers. */
export const WALK_BLOCKERS = new Set([
  "Thorns", "Blockage", "NaturalDam", "UnstableCore", "GeothermalField", "UndergroundRuins", "SmallRelic", "MediumRelic", "LargeRelic",
  // the reserves and the drill fill their tiles, and the drain its own (PLAN §20 D337, D338)
  "ReservePile", "ReserveWarehouse", "ReserveTank", "AncientAquiferDrill", "BadtideDrain",
]);

/** What the walk reads of an object on the map: a map file's object (`MapObject`) or the build's
 *  entity (an entity read from a file without a BlockObject covers no tile, `entityTiles`). */
export interface WalkObject {
  template: string;
  x: number;
  y: number;
  z?: number;
  orientation: Orientation;
  flipped?: boolean;
  raw?: JsonObject;
}

/** The links (low tile, high tile) of `slopes`, in their order: a slope joins its own tile and the
 *  tile on its high side, where both are on the map. */
export function slopeLinks(slopes: readonly { x: number; y: number; orientation: Orientation }[], W: number, H: number): [number, number][] {
  const links: [number, number][] = [];
  for (const s of slopes) {
    const [dx, dy] = slopeHighSide(s.orientation);
    const hx = s.x + dx;
    const hy = s.y + dy;
    if (s.x >= 0 && s.y >= 0 && s.x < W && s.y < H && hx >= 0 && hy >= 0 && hx < W && hy < H) links.push([s.y * W + s.x, hy * W + hx]);
  }
  return links;
}

/** Water deeper than this blocks the walk when `walkWorld` is asked to (`wet`): the checks' `WET`. */
const WALK_WET = 0.05;

/** The colony's walk graph over a map's objects (`walkDistance`, `walkRegions`): the tiles the
 *  footprints of the objects that block walking cover (`WALK_BLOCKERS`), and the links of its Slopes
 *  (`slopeLinks`), in the objects' order. `blockers: false` leaves the blocked tiles out (the walk
 *  regions of the ground and its slopes alone); `wet` blocks every tile also where that depth
 *  stands over 0.05. */
export function walkWorld(objects: readonly WalkObject[], W: number, H: number, opts: { blockers?: boolean; wet?: ArrayLike<number> } = {}): { blocked: Uint8Array; links: [number, number][] } {
  const blocked = new Uint8Array(W * H);
  const slopes: WalkObject[] = [];
  for (const o of objects) {
    if (o.template === "Slope") slopes.push(o);
    else if (opts.blockers !== false && WALK_BLOCKERS.has(o.template)) for (const [x, y] of entityTiles(o)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  }
  const wet = opts.wet;
  if (wet) for (let i = 0; i < W * H; i++) if (wet[i] > WALK_WET) blocked[i] = 1;
  return { blocked, links: slopeLinks(slopes, W, H) };
}

const S2 = Math.SQRT2;

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
    for (const [dx, dy] of N8) {
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
    const w = tileShoreWalk(walk, h, W, H, i, depth[i], contamination[i] < PUMP_CLEAN);
    if (w < best) {
      best = w;
      tile = i;
    }
  }
  return { distance: best, tile };
}

/** Water deeper than this joins a body of water (`runningFlow`'s bodies, 4-connected). */
export const WATER_BODY = 0.001;

/** A tile's shortest walk to a shore from which a pump reaches its water at `d` deep (Infinity when
 *  none, or the water is not pumpable): `pumpShoreDistance` for one tile. */
export function tileShoreWalk(walk: Float64Array, h: ArrayLike<number>, W: number, H: number, i: number, d: number, clean: boolean): number {
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
  const wetMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (depth[i] > WATER_BODY) wetMask[i] = 1;
  const { labels: body, sizes } = components(wetMask, W, H);
  const bodies = sizes.length;
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
 *  touches a tile of `water`. No check uses it; the landscapes survey and Pick a place
 *  (investigation/landscapes/lib/convert.ts, investigation/pickplace/convert.ts) still place
 *  real-place starts with it. */
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
