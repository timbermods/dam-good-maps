// The first frame's arithmetic (docs/PREMISES.md §4.3): how far in front of a start a landmark's lip may stand and
// still be whole in the game's first camera, derived from `analysis/opening.ts`'s camera, never retyped. Stage 0
// places the start and the lip together by it; stage 3 (`checkFrame`, later) reads the built land through the same
// camera.
//
// The camera looks down at 60° (`OPENING.pitch`) from `32 × 1.3^(0.1 z)` tiles (`baseDistance`, `zoomBase`,
// `zoomPerLevel`) away from its target, which lies `z × cot 60°` past the start's middle on level 0. A point at height
// `h`, `ahead` tiles in front of the start's middle along the look, is under the frame's top edge (v ≤ `vTop`) when
// the line to it dips at least `pitch − atan(vTop × tan(fov / 2))` below the horizon. Solved for `ahead`:
//
//   ahead ≤ reach × distance(z) + run × z − perLevel × h      (0.4342, 0.577 and 1.0788 at vTop 0.98)
//
// v does not depend on how far the point stands to the side, so the limit holds across the whole frame.

import { COS_P, frameAt, levelDoorTurns, OPENING, openingCamera, SIN_P, TAN_H, TAN_V, type OpeningStart } from "../analysis/opening";
import { reachAt, slopeLinks, walkDistance } from "../analysis/walk";
import { placeSlopes, SLOPE_RULES } from "../features/slopes";
import type { Orientation } from "../format/footprints";
import { pow, sqrt } from "../math/portable";
import { distanceFrom } from "../math/grid";
import { moisture } from "../sim/moisture";
import { startBench } from "../validate/playability";
import type { PremisePlan, Point } from "./types";
import type { StageWater } from "./water";

export const FRAME = {
  /** The frame's top edge, as `frameAt`'s v, with a margin (the hand-built map's measure). */
  vTop: 0.98,
  /** Its sides, as |u|. */
  uSide: 0.95,
  /** The nearest a lip may stand: the start's 5 × 5 dry (`start.dry`) and a plunge pool two wide in front of the lip. */
  lipNearest: 5.5,
  /** The farthest a lip may stand (§4.1's 5.5 to 7), under the top edge's own limit (7.6 for a landmark of 6). */
  lipFarthest: 7,
  /** The share of the frame's width the landmark's lip spans. */
  lipShare: [0.35, 0.56] as const,
  /** The lip runs across the look within this angle: its sine. */
  acrossSin: 0.25881904510252074, // sin 15°
  /** The water over a landmark's lip, added to its crest for the frame (PREMISES §4.3's 0.3). */
  overLip: 0.3,
  /** How far stage 0 keeps the lip's line short of the frame's top edge, in tiles: the lip is laid as a stair of runs
   *  (raster/falls.ts `lipStair`), whose tiles stand up to a tile either side of the line, and stage 3 reads each
   *  tile at its edge toward the camera, half a tile to most of a tile nearer than its middle. Without it a third of
   *  the plans at 128² had lip tiles over the top edge (v to 1.1). */
  lipStair: 0.5,
} as const;

const TAN_PITCH = SIN_P / COS_P;

/** The frame's three coefficients at a top edge `v` (0.98 by default): `reach` per tile of camera distance, `run`
 *  per level of the start (cot 60°) and `perLevel` per level of the point's height. */
export function frameCoefficients(v: number = FRAME.vTop): { reach: number; run: number; perLevel: number } {
  // tan(pitch − b) with tan b = v × tan(fov / 2): the dip of the frame's edge row
  const tb = v * TAN_V;
  const dip = (TAN_PITCH - tb) / (1 + TAN_PITCH * tb);
  const perLevel = 1 / dip;
  return { reach: SIN_P * perLevel - COS_P, run: COS_P / SIN_P, perLevel };
}

