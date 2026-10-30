// Easy start's ground (D495), shaped as the land is shaped, before it is shown (D348): a level clearing round the
// start and a backwater pond beside it, so a player can build and pump at once. Nothing is stamped: the clearing's
// outline, its rim, the pond's shore and the cut's course follow a noise field the seed draws and the land's own
// levels, so each reads as ground the water and the weather made.
//
// - The pond: a small backwater between the start and its water (a river, or a lake), 3 tiles or more off the
//   water, dug two levels below a cut (one near the beds' floor, item 47) that joins it to the water: the cut
//   stands just under the water's planned surface, so the water fills the pond, a drought leaves it holding water
//   (its sill is the cut), and its dead end keeps a badtide's water out of it for days, where the river itself
//   turns bad at once. Its shore grows out from its middle over the lower ground first, as water pools; the cut
//   takes the low ground's way to the water, bending where the land does, a tile wide at the pond and opening
//   to the water's mouth, its banks sloping back up to the land.
// - The clearing: the start stands a level above the cut and a third of a level or more above the water's
//   surface, so it stays dry and a pump on its own ground draws the pond after a drought too (a pump reaches 2
//   levels down; a drought leaves the pond half a level under its sill). Its ground within about 13 tiles, joined
//   to it, is made level at that level: higher ground cut down (a start planned up to three levels higher sits in
//   a clearing cut into its bench), a dip filled only well away from water (filling never dams water: D290, D328).
//   Its rim eases back into the ground round it, gently in one place and in a short bluff in another, never an
//   even ring of steps. Within about 8 tiles, ground more than 2 levels from the start is first brought to 2 (a
//   cliff cut back, a chasm eased), the banks of water left as they are.
//
// The whole shape is cut on a copy of the land and written back only once it stands (a pond with room, a cut that
// reaches the water, nothing on ground another start's shape took): a place that can't have one leaves the land as
// it was.

import * as portable from "../math/portable";
import { distanceFrom, MinHeap } from "../math/grid";
import { fbm } from "../math/noise";
import type { Rng } from "../math/rng";
import { BED_FLOOR } from "./genome";

/** The clearing's radius and the calm ring's, in tiles from the start's middle (the targets' 14 and 8, a little
 *  inside them). */
export const CLEARING = 13.5;
export const CALM = 8.5;
/** How far round the clearing, and beside the cut, the ground is eased back up to the land's. */
export const EASE = 6;
/** The water a pond is joined to: 13–24 tiles from the start's middle (the pond's near shore 5 tiles out, its far
 *  side 3 or more short of the water, the cut between). */
export const POND_WATER = { lo: 13, hi: 24 } as const;
/** How far above the cut a planned start may stand: its clearing is cut down to a level above the cut. */
export const POND_DROP = 4;
/** The pond's least size in tiles (a smaller one is no place's pond). */
export const POND_LEAST = 9;
/** The pond's near shore: this far from the start's middle at the least. */
const POND_NEAR = 5;

export interface EasyPlace {
  x: number;
  y: number;
  level: number;
}

/** The surface of tile j's water as planned (a channel at least `CHANNEL_DEPTH` deep). */
function surfaceAt(h: ArrayLike<number>, depth: ArrayLike<number>, water: ArrayLike<number>, j: number): number {
  return h[j] + (water[j] === 1 ? Math.max(depth[j], CHANNEL_DEPTH) : depth[j]);
}
/** A planned channel's least depth, and how far the clearing stands above the water's planned surface at the least
 *  (the settled water runs a little higher than the plan: the clearing stays dry). */
const CHANNEL_DEPTH = 0.55;
const DRY_MARGIN = 0.35;

/** The level a cut from tile j's water stands at, or NaN where none suits: the water's surface less a tenth,
 *  rounded down (the water flows in over it, and a drought leaves the pond full to it), where the level above it,
 *  the clearing's, stands `DRY_MARGIN` or more over the surface. */
export function cutLevel(h: ArrayLike<number>, depth: ArrayLike<number>, water: ArrayLike<number>, j: number): number {
  const s = surfaceAt(h, depth, water, j);
  const c = Math.floor(s - 0.1);
  return c + 1 - s >= DRY_MARGIN ? c : NaN;
}

const isWater = (depth: ArrayLike<number>, water: ArrayLike<number>, i: number) => depth[i] > 0.02 || water[i] === 1 || water[i] === 2;

