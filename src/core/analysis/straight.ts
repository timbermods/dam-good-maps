// Ruler-straight channels (Kyler, 2026-09-26, D209): rivers and badwater streams must never run
// ruler-straight. Design version 2 had perfectly straight channels at 45 or 90 degrees with parallel,
// canal-like sides. This measures it on any map from its surface water alone, so generated maps,
// real terrain (the landscape survey, Real places) and the official maps are measured alike:
//
// - the banks: every boundary between channel water (water at least `wet` deep, in a channel under
//   9 tiles wide) and dry ground, as contours along the tiles' edges. The shores of broad water
//   (lakes and seas: water within a disc of radius 4 that is all water) are not banks, and neither
//   is the map's own border nor anything within 3 tiles of it (a map's edge is where the land was
//   cut);
// - a straight run: a stretch of a bank whose corners all lie within `tau` tiles of one straight
//   line (at any angle). A digital straight line of any slope fits in a band of half-width 0.71, so
//   the default 0.75 finds every ruler-straight bank; a natural bank leaves the band within a few
//   tiles;
// - a canal: two straight runs facing each other across the water, parallel and overlapping (a
//   channel with parallel sides); its length is their overlap.
//
// The generator refuses a map whose longest straight run or canal is longer than real terrain and
// the official maps ever have (the thresholds come from `tools/straight-reference.ts`). Only
// + − × ÷ and square roots decide it (PLAN §2.1): the verdict is the same in every browser.

/** The longest straight channel bank and the longest canal real terrain and the official maps
 *  reach (tools/straight-reference.ts, investigation/m9a/straight-reference.json): real terrain's
 *  landscape library 34 and 21.17, the official maps 44 and 34.28, leaving out the maps Kyler
 *  called exceptional (Nomads, Oasis) and values beyond Tukey's far fence of their own source (the
 *  official Pressure's 96-tile canal, the engineered Lower Mississippi's 67). A generated map with a
 *  longer one has a ruler-straight channel, and the generator plans it again (D209). */
export const STRAIGHT_LIMITS = { run: 44, canal: 34.28 } as const;

/** Whether a map's channels run straighter than real terrain and the official maps ever do. */
export function tooStraight(s: Straightness): boolean {
  return (s.longest?.length ?? 0) > STRAIGHT_LIMITS.run || (s.canal?.length ?? 0) > STRAIGHT_LIMITS.canal;
}

export interface StraightRun {
  /** Unit edges along the bank. */
  length: number;
  /** Its two ends, in tile corner coordinates. */
  from: [number, number];
  to: [number, number];
}

export interface Canal {
  /** The length both banks run straight and parallel, facing each other. */
  length: number;
  /** The water's width between them. */
  width: number;
  a: StraightRun;
  b: StraightRun;
}

export interface Straightness {
  /** The longest straight run of any bank (null: no banks). */
  longest: StraightRun | null;
  /** The longest canal (null: none of `minCanal` tiles or more). */
  canal: Canal | null;
  /** Every straight run of `minRun` tiles or more. */
  runs: StraightRun[];
}

export interface StraightOptions {
  /** Water at least this deep counts as wet (0.1). */
  wet?: number;
  /** The band's half-width (0.75 tiles). */
  tau?: number;
  /** Runs at least this long are kept for canals (8). */
  minRun?: number;
  /** The widest water a canal spans (14 tiles). */
  maxCanalWidth?: number;
  /** Only water on these tiles counts (a channel's own tiles); all water when absent. */
  mask?: ArrayLike<number> | null;
  /** Banks this close to the map's border do not count (3 tiles): a map's edge is where the land was
   *  cut, not a bank. */
  border?: number;
  /** Only the banks of channels count: water narrower than this many tiles (9). Wider water (a lake, a
   *  sea) has shores, not banks; 0 counts every shore. */
  channelWidth?: number;
}

import { distanceFrom } from "../math/grid";

type Pt = [number, number];