/** The camera's distance from its target for a start on level `z`, at the game's first zoom (`z × 0.1`). */
export function firstDistance(z: number): number {
  return pow(OPENING.zoomBase, z * OPENING.zoomPerLevel) * OPENING.baseDistance;
}

/** How far in front of a start on level `z` (along the camera's look, from its middle) a point at height `h` may stand
 *  and stay under the first frame's top edge: PREMISES §4.3's `0.4342 × 32 × 1.3^(0.1 z) + 0.577 z − 1.0788 h`. */
export function frameLimit(z: number, h: number, v: number = FRAME.vTop): number {
  const c = frameCoefficients(v);
  return c.reach * firstDistance(z) + c.run * z - c.perLevel * h;
}

/** How far a point (tiles) stands in front of the start's middle along the camera's look, and to its right. */
export function aheadOf(start: OpeningStart, p: Point): { ahead: number; side: number } {
  const cam = openingCamera(start);
  const dx = p[0] - start.x;
  const dy = p[1] - start.y;
  return { ahead: dx * cam.look[0] + dy * cam.look[1], side: dx * cam.right[0] + dy * cam.right[1] };
}

/** The first frame's width in tiles, side to side at |u| = 1, at a point `ahead` in front of the start at height `h`. */
export function frameWidthAt(start: OpeningStart, ahead: number, h: number): number {
  const d = firstDistance(start.z);
  // the eye stands `d cos p` behind the target, which is `run × z` past the start's middle
  const fromEye = ahead - (start.z * COS_P) / SIN_P + d * COS_P;
  const zc = fromEye * COS_P - (h - d * SIN_P) * SIN_P;
  return 2 * zc * TAN_H;
}

export interface LipInFrame {
  /** The lip's ends ahead of the start, and the limit for its height. */
  ahead: [number, number];
  limit: number;
  /** Where its ends and its foot's ends fall in the first frame (u across, v up). */
  ends: { u: number; v: number }[];
  feet: { u: number; v: number }[];
  /** Its length over the frame's width at its depth. */
  share: number;
  /** The sine of its angle off square to the look. */
  skew: number;
}

/** A lip (two crest ends in tiles, the crest at `crest`) and its foot (`foot`, the water's level under it) as the
 *  start's first camera sees them. The foot is read 1.5 tiles toward the camera from each end. */
export function lipInFrame(start: OpeningStart, lip: [Point, Point], crest: number, foot: number): LipInFrame {
  const cam = openingCamera(start);
  const h = crest + FRAME.overLip;
  const a0 = aheadOf(start, lip[0]).ahead;
  const a1 = aheadOf(start, lip[1]).ahead;
  const at = (p: Point, z: number) => frameAt(cam, p[0] + 0.5, p[1] + 0.5, z) ?? { u: Infinity, v: Infinity };
  const ends = lip.map((p) => at(p, h));
  const feet = lip.map((p) => at([p[0] - 1.5 * cam.look[0], p[1] - 1.5 * cam.look[1]], foot));
  const lx = lip[1][0] - lip[0][0];
  const ly = lip[1][1] - lip[0][1];
  const across = Math.abs(lx * cam.right[0] + ly * cam.right[1]);
  const along = Math.abs(lx * cam.look[0] + ly * cam.look[1]);
  const len = sqrt(lx * lx + ly * ly);
  return {
    ahead: [a0, a1],
    limit: frameLimit(start.z, h),
    ends,
    feet,
    share: across / frameWidthAt(start, (a0 + a1) / 2, h),
    skew: len > 0 ? along / len : 0,
  };
}

// ------------------------------------------------------------------------------------------------- stage 3

