// The wall with one gate's southern brooks (docs/PREMISES.md §5.1, "The brooks find their way"; planning's ruling
// on the brooks): each brook takes the cheapest way from its tarn down to the lake over ground with its own relief (noise
// the seed draws, shared by every brook), never back up the valley's fall, clear of what is laid; so
// the land decides where it turns and how far it runs between turns. And the measure of its legs (`brookLegs`): a
// brook turning every few tiles at one angle, left and right by turns, is a ruler with a rhythm.
// Portable maths only: `../math/portable`.

import { smoothstep } from "../math/clamp";
import { fbm } from "../math/noise";
import { atan2, cos, hypot, sin } from "../math/portable";
import { waterReaches } from "../validate/ruledLand";
import { pathDist, pathLength, pointAt, segDist } from "./geom";
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
 *  its last way meets the water (`wet`, under 0 in it) square enough, or as `enters` says where given. Its places, head
 *  first, or null. */
export function brookWay(ground: BrookGround, places: readonly Point[], head: Point, open: (p: Point) => boolean, into: (p: Point) => boolean, toLake: (p: Point) => number, wet: (p: Point) => number = toLake, enters?: (from: Point, to: Point) => boolean): Point[] | null {
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
          if (lakeward[q] && (enters ? !enters(p, o) : L < 3 || wet([o[0] + ((p[0] - o[0]) * 2.5) / L, o[1] + ((p[1] - o[1]) * 2.5) / L]) <= 0.5)) continue;
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
  // (a leg at a time, the tiles of its own box: asked of the whole course, each tile was most of a layout's time)
  for (let k = 0; k + 1 < course.length; k++) {
    const [a, b] = [course[k], course[k + 1]];
    const bx0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - half) - ox);
    const bx1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + half) - ox);
    const by0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - half) - oy);
    const by1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + half) - oy);
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (!wet[y * W + x] && segDist(ox + x + 0.5, oy + y + 0.5, a[0], a[1], b[0], b[1]).d <= half) wet[y * W + x] = 1;
  }
  const c = waterReaches(wet, W, H).worst;
  return c ? { tiles: c.tiles, at: [ox + c.x + 0.5, oy + c.y + 0.5] } : { tiles: 0, at: [0, 0] };
}

/** A brook's meanders about its course (planning's rulings on the bends; the sine-generated curve of Langbein and
 *  Leopold). The course is softened into an axis (a running mean over `axis` tiles each way, twice, its ends kept), and
 *  the channel swings about it lobe by lobe, from one crossing of the axis to the next: its heading against the axis
 *  runs from +ω at a crossing through 0 at the lobe's apex to −ω′ at the next, as a cosine of the way along the lobe
 *  and `round` of its third harmonic (the curve turns through each crossing more than twice as fast, toward arcs
 *  joined end to end: as the plain cosine, its heading hardly changes about a crossing, and the leg between two bends
 *  lay 17 rows straight three wide wherever it ran 3° to 17° past the grid's rows or columns, a course at 12° to 32°
 *  or 58° to 78°: a straight reach by the reach rule, on most draws).
 *  A lobe runs half a wavelength along the axis. Each bend's wavelength is drawn from `wave` times the brook's width and
 *  its ω from `swing` radians, bend by bend (planning's verdict of 2026-11-14: one wavelength for every bend of every
 *  brook made them stripes with one rhythm): each about a mean that drifts along the course, by up to `drift` a bend
 *  (widths, radians), the bend within `spread` of it. A short bend swings less and a long one more (ω between
 *  `swing[0]` + `couple` × (wavelength − 10) and 1.3 + `couple` × (wavelength − 6), inside `swing`): a short bend that
 *  swings past a right angle touches the next, and a long one that hardly swings is a straight leg. Each lobe's length
 *  is unlike the last's by `alike` or more. It leaves its head along its course, `lead` tiles straight out of its tarn (bent beside it, its bed a
 *  level down touched the tarn's water and the two were parted), swings out over `head` tiles, and comes back to its course
 *  over `tail` tiles before its end. Where its bed drops a level it steps aside, `sidestep` widths over `stepRun`
 *  tiles, left and right by turns; and on a steep reach, where two drops lie closer than `steep[0]` of half a
 *  wavelength, it does not swing at all (it swings whole where they lie `steep[1]` apart). Where a lobe would leave its
 *  room it swings as far as the room lets it, the room's share softened over `soft` tiles. `pull` turns it back toward
 *  its axis, radians a tile off it, so lobes of unequal swing do not carry it away. Integrated a `step` at a time. */
