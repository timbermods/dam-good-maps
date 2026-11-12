// The wall with one gate's southern brooks (docs/PREMISES.md §5.1, "The brooks find their way"; planning's ruling of
// 2026-11-16): each brook takes the cheapest way from its tarn down to the lake over ground with its own relief (noise
// the seed draws, shared by every brook), never back up the valley's fall, clear of what is laid; so
// the land decides where it turns and how far it runs between turns. And the measure of its legs (`brookLegs`): a
// brook turning every few tiles at one angle, left and right by turns, is a ruler with a rhythm.
// Portable maths only: `../math/portable`.

import { fbm } from "../math/noise";
import { hypot, sqrt } from "../math/portable";
import { ruledLand } from "../validate/ruledLand";
import { pathDist, pointAt } from "./geom";
import type { Point } from "./types";

/** A brook's ground: noise of cells `cell` tiles across (`octaves`), a cell's cost 1 + `a` × (the noise + 1)², so its
 *  hollows wind and branch with no line in them; `fall` a tile for each tile a way comes nearer the lake by less than
 *  `descent` of its length (along the shore or away from it: a brook falls down the valley); the cost's cells (`grid`,
 *  tiles). */
export const BROOK_GROUND = { cell: 7, octaves: 2, a: 8, fall: 1.5, descent: 0.25, grid: 2 } as const;

/** A brook's legs (planning's ruling of 2026-11-16): its course simplified to the turns that stand `turn` tiles or more
 *  off the straight line; no `equalRun` legs in a row within `equal` of each other (a share of the longer); their
 *  spread over their mean `spread` or more; its turns not left and right by turns throughout (with `alternate` turns
 *  or more). Read on courses of `least` legs or more. */
export const BROOK_LEGS = { turn: 1.5, equalRun: 3, equal: 0.1, spread: 0.5, alternate: 4, least: 3 } as const;

/** The ground a brook's search reads: each cell's cost. */
export interface BrookGround {
  N: number;
  G: number;
  cost: Float64Array;
}

/** The ground over an `N`-tile square, its noise seeded by `seed`. */
export function brookGround(N: number, seed: number): BrookGround {
  const c = BROOK_GROUND.grid;
  const G = Math.ceil(N / c);
  const cost = new Float64Array(G * G);
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const v = fbm(seed, (x + 0.5) * c, (y + 0.5) * c, BROOK_GROUND.cell, BROOK_GROUND.octaves) + 1;
      cost[y * G + x] = 1 + BROOK_GROUND.a * v * v;
    }
  return { N, G, cost };
}

/** The ground's cost at a point. */
export function groundAt(ground: BrookGround, p: Point): number {
  const c = BROOK_GROUND.grid;
  const x = Math.min(ground.G - 1, Math.max(0, Math.floor(p[0] / c)));
  const y = Math.min(ground.G - 1, Math.max(0, Math.floor(p[1] / c)));
  return ground.cost[y * ground.G + x];
}

/** The places a brook's way passes through: one in each `spacing`-tile cell of the square, anywhere in it; its ways
 *  between places `reach` × `spacing` apart at most, each costing its length × the ground's cost along it. A way from
 *  place to place runs at any angle, so no leg lies along the grid's lines but by chance. */
export const BROOK_PLACES = { spacing: 3, reach: 1.6 } as const;

