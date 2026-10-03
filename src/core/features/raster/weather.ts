// Naturalize's weathering (PLAN §20 D387 (4), D368 (8), D399): what a Naturalize stroke does to the land
// it presses on, as nature would. The stroke gathers pressure (brush.ts); this turns the land before the
// stroke and that pressure into the land after it, all at once, so the same dabs give the same land
// however they were handed in.
//
// - Edges wander: every level's edge, read softly (a binomial blur), moves in or out along one smooth
//   noise, a line that curves in and out by a few tiles and never frays; stacked edges move together,
//   so a cliff stays a cliff. The curves are as wide as Size and at least a few tiles more than
//   Strength, so a strong stroke bends a straight edge in and out by several tiles. The
//   noise is fixed to the map's tiles (never the stroke's seed), and the soft reading pulls a wandered
//   edge back toward its smooth course, so painting the same spot again changes less and less:
//   repeating settles. Knobs and spurs narrower than the softness wear away; nothing small grows.
// - Cliffs retreat: a cliff of three levels or more sheds into the stepped slope scree makes, up from
//   the middle of the cliff and down from it in steps mostly two levels tall, treads two tiles or more
//   (wider with Strength, and varying along the cliff as the map's noise says), its edges wandering:
//   its top pulled back, its foot an apron that runs out in lobes. It sheds only so far round the
//   cliff (taller cliffs farther, unevenly along their length). A slope once shed has no cliff left.
// - Old land has fewer terraces: a narrow stretch of a terrace joins the level it borders most, whole,
//   where that takes away more of the land's edges than it adds; the land keeps its shape in fewer,
//   chunkier, irregular terraces.
// - Flat tops stay flat: nothing moves farther from an edge than the edge itself does.
// - No seam: the effect fades out across the ring's outer part (`intensity`), and a cliff sheds only
//   where the stroke presses (the slope narrowing into the cliff beside it).
// - The water stays where it stood: a wet tile is never raised, and a dry tile beside water never
//   comes down below the water's surface next to it (from the settled water the stroke began on).
// - The downhill order is kept, checked rather than hoped for: no tile it changes ends higher than all
//   four neighbours or lower than all four, no neighbouring pair swaps which is higher, nothing one tile
//   wide appears (a tread, ledge, wall or slot), nothing newly holds water (the drainage of the
//   stroke's area, with the water level round it), and no way water could leave the area closes.
//   Where a change would break one of these it is mended (a tile taking a neighbour's level) or taken
//   back toward the land as it was, until none is broken.
// - Farmland is never lost (rule 3): moist ground keeps its height.
// - Rule 3 weathers one dab at a time (brush.ts): the land the dabs before it left, in a rectangle round
//   where this dab presses harder, its edges wandering only there; the order kept is the land's when the
//   stroke began, and its softening is three box passes (cheap to work out again round each change).
// - It reads and writes only inside its rectangle (the stroke's bounds), so a rebuild gives the same land.
//
// Exact arithmetic only (+ − × ÷ and floor; PLAN §2.1, D366): the same stroke gives the same land on every
// machine.

import { fbm } from "../../math/noise";
import { MinHeap } from "../../math/grid";
import type { Rect } from "./brush";

/** What a weathering needs. Arrays are the whole map's, row-major; only `box` is read or written. */
export interface WeatherInput {
  W: number;
  H: number;
  /** The tiles it reads and writes (the stroke's bounds); its outer ring never changes. */
  box: Rect;
  /** The heights before the stroke. */
  before: Uint8Array;
  /** How strongly each tile is weathered, 0–1 (the gathered pressure, faded toward the ring). */
  intensity: Float32Array;
  /** Brush Size (radius in tiles) and Strength (1–10). */
  size: number;
  strength: number;
  /** Which tiles it may change. */
  write: (i: number) => boolean;
  /** The working area's feathered edge: a tile changes by at most this many levels (null: any). */
  room?: Uint8Array | null;
  /** The lowest each tile may go (ground mode's banks; null: 0). */
  low?: Uint8Array | null;
  /** The highest any tile may stand. */
  top: number;
  /** The level water would stand at on each tile of the box's outer ring, clockwise from its top-left
   *  corner (the map's drainage when the stroke began); absent, the ring's own heights. */
  rim?: readonly number[] | null;
  /** Where the water stood when the stroke began (`shoreOf`): each dry tile beside it and the level it
   *  may come down to, as runs [y, x0, x1, level], and the wet tiles, never raised, as runs [y, x0, x1]. */
  shore?: readonly (readonly number[])[] | null;
  pools?: readonly (readonly number[])[] | null;
  /** What it may keep between the dabs of one stroke (`WeatherCache`, on the same `before`). */
  cache?: WeatherCache | null;
  /** Rule 3: where the water stood on every tile of the map (in place of `shore` and `pools`, and the
   *  moist ground, which keeps its height), and how many times the land has changed since the
   *  stroke began (what the cache keeps is for that land). */
  limits?: { lo: Uint8Array; wet: Uint8Array; moist: Uint8Array } | null;
  version?: number;
  /** Rule 3: the land when the stroke began (the map's): no neighbouring pair ends in the other order
   *  from it, though dabs before this one left them level. */
  origin?: Uint8Array | null;
  /** Rule 3: each tile's intensity before this dab (an edge wanders only where it rose). */
  was?: Float32Array | null;
  /** Each tile it changes, as triples (map tile, level before, level after), when given. */
  changes?: number[] | null;
}

// Work buffers kept between dabs (a large brush's rectangle is tens of thousands of tiles, worked
// through several times a dab): each is the first `n` items of one kept array, its contents whatever
// was last left there (each use fills what it reads first). Nothing here is ever reentered.
const POOL = new Map<string, Uint8Array | Int16Array | Int32Array | Float32Array>();
function pooled<T extends Uint8Array | Int16Array | Int32Array | Float32Array>(name: string, n: number, make: (n: number) => T): T {
  let a = POOL.get(name) as T | undefined;
  if (!a || a.length < n) POOL.set(name, (a = make(Math.max(n, a ? a.length * 2 : 0))));
  return a.subarray(0, n) as T;
}
const u8 = (name: string, n: number) => pooled(name, n, (m) => new Uint8Array(m));
const i16 = (name: string, n: number) => pooled(name, n, (m) => new Int16Array(m));
const i32 = (name: string, n: number) => pooled(name, n, (m) => new Int32Array(m));
const f32 = (name: string, n: number) => pooled(name, n, (m) => new Float32Array(m));

/** Water deeper than this stands on a tile. */
const WET = 1e-3;

/** Where water stands on and beside the tiles a weathering may change (inside `box`'s ring), from the
 *  heights and the settled water's depth: `pools`, the wet tiles, as runs [y, x0, x1]; `shore`, each
 *  dry tile beside water with the lowest whole level at or above that water's surface (it never comes
 *  down below it, so the water never spreads onto it), as runs [y, x0, x1, level]. */
export function shoreOf(box: Rect, heights: ArrayLike<number>, depth: ArrayLike<number>, W: number): { shore: [number, number, number, number][]; pools: [number, number, number][] } {
  const shore: [number, number, number, number][] = [];
  const pools: [number, number, number][] = [];
  for (let y = box.y0 + 1; y < box.y1; y++) {
    let pool: [number, number, number] | null = null;
    let run: [number, number, number, number] | null = null;
    for (let x = box.x0 + 1; x < box.x1; x++) {
      const i = y * W + x;
      if (depth[i] > WET) {
        if (pool && pool[2] === x - 1) pool[2] = x;
        else pools.push((pool = [y, x, x]));
        run = null;
        continue;
      }
      let level = -1;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (depth[j] > WET) level = Math.max(level, Math.ceil(heights[j] + depth[j] - 1e-9));
      if (level < 0) {
        run = null;
        continue;
      }
      if (run && run[2] === x - 1 && run[3] === level) run[2] = x;
      else shore.push((run = [y, x, x, level]));
    }
  }
  return { shore, pools };
}

/** Smooth noise in about [-1, 1] at tile (x, y), its features `cell` tiles across: fractal value noise
 *  read on axes turned by about 37° (a 3-4-5 turn, exact), so nothing it shapes lines up with the
 *  tile grid. */
function noise(seed: number, x: number, y: number, cell: number): number {
  return fbm(seed, 0.8 * x - 0.6 * y + 4096, 0.6 * x + 0.8 * y + 4096, cell, 3);
}

/** World-fixed seeds: the noise belongs to the map's tiles, not to a stroke. */
const WANDER_SEED = 0x6e617475;
const SHED_SEED = 0x72657374;
/** Ground weathered at least this strongly sheds (a cliff's foot and top both). */
const SHED_FROM = 0.25;
/** How far round a cliff of three levels or more edges don't wander (it sheds instead), in tiles. */
const CLIFF_ROOM = 3;
/** A tile that this many tiles drain through (in the stroke's rectangle, before it) is on the way water
 *  runs: an edge never wanders out over it (scree may still fall there; the guard keeps it from damming
 *  anything). */
const CHANNEL = 80;
/** A tile that this many tiles drain through (in the stroke's rectangle, before it) is where a stream
 *  runs: no scree falls on it. */
const STREAM = 320;
/** How far the noise pushes a softened edge (under a half: flat ground far from any edge never moves). */
const WANDER_PUSH = 0.45;

/** The wander's wavelength in tiles: follows Size, within what reads as a terrace's edge. */
export function wanderCell(size: number, strength = 1): number {
  return Math.max(4, Math.min(16, Math.max(Math.round(size * 1.25), 2 + Math.max(1, Math.min(10, strength)))));
}

/** How far round a cliff its ground sheds, in tiles (the map's noise takes it from six tenths of this
 *  to fourteen tenths): farther with Strength. */
export function screeReach(strength: number): number {
  return 1 + 0.2 * Math.max(1, Math.min(10, strength));
}

/** The scree's treads, in tiles: the narrowest, and how many more where the map's noise says (the
 *  wider, the gentler the slope a cliff sheds into, and the farther its top pulls back). Follows
 *  Strength. */
