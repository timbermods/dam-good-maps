// Stage 2 of the poisoned floodplain (docs/design/poisoned-floodplain.md §1 to §3, §7; PREMISES.md §5.1 "Land first,
// story second"): the valley a river made, round stage 1's water. Every landform is one a river makes, shaped by noise
// and by distance from the plan's wandering lines; nothing is laid along a ruled line.
//
// - The floor: the plain at `L`, a level down at each riser the plan wanders across it; the backswamp a level under the
//   plain along the far wall's foot, its edge a wandering riser; the start's terrace two over the plain at its head, its
//   lip a lobe whose edge wanders and steps down a level or two at once; the sloughs, dry beds a level under the plain
//   from the levee's low places to the backswamp. The floor's lines are read through a warp of a few tiles, so no
//   contour follows the plan's lines exactly.
// - The levees (`raster/levee.ts`): a bank each side of the river, its height and width the plan's noise along it.
// - The walls: from each foot the ground rises in crags and benches (the shared relief's `rise`, its heights drawn by
//   noise), ribbed by a noise along the wall that brings the contours out in spurs and back in re-entrants, to a crest
//   that rises and falls along the wall; past the crest it climbs on to the theme's own upland (`reliefBetween` in River
//   Valley's style), or falls back to it, in crags and benches of its own, so the valley's sides and the land beyond
//   meet without a seam.
// - The side valleys: hanging valleys cut into both walls; the far wall's in rock that stands over their heads' floors
//   (a hanging valley's walls hold its water), their floors 3 to 5 over the foot; beside most of the far wall's, a
//   beheaded valley, the old course its stream took before it was captured, heading in a low saddle beside it and
//   falling away from the floor to a map edge.
// - The search (§3): of the far wall's side valleys whose mouths open in the search window (the badwater distance to
//   75 % of the plain), nearest first, the first that holds as the gulch (its mouth 3 to 5 over the backswamp, a
//   narrows 3 wide or fewer in its lower half, its lowest way out but its mouth 2 or more over the narrows and on to an
//   edge, a way the start faces that frames its fall), within the mend's budget, the mended land read as `col.over`
//   and `fork.own` read it. The plan's gulch, col, Dry Fork, red water and the start's facing are re-sited to what was
//   found (`resiteGulch`), stage 1 drawn again and the relief made again round it; the gulch is judged again in that
//   land, the plan re-sited to the new measure, and the land mended by taking ground away only (`mendGulch`).
//
// Every tile stage 1 fixed keeps its ground; every other stands at least at its guard.

import { openingCamera, VISTA_ZOOM } from "../analysis/opening";
import { ORIENTATIONS, type Orientation } from "../format/footprints";
import { BED_FLOOR } from "../land/genome";
import { smoothstep } from "../math/clamp";
import { fbm } from "../math/noise";
import { atan2, cos, exp, hypot, sin, sqrt, tanh } from "../math/portable";
import { flowThrough } from "../sim/prefill";
import { sillWidthFor } from "../sim/sill";
import { gameSoil } from "../sim/soil";
import type { MapSpec } from "../spec/mapspec";
import { FLOOR_MARGIN, rulesFor } from "../validate/playability";
import { ruledLand } from "../validate/ruledLand";
import type { StyleTheme } from "./choice";
import { failing, PLAN_TRIES } from "./draw";
import { checkFrame, dayOneWater, type FrameCheck } from "./frame";
import { dist, headingOf, pathDist } from "./geom";
import { VALLEY_BACK } from "./raster/falls";
import { bankRun, breakBankRuns, leveeBanks, longestStraight, type LeveeForm } from "./raster/levee";
import { seedOf } from "./raster/field";
import { reliefBetween, rise } from "./raster/relief";
import { premiseStyle, type ReliefStyle } from "./style";
import type { Body, InvariantResult, Link, Point, PremisePlan, Work } from "./types";
import { waterByNumber, type StageWater } from "./water";
import {
  crestOver,
  DEAD_SHARE,
  DRY_LEAST,
  FAR_OVER,
  NEAR_OVER,
  edgeAt,
  GULCH,
  leveeFoot,
  leveeWidth,
  lineAt,
  onMap,
  PLAIN_IDS,
  plainLevel,
  plainOf,
  poisonedPlain,
  riverLocal,
  TERRACE,
  toLocal,
  toMap,
  turnOf,
  walk,
  WALL,
  WINDOW,
  framedRuns,
  type PlainNumbers,
  type Turn,
} from "./premises/poisonedPlain";

const I = PLAIN_IDS;
/** The Red Spring stands this many tiles inside the gulch's head; the Red Pool this far out from the wall's foot (the plan's
 *  pools); the Dry Fork falls this much at least from under the col to its edge. */
const RED_POOL = 2;
const RED_FOOT = 2;
const FORK_FALL_MIN = 3;
/** How far the Dry Fork's way keeps clear of the land that drains onto the floor at the col's level (tiles): its bed
 *  and the tile either side cut, and a tile of the old ground past them. */
const FORK_CLEAR = 3;
/** The Dry Fork's way tile its second point stands on (`resiteGulch`), where `fork.own` pours. */
const FORK_POUR = 4;
/** How many of the Dry Fork's way tiles either side each point of its drawn course is the mean of. */
const FORK_EASE = 3;
/** The noise the lowest way out breaks its ties by (tiles across): the Dry Fork's way over level land wanders. */
const WAY_TIE_CELL = 7;
/** How far up the gulch its banks look for the floor they must stand over (tiles): the red stream stands some 0.4
 *  deep on the gulch's floor and backs up over a step of it a tile or two. */
const GULCH_BANK = 2;

// ------------------------------------------------------------------------------------------------- the numbers

/** The floor's lines are read through a warp of `amp` tiles (noise `cell` tiles across), so no contour follows the
 *  plan's lines exactly; the backswamp's edge wanders a further `swamp` tiles, and the plain's risers a further `riser`
 *  tiles down the valley (noise `riserCell`: the plan's risers wander a tile or two, and on the ground read as ruled
 *  lines across the plain). */
export const FLOOR_WARP = { amp: 2.2, cell: 13, swamp: 1.2, swampCell: 9, riser: 7, riserCell: 11, calm: [4, 8] as const } as const;
/** The start's terrace: its lip a lobe `bulge` tiles down the valley at its middle (of its width), wandering `wander`
 *  tiles by noise `cell` across; its side toward the river `strip` tiles past the levee's foot (the river's own strip
 *  of plain); its edge steps down a level to a bench `step` tiles wide, then to the plain (a bench wide enough to be a
 *  region of its own: the slopes join the terrace, the bench and the plain, `features/slopes.ts`). */
export const TERRACE_LAND = { lip: 1, bulge: [2, 6], wander: 2, cell: 11, strip: [3, 7], step: [2.5, 6], grow: 2, growMost: 30 } as const;
/** The levees' width on the land: the plan's width, drawn in toward its middle (`keep`), with a quicker wander of its
 *  own (`wander` tiles, noise `cell` along the river) so no bank's foot runs straight; 3 to 6 tiles still. */
export const LEVEE_LAND = { mid: 4.5, keep: 0.4, wander: 2.5, cell: 5 } as const;
/** The levees' core (the design's §2, a badtide): within `core` tiles of the river's water a bank stands at least a
 *  level over the land wherever its crest does, whatever its edge's noise. The game's soil gives the bank's first tile
 *  2/7 of a red river's poison (a level climbed) and takes 1/7 a tile, so 3 tiles of bank leave none for the plain. Its
 *  crest stands `crest` over its river's bed (the water runs at most two deep, so a level over it) where the land beside lies
 *  lower, past a riser. The core runs the river's whole length (`lead`: from its springs, before the levees begin), and
 *  round the springs the ground stands a level over the plain `rim` tiles out: the river runs two deep at its head,
 *  its water there at the plain's level or a little over, a river perched between its banks as a floodplain's is. */
export const LEVEE_CORE = { core: 3, lead: Infinity, crest: 3, rim: 2 } as const;
/** Day 1's dead band laid on the ground to the plan's share (the design's §2: the plan counts the backswamp below the
 *  Red Fall and 7 tiles either side of the red stream's way across the plain; the game's soil carries its poison two
 *  tiles up a bank a level high, a good way across ground at its water's level): along the red stretch the backswamp
 *  `widen` of itself wider (the plan's floor counts from the river's levee foot, the ground's from the near wall's), and
 *  where the red stream crosses the plain to its join, its wash, the ground within `reach` tiles of its course (noise
 *  `cell`), at its water's level, a level under the plain. */
export const RED_WASH = { widen: 0.25, reach: [5, 7], cell: 9 } as const;
/** The walls, each in its own style: crags of `c1` and `c2`, benches `bench` wide, later crags `cn` (the shared
 *  relief's `rise`, each drawn in its range by noise `cell`), each bench's width wandering by up to `benchVary` of
 *  itself across the wall (noise `benchCell`); ribs that bring the contours out and back `rib` tiles (noise `ribCell`
 *  along the wall; re-entrants `ribIn` of that); the crest `vary` levels either way along the wall (noise `crestCell`). The far wall stands: big
 *  crags and narrow benches to a crest `farOver` over the plain (`FAR_OVER` and more where the first frame sees it,
 *  planning's verdict on round 1), and past it a plateau that rolls `roll` levels (noise `rollCell`) and sinks
 *  `sink` levels at most toward the map's edge (a level every `sinkOver` tiles), its side valleys and old valleys cut
 *  in it. The near wall is lower (`NEAR_OVER`); past its crest the land climbs on to the theme's upland, or falls back
 *  to it, in crags and benches of its own. */
export const WALL_LAND = {
  near: { c1: [1, 3], c2: [1, 3], bench: [3, 8], benchVary: 1.5, cn: 2, vary: 1, rib: 6, ribIn: 1, knot: 3 },
  far: { c1: [2, 4], c2: [2, 4], bench: [1.5, 4], benchVary: 1.1, cn: 3, vary: 2.5, rib: 7, ribIn: 0.3, knot: 4 },
  benchCell: 10, cell: 17, ribCell: 14, knotCell: 8, crestCell: 29, farOver: 11, roll: 1.4, rollCell: 23, sink: 3, sinkOver: 16,
} as const;
/** The side valleys (planning's verdict on round 1: a wall's side valleys differ, never a comb): their mouths `apart`
 *  tiles apart on the mean along the foot (from the terrace's head), each gap the mean times a draw of spread
 *  `gapSpread` (log-normal) held in `gap`; `alcove` of them alcoves, short broad coves (`alcoveLen` long, `alcoveHalf`
 *  half-wide, hanging `alcoveHang`); the rest `len` long into the wall, each off its wall's normal by its own heading
 *  (within `angle`, `differ` or more from its neighbour's), turning by `bend` along it (noise `turnCell`), held within
 *  `off` of the normal; their floors `hang` over the foot at the mouth (`lowHang` on `1 − tallShare` of them), rising
 *  `rise` to the head; half-widths `half`, wandering `widthVary` of themselves and narrowing by `taper` to the head;
 *  the far wall's pinched to `pinch` (a narrows where its stream crossed harder rock: the search needs one) at
 *  `pinchAt` of their length over `pinchLen` tiles; `branchShare` of those `branchFrom` long or more with a branch,
 *  joining at `branchAt` of the length, `branchAngle` degrees off, `branchLen` long, `branchHalf` half-wide; their
 *  walls in crags, their edges jagged by `jag` tiles (noise `jagCell`); the hard rock round the gulch's mouth `hard`
 *  tiles either side past its half-width; the rock they are cut in standing `sides` levels or more over their heads'
 *  floors for `collar` tiles past their half-widths (a hanging valley's walls stand over its floor: water in it leaves by
 *  its mouth or over a col, never over its side onto the wall's face). */
export const SIDE_VALLEY = {
  apart: 19, gap: [0.55, 2.1], gapSpread: 0.5, gapTries: 8, combTries: 12, alcove: 0.22, alcoveLen: [4, 9], alcoveHalf: [2.6, 4.5], alcoveHang: [2, 5],
  len: [12, 34], angle: 26, differ: 14, bend: 24, turnCell: [9, 16], off: 33, hang: [6, 7], lowHang: [6, 7], tallShare: 1,
  rise: [1, 3], half: [1.6, 3.8], widthVary: 0.3, taper: 0.35, pinch: [0.8, 1.2], pinchPlanned: [0.6, 0.9], pinchAt: [0.3, 0.45], pinchLen: [3, 5],
  branchShare: 0.35, branchFrom: 16, branchAt: [0.4, 0.65], branchAngle: [30, 55], branchLen: [6, 12], branchHalf: [1.2, 2],
  jag: 1.4, jagCell: 5, hard: 4, sides: [4, 6], collar: 5,
} as const;
/** The near wall's side valleys: fewer, smaller, hanging lower. */
export const NEAR_VALLEY = { apart: 27, alcove: 0.35, len: [8, 20], hang: [2, 4], lowHang: [1, 2], tallShare: 0.5, alcoveHang: [1, 3], half: [1.4, 2.8] } as const;
/** The beheaded valleys beside the far wall's side valleys (`share` of them, and always beside the one where the plan
 *  looks for the gulch): heading `gap` tiles past the side valley's wall at `at` of its length, their bed `over` its
 *  floor there, falling away from the floor to a map edge (heading up to `turn` radians off straight back, then
 *  meandering as an old river course does, `wander` radians either way by noise `wanderCell` along it), `half` tiles
 *  across at the bed and wandering `widthVary` of that, their banks' contours jagged `jag` tiles (noise `jagCell`). Few,
 *  and meandering: side by side and straight, their troughs
 *  ruled the plateau in bands. */
export const OLD_VALLEY = { share: 0.35, at: [0.5, 0.75], gap: [2, 3.5], over: [1, 2], turn: 0.7, half: [1.5, 2.5], wander: 0.9, wanderCell: 13, widthVary: 0.35, jag: 2.5, jagCell: 7, away: 1, part: [0.45, 0.9], plannedWander: 0.6 } as const;
/** The gulch's rock (planning's verdict on round 2: the gulch cut where the search would find none). Round the planned
 *  side valley (`SideValley.planned`) out to `out` tiles past its widest half-width, and round its Dry Fork's first
 *  `oldLen` tiles out to `oldOut` past its half-width, the ground stands a level over the col (`GULCH.colOver` over the
 *  narrows' floor) before the valleys are cut into it, falling back to the wall beyond in crags; between the gulch and
 *  the Dry Fork's head, the col, the ground stands at the col's level at least; no other side valley is cut within
 *  `clear` tiles of the Dry Fork's course nor into the rock; the gulch's head stands `edge` tiles in from the map's
 *  edge, and its course `brook` tiles or more from the terrace brook's spring. A hanging valley's walls hold its water: what stands in it
 *  leaves by its mouth or over its col, and the Dry Fork carries what the col spills to its own edge. Its narrows stands
 *  `narrows` tiles or more up it, past the Red Fall's hanging valley (stage 1 lays that as wide as the lip for
 *  `VALLEY_BACK` rows behind it), and the gulch is `least` tiles long or more, so its narrows lies in its lower half. */
export const MASSIF = { out: 5, oldLen: 24, oldOut: 7, clear: 8, keep: 2, edge: 12, brook: 18, narrows: VALLEY_BACK + 2, least: 2 * VALLEY_BACK + 6 } as const;
/** The mend's budget (§3): at most `share` of the map's tiles changed. */
export const MEND = { share: 0.04 } as const;

// ------------------------------------------------------------------------------------------------- the side valleys

/** A side valley of a wall, in the local frame: its centre line from the mouth on the foot into the wall (a point a
 *  tile), its floor over the foot at the mouth and its rise to the head, its half-width along it. */
export interface SideValley {
  wall: "far" | "near";
  /** The level its wall rises from at its mouth (the backswamp under the far wall, the plain under the near). */
  foot: number;
  /** Its mouth's u on the wall's foot. */
  mouth: number;
  line: Point[];
  hang: number;
  rise: number;
  half: number[];
  /** Where its narrows is (tile index along `line`), or -1. */
  pinch: number;
  /** A valley, or an alcove: a short broad cove in the wall. */
  kind?: "valley" | "alcove";
  /** The gulch's: drawn at the plan's gulch, its Dry Fork beside it, in the rock `MASSIF` sets round them. */
  planned?: boolean;
  /** Its branch, if it has one: a side valley of its own joining it `at` tiles from its mouth (local line from the
   *  junction, a point a tile; its half-width). */
  branch?: { line: Point[]; at: number; half: number };
  /** Its beheaded neighbour, if it has one: its centre line from its head (local; ends past the map's edge), its bed
   *  over the side valley's floor at the head, and the side valley's point it heads beside. */
  old?: { line: Point[]; over: number; at: number; half: number; box: [number, number, number, number] };
  /** Its box in the local frame (u0, v0, u1, v1), its reach included. */
  box: [number, number, number, number];
}

/** A local line's box, widened by `by`. */
function boxOf(line: readonly Point[], by: number): [number, number, number, number] {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [u, v] of line) {
    u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v);
  }
  return [u0 - by, v0 - by, u1 + by, v1 + by];
}
const inBox = (b: readonly number[], u: number, v: number) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];

