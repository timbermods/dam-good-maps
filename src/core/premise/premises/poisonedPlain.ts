// The poisoned floodplain (docs/design/poisoned-floodplain.md; PREMISES.md §7 row 14): "The widest flat on the map is
// dead along a red stream. Turn the stream into the old dry valley and bring the river in behind it: the best land is
// yours."
//
// Build step 1 of the design's §9: the plan only (stage 0, pure arithmetic, no terrain): `eligible`, `draw` (from the
// stream `premise.plan`) and the `plan` invariants of the design's §7 with §1.4's shared checks. Not offered: it is not
// in `spec/mapspec.ts` `PREMISE_IDS`, so not in the choices, Any or a link; `premises/dev.ts` lists it for the tools
// and tests. No map is made from it yet. Playability (the start's room, wood and reach) is the shared gate's (D515).
//
// Land first (PREMISES §5.1): every landform is one a river makes, and nothing is laid along a ruled line. The plan says
// where, by number and position; stage 2 shapes by noise and distance. The courses wander (`gateBrooks.ts` `meander`);
// the walls' feet, the risers, the backswamp's edge and the levees' widths are noise, kept here as their parameters or
// as lines sampled from them. The gulch, the col and the Dry Fork are found by stage 2's search (the design's §3): the
// plan gives the search its window on the far wall and the target numbers.
//
// The plan is laid out in a local frame, then turned onto the map: u down the valley (0 at the upstream edge, where the
// river rises), v across it (0 at the near edge, the near wall the river hugs; N at the far edge, behind the far wall).
// Across the floor from the near wall: the river (in the near third) between its levees, the plain at level L falling a
// level at each riser down the valley, the backswamp a level under it under the far wall. The start's terrace stands
// two over the plain at the plain's upstream end, on the plain's side of the river, looking down the valley and across
// the plain to the Red Fall under the far wall.

import { frameAt, LANDMARK_FAR, LANDMARK_NEAR, openingCamera, VISTA_ZOOM } from "../../analysis/opening";
import { ORIENTATIONS, type Orientation } from "../../format/footprints";
import { BED_FLOOR } from "../../land/genome";
import { fbm } from "../../math/noise";
import { sillWidthFor } from "../../sim/sill";
import { EDITOR_LEVEL, type MapSpec } from "../../spec/mapspec";
import { FLOOR_MARGIN, START_FLOORS } from "../../validate/playability";
import type { PlanOverlay } from "../diagram";
import { premiseStream } from "../draw";
import { FRAME } from "../frame";
import { meander, sampled } from "../gateBrooks";
import { dist, headingOf, pathDist, pathLength, pointAt } from "../geom";
import { fail, nameOf, OK, PLAN_CHECKS } from "../planChecks";
import type { Body, Edge, Exit, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, Source, Work } from "../types";
import { STAIR_FLOW } from "./lakeStair";

export const PLAIN_ID = "poisonedPlain";

// ------------------------------------------------------------------------------------------------- the numbers

/** Square maps, 128² to 256² (the design's §2: the plain needs a side of 128 or more; PREMISES ruling 7: squares only). */
export const PLAIN_SIDE = [128, 256] as const;
/** The green band's reach, `M`: how far the river's moisture crosses a levee one level over its water onto the plain
 *  (the design's §2, `gameMoistureReach` on the first land). The working value: step 2 measures it on the land and
 *  this constant takes the measure (under 6, the levee's low places are widened until the band's mean is 6). */
export const M_REACH = 10;
/** The dry band's least share of the plain and the backswamp together on day 1 (the design's §2). */
export const DRY_LEAST = 0.3;
/** Day 1's dead band's share of the floor (the design's §2). */
export const DEAD_SHARE = [0.1, 0.25] as const;
/** The backswamp's width, tiles, at every place along it (the design's §1), and how far it wanders about its mean. */
export const SWAMP = { width: [7, 10], mean: [7.5, 9.5], wander: 1.5, cell: 16 } as const;
/** The plain's least width `P` (from the river's plain-side levee foot to the far wall's foot, the backswamp in it):
 *  P ≥ (M + 9) / 0.7 (the design's §2), and ≥ (M + the backswamp's widest) / 0.7 so the dry band holds where the
 *  backswamp is widest; drawn up to `spread` over. */
export const PLAIN_WIDTH = { dead: 9, spread: 5 } as const;
/** The least width the design's §2 asks of the plain. */
export const plainLeast = (M: number = M_REACH): number => Math.ceil((M + PLAIN_WIDTH.dead) / (1 - DRY_LEAST));
/** The levees (the design's §1): a bank each side of the river whose width is noise along it, 3 to 6; whose crest is a
 *  level over the plain for most of its length, level with it at 2 to 4 low places 4 to 8 long, and two over where the
 *  noise runs high (`hump`, above which the crest stands a level higher; the crest rule asks a change of height at
 *  least every fifth of the river's length on the plain, which 2 to 4 low places alone cannot give). */
export const LEVEE = { width: [3, 6], cell: [10, 16], low: [4, 8], lows: { small: [2, 3], large: [3, 4] }, apart: 12, crestCell: 11, hump: 0.4, humpLen: [4, 7], most: 0.2, mostAt1: 0.5 } as const;
/** The plain falls a level down the valley every 40 to 60 tiles, at a riser that wanders across the floor: its wander
 *  `amp` tiles by noise over `cell` tiles across. None within `end` tiles of the downstream edge. */
export const RISER = { every: [40, 60], amp: [3, 6], cell: [8, 14], end: 20 } as const;
/** The plain's longest run down the valley. At 192² and 256² the plain's upstream end, the terrace and the start stand
 *  this far from the downstream edge: the search window starts at a quarter of the plain's length (the design's §3),
 *  and the Red Fall at its start must stand inside the vista frame within `LANDMARK_FAR` of the start. Upstream of the
 *  terrace the river's upper course runs in the shared relief. */
export const PLAIN_LONG = 100;
/** The start's terrace: its length down the valley holds the start's bench (`frame.bench`) `room` times over beside
 *  the brook, which crosses it `brookAt` tiles from its upstream end; the start stands `lip` tiles back from its
 *  downstream lip and `off` tiles past the farthest the river's levee foot may stand (its room's far side). */
export const TERRACE = { len: [28, 56], room: 1.2, brookAt: 9, lip: 5, off: 3, rise: 2 } as const;
/** The search window on the far wall (the design's §3), as shares of the plain's length; the least run of it the vista
 *  frame shows from the start, tiles. */
export const WINDOW = { from: 0.25, to: 0.75, framed: 12 } as const;
/** The gulch (the Stain): its floor over the backswamp at its mouth (the Red Fall's height there), its width, its
 *  length into the far wall, its narrows (where in its lower half, how wide), how far its floor rises to its head; the
 *  col over the narrows' floor; the Dry Fork's fall from the col to its edge. */
export const GULCH = { h: [3, 5], width: [4, 7], len: [18, 30], slant: 0.4, narrowsAt: [0.2, 0.45], narrows: [2, 3], rise: [1, 3], colOver: 2, colOut: [7, 11], forkFall: [3, 6] } as const;
/** The red source's strength as a share of the river's (the design's §4: a fifth to a third), by the Badwater
 *  setting. */
export const RED_SHARE = { low: [0.2, 0.24], normal: [0.24, 0.29], high: [0.29, 1 / 3] } as const;
/** The start's brook: one small spring (under the Gate's brook springs, 2.0 to 2.6, for a brook 2 wide). */
export const BROOK_SPRING = [1.5, 2.0] as const;
/** The red stream's join, as a share of the river's length (the design's §4: in its last 30 %, D476, D498); how far
 *  down the valley its way across the plain runs for each tile across (`slant`); the least run along the backswamp
 *  below the Red Fall before it turns; how far before the turn its course may leave the backswamp (the meander's axis
 *  rounds the turn over 6 tiles, `BROOK_MEANDER.axis`). */
export const JOIN = { at: [0.72, 0.94], slant: [0.15, 0.4], swamp: 15, bend: 8 } as const;
/** The sloughs: one at 128², two over; 2 or 3 wide; drawn as a meander `bend` times its width (the design's bend every
 *  6 to 10 widths, where the brooks' `BROOK_MEANDER` bends every 3 to 7). The first (the river in's) from a low place
 *  `after` tiles past the Red Fall's mouth down the valley; the second above the mouth, `above` tiles inside the plain
 *  and the mouth, where the plain has room there, else `apart` below the first. `room`: the red stream turns off the
 *  backswamp this far below the lowest slough's mouth. */
export const SLOUGH = { width: [2, 3], bend: 1.6, after: [-6, 6], above: [10, 18], apart: [25, 40], slant: [0.4, 0.8], room: 6 } as const;
/** The springs' pool at the river's head and the small pools (the brook's spring, the red source, the Red Fall's foot). */
const POOL_R = { springs: 3, well: 1.5, red: 2, foot: 2 } as const;
/** Layouts an attempt draws before it gives up. */
const LAYOUT_TRIES = 24;

// ------------------------------------------------------------------------------------------------- the plan's own numbers

export interface Riser {
  /** Where it crosses the floor, u, and its wander across the floor by noise. */
  at: number;
  amp: number;
  cell: number;
  seed: number;
}

/** A run of a levee's crest along the river (arc length `from` to `to` along the river's path), `over` the plain. */
export interface CrestRun {
  from: number;
  to: number;
  over: 0 | 1 | 2;
}

/** A low place in a levee: where an old flood broke out, level with the plain. */
export interface LowPlace {
  id: string;
  side: "plain" | "near";
  from: number;
  to: number;
  /** Its middle at the levee's crest (map). */
  at: Point;
}

/** An old flood channel from a low place across the plain to the backswamp: a dry bed a level under the plain. */
export interface Slough {
  id: string;
  low: string;
  path: Point[];
  half: number;
  bed: number[];
}

/** The poisoned floodplain's own numbers (as the Gate's `GateNumbers`), kept so the invariants and the diagram read
 *  them directly. Lines and spans are local (u down the valley, v across it); points and paths are on the map. */
