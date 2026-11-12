// The wall with one gate's southern brooks (docs/PREMISES.md §5.1, "The brooks find their way"; planning's ruling
// on the brooks): each brook takes the cheapest way from its tarn down to the lake over ground with its own relief (noise
// the seed draws, shared by every brook), never back up the valley's fall, clear of what is laid; so
// the land decides where it turns and how far it runs between turns. And the measure of its legs (`brookLegs`): a
// brook turning every few tiles at one angle, left and right by turns, is a ruler with a rhythm.
// Portable maths only: `../math/portable`.

import { fbm } from "../math/noise";
import { atan2, cos, hypot, sin } from "../math/portable";
import { ruledLand } from "../validate/ruledLand";
import { pathDist, pathLength, pointAt } from "./geom";
import type { Point } from "./types";

/** A brook's ground: noise of cells `cell` tiles across (`octaves`), a cell's cost 1 + `a` × (the noise + 1)², so its
 *  hollows wind and branch with no line in them; `fall` a tile for each tile a way comes nearer the lake by less than
 *  `descent` of its length (along the shore or away from it: a brook falls down the valley); the cost's cells (`grid`,
 *  tiles). */
export const BROOK_GROUND = { cell: 7, octaves: 2, a: 8, fall: 1.5, descent: 0.25, grid: 2 } as const;

/** A brook's bends (planning's ruling on the meanders): its course read a tile and a half at a time, each run of turns
 *  one way (turns under `still` radians aside) a bend, its length along the course and its swing (the heading it
 *  turns through). No two neighbouring bends within `alike` of each other in both length and swing, and no
 *  `equalRun` bends in a row within `alike` of each other in length: a sawtooth, or a sine laid on a line, is a ruler
 *  with a rhythm. Read on courses of `least` bends or more. */
export const BROOK_LEGS = { step: 1.5, still: 0.03, alike: 0.1, equalRun: 3, least: 3 } as const;

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
 *  nearer the lake (`toLake`) by less than `BROOK_GROUND.descent` of its length costs `BROOK_GROUND.fall` a tile more;
 *  its last way meets the water (`wet`, under 0 in it) square enough. Its places, head first, or null. */