const S = (plan: PremisePlan, name: string) => seedOf(plan, "plain", name);
const inRange = (r: readonly [number, number], n: number) => r[0] + (r[1] - r[0]) * Math.max(0, Math.min(1, (n + 1) / 2));
const hashU = (seed: number, k: number, j: number) => (Math.abs(fbm(seed, k * 37.1 + 0.5, j * 53.3 + 0.5, 1.7, 1)) * 7919) % 1;

/** A small seeded stream of the land's own (the side valleys' draws), so the plan's streams are untouched. */
function landRng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return { f: next, r: (a: number, b: number) => a + (b - a) * next() };
}

/** The side valleys of both walls, drawn by the land's own seed along the whole of each wall. Each is a wander, never a
 *  line laid on the grid: its mouths stand a spacing apart that is noise round its mean; each runs into its wall at its
 *  own heading off the wall's normal (none within `SIDE_VALLEY.differ` of its neighbour's), turning as it goes by noise
 *  along it (within `SIDE_VALLEY.off` of the normal); its length and width drawn from wide ranges, its width wandering
 *  and narrowing to its head; some are alcoves (short broad coves), some branch. A wall's valleys are drawn again (up
 *  to `SIDE_VALLEY.combTries` times) until the comb measure (`combOf`) reads them as no comb, and a wall none of whose
 *  draws holds keeps the fewest the measure allows: the maker never makes what its own check refuses (planning's
 *  verdict on round 2).
 *
 *  One of the far wall's is the gulch's (`planned`): at the plan's gulch, its length, its mouth's hang and its narrows
 *  the plan's, never an alcove or branched, with its beheaded neighbour (the Dry Fork) always beside it, heading away
 *  from the floor; no other side valley comes near that neighbour. The search (§3) still finds the gulch among the
 *  wall's side valleys, nearest first; this one is made so that one is there to find. */
export function sideValleys(plan: PremisePlan, p: PlainNumbers = plainOf(plan)!): SideValley[] {
  const T = turnOf(plan, p);
  const out: SideValley[] = [];
  const brookAt: Point = (() => {
    const b = plan.links.find((l) => l.id === I.brook)?.path;
    return b ? toLocal(T, b[0]) : [-Infinity, -Infinity];
  })();
  const brookU = brookAt[0];
  const rad = (d: number) => (d * Math.PI) / 180;
  for (const wall of ["far", "near"] as const) {
    const g = landRng(S(plan, `valleys.${wall}`));
    const gauss = () => (g.f() + g.f() + g.f() - 1.5) * 2;
    const line = wall === "far" ? p.far : p.near;
    const sg = wall === "far" ? 1 : -1;
    const cfg = wall === "far" ? SIDE_VALLEY : { ...SIDE_VALLEY, ...NEAR_VALLEY };
    const wSeed = S(plan, `wander.${wall}`);
    const gapOf = () => cfg.apart * Math.max(SIDE_VALLEY.gap[0], Math.min(SIDE_VALLEY.gap[1], exp(SIDE_VALLEY.gapSpread * gauss())));
    // (the mouths: on the far wall from the plan's gulch, where the plan looks for it, both ways along the wall; on the
    // near wall from the terrace's head down)
    const anchor = wall === "far" ? (p.found?.anchor ?? p.gulch.mouth) : NaN;
    const drawWall = (): SideValley[] => {
      const vs: SideValley[] = [];
      let prev: number[] | null = null;
      let prevAngle = NaN;
      // (drawn again while their gaps are near even: a few gaps can draw alike, and the comb measure reads them so)
      let mouths: number[] = [];
      for (let t = 0; t < SIDE_VALLEY.gapTries; t++) {
        mouths = [];
        if (wall === "far") {
          for (let a = anchor - gapOf(); a > p.terrace[0]; a -= gapOf()) mouths.unshift(a);
          for (let a = anchor; a < T.U; a += gapOf()) mouths.push(a);
        } else for (let a = p.terrace[0] + g.r(0.3, 1) * cfg.apart; a < T.U; a += gapOf()) mouths.push(a);
        // (none over the terrace's brook: its spring stands in the far wall's slope there; a mouth by it stands aside,
        // or is left out where that brings it too near the next; the gulch's never moves)
        if (wall === "far")
          for (let k = 0; k < mouths.length; k++) if (mouths[k] !== anchor && Math.abs(mouths[k] - brookU) < 10) mouths[k] = brookU + (mouths[k] < brookU ? -10 : 10);
        mouths.sort((a, b) => a - b);
        const kept: number[] = [];
        for (const a of mouths) {
          const near = kept.length > 0 && a - kept[kept.length - 1] < SIDE_VALLEY.gap[0] * cfg.apart;
          if (near && a !== anchor) continue;
          if (near) kept.pop();
          kept.push(a);
        }
        mouths = kept;
        const gaps = mouths.slice(1).map((a, k) => a - mouths[k]);
        const mean = gaps.reduce((x, y) => x + y, 0) / Math.max(1, gaps.length);
        if (spreadOf(gaps) >= COMB.spread.gap + 0.08 && gaps.every((x) => x >= (COMB.gap[0] + 0.03) * mean && x <= (COMB.gap[1] - 0.1) * mean)) break;
      }
      for (let m = 0; m < mouths.length; m++) {
        const a = mouths[m];
        const planned = a === anchor;
        const vf = lineAt(line, p.step, a);
        const k = out.length + vs.length;
        const alcove = !planned && g.f() < cfg.alcove;
        const len = planned ? Math.max(cfg.len[0], MASSIF.least, p.found?.anchorLen ?? p.gulch.length) : alcove ? g.r(SIDE_VALLEY.alcoveLen[0], SIDE_VALLEY.alcoveLen[1]) : g.r(cfg.len[0], cfg.len[1]);
        const n = wallNormal(p, wall, a);
        const cell = g.r(SIDE_VALLEY.turnCell[0], SIDE_VALLEY.turnCell[1]);
        const most = rad(SIDE_VALLEY.off);
        // (its course: a heading off the normal that turns by noise along it, held inside the normal's cone softly; the
        // gulch's leaves the wall the way the Red Fall's hanging valley runs behind its lip, along the grid (stage 1 lays
        // the lip as a stair along one axis and its rows behind along the other: `raster/falls.ts`), easing into its own
        // heading over its narrows' distance)
        let back = 0;
        if (planned) {
          const f0 = toMap(T, [a, vf]);
          const along = toMap(T, [a + 1, vf]);
          const into = toMap(T, [a, vf + 1]);
          const lipX = Math.abs(along[0] - f0[0]) >= Math.abs(along[1] - f0[1]);
          const gd: Point = lipX ? [0, Math.sign(into[1] - f0[1])] : [Math.sign(into[0] - f0[0]), 0];
          const l0 = toLocal(T, f0);
          const l1 = toLocal(T, [f0[0] + gd[0], f0[1] + gd[1]]);
          const gl: Point = [l1[0] - l0[0], l1[1] - l0[1]];
          back = atan2(n[0] * gl[1] - n[1] * gl[0], n[0] * gl[0] + n[1] * gl[1]);
        }
        const course = (a0: number, seed: number, from: Point, n0: Point, steps: number, bend: number): { pts: Point[]; heads: number[] } => {
          const pts: Point[] = [from];
          const heads: number[] = [];
          for (let s = 0; s < steps; s++) {
            const ease = planned ? smoothstep(Math.min(1, s / MASSIF.narrows)) : 1;
            const th = ease * most * tanh((a0 + bend * fbm(seed, s, 0, cell, 2)) / most) + (1 - ease) * back;
            heads.push(th);
            const d: Point = [n0[0] * cos(th) - n0[1] * sin(th), n0[0] * sin(th) + n0[1] * cos(th)];
            const q = pts[pts.length - 1];
            pts.push([q[0] + d[0], q[1] + d[1]]);
          }
          return { pts, heads };
        };
        // (its heading: none within `differ` of its neighbour's, nor running beside it within `COMB.parallel` for more
        // than `COMB.run` tiles)
        let best: { pts: Point[]; heads: number[]; angle: number } | null = null;
        for (let t = 0; t < 8; t++) {
          const angle = rad(g.r(-SIDE_VALLEY.angle, SIDE_VALLEY.angle));
          if (Number.isFinite(prevAngle) && Math.abs(angle - prevAngle) < rad(SIDE_VALLEY.differ) && t < 7) continue;
          const c = course(angle, wSeed + k * 7919, [a, vf], n, Math.round(len), rad(alcove ? 8 : SIDE_VALLEY.bend));
          // (the gulch's rock keeps clear of the terrace's brook, whose spring stands in the far wall)
          if (planned && t < 7 && c.pts.some((q) => hypot(q[0] - brookAt[0], q[1] - brookAt[1]) < MASSIF.brook)) continue;
          // (read as the comb measure reads it)
          c.heads = c.heads.map((_, s) => headingAt(c.pts, s, n));
          let run = 0;
          let longest = 0;
          if (prev) for (let s = 0; s < Math.min(prev.length, c.heads.length); s++) longest = Math.max(longest, (run = Math.abs(c.heads[s] - prev[s]) < rad(COMB.parallel) ? run + 1 : 0));
          best = { ...c, angle };
          if (longest <= COMB.run - 2) break;
        }
        let { pts, heads } = best!;
        const { angle } = best!;
        // (the gulch's head and its rock stand on the map: its course ends short of the edge, if it must)
        if (planned)
          while (pts.length > MASSIF.least + 1 && !onMap(T, pts[pts.length - 1], MASSIF.edge)) {
            pts = pts.slice(0, -1);
            heads = heads.slice(0, pts.length - 1);
          }
        if (!onMap(T, pts[0], 2) || !onMap(T, pts[pts.length - 1], 1)) continue;
        prev = heads;
        prevAngle = angle;
        const hangR = alcove ? cfg.alcoveHang : wall === "far" || g.f() < cfg.tallShare ? cfg.hang : cfg.lowHang;
        const foot = wall === "far" ? (a < p.plainFrom ? p.L + TERRACE.rise : plainLevel(p, a, vf) - 1) : levelAt(p, a, vf);
        // (a far valley's floor rises a level or more to its head, under the map's top less two, where its spring's
        // water may stand; the gulch's mouth hangs the plan's Red Fall over the backswamp)
        const drawnHang = Math.round(g.r(hangR[0], hangR[1] + 0.99) - 0.49);
        const hang = wall === "far" ? Math.min(planned ? p.gulch.h : drawnHang, plan.top - 3 - foot) : drawnHang;
        const riseK = Math.round(g.r(SIDE_VALLEY.rise[0], SIDE_VALLEY.rise[1] + 0.99) - 0.49);
        const h0 = alcove ? g.r(SIDE_VALLEY.alcoveHalf[0], SIDE_VALLEY.alcoveHalf[1]) : g.r(cfg.half[0], cfg.half[1]);
        const pinched = !alcove && wall === "far";
        const L = pts.length - 1;
        const pAt0 = Math.round(L * g.r(SIDE_VALLEY.pinchAt[0], SIDE_VALLEY.pinchAt[1]));
        // (the gulch's narrows stands up the gulch past the Red Fall's hanging valley, which stage 1 lays as wide as
        // its lip for `VALLEY_BACK` rows behind it: there the narrows would be the lip's width)
        const pAt = planned ? Math.max(pAt0, MASSIF.narrows) : pAt0;
        const pLen = g.r(SIDE_VALLEY.pinchLen[0], SIDE_VALLEY.pinchLen[1]);
        const pR = planned ? SIDE_VALLEY.pinchPlanned : SIDE_VALLEY.pinch;
        const pHalf = g.r(pR[0], pR[1]);
        const half = pts.map((_, s) => {
          // (an alcove rounds off at its head; a valley wanders in width and narrows toward its head)
          if (alcove) return Math.max(1.4, h0 * sqrt(Math.max(0, 1 - ((s / (L + 1.5)) * (s / (L + 1.5))))));
          const base = Math.max(1.6, h0 * (1 + SIDE_VALLEY.widthVary * fbm(wSeed, s, k * 97 + 50, 6, 2)) * (1 - SIDE_VALLEY.taper * smoothstep(s / L)));
          if (!pinched) return base;
          const t = Math.abs(s - pAt) / (pLen / 2);
          return t >= 1 ? base : pHalf + (base - pHalf) * smoothstep(t);
        });
        const rises = wall === "far" ? Math.max(0, Math.min(riseK, plan.top - 2 - foot - hang)) : riseK;
        const v: SideValley = { wall, foot, mouth: a, line: pts, hang, rise: rises, half, pinch: pinched ? pAt : -1, kind: alcove ? "alcove" : "valley", box: boxOf(pts, 14) };
        if (planned) v.planned = true;
        // its branch: a side valley of its own joining it partway up, off at a wide angle
        if (!alcove && !planned && L >= SIDE_VALLEY.branchFrom && g.f() < SIDE_VALLEY.branchShare) {
          const at = Math.round(L * g.r(SIDE_VALLEY.branchAt[0], SIDE_VALLEY.branchAt[1]));
          const side = g.f() < 0.5 ? 1 : -1;
          const th = heads[Math.min(heads.length - 1, at)] + side * rad(g.r(SIDE_VALLEY.branchAngle[0], SIDE_VALLEY.branchAngle[1]));
          const bn: Point = [n[0] * cos(th) - n[1] * sin(th), n[0] * sin(th) + n[1] * cos(th)];
          const bl = course(0, wSeed + k * 7919 + 4111, pts[at], bn, Math.round(g.r(SIDE_VALLEY.branchLen[0], SIDE_VALLEY.branchLen[1])), rad(SIDE_VALLEY.bend)).pts;
          if (onMap(T, bl[bl.length - 1], 1)) {
            v.branch = { line: bl, at, half: g.r(SIDE_VALLEY.branchHalf[0], SIDE_VALLEY.branchHalf[1]) };
            v.box = boxOf([...pts, ...bl], 14);
          }
        }
        if (!alcove && wall === "far" && (g.f() < OLD_VALLEY.share || planned)) {
          // the beheaded valley: heads beside the side valley's wall and falls away from the floor to an edge (the
          // gulch's, the Dry Fork, never turning back toward the floor: its heading held within `OLD_VALLEY.away`)
          const at = Math.round(L * g.r(OLD_VALLEY.at[0], OLD_VALLEY.at[1]));
          const side0 = g.f() < 0.5 ? 1 : -1;
          const c = pts[Math.min(L, at)];
          const dn = pts[Math.min(L, at + 1)];
          const dl = hypot(dn[0] - c[0], dn[1] - c[1]) || 1;
          const nrm: Point = [(dn[1] - c[1]) / dl, -(dn[0] - c[0]) / dl];
          const off = half[Math.min(L, at)] + g.r(OLD_VALLEY.gap[0], OLD_VALLEY.gap[1]) + g.r(OLD_VALLEY.half[0], OLD_VALLEY.half[1]);
          const turn0 = g.r(0.15, OLD_VALLEY.turn);
          const spread = g.r(OLD_VALLEY.part[0], OLD_VALLEY.part[1]);
          const oSeed = S(plan, `old.${k}`);
          const wide = Math.max(...half) + 3;
          // (the Dry Fork heads on the gulch's side away from the floor, and parts from the gulch: it turns away from
          // the gulch's own heading, and is drawn again, turning harder (or on the other side, where the gulch runs
          // straight into the wall), while it comes back within the gulch's rock)
          const awaySide = nrm[1] * sg > 0 ? 1 : -1;
          const either = Math.abs(nrm[1]) < 0.3;
          let ol: Point[] = [];
          for (let t = 0; t < (planned ? 6 : 1); t++) {
            const side = !planned ? side0 : either ? (t < 3 ? side0 : -side0) : awaySide;
            const head: Point = [c[0] + side * nrm[0] * off * sg, c[1] + side * nrm[1] * off * sg];
            const turn = planned ? -sg * heads[Math.min(heads.length - 1, at)] + side * (spread + 0.3 * (t % 3)) : side * turn0;
            ol = [head];
            for (let s = 1; s < 3 * T.U; s += 1) {
              const th0 = turn + (planned ? OLD_VALLEY.plannedWander : OLD_VALLEY.wander) * fbm(oSeed, s, 0, OLD_VALLEY.wanderCell, 3) * Math.min(1, s / 8);
              const th = planned ? OLD_VALLEY.away * tanh(th0 / OLD_VALLEY.away) : th0;
              const q0 = ol[ol.length - 1];
              const q: Point = [q0[0] + sin(th), q0[1] + sg * cos(th)];
              ol.push(q);
              if (!onMap(T, q, -2)) break;
            }
            if (!planned || ol.slice(3).every((q) => nearOnLine(pts, q[0], q[1]).d > wide)) break;
          }
          if (!onMap(T, ol[ol.length - 1], -1)) v.old = { line: ol, over: Math.round(g.r(OLD_VALLEY.over[0], OLD_VALLEY.over[1] + 0.99) - 0.49), at, half: g.r(OLD_VALLEY.half[0], OLD_VALLEY.half[1]), box: boxOf(ol, 18) };
        }
        vs.push(v);
      }
      // (no side valley comes near the Dry Fork: one that would is left out; an old valley never runs through another
      // side valley: one whose course comes within a side valley's rock of another's is left out, and its side valley
      // stands alone)
      const crosses = (o: NonNullable<SideValley["old"]>, w: SideValley, by: number) => o.line.some((q) => inBox(w.box, q[0], q[1]) && nearOnLine(w.line, q[0], q[1]).d < Math.max(...w.half) + by);
      const fork = vs.find((v) => v.planned)?.old;
      const kept = fork ? vs.filter((w) => w.planned || !crosses(fork, w, MASSIF.clear)) : vs;
      for (const v of kept) {
        if (!v.old || v.planned) continue;
        const o = v.old;
        if (kept.some((w) => w !== v && crosses(o, w, SIDE_VALLEY.collar))) delete v.old;
      }
      return kept;
    };
    let drawn: SideValley[] = [];
    for (let t = 0; t < SIDE_VALLEY.combTries; t++) {
      drawn = drawWall();
      if (!combOf(plan, drawn, wall).why) break;
    }
    // (no draw holds: the fewest side valleys the comb measure allows, the last down the wall left out first)
    while (combOf(plan, drawn, wall).why) {
      const k = drawn.map((v, j) => (v.planned ? -1 : j)).filter((j) => j >= 0).pop();
      if (k === undefined) break;
      drawn = drawn.filter((_, j) => j !== k);
    }
    out.push(...drawn);
  }
  return out;
}