/** The water tile a start at `p` would have its pond joined to: water 13–24 tiles from its middle whose cut stands
 *  1–3 levels under the start's ground, with room for the pond's floor two levels under it above the beds' floor;
 *  the nearest, a level under the start first (the least cut), off `off` (a river's head, whose sources its water
 *  must not reach, D171); −1 when none. */
export function pondWater(h: ArrayLike<number>, W: number, H: number, depth: ArrayLike<number>, water: ArrayLike<number>, p: EasyPlace, off: Uint8Array | null = null): number {
  let best = -1;
  let bestScore = Infinity;
  const r = POND_WATER.hi;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 < POND_WATER.lo * POND_WATER.lo || d2 > r * r) continue;
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const j = y * W + x;
      if (!isWater(depth, water, j) || off?.[j]) continue;
      const c = cutLevel(h, depth, water, j);
      const drop = p.level - c;
      if (!Number.isFinite(c) || drop < 1 || drop > POND_DROP || c - 1 < BED_FLOOR) continue;
      const score = portable.sqrt(d2) + 6 * (drop - 1);
      if (score < bestScore) {
        best = j;
        bestScore = score;
      }
    }
  return best;
}

/** A gentle wobble of a radius by angle, from a few harmonics the seed draws. */
function wobble(rng: Rng, amount: number): (a: number) => number {
  const k = [rng.float() * 6.283, rng.float() * 6.283, rng.float() * 6.283];
  const w = [rng.range(0.5, 1), rng.range(0.3, 0.8), rng.range(0.2, 0.6)];
  return (a) => 1 + amount * (w[0] * portable.sin(a + k[0]) + w[1] * portable.sin(2 * a + k[1]) + w[2] * portable.sin(3 * a + k[2])) / (w[0] + w[1] + w[2]);
}

export interface EasyShape {
  /** The tiles dug for the pond, its cut (from the pond to the water, in order), the cut's mouth where it opens to
   *  the water, and the water it joins. */
  pond: number[];
  cut: number[];
  mouth: number[];
  water: number;
  /** Tiles of the clearing at the start's level, and that level (a level above the cut). */
  clearing: number;
  level: number;
  /** Every tile the shape changed or holds (its clearing, rim, pond and cut): another start's shape keeps off it. */
  area: number[];
}

/** Shapes the start's clearing and pond on `h`, on the water the land was planned with (`depth`, and the
 *  hydrology's `water`: 1 channels, 2 lakes), keeping off `off` (a river's head) and `taken` (the ground other
 *  starts' shapes hold). Null, `h` unchanged, when the place has no water a pond can be joined to (`pondWater`),
 *  no room for a pond, no way to the water for its cut, or would reach ground `taken` holds. */
