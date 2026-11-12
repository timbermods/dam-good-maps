// Dry washes and an old bed across the dry land (D517; planning's ruling on #236, 2026-11-12, item 2): each of the
// game's own maps has one or two winding dry channels, a bed two or three tiles wide and a level or two deep,
// meandering between the mesas. One pass shared by every generator path (the themes' land stage, `gen/generate.ts`, and
// the premises' ground, `premise/generate.ts`), run on the finished land before its water settles.
//
// They are a net at the map's scale, one or two main washes per map (60 to 150 tiles long on a 128² map, 28 at least
// where the land gives no longer line), each with side branches where the flow joins it, never a gully on every plate:
// each runs where rain would run (the flow the priority flood gives on the land, softened, warped and tipped up toward
// the map's edge, so its line follows the land's own curves and crosses the dry land, not its shores), from its head
// down to its end. A bed follows its warped line, swung by a slow sideways meander, walked as long straight treads
// (each reach 3 tiles at least before it steps aside, D518), 3 wide (a branch 2), its teeth closed: its banks are long
// straight runs with a step now and then, never a staircase of ones. Its floor is a level under the lowest ground
// beside it, two at most: over a sill the floor rises with the land, as a dry wash's floor is uneven. It ends at water
// (a lake or a river), short of the water by a lip a level over the water's own level, so a dam that lifts the water or
// a notch in the lip lets it in; or in a dry hollow one or two levels under the land round it that fills when water is
// led in. One old bed a map, where a lake has the room: a sinuous one-level trough from just behind a lake's lip out
// into the dry land, its floor at the lake's own level, so one notch in the lip (or a levee's gap) sets it running
// again.
//
// The point is irrigation: a player who dams a wash's mouth or leads a canal into it greens its floor first. So the
// beds keep off what the start keeps (its walk, its ground all round and its ways out, `startKeepOff`, and the caller's
// `keepOff`), off the water and a lake's rim (no tile beside water is cut, and none within two tiles of it goes under
// that water's level plus one), and they move no water: a dry bed, a dry hollow and a lip. Nor do they take land from
// the walk: a bed has fords, as a dry wash has, where its bank slopes down to its floor and up again a level at a step
// (at its head, its shallow end, every 15 to 25 tiles along it, and wherever it would part the land's level walk,
// `cutsWalk`); where no ford can rejoin a part, the bed is left uncut beside it (the land's own crossing). A bed that
// still parts the walk, that leaves a place a start may take short of its bench, or whose hollow is left under five
// tiles, is undone.

import { fbm, valueNoise } from "../math/noise";
import type { Rng } from "../math/rng";
import { levelRegions, MinHeap } from "../math/grid";
import { sqrt } from "../math/portable";
import { walkDistance } from "../analysis/walk";

/** The pass's numbers. */
export const WASHES = {
  /** Main washes on a 128² map, by area elsewhere (one at least where the land gives one). */
  per128: [1, 2] as const,
  /** A main wash's length along its line, tiles: at least (or, where the land gives none that long, the fallback),
   *  and at most, on a 128² map (by side elsewhere). */
  least: 60,
  fallback: 28,
  most: 150,
  /** Side branches joining a wash where the flow joins it: each one's chance (the first wherever the land gives one),
   *  at least this long and this far apart along the wash. */
  branch: [1, 0.5] as const,
  branchLeast: 14,
  branchApart: 16,
  /** Land draining through a tile, tiles: where a wash begins, and where it ends at least. */
  headArea: 4,
  trunkArea: 120,
  /** The trunk ends a pick weighs (by the land draining through them, the most first). */
  look: 48,
  /** Washes' lines at least this far apart (Chebyshev), but where a branch joins. */
  apart: 14,
  /** No bed within this many tiles of the map's edge; and the flow's land tipped up toward the edge over this width, by
   *  this much a tile (levels), so no line runs along it. */
  edge: 8,
  wall: { width: 16, rise: 0.35 },
  /** A wash's line within this many tiles of the water runs along a shore: a pick weighs its length less by this share
   *  of such points, so the washes cross the dry land. */
  shore: 6,
  shoreCost: 0.75,
  /** The land the flow is read on: the heights softened over this radius and warped by noise of this cell and
   *  amplitude (levels), so a line on a flat follows the noise's curves and a line on a slope runs down it. */
  blur: 4,
  warp: { cell: 10, amp: 0.9 },
  /** The bed's width, tiles: a main wash's and the old bed's, a branch's (planning's ruling on #236, 6825985686: a
   *  bed 3 wide on the main line and 2 on its branches, its banks straight). */
  width: { main: 3, branch: 2 },
  /** Each straight reach of a bed runs at least this many tiles along an axis before it steps aside: a diagonal is
   *  long treads, never a staircase of ones (6825985686). */
  tread: 3,
  /** The sideways meander: at most this far off the flow's line, with this wavelength. */
  meander: 3,
  meanderCell: 16,
  /** The centre line smoothed over this many points each side. */
  smooth: 2,
  /** The deepest a bed cuts under the lowest ground beside it: deeper and it ends there, in a hollow. */
  cutMost: 2,
  /** A dry hollow at a wash's end: its radius and how deep under the land round it (its ring at the bed's floor, a
   *  level under the land; a two-deep one's core a level under that), and its least tiles (a bed whose hollow the
   *  ramps' pass leaves smaller is undone). */
  hollow: { radius: [2.0, 3.0] as const, depth: [1, 2] as const, least: 5 },
  /** The old bed: its length, and the most its ground at the lake's end stands over the lake's level. */
  old: { least: 16, most: 44, rim: 2 },
  /** The start's ground the beds keep off (`startKeepOff`): its walk out to this many tiles (its farmland's, forester's
   *  and fast wood's 20, and a margin where the start is chosen after the washes, near a place it may take; the
   *  premises' start is put first, `startPut`), and its ways out with this margin. Its bench past that a bed may
   *  cross, so long as it keeps the bench it needs (`WashInput.bench`). */
  startWalk: 32,
  startPut: 20,
  /** And all the ground within this many tiles of it (Chebyshev), on any level: a bed cut beside the start's ground,
   *  even where the colony can't walk to it, moves the moisture and the planting its wood and forester's plot read. */
  startBox: 28,
  wayMargin: 1,
  /** A strip the caller keeps (a way out, a mine's way) no wider than this along the line, tiles, a bed passes uncut
   *  and goes on beyond: the land's own ford. */
  gap: 6,
  /** The fords: where a bank slopes down to the bed's floor and up the other side, a natural ramp at each level (a
   *  lane cut into the bank, at most `lane` tiles long), every `every` tiles along a bed and at its head (its shallow
   *  end); and wherever the walk needs one (`cutsWalk`), so a bed takes no land from the start's walk (`start.reach`).
   *  Within `clear` tiles (Chebyshev) of a place a start may take only the fords the walk needs go in: there the
   *  build's own slopes join the start's ground (their tree reaches 40 tiles out, `features/slopes.ts`), and a ford
   *  would hold one of theirs off within their spacing (12). */
  ford: { every: [15, 25] as const, lane: 6, clear: 40 },
  /** Where no ford rejoins a part of the land a bed cut off, the bed is left uncut within this many tiles (Chebyshev)
   *  of the part's ground beside it: the land's own crossing. */
  bridge: 3,
  /** A part of a level region a bed cuts off with less ground than this, tiles, is let go (a pocket by the bed's side);
   *  a bed that parts a region into two bigger parts no ford rejoins, or that the colony can't step into, is undone. */
  pocket: 12,
  /** Canyon's side canyons (D518; planning's ruling on #236, 6814608915, item 4: the game's Canyon has real cliffs and
   *  side valleys): on Canyon's land the washes are canyons, more of them, cut `cut[0]` under the lowest ground beside
   *  them (`cut[1]` at most, over a sill), `width` tiles across (a branch the second), so their walls stand three levels and
   *  more, each deepening a level every `deepen` tiles from its head and its floor falling a level at a time while the
   *  land lets it; their fords climb a level at each step as a wash's do, a lane as long as the wall asks, and a
   *  stretch of floor the colony can't step into gets one of its own. The old bed stays a trough at its lake's level. */
  canyon: { per128: [2, 3] as const, cut: [3, 4] as const, width: { main: 4, branch: 3 }, deepen: 4 },
} as const;

