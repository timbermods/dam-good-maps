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

import * as portable from "../math/portable";
import { featureId } from "../features/ids";
import { mouthRowAt } from "../features/raster/terrain";
import type { BedStep, Edge, Point, RiverFeature } from "../features/schema";
import { density } from "../gen/calibrated";
import { hash32 } from "../math/hash";
import { fbm } from "../math/noise";
import { stream, type Rng } from "../math/rng";
import { drainage } from "./drainage";
import { BED_FLOOR, type Genome } from "./genome";
import { sinDet, TWO_PI } from "../math/detmath";
import { distanceFrom } from "../math/grid";
import { DIRS8 } from "./num";
import { clamp } from "../math/clamp";

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

/** The story's reach (analysis/story.ts `REACH`), as a share of the map's side, and the share of the
 *  map the planned courses aim to bring within it (D333 (3): the story asks for 35% of the dry land
 *  near clean water; the courses are lines, their water a little wider). */
const STORY_REACH = 0.14;
const REACH_WANT = 0.45;

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
export function smoothPath(pts0: Point[], iters: number, step: number): Point[] {
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
    acc += portable.sqrt(dx * dx + dy * dy);
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
    const len = portable.sqrt(l2);
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
        const dd = portable.sqrt(px * px + py * py);
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
    l += portable.sqrt(dx * dx + dy * dy);
  }
  return l;
}

function pointAt(p: Point[], s: number): { p: Point; n: Point } {
  let acc = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const dx = p[k + 1][0] - p[k][0];
    const dy = p[k + 1][1] - p[k][1];
    const l = portable.sqrt(dx * dx + dy * dy);
    if (acc + l >= s && l > 0) {
      const t = (s - acc) / l;
      return { p: [p[k][0] + t * dx, p[k][1] + t * dy], n: [-dy / l, dx / l] };
    }
    acc += l;
  }
  const a = p[p.length - 2];
  const b = p[p.length - 1];
  const l = portable.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) || 1;
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
 * that lie beyond it. Exact arithmetic: the deterministic sine. (The badwater ditches wind by it
 * too, land/hazards.ts: one way a channel bends on every map.)
 */