export function brookWay(ground: BrookGround, places: readonly Point[], head: Point, open: (p: Point) => boolean, into: (p: Point) => boolean, toLake: (p: Point) => number, wet: (p: Point) => number = toLake): Point[] | null {
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
          if (lakeward[q] && (L < 3 || wet([o[0] + ((p[0] - o[0]) * 2.5) / L, o[1] + ((p[1] - o[1]) * 2.5) / L]) <= 0.5)) continue;
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

/** A brook's meanders about its course (planning's ruling on the meanders, the sine-generated curve of Langbein and
 *  Leopold): its heading swings about the course's own, θ(s) = ±ω sin(π s ÷ L) over each bend of length L, the bends
 *  by turns each side; L half a wavelength of `wave` × its width, ω `swing` radians, each bend's L and ω drawn
 *  `apart` either way; the swing falls to nothing within `drop` tiles of a level its bed drops (a steep reach runs
 *  straight) and within `ease` tiles of its ends; `pull` turns it back toward its course a radian a tile off it, so
 *  bends of unequal swing do not carry it away. Integrated a `step` at a time. */
export const BROOK_MEANDER = { wave: [10, 14], swing: 0.55, apart: 1 / 3, drop: 3, ease: 5, pull: 0.08, step: 0.5, tries: [1, 0.5, 0] } as const;

/** A brook's channel meandering about its `course` (`BROOK_MEANDER`): `width` its width, `draw` uniform [0, 1), `drops`
 *  the shares of the course where its bed drops a level, `room` whether a point of the channel may stand there (a bend
 *  that leaves it is drawn again with half its swing, then none). */
export function meander(course: readonly Point[], width: number, draw: () => number, drops: readonly number[], room: (p: Point, u: number) => boolean): Point[] {
  const M = BROOK_MEANDER;
  const Lc = pathLength(course);
  const wave = width * (M.wave[0] + (M.wave[1] - M.wave[0]) * draw());
  const apart = () => 1 + M.apart * (2 * draw() - 1);
  const ease = (u: number) => Math.max(0, Math.min(1, u / M.ease, (Lc - u) / M.ease));
  const flat = (u: number) => {
    let f = 1;
    for (const d of drops) f = Math.min(f, Math.max(0, Math.min(1, Math.abs(u - d * Lc) / M.drop)));
    return f;
  };
  const out: Point[] = [course[0]];
  let u = 0;
  let y = 0;
  let side = draw() < 0.5 ? -1 : 1;
  // (each bend unlike the one before in length or swing, and no three of one length: drawn again where it is)
  const alike = (x: number, y: number) => Math.abs(x - y) <= 0.15 * Math.max(x, y);
  const was: { L: number; w: number }[] = [];
  while (u < Lc) {
    let L = (wave / 2) * apart();
    let w = M.swing * apart();
    for (let t = 0; t < 8; t++) {
      const p = was[was.length - 1];
      const q = was[was.length - 2];
      if (!p || (!(alike(L, p.L) && alike(w, p.w)) && !(q && alike(L, p.L) && alike(p.L, q.L)))) break;
      L = (wave / 2) * apart();
      w = M.swing * apart();
    }
    was.push({ L, w });
    let bend: Point[] = [];
    let at = { u, y };
    for (const k of M.tries) {
      bend = [];
      let [bu, by] = [u, y];
      let fits = true;
      for (let s = 0; s < L && bu < Lc; s += M.step) {
        const th = side * k * w * sin((Math.PI * s) / L) * flat(bu) * ease(bu) - M.pull * by;
        bu += cos(th) * M.step;
        by += sin(th) * M.step;
        const { p, dir } = pointAt(course, Math.min(bu, Lc));
        const yy = by * ease(bu);
        const q: Point = [p[0] - dir[1] * yy, p[1] + dir[0] * yy];
        if (!room(q, bu)) {
          fits = false;
          break;
        }
        bend.push(q);
      }
      at = { u: bu, y: by };
      if (fits || k === 0) break;
    }
    out.push(...bend);
    ({ u, y } = at);
    side = -side;
  }
  out.push(course[course.length - 1]);
  return out;
}

/** A path's turns: the Douglas–Peucker simplification keeping each point `tol` tiles or more off the line between the
 *  points kept about it. */
export function turnsOf(path: readonly Point[], tol = 1.5): Point[] {
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

/** A brook's bends as `BROOK_LEGS` reads them: each bend's length and swing. */
export function brookBends(path: readonly Point[]): { length: number; swing: number }[] {
  const L = pathLength(path);
  const n = Math.max(2, Math.round(L / BROOK_LEGS.step));
  const pts: Point[] = [];
  for (let k = 0; k <= n; k++) pts.push(pointAt(path, (L * k) / n).p);
  const step = L / n;
  const bends: { length: number; swing: number }[] = [];
  let sign = 0;
  for (let k = 1; k + 1 < pts.length; k++) {
    const a = [pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]];
    const b = [pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]];
    const turn = atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    const sg = Math.abs(turn) < BROOK_LEGS.still ? sign : turn > 0 ? 1 : -1;
    if (sg !== sign || !bends.length) {
      if (sg !== 0) bends.push({ length: 0, swing: 0 });
      sign = sg;
    }
    if (bends.length) {
      bends[bends.length - 1].length += step;
      bends[bends.length - 1].swing += Math.abs(turn);
    }
  }
  return bends;
}

/** Why a brook's bends read as a ruler (`BROOK_LEGS`), or null. */
export function brookLegsWrong(path: readonly Point[]): string | null {
  const b = brookBends(path);
  if (b.length < BROOK_LEGS.least) return null;
  const alike = (x: number, y: number) => Math.abs(x - y) <= BROOK_LEGS.alike * Math.max(x, y);
  let run = 1;
  for (let k = 1; k < b.length; k++) {
    if (alike(b[k].length, b[k - 1].length) && alike(b[k].swing, b[k - 1].swing)) return `has two bends side by side alike in length and swing (${b[k - 1].length.toFixed(1)} and ${b[k].length.toFixed(1)} tiles)`;
    run = alike(b[k].length, b[k - 1].length) ? run + 1 : 1;
    if (run >= BROOK_LEGS.equalRun) return `has ${run} bends in a row of one length (fewer than ${BROOK_LEGS.equalRun})`;
  }
  return null;
}
