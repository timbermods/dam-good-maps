// Rivers from the terrain's drainage (docs/m9-design.md §4.6): no river is drawn. Water enters
// where the ground lets it (edge inflows at the low points of the upstream edges, springs on high
// ground), follows the eroded field's drainage to a map edge, and cuts its channel below the ground
// round it (one level; a big river in a canyon cuts deeper and clears a floor beside its channel).
// Where its path crosses a closed hollow of the snapped terrain, the hollow fills: a lake, its level
// set by the rim where the water leaves (a lake too big for the map's water budget has its outlet
// cut down until it fits, and the cut is a gorge). Where the bed drops two levels or more between
// neighbouring points, the water falls. Tributaries end where they meet a river already cut:
// confluences. A river may split round an island, and fan into several mouths near its outlet.
//
// Design version 2 adds: hanging valleys (the main river cuts `hanging` levels deeper, so its
// tributaries fall where they join); knickpoints (a steep reach's drops gather into one fall at its
// head, the river below cut to its foot, as a retreating waterfall leaves a gorge); spring lakes (a
// closed hollow no river crosses may get a spring at its head, above its highest edge, D171); and
// valley lakes (a stretch of a river's valley deepened in its middle, so the lake takes the land's
// shape). Only ground is taken away; none is raised (D111).
//
// M9a adds: no ruler-straight rivers (Kyler, D209). The drainage's steepest-descent paths run along
// the grid (0°, 45°, 90°) wherever the land is an even slope, and a channel carved at one width
// along them has parallel, canal-like sides. So each river's course is smoothed and then wanders
// within its valley, as real rivers do: a meander drawn from noise along its length, as wide as the
// valley floor allows (never less than a small minimum, so it bends even in a narrow valley), and
// its channel's width varies along it. Ends keep their places (the mouth on the edge, the spring,
// the confluence), so sources and joins stay where the water begins and meets.
//
// Every channel is carved from its polyline as the build's river rasterizer measures it (the
// distance from the tile centre to the path), so the build puts its edge sources on the same mouth
// tiles (PLAN §7.6: a sealed mouth).
//
// Ported from the design version 2 prototype (investigation/generative/v2/hydro.ts).

import { featureId } from "../features/ids";
import type { BedStep, Edge, Point, RiverFeature } from "../features/schema";
import { density } from "../gen/calibrated";
import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import { stream, type Rng } from "../math/rng";
import { drainage } from "./drainage";
import type { Genome } from "./genome";
import { sinDet, TWO_PI } from "../math/detmath";
import { distanceFrom } from "../math/grid";
import { clamp, DIRS8 } from "./num";

export interface Lake {
  tiles: number[];
  /** The level the outlet channel leaves at: the lake stands just above it. */
  outletBed: number;
  river: string;
}

export interface Arm {
  kind: "split" | "mouth";
  river: string;
  path: Point[];
}

export interface Hydro {
  rivers: RiverFeature[];
  /** Channel tiles (1), kept lake tiles (2) and cleared floor (3). */
  water: Uint8Array;
  lakes: Lake[];
  falls: { x: number; y: number; drop: number; river: string }[];
  arms: Arm[];
  flowTotal: number;
}

export interface HydroOptions {
  /** Meanders and varying widths (M9a's no-straight-rivers rule); false gives the prototype's
   *  courses, for comparisons. */
  meander?: boolean;
  /** Tiles the rivers keep off (a regeneration's constraints, PLAN §7.0: the player's features,
   *  locked and keep-out regions): no head, course, channel or valley lake on them. */
  protect?: Uint8Array | null;
}

const MIN_WIDTH = 2.4;
const MAX_WIDTH = 8.4;

/** Width that keeps a flow about half a level deep in its channel, well inside banks one level
 *  high (D26). */
export function widthFor(flow: number): number {
  return Math.round(clamp(flow / 0.75, MIN_WIDTH, MAX_WIDTH) * 10) / 10;
}

function edgeOf(i: number, W: number, H: number): Edge | null {
  const x = i % W;
  const y = (i - x) / W;
  if (x === 0) return "west";
  if (x === W - 1) return "east";
  if (y === 0) return "south";
  if (y === H - 1) return "north";
  return null;
}

/** The edges on the outlet side of a flow direction (two for a diagonal). */
function downstreamEdges(dir: number): Edge[] {
  const [fx, fy] = DIRS8[dir];
  const out: Edge[] = [];
  if (fx > 0.1) out.push("east");
  if (fx < -0.1) out.push("west");
  if (fy > 0.1) out.push("north");
  if (fy < -0.1) out.push("south");
  return out;
}

const OPPOSITE: Record<Edge, Edge> = { east: "west", west: "east", north: "south", south: "north" };

/** Chaikin corner cutting, then samples about every `step` tiles, keeping both ends. */
function smoothPath(pts0: Point[], iters: number, step: number): Point[] {
  let pts = pts0;
  for (let it = 0; it < iters && pts.length > 2; it++) {
    const out: Point[] = [pts[0]];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  const res: Point[] = [pts[0]];
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0];
    const dy = pts[k][1] - pts[k - 1][1];
    acc += Math.sqrt(dx * dx + dy * dy);
    if (acc >= step || k === pts.length - 1) {
      res.push(pts[k]);
      acc = 0;
    }
  }
  return res.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