export function shedTread(strength: number): [number, number] {
  const s = Math.max(1, Math.min(10, strength));
  return s <= 3 ? [2, 0] : s <= 7 ? [2, 2] : [3, 3];
}



/** Weather `out` (the map's heights) inside the box from `before` and return the rectangle of tiles
 *  whose height in `out` changed, or null. */
export function weather(inp: WeatherInput, out: Uint8Array): Rect | null {
  const { W, box } = inp;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  if (bw < 3 || bh < 3) return null;
  const n = bw * bh;
  const h0 = u8("h0", n);
  const I = f32("I", n).fill(0);
  let any = false;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const g = (box.y0 + y) * W + box.x0 + x;
      const k = y * bw + x;
      h0[k] = inp.before[g];
      // the ring never changes (rule 3: nor the tiles just inside it, so whatever a dab before left
      // round them is checked too); nor does a tile the stroke may not write
      const edge = inp.origin ? 2 : 1;
      if (x < edge || y < edge || x >= bw - edge || y >= bh - edge) continue;
      const v = inp.intensity[g];
      if (!(v > 0) || !inp.write(g)) continue;
      I[k] = v > 1 ? 1 : v;
      any = true;
    }
  let h: Uint8Array = h0;
  if (any) {
    const cache = inp.cache ?? new WeatherCache(inp.before, W, inp.H);
    // (the same rectangle as the last dab's: the same land and water before it, worked out once)
    const key = `${box.x0},${box.y0},${box.x1},${box.y1}:${inp.version ?? 0}`;
    const p = cache.prepared?.key === key ? cache.prepared : (cache.prepared = prepare(inp, h0, bw, bh, key));
    const { lo, hi, wet, shedHi, ring, w0, still } = p;
    // (rule 3: an edge wanders only where this dab presses harder than those before it)
    let fresh: Uint8Array | null = null;
    if (inp.was) {
      fresh = u8("fresh", n).fill(0);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const k = y * bw + x;
          if (I[k] > inp.was[(box.y0 + y) * W + box.x0 + x]) fresh[k] = 1;
        }
    }
    h = wander(h0, I, bw, bh, box, inp.size, inp.strength, cache, hi, still, fresh);
    shed(h, I, bw, bh, box, inp.strength, cache, lo, shedHi);
    settle(h, I, bw, bh, box, inp.strength, cache, lo, wet);
    tidy(h, h0, I, bw, bh);
    // the limits: the working area's feather, the banks, the ceiling, the water
    for (let y = 1; y < bh - 1; y++)
      for (let x = 1; x < bw - 1; x++) {
        const k = y * bw + x;
        if (h[k] === h0[k]) continue;
        if (!I[k]) {
          h[k] = h0[k];
          continue;
        }
        const g = (box.y0 + y) * W + box.x0 + x;
        let v = Math.min(inp.top, h[k]);
        // (the feather counts from the land when the stroke began: rule 3's dabs each start from the
        // land the dabs before them left)
        if (inp.room) {
          const base = inp.origin ? inp.origin[g] : h0[k];
          v = Math.max(base - inp.room[g], Math.min(base + inp.room[g], v));
        }
        if (inp.low && v < h0[k]) v = Math.max(v, Math.min(h0[k], inp.low[g]));
        v = Math.max(lo[k], Math.min(wet[k], v));
        h[k] = v;
      }
    // (the order the stroke keeps: the land's when it began)
    let ref = h0;
    if (inp.origin) {
      ref = u8("ref", n);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) ref[y * bw + x] = inp.origin[(box.y0 + y) * W + box.x0 + x];
    }
    // (its repairs keep the feather too: within the levels the working area leaves each tile)
    let klo = lo;
    let khi = wet;
    if (inp.room) {
      klo = u8("keep.lo", n);
      khi = u8("keep.hi", n);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const k = y * bw + x;
          const g = (box.y0 + y) * W + box.x0 + x;
          const base = inp.origin ? inp.origin[g] : h0[k];
          klo[k] = Math.max(lo[k], base - inp.room[g]);
          khi[k] = Math.min(wet[k], base + inp.room[g]);
        }
    }
    keepOrder(h, h0, I, bw, bh, ring, w0, klo, khi, p, ref);
  }
  let changed: Rect | null = null;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      const g = (box.y0 + y) * W + box.x0 + x;
      if (out[g] === h[k]) continue;
      inp.changes?.push(g, out[g], h[k]);
      out[g] = h[k];
      const gx = box.x0 + x;
      const gy = box.y0 + y;
      if (!changed) changed = { x0: gx, y0: gy, x1: gx, y1: gy };
      else {
        if (gx < changed.x0) changed.x0 = gx;
        if (gx > changed.x1) changed.x1 = gx;
        if (gy > changed.y1) changed.y1 = gy;
      }
    }
  return changed;
}

/** What a weathering must leave as it is in its rectangle, known before the land moves (it depends only
 *  on the land before the stroke, the rectangle, and where the water stood). */
interface Prepared {
  key: string;
  lo: Uint8Array;
  hi: Uint8Array;
  wet: Uint8Array;
  shedHi: Uint8Array;
  ring: Int16Array;
  w0: Int16Array;
  still: Uint8Array;
  /** The ways water could leave it before the stroke, worked out when first asked. */
  passages?: Passages;
}

function prepare(inp: WeatherInput, h0: Uint8Array, bw: number, bh: number, key: string): Prepared {
  const { box } = inp;
  const n = bw * bh;
  // what it must leave as it is, known before the land moves: where water stood (`wet`: a shore
  // tile never below the water beside it, a wet tile never raised), and, for the wander, the way
  // water runs (`hi`: a tile that drains CHANNEL tiles or more is never raised)
  const lo = new Uint8Array(n);
  const hi = new Uint8Array(n).fill(255);
  for (const [y, a, b, level] of inp.shore ?? []) for (let x = Math.max(a, box.x0); x <= Math.min(b, box.x1); x++) if (y >= box.y0 && y <= box.y1) lo[(y - box.y0) * bw + x - box.x0] = Math.max(0, Math.min(255, level));
  for (const [y, a, b] of inp.pools ?? []) for (let x = Math.max(a, box.x0); x <= Math.min(b, box.x1); x++) if (y >= box.y0 && y <= box.y1) hi[(y - box.y0) * bw + x - box.x0] = h0[(y - box.y0) * bw + x - box.x0];
  // (rule 3: the same from the map's limits, and the moist ground held where it is)
  const limits = inp.limits;
  if (limits)
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const g = (box.y0 + y) * inp.W + box.x0 + x;
        const k = y * bw + x;
        if (limits.lo[g]) lo[k] = limits.lo[g];
        if (limits.wet[g] || limits.moist[g]) hi[k] = h0[k];
        if (limits.moist[g]) lo[k] = h0[k];
      }
  const wet = hi.slice();
  const shedHi = hi.slice();
  const ring = ringLevels(h0, bw, bh, inp.rim ?? null);
  const w0 = new Int16Array(n);
  const area = new Float64Array(n);
  flood(h0, ring, bw, bh, w0, area);
  for (let k = 0; k < n; k++) {
    if (area[k] >= CHANNEL) hi[k] = h0[k];
    // (scree never falls into the way a stream runs either)
    if (area[k] >= STREAM) shedHi[k] = h0[k];
    // the shore of standing water: a dry tile beside it never comes down to within a level of it
    // (water that flows stands a little over its lip, and would spread onto it)
    const x = k % bw;
    const y = (k - x) / bw;
    if (x === 0 || y === 0 || x === bw - 1 || y === bh - 1 || w0[k] > h0[k]) continue;
    for (const j of [k - 1, k + 1, k - bw, k + bw]) if (w0[j] > h0[j]) lo[k] = Math.max(lo[k], w0[j] + 1);
  }
  for (let k = 0; k < n; k++) {
    lo[k] = Math.min(h0[k], lo[k]);
    if (hi[k] < h0[k]) hi[k] = h0[k];
    if (wet[k] < h0[k]) wet[k] = h0[k];
    if (shedHi[k] < h0[k]) shedHi[k] = h0[k];
  }
  // a cliff of three levels or more, and the ground a few tiles round it, is left to shed: edges
  // wander only away from cliffs
  const still = new Uint8Array(n);
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      const v = h0[k];
      if (Math.abs(v - h0[k + 1]) < 3 && Math.abs(v - h0[k + bw]) < 3) continue;
      for (let yy = Math.max(0, y - CLIFF_ROOM); yy <= Math.min(bh - 1, y + 1 + CLIFF_ROOM); yy++)
        for (let xx = Math.max(0, x - CLIFF_ROOM); xx <= Math.min(bw - 1, x + 1 + CLIFF_ROOM); xx++) still[yy * bw + xx] = 1;
    }
  return { key, lo, hi, wet, shedHi, ring, w0, still };
}

// ------------------------------------------------------------------------------------------ wander

/** How soft the weathering reads an edge: how many times a [1 2 1] blur runs each way (a binomial
 *  blur, a Gaussian's whole-number twin, round even in its tails; its spread √(m / 2): 1.4 to 2.3
 *  tiles). The softer, the farther an edge can wander and the larger the knobs and spurs it wears
 *  away. Follows Strength. */
export function wanderBlur(strength: number): number {
  const s = Math.max(1, Math.min(10, strength));
  return s <= 2 ? 4 : s <= 4 ? 6 : s <= 7 ? 8 : 11;
}

/** Rule 3's softening (`boxed`): the box's reach each way, three passes of it about as soft as
 *  `wanderBlur`'s (a box r each way three times spreads √(r(r + 1)) tiles). */
export function wanderBox(strength: number): number {
  const s = Math.max(1, Math.min(10, strength));
  return s <= 3 ? 1 : s <= 7 ? 2 : 3;
}

/** A binomial blur over `v` in the rectangle (x0..x1, y0..y1): `m` passes of [1 2 1] each way,
 *  reading nothing beyond the rectangle (blur a field of ones the same way to normalise). Exact on
 *  whole numbers. */