/** The banks as chains of tile corners (x, y) from 0 to W and 0 to H, wet on the left. */
export function bankContours(W: number, H: number, isWet: (i: number) => boolean, counts: (i: number) => boolean = () => true): Pt[][] {
  // directed unit edges, wet on the left, keyed by their start corner
  const cw = W + 1;
  const out = new Map<number, number[]>();
  const edges: [number, number][] = [];
  let counting = true;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    if (!counting) return;
    const a = ay * cw + ax;
    const b = by * cw + bx;
    const k = edges.length;
    edges.push([a, b]);
    const list = out.get(a);
    if (list) list.push(k);
    else out.set(a, [k]);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!isWet(y * W + x)) continue;
      counting = counts(y * W + x);
      // tile (x, y) spans corners (x, y)–(x + 1, y + 1); counter-clockwise round the wet tile
      if (y > 0 && !isWet((y - 1) * W + x)) add(x, y, x + 1, y); // south side, going east
      if (x < W - 1 && !isWet(y * W + x + 1)) add(x + 1, y, x + 1, y + 1); // east side, going north
      if (y < H - 1 && !isWet((y + 1) * W + x)) add(x + 1, y + 1, x, y + 1); // north side, going west
      if (x > 0 && !isWet(y * W + x - 1)) add(x, y + 1, x, y); // west side, going south
    }
  const used = new Uint8Array(edges.length);
  const hasIn = new Set<number>();
  for (const [, b] of edges) hasIn.add(b);
  const chains: Pt[][] = [];
  const corner = (c: number): Pt => [c % cw, (c - (c % cw)) / cw];
  const walk = (k0: number) => {
    const chain: Pt[] = [corner(edges[k0][0])];
    let k = k0;
    while (k >= 0 && !used[k]) {
      used[k] = 1;
      const [a, b] = edges[k];
      chain.push(corner(b));
      // the next edge from b: at a corner with two (a saddle), turn left, so wet tiles that touch
      // only at a corner stay apart
      const next = out.get(b);
      k = -1;
      if (!next) break;
      let best = -1;
      let bestTurn = -2;
      const [ax, ay] = corner(a);
      const [bx, by] = corner(b);
      for (const e of next) {
        if (used[e]) continue;
        const [cx, cy] = corner(edges[e][1]);
        const turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx); // +1 left, 0 straight, -1 right
        if (turn > bestTurn) {
          bestTurn = turn;
          best = e;
        }
      }
      k = best;
    }
    if (chain.length > 1) chains.push(chain);
  };
  // open chains first (they start at the map's border), then the closed ones
  for (let k = 0; k < edges.length; k++) if (!used[k] && !hasIn.has(edges[k][0])) walk(k);
  for (let k = 0; k < edges.length; k++) if (!used[k]) walk(k);
  return chains;
}

/** The furthest point `j` of `pts` from `i` on such that every point from i to j lies within `tau`
 *  of one line through `pts[i]`. Exact arithmetic: directions as tangents about a reference, the
 *  band's half-angle from its sine and cosine. */
function runEnd(pts: readonly Pt[], i: number, tau: number, cap: number): number {
  const [px, py] = pts[i];
  const n = pts.length;
  let rx = 0;
  let ry = 0;
  let lo = -Infinity;
  let hi = Infinity;
  let end = i;
  for (let j = i + 1; j < n && j - i <= cap; j++) {
    const vx = pts[j][0] - px;
    const vy = pts[j][1] - py;
    const d2 = vx * vx + vy * vy;
    if (d2 <= 4 * tau * tau) {
      end = j;
      continue;
    }
    const d = Math.sqrt(d2);
    if (rx === 0 && ry === 0) {
      rx = vx / d;
      ry = vy / d;
    }
    // the point's direction about the reference: cos c, sin s
    const c = (rx * vx + ry * vy) / d;
    const s = (rx * vy - ry * vx) / d;
    if (c <= 0) break;
    const sa = tau / d;
    const ca = Math.sqrt(1 - sa * sa);
    const denLo = c * ca + s * sa;
    const denHi = c * ca - s * sa;
    if (denLo <= 0 || denHi <= 0) break;
    const tLo = (s * ca - c * sa) / denLo;
    const tHi = (s * ca + c * sa) / denHi;
    const nlo = tLo > lo ? tLo : lo;
    const nhi = tHi < hi ? tHi : hi;
    if (nlo > nhi) break;
    lo = nlo;
    hi = nhi;
    end = j;
  }
  return end;
}