/** Stage 3's numbers (PREMISES §2.2, §4.4). */
export const START = {
  /** How far stage 3 moves the start from where the plan put it, in tiles each way. */
  shift: 4,
  /** The walk a start's moist land is counted within (the checks' `NEAR`). */
  near: 20,
  /** `frame.water`: the share of the first frame's water at most `shallow` deep. */
  shallowShare: 0.85,
  shallow: 1.2,
  /** The drowned river's ribbon through the bay (`WaterRaster.ribbon`) stays two levels under its lake's sill, its
   *  head over that (2.1 to 2.4 deep): the pump's water when a breach sinks the lake a level in a drought. */
  ribbon: 2.5,
  /** `start.reach` read before the build (`slopeReach`, the start's own slopes on the land) is this share of its
   *  floor at least: the build's other slopes (its works', the water rule's) and its settled water gave the built map
   *  1.1 to 1.3 times the reading (seeds 1 to 6 at 128²), so a start under it is drawn again before its settle. */
  reachRead: 0.75,
} as const;

/** The start stage 3 settled on, what it measured there, and why it does not hold, in one line. */
export interface FrameCheck {
  start: { x: number; y: number; z: number; orientation: Orientation };
  /** Tiles it moved from the plan's start (0: where the plan put it). */
  moved: number;
  /** The start's bench (`start.level_land`), its moist land within 20 tiles' walk (`start.farmland` with the
   *  forester's plot, `start.forester`) and the dry land it walks to once the slopes stand (`start.reach`: every
   *  step of one level is a slope's, `features/slopes.ts`), on the land and its water by number. */
  bench: number;
  moist: number;
  reach: number;
  /** The share of the first frame's water at most 1.2 deep, its bodies' beds raised. */
  shallow: number;
  /** The beds raised in the frame: tile, new height, by pairs (`checkFrame` lays them on the heights it was given). */
  raise?: number[];
  /** Null when the start holds; else the first rule it fails, in one line. */
  reason: string | null;
}

/** The water stage 1 laid that carries water on day 1 (its bodies and channels), as depths on the land. */
export function dayOneWater(plan: PremisePlan, w: StageWater, heights: Uint8Array): Float64Array {
  const { raster: r, table } = w;
  const depth = new Float64Array(plan.W * plan.H);
  for (let i = 0; i < depth.length; i++) {
    let wet = false;
    if (r.lake[i]) wet = table.bodies[plan.bodies[r.lake[i] - 1].id]?.dry === false;
    else if (r.channel[i]) wet = (table.links[plan.links[r.channel[i] - 1].id]?.flow ?? 0) > 0;
    if (!wet) continue;
    const s = r.surface[i];
    depth[i] = s === s ? Math.max(0.1, s - heights[i]) : 0.3;
  }
  return depth;
}

/** What stage 3 holds a start to (D515): the shared gate's floors (`rulesFor`: `start.level_land`'s bench,
 *  `start.reach`'s walkable land, and `start.farmland` with `start.forester`'s plot as moist land), never numbers of a
 *  premise's own. `early`: judged on the skeleton's land before the works are sited (`siting.ts` `Refuse`), where
 *  only the reasons the side network cannot undo are read: the 5 × 5, its door, the landmark's lip and foot in the
 *  frame, and the bench (the side network only takes ground from it, and `buildBench` builds it the same on both).
 *  The water's depth in the frame and the moist land are left to the full land (side water adds both), and so is the
 *  walkable land (the build's own slopes add to it: the works', the water rule's), so an early refusal never turns
 *  down a layout the full map would pass. */
export interface FrameNeeds {
  bench: number;
  moist: number;
  reach: number;
  early?: boolean;
}

/** Stage 3 (PREMISES §2.2): the start placed for the first frame on the land stage 2 made. Every lip and foot tile of
 *  the landmark is read through the start's own first camera (`openingCamera` at `start.z × 0.1`, `frameAt`); the
 *  start's 5 × 5 is dry and level at its level, with a level door at its turn; 85 % of the frame's water is at most
 *  1.2 deep (`frame.water`); and the start's bench and its moist land within 20 tiles' walk, counted on the land and
 *  the water by number as the checks count them, meet `needs` (`FrameNeeds`). The plan's start is kept when it holds;
 *  else the nearest tile within `START.shift` that does (the start onto the meadow, §9); else the one whose land comes
 *  nearest, with the reason it fails (stage 8 then draws the next plan). */
