// Naturalize's weathering (PLAN §20 D387 (4), D368 (8), D399): what a Naturalize stroke does to the land
// it presses on, as nature would. The stroke gathers pressure (brush.ts); this turns the land before the
// stroke and that pressure into the land after it, all at once, so the same dabs give the same land
// however they were handed in.
//
// - Edges wander: every level's edge, read softly (a binomial blur), moves in or out along one smooth
//   noise, a line that curves in and out by a few tiles and never frays; stacked edges move together,
//   so a cliff stays a cliff, and a cliff of three levels or more only wears back. The curves' size follows Size, how far they move follows Strength. The
//   noise is fixed to the map's tiles (never the stroke's seed), and the soft reading pulls a wandered
//   edge back toward its smooth course, so painting the same spot again changes less and less:
//   repeating settles. Knobs and spurs narrower than the softness wear away; nothing small grows.
// - Cliffs retreat: the face of a cliff of three levels or more wears back, its top pulled back and the
//   ground it sheds settled at its foot, where it spreads down to its angle of rest (a talus relaxation
//   on the heights as a continuous field, cut and fill balanced, its angle varying a little from place
//   to place), then snapped back to whole levels: a stepped slope with an irregular apron.
// - Flat tops stay flat: nothing moves farther from an edge than the edge itself does.
// - No one-tile features: a knob or pit under four tiles, or a wall or slot one tile thick, that the
//   weathering leaves meets the ground round it.
// - No seam: the effect fades out across the ring's outer part (`intensity`).
// - The downhill order is kept, checked rather than hoped for: no tile it changes ends higher than all
//   four neighbours or lower than all four, no neighbouring pair swaps which is higher, nothing newly holds
//   water (the drainage of the stroke's area, with the water level round it), and no way water could
//   leave the area closes. Where a change would break one of these it is taken back toward the land as
//   it was, a level at a time, until none is broken.
// - It reads and writes only inside its rectangle (the stroke's bounds), so a rebuild gives the same land.
//
// Exact arithmetic only (+ − × ÷ and floor; PLAN §2.1, D366): the same stroke gives the same land on every
// machine.

import { fbm } from "../../math/noise";
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
}

/** Smooth noise in about [-1, 1] at tile (x, y), its features `cell` tiles across: fractal value noise
 *  read on axes turned by about 37° (a 3-4-5 turn, exact), so nothing it shapes lines up with the
 *  tile grid. */
function noise(seed: number, x: number, y: number, cell: number): number {
  return fbm(seed, 0.8 * x - 0.6 * y + 4096, 0.6 * x + 0.8 * y + 4096, cell, 3);
}

/** World-fixed seeds: the noise belongs to the map's tiles, not to a stroke. */
const WANDER_SEED = 0x6e617475;
const REST_SEED = 0x72657374;
/** A drop between neighbours steeper than this is a cliff that sheds (three levels or more): its
 *  face wears back until it stands under FACE, and the ground it sheds settles at its foot; ground
 *  that has gathered MOVING or more of it runs on down to its angle of rest (the apron). */
const TRIGGER = 2.5;
const FACE = 2;
const MOVING = 0.2;
/** How far the noise pushes a softened edge (under a half: flat ground far from any edge never moves). */
const WANDER_PUSH = 0.45;

/** The wander's wavelength in tiles: follows Size, within what reads as a terrace's edge. */
export function wanderCell(size: number): number {
  return Math.max(4, Math.min(16, Math.round(size * 1.25)));
}

/** The land's angle of rest, in levels a tile (lower: cliffs slump further): follows Strength. */
export function restSlope(strength: number): number {
  return 0.5 - 0.015 * Math.max(1, Math.min(10, strength));
}

/** How long a cliff slumps in one stroke (rounds of the talus relaxation): a stroke wears a cliff's
 *  top back and builds an apron at its foot; painting again carries it on toward its rest. Follows
 *  Strength. */
export function slumpSteps(strength: number): number {
  return 12 + 2 * Math.round(Math.max(1, Math.min(10, strength)));
}