export function shapeEasyStart(h: Uint8Array, W: number, H: number, p: EasyPlace, depth: ArrayLike<number>, water: ArrayLike<number>, rng: Rng, off: Uint8Array | null = null, taken: Uint8Array | null = null): EasyShape | null {
  const N = W * H;
  const j = pondWater(h, W, H, depth, water, p, off);
  if (j < 0) return null;
  const cut = cutLevel(h, depth, water, j);
  const L = cut + 1;
  // (cut on a copy, written back once the whole shape stands)
  const g = h.slice();
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isWater(depth, water, i)) wet[i] = 1;
  const wetD = distanceFrom(wet, W, H);
  const angle = (x: number, y: number) => portable.atan2(y - p.y, x - p.x);
  const outline = wobble(rng, 0.16);
  const calm = wobble(rng, 0.12);
  // (the noise the shape follows: the clearing's edge, the rim's steepness, the pond's shore and the cut's course)
  const ns = rng.nextU32();
  const noise = (x: number, y: number, cell: number, k: number) => fbm((ns + k * 0x9e3779b1) >>> 0, x, y, cell, 2);
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1;
  const fromStart2 = (x: number, y: number) => (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
  // the calm ring first: no cliff or chasm of more than 2 levels within it, the banks of water as they are
  const rc = Math.ceil(CALM * 1.2);
  for (let dy = -rc; dy <= rc; dy++)
    for (let dx = -rc; dx <= rc; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!inside(x, y)) continue;
      const r = CALM * calm(angle(x, y));
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * W + x;
      if (wet[i] || wetD[i] < 2) continue;
      if (g[i] > L + 2) g[i] = L + 2;
      else if (g[i] < L - 2 && wetD[i] >= 4) g[i] = L - 2;
    }
  // then the clearing: joined ground near the start's level, inside its wandering outline (a broad wobble round
  // the start, and the noise's finer one along it), made level (higher ground cut down, beside water a level at
  // most; lower ground filled only well away from water)
  const seen = new Uint8Array(N);
  const q = [p.y * W + p.x];
  seen[q[0]] = 1;
  let clearing = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    g[c] = L;
    clearing++;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (!inside(nx, ny)) continue;
      const n = ny * W + nx;
      if (seen[n] || wet[n]) continue;
      const r = CLEARING * (outline(angle(nx, ny)) + 0.14 * noise(nx, ny, 5, 0));
      if (fromStart2(nx, ny) > r * r) continue;
      const v = g[n] - L;
      const ok = v === 0 || (v > 0 && v <= 3 + p.level - L && wetD[n] >= 2) || (v < 0 && v >= -2 && wetD[n] >= 3 - 2 * v);
      if (ok) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  // the pond: grown from its middle, between the start and its water, out over the lower ground first (the land's
  // own levels, as water pools) and along the noise, its near shore `POND_NEAR` from the start's middle and three
  // tiles or more from the water (only the cut joins them, so a badtide's water reaches it slowly)
  const wx = j % W;
  const wy = (j - wx) / W;
  const dist = portable.sqrt(fromStart2(wx, wy));
  const ux = (wx - p.x) / dist;
  const uy = (wy - p.y) / dist;
  const rp = Math.max(2.2, Math.min(3.8, (dist - 9) / 2));
  const pcx = p.x + ux * (POND_NEAR + rp);
  const pcy = p.y + uy * (POND_NEAR + rp);
  // (drawn out along the bank, as a backwater lies)
  const stretch = rng.range(1.2, 1.8);
  const want = Math.round(Math.PI * rp * rp * stretch);
  const pondOk = (x: number, y: number) => inside(x, y) && !wet[y * W + x] && wetD[y * W + x] >= 3 && fromStart2(x, y) >= POND_NEAR * POND_NEAR;
  const isPond = new Uint8Array(N);
  const pond: number[] = [];
  {
    // (its seed: the middle, or the tile nearest it the pond may take)
    let s0 = -1;
    let best = Infinity;
    const R = Math.ceil(rp) + 1;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = Math.round(pcx) + dx;
        const y = Math.round(pcy) + dy;
        const d = dx * dx + dy * dy;
        if (pondOk(x, y) && d < best) {
          best = d;
          s0 = y * W + x;
        }
      }
    if (s0 < 0) return null;
    const key = (x: number, y: number) => {
      const ox = x - pcx;
      const oy = y - pcy;
      const along = ox * ux + oy * uy;
      const across = (-ox * uy + oy * ux) / stretch;
      return portable.sqrt(along * along + across * across) / rp + 0.7 * noise(x, y, 3, 1) + 0.1 * (h[y * W + x] - L);
    };
    const heap = new MinHeap();
    const queued = new Uint8Array(N);
    heap.push(0, s0);
    queued[s0] = 1;
    while (heap.size && pond.length < want) {
      const c = heap.pop();
      if (heap.lastKey > 1.9) break;
      isPond[c] = 1;
      pond.push(c);
      const cx = c % W;
      const cy = (c - cx) / W;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
        const n = ny * W + nx;
        if (!pondOk(nx, ny) || queued[n]) continue;
        queued[n] = 1;
        heap.push(key(nx, ny), n);
      }
    }
    // (an islet left in it is pond too, and a notch in its shore, a tile with pond on three sides: no pillar
    // standing in the water, no shore of single-tile notches)
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (const c of pond) {
      const cx = c % W;
      const cy = (c - cx) / W;
      x0 = Math.min(x0, cx - 1);
      y0 = Math.min(y0, cy - 1);
      x1 = Math.max(x1, cx + 1);
      y1 = Math.max(y1, cy + 1);
    }
    const outside = new Uint8Array(N);
    const edge: number[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if ((x === x0 || x === x1 || y === y0 || y === y1) && x >= 0 && y >= 0 && x < W && y < H && !isPond[y * W + x]) {
          outside[y * W + x] = 1;
          edge.push(y * W + x);
        }
      }
    for (let k = 0; k < edge.length; k++) {
      const c = edge[k];
      const cx = c % W;
      const cy = (c - cx) / W;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
        if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
        const n = ny * W + nx;
        if (outside[n] || isPond[n]) continue;
        outside[n] = 1;
        edge.push(n);
      }
    }
    for (let pass = 0; pass < 2; pass++)
      for (let y = y0 + 1; y < y1; y++)
        for (let x = x0 + 1; x < x1; x++) {
          const n = y * W + x;
          if (isPond[n] || !pondOk(x, y)) continue;
          if (outside[n] && isPond[n - 1] + isPond[n + 1] + isPond[n - W] + isPond[n + W] < 3) continue;
          isPond[n] = 1;
          pond.push(n);
        }
  }
  if (pond.length < POND_LEAST) return null;
  // the cut: the low ground's way from the pond to the water whose surface the cut was set by (a river's head
  // aside), the least to cut first, bending with the noise; a tile wide at the pond
  const surface = surfaceAt(h, depth, water, j);
  const goal = (n: number) => wet[n] === 1 && !off?.[n] && Math.abs(surfaceAt(h, depth, water, n) - surface) < 0.3;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  for (const c of pond) {
    cost[c] = 0;
    heap.push(0, c);
  }
  let end = -1;
  let mouthAt = -1;
  const most = 3 * POND_WATER.hi;
  while (heap.size) {
    const c = heap.pop();
    if (heap.lastKey > cost[c]) continue;
    if (cost[c] > most) break;
    const cx = c % W;
    const cy = (c - cx) / W;
    let reached = -1;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (!inside(nx, ny)) continue;
      const n = ny * W + nx;
      if (!isPond[c] && goal(n)) {
        reached = n;
        break;
      }
      if (wet[n] || isPond[n] || fromStart2(nx, ny) < 16) continue;
      const step = 1 + 1.2 * Math.max(0, h[n] - L) + 0.9 * (noise(nx, ny, 4, 2) + 1) + (seen[n] ? 0.6 : 0);
      const k = cost[c] + step;
      if (k < cost[n]) {
        cost[n] = k;
        prev[n] = c;
        heap.push(k, n);
      }
    }
    if (reached >= 0) {
      end = c;
      mouthAt = reached;
      break;
    }
  }
  if (end < 0) return null;
  const path: number[] = [];
  for (let c = end; c >= 0 && !isPond[c]; c = prev[c]) path.push(c);
  path.reverse();
  // (opening as it nears the water: its last stretch widens to its mouth, by the noise)
  const isCut = new Uint8Array(N);
  for (const c of path) isCut[c] = 1;
  const mouth: number[] = [];
  for (let k = 0; k < path.length; k++) {
    const f = path.length > 1 ? k / (path.length - 1) : 1;
    if (f < 0.4) continue;
    const c = path[k];
    const cx = c % W;
    const cy = (c - cx) / W;
    const rr = 0.5 + ((f - 0.4) / 0.6) * (1 + 0.9 * (noise(cx, cy, 4, 3) + 1) * 0.5);
    const R = Math.ceil(rr);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inside(x, y)) continue;
        const n = y * W + x;
        if (wet[n] || isPond[n] || isCut[n] || fromStart2(x, y) < 25) continue;
        isCut[n] = 1;
        mouth.push(n);
      }
  }
  // the clearing's rim and the cut's banks eased back up to the land: no higher than the level the noise's slope
  // allows that far out (gentle in one place, a short bluff in another), cut only, the banks of water as they are
  const fromClearing = distanceFrom(seen, W, H);
  const fromCut = distanceFrom(isCut, W, H);
  for (let i = 0; i < N; i++) {
    if (seen[i] || isCut[i] || isPond[i] || wet[i] || wetD[i] < 2) continue;
    const dl = fromClearing[i];
    const dc = fromCut[i];
    if (!(dl <= EASE) && !(dc <= EASE)) continue;
    const x = i % W;
    const y = (i - x) / W;
    const slope = 0.45 + 1.15 * (noise(x, y, 6, 4) + 1) * 0.5;
    let top = Infinity;
    if (dl <= EASE) top = L + Math.round(dl * slope);
    if (dc <= EASE) top = Math.min(top, cut + Math.max(1, Math.round(dc * slope)));
    if (g[i] > top) g[i] = top;
  }
  // the pond dug two levels under the cut, or one where that would go below the beds' floor (item 47: a drought
  // still leaves half a level, deep enough for a pump), and the cut at its level
  const floor = Math.max(cut - 2, BED_FLOOR);
  for (const i of pond) if (g[i] > floor) g[i] = floor;
  for (const i of path) if (g[i] > cut) g[i] = cut;
  for (const i of mouth) if (g[i] > cut) g[i] = cut;
  // (nothing on ground another start's shape holds)
  const area: number[] = [];
  for (let i = 0; i < N; i++) if (g[i] !== h[i] || seen[i] || isPond[i] || isCut[i]) area.push(i);
  if (taken) for (const i of area) if (taken[i]) return null;
  h.set(g);
  return { pond, cut: path, mouth, water: j, clearing, level: L, area };
}