interface Stamp {
  d: Float64Array;
  s: Float64Array;
  /** Tiles the stamp reached. */
  tiles: number[];
}

/** Exact distance from each tile near a polyline to it, and the arc position of the nearest point
 *  (as the build's pathField measures it, but only within `reach` tiles). */
function stamp(path: Point[], W: number, H: number, reach: number): Stamp {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const s = new Float64Array(N);
  const seen = new Uint8Array(N);
  const tiles: number[] = [];
  let cum = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const vx = path[k + 1][0] - ax;
    const vy = path[k + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    const len = Math.sqrt(l2);
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + vx) - reach));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, ax + vx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + vy) - reach));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ay + vy) + reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + t * vx - x;
        const py = ay + t * vy - y;
        const dd = Math.sqrt(px * px + py * py);
        const i = y * W + x;
        if (!seen[i]) {
          seen[i] = 1;
          tiles.push(i);
        }
        if (dd < d[i]) {
          d[i] = dd;
          s[i] = cum + t * len;
        }
      }
    cum += len;
  }
  return { d, s, tiles };
}

function arcLength(p: Point[]): number {
  let l = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    l += Math.sqrt(dx * dx + dy * dy);
  }
  return l;
}

function pointAt(p: Point[], s: number): { p: Point; n: Point } {
  let acc = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    const l = Math.sqrt(dx * dx + dy * dy);
    if (acc + l >= s && l > 0) {
      const t = (s - acc) / l;
      return { p: [p[k][0] + t * dx, p[k][1] + t * dy], n: [-dy / l, dx / l] };
    }
    acc += l;
  }
  const a = p[p.length - 2];
  const b = p[p.length - 1];
  const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
  return { p: b, n: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] };
}

/** A path resampled every `step` tiles of arc, keeping both ends. */
function resample(p: Point[], step: number): Point[] {
  const L = arcLength(p);
  const n = Math.max(1, Math.round(L / step));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) out.push(pointAt(p, (k * L) / n).p);
  return out;
}

// --------------------------------------------------------------------------------- meanders (M9a)

/** How a river's course wanders: its amplitude in tiles (the most its course moves off the valley's
 *  line), its wavelength, and how much its channel's width varies. */
export interface Wander {
  amp: number;
  minAmp: number;
  cell: number;
  widthVar: number;
}

/** A river's wander from the genome: rivers wander more where the genome's water wanders more (the
 *  snaking river's nudge raises it), and every river meanders: `amp` is the swing off the valley's
 *  line in tiles, `minAmp` the least it keeps where the valley is narrow (it cuts its bends into the
 *  valley's sides there), `cell` the meander's wavelength in tiles (about ten times a channel's
 *  width, shorter where the water wanders more). */
export function wanderOf(g: Pick<Genome, "wander" | "wanderCell">, width: number): Wander {
  const amp = clamp(1.4 + 1.1 * g.wander, 2.2, 6) + 0.2 * width;
  return { amp, minAmp: 0.7 * amp, cell: clamp(4 + 1.2 * g.wanderCell + 2.6 * width, 16, 40), widthVar: 0.32 };
}

/**
 * The course moved off the valley's line: bends that swing from side to side along the course, a
 * wavelength and a swing that noise varies as it goes (quasi-periodic, as real meanders are), as
 * wide as the valley floor lets them swing (the ground no more than a level over the valley's
 * bottom) and never less than `minAmp` tiles, tapered to nothing at both ends so the mouth, the
 * spring and the confluence stay put. Points stay two tiles inside the map, apart from the ends
 * that lie beyond it. Exact arithmetic: the deterministic sine.
 */
function meanderPath(path: Point[], h: Uint8Array, W: number, H: number, wv: Wander, seed: number): Point[] {
  const pts = resample(path, 1);
  const n = pts.length;
  if (n < 8) return path;
  const inside = (x: number, y: number) => x >= 2 && y >= 2 && x <= W - 3 && y <= H - 3;
  const levelAt = (x: number, y: number) => h[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 3)];
    const b = pts[Math.min(n - 1, k + 3)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    nx[k] = -dy / l;
    ny[k] = dx / l;
  }
  const off = new Float64Array(n);
  const R = Math.ceil(wv.amp) + 2;
  // the phase grows by 2π over a wavelength that noise stretches and squeezes; it starts at a
  // drawn phase, so rivers of one map do not bend in step
  let phase = TWO_PI * fbm(seed, 0.5, 7.5, 3, 1);
  for (let k = 0; k < n; k++) {
    const lambda = wv.cell * (1 + 0.35 * fbm(seed + 1, k + 0.5, 0.5, 2 * wv.cell, 2));
    phase += TWO_PI / lambda;
    const swing = wv.amp * (0.75 + 0.35 * fbm(seed + 2, k + 0.5, 0.5, 1.5 * wv.cell, 2));
    let target = swing * sinDet(phase);
    const [px, py] = pts[k];
    if (!inside(px, py)) continue;
    let bottom = levelAt(px, py);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) bottom = Math.min(bottom, levelAt(px + ox, py + oy));
    const room = (sgn: number) => {
      let r = 0;
      for (let t = 1; t <= R; t++) {
        const x = px + sgn * nx[k] * t;
        const y = py + sgn * ny[k] * t;
        if (!inside(x, y) || levelAt(x, y) > bottom + 1) break;
        r = t;
      }
      return r;
    };
    target = clamp(target, -Math.max(wv.minAmp, room(-1)), Math.max(wv.minAmp, room(1)));
    for (let guard = 0; guard < 8 && !inside(px + nx[k] * target, py + ny[k] * target); guard++) target *= 0.5;
    off[k] = target;
  }
  // smooth the offsets (a moving average over 5 points) and taper them at both ends
  const sm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) {
      s += off[j];
      c++;
    }
    sm[k] = s / c;
  }
  const taper = Math.min(7, Math.floor(n / 4));
  const out: Point[] = [];
  for (let k = 0; k < n; k++) {
    const e = Math.min(k, n - 1 - k);
    const t = e >= taper ? 1 : e / taper;
    const w = t * t * (3 - 2 * t);
    out.push([pts[k][0] + nx[k] * sm[k] * w, pts[k][1] + ny[k] * sm[k] * w]);
  }
  out[0] = path[0];
  out[n - 1] = path[path.length - 1];
  return smoothPath(out, 1, 1);
}