/** Weather `out` (the map's heights) inside the box from `before` and return the rectangle of tiles
 *  whose height in `out` changed, or null. */
export function weather(inp: WeatherInput, out: Uint8Array): Rect | null {
  const { W, box } = inp;
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  if (bw < 3 || bh < 3) return null;
  const n = bw * bh;
  const h0 = new Uint8Array(n);
  const I = new Float32Array(n);
  let any = false;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const g = (box.y0 + y) * W + box.x0 + x;
      const k = y * bw + x;
      h0[k] = inp.before[g];
      // the ring never changes; nor does a tile the stroke may not write
      if (x === 0 || y === 0 || x === bw - 1 || y === bh - 1) continue;
      const v = inp.intensity[g];
      if (!(v > 0) || !inp.write(g)) continue;
      I[k] = v > 1 ? 1 : v;
      any = true;
    }
  let h: Uint8Array = h0;
  if (any) {
    h = wander(h0, I, bw, bh, box, inp.size, inp.strength);
    slump(h, I, bw, bh, box, inp.strength);
    tidy(h, h0, I, bw, bh);
    // the limits: the working area's feather, the banks, the ceiling
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
        if (inp.room) v = Math.max(h0[k] - inp.room[g], Math.min(h0[k] + inp.room[g], v));
        if (inp.low && v < h0[k]) v = Math.max(v, Math.min(h0[k], inp.low[g]));
        h[k] = v;
      }
    // the shore: a dry tile beside standing water never comes down to within a level of it (water
    // that flows stands a little over its lip, and would spread onto it)
    const ring = ringLevels(h0, bw, bh, inp.rim ?? null);
    const w0 = new Int16Array(n);
    flood(h0, ring, bw, bh, w0);
    for (let y = 1; y < bh - 1; y++)
      for (let x = 1; x < bw - 1; x++) {
        const k = y * bw + x;
        if (h[k] >= h0[k] || w0[k] > h0[k]) continue;
        let floor = 0;
        for (const j of [k - 1, k + 1, k - bw, k + bw]) if (w0[j] > h0[j] && w0[j] + 1 > floor) floor = w0[j] + 1;
        if (h[k] < floor) h[k] = Math.min(h0[k], floor);
      }
    keepOrder(h, h0, bw, bh, ring, w0);
  }
  let changed: Rect | null = null;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      const g = (box.y0 + y) * W + box.x0 + x;
      if (out[g] === h[k]) continue;
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

// ------------------------------------------------------------------------------------------ wander

/** How soft the weathering reads an edge: how many times a [1 2 1] blur runs each way (a binomial
 *  blur, a Gaussian's whole-number twin, round even in its tails; its spread √(m / 2): 1.4 to 2.3
 *  tiles). The softer, the farther an edge can wander and the larger the knobs and spurs it wears
 *  away. Follows Strength. */