export function meanderPath(path: Point[], h: Uint8Array, W: number, H: number, wv: Wander, seed: number): Point[] {
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
    const l = portable.sqrt(dx * dx + dy * dy) || 1;
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
  // River Valley has one default trunk; an explicit Rivers count stays the player's, 0 too (its main
  // river then rises from a spring, PLAN §5.3)
  if (g.theme === "riverValley" && !g.hydro.exactInflows && !g.hydro.noInflows) g.hydro.inflows = 1;
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
  // (M9b: the spill of each tile's lowest way down on the land's levels, as the game's water moves)
  const drH = natural ? drainage(h, W, H, { outlet: (i) => !onUp(i), eight: false }) : null;
  // (and the level each tile's water spills out at by any edge: a hollow on a course fills to it)
  const spillAll = natural ? drainage(h, W, H, { eight: false }).filled : null;
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
  // whose path hugs the map edge (its water would drain there) or is too short is passed over.
  // M9b (D273 (1), a readable water story): the first river is the main one, and every later head
  // must join the water already traced, as a tributary long enough to read as one, so the map's
  // water is one system a player follows from where it starts to where it leaves. Only a Rivers
  // count the player set may enter as a river of its own when no inflow can join. A few heads, never
  // a tangle: at most `maxHeads`; River Valley keeps fewer tributaries with enough flow.
  const owner = new Int32Array(N).fill(-1);
  const traced: { k: number; head: Head; cells: number[]; joins: number }[] = [];
  const areaK = N / (128 * 128);
  // A few fed tributaries read better than many shallow fragments at large sizes.
  // Explicit Rivers counts remain player-owned; every other theme keeps its cap.
  const headCap = g.theme === "riverValley" && !g.hydro.exactInflows ? (side >= 256 ? 5 : 4) : Infinity;
  const maxHeads = natural ? Math.min(headCap, Math.floor(3.5 + 1.5 * portable.pow(areaK, 0.75))) : Infinity;
  const minTributary = Math.max(12, Math.round(0.18 * side));
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
  const trace = (hd: Head, alongUp = false, mustJoin = natural && heads.length > 0): boolean => {
    if (heads.length >= maxHeads) return false;
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
    if (mustJoin && (joins < 0 || cells.length < minTributary)) return false;
    // M9b: a head below the spill of its own way down (a low point of an edge behind a ridge, or a
    // spring below the rim of a hollow on its way) would have its channel cut up through the rise,
    // and the water beyond would stand higher than where it begins: it could never flow that way
    // (an inflow's water runs back out by the edge beside its mouth)
    if (drH && (dr.filled[hd.cell] - Er[hd.cell] > 0.5 || drH.filled[hd.cell] > h[hd.cell])) return false;
    // (a hollow on the way fills to its spill: above the head, its water would stand over the head)
    if (spillAll) for (const c of cells) if (spillAll[c] > h[hd.cell]) return false;
    if (nearProtect && cells.some((i) => nearProtect[i] < 7)) return false;
    // (the Rivers setting's relaxed search: a shorter path, and one along an upstream edge, which
    // does not drain)
    for (let q = 10; q < cells.length - 10; q++) if ((alongUp ? drainDist(cells[q]) : borderDist(cells[q])) < 4) return false;
    // (M9b: an inflow heads inland from its mouth, never along its edge first)
    if (natural && hd.kind === "edge") for (let q = 1; q <= Math.min(8, cells.length - 1); q++) if (borderDist(cells[q]) < q >> 1) return false;
    heads.push(hd);
    for (const i of cells) if (owner[i] < 0) owner[i] = k;
    traced.push({ k, head: hd, cells, joins });
    return true;
  };
  // edge inflows: low points of the upstream edges with long paths inland. When the player set the
  // Rivers setting, that many rivers enter (PLAN §5.3): if the first search finds too few, shorter
  // paths and closer heads are taken (a stream of its own, so other maps are as they were)
  if (g.hydro.inflows > 0) {
    const search = (minLen: number, apart: number, r: Rng, n0: number, relaxed: boolean, separate = false): number => {
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
        if (trace({ cell: i, kind: "edge", edge: edgeOf(i, W, H)!, flow: 0 }, relaxed, natural && heads.length > 0 && !separate)) n++;
      }
      return n;
    };
    let n = search(0.6, 0.3, rng, 0, false);
    // (D333 (3): a map whose genome asked for an inflow and found none on the first search looks
    // again, shorter paths and closer heads, for one: without it the water is a spring's alone and
    // reaches little of the land)
    if (natural && !g.hydro.exactInflows && n === 0) n = search(0.4, 0.22, stream(seed, "hydro-inflows", attempt), n, false);
    if (g.hydro.exactInflows) {
      const more = stream(seed, "hydro-inflows", attempt);
      if (n < g.hydro.inflows) n = search(0.4, 0.22, more, n, true);
      if (n < g.hydro.inflows) n = search(0.25, 0.16, more, n, true);
      // (the count the player set enters: as a river of its own when none can join)
      if (n < g.hydro.inflows && natural) n = search(0.25, 0.16, more, n, true, true);
    }
  }
  // which tiles' water reaches the rivers already traced, and how far it runs before it does (M9b:
  // tributaries only; recomputed as rivers are added)
  const reachesOwned = (): { reach: Uint8Array; len: Int32Array } => {
    const reach = new Uint8Array(N);
    const len = new Int32Array(N).fill(1 << 30);
    for (let q = 0; q < dr.order.length; q++) {
      const i = dr.order[q];
      const r = dr.rcv[i];
      if (owner[i] >= 0) {
        reach[i] = 1;
        len[i] = 0;
      } else if (r >= 0 && reach[r]) {
        reach[i] = 1;
        len[i] = len[r] + 1;
      }
    }
    return { reach, len };
  };
  // springs: high inland ground with a long way down
  const wantSprings = g.hydro.springs + (heads.length === 0 ? 1 : 0);
  if (wantSprings > 0) {
    const cands: [number, number][] = [];
    const joinable = natural && heads.length > 0 ? reachesOwned() : null;
    for (let y = 12; y < H - 12; y++)
      for (let x = 12; x < W - 12; x++) {
        const i = y * W + x;
        if (downLen[i] < 0.35 * side || owner[i] >= 0 || protect?.[i]) continue;
        if (joinable && (!joinable.reach[i] || joinable.len[i] < minTributary)) continue;
        cands.push([E[i] + 0.01 * downLen[i] + 3 * rng.float(), i]);
      }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    let n = 0;
    // (room is kept for a spring lake when the genome may make one)
    const room = natural && g.lakeSprings > 0.3 && heads.length > 0 ? maxHeads - 1 : maxHeads;
    for (const [, i] of cands) {
      if (n >= wantSprings || heads.length >= room) break;
      const x = i % W;
      const y = (i - x) / W;
      if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 26)) continue;
      if (trace({ cell: i, kind: "spring", flow: 0 })) n++;
    }
  }
  // D333 (3): the water reaches the land (a readable story, D294: water in one corner leaves most of
  // the land bare): while the planned courses leave more than REACH_WANT of the land farther from
  // them than the story's reach, a spring on the ground farthest from them starts a tributary that
  // joins them (not where the player asked for Generous buildable land, whose flats they cut, nor
  // set the Rivers count, whose water is the player's)
  if (natural && heads.length > 0 && g.hydro.reachSprings !== false && !g.hydro.exactInflows) {
    const R = STORY_REACH * side;
    let separateOne = false;
    for (let more = 0; more < 4 && heads.length < maxHeads; more++) {
      const wetP = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (owner[i] >= 0) wetP[i] = 1;
      const dist = distanceFrom(wetP, W, H);
      let near = 0;
      for (let i = 0; i < N; i++) if (dist[i] <= R) near++;
      if (near >= REACH_WANT * N) break;
      const joinable = reachesOwned();
      const far: [number, number][] = [];
      const apart: [number, number][] = [];
      for (let y = 12; y < H - 12; y++)
        for (let x = 12; x < W - 12; x++) {
          const i = y * W + x;
          if (dist[i] <= R || downLen[i] < 0.35 * side || owner[i] >= 0 || protect?.[i]) continue;
          if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 26)) continue;
          if (joinable.reach[i] && joinable.len[i] >= minTributary) far.push([dist[i] + 0.01 * downLen[i], i]);
          else apart.push([dist[i] + 0.01 * downLen[i], i]);
        }
      far.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      apart.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      let added = false;
      for (const [, i] of far.slice(0, 40)) if (trace({ cell: i, kind: "spring", flow: 0 })) {
        added = true;
        break;
      }
      // (where no spring there joins them, one river of its own: a story reads with one river that
      // never joins the main one, D273 (1))
      if (!added && !separateOne && g.theme !== "riverValley")
        for (const [, i] of apart.slice(0, 40)) if (trace({ cell: i, kind: "spring", flow: 0 }, false, false)) {
          added = true;
          separateOne = true;
          break;
        }
      if (!added) break;
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
      // (M9b: its water joins the rivers already traced, as a spring's does: a spring lake with a
      // way out of its own was a second water system, sometimes larger than the river's)
      trace({ cell: hl.head, kind: "spring", flow: 0 }, false, natural && heads.length > 0);
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
    /** Deepen the stretch a0–a1 of a traced river's valley, `reach` tiles either side. */
    const deepen = (t: (typeof traced)[number], a0: number, a1: number, reach: number, level: number): void => {
      const cells = t.cells;
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
          const d = portable.sqrt(best);
          if (d > reach) continue;
          const u = at / (pts.length - 1);
          const depth = Math.round((1 + 2.5 * 4 * u * (1 - u)) * (1 - d / reach) + 0.4);
          const target = Math.max(BED_FLOOR, level - depth);
          if (depth > 0 && h[i] > target) h[i] = target;
        }
    };
    // M9b ("lakes step down the valley", D274): a chain of valley lakes down the main river, each
    // stretch ending a level or more below the last, from its own random stream
    const chain = natural ? (g.hydro.chainLakes ?? 0) : 0;
    const main = traced.find((t) => t.k === mainK);
    if (chain > 0 && main) {
      const cr = stream(seed, "chain-lakes", attempt);
      const cells = main.cells;
      let a0 = Math.floor(cells.length * (0.1 + 0.08 * cr.float()));
      let prev = Infinity;
      let placed = 0;
      while (placed < chain && a0 < cells.length - 8) {
        const len = Math.round((14 + 8 * cr.float()) * scale);
        const a1 = a0 + len;
        if (a1 >= cells.length - 6) break;
        const level = h[cells[a1]];
        if (level >= 2 && level <= prev - 1 && !cells.slice(a0, a1 + 1).some((c) => borderDist(c) < 8)) {
          deepen(main, a0, a1, (5 + 4 * cr.float()) * scale, level);
          prev = level;
          placed++;
          a0 = a1 + Math.round((5 + 4 * cr.float()) * scale);
        } else a0 += 3;
      }
      n = Math.max(0, n - placed);
    }
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
      if (level < BED_FLOOR + 2) continue;
      const reach = (5 + 7 * tr.float()) * scale;
      deepen(t, a0, a1, reach, level);
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
  // (the arms' channels, D447: the tributaries they cross run down to them)
  const armTiles = new Uint8Array(N);
  const markArm = (st: Stamp, L: number, half: (s: number, L: number) => number) => {
    for (const i of st.tiles) if (st.d[i] < half(st.s[i], L)) armTiles[i] = 1;
  };
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
  const hollow = (seedCell: number, maxSill = Infinity): { tiles: number[]; sill: number } | null => {
    if (!(depth[seedCell] > 0)) return null;
    let sill = lv.filled[seedCell];
    let tiles = flood(seedCell, sill);
    // cut the outlet down until the lake fits the budget, and (M9b) until it stands below where its
    // river begins (`maxSill`)
    while ((tiles.length > budget || sill > maxSill) && sill > 1) {
      sill--;
      const lowest = tiles.reduce((m, i) => (h[i] < h[m] ? i : m), tiles[0]);
      if (h[lowest] >= sill) return null;
      tiles = flood(lowest, sill);
    }
    if (sill > maxSill || tiles.length < 6) return null;
    return { tiles, sill };
  };

  /** The bed along a path, sampled every tile of arc: never rising, `cut` levels below the lowest
   *  ground round it, and at a lake's outlet level where it leaves a lake. */
  const profileOf = (path: Point[], width: number, cut: number, withLakes: boolean, rid: string, half: (s: number, L: number) => number, startBed = Infinity, endBed = -Infinity, maxSill = Infinity, floorOthers = false) => {
    const st = stamp(path, W, H, Math.ceil(width / 2 + g.hydro.floor * 1.5 + 3 + (natural ? width * 0.15 : 0)));
    const L = arcLength(path);
    const n = Math.max(2, Math.ceil(L));
    const prof = new Float64Array(n + 1);
    const lakeAt = new Uint8Array(n + 1);
    let run = startBed;
    let inLake = -1;
    /** Whether a lake's water, standing at its sill, would spill out of the river's channel
     *  upstream of sample `j`: where the backwater reaches (the bed below the sill), the ground
     *  round the channel lower than the sill, outside the lake, drains away lower than it (to an
     *  edge, or a lower hollow). The river's water could not rise to fill the lake; it is no lake of
     *  this river's (M9b: its course stood dry through a hollow above its bed). */
    const spillsUpstream = (lk: { tiles: number[]; sill: number }, j: number): boolean => {
      if (!natural) return false;
      const inIt = new Set(lk.tiles);
      for (let q = j - 1; q >= 0 && prof[q] < lk.sill; q--) {
        const t = ringAt[q];
        if (t >= 0 && !inIt.has(t) && lakeOf[t] < 0 && h[t] < lk.sill && lv.filled[t] < lk.sill) return true;
      }
      return false;
    };
    // (M9b) the lowest ground round the channel at each sample upstream: a lake whose water would
    // stand over any of it (outside the lake) would spill out of the channel there
    const ringAt = new Int32Array(n + 1).fill(-1);
    for (let j = 0; j <= n; j++) {
      const {
        p: [px, py],
      } = pointAt(path, (j * L) / n);
      const ci = Math.round(py) * W + Math.round(px);
      const isIn = px >= 0 && py >= 0 && px <= W - 1 && py <= H - 1;
      const r = half((j * L) / n, L);
      let ring = Infinity;
      // (D333: the floor a bigger river cleared, where this course crosses it: the course runs a
      // level under it there, a channel to the river, never on the floor's own level, where its water
      // would spread as a thin sheet the game keeps only until the first drought)
      let floorRing = Infinity;
      // (D447: another river's channel or lake on its bank, lower than its bed: its water would fall
      // into it there and its course on stand dry; it runs down to that water's level instead, its
      // channel holding water beside it)
      let beside = Infinity;
      const R = r + 1.6;
      for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
        for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
          const i = y * W + x;
          if (natural && withLakes && (water[i] === 1 || water[i] === 2) && st.d[i] >= r) {
            const dx = x - px;
            const dy = y - py;
            if (dx * dx + dy * dy <= R * R) {
              if (water[i] === 1) beside = Math.min(beside, h[i]);
              else if (lakeOf[i] >= 0 && lakeOf[i] !== inLake && lakes[lakeOf[i]].river !== rid) beside = Math.min(beside, lakes[lakeOf[i]].outletBed);
            }
          }
          if (floorOthers && water[i] === 3 && st.d[i] >= r) {
            const dx = x - px;
            const dy = y - py;
            if (dx * dx + dy * dy <= R * R && h[i] < floorRing) floorRing = h[i];
            continue;
          }
          if (water[i] === 1 || water[i] === 2 || (floorOthers && water[i] === 3) || st.d[i] < r) continue;
          const dx = x - px;
          const dy = y - py;
          if (dx * dx + dy * dy > R * R) continue;
          if (h[i] < ring) {
            ring = h[i];
            ringAt[j] = i;
          }
        }
      if (!Number.isFinite(ring)) ring = Number.isFinite(run) ? run + 1 : h[Math.max(0, Math.min(N - 1, ci))] + 1;
      if (withLakes && isIn && depth[ci] > 0 && lakeOf[ci] < 0 && inLake < 0) {
        const lk = hollow(ci, maxSill);
        // (a hollow too big for the budget is cut down to its lowest part: the same lake again)
        const again = lk ? lk.tiles.find((i) => lakeOf[i] >= 0) : undefined;
        if (lk && again !== undefined) inLake = lakeOf[again];
        // (M9b: a hollow whose water would spill over the channel's banks upstream is no lake of
        // this river's: its water cannot rise to fill it; the channel runs on through it)
        else if (lk && spillsUpstream(lk, j)) {
          /* its channel runs on through it */
        } else if (lk) {
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
      run = Math.min(run, ring - cut, floorRing - 1, beside);
      if (run < endBed) run = endBed;
      // (never below the beds' floor, item 47: a river there runs shallower)
      if (run < BED_FLOOR) run = BED_FLOOR;
      prof[j] = Math.round(run);
    }
    return { st, prof, L, n, lakeAt };
  };

  /** Cut a channel (and its floor) along a profile. */
  // M9b: the banks beside an inflow's mouth. The game drains every edge tile but the mouth's own
  // sources (its plain width), so the outer two rows of the inflow's edge beyond that width keep
  // their ground: a channel or floor that bent along the edge there would let the water out
  // (D314: the mouth itself is a row of the rule's count across the flow, raster/terrain.ts
  // `mouthRowAt`; the edge rows beside it keep their ground)
  const mouthBank = new Uint8Array(N);
  const mouthRows = new Map<number, { edge: Edge; along: number[] }>();
  if (natural)
    for (const tr of traced) {
      const hd = tr.head;
      if (hd.kind !== "edge") continue;
      const e = hd.edge!;
      const row = mouthRowAt(e, courses[tr.k][0], hd.flow, featureId(seed, "river", roleOf(tr.k)), W, H);
      mouthRows.set(tr.k, { edge: e, along: row.along });
      const inRow = new Set(row.along);
      for (let t = 0; t < 2; t++)
        for (let a = 0; a < (e === "west" || e === "east" ? H : W); a++) {
          if (inRow.has(a)) continue;
          const x = e === "west" ? t : e === "east" ? W - 1 - t : a;
          const y = e === "south" ? t : e === "north" ? H - 1 - t : a;
          mouthBank[y * W + x] = 1;
        }
    }
  const carve = (st: Stamp, prof: Float64Array, L: number, n: number, half: (s: number, L: number) => number, floorHalf: number): void => {
    for (const i of st.tiles) {
      if (protect?.[i] || mouthBank[i]) continue;
      const d = st.d[i];
      const x = i % W;
      const y = (i - x) / W;
      const j = Math.min(n, Math.max(0, Math.round((st.s[i] / L) * n)));
      const b = prof[j];
      const r = half(st.s[i], L);
      // (a planned lake's tile on the course keeps the lake's floor where it is lower, but never
      // stands above the course's bed: where the lake settles smaller than planned, the river runs
      // on across its dry part in a channel, never spreading or standing over it; Codex's River
      // Valley prototype, River Valley 96² seed 5)
      if (water[i] === 2) {
        if (d < r && h[i] > b) h[i] = b;
        continue;
      }
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
  // (M9b) how high the water at each inflow's mouth may stand before it runs back out by the same
  // edge beside the mouth (the game drains every edge tile but the mouth's own); a lake on a river
  // stands no higher than that for any inflow whose water reaches it, its own and its tributaries'
  const edgeSpill = new Map<number, number>();
  if (natural)
    for (const t of traced) {
      const hd = t.head;
      if (hd.kind !== "edge") continue;
      const e = hd.edge!;
      const alongOf = (i: number) => (e === "west" || e === "east" ? Math.floor(i / W) : i % W);
      const a0 = alongOf(hd.cell);
      const reach = Math.ceil(widthFor(hd.flow) / 2) + 2;
      const back = drainage(h, W, H, { eight: false, outlet: (i) => edgeOf(i, W, H) === e && Math.abs(alongOf(i) - a0) > reach });
      edgeSpill.set(t.k, back.filled[hd.cell]);
    }
  const upSpill = (k: number, seen = new Set<number>()): number => {
    if (seen.has(k)) return Infinity;
    seen.add(k);
    let v = edgeSpill.get(k) ?? Infinity;
    for (const t of traced) if (t.joins === k) v = Math.min(v, upSpill(t.k, seen));
    return v;
  };
  // (D373 (1), D350 (d): a channel is as wide as the water it carries, its own and every river's
  // that has joined it by then: a channel cut for its own head's flow alone, below a confluence, runs
  // over its banks and spreads over the flat beside them, filling for days (Canyon 256² seed 22: six
  // rivers of 2.28 through channels three tiles wide). Each river's joins: where on its course a
  // tributary meets it, and all the water that tributary brings)
  const totalOf = (k: number, seen = new Set<number>()): number => {
    if (seen.has(k)) return 0;
    seen.add(k);
    let q = traced.find((t) => t.k === k)?.head.flow ?? 0;
    for (const t of traced) if (t.joins === k) q += totalOf(t.k, seen);
    return q;
  };
  const joinsOf = new Map<number, { s: number; q: number }[]>();
  if (natural)
    for (const t of traced) {
      if (t.joins < 0) continue;
      const onto = courses[t.joins];
      const end = t.cells[t.cells.length - 1];
      const ex = end % W;
      const ey = (end - ex) / W;
      // (the arc position on the river joined nearest the tributary's end)
      let best = Infinity;
      let at = 0;
      let acc = 0;
      for (let k = 0; k + 1 < onto.length; k++) {
        const [ax, ay] = onto[k];
        const [bx, by] = onto[k + 1];
        const vx = bx - ax;
        const vy = by - ay;
        const l2 = vx * vx + vy * vy;
        const l = portable.sqrt(l2);
        let u = l2 > 0 ? ((ex - ax) * vx + (ey - ay) * vy) / l2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = ax + u * vx - ex;
        const dy = ay + u * vy - ey;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          at = acc + u * l;
        }
        acc += l;
      }
      const list = joinsOf.get(t.joins) ?? [];
      list.push({ s: at, q: totalOf(t.k) });
      joinsOf.set(t.joins, list);
    }
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
    // (wider below each river that joins it, as wide as the water it then carries)
    const joined = (joinsOf.get(tr.k) ?? []).slice().sort((a, b) => a.s - b.s);
    const widthAt = (s: number): number => {
      let q = hd.flow;
      for (const j of joined) if (j.s <= s) q += j.q;
      return q === hd.flow ? width : widthFor(q);
    };
    const half = (s: number, L: number) => halfWidthAt(widthAt(s), wv, ws, s, L);
    // canyons: the bigger rivers cut deeper and clear wider floors
    const big = hd.flow >= 1.2;
    const cut = 1 + (big ? Math.round(g.hydro.incise) : 0) + (tr.k === mainK ? hanging : 0);
    const floorHalf = big ? g.hydro.floor : g.hydro.floor * 0.3;
    // (M9b: a lake on the course stands below where the river begins, the mouth's banks or the
    // spring: its water reaches back up the channel, and above that it would run out by the edge
    // beside the mouth, or drown the spring)
    // (M9b: a tributary measures its banks without the floor a bigger river cleared: its valley then
    // hangs above that floor and its water falls where it meets it, as design version 2's hanging
    // valleys have it)
    // (M9b: an inflow's lake, or a lake its water reaches, stands no higher than the water at its
    // mouth could before it ran back out by the same edge beside the mouth)
    const maxSill = natural ? Math.min(h[hd.cell], upSpill(tr.k)) : Infinity;
    const { st, prof, L, n, lakeAt } = profileOf(path, width, cut, true, rid, half, Infinity, -Infinity, maxSill, natural && tr.joins >= 0);
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
      if (!(prof[j - 1] - prof[j] >= 1) || prof[j] < BED_FLOOR + 1) continue;
      let level = 0;
      for (let q = j; q <= n && prof[q] === prof[j]; q++) level++;
      if (level >= 8) for (let q = j; q < j + 3; q++) bedOf[q] = prof[j] - 1;
    }
    carve(st, bedOf, L, n, half, floorHalf);
    // (M9b: an inflow's mouth, the rule's row (D314), stays level for its first three rows, its
    // bed there: the edge's banks beside it are kept, and its sources stand on one level)
    const mr = mouthRows.get(tr.k);
    if (natural && hd.kind === "edge" && mr) {
      const e = mr.edge;
      const block: number[] = [];
      for (let t = 0; t < 3; t++)
        for (const a of mr.along) {
          const x = e === "west" ? t : e === "east" ? W - 1 - t : a;
          const y = e === "south" ? t : e === "north" ? H - 1 - t : a;
          if (x < 0 || y < 0 || x >= W || y >= H || protect?.[y * W + x]) continue;
          block.push(y * W + x);
        }
      // (at its lowest tile: the bed only ever lowers)
      let lo = bedOf[0];
      for (const i of block) lo = Math.min(lo, h[i]);
      for (const i of block) {
        h[i] = lo;
        if (water[i] !== 2) water[i] = 1;
      }
    }
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

  // ---- M9b ("the river loops back and leaves an oxbow lake", D274): outside the main river's
  //      strongest bend, a crescent hollow where an older loop of the river ran, its floor a level
  //      below the river's bed, joined to the channel at its downstream end: the river fills it, and
  //      in a drought it keeps the water below that join. Only ground is taken away (D111).
  const mainRiverId = (): string => (rivers.find((r) => r.role === "river/main") ?? rivers[0]).id;
  const oxbow = (m: { path: Point[]; prof: Float64Array; L: number; n: number; width: number }, rid: string): boolean => {
    const pts = resample(m.path, 1);
    const n = pts.length;
    if (n < 40) return false;
    // the turning over twelve tiles at each point of the course (the cross product of the ways in
    // and out), strongest first, in its middle stretch, off the map's border and any lake
    const bends: { k: number; turn: number }[] = [];
    for (let k = Math.floor(0.15 * n); k < Math.floor(0.85 * n); k++) {
      const a = pts[k - 6];
      const b = pts[k];
      const c = pts[k + 6];
      if (!a || !c) continue;
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const vx = c[0] - b[0];
      const vy = c[1] - b[1];
      const lu = portable.sqrt(ux * ux + uy * uy) || 1;
      const lv = portable.sqrt(vx * vx + vy * vy) || 1;
      // (only where the bed stands a level or more above the map's bottom: the lake's floor lies a
      // level below the bed, and in a drought it keeps the water below its join)
      const jb = Math.min(m.n, Math.max(0, Math.round((k / (n - 1)) * m.n)));
      if (m.prof[jb] >= 1) bends.push({ k, turn: (ux * vy - uy * vx) / (lu * lv) });
    }
    bends.sort((p, q) => Math.abs(q.turn) - Math.abs(p.turn) || p.k - q.k);
    const halfW = m.width / 2;
    for (const bend of bends.slice(0, 12)) {
      if (Math.abs(bend.turn) < 0.2) return false;
      // the outside of the bend: away from the side it turns to
      const out = bend.turn > 0 ? -1 : 1;
      const span = 9 + Math.round(3 * Math.abs(bend.turn));
      const j = Math.min(m.n, Math.max(0, Math.round((bend.k / (n - 1)) * m.n)));
      const bed = m.prof[j];
      if (bed < BED_FLOOR + 1) continue;
      const floor = bed - 1;
      const crescent: number[] = [];
      let ok = true;
      const mark = new Uint8Array(N);
      for (let t = -span; t <= span && ok; t++) {
        const k = bend.k + t;
        if (k < 3 || k >= n - 3) {
          ok = false;
          break;
        }
        const [px, py] = pts[k];
        const dx = pts[k + 3][0] - pts[k - 3][0];
        const dy = pts[k + 3][1] - pts[k - 3][1];
        const l = portable.sqrt(dx * dx + dy * dy) || 1;
        const nx = (-dy / l) * out;
        const ny = (dx / l) * out;
        // its middle stands off the channel by its bank and a little more, its ends closer
        const u = t / span;
        const off = halfW * 1.35 + 3 + 3.5 * (1 - u * u);
        const cx = px + nx * off;
        const cy = py + ny * off;
        for (let yy = Math.floor(cy - 2); yy <= Math.ceil(cy + 2); yy++)
          for (let xx = Math.floor(cx - 2); xx <= Math.ceil(cx + 2); xx++) {
            if (xx < 3 || yy < 3 || xx > W - 4 || yy > H - 4) {
              ok = false;
              continue;
            }
            if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) > 1.7 * 1.7) continue;
            const i = yy * W + xx;
            if (mark[i]) continue;
            if (water[i] === 1 || water[i] === 2 || protect?.[i] || h[i] <= floor) {
              if (water[i] === 1 || water[i] === 2 || protect?.[i]) ok = false;
              continue;
            }
            // (D447: a bank stays between the hollow and any water but at its join: where it touched
            // the channel above the bend, the river ran through the hollow and the bend stood dry)
            let bank = false;
            for (let dy = -1; dy <= 1 && !bank; dy++) for (let dx = -1; dx <= 1; dx++) if (water[i + dy * W + dx] === 1 || water[i + dy * W + dx] === 2) bank = true;
            if (bank) continue;
            mark[i] = 1;
            crescent.push(i);
          }
      }
      if (!ok || crescent.length < 40) continue;
      // the join: from the crescent's downstream end straight to the channel, at the river's bed
      const kEnd = bend.k + span;
      const [ex, ey] = pts[kEnd];
      const tail = crescent[crescent.length - 1];
      const tx = tail % W;
      const ty = (tail - tx) / W;
      const steps = Math.ceil(Math.max(Math.abs(ex - tx), Math.abs(ey - ty)) * 2) || 1;
      const neck: number[] = [];
      for (let q = 0; q <= steps; q++) {
        const x = Math.round(tx + ((ex - tx) * q) / steps);
        const y = Math.round(ty + ((ey - ty) * q) / steps);
        const i = y * W + x;
        if (water[i] === 1) break;
        if (!mark[i]) neck.push(i);
      }
      for (const i of crescent) {
        h[i] = floor;
        water[i] = 2;
      }
      for (const i of neck) {
        if (h[i] > bed) h[i] = bed;
        if (!water[i]) water[i] = 1;
      }
      lakes.push({ tiles: crescent.slice().sort((a, b) => a - b), outletBed: bed, river: rid });
      return true;
    }
    return false;
  };
  // (the main river first, then the others by length: a river that runs at the map's bottom level
  // cannot keep one)
  if (natural && g.hydro.oxbow && rivers.length) {
    const order = rivers.slice().sort((a, b) => (a.id === mainRiverId() ? -1 : b.id === mainRiverId() ? 1 : 0) || (exits.get(b.id)?.L ?? 0) - (exits.get(a.id)?.L ?? 0) || (a.id < b.id ? -1 : 1));
    for (const r of order) {
      const m = exits.get(r.id);
      if (m && oxbow(m, r.id)) break;
    }
  }

  // ---- a river splits round an island: a second arm leaves it and rejoins it downstream
  const main = rivers[0];
  if (main && rng.float() < g.hydro.split && (g.theme !== "riverValley" || g.hydro.bigSplit || g.hydro.splitAtFall)) {
    const m = exits.get(main.id)!;
    for (let tries = 0; tries < 6; tries++) {
      // (M9b, "the river splits around a big island", D274: wider and longer)
      const len = (g.hydro.bigSplit ? 42 : 26) + (g.hydro.bigSplit ? 24 : 20) * rng.float();
      let s0 = m.L * (0.2 + 0.45 * rng.float());
      // (M9b, two falls side by side: round the main river's biggest drop, so both arms fall over it)
      if (g.hydro.splitAtFall && tries < 3) {
        let bestDrop = 0;
        let at = -1;
        for (let j = 1; j <= m.n; j++) {
          const d = m.prof[j - 1] - m.prof[j];
          if (d > bestDrop) {
            bestDrop = d;
            at = j;
          }
        }
        if (at >= 0 && bestDrop >= 2) s0 = Math.max(4, ((at / m.n) * m.L) - len * (0.35 + 0.3 * rng.float()));
      }
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
      const off = sideSign * (m.width / 2 + (g.hydro.bigSplit ? 9 : 5) + (g.hydro.bigSplit ? 6 : 7) * rng.float());
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
      markArm(pa.st, pa.L, ahalf);
      arms.push({ kind: "split", river: main.id, path: armCourse });
      break;
    }
  }

  // ---- a delta: the main river fans into several mouths on its edge. On a Delta map (D412, Kyler's
  //      review) the fan is the map's own: its apex anywhere from a third to two thirds down the
  //      river, three to five arms (one more with Braided) spread over a fan whose width and lean
  //      vary by seed, the land between them left as islands; elsewhere it fans near the mouth.
  if (main && "edge" in main.params.exit && rng.float() < g.hydro.delta && (g.theme !== "riverValley" || g.hydro.braided)) {
    const m = exits.get(main.id)!;
    const e = main.params.exit.edge;
    const fan = g.theme === "delta";
    const s0 = fan ? m.L * (0.33 + 0.32 * rng.float()) : Math.max(m.L * 0.55, m.L - (26 + 18 * rng.float()));
    const { p: p0 } = pointAt(m.path, s0);
    const end = m.path[m.path.length - 2];
    // (River style Braided: one more mouth, PLAN §5.3's 2–4 channels)
    const more = rng.float() < 0.5 ? 1 : 0;
    const k = fan ? 3 + Math.floor(3 * rng.float()) + (g.hydro.braided ? 1 : 0) : 1 + more + (g.hydro.braided ? 1 : 0);
    const alongEdge = e === "west" || e === "east" ? 1 : 0;
    const len = alongEdge ? H : W;
    // the fan's spread along the edge: as wide as the reach below the apex allows, leaning to a side
    const reach = alongEdge ? Math.abs((e === "west" ? 0 : W - 1) - p0[0]) : Math.abs((e === "south" ? 0 : H - 1) - p0[1]);
    const spread = fan ? clamp(reach * (0.7 + 0.8 * rng.float()), 24, len * 0.8) : 0;
    const lean = fan ? (rng.float() - 0.5) * 0.5 * spread : 0;
    // (D416: every arm is made: the k arms and the main river's own mouth stand at k + 1 slots evenly
    // across the fan, at least 14 tiles apart at 128², the main river's slot leaning the fan to a
    // side; an arm too near the main river's mouth was once left out, and some fans read as one river)
    const ma = alongEdge ? end[1] : end[0];
    const gap = fan ? Math.min(Math.max(14 * portable.sqrt(Math.max(1, Math.min(W, H) / 128)), spread / k), (len - 13) / k) : 0;
    const iLo = fan ? Math.max(0, Math.ceil(k - (len - 7 - ma) / gap)) : 0;
    const iHi = fan ? Math.min(k, Math.floor((ma - 6) / gap)) : 0;
    const i0 = fan ? Math.round(clamp(k / 2 - lean / gap, Math.min(iLo, iHi), Math.max(iLo, iHi))) : -1;
    // (the arms' beds, for the main river's own course below the apex, D447)
    const armBeds: { prof: Float64Array; L: number; n: number }[] = [];
    for (let a = 0; a < (fan ? k + 1 : k); a++) {
      let along: number;
      if (fan) {
        if (a === i0) continue;
        along = clamp(ma + (a - i0) * gap + (rng.float() - 0.5) * 0.3 * gap, 6, len - 7);
      } else {
        const sgn = a % 2 === 0 ? 1 : -1;
        // (D350: apart in proportion to the map's side, as the root: at 256² the mouths 13–22 tiles
        // apart ran together at the edge, wider and wandering rivers there)
        const shift = sgn * (13 + 9 * rng.float()) * (1 + Math.floor(a / 2)) * portable.sqrt(Math.max(1, Math.min(W, H) / 128));
        along = clamp((alongEdge ? end[1] : end[0]) + shift, 6, len - 7);
      }
      const ex = alongEdge ? (e === "west" ? -1 : W) : along;
      const ey = alongEdge ? along : e === "south" ? -1 : H;
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
      // (D416: a fan's arms narrower, each carrying its share of the river half a level deep, never
      // a pale sheet across the fan)
      const aw = Math.max(MIN_WIDTH, Math.round((fan ? 0.4 : 0.6) * m.width * 10) / 10);
      // (D416: a fan's arms wander as rivers do, never a ruled curve)
      const awv = natural ? { ...wanderOf(g, aw), amp: fan ? 2.5 : 1.5, minAmp: 1 } : null;
      const armCourse = awv ? meanderPath(armPath, h, W, H, awv, hash32(seed, "arm", attempt, 1 + a)) : armPath;
      const aws = hash32(seed, "arm-width", attempt, 1 + a);
      const ahalf = (s: number, L: number) => halfWidthAt(aw, awv, aws, s, L);
      const j0 = Math.round((s0 / m.L) * m.n);
      const pa = profileOf(armCourse, aw, 1, false, main.id, ahalf, m.prof[j0]);
      carve(pa.st, pa.prof, pa.L, pa.n, ahalf, 0);
      markArm(pa.st, pa.L, ahalf);
      armBeds.push({ prof: pa.prof, L: pa.L, n: pa.n });
      arms.push({ kind: "mouth", river: main.id, path: armCourse });
    }
    // (D447: on a Delta the main river's own course below the apex is one of the fan's channels: its
    // bed falls from the apex as soon as the arms' beds do, at the same distance from the apex, and
    // never stands above its own cut. Where it stood above theirs (the apex in a lake whose floor the
    // arms were cut from, or arms falling to the plain sooner), the arms took all its water and its
    // course stood dry from the apex to its mouth. Its feature's bed follows)
    if (fan && armBeds.length) {
      const j0 = Math.round((s0 / m.L) * m.n);
      const below: Point[] = [];
      for (let s = s0; s < m.L; s += 1) below.push(pointAt(m.path, s).p);
      below.push(m.path[m.path.length - 1]);
      // (a channel as narrow as an arm, in the main river's own bed: it carries its share, as an arm
      // does, not the river's whole flow)
      const bw = Math.max(MIN_WIDTH, Math.round(0.4 * m.width * 10) / 10);
      const bhalf = () => bw / 2;
      const pb = profileOf(below, bw, 1, false, main.id, bhalf, m.prof[j0]);
      const bed = pb.prof.slice();
      for (let q = 0; q <= pb.n; q++) {
        const t = (q * pb.L) / pb.n;
        for (const ab of armBeds) {
          const v = ab.prof[Math.min(ab.n, Math.round((t / ab.L) * ab.n))];
          if (v < bed[q]) bed[q] = v;
        }
      }
      carve(pb.st, bed, pb.L, pb.n, bhalf, 0);
      markArm(pb.st, pb.L, bhalf);
      for (let j = j0; j <= m.n; j++) {
        const q = Math.min(pb.n, Math.max(0, Math.round((((j * m.L) / m.n - s0) / pb.L) * pb.n)));
        if (bed[q] < m.prof[j]) m.prof[j] = bed[q];
      }
      const env = m.prof.slice();
      for (let j = m.n - 1; j >= 0; j--) if (env[j] < env[j + 1]) env[j] = env[j + 1];
      const steps: BedStep[] = [];
      for (let j = 1; j <= m.n; j++) {
        const stepDown = env[j - 1] - env[j];
        if (stepDown >= 1) steps.push({ at: Math.round(((j * m.L) / m.n) * 100) / 100, drop: stepDown });
      }
      main.params.bedProfile = { start: env[0], steps };
    }
  }
  // (D447: an arm, cut after the rivers, crossing a tributary's course or running on its bank lower
  // than its bed takes its water there, and the tributary's course on stood dry to its join: from
  // there it runs at the arm's level, its channel holding water to the river it joins. Its
  // feature's bed follows)
  if (natural && arms.length)
    for (const r of rivers) {
      if (!("river" in r.params.exit)) continue;
      const m = exits.get(r.id);
      if (!m) continue;
      const st = stamp(m.path, W, H, Math.ceil(m.width / 2 + 3));
      const bed = m.prof.slice();
      let run = Infinity;
      let lowered = false;
      for (let j = 0; j <= m.n; j++) {
        const {
          p: [px, py],
        } = pointAt(m.path, (j * m.L) / m.n);
        const rr = m.half((j * m.L) / m.n, m.L);
        const R = rr + 1.6;
        for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
          for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
            const i = y * W + x;
            if (st.d[i] < rr || (x - px) * (x - px) + (y - py) * (y - py) > R * R) continue;
            if (armTiles[i]) run = Math.min(run, h[i]);
          }
        if (run < BED_FLOOR) run = BED_FLOOR;
        if (run < bed[j]) {
          bed[j] = run;
          lowered = true;
        }
      }
      if (!lowered) continue;
      carve(st, bed, m.L, m.n, m.half, 0);
      m.prof.set(bed);
      const env = bed.slice();
      for (let j = m.n - 1; j >= 0; j--) if (env[j] < env[j + 1]) env[j] = env[j + 1];
      const steps: BedStep[] = [];
      for (let j = 1; j <= m.n; j++) {
        const stepDown = env[j - 1] - env[j];
        if (stepDown >= 1) steps.push({ at: Math.round(((j * m.L) / m.n) * 100) / 100, drop: stepDown });
      }
      r.params.bedProfile = { start: env[0], steps };
    }
  return { rivers, water, lakes, falls, arms, flowTotal };
}

export type { Rng };