/** A comb (planning's verdict on round 1): a wall's side valleys at even spacing, running parallel, alike in length
 *  and width. Side valleys in life differ: their spacing `gap` of the mean either way, their directions within `off`
 *  degrees of the wall's normal (read over a chord of `chord` tiles), no two neighbours within `parallel` degrees of each
 *  other for more than `run` tiles; their spacing, lengths and widths unlike (a spread, `spread`, of at least the
 *  share given: the standard deviation over the mean). */
export const COMB = { gap: [0.4, 2.5], off: 35, chord: 4, parallel: 10, run: 12, spread: { gap: 0.2, len: 0.2, half: 0.12 }, least: 4 } as const;

/** The spread of some lengths: their standard deviation over their mean (0 for fewer than two). */
const spreadOf = (xs: readonly number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length) / (m || 1);
};

/** A side valley's heading at `s` tiles along it, radians off its wall's normal at its mouth (+ down the valley), read
 *  over the chord from `s` to `s + COMB.chord`. */
function headingAt(line: readonly Point[], s: number, normal: Point): number {
  const a = line[Math.min(line.length - 1, s)];
  const b = line[Math.min(line.length - 1, s + COMB.chord)];
  const d: Point = [b[0] - a[0], b[1] - a[1]];
  return atan2(normal[0] * d[1] - normal[1] * d[0], normal[0] * d[0] + normal[1] * d[1]);
}

/** A wall's normal into the wall at u (local). */
function wallNormal(p: PlainNumbers, wall: "far" | "near", u: number): Point {
  const line = wall === "far" ? p.far : p.near;
  const dv = (lineAt(line, p.step, u + 2) - lineAt(line, p.step, u - 2)) / 4;
  const sg = wall === "far" ? 1 : -1;
  const l = hypot(dv, 1);
  return [(-dv * sg) / l, sg / l];
}

/** How a wall's side valleys read against a comb (`COMB`): their gaps over the mean (least, most) and the gaps', lengths'
 *  and mean widths' spreads; the farthest off its wall's normal any runs (degrees); the longest run (tiles) two
 *  neighbours keep within `COMB.parallel` degrees; how many branch and how many are alcoves; and why it is a comb, if
 *  it is (null when the wall has too few side valleys to tell). */
export function combOf(plan: PremisePlan, valleys: readonly SideValley[], wall: "far" | "near" = "far"): { n: number; gap: [number, number]; spread: { gap: number; len: number; half: number }; off: number; parallel: number; branches: number; alcoves: number; why: string | null } {
  const p = plainOf(plan)!;
  const vs = valleys.filter((v) => v.wall === wall).sort((a, b) => a.mouth - b.mouth);
  const sd = spreadOf;
  const gaps = vs.slice(1).map((v, k) => v.mouth - vs[k].mouth);
  const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
  const gap: [number, number] = gaps.length ? [Math.min(...gaps) / mean, Math.max(...gaps) / mean] : [1, 1];
  const spread = { gap: gaps.length > 1 ? sd(gaps) : 0, len: vs.length > 1 ? sd(vs.map((v) => v.line.length - 1)) : 0, half: vs.length > 1 ? sd(vs.map((v) => v.half.reduce((a, b) => a + b, 0) / v.half.length)) : 0 };
  const deg = (r: number) => (r * 180) / Math.PI;
  let off = 0;
  const heads = vs.map((v) => {
    const n = wallNormal(p, wall, v.mouth);
    const hs: number[] = [];
    for (let s = 0; s + 1 < v.line.length; s++) hs.push(headingAt(v.line, s, n));
    for (const h of hs.slice(0, Math.max(1, hs.length - COMB.chord))) off = Math.max(off, Math.abs(deg(h)));
    return hs;
  });
  let parallel = 0;
  for (let k = 1; k < vs.length; k++) {
    let run = 0;
    for (let s = 0; s < Math.min(heads[k].length, heads[k - 1].length); s++) {
      run = Math.abs(deg(heads[k][s] - heads[k - 1][s])) < COMB.parallel ? run + 1 : 0;
      parallel = Math.max(parallel, run);
    }
  }
  const out = { n: vs.length, gap, spread, off: Math.round(off), parallel, branches: vs.filter((v) => v.branch).length, alcoves: vs.filter((v) => v.kind === "alcove").length, why: null as string | null };
  if (vs.length < COMB.least) return out;
  const f = (v: number) => v.toFixed(2);
  if (gap[0] < COMB.gap[0] - 0.01 || gap[1] > COMB.gap[1] + 0.01) out.why = `its side valleys stand ${f(gap[0])} to ${f(gap[1])} of their mean spacing apart (${COMB.gap.join(" to ")})`;
  else if (spread.gap < COMB.spread.gap) out.why = `its side valleys stand evenly spaced (a spread of ${f(spread.gap)}, ${COMB.spread.gap} or more)`;
  else if (spread.len < COMB.spread.len) out.why = `its side valleys are alike in length (a spread of ${f(spread.len)}, ${COMB.spread.len} or more)`;
  else if (spread.half < COMB.spread.half) out.why = `its side valleys are alike in width (a spread of ${f(spread.half)}, ${COMB.spread.half} or more)`;
  else if (off > COMB.off + 0.5) out.why = `a side valley runs ${out.off}° off the wall's normal (${COMB.off} at most)`;
  else if (parallel > COMB.run) out.why = `two neighbouring side valleys run within ${COMB.parallel}° of each other for ${parallel} tiles (${COMB.run} at most)`;
  return out;
}

/** The nearest point of a local polyline (a point a tile) to (u, v): its distance and its index (fractional). A line of
 *  one point is that point (a valley's head, rounded off). */
export function nearOnLine(line: readonly Point[], u: number, v: number): { d: number; s: number } {
  if (line.length === 1) return { d: hypot(line[0][0] - u, line[0][1] - v), s: 0 };
  let best = Infinity;
  let at = 0;
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k];
    const b = line[k + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / l2)) : 0;
    const ex = a[0] + dx * t - u;
    const ey = a[1] + dy * t - v;
    const d = ex * ex + ey * ey;
    if (d < best) {
      best = d;
      at = k + t;
    }
  }
  return { d: sqrt(best), s: at };
}

// ------------------------------------------------------------------------------------------------- the relief

/** What the relief keeps for the search, the mend and the checks: each tile's local frame (warped), the floor's mask
 *  (1 plain, 2 backswamp, 3 terrace, 4 slough), the foot level each wall rises from. */
export interface PlainRelief {
  heights: Uint8Array;
  floor: Uint8Array;
  valleys: SideValley[];
  /** The levees' banks over the land (`raster/levee.ts`), 0 elsewhere. */
  bank: Uint8Array;
  levee: LeveeForm;
}

/** The levees of a plan as a raster form: the river's path on the map, its banks' widths and crests from the plan's
 *  numbers (side "a" of the path is the plain's side when the path runs down the valley with +v on its left). */
export function leveeOf(plan: PremisePlan, p: PlainNumbers = plainOf(plan)!): LeveeForm {
  const river = plan.links.find((l) => l.id === I.river)!;
  const rp = river.path!;
  const T = turnOf(plan, p);
  // (which side of the path is the plain's: +v in the local frame)
  const a = toLocal(T, rp[0]);
  const b = toLocal(T, rp[1]);
  const pa = toMap(T, [a[0], a[1] + 1]);
  const cross = (rp[1][0] - rp[0][0]) * (pa[1] - rp[0][1]) - (rp[1][1] - rp[0][1]) * (pa[0] - rp[0][0]);
  void b;
  const plainSide = cross > 0 ? "a" : "b";
  const side = (sd: "a" | "b") => (sd === plainSide ? "plain" : "near");
  const wSeed = S(plan, "levee.width");
  return {
    path: rp,
    half: river.half ?? 2.5,
    from: p.levee.from,
    to: p.levee.to,
    // (held inside 3 to 6 softly: a hard clamp would hold a width, and a bank beside a straight reach, straight)
    width: (s, sd) => LEVEE_LAND.mid + 1.5 * tanh((LEVEE_LAND.keep * (leveeWidth(p, s, side(sd)) - LEVEE_LAND.mid) + LEVEE_LAND.wander * fbm(wSeed, s, sd === "a" ? 0 : 300, LEVEE_LAND.cell, 1)) / 1.5),
    over: (s, sd) => crestOver(p.levee[side(sd)], s),
    seed: S(plan, "levee"),
  };
}

/** The plain's level at a local point (L above the plain's head). */
const levelAt = (p: PlainNumbers, u: number, v: number) => (u < p.plainFrom ? p.L : plainLevel(p, u, v));

/** The theme's upland as this premise reads it past the near wall: softened (`blur` tiles, twice), read through a
 *  wander (`warp` tiles, noise `warpCell`) and dithered (`dither` levels, noise `ditherCell`) before it is rounded.
 *  The shared relief sets its upland a plate at a time, the tiles nearest one point of a scatter, each plate a level of
 *  its own, meeting in cliffs (their sides ragged by noise and the scatter turned off the grid at every size,
 *  D(plates-turned), but still a step a plate). Softened, its levels stay where the theme put them and its contours run
 *  by noise. */
export const SOFT_UPLAND = { blur: 4, warp: 4, warpCell: 19, dither: 0.45, ditherCell: 9 } as const;
export function softUpland(up: ArrayLike<number>, W: number, H: number, seed: number): Float64Array {
  let a: Float64Array = Float64Array.from(up as ArrayLike<number>);
  const R = SOFT_UPLAND.blur;
  const pass = (src: Float64Array, horizontal: boolean): Float64Array => {
    const out = new Float64Array(W * H);
    const n = horizontal ? W : H;
    const m = horizontal ? H : W;
    for (let j = 0; j < m; j++) {
      const at = (k: number) => (horizontal ? j * W + k : k * W + j);
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += src[at(Math.max(0, Math.min(n - 1, k)))];
      for (let k = 0; k < n; k++) {
        out[at(k)] = sum / (2 * R + 1);
        sum += src[at(Math.min(n - 1, k + R + 1))] - src[at(Math.max(0, k - R))];
      }
    }
    return out;
  };
  for (let k = 0; k < 2; k++) a = pass(pass(a, true), false);
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.max(0, Math.min(W - 1.001, x + SOFT_UPLAND.warp * fbm(seed, x, y, SOFT_UPLAND.warpCell, 2)));
      const sy = Math.max(0, Math.min(H - 1.001, y + SOFT_UPLAND.warp * fbm(seed + 1, x, y, SOFT_UPLAND.warpCell, 2)));
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const tx = sx - ix;
      const ty = sy - iy;
      const k = iy * W + ix;
      const v = (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + W] * (1 - tx) + a[k + W + 1] * tx) * ty;
      out[y * W + x] = v + SOFT_UPLAND.dither * fbm(seed + 2, x, y, SOFT_UPLAND.ditherCell, 2);
    }
  return out;
}

/** Stage 2's ground for a plan and its water (stage 1), the upland the theme's (`upland`, `reliefBetween` on the same
 *  water in the theme's style). The side valleys as drawn; the mend comes after the search. */