/** Whether a course comes within `reach` tiles of a marked tile. */
function touches(path: Point[], reach: number, mask: Uint8Array, W: number, H: number): boolean {
  const st = stamp(path, W, H, Math.ceil(reach));
  return st.tiles.some((i) => mask[i] && st.d[i] < reach);
}

/** A channel's half-width along its course: its own, varied by noise along its length (so its
 *  banks are never parallel for long), and exactly its own near both ends (the build finds its
 *  mouth and spring tiles with its plain width). */
function halfWidthAt(width: number, wv: Wander | null, seed: number, s: number, L: number): number {
  const half = width / 2;
  if (!wv) return half;
  const e = Math.min(s, L - s);
  const t = e >= 6 ? 1 : e <= 2 ? 0 : (e - 2) / 4;
  return half * (1 + wv.widthVar * t * fbm(seed, s, 3.5, 7, 2));
}

interface Head {
  cell: number;
  kind: "edge" | "spring";
  edge?: Edge;
  flow: number;
}

export function planHydro(E: Float64Array, h: Uint8Array, g: Genome, seed: number, W: number, H: number, attempt: number, opts: HydroOptions = {}): Hydro {
  const N = W * H;
  const natural = opts.meander !== false;
  const rng = stream(seed, "hydro", attempt);
  const down = downstreamEdges(g.flowDir);
  const up: Edge[] = g.tiltKind === "radial" ? (["west", "east", "south", "north"] as Edge[]).filter((e) => !down.includes(e)) : down.map((e) => OPPOSITE[e]);
  const onUp = (i: number) => {
    const e = edgeOf(i, W, H);
    return !!e && up.includes(e);
  };
  // the water's way on the eroded field, a little noise so it wanders where the ground is flat;
  // the upstream edges do not drain (water comes in there)
  const rs = hash32(seed, "route", attempt);
  const Er = new Float64Array(N);
  const wander = g.wander;
  const wanderCell = g.wanderCell;
  const protect = opts.protect ?? null;
  // a course keeps a channel's width and a little more off the protected tiles
  const nearProtect = protect ? distanceFrom(protect, W, H) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Er[y * W + x] = E[y * W + x] + wander * fbm(rs, x, y, wanderCell, 2) + (protect?.[y * W + x] ? 1000 : 0);
  const dr = drainage(Er, W, H, { outlet: (i) => !onUp(i), epsilon: 1e-6 });
  const downLen = new Float64Array(N);
  for (let q = 0; q < dr.order.length; q++) {
    const i = dr.order[q];
    const r = dr.rcv[i];
    downLen[i] = r < 0 ? 0 : downLen[r] + 1;
  }
  const flowTotal = Math.round(density("water_strength_per_10k", N) * (N / 1e4) * g.hydro.flowMul * 100) / 100;
  const heads: Head[] = [];
  const side = Math.min(W, H);
  const borderDist = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return Math.min(x, y, W - 1 - x, H - 1 - y);
  };
  // ---- paths: each head down its receivers, until an edge or a river already traced; a head
  // whose path hugs the map edge (its water would drain there) or is too short is passed over
  const owner = new Int32Array(N).fill(-1);
  const traced: { k: number; head: Head; cells: number[]; joins: number }[] = [];
  const drainDist = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    let d = Infinity;
    if (!up.includes("west")) d = Math.min(d, x);
    if (!up.includes("east")) d = Math.min(d, W - 1 - x);
    if (!up.includes("south")) d = Math.min(d, y);
    if (!up.includes("north")) d = Math.min(d, H - 1 - y);
    return d;
  };
  const trace = (hd: Head, alongUp = false): boolean => {
    const k = heads.length;
    const cells: number[] = [];
    let c = hd.cell;
    let joins = -1;
    const guard = new Set<number>();
    while (c >= 0 && !guard.has(c)) {
      guard.add(c);
      if (owner[c] >= 0) {
        joins = owner[c];
        cells.push(c);
        break;
      }
      cells.push(c);
      c = dr.rcv[c];
    }
    if (cells.length < (alongUp ? 8 : 12)) return false;
    if (nearProtect && cells.some((i) => nearProtect[i] < 7)) return false;
    // (the Rivers setting's relaxed search: a shorter path, and one along an upstream edge, which
    // does not drain)
    for (let q = 10; q < cells.length - 10; q++) if ((alongUp ? drainDist(cells[q]) : borderDist(cells[q])) < 4) return false;
    heads.push(hd);
    for (const i of cells) if (owner[i] < 0) owner[i] = k;
    traced.push({ k, head: hd, cells, joins });
    return true;
  };
  // edge inflows: low points of the upstream edges with long paths inland. When the player set the
  // Rivers setting, that many rivers enter (PLAN §5.3): if the first search finds too few, shorter
  // paths and closer heads are taken (a stream of its own, so other maps are as they were)
  if (g.hydro.inflows > 0) {
    const search = (minLen: number, apart: number, r: Rng, n0: number, relaxed: boolean): number => {
      const cands: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        if (!onUp(i) || protect?.[i]) continue;
        const e = edgeOf(i, W, H)!;
        const x = i % W;
        const y = (i - x) / W;
        const along = e === "west" || e === "east" ? y : x;
        const span = e === "west" || e === "east" ? H : W;
        if (along < 12 || along > span - 13) continue;
        if (downLen[i] < minLen * side || (relaxed && owner[i] >= 0)) continue;
        cands.push([-E[i] + 0.012 * downLen[i] + 1.5 * r.float(), i]);
      }
      cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      let n = n0;
      for (const [, i] of cands) {
        if (n >= g.hydro.inflows) break;
        const x = i % W;
        const y = (i - x) / W;
        if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < apart * side)) continue;
        if (trace({ cell: i, kind: "edge", edge: edgeOf(i, W, H)!, flow: 0 }, relaxed)) n++;
      }
      return n;
    };
    let n = search(0.6, 0.3, rng, 0, false);
    if (g.hydro.exactInflows) {
      const more = stream(seed, "hydro-inflows", attempt);
      if (n < g.hydro.inflows) n = search(0.4, 0.22, more, n, true);
      if (n < g.hydro.inflows) n = search(0.25, 0.16, more, n, true);
    }
  }
  // springs: high inland ground with a long way down
  const wantSprings = g.hydro.springs + (heads.length === 0 ? 1 : 0);
  if (wantSprings > 0) {
    const cands: [number, number][] = [];
    for (let y = 12; y < H - 12; y++)
      for (let x = 12; x < W - 12; x++) {
        const i = y * W + x;
        if (downLen[i] < 0.35 * side || owner[i] >= 0 || protect?.[i]) continue;
        cands.push([E[i] + 0.01 * downLen[i] + 3 * rng.float(), i]);
      }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let n = 0;
    for (const [, i] of cands) {
      if (n >= wantSprings) break;
      const x = i % W;
      const y = (i - x) / W;
      if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 26)) continue;
      if (trace({ cell: i, kind: "spring", flow: 0 })) n++;
    }
  }
  // spring lakes: a big closed hollow no river crosses gets a spring at its head, just above its
  // highest edge, so the water begins above the lake it makes and runs down into it (D171: a
  // source starts a river, never inside a lake or a river)
  if (g.lakeSprings > 0) {
    const fl = drainage(h, W, H, { eight: false });
    const seen = new Uint8Array(N);
    const hollows: { low: number; size: number; head: number }[] = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || !(fl.filled[s0] - h[s0] >= 1)) continue;
      const q = [s0];
      seen[s0] = 1;
      let low = s0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        if (h[i] < h[low] || (h[i] === h[low] && i < low)) low = i;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (seen[j] || !(fl.filled[j] - h[j] >= 1)) continue;
          seen[j] = 1;
          q.push(j);
        }
      }
      if (q.length < (g.lakeSpringMin ?? 100) || q.some((i) => owner[i] >= 0)) continue;
      // the head: the hollow's highest edge tile, then up to three tiles further uphill
      let head = -1;
      for (const i of q) {
        const x = i % W;
        const y = (i - x) / W;
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (!(fl.filled[yy * W + xx] - h[yy * W + xx] >= 1)) edge = true;
        }
        if (edge && (head < 0 || h[i] > h[head])) head = i;
      }
      for (let step = 0; step < 3 && head >= 0; step++) {
        const x = head % W;
        const y = (head - x) / W;
        let upT = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (owner[j] >= 0 || h[j] <= h[head]) continue;
          if (upT < 0 || h[j] > h[upT]) upT = j;
        }
        if (upT < 0) break;
        head = upT;
      }
      if (head >= 0) hollows.push({ low, size: q.length, head });
    }
    hollows.sort((a, b) => b.size - a.size || a.low - b.low);
    for (const hl of hollows.slice(0, g.lakeSpringMax ?? 4)) {
      if (rng.float() >= g.lakeSprings) continue;
      const x = hl.head % W;
      const y = (hl.head - x) / W;
      if (x < 6 || y < 6 || x > W - 7 || y > H - 7) continue;
      trace({ cell: hl.head, kind: "spring", flow: 0 });
    }
  }
  // the map's flow goes to the heads that made it: inflows carry most, springs a share each
  const nIn = heads.filter((hd) => hd.kind === "edge").length;
  const nSp = heads.length - nIn;
  const springShare = nIn ? Math.min(0.35, 0.12 * nSp) : 1;
  for (const hd of heads) {
    hd.flow = hd.kind === "edge" ? (flowTotal * (1 - (nSp ? springShare : 0))) / nIn : (flowTotal * springShare) / nSp;
    hd.flow = Math.round(Math.max(0.5, hd.flow) * 100) / 100;
  }

  // ---- the courses: each traced path smoothed, then (M9a) wandering within its valley; a
  //      tributary's course ends on the course of the river it joins
  // the main river (the largest flow, the first head on a tie) is "river/main", as the editor and the
  // analysis name it; the rest by how they begin
  let mainK = 0;
  for (let k = 1; k < heads.length; k++) if (heads[k].flow > heads[mainK].flow) mainK = k;
  const roleOf = (k: number) => (natural && k === mainK ? "river/main" : heads[k].kind === "edge" ? `river/inflow/${k}` : `river/spring/${k}`);
  const courses: Point[][] = [];
  const wanders: (Wander | null)[] = [];
  for (const tr of traced) {
    const hd = tr.head;
    const cells = tr.cells;
    let path = smoothPath(cells.map((i) => [i % W, Math.floor(i / W)] as Point), 3, 1);
    const hx = hd.cell % W;
    const hy = Math.floor(hd.cell / W);
    if (hd.kind === "edge") {
      const e = hd.edge!;
      path = [[e === "west" ? -1 : e === "east" ? W : hx, e === "south" ? -1 : e === "north" ? H : hy], [hx, hy], ...path.slice(1)];
    }
    const last = cells[cells.length - 1];
    const exitEdge = tr.joins < 0 ? edgeOf(last, W, H) : null;
    if (exitEdge) {
      const lx = last % W;
      const ly = Math.floor(last / W);
      path.push([exitEdge === "west" ? -1 : exitEdge === "east" ? W : lx, exitEdge === "south" ? -1 : exitEdge === "north" ? H : ly]);
    }
    // River style Straight: the course drawn toward the line between its ends (a tributary's end
    // is set on the river it joins below)
    const pull = g.hydro.straighten ?? 0;
    if (pull > 0 && path.length > 2) {
      const [ax, ay] = path[0];
      const [bx, by] = path[path.length - 1];
      const L2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      if (L2 > 0)
        path = path.map(([px, py], k) => {
          if (k === 0 || k === path.length - 1) return [px, py] as Point;
          const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2));
          const lx = ax + t * (bx - ax);
          const ly = ay + t * (by - ay);
          return [Math.round((lx + (1 - pull) * (px - lx)) * 100) / 100, Math.round((ly + (1 - pull) * (py - ly)) * 100) / 100] as Point;
        });
    }
    const wv = natural ? wanderOf(g, widthFor(hd.flow)) : null;
    if (wv) {
      if (tr.joins >= 0) {
        // the joined river's course is final: end on its nearest point
        const onto = courses[tr.joins];
        const [ex, ey] = path[path.length - 1];
        let best = Infinity;
        let bp: Point = [ex, ey];
        for (const p of resample(onto, 0.5)) {
          const d = (p[0] - ex) * (p[0] - ex) + (p[1] - ey) * (p[1] - ey);
          if (d < best) {
            best = d;
            bp = p;
          }
        }
        path[path.length - 1] = [Math.round(bp[0] * 100) / 100, Math.round(bp[1] * 100) / 100];
      }
      const wandered = meanderPath(path, h, W, H, wv, hash32(seed, "meander", attempt, tr.k));
      // a course that would wander onto the player's tiles keeps to its valley's line there
      if (!protect || !touches(wandered, widthFor(hd.flow) / 2 + g.hydro.floor + 2, protect, W, H)) path = wandered;
    }
    courses.push(path);
    wanders.push(wv);
  }

  // ---- valley lakes (lakes take the land's shape): a stretch of a river's valley deepened in its
  //      middle, as ice or a slide-free trough leaves it. The lake that fills it follows the land's
  //      contours, long along the valley, with fingers up the side valleys whose floors lie below
  //      its level. Only ground is taken away; none is raised (D111).
  {
    const tr = stream(seed, "trough", attempt);
    let n = Math.floor(g.troughs + tr.float());
    const scale = side / 128;
    const byLength = traced.slice().sort((a, b) => b.cells.length - a.cells.length || a.k - b.k);
    for (const t of byLength) {
      if (n <= 0) break;
      const cells = t.cells;
      const len = Math.round((20 + 25 * tr.float()) * scale);
      if (cells.length < len + 16) continue;
      const a0 = Math.floor((cells.length - len - 8) * (0.15 + 0.6 * tr.float()));
      const a1 = a0 + len;
      if (cells.slice(a0, a1 + 1).some((c) => borderDist(c) < 8)) continue;
      const level = h[cells[a1]];
      if (level < 2) continue;
      const reach = (5 + 7 * tr.float()) * scale;
      // the stretch along the river's course (its wandering line, M9a), else along its cells
      let pts = cells.slice(a0, a1 + 1).map((c) => [c % W, Math.floor(c / W)] as [number, number]);
      if (natural) {
        const course = resample(courses[t.k], 1);
        const nearest = (c: number) => {
          const cx = c % W;
          const cy = Math.floor(c / W);
          let bk = 0;
          let bd = Infinity;
          course.forEach((p, k) => {
            const d = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
            if (d < bd) {
              bd = d;
              bk = k;
            }
          });
          return bk;
        };
        const k0 = nearest(cells[a0]);
        const k1 = nearest(cells[a1]);
        if (k1 > k0 + 4) pts = course.slice(k0, k1 + 1).map((p) => [p[0], p[1]] as [number, number]);
      }
      let x0 = W;
      let y0 = H;
      let x1 = 0;
      let y1 = 0;
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const R = Math.ceil(reach);
      for (let y = Math.max(1, Math.floor(y0) - R); y <= Math.min(H - 2, Math.ceil(y1) + R); y++)
        for (let x = Math.max(1, Math.floor(x0) - R); x <= Math.min(W - 2, Math.ceil(x1) + R); x++) {
          const i = y * W + x;
          if (h[i] > level + 1 || (owner[i] >= 0 && owner[i] !== t.k) || protect?.[i]) continue;
          // the nearest point of the stretch, and how far along it lies
          let best = Infinity;
          let at = 0;
          for (let k = 0; k < pts.length; k++) {
            const dx = pts[k][0] - x;
            const dy = pts[k][1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < best) {
              best = d2;
              at = k;
            }
          }
          const d = Math.sqrt(best);
          if (d > reach) continue;
          const u = at / (pts.length - 1);
          const depth = Math.round((1 + 2.5 * 4 * u * (1 - u)) * (1 - d / reach) + 0.4);
          const target = level - depth;
          if (depth > 0 && target >= 0 && h[i] > target) h[i] = target;
        }
      n--;
    }
  }

  // ---- lakes: the closed hollows of the snapped terrain
  const lv = drainage(h, W, H, { eight: false });
  const depth = new Float64Array(N);
  for (let i = 0; i < N; i++) depth[i] = lv.filled[i] - h[i];
  const water = new Uint8Array(N);
  const lakes: Lake[] = [];
  const lakeOf = new Int32Array(N).fill(-1);
  const budget = g.hydro.lakeBudget * N;
  const rivers: RiverFeature[] = [];
  const falls: Hydro["falls"] = [];
  const arms: Arm[] = [];
  const fs = hash32(seed, "floor", attempt);

  const flood = (from: number, below: number): number[] => {
    const seen = new Uint8Array(N);
    const q = [from];
    seen[from] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || h[j] >= below) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    return q;
  };
  const hollow = (seedCell: number): { tiles: number[]; sill: number } | null => {
    if (!(depth[seedCell] > 0)) return null;
    let sill = lv.filled[seedCell];
    let tiles = flood(seedCell, sill);
    // cut the outlet down until the lake fits the budget
    while (tiles.length > budget && sill > 1) {
      sill--;
      const lowest = tiles.reduce((m, i) => (h[i] < h[m] ? i : m), tiles[0]);
      if (h[lowest] >= sill) return null;
      tiles = flood(lowest, sill);
    }
    if (tiles.length < 6) return null;
    return { tiles, sill };
  };

  /** The bed along a path, sampled every tile of arc: never rising, `cut` levels below the lowest
   *  ground round it, and at a lake's outlet level where it leaves a lake. */
  const profileOf = (path: Point[], width: number, cut: number, withLakes: boolean, rid: string, half: (s: number, L: number) => number, startBed = Infinity, endBed = -Infinity) => {
    const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));
    const L = arcLength(path);
    const n = Math.max(2, Math.ceil(L));
    const prof = new Float64Array(n + 1);
    const lakeAt = new Uint8Array(n + 1);
    let run = startBed;
    let inLake = -1;
    for (let j = 0; j <= n; j++) {
      const {
        p: [px, py],
      } = pointAt(path, (j * L) / n);
      const ci = Math.round(py) * W + Math.round(px);
      const isIn = px >= 0 && py >= 0 && px <= W - 1 && py <= H - 1;
      const r = half((j * L) / n, L);
      let ring = Infinity;
      const R = r + 1.6;
      for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
        for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
          const i = y * W + x;
          if (water[i] === 1 || water[i] === 2 || st.d[i] < r) continue;
          const dx = x - px;
          const dy = y - py;
          if (dx * dx + dy * dy > R * R) continue;
          if (h[i] < ring) ring = h[i];
        }
      if (!Number.isFinite(ring)) ring = Number.isFinite(run) ? run + 1 : h[Math.max(0, Math.min(N - 1, ci))] + 1;
      if (withLakes && isIn && depth[ci] > 0 && lakeOf[ci] < 0 && inLake < 0) {
        const lk = hollow(ci);
        if (lk) {
          const id = lakes.length;
          for (const i of lk.tiles) {
            lakeOf[i] = id;
            water[i] = 2;
          }
          lakes.push({ tiles: lk.tiles, outletBed: lk.sill - 1, river: rid });
          inLake = id;
        }
      }
      if (inLake >= 0 && isIn && lakeOf[ci] === inLake) {
        prof[j] = Math.min(run, lakes[inLake].outletBed);
        lakeAt[j] = 1;
        continue;
      }
      if (inLake >= 0) {
        run = lakes[inLake].outletBed;
        inLake = -1;
      }
      run = Math.min(run, ring - cut);
      if (run < endBed) run = endBed;
      if (run < 0) run = 0;
      prof[j] = Math.round(run);
    }
    return { st, prof, L, n, lakeAt };
  };

  /** Cut a channel (and its floor) along a profile. */
  const carve = (st: Stamp, prof: Float64Array, L: number, n: number, half: (s: number, L: number) => number, floorHalf: number): void => {
    for (const i of st.tiles) {
      if (water[i] === 2 || protect?.[i]) continue;
      const d = st.d[i];
      const x = i % W;
      const y = (i - x) / W;
      const j = Math.min(n, Math.max(0, Math.round((st.s[i] / L) * n)));
      const b = prof[j];
      const r = half(st.s[i], L);
      if (d < r) {
        if (h[i] > b) h[i] = b;
        water[i] = 1;
      } else if (floorHalf > 0 && water[i] !== 1 && d < r + floorHalf * (natural ? 1 + 0.7 * fbm(fs, x, y, 8, 2) : 1 + 0.45 * fbm(fs, x, y, 11, 2))) {
        if (h[i] > b + 1) h[i] = b + 1;
        if (!water[i]) water[i] = 3;
      }
    }
  };

  // the main river cuts deeper than its tributaries: their valleys hang above it
  const hanging = Math.round(g.hanging);
  const exits = new Map<string, { path: Point[]; prof: Float64Array; L: number; n: number; width: number; half: (s: number, L: number) => number }>();
  for (const tr of traced) {
    const hd = tr.head;
    const role = roleOf(tr.k);
    const rid = featureId(seed, "river", role);
    const path = courses[tr.k];
    const hx = hd.cell % W;
    const hy = Math.floor(hd.cell / W);
    const last = tr.cells[tr.cells.length - 1];
    const exitEdge = tr.joins < 0 ? edgeOf(last, W, H) : null;
    const width = widthFor(hd.flow);
    const ws = hash32(seed, "width", attempt, tr.k);
    const wv = wanders[tr.k];
    const half = (s: number, L: number) => halfWidthAt(width, wv, ws, s, L);
    // canyons: the bigger rivers cut deeper and clear wider floors
    const big = hd.flow >= 1.2;
    const cut = 1 + (big ? Math.round(g.hydro.incise) : 0) + (tr.k === mainK ? hanging : 0);
    const floorHalf = big ? g.hydro.floor : g.hydro.floor * 0.3;
    const { st, prof, L, n, lakeAt } = profileOf(path, width, cut, true, rid, half);
    // knickpoints: a steep reach's drops gather at its head; the reach below is cut to its foot
    const win = Math.round(g.knick);
    if (win > 0)
      for (let j = 0; j < n; j++) {
        if (!(prof[j + 1] < prof[j]) || lakeAt[j] || lakeAt[j + 1]) continue;
        let foot = -1;
        for (let k = j + 1; k <= Math.min(n, j + win); k++) {
          if (lakeAt[k]) break;
          if (prof[k] < prof[k - 1] && prof[j] - prof[k] >= 3) foot = k;
        }
        if (foot < 0) continue;
        for (let k = j + 1; k < foot; k++) prof[k] = prof[foot];
        j = foot;
      }
    // Waterfalls off: every drop spread along the course, a level a tile at most (the river cuts a
    // steady grade into the land above a cliff instead of falling over it); lakes keep their levels
    if (g.falls === 0) for (let j = n; j >= 1; j--) if (!lakeAt[j] && !lakeAt[j - 1] && prof[j - 1] > prof[j] + 1) prof[j - 1] = prof[j] + 1;
    // pools: below a drop the water scours its bed a level deeper for a few tiles, where the reach
    // below is long enough to keep a lip (pools and riffles: standing water deep enough to pump)
    const bedOf = prof.slice();
    for (let j = 1; j <= n; j++) {
      if (!(prof[j - 1] - prof[j] >= 1) || prof[j] < 1) continue;
      let level = 0;
      for (let q = j; q <= n && prof[q] === prof[j]; q++) level++;
      if (level >= 8) for (let q = j; q < j + 3; q++) bedOf[q] = prof[j] - 1;
    }
    carve(st, bedOf, L, n, half, floorHalf);
    // the feature's bed profile only steps down: where the course dips through a lake and rises to
    // its outlet, it keeps the outlet's level through the lake (the feature describes the bed the
    // river runs on; the lake's floor below it is the lake's)
    const env = prof.slice();
    for (let j = n - 1; j >= 0; j--) if (env[j] < env[j + 1]) env[j] = env[j + 1];
    const steps: BedStep[] = [];
    for (let j = 1; j <= n; j++) {
      const drop = prof[j - 1] - prof[j];
      const stepDown = env[j - 1] - env[j];
      if (stepDown >= 1) steps.push({ at: Math.round(((j * L) / n) * 100) / 100, drop: stepDown });
      if (drop >= 2) {
        const {
          p: [px, py],
        } = pointAt(path, (j * L) / n);
        if (px >= 0 && py >= 0 && px < W && py < H) falls.push({ x: Math.round(px), y: Math.round(py), drop, river: rid });
      }
    }
    exits.set(rid, { path, prof, L, n, width, half });
    const entry = hd.kind === "edge" ? { edge: hd.edge! } : { spring: [hx, hy] as Point };
    const exit = tr.joins >= 0 ? { river: featureId(seed, "river", roleOf(tr.joins)) } : { edge: exitEdge ?? ("east" as Edge) };
    rivers.push({
      id: rid,
      kind: "river",
      origin: "generated",
      role,
      locked: false,
      params: { path, width, bedDepth: 1, bedProfile: { start: env[0], steps }, flow: hd.flow, style: "meandering", entry, exit, badwater: false },
    });
  }

  // ---- a river splits round an island: a second arm leaves it and rejoins it downstream
  const main = rivers[0];
  if (main && rng.float() < g.hydro.split) {
    const m = exits.get(main.id)!;
    for (let tries = 0; tries < 6; tries++) {
      const len = 26 + 20 * rng.float();
      const s0 = m.L * (0.2 + 0.45 * rng.float());
      const s1 = s0 + len;
      if (s1 > m.L - 6) continue;
      const j0 = Math.round((s0 / m.L) * m.n);
      const j1 = Math.round((s1 / m.L) * m.n);
      // no lake on the stretch, and the arm's ends inside the map
      let ok = true;
      for (let j = j0; j <= j1 && ok; j++) {
        const { p } = pointAt(m.path, (j * m.L) / m.n);
        const ci = Math.round(p[1]) * W + Math.round(p[0]);
        if (p[0] < 4 || p[1] < 4 || p[0] > W - 5 || p[1] > H - 5 || lakeOf[ci] >= 0) ok = false;
      }
      if (!ok) continue;
      const sideSign = rng.float() < 0.5 ? 1 : -1;
      const off = sideSign * (m.width / 2 + 5 + 7 * rng.float());
      const pts: Point[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const { p, n: nn } = pointAt(m.path, s0 + t * len);
        const o = off * 4 * t * (1 - t) * (1 + 0.25 * (rng.float() - 0.5));
        pts.push([p[0] + nn[0] * o, p[1] + nn[1] * o]);
      }
      const armPath = smoothPath(pts, 2, 1);
      if (armPath.some(([x, y]) => x < 2 || y < 2 || x > W - 3 || y > H - 3)) continue;
      const aw = Math.max(MIN_WIDTH, Math.round(0.6 * m.width * 10) / 10);
      const awv = natural ? { ...wanderOf(g, aw), amp: 1.2, minAmp: 0.8 } : null;
      const armCourse = awv ? meanderPath(armPath, h, W, H, awv, hash32(seed, "arm", attempt, 0)) : armPath;
      const aws = hash32(seed, "arm-width", attempt, 0);
      const ahalf = (s: number, L: number) => halfWidthAt(aw, awv, aws, s, L);
      const pa = profileOf(armCourse, aw, 1, false, main.id, ahalf, m.prof[j0], m.prof[j1]);
      carve(pa.st, pa.prof, pa.L, pa.n, ahalf, 0);
      arms.push({ kind: "split", river: main.id, path: armCourse });
      break;
    }
  }

  // ---- a delta: near its mouth, the main river fans into two or three more mouths on its edge
  if (main && "edge" in main.params.exit && rng.float() < g.hydro.delta) {
    const m = exits.get(main.id)!;
    const e = main.params.exit.edge;
    const s0 = Math.max(m.L * 0.55, m.L - (26 + 18 * rng.float()));
    const { p: p0 } = pointAt(m.path, s0);
    const end = m.path[m.path.length - 2];
    // (River style Braided: two or three more mouths, PLAN §5.3's 2–4 channels)
    const k = 1 + (rng.float() < 0.5 ? 1 : 0) + (g.hydro.braided ? 1 : 0);
    const alongEdge = e === "west" || e === "east" ? 1 : 0;
    for (let a = 0; a < k; a++) {
      const sgn = a % 2 === 0 ? 1 : -1;
      const shift = sgn * (13 + 9 * rng.float()) * (1 + Math.floor(a / 2));
      const ex = alongEdge ? (e === "west" ? -1 : W) : clamp(end[0] + shift, 6, W - 7);
      const ey = alongEdge ? clamp(end[1] + shift, 6, H - 7) : e === "south" ? -1 : H;
      const mid: Point = [(p0[0] + ex) / 2 + (rng.float() - 0.5) * 6, (p0[1] + ey) / 2 + (rng.float() - 0.5) * 6];
      const pts: Point[] = [];
      for (let q = 0; q <= 16; q++) {
        const t = q / 16;
        // a quadratic curve from the fork through the middle point to the new mouth
        const x = (1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * mid[0] + t * t * ex;
        const y = (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * mid[1] + t * t * ey;
        pts.push([x, y]);
      }
      const armPath = smoothPath(pts, 1, 1);
      const aw = Math.max(MIN_WIDTH, Math.round(0.6 * m.width * 10) / 10);
      const awv = natural ? { ...wanderOf(g, aw), amp: 1.5, minAmp: 1 } : null;
      const armCourse = awv ? meanderPath(armPath, h, W, H, awv, hash32(seed, "arm", attempt, 1 + a)) : armPath;
      const aws = hash32(seed, "arm-width", attempt, 1 + a);
      const ahalf = (s: number, L: number) => halfWidthAt(aw, awv, aws, s, L);
      const j0 = Math.round((s0 / m.L) * m.n);
      const pa = profileOf(armCourse, aw, 1, false, main.id, ahalf, m.prof[j0]);
      carve(pa.st, pa.prof, pa.L, pa.n, ahalf, 0);
      arms.push({ kind: "mouth", river: main.id, path: armCourse });
    }
  }
  return { rivers, water, lakes, falls, arms, flowTotal };
}

export type { Rng };