export function wanderBlur(strength: number): number {
  const s = Math.max(1, Math.min(10, strength));
  return s <= 2 ? 4 : s <= 4 ? 6 : s <= 7 ? 8 : 11;
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
function wander(h0: Uint8Array, I: Float32Array, bw: number, bh: number, box: Rect, size: number, strength: number): Uint8Array {
  const n = bw * bh;
  const r = wanderBlur(strength);
  const cell = wanderCell(size);
  const out = h0.slice();
  // where it acts, and the ground it reads round that
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
  const m = r;
  const x0 = Math.max(0, ax0 - m);
  const y0 = Math.max(0, ay0 - m);
  const x1 = Math.min(bw - 1, ax1 + m);
  const y1 = Math.min(bh - 1, ay1 + m);
  const tmp = new Float64Array(n);
  const line = new Float64Array(bh);
  const weight = new Float64Array(n);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) weight[y * bw + x] = 1;
  blur(weight, bw, x0, y0, x1, y1, r, tmp, line);
  // the levels whose edges come near where it acts
  let lo = 255;
  let hi = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = h0[y * bw + x];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  const delta = new Int8Array(n);
  const share = new Float64Array(n);
  const common = new Float64Array(n).fill(NaN);
  for (let lv = lo + 1; lv <= hi; lv++) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) share[y * bw + x] = h0[y * bw + x] >= lv ? 1 : 0;
    blur(share, bw, x0, y0, x1, y1, r, tmp, line);
    for (let y = ay0; y <= ay1; y++)
      for (let x = ax0; x <= ax1; x++) {
        const k = y * bw + x;
        const a = I[k] > 0 ? 0.5 + 0.5 * I[k] : 0;
        if (!a) continue;
        const inside = h0[k] >= lv;
        // a cliff (three levels or more above the tile) only wears back, never spreads out over it
        if (!inside && lv - h0[k] >= 3) continue;
        const s = share[k] / weight[k];
        // far from this level's edge nothing can change
        if (inside ? s >= 1 - 1e-9 : s <= 1e-9) continue;
        // one noise for every level: stacked edges wander together, so a cliff stays one (the slump
        // turns it into a stepped slope)
        let c = common[k];
        if (c !== c) c = common[k] = noise(WANDER_SEED, box.x0 + x, box.y0 + y, cell);
        let nz = 2.2 * c;
        if (nz > 1) nz = 1;
        else if (nz < -1) nz = -1;
        // faded toward the ring: the edge as it was, blended with the softened, pushed one (`a` from a
        // half: below that the blend would move nothing, so the edge's move follows the intensity)
        const v = (1 - a) * (inside ? 1 : 0) + a * (s + WANDER_PUSH * nz);
        const member = v > 0.5;
        if (member !== inside) delta[k] += member ? 1 : -1;
      }
  }
  for (let k = 0; k < n; k++) if (delta[k]) out[k] = Math.max(0, h0[k] + delta[k]);
  return out;
}

// ------------------------------------------------------------------------------------------- slump

/** Talus: a cliff's face wears back and the ground it sheds runs down from its foot to the angle of
 *  rest (cut and fill balanced), on the heights as a continuous field; then back to whole levels.
 *  Changes `h` in place. */
function slump(h: Uint8Array, I: Float32Array, bw: number, bh: number, box: Rect, strength: number): void {
  const n = bw * bh;
  const f = new Float64Array(n);
  for (let k = 0; k < n; k++) f[k] = h[k];
  const base = restSlope(strength);
  const rest = new Float64Array(n);
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const k = y * bw + x;
      if (I[k]) rest[k] = base * (1 + 0.4 * noise(REST_SEED, box.x0 + x, box.y0 + y, 5));
    }
  // the pairs of neighbours it may move ground between (side by side and corner to corner, so a
  // slope rests alike whichever way it faces), with their distance, angle of rest and weight
  const pa = new Int32Array(4 * n);
  const pb = new Int32Array(4 * n);
  const pd = new Float64Array(4 * n);
  const pr = new Float64Array(4 * n);
  const pw = new Float64Array(4 * n);
  let P = 0;
  for (let y = 1; y < bh - 1; y++)
    for (let x = 1; x < bw - 1; x++) {
      const a = y * bw + x;
      if (!I[a]) continue;
      for (let e = 0; e < 4; e++) {
        const b = e === 0 ? a + 1 : e === 1 ? a + bw : e === 2 ? a + bw + 1 : a + bw - 1;
        if (!I[b]) continue;
        const dist = e < 2 ? 1 : Math.SQRT2;
        pa[P] = a;
        pb[P] = b;
        pd[P] = dist;
        pr[P] = ((rest[a] + rest[b]) / 2) * dist;
        pw[P] = (e < 2 ? 0.14 : 0.07) * (I[a] < I[b] ? I[a] : I[b]);
        P++;
      }
    }
  const delta = new Float64Array(n);
  for (let it = 0, its = slumpSteps(strength); it < its; it++) {
    let moved = 0;
    for (let q = 0; q < P; q++) {
      const a = pa[q];
      const b = pb[q];
      const d = f[a] - f[b];
      const ad = d < 0 ? -d : d;
      // a cliff's face wears back to FACE; ground already moving settles to its rest
      let ex: number;
      if (ad > TRIGGER * pd[q] || (ad > FACE * pd[q] && (Math.abs(f[a] - h[a]) >= MOVING || Math.abs(f[b] - h[b]) >= MOVING))) ex = ad - FACE * pd[q];
      else if ((d > 0 ? f[a] - h[a] : f[b] - h[b]) >= MOVING) ex = ad - pr[q];
      else continue;
      if (ex <= 0) continue;
      const mv = pw[q] * ex;
      if (d > 0) {
        delta[a] -= mv;
        delta[b] += mv;
      } else {
        delta[a] += mv;
        delta[b] -= mv;
      }
      moved += mv;
    }
    for (let q = 0; q < P; q++) {
      const a = pa[q];
      const b = pb[q];
      if (delta[a] !== 0) (f[a] += delta[a]), (delta[a] = 0);
      if (delta[b] !== 0) (f[b] += delta[b]), (delta[b] = 0);
    }
    if (moved < 1e-3) break;
  }
  for (let k = 0; k < n; k++) if (I[k]) h[k] = Math.max(0, Math.min(255, Math.floor(f[k] + 0.5)));
}

