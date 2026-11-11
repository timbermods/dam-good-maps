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
import { reachAt, walkDistance } from "../analysis/walk";
import type { Orientation } from "../format/footprints";
import { pow, sqrt } from "../math/portable";
import { moisture } from "../sim/moisture";
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
  /** The walk a start's level land and farmland are counted within (the checks' `NEAR`). */
  near: 20,
  /** `frame.water`: the share of the first frame's water at most `shallow` deep. */
  shallowShare: 0.85,
  shallow: 1.2,
} as const;

/** The start stage 3 settled on, what it measured there, and why it does not hold, in one line. */
export interface FrameCheck {
  start: { x: number; y: number; z: number; orientation: Orientation };
  /** Tiles it moved from the plan's start (0: where the plan put it). */
  moved: number;
  /** The level building land and the moist farmland within 20 tiles' walk, on the land and its water by number. */
  level: number;
  farmland: number;
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

/** Stage 3 (PREMISES §2.2): the start placed for the first frame on the land stage 2 made. Every lip and foot tile of
 *  the landmark is read through the start's own first camera (`openingCamera` at `start.z × 0.1`, `frameAt`); the
 *  start's 5 × 5 is dry and level at its level, with a level door at its turn; 85 % of the frame's water is at most
 *  1.2 deep (`frame.water`); and the level land and farmland within 20 tiles' walk, counted on the land and the water
 *  by number as the checks count them, meet `needs` (`start.level_land`, `start.farmland`). The plan's start is kept
 *  when it holds; else the nearest tile within `START.shift` that does (the start onto the meadow, §9); else the one
 *  whose land comes nearest, with the reason it fails (stage 8 then draws the next plan). */
export function checkFrame(plan: PremisePlan, w: StageWater, heights: Uint8Array, needs: { level: number; farmland: number }): FrameCheck {
  const { W, H } = plan;
  const N = W * H;
  const s0 = plan.frame.start;
  const z = s0.z;
  const depth = dayOneWater(plan, w, heights);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = depth[i] > 0 ? 1 : 0;
  const moist = moisture(heights, depth, new Float64Array(N), W, H);
  // the landmark's lip (its crest, with the water over it) and its foot (its plunge pool, at its water)
  const li = plan.links.findIndex((l) => l.id === plan.frame.landmark);
  const lipTiles = li >= 0 ? (w.raster.lips[plan.links[li].id] ?? []) : [];
  const crest = (li >= 0 ? (plan.links[li].fall?.crest ?? z) : z) + FRAME.overLip;
  const foot: number[] = [];
  for (let i = 0; i < N; i++) if (li >= 0 && w.raster.pool[i] === li + 1) foot.push(i);
  // (flat, dry 2 × 2s: the level building land, as the checks find it)
  const flat = new Uint8Array(N);
  for (let y = 0; y + 1 < H; y++)
    for (let x = 0; x + 1 < W; x++) {
      const i = y * W + x;
      const v = heights[i];
      if (heights[i + 1] !== v || heights[i + W] !== v || heights[i + W + 1] !== v) continue;
      if (wet[i] || wet[i + 1] || wet[i + W] || wet[i + W + 1]) continue;
      flat[i] = flat[i + 1] = flat[i + W] = flat[i + W + 1] = 1;
    }

  const judge = (x: number, y: number): FrameCheck => {
    const start = { x, y, z, orientation: s0.orientation };
    const out: FrameCheck = { start, moved: Math.max(Math.abs(x - s0.x), Math.abs(y - s0.y)), level: 0, farmland: 0, shallow: 1, reason: null };
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
    // the frame's water shallow: water three levels deep is near black in the game (§4.3). A body's bed inside the
    // frame rises to hold its water at most 1.2 deep (a lip's crest and the channels keep theirs)
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
      if (d > START.shallow && w.raster.lake[i] && !w.raster.crest[i]) {
        raise.push(i, Math.ceil(surface - START.shallow));
        d = surface - Math.ceil(surface - START.shallow);
      }
      if (d <= START.shallow + 1e-9) shallow++;
    }
    out.shallow = all ? shallow / all : 1;
    out.raise = raise;
    if (out.shallow < START.shallowShare) return { ...out, reason: `${Math.round(100 * out.shallow)} % of the first frame's water is 1.2 deep or less (${100 * START.shallowShare} % asked)` };
    const walk = walkDistance(heights, W, H, null, [], { x, y });
    for (let i = 0; i < N; i++) {
      if (wet[i] || reachAt(walk, W, H, i) > START.near) continue;
      if (moist[i] > 0) out.farmland++;
      if (flat[i]) out.level++;
    }
    if (out.level < needs.level) return { ...out, reason: `${out.level} tiles of level building land within ${START.near} tiles' walk of the start (at least ${needs.level})` };
    if (out.farmland < needs.farmland) return { ...out, reason: `${out.farmland} tiles of moist farmland within ${START.near} tiles' walk of the start (at least ${needs.farmland})` };
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
  const score = (c: FrameCheck) => Math.min(c.level / needs.level, c.farmland / needs.farmland);
  let best = first;
  for (const [dx, dy] of near) {
    const c = judge(s0.x + dx, s0.y + dy);
    if (!c.reason) return held(c);
    if (score(c) > score(best)) best = c;
  }
  return best;
}
