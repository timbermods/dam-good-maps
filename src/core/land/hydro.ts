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
import { distanceFrom, MinHeap, N4, N8 } from "../math/grid";
import { DIRS8 } from "./num";
import { mapShape } from "./shape";
import { clamp } from "../math/clamp";
import { REACH as STORY_REACH } from "../analysis/story";

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
  /** Courses traced to a course beside them (ruled water, `BESIDE`): none, the plan is as it was without the joins. */
  joined?: number;
  /** The rivers the joins touched (ruled water): each course joined to one beside it, the course it joined, the course a
   *  head refused for running beside it from its head would have run beside, and every course traced after such a head
   *  (another head took its place, so they stand where dev's plan had others); `generate.ts` plans a land again without
   *  the joins only when its refusal names or touches one of them. */
  joinedRivers?: string[];
  /** The tributaries wound as gorges for running deep under a wall (`deepStretch`), not for their planned cut. */
  deepWound?: number;
  /** The courses whose planned water would stand over their bank somewhere (D530): read again on the routed flow and
   *  cut wider where it does, over a broad flat, by `carryChannels`. */
  carry?: CarryReach[];
}

/** A course's reach as planned, for `carryChannels` (D530): its path, its bed and lakes by station, its channel's
 *  half-width by station and the half-width of the floor cleared beside it. */
export interface CarryReach {
  id: string;
  path: Point[];
  L: number;
  n: number;
  prof: number[];
  lakeAt: number[];
  halfs: number[];
  floorHalf: number;
}

export interface HydroOptions {
  /** Meanders and varying widths (M9a's no-straight-rivers rule); false gives the prototype's
   *  courses, for comparisons. */
  meander?: boolean;
  /** River Valley's default trunk looked for again (`planHydro`): its water may enter by every edge
   *  but the downstream ones, and leaves by those alone. */
  across?: boolean;
  /** False: no course joins one beside it (ruled water, `BESIDE`), the plan as it was before; `generate.ts` plans so
   *  again when a joined plan's land is refused. */
  joins?: boolean;
}

/** The share of the map the planned courses aim to bring within the story's reach (`STORY_REACH`,
 *  analysis/story.ts `REACH`, a share of the map's side; D333 (3): the story asks for 35% of the dry
 *  land near water, D480; the courses are lines, their water a little wider). */
const REACH_WANT = 0.45;

/** Above 128² (D504): the heads for each 128² of a map's area beyond the first, for springs toward the land far from
 *  water; the soil's reach from the planned courses (`moistCost`, the game's moisture of a river's bank less a little);
 *  and the share of the map the courses aim to bring within it. */
const REACH_HEADS = 2;
/** Ruled water (planning's ruling of 2026-11-15): a course within `near` tiles of one already traced for `run` cells
 *  joins it there, never running side by side with it (`planHydroSingle`'s trace). */
export const BESIDE = { near: 12, run: 16 } as const;
const MOIST_REACH = 10;
const WIDE_WANT = 0.5;

/** How far the soil's moisture has to spread from the water on `wet` tiles to reach each tile, by the game's own rule
 *  (sim/soil3d.ts: a step costs 1, and 6 for each level the tile stands above the one it spreads from; downhill is
 *  free of the climb), the water standing a level above its bed; 64 or more read as 64 (D504). */
export function moistCost(wet: Uint8Array, h: ArrayLike<number>, W: number, H: number): Int32Array {
  const N = W * H;
  const CAP = 64;
  const cost = new Int32Array(N).fill(CAP);
  const level = new Int32Array(N);
  const buckets: number[][] = Array.from({ length: CAP }, () => []);
  for (let i = 0; i < N; i++) {
    level[i] = h[i];
    if (wet[i]) {
      cost[i] = 0;
      level[i] = h[i] + 1;
      buckets[0].push(i);
    }
  }
  for (let c = 0; c < CAP; c++) {
    const b = buckets[c];
    for (let k = 0; k < b.length; k++) {
      const i = b[k];
      if (cost[i] !== c) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const nc = c + 1 + 6 * Math.max(0, level[j] - level[i]);
        if (nc < cost[j] && nc < CAP) {
          cost[j] = nc;
          buckets[nc].push(j);
        }
      }
    }
  }
  return cost;
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

/** The spill levels with only `edge` draining, but for the positions along it in `sealed` (the
 *  inflows' mouth rows, which hold their sources): the level at which standing water anywhere leaves
 *  by that edge. `poolHolds` reads it for an inflow's pool. */
export function edgeBackFill(h: ArrayLike<number>, W: number, H: number, edge: Edge, sealed: ReadonlySet<number>): Float64Array {
  const vertical = edge === "west" || edge === "east";
  return drainage(h, W, H, { eight: false, outlet: (i) => edgeOf(i, W, H) === edge && !sealed.has(vertical ? (i - (i % W)) / W : i % W) }).filled;
}

/** Whether a pool cut a level or more under `level` (its water, the bed of the reach below) on
 *  `tiles` is held by its banks (attempts-256, cause A): every tile beside it but its outflow
 *  (`outflow`, the channel it leaves by) stands at `level` or higher, none lies past the map's
 *  edge, and with `backFill` (an inflow's `edgeBackFill`, read before the pool is cut) the water
 *  at `level` cannot run back out by the inflow's own edge. Nothing is raised to make it hold: where
 *  it doesn't, the pool is not cut. The planned pools below drops use it; so may any later cut below
 *  a bed (a plunge pool at a fall's foot) once every river is carved. */
export function poolHolds(h: ArrayLike<number>, W: number, H: number, tiles: readonly number[], level: number, outflow: (i: number) => boolean, backFill: ArrayLike<number> | null = null): boolean {
  const inPool = new Set(tiles);
  for (const i of tiles) {
    if (backFill && !(backFill[i] > level)) return false;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
      const q = yy * W + xx;
      if (inPool.has(q) || outflow(q)) continue;
      if (h[q] < level) return false;
    }
  }
  return true;
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

/** The most of a level a river's water stands over its bed before its channel is cut wider (D530). */
const CARRY_MOST = 0.85;
/** The most a channel is widened to carry its water (D530), times its width. */
const CARRY_WIDEST = 1.8;
/** The share of the ground in a band past a reach's bank at most a level over its bed that makes it a broad flat
 *  (D530): there water over the bank spreads as a sheet; where the banks rise it stands in its valley. */
const CARRY_FLAT = 0.6;
/** How far past a channel's bank the ground is read for a broad flat (D530), in tiles. */
const CARRY_BAND = 12;
/** The fewest tiles of that band a reach is read on (D530): a short reach between two lips is no plain. */
const CARRY_FLAT_MIN = 200;

/** How much wider each station of a course needs its channel to carry its water inside a bank a level over its bed
 *  (D530, D26): its standing water by station, from its end upstream, its head over each lip or its end (0.3·q/w) and
 *  its rise along a flat reach (0.0015·q/w a tile), through any lake on it; each reach of water backed up from one
 *  control (`ctrl`, its station) widened alike, as much as its deepest station needs, at most `CARRY_WIDEST`. The
 *  course a lake's water reaches back up is the lake's and is not read. Null when no station needs it. */
function carryNeed(prof: ArrayLike<number>, lakeAt: ArrayLike<number>, L: number, n: number, widthAt: (j: number) => number, flowAt: (j: number) => number): { k: Float64Array; ctrl: Int32Array } | null {
  const ds = L / n;
  const k = new Float64Array(n + 1).fill(1);
  const ctrl = new Int32Array(n + 1);
  let any = false;
  // (a widened reach backs less water up the reach above it: a few passes settle the factors)
  for (let pass = 0; pass < 3; pass++) {
    const depth = new Float64Array(n + 1);
    let sf = -Infinity;
    let c = n;
    // (the level a lake on the course holds its water at, its outlet's bed, while the course above it lies under it)
    let held = -Infinity;
    for (let j = n; j >= 0; j--) {
      const q = flowAt(j);
      const w = Math.max(1, widthAt(j) * k[j]);
      if (lakeAt[j] && j < n) {
        // (a lake on the course stands at the water backed up to its outlet, the reach below's: the reach above
        // runs into it at that level, all one reach of water)
        if (!lakeAt[j + 1]) held = prof[j + 1];
        ctrl[j] = c;
        continue;
      }
      const head = prof[j] + (0.3 * q) / w;
      const backed = sf + ((0.0015 * q) / w) * ds;
      if (j === n || head >= backed) {
        sf = head;
        c = j;
      } else sf = backed;
      ctrl[j] = c;
      if (prof[j] < held) continue;
      held = -Infinity;
      depth[j] = sf - prof[j];
    }
    const need = new Map<number, number>();
    for (let j = 0; j <= n; j++) if (depth[j] > CARRY_MOST) need.set(ctrl[j], Math.max(need.get(ctrl[j]) ?? 1, depth[j] / CARRY_MOST));
    if (!need.size) break;
    any = true;
    for (let j = 0; j <= n; j++) {
      const f = need.get(ctrl[j]);
      if (f !== undefined) k[j] = Math.min(CARRY_WIDEST, k[j] * f);
    }
  }
  return any ? { k, ctrl } : null;
}

/** The most a river's settled water stands over its floor, a level over its bed, to be a sheet (D530). */
const CARRY_SHEET = 0.2;
/** The least it stands over its floor to be read as over it (as the measures count water). */
const CARRY_OVER = 0.05;
/** The fewest tiles of sheet in a backed reach's band past its bank for its channel to be cut (D530): a cut moves the
 *  start's ground and wood, so it is made only for a sheet worth taking: on 256² seeds 1-6, the reaches cut held 1,141
 *  (River Valley 4) to 2,583 tiles, and River Valley 5's 107, whose cut took its sheet 1.6% to 1.7% of the map and
 *  moved its start; River Valley 192² seed 5's 372 bought 0.2% of the map for 45 logs at its start. */
const CARRY_SHEET_MIN = 600;