// -------------------------------------------------------------------------------------------- tidy

/** No one-tile features: a knob or a pit of under four tiles that holds a changed tile meets the
 *  nearest level round it. */
function tidy(h: Uint8Array, h0: Uint8Array, I: Float32Array, bw: number, bh: number): void {
  const n = bw * bh;
  // no sliver: a changed tile two levels or more above both its neighbours across it (a wall one tile
  // thick) comes down to the higher of them, one as far below both (a slot) up to the lower
  for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    for (let y = 1; y < bh - 1; y++)
      for (let x = 1; x < bw - 1; x++) {
        const k = y * bw + x;
        if (h[k] === h0[k] || !I[k]) continue;
        const v = h[k];
        const hx = Math.max(h[k - 1], h[k + 1]);
        const hy = Math.max(h[k - bw], h[k + bw]);
        const lx = Math.min(h[k - 1], h[k + 1]);
        const ly = Math.min(h[k - bw], h[k + bw]);
        let to = v;
        if (v >= hx + 2 || v >= hy + 2) to = Math.max(v >= hx + 2 ? hx : 0, v >= hy + 2 ? hy : 0);
        else if (v + 2 <= lx || v + 2 <= ly) to = Math.min(v + 2 <= lx ? lx : 255, v + 2 <= ly ? ly : 255);
        if (to !== v) {
          h[k] = to;
          moved++;
        }
      }
    if (!moved) break;
  }
  const seen = new Int32Array(n).fill(-1);
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
function flood(h: Uint8Array, ring: Int16Array, bw: number, bh: number, out: Int16Array): void {
  const n = bw * bh;
  out.fill(-1);
  const head = new Int32Array(257).fill(-1);
  const next = new Int32Array(n);
  let maxLv = 0;
  for (let k = 0; k < n; k++)
    if (ring[k] >= 0) {
      const lv = ring[k];
      out[k] = lv;
      next[k] = head[lv];
      head[lv] = k;
      if (lv > maxLv) maxLv = lv;
    }
  for (let lv = 0; lv <= Math.min(256, maxLv); lv++) {
    while (head[lv] >= 0) {
      const k = head[lv];
      head[lv] = next[k];
      const x = k % bw;
      for (let e = 0; e < 4; e++) {
        const j = e === 0 ? (x > 0 ? k - 1 : -1) : e === 1 ? (x + 1 < bw ? k + 1 : -1) : e === 2 ? k - bw : k + bw;
        if (j < 0 || j >= n || out[j] >= 0) continue;
        const w = h[j] > lv ? h[j] : lv;
        out[j] = w;
        next[j] = head[w];
        head[w] = j;
        if (w > maxLv) maxLv = w;
      }
    }
  }
}

