// Mine-site pads (PLAN §20 D363, with D328 and item 47): while the land is shaped, before it is ever
// shown, the generator makes sure a start's walk holds level ground for the mine sites it must reach.
// Where the land already has a level square for a site (the footprint and the ring its entrance
// needs, 7×7 at one level) far enough out, nothing changes. Where it has too few, the ground that is
// nearest to level becomes a pad, as the start's pad is levelled: a small level terrace, its tiles a
// level over it taken down to it (never more than one level, never raised), on dry ground clear of
// the water, within the start's walk. It looks natural: round, its edge eased into the land by a
// wandering margin, never a square notch cut into a hillside (D328).
//
// Once the water has settled, the start goes where its walk has that room (`roomMap`): level squares
// clear of the water and of what the objects keep off, as the objects' placement reads them
// (gen/extras.ts), far enough out.

import { landRegions } from "../analysis/regions";
import { distanceFrom } from "../math/grid";
import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import * as portable from "../math/portable";
import { mineDistance } from "../resources/mineGround";

/** A mine site's square: its footprint (5×5) and the ring round it, all at one level. */
const SIDE = 7;
const HALF = (SIDE - 1) / 2;
/** Squares for two sites stand this far apart (Chebyshev, middle to middle): the first site and
 *  the three tiles the placement keeps round it leave the second its square. */
const APART = SIDE + 3;
/** The pad's radius: the square's corners inside it. */
const PAD_R = 4.3;
/** The most tiles a pad takes down (D363: about 49). */
export const PAD_MOST = 49;
/** The water's margin the objects keep (validate/playability.ts FLOOD_MARGIN + 1, a square round
 *  each wet tile), and a pad's, wider: the planned water is only the plan, and the settled water
 *  spreads further, over flats and into ponds. */
const WATER_MARGIN = 3;
const PAD_WATER_MARGIN = 5;

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface MinePad {
  /** The pad's middle and level. */
  x: number;
  y: number;
  level: number;
  /** The tiles taken down a level. */
  cut: number[];
}

interface SiteOptions {
  start: { x: number; y: number };
  /** The water (a tile wetter than 0.05 is water). */
  wet: ArrayLike<number>;
  /** Tiles no site or pad may touch. */
  keep: Uint8Array;
  want: number;
  /** The least distance from the start, and the distance the placement looks at first. */
  lo: number;
  far: number;
}

/** The tiles within `margin` (a square round each) of the water: wetter than 0.05. */
function nearWater(wet: ArrayLike<number>, W: number, H: number, margin: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  // (a square dilation, rows then columns)
  const rows = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    let last = -Infinity;
    for (let x = 0; x < W; x++) {
      if (wet[y * W + x] > 0.05) last = x;
      if (x - last <= margin) rows[y * W + x] = 1;
    }
    last = Infinity;
    for (let x = W - 1; x >= 0; x--) {
      if (wet[y * W + x] > 0.05) last = x;
      if (last - x <= margin) rows[y * W + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -Infinity;
    for (let y = 0; y < H; y++) {
      if (rows[y * W + x]) last = y;
      if (y - last <= margin) out[y * W + x] = 1;
    }
    last = Infinity;
    for (let y = H - 1; y >= 0; y--) {
      if (rows[y * W + x]) last = y;
      if (last - y <= margin) out[y * W + x] = 1;
    }
  }
  return out;
}

/** The middles of the level squares on the land (`land`'s regions), clear of `blocked` and the
 *  map's border: a site's ground. */
function levelSquares(h: Uint8Array, W: number, H: number, land: Int32Array, blocked: Uint8Array): number[] {
  const out: number[] = [];
  for (let cy = HALF + 2; cy < H - HALF - 2; cy++)
    for (let cx = HALF + 2; cx < W - HALF - 2; cx++) {
      const c = cy * W + cx;
      const lab = land[c];
      if (lab < 0) continue;
      let ok = true;
      for (let dy = -HALF; dy <= HALF && ok; dy++)
        for (let dx = -HALF; dx <= HALF && ok; dx++) {
          const j = c + dy * W + dx;
          if (blocked[j] || land[j] !== lab || h[j] !== h[c]) ok = false;
        }
      if (ok) out.push(c);
    }
  return out;
}

const chebyshev = (a: number, b: number, W: number) => Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)));

/** The start's land and zone, and the level squares it already holds for the sites (apart from
 *  each other, far enough out, those at `far` first), up to `want`. With `firm`, the start's land
 *  is what stays joined `firm` tiles or more from the water: a neck of land beside the water, which
 *  the settled water or a hollow may cut, does not join it. */