/** A planned course read on the shaped land (D530): each station's routed flow, the reaches of water backed up from one
 *  control on it (`carryNeed`), and the controls whose band past the bank is a broad flat (`flats`). */
interface CarryRead {
  st: Stamp;
  at: (i: number) => number;
  need: { k: Float64Array; ctrl: Int32Array };
  flats: Set<number>;
}

function carryRead(h: Uint8Array, water: Uint8Array, W: number, H: number, r: CarryReach, q: ArrayLike<number>): CarryRead | null {
  const { L, n } = r;
  let wide = 0;
  for (const v of r.halfs) wide = Math.max(wide, v);
  const st = stamp(r.path, W, H, Math.ceil(wide * CARRY_WIDEST + CARRY_BAND + 1));
  const at = (i: number) => Math.min(n, Math.max(0, Math.round((st.s[i] / L) * n)));
  // the flow each station carries: the most the water routes through its channel
  const flow = new Float64Array(n + 1);
  for (const i of st.tiles) if (st.d[i] < r.halfs[at(i)] && q[i] > flow[at(i)]) flow[at(i)] = q[i];
  const need = carryNeed(r.prof, r.lakeAt, L, n, (j) => 2 * r.halfs[j], (j) => flow[j]);
  if (!need) return null;
  // a reach widens only over a broad flat: the ground in a band past its bank, at most a level over its bed, on most of
  // the reach (River Valley 256² seed 4: all of it; where the banks rise, Highlands 256² seed 2 and Delta 256² seed 1,
  // a quarter and a third)
  const low = new Map<number, number>();
  const all = new Map<number, number>();
  for (const i of st.tiles) {
    const j = at(i);
    if (!(need.k[j] > 1) || r.lakeAt[j] || water[i] === 2) continue;
    if (st.d[i] < r.halfs[j] || st.d[i] > r.halfs[j] + CARRY_BAND) continue;
    const c = need.ctrl[j];
    all.set(c, (all.get(c) ?? 0) + 1);
    if (h[i] <= r.prof[j] + 1) low.set(c, (low.get(c) ?? 0) + 1);
  }
  const flats = new Set<number>();
  for (const [c, a] of all) if (a >= CARRY_FLAT_MIN && (low.get(c) ?? 0) >= CARRY_FLAT * a) flats.add(c);
  return flats.size ? { st, at, need, flats } : null;
}

/** The courses of `reaches` whose routed water would stand over its bank beside a broad flat (D530): those
 *  `carryChannels` may cut, read before their water is settled, so a land with none costs no settle. */
export function carryFlats(h: Uint8Array, water: Uint8Array, W: number, H: number, reaches: readonly CarryReach[], q: ArrayLike<number>): CarryReach[] {
  return reaches.filter((r) => carryRead(h, water, W, H, r, q) !== null);
}

/** D530, a river's channel carries its water: on the finished land stage, each planned course whose water would stand
 *  over its bank (`Hydro.carry`) is read again on the flow it routes (`q`, the pre-fill's walk of every source's water,
 *  `sim/prefill.ts` `flowThrough`: water a course loses by an edge or to an arm is not in it) and on its water as it
 *  settles on that land, uncut (`level`, its surface, NaN where dry). A reach of water backed up from one control
 *  (`carryNeed` on that flow), beside a broad flat (`CARRY_FLAT`: the ground in a band past its bank a level over its
 *  bed, as River Valley 256² seed 4's plain), is cut wider when its settled water lies over its floor, a level over its
 *  bed, as a sheet (over `CARRY_OVER`, at most `CARRY_SHEET`) on more of its stations than it stands deeper there (where
 *  it stands deeper over its floor, a cut that lowers it leaves the floor a sheet: Delta 256² seed 6's inflow stood 0.44
 *  over its floor, and a cut left 0.16), and the band holds `CARRY_SHEET_MIN` tiles of sheet or more. Its channel is cut
 *  wider into its own floor as much as the routed water needs to stand at 0.85 of a level, at most `CARRY_WIDEST`: the
 *  floor's tiles inside the wider channel come down to the bed, eased along the course (the most over about two widths
 *  each way, then their mean), so the cut is one smooth widening; the floor's outer edge and every bank stay where they
 *  are, and ground is only taken away (D111). Where the water stands in its channel, or where the banks rise, nothing
 *  is cut. Changes `h` and `water` (channel tiles 1); returns the tiles cut. */
export function carryChannels(h: Uint8Array, water: Uint8Array, W: number, H: number, reaches: readonly CarryReach[], q: ArrayLike<number>, level: ArrayLike<number>): number {
  let cut = 0;
  for (const r of reaches) {
    const read = carryRead(h, water, W, H, r, q);
    if (!read) continue;
    const { st, at, need, flats } = read;
    const { L, n } = r;
    // the settled water's surface over the bed at each station, the highest in its channel
    const over = new Float64Array(n + 1).fill(-Infinity);
    for (const i of st.tiles) {
      const j = at(i);
      if (st.d[i] < r.halfs[j] && level[i] - r.prof[j] > over[j]) over[j] = level[i] - r.prof[j];
    }
    // each backed reach's stations whose water lies over the floor as a sheet, those where it stands deeper, and the
    // tiles of sheet in its band past the bank
    const sheet = new Map<number, number>();
    const deep = new Map<number, number>();
    for (let j = 0; j <= n; j++) {
      if (!(need.k[j] > 1) || r.lakeAt[j] || !(over[j] > 1 + CARRY_OVER)) continue;
      const m = over[j] <= 1 + CARRY_SHEET ? sheet : deep;
      m.set(need.ctrl[j], (m.get(need.ctrl[j]) ?? 0) + 1);
    }
    const thin = new Map<number, number>();
    for (const i of st.tiles) {
      const j = at(i);
      if (!(need.k[j] > 1) || r.lakeAt[j] || water[i] === 2) continue;
      if (st.d[i] < r.halfs[j] || st.d[i] > r.halfs[j] + CARRY_BAND) continue;
      const d = level[i] - h[i];
      if (d > CARRY_OVER && d <= CARRY_SHEET) thin.set(need.ctrl[j], (thin.get(need.ctrl[j]) ?? 0) + 1);
    }
    const k = new Float64Array(n + 1).fill(1);
    let any = false;
    for (let j = 0; j <= n; j++) {
      const c = need.ctrl[j];
      if (need.k[j] > 1 && flats.has(c) && (sheet.get(c) ?? 0) > (deep.get(c) ?? 0) && (thin.get(c) ?? 0) >= CARRY_SHEET_MIN) {
        k[j] = need.k[j];
        any = true;
      }
    }
    if (!any) continue;
    // (eased: the most over about two widths each way, then their mean, never under the factor a station needs)
    const R = Math.max(4, Math.round((4 * r.halfs[n]) / (L / n)));
    const dil = new Float64Array(n + 1);
    for (let j = 0; j <= n; j++) {
      let m = 1;
      for (let t = Math.max(0, j - R); t <= Math.min(n, j + R); t++) if (k[t] > m) m = k[t];
      dil[j] = m;
    }
    const sm = new Float64Array(n + 1);
    for (let j = 0; j <= n; j++) {
      let a = 0;
      for (let t = j - R; t <= j + R; t++) a += dil[Math.max(0, Math.min(n, t))];
      sm[j] = a / (2 * R + 1);
    }
    for (const i of st.tiles) {
      const j = at(i);
      if (r.lakeAt[j] || water[i] === 2 || sm[j] <= 1) continue;
      const x = i % W;
      const y = (i - x) / W;
      // (never at the map's edge: the edge rows keep their ground, D151, D314)
      if (Math.min(x, y, W - 1 - x, H - 1 - y) < 2) continue;
      const b = r.prof[j];
      if (st.d[i] < r.halfs[j] * sm[j] && h[i] === b + 1) {
        h[i] = b;
        water[i] = 1;
        cut++;
      }
    }
  }
  return cut;
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
 *  line), its wavelength, how much its channel's width varies, and how many tiles at each end its swing
 *  grows from nothing over (7 unless given). */
export interface Wander {
  amp: number;
  minAmp: number;
  cell: number;
  widthVar: number;
  taper?: number;
}

/** A course cut this many levels or more under its banks, its floor reaching under `GORGE_FLOOR` tiles beside its
 *  channel, is a gorge: its walls stand at its water (`gorgeWander`). */
export const GORGE_CUT = 3;
export const GORGE_FLOOR = 3;

/** A gorge's wander on a map under 128²: its wavelength and its ends' taper drawn at the map's scale, the narrower
 *  side's ratio to 128, never under half (D(highlands-slot)). A river's meander is drawn for the width of its channel,
 *  at a 128²'s scale (`wanderOf`, 16 to 40 tiles); on a 48² map a gorge cut six levels under its banks held under two
 *  bends over its whole course and ran 22 tiles in a straight 45° trench 3 wide with sheer walls, read as drawn with a
 *  ruler (Highlands 48² seed 3). A course cut a level or two, or with a broad floor between its channel and its walls,
 *  is left as it is: its walls do not stand at its water. 128² and up keep their wander. */
export function gorgeWander(wv: Wander, W: number, H: number): Wander {
  const side = Math.min(W, H);
  if (side >= 128) return wv;
  const f = Math.max(0.5, side / 128);
  return { ...wv, cell: wv.cell * f, taper: Math.round(7 * f) };
}

/** The longest stretch of a course, in tiles, along which its bed would run more than `GORGE_CUT` levels under the higher
 *  of its banks just past its floor: its floor (a level over its bed) under a wall of `GORGE_CUT` or more
 *  (D(gorge-followups)). A tributary's planned cut is a level or two under the lowest ground beside it, but where it runs
 *  down a terrace's edge or through a rise its bed follows the lowest ground upstream, and the wall on its high side
 *  stands at its water: Canyon 48² seed 18's spring tributary, cut a level, ran 13 tiles under a plateau's wall four
 *  and five levels high, 16.3 tiles of it straight. Its bed as the carve will set it, from the land before any channel
 *  (the lowest ground within 1.6 tiles of its channel, less its cut, never rising downstream); each bank the highest
 *  ground one to two tiles past its floor. */