export const BROOK_MEANDER = { wave: [6, 14], swing: [1.0, 1.8], drift: [1.6, 0.14], spread: [2.6, 0.26], couple: 0.125, pivot: 10, alike: 0.13, lead: 3, head: 4, tail: 6, axis: 6, sidestep: [0.8, 1.3], stepRun: 4, steep: [0.5, 0.8], pull: 0.02, step: 0.5, soft: 4, round: 0.2 } as const;

/** A trunk's bends vary (planning's look verdict of 2026-11-14 on round 2: the trunk's bends were all one size, a drawn
 *  wave; a real course has a straight reach, then a tight loop): on a channel `least` tiles of axis or longer, a
 *  straight reach `reach` of its mean wavelength long (drawn; as far as the room before the loop and its end allow),
 *  starting `at` of the way along its axis, its lobes swinging `swing` radians and `wave` widths long (its lower and
 *  upper thirds), short and long and low and high by turns (alike, they were a ruler's rhythm), their apexes unrounded (round and long, an apex lay as
 *  a straight even reach); and the loop right after it, `tight` of the ruling's least wavelength long and swinging the
 *  ruling's most. The ruling (`wave`, `swing`) holds for every other bend. */
export const TRUNK_VARY = { least: 60, reach: [2.5, 3.3], at: [0.06, 0.14], swing: [0.65, 0.9], wave: [6, 10.5], tight: 0.6 } as const;

/** A running mean of a path sampled a tile apart, `half` tiles each way (fewer toward each end, so the ends stay, and
 *  none over its first `lead` tiles: they stay as they are). */
function softened(path: readonly Point[], half: number, lead = 0): Point[] {
  const L = pathLength(path);
  const n = Math.max(2, Math.round(L));
  let pts: Point[] = [];
  for (let k = 0; k <= n; k++) pts.push(pointAt(path, (L * k) / n).p);
  for (let round = 0; round < 2; round++) {
    const out: Point[] = [];
    for (let k = 0; k <= n; k++) {
      const w = Math.min(half, Math.max(0, k - lead), n - k);
      let x = 0;
      let y = 0;
      for (let j = k - w; j <= k + w; j++) {
        x += pts[j][0];
        y += pts[j][1];
      }
      out.push([x / (2 * w + 1), y / (2 * w + 1)]);
    }
    pts = out;
  }
  return pts;
}

/** A brook's channel: its points, and how far along its axis each stands (tiles; a bed's levels are laid by it). */
export interface Meander {
  path: Point[];
  along: number[];
  /** The axis's length. */
  length: number;
  /** Where along the axis its bed drops a level, tiles. */
  drops: number[];
}

/** A brook's channel meandering about its `course` (`BROOK_MEANDER`): `width` its width, `draw` uniform [0, 1); its bed
 *  drops `falls.levels` levels, evenly along its axis past its first `falls.from` tiles and before its last `falls.to`;
 *  `room` whether a point of the
 *  channel may stand there (`u` its place along the axis, `toEnd` how far its end is); `straight` the tiles at its end
 *  it keeps to its course; `vary` a trunk's: its bends vary by `TRUNK_VARY`. */