export function checkFrame(plan: PremisePlan, w: StageWater, heights: Uint8Array, needs: FrameNeeds): FrameCheck {
  const { W, H } = plan;
  const N = W * H;
  const s0 = plan.frame.start;
  const z = s0.z;
  const depth = dayOneWater(plan, w, heights);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = depth[i] > 0 ? 1 : 0;
  // (the moist land is read on the full land only: see `FrameNeeds`)
  const moist = needs.early ? new Float64Array(N) : moisture(heights, depth, new Float64Array(N), W, H);
  // the landmark's lip (its crest, with the water over it) and its foot (its plunge pool, at its water)
  const li = plan.links.findIndex((l) => l.id === plan.frame.landmark);
  const lipTiles = li >= 0 ? (w.raster.lips[plan.links[li].id] ?? []) : [];
  const crest = (li >= 0 ? (plan.links[li].fall?.crest ?? z) : z) + FRAME.overLip;
  const foot: number[] = [];
  for (let i = 0; i < N; i++) if (li >= 0 && w.raster.pool[i] === li + 1) foot.push(i);
  const judge = (x: number, y: number): FrameCheck => {
    const start = { x, y, z, orientation: s0.orientation };
    const out: FrameCheck = { start, moved: Math.max(Math.abs(x - s0.x), Math.abs(y - s0.y)), bench: 0, moist: 0, reach: 0, shallow: 1, reason: null };
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return { ...out, reason: "the start's 5 × 5 runs off the map" };
        const i = yy * W + xx;
        if (wet[i]) return { ...out, reason: "water inside the start's 5 × 5" };
        if (heights[i] !== z) return { ...out, reason: `the start's 5 × 5 is not level at ${z}` };
      }
    if (!levelDoorTurns(heights, W, H, x, y, z).some((t) => t.o === s0.orientation)) return { ...out, reason: "the start's door is not level" };
    const cam = openingCamera(start);
    const inside = (i: number, h: number, low: boolean, edge = 0) => {
      const p = frameAt(cam, (i % W) + 0.5 - edge * Math.sign(cam.look[0]), Math.floor(i / W) + 0.5 - edge * Math.sign(cam.look[1]), h);
      return !!p && Math.abs(p.u) <= FRAME.uSide && p.v <= FRAME.vTop && (!low || p.v >= -1);
    };
    // (a lip tile is seen where its water pours: its corner toward the camera, the fall facing the start)
    const outLip = lipTiles.filter((i) => !inside(i, crest, false, 0.5)).length;
    if (outLip) return { ...out, reason: `${outLip} of the landmark's ${lipTiles.length} lip tiles fall outside the first frame` };
    const outFoot = foot.filter((i) => !inside(i, heights[i] + depth[i], true)).length;
    if (outFoot) return { ...out, reason: `${outFoot} of the landmark's ${foot.length} foot tiles fall outside the first frame` };
    // the start's bench: the dry ground at its level joined to it without a slope (`start.level_land`)
    out.bench = startBench(heights, wet, null, W, H, { x, y });
    if (out.bench < needs.bench) return { ...out, reason: `${out.bench} tiles of level ground on the start's bench (at least ${needs.bench})` };
    if (needs.early) return out;
    // the walkable land, read before the build on the slopes it derives for the start alone (`START.reach`)
    out.reach = slopeReach(heights, wet, W, H, x, y);
    if (out.reach < START.reachRead * needs.reach) return { ...out, reason: `${out.reach} dry tiles walkable from the start once its slopes stand (at least ${Math.ceil(START.reachRead * needs.reach)} before the build's own)` };
    // the frame's water shallow: water three levels deep is near black in the game (§4.3). A body's bed inside the
    // frame rises to hold its water at most 1.2 deep (a lip's crest and the channels keep theirs), the drowned river's
    // ribbon through the bay 2.5, the pump's in a drought
    let all = 0;
    let shallow = 0;
    const raise: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!depth[i]) continue;
      const surface = heights[i] + depth[i];
      const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, surface);
      if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) continue;
      all++;
      let d = depth[i];
      const most = w.raster.ribbon[i] ? START.ribbon : START.shallow;
      if (d > most && w.raster.lake[i] && !w.raster.crest[i]) {
        raise.push(i, Math.ceil(surface - most));
        d = surface - Math.ceil(surface - most);
      }
      if (d <= most + 1e-9) shallow++;
    }
    out.shallow = all ? shallow / all : 1;
    out.raise = raise;
    if (out.shallow < START.shallowShare) return { ...out, reason: `${Math.round(100 * out.shallow)} % of the first frame's water is 1.2 deep or less (${100 * START.shallowShare} % asked)` };
    const walk = walkDistance(heights, W, H, null, [], { x, y });
    for (let i = 0; i < N; i++) if (!wet[i] && moist[i] > 0 && reachAt(walk, W, H, i) <= START.near) out.moist++;
    if (out.moist < needs.moist) return { ...out, reason: `${out.moist} tiles of moist land within ${START.near} tiles' walk of the start, for its farms and a forester (at least ${needs.moist})` };
    return out;
  };

  const held = (c: FrameCheck): FrameCheck => {
    const r = c.raise ?? [];
    for (let k = 0; k < r.length; k += 2) heights[r[k]] = r[k + 1];
    return { ...c, raise: r };
  };
  const first = judge(s0.x, s0.y);
  if (!first.reason) return held(first);
  // the nearest tile that holds; else the one whose land comes nearest the start's needs
  const near: [number, number][] = [];
  for (let dy = -START.shift; dy <= START.shift; dy++) for (let dx = -START.shift; dx <= START.shift; dx++) if (dx || dy) near.push([dx, dy]);
  near.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  const score = (c: FrameCheck) => (needs.early ? c.bench / Math.max(1, needs.bench) : Math.min(c.bench / Math.max(1, needs.bench), c.reach / Math.max(1, START.reachRead * needs.reach), c.moist / Math.max(1, needs.moist)));
  let best = first;
  for (const [dx, dy] of near) {
    const c = judge(s0.x + dx, s0.y + dy);
    if (!c.reason) return held(c);
    if (score(c) > score(best)) best = c;
  }
  return best;
}