export interface PlainNumbers {
  /** The local frame onto the map: `turn` quarter turns (local v onto the map's north at 0), `mirror` u flipped first. */
  turn: number;
  mirror: boolean;
  /** The valley's lines, a sample every `step` tiles of u (0 to N): the near wall's foot, the far wall's foot and the
   *  backswamp's width under it, v. */
  step: number;
  near: number[];
  far: number[];
  swamp: number[];
  /** The river's centre's room, tiles off the near wall's foot: the near third of the floor. */
  room: [number, number];
  /** Levels: the plain at its upstream end (`L`), the terrace, the walls' crests. The backswamp stands a level under the
   *  plain where it is, the river's bed and the red stream's two under it. */
  L: number;
  terraceLevel: number;
  walls: { near: number; far: number };
  /** The plain's least width (levee foot to the far wall's foot, the backswamp in it), and `M`. */
  P: number;
  M: number;
  /** The start's terrace (u from, to) and where the plain begins (its upstream end, u). */
  terrace: [number, number];
  plainFrom: number;
  risers: Riser[];
  /** The levees: their width by noise along the river; the crest runs each side, along the river's path from where the
   *  plain begins (`from`) to its end (`to`); the low places. */
  levee: { width: { mid: number; amp: number; cell: number; seed: number }; from: number; to: number; plain: CrestRun[]; near: CrestRun[]; low: LowPlace[] };
  sloughs: Slough[];
  /** The far wall's search window (u along its foot) and the run of it the vista frame shows from the start. */
  window: { from: number; to: number; framed: [number, number] };
  /** The gulch's targets (stage 2 finds it): its mouth (u on the far wall's foot), the Red Fall's height over the
   *  backswamp there, its width and length, its head (map), its narrows (map, width, floor level), the rise of its
   *  floor from the mouth to the head. */
  gulch: { mouth: number; h: number; crest: number; width: number; length: number; head: Point; narrows: { at: Point; width: number; floor: number }; rise: number };
  /** The col between the gulch and the Dry Fork (its neighbour up or down the valley), and the Dry Fork's course from
   *  the col to an edge of its own, its bed from the col's level down to its edge's. */
  col: { at: Point; level: number; side: "up" | "down" };
  fork: { path: Point[]; bed: [number, number]; edge: Edge };
  /** The red stream's end by seed: joining the river (`at` tiles along its path) or leaving by an exit of its own;
   *  `swampTo` the u where it leaves the backswamp (its end, for an exit). */
  red: { end: "join" | "exit"; at?: number; swampTo: number };
  /** The flows: the river's springs together, the red source, the brook's spring. */
  flow: { river: number; red: number; brook: number };
  /** The badwater distance the start keeps (D469, D85). */
  badwater: number;
}

export type PlainPlan = Omit<PremisePlan, "premise"> & { premise: typeof PLAIN_ID; plain: PlainNumbers };

/** The poisoned floodplain's numbers of a plan, or null. */
export const plainOf = (plan: PremisePlan): PlainNumbers | null => (plan as unknown as Partial<PlainPlan>).plain ?? null;

/** The plan's ids. */
export const PLAIN_IDS = { river: "river", brook: "brook", redFall: "redFall", red: "red", springs: "springs", well: "well", redSpring: "redSpring", redPool: "redPool", out: "out", redOut: "redOut", stain: "stain", fork: "fork", col: "col" } as const;
const I = PLAIN_IDS;

// ------------------------------------------------------------------------------------------------- eligibility

const plainTop = (spec: MapSpec) => Math.min(spec.settings.terrain.highestTerrain, EDITOR_LEVEL);
/** The badwater distance the start keeps (as the shared gate reads it: `validate/playability.ts`). */
const badwaterOf = (spec: MapSpec) => Math.max(spec.settings.hazards.badwaterDistance, spec.settings.start.rules.badwaterWithin);
/** The most risers a plain of this side can hold. */
const mostRisers = (N: number) => Math.max(0, Math.floor((Math.min(PLAIN_LONG, N - TERRACE.len[0]) - RISER.end) / RISER.every[0]));
/** The plain's least level: the river's bed at the downstream end a level over the floor, the Red Fall's pool on it. */
const leastL = (N: number) => BED_FLOOR + 3 + mostRisers(N);

export function poisonedPlainEligible(spec: MapSpec): string | null {
  const { x, y } = spec.size;
  if (x !== y) return "The poisoned floodplain is drawn on square maps only, for now";
  if (x < PLAIN_SIDE[0]) return `The poisoned floodplain needs at least ${PLAIN_SIDE[0]} tiles a side for its broad valley floor`;
  if (x > PLAIN_SIDE[1]) return `The poisoned floodplain is drawn up to ${PLAIN_SIDE[1]} tiles a side`;
  if (spec.settings.hazards.badwater === "off") return "The poisoned floodplain is a red stream's story, and Badwater is Off";
  if (spec.settings.water.rivers === 0) return "The poisoned floodplain needs its river, and Rivers is 0";
  // the Red Fall's spring under the water's ceiling: the plain's lowest level, the backswamp under it, the fall over it
  if (leastL(x) - 1 + GULCH.h[0] + GULCH.rise[0] > plainTop(spec) - 2) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the plain's levels and the Red Fall`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the turn

/** The local frame onto the map: `k` quarter turns, `m` u mirrored first (as the Gate's `Turn`). */
interface Turn {
  k: number;
  m: boolean;
  N: number;
}

function toMap(T: Turn, [u0, v]: Point): Point {
  const u = T.m ? T.N - u0 : u0;
  const N = T.N;
  return T.k === 0 ? [u, v] : T.k === 1 ? [v, N - u] : T.k === 2 ? [N - u, N - v] : [N - v, u];
}

function toLocal(T: Turn, [x, y]: Point): Point {
  const N = T.N;
  const [u, v]: Point = T.k === 0 ? [x, y] : T.k === 1 ? [N - y, x] : T.k === 2 ? [N - x, N - y] : [y, N - x];
  return [T.m ? N - u : u, v];
}

function dirToMap(T: Turn, d: Point): Point {
  const a = toMap(T, [0, 0]);
  const b = toMap(T, d);
  return [b[0] - a[0], b[1] - a[1]];
}

/** The map edge an outward local direction meets. */
function edgeOf(T: Turn, out: Point): Edge {
  const [dx, dy] = dirToMap(T, out);
  return dx > 0.5 ? "E" : dx < -0.5 ? "W" : dy > 0.5 ? "N" : "S";
}

const turnOf = (plan: PremisePlan, p: PlainNumbers): Turn => ({ k: p.turn, m: p.mirror, N: plan.W });
const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Point): Point => [r2(p[0]), r2(p[1])];

/** A sampled line at u (linear between samples, held past its ends). */
export function lineAt(line: readonly number[], step: number, u: number): number {
  const f = Math.max(0, Math.min(line.length - 1, u / step));
  const k = Math.min(line.length - 2, Math.floor(f));
  return line[k] + (line[k + 1] - line[k]) * (f - k);
}

/** Where a riser crosses the floor at v (u). */
export const riserAt = (r: Riser, v: number): number => r.at + r.amp * fbm(r.seed, 0, v, r.cell, 2);

/** The plain's level at a local point: L, a level less past each riser. */
export function plainLevel(p: Pick<PlainNumbers, "L" | "risers">, u: number, v: number): number {
  let n = 0;
  for (const r of p.risers) if (u >= riserAt(r, v)) n++;
  return p.L - n;
}

/** A levee's width at `s` tiles along the river on one side. */
export function leveeWidth(p: Pick<PlainNumbers, "levee">, s: number, side: "plain" | "near"): number {
  const w = p.levee.width;
  return Math.max(LEVEE.width[0], Math.min(LEVEE.width[1], w.mid + w.amp * fbm(w.seed, s, side === "plain" ? 0 : 1000, w.cell, 2)));
}

/** The crest's height over the plain at `s` along the river on one side, by its runs (a level where no run says). */
export function crestOver(runs: readonly CrestRun[], s: number): number {
  for (const r of runs) if (s >= r.from && s < r.to) return r.over;
  return 1;
}

// ------------------------------------------------------------------------------------------------- the valley in local

/** A path's points every `step` tiles along it, its end included, each with its arc length and its unit direction:
 *  one pass (a `pointAt` a sample is quadratic in the path). */
export function walk(path: readonly Point[], step: number): { p: Point; s: number; dir: Point }[] {
  const out: { p: Point; s: number; dir: Point }[] = [];
  let run = 0;
  let next = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
    if (!(len > 0)) continue;
    const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    while (next <= run + len) {
      const t = (next - run) / len;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], s: next, dir });
      next += step;
    }
    run += len;
  }
  const last = path[path.length - 1];
  if (!out.length || out[out.length - 1].s < run - 1e-9) out.push({ p: [last[0], last[1]], s: run, dir: out[out.length - 1]?.dir ?? [1, 0] });
  return out;
}

/** The river's path in local, sampled every half tile, with each point's arc length along it and the unit normal
 *  toward the plain (+v). */
function riverLocal(T: Turn, path: readonly Point[]): { p: Point; s: number; n: Point }[] {
  return walk(
    path.map((q) => toLocal(T, q)),
    0.5,
  ).map(({ p, s, dir }) => {
    const n: Point = [-dir[1], dir[0]];
    return { p, s, n: n[1] >= 0 ? n : [-n[0], -n[1]] };
  });
}

/** The plain-side levee's foot (v) at each whole u, 0 to N (−Infinity where the river does not pass). */
function leveeFoot(p: PlainNumbers, N: number, half: number, river: ReturnType<typeof riverLocal>): Float64Array {
  const out = new Float64Array(N + 1).fill(-Infinity);
  for (const q of river) {
    const w = half + leveeWidth(p, q.s, "plain");
    const f: Point = [q.p[0] + q.n[0] * w, q.p[1] + q.n[1] * w];
    for (const u of [Math.floor(q.p[0]), Math.floor(f[0])]) if (u >= 0 && u <= N) out[u] = Math.max(out[u], f[1], q.p[1] + half);
  }
  // (a gap a meander's turn leaves: its neighbours')
  for (let u = 1; u < N; u++) if (out[u] === -Infinity) out[u] = Math.max(out[u - 1], out[u + 1]);
  return out;
}

// ------------------------------------------------------------------------------------------------- the layout

const RIVER_NAMES = ["the Alder River", "the Sedge River", "the Long River", "the Willow River", "the Grey River"];
const FALL_NAMES = ["the Red Fall", "the Rust Fall", "the Blood Fall"];
const STAIN_NAMES = ["the Stain", "the Red Gulch", "the Rust Gulch"];
const FORK_NAMES = ["the Dry Fork", "the Old Fork", "the Bare Fork"];

type Laid = { plan: PlainPlan } | { why: string };