function blur(v: Float64Array, bw: number, x0: number, y0: number, x1: number, y1: number, m: number, tmp: Float64Array, line: Float64Array): void {
  for (let pass = 0; pass < m; pass++) {
    for (let y = y0; y <= y1; y++) {
      const row = y * bw;
      for (let x = x0; x <= x1; x++) tmp[x] = v[row + x];
      for (let x = x0; x <= x1; x++) v[row + x] = (x > x0 ? tmp[x - 1] : 0) + 2 * tmp[x] + (x < x1 ? tmp[x + 1] : 0);
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) line[y] = v[y * bw + x];
      for (let y = y0; y <= y1; y++) v[y * bw + x] = (y > y0 ? line[y - 1] : 0) + 2 * line[y] + (y < y1 ? line[y + 1] : 0);
    }
  }
}

/** Each level's edge read softly and moved along its own noise: a tile is in level k's new region
 *  where the softened share of level k round it, pushed by the noise, is over a half (a large region's
 *  edge wanders by up to about twice the softness; a knob or a spur narrower than that wears away,
 *  and nothing small grows). A tile's new height is its old one plus the levels whose new region newly
 *  holds it, less those that no longer do. */
function wander(h0: Uint8Array, I: Float32Array, bw: number, bh: number, box: Rect, size: number, strength: number, cache: WeatherCache, cap: Uint8Array, still: Uint8Array, fresh: Uint8Array | null = null): Uint8Array {
  const n = bw * bh;
  const W = cache.W;
  // (rule 3, `boxed`: a box r each way, three times, reaching 3r)
  const r = cache.boxed ? wanderBox(strength) : 0;
  const m = cache.boxed ? 3 * r : wanderBlur(strength);
  const cell = wanderCell(size, strength);
  const out = u8("wander.out", n);
  out.set(h0);
  // where it acts
  let ax0 = bw;
  let ay0 = bh;
  let ax1 = -1;
  let ay1 = -1;
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++)
      if (I[y * bw + x] > 0) {
        if (x < ax0) ax0 = x;
        if (x > ax1) ax1 = x;
        if (y < ay0) ay0 = y;
        if (y > ay1) ay1 = y;
      }
  if (ax1 < 0) return out;
  // the levels whose edges come near where it acts
  let lo = 255;
  let hi = 0;
  for (let y = Math.max(0, ay0 - m); y <= Math.min(bh - 1, ay1 + m); y++)
    for (let x = Math.max(0, ax0 - m); x <= Math.min(bw - 1, ax1 + m); x++) {
      const v = h0[y * bw + x];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  // each tile's lowest and highest level within the softening's reach (`m` tiles each way, inside the
  // rectangle: the stroke's reach is at least that far from its edge): only a level between them has
  // its edge near enough to move the tile
  const near0 = u8("wander.lo", n);
  const near1 = u8("wander.hi", n);
  reachExtremes(h0, bw, bh, m, near0, near1);
  const shares: Share[] = [];
  for (let lv = lo + 1; lv <= hi; lv++) shares[lv] = cache.share(lv, cache.boxed ? r : m);
  const noiseAt = cache.field(WANDER_SEED, cell);
  for (let y = ay0; y <= ay1; y++)
    for (let x = ax0; x <= ax1; x++) {
      const k = y * bw + x;
      const a = I[k] > 0 && !still[k] && (!fresh || fresh[k]) ? 0.5 + 0.5 * I[k] : 0;
      if (!a || near0[k] === near1[k]) continue;
      const gx = box.x0 + x;
      const gy = box.y0 + y;
      const g = gy * W + gx;
      // one noise for every level: stacked edges wander together, so a cliff stays one (the shed
      // turns it into a stepped slope)
      let nz = noiseAt[g];
      if (nz !== nz) nz = cache.noise(WANDER_SEED, cell, gx, gy);
      nz *= 2.2;
      if (nz > 1) nz = 1;
      else if (nz < -1) nz = -1;
      let d = 0;
      for (let lv = Math.max(near0[k], lo) + 1, top = Math.min(near1[k], hi); lv <= top; lv++) {
        const inside = h0[k] >= lv;
        // a cliff (three levels or more above the tile) only wears back, never spreads out over it
        if (!inside && (lv - h0[k] >= 3 || lv > cap[k])) continue;
        const s = shares[lv].at(g);
        // far from this level's edge nothing can change
        if (inside ? s >= 1 - 1e-9 : s <= 1e-9) continue;
        // faded toward the ring: the edge as it was, blended with the softened, pushed one (`a` from a
        // half: below that the blend would move nothing, so the edge's move follows the intensity)
        const v = (1 - a) * (inside ? 1 : 0) + a * (s + WANDER_PUSH * nz);
        const member = v > 0.5;
        if (member !== inside) d += member ? 1 : -1;
      }
      if (d) out[k] = Math.max(0, h0[k] + d);
    }
  return out;
}

/** Each tile's lowest (`lo`) and highest (`hi`) level among the tiles within `m` of it each way (a
 *  square), within the rectangle: running minima and maxima along rows, then columns, a block of
 *  2m + 1 at a time (each tile read a few times whatever `m`). */
function reachExtremes(h: Uint8Array, bw: number, bh: number, m: number, lo: Uint8Array, hi: Uint8Array): void {
  const w = 2 * m + 1;
  const len = Math.max(bw, bh);
  const line = u8("reach.line", len);
  const fwd = u8("reach.fwd", len);
  const back = u8("reach.back", len);
  const out = u8("reach.out", len);
  /** The running extreme of `line[0..count)` over windows of `w` centred on each item (clipped at the
   *  ends), into `out`: the largest when `max`, else the smallest. */
  const run = (count: number, max: boolean) => {
    for (let i = 0; i < count; i++) {
      const v = line[i];
      fwd[i] = i % w === 0 ? v : max ? Math.max(fwd[i - 1], v) : Math.min(fwd[i - 1], v);
    }
    for (let i = count - 1; i >= 0; i--) {
      const v = line[i];
      back[i] = i === count - 1 || (i + 1) % w === 0 ? v : max ? Math.max(back[i + 1], v) : Math.min(back[i + 1], v);
    }
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - m);
      const b = Math.min(count - 1, i + m);
      // the window [a, b] is the end of one block (back[a]) and the start of the next (fwd[b]), or
      // inside one block
      const x = back[a];
      const y = fwd[b];
      out[i] = max ? Math.max(x, y) : Math.min(x, y);
    }
  };
  for (const [dst, max] of [
    [lo, false],
    [hi, true],
  ] as const) {
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) line[x] = h[y * bw + x];
      run(bw, max);
      for (let x = 0; x < bw; x++) dst[y * bw + x] = out[x];
    }
    for (let x = 0; x < bw; x++) {
      for (let y = 0; y < bh; y++) line[y] = dst[y * bw + x];
      run(bh, max);
      for (let y = 0; y < bh; y++) dst[y * bw + x] = out[y];
    }
  }
}

// ------------------------------------------------------------------------------------------- shed

/** One level of the scree's slope, in the units its distances are measured in (a step between two
 *  tiles costs the sum of their own costs, LEVEL / 2 / tread each; a diagonal step about √2 times
 *  that). */
const LEVEL = 24;
/** How far the scree's edges wander off a straight line, in levels (a tread's width each). */
const WOBBLE = 1;
/** How much farther the ground a cliff sheds runs out in its lobes, in levels (a tread each). */
const LOBE = 2;
const WOBBLE_SEED = 0x776f6262;
const LOBE_SEED = 0x6c6f6265;
const STEP_SEED = 0x73746570;
const RETREAT_SEED = 0x72657472;
const SETTLE_SEED = 0x73657474;
/** The size of the noise's features that set the treads' width and the edges' wandering, in tiles. */
const SHED_CELL = 12;

/** A cliff of three levels or more sheds into the stepped slope scree makes: from the middle of the
 *  cliff its top steps up a level each tread back and its foot down a level each tread out (treads
 *  two tiles or more, as Strength and the map's noise say; in broad patches the steps are two levels
 *  tall, a tread each), the ground above that slope brought down to it and the ground below brought
 *  up to it: its top pulled back, its foot an apron that runs out farther in lobes. It sheds only so
 *  far round the cliff (`screeReach`, more for a taller cliff, unevenly along it). Where its foot may
 *  not rise (water, where a stream runs) the whole cliff pulls back from its foot.
 *
 *  Ground it may not move (outside where it sheds, or held by water) holds the slope round it: the
 *  ground cut beside it stays within two levels of it and comes down from there a level a tread, and
 *  the ground filled beside it rises no more than two above it, so the slope narrows into the cliff
 *  toward the stroke's edge and no new cliff is left. The slope is a distance from the cliffs (the
 *  least, over them, of the middle and a level a tread), so a slope once shed has no cliff left to
 *  shed: painting again leaves it as it is. Changes `h` in place; `hi` is the highest each tile may
 *  stand, `lo` the lowest. */