export function meander(course: readonly Point[], width: number, draw: () => number, falls: { levels: number; from: number; to?: number }, room: (p: Point, u: number, toEnd: number) => boolean, straight = 2, vary = false): Meander {
  const M = BROOK_MEANDER;
  const axis = softened(course, M.axis, M.lead);
  const La = pathLength(axis);
  // (the mean of cos of a + b cos(π t) over a lobe: its advance along the axis, a tile of its length)
  // (`rd` its roundness: a reach's lobes are none, round lobes flat at their apex read as straight even reaches)
  const shape = (x: number, rd: number = M.round): number => (cos(x) + rd * cos(3 * x)) / (1 + rd);
  const advance = (a: number, b: number, rd: number = M.round): number => {
    let c = 0;
    for (let k = 0; k < 16; k++) c += cos(a + b * shape((Math.PI * (k + 0.5)) / 16, rd));
    return c / 16;
  };
  const within = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  // (each bend's wavelength and swing, about means that drift along the course)
  let waveMean = M.wave[0] + (M.wave[1] - M.wave[0]) * (0.25 + 0.5 * draw());
  let swingMean = M.swing[0] + (M.swing[1] - M.swing[0]) * (0.25 + 0.5 * draw());
  const bend = (): { half: number; swing: number } => {
    const wave = within(waveMean + (2 * draw() - 1) * M.spread[0], M.wave[0], M.wave[1]);
    const lo = Math.max(M.swing[0], M.swing[0] + M.couple * (wave - M.pivot));
    const hi = Math.min(M.swing[1], 1.3 + M.couple * (wave - 6));
    return { half: (width * wave) / 2, swing: within(swingMean + (2 * draw() - 1) * M.spread[1], lo, hi) };
  };
  const driftOn = () => {
    waveMean = within(waveMean + (2 * draw() - 1) * M.drift[0], M.wave[0] + 1.5, M.wave[1] - 1.5);
    swingMean = within(swingMean + (2 * draw() - 1) * M.drift[1], M.swing[0] + 0.15, M.swing[1] - 0.15);
  };
  // (a trunk's straight reach and its tight loop, `TRUNK_VARY`: where along the axis)
  const V = TRUNK_VARY;
  const varied = vary && La >= V.least;
  const reachFrom = varied ? La * (V.at[0] + (V.at[1] - V.at[0]) * draw()) : Infinity;
  // (the loop's room past the reach: itself, and a bend of the ruling's before the course's tail)
  const loopEnd = La - M.tail - width * M.wave[0] * (1 + V.tight);
  const reachTo = varied ? Math.min(loopEnd, reachFrom + width * waveMean * (V.reach[0] + (V.reach[1] - V.reach[0]) * draw())) : -Infinity;
  let looped = false;
  let reachLobes = 0;
  // ---- the free meander: its offset from the axis at each step along it
  const us: number[] = [0];
  const ms: number[] = [0];
  let side = draw() < 0.5 ? -1 : 1;
  let w0 = bend().swing;
  let last = 0;
  let u = 0;
  let y = 0;
  while (u < La) {
    // (a lobe unlike the one before in length: a row of equal lobes is a ruler with a rhythm)
    driftOn();
    let b1 = bend();
    // (a trunk's straight reach: its lobes swing little; its tight loop: the ruling's shortest bend, swinging its most)
    const kind = u >= reachFrom && u < reachTo ? "reach" : varied && !looped && u >= reachTo && u < loopEnd + width * M.wave[0] ? "loop" : "";
    if (kind === "reach") {
      // (long and short by turns; its swing low, low, high, high: a bend reads as the swings at its two ends together)
      const k = reachLobes++;
      const x = draw() / 3;
      b1 = { half: (width * (V.wave[0] + (V.wave[1] - V.wave[0]) * ((k & 1) === 1 ? 2 / 3 + x : x))) / 2, swing: V.swing[0] + (V.swing[1] - V.swing[0]) * ((k & 2) === 2 ? 0.5 + 0.5 * draw() : 0.5 * draw()) };
    }
    if (kind === "loop") {
      b1 = { half: (width * M.wave[0] * V.tight) / 2, swing: M.swing[1] };
      looped = true;
    }
    let w1 = b1.swing;
    const rd = kind === "reach" ? 0 : M.round;
    let L = b1.half / advance((w0 - w1) / 2, (w0 + w1) / 2, rd);
    for (let t = 0; t < 12 && !kind && last > 0 && Math.abs(L - last) <= M.alike * Math.max(L, last); t++) {
      b1 = bend();
      w1 = b1.swing;
      L = b1.half / advance((w0 - w1) / 2, (w0 + w1) / 2);
    }
    const [a, b] = [(w0 - w1) / 2, (w0 + w1) / 2];
    for (let sAt = M.step / 2; sAt < L && u < La; sAt += M.step) {
      const th = within(side * (a + b * shape((Math.PI * sAt) / L, rd)) - M.pull * y, -M.swing[1] - 0.05, M.swing[1] + 0.05);
      u += cos(th) * M.step;
      y += sin(th) * M.step;
      us.push(u);
      ms.push(y);
    }
    last = L;
    w0 = w1;
    side = -side;
  }
  // ---- the drops: where each lies along the axis, the side it steps to, and how steep the reach between two is
  const at = Array.from({ length: Math.max(0, falls.levels) }, (_, j) => falls.from + ((La - (falls.to ?? 0) - falls.from) * (j + 1)) / (falls.levels + 0.999));
  let stepSide = draw() < 0.5 ? -1 : 1;
  const steps = at.map(() => {
    const d = stepSide * width * (M.sidestep[0] + (M.sidestep[1] - M.sidestep[0]) * draw());
    stepSide = -stepSide;
    return d;
  });
  const half = (width * (M.wave[0] + M.wave[1])) / 4;
  // (its first reach from where it has swung out of its head: its lead and its swing out are no room to swing in, and
  // counted, a steep brook's first reach read as a gentle one and swung nearly whole before its first drop)
  const ends = [Math.min(at[0] ?? La, M.lead + M.head), ...at, La];
  const mids = ends.slice(1).map((e, k) => (e + ends[k]) / 2);
  const flats = ends.slice(1).map((e, k) => smoothstep((e - ends[k] - M.steep[0] * half) / ((M.steep[1] - M.steep[0]) * half)));
  // (between two reaches' middles, the share of its swing by the way from one to the other)
  const flat = (v: number): number => {
    if (v <= mids[0]) return flats[0];
    for (let k = 1; k < mids.length; k++) if (v <= mids[k]) return flats[k - 1] + ((flats[k] - flats[k - 1]) * (v - mids[k - 1])) / (mids[k] - mids[k - 1]);
    return flats[flats.length - 1];
  };
  const stepped = (v: number): number => {
    let o = 0;
    for (let k = 0; k < at.length; k++) o += steps[k] * smoothstep((v - at[k]) / M.stepRun + 0.5);
    return o;
  };
  // ---- its offset at each step: out of its head, back to its course at its end, and no further than its room
  const n = us.length;
  const want: number[] = [];
  const keep: number[] = [];
  const base: Point[] = [];
  const norm: Point[] = [];
  for (let j = 0; j < n; j++) {
    const v = Math.min(us[j], La);
    const { p, dir } = pointAt(axis, v);
    base.push(p);
    norm.push([-dir[1], dir[0]]);
    const o = smoothstep((La - straight - v) / M.tail) * (smoothstep((v - M.lead) / M.head) * flat(v) * ms[j] + stepped(v));
    want.push(o);
    let r = 0;
    const sg = o < 0 ? -1 : 1;
    const most = Math.abs(o);
    while (r + 0.5 <= most && room([p[0] + norm[j][0] * sg * (r + 0.5), p[1] + norm[j][1] * sg * (r + 0.5)], v, La - v)) r += 0.5;
    keep.push(most < 0.5 ? 1 : Math.min(1, (r + 0.49) / most));
  }
  // (the room's share softened along it: the least within `soft` tiles, then its mean over the same, so a lobe is drawn
  // smaller where it is squeezed, never cut flat)
  const win = Math.round(M.soft / M.step);
  const least = keep.map((_, j) => {
    let m = 1;
    for (let k = Math.max(0, j - win); k <= Math.min(n - 1, j + win); k++) m = Math.min(m, keep[k]);
    return m;
  });
  const path: Point[] = [];
  const along: number[] = [];
  for (let j = 0; j < n; j++) {
    let m = 0;
    let c = 0;
    for (let k = Math.max(0, j - win); k <= Math.min(n - 1, j + win); k++) {
      m += least[k];
      c++;
    }
    const o = want[j] * (m / c);
    path.push([base[j][0] + norm[j][0] * o, base[j][1] + norm[j][1] * o]);
    along.push(Math.min(us[j], La));
  }
  path.push(axis[axis.length - 1]);
  along.push(La);
  return { path, along, length: La, drops: at };
}