function layout(spec: MapSpec, attempt: number, t: number): Laid {
  const rng = premiseStream(spec, "premise.plan", attempt, "plain", t);
  const draw = () => rng.float();
  const seedOf = () => rng.nextU32();
  const N = spec.size.x;
  const top = plainTop(spec);
  const sky = spec.settings.terrain.highestTerrain;
  const T: Turn = { k: rng.int(0, 4), m: rng.float() < 0.5, N };
  const flow = STAIR_FLOW[spec.settings.water.riverFlow];
  // the river's width by flow, as the lake stair's gorge: 5 wide carries about 13 a level deep, 6 wide the lush 22
  const half = flow > 18 ? 3 : 2.5;
  const dBw = badwaterOf(spec);

  // ---- across the floor: the near wall's foot, the river's room (the near third), the plain, the backswamp
  const swampMean = rng.range(SWAMP.mean[0], SWAMP.mean[1]);
  const Pleast = Math.max(plainLeast(), Math.ceil((M_REACH + SWAMP.width[1]) / (1 - DRY_LEAST)));
  const P = Pleast + rng.int(0, PLAIN_WIDTH.spread + 1);
  const lw = LEVEE.width[1];
  const room: [number, number] = [half + lw + 1, Math.floor((half + lw + P) / 2)];
  if (room[1] - room[0] < 4) return { why: "no room for the river in the near third" };
  const step = 4;
  const K = Math.ceil(N / step);
  const axis = { v0: N * rng.range(0.15, 0.24), amp: N * 0.05, cell: N * 0.45, seed: seedOf() };
  const farW = { amp: 4, cell: 24, seed: seedOf() };
  const swampW = { seed: seedOf() };
  const near: number[] = [];
  const far: number[] = [];
  const swamp: number[] = [];
  for (let k = 0; k <= K; k++) {
    const u = k * step;
    const vn = Math.max(14, axis.v0 + axis.amp * fbm(axis.seed, u, 0, axis.cell, 2));
    near.push(r2(vn));
    far.push(r2(vn + room[1] + half + lw + P + farW.amp * (0.5 + 0.5 * fbm(farW.seed, u, 0, farW.cell, 2))));
    swamp.push(r2(Math.max(SWAMP.width[0], Math.min(SWAMP.width[1], swampMean + SWAMP.wander * fbm(swampW.seed, u, 0, SWAMP.cell, 2)))));
  }
  const vN = (u: number) => lineAt(near, step, u);
  const vF = (u: number) => lineAt(far, step, u);
  const vB = (u: number) => vF(u) - lineAt(swamp, step, u);
  if (Math.max(...far) > N - GULCH.len[0] - 12) return { why: "no room for the far wall's gulch" };

  // ---- down the valley: the terrace, the plain, its risers, its level
  const benchAim = Math.round(FLOOR_MARGIN * START_FLOORS[spec.designedFor].bench[spec.settings.start.area]);
  const tLen = Math.max(TERRACE.len[0], Math.min(TERRACE.len[1], TERRACE.brookAt + Math.ceil((TERRACE.room * benchAim) / P))) + rng.int(0, 5);
  const plainFrom = Math.max(tLen, N - PLAIN_LONG);
  const terrace: [number, number] = [plainFrom - tLen, plainFrom];
  const risers: Riser[] = [];
  for (let u = plainFrom + rng.range(RISER.every[0], RISER.every[1]); u < N - RISER.end; u += rng.range(RISER.every[0], RISER.every[1]))
    risers.push({ at: r2(u), amp: r2(rng.range(RISER.amp[0], RISER.amp[1])), cell: r2(rng.range(RISER.cell[0], RISER.cell[1])), seed: seedOf() });
  const L = BED_FLOOR + 3 + risers.length + (rng.float() < 0.5 ? 1 : 0);
  const lv = (u: number, v: number) => (u < plainFrom ? L : plainLevel({ L, risers }, u, v));

  // ---- the start on the terrace's lip, looking down the valley across the plain
  // (past the river's room, whatever its meander: so the frame is judged before the river is drawn)
  const uS = plainFrom - TERRACE.lip;
  const mid = (room[0] + room[1]) / 2;
  const vS = vN(uS) + room[1] + half + lw + TERRACE.off;
  if (vS > vF(uS) - 8) return { why: "the terrace is too narrow for the start" };
  const sx = Math.floor(toMap(T, [uS + 0.5, vS + 0.5])[0]);
  const sy = Math.floor(toMap(T, [uS + 0.5, vS + 0.5])[1]);
  const z = L + TERRACE.rise;
  const want = dirToMap(T, [Math.SQRT1_2, Math.SQRT1_2]);
  let orientation: Orientation = "Cw0";
  let bestDot = -Infinity;
  for (const o of ORIENTATIONS) {
    const look = openingCamera({ x: sx, y: sy, z, orientation: o }).look;
    const d = look[0] * want[0] + look[1] * want[1];
    if (d > bestDot) {
      bestDot = d;
      orientation = o;
    }
  }
  const start = { x: sx, y: sy, z, orientation };
  const vista = openingCamera(start, VISTA_ZOOM);

  // ---- the far wall's search window and the run of it the vista frame shows
  const Lp = N - plainFrom;
  const w0 = Math.max(plainFrom + WINDOW.from * Lp, uS + dBw);
  const w1 = plainFrom + WINDOW.to * Lp;
  if (w1 - w0 < WINDOW.framed) return { why: "the badwater distance leaves no search window" };
  const hMid = (GULCH.h[0] + GULCH.h[1]) / 2;
  const shown = (u: number) => {
    const p = toMap(T, [u, vF(u)]);
    const lvl = lv(u, vB(u) + 1) - 1;
    const d = dist([start.x + 0.5, start.y + 0.5], p);
    const a = frameAt(vista, p[0], p[1], lvl + hMid);
    const b = frameAt(vista, p[0], p[1], lvl);
    // (inside by the lip's half-width and its water: its ends stand up to 3.5 tiles either way along the wall)
    const inside = (f: { u: number; v: number } | null) => !!f && Math.abs(f.u) <= FRAME.uSide - 0.1 && Math.abs(f.v) <= FRAME.vTop - 0.05;
    return inside(a) && inside(b) && d >= LANDMARK_NEAR && d <= LANDMARK_FAR;
  };
  let framed: [number, number] = [0, -1];
  for (let u = Math.ceil(w0); u <= Math.floor(w1); u++) {
    if (!shown(u)) continue;
    let e = u;
    while (e + 1 <= Math.floor(w1) && shown(e + 1)) e++;
    if (e - u > framed[1] - framed[0]) framed = [u, e];
    u = e;
  }
  if (framed[1] - framed[0] < WINDOW.framed) return { why: "the vista frame shows too little of the search window" };

  // ---- the gulch's targets, the Red Fall at its mouth, the col and the Dry Fork
  const uM = framed[0] + 2 + (framed[1] - framed[0] - 4) * rng.range(0.3, 0.7);
  const vMouth = vF(uM);
  const Lm = lv(uM, vB(uM) + 1);
  const swampLevel = Lm - 1;
  let h = rng.int(GULCH.h[0], GULCH.h[1] + 1);
  h = Math.min(h, top - 2 - GULCH.rise[0] - swampLevel);
  if (h < GULCH.h[0]) return { why: "no room under the water's ceiling for the Red Fall" };
  const crest = swampLevel + h;
  const rise = Math.min(rng.int(GULCH.rise[0], GULCH.rise[1] + 1), top - 2 - crest);
  const gw = rng.int(GULCH.width[0], GULCH.width[1] + 1);
  const gLen = rng.range(GULCH.len[0], GULCH.len[1]);
  const slant = rng.range(-GULCH.slant, GULCH.slant);
  const gDir: Point = [Math.sin(slant), Math.cos(slant)];
  const gHead: Point = [uM + gDir[0] * gLen, vMouth + gDir[1] * gLen];
  if (gHead[1] > N - POOL_R.red - 3) return { why: "the gulch runs off the map" };
  const nf = rng.range(GULCH.narrowsAt[0], GULCH.narrowsAt[1]);
  const nAt: Point = [uM + gDir[0] * gLen * nf, vMouth + gDir[1] * gLen * nf];
  const nFloor = crest + Math.floor(rise * nf);
  const nWidth = rng.int(GULCH.narrows[0], GULCH.narrows[1] + 1);
  const colSide: "up" | "down" = rng.float() < 0.5 ? "up" : "down";
  const sgn = colSide === "down" ? 1 : -1;
  const colAt: Point = [nAt[0] + sgn * (gw / 2 + rng.range(GULCH.colOut[0], GULCH.colOut[1])), nAt[1] + 2];
  const colLevel = nFloor + GULCH.colOver;
  // the Dry Fork falls from the col away from the plain to the far edge
  const forkL: Point[] = [colAt];
  for (let v = colAt[1] + 6; v < N; v += 6) forkL.push([colAt[0] + sgn * 3 * fbm(seedOf() & 0xffff, v, 0, 20, 1) + sgn * 2, v]);
  forkL.push([forkL[forkL.length - 1][0], N]);
  const forkBed: [number, number] = [colLevel - 1, Math.max(BED_FLOOR + 1, colLevel - rng.int(GULCH.forkFall[0], GULCH.forkFall[1] + 1))];
  // ---- the river: springs at its head by the upstream edge, meandering in the near third to the downstream edge
  const headU = POOL_R.springs + 2;
  const course: Point[] = [];
  for (let u = headU + POOL_R.springs; u < N; u += 4) course.push([u, vN(u) + mid]);
  course.push([N, vN(N) + mid]);
  const inRoom = (p: Point) => {
    const off = p[1] - vN(p[0]);
    return off >= room[0] && off <= room[1];
  };
  const rm = meander(course, 2 * half, draw, { levels: 0, from: 0 }, (p) => inRoom(p), 2, true);
  const riverL = sampled(rm, 4).path.map(rp);
  riverL[riverL.length - 1] = [N, r2(riverL[riverL.length - 1][1])];
  for (const q of riverL) if (q[1] - vN(q[0]) < room[0] - 1 || q[1] - vN(q[0]) > room[1] + 1) return { why: "the river leaves the near third" };
  let low = Infinity;
  const riverBed = riverL.map((q) => (low = Math.min(low, lv(q[0], q[1]) - 2)));
  const S = pathLength(riverL);
  const riverAt = (s: number) => pointAt(riverL, s);
  // (the river a point a tile, for the searches along it)
  const rs = walk(riverL, 1);
  // where the plain begins along the river
  const sPlain = rs.find((q) => q.p[0] >= plainFrom)?.s ?? 0;

  const share: readonly [number, number] = RED_SHARE[spec.settings.hazards.badwater as keyof typeof RED_SHARE] ?? RED_SHARE.normal;
  const redFlow = r2(flow * rng.range(share[0], share[1]));
  const endJoin = rng.float() < 0.5;
  const walls = { near: Math.min(sky - 2, L + rng.int(5, 8)), far: 0 };
  walls.far = Math.min(sky, Math.max(walls.near + 2, crest + rise + 4));
  if (walls.far < colLevel + 2) return { why: "the far wall stands under the col" };

  // ---- the levees: width by noise, the low places, the crest runs; the sloughs from the low places to the backswamp
  const levee: PlainNumbers["levee"] = { width: { mid: 4.5, amp: 1.5, cell: r2(rng.range(LEVEE.cell[0], LEVEE.cell[1])), seed: seedOf() }, from: r2(sPlain), to: r2(S), plain: [], near: [], low: [] };
  const big = N >= 192;
  const nSlough = big ? 2 : 1;
  const nLow = rng.int((big ? LEVEE.lows.large : LEVEE.lows.small)[0], (big ? LEVEE.lows.large : LEVEE.lows.small)[1] + 1);
  const sOfU = (u: number, from = sPlain) => {
    let best = from;
    let bd = Infinity;
    for (const q of rs) {
      if (q.s < from) continue;
      const d = Math.abs(q.p[0] - u);
      if (d < bd) {
        bd = d;
        best = q.s;
      }
    }
    return best;
  };
  const lows: { side: "plain" | "near"; mid: number; len: number; slough?: number }[] = [];
  const free = (m: number, len: number) => m - len / 2 > sPlain + 6 && m + len / 2 < S - 6 && lows.every((o) => Math.abs(o.mid - m) > (o.len + len) / 2 + LEVEE.apart);
  // (the first just below the Red Fall's mouth, the river in's; a second above the mouth where the plain has room
  // there, else further down)
  const first = uM + rng.range(SLOUGH.after[0], SLOUGH.after[1]);
  const above: [number, number] = [plainFrom + SLOUGH.above[0], uM - SLOUGH.above[1]];
  for (let k = 0; k < nSlough; k++) {
    const len = rng.int(LEVEE.low[0], LEVEE.low[1] + 1);
    const u = k === 0 ? first : above[1] - above[0] >= 4 ? above[0] + (above[1] - above[0]) * draw() : first + rng.range(SLOUGH.apart[0], SLOUGH.apart[1]);
    const m = sOfU(u);
    if (!free(m, len)) return { why: "no room for a slough's low place" };
    lows.push({ side: "plain", mid: m, len, slough: k });
  }
  for (let tries = 0; lows.length < nLow && tries < 40; tries++) {
    const len = rng.int(LEVEE.low[0], LEVEE.low[1] + 1);
    const m = sPlain + (S - sPlain) * draw();
    if (free(m, len)) lows.push({ side: draw() < 0.5 ? "plain" : "near", mid: m, len });
  }
  if (lows.length < nLow) return { why: "no room for the levee's low places" };
  lows.sort((a, b) => a.mid - b.mid);
  const P0 = { L, risers, levee } as PlainNumbers;
  const crestRuns = (side: "plain" | "near", seed: number): CrestRun[] | null => {
    const over: number[] = [];
    const s0 = Math.floor(sPlain);
    const s1 = Math.ceil(S);
    for (let s = s0; s < s1; s++) {
      const lo = lows.find((o) => o.side === side && s + 0.5 >= o.mid - o.len / 2 && s + 0.5 < o.mid + o.len / 2);
      over.push(lo ? 0 : fbm(seed, s, 0, LEVEE.crestCell, 2) > LEVEE.hump ? 2 : 1);
    }
    const most = LEVEE.most * (S - sPlain);
    // a run of one height too long takes a hump (or a dip back to a level) where its noise is highest (lowest)
    for (let round = 0; round < 24; round++) {
      let a = 0;
      let worst: [number, number] | null = null;
      for (let k = 1; k <= over.length; k++)
        if (k === over.length || over[k] !== over[a]) {
          if (k - a > most && (!worst || k - a > worst[1] - worst[0])) worst = [a, k];
          a = k;
        }
      if (!worst) break;
      const [ra, rb] = worst;
      const hump = over[ra] === 1;
      let at = -1;
      let best = -Infinity;
      for (let k = ra + 8; k < rb - 8; k++) {
        const n = fbm(seed, k + s0, 0, LEVEE.crestCell, 2) * (hump ? 1 : -1);
        if (n > best) {
          best = n;
          at = k;
        }
      }
      if (at < 0) return null;
      const hl = rng.int(LEVEE.humpLen[0], LEVEE.humpLen[1] + 1);
      for (let k = at - (hl >> 1); k < at - (hl >> 1) + hl; k++) over[k] = hump ? 2 : 1;
    }
    const runs: CrestRun[] = [];
    let a = 0;
    for (let k = 1; k <= over.length; k++)
      if (k === over.length || over[k] !== over[a]) {
        runs.push({ from: a === 0 ? r2(sPlain) : a + s0, to: k === over.length ? r2(S) : k + s0, over: over[a] as 0 | 1 | 2 });
        a = k;
      }
    return runs;
  };
  const plainRuns = crestRuns("plain", seedOf());
  const nearRuns = crestRuns("near", seedOf());
  if (!plainRuns || !nearRuns) return { why: "the levee's crest holds one height too long" };
  levee.plain = plainRuns;
  levee.near = nearRuns;
  let li = 0;
  const lowOf = new Map<number, string>();
  for (const o of lows) {
    const q = riverAt(o.mid);
    const n0: Point = [-q.dir[1], q.dir[0]];
    const n: Point = n0[1] >= 0 ? n0 : [-n0[0], -n0[1]];
    const sg = o.side === "plain" ? 1 : -1;
    const w = half + leveeWidth(P0, o.mid, o.side) / 2;
    if (o.slough !== undefined) lowOf.set(o.slough, `low${li + 1}`);
    levee.low.push({ id: `low${++li}`, side: o.side, from: r2(o.mid - o.len / 2), to: r2(o.mid + o.len / 2), at: rp(toMap(T, [q.p[0] + sg * n[0] * w, q.p[1] + sg * n[1] * w])) });
  }
  // the sloughs: from each of the first plain-side low places past the Red Fall's mouth to the backswamp
  const sloughs: Slough[] = [];
  let lastSlough = uM;
  const sloughLows = Array.from({ length: nSlough }, (_, k) => levee.low.find((o) => o.id === lowOf.get(k))!);
  const riverLoc = riverLocal({ k: 0, m: false, N }, riverL);
  const foot = leveeFoot({ ...P0, levee } as PlainNumbers, N, half, riverLoc);
  for (const [k, o] of sloughLows.entries()) {
    const sm = (o.from + o.to) / 2;
    const q = riverAt(sm);
    const n0: Point = [-q.dir[1], q.dir[0]];
    const n: Point = n0[1] >= 0 ? n0 : [-n0[0], -n0[1]];
    const w = half + leveeWidth(P0, sm, "plain") + 0.5;
    const a: Point = [q.p[0] + n[0] * w, q.p[1] + n[1] * w];
    const ue = a[0] + (vB(a[0]) - a[1]) * rng.range(SLOUGH.slant[0], SLOUGH.slant[1]);
    if (ue > N - 8) return { why: "no room for a slough below its low place" };
    lastSlough = Math.max(lastSlough, ue);
    const b: Point = [ue, vB(ue) + 1];
    const width = rng.int(SLOUGH.width[0], SLOUGH.width[1] + 1);
    const c: Point[] = [];
    const span = dist(a, b);
    for (let j = 0; j <= Math.max(2, Math.ceil(span / 4)); j++) {
      const f = j / Math.max(2, Math.ceil(span / 4));
      c.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    const sm2 = meander(c, SLOUGH.bend * width, draw, { levels: 0, from: 0 }, (p) => p[1] >= (foot[Math.max(0, Math.min(N, Math.floor(p[0])))] ?? -Infinity) + 1 && p[1] <= vF(p[0]) - 1, 1, false);
    const sl = sampled(sm2, 3).path.map(rp);
    let lo2 = Infinity;
    const bed = sl.map((p) => (lo2 = Math.min(lo2, lv(p[0], p[1]) - 1)));
    sloughs.push({ id: k === 0 ? "slough" : `slough${k + 1}`, low: o.id, path: sl.map((p) => rp(toMap(T, p))), half: width / 2, bed });
  }

  // ---- the red stream: from the Red Fall's pool along the backswamp, then into the river or out by its own exit
  const footC: Point = [uM, vMouth - POOL_R.foot - 0.5];
  const along = rng.range(0.4, 0.6);
  const swampV = (u: number) => vB(u) + (vF(u) - vB(u)) * along;
  let joinS = 0;
  let joinP: Point = [0, 0];
  let swampTo = N;
  const redCourse: Point[] = [[uM + POOL_R.foot, swampV(uM + POOL_R.foot)]];
  if (endJoin) {
    // (it turns off the backswamp below the Red Fall and the sloughs' mouths, so the river in runs the old red bed
    // from them down, and crosses the plain `slant` tiles down the valley a tile across)
    const slant = rng.range(JOIN.slant[0], JOIN.slant[1]);
    const need = Math.max(uM + JOIN.swamp, lastSlough + SLOUGH.room);
    const turnsAt = (q: Point) => q[0] - (vB(q[0]) - q[1]) * slant;
    let s0 = JOIN.at[0] * S;
    while (s0 < JOIN.at[1] * S && turnsAt(riverAt(s0).p) < need) s0 += 1;
    if (s0 >= JOIN.at[1] * S) return { why: "no room for the red stream's join below the sloughs" };
    joinS = s0 + (JOIN.at[1] * S - s0) * draw();
    joinP = riverAt(joinS).p;
    swampTo = turnsAt(joinP);
    if (swampTo < need) return { why: "the red stream's join comes too soon below the Red Fall" };
    for (let u = uM + POOL_R.foot + 4; u < swampTo; u += 4) redCourse.push([u, swampV(u)]);
    redCourse.push([swampTo, swampV(swampTo)]);
    redCourse.push(joinP);
  } else {
    for (let u = uM + POOL_R.foot + 4; u < N; u += 4) redCourse.push([u, swampV(u)]);
    redCourse.push([N, swampV(N)]);
  }
  const swampLen = pathLength(redCourse.slice(0, endJoin ? -1 : undefined));
  const inSwamp = (p: Point) => p[1] >= vB(p[0]) + 1 && p[1] <= vF(p[0]) - 1;
  const redM = meander(redCourse, 2, draw, { levels: 0, from: 0 }, (p, a) => (a <= swampLen ? inSwamp(p) : true), 2, false);
  const redL = sampled(redM, 3).path.map(rp);
  if (endJoin) redL[redL.length - 1] = rp(joinP);
  else redL[redL.length - 1] = [N, r2(redL[redL.length - 1][1])];
  low = Infinity;
  const redBed = redL.map((q) => (low = Math.min(low, lv(q[0], q[1]) - 2)));
  if (endJoin) {
    const rb = riverBed[Math.max(0, riverL.findIndex((q, k) => k > 0 && pathLength(riverL.slice(0, k + 1)) >= joinS) - 1)];
    redBed[redBed.length - 1] = Math.min(redBed[redBed.length - 2] ?? rb, rb);
  }

  // ---- the start's brook: a spring in the far wall's slope over the terrace, across it into the river
  const uB = terrace[0] + TERRACE.brookAt + rng.range(-2, 2);
  const wellC: Point = [uB, vF(uB) + POOL_R.well + 1.5];
  // (past the river's first tiles out of its springs)
  const brookS = sOfU(uB, 6);
  const brookEnd = riverAt(brookS).p;
  const bStart: Point = [wellC[0], wellC[1] - POOL_R.well];
  const bc: Point[] = [];
  const bSpan = dist(bStart, brookEnd);
  const bn = Math.max(3, Math.ceil(bSpan / 4));
  for (let j = 0; j <= bn; j++) bc.push([bStart[0] + ((brookEnd[0] - bStart[0]) * j) / bn, bStart[1] + ((brookEnd[1] - bStart[1]) * j) / bn]);
  const bm = meander(bc, 2, draw, { levels: 3, from: Math.max(0, bSpan - 9), to: 1 }, (p) => Math.abs(p[0] - uB) < 6, 2, false);
  const brookL = bm.path.length > 2 ? sampled(bm, 3).path.map(rp) : bc.map(rp);
  brookL[brookL.length - 1] = rp(brookEnd);
  const bAlong = sampled(bm, 3).along;
  const brookBed = brookL.map((_, j) => L + 1 - bm.drops.filter((d) => d <= (bAlong[j] ?? bm.length)).length);
  brookBed[brookBed.length - 1] = Math.min(brookBed[brookBed.length - 1], L - 2);
  if (Math.abs(uS - uB) < 10) return { why: "the brook crosses the start's ground" };

  // ---- on the map
  const map = (p: Point) => rp(toMap(T, p));
  const mapPath = (p: readonly Point[]) => p.map(map);
  const riverM = mapPath(riverL);
  const redM2 = mapPath(redL);
  const brookM = mapPath(brookL);
  const gulchPath: Point[] = [map([gHead[0] - gDir[0] * POOL_R.red, gHead[1] - gDir[1] * POOL_R.red]), map(nAt), map([uM, vMouth])];
  const lipW = Math.max(GULCH.width[0], Math.min(gw, sillWidthFor(redFlow) + 2));
  const lip: [Point, Point] = [map([uM - lipW / 2, vMouth]), map([uM + lipW / 2, vMouth])];
  const faceDir = dirToMap(T, [0, -1]);
  const outEdge = edgeOf(T, [1, 0]);
  const farEdge = edgeOf(T, [0, 1]);
  const exitAt = (p: Point): Point => map(p);

  const sources: Source[] = [];
  const springsC = map([headU, vN(headU) + mid]);
  for (let k = 0; k < 3; k++) sources.push({ id: `spring${k + 1}`, at: rp([springsC[0] + [0, 1, -1][k], springsC[1] + [0, -1, 1][k]]), strength: r2(flow / 3), into: I.springs });
  const brookFlow = r2(rng.range(BROOK_SPRING[0], BROOK_SPRING[1]));
  sources.push({ id: "terraceSpring", at: map(wellC), strength: brookFlow, into: I.well });
  sources.push({ id: "badwater", at: map(gHead), strength: redFlow, into: I.redSpring, bad: true });

  const bodies: Body[] = [
    { id: I.springs, kind: "pool", sill: L - 1, arms: [[[springsC[0], springsC[1], POOL_R.springs]]], meadow: 0, deep: 1, dry: false, region: "wet" },
    { id: I.well, kind: "pool", sill: L + TERRACE.rise + 1, arms: [[[...map(wellC), POOL_R.well]]], meadow: 0, deep: 1, dry: false, region: "home" },
    { id: I.redSpring, kind: "pool", sill: crest + rise, arms: [[[...map(gHead), POOL_R.red]]], meadow: 0, deep: 1, dry: false, region: "top" },
    { id: I.redPool, kind: "pool", sill: swampLevel - 1, arms: [[[...map(footC), POOL_R.foot]]], meadow: 0, deep: 1, dry: false, region: "low" },
  ];
  const exits: Exit[] = [{ id: I.out, edge: outEdge, at: exitAt(riverL[riverL.length - 1]) }];
  if (!endJoin) exits.push({ id: I.redOut, edge: outEdge, at: exitAt(redL[redL.length - 1]) });
  const links: Link[] = [
    { id: I.river, from: I.springs, to: I.out, kind: "channel", path: riverM, half, bed: riverBed, wet: true, gates: [], rows: [] },
    { id: I.brook, from: I.well, to: I.out, kind: "brook", path: brookM, half: 1, bed: brookBed, wet: true, gates: [], rows: [], wander: 0, joins: { link: I.river, at: r2(brookS) } },
    {
      id: I.redFall,
      from: I.redSpring,
      to: I.redPool,
      kind: "fall",
      path: gulchPath,
      half: 1,
      bed: [crest + rise, nFloor, crest],
      wet: true,
      gates: [],
      rows: [],
      fall: { height: crest - (swampLevel - 1), crest, width: lipW, face: headingOf(faceDir[0], faceDir[1]), lip, notch: 0, piers: 0, breach: 0 },
    },
    { id: I.red, from: I.redPool, to: endJoin ? I.out : I.redOut, kind: "channel", path: redM2, half: 1, bed: redBed, wet: true, gates: [], rows: [], wander: 0, ...(endJoin ? { joins: { link: I.river, at: r2(joinS) } } : {}) },
  ];

  // ---- the ladder (the design's §6): each rung where the land offers its site
  const startTile: Point = [start.x + 0.5, start.y + 0.5];
  const firstLow = levee.low.filter((o) => o.side === "plain").reduce((a, b) => (dist(a.at, startTile) <= dist(b.at, startTile) ? a : b));
  const brookMid = pointAt(brookM, pathLength(brookM) * 0.35).p;
  // the riser levee where the red stream runs nearest the plain, below the Red Fall
  let lap: Point = redL[1];
  let lapGap = Infinity;
  for (const q of redL) {
    if (q[0] < uM + 8 || q[0] > swampTo - 6) continue;
    const g = q[1] - vB(q[0]);
    if (g < lapGap) {
      lapGap = g;
      lap = q;
    }
  }
  const lapAt = map([lap[0], vB(lap[0])]);
  const slough0 = sloughLows[0];
  const sAfter = Math.min(S - 2, slough0.to + rng.range(3, 6));
  const weirAt = rp(riverAt(sAfter).p);
  // what each buys, by the plan's arithmetic (the floors wait for the first build's gains: step 4)
  const deadTiles = Math.round(((swampTo - uM) * swampMean) + (endJoin ? 14 * dist(redL[redL.length - 1], [swampTo, swampV(swampTo)]) : 0));
  const dryTiles = Math.round(Lp * (P - M_REACH - swampMean));
  const works: Work[] = [
    { id: "lowLevee", rung: "first", kind: "levee", on: I.river, at: firstLow.at, tiles: Math.round(firstLow.to - firstLow.from), needs: [], gives: { green: [0, Math.round(7 * (firstLow.to - firstLow.from))] }, region: "wet" },
    { id: "brookPond", rung: "small", kind: "damToPond", on: I.brook, at: rp(brookMid), tiles: 4, needs: [], gives: { green: [0, 30], reservoir: [0, 40] }, region: "home" },
    { id: "swampLevee", rung: "small", kind: "levee", on: I.red, at: lapAt, tiles: 20, needs: [], gives: { green: [0, 40] }, region: "low" },
    { id: "turn", rung: "medium", kind: "damToPond", on: I.redFall, at: map(nAt), tiles: nWidth + 2, needs: [], gives: { green: [0, deadTiles] }, tradeoff: "The gulch behind the dam and the Dry Fork stay red", region: "top" },
    { id: "riverIn", rung: "large", kind: "raisedSill", on: I.river, at: map(weirAt), tiles: Math.round(2 * half + 2 + (slough0.to - slough0.from)), needs: [], gives: { green: [0, dryTiles + deadTiles] }, region: "dry" },
  ];

  // ---- the regions, the ridges, the names, the line
  const plainMid = (u: number) => map([u, (foot[Math.floor(u)] + vB(u)) / 2]);
  const regions: Region[] = [
    { id: "home", role: "home", problem: "A bench over the river, with a brook and no more", prize: "The start's meadow, the plain below it", dayOne: "green", at: map([(terrace[0] + terrace[1]) / 2, vS + 4]) },
    { id: "wet", role: "wet", problem: "A badtide runs red through the levees' low places", prize: "The green band along the river", dayOne: "green", at: map([plainFrom + Lp * 0.5, vN(plainFrom + Lp * 0.5) + mid]) },
    { id: "dry", role: "dry", problem: "Too far from the river for its water", prize: "The widest flat on the map, once the river comes in", dayOne: "dry", at: plainMid(plainFrom + Lp * 0.45) },
    { id: "low", role: "low", problem: "Dead along the red stream", prize: "The old red bed, cleared by the turn", dayOne: "dry", at: map([Math.min(N - 10, uM + 25), swampV(Math.min(N - 10, uM + 25))]) },
    { id: "top", role: "top", problem: "The red source in the gulch", prize: "The turn: the red stream sent down the Dry Fork", dayOne: "dryForGood", at: map([uM, (vF(uM) + gHead[1]) / 2 + 6]) },
  ];
  const ridgeLine = (v: (u: number) => number): Point[] => {
    const out: Point[] = [];
    for (let u = 0; u <= N; u += 8) out.push(map([u, v(u)]));
    return out;
  };
  const ridges: Ridge[] = [
    { id: "nearWall", role: "wall", path: ridgeLine((u) => vN(u) / 2), top: walls.near, half: r2(Math.max(3, Math.min(...near) / 2 - 2)), drop: 2, ledge: 3, rough: 1 },
    { id: "farWall", role: "wall", path: ridgeLine((u) => vF(u) + 14), top: walls.far, half: 10, drop: 2, ledge: 3, rough: 1.5 },
  ];
  const pickName = (list: readonly string[]) => list[rng.int(0, list.length)];
  const names: Record<string, string> = {
    [I.river]: pickName(RIVER_NAMES),
    [I.springs]: "the Springs",
    [I.well]: "the Terrace Spring",
    [I.brook]: "the Terrace Brook",
    [I.redSpring]: "the Red Spring",
    [I.redFall]: pickName(FALL_NAMES),
    [I.redPool]: "the Red Pool",
    [I.red]: "the Red Stream",
    [I.stain]: pickName(STAIN_NAMES),
    [I.fork]: pickName(FORK_NAMES),
    [I.col]: "the Col",
    slough: "the Slough",
    slough2: "the Lower Slough",
  };
  const line = `The widest flat on the map is dead along ${names[I.red]} below ${names[I.redFall]}. Turn the stream at ${names[I.stain]} into ${names[I.fork]} and bring ${names[I.river]} in down ${names.slough}: the best land is yours.`;
  const edges: PremisePlan["edges"] = { N: "ridge", E: "ridge", S: "ridge", W: "ridge" };
  edges[outEdge] = "water leaves";
  edges[farEdge] = "falls away";
  const ahead = lip.map((p) => (p[0] - start.x) * vista.look[0] + (p[1] - start.y) * vista.look[1]);

  const plainNums: PlainNumbers = {
    turn: T.k,
    mirror: T.m,
    step,
    near,
    far,
    swamp,
    room,
    L,
    terraceLevel: L + TERRACE.rise,
    walls,
    P,
    M: M_REACH,
    terrace,
    plainFrom,
    risers,
    levee,
    sloughs,
    window: { from: r2(w0), to: r2(w1), framed },
    gulch: { mouth: r2(uM), h, crest, width: gw, length: r2(gLen), head: map(gHead), narrows: { at: map(nAt), width: nWidth, floor: nFloor }, rise },
    col: { at: map(colAt), level: colLevel, side: colSide },
    fork: { path: mapPath(forkL), bed: forkBed, edge: farEdge },
    red: { end: endJoin ? "join" : "exit", ...(endJoin ? { at: r2(joinS) } : {}), swampTo: r2(swampTo) },
    flow: { river: flow, red: redFlow, brook: brookFlow },
    badwater: dBw,
  };
  const plan: PlainPlan = {
    premise: PLAIN_ID,
    seed: spec.seed,
    W: N,
    H: N,
    top,
    sky,
    line,
    sources,
    bodies,
    links,
    exits,
    regions,
    ridges,
    edges,
    frame: { start, landmark: I.redFall, lipAhead: r2((ahead[0] + ahead[1]) / 2), bench: benchAim, benchTo: map([Math.max(terrace[0] + 4, uS - 12), vS + 4]) },
    works,
    setPieces: [],
    names,
    plain: plainNums,
  };
  return { plan };
}

// ------------------------------------------------------------------------------------------------- what the plan predicts

/** Day 1's shares of the valley floor (the plain and the backswamp, from the river's plain-side levee foot to the far
 *  wall's foot, down the plain) by the plan's arithmetic (the design's §2): dead where the red stream runs (the
 *  backswamp below the Red Fall, and 7 tiles each side of its way across the plain to a join), green within `M` of the
 *  levee's foot, dry the rest; and the floor's share of the map. A tile a step; for the tools' tables. */
export function plainShares(plan: PremisePlan): { dead: number; dry: number; green: number; floor: number; plain: number } | null {
  const p = plainOf(plan);
  const river = plan.links.find((l) => l.id === I.river);
  const red = plan.links.find((l) => l.id === I.red);
  if (!p || !river?.path || !red?.path) return null;
  const T = turnOf(plan, p);
  const N = plan.W;
  const foot = leveeFoot(p, N, river.half ?? 2.5, riverLocal(T, river.path));
  const redL = red.path.map((q) => toLocal(T, q));
  const cross = p.red.end === "join" ? redL.filter((q) => q[0] >= p.red.swampTo - 1) : [];
  const crossFrom = cross.length ? Math.min(...cross.map((q) => q[0])) - 7 : Infinity;
  const crossTo = cross.length ? Math.max(...cross.map((q) => q[0])) + 7 : -Infinity;
  let dead = 0;
  let dry = 0;
  let green = 0;
  let swampTiles = 0;
  for (let u = Math.ceil(p.plainFrom); u < N; u++) {
    const f = foot[u];
    const fv = lineAt(p.far, p.step, u + 0.5);
    const bv = fv - lineAt(p.swamp, p.step, u + 0.5);
    for (let v = Math.ceil(f); v < fv; v++) {
      const inSwamp = v + 0.5 >= bv;
      if (inSwamp) swampTiles++;
      const nearCross = cross.length > 1 && u + 0.5 >= crossFrom && u + 0.5 <= crossTo && pathDist(u + 0.5, v + 0.5, cross).d <= 7;
      if ((inSwamp && u + 0.5 >= p.gulch.mouth && u + 0.5 <= p.red.swampTo) || nearCross) dead++;
      else if (v + 0.5 - f < p.M) green++;
      else dry++;
    }
  }
  const all = dead + dry + green;
  if (!all) return null;
  return { dead: dead / all, dry: dry / all, green: green / all, floor: all / (N * N), plain: (all - swampTiles) / (N * N) };
}

// ------------------------------------------------------------------------------------------------- the invariants

const linkOf = (plan: PremisePlan, id: string): Link | undefined => plan.links.find((l) => l.id === id);
const bodyOf = (plan: PremisePlan, id: string): Body | undefined => plan.bodies.find((b) => b.id === id);
const NO_PLAIN = "The plan has no poisoned floodplain";

/** The longest run of one height in a levee's crest, tiles along the river. */
function longestRun(runs: readonly CrestRun[]): number {
  let best = 0;
  let a = 0;
  for (let k = 1; k <= runs.length; k++)
    if (k === runs.length || runs[k].over !== runs[a].over) {
      best = Math.max(best, runs[k - 1].to - runs[a].from);
      a = k;
    }
  return best;
}

/** `plain.levels` (the design's §1 and §7): the levels by number. The plain at `L` falling a level at each riser 40 to
 *  60 apart; the river's bed two under the plain where it runs (two under `L` above the plain), the river's springs a
 *  level under `L`; the levees a level over the plain for most of the river's length on the plain, level with it at 2
 *  to 4 low places 4 to 8 long, and no run of the crest at one height over a fifth of that length; the backswamp a
 *  level under the plain and the red stream's bed one under it; the terrace two over `L`; the Red Fall from the gulch's
 *  floor 3 to 5 over the backswamp at its mouth onto its pool a level under the backswamp; the gulch's floor rising to
 *  its head, the narrows on it; the col two over the narrows' floor and under the far wall's crest; the Dry Fork's bed
 *  falling from under the col to its edge, on the floor; the far wall over the near; the sloughs a level under the
 *  plain. */
const plainLevels: Invariant = {
  id: "plain.levels",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    if (!p) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const lv = (q: Point, local = false) => {
      const [u, v] = local ? q : toLocal(T, q);
      return u < p.plainFrom ? p.L : plainLevel(p, u, v);
    };
    if (p.terraceLevel !== p.L + TERRACE.rise) return fail(`The terrace stands at ${p.terraceLevel}, not ${TERRACE.rise} over the plain (${p.L + TERRACE.rise})`);
    let last = p.plainFrom;
    for (const r of p.risers) {
      const gap = r.at - last;
      if (gap < RISER.every[0] - 0.01 || gap > RISER.every[1] + 0.01) return fail(`A riser of the plain stands ${gap.toFixed(1)} tiles below the last (${RISER.every.join(" to ")})`);
      if (r.amp < RISER.amp[0] - 0.01) return fail(`A riser of the plain wanders ${r.amp} tiles (a straight step)`);
      last = r.at;
    }
    if (plan.W - last > RISER.every[1] + RISER.end + 0.01) return fail(`The plain runs ${(plan.W - last).toFixed(0)} tiles to the edge without a riser`);
    const river = linkOf(plan, I.river);
    const springs = bodyOf(plan, I.springs);
    if (!river?.path || !Array.isArray(river.bed) || !springs) return fail("The plan has no river from its springs");
    if (springs.sill !== p.L - 1) return fail(`${nameOf(plan, I.springs)} stand at ${springs.sill}, not a level under the plain (${p.L - 1})`);
    for (let k = 0; k < river.path.length; k++) {
      const want = lv(river.path[k]) - 2;
      if (river.bed[k] > want || river.bed[k] < want - 1) return fail(`${nameOf(plan, I.river)}'s bed stands at ${river.bed[k]} at point ${k}, not two under the plain there (${want})`);
    }
    // the levees
    const len = p.levee.to - p.levee.from;
    for (const side of ["plain", "near"] as const) {
      const runs = p.levee[side];
      if (!runs.length || Math.abs(runs[0].from - p.levee.from) > 0.01 || Math.abs(runs[runs.length - 1].to - p.levee.to) > 0.01) return fail(`The ${side} levee does not run the river's length on the plain`);
      for (let k = 1; k < runs.length; k++) if (Math.abs(runs[k].from - runs[k - 1].to) > 0.01) return fail(`The ${side} levee's crest has a gap at ${runs[k].from}`);
      const at1 = runs.filter((r) => r.over === 1).reduce((a, r) => a + r.to - r.from, 0);
      if (at1 < LEVEE.mostAt1 * len) return fail(`The ${side} levee stands a level over the plain for ${((100 * at1) / len).toFixed(0)} % of its length (most of it)`);
      const run = longestRun(runs);
      if (run > LEVEE.most * len + 0.01) return fail(`The ${side} levee's crest holds one height for ${run.toFixed(0)} tiles, over a fifth of the river's ${len.toFixed(0)} on the plain`);
      for (const r of runs.filter((x) => x.over === 0)) if (!p.levee.low.some((o) => o.side === side && Math.abs(o.from - r.from) < 1.01 && Math.abs(o.to - r.to) < 1.01)) return fail(`The ${side} levee is level with the plain at ${r.from.toFixed(0)}, where no low place is`);
    }
    const lows = p.levee.low;
    if (lows.length < 2 || lows.length > 4) return fail(`${lows.length} low places in the levees (2 to 4)`);
    for (const o of lows) if (o.to - o.from < LEVEE.low[0] - 0.01 || o.to - o.from > LEVEE.low[1] + 0.01) return fail(`Low place ${o.id} is ${(o.to - o.from).toFixed(1)} tiles long (${LEVEE.low.join(" to ")})`);
    // the backswamp and the red stream
    const red = linkOf(plan, I.red);
    const pool = bodyOf(plan, I.redPool);
    const fall = linkOf(plan, I.redFall);
    const spring = bodyOf(plan, I.redSpring);
    if (!red?.path || !Array.isArray(red.bed) || !pool || !fall?.fall || !Array.isArray(fall.bed) || !spring) return fail("The plan has no red stream from the Red Fall");
    const lm = plainLevel(p, p.gulch.mouth, lineAt(p.far, p.step, p.gulch.mouth) - lineAt(p.swamp, p.step, p.gulch.mouth) + 1);
    const swamp = lm - 1;
    for (let k = 0; k + 1 < red.path.length; k++) {
      const want = lv(red.path[k]) - 2;
      if (red.bed[k] > want || red.bed[k] < want - 1) return fail(`${nameOf(plan, I.red)}'s bed stands at ${red.bed[k]} at point ${k}, not a level under the backswamp there (${want})`);
    }
    if (pool.sill !== swamp - 1) return fail(`${nameOf(plan, I.redPool)} stands at ${pool.sill}, not a level under the backswamp (${swamp - 1})`);
    const f = fall.fall;
    if (p.gulch.h < GULCH.h[0] || p.gulch.h > GULCH.h[1] || p.gulch.crest !== swamp + p.gulch.h || f.crest !== p.gulch.crest) return fail(`${nameOf(plan, I.redFall)} falls from ${f.crest}, not ${GULCH.h.join(" to ")} over the backswamp (${swamp}) at the gulch's mouth`);
    if (f.crest - f.height !== pool.sill) return fail(`${nameOf(plan, I.redFall)} does not fall onto ${nameOf(plan, I.redPool)}`);
    if (spring.sill !== p.gulch.crest + p.gulch.rise || p.gulch.rise < GULCH.rise[0]) return fail(`${nameOf(plan, I.redSpring)} stands at ${spring.sill}, not the gulch's floor at its head (${p.gulch.crest + p.gulch.rise})`);
    if (p.gulch.narrows.floor < p.gulch.crest || p.gulch.narrows.floor > spring.sill) return fail(`The gulch's narrows stands at ${p.gulch.narrows.floor}, off its floor (${p.gulch.crest} to ${spring.sill})`);
    if (p.col.level !== p.gulch.narrows.floor + GULCH.colOver) return fail(`The col stands at ${p.col.level}, not ${GULCH.colOver} over the narrows' floor (${p.gulch.narrows.floor + GULCH.colOver})`);
    if (p.walls.far < p.col.level + 2 || p.walls.far <= p.walls.near || p.walls.far > (plan.sky ?? plan.top)) return fail(`The far wall's crest (${p.walls.far}) is not over the col + 2 (${p.col.level + 2}) and the near wall (${p.walls.near}), under the highest ground`);
    if (!(p.fork.bed[0] < p.col.level) || p.fork.bed[1] > p.fork.bed[0] || p.fork.bed[1] < BED_FLOOR) return fail(`${nameOf(plan, I.fork)}'s bed (${p.fork.bed.join(" to ")}) does not fall from under the col (${p.col.level}) to its edge on the floor`);
    for (const s of p.sloughs) for (let k = 0; k < s.path.length; k++) {
      const want = lv(s.path[k]) - 1;
      if (s.bed[k] > want || s.bed[k] < want - 1) return fail(`${nameOf(plan, s.id)}'s bed stands at ${s.bed[k]} at point ${k}, not a level under the plain there (${want})`);
    }
    return OK;
  },
};