export function deepStretch(path: Point[], h: Uint8Array, W: number, H: number, half: number, floorHalf: number, cut: number): number {
  const pts = resample(path, 1);
  const n = pts.length;
  const at = (x: number, y: number) => h[Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
  const R = half + 1.6;
  let run = Infinity;
  let len = 0;
  let best = 0;
  for (let k = 0; k < n; k++) {
    const [px, py] = pts[k];
    let ring = Infinity;
    for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
      for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (d2 >= half * half && d2 <= R * R && h[y * W + x] < ring) ring = h[y * W + x];
      }
    if (ring < Infinity) run = Math.min(run, ring - cut);
    if (!(px >= 0 && py >= 0 && px <= W - 1 && py <= H - 1) || run === Infinity) {
      len = 0;
      continue;
    }
    const a = pts[Math.max(0, k - 3)];
    const b = pts[Math.min(n - 1, k + 3)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = portable.sqrt(dx * dx + dy * dy) || 1;
    let bank = 0;
    for (const sg of [-1, 1])
      for (let t = half + floorHalf + 1; t <= half + floorHalf + 2; t++) bank = Math.max(bank, at(px - (sg * dy * t) / l, py + (sg * dx * t) / l));
    len = bank - Math.max(BED_FLOOR, run) > GORGE_CUT ? len + 1 : 0;
    best = Math.max(best, len);
  }
  return best;
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
    for (const [ox, oy] of N4) bottom = Math.min(bottom, levelAt(px + ox, py + oy));
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
  const taper = Math.min(wv.taper ?? 7, Math.floor(n / 4));
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

/** The sea of an island sea's map: the largest hollow of the land's levels (4-connected tiles a level
 *  or more under their spill), when it is a tenth of the map or more; null otherwise. */
function seaOf(h: Uint8Array, W: number, H: number): Uint8Array | null {
  const N = W * H;
  const filled = drainage(h, W, H, { eight: false }).filled;
  const seen = new Uint8Array(N);
  let best: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || !(filled[s0] - h[s0] >= 1)) continue;
    const q = [s0];
    seen[s0] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || !(filled[j] - h[j] >= 1)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (q.length > best.length) best = q;
  }
  if (best.length < 0.1 * N) return null;
  const sea = new Uint8Array(N);
  for (const i of best) sea[i] = 1;
  return sea;
}

/** A Delta arm's course from the fan's apex to its mouth (#233, Delta arms round 2): the seeded apex
 *  and mouth kept, the low ground choosing the way inside a broad curved corridor with its own
 *  departure, phase and turning length, so neighbouring arms diverge, converge and braid rather than
 *  follow apex-to-mouth rays. */
function deltaCourse(from: Point, to: Point, E: Float64Array, W: number, H: number, gap: number, seed: number): Point[] {
  const end: Point = [clamp(to[0], 0, W - 1), clamp(to[1], 0, H - 1)];
  const start = Math.round(from[1]) * W + Math.round(from[0]);
  const goal = Math.round(end[1]) * W + Math.round(end[0]);
  const axis = to[0] < 0 || to[0] >= W ? 0 : 1, across = 1 - axis;
  const sign = end[axis] < from[axis] ? -1 : 1;
  const reach = Math.abs(end[axis] - from[axis]);
  if (reach < 8) return [from, to];
  const side = across === 0 ? W : H;
  const amp = Math.min(clamp(gap * 0.8, 8, 16), reach * 0.24);
  const phase = TWO_PI * ((hash32(seed, "fan-phase") >>> 0) / 4294967296);
  const turns = 0.65 + 0.6 * ((hash32(seed, "fan-turns") >>> 0) / 4294967296);
  const centreAt = (t: number) => clamp(from[across] + t * (end[across] - from[across])
    + amp * sinDet(TWO_PI * t / 2) * sinDet(phase + TWO_PI * turns * t), 3, side - 4);
  const room = clamp(gap * 0.15, 2.5, 4.5);
  const costs = new Float64Array(W * H).fill(Infinity);
  const parent = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();costs[start] = 0;heap.push(0, start);
  while (heap.size) {
    const i = heap.pop(), cost = heap.lastKey;
    if (cost !== costs[i]) continue;
    if (i === goal) break;
    const x = i % W, y = Math.floor(i / W);
    const forward = axis === 0 ? x : y;
    // (ruled water: the eight neighbours on the grid; `DIRS8`'s unit vectors made every diagonal a fractional tile that
    // was never taken, so an arm went by rows and columns alone, in long straight legs)
    for (const [dx, dy] of N8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const next = axis === 0 ? xx : yy;
      const t = sign * (next - from[axis]) / reach;
      if (t < -0.02 || t > 1.02 || sign * (next - forward) < 0) continue;
      const u = clamp(t, 0, 1), off = (across === 0 ? xx : yy) - centreAt(u);
      const r = 2 + room * 4 * u * (1 - u);
      if (Math.abs(off) > r) continue;
      // The guide bends at the river's scale, instead of following an apex-to-mouth ray.
      // Within it, elevation and uphill work decide; independent noise breaks ties on flats.
      const rise = Math.max(0, E[j] - E[i]);
      const grade = E[start] + u * (E[goal] - E[start]);
      const terrain = Math.max(0, E[j] - grade);
      const step = (dx && dy ? portable.sqrt(2) : 1)
        * (1 + 2.5 * rise + 0.5 * terrain + 0.6 * (1 + fbm(seed, xx, yy, 11, 2)) + 1.4 * off * off / (r * r));
      const c = cost + step;
      if (c < costs[j]) {costs[j] = c;parent[j] = i;heap.push(c, j);}
    }
  }
  if (parent[goal] < 0) {
    const guide: Point[] = [from];
    for (let q = 1; q < 40; q++) {
      const t = q / 40, p: Point = [0, 0];
      p[axis] = from[axis] + sign * reach * t;p[across] = centreAt(t);
      guide.push(p);
    }
    guide.push(to);
    return smoothPath(guide, 2, 1);
  }
  const path: Point[] = [];
  for (let i = goal; i >= 0; i = parent[i]) {path.push([i % W, Math.floor(i / W)]);if (i === start) break;}
  path.reverse();path[0] = from;path.push(to);
  return smoothPath(path, 2, 1);
}