export interface WashInput {
  W: number;
  H: number;
  /** The land: cut where the beds and hollows go. */
  heights: Uint8Array;
  /** The water's surface level on each water tile (planned or pre-filled); NaN on dry ground. */
  surface: Float64Array;
  /** The standing lakes, each its tiles: the old bed starts behind one's lip. */
  lakes: readonly (readonly number[])[];
  /** Ground the beds keep off: the start's ground and ways out, objects' squares, the works'. */
  keepOff: Uint8Array;
  /** The lowest a bed's floor goes (the beds' floor, `genome.ts` `BED_FLOOR`). */
  floor: number;
  rng: Rng;
  /** The noise's seed (the warp, the meander and the widths). */
  seed: number;
  /** The places a start may take: a ford where a bed passes near one (`WASHES.ford.startNear`). */
  starts?: readonly { x: number; y: number }[];
  /** The bench a start needs, tiles (`FLOOR_MARGIN` × `start.level_land`'s floor): a bed may cross the level plate a
   *  start may take (each place in `starts`, and each tile `benchPlates` marks) so long as the part each start stands
   *  on, and the plate's largest part, keep this much ground at its level. */
  bench?: number;
  benchPlates?: Uint8Array;
  /** Canyon's land: the washes are its side canyons (`WASHES.canyon`). */
  canyon?: boolean;
}

export interface Wash {
  kind: "wash" | "branch" | "old";
  /** Where it ends: short of water by its lip, in a dry hollow, or in another wash. */
  end: "water" | "hollow" | "join";
  /** Its centre line, head to mouth, tiles. */
  line: number[];
  /** The floor at each point of the line. */
  floor: number[];
  /** The tiles it cut. */
  tiles: number[];
  /** The hollow at its end, when it ends in one. */
  hollow?: number[];
}

export interface Washes {
  beds: Wash[];
  /** Each bed tile and hollow tile (1 + the bed's index). */
  mask: Uint16Array;
  /** Natural ramps into the beds and hollows, (low tile, high tile) pairs: the colony walks into them and across. */
  steps: [number, number][];
}

/** A dry hollow's tiles and each one's floor. */
interface Hollow {
  tiles: number[];
  floors: number[];
}

/** A filled pit's tiles stand this much over the one they drain to, so a flat drains. */
const FILL_EPS = 1e-6;
/** A diagonal step's drop counts by 1/√2. */
const DIAG = 0.7071067811865476;
const N8X = [1, -1, 0, 0, 1, 1, -1, -1];
const N8Y = [0, 0, 1, -1, 1, -1, 1, -1];
const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The heights softened over `r` tiles (a box blur, done twice: rows then columns). */
function soften(h: ArrayLike<number>, W: number, H: number, r: number): Float64Array {
  const a = new Float64Array(W * H);
  const b = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= W) continue;
        s += h[y * W + xx];
        n++;
      }
      a[y * W + x] = s / n;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= H) continue;
        s += a[yy * W + x];
        n++;
      }
      b[y * W + x] = s / n;
    }
  return b;
}

/** Where rain would run on `F`: the priority flood (`drainage.ts`'s, eight ways) from the water (the map's edge is a
 *  wall, as the game's is, so the land drains to its water and the lines run long) fills every pit a hair over its spill, and each tile then sends its rain down the steepest way on the filled surface, so
 *  the flow gathers into the land's valleys (a flood's own receivers run in parallel down a slope and never gather).
 *  Each tile's receiver (-1 at an outlet), the land draining through it, and the tiles from the lowest up (`order`'s
 *  first `n`). */