/** `plain.width` (the design's §2): the plain's width `P` (from the river's plain-side levee foot to the far wall's foot,
 *  the backswamp in it) is (M + 9) / 0.7 or more, and at every tile down the plain the width there is `P` or more and
 *  (M + the backswamp's width there) / 0.7 or more, so the dry band holds 30 % across it; the backswamp 7 to 10 wide;
 *  the river's middle in the near third of the floor; and day 1's shares of the floor by the plan's arithmetic
 *  (`plainShares`) inside the design's: dead 10 to 25 %, dry 30 % or more. */
const plainWidth: Invariant = {
  id: "plain.width",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    if (!p || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const N = plan.W;
    if (p.P < plainLeast(p.M)) return fail(`The plain is ${p.P} wide, under (M + ${PLAIN_WIDTH.dead}) / ${1 - DRY_LEAST} (${plainLeast(p.M)})`);
    for (const w of p.swamp) if (w < SWAMP.width[0] - 0.01 || w > SWAMP.width[1] + 0.01) return fail(`The backswamp is ${w} wide (${SWAMP.width.join(" to ")})`);
    const loc = riverLocal(T, river.path);
    const foot = leveeFoot(p, N, river.half ?? 2.5, loc);
    for (let u = Math.ceil(p.plainFrom); u < N; u++) {
      const width = lineAt(p.far, p.step, u) - foot[u];
      const b = lineAt(p.swamp, p.step, u);
      if (width < p.P - 0.01) return fail(`The plain is ${width.toFixed(1)} wide at ${u} tiles down the valley, under its ${p.P}`);
      if (width < (p.M + b) / (1 - DRY_LEAST) - 0.01) return fail(`The plain is ${width.toFixed(1)} wide at ${u} tiles down the valley, too narrow for a dry band of 30 % beside the backswamp (${b.toFixed(1)})`);
    }
    for (const q of loc) {
      const vn = lineAt(p.near, p.step, q.p[0]);
      const floor = lineAt(p.far, p.step, q.p[0]) - vn;
      if (q.p[1] - vn > floor / 3 + 0.5) return fail(`${nameOf(plan, I.river)} leaves the near third of the floor at ${q.p[0].toFixed(0)} tiles down the valley`);
    }
    const sh = plainShares(plan);
    if (!sh) return fail(NO_PLAIN);
    const pct = (x: number) => `${Math.round(100 * x)} %`;
    if (sh.dead < DEAD_SHARE[0] || sh.dead > DEAD_SHARE[1]) return fail(`Day 1's dead band is ${pct(sh.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})`);
    if (sh.dry < DRY_LEAST) return fail(`Day 1's dry band is ${pct(sh.dry)} of the floor, under ${pct(DRY_LEAST)}`);
    return OK;
  },
};