function planHydroSingle(E: Float64Array, h: Uint8Array, g: Genome, seed: number, W: number, H: number, attempt: number, opts: HydroOptions = {}): Hydro {
  const N = W * H;
  // River Valley has one default trunk; an explicit Rivers count stays the player's, 0 too (its main
  // river then rises from a spring, PLAN §5.3)
  if (g.theme === "riverValley" && !g.hydro.exactInflows && !g.hydro.noInflows) g.hydro.inflows = 1;
  const natural = opts.meander !== false;
  const rng = stream(seed, "hydro", attempt);
  const down = downstreamEdges(g.flowDir);
  const up: Edge[] = g.tiltKind === "radial" || opts.across ? (["west", "east", "south", "north"] as Edge[]).filter((e) => !down.includes(e)) : down.map((e) => OPPOSITE[e]);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Er[y * W + x] = E[y * W + x] + wander * fbm(rs, x, y, wanderCell, 2);
  // (D357: down a long map the water's way runs its length, to the far end: its long sides don't take it,
  // else every course left by the nearer side a few dozen tiles in and the long map had no long river)
  const lengthwise = g.tiltKind === "linear" && mapShape(W, H).long;
  const onSide = (i: number) => {
    const e = edgeOf(i, W, H);
    return !!e && !up.includes(e) && !down.includes(e);
  };
  // (and it keeps off the long sides: led along a side's edge, a course was refused for hugging it, or its water
  // would leave there in the game; a bank rising up to 8 within a quarter of the width of each side, and a wall
  // no course crosses within the 4 tiles a course keeps from an edge, so a hollow by the side never draws one)
  if (lengthwise) {
    const across = W >= H ? H : W;
    const m = Math.max(6, 0.25 * across);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = W >= H ? Math.min(y, H - 1 - y) : Math.min(x, W - 1 - x);
        if (d < m) Er[y * W + x] += (8 * (m - d)) / m + (d < 5 ? 100 : 0);
      }
  }
  const dr = drainage(Er, W, H, { outlet: lengthwise ? (i) => !onUp(i) && !onSide(i) : (i) => !onUp(i), epsilon: 1e-6 });
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
  const traced: { k: number; head: Head; cells: number[]; joins: number; toSea?: boolean }[] = [];
  // (round 6, Islands: a river that meets the sea ends there, and none is ever routed on through the
  // sea and across its lip to the map's edge: its bed cut there drained the sea through the lip, the
  // cause round 5 widened the lip for. A later head still joins a river on the land (D273 (1)): one
  // let end in the sea as a join made every spring a river of its own, and at 256² they cut the
  // mainland into strips with no room for a start. The sea: the largest hollow of the land's levels,
  // a tenth of the map or more.)
  const seaAt = g.seaLayout ? seaOf(h, W, H) : null;
  const areaK = N / (128 * 128);
  // A few fed tributaries read better than many shallow fragments at large sizes.
  // Explicit Rivers counts remain player-owned; every other theme keeps its cap.
  const headCap = g.theme === "riverValley" && !g.hydro.exactInflows ? (side >= 256 ? 5 : 4) : Infinity;
  // (D504: above 128² the springs toward the land far from water have heads of their own beyond these, `REACH_HEADS`)
  let maxHeads = natural ? Math.min(headCap, Math.floor(3.5 + 1.5 * portable.pow(areaK, 0.75))) : Infinity;
  const wide = Math.max(1, areaK);
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
  // (ruled water) the traced courses' nearest tile within `BESIDE.near`, by a flood from them, made again as courses are
  // added
  let besideFor = -1;
  const besideSrc = new Int32Array(N);
  const besideField = (): Int32Array => {
    if (besideFor === heads.length) return besideSrc;
    besideFor = heads.length;
    besideSrc.fill(-1);
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (owner[i] >= 0) { besideSrc[i] = i; q.push(i); }
    const R2 = BESIDE.near * BESIDE.near;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W, y = (i - x) / W;
      const s = besideSrc[i];
      const sx = s % W, sy = (s - sx) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (besideSrc[j] >= 0 || (xx - sx) * (xx - sx) + (yy - sy) * (yy - sy) > R2) continue;
        besideSrc[j] = s;
        q.push(j);
      }
    }
    return besideSrc;
  };
  /** A course's cells that run beside a traced course (within `BESIDE.near` for `BESIDE.run` cells or more) end where
   *  that stretch begins, joined to its nearest tile by a straight link that never climbs: the new cells and the course
   *  joined; undefined when it runs beside none (or no link holds), null when it runs beside one from its head. */
  const besideJoin = (cells: number[]): { cells: number[]; joins: number } | null | undefined => {
    const src = besideField();
    // (the last cell is the course it joins, or the edge)
    const end = owner[cells[cells.length - 1]] >= 0 ? cells.length - 1 : cells.length;
    // (beside on one plain, round 3: the nearest course and the ground between it and a cell rise at most a level over the
    // cell. Two courses a ridge parts each keep their own valley: they are not drawn lines, and joined over it, or refused
    // when the head stood within 12 tiles of the other, the valley stood dry; River Valley 9's first map lost its badwater's
    // place to one, 1 → 4 attempts)
    const onPlain = (c: number): boolean => {
      const o = src[c];
      if (o < 0 || h[o] > h[c] + 1) return false;
      const cx = c % W, cy = (c - cx) / W;
      const ox = o % W, oy = (o - ox) / W;
      const steps = Math.max(Math.abs(ox - cx), Math.abs(oy - cy));
      for (let t = 1; t < steps; t++) if (h[Math.round(cy + ((oy - cy) * t) / steps) * W + Math.round(cx + ((ox - cx) * t) / steps)] > h[c] + 1) return false;
      return true;
    };
    let q0 = -1;
    for (let q = 0, run = 0; q < end; q++) {
      run = onPlain(cells[q]) ? run + 1 : 0;
      if (run >= BESIDE.run) { q0 = q - run + 1; break; }
    }
    if (q0 < 0) return undefined;
    if (q0 === 0) return null;
    for (let q = 10; q < q0; q++) if (borderDist(cells[q]) < 4) return undefined;
    for (let q = q0; q < Math.min(end, q0 + BESIDE.run); q++) {
      const c = cells[q];
      // (the course kept and the tile joined stand 4 tiles off the map's edge too, as the link does and as a course's
      // middle must: its last cells, spared for a course that ends by the edge, ended beside it here, and a tributary
      // run down the edge into an inflow's mouth let the inflow's water back out by its edge; River Valley 256² seed 1's
      // first map refused, 1 → 3 attempts)
      if (q >= 10 && borderDist(c) < 4) return undefined;
      const o = src[c];
      const top = h[c];
      if (h[o] > top) continue;
      const cx = c % W, cy = (c - cx) / W;
      const ox = o % W, oy = (o - ox) / W;
      const steps = Math.max(Math.abs(ox - cx), Math.abs(oy - cy));
      const link: number[] = [];
      let at = o;
      let ok = true;
      for (let t = 1; t < steps; t++) {
        const i = Math.round(cy + ((oy - cy) * t) / steps) * W + Math.round(cx + ((ox - cx) * t) / steps);
        // (a course met on the way is the one joined)
        if (owner[i] >= 0) { at = i; break; }
        if (h[i] > top || borderDist(i) < 4) { ok = false; break; }
        if (link[link.length - 1] !== i) link.push(i);
      }
      if (!ok || borderDist(at) < 4) continue;
      return { cells: [...cells.slice(0, q + 1), ...link, at], joins: owner[at] };
    }
    return undefined;
  };
  // (ruled water: the courses joined to one beside them, and the heads refused for running beside one from the head)
  let joined = 0;
  let refused = 0;
  const touched = new Set<number>();
  let lostAt = Infinity;
  const trace = (hd: Head, alongUp = false, mustJoin = natural && heads.length > 0): boolean => {
    if (heads.length >= maxHeads) return false;
    const k = heads.length;
    const cells: number[] = [];
    let c = hd.cell;
    let joins = -1;
    const guard = new Set<number>();
    let toSea = false;
    while (c >= 0 && !guard.has(c)) {
      guard.add(c);
      if (seaAt && seaAt[c]) {
        cells.push(c);
        toSea = true;
        break;
      }
      if (owner[c] >= 0) {
        joins = owner[c];
        cells.push(c);
        break;
      }
      cells.push(c);
      c = dr.rcv[c];
    }
    if (cells.length < (alongUp ? 8 : 12)) return false;
    const take = (cells: number[], joins: number, toSea: boolean): boolean => {
      // A default valley trunk crosses the land; a short corner course cannot stand for it.
      if (natural && g.theme === "riverValley" && !g.hydro.exactInflows && !g.hydro.noInflows && !g.intentions.includes("upper-lower") && heads.length === 0) {
        if (hd.kind !== "edge") return false;
        let x0 = W, y0 = H, x1 = 0, y1 = 0;
        for (const i of cells) { const x = i % W, y = Math.floor(i / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (Math.max(x1 - x0, y1 - y0) < 0.5 * side) return false;
      }
      if (mustJoin && (joins < 0 || cells.length < minTributary)) return false;
      // M9b: a head below the spill of its own way down (a low point of an edge behind a ridge, or a
      // spring below the rim of a hollow on its way) would have its channel cut up through the rise,
      // and the water beyond would stand higher than where it begins: it could never flow that way
      // (an inflow's water runs back out by the edge beside its mouth)
      // (D357: down a long map a head may stand a level under the rise ahead of it, which its channel cuts through:
      // the land falls the length of the map a level in a few dozen tiles, and a level's bump a few tiles in
      // stopped every inflow at its edge, so the long map had no long river)
      const rise = lengthwise ? 1 : 0;
      if (drH && (dr.filled[hd.cell] - Er[hd.cell] > 0.5 + rise || drH.filled[hd.cell] > h[hd.cell] + rise)) return false;
      // (a hollow on the way fills to its spill: above the head, its water would stand over the head)
      if (spillAll) for (const c of cells) if (spillAll[c] > h[hd.cell] + rise) return false;
      // (the Rivers setting's relaxed search: a shorter path, and one along an upstream edge, which
      // does not drain)
      for (let q = 10; q < cells.length - 10; q++) if ((alongUp ? drainDist(cells[q]) : borderDist(cells[q])) < 4) return false;
      // (M9b: an inflow heads inland from its mouth, never along its edge first)
      if (natural && hd.kind === "edge") for (let q = 1; q <= Math.min(8, cells.length - 1); q++) if (borderDist(cells[q]) < q >> 1) return false;
      heads.push(hd);
      for (const i of cells) if (owner[i] < 0) owner[i] = k;
      traced.push({ k, head: hd, cells, joins, toSea });
      return true;
    };
    // (ruled water, planning's ruling of 2026-11-15: a course that runs beside one already traced, within `BESIDE.near`
    // tiles of it for `BESIDE.run` cells, joins it where that stretch begins, so the streams on one plain gather as a
    // land's do; River Valley 256² seed 9's three springs ran side by side down its floor like drawn lines)
    // (never on a sea's map, whose islands drain to the sea as dev's do: planning, 2026-11-15, D(water-tree) round 3)
    if (natural && !g.seaLayout && heads.length > 0 && opts.joins !== false) {
      const met = besideJoin(cells);
      if (met === null) {
        refused++;
        const o = besideSrc[cells[0]];
        if (o >= 0 && owner[o] >= 0) touched.add(owner[o]);
        lostAt = Math.min(lostAt, k);
        return false;
      }
      // (a join the course's own rules refuse, a tributary cut under its length or a link along the edge, leaves the course
      // as it ran: refused for the join, the head was lost and another taken in its place, and on Any 256² seed 6 one
      // between the two systems led the second's water out by the first's edge, a leak; dev's first map refused, 2 → 4
      // attempts)
      if (met && take(met.cells, met.joins, false)) {
        joined++;
        touched.add(k);
        touched.add(met.joins);
        return true;
      }
    }
    return take(cells, joins, toSea);
  };
  // edge inflows: low points of the upstream edges with long paths inland. When the player set the
  // Rivers setting, that many rivers enter (PLAN §5.3): if the first search finds too few, shorter
  // paths and closer heads are taken (a stream of its own, so other maps are as they were)
  // (D357: a long map's river enters at its near end, so the river runs its length: from springs alone it
  // began inland and reached half the map. A Rivers count the player set is kept; a sea's map keeps its own)
  if (lengthwise && !g.seaLayout && !g.hydro.exactInflows && !g.hydro.noInflows) g.hydro.inflows = Math.max(1, g.hydro.inflows);
  if (g.hydro.inflows > 0) {
    // (Canyon from 128² up prefers the mouth with the longest way across, so the main river crosses
    // the map and its gorge is a real stretch, not a corner's; Kyler's look at #261, seed 27. From 256²
    // up the way across is long anyway, and a longer one left the walled stretch too small a share of
    // the course for the theme's promise: there it weighs as on smaller maps, attempts-256)
    const lengthWeight = g.theme === "canyon" && side >= 128 && side < 256 ? 0.06 : 0.012;
    const search = (minLen: number, apart: number, r: Rng, n0: number, relaxed: boolean, separate = false): number => {
      const cands: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        if (!onUp(i)) continue;
        const e = edgeOf(i, W, H)!;
        const x = i % W;
        const y = (i - x) / W;
        const along = e === "west" || e === "east" ? y : x;
        const span = e === "west" || e === "east" ? H : W;
        if (along < 12 || along > span - 13) continue;
        if (downLen[i] < minLen * side || (relaxed && owner[i] >= 0)) continue;
        cands.push([-E[i] + lengthWeight * downLen[i] + 1.5 * r.float(), i]);
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
        if (downLen[i] < 0.35 * side || owner[i] >= 0) continue;
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
    // (D504: above 128², where a 128²'s few heads left three quarters of the land bare, the land is read as the soil's
    // moisture reaches it from the planned courses, by the game's own spreading (`moistCost`): the courses aim to bring
    // `WIDE_WANT` of the map within `MOIST_REACH`, and two more heads for each 128² of the map's area beyond the first go
    // to the land it leaves farthest)
    const R = STORY_REACH * side;
    const spread = wide > 1;
    if (spread) maxHeads += Math.round(REACH_HEADS * (wide - 1));
    const longWay = 0.35 * (spread ? 128 : side);
    let separateMore = 0;
    for (let more = 0; more < 4 * wide && heads.length < maxHeads; more++) {
      const wetP = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (owner[i] >= 0) wetP[i] = 1;
      const dist: ArrayLike<number> = spread ? moistCost(wetP, h, W, H) : distanceFrom(wetP, W, H);
      const reach = spread ? MOIST_REACH : R;
      let near = 0;
      for (let i = 0; i < N; i++) if (dist[i] <= reach) near++;
      if (near >= (spread ? WIDE_WANT : REACH_WANT) * N) break;
      const joinable = reachesOwned();
      const far: [number, number][] = [];
      const apart: [number, number][] = [];
      for (let y = 12; y < H - 12; y++)
        for (let x = 12; x < W - 12; x++) {
          const i = y * W + x;
          if (dist[i] <= reach || downLen[i] < longWay || owner[i] >= 0) continue;
          if (heads.some((hd) => Math.abs((hd.cell % W) - x) + Math.abs(Math.floor(hd.cell / W) - y) < 26)) continue;
          if (joinable.reach[i] && joinable.len[i] >= minTributary) far.push([dist[i] + 0.01 * downLen[i], i]);
          else apart.push([dist[i] + 0.01 * downLen[i], i]);
        }
      far.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      apart.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      let added = false;
      // (where no spring there joins them, one river of its own: a story reads with one river that
      // never joins the main one, D273 (1); D504: above 128² one for each 128² of the map's area, and
      // first where the land farthest from the water drains away from it, so the green spreads over
      // the whole map, not one side)
      const separateOk = separateMore < Math.floor(wide) && g.theme !== "riverValley";
      const separate = () => {
        for (const [, i] of apart.slice(0, 40)) if (trace({ cell: i, kind: "spring", flow: 0 }, false, false)) {
          added = true;
          separateMore++;
          break;
        }
      };
      const apartFirst = wide > 1 && separateOk && apart.length > 0 && (far.length === 0 || apart[0][0] > far[0][0]);
      if (apartFirst) separate();
      if (!added)
        for (const [, i] of far.slice(0, 40)) if (trace({ cell: i, kind: "spring", flow: 0 })) {
          added = true;
          break;
        }
      if (!added && separateOk && !apartFirst) separate();
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
        for (const [dx, dy] of N4) {
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
        for (const [dx, dy] of N4) {
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
        for (const [dx, dy] of N4) {
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
  // the main river cuts deeper than its tributaries: their valleys hang above it; the bigger rivers cut deeper and clear
  // wider floors (canyons)
  const hanging = Math.round(g.hanging);
  const cutOf = (k: number, flow: number) => 1 + (flow >= 1.2 ? Math.round(g.hydro.incise) : 0) + (k === mainK ? hanging : 0);
  const floorOf = (flow: number) => (flow >= 1.2 ? g.hydro.floor : g.hydro.floor * 0.3);
  const courses: Point[][] = [];
  const wanders: (Wander | null)[] = [];
  let deepWound = 0;
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
    // (a gorge winds at the map's own scale: `gorgeWander`; a course but the main river whose bed runs deep under a wall
    // for half its gorge's wavelength or more is one, whatever its planned cut, D(gorge-followups), unless Canyon's promise
    // was missed on this land with one wound so: such a tributary is often the canyon itself, in a slot a few tiles wide,
    // and its bends carry it and its floor out through the slot's thinner wall, Canyon 48² seed 18)
    const wv0 = natural ? wanderOf(g, widthFor(hd.flow)) : null;
    const gw = wv0 && floorOf(hd.flow) < GORGE_FLOOR ? gorgeWander(wv0, W, H) : null;
    const byCut = !!gw && gw !== wv0 && cutOf(tr.k, hd.flow) >= GORGE_CUT;
    const deep = !!gw && gw !== wv0 && !byCut && !g.hydro.tributariesKept && tr.k !== mainK && deepStretch(path, h, W, H, widthFor(hd.flow) / 2, floorOf(hd.flow), cutOf(tr.k, hd.flow)) >= gw.cell / 2;
    if (deep) deepWound++;
    const wv = byCut || deep ? gw : wv0;
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
      path = wandered;
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
          if (h[i] > level + 1 || (owner[i] >= 0 && owner[i] !== t.k)) continue;
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
      for (const [dx, dy] of N4) {
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
  // A course's hollows, read once (D453). A long valley is one hollow, and every sample of a river through it flooded
  // it again, each time once for every level its way out was cut down by: 30 million tiles a plan at 512 × 128, ten
  // times what a square map of that area floods, for the same answer each time. Within one course's profile the
  // ground stays as it is, so what a flood gives depends only on where it starts and the level it stays below: each is
  // kept and handed out again, in the same order, and what the first flood is read for (its size, its lowest tile) is
  // kept for the whole hollow. `newCourse` forgets them all: the course before it cut the ground.
  const kept = new Map<number, number[]>();
  const keptFlood = (from: number, below: number): number[] => {
    const key = Number.isInteger(below) && below >= 0 && below < 4096 ? from * 4096 + below : -1;
    let tiles = key >= 0 ? kept.get(key) : undefined;
    if (!tiles) {
      tiles = flood(from, below);
      if (key >= 0) kept.set(key, tiles);
    }
    return tiles;
  };
  /** A hollow as its first flood found it: the level it stood below, its size, its lowest ground, how many tiles
   *  stand that low and the one that does when it is the only one. */
  const basins: { below: number; size: number; low: number; lows: number; only: number }[] = [];
  const basinOf = new Int32Array(N).fill(-1);
  const newCourse = (): void => {
    kept.clear();
    basins.length = 0;
    basinOf.fill(-1);
  };
  /** The first tile at the hollow's lowest level, in the order a flood from `from` reaches them (the tile the
   *  hollow is cut down to): the flood, stopped there. */
  const firstLow = (from: number, below: number, low: number): number => {
    if (h[from] === low) return from;
    const seen = new Uint8Array(N);
    const q = [from];
    seen[from] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (seen[j] || h[j] >= below) continue;
        if (h[j] === low) return j;
        seen[j] = 1;
        q.push(j);
      }
    }
    return from;
  };
  const hollow = (seedCell: number, maxSill = Infinity): { tiles: number[]; sill: number } | null => {
    if (!(depth[seedCell] > 0)) return null;
    let sill = lv.filled[seedCell];
    // cut the outlet down until the lake fits the budget, and (M9b) until it stands below where its
    // river begins (`maxSill`)
    // (round 6, D432: an island sea is the map's water, not a lake of the budget: cut to it, a sea a
    // setting's lean had put over the budget drained to its floor)
    const sea = !!seaAt?.[seedCell];
    const cutMore = (size: number) => ((size > budget && !sea) || sill > maxSill) && sill > 1;
    // (the hollow's first flood, or what the one before it from this hollow found)
    let basin = basinOf[seedCell] >= 0 && basins[basinOf[seedCell]].below === sill ? basins[basinOf[seedCell]] : null;
    let tiles: number[] | null = null;
    let lowest = -1;
    if (!basin) {
      tiles = keptFlood(seedCell, sill);
      lowest = tiles.reduce((m, i) => (h[i] < h[m] ? i : m), tiles[0]);
      // (a seed standing at the level or over it is in its own flood only: such a flood is no other tile's)
      if (h[seedCell] < sill) {
        const low = h[lowest];
        let lows = 0;
        for (const i of tiles) if (h[i] === low) lows++;
        basin = { below: sill, size: tiles.length, low, lows, only: lows === 1 ? lowest : -1 };
        for (const i of tiles) basinOf[i] = basins.length;
        basins.push(basin);
      }
    }
    const size = basin ? basin.size : tiles!.length;
    if (!cutMore(size)) {
      if (sill > maxSill || size < 6) return null;
      return { tiles: tiles ?? keptFlood(seedCell, sill), sill };
    }
    if (lowest < 0) lowest = basin!.only >= 0 ? basin!.only : firstLow(seedCell, sill, basin!.low);
    // (every flood from here on starts at that lowest tile, so it stays the lowest and the first of each; a level
    // still over `maxSill` is cut down whatever its flood would hold, so it is not flooded)
    let cut: number[] = [];
    for (;;) {
      sill--;
      if (h[lowest] >= sill) return null;
      if (sill > maxSill && sill > 1) continue;
      cut = keptFlood(lowest, sill);
      if (!cutMore(cut.length)) break;
    }
    if (sill > maxSill || cut.length < 6) return null;
    return { tiles: cut, sill };
  };

  /** The bed along a path, sampled every tile of arc: never rising, `cut` levels below the lowest
   *  ground round it, and at a lake's outlet level where it leaves a lake. */
  const profileOf = (path: Point[], width: number, cut: number, withLakes: boolean, rid: string, half: (s: number, L: number) => number, startBed = Infinity, endBed = -Infinity, maxSill = Infinity, floorOthers = false) => {
    // An intentional plugged lake keeps its impoundment; it is a distinct water feature.
    const valleyMain = g.theme === "riverValley" && !g.intentions.includes("plug-lake") && rid === featureId(seed, "river", "river/main");
    if (withLakes) newCourse();
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
    const spillSets = new Map<number[], Set<number>>();
    const spillsUpstream = (lk: { tiles: number[]; sill: number }, j: number): boolean => {
      if (!natural) return false;
      // (a hollow's tiles are the same list each time it is read on this course, `keptFlood`)
      let inIt = spillSets.get(lk.tiles);
      if (!inIt) spillSets.set(lk.tiles, (inIt = new Set(lk.tiles)));
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
        // A flat valley's trunk stays below its upstream bed when it crosses a hollow.
        const lk = hollow(ci, valleyMain ? Math.min(maxSill, run + 1) : maxSill);
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
          // (its own list: the kept flood's stays as it was read)
          lakes.push({ tiles: lk.tiles.slice(), outletBed: lk.sill - 1, river: rid });
          inLake = id;
        }
      }
      if (inLake >= 0 && isIn && lakeOf[ci] === inLake) {
        prof[j] = Math.min(run, lakes[inLake].outletBed);
        lakeAt[j] = 1;
        continue;
      }
      if (inLake >= 0) {
        run = valleyMain ? Math.min(run, lakes[inLake].outletBed) : lakes[inLake].outletBed;
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
      if (mouthBank[i]) continue;
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

  const exits = new Map<string, { path: Point[]; prof: Float64Array; L: number; n: number; width: number; half: (s: number, L: number) => number }>();
  // (D530: the courses whose planned water would stand over their bank, read again once the land is shaped)
  const carry: CarryReach[] = [];
  // (each river's pools that held, by station: planned standing water a level under the reach below)
  const poolsOf = new Map<string, Set<number>>();
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
    const cut = cutOf(tr.k, hd.flow);
    const floorHalf = floorOf(hd.flow);
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
    // knickpoints: a steep reach's drops gather at its head; the reach below is cut to its foot (three levels or more;
    // with Waterfalls above the theme's own, `falls` 2, two: on ground with grade a river mostly crosses one-level
    // flanks, and many falls were too few, 2.0 a River Valley 96² map against the setting's 3 to 6)
    const win = Math.round(g.knick);
    const gather = g.falls === 2 ? 2 : 3;
    if (win > 0)
      for (let j = 0; j < n; j++) {
        if (!(prof[j + 1] < prof[j]) || lakeAt[j] || lakeAt[j + 1]) continue;
        let foot = -1;
        for (let k = j + 1; k <= Math.min(n, j + win); k++) {
          if (lakeAt[k]) break;
          if (prof[k] < prof[k - 1] && prof[j] - prof[k] >= gather) foot = k;
        }
        if (foot < 0) continue;
        // (with Waterfalls above the theme's own, the reach's drop is a cascade: falls of two levels or more, three tiles
        // apart at least, rather than one fall at its head; the bed never above where the reach had it)
        const T = prof[j] - prof[foot];
        const len = foot - j;
        const m = g.falls === 2 ? Math.max(1, Math.min(Math.floor(T / 2), Math.floor((len - 1) / 3) + 1)) : 1;
        let level = prof[j];
        for (let f = 0; f < m; f++) {
          level -= Math.floor(T / m) + (f < T % m ? 1 : 0);
          const to = f + 1 < m ? j + 1 + Math.floor(((f + 1) * len) / m) : foot;
          for (let k = j + 1 + Math.floor((f * len) / m); k < to; k++) prof[k] = Math.min(prof[k], level);
        }
        j = foot;
      }
    // Waterfalls above the theme's own (`falls` 2): a drop of four levels or more is a cascade, falls of two levels or
    // more a few tiles apart, its upper falls cut back into the reach above it (ground taken away, none raised, D111);
    // a fall at the course's head stays one
    if (g.falls === 2)
      for (let j = n; j >= 1; j--) {
        const drop = prof[j - 1] - prof[j];
        if (drop < 4 || lakeAt[j] || lakeAt[j - 1]) continue;
        const gap = 4;
        const a = j - gap;
        // (never a lake's outlet: cut, its sill would drain the lake)
        if (a < 1 || lakeAt[a - 1]) continue;
        let flat = true;
        for (let q = a; q < j; q++) if (lakeAt[q] || prof[q] !== prof[j - 1]) flat = false;
        if (!flat) continue;
        const lower = Math.ceil(drop / 2);
        for (let q = a; q < j; q++) prof[q] = prof[j] + lower;
        // (the upper part is looked at again, a cascade of three for a drop of six or more)
        j = a + 1;
      }
    // Waterfalls off: every drop spread along the course, a level a tile at most (the river cuts a
    // steady grade into the land above a cliff instead of falling over it); lakes keep their levels
    if (g.falls === 0) for (let j = n; j >= 1; j--) if (!lakeAt[j] && !lakeAt[j - 1] && prof[j - 1] > prof[j] + 1) prof[j - 1] = prof[j] + 1;
    // (D530, D373 (1), D26: a channel carries its water inside a bank a level over its bed. A big river's channel is
    // no wider than `MAX_WIDTH` and on the beds' floor can't be cut deeper: a long flat reach of it stood over its
    // bank and spread over the plain beside as a thin sheet, River Valley 256² seed 4's main river, 14.4 water/s
    // through ten tiles. Where its planned water would stand over its bank, the course is read again on the water's
    // own route once the land is shaped, and cut wider there over a broad flat, `carryChannels`; a river into the
    // sea stands at the sea's level, which no width changes)
    if (natural && !(tr.toSea && !exitEdge)) {
      const halfs: number[] = [];
      for (let j = 0; j <= n; j++) halfs.push(half((j * L) / n, L));
      const qAt = (j: number) => {
        let q = hd.flow;
        for (const jn of joined) if (jn.s <= (j * L) / n) q += jn.q;
        return q;
      };
      if (carryNeed(prof, lakeAt, L, n, (j) => 2 * halfs[j], qAt)) carry.push({ id: rid, path, L, n, prof: Array.from(prof), lakeAt: Array.from(lakeAt), halfs, floorHalf });
    }
    // pools: below a drop the water scours its bed a level deeper for a few tiles, where the reach
    // below is long enough to keep a lip (pools and riffles: standing water deep enough to pump)
    const bedOf = prof.slice();
    const poolAt: number[] = [];
    for (let j = 1; j <= n; j++) {
      if (!(prof[j - 1] - prof[j] >= 1) || prof[j] < BED_FLOOR + 1) continue;
      let level = 0;
      for (let q = j; q <= n && prof[q] === prof[j]; q++) level++;
      if (level >= 8) poolAt.push(j);
    }
    carve(st, bedOf, L, n, half, floorHalf);
    // (a pool is cut only inside banks that hold it: every tile beside it but its outflow, the
    // channel below it, stands at the pool's water, its bed above it, or higher; else its water finds
    // a lower way out, back by an inflow's own edge or over a low bank to another, and the course
    // check refuses the land (investigation attempts-256, cause A). Never a raised lip: where the
    // banks don't hold, the bed stays as it is)
    if (poolAt.length) {
      const poolTiles = new Map<number, number[]>();
      const inChannel = new Map<number, number>();
      for (const i of st.tiles) {
        if (mouthBank[i] || water[i] === 2 || !(st.d[i] < half(st.s[i], L))) continue;
        inChannel.set(i, Math.min(n, Math.max(0, Math.round((st.s[i] / L) * n))));
      }
      for (const j of poolAt) poolTiles.set(j, []);
      // (an inflow's pool holds only below the level its own edge lets water out at, beside its
      // mouth: the spill level with that edge draining, every inflow's mouth row sealed, on the land
      // as carved so far; at that level or over it, the pool's standing water runs back out there)
      let backFill: Float64Array | null = null;
      if (natural && hd.kind === "edge") {
        const e = hd.edge!;
        const mouths = new Set<number>();
        for (const m of mouthRows.values()) if (m.edge === e) for (const a of m.along) mouths.add(a);
        backFill = edgeBackFill(h, W, H, e, mouths);
      }
      for (const [i, k] of inChannel)
        for (const j of poolAt)
          if (k >= j && k < j + 3 && h[i] === prof[j]) poolTiles.get(j)!.push(i);
      for (const j of poolAt) {
        const tiles = poolTiles.get(j)!;
        if (!tiles.length) continue;
        const outflow = (q: number) => {
          const k = inChannel.get(q);
          return k !== undefined && k >= j + 3;
        };
        if (!poolHolds(h, W, H, tiles, prof[j], outflow, backFill)) continue;
        for (const i of tiles) h[i] = prof[j] - 1;
        const held = poolsOf.get(rid) ?? poolsOf.set(rid, new Set()).get(rid)!;
        for (let q = j; q < j + 3 && q <= n; q++) held.add(q);
        for (let q = j; q < j + 3 && q <= n; q++) bedOf[q] = prof[j] - 1;
      }
    }
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
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
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
    // (round 6: a river that ends in the sea fills it, its water leaving where the sea's does)
    const exit = tr.joins >= 0 ? { river: featureId(seed, "river", roleOf(tr.joins)) } : tr.toSea && !exitEdge ? { basin: path[path.length - 1] } : { edge: exitEdge ?? ("east" as Edge) };
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
            if (water[i] === 1 || water[i] === 2 || h[i] <= floor) {
              if (water[i] === 1 || water[i] === 2) ok = false;
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
    // (D527: a braided Lake Basin tries its other rivers too, the longest first, where the main one has no room for an
    // arm: its rivers are short ways into the lake, and Braided made no braid on most seeds). There the arm is drawn
    // within the river's longest reach clear of lakes and the edge, as long as that reach allows (16 tiles at least).
    const braidLake = g.theme === "lakeBasin" && g.hydro.braided;
    const more = braidLake ? rivers.slice(1).filter((r) => exits.has(r.id)).sort((a, c) => exits.get(c.id)!.L - exits.get(a.id)!.L || (a.id < c.id ? -1 : 1)) : [];
    arm: for (const river of [main, ...more]) {
      const m = exits.get(river.id)!;
      // (the longest clear reach, from s `dry0` to `dry1`, ending 6 tiles before the river's end)
      let dry0 = 0;
      let dry1 = m.L - 6;
      if (braidLake) {
        let run0 = -1;
        let best = 0;
        for (let j = 0; j <= m.n; j++) {
          const s = (j * m.L) / m.n;
          const { p } = pointAt(m.path, s);
          const ci = Math.round(p[1]) * W + Math.round(p[0]);
          const clear = s <= m.L - 6 && p[0] >= 4 && p[1] >= 4 && p[0] <= W - 5 && p[1] <= H - 5 && lakeOf[ci] < 0;
          if (!clear) run0 = -1;
          else {
            if (run0 < 0) run0 = s;
            if (s - run0 > best) [best, dry0, dry1] = [s - run0, run0, s];
          }
        }
        if (best < 18) continue;
      }
      for (let tries = 0; tries < 6; tries++) {
        // (M9b, "the river splits around a big island", D274: wider and longer)
        const drawn = (g.hydro.bigSplit ? 42 : 26) + (g.hydro.bigSplit ? 24 : 20) * rng.float();
        const len = braidLake ? Math.min(drawn, dry1 - dry0 - 2) : drawn;
        const at0 = rng.float();
        let s0 = braidLake ? dry0 + 1 + (dry1 - dry0 - 2 - len) * at0 : m.L * (0.2 + 0.45 * at0);
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
        const pa = profileOf(armCourse, aw, 1, false, river.id, ahalf, m.prof[j0], m.prof[j1]);
        carve(pa.st, pa.prof, pa.L, pa.n, ahalf, 0);
        markArm(pa.st, pa.L, ahalf);
        arms.push({ kind: "split", river: river.id, path: armCourse });
        break arm;
      }
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
    // Delta's fan is fed from the actual lake floor, not an outlet profile that can stand
    // above the lake's settled water. Do this before drawing any arm, so its bed shares it.
    if (fan) {
      const bed = m.prof.slice();
      let run = Infinity;
      for (let q = 0; q <= m.n; q++) {
        const s = q * m.L / m.n, {p:[px,py]} = pointAt(m.path, s);
        const r = m.half(s, m.L);
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++)
          for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W - 1, Math.ceil(px + r)); x++) {
            const i = y * W + x;
            if (water[i] === 2 && (x-px)*(x-px)+(y-py)*(y-py) < r*r) run = Math.min(run, h[i]);
          }
        run = Math.max(BED_FLOOR, Math.min(run, bed[q]));
        bed[q] = run;
      }
      const st = stamp(m.path, W, H, Math.ceil(m.width / 2 + 3));
      carve(st, bed, m.L, m.n, m.half, 0);
      m.prof.set(bed);
      const steps: BedStep[] = [];
      for (let q = 1; q <= m.n; q++) if (bed[q-1] > bed[q])
        steps.push({at:Math.round(q * m.L / m.n * 100)/100,drop:bed[q-1]-bed[q]});
      main.params.bedProfile = {start:bed[0],steps};
    }

    const s0Drawn = fan ? m.L * (0.33 + 0.32 * rng.float()) : Math.max(m.L * 0.55, m.L - (26 + 18 * rng.float()));
    // (D357: down a long map the fan opens in its last stretch, about as long as the map is wide, the
    // river running the length above it; drawn from a third of the way down, its arms ran side by side
    // for hundreds of tiles)
    const s0 = fan && mapShape(W, H).long ? Math.max(s0Drawn, m.L - 1.2 * Math.min(W, H)) : s0Drawn;
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
    const deltaGround = fan ? h.slice() : null;
    const armBeds: { prof: Float64Array; L: number; n: number; course: Point[]; st: Stamp; half: (s:number,L:number)=>number }[] = [];
    const braidBeds: typeof armBeds = [];
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
      const armPath = fan && natural ? deltaCourse(p0, [ex, ey], E, W, H, gap, hash32(seed, "delta-course", attempt, a)) : smoothPath(pts, 1, 1);
      // (D416: a fan's arms narrower, each carrying its share of the river half a level deep, never
      // a pale sheet across the fan)
      const aw = Math.max(MIN_WIDTH, Math.round((fan ? 0.55 : 0.6) * m.width * 10) / 10);
      // (D416: a fan's arms wander as rivers do, never a ruled curve)
      const awv = natural ? (fan ? { ...wanderOf(g, aw), amp: clamp(gap * 0.18, 3.5, 7), minAmp: 2.8, cell: clamp(gap * 1.5, 16, 28), widthVar: 0.5 } : { ...wanderOf(g, aw), amp: 1.5, minAmp: 1 }) : null;
      const armCourse = awv ? meanderPath(armPath, fan ? deltaGround! : h, W, H, awv, hash32(seed, "arm", attempt, 1 + a)) : armPath;
      const aws = hash32(seed, "arm-width", attempt, 1 + a);
      const ahalf = (s: number, L: number) => fan ? Math.max(MIN_WIDTH / 2, halfWidthAt(aw, awv, aws, s, L)) : halfWidthAt(aw, awv, aws, s, L);
      const j0 = Math.round((s0 / m.L) * m.n);
      const pa = profileOf(armCourse, aw, 1, false, main.id, ahalf, fan ? Math.max(BED_FLOOR, Math.min(m.prof[j0], deltaGround![Math.round(clamp(p0[1], 0, H - 1)) * W + Math.round(clamp(p0[0], 0, W - 1))]) - 1) : m.prof[j0]);
      carve(pa.st, pa.prof, pa.L, pa.n, ahalf, fan ? 1.8 : 0);
      markArm(pa.st, pa.L, ahalf);
      // A short second thread round an island on a flat reach; both threads keep one bed.
      // This never adds a new mouth or changes the fan's slots, and never cuts a lower shortcut.
      if (fan && natural && a % 2 === 0 && pa.L > 38) {
        const bs = hash32(seed, "delta-braid", attempt, a);
        const sA = pa.L * (0.38 + 0.12 * fbm(bs, 0, 0, 3, 1));
        const sB = Math.min(pa.L - 9, sA + 20 + 6 * fbm(bs, 1, 0, 3, 1));
        const ja = Math.round(sA / pa.L * pa.n), jb = Math.round(sB / pa.L * pa.n);
        const bed = pa.prof[ja];
        let flat = sB - sA >= 16, lo = Infinity, hi = -Infinity;
        for (let q = ja; q <= jb; q++) {
          if (pa.prof[q] !== bed) flat = false;
          const [x, y] = pointAt(armCourse, q * pa.L / pa.n).p;
          const z = deltaGround![Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
          lo = Math.min(lo, z);hi = Math.max(hi, z);
        }
        if (flat && hi - lo <= 1) {
          const branch: Point[] = [], side = (bs & 1) ? 1 : -1;
          let clear = true;
          for (let q = 0; q <= 24; q++) {
            const t = q / 24, {p, n} = pointAt(armCourse, sA + t * (sB - sA));
            const off = side * clamp(gap * 0.28, 4.5, 7) * sinDet(TWO_PI * t / 2);
            const x = p[0] + n[0] * off, y = p[1] + n[1] * off;
            if (x < 3 || y < 3 || x > W - 4 || y > H - 4) {clear = false;break;}
            const i = Math.round(y) * W + Math.round(x);
            if (q > 5 && q < 19 && water[i]) clear = false;
            branch.push([x, y]);
          }
          if (clear) {
            const width = Math.max(1.8, aw * 0.75), half = () => width / 2;
            const bp = profileOf(branch, width, 1, false, main.id, half, bed, bed);
            bp.prof.fill(bed);carve(bp.st, bp.prof, bp.L, bp.n, half, 1.2);markArm(bp.st, bp.L, half);
            braidBeds.push({prof:bp.prof,L:bp.L,n:bp.n,course:branch,st:bp.st,half});
            arms.push({kind:"split", river:main.id, path:branch});
          }
        }
      }
      armBeds.push({ prof: pa.prof, L: pa.L, n: pa.n, course:armCourse, st:pa.st, half:ahalf });
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
      // Delta's threads share a falling bed at each downstream position across the fan.
      // Arc length differs when a thread bends: comparing equal arc distances let the lower
      // thread steal the whole flow. Recut all threads before the land is shown, never raise one.
      const axis = alongEdge ? 0 : 1, sign = e === "west" || e === "south" ? -1 : 1;
      const bins = Math.max(1, Math.ceil(reach));
      const level = new Float64Array(bins + 1).fill(Infinity);
      const plans = [...armBeds, {prof:pb.prof,L:pb.L,n:pb.n,course:below,st:pb.st,half:bhalf}];
      const at = (p: Point) => Math.round(clamp(sign * (p[axis] - p0[axis]), 0, bins));
      for (const plan of plans) for (let q = 0; q <= plan.n; q++) {
        const row = at(pointAt(plan.course, q * plan.L / plan.n).p);
        level[row] = Math.min(level[row], plan.prof[q]);
      }
      let run = m.prof[j0];
      for (let q = 0; q <= bins; q++) {run = Math.min(run, level[q]);level[q] = run;}
      for (const plan of [...plans, ...braidBeds]) {
        for (let q = 0; q <= plan.n; q++) plan.prof[q] = Math.min(plan.prof[q], level[at(pointAt(plan.course, q * plan.L / plan.n).p)]);
        carve(plan.st, plan.prof, plan.L, plan.n, plan.half, 1.8);
      }
      const bed = pb.prof.slice();
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
  // (a Delta's course that leaves by an edge of its own, crossed by a fan's arm or running on its
  // bank: the arm takes its water there and carries it to the fan's mouths, and the water left its
  // course by another edge than its own (attempts-256: Delta's springs on the floor). It joins the
  // main river there by plan: above the crossing a tributary, run down to the arm below (D447); below
  // it one more of the fan's mouths, carrying the fan's water as the arms do. Nothing is raised to
  // keep them apart)
  const joinedAt = new Map<string, number>();
  const fanMain = g.theme === "delta" ? rivers.find((r) => r.role === "river/main") : undefined;
  if (natural && fanMain && arms.some((a) => a.kind === "mouth"))
    for (const r of rivers) {
      if (r === fanMain || !("edge" in r.params.exit)) continue;
      const m = exits.get(r.id);
      if (!m) continue;
      let at = -1;
      for (let s = 0; s <= m.L && at < 0; s += 1) {
        const {
          p: [px, py],
        } = pointAt(m.path, s);
        const R = m.half(s, m.L) + 1;
        for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)) && at < 0; y++)
          for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++)
            if (armTiles[y * W + x] && (x - px) * (x - px) + (y - py) * (y - py) <= R * R) {
              at = s;
              break;
            }
      }
      if (at < 0) continue;
      joinedAt.set(r.id, at);
      r.params.exit = { river: fanMain.id };
    }
  // (D447: an arm, cut after the rivers, crossing a tributary's course or running on its bank lower
  // than its bed takes its water there, and the tributary's course on stood dry to its join: from
  // there it runs at the arm's level, its channel holding water to the river it joins. Its
  // feature's bed follows)
  if (natural && arms.length)
    for (const r of rivers) {
      if (!("river" in r.params.exit) && !(g.theme === "delta" && r.role === "river/main")) continue;
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
  for (const [id, at] of joinedAt) {
    const r = rivers.find((o) => o.id === id)!;
    const m = exits.get(id)!;
    const upper: Point[] = [];
    for (let s = 0; s < at; s += 1) upper.push(pointAt(m.path, s).p);
    upper.push(pointAt(m.path, at).p);
    const tail: Point[] = [];
    for (let s = at; s < m.L; s += 1) tail.push(pointAt(m.path, s).p);
    tail.push(m.path[m.path.length - 1]);
    if (upper.length < 2) upper.push(pointAt(m.path, Math.min(m.L, at + 1)).p);
    r.params.path = upper;
    r.params.bedProfile = { start: r.params.bedProfile.start, steps: r.params.bedProfile.steps.filter((b) => b.at <= at) };
    if (tail.length >= 2) arms.push({ kind: "mouth", river: fanMain!.id, path: tail });
  }
  // The trunk can drain a lake while later rivers are carved. River Valley keeps that
  // lake's closed core, rather than a broad spent shelf marked as standing water.
  // Compact ponds and oxbows keep their outline; intentional plugged lakes keep their storage.
  if (natural && g.theme === "riverValley" && !g.intentions.includes("plug-lake")) {
    const spill = drainage(h, W, H, { eight: false }).filled;
    let trimmed = false;
    for (const lk of lakes) {
      const shelf = lk.tiles.filter((i) => h[i] >= spill[i]);
      if (shelf.length <= 0.02 * N) continue;
      lk.tiles = lk.tiles.filter((i) => h[i] < spill[i]);
      if (lk.tiles.length) lk.outletBed = Math.min(lk.outletBed, lk.tiles.reduce((lo, i) => Math.min(lo, spill[i]), Infinity) - 1);
      trimmed = true;
    }
    if (trimmed) {
      for (let i = 0; i < N; i++) if (water[i] === 2) water[i] = 3;
      for (const lk of lakes) for (const i of lk.tiles) water[i] = 2;
      for (const m of exits.values()) carve(stamp(m.path, W, H, Math.ceil(m.width / 2 + 3)), m.prof, m.L, m.n, m.half, 0);
      for (let k = lakes.length - 1; k >= 0; k--) if (lakes[k].tiles.length < 6) lakes.splice(k, 1);
    }
  }
  // (a channel is never left lower than its own reach downstream: a later river's cut, or a lake's
  // carving, can leave a stretch of a course under the bed it runs on to, and the water held there
  // finds another way out, by a lower bank to another edge (attempts-256, Any's leaks). The reach
  // downstream is cut down to it, on into the river it joins, to its exit; a planned lake or a
  // held pool is standing water by design and starts the reach below it afresh. Only ground is
  // taken away)
  if (natural) {
    const byStation = new Map<string, number[][]>();
    const stationsOf = (id: string): number[][] => {
      const known = byStation.get(id);
      if (known) return known;
      const m = exits.get(id)!;
      const st = stamp(m.path, W, H, Math.ceil(m.width / 2 + 1));
      const out: number[][] = Array.from({ length: m.n + 1 }, () => []);
      for (const i of st.tiles) if (st.d[i] < m.half(st.s[i], m.L)) out[Math.min(m.n, Math.max(0, Math.round((st.s[i] / m.L) * m.n)))].push(i);
      byStation.set(id, out);
      return out;
    };
    const byId = new Map(rivers.map((r) => [r.id, r]));
    const lowerFrom = (r: RiverFeature, from: number, start: number, depth: number): void => {
      const m = exits.get(r.id);
      if (!m || depth > 8) return;
      const tiles = stationsOf(r.id);
      const pools = poolsOf.get(r.id);
      // (a Delta course joined to an arm ends where it meets it: below, it is one of the fan's mouths)
      const joined = joinedAt.get(r.id);
      const last = joined === undefined ? m.n : Math.min(m.n, Math.round((joined / m.L) * m.n));
      let level = start;
      for (let j = from; j <= last; j++) {
        const at = tiles[j];
        if (!at.length) continue;
        let bed = Infinity;
        let lake = false;
        for (const i of at) {
          if (water[i] === 2) lake = true;
          bed = Math.min(bed, h[i]);
        }
        if (lake || pools?.has(j)) {
          level = Infinity;
          continue;
        }
        if (bed > level) {
          for (const i of at) if (h[i] > level && !mouthBank[i] && water[i] !== 2) h[i] = level;
          bed = level;
        }
        level = Math.min(level, bed);
      }
      const ex = r.params.exit;
      if (!("river" in ex) || level === Infinity) return;
      const to = byId.get(ex.river);
      const tm = to ? exits.get(to.id) : undefined;
      if (!to || !tm) return;
      // (on into the river it joins, from the station nearest its end)
      const [ex0, ey0] = r.params.path[r.params.path.length - 1];
      let best = Infinity;
      let k0 = 0;
      for (let j = 0; j <= tm.n; j++) {
        const [px, py] = pointAt(tm.path, (j * tm.L) / tm.n).p;
        const d = (px - ex0) * (px - ex0) + (py - ey0) * (py - ey0);
        if (d < best) {
          best = d;
          k0 = j;
        }
      }
      lowerFrom(to, k0, level, depth + 1);
    };
    for (const r of rivers) lowerFrom(r, 0, Infinity, 0);
  }
  return { rivers, water, lakes, falls, arms, flowTotal, joined: joined + refused, joinedRivers: [...heads.keys()].filter((k) => touched.has(k) || k >= lostAt).map((k) => featureId(seed, "river", roleOf(k))).filter((id) => rivers.some((r) => r.id === id)), ...(deepWound ? { deepWound } : {}), ...(carry.length ? { carry } : {}) };
}

/** River Valley tries two courses around a drawn cliff and retains the stronger split.
 *  Both use the same field; only existing ground is carved, before the land stage. */
export function planHydro(E: Float64Array, h: Uint8Array, g: Genome, seed: number, W: number, H: number, attempt: number, opts: HydroOptions = {}): Hydro {
  const cliffDraw = g.theme === "riverValley" && opts.meander !== false && !g.hydro.exactInflows && (g.intentions.includes("upper-lower") || g.intentions.includes("under-cliff"));
  if (!cliffDraw) {
    // River Valley's default trunk enters from an upstream edge and crosses half the map, or the land
    // has no rivers and is drawn again (#346): on a straight slope the sides drain too, and most
    // ways in from the upstream edge leave by a side before they cross half the map, or hug it. A land
    // with no such way in looks again with its sides as edges the trunk may enter by, the water
    // leaving by the downstream edge alone (its land falls that way, so the river turns down it): River
    // Valley 128², seeds 1–30, drew 13 lands again for no rivers where it drew 33. A land whose first
    // look found its trunk keeps it.
    const again = g.theme === "riverValley" && opts.meander !== false && g.tiltKind !== "radial" && downstreamEdges(g.flowDir).length === 1 && !g.hydro.exactInflows && !g.hydro.noInflows && !g.intentions.includes("upper-lower") && !mapShape(W, H).long;
    const original = again ? h.slice() : null;
    const hy = planHydroSingle(E, h, g, seed, W, H, attempt, opts);
    if (hy.rivers.length || !original) return hy;
    h.set(original);
    return planHydroSingle(E, h, g, seed, W, H, attempt, { ...opts, across: true });
  }
  // A full-map escarpment remains a split; stairs can connect its worlds.
  if (g.intentions.includes("upper-lower")) g.ramps = Math.min(g.ramps, 0.1);
  const original = h.slice();
  const first = planHydroSingle(E, h, g, seed, W, H, attempt, opts);
  const alternateH = original.slice();
  const alternate = planHydroSingle(E, alternateH, g, seed, W, H, attempt + 1, opts);
  const span = (ground: Uint8Array): number => {
    const top = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && ground[i] - ground[yy * W + xx] >= 3) top[i] = 1;
      }
    }
    let best = 0;
    for (let s = 0; s < top.length; s++) {
      if (!top[s] || seen[s]) continue;
      const q = [s]; seen[s] = 1;
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k], x = i % W, y = Math.floor(i / W);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (top[j] && !seen[j]) { seen[j] = 1; q.push(j); }
        }
      }
      best = Math.max(best, (x1 - x0 + 1) / W, (y1 - y0 + 1) / H);
    }
    return best;
  };
  if (alternate.rivers.length && span(alternateH) > span(h)) { h.set(alternateH); return alternate; }
  return first;
}

export type { Rng };