export function plainRelief(plan: PremisePlan, w: StageWater, upland: Uint8Array, opts: { bench?: number } = {}): PlainRelief {
  const p = plainOf(plan)!;
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const T = turnOf(plan, p);
  const sky = Math.max(plan.top, plan.sky ?? plan.top);
  const sWu = S(plan, "warp.u");
  const sWv = S(plan, "warp.v");
  const sSw = S(plan, "swamp");
  const sRiser = S(plan, "riser");
  const sLip = S(plan, "lip");
  const sStrip = S(plan, "strip");
  const sStep = S(plan, "step");
  const sC = [S(plan, "c1"), S(plan, "c2"), S(plan, "bench")];
  const sRib = S(plan, "rib");
  const sBench = S(plan, "bench.vary");
  const sKnot = S(plan, "knot");
  const sCrest = S(plan, "crest");
  const sSide = S(plan, "side");
  const sJag = S(plan, "jag");
  const sRoll = S(plan, "roll");
  // (the theme's upland softened: its plates meet in straight cliffs, see `softUpland`)
  const soft = softUpland(upland, W, H, S(plan, "soft"));
  const river = plan.links.find((l) => l.id === I.river)!;
  const half = river.half ?? 2.5;
  const foot = leveeFoot(p, T.U, half, riverLocal(T, river.path!));
  const footAt = (u: number) => {
    const k = Math.max(0, Math.min(foot.length - 1, Math.round(u)));
    return Number.isFinite(foot[k]) ? foot[k] : lineAt(p.near, p.step, u) + p.room[1] + half + 4;
  };
  const valleys = sideValleys(plan, p);
  const gulch = p.found ? valleys[p.found.valley] : null;
  // (the gulch's rock: round the planned side valley and its Dry Fork's head, see `MASSIF`)
  const pl = (() => {
    const sv = valleys.find((v) => v.planned);
    if (!sv) return null;
    // (the col over the highest floor the search may read its narrows on: its lower half)
    const want = floorAt(sv, (sv.line.length - 1) / 2) + GULCH.colOver;
    const o = sv.old ?? null;
    const head = o ? o.line.slice(0, MASSIF.oldLen + 1) : null;
    const wide = Math.max(...sv.half) + MASSIF.out;
    const oWide = o ? o.half + MASSIF.oldOut : 0;
    const col: [Point, Point] | null = o ? [sv.line[Math.min(sv.line.length - 1, o.at)], o.line[0]] : null;
    return { sv, want, rim: want + 1, o, head, wide, oWide, col, box: boxOf([...sv.line, ...(head ?? [])], Math.max(wide, oWide) + 8) };
  })();
  const g = landRng(S(plan, "terrace"));
  const bulge = g.r(TERRACE_LAND.bulge[0], TERRACE_LAND.bulge[1]);
  const st = plan.frame.start;
  const [uS, vS] = toLocal(T, [st.x + 0.5, st.y + 0.5]);

  const h = new Uint8Array(N);
  const floor = new Uint8Array(N);
  // (the floor's own numbers per tile, kept so the terrace may grow without the walls made again)
  const fl = { u: new Float64Array(N), v: new Float64Array(N), side: new Float64Array(N), vf: new Float64Array(N), lv: new Int16Array(N), vb: new Float64Array(N) };
  const floorTile = (i: number, grow: number): void => {
    const x = i % W;
    const y = (i - x) / W;
    const u = fl.u[i];
    const v = fl.v[i];
    const side = fl.side[i];
    const vf = fl.vf[i];
    // the terrace: from its strip past the levee's foot to the far wall, down the valley to its lip (`grow` tiles on
    // where the start's bench needs it)
    const across = Math.max(0, Math.min(1, (v - side) / Math.max(1, vf - side)));
    let lip = p.plainFrom + TERRACE_LAND.lip + grow + bulge * sin(Math.PI * across) + TERRACE_LAND.wander * fbm(sLip, v, 0, TERRACE_LAND.cell, 2);
    // (its bench never within three tiles of the start's 5 × 5: the start stands on the terrace)
    if (Math.abs(v - vS) < 6) lip = Math.max(lip, uS + 5 + TERRACE_LAND.step[1]);
    const inside = Math.min(lip - u, v - side);
    if (inside > 0) {
      const step = inRange(TERRACE_LAND.step, fbm(sStep, x, y, 9, 2));
      h[i] = p.L + (inside > step ? TERRACE.rise : 1);
      floor[i] = 3;
    } else if (v >= fl.vb[i]) {
      h[i] = fl.lv[i] - 1;
      floor[i] = 2;
    } else {
      h[i] = fl.lv[i];
      floor[i] = 1;
    }
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u0, v0] = toLocal(T, [x + 0.5, y + 0.5]);
      // (the warp fades to nothing round the gulch the search found: its mouth, lip and pool stand where stage 1 put
      // them)
      const calm = gulch ? smoothstep((Math.abs(u0 - gulch.mouth) - FLOOR_WARP.calm[0]) / (FLOOR_WARP.calm[1] - FLOOR_WARP.calm[0])) : 1;
      const u = u0 + calm * FLOOR_WARP.amp * fbm(sWu, x, y, FLOOR_WARP.cell, 2);
      const v = v0 + calm * FLOOR_WARP.amp * fbm(sWv, x, y, FLOOR_WARP.cell, 2);
      const vn = lineAt(p.near, p.step, u);
      const vf = lineAt(p.far, p.step, u);
      let z: number;
      if (v >= vn && v <= vf) {
        // the floor
        fl.u[i] = u;
        fl.v[i] = v;
        fl.vf[i] = vf;
        fl.lv[i] = levelAt(p, u + calm * FLOOR_WARP.riser * fbm(sRiser, x, y, FLOOR_WARP.riserCell, 2), v);
        const sw = lineAt(p.swamp, p.step, u) * (u >= p.gulch.mouth && u <= p.red.swampTo ? 1 + RED_WASH.widen : 1);
        fl.vb[i] = vf - sw + FLOOR_WARP.swamp * fbm(sSw, x, y, FLOOR_WARP.swampCell, 2);
        fl.side[i] = footAt(u) + inRange(TERRACE_LAND.strip, fbm(sStrip, u, 0, 9, 2));
        floorTile(i, 0);
        continue;
      } else {
        // the walls: from the foot's level, crags and benches to the crest; past it the far wall's plateau, or the
        // theme's upland beyond the near wall
        const far = v > vf;
        const ws = far ? WALL_LAND.far : WALL_LAND.near;
        const o = far ? 0 : 500;
        const d = far ? v - vf : vn - v;
        const uf = u;
        const F = far ? (uf < p.plainFrom ? p.L + TERRACE.rise : levelAt(p, uf, vf) - 1) : levelAt(p, uf, vn);
        // (ribs: spurs that stand out from the wall, and re-entrants, on the far wall shallow, so it stands near its foot)
        const rib = ws.rib * Math.max(-ws.ribIn, fbm(sRib, uf, o, WALL_LAND.ribCell, 2)) * Math.min(1, d / 4);
        const t = Math.max(0, d + rib + ws.knot * fbm(sKnot, x, y, WALL_LAND.knotCell, 2) * Math.min(1, d / 3));
        // (the crags' heights by noise over the ground, not along the wall alone: a crag the wall's length at one
        // height reads as a band)
        const c1 = Math.round(inRange(ws.c1, fbm(sC[0], x, y + o, WALL_LAND.cell, 2)));
        const c2 = Math.round(inRange(ws.c2, fbm(sC[1], x, y + o, WALL_LAND.cell, 2)));
        // (each bench's width wanders on its own across the wall: benches pinch out and crags merge, no band runs
        // beside the next for the wall's length)
        const bw = Math.max(1.2, inRange(ws.bench, fbm(sC[2], uf, o, WALL_LAND.cell, 2)) * (1 + ws.benchVary * fbm(sBench, x, y, WALL_LAND.benchCell, 2)));
        const crest = Math.min(sky - 1, (far ? Math.max(p.walls.far, p.L + WALL_LAND.farOver) : p.walls.near) + ws.vary * fbm(sCrest, uf, o, WALL_LAND.crestCell, 2));
        let up = rise(t, c1, bw, c2, ws.cn);
        // hard rock round the gulch's mouth (round every far side valley's while the search looks for the gulch): a
        // cliff to over its floor at once, the Red Fall's; elsewhere the wall climbs in its crags
        let hardTop = 0;
        if (far)
          for (const sv of valleys) {
            if (sv.wall !== "far" || sv.kind === "alcove" || (gulch && sv !== gulch)) continue;
            const du = Math.abs(u0 - sv.mouth);
            const reach = sv.half[0] + SIDE_VALLEY.hard;
            if (du > reach + 3) continue;
            const k = 1 - smoothstep((du - reach) / 3);
            if (k > 0 && t > 0.6) hardTop = Math.max(hardTop, k * (sv.hang + 1 + Math.min(2, (t - 0.6) * 0.5)));
          }
        up = Math.max(up, hardTop);
        const wallZ = F + Math.min(up, crest - F);
        // (past the crest: where the wall stands full)
        let full = 0;
        for (let lo = 0, hi = 120, k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          if (rise(mid, c1, bw, c2, ws.cn) >= crest - F) hi = mid;
          else lo = mid;
          full = hi;
        }
        if (t > full && far) {
          // the plateau the far wall is the edge of: rolling by noise, sinking a little toward the map's edge (its level
          // the far wall's mean crest, never the crest's own: that changes along the wall only, and its contours would
          // cross the plateau straight)
          const plateau = Math.min(sky - 1, Math.max(p.walls.far, p.L + WALL_LAND.farOver)) + WALL_LAND.roll * fbm(sRoll, x, y, WALL_LAND.rollCell, 2) + 0.6 * fbm(sRoll + 1, x, y, 9, 2);
          z = Math.max(wallZ - 1, plateau - Math.min(WALL_LAND.sink, (t - full) / WALL_LAND.sinkOver));
        } else if (t > full) {
          // the upland over the crest: the land climbs on to it, or falls back to it, in crags and benches of its own
          const up2 = Math.max(BED_FLOOR + 1, soft[i]);
          const more = rise(t - full, c2, bw * 1.3, c1, ws.cn);
          z = up2 >= wallZ ? Math.min(up2, wallZ + more) : Math.max(up2, wallZ - more);
        } else z = wallZ;
        // the far wall's side valleys stand in rock over their floors (their collars), then every side valley's floor
        // and walls are cut into the wall, taking ground only
        for (const sv of valleys) {
          if (sv.wall !== "far" || !far || !inBox(sv.box, u0, v0)) continue;
          const len = sv.line.length - 1;
          const nq = nearOnLine(sv.line, u0, v0);
          let e = nq.s >= len - 0.01 ? nearOnLine([sv.line[len]], u0, v0).d : nq.d;
          if (sv.branch) e = Math.min(e, nearOnLine(sv.branch.line, u0, v0).d);
          // (by the foot the collar climbs in crags from the wall's foot: sheer only where the gulch's fall will be)
          const top = Math.min(crest, F + 2 + 3 * d, floorAt(sv, len) + inRange(SIDE_VALLEY.sides, fbm(sSide, x, y, 15, 2)));
          const c = top - rise(Math.max(0, e - Math.max(...sv.half) - SIDE_VALLEY.collar), 3, 2, 3, 3);
          if (c > z) z = c;
        }
        // the gulch's rock, a level over its col, before the gulch and the Dry Fork are cut into it
        let mass = Infinity;
        let inGulch = false;
        if (far && pl && inBox(pl.box, u0, v0)) {
          const len = pl.sv.line.length - 1;
          const q = nearOnLine(pl.sv.line, u0, v0);
          const eg = q.s >= len - 0.01 ? nearOnLine([pl.sv.line[len]], u0, v0).d : q.d;
          inGulch = eg <= halfAt(pl.sv, q.s) + 0.5;
          const eo = pl.head ? nearOnLine(pl.head, u0, v0).d - pl.oWide : Infinity;
          mass = Math.min(eg - pl.wide, eo);
          const m = pl.rim - rise(Math.max(0, mass), 2, 2, 2, 2);
          if (m > z) z = m;
        }
        // (a valley's edges jag by noise: a curving cut on the grid steps unevenly, never a stair of one tread)
        const jag = SIDE_VALLEY.jag * fbm(sJag, x, y, SIDE_VALLEY.jagCell, 2);
        const wallOf = (fl: number, off: number, crag: number) => fl + rise(off + jag * Math.min(1, off / 2), crag, 1.2 + 1.2 * (fbm(sSide, x, y, 11, 2) + 1), crag, 2);
        for (const sv of valleys) {
          if (sv.wall !== (far ? "far" : "near")) continue;
          // (none but the gulch's cut into its rock)
          if (!sv.planned && mass <= MASSIF.keep) continue;
          // (in the plan's own frame, unwarped, as the search reads them)
          if (!inBox(sv.box, u0, v0) && !(sv.old && inBox(sv.old.box, u0, v0))) continue;
          const nq = nearOnLine(sv.line, u0, v0);
          const k = Math.min(sv.half.length - 1, Math.round(nq.s));
          const len = sv.line.length - 1;
          const sideCrag = sv.wall === "far" ? 4 : 2;
          const fl = floorAt(sv, nq.s);
          if (nq.s >= len - 0.01) {
            const e = nearOnLine([sv.line[len]], u0, v0).d;
            const cut = fl + 0.6 + rise(Math.max(0, e - sv.half[len]) + jag * 0.5, sideCrag, 2, sideCrag, 2);
            if (cut < z) z = cut;
          } else {
            // (its walls in crags of two or three with ledges between, never a stair of a level a tile)
            const off = Math.max(0, nq.d - sv.half[k]);
            let cut = wallOf(fl, off, sideCrag);
            // (the gulch's banks hold its stream: off its floor they stand a level over the floor there and over the
            // floor `GULCH_BANK` tiles up it, where the stream's water stands as it comes down a step of the floor:
            // the noise's jag left a bank at the floor above a step, and the red water over it, step 3, round 3)
            if (sv === gulch && off > 0.5) cut = Math.max(cut, floorAt(sv, Math.min(len, nq.s + GULCH_BANK)) + 1);
            if (cut < z) z = cut;
          }
          if (sv.branch && inBox(sv.box, u0, v0)) {
            // its branch: a floor from the junction's, a level up past its middle, its head rounded off
            const b = sv.branch;
            const bq = nearOnLine(b.line, u0, v0);
            const bLen = b.line.length - 1;
            const bfl = floorAt(sv, b.at) + (bq.s > bLen / 2 ? 1 : 0);
            const bd = bq.s >= bLen - 0.01 ? nearOnLine([b.line[bLen]], u0, v0).d : bq.d;
            const cut = wallOf(bfl, Math.max(0, bd - b.half * (1 - 0.3 * (bq.s / bLen))), sideCrag);
            if (cut < z) z = cut;
          }
          if (sv.old && inBox(sv.old.box, u0, v0)) {
            const ov = sv.old;
            const oq = nearOnLine(ov.line, u0, v0);
            // (the Dry Fork's bed a level under the col at its head)
            const flAt = sv.planned && pl ? pl.want - 1 - ov.over : floorAt(sv, ov.at);
            const bed = flAt + ov.over - Math.min(6, oq.s / 7);
            // (an old valley: broad, its sides in low crags with benches between)
            const off0 = oq.s < 0.01 ? nearOnLine([ov.line[0]], u0, v0).d : oq.d;
            // (its banks' contours jag by noise of their own, so its terraces never run beside the bed as bands)
            const off = off0 + OLD_VALLEY.jag * fbm(sJag + 7, x, y, OLD_VALLEY.jagCell, 2) * Math.min(1, Math.max(0, off0 - ov.half) / 3);
            const cut = bed + rise(Math.max(0, off - ov.half * (1 + OLD_VALLEY.widthVary * fbm(sSide, oq.s, 900, 9, 2))), 2, 2 + 1.5 * (fbm(sSide, x, y, 13, 2) + 1), 2, 2);
            if (cut < z) z = cut;
          }
        }
        // (the col: a saddle at its level from the gulch's side to the Dry Fork's head, whose bed stands a level under it)
        if (pl?.col && pl.o && !inGulch && mass <= 0 && nearOnLine(pl.col, u0, v0).d <= pl.o.half + 1 && nearOnLine(pl.o.line, u0, v0).d > pl.o.half) z = pl.want;
      }
      h[i] = Math.max(BED_FLOOR + 1, Math.min(sky, Math.round(z)));
    }
  // the start's bench (D515, the gate's `start.level_land`): the terrace's top joined to the start, its water left out;
  // where it holds less than `bench`, the terrace's lip moves on down the valley (`TERRACE_LAND.grow` at a time) until
  // it does: the maker never makes what the start's check refuses (planning's verdict on round 2)
  if (opts.bench) {
    const s0 = Math.min(H - 1, Math.max(0, st.y)) * W + Math.min(W - 1, Math.max(0, st.x));
    const benchOf = (): number => {
      const z0 = p.L + TERRACE.rise;
      if (h[s0] !== z0) return 0;
      const seen = new Uint8Array(N);
      const q = [s0];
      seen[s0] = 1;
      for (let k = 0; k < q.length; k++) {
        const c = q[k];
        const x = c % W;
        for (const j of [x > 0 ? c - 1 : -1, x + 1 < W ? c + 1 : -1, c - W, c + W])
          if (j >= 0 && j < N && !seen[j] && h[j] === z0 && !r.channel[j] && !r.lake[j] && !r.pool[j]) {
            seen[j] = 1;
            q.push(j);
          }
      }
      return q.length;
    };
    for (let grow = TERRACE_LAND.grow; grow <= TERRACE_LAND.growMost && benchOf() < opts.bench; grow += TERRACE_LAND.grow)
      for (let i = 0; i < N; i++) if (floor[i]) floorTile(i, grow);
  }
  // the sloughs: dry beds a level under the plain
  for (const sl of p.sloughs) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (floor[i] !== 1 && floor[i] !== 2) continue;
        const q = pathDist(x + 0.5, y + 0.5, sl.path);
        if (q.d > sl.half + 0.35) continue;
        // (the bed's level where it runs: a level under the plain there, never under the backswamp's)
        const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
        const want = levelAt(p, u, v) - 1;
        if (want < h[i]) {
          h[i] = want;
          floor[i] = 4;
        }
      }
  }
  // the red stream's wash across the plain to its join (`RED_WASH`)
  const redLink = plan.links.find((l) => l.id === I.red);
  if (p.red.end === "join" && redLink?.path) {
    const cross = redLink.path.filter((q) => toLocal(T, q)[0] >= p.red.swampTo - 1);
    if (cross.length > 1) {
      const sWash = S(plan, "wash");
      const pad = RED_WASH.reach[1] + 1;
      const x0 = Math.max(0, Math.floor(Math.min(...cross.map((q) => q[0])) - pad));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(...cross.map((q) => q[0])) + pad));
      const y0 = Math.max(0, Math.floor(Math.min(...cross.map((q) => q[1])) - pad));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(...cross.map((q) => q[1])) + pad));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          if (floor[i] !== 1) continue;
          const q = pathDist(x + 0.5, y + 0.5, cross);
          if (q.d > inRange(RED_WASH.reach, fbm(sWash, x, y, RED_WASH.cell, 2))) continue;
          const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
          const want = levelAt(p, u, v) - 1;
          if (want < h[i]) {
            h[i] = want;
            floor[i] = 4;
          }
        }
    }
  }
  // the levees: the banks over the land where they stand
  const riverK = plan.links.findIndex((l) => l.id === I.river) + 1;
  const riverWater = new Uint8Array(N);
  for (let i = 0; i < N; i++) riverWater[i] = r.channel[i] === riverK ? 1 : 0;
  const levee: LeveeForm = { ...leveeOf(plan, p), water: riverWater, core: LEVEE_CORE.core, lead: LEVEE_CORE.lead };
  const banks = leveeBanks(W, H, levee);
  for (let i = 0; i < N; i++) if (banks.over[i] && floor[i]) h[i] = Math.min(sky, h[i] + banks.over[i]);
  // (the core's crest a level over the river's water wherever the floor beside it lies low, past a riser: the river
  // runs at most two over its bed, so three over the highest bed within the core)
  const bedNear = new Int16Array(N).fill(-1);
  const c = Math.ceil(LEVEE_CORE.core);
  for (let i = 0; i < N; i++) {
    if (!riverWater[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -c; dy <= c; dy++)
      for (let dx = -c; dx <= c; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx * dx + dy * dy <= LEVEE_CORE.core * LEVEE_CORE.core) bedNear[yy * W + xx] = Math.max(bedNear[yy * W + xx], r.heights[i]);
      }
  }
  for (let i = 0; i < N; i++) if (banks.over[i] && floor[i] && bedNear[i] >= 0) h[i] = Math.min(sky, Math.max(h[i], bedNear[i] + LEVEE_CORE.crest));
  // (the springs' rim: the river stands two deep at its head, its springs' water at the plain's level, so the ground
  // round them stands a level over the plain's head, `LEVEE_CORE.rim` tiles out)
  const springsK = plan.bodies.findIndex((b) => b.id === I.springs) + 1;
  const rim = LEVEE_CORE.rim;
  for (let i = 0; i < N; i++) {
    if (r.lake[i] !== springsK) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -rim; dy <= rim; dy++)
      for (let dx = -rim; dx <= rim; dx++) {
        const j = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || !floor[j] || r.channel[j] || r.lake[j] || r.pool[j] || r.fixed[j]) continue;
        if (dx * dx + dy * dy <= rim * rim + 0.5) h[j] = Math.min(sky, Math.max(h[j], p.L + 1));
      }
  }
  // stage 1's ground as it is, every other tile at least at its guard
  for (let i = 0; i < N; i++) h[i] = r.fixed[i] ? r.heights[i] : Math.max(h[i], r.heights[i]);
  // (no bank's foot runs straight along the grid past `levee.wanders`' measure: it steps out a tile where it would)
  const beside = new Uint8Array(N);
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    keep[i] = r.fixed[i] || r.channel[i] || r.lake[i] || r.pool[i] ? 1 : 0;
    beside[i] = floor[i] && !r.channel[i] && !r.lake[i] && !r.pool[i] ? 1 : 0;
  }
  breakBankRuns(W, H, h, banks.over, beside, keep, BANK_STRAIGHT - 2);
  // the courses' gaps: a course runs on from the body it leaves and into the river it joins, through the land between
  // (and the gaps' banks: the land beside a gap, but water and other gaps, a level over its bed, so the course keeps to
  // its cut; ground left at the bed beside the brook's mouth let it out behind the levee, step 3, round 3)
  const gaps = courseGaps(plan, w);
  const cut = new Uint8Array(N);
  for (const m of gaps)
    for (const i of m.tiles) {
      if (m.most !== undefined && h[i] > m.most) continue;
      h[i] = Math.min(h[i], m.bed);
      banks.over[i] = 0;
      cut[i] = 1;
    }
  for (const m of gaps)
    for (const i of m.tiles) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W])
        if (j >= 0 && j < N && !cut[j] && !r.channel[j] && !r.lake[j] && !r.pool[j] && !r.crest[j] && h[j] <= m.bed) h[j] = Math.min(sky, m.bed + 1);
    }
  // the sloughs' mouths (step 4): each slough's head reaches the river's water through its low place, at its bed
  for (const m of sloughMouths(plan, w))
    for (const i of m.tiles) {
      h[i] = Math.min(h[i], m.bed);
      banks.over[i] = 0;
      if (floor[i] === 1 || floor[i] === 2) floor[i] = 4;
    }
  return { heights: h, floor, valleys, bank: banks.over, levee };
}