/** The places (`BROOK_PLACES`) over an `N`-tile square, drawn from `draw` (uniform [0, 1)). */
export function brookPlaces(N: number, draw: () => number): Point[] {
  const d = BROOK_PLACES.spacing;
  const n = Math.ceil(N / d);
  const out: Point[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push([(x + draw()) * d, (y + draw()) * d]);
  return out;
}

/** The cheapest way from `head` through the `places` `open` allows to one `into` takes (the lake), over `ground`; a way
 *  nearer the lake by less than `BROOK_GROUND.descent` of its length costs `BROOK_GROUND.fall` a tile more. Its places, head first, or null. */
export function brookWay(ground: BrookGround, places: readonly Point[], head: Point, open: (p: Point) => boolean, into: (p: Point) => boolean, toLake: (p: Point) => number): Point[] | null {
  const d = BROOK_PLACES.spacing;
  const most = BROOK_PLACES.reach * d;
  const n = Math.ceil(ground.N / d);
  const nodes: Point[] = [];
  const lakeward: boolean[] = [];
  const cellOf: number[][] = Array.from({ length: n * n }, () => []);
  const cell = (p: Point) => Math.min(n - 1, Math.max(0, Math.floor(p[1] / d))) * n + Math.min(n - 1, Math.max(0, Math.floor(p[0] / d)));
  const add = (p: Point, end: boolean) => {
    cellOf[cell(p)].push(nodes.length);
    nodes.push(p);
    lakeward.push(end);
  };
  add(head, false);
  for (const p of places) {
    if (into(p)) add(p, true);
    else if (open(p)) add(p, false);
  }
  const lake = nodes.map((p) => toLake(p));
  const best = new Float64Array(nodes.length).fill(Infinity);
  const from = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  // (a binary heap of places by `best`)
  const heap: number[] = [];
  const push = (k: number) => {
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) {
      const q = (i - 1) >> 1;
      if (best[heap[q]] <= best[heap[i]]) break;
      [heap[q], heap[i]] = [heap[i], heap[q]];
      i = q;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        if (a >= heap.length) break;
        const b = a + 1;
        const m = b < heap.length && best[heap[b]] < best[heap[a]] ? b : a;
        if (best[heap[i]] <= best[heap[m]]) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  best[0] = 0;
  push(0);
  const R = Math.ceil(most / d);
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (lakeward[k]) {
      const out: Point[] = [];
      for (let q = k; q >= 0; q = from[q]) out.push(nodes[q]);
      return out.reverse();
    }
    const p = nodes[k];
    const cx = Math.floor(p[0] / d);
    const cy = Math.floor(p[1] / d);
    for (let y = Math.max(0, cy - R); y <= Math.min(n - 1, cy + R); y++)
      for (let x = Math.max(0, cx - R); x <= Math.min(n - 1, cx + R); x++)
        for (const q of cellOf[y * n + x]) {
          if (done[q]) continue;
          const o = nodes[q];
          const L = hypot(o[0] - p[0], o[1] - p[1]);
          if (L > most || L < 1e-6) continue;
          const mid: Point = [(p[0] + o[0]) / 2, (p[1] + o[1]) / 2];
          // (a way into the lake meets its shore square enough that its last two and a half tiles alone lie in it (the plan reads a
          // channel's middle from two tiles off its ends): at a glancing
          // angle its last leg ran along inside the lake)
          // (out of its tarn: the head stands in it, so the way's first middle may too)
          if (!lakeward[q] && k !== 0 && !open(mid)) continue;
          if (lakeward[q] && (L < 3 || toLake([o[0] + ((p[0] - o[0]) * 2.5) / L, o[1] + ((p[1] - o[1]) * 2.5) / L]) <= 0.5)) continue;
          const w = best[k] + (L * (groundAt(ground, p) + 2 * groundAt(ground, mid) + groundAt(ground, o))) / 4 + BROOK_GROUND.fall * Math.max(0, lake[q] - lake[k] + BROOK_GROUND.descent * L);
          if (w < best[q]) {
            best[q] = w;
            from[q] = k;
            push(q);
          }
        }
  }
  return null;
}

/** The longest straight even reach (`terrain.ruled_land`'s channels, read as it reads the map) of a course laid `half`
 *  tiles each side of its line: its tiles (0 for none) and its middle. */
export function courseReach(course: readonly Point[], half = 2): { tiles: number; at: Point } {
  const pad = Math.ceil(half) + 3;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of course) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const ox = Math.floor(x0) - pad;
  const oy = Math.floor(y0) - pad;
  const W = Math.ceil(x1) + pad - ox + 1;
  const H = Math.ceil(y1) + pad - oy + 1;
  const wet = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pathDist(ox + x + 0.5, oy + y + 0.5, course).d <= half) wet[y * W + x] = 1;
  const c = ruledLand(new Uint8Array(W * H), wet, W, H).channel;
  return c ? { tiles: c.tiles, at: [ox + c.x + 0.5, oy + c.y + 0.5] } : { tiles: 0, at: [0, 0] };
}

/** A course's straight even reaches bent away (`BROOK_BEND`): while it holds one of `most` tiles or more, the course
 *  bends `off` tiles off its line at that reach's middle (or `step` tiles either way along), to the side whose ground is
 *  lower, where `open` allows, and is smoothed (`smooth`) again. */
export const BROOK_BEND = { most: 18, off: [5, 3.5, 2.5], step: 3, passes: 14 } as const;

