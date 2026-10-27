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
//   channel with parallel sides); its length is their overlap;
// - a wave (the badwater line, investigation/theme-critique): a planned one-tile channel (a
//   badwater ditch; `channels` names them, the generator from its features) whose course swings
//   from side to side of one straight line in equal bends at equal spacing, four or more in a row,
//   as a sine drawn on a ruler does and no gully does. The line is the stretch's own axis (least
//   squares); its bends lie within 4 tiles of it and each leaves the line's own band of 0.75 by 1.2
//   tiles or more; the deepest bend is at most 2.2 times the shallowest and the longest spacing at
//   most 1.7 times the shortest. Rivers' own meanders are quasi-periodic too, so the water alone is
//   not read for it: only the ditches' own lines, where it catches the drawn wave and nothing else.
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

/** Whether a map's channels run straighter than real terrain and the official maps ever do, or a
 *  bank swings in a regular wave (a drawn line, whatever its length). */
export function tooStraight(s: Straightness): boolean {
  return (s.longest?.length ?? 0) > STRAIGHT_LIMITS.run || (s.canal?.length ?? 0) > STRAIGHT_LIMITS.canal || s.wave !== null;
}

export interface Wave {
  /** Along the line, from the first bend's peak to the last's. */
  length: number;
  /** The bends in a row that are regular. */
  bends: number;
  from: [number, number];
  to: [number, number];
}

export interface WaveOptions {
  /** The band's half-width about the line the bank swings about (4 tiles). */
  band?: number;
  /** The line's own band, which a bend must leave (0.75 tiles). */
  core?: number;
  /** A bend reaches at least this far from the line (1.2 tiles). */
  minDepth?: number;
  /** Bends in a row for a wave (4). */
  minBends?: number;
  /** The deepest bend over the shallowest, at most (2.2). */
  depthRatio?: number;
  /** The longest spacing of bends over the shortest, at most (1.7). */
  spacingRatio?: number;
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
  /** The longest regular wave along any of the `channels` given (null: none, or none given). */
  wave: Wave | null;
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
  /** Planned one-tile channels (the badwater ditches), each as its tiles' centres in order, read for
   *  a regular wave. */
  channels?: readonly (readonly (readonly [number, number])[])[];
}

import * as portable from "../math/portable";
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
    const d = portable.sqrt(d2);
    if (rx === 0 && ry === 0) {
      rx = vx / d;
      ry = vy / d;
    }
    // the point's direction about the reference: cos c, sin s
    const c = (rx * vx + ry * vy) / d;
    const s = (rx * vy - ry * vx) / d;
    if (c <= 0) break;
    const sa = tau / d;
    const ca = portable.sqrt(1 - sa * sa);
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