function shed(h: Uint8Array, I: Float32Array, bw: number, bh: number, box: Rect, strength: number, cache: WeatherCache, lo: Uint8Array, hi: Uint8Array): void {
  const n = bw * bh;
  const on = (k: number) => I[k] >= SHED_FROM;
  // where the slope starts: down from the middle at each cliff's foot (the ceiling over the ground
  // above), up from the middle at its top (the floor under the ground below); as keys, LEVEL a level
  // (a floor's negated, so both spread as least distances)
  const INF = 0x3fffffff;
  const cut = i32("shed.cut", n).fill(INF);
  const fill = i32("shed.fill", n).fill(INF);
  // (a tall cliff sheds farther: its slope needs a tread a step, its steps two levels each)
  const far = i32("shed.far", n).fill(INF);
  const run = 5 * shedTread(strength)[0];
  let any = false;
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      if (!on(k)) continue;
      for (const j of [k + 1, k + bw]) {
        if (!on(j)) continue;
        const D = h[k] - h[j];
        if (D < 3 && D > -3) continue;
        const top = D > 0 ? k : j;
        const foot = top === k ? j : k;
        const F = h[foot];
        const room = -run * Math.ceil((D > 0 ? D : -D) / 2);
        if (room < far[top]) far[top] = room;
        if (room < far[foot]) far[foot] = room;
        if (hi[foot] <= F) {
          // a foot that may not rise: the top pulls back from it
          cut[foot] = Math.min(cut[foot], LEVEL * F);
        } else {
          const mid = F + Math.ceil((D > 0 ? D : -D) / 2);
          cut[foot] = Math.min(cut[foot], LEVEL * (mid - 1));
          fill[top] = Math.min(fill[top], -LEVEL * mid);
        }
        any = true;
      }
    }
  if (!any) return;
  // how far each tile is from a cliff, in fifths of a tile (a straight step 5, a diagonal 7): a cliff
  // sheds only so far round it (farther with Strength, and as the map's noise says, so it retreats
  // unevenly along its length); ground beyond is left as it is, and holds the slope as ground the
  // stroke doesn't reach does
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      far[k] = Math.min(far[k], far[k - 1] + 5, far[k - bw] + 5, far[k - bw - 1] + 7, far[k - bw + 1] + 7);
    }
  for (let y = bh - 2; y >= 1; y--)
    for (let x = bw - 2; x >= 1; x--) {
      const k = y * bw + x;
      far[k] = Math.min(far[k], far[k + 1] + 5, far[k + bw] + 5, far[k + bw + 1] + 7, far[k + bw - 1] + 7);
    }
  const reach = 5 * screeReach(strength);
  // each tile's cost, LEVEL / 2 / its tread (two tiles or more: the narrowest Strength allows, wider
  // where the map's noise says); ground that doesn't shed costs nothing and carries nothing
  const [narrow, more] = shedTread(strength);
  const cost = i32("shed.cost", n).fill(0);
  // (and how far its edges wander off the straight lines a distance draws, as part of a level)
  const wob = i32("shed.wob", n).fill(0);
  // (and where its steps are two levels tall, in broad patches)
  const step = u8("shed.step", n).fill(0);
  // (and where the ground it sheds runs out farther below the foot, in lobes)
  const lobe = i32("shed.lobe", n).fill(0);
  const twoFrom = 0.5 - 0.11 * Math.max(1, Math.min(10, strength));
  // (each the map's own at its tile, worked out once a stroke)
  const at = cache.scree(strength);
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      if (!on(k)) continue;
      const gx = box.x0 + x;
      const gy = box.y0 + y;
      const g = gy * cache.W + gx;
      if (!at.done[g]) {
        at.done[g] = 1;
        at.reach[g] = Math.round(10 * (0.6 + 0.4 * (1 + cache.noise(RETREAT_SEED, SHED_CELL, gx, gy))));
        const nz = cache.noise(SHED_SEED, SHED_CELL, gx, gy);
        const tread = narrow + (more * (Math.max(-1, Math.min(1, 1.5 * nz)) + 1)) / 2;
        at.cost[g] = Math.round(LEVEL / 2 / tread);
        at.lobe[g] = Math.round(LEVEL * LOBE * Math.max(0, cache.noise(LOBE_SEED, SHED_CELL, gx, gy)));
        at.step[g] = cache.noise(STEP_SEED, SHED_CELL, gx, gy) > twoFrom ? 2 : 1;
        at.wob[g] = Math.round(LEVEL * WOBBLE * cache.noise(WOBBLE_SEED, SHED_CELL, gx, gy));
      }
      if (far[k] * 10 > reach * at.reach[g]) continue;
      cost[k] = at.cost[g];
      lobe[k] = at.lobe[g];
      step[k] = at.step[g];
      wob[k] = at.wob[g];
    }
  // a key carried over the ground that sheds, its least over the ways there (a chamfer distance: a
  // straight step costs the two tiles' costs, a diagonal one about √2 times that; from ground that
  // doesn't shed, twice the tile's own), as far as `limit` (beyond it no key matters): each tile
  // taken in order of its key from a queue of buckets, one a key
  let minH = 255;
  let maxH = 0;
  for (let k = 0; k < n; k++) {
    if (h[k] < minH) minH = h[k];
    if (h[k] > maxH) maxH = h[k];
  }
  const link = i32("shed.link", n);
  const around = [-1, 1, -bw, bw, -bw - 1, -bw + 1, bw - 1, bw + 1];
  const diagonal = new Int32Array(LEVEL + 1);
  for (let c = 0; c <= LEVEL; c++) diagonal[c] = Math.round(c * 1.4142);
  const spread = (key: Int32Array, limit: number) => {
    let base = INF;
    for (let k = 0; k < n; k++) if (key[k] < base) base = key[k];
    if (base > limit) return;
    const head = new Int32Array(limit - base + 1).fill(-1);
    for (let k = 0; k < n; k++)
      if (key[k] <= limit) {
        link[k] = head[key[k] - base];
        head[key[k] - base] = k;
      } else key[k] = INF;
    for (let b = 0; b < head.length; b++)
      while (head[b] >= 0) {
        const k = head[b];
        head[b] = link[k];
        const kk = b + base;
        if (key[k] !== kk) continue;
        const ck = cost[k];
        // (every key is on a tile inside the ring, whose ring tiles cost nothing: no step leaves the
        // rectangle or wraps a row)
        for (let e = 0; e < 8; e++) {
          const j = k + around[e];
          const cj = cost[j];
          if (!cj) continue;
          const step = cj + (ck || cj);
          const v = kk + (e < 4 ? step : diagonal[step]);
          if (v >= key[j] || v > limit) continue;
          key[j] = v;
          link[j] = head[v - base];
          head[v - base] = j;
        }
      }
  };
  const level = (key: number) => Math.ceil(key / LEVEL);
  const ceilAt = (k: number) => {
    const v = level(cut[k] + wob[k]);
    return step[k] === 2 ? v + (v & 1) : v;
  };
  const floorAt = (k: number) => {
    const v = -level(fill[k] - wob[k] - lobe[k]);
    return step[k] === 2 ? v - (v & 1) : v;
  };
  const beside = (k: number) => cost[k - 1] || cost[k + 1] || cost[k - bw] || cost[k + bw];
  const inner = (k: number) => {
    const x = k % bw;
    return x > 0 && x < bw - 1 && k >= bw && k < n - bw;
  };
  const v = u8("shed.v", n);
  v.set(h);
  // the cut: ground above the slope comes down to it, but no more than two levels below ground it
  // may not move (and a level less each tread from there)
  spread(cut, LEVEL * maxH);
  const held = i32("shed.held", n).fill(INF);
  for (let k = 0; k < n; k++) {
    if (!inner(k)) continue;
    if (!cost[k]) {
      if (beside(k)) held[k] = -LEVEL * (h[k] - 1);
    } else if (cut[k] < INF && ceilAt(k) < h[k] && lo[k] > ceilAt(k)) held[k] = -LEVEL * (Math.min(h[k], lo[k]) - 1);
  }
  spread(held, -LEVEL * minH);
  const moved = u8("shed.moved", n).fill(0);
  for (let k = 0; k < n; k++) {
    if (!cost[k] || cut[k] >= INF) continue;
    let t = ceilAt(k);
    if (t >= h[k]) continue;
    if (held[k] < INF) t = Math.max(t, -level(held[k]));
    t = Math.min(h[k], Math.max(t, lo[k]));
    if (t < h[k]) (v[k] = t), (moved[k] = 1);
  }
  // the fill: ground below the slope comes up to it, but no more than two levels above ground it
  // may not move, nor above the ground just cut (and a level more each tread from there)
  spread(fill, -LEVEL * minH);
  const capped = i32("shed.capped", n).fill(INF);
  for (let k = 0; k < n; k++) {
    if (!inner(k)) continue;
    if (!cost[k]) {
      if (beside(k)) capped[k] = LEVEL * (h[k] + 1);
    } else if (moved[k]) capped[k] = LEVEL * (v[k] + 1);
    else if (fill[k] < INF && floorAt(k) > h[k] && hi[k] < floorAt(k)) capped[k] = LEVEL * (Math.max(h[k], hi[k]) + 1);
  }
  spread(capped, LEVEL * maxH);
  for (let k = 0; k < n; k++) {
    if (!cost[k] || moved[k] || fill[k] >= INF) continue;
    let t = floorAt(k);
    if (t <= h[k]) continue;
    if (capped[k] < INF) t = Math.min(t, level(capped[k]));
    t = Math.max(h[k], Math.min(t, hi[k]));
    v[k] = t;
  }
  h.set(v);
}


// ------------------------------------------------------------------------------------------ settle

/** Old land has fewer terraces: where the stroke presses, a narrow stretch of a terrace (within
 *  `settleWidth` / 2 of its edge, a tread or a knob or a spur) joins the level it borders most, whole,
 *  where that takes away more of the land's edges than it adds (a stretch that is only the rim of a
 *  wide terrace stays), leaves no step of three levels or more round it, and touches no ground the
 *  stroke doesn't reach. The land keeps its shape in fewer, chunkier terraces. Changes `h` in place,
 *  within `lo` and `hi`. */