function flow(
  F: Float64Array,
  wet: Uint8Array,
  W: number,
  H: number,
): { rcv: Int32Array; area: Float64Array; order: Int32Array; n: number } {
  const N = W * H;
  const seen = new Uint8Array(N);
  const filled = new Float64Array(N);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  const outlet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (wet[i]) {
      seen[i] = 1;
      outlet[i] = 1;
      filled[i] = F[i];
      heap.push(F[i], i);
    }
  }
  let n = 0;
  while (heap.size) {
    const c = heap.pop();
    const lv = heap.lastKey;
    if (lv > filled[c]) continue;
    order[n++] = c;
    const x = c % W;
    const y = (c - x) / W;
    for (let k = 0; k < 8; k++) {
      const xx = x + N8X[k];
      const yy = y + N8Y[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (seen[j]) continue;
      seen[j] = 1;
      filled[j] = F[j] > lv + FILL_EPS ? F[j] : lv + FILL_EPS;
      heap.push(filled[j], j);
    }
  }
  const rcv = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (outlet[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    let best = -1;
    let drop = 0;
    for (let k = 0; k < 8; k++) {
      const xx = x + N8X[k];
      const yy = y + N8Y[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const d = (filled[i] - filled[j]) * (k < 4 ? 1 : DIAG);
      if (d > drop) {
        drop = d;
        best = j;
      }
    }
    rcv[i] = best;
  }
  // (accumulated from the highest filled tile down: the flood's order reversed)
  const area = new Float64Array(N).fill(1);
  for (let k = n - 1; k >= 0; k--) {
    const r = rcv[order[k]];
    if (r >= 0) area[r] += area[order[k]];
  }
  return { rcv, area, order, n };
}

/** A line's points (tile centres), smoothed and swung sideways by the meander. */
function curveOf(line: readonly number[], W: number, seed: number, smooth: number): { x: number[]; y: number[] } {
  const n = line.length;
  const px = line.map((i) => i % W);
  const py = line.map((i) => (i - (i % W)) / W);
  const sx: number[] = [];
  const sy: number[] = [];
  for (let s = 0; s < n; s++) {
    let ax = 0;
    let ay = 0;
    let c = 0;
    for (let k = -smooth; k <= smooth; k++) {
      const j = Math.min(n - 1, Math.max(0, s + k));
      ax += px[j];
      ay += py[j];
      c++;
    }
    sx.push(ax / c);
    sy.push(ay / c);
  }
  // (the meander: a slow swing across the line's own direction, nothing at its two ends)
  const x: number[] = [];
  const y: number[] = [];
  for (let s = 0; s < n; s++) {
    const a = Math.max(0, s - 2);
    const b = Math.min(n - 1, s + 2);
    let tx = sx[b] - sx[a];
    let ty = sy[b] - sy[a];
    const len = sqrt(tx * tx + ty * ty) || 1;
    tx /= len;
    ty /= len;
    const fade = Math.min(1, s / 6, (n - 1 - s) / 6);
    const off = WASHES.meander * fade * valueNoise(seed, s, 0, WASHES.meanderCell);
    x.push(sx[s] - ty * off);
    y.push(sy[s] + tx * off);
  }
  return { x, y };
}

/** A curve's tread path (6825985686): its tiles walked 4-connected, each straight reach `tread` steps at least before
 *  it steps aside (a step aside waits until the curve has drifted `tread` tiles off, then takes them all at once), so a
 *  diagonal is long treads, never a staircase of ones. Per curve point, the path's tiles it reaches (at least the one
 *  the path stands on). */
export function treadsOf(x: readonly number[], y: readonly number[], W: number, H: number, tread: number): number[][] {
  const n = x.length;
  const out: number[][] = [];
  const clampX = (v: number) => Math.min(W - 1, Math.max(0, Math.round(v)));
  const clampY = (v: number) => Math.min(H - 1, Math.max(0, Math.round(v)));
  const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  // (the path's position and the curve's; the steps the path owes each axis, signed; the way it walks, 0 none, ±1
  // along x, ±2 along y)
  let px = clampX(x[0]);
  let py = clampY(y[0]);
  let gx = px;
  let gy = py;
  let owedX = 0;
  let owedY = 0;
  let dir = 0;
  for (let s = 0; s < n; s++) {
    const here: number[] = [];
    const walk = (ax: number, ay: number, k: number) => {
      for (let j = 0; j < k; j++) {
        px += ax;
        py += ay;
        here.push(py * W + px);
      }
    };
    const tx = clampX(x[s]);
    const ty = clampY(y[s]);
    while (gx !== tx || gy !== ty) {
      // (one step of the curve, along the axis it has further to go)
      const alongX = Math.abs(tx - gx) >= Math.abs(ty - gy);
      const sg = alongX ? sign(tx - gx) : sign(ty - gy);
      if (alongX) gx += sg;
      else gy += sg;
      const d = alongX ? sg : 2 * sg;
      const owed = alongX ? owedX : owedY;
      if (owed !== 0 && sign(owed) !== sg) {
        // (the curve swings back: what was owed is forgiven)
        if (alongX) owedX += sg;
        else owedY += sg;
      } else if (dir === d) walk(alongX ? sg : 0, alongX ? 0 : sg, 1);
      else {
        if (alongX) owedX += sg;
        else owedY += sg;
        const o = alongX ? owedX : owedY;
        if (Math.abs(o) >= tread) {
          walk(alongX ? sg : 0, alongX ? 0 : sg, Math.abs(o));
          if (alongX) owedX = 0;
          else owedY = 0;
          dir = d;
        }
      }
    }
    // (the last point: what is owed is walked, the longer first)
    if (s === n - 1) {
      const xs = () => walk(sign(owedX), 0, Math.abs(owedX));
      const ys = () => walk(0, sign(owedY), Math.abs(owedY));
      if (Math.abs(owedX) >= Math.abs(owedY)) {
        xs();
        ys();
      } else {
        ys();
        xs();
      }
    }
    if (!here.length) here.push(py * W + px);
    out.push(here);
  }
  return out;
}

/** The washes and the old bed (see the file's header), cut into `heights`. */
export function planWashes(inp: WashInput): Washes {
  const { W, H, heights: h, surface, keepOff, rng } = inp;
  const N = W * H;
  // (a wash's depth under the ground beside it, least and most, its width, how many a map, and its fords' longest
  // lane: Canyon's side canyons' or a dry wash's)
  const deep = inp.canyon ? WASHES.canyon : null;
  const cutLeast = deep ? deep.cut[0] : 1;
  const cutMost = deep ? deep.cut[1] : WASHES.cutMost;
  const width = deep ? deep.width : WASHES.width;
  const per128 = deep ? deep.per128 : WASHES.per128;
  const laneMost = deep ? 2 * cutMost : WASHES.ford.lane;
  const h0 = h.slice();
  const mask = new Uint16Array(N);
  const beds: Wash[] = [];
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = surface[i] === surface[i] ? 1 : 0;
  // (the level a tile's floor keeps over the water near it: none within one tile of water is cut at all; within two,
  // none goes under the water's level plus one)
  const near1 = new Uint8Array(N);
  const minFloor = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (!wet[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    const lv = Math.floor(surface[i]) + 1;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) near1[j] = 1;
        if (lv > minFloor[j]) minFloor[j] = lv;
      }
  }
  const e = WASHES.edge;
  // (the ground a bed's line may pass, and the ground it may cut: that, off what the caller keeps)
  const pass = new Uint8Array(N);
  const allowed = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    pass[i] = !wet[i] && !near1[i] && x >= e && y >= e && x < W - e && y < H - e ? 1 : 0;
    allowed[i] = pass[i] && !keepOff[i] ? 1 : 0;
  }
  // the flow: where rain would run on the land, softened and warped, and tipped up toward the map's edge (a wall), so
  // no line runs along it
  const F = soften(h0, W, H, WASHES.blur);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    F[i] += WASHES.warp.amp * fbm(inp.seed, x, y, WASHES.warp.cell);
    if (d < WASHES.wall.width) F[i] += WASHES.wall.rise * (WASHES.wall.width - d);
  }
  // (each tile's distance from the water, Chebyshev, to `WASHES.shore`: a wash runs across the dry land, not along a
  // shore)
  const shore = new Uint8Array(N).fill(WASHES.shore);
  {
    let front: number[] = [];
    for (let i = 0; i < N; i++)
      if (wet[i]) {
        shore[i] = 0;
        front.push(i);
      }
    for (let d = 1; d < WASHES.shore && front.length; d++) {
      const next: number[] = [];
      for (const c of front) {
        const x = c % W;
        const y = (c - x) / W;
        for (let k = 0; k < 8; k++) {
          const xx = x + N8X[k];
          const yy = y + N8Y[k];
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (shore[j] <= d) continue;
          shore[j] = d;
          next.push(j);
        }
      }
      front = next;
    }
  }
  const { rcv, area, order, n: flowN } = flow(F, wet, W, H);
  // (the longest way up the flow from each tile over the ground a line may pass, tiles: the main stem a wash follows is
  // the longest, as a valley's is, reaching back to the divide)
  const reach = new Float64Array(N).fill(1);
  for (let k = flowN - 1; k >= 0; k--) {
    const j = order[k];
    const p = rcv[j];
    if (p >= 0 && pass[j] && reach[j] + 1 > reach[p]) reach[p] = reach[j] + 1;
  }
  // (each tile's donor with the longest way up, among the ground a line may pass; the more land draining through it on
  // a tie)
  const donor = new Int32Array(N).fill(-1);
  for (let j = 0; j < N; j++) {
    const p = rcv[j];
    if (p < 0 || !pass[j]) continue;
    const d = donor[p];
    if (
      d < 0 ||
      reach[j] > reach[d] ||
      (reach[j] === reach[d] && (area[j] > area[d] || (area[j] === area[d] && j < d)))
    )
      donor[p] = j;
  }
  const scale = Math.max(1, Math.min(W, H) / 128);
  const most = Math.round(WASHES.most * scale);
  /** The line up from `i`, head first, by the donors with the most land draining, while it has its head's flow. */
  const upFrom = (i: number, cap: number, skip?: (j: number) => boolean): number[] => {
    const line = [i];
    let c = i;
    while (line.length < cap) {
      const d = donor[c];
      if (d < 0 || area[d] < WASHES.headArea || (skip && skip(d))) break;
      line.push(d);
      c = d;
    }
    return line.reverse();
  };

  // ---- a bed cut along a line: its floor down the line, where it must end, and the tiles it takes
  const taken = new Int32Array(N).fill(-1); // a bed tile's floor
  interface Cut {
    line: number[];
    floor: number[];
    tiles: number[];
    tileFloor: number[];
    end: Wash["end"];
  }
  /** Close a bed's teeth until nothing changes (6825985686): a bank tile with bed on three sides becomes bed, at the
   *  highest floor beside it, where it can be cut; a bed tile with bank on three sides goes back to bank. */
  const closeTeeth = (tileFloor: Map<number, number>): void => {
    const side = (t: number): number[] => {
      const tx = t % W;
      const ty = (t - tx) / W;
      const o: number[] = [];
      if (tx > 0) o.push(t - 1);
      if (tx + 1 < W) o.push(t + 1);
      if (ty > 0) o.push(t - W);
      if (ty + 1 < H) o.push(t + W);
      return o;
    };
    for (let round = 0; round < 16; round++) {
      let changed = false;
      const seen = new Set<number>();
      for (const t of [...tileFloor.keys()].sort((a, b) => a - b)) {
        if (!tileFloor.has(t)) continue;
        const ns = side(t);
        let bank = 0;
        for (const q of ns) if (!tileFloor.has(q)) bank++;
        if (bank >= 3) {
          tileFloor.delete(t);
          changed = true;
          continue;
        }
        for (const b of ns) {
          if (tileFloor.has(b) || seen.has(b)) continue;
          seen.add(b);
          if (!allowed[b] || minFloor[b] >= 0) continue;
          let bed = 0;
          let f = -Infinity;
          for (const q of side(b)) {
            const fq = tileFloor.get(q);
            if (fq === undefined) continue;
            bed++;
            if (fq > f) f = fq;
          }
          if (bed < 3 || h0[b] <= f || h0[b] - f > cutMost) continue;
          tileFloor.set(b, f);
          changed = true;
        }
      }
      if (!changed) break;
    }
  };
  /** The bed along `line` (head to mouth) as it would be cut, ended where it must (`stop`, the line's point it ended
   *  at); null when what is left is short. `start` is the old bed's floor at its head; `join`, that it ends where it
   *  meets a bed. */
  const cutAlong = (
    line: number[],
    salt: number,
    least: number,
    opts: { start?: number; join?: boolean; lake?: Uint8Array } = {},
  ): { cut: Cut | null; stop: number } => {
    const n = line.length;
    const { x, y } = curveOf(line, W, (inp.seed + salt * 0x9e3779b1) >>> 0, WASHES.smooth);
    const path = treadsOf(x, y, W, H, WASHES.tread);
    const at = (s: number) => path[s][path[s].length - 1];
    // (a square brush on the tread path: its offsets each side, a 2-wide one's to one side)
    const wide = opts.join ? width.branch : width.main;
    const lo = -((wide - 1) >> 1);
    const hi = lo + wide - 1;
    const floor: number[] = [];
    const stamps: number[][] = [];
    let end: Wash["end"] = "hollow";
    let prev = opts.start ?? Infinity;
    let last = n;
    for (let s = 0; s < n; s++) {
      const ci = at(s);
      // (the line meets another bed: a branch ends there, at a floor no lower than the bed's)
      if (opts.join && taken[line[s]] >= 0) {
        end = "join";
        last = s;
        break;
      }
      if (!allowed[ci]) {
        // (a narrow strip the caller keeps, a way out: the bed passes it uncut, the land's own ford, and goes on)
        let gap = 0;
        if (prev < Infinity && pass[ci])
          for (let k = s + 1; k < n && k - s <= WASHES.gap; k++) {
            const ck = at(k);
            if (!pass[ck]) break;
            if (allowed[ck]) {
              gap = k - s;
              break;
            }
          }
        if (gap) {
          for (let k = 0; k < gap; k++) {
            floor.push(prev);
            stamps.push([]);
          }
          s += gap - 1;
          continue;
        }
        last = s;
        end = minFloor[line[s]] >= 0 || (s + 1 < n && minFloor[line[s + 1]] >= 0) ? "water" : "hollow";
        break;
      }
      const tiles: number[] = [];
      let low = Infinity;
      for (const p of path[s]) {
        const px = p % W;
        const py = (p - px) / W;
        for (let yy = py + lo; yy <= py + hi; yy++)
          for (let xx = px + lo; xx <= px + hi; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const t = yy * W + xx;
            if (!allowed[t] || tiles.includes(t)) continue;
            tiles.push(t);
            if (h0[t] < low) low = h0[t];
          }
      }
      if (!tiles.length) {
        last = s;
        break;
      }
      // (a level under the lowest ground beside it, a side canyon three: two under, four, where it runs along a step's
      // foot or the land rises; the old bed a level, at its lake's. A side canyon deepens a level every few tiles from
      // its head, as a gully grows into a canyon, and its floor falls a level at a time while it can, so the colony
      // walks it from its head to its mouth)
      const depth = opts.start !== undefined ? 1 : deep ? Math.min(cutLeast, 1 + Math.floor(s / deep.deepen)) : cutLeast;
      let f = Math.min(prev, low - depth);
      if (deep && prev < Infinity) f = Math.max(f, Math.min(prev - 1, low - 1));
      if (opts.start !== undefined) f = Math.min(f, opts.start);
      if (f < inp.floor) f = inp.floor;
      // (too deep under the ground beside it, where the land rises over a sill: the floor rises with it, as little as
      // keeps it within its deepest cut, as a dry wash's floor is uneven; the old bed, held at its lake's level, ends
      // there in a hollow)
      if (low - f > cutMost) {
        if (opts.start !== undefined) {
          last = s;
          end = "hollow";
          break;
        }
        f = Math.max(low - cutMost, inp.floor);
      }
      // (near water a floor keeps over the water's level: short of that, the bed ends by its lip)
      let under = false;
      // (the old bed's own lake: its floor keeps at the lake's level there, behind the lip)
      for (const t of tiles)
        if (minFloor[t] >= 0 && f < minFloor[t] && !(opts.lake?.[t] && opts.start !== undefined && f >= opts.start))
          under = true;
      if (under) {
        last = s;
        end = "water";
        break;
      }
      floor.push(f);
      stamps.push(tiles);
      prev = f;
    }
    if (last < least) return { cut: null, stop: last };
    const keep = Math.min(last, floor.length);
    // (a line longer than the most keeps its lower reach)
    const from = Math.max(0, keep - most);
    if (keep - from < least) return { cut: null, stop: last };
    const tileFloor = new Map<number, number>();
    for (let s = from; s < keep; s++)
      for (const t of stamps[s]) {
        const f = floor[s];
        if (h0[t] - f > cutMost) continue;
        const was = tileFloor.get(t);
        if (was === undefined || f < was) tileFloor.set(t, f);
      }
    closeTeeth(tileFloor);
    return {
      cut: {
        line: line.slice(from, keep),
        floor: floor.slice(from, keep),
        tiles: [...tileFloor.keys()],
        tileFloor: [...tileFloor.values()],
        end,
      },
      stop: last,
    };
  };
  /** The tiles within `r` (Chebyshev) of a bed's line: no other line comes this near. */
  const nearLine = new Uint8Array(N);
  const markNear = (line: readonly number[], r: number) => {
    for (const i of line) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) nearLine[yy * W + xx] = 1;
        }
    }
  };
  /** The dry hollow at a bed's end: one or two levels under the land round it (its ring at the bed's last floor, a
   *  two-deep one's core a level under that, so a ramp goes down each step), closed all round (none of the ground
   *  beside it as low but its own bed's last stretch), at least five tiles; null where the land gives none. */
  const hollowFor = (c: Cut, salt: number): Hollow | null => {
    const at = c.line[c.line.length - 1];
    const ax = at % W;
    const ay = (at - ax) / W;
    const r = WASHES.hollow.radius[0] + (WASHES.hollow.radius[1] - WASHES.hollow.radius[0]) * rng.float();
    const dh = WASHES.hollow.depth[0] + rng.int(0, WASHES.hollow.depth[1] - WASHES.hollow.depth[0] + 1);
    // (its ring at the bed's last floor, a level under the land round it; a two-deep one's core a level under that, so
    // the colony steps down into it from its rim as into the bed)
    const ring = c.floor[c.floor.length - 1];
    const f = ring - (dh - 1);
    if (f < inp.floor) return null;
    const hSeed = (inp.seed ^ (salt * 0xc2b2ae35)) >>> 0;
    const out: number[] = [];
    const floors: number[] = [];
    const R = Math.ceil(r * 1.3);
    const inside = new Map<number, number>();
    const core = 0.3 * r * r;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const xx = ax + dx;
        const yy = ay + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        const rr = r * (1 + 0.3 * valueNoise(hSeed, xx, yy, 3));
        if (dx * dx + dy * dy > rr * rr) continue;
        const ft = dx * dx + dy * dy <= core ? f : ring;
        if (!allowed[t] || taken[t] >= 0 || h0[t] <= ft || (minFloor[t] >= 0 && ft < minFloor[t])) continue;
        // (no deeper under the ground it is dug in than the bed's cut, a core a level more)
        if (h0[t] - ft > cutMost + (ft < ring ? 1 : 0)) continue;
        out.push(t);
        floors.push(ft);
        inside.set(t, ft);
      }
    if (out.length < WASHES.hollow.least || !floors.includes(f)) return null;
    // (closed: the ground beside it stands over its floor; its own bed's last stretch is part of the basin, the bed
    // rising up its length)
    for (const [t, ft] of inside) {
      const x = t % W;
      const y = (t - x) / W;
      for (const n of [x + 1 < W ? t + 1 : -1, x > 0 ? t - 1 : -1, y + 1 < H ? t + W : -1, y > 0 ? t - W : -1]) {
        if (n < 0 || inside.has(n)) continue;
        const q = c.tiles.indexOf(n);
        if (q >= 0 && c.tileFloor[q] >= ring) continue;
        const lv = q >= 0 ? c.tileFloor[q] : taken[n] >= 0 ? Math.min(h[n], taken[n]) : h[n];
        if (lv <= ft || wet[n]) return null;
      }
    }
    return { tiles: out, floors };
  };
  /** Cut a bed into the land: its tiles, its hollow, and the mask. Its index. */
  const apply = (c: Cut, kind: Wash["kind"], hollow: Hollow | null): number => {
    const k = beds.length + 1;
    const tiles: number[] = [];
    c.tiles.forEach((t, q) => {
      const f = c.tileFloor[q];
      if (taken[t] >= 0 && taken[t] <= f) return;
      if (h[t] > f) h[t] = f;
      taken[t] = f;
      mask[t] = k;
      tiles.push(t);
    });
    const wash: Wash = {
      kind,
      end: c.end,
      line: c.line,
      floor: c.floor,
      tiles,
    };
    if (hollow) {
      hollow.tiles.forEach((t, q) => {
        const f = hollow.floors[q];
        if (h[t] > f) h[t] = f;
        taken[t] = f;
        mask[t] = k;
      });
      wash.hollow = hollow.tiles;
    }
    beds.push(wash);
    return k - 1;
  };

  // ---- the fords: where a bank slopes down to the bed's floor and up the other side, a natural ramp at each level
  /** A ford's lane tile (cut into a bank). */
  const lane = new Uint8Array(N);
  /** The tiles the fords' steps stand on, and the tiles behind them: no other step takes one. */
  const held = new Uint8Array(N);
  /** The fords, each a way up one bank: its bed, its steps (low tile, high tile), the tiles it holds and its lane. */
  interface Ford {
    bed: Wash;
    steps: [number, number][];
    held: number[];
    lane: number[];
  }
  let fords: Ford[] = [];
  /** The ford holding each held tile. */
  const fordBy = new Map<number, Ford>();
  /** Take a ford out: its lane's ground as it was. */
  const dropFord = (f: Ford): void => {
    for (const t of f.lane) {
      h[t] = h0[t];
      taken[t] = -1;
      mask[t] = 0;
      lane[t] = 0;
    }
    const gone = new Set(f.lane);
    f.bed.tiles = f.bed.tiles.filter((t) => !gone.has(t));
    for (const t of f.held) {
      held[t] = 0;
      fordBy.delete(t);
    }
    fords = fords.filter((g) => g !== f);
  };
  /** A ford's way up one bank from bed `k`'s floor at `p0`, in direction (dx, dy): a slope from the floor up to a tile
   *  a level over it, the tile beyond at that level, a slope up from it, and so on (each slope's low tile with the tile
   *  behind it at its own level), the lane cut into the bank until it meets ground at its own level; false where the
   *  bank won't take one. */
  const laneFrom = (k: number, p0: number, dx: number, dy: number): boolean => {
    const own = k + 1;
    const F = h[p0];
    const x0 = p0 % W;
    const y0 = (p0 - x0) / W;
    const bx = x0 - dx;
    const by = y0 - dy;
    if (bx < 0 || by < 0 || bx >= W || by >= H) return false;
    const b = by * W + bx;
    if (h[b] !== F || mask[b] !== own || held[b] || held[p0]) return false;
    const path = [p0];
    const levels = [F];
    let end = -1;
    for (let j = 1; j <= laneMost; j++) {
      const x = x0 + j * dx;
      const y = y0 + j * dy;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const p = y * W + x;
      const L = F + ((j + 1) >> 1);
      if (wet[p] || held[p] || mask[p]) return false;
      path.push(p);
      levels.push(L);
      if (h[p] === L) {
        end = j;
        break;
      }
      if (h[p] < L || !allowed[p] || h[p] - L > cutMost || (minFloor[p] >= 0 && L < minFloor[p])) return false;
    }
    if (end < 0) return false;
    const f: Ford = { bed: beds[k], steps: [], held: [b, ...path], lane: path.slice(1, end) };
    for (let j = 1; j < end; j++) {
      const p = path[j];
      h[p] = levels[j];
      taken[p] = levels[j];
      mask[p] = own;
      lane[p] = 1;
      beds[k].tiles.push(p);
    }
    for (let j = 0; j + 1 <= end; j += 2) f.steps.push([path[j], path[j + 1]]);
    for (const p of f.held) {
      held[p] = 1;
      fordBy.set(p, f);
    }
    fords.push(f);
    return true;
  };
  /** A ford across bed `k` at its line's point `s`: a lane up each bank (or, `up`, one up the way the bed came: its
   *  shallow head) from one stretch of its floor, the nearest the point. How many lanes it made. */
  const fordAt = (k: number, s: number, up = false): number => {
    const own = k + 1;
    const line = beds[k].line;
    const c = line[s];
    const cx = c % W;
    const cy = (c - cx) / W;
    let t0 = -1;
    let bd = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        if (mask[t] !== own || lane[t]) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bd) {
          bd = d;
          t0 = t;
        }
      }
    if (t0 < 0) return 0;
    // (the floor there: the stretch at the nearest tile's level within three tiles of the point)
    const F = h[t0];
    const cross = [t0];
    const inCross = new Set([t0]);
    for (let q = 0; q < cross.length; q++) {
      const t = cross[q];
      const x = t % W;
      const y = (t - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || Math.abs(xx - cx) > 3 || Math.abs(yy - cy) > 3) continue;
        const n = yy * W + xx;
        if (inCross.has(n) || mask[n] !== own || lane[n] || h[n] !== F) continue;
        inCross.add(n);
        cross.push(n);
      }
    }
    const dist = (t: number) => Math.abs((t % W) - cx) + Math.abs((t - (t % W)) / W - cy);
    cross.sort((a, b) => dist(a) - dist(b) || a - b);
    const a = line[Math.max(0, s - 2)];
    const q = line[Math.min(line.length - 1, s + 2)];
    const tx = (q % W) - (a % W);
    const ty = (q - (q % W)) / W - (a - (a % W)) / W;
    if (!tx && !ty) return 0;
    const sides: [number, number][] = up
      ? [[-tx, -ty]]
      : [
          [-ty, tx],
          [ty, -tx],
        ];
    let got = 0;
    for (const [nx, ny] of sides) {
      const dirs = D4.filter(([dx, dy]) => dx * nx + dy * ny > 0).sort(
        (u, v) => v[0] * nx + v[1] * ny - (u[0] * nx + u[1] * ny),
      );
      let done = false;
      for (const [dx, dy] of dirs) {
        for (const p0 of cross)
          if (laneFrom(k, p0, dx, dy)) {
            done = true;
            break;
          }
        if (done) break;
      }
      if (done) got++;
    }
    return got;
  };
  /** The fords along bed `k`: every `WASHES.ford.every` tiles, at a wash's head (its shallow end), and where it passes
   *  near a place a start may take. */
  const fordsAlong = (k: number): void => {
    const bed = beds[k];
    const n = bed.line.length;
    const clear = (s: number) => {
      const i = bed.line[s];
      const x = i % W;
      const y = (i - x) / W;
      return !(inp.starts ?? []).some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= WASHES.ford.clear);
    };
    // (a side canyon's head deepens from the land, the colony's way in, and its walls are the point: it gets the fords
    // the walk needs and none every few tiles)
    if (deep && bed.kind !== "old") return;
    if (bed.kind !== "old" && clear(0)) fordAt(k, 0, true);
    const [lo, hi] = WASHES.ford.every;
    for (let s = Math.round((lo + hi) / 4) + rng.int(0, 6); s < n - 3; s += lo + rng.int(0, hi - lo + 1))
      if (clear(s)) fordAt(k, s);
  };
  /** A ford up into `part` (ground beside a bed) from the bed beside it where `from` takes the bed's tile: a lane from
   *  that tile out through one of the part's. Whether one went in. */
  const fordInto = (part: readonly number[], from: (t: number) => boolean): boolean => {
    for (const n of [...part].sort((u, v) => u - v)) {
      const x = n % W;
      const y = (n - x) / W;
      for (const [dx, dy] of D4) {
        const tx = x - dx;
        const ty = y - dy;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        const t = ty * W + tx;
        if (mask[t] && !lane[t] && from(t) && laneFrom(mask[t] - 1, t, dx, dy)) return true;
      }
    }
    return false;
  };

  /** Where no ford goes in, the bed left uncut beside `part` (its tiles within `WASHES.bridge` of the middle of the
   *  part's ground beside it, a hollow's aside, and any ford there): the land's own crossing, at its old level.
   *  Whether any was. */
  const bridgeInto = (part: readonly number[]): boolean => {
    const n = part[part.length >> 1];
    const x = n % W;
    const y = (n - x) / W;
    const r = WASHES.bridge;
    const drop = new Set<number>();
    const hollow = new Set(beds.flatMap((b) => b.hollow ?? []));
    let dropped = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = yy * W + xx;
        // (a ford there goes: its lane may be what cut the part off)
        const f = fordBy.get(t);
        if (f) {
          dropFord(f);
          dropped++;
        }
        if (!mask[t] || hollow.has(t)) continue;
        h[t] = h0[t];
        mask[t] = 0;
        taken[t] = -1;
        lane[t] = 0;
        drop.add(t);
      }
    if (!drop.size) return dropped > 0;
    for (const bed of beds) {
      bed.tiles = bed.tiles.filter((t) => !drop.has(t));
      if (bed.hollow) bed.hollow = bed.hollow.filter((t) => !drop.has(t));
    }
    return true;
  };

  // ---- the walk: a bed takes no land from the start's walk (`start.reach`)
  /** Undo the beds `cut` (by index): the land under them as it was, and their fords. */
  const undo = (cut: ReadonlySet<number>): void => {
    const keep: Wash[] = [];
    beds.forEach((bed, k) => {
      if (!cut.has(k)) {
        keep.push(bed);
        return;
      }
      for (const t of [...bed.tiles, ...(bed.hollow ?? [])])
        if (mask[t] === k + 1) {
          h[t] = h0[t];
          taken[t] = -1;
          lane[t] = 0;
        }
      for (const f of fords)
        if (f.bed === bed)
          for (const t of f.held) {
            held[t] = 0;
            fordBy.delete(t);
          }
      fords = fords.filter((f) => f.bed !== bed);
    });
    beds.length = 0;
    beds.push(...keep);
    mask.fill(0);
    beds.forEach((bed, k) => {
      for (const t of [...bed.tiles, ...(bed.hollow ?? [])]) mask[t] = k + 1;
    });
  };
  /** The ramps into the beds, the fords' with them; a stretch they can't join to the land smaller than a pocket is
   *  first left uncut (a tile or two the bed's edge stranded under a single bank), or, a hollow's, a level higher. */
  const rampsOf = (): [number, number][] => {
    for (;;) {
      const pre: [number, number][] = [];
      for (const f of fords) pre.push(...f.steps);
      const { steps, stranded } = rampsInto(beds, h, mask, wet, keepOff, W, H, pre, held, lane);
      const small = stranded.filter((c) => c.length < WASHES.pocket);
      // (a side canyon's stretch of floor no step reaches, one a level fall cut off from the next: a ford up out of it,
      // from the point of its bed's line nearest its middle)
      if (deep && !small.length) {
        let added = 0;
        for (const c of stranded) {
          const t = c[c.length >> 1];
          const k = mask[t] - 1;
          if (k < 0 || beds[k].kind === "old") continue;
          const tx = t % W;
          const ty = (t - tx) / W;
          let best = -1;
          let bd = Infinity;
          beds[k].line.forEach((i, q) => {
            const d = Math.abs((i % W) - tx) + Math.abs((i - (i % W)) / W - ty);
            if (d < bd) {
              bd = d;
              best = q;
            }
          });
          if (best >= 0 && fordAt(k, best)) added++;
        }
        if (added) continue;
      }
      if (!small.length) return steps;
      const drop = new Set<number>();
      const hollow = new Set(beds.flatMap((b) => b.hollow ?? []));
      for (const c of small) {
        // (a hollow's core no step reaches is a level higher, the hollow a level shallower there)
        if (c.every((t) => hollow.has(t) && h[t] + 1 < h0[t])) {
          for (const t of c) taken[t] = ++h[t];
          continue;
        }
        for (const t of c) {
          h[t] = h0[t];
          mask[t] = 0;
          taken[t] = -1;
          drop.add(t);
        }
      }
      for (const bed of beds) {
        bed.tiles = bed.tiles.filter((t) => !drop.has(t));
        if (bed.hollow) bed.hollow = bed.hollow.filter((t) => !drop.has(t));
      }
      // (a bed whose hollow that left too small to be one is undone, as a bed that parts the walk is)
      const thin = new Set<number>();
      beds.forEach((b, k) => {
        if (b.end === "hollow" && (b.hollow?.length ?? 0) < WASHES.hollow.least) thin.add(k);
      });
      if (thin.size) undo(thin);
    }
  };
  let steps: [number, number][] = [];
  /** Where a bed parts the land's level walk, a ford up into each part it cut off; a bed no ford rejoins, or that the
   *  colony can't step into, undone. The ramps of the rest in `steps`. Run as each wash is cut, so one undone makes
   *  way for the next. */
  const guard = (): void => {
    steps = rampsOf();
    for (let round = 0; beds.length; round++) {
      const walk = cutsWalk(beds, h, h0, mask, steps, W, H);
      if (!walk.bad.size) break;
      if (round < 6) {
        let added = 0;
        // (each part joined to the largest: a ford into it from the bed the largest joins, or into the largest from
        // the bed it joins, else the land's own crossing beside it)
        for (const { parts } of walk.splits) {
          const main = parts[0];
          for (const part of parts.slice(1))
            if (
              fordInto(part.banks, (t) => walk.root(t) === main.root) ||
              fordInto(main.banks, (t) => walk.root(t) === part.root) ||
              bridgeInto(part.banks)
            )
              added++;
        }
        if (added) {
          steps = rampsOf();
          continue;
        }
      }
      const cuts = walk.bad;
      // (a branch and its wash go together: a branch's floor may stand in its wash's)
      for (let k = beds.length - 1; k >= 0; k--)
        if (beds[k].kind === "branch" && cuts.has(k))
          for (let j = k - 1; j >= 0; j--) {
            cuts.add(j);
            if (beds[j].kind !== "branch") break;
          }
      for (let k = 0; k < beds.length; k++)
        if (cuts.has(k) && beds[k].kind === "wash")
          for (let j = k + 1; j < beds.length && beds[j].kind === "branch"; j++) cuts.add(j);
      undo(cuts);
      steps = rampsOf();
    }
  };

  // ---- the bench a start needs: a bed may cross a level plate a start may take, so long as it keeps that
  const plate = inp.bench ? levelRegions(h0, W, H) : null;
  const plateFlag = plate ? new Uint8Array(plate.size.length) : null;
  if (plate && plateFlag) {
    for (const p of inp.starts ?? [])
      if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H) plateFlag[plate.labels[p.y * W + p.x]] = 1;
    if (inp.benchPlates) for (let i = 0; i < N; i++) if (inp.benchPlates[i]) plateFlag[plate.labels[i]] = 1;
  }
  /** The plates a start may take that the beds leave short of the bench (the uncut part each place a start may take
   *  stands on; or, where fewer than two plates keep it, a plate's largest), by label: a bed keeps off them from then
   *  on. */
  const benchShort = (): number[] => {
    if (!plate || !plateFlag || !inp.bench) return [];
    const need = inp.bench;
    const hit = new Set<number>();
    for (let i = 0; i < N; i++) {
      const L = plate.labels[i];
      if (mask[i] && L >= 0 && plateFlag[L] && plate.size[L] >= need) hit.add(L);
    }
    if (!hit.size) return [];
    const part = new Int32Array(N).fill(-1);
    const sizes: number[] = [];
    const largest = new Map<number, number>();
    const queue: number[] = [];
    for (let i = 0; i < N; i++) {
      const L = plate.labels[i];
      if (!hit.has(L) || mask[i] || part[i] >= 0) continue;
      const id = sizes.length;
      queue.length = 0;
      queue.push(i);
      part[i] = id;
      for (let q = 0; q < queue.length; q++) {
        const c = queue[q];
        const x = c % W;
        const y = (c - x) / W;
        for (const n of [x + 1 < W ? c + 1 : -1, x > 0 ? c - 1 : -1, y + 1 < H ? c + W : -1, y > 0 ? c - W : -1]) {
          if (n < 0 || part[n] >= 0 || mask[n] || plate.labels[n] !== L) continue;
          part[n] = id;
          queue.push(n);
        }
      }
      sizes.push(queue.length);
      largest.set(L, Math.max(largest.get(L) ?? 0, queue.length));
    }
    // (a plate no place a start may take stands on may go short while two plates or more keep the bench: the settle's
    // start keeps its choice)
    const short = new Set<number>();
    let keep = 0;
    for (let L = 0; L < plateFlag.length; L++)
      if (plateFlag[L] && plate.size[L] >= need && (!hit.has(L) || largest.get(L)! >= need)) keep++;
    if (keep < 2) for (const L of hit) if ((largest.get(L) ?? 0) < need) short.add(L);
    for (const p of inp.starts ?? []) {
      if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) continue;
      const i = p.y * W + p.x;
      if (hit.has(plate.labels[i]) && (part[i] < 0 || sizes[part[i]] < need)) short.add(plate.labels[i]);
    }
    return [...short];
  };
  /** Keep the beds off `plates` from now on. */
  const keepPlates = (plates: readonly number[]): void => {
    const off = new Set(plates);
    for (let i = 0; i < N; i++) if (off.has(plate!.labels[i])) allowed[i] = 0;
  };

  // ---- the washes: the longest bed a trunk end gives, from the ends with the most land draining through them,
  // spaced, each with its side branches where the flow joins it
  const want = Math.max(
    1,
    Math.round(((per128[0] + rng.int(0, per128[1] - per128[0] + 1)) * N) / (128 * 128)),
  );
  const ends: { i: number; score: number; toWater: boolean }[] = [];
  for (let i = 0; i < N; i++) {
    // (where the flow leaves the ground a bed may cut, or the ground a line may pass)
    if (!pass[i] || area[i] < WASHES.trunkArea) continue;
    const p = rcv[i];
    if (p >= 0 && pass[p] && !(allowed[i] && !allowed[p])) continue;
    // (a wash that runs to water is the likelier: its mouth is where a dam lets the water in)
    let toWater = false;
    for (let c = p, k = 0; c >= 0 && k < 4 && !toWater; c = rcv[c], k++) if (wet[c]) toWater = true;
    ends.push({ i, score: reach[i] * (toWater ? 1.25 : 1) * (0.85 + 0.3 * rng.float()), toWater });
  }
  ends.sort((a, b) => b.score - a.score || a.i - b.i);
  let salt = 1;
  /** The longest bed `line` gives: each stretch from where the last stopped, one that ends in no hollow cut back a
   *  little to find one. */
  const longest = (line: number[], least: number): { cut: Cut; hollow: Hollow | null } | null => {
    let best: { cut: Cut; hollow: Hollow | null } | null = null;
    for (let from = 0; line.length - from >= least;) {
      const seg = line.slice(from);
      const mine = salt++;
      const { cut, stop } = cutAlong(seg, mine, least);
      for (let back = 0, c = cut; c && back <= 12; back += 4) {
        if (back) c = cutAlong(seg.slice(0, stop - back), mine, least).cut;
        if (!c || (best && c.line.length <= best.cut.line.length)) break;
        const hollow = c.end === "hollow" ? hollowFor(c, mine) : null;
        if (c.end !== "hollow" || hollow) {
          best = { cut: c, hollow };
          break;
        }
      }
      from += stop + 1;
    }
    return best;
  };
  const washCount = () => beds.filter((b) => b.kind === "wash").length;
  const tried = new Set<number>();
  for (const least of [WASHES.least, WASHES.fallback].map((n) => Math.round(n * scale))) {
    for (let round = 0; round < 12 && washCount() < want; round++) {
      let pick: { end: number; cut: Cut; hollow: Hollow | null; score: number } | null = null;
      let looked = 0;
      for (const c of ends) {
        if (looked >= WASHES.look) break;
        if (tried.has(c.i) || nearLine[c.i] || taken[c.i] >= 0) continue;
        looked++;
        const line = upFrom(c.i, most + 20, (j) => !!nearLine[j] || taken[j] >= 0);
        if (line.length < least) continue;
        const got = longest(line, least);
        if (!got) continue;
        let along = 0;
        for (const j of got.cut.line) if (shore[j] < WASHES.shore) along++;
        const score =
          got.cut.line.length *
          (1 - (WASHES.shoreCost * along) / got.cut.line.length) *
          (c.toWater ? 1.25 : 1) *
          (0.85 + 0.3 * rng.float());
        if (!pick || score > pick.score) pick = { end: c.i, ...got, score };
      }
      if (!pick) break;
      tried.add(pick.end);
      const k = apply(pick.cut, "wash", pick.hollow);
      const made = [k];
      // (its side branches: the largest flows joining it along its middle reach, traced up, apart along it)
      const joins: number[] = [];
      const main = beds[k].line;
      for (const chance of WASHES.branch) {
        if (rng.float() >= chance) continue;
        let best: number[] | null = null;
        let bestS = -1;
        for (let s = 4; s < main.length - 4; s++) {
          if (joins.some((j) => Math.abs(j - s) < WASHES.branchApart)) continue;
          const p = main[s];
          const upstream = main[s - 1];
          const px = p % W;
          const py = (p - px) / W;
          for (let d8 = 0; d8 < 8; d8++) {
            const xx = px + N8X[d8];
            const yy = py + N8Y[d8];
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = yy * W + xx;
            if (d === upstream || rcv[d] !== p || !allowed[d] || area[d] < 2 * WASHES.headArea || taken[d] >= 0)
              continue;
            const up = upFrom(d, most, (j) => taken[j] >= 0 || !!nearLine[j]);
            if (up.length >= WASHES.branchLeast && (!best || up.length > best.length - 4)) {
              best = [...up, ...main.slice(s, s + 4)];
              bestS = s;
            }
          }
        }
        if (!best) break;
        joins.push(bestS);
        // (the stretch of it that reaches the wash)
        for (let seg = best; seg.length >= WASHES.branchLeast;) {
          const { cut: b, stop } = cutAlong(seg, salt++, WASHES.branchLeast, { join: true });
          if (b && b.end === "join") {
            made.push(apply(b, "branch", null));
            break;
          }
          seg = seg.slice(stop + 1);
        }
      }
      // (a wash that would part a plate a start may take below the bench it needs is none)
      const short = benchShort();
      if (short.length) {
        undo(new Set(made));
        keepPlates(short);
        tried.delete(pick.end);
        continue;
      }
      for (const m of made) fordsAlong(m);
      markNear(beds[k].line, WASHES.apart);
      for (const m of made.slice(1)) markNear(beds[m].line, Math.round(WASHES.apart / 2));
      guard();
    }
    // (Canyon's side canyons go on to the shorter lines until it has its count)
    if (deep ? washCount() >= want : washCount()) break;
  }

  // ---- the old bed: from behind a lake's lip, at the lake's own level, out into the dry land
  {
    let best: { cut: Cut; hollow: Hollow | null; score: number } | null = null;
    const lakes = [...inp.lakes]
      .filter((l) => l.length >= 12)
      .sort((a, b) => b.length - a.length)
      .slice(0, 4);
    for (const lake of lakes) {
      let top = -Infinity;
      for (const i of lake) if (surface[i] > top) top = surface[i];
      if (!(top > -Infinity)) continue;
      const S = Math.floor(top);
      // (the tiles two from the lake, past a dry lip a level over it)
      const own = new Uint8Array(N);
      for (const i of lake) own[i] = 1;
      const ring: number[] = [];
      const seen = new Uint8Array(N);
      for (const i of lake) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx < e || yy < e || xx >= W - e || yy >= H - e) continue;
            const t = yy * W + xx;
            if (seen[t] || !allowed[t]) continue;
            seen[t] = 1;
            if (h0[t] <= S || h0[t] > S + WASHES.old.rim || nearLine[t] || taken[t] >= 0) continue;
            ring.push(t);
          }
      }
      // (the ground within two tiles of this lake, where the old bed's floor keeps at the lake's level, not over it)
      const lakeNear = new Uint8Array(N);
      for (const i of lake) {
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) lakeNear[yy * W + xx] = 1;
          }
      }
      rng.shuffle(ring);
      for (const t of ring.slice(0, 40)) {
        // (down the flow from there, away from the lake)
        const line = [t];
        let c = t;
        while (line.length < WASHES.old.most + 10) {
          const p = rcv[c];
          if (p < 0 || wet[p] || own[p] || nearLine[p] || taken[p] >= 0) break;
          line.push(p);
          c = p;
        }
        if (line.length < WASHES.old.least) continue;
        // (it leaves the lake: its line ends well away from it)
        const lx = line[line.length - 1] % W;
        const ly = (line[line.length - 1] - lx) / W;
        const tx = t % W;
        const ty = (t - tx) / W;
        if ((lx - tx) * (lx - tx) + (ly - ty) * (ly - ty) < 100) continue;
        const { cut } = cutAlong(line.slice(0, WASHES.old.most), salt++, WASHES.old.least, {
          start: S,
          lake: lakeNear,
        });
        if (!cut || cut.line[0] !== t) continue;
        const hollow = cut.end === "hollow" ? hollowFor(cut, salt) : null;
        if (cut.end === "hollow" && !hollow) continue;
        const score = cut.line.length * (0.8 + 0.4 * rng.float());
        if (!best || score > best.score) best = { cut, hollow, score };
      }
    }
    if (best) {
      const k = apply(best.cut, "old", best.hollow);
      if (benchShort().length) undo(new Set([k]));
      else fordsAlong(k);
    }
  }
  guard();
  return { beds, mask, steps };
}