/** A channel again with a point every `every` tiles at most (four points at the least), its ends kept, each with its
 *  place along the axis. */
export function sampled(m: Meander, every: number): { path: Point[]; along: number[] } {
  const s: number[] = [0];
  for (let k = 1; k < m.path.length; k++) s.push(s[k - 1] + hypot(m.path[k][0] - m.path[k - 1][0], m.path[k][1] - m.path[k - 1][1]));
  const len = s[s.length - 1];
  const count = Math.max(1, Math.ceil(len / Math.min(every, len / 4) - 1e-9));
  const path: Point[] = [m.path[0]];
  const along: number[] = [m.along[0]];
  let k = 0;
  for (let i = 1; i < count; i++) {
    const want = (len * i) / count;
    while (k + 2 < s.length && s[k + 1] < want) k++;
    const f = s[k + 1] > s[k] ? Math.max(0, Math.min(1, (want - s[k]) / (s[k + 1] - s[k]))) : 0;
    path.push([m.path[k][0] + (m.path[k + 1][0] - m.path[k][0]) * f, m.path[k][1] + (m.path[k + 1][1] - m.path[k][1]) * f]);
    along.push(m.along[k] + (m.along[k + 1] - m.along[k]) * f);
  }
  path.push(m.path[m.path.length - 1]);
  along.push(m.along[m.along.length - 1]);
  return { path, along };
}

