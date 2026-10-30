// Easy start's ground (D495), shaped as the land is shaped, before it is shown (D348): a level clearing round the
// start and a backwater pond beside it, so a player can build and pump at once. Nothing is stamped: the clearing's
// outline and the pond's wander by the seed, and both read the land they are cut from.
//
// - The pond: a small backwater between the start and its water (a river, or a lake), 3 tiles or more off the
//   water, dug two levels below a cut (one near the beds' floor, item 47) that joins it to the water: the cut
//   stands just under the water's planned surface, so the water fills the pond, a drought leaves it holding water
//   (its sill is the cut), and its dead end keeps a badtide's water out of it for days, where the river itself
//   turns bad at once.
// - The clearing: the start stands a level above the cut and a third of a level or more above the water's
//   surface, so it stays dry and a pump on its own ground draws the pond after a drought too (a pump reaches 2
//   levels down; a drought leaves the pond half a level under its sill). Its ground within about 13 tiles, joined
//   to it, is made level at that level: higher ground cut down (a start planned up to three levels higher sits in
//   a clearing cut into its bench, its edge eased a level a tile), a dip filled only well away from water (filling
//   never dams water: D290, D328). Within about 8 tiles, ground more than 2 levels from the start is first brought
//   to 2 (a cliff cut back, a chasm eased), the banks of water left as they are.

import * as portable from "../math/portable";
import { distanceFrom } from "../math/grid";
import type { Rng } from "../math/rng";
import { BED_FLOOR } from "./genome";

/** The clearing's radius and the calm ring's, in tiles from the start's middle (the targets' 14 and 8, a little
 *  inside them). */
export const CLEARING = 13.5;
export const CALM = 8.5;
/** How far round the clearing its edge is eased, a level a tile. */
export const EASE = 3.5;
/** The water a pond is joined to: 13–24 tiles from the start's middle (the pond's near shore 5 tiles out, its far
 *  side 3 or more short of the water, the cut between). */
export const POND_WATER = { lo: 13, hi: 24 } as const;
/** How far above the cut a planned start may stand: its clearing is cut down to a level above the cut. */
export const POND_DROP = 4;

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
  /** The tiles dug for the pond, its cut, and the water it joins. */
  pond: number[];
  cut: number[];
  water: number;
  /** Tiles of the clearing at the start's level, and that level (a level above the cut). */
  clearing: number;
  level: number;
}

/** Shapes the start's clearing and pond on `h` (in place), on the water the land was planned with (`depth`, and
 *  the hydrology's `water`: 1 channels, 2 lakes). Null, `h` unchanged, when the place has no water a pond can be
 *  joined to (`pondWater`). */