/** The start's ground a bed keeps off (D515's five numbers): for each place a start may stand, the ground within
 *  `reach` tiles' walk of it (its farmland, forester's plot and fast wood) and within `WASHES.startBox` tiles of it,
 *  and its ways out (`ways`, the natural ramps' tiles) with a margin. Marked into `out`. Its bench past that a bed may cross so long as it keeps what
 *  the start needs (`WashInput.bench`). */
export function startKeepOff(
  h: Uint8Array,
  W: number,
  H: number,
  starts: readonly { x: number; y: number }[],
  ways: readonly number[],
  out: Uint8Array,
  reach: number = WASHES.startWalk,
): void {
  const N = W * H;
  for (const st of starts) {
    if (st.x < 0 || st.y < 0 || st.x >= W || st.y >= H) continue;
    const walk = walkDistance(h, W, H, null, [], st, reach + 1);
    for (let i = 0; i < N; i++) if (walk[i] <= reach) out[i] = 1;
    const r = WASHES.startBox;
    for (let y = Math.max(0, st.y - r); y <= Math.min(H - 1, st.y + r); y++)
      for (let x = Math.max(0, st.x - r); x <= Math.min(W - 1, st.x + r); x++) out[y * W + x] = 1;
  }
  const m = WASHES.wayMargin;
  for (const i of ways) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -m; dy <= m; dy++)
      for (let dx = -m; dx <= m; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
  }
}