/** The axis of a run of points (least squares): its middle and unit direction. */
function axisOf(pts: readonly Pt[], i: number, e: number): { mx: number; my: number; ux: number; uy: number } {
  let mx = 0;
  let my = 0;
  const n = e - i + 1;
  for (let k = i; k <= e; k++) {
    mx += pts[k][0];
    my += pts[k][1];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let k = i; k <= e; k++) {
    const dx = pts[k][0] - mx;
    const dy = pts[k][1] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  let ux: number;
  let uy: number;
  if (sxy === 0) {
    ux = sxx >= syy ? 1 : 0;
    uy = sxx >= syy ? 0 : 1;
  } else {
    const half = (sxx - syy) / 2;
    const l1 = (sxx + syy) / 2 + portable.sqrt(half * half + sxy * sxy);
    ux = sxy;
    uy = l1 - sxx;
    const l = portable.sqrt(ux * ux + uy * uy);
    ux /= l;
    uy /= l;
  }
  return { mx, my, ux, uy };
}

/** The longest regular wave along a polyline (a bank's corners, or a channel's tile centres):
 *  `minBends` or more bends in a row, side to side of one straight line (the stretch's own axis),
 *  equally deep and equally spaced within the ratios. Exact arithmetic (square roots only). */
export function regularWave(pts: readonly Pt[], o: WaveOptions = {}): Wave | null {
  const band = o.band ?? 4;
  const core = o.core ?? 0.75;
  const minDepth = o.minDepth ?? 1.2;
  const minBends = o.minBends ?? 4;
  const depthRatio = o.depthRatio ?? 2.2;
  const spacingRatio = o.spacingRatio ?? 1.7;
  let best: Wave | null = null;
  let lastEnd = -1;
  for (let i = 0; i + 1 < pts.length; i++) {
    // a stretch some line lies within `band` of: the line through its first point lies within twice
    // that of every point; then the stretch's own axis, cut where a point leaves the band
    let e = runEnd(pts, i, 2 * band, 240);
    if (e <= lastEnd || e - i < 2 * minBends) continue;
    lastEnd = e;
    let { mx, my, ux, uy } = axisOf(pts, i, e);
    for (let k = i; k <= e; k++) {
      const d = ux * (pts[k][1] - my) - uy * (pts[k][0] - mx);
      if (d > band || d < -band) {
        e = k - 1;
        ({ mx, my, ux, uy } = axisOf(pts, i, e));
        break;
      }
    }
    if (e - i < 2 * minBends) continue;
    const ax = mx;
    const ay = my;
    // the bends: each time the bank leaves the line's band on the other side, a new bend begins;
    // its depth is the furthest it gets, its place the middle of where it gets within half a tile
    // of that (a bend with a flat top is placed at the top's middle, not its first corner)
    const ts = new Float64Array(e - i + 1);
    const ds = new Float64Array(e - i + 1);
    for (let k = i; k <= e; k++) {
      const wx = pts[k][0] - ax;
      const wy = pts[k][1] - ay;
      ts[k - i] = wx * ux + wy * uy;
      ds[k - i] = ux * wy - uy * wx;
    }
    const spans: { sign: number; depth: number; k0: number; k1: number }[] = [];
    for (let k = 0; k < ts.length; k++) {
      const d = ds[k];
      const sign = d > core ? 1 : d < -core ? -1 : 0;
      if (sign === 0) continue;
      const last = spans[spans.length - 1];
      if (!last || last.sign !== sign) spans.push({ sign, depth: Math.abs(d), k0: k, k1: k });
      else {
        last.k1 = k;
        if (Math.abs(d) > last.depth) last.depth = Math.abs(d);
      }
    }
    const bends = spans.map((sp) => {
      let sum = 0;
      let c = 0;
      for (let k = sp.k0; k <= sp.k1; k++) {
        if (Math.abs(ds[k]) < sp.depth - 0.5) continue;
        sum += ts[k];
        c++;
      }
      return { sign: sp.sign, depth: sp.depth, t: sum / c };
    });
    // the longest run of bends, deep enough, regular within every window of `minBends`
    const regular = (a: number, b: number): boolean => {
      let dLo = Infinity;
      let dHi = 0;
      let sLo = Infinity;
      let sHi = 0;
      for (let k = a; k <= b; k++) {
        const bd = bends[k];
        if (bd.depth < minDepth) return false;
        dLo = Math.min(dLo, bd.depth);
        dHi = Math.max(dHi, bd.depth);
        if (k > a) {
          const sp = bd.t - bends[k - 1].t;
          sLo = Math.min(sLo, sp);
          sHi = Math.max(sHi, sp);
        }
      }
      return dHi <= depthRatio * dLo && sHi <= spacingRatio * sLo;
    };
    for (let a = 0; a + minBends <= bends.length; a++) {
      if (!regular(a, a + minBends - 1)) continue;
      let b = a + minBends - 1;
      while (b + 1 < bends.length && regular(b + 2 - minBends, b + 1)) b++;
      const length = bends[b].t - bends[a].t;
      if (!best || length > best.length) {
        const at = (t: number): [number, number] => [Math.round((ax + ux * t) * 100) / 100, Math.round((ay + uy * t) * 100) / 100];
        best = { length: Math.round(length * 100) / 100, bends: b - a + 1, from: at(bends[a].t), to: at(bends[b].t) };
      }
      a = b;
    }
  }
  return best;
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
  let wave: Wave | null = null;
  for (const pts of opts.channels ?? []) {
    const w = regularWave(pts as readonly Pt[]);
    if (w && (!wave || w.length > wave.length)) wave = w;
  }
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
  return { longest, canal: canalOf(runs, depth, W, H, wet, opts.maxCanalWidth ?? 14), runs, wave };
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
    const l = portable.sqrt(dx * dx + dy * dy) || 1;
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