/** Where each slough's head reaches the river (step 4: the old flood channel was cut from the river, so its head opens
 *  on the river's water through the low place it left by): the tiles from its first point to the river's water tile
 *  nearest it, its half-width and a third either side, but stage 1's own, cut to the slough's head bed, a level under
 *  the plain. The river's water stands under that bed on day 1 (the plan's `riverSteps` ceiling there), so the slough
 *  stays dry; a weir below lifts the river over it (the river in, `plainWorks.ts`). With the river's water at its
 *  bed and the plain round it a level over, it never runs onto the plain: a mouth level with the plain flooded the
 *  plain in a sheet once the river stood over it (seed 1 at 128², 1,573 tiles). */
export function sloughMouths(plan: PremisePlan, w: StageWater): { slough: string; tiles: number[]; bed: number }[] {
  const r = w.raster;
  const { W, H } = plan;
  const p = plainOf(plan);
  const riverK = plan.links.findIndex((l) => l.id === I.river) + 1;
  if (!p || !riverK) return [];
  const out: { slough: string; tiles: number[]; bed: number }[] = [];
  for (const sl of p.sloughs) {
    const a = sl.path[0];
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < W * H; i++) {
      if (r.channel[i] !== riverK) continue;
      const d = (i % W + 0.5 - a[0]) ** 2 + (Math.floor(i / W) + 0.5 - a[1]) ** 2;
      if (d < bd) [bd, best] = [d, i];
    }
    if (best < 0) continue;
    const b: Point = [(best % W) + 0.5, Math.floor(best / W) + 0.5];
    const reach = sl.half + 0.35;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - reach - 1));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + reach + 1));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - reach - 1));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + reach + 1));
    const tiles: number[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (r.fixed[i] || r.channel[i] || r.lake[i] || r.pool[i]) continue;
        if (pathDist(x + 0.5, y + 0.5, [a, b]).d <= reach) tiles.push(i);
      }
    out.push({ slough: sl.id, tiles, bed: sl.bed[0] });
  }
  return out;
}

/** The gulch's floor holds its stream to the Red Fall's lip (step 3, round 3; planning's ruling of 2026-11-17, "the
 *  pool's only sill is the lip"): a floor tile beside a drop off the floor, but the lip's own, stands a level over it
 *  as a bank. The mouth's floor ran wider than the lip and spilled down the face beside the fall; a floor tile beside
 *  the Red Pool's stream below the lip poured a second curtain (seed 6 at 128²). On the land after the mend; how many
 *  tiles it raised. */
export function bankGulch(plan: PremisePlan, w: StageWater, h: Uint8Array, gulch: SideValley): number {
  const r = w.raster;
  const { W, H } = plan;
  const N = W * H;
  const t = valleyTiles(turnOf(plan, plainOf(plan)!), W, H, gulch);
  const len = gulch.line.length - 1;
  const on = (i: number) => t.s[i] >= 0 && t.s[i] <= len && t.d[i] <= gulch.half[Math.max(0, Math.min(len, Math.round(t.s[i])))] + 0.5;
  const water = (i: number) => r.channel[i] || r.lake[i] || r.pool[i] || r.crest[i];
  const lip = new Set(r.lips[I.redFall] ?? []);
  const fall = plan.links.findIndex((l) => l.id === I.redFall) + 1;
  // (a drop: off the floor, or onto other water than the fall's own, the Red Pool's stream running within the gulch's
  // width below it)
  const drop = (j: number) => !on(j) || (water(j) && r.channel[j] !== fall && r.crest[j] !== fall);
  const bank: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!on(i) || water(i) || lip.has(i)) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W])
      if (j >= 0 && j < N && drop(j) && h[j] < h[i]) {
        bank.push(i);
        break;
      }
  }
  for (const i of bank) h[i] += 1;
  return bank.length;
}

/** A course's gap: its tiles, the bed they are cut to, and the highest ground it cuts (absent, any). */
export interface CourseGap {
  link: string;
  tiles: number[];
  bed: number;
  most?: number;
}

/** Where a course runs on through land stage 1 left between its own tiles and the water it leaves or joins: stage 1
 *  lays each body and channel apart and leaves the tiles between them to the land, and ground there dams the water
 *  behind it (the Red Pool brimming over its rim, the start's brook behind the levee). Its two ends, each the tiles from
 *  its own channel to the other water (a diagonal step through the tile beside it, so the water's way runs side to side)
 *  and the bed they are cut to: at its head, from the body it leaves (its tile nearest the path's first point) to its
 *  first own tile, as wide as its channel, at that tile's bed (the Red Pool's water stands at its stream's head, a
 *  level under the backswamp, and the Red Fall drops its whole height onto it), or where they touch, the floor round
 *  their meeting a tile each way; at its mouth, where it joins the river, from its last own tile into the river's
 *  water, at the lowest bed of its own tiles beside the way. A fall's link is left as stage 1 lays it. */
export function courseGaps(plan: PremisePlan, w: StageWater): CourseGap[] {
  const r = w.raster;
  const { W, H } = plan;
  const riverK = plan.links.findIndex((l) => l.id === I.river) + 1;
  const out: CourseGap[] = [];
  const cellsOf = (pts: readonly Point[]): number[] => {
    const cells: number[] = [];
    for (const q of pts.length > 1 ? walk(pts, 0.25) : []) {
      const x = Math.floor(q.p[0]);
      const y = Math.floor(q.p[1]);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (cells[cells.length - 1] !== i) cells.push(i);
    }
    return cells;
  };
  // (the tiles between: from a cell to the first that `stop` takes, each diagonal step through the tile beside it;
  // null where the way crosses other water)
  const between = (cells: number[], from: number, stop: (i: number) => boolean, mine: (i: number) => boolean): number[] | null => {
    const tiles: number[] = [];
    let prev = cells[from];
    for (let n = from + 1; n < cells.length; n++) {
      const i = cells[n];
      const end = stop(i);
      if (!end && !mine(i) && (r.channel[i] || r.lake[i] || r.pool[i])) return null;
      if (i % W !== prev % W && Math.floor(i / W) !== Math.floor(prev / W)) {
        const j = Math.floor(prev / W) * W + (i % W);
        if (!r.channel[j] && !r.lake[j] && !r.pool[j]) tiles.push(j);
      }
      if (end) return tiles;
      if (!mine(i)) tiles.push(i);
      prev = i;
    }
    return null;
  };
  // (a way's tiles and those within `R` of them, but water's and crests')
  const widen = (way: readonly number[], R: number): number[] => {
    const wide = new Set<number>();
    for (const i of way)
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const x = (i % W) + dx;
          const y = Math.floor(i / W) + dy;
          const j = y * W + x;
          if (x >= 0 && y >= 0 && x < W && y < H && !r.channel[j] && !r.lake[j] && !r.pool[j] && !r.crest[j]) wide.add(j);
        }
    return [...wide];
  };
  plan.links.forEach((l, k) => {
    if (!l.path || l.path.length < 2 || l.fall || l.id === I.river) return;
    const own = k + 1;
    const mine = (i: number) => r.channel[i] === own;
    const cells = cellsOf(l.path);
    const first = cells.findIndex(mine);
    let last = -1;
    for (let n = 0; n < cells.length; n++) if (mine(cells[n])) last = n;
    if (first < 0) return;
    // its head: from the body it leaves
    const bk = plan.bodies.findIndex((b) => b.id === l.from) + 1;
    if (bk > 0) {
      const body = (i: number) => r.lake[i] === bk;
      let near = -1;
      let nd = Infinity;
      const [px, py] = l.path[0];
      for (let i = 0; i < W * H; i++) {
        if (r.lake[i] !== bk) continue;
        const dx = (i % W) + 0.5 - px;
        const dy = Math.floor(i / W) + 0.5 - py;
        const d = dx * dx + dy * dy;
        if (d < nd) {
          nd = d;
          near = i;
        }
      }
      // (its own tiles beside the body's: where stage 1 laid them touching)
      const meet: number[] = [];
      for (let i = 0; i < W * H; i++) {
        if (!mine(i)) continue;
        const x = i % W;
        if ([x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].some((j) => j >= 0 && j < W * H && body(j))) meet.push(i);
      }
      const touches = meet.length > 0 || cells.slice(0, first).some(body);
      if (meet.length && (l.half ?? 1) > 1) {
        // (where the body touches its channel, the ground beside their meeting cut as wide as the channel too: they met
        // on a corner a tile wide and the Red Pool stood a level over its stream behind it, step 3, round 3)
        // (but the walls: only the floor round them, ground at most a level over the bed, so a pool against the gulch's
        // side keeps its bank)
        const bed = Math.min(plan.bodies[bk - 1].sill ?? Infinity, Math.min(...meet.map((i) => r.heights[i])));
        out.push({ link: l.id, tiles: widen(meet, Math.max(1, Math.floor(l.half!) - 1)).filter((i) => r.heights[i] <= bed + 1), bed, most: bed + 1 });
      }
      if (near >= 0 && !touches) {
        const head = cellsOf([[(near % W) + 0.5, Math.floor(near / W) + 0.5], ...l.path]);
        const f2 = head.findIndex(mine);
        const way = f2 > 0 ? between(head.slice(0, f2 + 1), 0, (i) => i === head[f2], (i) => mine(i) || body(i)) : null;
        // (as wide as its channel: a narrower way holds the body's water a level up behind it)
        if (way?.length) out.push({ link: l.id, tiles: widen(way, Math.floor(l.half ?? 1)), bed: Math.min(plan.bodies[bk - 1].sill ?? Infinity, r.heights[head[f2]]) });
      }
    }
    // its mouth: into the river; a stream wider than a brook as wide as its channel along its last reach and through
    // the levee (stage 1 leaves its last tiles to the river's reach and thins its channel on the turn into it, and a
    // mouth a tile wide, or a reach two, held the red stream a level deep behind it, over its wash: step 3, round 3),
    // a brook's a tile wide (its bed meets the river's)
    if (l.joins?.link === I.river) {
      const way = between(cells, last, (i) => r.channel[i] === riverK, mine);
      // (at the lowest of its own tiles beside the way: the path's last own tile can stand a level over one the way
      // passes, and the way at its bed held the brook a level deep there, over its banks, step 3, round 3)
      let bed = r.heights[cells[last]];
      for (const i of way ?? []) {
        const x = i % W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && mine(j)) bed = Math.min(bed, r.heights[j]);
      }
      if (way?.length && (l.half ?? 1) > 1) {
        const [px, py] = l.path[l.path.length - 2];
        let from = last;
        let fd = Infinity;
        cells.forEach((i, n) => {
          const d = dist([(i % W) + 0.5, Math.floor(i / W) + 0.5], [px, py]);
          if (n <= last && d < fd) [fd, from] = [d, n];
        });
        const reach = cells.slice(from, last + 1).filter(mine);
        out.push({ link: l.id, tiles: widen([...reach, ...way], Math.floor(l.half!)), bed });
      } else if (way?.length) out.push({ link: l.id, tiles: way, bed });
    }
  });
  return out;
}

/** The plan's skeleton for the search: the plan without the gulch's water (the Red Fall, the Red Spring and its
 *  source), so the land the search reads is the wall's own. */
export function plainSkeleton(plan: PremisePlan): PremisePlan {
  const gone = new Set<string>([I.redFall]);
  return { ...plan, links: plan.links.filter((l) => !gone.has(l.id)), bodies: plan.bodies.filter((b) => b.id !== I.redSpring), sources: plan.sources.filter((s) => s.into !== I.redSpring) };
}


// ------------------------------------------------------------------------------------------------- the search (§3)

/** The gulch the search found, measured on the land: its side valley, the levels (the backswamp at its mouth, the
 *  mouth's floor: the Red Fall's crest; the head's floor), its narrows, its col (the lowest way out of it but its mouth:
 *  the tile, its level, how far over the narrows it stood before the mend), the way on from the col to the map's edge
 *  (the Dry Fork, map tiles in order), and the tiles the mend changes. */
export interface GulchFound {
  index: number;
  valley: SideValley;
  swamp: number;
  crest: number;
  head: number;
  narrows: { s: number; width: number; floor: number };
  col: { i: number; level: number; over: number };
  way: number[];
  /** The way from the gulch's floor up to the col (map tiles in order). */
  into: number[];
  changed: number;
  /** The start's orientation whose vista frame shows the Red Fall here, and the runs of the window that frame shows. */
  orientation: Orientation;
  framed: [number, number][];
}

/** A side valley's floor at `s` along it (tiles from its mouth): its mouth's hang over its foot, rising to its head. */
export const floorAt = (sv: SideValley, s: number): number => sv.foot + sv.hang + Math.floor(sv.rise * Math.max(0, Math.min(1, s / (sv.line.length - 1))) + 0.5);

/** The width of a side valley's floor at `s`, measured on the land: the tiles across its line (at its normal) no
 *  higher than its floor there, from the line out both ways. */
export function floorWidth(T: Turn, W: number, H: number, h: ArrayLike<number>, sv: SideValley, s: number): number {
  const k = Math.max(0, Math.min(sv.line.length - 2, Math.floor(s)));
  const a = sv.line[k];
  const b = sv.line[k + 1];
  const len = hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const c: Point = [a[0] + (b[0] - a[0]) * (s - k), a[1] + (b[1] - a[1]) * (s - k)];
  const fl = floorAt(sv, s);
  const at = (t: number) => {
    const [x, y] = toMap(T, [c[0] + n[0] * t, c[1] + n[1] * t]).map(Math.floor);
    return x >= 0 && y >= 0 && x < W && y < H ? h[y * W + x] : Infinity;
  };
  if (at(0) > fl) return 0;
  let w = 1;
  for (let t = 1; t < 12 && at(t) <= fl; t++) w++;
  for (let t = -1; t > -12 && at(t) <= fl; t--) w++;
  return w;
}

/** Each tile's place along a side valley in the local frame: its distance off the line and how far along it (−1 off
 *  the valley's box). */
export function valleyTiles(T: Turn, W: number, H: number, sv: SideValley): { d: Float32Array; s: Float32Array } {
  const d = new Float32Array(W * H).fill(Infinity);
  const s = new Float32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
      if (!inBox(sv.box, u, v)) continue;
      const q = nearOnLine(sv.line, u, v);
      d[y * W + x] = q.d;
      s[y * W + x] = q.s;
    }
  return { d, s };
}

/** A side valley's half-width at `s`. */
const halfAt = (sv: SideValley, s: number) => sv.half[Math.max(0, Math.min(sv.half.length - 1, Math.round(s)))];

/** The lowest way out of a side valley but its mouth (§3, `col.over`): water standing in it behind its narrows (the
 *  narrows and the valley below it shut, as a dam there would) rises until it spills; the level it spills at, the tile
 *  it spills over (the col: the highest on its way), the way on from the col to where it leaves, in order, and whether
 *  that is the map's edge or the valley's floor. With `avoid`, the floor and the tiles it marks shut too: the lowest
 *  way to an edge that keeps clear of them. */