/** Each bed's and hollow's tiles as one mask (the dead stands' dry beds, `deadStands.ts`). */
export function bedMask(beds: readonly Wash[], N: number): Uint8Array {
  const out = new Uint8Array(N);
  for (const b of beds) {
    for (const t of b.tiles) out[t] = 1;
    for (const t of b.hollow ?? []) out[t] = 1;
  }
  return out;
}

/** A level region a bed parted: each of its parts big enough to count, the largest first, by the part of the walk it
 *  joins (`root`), with its ground beside the beds (`banks`). */
interface Split {
  region: number;
  parts: { root: number; size: number; banks: number[] }[];
}

/** The beds (by index) that cut the land's level walk: where a bed crossed ground at one level (`h0`'s 4-connected
 *  level regions), every part of it the bed left must still be joined over ground at one level and the ramps
 *  (`steps`, both ways) on the land as cut; and every bed tile must join ground off the beds. A bed that fails is one
 *  the walk would lose land to. With them, each region parted (`splits`, its parts the largest first), and the part of
 *  the walk each tile joins as cut (`root`). */
function cutsWalk(
  beds: readonly Wash[],
  h: Uint8Array,
  h0: Uint8Array,
  mask: Uint16Array,
  steps: readonly [number, number][],
  W: number,
  H: number,
): { bad: Set<number>; splits: Split[]; root: (i: number) => number } {
  const N = W * H;
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
  };
  const before = new Int32Array(N);
  for (let i = 0; i < N; i++) before[i] = i;
  const findB = (i: number): number => {
    while (before[i] !== i) {
      before[i] = before[before[i]];
      i = before[i];
    }
    return i;
  };
  for (let i = 0; i < N; i++) {
    const x = i % W;
    for (const j of [x + 1 < W ? i + 1 : -1, i + W < N ? i + W : -1]) {
      if (j < 0) continue;
      if (h[i] === h[j]) join(i, j);
      if (h0[i] === h0[j]) {
        const a = findB(i);
        const b = findB(j);
        if (a !== b) before[a < b ? b : a] = a < b ? a : b;
      }
    }
  }
  for (const [a, b] of steps) join(a, b);
  const bad = new Set<number>();
  // (the ground each joined part holds off the beds, as cut)
  const size = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (mask[i]) continue;
    const r = find(i);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  // (each level region a bed crossed: its ground beside the beds, by the part each tile joins as cut)
  const banks = new Map<number, Map<number, number[]>>();
  for (let t = 0; t < N; t++) {
    if (!mask[t]) continue;
    // (a stretch the colony can't step into or out of)
    if (!size.has(find(t))) bad.add(mask[t] - 1);
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (mask[n] || h0[n] !== h0[t]) continue;
      const region = findB(n);
      let parts = banks.get(region);
      if (!parts) banks.set(region, (parts = new Map()));
      const r = find(n);
      const part = parts.get(r);
      if (part) part.push(n);
      else parts.set(r, [n]);
    }
  }
  // (a region parted into two parts or more that each hold a pocket's ground or more; a pocket cut off is let go)
  const splits: Split[] = [];
  for (const [region, byRoot] of banks) {
    const big = [...byRoot.keys()].filter((r) => size.get(r)! >= WASHES.pocket);
    if (big.length < 2) continue;
    const parts = big
      .map((r) => ({ root: r, size: size.get(r)!, banks: byRoot.get(r)! }))
      .sort((p, q) => q.size - p.size || p.root - q.root);
    splits.push({ region, parts });
  }
  if (splits.length) {
    const split = new Set(splits.map((sp) => sp.region));
    for (let t = 0; t < N; t++) if (mask[t] && split.has(findB(t))) bad.add(mask[t] - 1);
  }
  return { bad, splits, root: find };
}