function ownSquares(h: Uint8Array, W: number, H: number, opts: SiteOptions & { firm?: number }) {
  const N = W * H;
  const { start } = opts;
  const water = opts.firm ? nearWater(opts.wet, W, H, opts.firm) : new Uint8Array(N);
  if (!opts.firm) for (let i = 0; i < N; i++) water[i] = opts.wet[i] > 0.05 ? 1 : 0;
  const land = landRegions(h, W, H, water);
  // (the start's land: its own tile's, or, by the water, the nearest land's)
  let root = land[start.y * W + start.x];
  for (let r = 1; r <= 8 && root < 0; r++)
    for (let dy = -r; dy <= r && root < 0; dy++)
      for (let dx = -r; dx <= r && root < 0; dx++) {
        const x = start.x + dx;
        const y = start.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] >= 0) root = land[y * W + x];
      }
  const startMask = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) startMask[y * W + x] = 1;
  const sd = distanceFrom(startMask, W, H);
  const far = (c: number) => mineDistance(start.x, start.y, c % W, Math.floor(c / W)) >= opts.lo;
  const taken: number[] = [];
  if (root < 0) return { land, root, sd, far, taken };
  // (clear of the water as the objects' placement keeps it, of the kept tiles and the start's zone)
  const near = nearWater(opts.wet, W, H, WATER_MARGIN);
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (near[i] || opts.keep[i] || sd[i] < 8) blocked[i] = 1;
  const own = levelSquares(h, W, H, land, blocked).filter((c) => land[c] === root && far(c));
  own.sort((a, b) => (sd[a] >= opts.far ? 0 : 1) - (sd[b] >= opts.far ? 0 : 1) || a - b);
  // (a few tiles apart: every square stands within three of one of these)
  const few: number[] = [];
  for (const c of own) if (few.every((t) => chebyshev(t, c, W) >= 4)) few.push(c);
  for (const c of few) if (taken.length < opts.want && taken.every((t) => chebyshev(t, c, W) >= APART)) taken.push(c);
  // (two apart where the first taken leaves none: any pair far enough apart)
  if (opts.want === 2 && taken.length < 2)
    for (let a = 0; a < few.length && taken.length < 2; a++)
      for (let b = a + 1; b < few.length; b++)
        if (chebyshev(few[a], few[b], W) >= APART) {
          taken.length = 0;
          taken.push(few[a], few[b]);
          break;
        }
  return { land, root, sd, far, taken };
}

/**
 * Pads for `want` mine sites the colony reaches from `start` (its walk: dry land joined by steps
 * of one level), each `lo` tiles or more from it (farther, to `far`, where there is room), where
 * the land has fewer level squares than that. `wet` is the water the land is planned with; `keep`
 * the tiles no pad may touch (channels, lakes, locks, protected set pieces). Changes `h` and returns
 * the pads made; `mineSquares` hands back the squares kept for the sites, the land's own and the
 * pads.
 */