export function lowestWayOut(plan: PremisePlan, floor: Uint8Array, h: ArrayLike<number>, sv: SideValley, narrowsS: number, tiles = valleyTiles(turnOf(plan, plainOf(plan)!), plan.W, plan.H, sv), avoid: Uint8Array | null = null): { level: number; col: number; way: number[]; into: number[]; out: "edge" | "floor" } | null {
  const { W, H } = plan;
  const N = W * H;
  const level = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const shut = (i: number) => tiles.s[i] >= 0 && tiles.s[i] <= narrowsS + 1.5 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 2.5;
  // (a heap of tiles by the level water must rise to, to reach them, ties by noise: across land of one level the way
  // wanders as the noise does, never down a row or a column)
  const seed = S(plan, "way");
  const tie = new Float32Array(N).fill(NaN);
  const tieAt = (i: number) => (tie[i] === tie[i] ? tie[i] : (tie[i] = fbm(seed, i % W, Math.floor(i / W), WAY_TIE_CELL, 2)));
  const before = (a: number, b: number) => level[a] < level[b] || (level[a] === level[b] && tieAt(a) < tieAt(b));
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    for (let k = heap.length - 1; k > 0; ) {
      const pk = (k - 1) >> 1;
      if (!before(heap[k], heap[pk])) break;
      [heap[pk], heap[k]] = [heap[k], heap[pk]];
      k = pk;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && before(heap[l], heap[m])) m = l;
        if (r < heap.length && before(heap[r], heap[m])) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    if (tiles.s[i] < narrowsS + 2 || tiles.d[i] > halfAt(sv, tiles.s[i])) continue;
    if (h[i] > floorAt(sv, tiles.s[i])) continue;
    level[i] = h[i];
    push(i);
  }
  if (!heap.length) return null;
  const done = new Uint8Array(N);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % W;
    const y = (i - x) / W;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (edge || (floor[i] && !avoid)) {
      const way: number[] = [];
      for (let k = i; k >= 0; k = from[k]) way.push(k);
      way.reverse();
      let col = way[0];
      for (const k of way) if (h[k] > h[col]) col = k;
      return { level: level[i], col, way: way.slice(way.indexOf(col)), into: way.slice(0, way.indexOf(col)), out: floor[i] ? "floor" : "edge" };
    }
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || done[j] || shut(j) || (avoid && (floor[j] || avoid[j]))) continue;
      const lv = Math.max(level[i], h[j]);
      if (lv < level[j]) {
        level[j] = lv;
        from[j] = i;
        push(j);
      }
    }
  }
  return null;
}

/** The land that drains onto the valley's floor at `level` or under, a side valley's narrows and the valley below it
 *  shut (as `lowestWayOut` shuts them), widened by `margin` tiles: the tiles the Dry Fork keeps clear of, so that once
 *  its bed and the col are cut to `level` and under, none of its water and none of the gulch's finds the floor. */
export function floorBelow(plan: PremisePlan, floor: Uint8Array, h: ArrayLike<number>, sv: SideValley, narrowsS: number, tiles: { d: Float32Array; s: Float32Array }, level: number, margin: number): { near: Uint8Array } {
  const { W, H } = plan;
  const N = W * H;
  const shut = (i: number) => tiles.s[i] >= 0 && tiles.s[i] <= narrowsS + 1.5 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 2.5;
  const low = new Uint8Array(N);
  const q: number[] = [];
  for (let i = 0; i < N; i++)
    if (floor[i]) {
      low[i] = 1;
      q.push(i);
    }
  const nb = (i: number) => {
    const x = i % W;
    return [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < N);
  };
  for (let k = 0; k < q.length; k++)
    for (const j of nb(q[k]))
      if (!low[j] && h[j] <= level && !shut(j)) {
        low[j] = 1;
        q.push(j);
      }
  let near = low;
  for (let m = 0; m < margin; m++) {
    const next = near.slice();
    for (let i = 0; i < N; i++) if (near[i]) for (const j of nb(i)) next[j] = 1;
    near = next;
  }
  return { near };
}

/** Where water poured on the ground at a tile runs (`flowThrough`, no dam): onto the valley's floor (the first floor
 *  tile it reaches, or -1), and whether it reaches a map edge. */
export function pourRuns(W: number, H: number, h: ArrayLike<number>, floor: Uint8Array, at: number): { floor: number; edge: boolean } {
  const N = W * H;
  const floorF = new Float64Array(N);
  for (let i = 0; i < N; i++) floorF[i] = h[i];
  const { path } = flowThrough({ W, H, floor: floorF, dam: null, emitters: [{ cells: [at], strength: 1, contamination: 0 }] });
  let edge = false;
  for (let i = 0; i < N; i++) {
    if (!path[i]) continue;
    if (floor[i]) return { floor: i, edge };
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
  }
  return { floor: -1, edge };
}

/** The narrows of a side valley measured on the land: the narrowest place in its lower half (its floor's width). */
export function narrowsOf(T: Turn, W: number, H: number, h: ArrayLike<number>, sv: SideValley): { s: number; width: number; floor: number } {
  let best = { s: -1, width: Infinity, floor: 0 };
  const len = sv.line.length - 1;
  for (let s = 2; s <= len / 2; s += 0.5) {
    const wd = floorWidth(T, W, H, h, sv, s);
    if (wd > 0 && wd < best.width) best = { s, width: wd, floor: floorAt(sv, s) };
  }
  return best;
}

/** Why a side valley is not the gulch (§3), or what it is: its mouth 3 to 5 over the backswamp, a narrows 3 wide or
 *  fewer in its lower half, its lowest way out over a col 2 or more over the narrows' floor on to a map edge without
 *  touching the floor; the mend's changes within the budget. */
export function judgeGulch(plan: PremisePlan, rl: PlainRelief, h: Uint8Array, index: number): GulchFound | { why: string } {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const sv = rl.valleys[index];
  if (sv.wall !== "far") return { why: "not on the far wall" };
  const swamp = sv.foot;
  const crest = floorAt(sv, 0);
  const hang = crest - swamp;
  if (hang < GULCH.h[0] || hang > GULCH.h[1]) return { why: `its mouth hangs ${hang} over the backswamp (${GULCH.h.join(" to ")})` };
  // (the narrows as the mend leaves it: the floor cut to its fall, no bank of stage 1's beside a stream on it)
  const tiles = valleyTiles(T, W, H, sv);
  const cutH = h.slice();
  cutFloor(cutH, sv, tiles);
  const narrows = narrowsOf(T, W, H, cutH, sv);
  if (narrows.width > GULCH.narrows[1]) return { why: `its narrowest in its lower half is ${narrows.width === Infinity ? "nothing" : narrows.width} wide (${GULCH.narrows[1]} or fewer)` };
  // (the lowest way out to an edge, its col cut to 2 over the narrows by the mend, keeping clear of the land that drains
  // onto the floor at the col's level: by FORK_CLEAR tiles, else fewer; the mended land read as `col.over` and
  // `fork.own` will read it decides: the col its lowest way out, the Dry Fork's water to an edge and onto no floor)
  const want = narrows.floor + GULCH.colOver;
  const frame = framing(plan, sv.mouth, hang);
  if (!frame) return { why: "no way the start faces frames its fall" };
  let why = "no way out of it keeps clear of the valley's floor to a map edge";
  for (const margin of [FORK_CLEAR, 1, 0]) {
    const below = floorBelow(plan, rl.floor, h, sv, narrows.s, tiles, want, margin);
    const way = lowestWayOut(plan, rl.floor, h, sv, narrows.s, tiles, below.near);
    if (!way) continue;
    if (way.level < want) return { why: `its col stands ${way.level - narrows.floor} over its narrows (${GULCH.colOver} or more)` };
    const found: GulchFound = { index, valley: sv, swamp, crest, head: floorAt(sv, sv.line.length - 1), narrows, col: { i: way.col, level: want, over: way.level - narrows.floor }, way: way.way, into: way.into, changed: 0, ...frame };
    const mended = h.slice();
    found.changed = mendGulch(plan, mended, found, rl.floor);
    if (found.changed > MEND.share * W * H) {
      why = `its mend changes ${found.changed} tiles (${Math.floor(MEND.share * W * H)} at most)`;
      continue;
    }
    const after = lowestWayOut(plan, rl.floor, mended, sv, narrows.s);
    if (!after || after.out !== "edge" || after.level !== want) {
      why = after && after.out === "floor" ? `once mended, its lowest way out is onto the valley's floor, ${after.level - narrows.floor} over its narrows` : "once mended, its lowest way out is not its col";
      continue;
    }
    const pour = pourRuns(W, H, mended, rl.floor, found.way[Math.min(FORK_POUR, found.way.length - 1)]);
    if (pour.floor >= 0 || !pour.edge) {
      why = "once mended, the Dry Fork's water does not keep to it";
      continue;
    }
    return found;
  }
  return { why };
}

/** The way the start faces whose vista frame shows a Red Fall of `hang` at `mouth` (its lip and a tile either side, in
 *  a run of the search window the frame shows), the start's own way first; and the runs that frame shows. Or null. */
export function framing(plan: PremisePlan, mouth: number, hang: number): { orientation: Orientation; framed: [number, number][] } | null {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const lipHalf = WINDOW.framed / 2;
  const st = plan.frame.start;
  for (const orientation of [st.orientation, ...ORIENTATIONS.filter((o) => o !== st.orientation)]) {
    const framed = framedRuns(T, p, { x: st.x, y: st.y, z: st.z, orientation }, p.window.from, p.window.to, hang);
    if (framed.some(([a, b]) => mouth - lipHalf >= a - 0.01 && mouth + lipHalf <= b + 0.01)) return { orientation, framed };
  }
  return null;
}

/** The search (§3): the far wall's side valleys whose mouths open in the search window (the badwater distance from the
 *  start down to 75 % of the plain's length), nearest first; the first that holds, with a way the start faces that
 *  frames its fall (and that `confirm` takes, when given: the land re-made round it), is the gulch. Or why none did. */
export function searchGulch<T = GulchFound>(plan: PremisePlan, rl: PlainRelief, confirm: (f: GulchFound) => T | { why: string } = (f) => f as T): T | { why: string } {
  const p = plainOf(plan)!;
  const order = rl.valleys
    .map((sv, k) => ({ sv, k }))
    .filter(({ sv }) => sv.wall === "far" && sv.kind !== "alcove" && sv.mouth >= p.window.from && sv.mouth <= p.window.to)
    .sort((a, b) => a.sv.mouth - b.sv.mouth);
  if (!order.length) return { why: "no side valley of the far wall opens in the search window" };
  const whys: string[] = [];
  for (const { k } of order) {
    const r = judgeGulch(plan, rl, rl.heights, k);
    const c = "why" in r ? r : confirm(r);
    if (!(typeof c === "object" && c !== null && "why" in c)) return c;
    whys.push(`at ${Math.round(rl.valleys[k].mouth)}, ${(c as { why: string }).why}`);
  }
  return { why: `none of the ${order.length} side valleys in the window holds (${whys.join("; ")})` };
}

/** The mend's first cut: a side valley's floor to its steady fall (its hanging mouth kept), every tile within its
 *  half-width no higher than its floor there. */
function cutFloor(h: Uint8Array, sv: SideValley, tiles: { d: Float32Array; s: Float32Array }): void {
  for (let i = 0; i < h.length; i++) {
    const s = tiles.s[i];
    if (s < 0.5 || tiles.d[i] > halfAt(sv, s)) continue;
    const fl = floorAt(sv, s);
    if (h[i] > fl) h[i] = fl;
  }
}

/** The mend (§3), by taking ground away only: the gulch's floor cut to its steady fall (its hanging mouth kept), the
 *  col cut to 2 over the narrows' floor, and the way on from it cut to fall the whole way to its edge (each tile no
 *  higher than the last), a tile either side with it. The tiles it changed. */
export function mendGulch(plan: PremisePlan, h: Uint8Array, f: GulchFound, floor: Uint8Array): number {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const sv = f.valley;
  const before = h.slice();
  const tiles = valleyTiles(T, W, H, sv);
  cutFloor(h, sv, tiles);
  const cut = (i: number, to: number) => {
    if (i >= 0 && i < W * H && !floor[i] && h[i] > to) h[i] = to;
  };
  // (the way up to the col from the gulch's floor, cut to the col's level three wide, a tile either side, as the way on
  // is: a notch a tile wide ran the red stream a level deep over the col once the turn's dam stood, so the pond behind
  // the dam stood at its crest and spilled over it, 256² seed 2)
  for (const i of f.into) {
    cut(i, f.col.level);
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) cut(j, f.col.level);
  }
  // (the way stays at the col's level while it runs beside the gulch, its rim a tile and a half past its floor: the
  // gulch's water would pour over a lower tile there)
  const rim = (i: number) => tiles.s[i] >= 0 && tiles.d[i] <= halfAt(sv, tiles.s[i]) + 1.5;
  const near = (i: number) => {
    const x = i % W;
    return [i, x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W].some((j) => j >= 0 && j < W * H && rim(j));
  };
  let last = f.col.level;
  let out = false;
  f.way.forEach((i, k) => {
    out ||= k > 0 && !near(i);
    const to = out ? Math.min(last, f.col.level - 1) : f.col.level;
    cut(i, to);
    last = Math.min(last, h[i]);
    const x = i % W;
    // (the notch and the bed three wide: a tile either side, a level over the bed beside it)
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) cut(j, out ? last + 1 : f.col.level);
  });
  let n = 0;
  for (let i = 0; i < W * H; i++) if (h[i] !== before[i]) n++;
  return n;
}

// ------------------------------------------------------------------------------------------------- the plan re-sited

/** The plan with its gulch, col, Dry Fork and red water where the search found them (the plan's own were its targets):
 *  the Red Fall at the found mouth (its lip along the far wall's foot there, its crest the mouth's floor), the Red Spring
 *  at the head, the narrows and the col as measured, the Dry Fork the way on from the col to its edge, the red stream's
 *  head moved along the backswamp to the new pool, the turn and the backswamp's levee at their new sites. */