/** `stream.join` (the design's §4, D476, D498): the red stream runs from the Red Fall's pool along the backswamp (every
 *  point of its reach there inside the strip), then either joins the river in the river's last 30 % at one level with
 *  its bed, or leaves the map by an exit of its own on an edge; nothing red joins the river above that. */
const streamJoin: Invariant = {
  id: "stream.join",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const red = linkOf(plan, I.red);
    const river = linkOf(plan, I.river);
    if (!p || !red?.path || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    for (const q of red.path) {
      const [u, v] = toLocal(T, q);
      if (u > p.red.swampTo - (p.red.end === "join" ? JOIN.bend : 0.5)) break;
      const vf = lineAt(p.far, p.step, u);
      const vb = vf - lineAt(p.swamp, p.step, u);
      if (v < vb - 0.25 || v > vf + 0.25) return fail(`${nameOf(plan, I.red)} leaves the backswamp at ${u.toFixed(0)} tiles down the valley`);
    }
    const S = pathLength(river.path);
    const bad = new Set(plan.sources.filter((s) => s.bad).map((s) => s.into));
    for (const l of plan.links) if (l.joins?.link === I.river && l.id !== I.red && bad.has(l.from)) return fail(`${nameOf(plan, l.id)} runs red into ${nameOf(plan, I.river)}`);
    if (p.red.end === "join") {
      const j = red.joins;
      if (!j || j.link !== I.river || red.to !== river.to) return fail(`${nameOf(plan, I.red)} is said to join ${nameOf(plan, I.river)} and does not`);
      if (j.at < (1 - 0.3) * S || j.at > S - 2) return fail(`${nameOf(plan, I.red)} joins ${nameOf(plan, I.river)} ${((100 * j.at) / S).toFixed(0)} % along it, not in its last 30 %`);
      const end = red.path[red.path.length - 1];
      if (dist(end, pointAt(river.path, j.at).p) > 1.5) return fail(`${nameOf(plan, I.red)} ends away from ${nameOf(plan, I.river)} at its join`);
      const rb = Array.isArray(river.bed) ? river.bed : null;
      const own = Array.isArray(red.bed) ? red.bed : null;
      if (rb && own) {
        let k = 0;
        while (k + 1 < river.path.length && pathLength(river.path.slice(0, k + 2)) <= j.at) k++;
        if (Math.abs(own[own.length - 1] - rb[k]) > 1) return fail(`${nameOf(plan, I.red)}'s bed meets ${nameOf(plan, I.river)}'s ${Math.abs(own[own.length - 1] - rb[k])} levels apart`);
      }
      return OK;
    }
    if (red.joins) return fail(`${nameOf(plan, I.red)} is said to leave by its own exit and joins ${nameOf(plan, red.joins.link)}`);
    const exit = plan.exits.find((e) => e.id === red.to);
    if (!exit || exit.id === river.to) return fail(`${nameOf(plan, I.red)} does not leave by an exit of its own`);
    if (dist(red.path[red.path.length - 1], exit.at) > 1.5) return fail(`${nameOf(plan, I.red)} ends away from its exit`);
    return OK;
  },
};