/** The nearest two places of a channel come, `apart` tiles or more from each other along it (a curve that touches
 *  itself comes within its own width). */
export function selfGap(path: readonly Point[], apart: number): number {
  const s: number[] = [0];
  for (let k = 1; k < path.length; k++) s.push(s[k - 1] + hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
  let best = Infinity;
  let j = 0;
  for (let i = 0; i < path.length; i++) {
    while (j < path.length && s[j] - s[i] < apart) j++;
    for (let k = j; k < path.length; k++) best = Math.min(best, hypot(path[k][0] - path[i][0], path[k][1] - path[i][1]));
  }
  return best;
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

/** Two brooks run side by side where one keeps within `within` tiles of the other and runs the way it does: their
 *  courses' headings, each read over `chord` tiles either way (a meander's swing aside), within `alike` radians. A
 *  tributary coming in to its confluence at `BROOK_JOIN.angle` is near its trunk, not beside it. */
export const BROOK_BESIDE = { within: 12, alike: 0.44, chord: 12 } as const;

/** The longest stretch of course `a`, in tiles along it, that runs beside course `b` (`BROOK_BESIDE`). */
export function besideRun(a: readonly Point[], b: readonly Point[]): number {
  const [La, Lb] = [pathLength(a), pathLength(b)];
  const way = (path: readonly Point[], L: number, s: number): Point => {
    const p0 = pointAt(path, Math.max(0, s - BROOK_BESIDE.chord)).p;
    const p1 = pointAt(path, Math.min(L, s + BROOK_BESIDE.chord)).p;
    const d = hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    return [(p1[0] - p0[0]) / d, (p1[1] - p0[1]) / d];
  };
  let run = 0;
  let best = 0;
  for (let s = 0; s <= La; s += 1) {
    const p = pointAt(a, s).p;
    const near = pathDist(p[0], p[1], b);
    let beside = near.d <= BROOK_BESIDE.within;
    if (beside) {
      const [wa, wb] = [way(a, La, s), way(b, Lb, near.s)];
      beside = wa[0] * wb[0] + wa[1] * wb[1] >= cos(BROOK_BESIDE.alike);
    }
    run = beside ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