/** Natural ramps into the beds: the fords' (`pre`, their tiles `held`, their lanes `lane`), and every other stretch of a
 *  bed or its hollow at one level joined to the land, from the highest down, by ground at its own level beside it or a
 *  step up onto ground already joined (a bank, or a stretch joined before it), so none is cut off (the stretches none
 *  joins are `stranded`). A step stands on a low tile with the high tile a level over it on one side and a tile at its
 *  own level on the other (`standingSteps`). (low tile, high tile) pairs, a tile once. */
function rampsInto(
  beds: readonly Wash[],
  h: Uint8Array,
  mask: Uint16Array,
  wet: Uint8Array,
  keepOff: Uint8Array,
  W: number,
  H: number,
  pre: readonly [number, number][],
  held: Uint8Array,
  lane: Uint8Array,
): { steps: [number, number][]; stranded: number[][] } {
  const out: [number, number][] = [...pre];
  const used = new Set<number>();
  for (let i = 0; i < held.length; i++) if (held[i]) used.add(i);
  const fordLow = new Set(pre.map(([lo]) => lo));
  /** A step up from `t` to ground a level over it that `up` takes, the tile behind `t` one `inside` takes. */
  const stepFrom = (t: number, inside: (i: number) => boolean, up: (i: number) => boolean): boolean => {
    const x = t % W;
    const y = (t - x) / W;
    for (const [dx, dy] of D4) {
      const nx = x + dx;
      const ny = y + dy;
      const bx = x - dx;
      const by = y - dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
      const n = ny * W + nx;
      const b = by * W + bx;
      if (
        h[n] !== h[t] + 1 ||
        h[b] !== h[t] ||
        !up(n) ||
        !inside(b) ||
        wet[n] ||
        used.has(t) ||
        used.has(n) ||
        used.has(b)
      )
        continue;
      out.push([t, n]);
      used.add(t);
      used.add(n);
      return true;
    }
    return false;
  };
  const bank = (i: number) => mask[i] === 0 && !keepOff[i];
  // (each stretch of a bed or hollow at one level, 4-connected, a ford's lane aside, joined to the land: by a ford, or
  // from the highest down by ground at its own level beside it or else a step up onto ground already joined, a bank or
  // a stretch joined before it)
  const comp = new Int32Array(W * H).fill(-1);
  const comps: { tiles: number[]; level: number }[] = [];
  beds.forEach((bed, k) => {
    const own = k + 1;
    for (const t0 of [...bed.tiles, ...(bed.hollow ?? [])].sort((a, b) => a - b)) {
      if (mask[t0] !== own || comp[t0] >= 0 || lane[t0]) continue;
      const id = comps.length;
      const tiles = [t0];
      comp[t0] = id;
      for (let q = 0; q < tiles.length; q++) {
        const c = tiles[q];
        const x = c % W;
        const y = (c - x) / W;
        for (const [dx, dy] of D4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const n = yy * W + xx;
          if (comp[n] < 0 && mask[n] === own && !lane[n] && h[n] === h[c]) {
            comp[n] = id;
            tiles.push(n);
          }
        }
      }
      comps.push({ tiles, level: h[t0] });
    }
  });
  const linked = new Uint8Array(comps.length);
  const order = comps.map((_, id) => id).sort((a, b) => comps[b].level - comps[a].level || a - b);
  for (const id of order) {
    const { tiles } = comps[id];
    const level = (i: number) => {
      if (fordLow.has(i)) return true;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx;
        if (h[n] === h[i] && !wet[n] && (mask[n] === 0 ? true : comp[n] >= 0 && comp[n] !== id && linked[comp[n]]))
          return true;
      }
      return false;
    };
    if (tiles.some(level)) {
      linked[id] = 1;
      continue;
    }
    const inComp = (i: number) => comp[i] === id;
    const up = (i: number) => (mask[i] === 0 ? bank(i) : comp[i] >= 0 && linked[comp[i]] === 1);
    for (const t of [...tiles].sort((a, b) => a - b))
      if (stepFrom(t, inComp, up)) {
        linked[id] = 1;
        break;
      }
  }
  // (and the stretches joined one to the next, so the colony walks a bed from its head to its end: a step up from each
  // to a stretch a level over it beside it that no step joins it to yet; stretches of two beds at one level join)
  const root = comps.map((_, id) => id);
  const findC = (i: number): number => {
    while (root[i] !== i) {
      root[i] = root[root[i]];
      i = root[i];
    }
    return i;
  };
  const joinC = (a: number, b: number) => {
    const ra = findC(a);
    const rb = findC(b);
    if (ra !== rb) root[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (const [lo, hi] of out) if (comp[lo] >= 0 && comp[hi] >= 0) joinC(comp[lo], comp[hi]);
  for (const id of order) {
    const { tiles, level } = comps[id];
    const above = new Set<number>();
    for (const t of tiles) {
      const x = t % W;
      const y = (t - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const c = comp[yy * W + xx];
        if (c < 0 || c === id) continue;
        if (comps[c].level === level) joinC(id, c);
        else if (comps[c].level === level + 1) above.add(c);
      }
    }
    const inComp = (i: number) => comp[i] === id;
    for (const a of [...above].sort((u, v) => u - v)) {
      if (findC(a) === findC(id)) continue;
      for (const t of [...tiles].sort((u, v) => u - v))
        if (stepFrom(t, inComp, (i) => comp[i] === a)) {
          joinC(id, a);
          break;
        }
    }
  }
  return {
    steps: out,
    stranded: comps.filter((_, id) => !linked[id]).map((c) => c.tiles),
  };
}