function settle(h: Uint8Array, I: Float32Array, bw: number, bh: number, box: Rect, strength: number, cache: WeatherCache, lo: Uint8Array, hi: Uint8Array): void {
  const n = bw * bh;
  // each tile's distance to its terrace's edge, in fifths of a tile (a straight step 5, a diagonal 7)
  const d = i32("settle.d", n);
  for (let k = 0; k < n; k++) {
    const x = k % bw;
    const v = h[k];
    d[k] = (x > 0 && h[k - 1] !== v) || (x < bw - 1 && h[k + 1] !== v) || (k >= bw && h[k - bw] !== v) || (k + bw < n && h[k + bw] !== v) ? 5 : 1 << 20;
  }
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      d[k] = Math.min(d[k], d[k - 1] + 5, d[k - bw] + 5, d[k - bw - 1] + 7, d[k - bw + 1] + 7);
    }
  for (let y = bh - 2; y >= 1; y--)
    for (let x = bw - 2; x >= 1; x--) {
      const k = y * bw + x;
      d[k] = Math.min(d[k], d[k + 1] + 5, d[k + bw] + 5, d[k + bw + 1] + 7, d[k + bw - 1] + 7);
    }
  const narrow = (k: number) => I[k] > 0 && 2 * d[k] <= 5 * settleWidth(strength) * (0.7 + 0.3 * (1 + cache.noise(SETTLE_SEED, SHED_CELL, box.x0 + (k % bw), box.y0 + Math.floor(k / bw))));
  const seen = u8("settle.seen", n).fill(0);
  const stack = i32("settle.stack", n);
  const members = i32("settle.members", n);
  const votes = new Int32Array(256);
  for (let y0 = 1; y0 < bh - 1; y0++)
    for (let x0 = 1; x0 < bw - 1; x0++) {
      const s0 = y0 * bw + x0;
      if (seen[s0] || !narrow(s0)) continue;
      const v = h[s0];
      // the stretch: this level's narrow tiles joined to it
      let top = 0;
      let count = 0;
      let kept = 0;
      let seam = false;
      let lowest = 255;
      let highest = 0;
      votes.fill(0);
      stack[top++] = s0;
      seen[s0] = 1;
      while (top) {
        const k = stack[--top];
        members[count++] = k;
        for (let e = 0; e < 4; e++) {
          const j = e === 0 ? k - 1 : e === 1 ? k + 1 : e === 2 ? k - bw : k + bw;
          const u = h[j];
          const x = j % bw;
          const ring = x === 0 || x === bw - 1 || j < bw || j >= n - bw;
          if (u === v) {
            if (seen[j] === 1) continue;
            if (!ring && narrow(j)) {
              seen[j] = 1;
              stack[top++] = j;
            } else {
              // the rest of its terrace: an edge it would add (and at the stroke's edge, a seam)
              kept++;
              if (ring || !(I[j] > 0)) seam = true;
            }
            continue;
          }
          votes[u]++;
          if (u < lowest) lowest = u;
          if (u > highest) highest = u;
        }
      }
      if (seam) continue;
      // the level it borders most (the nearer to its own on a tie), where every neighbour stays within
      // two levels and the water allows, and it takes away more edges than it adds
      let best = -1;
      for (let u = 0; u < 256; u++) {
        if (!votes[u] || Math.abs(u - v) > 2 || lowest < u - 2 || highest > u + 2) continue;
        if (best < 0 || votes[u] > votes[best] || (votes[u] === votes[best] && Math.abs(u - v) < Math.abs(best - v))) best = u;
      }
      if (best < 0 || votes[best] <= kept) continue;
      let ok = true;
      for (let q = 0; q < count && ok; q++) if (best < lo[members[q]] || best > hi[members[q]]) ok = false;
      if (!ok) continue;
      for (let q = 0; q < count; q++) h[members[q]] = best;
    }
}

/** The mean width under which a terrace joins its neighbour (`settle`), in tiles: wider with
 *  Strength. */
export function settleWidth(strength: number): number {
  return 1.5 + 0.45 * Math.max(1, Math.min(10, strength));
}

// -------------------------------------------------------------------------------------------- tidy

/** No small knobs or pits: a knob or a pit of under four tiles that holds a changed tile meets the
 *  nearest level round it (nothing one tile wide is the guard's: `keepOrder`). */
function tidy(h: Uint8Array, h0: Uint8Array, I: Float32Array, bw: number, bh: number): void {
  const n = bw * bh;
  const seen = i32("tidy.seen", n).fill(-1);
  const members = new Int32Array(8);
  const stack = new Int32Array(8);
  const votes = new Int32Array(256);
  for (let pass = 0; pass < 2; pass++) {
    seen.fill(-1);
    for (let s = 0; s < n; s++) {
      if (h[s] === h0[s] || seen[s] >= 0) continue;
      // the region round it, up to four tiles
      const lv = h[s];
      let count = 0;
      let top = 0;
      stack[top++] = s;
      seen[s] = s;
      let big = false;
      while (top) {
        const k = stack[--top];
        if (count === 4) {
          big = true;
          break;
        }
        members[count++] = k;
        const x = k % bw;
        for (let e = 0; e < 4; e++) {
          const j = e === 0 ? (x > 0 ? k - 1 : -1) : e === 1 ? (x + 1 < bw ? k + 1 : -1) : e === 2 ? k - bw : k + bw;
          if (j < 0 || j >= n || h[j] !== lv || seen[j] === s) continue;
          seen[j] = s;
          if (top < stack.length) stack[top++] = j;
          else big = true;
        }
        if (big) break;
      }
      if (big || count >= 4) continue;
      let ok = true;
      for (let q = 0; q < count; q++) if (!I[members[q]]) ok = false;
      if (!ok) continue;
      votes.fill(0);
      for (let q = 0; q < count; q++) {
        const k = members[q];
        const x = k % bw;
        if (x > 0 && h[k - 1] !== lv) votes[h[k - 1]]++;
        if (x + 1 < bw && h[k + 1] !== lv) votes[h[k + 1]]++;
        if (k >= bw && h[k - bw] !== lv) votes[h[k - bw]]++;
        if (k + bw < n && h[k + bw] !== lv) votes[h[k + bw]]++;
      }
      // only a knob above all round it or a pit below all round it (a short tread on a slope stays):
      // it meets the nearest level round it, the commoner on a tie
      let above = false;
      let below = false;
      for (let l = 0; l < 256; l++) {
        if (!votes[l]) continue;
        if (l > lv) above = true;
        else below = true;
      }
      if (above && below) continue;
      let best = -1;
      let most = 0;
      let near = 256;
      for (let l = 0; l < 256; l++) {
        if (!votes[l]) continue;
        const d = Math.abs(l - lv);
        if (d < near || (d === near && votes[l] > most)) (near = d), (most = votes[l]), (best = l);
      }
      if (best >= 0) for (let q = 0; q < count; q++) h[members[q]] = best;
    }
  }
}

// ------------------------------------------------------------------------------------ the downhill order

/** The level water would stand at on each tile of the ring (clockwise from the top-left corner);
 *  -1 inside it. */
function ringLevels(h0: Uint8Array, bw: number, bh: number, rim: readonly number[] | null): Int16Array {
  const lv = new Int16Array(bw * bh).fill(-1);
  let q = 0;
  const put = (k: number) => {
    const r = rim && q < rim.length ? rim[q] : 0;
    lv[k] = Math.max(h0[k], r | 0);
    q++;
  };
  for (let x = 0; x < bw; x++) put(x);
  for (let y = 1; y < bh; y++) put(y * bw + bw - 1);
  for (let x = bw - 2; x >= 0; x--) put((bh - 1) * bw + x);
  for (let y = bh - 2; y >= 1; y--) put(y * bw);
  return lv;
}

/** The ring's tiles in the order `ringLevels` reads them. */
export function ringTiles(box: Rect, W: number): number[] {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const out: number[] = [];
  const at = (x: number, y: number) => out.push((box.y0 + y) * W + box.x0 + x);
  for (let x = 0; x < bw; x++) at(x, 0);
  for (let y = 1; y < bh; y++) at(bw - 1, y);
  for (let x = bw - 2; x >= 0; x--) at(x, bh - 1);
  for (let y = bh - 2; y >= 1; y--) at(0, y);
  return out;
}

/** Rule 3: the level water would stand at on every tile of `box` (the stroke's working rectangle) when
 *  the stroke began, from the heights and its `rim` (pairs [tile along the ring, depth]), as the map's
 *  drainage has it; a map-sized array (the heights elsewhere). */
export function boxWaterLevels(heights: Uint8Array, box: Rect, rim: readonly number[], W: number, H: number): Uint8Array {
  const out = heights.slice();
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const h0 = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) h0[y * bw + x] = heights[(box.y0 + y) * W + box.x0 + x];
  const levels = ringTiles(box, W).map((g) => heights[g]);
  for (let k = 0; k + 1 < rim.length; k += 2) if (rim[k] >= 0 && rim[k] < levels.length) levels[rim[k]] += rim[k + 1];
  const w = new Int16Array(bw * bh);
  flood(h0, ringLevels(h0, bw, bh, levels), bw, bh, w);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) out[(box.y0 + y) * W + box.x0 + x] = Math.max(0, Math.min(255, w[y * bw + x]));
  void H;
  return out;
}

/** The level water would stand at on every tile of the map, as the terrain's drainage has it (water
 *  leaves at the map's edge and moves side to side, as the game's does; the filled surface of
 *  `land/drainage.ts` with 4-neighbour flow, on whole levels). */
export function waterLevels(h: Uint8Array, W: number, H: number): Uint8Array {
  const ring = new Int16Array(W * H).fill(-1);
  for (let x = 0; x < W; x++) {
    ring[x] = h[x];
    ring[(H - 1) * W + x] = h[(H - 1) * W + x];
  }
  for (let y = 0; y < H; y++) {
    ring[y * W] = h[y * W];
    ring[y * W + W - 1] = h[y * W + W - 1];
  }
  const out = new Int16Array(W * H);
  flood(h, ring, W, H, out);
  return Uint8Array.from(out);
}

/** The level water stands at on every tile: the ring's tiles (`ring` ≥ 0) drain at their levels, and
 *  a priority flood (a bucket per level) with 4-neighbour flow carries it in. */
function flood(h: Uint8Array, ring: Int16Array, bw: number, bh: number, out: Int16Array, area?: Float64Array): void {
  const n = bw * bh;
  out.fill(-1);
  const head = i32("flood.head", 257).fill(-1);
  const next = i32("flood.next", n);
  let maxLv = 0;
  for (let k = 0; k < n; k++)
    if (ring[k] >= 0) {
      const lv = ring[k];
      out[k] = lv;
      next[k] = head[lv];
      head[lv] = k;
      if (lv > maxLv) maxLv = lv;
    }
  // (with `area`: the tiles that drain through each, itself included, along the way the flood came)
  const order = area ? new Int32Array(n) : null;
  const from = area ? new Int32Array(n).fill(-1) : null;
  let count = 0;
  for (let lv = 0; lv <= Math.min(256, maxLv); lv++) {
    while (head[lv] >= 0) {
      const k = head[lv];
      head[lv] = next[k];
      if (order) order[count++] = k;
      const x = k % bw;
      for (let e = 0; e < 4; e++) {
        const j = e === 0 ? (x > 0 ? k - 1 : -1) : e === 1 ? (x + 1 < bw ? k + 1 : -1) : e === 2 ? k - bw : k + bw;
        if (j < 0 || j >= n || out[j] >= 0) continue;
        const w = h[j] > lv ? h[j] : lv;
        out[j] = w;
        next[j] = head[w];
        head[w] = j;
        if (from) from[j] = k;
        if (w > maxLv) maxLv = w;
      }
    }
  }
  if (area && order && from) {
    area.fill(1);
    for (let q = count - 1; q >= 0; q--) {
      const k = order[q];
      if (from[k] >= 0) area[from[k]] += area[k];
    }
  }
}