/** How far stage 2 may move the ground to make the start's bench (`buildBench`): a tile at most `lower` levels over
 *  the start's level is cut down to it, one at most `raise` under is filled up, none whose neighbour would then stand
 *  two levels off it, and none within `guard` tiles of the water, a lip or a crest, nor on the ground stage 1
 *  decided. */
export const BENCH = { lower: 2, raise: 1, guard: 2 } as const;

/** The start's bench made by construction (D515): where the land stage 2 drew gives the start less dry level ground at
 *  its level than `want`, the ground round its 5 × 5 is brought to its level, nearest first and leaning away from the
 *  landmark (the bench extends behind the first frame's look, the landmark stays in it), until the bench holds `want`
 *  or no more ground may move (`BENCH`). Lays the heights in place; returns the tiles it moved. The water's own
 *  ground, the guard under it and every lip stay as stage 1 decided them. */
export function buildBench(plan: PremisePlan, w: StageWater, heights: Uint8Array, want: number): number {
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const { x: sx, y: sy, z } = plan.frame.start;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || want <= 0) return 0;
  const water = new Uint8Array(N);
  for (let i = 0; i < N; i++) water[i] = r.lake[i] || r.channel[i] || r.pool[i] || r.crest[i] ? 1 : 0;
  for (const tiles of Object.values(r.lips)) for (const i of tiles) water[i] = 1;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = r.lake[i] || r.channel[i] ? 1 : 0;
  if (startBench(heights, wet, null, W, H, { x: sx, y: sy }) >= want) return 0;
  const near = distanceFrom(water, W, H);
  const look = openingCamera(plan.frame.start).look;
  // a tile the bench may take: at the start's level and dry, or ground it may move to that level
  const takes = (i: number) => {
    if (water[i]) return false;
    const h = heights[i];
    if (h === z) return !wet[i];
    if (r.fixed[i] || near[i] <= BENCH.guard || r.heights[i] > z) return false;
    if (h > z ? h - z > BENCH.lower : z - h > BENCH.raise) return false;
    // (never a step of two made: the ground beside it stays a level from the bench, so the slopes still join it)
    const x = i % W;
    const y = (i - x) / W;
    const off = (n: number) => Math.abs(heights[n] - z) > 1;
    return !((x > 0 && off(i - 1)) || (x + 1 < W && off(i + 1)) || (y > 0 && off(i - W)) || (y + 1 < H && off(i + W)));
  };
  // grown nearest first, a tile in front of the start (toward the landmark) costing twice its reach
  const cost = (i: number) => {
    const dx = (i % W) - sx;
    const dy = Math.floor(i / W) - sy;
    return sqrt(dx * dx + dy * dy) + Math.max(0, dx * look[0] + dy * look[1]);
  };
  const seen = new Uint8Array(N);
  const heap: number[] = [];
  const keys: number[] = [];
  const push = (i: number) => {
    seen[i] = 1;
    const k = cost(i);
    let n = heap.length;
    heap.push(i);
    keys.push(k);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (keys[p] <= k) break;
      heap[n] = heap[p];
      keys[n] = keys[p];
      n = p;
    }
    heap[n] = i;
    keys[n] = k;
  };
  const pop = (): number => {
    const top = heap[0];
    const li = heap.pop()!;
    const lk = keys.pop()!;
    if (heap.length) {
      let n = 0;
      for (;;) {
        const a = 2 * n + 1;
        if (a >= heap.length) break;
        const b = a + 1 < heap.length && keys[a + 1] < keys[a] ? a + 1 : a;
        if (keys[b] >= lk) break;
        heap[n] = heap[b];
        keys[n] = keys[b];
        n = b;
      }
      heap[n] = li;
      keys[n] = lk;
    }
    return top;
  };
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx;
      const y = sy + dy;
      if (x >= 0 && y >= 0 && x < W && y < H && !seen[y * W + x] && takes(y * W + x)) push(y * W + x);
    }
  let size = 0;
  let moved = 0;
  while (heap.length && size < want) {
    const i = pop();
    if (heights[i] !== z) {
      heights[i] = z;
      moved++;
    }
    size++;
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0 && !seen[i - 1] && takes(i - 1)) push(i - 1);
    if (x + 1 < W && !seen[i + 1] && takes(i + 1)) push(i + 1);
    if (y > 0 && !seen[i - W] && takes(i - W)) push(i - W);
    if (y + 1 < H && !seen[i + W] && takes(i + W)) push(i + W);
  }
  return moved;
}

/** The dry tiles a start walks to once the generator's slopes stand (`start.reach`, read before the build): the
 *  slopes the build derives for a start there (`placeSlopes`, `SLOPE_RULES`), walked off the water. */
export function slopeReach(heights: Uint8Array, wet: Uint8Array, W: number, H: number, sx: number, sy: number): number {
  const occ = new Uint8Array(W * H);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) occ[(sy + dy) * W + sx + dx] = 1;
  const slopes = placeSlopes(heights, W, H, { x: sx, y: sy }, occ, SLOPE_RULES);
  const d = walkDistance(heights, W, H, wet, slopeLinks(slopes, W, H), { x: sx, y: sy }, W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (d[i] < Infinity && !wet[i]) n++;
  return n;
}