/** Take back, toward the land as it was, whatever breaks the downhill order (see the head). */
function keepOrder(h: Uint8Array, h0: Uint8Array, bw: number, bh: number, ring: Int16Array, w0: Int16Array): void {
  const n = bw * bh;
  const w1 = new Int16Array(n);
  const nbs = new Int32Array(4);
  const far: number[] = [];
  const pool = new Int32Array(n).fill(-1);
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
  const stamp = new Int32Array(n).fill(-1);
  const near: number[] = [];
  for (let round = 0; round < 200; round++) {
    let fixes = 0;
    near.length = 0;
    for (let k = 0; k < n; k++) {
      if (h[k] === h0[k]) continue;
      const c = around(k);
      if (stamp[k] !== round) (stamp[k] = round), near.push(k);
      for (let q = 0; q < c; q++) if (stamp[nbs[q]] !== round) (stamp[nbs[q]] = round), near.push(nbs[q]);
    }
    if (!near.length) return;
    // no neighbouring pair swaps which is higher
    for (const k of near) {
      const x = k % bw;
      for (let e = 0; e < 2; e++) {
        const j = e === 0 ? (x + 1 < bw ? k + 1 : -1) : k + bw < n ? k + bw : -1;
        if (j < 0 || h0[k] === h0[j]) continue;
        const a = h0[k] > h0[j] ? k : j;
        const b = a === k ? j : k;
        if (h[a] >= h[b]) continue;
        if (h[b] > h0[b]) h[b] = Math.max(h0[b], h[a]);
        else h[a] = Math.min(h0[a], h[b]);
        fixes++;
      }
    }
    // no changed tile above or below all its neighbours, and no tile it left made one by those round it
    for (const k of near) {
      const c = around(k);
      let lo = 255;
      let hi = -1;
      for (let q = 0; q < c; q++) {
        const v = h[nbs[q]];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (h[k] === h0[k]) {
        if (h[k] <= hi && h[k] >= lo) continue;
        let lo0 = 255;
        let hi0 = -1;
        for (let q = 0; q < c; q++) {
          const v = h0[nbs[q]];
          if (v < lo0) lo0 = v;
          if (v > hi0) hi0 = v;
        }
        const was = h0[k] > hi0 || h0[k] < lo0;
        if (was) continue;
        let moved = false;
        // a spike made by lowering round it: those back up a level; a pit made by raising: down
        for (let q = 0; q < c; q++) {
          const j = nbs[q];
          if (h[k] > hi && h[j] < h0[j]) (h[j]++, (moved = true));
          else if (h[k] < lo && h[j] > h0[j]) (h[j]--, (moved = true));
        }
        if (moved) fixes++;
        continue;
      }
      if (h[k] > hi) {
        if (h[k] > h0[k]) h[k] = Math.max(h0[k], hi);
        else {
          let moved = false;
          for (let q = 0; q < c; q++) if (h[nbs[q]] < h0[nbs[q]]) (h[nbs[q]]++, (moved = true));
          if (!moved) h[k] = h0[k];
        }
        fixes++;
      } else if (h[k] < lo) {
        if (h[k] < h0[k]) h[k] = Math.min(h0[k], lo);
        else {
          let moved = false;
          for (let q = 0; q < c; q++) if (h[nbs[q]] > h0[nbs[q]]) (h[nbs[q]]--, (moved = true));
          if (!moved) h[k] = h0[k];
        }
        fixes++;
      }
    }
    if (fixes) continue;
    // nothing newly holds water: deeper water on no tile
    flood(h, ring, bw, bh, w1);
    far.length = 0;
    for (let k = 0; k < n; k++) {
      if (w1[k] - h[k] <= w0[k] - h0[k]) continue;
      if (h[k] < h0[k]) {
        h[k]++;
        fixes++;
        continue;
      }
      // held in by raised ground round it: that ground a level down
      const c = around(k);
      let moved = false;
      for (let q = 0; q < c; q++) {
        const j = nbs[q];
        if (h[j] > h0[j] && h[j] >= w1[k]) (h[j]--, (moved = true));
      }
      if (moved) {
        fixes++;
        continue;
      }
      // else the way out is farther off
      far.push(k);
    }
    if (far.length) fixes += lowerRims(far, h, h0, w1, bw, pool);
    if (fixes) continue;
    if (keepPassages(h, h0, ring, bw, bh)) continue;
    return;
  }
  // (a last safeguard: never reached in practice) everything back as it was
  h.set(h0);
}

/** The pools round tiles `seeds` (the tiles water stands on, joined to them): each one's raised rim a
 *  level down, or, with none, every changed tile in it and round it back as it was. `pool` is a work
 *  buffer (-1 throughout on entry and on return). Returns how many tiles it moved. */
function lowerRims(seeds: readonly number[], h: Uint8Array, h0: Uint8Array, w1: Int16Array, bw: number, pool: Int32Array): number {
  const n = pool.length;
  const touched: number[] = [];
  let moved = 0;
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
    let lowered = 0;
    for (const j of rim) if (h[j] > h0[j]) (h[j]--, lowered++);
    if (!lowered)
      for (const k of tiles.concat(rim))
        if (h[k] !== h0[k]) {
          h[k] = h0[k];
          lowered++;
        }
    moved += lowered;
  }
  for (const k of touched) pool[k] = -1;
  return moved;
}