/** How many rounds of repair a pass of `keepOrder` makes at most. */
const ROUNDS = 128;

/** Take back, toward the land as it was, whatever breaks the downhill order (see the head). */
function keepOrder(h: Uint8Array, h0: Uint8Array, I: Float32Array, bw: number, bh: number, ring: Int16Array, w0: Int16Array, lo: Uint8Array, hi: Uint8Array, prepared: Prepared, ref: Uint8Array = h0): void {
  const n = bw * bh;
  const passages = () => (prepared.passages ??= passagesBefore(h0, ring, bw, bh));
  const w1 = i16("keep.w1", n);
  const nbs = new Int32Array(4);
  const far: number[] = [];
  const pool = i32("keep.pool", n).fill(-1);
  const around = (k: number): number => {
    const x = k % bw;
    let c = 0;
    if (x > 0) nbs[c++] = k - 1;
    if (x + 1 < bw) nbs[c++] = k + 1;
    if (k >= bw) nbs[c++] = k - bw;
    if (k + bw < n) nbs[c++] = k + bw;
    return c;
  };
  // only tiles it changed, and those beside them, can break anything
  const inNear = u8("keep.near", n).fill(0);
  const near: number[] = [];
  const grow = (k: number) => {
    if (!inNear[k]) (inNear[k] = 1), near.push(k);
    const x = k % bw;
    if (x > 0 && !inNear[k - 1]) (inNear[k - 1] = 1), near.push(k - 1);
    if (x + 1 < bw && !inNear[k + 1]) (inNear[k + 1] = 1), near.push(k + 1);
    if (k >= bw && !inNear[k - bw]) (inNear[k - bw] = 1), near.push(k - bw);
    if (k + bw < n && !inNear[k + bw]) (inNear[k + bw] = 1), near.push(k + bw);
  };
  for (let k = 0; k < n; k++) if (h[k] !== h0[k]) grow(k);
  if (!near.length) return;
  // the tiles to look at in the next round: each one a change touched, and those beside it (in map
  // order, so a fix can carry on along a row within the round)
  const queued = u8("keep.queued", n).fill(0);
  let next: number[] = [];
  const touch = (k: number) => {
    grow(k);
    const x = k % bw;
    if (!queued[k]) (queued[k] = 1), next.push(k);
    if (x > 0 && !queued[k - 1]) (queued[k - 1] = 1), next.push(k - 1);
    if (x + 1 < bw && !queued[k + 1]) (queued[k + 1] = 1), next.push(k + 1);
    if (k >= bw && !queued[k - bw]) (queued[k - bw] = 1), next.push(k - bw);
    if (k + bw < n && !queued[k + bw]) (queued[k + bw] = 1), next.push(k + bw);
  };
  // (whether a tile rose above how it was since the passages were last found open: only that can
  // close one)
  let rose = true;
  const set = (k: number, t: number) => {
    if (t > h[k] && t > h0[k]) rose = true;
    h[k] = t;
    touch(k);
  };
  const take = (): number[] => {
    const out = next.sort((p, q) => p - q);
    for (const k of out) queued[k] = 0;
    next = [];
    return out;
  };
  /** Whether a tile is one tile wide along the axis `st` now, and wasn't along either before (a tile
   *  of a one-tile staircase the land already had may stay one): a tile it changed with no neighbour
   *  across it at its own level (a tread, a ledge, a wall, a slot), or one it left as it was standing
   *  above both neighbours across it or below both (a sliver its neighbours made). */
  // (as the stroke began: `ref`)
  const wasNarrow = (k: number) => (ref[k] !== ref[k - 1] && ref[k] !== ref[k + 1]) || (ref[k] !== ref[k - bw] && ref[k] !== ref[k + bw]);
  const narrowNew = (k: number, st: number) => {
    const v = h[k];
    const l = h[k - st];
    const r = h[k + st];
    if (v === l || v === r || wasNarrow(k)) return false;
    return v !== ref[k] || (v > l && v > r) || (v < l && v < r);
  };
  const inside = (k: number) => {
    const x = k % bw;
    return x > 0 && x < bw - 1 && k >= bw && k < n - bw;
  };
  /** Whether tile `j` may stand at `t`: within its limits, and keeping the order with all its
   *  neighbours. */
  const fits = (j: number, t: number) => {
    if (t < lo[j] || t > hi[j]) return false;
    const c = around(j);
    for (let q = 0; q < c; q++) {
      const i = nbs[q];
      if ((ref[j] > ref[i] && t < h[i]) || (ref[j] < ref[i] && t > h[i])) return false;
    }
    return true;
  };
  // (a tile is fixed for being one tile wide at most three times a pass: two tiles never trade back
  // and forth for ever)
  const tries = u8("keep.tries", n);
  // repair, then take back what is still broken (the broken tiles themselves, or a broken tile's
  // changed neighbours) and repair again; a tile taken back is never changed again, so it ends
  const kept = u8("keep.kept", n).fill(0);
  const moved: number[] = [];
  let gen = near.slice().sort((p, q) => p - q);
  for (let outer = 0; outer < 64; outer++) {
    tries.fill(0);
    let clean = false;
    for (let round = 0; round < ROUNDS; round++) {
      // no neighbouring pair swaps which is higher
      for (const k of gen) {
        const x = k % bw;
        for (let e = 0; e < 2; e++) {
          const j = e === 0 ? (x + 1 < bw ? k + 1 : -1) : k + bw < n ? k + bw : -1;
          if (j < 0 || ref[k] === ref[j]) continue;
          const a = ref[k] > ref[j] ? k : j;
          const b = a === k ? j : k;
          if (h[a] >= h[b]) continue;
          if (h[b] > h0[b]) set(b, Math.max(h0[b], h[a]));
          else set(a, Math.min(h0[a], h[b]));
        }
      }
      // no changed tile above or below all its neighbours, and no tile it left made one by those round it
      for (const k of gen) {
        const c = around(k);
        let lo1 = 255;
        let hi1 = -1;
        for (let q = 0; q < c; q++) {
          const v = h[nbs[q]];
          if (v < lo1) lo1 = v;
          if (v > hi1) hi1 = v;
        }
        if (h[k] <= hi1 && h[k] >= lo1) continue;
        if (h[k] === h0[k]) {
          let lo0 = 255;
          let hi0 = -1;
          for (let q = 0; q < c; q++) {
            const v = h0[nbs[q]];
            if (v < lo0) lo0 = v;
            if (v > hi0) hi0 = v;
          }
          if (h0[k] > hi0 || h0[k] < lo0) continue;
          // a spike made by lowering round it: those back as they were; a pit made by raising: as well
          for (let q = 0; q < c; q++) {
            const j = nbs[q];
            if ((h[k] > hi1 && h[j] < h0[j]) || (h[k] < lo1 && h[j] > h0[j])) set(j, h0[j]);
          }
          continue;
        }
        // a changed tile meets the nearest of them when that is back toward how it was, else goes back
        const t = h[k] > hi1 ? hi1 : lo1;
        const toward = t < h[k] ? h[k] > h0[k] && t >= h0[k] : h[k] < h0[k] && t <= h0[k];
        set(k, toward ? t : h0[k]);
      }
      // no tread, ledge, wall or slot one tile wide that wasn't there: along each axis a tile keeps a
      // neighbour at its own level. The tile takes the level of one of them, or one of them takes its
      // level (widening it), whichever keeps the order with all their neighbours and leaves the tile
      // moved one tile wide along neither axis; failing that, the tile takes one that keeps the order;
      // failing that (or after three tries), it goes back as it was, or (left as it was) its neighbours
      // across it do
      for (const k of gen) {
        if (!inside(k)) continue;
        for (let e = 0; e < 2; e++) {
          const st = e === 0 ? 1 : bw;
          if (!narrowNew(k, st)) continue;
          const v = h[k];
          const l = h[k - st];
          const r = h[k + st];
          const vl = Math.abs(l - v);
          const vr = Math.abs(r - v);
          const first = vl < vr ? l : vr < vl ? r : Math.abs(l - h0[k]) <= Math.abs(r - h0[k]) ? l : r;
          const second = first === l ? r : l;
          let done = false;
          for (let pass = 0; pass < 2 && !done && tries[k] < 3; pass++)
            for (let o = 0; o < (pass === 0 ? 4 : 2); o++) {
              const j = o < 2 ? k : o === 2 ? k - st : k + st;
              const t = o === 0 ? first : o === 1 ? second : v;
              if (!I[j] || kept[j] || !inside(j) || h[j] === t || !fits(j, t)) continue;
              if (pass === 0) {
                const was = h[j];
                h[j] = t;
                const clean = !narrowNew(j, 1) && !narrowNew(j, bw);
                h[j] = was;
                if (!clean) continue;
              }
              set(j, t);
              tries[k]++;
              done = true;
              break;
            }
          if (!done) {
            if (h[k] !== h0[k]) {
              set(k, h0[k]);
              kept[k] = 1;
            } else
              for (let o = 0; o < 2; o++) {
                const j = o === 0 ? k - st : k + st;
                if (h[j] !== h0[j]) {
                  set(j, h0[j]);
                  kept[j] = 1;
                }
              }
          }
          break;
        }
      }
      gen = take();
      if (gen.length) continue;
      // nothing newly holds water: deeper water on no tile
      flood(h, ring, bw, bh, w1);
      far.length = 0;
      for (let k = 0; k < n; k++) {
        if (w1[k] - h[k] <= w0[k] - h0[k]) continue;
        if (h[k] < h0[k]) {
          set(k, h0[k]);
          continue;
        }
        // held in by raised ground round it: that ground back as it was
        let any = false;
        const c = around(k);
        for (let q = 0; q < c; q++) {
          const j = nbs[q];
          if (h[j] > h0[j] && h[j] >= w1[k]) (set(j, h0[j]), (any = true));
        }
        // else the way out is farther off
        if (!any) far.push(k);
      }
      if (far.length) {
        moved.length = 0;
        lowerRims(far, h, h0, w1, bw, pool, undefined, moved);
        for (const k of moved) touch(k);
      }
      gen = take();
      if (gen.length) continue;
      // no way water could leave closes
      if (rose) {
        moved.length = 0;
        rose = keepPassages(h, h0, ring, bw, bh, passages(), undefined, moved);
        for (const k of moved) touch(k);
      }
      gen = take();
      if (!gen.length) {
        clean = true;
        break;
      }
    }
    // what is still broken
    const bad: number[] = [];
    for (const k of near) {
      const x = k % bw;
      for (let e = 0; e < 2; e++) {
        const j = e === 0 ? (x + 1 < bw ? k + 1 : -1) : k + bw < n ? k + bw : -1;
        if (j >= 0 && ((ref[k] > ref[j] && h[k] < h[j]) || (ref[j] > ref[k] && h[j] < h[k]))) bad.push(k, j);
      }
      const c = around(k);
      let lo1 = 255;
      let hi1 = -1;
      let lo0 = 255;
      let hi0 = -1;
      for (let q = 0; q < c; q++) {
        lo1 = Math.min(lo1, h[nbs[q]]);
        hi1 = Math.max(hi1, h[nbs[q]]);
        lo0 = Math.min(lo0, h0[nbs[q]]);
        hi0 = Math.max(hi0, h0[nbs[q]]);
      }
      if ((h[k] > hi1 || h[k] < lo1) && (h[k] !== h0[k] || !(h0[k] > hi0 || h0[k] < lo0))) bad.push(k);
      if (inside(k) && (narrowNew(k, 1) || narrowNew(k, bw))) bad.push(k);
    }
    // (each pool that is deeper, and the ground round it, and each passage that closed: known to be
    // none when the repair ended clean)
    if (!clean) {
      flood(h, ring, bw, bh, w1);
      far.length = 0;
      for (let k = 0; k < n; k++) if (w1[k] - h[k] > w0[k] - h0[k]) far.push(k);
      if (far.length) lowerRims(far, h, h0, w1, bw, pool, bad);
      keepPassages(h, h0, ring, bw, bh, passages(), bad);
    }
    if (!bad.length) return;
    let any = false;
    for (const s of bad) {
      if (h[s] !== h0[s]) {
        set(s, h0[s]);
        kept[s] = 1;
        any = true;
        continue;
      }
      const c = around(s);
      for (let q = 0; q < c; q++) {
        const j = nbs[q];
        if (h[j] !== h0[j]) (set(j, h0[j]), (kept[j] = 1), (any = true));
      }
    }
    if (!any) break;
    gen = take();
  }
  // (a last safeguard: never reached in practice) everything back as it was
  h.set(h0);
}