export function minePads(h: Uint8Array, W: number, H: number, opts: SiteOptions & { seed: number }): MinePad[] {
  lastSquares = [];
  lastWays = [];
  const N = W * H;
  const { land, root, sd, far, taken } = ownSquares(h, W, H, { ...opts, firm: FIRM });
  if (root < 0) return [];
  if (taken.length >= opts.want) {
    keep(taken);
    return [];
  }
  const apart = (i: number) => taken.every((t) => chebyshev(t, i, W) >= APART);
  // the pads: the ground nearest to level, clear of the water by a wider margin (the settled water
  // spreads further than the plan's)
  const padNear = nearWater(opts.wet, W, H, PAD_WATER_MARGIN);
  const padBlocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (padNear[i] || opts.keep[i] || sd[i] < 8 || x < 2 || y < 2 || x > W - 3 || y > H - 3) padBlocked[i] = 1;
  }
  const cands: { i: number; cost: number; L: number }[] = [];
  const r0 = Math.ceil(PAD_R);
  for (let cy = r0 + 2; cy < H - r0 - 2; cy++)
    for (let cx = r0 + 2; cx < W - r0 - 2; cx++) {
      const c = cy * W + cx;
      if (land[c] !== root || !far(c)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let ok = true;
      for (let dy = -HALF; dy <= HALF && ok; dy++)
        for (let dx = -HALF; dx <= HALF && ok; dx++) {
          const j = c + dy * W + dx;
          if (padBlocked[j] || land[j] !== root) ok = false;
          else {
            if (h[j] < lo) lo = h[j];
            if (h[j] > hi) hi = h[j];
          }
        }
      if (!ok || hi - lo !== 1) continue;
      // (a pad: round, over the square's corners; every tile of it at the level or one over, clear;
      // and no tile of the square taken down beside ground two levels over it, a notch under a cliff)
      let cost = 0;
      for (let dy = -r0; dy <= r0 && ok; dy++)
        for (let dx = -r0; dx <= r0 && ok; dx++) {
          if (dx * dx + dy * dy > PAD_R * PAD_R) continue;
          const j = c + dy * W + dx;
          if (padBlocked[j] || h[j] < lo || h[j] > lo + 1) ok = false;
          else if (h[j] === lo + 1) {
            cost++;
            if (Math.abs(dx) <= HALF && Math.abs(dy) <= HALF && steepBy(h, W, H, cx + dx, cy + dy, lo + 1)) ok = false;
          }
        }
      if (ok && cost <= PAD_MOST) cands.push({ i: c, cost, L: lo });
    }
  // the least ground taken down, out at `far` where there is room, apart from the squares and each
  // other
  cands.sort((a, b) => (sd[a.i] >= opts.far ? 0 : 1) - (sd[b.i] >= opts.far ? 0 : 1) || a.cost - b.cost || a.i - b.i);
  const pads: MinePad[] = [];
  const ns = hash32(opts.seed, "mine-pad-edge");
  for (const cand of cands) {
    if (taken.length >= opts.want) break;
    if (!apart(cand.i)) continue;
    const cx = cand.i % W;
    const cy = (cand.i - cx) / W;
    // the terrace: the round pad, and a margin a tile or two out where the ground a level over it
    // eases down to it by a wandering edge (no square notch)
    const inCut = new Set<number>();
    const r = r0 + 2;
    const inSquare = (dx: number, dy: number) => Math.abs(dx) <= HALF && Math.abs(dy) <= HALF;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        if (h[j] !== cand.L + 1 || padBlocked[j]) continue;
        const d = portable.hypot(dx, dy);
        const edge = PAD_R + 0.9 * (fbm(ns, x, y, 3, 2) + 1);
        if (d > PAD_R && (d > edge || land[j] !== root)) continue;
        // (a tile off the square beside ground two levels over the pad stays: taken down, it would
        // stand under a cliff)
        if (!inSquare(dx, dy) && steepBy(h, W, H, x, y, cand.L + 1)) continue;
        inCut.add(j);
      }
    // (the edge smoothed: a tile a level over the pad left nearly surrounded by it goes down with
    // it, a tile taken down nearly surrounded by the ground over it stays; no bumps, no pits)
    for (let pass = 0; pass < 2; pass++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || inSquare(dx, dy)) continue;
          const j = y * W + x;
          let low = 0;
          for (const [ex, ey] of N4) {
            const k = j + ey * W + ex;
            if (inCut.has(k) || h[k] <= cand.L) low++;
          }
          if (!inCut.has(j) && h[j] === cand.L + 1 && !padBlocked[j] && land[j] === root && low >= 3 && !steepBy(h, W, H, x, y, cand.L + 1)) inCut.add(j);
          else if (inCut.has(j) && low <= 1) inCut.delete(j);
        }
    const cut = [...inCut].sort((a, b) => a - b);
    if (cut.length > PAD_MOST + 12) continue;
    for (const j of cut) h[j] = cand.L;
    taken.push(cand.i);
    pads.push({ x: cx, y: cy, level: cand.L, cut });
  }
  keep(taken);
  return pads;

  // (the squares kept, and the colony's way to each from the start over its land: the hollows keep
  // off them both)
  function keep(squares: number[]): void {
    lastSquares = squares.slice();
    const from = new Int32Array(N).fill(-2);
    const q: number[] = [];
    let s0 = -1;
    for (let r = 0; r <= 8 && s0 < 0; r++)
      for (let dy = -r; dy <= r && s0 < 0; dy++)
        for (let dx = -r; dx <= r && s0 < 0; dx++) {
          const x = opts.start.x + dx;
          const y = opts.start.y + dy;
          if (x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] === root) s0 = y * W + x;
        }
    if (s0 < 0) return;
    from[s0] = -1;
    q.push(s0);
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (from[j] !== -2 || land[j] !== root || Math.abs(h[j] - h[c]) > 1) continue;
        from[j] = c;
        q.push(j);
      }
    }
    for (const c of squares) {
      if (from[c] === -2) continue;
      const way: number[] = [];
      for (let t = c; t >= 0; t = from[t]) way.push(t);
      lastWays.push(way);
    }
  }
}

/** The start's land, before the water settles, is what stays joined this far from the planned
 *  water (a neck of land narrower than this beside the water may be cut once it settles). */