/** `start.badwater` (the design's §1, §4, D469): the start on the terrace (two over the plain, between its upstream end
 *  and its lip, on the plain's side of the river), the search window starting the badwater distance or more down the
 *  valley from it, the gulch's mouth inside the window, and no red water (the Red Spring, the gulch, the Red Fall's
 *  pool, the red stream) within the badwater distance of the start. */
const startBadwater: Invariant = {
  id: "start.badwater",
  at: "plan",
  test({ spec, plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    if (!p || !river?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const s = plan.frame.start;
    const [u, v] = toLocal(T, [s.x + 0.5, s.y + 0.5]);
    if (s.z !== p.terraceLevel) return fail(`The start stands on ${s.z}, not on the terrace (${p.terraceLevel})`);
    if (u < p.terrace[0] + 2 || u > p.terrace[1] - 2) return fail("The start does not stand on the terrace at the plain's upstream end");
    let vr = -Infinity;
    for (const q of riverLocal(T, river.path)) if (Math.abs(q.p[0] - u) <= 3) vr = Math.max(vr, q.p[1]);
    if (!(v > vr) || v > lineAt(p.far, p.step, u)) return fail(`The start does not stand on the plain's side of ${nameOf(plan, I.river)}`);
    const d = badwaterOf(spec);
    if (p.badwater !== d) return fail(`The plan keeps badwater ${p.badwater} tiles off, the settings ask ${d}`);
    if (p.window.from < u + d - 0.01) return fail(`The search window starts ${(p.window.from - u).toFixed(0)} tiles down the valley from the start, under the badwater distance (${d})`);
    if (p.gulch.mouth < p.window.from - 0.01 || p.gulch.mouth > p.window.to + 0.01) return fail("The gulch's mouth stands outside its search window");
    const st: Point = [s.x + 0.5, s.y + 0.5];
    const red: Point[] = [];
    for (const id of [I.redFall, I.red]) {
      const l = linkOf(plan, id);
      if (l?.path) for (const q of walk(l.path, 1)) red.push(q.p);
    }
    for (const id of [I.redSpring, I.redPool]) {
      const b = bodyOf(plan, id);
      if (b) red.push([b.arms[0][0][0], b.arms[0][0][1]]);
    }
    for (const q of red) if (dist(q, st) < d) return fail(`Red water stands ${dist(q, st).toFixed(0)} tiles from the start, inside the badwater distance (${d})`);
    return OK;
  },
};

/** `frame.fall` (the design's §5): the Red Fall is the landmark, a fall of 3 or more over the water below, its lip's
 *  ends and its foot inside the opening camera's vista frame (`VISTA_ZOOM`: the first frame at the default zoom reaches
 *  under 20 tiles, the fall stands across the plain), between `LANDMARK_NEAR` and `LANDMARK_FAR` of the start, on the
 *  run of the search window the frame shows (`WINDOW.framed` tiles or more). */
const frameFall: Invariant = {
  id: "frame.fall",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const fall = linkOf(plan, plan.frame.landmark);
    if (!p || !fall?.fall || plan.frame.landmark !== I.redFall) return fail(`The landmark is not ${nameOf(plan, I.redFall)}`);
    const pool = bodyOf(plan, fall.to);
    if (fall.fall.height < GULCH.h[0]) return fail(`${nameOf(plan, I.redFall)} drops ${fall.fall.height} (3 or more)`);
    const s = plan.frame.start;
    const cam = openingCamera(s, VISTA_ZOOM);
    const st: Point = [s.x + 0.5, s.y + 0.5];
    const foot = pool?.sill ?? fall.fall.crest - fall.fall.height;
    for (const e of fall.fall.lip) {
      const d = dist(e, st);
      if (d < LANDMARK_NEAR || d > LANDMARK_FAR) return fail(`${nameOf(plan, I.redFall)} stands ${d.toFixed(0)} tiles from the start (${LANDMARK_NEAR} to ${LANDMARK_FAR})`);
      for (const [z, what] of [[fall.fall.crest + FRAME.overLip, "lip"], [foot, "foot"]] as const) {
        const f = frameAt(cam, e[0], e[1], z);
        if (!f || Math.abs(f.u) > FRAME.uSide || Math.abs(f.v) > FRAME.vTop) return fail(`${nameOf(plan, I.redFall)}'s ${what} falls outside the vista frame${f ? ` (u ${f.u.toFixed(2)}, v ${f.v.toFixed(2)})` : ""}`);
      }
    }
    const [a, b] = p.window.framed;
    if (b - a < WINDOW.framed) return fail(`The vista frame shows ${b - a} tiles of the search window (${WINDOW.framed} or more)`);
    if (a < p.window.from - 0.01 || b > p.window.to + 0.01) return fail("The framed run lies outside the search window");
    if (p.gulch.mouth < a || p.gulch.mouth > b) return fail("The gulch's mouth stands outside the framed run of its window");
    return OK;
  },
};

/** `poisoned.ladder` (the design's §6): every rung has its site. The first, a levee across the plain-side low place
 *  nearest the start, as long as the low place (4 to 8); a pond on the start's brook on the terrace; a levee of 20
 *  along the backswamp's riser below the Red Fall; the turn, a dam of 6 tiles or fewer at the gulch's narrows, inside
 *  the search window; the river in, a weir across the river just below the first slough's low place (within 8 tiles),
 *  that slough reaching the backswamp below the Red Fall and every slough reaching the backswamp. The turn and the
 *  river in need nothing (either order); each buys some green. */
const poisonedLadder: Invariant = {
  id: "poisoned.ladder",
  at: "plan",
  test({ plan }) {
    const p = plainOf(plan);
    const river = linkOf(plan, I.river);
    const brook = linkOf(plan, I.brook);
    if (!p || !river?.path || !brook?.path) return fail(NO_PLAIN);
    const T = turnOf(plan, p);
    const w = (id: string) => plan.works.find((x) => x.id === id);
    const st: Point = [plan.frame.start.x + 0.5, plan.frame.start.y + 0.5];
    const plainLows = p.levee.low.filter((o) => o.side === "plain");
    if (!plainLows.length) return fail("No low place on the plain's side");
    const nearest = plainLows.reduce((a, b) => (dist(a.at, st) <= dist(b.at, st) ? a : b));
    const first = w("lowLevee");
    if (!first || first.rung !== "first" || first.kind !== "levee" || first.on !== I.river || dist(first.at, nearest.at) > 0.5 || Math.abs(first.tiles - (nearest.to - nearest.from)) > 1) return fail("The first rung is not a levee across the low place nearest the start");
    const pond = w("brookPond");
    if (!pond || pond.kind !== "damToPond" || pond.on !== I.brook || pathDist(pond.at[0], pond.at[1], brook.path).d > 1) return fail(`No pond on ${nameOf(plan, I.brook)}`);
    const pu = toLocal(T, pond.at)[0];
    if (pu < p.terrace[0] || pu > p.terrace[1]) return fail(`The pond on ${nameOf(plan, I.brook)} is not on the terrace`);
    const lap = w("swampLevee");
    if (!lap || lap.kind !== "levee" || lap.on !== I.red || lap.tiles !== 20) return fail("No levee of 20 along the backswamp's riser");
    const [lu, lv] = toLocal(T, lap.at);
    const vb = lineAt(p.far, p.step, lu) - lineAt(p.swamp, p.step, lu);
    if (lu < p.gulch.mouth || lu > p.red.swampTo || Math.abs(lv - vb) > 1) return fail("The backswamp's levee does not stand on its riser below the Red Fall");
    const turn = w("turn");
    if (!turn || turn.rung !== "medium" || turn.on !== I.redFall || turn.tiles > 6 || dist(turn.at, p.gulch.narrows.at) > 0.5 || turn.needs.length) return fail("The turn is not a dam of 6 tiles or fewer at the gulch's narrows, needing nothing");
    const tu = toLocal(T, turn.at)[0];
    if (tu < p.window.from - GULCH.len[1] || tu > p.window.to + GULCH.len[1]) return fail("The turn stands away from the search window");
    const inn = w("riverIn");
    const slough = p.sloughs[0];
    const low = slough && p.levee.low.find((o) => o.id === slough.low);
    if (!slough || !low || low.side !== "plain") return fail("No slough from a low place on the plain's side");
    const want = plan.W >= 192 ? 2 : 1;
    if (p.sloughs.length !== want) return fail(`${p.sloughs.length} sloughs (${want} at ${plan.W}²)`);
    if (!inn || inn.rung !== "large" || inn.kind !== "raisedSill" || inn.on !== I.river || inn.needs.length) return fail("The river in is not a weir on the river on the large rung, needing nothing");
    const at = pathDist(inn.at[0], inn.at[1], river.path);
    if (at.d > 0.5 || at.s < low.to - 0.5 || at.s > low.to + 8) return fail(`The weir does not stand on ${nameOf(plan, I.river)} just below ${nameOf(plan, slough.id)}'s low place`);
    for (const s of p.sloughs) {
      const [eu, ev] = toLocal(T, s.path[s.path.length - 1]);
      const vbe = lineAt(p.far, p.step, eu) - lineAt(p.swamp, p.step, eu);
      if (ev < vbe - 0.5) return fail(`${nameOf(plan, s.id)} does not reach the backswamp`);
      if (s === slough && eu < p.gulch.mouth) return fail(`${nameOf(plan, s.id)} does not reach the backswamp below ${nameOf(plan, I.redFall)}`);
      const o = p.levee.low.find((x) => x.id === s.low);
      if (!o || o.side !== "plain" || dist(s.path[0], o.at) > 6) return fail(`${nameOf(plan, s.id)} does not leave a low place on the plain's side`);
    }
    for (const x of plan.works) if (!(x.gives.green[1] > 0)) return fail(`Work ${x.id} buys nothing`);
    return OK;
  },
};

const PLAIN_PLAN_CHECKS: Invariant[] = [plainLevels, plainWidth, streamJoin, startBadwater, frameFall, poisonedLadder];
const invariants: Invariant[] = [...PLAN_CHECKS, ...PLAIN_PLAN_CHECKS];

// ------------------------------------------------------------------------------------------------- the def

function planFailure(spec: MapSpec, plan: PremisePlan): string | null {
  for (const inv of invariants) {
    if (inv.at !== "plan") continue;
    const r = inv.test({ spec, plan });
    if (!r.ok) return `${inv.id}: ${r.reason}`;
  }
  return null;
}

/** One layout try's plan (or why it stopped) and the first `plan` invariant it fails: for the tools. */
export function plainLayoutTry(spec: MapSpec, attempt: number, t: number): { plan: PremisePlan | null; failed: string | null } {
  const r = layout(spec, attempt, t);
  if ("why" in r) return { plan: null, failed: `layout: ${r.why}` };
  const plan = r.plan as unknown as PremisePlan;
  return { plan, failed: planFailure(spec, plan) };
}

/** The layout tries an attempt took to hold (for the tools' tables), or null where none held. */
export function plainTries(spec: MapSpec, attempt: number): number | null {
  for (let t = 0; t < LAYOUT_TRIES; t++) if (!plainLayoutTry(spec, attempt, t).failed) return t + 1;
  return null;
}

function draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string } {
  const why = poisonedPlainEligible(spec);
  if (why) return { reason: why };
  let last = "";
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const r = plainLayoutTry(spec, attempt, t);
    if (r.plan && !r.failed) return r.plan;
    last = r.failed ?? "";
  }
  return { reason: `No poisoned floodplain fits seed ${spec.seed} at ${spec.size.x}² in ${LAYOUT_TRIES} layouts (${last})` };
}