/** The pools round tiles `seeds` (the tiles water stands on, joined to them): each one's raised rim
 *  back as it was, or, with none, every changed tile in it and round it (or, with `collect`, the
 *  pool's tiles and its rim named there); each tile it moves is named in `moved`. `pool` is a work
 *  buffer (-1 throughout on entry and on return). */
function lowerRims(seeds: readonly number[], h: Uint8Array, h0: Uint8Array, w1: Int16Array, bw: number, pool: Int32Array, collect?: number[], moved?: number[]): void {
  const n = pool.length;
  const touched: number[] = [];
  for (const s of seeds) {
    if (pool[s] >= 0) continue;
    const stack = [s];
    pool[s] = s;
    touched.push(s);
    const tiles: number[] = [];
    const rim: number[] = [];
    while (stack.length) {
      const k = stack.pop()!;
      tiles.push(k);
      const x = k % bw;
      for (let e = 0; e < 4; e++) {
        const j = e === 0 ? (x > 0 ? k - 1 : -1) : e === 1 ? (x + 1 < bw ? k + 1 : -1) : e === 2 ? k - bw : k + bw;
        if (j < 0 || j >= n || pool[j] === s) continue;
        pool[j] = s;
        touched.push(j);
        if (w1[j] > h[j]) stack.push(j);
        else rim.push(j);
      }
    }
    if (collect) {
      collect.push(...tiles, ...rim);
      continue;
    }
    let lowered = 0;
    for (const j of rim) if (h[j] > h0[j]) (h[j] = h0[j]), lowered++, moved?.push(j);
    if (!lowered)
      for (const k of tiles.concat(rim))
        if (h[k] !== h0[k]) {
          h[k] = h0[k];
          moved?.push(k);
        }
  }
  for (const k of touched) pool[k] = -1;
}

/** No way water could leave the area through it closes: any two ring tiles joined by ground at or
 *  below a level before are still joined at that level. Lowers to that level the raised tiles in a passage
 *  that closed, naming them in `lowered` (or, with `collect`, only names them there); returns whether
 *  it found one. */
/** The ways water could leave the rectangle before the stroke (for `keepPassages`): for each level,
 *  each ring tile's first ring tile (in ring order) joined to it by ground at or below that level, or
 *  -1 where the tile itself stands above it. */
interface Passages {
  ring: Int32Array;
  levels: number;
  first: Int32Array;
}

function passagesBefore(h0: Uint8Array, ring: Int16Array, bw: number, bh: number): Passages {
  const n = bw * bh;
  const list: number[] = [];
  for (let k = 0; k < n; k++) if (ring[k] >= 0) list.push(k);
  const R = list.length;
  let hiLv = 0;
  for (let k = 0; k < n; k++) hiLv = Math.max(hiLv, h0[k]);
  const levels = hiLv + 1;
  const first = new Int32Array(levels * R).fill(-1);
  const order = byLevel(h0, n);
  const p = new Int32Array(n).fill(-1);
  // (each set's first ring tile at this level, and the level it was found at)
  const firstOf = new Int32Array(n);
  const seenAt = new Int32Array(n).fill(-1);
  for (let lv = 0; lv < levels; lv++) {
    for (let q = order.start[lv]; q < order.start[lv + 1]; q++) unite(p, order.tiles[q], bw, n);
    for (let q = 0; q < R; q++) {
      const r = list[q];
      if (h0[r] > lv) continue;
      const key = find(p, r);
      if (seenAt[key] !== lv) {
        seenAt[key] = lv;
        firstOf[key] = q;
      }
      first[lv * R + q] = firstOf[key];
    }
  }
  return { ring: Int32Array.from(list), levels, first };
}

/** The tiles in order of their level (a counting sort): `tiles`, each level's from `start[lv]`. */
function byLevel(h: Uint8Array, n: number): { tiles: Int32Array; start: Int32Array } {
  const start = new Int32Array(258);
  for (let k = 0; k < n; k++) start[h[k] + 1]++;
  for (let l = 1; l < 258; l++) start[l] += start[l - 1];
  const at = start.slice();
  const tiles = new Int32Array(n);
  for (let k = 0; k < n; k++) tiles[at[h[k]]++] = k;
  return { tiles, start };
}

/** The root of tile `k`'s set in `p` (a union-find; -1: not yet in any). */
function find(p: Int32Array, k: number): number {
  let r = k;
  while (p[r] !== r) r = p[r];
  while (p[k] !== r) {
    const nx = p[k];
    p[k] = r;
    k = nx;
  }
  return r;
}

/** Tile `k` joins the sets of its neighbours already in `p`. */
function unite(p: Int32Array, k: number, bw: number, n: number): void {
  p[k] = k;
  const x = k % bw;
  for (let e = 0; e < 4; e++) {
    const j = e === 0 ? (x > 0 ? k - 1 : -1) : e === 1 ? (x + 1 < bw ? k + 1 : -1) : e === 2 ? k - bw : k + bw;
    if (j < 0 || j >= n || p[j] < 0) continue;
    const a = find(p, k);
    const b = find(p, j);
    if (a !== b) {
      if (a < b) p[b] = a;
      else p[a] = b;
    }
  }
}

/** No way water could leave the area through it closes: any two ring tiles joined by ground at or
 *  below a level before (`before`) are still joined at that level. Lowers to that level the raised
 *  tiles in a passage that closed, naming them in `lowered` (or, with `collect`, only names them
 *  there); returns whether it found one. */