/** No way water could leave the area through it closes: any two ring tiles joined by ground at or
 *  below a level before are still joined at that level. Lowers a level the raised tiles in a passage
 *  that closed; returns whether it found one. */
function keepPassages(h: Uint8Array, h0: Uint8Array, ring: Int16Array, bw: number, bh: number): boolean {
  const n = bw * bh;
  // tiles by level, before and after (a counting sort)
  const maxLv = 256;
  const c0 = new Int32Array(maxLv + 1);
  const c1 = new Int32Array(maxLv + 1);
  for (let k = 0; k < n; k++) {
    c0[h0[k] + 1]++;
    c1[h[k] + 1]++;
  }
  for (let l = 1; l <= maxLv; l++) {
    c0[l] += c0[l - 1];
    c1[l] += c1[l - 1];
  }
  const o0 = new Int32Array(n);
  const o1 = new Int32Array(n);
  {
    const f0 = c0.slice();
    const f1 = c1.slice();
    for (let k = 0; k < n; k++) {
      o0[f0[h0[k]]++] = k;
      o1[f1[h[k]]++] = k;
    }
  }
  const p0 = new Int32Array(n).fill(-1);
  const p1 = new Int32Array(n).fill(-1);
  const find = (p: Int32Array, k: number): number => {
    let r = k;
    while (p[r] !== r) r = p[r];
    while (p[k] !== r) {
      const nx = p[k];
      p[k] = r;
      k = nx;
    }
    return r;
  };
  const add = (p: Int32Array, k: number) => {
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
  };
  const ringList: number[] = [];
  for (let k = 0; k < n; k++) if (ring[k] >= 0) ringList.push(k);
  const first = new Int32Array(n).fill(-1);
  let hiLv = 0;
  for (let k = 0; k < n; k++) hiLv = Math.max(hiLv, h0[k], h[k]);
  for (let lv = 0; lv <= hiLv; lv++) {
    let moved = false;
    for (let q = c0[lv]; q < c0[lv + 1]; q++) (add(p0, o0[q]), (moved = true));
    for (let q = c1[lv]; q < c1[lv + 1]; q++) (add(p1, o1[q]), (moved = true));
    if (!moved) continue;
    const used: number[] = [];
    let bad = -1;
    for (const r of ringList) {
      if (h0[r] > lv) continue;
      const key = find(p0, r);
      if (first[key] < 0) {
        first[key] = r;
        used.push(key);
        continue;
      }
      if (find(p1, r) !== find(p1, first[key])) {
        bad = key;
        break;
      }
    }
    for (const key of used) first[key] = -1;
    if (bad < 0) continue;
    // the raised tiles in that passage, a level down
    for (let k = 0; k < n; k++) if (h[k] > lv && h0[k] <= lv && find(p0, k) === bad) h[k]--;
    return true;
  }
  return false;
}