export function bendReaches(ground: BrookGround, course: readonly Point[], open: (p: Point) => boolean, smooth: (p: Point[]) => Point[]): Point[] {
  let c = course.slice();
  for (let pass = 0; pass < BROOK_BEND.passes; pass++) {
    // (read laid three and four wide, as stage 1 lays a brook by turns)
    const r3 = courseReach(c, 1.5);
    const r4 = courseReach(c, 2);
    const r = r3.tiles > r4.tiles ? r3 : r4;
    if (r.tiles < BROOK_BEND.most) break;
    const { s } = pathDist(r.at[0], r.at[1], c);
    let best: Point | null = null;
    for (const off of BROOK_BEND.off) {
      let low = Infinity;
      for (const ds of [0, -BROOK_BEND.step, BROOK_BEND.step])
        for (const sd of [-1, 1]) {
          const { p, dir } = pointAt(c, s + ds);
          const q: Point = [p[0] - dir[1] * sd * off, p[1] + dir[0] * sd * off];
          const g = groundAt(ground, q) + 0.01 * Math.abs(ds);
          if (g < low && open(q)) {
            low = g;
            best = q;
          }
        }
      if (best) break;
    }
    if (!best) break;
    // (the bend set into the course's turns where it lies along them)
    const t = turnsOf(c, 1);
    let k = 0;
    let near = Infinity;
    for (let q = 0; q + 1 < t.length; q++) {
      const g = pathDist(best[0], best[1], [t[q], t[q + 1]]).d;
      if (g < near) {
        near = g;
        k = q;
      }
    }
    c = smooth([...t.slice(0, k + 1), best, ...t.slice(k + 1)]);
  }
  return c;
}

/** A path's turns: the Douglas–Peucker simplification keeping each point `tol` tiles or more off the line between the
 *  points kept about it. */
export function turnsOf(path: readonly Point[], tol: number = BROOK_LEGS.turn): Point[] {
  if (path.length <= 2) return path.slice();
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const [a, b] = [path[i], path[j]];
    const L = hypot(b[0] - a[0], b[1] - a[1]);
    let far = -1;
    let fd = tol;
    for (let k = i + 1; k < j; k++) {
      const p = path[k];
      const d = L > 1e-9 ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L : hypot(p[0] - a[0], p[1] - a[1]);
      if (d >= fd) {
        fd = d;
        far = k;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return path.filter((_, k) => keep[k]);
}

/** A brook's legs as `BROOK_LEGS` reads them: their lengths, the longest run of legs in a row within `equal` of each
 *  other, their spread over their mean, and the share of its turns that turn the other way from the one before. */
export function brookLegs(path: readonly Point[]): { legs: number[]; equalRun: number; spread: number; alternate: number; turns: number } {
  const t = turnsOf(path);
  const legs: number[] = [];
  for (let k = 0; k + 1 < t.length; k++) legs.push(hypot(t[k + 1][0] - t[k][0], t[k + 1][1] - t[k][1]));
  let equalRun = legs.length ? 1 : 0;
  let run = 1;
  for (let k = 1; k < legs.length; k++) {
    run = Math.abs(legs[k] - legs[k - 1]) <= BROOK_LEGS.equal * Math.max(legs[k], legs[k - 1]) ? run + 1 : 1;
    equalRun = Math.max(equalRun, run);
  }
  const mean = legs.reduce((s, l) => s + l, 0) / Math.max(1, legs.length);
  const sd = sqrt(legs.reduce((s, l) => s + (l - mean) * (l - mean), 0) / Math.max(1, legs.length));
  const signs: number[] = [];
  for (let k = 1; k + 1 < t.length; k++) {
    const cr = (t[k][0] - t[k - 1][0]) * (t[k + 1][1] - t[k][1]) - (t[k][1] - t[k - 1][1]) * (t[k + 1][0] - t[k][0]);
    signs.push(cr > 0 ? 1 : -1);
  }
  let flips = 0;
  for (let k = 1; k < signs.length; k++) if (signs[k] !== signs[k - 1]) flips++;
  return { legs, equalRun, spread: mean > 0 ? sd / mean : 0, alternate: signs.length > 1 ? flips / (signs.length - 1) : 0, turns: signs.length };
}

/** Why a brook's legs read as a ruler (`BROOK_LEGS`), or null. */
export function brookLegsWrong(path: readonly Point[]): string | null {
  const m = brookLegs(path);
  if (m.legs.length < BROOK_LEGS.least) return null;
  if (m.equalRun >= BROOK_LEGS.equalRun) return `has ${m.equalRun} legs in a row of one length (fewer than ${BROOK_LEGS.equalRun})`;
  if (m.spread < BROOK_LEGS.spread) return `has legs of nearly one length (their spread ${m.spread.toFixed(2)} of their mean, ${BROOK_LEGS.spread} or more)`;
  if (m.turns >= BROOK_LEGS.alternate && m.alternate === 1) return `turns left and right by turns at every one of its ${m.turns} turns`;
  return null;
}