function keepPassages(h: Uint8Array, h0: Uint8Array, ring: Int16Array, bw: number, bh: number, before: Passages, collect?: number[], lowered?: number[]): boolean {
  const n = bw * bh;
  const order = byLevel(h, n);
  const p1 = i32("pass.p1", n).fill(-1);
  const list = before.ring;
  const R = list.length;
  let hiLv = before.levels - 1;
  for (let k = 0; k < n; k++) if (h[k] > hiLv) hiLv = h[k];
  for (let lv = 0; lv <= hiLv; lv++) {
    for (let q = order.start[lv]; q < order.start[lv + 1]; q++) unite(p1, order.tiles[q], bw, n);
    // (above every level before, the ground before is all joined as at its top)
    const row = Math.min(lv, before.levels - 1) * R;
    let bad = -1;
    for (let q = 0; q < R; q++) {
      const f = before.first[row + q];
      if (f < 0 || f === q) continue;
      if (find(p1, list[q]) !== find(p1, list[f])) {
        bad = f;
        break;
      }
    }
    if (bad < 0) continue;
    // the ground joined to that ring tile at this level before
    const p0 = i32("pass.p0", n).fill(-1);
    const was = byLevel(h0, n);
    for (let q = was.start[0]; q < was.start[lv + 1]; q++) unite(p0, was.tiles[q], bw, n);
    const key = find(p0, list[bad]);
    // the raised tiles in that passage, down to this level (or, collecting, named)
    for (let k = 0; k < n; k++)
      if (h[k] > lv && h0[k] <= lv && find(p0, k) === key) {
        if (collect) collect.push(k);
        else (h[k] = lv), lowered?.push(k);
      }
    return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------ the cache

/** Blocks of tiles the softened shares are worked out in (a block at a time, as a stroke reaches it). */
const BLOCK = 32;

/** What a weathering works out from the land before the stroke and the map's own noise alone, kept
 *  between the dabs of one stroke (the page works the stroke out again after every dab): each level's
 *  softened share, a block of tiles at a time, and each noise, tile by tile. Every value is the same
 *  however much it has kept, so a stroke painted dab by dab and its replay give the same land. */
export class WeatherCache {
  private readonly shares = new Map<number, Share>();
  private readonly noises = new Map<number, Float64Array>();
  /** The last rectangle's `prepare`. */
  prepared: Prepared | null = null;

  /** The land changed (rule 3: a dab's weathering), as triples (tile, level before, level after):
   *  the shares of the levels it crossed are worked out again round it. */
  changed(changes: readonly number[]): void {
    for (const s of this.shares.values()) s.forget(changes);
  }
  private screeAt: { strength: number; done: Uint8Array; cost: Int8Array; lobe: Int8Array; step: Int8Array; wob: Int8Array; reach: Int8Array } | null = null;

  /** The scree's own on each tile of the map for a Strength (`shed`): what each tile costs, how far
   *  the ground shed runs out past it, how tall its steps are, how far its edges wander; filled in by
   *  the shed as it reaches tiles (`done`). */
  scree(strength: number): { done: Uint8Array; cost: Int8Array; lobe: Int8Array; step: Int8Array; wob: Int8Array; reach: Int8Array } {
    const n = this.W * this.H;
    if (this.screeAt?.strength !== strength) this.screeAt = { strength, done: new Uint8Array(n), cost: new Int8Array(n), lobe: new Int8Array(n), step: new Int8Array(n), wob: new Int8Array(n), reach: new Int8Array(n) };
    return this.screeAt;
  }
  private lastSeed = -1;
  private lastCell = -1;
  private lastField: Float64Array | null = null;

  /** `boxed` (rule 3): the softening is three passes of a box `r` tiles each way (reaching 3r), cheap
   *  enough to work out again round every dab's change, in place of the binomial blur. */
  constructor(
    readonly before: Uint8Array,
    readonly W: number,
    readonly H: number,
    readonly boxed = false,
  ) {}

  /** The map's noise `seed` at features `cell` across, on tile (x, y). */
  noise(seed: number, cell: number, x: number, y: number): number {
    const a = this.field(seed, cell);
    const i = y * this.W + x;
    let v = a[i];
    if (v !== v) v = a[i] = noise(seed, x, y, cell);
    return v;
  }

  /** The map's noise `seed` at features `cell` across, worked out where asked (NaN elsewhere: read
   *  it through `noise`). */
  field(seed: number, cell: number): Float64Array {
    if (seed === this.lastSeed && cell === this.lastCell && this.lastField) return this.lastField;
    const key = seed * 64 + cell;
    let a = this.noises.get(key);
    if (!a) this.noises.set(key, (a = new Float64Array(this.W * this.H).fill(NaN)));
    this.lastSeed = seed;
    this.lastCell = cell;
    this.lastField = a;
    return a;
  }

  /** Level `lv`'s share softened by `m` passes of [1 2 1] each way, as a fraction, on any map tile (a
   *  tile farther than `m` from the level's edges is wholly in or out). */
  share(lv: number, m: number): Share {
    const key = lv * 64 + m;
    let s = this.shares.get(key);
    if (!s) this.shares.set(key, (s = new Share(this.before, this.W, this.H, lv, m, this.boxed)));
    return s;
  }
}

/** One level's softened share, worked out a block at a time. */
class Share {
  private readonly bx: number;
  /** Its blocks' width in tiles (rule 3's, smaller: worked out again round each dab's change). */
  private readonly block: number;
  private readonly blocks: (Float64Array | 0 | 1 | undefined)[];

  /** How far its kernel reaches, in tiles. */
  private readonly reach: number;

  constructor(
    private readonly before: Uint8Array,
    private readonly W: number,
    private readonly H: number,
    private readonly lv: number,
    private readonly m: number,
    private readonly boxed = false,
  ) {
    this.block = boxed ? 16 : BLOCK;
    this.bx = Math.ceil(W / this.block);
    this.blocks = new Array(this.bx * Math.ceil(H / this.block));
    this.reach = boxed ? 3 * m : m;
  }

  /** The land changed (triples: tile, level before, level after): where a change crossed this level,
   *  the blocks whose kernels reach it are worked out again. */
  forget(changes: readonly number[]): void {
    const m = this.reach;
    const lv = this.lv;
    const byMax = Math.ceil(this.H / this.block) - 1;
    for (let q = 0; q + 2 < changes.length; q += 3) {
      const a = changes[q + 1];
      const b = changes[q + 2];
      if ((a >= lv) === (b >= lv)) continue;
      const g = changes[q];
      const x = g % this.W;
      const y = (g - x) / this.W;
      const bx0 = Math.max(0, Math.floor((x - m) / this.block));
      const by0 = Math.max(0, Math.floor((y - m) / this.block));
      const bx1 = Math.min(this.bx - 1, Math.floor((x + m) / this.block));
      const by1 = Math.min(byMax, Math.floor((y + m) / this.block));
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) this.blocks[by * this.bx + bx] = undefined;
    }
  }

  at(i: number): number {
    const W = this.W;
    const x = i % W;
    const y = (i - x) / W;
    const b = Math.floor(y / this.block) * this.bx + Math.floor(x / this.block);
    let d = this.blocks[b];
    if (d === undefined) d = this.blocks[b] = this.make(b);
    if (d === 0 || d === 1) return d;
    const x0 = (b % this.bx) * this.block;
    const y0 = Math.floor(b / this.bx) * this.block;
    return d[(y - y0) * this.block + x - x0];
  }

  /** A block's shares: 0 or 1 when the level has no edge within m of it, else each tile's. */
  private make(b: number): Float64Array | 0 | 1 {
    const { before, W, H, lv } = this;
    const m = this.reach;
    const x0 = (b % this.bx) * this.block;
    const y0 = Math.floor(b / this.bx) * this.block;
    const x1 = Math.min(W - 1, x0 + this.block - 1);
    const y1 = Math.min(H - 1, y0 + this.block - 1);
    // the ground the block's kernels reach (cut only by the map's edge)
    const rx0 = Math.max(0, x0 - m);
    const ry0 = Math.max(0, y0 - m);
    const rx1 = Math.min(W - 1, x1 + m);
    const ry1 = Math.min(H - 1, y1 + m);
    const first = before[ry0 * W + rx0] >= lv;
    let edge = false;
    for (let y = ry0; y <= ry1 && !edge; y++) for (let x = rx0; x <= rx1; x++) if (before[y * W + x] >= lv !== first) (edge = true), (x = rx1);
    if (!edge) return first ? 1 : 0;
    const rw = rx1 - rx0 + 1;
    const rh = ry1 - ry0 + 1;
    const data = new Float64Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) data[y * rw + x] = before[(ry0 + y) * W + rx0 + x] >= lv ? 1 : 0;
    const boxed = this.boxed;
    if (boxed) boxBlur(data, rw, rh, this.m, new Float64Array(Math.max(rw, rh) + 1));
    else blur(data, rw, 0, 0, rw - 1, rh - 1, m, new Float64Array(Math.max(rw, rh)), new Float64Array(rh));
    const wx = boxed ? boxWeights(x0, x1, W, this.m) : kernelWeights(x0, x1, W, m);
    const wy = boxed ? boxWeights(y0, y1, H, this.m) : kernelWeights(y0, y1, H, m);
    const out = new Float64Array(this.block * this.block);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[(y - y0) * this.block + x - x0] = data[(y - ry0) * rw + x - rx0] / (wx[x - x0] * wy[y - y0]);
    return out;
  }
}

/** Three passes of a box `r` tiles each way over `data` (rw × rh), each way, reading nothing beyond it
 *  (blur a field of ones the same way to normalise): running sums, exact on whole numbers. */
function boxBlur(data: Float64Array, rw: number, rh: number, r: number, line: Float64Array): void {
  for (let p = 0; p < 3; p++) {
    // each row: prefix sums, then each item's window [i - r, i + r] clipped to the row
    for (let y = 0; y < rh; y++) {
      const row = y * rw;
      line[0] = 0;
      for (let i = 0; i < rw; i++) line[i + 1] = line[i] + data[row + i];
      for (let i = 0; i < rw; i++) data[row + i] = line[i + r + 1 < rw ? i + r + 1 : rw] - line[i - r > 0 ? i - r : 0];
    }
    // each column the same
    for (let x = 0; x < rw; x++) {
      line[0] = 0;
      for (let i = 0; i < rh; i++) line[i + 1] = line[i] + data[i * rw + x];
      for (let i = 0; i < rh; i++) data[i * rw + x] = line[i + r + 1 < rh ? i + r + 1 : rh] - line[i - r > 0 ? i - r : 0];
    }
  }
}

/** Each position's weight under three passes of a box `r` each way, on a line of `len` tiles, for the
 *  positions a0..a1. */
function boxWeights(a0: number, a1: number, len: number, r: number): Float64Array {
  const lo = Math.max(0, a0 - 3 * r);
  const hi = Math.min(len - 1, a1 + 3 * r);
  const n = hi - lo + 1;
  const v = new Float64Array(n).fill(1);
  const line = new Float64Array(n + 1);
  boxBlur(v, n, 1, r, line);
  return v.slice(a0 - lo, a1 - lo + 1);
}

/** Each position's binomial kernel weight (m passes of [1 2 1]) on a line of `len` tiles, for the
 *  positions a0..a1 (exact: whole numbers). */
function kernelWeights(a0: number, a1: number, len: number, m: number): Float64Array {
  const lo = Math.max(0, a0 - m);
  const hi = Math.min(len - 1, a1 + m);
  const n = hi - lo + 1;
  let v = new Float64Array(n).fill(1);
  let t = new Float64Array(n);
  for (let p = 0; p < m; p++) {
    for (let k = 0; k < n; k++) t[k] = (k > 0 ? v[k - 1] : 0) + 2 * v[k] + (k < n - 1 ? v[k + 1] : 0);
    [v, t] = [t, v];
  }
  return v.slice(a0 - lo, a1 - lo + 1);
}