export function resiteGulch(plan: PremisePlan, f: GulchFound): PremisePlan {
  const p0 = plainOf(plan)!;
  const T = turnOf(plan, p0);
  const { W } = plan;
  const sv = f.valley;
  const len = sv.line.length - 1;
  const vF = (u: number) => lineAt(p0.far, p0.step, u);
  const vB = (u: number) => vF(u) - lineAt(p0.swamp, p0.step, u);
  const map = (q: Point): Point => toMap(T, q).map((c) => Math.round(c * 100) / 100) as Point;
  const uM = sv.mouth;
  const gw = Math.round(2 * [...sv.half].sort((a, b) => a - b)[sv.half.length >> 1]);
  const redFlow = p0.flow.red;
  const lipW = Math.max(GULCH.width[0], Math.min(gw, sillWidthFor(redFlow) + 2));
  const lip: [Point, Point] = [map([uM - lipW / 2, vF(uM)]), map([uM + lipW / 2, vF(uM)])];
  const headAt = Math.max(1, len - RED_POOL);
  const head: Point = sv.line[headAt];
  // (the narrows' point on the gulch's line, between its points where the measure found it)
  const nK = Math.min(len - 1, Math.floor(f.narrows.s));
  const nT = f.narrows.s - nK;
  const nAt: Point = [sv.line[nK][0] + (sv.line[nK + 1][0] - sv.line[nK][0]) * nT, sv.line[nK][1] + (sv.line[nK + 1][1] - sv.line[nK][1]) * nT];
  const colTile: Point = [(f.col.i % W) + 0.5, Math.floor(f.col.i / W) + 0.5];
  const colLocal = toLocal(T, colTile);
  // the Red Fall's path from the Red Spring down the gulch's line to its mouth: out of the spring's pool, then a point a
  // tile (a point every few tiles drew it as a ruled polyline up the gulch: it bends as the gulch bends)
  const fallPath: Point[] = [];
  const fallBed: number[] = [];
  for (let s = headAt; s > 0; s -= s === headAt ? 3 : 1) {
    fallPath.push(map(sv.line[s]));
    fallBed.push(floorAt(sv, s));
  }
  fallPath.push(map(sv.line[0]));
  fallBed.push(f.crest);
  // the red stream's head along the backswamp to the new pool, at the old head's offset from the wall's foot
  const red = plan.links.find((l) => l.id === I.red)!;
  const redL = red.path!.map((q) => toLocal(T, q));
  const off = vF(redL[0][0]) - redL[0][1];
  const u0 = uM + RED_FOOT;
  const keep = redL.filter((q, k) => k === redL.length - 1 || q[0] >= u0 + 2);
  const lead: Point[] = [];
  for (let u = u0; u < keep[0][0] - 2; u += 3) lead.push([u, vF(u) - off]);
  const newRed = [...lead, ...keep];
  let low = Infinity;
  const redBed = newRed.map((q) => (low = Math.min(low, levelAt(p0, q[0], q[1]) - 2)));
  if (p0.red.end === "join" && Array.isArray(red.bed)) redBed[redBed.length - 1] = Math.min(redBed[redBed.length - 2] ?? Infinity, red.bed[red.bed.length - 1]);
  // the Dry Fork: the way on from the col, its first point the col, its second the way's tile `FORK_POUR` (where
  // `fork.own` pours), then the way's stair eased (each point the mean of the way's tiles within `FORK_EASE` of it) a
  // point every 2 tiles, ending on its edge (a point every 4 of the stair drew a ruled polyline)
  const wayPts = f.way.map((i) => [(i % W) + 0.5, Math.floor(i / W) + 0.5] as Point);
  const eased = wayPts.map((_, k) => {
    const a = Math.max(0, k - FORK_EASE);
    const b = Math.min(wayPts.length - 1, k + FORK_EASE);
    let x = 0;
    let y = 0;
    for (let j = a; j <= b; j++) [x, y] = [x + wayPts[j][0], y + wayPts[j][1]];
    return [Math.round((100 * x) / (b - a + 1)) / 100, Math.round((100 * y) / (b - a + 1)) / 100] as Point;
  });
  const pourK = Math.min(FORK_POUR, wayPts.length - 1);
  const fork: Point[] = [wayPts[0], ...(pourK > 0 ? [wayPts[pourK]] : []), ...eased.filter((_, k) => k > pourK + 1 && k < eased.length - 1 && k % 2 === 0)];
  const end = wayPts[wayPts.length - 1];
  const edge = edgeAt(W, end);
  const onEdge: Point = edge === "S" ? [end[0], 0] : edge === "N" ? [end[0], W] : edge === "W" ? [0, end[1]] : [W, end[1]];
  if (fork[fork.length - 1] !== end) fork.push(end);
  fork.push(onEdge);
  const forkEnd = Math.max(BED_FLOOR, f.col.level - 1 - FORK_FALL_MIN);
  // the backswamp's levee where the red stream runs nearest the plain below the Red Fall
  let lap: Point = newRed[Math.min(1, newRed.length - 1)];
  let gap = Infinity;
  for (const q of newRed) {
    if (q[0] < uM + 8 || q[0] > p0.red.swampTo - 6) continue;
    const g = q[1] - vB(q[0]);
    if (g < gap) {
      gap = g;
      lap = q;
    }
  }
  const start = plan.frame.start;
  const look = openingCamera({ ...start, orientation: f.orientation }, VISTA_ZOOM).look;
  const ahead = lip.map((q) => (q[0] - start.x) * look[0] + (q[1] - start.y) * look[1]);
  const face = toMap(T, [uM, vF(uM) - 1]).map((c, k) => c - toMap(T, [uM, vF(uM)])[k]);
  const p: PlainNumbers = {
    ...p0,
    walls: { ...p0.walls, far: Math.max(p0.walls.far, f.col.level + 2) },
    gulch: { mouth: Math.round(uM * 100) / 100, h: f.crest - f.swamp, crest: f.crest, width: gw, length: Math.round(len * 100) / 100, head: map(head), narrows: { at: map(nAt), width: f.narrows.width, floor: f.narrows.floor }, rise: floorAt(sv, headAt) - f.crest },
    col: { at: colTile, level: f.col.level, side: colLocal[0] < nAt[0] ? "up" : "down" },
    fork: { path: fork, bed: [f.col.level - 1, Math.min(f.col.level - 1, forkEnd)], edge },
    found: { valley: f.index, changed: f.changed, over: f.col.over, anchor: p0.found?.anchor ?? p0.gulch.mouth, anchorLen: p0.found?.anchorLen ?? p0.gulch.length },
    window: { ...p0.window, framed: f.framed },
  };
  const links = plan.links.map((l): Link => {
    if (l.id === I.redFall) return { ...l, path: fallPath, bed: fallBed, fall: { ...l.fall!, height: f.crest - f.swamp + 1, crest: f.crest, width: lipW, face: headingOf(face[0], face[1]), lip } };
    if (l.id === I.red) return { ...l, path: newRed.map(map), bed: redBed };
    return l;
  });
  const bodies = plan.bodies.map((b): Body => {
    if (b.id === I.redSpring) return { ...b, sill: p.gulch.crest + p.gulch.rise, arms: [[[...map(head), b.arms[0][0][2]]]] };
    if (b.id === I.redPool) return { ...b, sill: f.swamp - 1, arms: [[[...map([uM, vF(uM) - RED_FOOT - 0.5]), b.arms[0][0][2]]]] };
    return b;
  });
  const works = plan.works.map((x): Work => {
    if (x.id === "turn") return { ...x, at: p.gulch.narrows.at, tiles: f.narrows.width + 2 };
    if (x.id === "swampLevee") return { ...x, at: map([lap[0], vB(lap[0])]) };
    return x;
  });
  const sources = plan.sources.map((s) => (s.into === I.redSpring ? { ...s, at: map(head) } : s));
  const regions = plan.regions.map((r) => (r.id === "top" ? { ...r, at: map([uM, (vF(uM) + head[1]) / 2]) } : r));
  const edges = { ...plan.edges };
  if (edges[edge] === "ridge") edges[edge] = "falls away";
  return { ...plan, links, bodies, works, sources, regions, edges, frame: { ...plan.frame, start: { ...start, orientation: f.orientation }, lipAhead: Math.round(((ahead[0] + ahead[1]) / 2) * 100) / 100 }, plain: p } as PremisePlan;
}

// ------------------------------------------------------------------------------------------------- the measures

/** Day 1's bands on stage 2's ground by the game's soil rules (§2), the red water standing where stage 1 put it: of the
 *  valley's floor (the plain, its sloughs and the backswamp, on the map, from the plain's head down, no water) the share
 *  dead (soil contamination over 0), green (moist and not dead) and dry; the floor's share of the map; and `M`, the
 *  green band's mean reach onto the plain past the river's plain-side levee foot (the plain's green tiles on that side
 *  over the plain's length). */
export function plainBands(plan: PremisePlan, w: StageWater, heights: Uint8Array, floor: Uint8Array): { dead: number; dry: number; green: number; floor: number; M: number; tiles: number } {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const N = W * H;
  const r = w.raster;
  const depth = dayOneWater(plan, w, heights);
  const contamination = new Float64Array(N);
  const redIds = new Set<string>([I.red, I.redFall, I.redPool, I.redSpring]);
  for (let i = 0; i < N; i++) {
    if (!(depth[i] > 0)) continue;
    const id = r.channel[i] ? plan.links[r.channel[i] - 1].id : r.lake[i] ? plan.bodies[r.lake[i] - 1].id : r.pool[i] ? plan.links[r.pool[i] - 1].id : "";
    if (redIds.has(id)) contamination[i] = 1;
  }
  // (the river below the red stream's join carries it at red / (river + red), a quarter at most: under the game's 0.5,
  // it poisons no soil)
  const soil = gameSoil(W, H, heights, depth, contamination, []);
  const river = plan.links.find((l) => l.id === I.river)!;
  const foot = leveeFoot(p, T.U, river.half ?? 2.5, riverLocal(T, river.path!));
  let dead = 0;
  let green = 0;
  let dry = 0;
  let side = 0;
  for (let i = 0; i < N; i++) {
    const f = floor[i];
    if (!(f === 1 || f === 2 || f === 4) || depth[i] > 0) continue;
    const [u, v] = toLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    if (u < p.plainFrom) continue;
    if (soil.contamination[i] > 0) dead++;
    else if (soil.moisture[i] > 0) {
      green++;
      const k = Math.max(0, Math.min(foot.length - 1, Math.round(u)));
      if (f !== 2 && Number.isFinite(foot[k]) && v > foot[k]) side++;
    } else dry++;
  }
  const all = dead + green + dry;
  const len = Math.max(1, Math.min(p.plainTo, foot.length - 1) - Math.ceil(p.plainFrom));
  return { dead: dead / all, dry: dry / all, green: green / all, floor: all / N, M: side / len, tiles: all };
}

/** The start's numbers the sheet opens with: its bench and its walkable land on stage 2's ground (`frame.ts`
 *  `checkFrame`), and its distance in tiles to its own water (the Terrace Spring's pool and its brook, stage 1's tiles),
 *  to the plain, to the river and to the red stream's course. */
export function plainStart(plan: PremisePlan, w: StageWater, heights: Uint8Array, floor: Uint8Array, frame: FrameCheck): { bench: number; reach: number; own: number; plain: number; river: number; red: number } {
  const { W, H } = plan;
  const s = frame.start;
  const st: Point = [s.x + 0.5, s.y + 0.5];
  let plainD = Infinity;
  for (let i = 0; i < W * H; i++) if (floor[i] === 1) plainD = Math.min(plainD, dist(st, [(i % W) + 0.5, Math.floor(i / W) + 0.5]));
  const near = (id: string) => {
    const l = plan.links.find((x) => x.id === id);
    return l?.path ? pathDist(st[0], st[1], l.path).d : Infinity;
  };
  // (red water: the red stream, the Red Fall, and the river below the red stream's join, which carries it on)
  let redD = Math.min(near(I.red), near(I.redFall));
  const red = plan.links.find((x) => x.id === I.red);
  const river = plan.links.find((x) => x.id === I.river);
  if (red?.joins?.link === I.river && river?.path) for (const q of walk(river.path, 1)) if (q.s >= red.joins.at - 0.5) redD = Math.min(redD, dist(st, q.p));
  // (its own water: the tiles stage 1 gave the Terrace Spring's pool and the brook)
  const r = w.raster;
  const wellK = plan.bodies.findIndex((b) => b.id === I.well) + 1;
  const brookK = plan.links.findIndex((l) => l.id === I.brook) + 1;
  let own = Infinity;
  for (let i = 0; i < W * H; i++) if ((wellK && r.lake[i] === wellK) || (brookK && r.channel[i] === brookK)) own = Math.min(own, dist(st, [(i % W) + 0.5, Math.floor(i / W) + 0.5]));
  void heights;
  void H;
  return { bench: frame.bench, reach: frame.reach, own: Math.round(own), plain: Math.round(plainD), river: Math.round(near(I.river)), red: Math.round(redD) };
}

/** Where the first frame sees the walls (planning's verdict on round 1, 2026-11-15): the wall's foot within `reach` tiles
 *  of the start (the vista camera's 60); its skyline there the highest ground within `out` tiles out from the foot and
 *  `along` tiles either way down the valley (a wall stands within a few benches of its foot, or it is a slope). */
export const WALL_SEEN = { reach: 60, out: 16, along: 4 } as const;

/** The walls' heights over the plain where the first frame sees them (`WALL_SEEN`): of each wall, every 2 tiles of u
 *  whose foot stands within the reach, its skyline's least and most over the plain's level there, and how many. */
export function wallHeights(plan: PremisePlan, heights: ArrayLike<number>, floor: Uint8Array): Record<"far" | "near", { least: number; most: number; n: number }> {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const st: Point = [plan.frame.start.x + 0.5, plan.frame.start.y + 0.5];
  const U = Math.ceil(T.U) + 1;
  const top = { far: new Float64Array(U).fill(-Infinity), near: new Float64Array(U).fill(-Infinity) };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (floor[i]) continue;
      const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
      const k = Math.round(u);
      if (k < 0 || k >= U) continue;
      const vf = lineAt(p.far, p.step, u);
      const vn = lineAt(p.near, p.step, u);
      if (v > vf && v <= vf + WALL_SEEN.out) top.far[k] = Math.max(top.far[k], heights[i]);
      else if (v < vn && v >= vn - WALL_SEEN.out) top.near[k] = Math.max(top.near[k], heights[i]);
    }
  const out = { far: { least: Infinity, most: -Infinity, n: 0 }, near: { least: Infinity, most: -Infinity, n: 0 } };
  for (const wall of ["far", "near"] as const) {
    const line = wall === "far" ? p.far : p.near;
    for (let u = Math.ceil(p.terrace[0]); u <= Math.min(p.plainTo, U - 1); u += 2) {
      const foot = toMap(T, [u, lineAt(line, p.step, u)]);
      if (!onMap(T, [u, lineAt(line, p.step, u)]) || dist(foot, st) > WALL_SEEN.reach) continue;
      let sky = -Infinity;
      for (let k = Math.max(0, u - WALL_SEEN.along); k <= Math.min(U - 1, u + WALL_SEEN.along); k++) sky = Math.max(sky, top[wall][k]);
      if (!Number.isFinite(sky)) continue;
      const over = sky - levelAt(p, u, (lineAt(p.near, p.step, u) + lineAt(p.far, p.step, u)) / 2);
      const o = out[wall];
      o.least = Math.min(o.least, over);
      o.most = Math.max(o.most, over);
      o.n++;
    }
  }
  return out;
}

/** The Red Fall's drop on the ground (D510: 6 or 7): the gulch's floor at its mouth (the level most tiles on its line
 *  over its first tiles stand at) over the backswamp at its foot (the level most of the backswamp's tiles within 6 of
 *  the mouth's foot stand at, under the crest, the water's tiles and the courses' gaps left out), or null with no gulch. */
export function fallDrop(plan: PremisePlan, heights: ArrayLike<number>, floor: Uint8Array, valleys: readonly SideValley[], w: StageWater): { crest: number; swamp: number; drop: number } | null {
  const p = plainOf(plan);
  const sv = p?.found ? valleys[p.found.valley] : null;
  if (!p || !sv) return null;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const foot = toMap(T, [sv.mouth, lineAt(p.far, p.step, sv.mouth)]);
  const below: number[] = [];
  const lip = new Map<number, number>();
  const gap = new Uint8Array(W * H);
  for (const g of courseGaps(plan, w)) for (const i of g.tiles) gap[i] = 1;
  for (let y = Math.max(0, Math.floor(foot[1] - 12)); y < Math.min(H, foot[1] + 12); y++)
    for (let x = Math.max(0, Math.floor(foot[0] - 12)); x < Math.min(W, foot[0] + 12); x++) {
      const i = y * W + x;
      // (the backswamp's own ground: the Red Pool, its plunge and its outlet stand a level under it)
      if (floor[i] === 2 && !w.raster.lake[i] && !w.raster.pool[i] && !w.raster.channel[i] && !gap[i] && dist([x + 0.5, y + 0.5], foot) <= 6) below.push(heights[i]);
      if (floor[i]) continue;
      const [u, v] = toLocal(T, [x + 0.5, y + 0.5]);
      const q = nearOnLine(sv.line, u, v);
      if (q.s >= 1 && q.s <= 3 && q.d <= 1.2) lip.set(heights[i], (lip.get(heights[i]) ?? 0) + 1);
    }
  const mode = (m: Map<number, number>) => {
    let best = NaN;
    for (const [lv, n] of m) if (!(n <= (m.get(best) ?? 0))) best = lv;
    return best;
  };
  const crest = mode(lip);
  // (and under the crest: the floor's mask takes in the gulch's spurs beside the mouth, and where the red stream's bed
  // took most of the floor there they outnumbered it, step 3, round 3)
  const count = new Map<number, number>();
  for (const v of below) if (v < crest) count.set(v, (count.get(v) ?? 0) + 1);
  const swamp = mode(count);
  if (!Number.isFinite(crest) || !Number.isFinite(swamp)) return null;
  return { crest, swamp, drop: crest - swamp };
}

/** A wall's foot on the ground: along the valley, every `step` tiles of u, the last tile of the valley's floor going
 *  out toward the wall from the floor's middle (the floor's own mask, its warp and all), as map points; NaN where the
 *  foot is off the map. */