export const FIRM = 2;

let lastSquares: number[] = [];
let lastWays: number[][] = [];

/** The middles of the squares the last `minePads` kept for the mine sites (the land's own and its
 *  pads): the hollows keep off them, so the sites still have their ground once the water settles. */
export function mineSquares(): number[] {
  return lastSquares.slice();
}

/** The colony's ways from the start to those squares, over its land: the hollows keep off them too,
 *  so the sites stay in the start's walk. */
export function mineWays(): number[][] {
  return lastWays.map((w) => w.slice());
}

/** How many mine sites a start has level ground for in its walk (squares apart from each other,
 *  `lo` tiles or more out, clear of the water's margin and `keep`), up to `want`; nothing changed. */
export function mineRoom(h: Uint8Array, W: number, H: number, opts: Omit<SiteOptions, "far">): number {
  return ownSquares(h, W, H, { ...opts, far: opts.lo }).taken.length;
}

/** Whether a tile at (x, y) stands beside ground over `top`. */
function steepBy(h: Uint8Array, W: number, H: number, x: number, y: number, top: number): boolean {
  for (const [ex, ey] of N4) {
    const u = x + ex;
    const v = y + ey;
    if (u >= 0 && v >= 0 && u < W && v < H && h[v * W + u] > top) return true;
  }
  return false;
}

/**
 * Where a start has room for its mine sites (D363), on the settled water `wet`: the dry tiles
 * whose land (tiles joined by steps of one level) holds `want` level squares for a site apart from
 * each other, each `lo` tiles or more from a start there, clear of the water's margin and of
 * `keep` (what the objects' placement keeps off: the hollows' ground, channels, objects, protected
 * set pieces). A start chosen on it has ground in its walk for its sites, nothing changed.
 */
export function roomMap(h: Uint8Array, W: number, H: number, opts: { wet: ArrayLike<number>; keep: Uint8Array; want: number; lo: number; firm?: number }): Uint8Array {
  const N = W * H;
  const water = opts.firm ? nearWater(opts.wet, W, H, opts.firm) : new Uint8Array(N);
  if (!opts.firm) for (let i = 0; i < N; i++) water[i] = opts.wet[i] > 0.05 ? 1 : 0;
  const land = landRegions(h, W, H, water);
  // (with `firm`, a dry tile by the water, where a start stands, belongs to the firm land nearest it)
  if (opts.firm)
    for (let i = 0; i < N; i++) {
      if (land[i] >= 0 || opts.wet[i] > 0.05) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (let r = 1; r <= opts.firm + 1 && land[i] < 0; r++)
        for (let dy = -r; dy <= r && land[i] < 0; dy++)
          for (let dx = -r; dx <= r && land[i] < 0; dx++) {
            const u = x + dx;
            const v = y + dy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && u >= 0 && v >= 0 && u < W && v < H && !water[v * W + u] && land[v * W + u] >= 0) land[i] = land[v * W + u];
          }
    }
  const near = nearWater(opts.wet, W, H, WATER_MARGIN);
  const blocked = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (near[i] || opts.keep[i]) blocked[i] = 1;
  // (the squares, a few tiles apart: every square found stands within three of one of these, and
  // each of these is a square, so what they show room for is there)
  const byLand = new Map<number, number[]>();
  for (const c of levelSquares(h, W, H, land, blocked)) {
    const list = byLand.get(land[c]) ?? [];
    if (list.every((t) => chebyshev(t, c, W) >= 4)) list.push(c);
    byLand.set(land[c], list);
  }
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const list = land[i] >= 0 ? byLand.get(land[i]) : undefined;
    if (!list) continue;
    const x = i % W;
    const y = (i - x) / W;
    // (the squares far enough from here; for two sites, two of them far enough apart: the span of
    // their middles, Chebyshev)
    let n = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const farOnes: number[] = [];
    for (const c of list) {
      const cx = c % W;
      const cy = (c - cx) / W;
      if (mineDistance(x, y, cx, cy) < opts.lo) continue;
      n++;
      if (opts.want > 2) farOnes.push(c);
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
    }
    if (!n) continue;
    if (opts.want <= 1) out[i] = 1;
    else if (opts.want === 2) out[i] = x1 - x0 >= APART || y1 - y0 >= APART ? 1 : 0;
    else {
      const taken: number[] = [];
      for (const c of farOnes) if (taken.every((t) => chebyshev(t, c, W) >= APART)) taken.push(c);
      out[i] = taken.length >= opts.want ? 1 : 0;
    }
  }
  return out;
}