export function straightness(W: number, H: number, depth: ArrayLike<number>, opts: StraightOptions = {}): Straightness {
  const wet = opts.wet ?? 0.1;
  const tau = opts.tau ?? 0.75;
  const minRun = opts.minRun ?? 8;
  const mask = opts.mask ?? null;
  const border = opts.border ?? 3;
  const channelWidth = opts.channelWidth ?? 9;
  const isWet = (i: number) => depth[i] >= wet && (!mask || mask[i] > 0);
  const broad = channelWidth > 0 ? broadWater(W, H, isWet, (channelWidth - 1) / 2) : null;
  const counts = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return x >= border && y >= border && x < W - border && y < H - border && !broad?.[i];
  };
  const chains = bankContours(W, H, isWet, counts);
  let longest: StraightRun | null = null;
  const runs: StraightRun[] = [];
  for (const pts of chains) {
    let lastEnd = -1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const e = runEnd(pts, i, tau, 512);
      const len = e - i;
      if (len > 0 && (!longest || len > longest.length)) longest = { length: len, from: pts[i], to: pts[e] };
      // maximal runs: one that ends further than the last kept one
      if (len >= minRun && e > lastEnd) {
        runs.push({ length: len, from: pts[i], to: pts[e] });
        lastEnd = e;
      }
    }
  }
  return { longest, canal: canalOf(runs, depth, W, H, wet, opts.maxCanalWidth ?? 14), runs };
}

/** Water within `r` tiles of a disc of radius `r` that is all water (a morphological opening):
 *  lakes and seas and the broad parts of rivers; what is left is channel. Tiles beyond the map's
 *  border count as water, so a river running off the edge stays a channel to it. */
function broadWater(W: number, H: number, isWet: (i: number) => boolean, r: number): Uint8Array {
  const N = W * H;
  const dry = new Uint8Array(N);
  for (let i = 0; i < N; i++) dry[i] = isWet(i) ? 0 : 1;
  const toDry = distanceFrom(dry, W, H);
  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) core[i] = toDry[i] > r ? 1 : 0;
  const toCore = distanceFrom(core, W, H);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = !dry[i] && toCore[i] <= r ? 1 : 0;
  return out;
}

/** The longest pair of straight runs that face each other across water: parallel (their
 *  directions within about 6°), their lines 1–`maxWidth` tiles apart with water between, and
 *  overlapping along their length. */
function canalOf(runs: readonly StraightRun[], depth: ArrayLike<number>, W: number, H: number, wet: number, maxWidth: number): Canal | null {
  let best: Canal | null = null;
  const dir = (r: StraightRun) => {
    const dx = r.to[0] - r.from[0];
    const dy = r.to[1] - r.from[1];
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / l, dy / l] as const;
  };
  for (let a = 0; a < runs.length; a++) {
    const ra = runs[a];
    const [ux, uy] = dir(ra);
    const la = (ra.to[0] - ra.from[0]) * ux + (ra.to[1] - ra.from[1]) * uy;
    for (let b = a + 1; b < runs.length; b++) {
      const rb = runs[b];
      const [vx, vy] = dir(rb);
      // opposite banks run opposite ways (wet on the left of each)
      if (ux * vx + uy * vy > -0.994) continue;
      // the distance between the lines, and the overlap of b's ends projected on a
      const wx = rb.from[0] - ra.from[0];
      const wy = rb.from[1] - ra.from[1];
      const off = ux * wy - uy * wx;
      if (off < 1 || off > maxWidth) continue;
      const p0 = wx * ux + wy * uy;
      const p1 = (rb.to[0] - ra.from[0]) * ux + (rb.to[1] - ra.from[1]) * uy;
      const lo = Math.max(0, Math.min(p0, p1));
      const hi = Math.min(la, Math.max(p0, p1));
      const overlap = hi - lo;
      if (overlap <= 0 || (best && overlap <= best.length)) continue;
      // water between them, at the middle of the overlap
      const mt = (lo + hi) / 2;
      const mx = Math.floor(ra.from[0] + ux * mt - uy * (off / 2));
      const my = Math.floor(ra.from[1] + uy * mt + ux * (off / 2));
      if (mx < 0 || my < 0 || mx >= W || my >= H || !(depth[my * W + mx] >= wet)) continue;
      best = { length: Math.round(overlap * 100) / 100, width: Math.round(off * 100) / 100, a: ra, b: rb };
    }
  }
  return best;
}