export function groundFoot(plan: PremisePlan, floor: Uint8Array, wall: "far" | "near", step = 2): Point[] {
  const p = plainOf(plan)!;
  const T = turnOf(plan, p);
  const { W, H } = plan;
  const out: Point[] = [];
  const from = wall === "far" ? p.terrace[0] : 0;
  const to = wall === "far" ? p.plainTo : T.U;
  for (let u = Math.ceil(from); u <= to; u += step) {
    const vn = lineAt(p.near, p.step, u);
    const vf = lineAt(p.far, p.step, u);
    const mid = (vn + vf) / 2;
    const sg = wall === "far" ? 1 : -1;
    let last: Point | null = null;
    let off = false;
    for (let t = 0; t < (vf - vn) / 2 + 12; t += 0.5) {
      const q = toMap(T, [u, mid + sg * t]);
      const x = Math.floor(q[0]);
      const y = Math.floor(q[1]);
      if (x < 0 || y < 0 || x >= W || y >= H) {
        off = true;
        break;
      }
      if (!floor[y * W + x]) break;
      last = q;
    }
    out.push(last && !off ? last : [NaN, NaN]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- the land's invariants

/** What the land's invariants read: the plan as re-sited, its water (stage 1), stage 2's ground and the relief's floor
 *  mask and side valleys. */
export interface PlainLandContext {
  spec: MapSpec;
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
  relief: PlainRelief;
}

export interface PlainLandInvariant {
  id: string;
  test(ctx: PlainLandContext): InvariantResult;
}

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The gulch's side valley on the land, or null. */
function gulchValley(ctx: PlainLandContext): SideValley | null {
  const p = plainOf(ctx.plan);
  return p?.found ? (ctx.relief.valleys[p.found.valley] ?? null) : null;
}

/** `gulch.found` (§3): the gulch is a side valley of the far wall the search found (its mouth where the plan's gulch
 *  stands, inside the window the vista frame shows), its mouth 3 to 5 over the backswamp and a narrows 3 wide or fewer
 *  in its lower half on the ground, the mend within its budget (4 % of the map's tiles). */
/** The gulch's narrows where the plan names it (the turn's dam stands there): how far along the gulch, its floor's
 *  width on the ground, its floor's level. */
function plannedNarrows(ctx: PlainLandContext, sv: SideValley): { s: number; width: number; floor: number } {
  const p = plainOf(ctx.plan)!;
  const T = turnOf(ctx.plan, p);
  const [u, v] = toLocal(T, p.gulch.narrows.at);
  const s = Math.round(nearOnLine(sv.line, u, v).s * 2) / 2;
  return { s, width: floorWidth(T, ctx.plan.W, ctx.plan.H, ctx.heights, sv, s), floor: p.gulch.narrows.floor };
}

const gulchFoundCheck: PlainLandInvariant = {
  id: "gulch.found",
  test(ctx) {
    const p = plainOf(ctx.plan);
    const sv = gulchValley(ctx);
    if (!p?.found || !sv) return fail("No side valley of the far wall was found for the gulch");
    if (Math.abs(sv.mouth - p.gulch.mouth) > 0.01 || sv.wall !== "far") return fail("The gulch is not the side valley the search found");
    if (p.found.changed > MEND.share * ctx.plan.W * ctx.plan.H) return fail(`The mend changed ${p.found.changed} tiles (${Math.floor(MEND.share * ctx.plan.W * ctx.plan.H)} at most)`);
    const n = plannedNarrows(ctx, sv);
    if (n.width > GULCH.narrows[1]) return fail(`The gulch's narrows is ${n.width} wide on the ground (${GULCH.narrows[1]} or fewer)`);
    const hang = floorAt(sv, 0) - sv.foot;
    if (hang < GULCH.h[0] || hang > GULCH.h[1]) return fail(`The gulch's mouth hangs ${hang} over the backswamp (${GULCH.h.join(" to ")})`);
    return OK;
  },
};

/** `col.over` (§3, §7): the gulch's lowest way out but its mouth, with the narrows shut, stands 2 or more over the
 *  narrows' floor, at the col the plan names. */
const colOver: PlainLandInvariant = {
  id: "col.over",
  test(ctx) {
    const p = plainOf(ctx.plan);
    const sv = gulchValley(ctx);
    if (!p || !sv) return fail("No gulch to read a col from");
    const n = plannedNarrows(ctx, sv);
    const way = lowestWayOut(ctx.plan, ctx.relief.floor, ctx.heights, sv, n.s);
    if (!way) return fail("No water stands in the gulch behind its narrows");
    if (way.level < n.floor + GULCH.colOver) return fail(`The gulch's lowest way out but its mouth stands ${way.level - n.floor} over its narrows (${GULCH.colOver} or more)`);
    if (way.out !== "edge") return fail("The gulch's lowest way out but its mouth runs onto the valley's floor");
    if (way.level !== p.col.level) return fail(`The col stands at ${way.level} on the ground, the plan says ${p.col.level}`);
    return OK;
  },
};

/** `fork.own` (§3, §7): water over the col (`flowThrough` on stage 2's ground, poured on the Dry Fork's first point
 *  past the col: what spills over it once the turn's dam stands, the gulch's side shut) runs down the Dry Fork to a map
 *  edge and onto no tile of the valley's floor. */
const forkOwn: PlainLandInvariant = {
  id: "fork.own",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No col");
    const { W, H } = ctx.plan;
    const q = p.fork.path[Math.min(1, p.fork.path.length - 1)];
    const r = pourRuns(W, H, ctx.heights, ctx.relief.floor, Math.min(H - 1, Math.floor(q[1])) * W + Math.min(W - 1, Math.floor(q[0])));
    if (r.floor >= 0) return fail(`Water poured at the col reaches the valley's floor at ${r.floor % W}, ${Math.floor(r.floor / W)}`);
    return r.edge ? OK : fail("Water poured at the col reaches no map edge");
  },
};

/** The longest straight stretch of a levee's bank allowed (§7 `levee.wanders`), tiles. */
export const BANK_STRAIGHT = 8;

/** `levee.wanders` (§1, §7): the crest holds no height for over a fifth of the river's length on the plain (the plan's
 *  crest runs, `plain.levels` reads them by number), and no bank's outer foot on the ground runs straight along the
 *  grid for more than 8 tiles (`bankRun`, the shared look check's straight edge). */
const leveeWanders: PlainLandInvariant = {
  id: "levee.wanders",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No levees");
    const len = p.levee.to - p.levee.from;
    for (const side of ["plain", "near"] as const) {
      let best = 0;
      let a = 0;
      const runs = p.levee[side];
      for (let k = 1; k <= runs.length; k++)
        if (k === runs.length || runs[k].over !== runs[a].over) {
          best = Math.max(best, runs[k - 1].to - runs[a].from);
          a = k;
        }
      if (best > 0.2 * len + 0.01) return fail(`The ${side} levee's crest holds one height for ${best.toFixed(0)} tiles (a fifth of ${len.toFixed(0)} at most)`);
    }
    const { W, H } = ctx.plan;
    const r = ctx.water.raster;
    const beside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) beside[i] = ctx.relief.floor[i] && !r.channel[i] && !r.lake[i] && !r.pool[i] ? 1 : 0;
    const run = bankRun(W, H, ctx.heights, ctx.relief.bank, beside);
    if (run > BANK_STRAIGHT) return fail(`A levee's bank runs straight along the grid for ${run} tiles (${BANK_STRAIGHT} at most)`);
    return OK;
  },
};

/** `plain.bands` (§2, §7): day 1's bands of the floor by the soil's reach on stage 2's ground: dead 8 to 25 %, dry 30 %
 *  or more. */
const plainBandsCheck: PlainLandInvariant = {
  id: "plain.bands",
  test(ctx) {
    const b = plainBands(ctx.plan, ctx.water, ctx.heights, ctx.relief.floor);
    const pct = (v: number) => `${Math.round(100 * v)} %`;
    if (b.dead < DEAD_SHARE[0] || b.dead > DEAD_SHARE[1]) return fail(`Day 1's dead band is ${pct(b.dead)} of the floor (${DEAD_SHARE.map(pct).join(" to ")})`);
    if (b.dry < DRY_LEAST) return fail(`Day 1's dry band is ${pct(b.dry)} of the floor (${pct(DRY_LEAST)} or more)`);
    return OK;
  },
};

/** `wall.wanders` on the ground (§1, §7): no wall's foot on stage 2's ground stays within 2 tiles of one straight line
 *  for longer than 1.2 `P`. */
const wallWandersGround: PlainLandInvariant = {
  id: "wall.wanders",
  test(ctx) {
    const p = plainOf(ctx.plan);
    if (!p) return fail("No walls");
    for (const wall of ["near", "far"] as const) {
      const run = longestStraight(groundFoot(ctx.plan, ctx.relief.floor, wall), WALL.near);
      if (run > WALL.longest * p.P + 0.01) return fail(`The ${wall} wall's foot runs within ${WALL.near} tiles of one straight line for ${run.toFixed(0)} tiles on the ground (${(WALL.longest * p.P).toFixed(0)} at most: drawn with a ruler)`);
    }
    return OK;
  },
};

/** `wall.height` (planning's verdict on round 1 of the land, 2026-11-15): wherever the first frame sees them (`WALL_SEEN`),
 *  the far wall stands `FAR_OVER` (8) or more over the plain, and the near wall `NEAR_OVER`'s least (4) or more. */
const wallHeight: PlainLandInvariant = {
  id: "wall.height",
  test(ctx) {
    const w = wallHeights(ctx.plan, ctx.heights, ctx.relief.floor);
    if (!w.far.n) return fail("The first frame sees no far wall");
    if (w.far.least < FAR_OVER) return fail(`The far wall stands ${w.far.least} over the plain where the first frame sees it (${FAR_OVER} or more)`);
    if (w.near.n && w.near.least < NEAR_OVER[0]) return fail(`The near wall stands ${w.near.least} over the plain where the first frame sees it (${NEAR_OVER[0]} or more)`);
    return OK;
  },
};

/** `fall.drop` (D510, §4): the Red Fall drops 6 or 7 levels on the ground, from the gulch's hanging mouth to the
 *  backswamp at its foot. */
const fallDropCheck: PlainLandInvariant = {
  id: "fall.drop",
  test(ctx) {
    const f = fallDrop(ctx.plan, ctx.heights, ctx.relief.floor, ctx.relief.valleys, ctx.water);
    if (!f) return fail("No gulch's mouth over the backswamp to read the Red Fall from");
    if (f.drop < GULCH.h[0] || f.drop > GULCH.h[1]) return fail(`The Red Fall drops ${f.drop} on the ground, from ${f.crest} to the backswamp at ${f.swamp} (${GULCH.h.join(" to ")})`);
    return OK;
  },
};

/** `terrain.ruled_land` (PLAN §11.2, the shared look check) on stage 2's ground with stage 1's water; and each wall's
 *  side valleys never a comb (`combOf`). */
const ruledCheck: PlainLandInvariant = {
  id: "terrain.ruled_land",
  test(ctx) {
    const r = ctx.water.raster;
    const wet = new Uint8Array(ctx.plan.W * ctx.plan.H);
    for (let i = 0; i < wet.length; i++) {
      const l = r.channel[i] ? ctx.plan.links[r.channel[i] - 1] : null;
      if (r.lake[i] || r.pool[i] || r.crest[i] || (l && l.wet)) wet[i] = 1;
    }
    const m = ruledLand(ctx.heights, wet, ctx.plan.W, ctx.plan.H);
    for (const wall of ["far", "near"] as const) {
      const c = combOf(ctx.plan, ctx.relief.valleys, wall);
      if (c.why) return fail(`The ${wall} wall's side valleys are a comb: ${c.why}`);
    }
    return m.ok ? OK : fail(`Ruled land: ${(100 * m.straight).toFixed(1)} % straight, ${(100 * m.bands).toFixed(1)} % in bands, ${m.corners.toFixed(1)} corners per 1,000`);
  },
};

export const PLAIN_LAND_CHECKS: PlainLandInvariant[] = [gulchFoundCheck, colOver, forkOwn, leveeWanders, plainBandsCheck, wallWandersGround, wallHeight, fallDropCheck, ruledCheck];

export function plainLandFailures(ctx: PlainLandContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of PLAIN_LAND_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- the stage

/** A poisoned floodplain's land (stage 2): the plan as the search re-sited it, its water (stage 1), the ground, the
 *  relief's floor and side valleys, the gulch found, the start as stage 3 judges it on this ground, the land
 *  invariants it fails, and the stage's time (ms) by part. */
export interface PlainLand {
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
  relief: PlainRelief;
  found: GulchFound;
  frame: FrameCheck;
  landFails: { id: string; reason: string }[];
  notes: string[];
  attempt: number;
  failed: string[];
  ms: { water: number; upland: number; relief: number; search: number; mend: number; checks: number; total: number };
}

/** The land for one plan (the stage proper): the skeleton's water and the theme's upland, the relief, the search, the
 *  plan re-sited, its water again, the relief again on it and the mend; the terrace grown to hold the start's bench of
 *  `bench` level tiles (`plainRelief`). Or why the search found no gulch. */
export function plainLandOf(spec: MapSpec, plan: PremisePlan, style: ReliefStyle, bench = 0): Omit<PlainLand, "frame" | "landFails" | "attempt" | "failed"> | { reason: string } {
  const t0 = performance.now();
  const sk = plainSkeleton(plan);
  const w1 = waterByNumber(sk);
  const t1 = performance.now();
  const upland = reliefBetween({ ...sk, ridges: [] }, w1, style);
  const t2 = performance.now();
  const rl1 = plainRelief(sk, w1, upland, { bench });
  const t3 = performance.now();
  // (a gulch the skeleton's land holds is judged again in its own land: the plan re-sited to it, its red water drawn,
  // the relief made again round it; there it is measured afresh and the plan re-sited to that measure)
  let tw = 0;
  let tr = 0;
  const own = (f: GulchFound) => {
    const plan2 = resiteGulch(plan, f);
    const pf = failing(poisonedPlain.invariants, "plan", { spec, plan: plan2 });
    if (pf.length) return { why: `re-sited, ${pf[0].id}: ${pf[0].reason}` };
    const a = performance.now();
    const water = waterByNumber(plan2);
    const b = performance.now();
    const rl = plainRelief(plan2, water, upland, { bench });
    tw += b - a;
    tr += performance.now() - b;
    const f2 = judgeGulch(plan2, rl, rl.heights, f.index);
    if ("why" in f2) return { why: `in its own land, ${f2.why}` };
    const plan3 = resiteGulch(plan, f2);
    // (what the relief reads of the re-siting, the same for both measures: else the land is the plan's no longer)
    const reads = (q: PremisePlan) => JSON.stringify([q.links, q.bodies, q.sources, q.edges, plainOf(q)!.walls, plainOf(q)!.found?.valley]);
    if (reads(plan3) !== reads(plan2)) return { why: "in its own land, its col or Dry Fork moves the red water or the walls" };
    const pf3 = failing(poisonedPlain.invariants, "plan", { spec, plan: plan3 });
    if (pf3.length) return { why: `re-sited, ${pf3[0].id}: ${pf3[0].reason}` };
    return { f: f2, plan: plan3, water, rl };
  };
  const got = searchGulch(sk, rl1, own);
  const t4 = performance.now();
  if ("why" in got) return { reason: `gulch.found: ${got.why}` };
  const { f: found, plan: plan2, water, rl } = got;
  const heights = rl.heights;
  const changed = mendGulch(plan2, heights, found, rl.floor);
  // (stage 1's ground as it is after the mend)
  for (let i = 0; i < heights.length; i++) if (water.raster.fixed[i]) heights[i] = water.raster.heights[i];
  const fv = plainOf(plan2)?.found;
  if (fv) bankGulch(plan2, water, heights, rl.valleys[fv.valley]);
  const t7 = performance.now();
  const notes = [`The gulch found at ${Math.round(found.valley.mouth)} tiles down the valley; the mend changed ${changed} tiles`];
  const ms = { water: Math.round(t1 - t0 + tw), upland: Math.round(t2 - t1), relief: Math.round(t3 - t2 + tr), search: Math.round(t4 - t3 - tw - tr), mend: Math.round(t7 - t4), checks: 0, total: Math.round(t7 - t0) };
  return { plan: plan2, water, heights, relief: { ...rl, heights }, found: { ...found, changed }, notes, ms };
}

/** One attempt's land (`plainLand`'s loop, one turn of it): the plan drawn for `attempt`, its land, the land
 *  invariants and stage 3's start judged on it, `held` when all pass; or why no land was made (no plan, no gulch). */
export function plainAttempt(spec: MapSpec, attempt: number, theme: StyleTheme = "riverValley", failed: string[] = []): (PlainLand & { held: boolean }) | { reason: string } {
  const rules = rulesFor(spec);
  const ta = performance.now();
  const plan = poisonedPlain.draw(spec, attempt);
  if ("reason" in plan) return { reason: plan.reason };
  const style = premiseStyle(theme, spec, attempt);
  const land = plainLandOf(spec, plan, style.relief, Math.ceil(FLOOR_MARGIN * rules.levelLand));
  if ("reason" in land) return land;
  const t0 = performance.now();
  const landFails = plainLandFailures({ spec, plan: land.plan, water: land.water, heights: land.heights, relief: land.relief });
  const frame = checkFrame(land.plan, land.water, land.heights, { bench: rules.levelLand, moist: rules.farmland + rules.forester, reach: rules.reachMin, zoom: VISTA_ZOOM, shallow: false });
  land.ms.checks = Math.round(performance.now() - t0);
  // (the attempt's whole time: the plan's drawing, the land and its checks)
  land.ms.total = Math.round(performance.now() - ta);
  return { ...land, frame, landFails, attempt, failed, held: !landFails.length && !frame.reason };
}

/** The poisoned floodplain's land for a spec in a theme's style (River Valley by default): the first plan whose land
 *  holds (the search finds a gulch, the land invariants pass and stage 3 finds the start), within `PLAN_TRIES`; or the
 *  last land with its failures, or why none was made. `failed` lists each refused plan's reason. */
export function plainLand(spec: MapSpec, theme: StyleTheme = "riverValley"): (PlainLand & { held: boolean }) | { reason: string; failed?: string[] } {
  const why = poisonedPlain.eligible(spec);
  if (why) return { reason: why };
  const failed: string[] = [];
  let last: (PlainLand & { held: boolean }) | null = null;
  for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
    const out = plainAttempt(spec, attempt, theme, failed);
    if ("reason" in out) {
      failed.push(out.reason);
      continue;
    }
    last = out;
    if (out.held) return out;
    failed.push(out.landFails.length ? `${out.landFails[0].id}: ${out.landFails[0].reason}` : `frame.start: ${out.frame.reason}`);
  }
  return last ?? { reason: `No poisoned floodplain's land held in ${failed.length} plans (the last: ${failed[failed.length - 1] ?? ""})`, failed };
}