/** The premise's definition, for the shared stage functions (`draw.ts` `firstPlan`, `failing`). Its id is outside
 *  `PremiseId` until it is offered (`premises/dev.ts`), hence the one cast here. */
export const poisonedPlain: PremiseDef = {
  id: PLAIN_ID as unknown as PremiseDef["id"],
  eligible: poisonedPlainEligible,
  draw,
  invariants,
};

// ------------------------------------------------------------------------------------------------- the diagram

const C = { floor: "#efe6c8", green: "#cfe3a8", dead: "#a9a49b", swamp: "#d9cfae", terrace: "#e4d6a4", levee: "#7c8f4a", low: "#e07a1f", riser: "#8a7a5c", slough: "#b0895a", window: "#5a3e8c", framed: "#c0392b", fork: "#9c7b4f", col: "#5a3e8c" } as const;

/** The plan's own pieces for the water-story diagram (`diagram.ts` `planSvg`): the valley floor's bands (green, dry,
 *  dead), the terrace, the risers, the levees with their low places, the sloughs, the search window and its framed run,
 *  the gulch's narrows, the col and the Dry Fork. */
export function plainOverlays(plan: PremisePlan): PlanOverlay[] {
  const p = plainOf(plan);
  const river = linkOf(plan, I.river);
  if (!p || !river?.path) return [];
  const T = turnOf(plan, p);
  const N = plan.W;
  const half = river.half ?? 2.5;
  const loc = riverLocal(T, river.path);
  const foot = leveeFoot(p, N, half, loc);
  const m = (q: Point) => toMap(T, q);
  const out: PlanOverlay[] = [];
  const band = (from: (u: number) => number, to: (u: number) => number, u0: number, u1: number, colour: string, legend?: string, opacity = 1) => {
    const top: Point[] = [];
    const bot: Point[] = [];
    for (let u = u0; u <= u1; u += 1) {
      top.push(m([u, to(u)]));
      bot.push(m([u, from(u)]));
    }
    out.push({ kind: "band", points: [...bot, ...top.reverse()], colour, opacity, legend });
  };
  const vF = (u: number) => lineAt(p.far, p.step, u);
  const vB = (u: number) => vF(u) - lineAt(p.swamp, p.step, u);
  const ft = (u: number) => foot[Math.max(0, Math.min(N, Math.round(u)))];
  const u0 = Math.ceil(p.plainFrom);
  band((u) => ft(u), vF, u0, N, C.floor, "dry band (the plain)");
  band((u) => ft(u), (u) => Math.min(vB(u), ft(u) + p.M), u0, N, C.green, `green band (M = ${p.M})`);
  band(vB, vF, u0, N, C.swamp);
  band(vB, vF, Math.ceil(p.gulch.mouth), Math.floor(p.red.swampTo), C.dead, "dead band (the backswamp)");
  band((u) => lineAt(p.near, p.step, u) + p.room[0] - half, vF, p.terrace[0], p.terrace[1], C.terrace, "the start's terrace", 0.9);
  for (const r of p.risers) {
    const pts: Point[] = [];
    const vn = lineAt(p.near, p.step, r.at);
    for (let v = vn; v <= vF(r.at) + 0.01; v += 1) pts.push(m([riserAt(r, v), v]));
    out.push({ kind: "line", points: pts, colour: C.riser, width: 1.5, dash: true, legend: r === p.risers[0] ? "riser (a level down)" : undefined });
  }
  // the levees: their crest a line along each bank, two over the plain thicker, the low places marked
  for (const side of ["plain", "near"] as const) {
    const sg = side === "plain" ? 1 : -1;
    const at = (s: number) => {
      const q = loc[Math.max(0, Math.min(loc.length - 1, Math.round(s * 2)))];
      const w = half + leveeWidth(p, s, side) / 2;
      return m([q.p[0] + sg * q.n[0] * w, q.p[1] + sg * q.n[1] * w]);
    };
    for (const r of p.levee[side]) {
      const pts: Point[] = [];
      for (let s = r.from; s <= r.to + 0.01; s += 1) pts.push(at(Math.min(s, r.to)));
      if (pts.length < 2) pts.push(at(r.to));
      out.push({ kind: "line", points: pts, colour: r.over === 0 ? C.low : C.levee, width: r.over === 2 ? 3 : r.over === 1 ? 2 : 4, legend: side === "plain" && r === p.levee.plain.find((x) => x.over === 2) ? "levee (thick: two over the plain)" : undefined });
    }
  }
  for (const o of p.levee.low) out.push({ kind: "label", points: [o.at], colour: C.low, text: "low", legend: o === p.levee.low[0] ? "low place (level with the plain)" : undefined });
  for (const s of p.sloughs) out.push({ kind: "line", points: s.path, colour: C.slough, width: Math.max(2, 2 * s.half * 2), dash: true, legend: s === p.sloughs[0] ? "slough (a dry bed)" : undefined });
  const wl = (a: number, b: number): Point[] => {
    const pts: Point[] = [];
    for (let u = a; u <= b + 0.01; u += 1) pts.push(m([Math.min(u, b), vF(Math.min(u, b)) + 1.5]));
    return pts;
  };
  out.push({ kind: "line", points: wl(p.window.from, p.window.to), colour: C.window, width: 3, legend: "the gulch's search window" });
  out.push({ kind: "line", points: wl(p.window.framed[0], p.window.framed[1]), colour: C.framed, width: 5, legend: "its run in the vista frame" });
  out.push({ kind: "line", points: p.fork.path, colour: C.fork, width: 3, dash: true, legend: `${nameOf(plan, I.fork)} (dry, to its edge)` });
  out.push({ kind: "label", points: [p.col.at], colour: C.col, text: `col ${p.col.level}` });
  out.push({ kind: "label", points: [p.gulch.narrows.at], colour: C.col, text: `narrows ${p.gulch.narrows.width}` });
  out.push({ kind: "label", points: [p.gulch.head], colour: C.col, text: `${nameOf(plan, I.stain)} ${p.gulch.crest + p.gulch.rise}` });
  return out;
}