export function shapeEasyStart(h: Uint8Array, W: number, H: number, p: EasyPlace, depth: ArrayLike<number>, water: ArrayLike<number>, rng: Rng, off: Uint8Array | null = null): EasyShape | null {
  const N = W * H;
  const j = pondWater(h, W, H, depth, water, p, off);
  if (j < 0) return null;
  const L = cutLevel(h, depth, water, j) + 1;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isWater(depth, water, i)) wet[i] = 1;
  const wetD = distanceFrom(wet, W, H);
  const angle = (x: number, y: number) => portable.atan2(y - p.y, x - p.x);
  const outline = wobble(rng, 0.2);
  const calm = wobble(rng, 0.12);
  // the calm ring first: no cliff or chasm of more than 2 levels within it, the banks of water as they are
  const rc = Math.ceil(CALM * 1.2);
  for (let dy = -rc; dy <= rc; dy++)
    for (let dx = -rc; dx <= rc; dx++) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const r = CALM * calm(angle(x, y));
      if (dx * dx + dy * dy > r * r) continue;
      const i = y * W + x;
      if (wet[i] || wetD[i] < 2) continue;
      if (h[i] > L + 2) h[i] = L + 2;
      else if (h[i] < L - 2 && wetD[i] >= 4) h[i] = L - 2;
    }
  // then the clearing: joined ground near the start's level, inside its wandering outline, made level (higher
  // ground cut down, beside water a level at most; lower ground filled only well away from water)
  const seen = new Uint8Array(N);
  const q = [p.y * W + p.x];
  seen[q[0]] = 1;
  let clearing = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    h[c] = L;
    clearing++;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const n = ny * W + nx;
      if (seen[n] || wet[n]) continue;
      const dx = nx - p.x;
      const dy = ny - p.y;
      const r = CLEARING * outline(angle(nx, ny));
      if (dx * dx + dy * dy > r * r) continue;
      const v = h[n] - L;
      const ok = v === 0 || (v > 0 && v <= 3 + p.level - L && wetD[n] >= 2) || (v < 0 && v >= -2 && wetD[n] >= 3 - 2 * v);
      if (ok) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  // its edge eased: the ground round it rises a level a tile at most for three tiles, never a sheer wall round a sunk
  // clearing (cut only, off the water's banks)
  // (its rise wandering round it, wider and narrower steps, so no ring of even terraces stands round the clearing)
  const rise = wobble(rng, 0.45);
  const fromClearing = distanceFrom(seen, W, H);
  for (let i = 0; i < N; i++) {
    const d = fromClearing[i];
    if (!(d > 0 && d <= EASE) || wet[i] || wetD[i] < 2) continue;
    const top = L + Math.ceil(d * rise(angle(i % W, Math.floor(i / W))));
    if (h[i] > top) h[i] = top;
  }
  // the pond: between the start and its water, its near shore 5 tiles from the start's middle
  const wx = j % W;
  const wy = (j - wx) / W;
  const dist = portable.sqrt((wx - p.x) * (wx - p.x) + (wy - p.y) * (wy - p.y));
  const ux = (wx - p.x) / dist;
  const uy = (wy - p.y) / dist;
  const rp = Math.max(2.2, Math.min(3.8, (dist - 9) / 2));
  const pcx = p.x + ux * (5 + rp);
  const pcy = p.y + uy * (5 + rp);
  const cut = cutLevel(h, depth, water, j);
  // (two levels under the cut, or one where that would go below the beds' floor, item 47: a drought still leaves
  // half a level, deep enough for a pump)
  const floor = Math.max(cut - 2, BED_FLOOR);
  const shore = wobble(rng, 0.25);
  // (stretched a little along the way to the water, as a backwater lies)
  const stretch = rng.range(1, 1.35);
  const pond: number[] = [];
  const R = Math.ceil(rp * 1.6 + 1);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = Math.round(pcx) + dx;
      const y = Math.round(pcy) + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 4) continue;
      const i = y * W + x;
      // (three tiles or more from the water: only the cut joins them, so a badtide's water reaches it slowly)
      if (wet[i] || wetD[i] < 3) continue;
      const ox = x - pcx;
      const oy = y - pcy;
      const along = (ox * ux + oy * uy) / stretch;
      const across = -ox * uy + oy * ux;
      const r = rp * shore(portable.atan2(oy, ox));
      if (along * along + across * across > r * r) continue;
      if (h[i] > floor) h[i] = floor;
      pond.push(i);
    }
  if (pond.length < 9) return null;
  // the cut: from the pond's far side to the water, a tile wide, 4-connected, at the cut's level
  const cutTiles: number[] = [];
  let cx = Math.round(pcx);
  let cy = Math.round(pcy);
  for (let s = 0; s < 4 * POND_WATER.hi; s++) {
    const i = cy * W + cx;
    if (wet[i]) break;
    if (!pond.includes(i) && Math.max(Math.abs(cx - p.x), Math.abs(cy - p.y)) > 3) {
      if (h[i] > cut) h[i] = cut;
      cutTiles.push(i);
    }
    // a step toward the water, one axis at a time (the larger first)
    const ex = wx - cx;
    const ey = wy - cy;
    if (!ex && !ey) break;
    if (Math.abs(ex) >= Math.abs(ey)) cx += Math.sign(ex);
    else cy += Math.sign(ey);
  }
  return { pond, cut: cutTiles, water: j, clearing, level: L };
}
