// The wall with one gate (docs/PREMISES.md §5.1): The Gate (tools/showcase/the-gate.ts), generalised. "A mountain wall
// runs across the map, a green valley on your side and a dry basin beyond; the river rises in a cleft of the wall and
// pours over the Veil into the lake at your door. Carry the water through the one gate or round by the pass, and
// before the first badtide shut the pool by your door."
//
// Stage 0 only (the Gate's first PR): `eligible`, `draw` (the plan, by arithmetic, from the stream `premise.plan`)
// and the `plan` halves of §5.1's invariants with §1.4's checks. Not offered to players yet: it is not in
// `spec/mapspec.ts` `PREMISE_IDS`, so not in `PREMISE_CHOICES`, `PREMISES` or Any; `premises/dev.ts` lists it for the
// tools and tests until it makes a whole map. Playability (the start's room, wood and reach) is the shared gate's, not
// this premise's (planning, 2026-11-11): no floor of its own here.
//
// The plan is laid out in a local frame, then turned onto the map: u along the wall, v across it, the valley at low v
// (toward the opening camera), the basin at high v. The start's turn is the layout's turn, so the camera always looks
// within 35° of square at the wall's valley face (`wall.camera`); a mirror flips u. Unmirrored, the Pass and the drain
// bay lie at low u, the Still Pool and the Gate at high u.

import { frameAt, openingCamera } from "../../analysis/opening";
import { ORIENTATIONS } from "../../format/footprints";
import { BED_FLOOR } from "../../land/genome";
import { cos, sin } from "../../math/portable";
import type { Rng } from "../../math/rng";
import { hazardDays } from "../../sim/weather";
import { MAX_SILL_WIDTH, sillWidthFor } from "../../sim/sill";
import { EDITOR_LEVEL, type MapSpec } from "../../spec/mapspec";
import { premiseStream } from "../draw";
import { lipInFrame } from "../frame";
import { holdDeep } from "../levels";
import { seedOf } from "../raster/field";
import { fbm } from "../../math/noise";
import { straightShores } from "../gateShore";
import { bodyDist, bodyGap, dist, headingOf, pathDist, pathLength, pointAt, segDist, spineDist } from "../geom";
import { fail, nameOf, OK, PLAN_CHECKS, reach } from "../planChecks";
import { GATE_WATER_CHECKS } from "../gateWater";
import type { Body, Edge, Exit, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, Source, Spine, Work } from "../types";

// ------------------------------------------------------------------------------------------------- the ranges

/** The premise's id. Not a `PremiseId` yet: it joins `PREMISE_IDS` when it makes a whole map. */
export const GATE_ID = "wallGate";
/** Square maps, 128² to 256² (as the lake stair; ruling 7). */
export const GATE_SIDE = [128, 256] as const;
/** The valley lake's sill: four over the floor, so the Gate's slot floor (two under it) still falls a level or more to
 *  the rim's notch on `BED_FLOOR` (D325). The Gate's round 8 stood it at 7, its bed at 1: here the bed stops at 3. */
export const LAKE_SILL = BED_FLOOR + 4;
/** The Veil: a fall of 6 or 7 from the cleft's lip into the lake's trench. */
export const VEIL = [6, 7] as const;
/** The wall's crest: 8 or more over the valley's meadow (the sill + 1) and 9 or more over the basin's floor (at most the
 *  sill + 1), so 17 at the least; 19 at the most, under the highest ground. */
export const CREST = [17, 19] as const;
export const VALLEY_FACE = 8;
export const BASIN_FACE = 9;
/** The wall's face: runs along the grid of 14 to 22 tiles joined by jogs of 4 to 6. */
export const RUN = [14, 22] as const;
export const JOG = [4, 6] as const;
/** The crest's thickness: 4 to 6; the Veil's bastion 11: the cleft's pool stands behind the Veil's mouth, which stage
 *  1 widens to the lip over 5 rows (`raster/falls.ts` `VALLEY_BACK`), with rock behind it (at 10, its guard stood past the wall's back). The round's 7 had
 *  the pool against the lip. */
export const THICK = [4, 6] as const;
export const BASTION_THICK = 11;
/** The cleft's pool: its middle row behind the lip, its radius. */
const CLEFT = { back: 7.6, r: 1.8 } as const;
/** The bastion's run is longer than the rest: the lip, the cleft and the Still Pool's inlet stand before it. */
export const BASTION_RUN = [18, 24] as const;
/** The Veil's lip, 9 to 12 tiles along the bastion's face. */
export const LIP = [9, 12] as const;
/** The Gate's slot, 5 to 7 wide, from 8 tiles of bench before the face; its bar a level over the lake's sill, 3 tiles
 *  long at the shore; two rows of Blockages behind. */
export const SLOT = [5, 7] as const;
export const SLOT_BENCH = 8;
export const BAR_LENGTH = 3;
/** The leat's row of Blockages, this far along it: behind its bar, two tiles past the cleft. */
export const LEAT_ROW = 3.5;
/** The basin's rim: 12 to 14, 8 tiles deep along its far edges; the one notch 11 wide (9 to 13 between the rim's ends):
 *  the Gate Bed (5 to 7 wide), the Pass Bed and their wadi strips leave by it (round 8's 5 passed the Gate Bed alone,
 *  the Pass Bed joining it before the rim). */
export const RIM = [12, 14] as const;
export const RIM_DEPTH = 8;
export const NOTCH = 11;
/** The Still Pool (§5.1's neck): 12 tiles or more, its inlet 3 wide at most and 3.5 long at most (a kettle's neck,
 *  §4.5), shut by a levee of 3. */
export const NECK = { least: 12, wide: 3, long: 3.5, levee: 3 } as const;
/** The springs in the cleft: three, 9.5 on normal River flow (the round's 9 to 10); the valley's three brooks each
 *  about a quarter of that (the round's 2.5 to 3, a little less: the whole valley leaves over the Low River's lip,
 *  16 at most, and at the round's the lake stood 0.6 over its sill at 256²). */
export const GATE_FLOW = { trickle: 7, normal: 9.5, strong: 12, lush: 14 } as const;
export const POOL_SOURCES = 3;
export const BROOK_SPRING = [2.0, 2.6] as const;
/** The lake's meadow by Buildable land (the round's 18 on normal). */
export const GATE_MEADOW = { tight: 15, normal: 18, generous: 21 } as const;
/** The Low River's gorge: 5 wide, 6 at lush, through a spur ridge `SPUR` thick and the megadam's level + 3 high. */
export const GORGE = { normal: 5, lush: 6 } as const;
export const SPUR_HALF = 4.5;
/** The megadam holds the valley `MEGADAM_RISE` over its lake's sill (the round's 9 over 7). */
export const MEGADAM_RISE = 2;
/** The start's bench stage 0 builds for (D515, planning 2026-11-11): 1.1 × the shared gate's floor for the Start area
 *  (`validate/playability.ts` `START_FLOORS`' 480, 640 and 980, milestone's #1015; read from there once it is on dev).
 *  The gate holds no floor of its own: this is where it aims, the shared checks judge. */
const BENCH_FLOOR = { small: 480, normal: 640, large: 980 } as const;
const BENCH_OVER = 1.1;
/** The start's walk before any slope stands is its level pocket, and the shared stage 3 (#1015) reads it against three
 *  quarters of the walkable floor (1,300): the pocket holds that too. */
const WALK_READ = 0.75 * 1300;
/** The rows the lake stands off the wall's foot at the least (the trench, the start's 5 × 5 and the rows round it). */
const BENCH_ROWS = 9;
/** The valley's room under the lake (the brooks' springs and their runs), a share of the side. */
const UNDER_LAKE = 0.22;

/** What each rung buys (§4.2: a floor, the most twice it), per tile of the map's side: round 8's gains at 192² (the Gate
 *  opened 1,318, the leat 1,839, the whole shares 1,534 and 1,663: 3.6 %, 5.0 %, 4.2 % and 4.5 %) at two thirds, over
 *  192. A rung greens along its bed, whose length grows with the side, not the map's area: measured on the ladder (19
 *  seeds over three sizes), the Gate opened 3.1 % of the map at 192² and 2.4 % at 256². The megadam's is water
 *  (tile-levels): it raises the lake and its meadow, which grow with the side too (1,828 to 3,741 measured). */
const GIVES = { gateOpen: (2 / 3) * 1318 / 192, gateWhole: (2 / 3) * 1534 / 192, leatOpen: (2 / 3) * 1839 / 192, leatWhole: (2 / 3) * 1663 / 192, megadam: 12 } as const;
/** The rungs whose gain is their share of the river down a bed already wet: by number none (`gateWorks.ts`
 *  `SHARE_RUNGS`), so their floor is 0, the round's share their most. */
const SHARE = new Set(["gateWhole", "leatWhole"]);

/** The lake's main arm swings across the valley this far either way (tiles), and its bays: two or three. */
const LAKE_SWAY = 6;
/** The bench's side of the lake: a line swinging this far either way of its mean, over this wavelength. */
const BENCH_SHORE = 1.6;
const BENCH_WAVE = [8, 11] as const;
const BAYS = [2, 3] as const;
/** How far a bay's end reaches past the broad it leaves, at the least (`lake.shore` reads 4 past the main arm). */
const BAY_PAST = 8;
/** The far rim's widest (tiles): the Pass Bed runs along the far side clear of it. */
export const RIM_MOST = 14;
/** How far the notch stands from the basin's far corners at the least (the rim's buttress, `gateLand.ts` `RIM_CORNER`). */
const RIM_CORNER_CLEAR = 31;
/** Meanders (planning, 2026-11-11: "drawn with a ruler"): amplitude and wavelength in tiles, for the basin's dry beds
 *  and the valley's brooks; no straight run over 8. */
export const BED_MEANDER = { amp: [2.5, 4], wave: [14, 20], amp2: [1.2, 2], wave2: [6, 9] } as const;
export const BROOK_MEANDER = { amp: [2, 3.5], wave: [12, 18], amp2: [1, 1.8], wave2: [5, 8] } as const;
/** The beds' last legs, side by side up to the notch: a tighter, smaller swing, so the two never meet but there. */
const NOTCH_MEANDER = { amp: [1, 1.6], wave: [8, 11], amp2: [0.6, 1], wave2: [4, 6] } as const;
/** A meander reaches its full swing this many tiles from either end. */
const MEANDER_IN = 3;

/** A meandering course from `a` to `b`: a point every 1.2 tiles of the line (the swing stretches the course), swung across the line by a long sine and a short one (a
 *  single sine's half-waves read as straight diagonals) and a little jitter, the swing tapering to nothing at both ends so the course leaves and meets its waters
 *  where the plan says. */
type Meander = { amp: readonly [number, number]; wave: readonly [number, number]; amp2: readonly [number, number]; wave2: readonly [number, number] };
/** A meander drawn until no stretch of it runs straight for more than `MEANDER_STRAIGHT` (at most 8 draws; a long and a
 *  short swing can cancel on a flank). */
function meander(rng: Rng, a: Point, b: Point, m: Meander): Point[] {
  // (a long course in pieces of at most `MEANDER_PIECE`, each held to the rule: the longer the course, the likelier a
  // straight flank somewhere along it)
  const L = dist(a, b);
  const pieces = Math.max(1, Math.ceil(L / MEANDER_PIECE));
  const out: Point[] = [a];
  let from = a;
  for (let k = 1; k <= pieces; k++) {
    const to: Point = k === pieces ? b : [a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces];
    let piece = meanderOnce(rng, from, to, m);
    for (let q = 0; q < 7 && longestStraight(piece) > MEANDER_STRAIGHT - 0.5; q++) piece = meanderOnce(rng, from, to, m);
    out.push(...piece.slice(1));
    from = to;
  }
  unstraighten(out);
  return out;
}
const MEANDER_PIECE = 24;

/** Bends any stretch of `path` between `from` and `to` (kept where they are) that runs straight for more than
 *  `MEANDER_STRAIGHT - 0.5`: its middle point and its neighbours step aside from its chord, the side alternating. Two
 *  meanders meet on their chords where their swings taper, and a long and a short swing can cancel on a flank; this
 *  is the last word, so the rule holds on every course. */
function unstraighten(path: Point[], from = 0, to = path.length - 1): void {
  let side = 1;
  const moved = new Set<number>();
  for (let round = 0; round < 60; round++) {
    let best = 0;
    let bi = -1;
    let bj = -1;
    for (let i = from; i < to; i++)
      for (let j = i + 1; j <= to; j++) {
        const a = path[i];
        const b = path[j];
        let straight = true;
        for (let k = i + 1; k < j && straight; k++) if (segDist(path[k][0], path[k][1], a[0], a[1], b[0], b[1]).d > 0.75) straight = false;
        if (!straight) break;
        const d = dist(a, b);
        if (d > best) [best, bi, bj] = [d, i, j];
      }
    if (best <= MEANDER_STRAIGHT - 0.5) return;
    const a = path[bi];
    const b = path[bj];
    const nx = -(b[1] - a[1]) / best;
    const ny = (b[0] - a[0]) / best;
    // (each point steps aside once at most, the one nearest the stretch's middle not yet moved)
    const mid = (bi + bj) / 2;
    let k = -1;
    for (let q = bi + 1; q < bj; q++) if (q > from && q < to && !moved.has(q) && (k < 0 || Math.abs(q - mid) < Math.abs(k - mid))) k = q;
    if (k < 0) return;
    moved.add(k);
    path[k] = rp([path[k][0] + nx * 1.3 * side, path[k][1] + ny * 1.3 * side]);
    side = -side;
  }
}

/** A lake's arm along a meander from a to b: a point every `ARM_STEP` tiles, its radius `rOf(t)` at the share t of
 *  its length. A straight arm of one width, or of two widths joined by a straight flank, read as a canal. */
function wanderArm(rng: Rng, a: Point, b: Point, m: Meander, rOf: (t: number) => number): Spine {
  const path = meander(rng, a, b, m);
  const L = pathLength(path);
  const n = Math.max(2, Math.round(L / ARM_STEP));
  const out: Spine = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const { p } = pointAt(path, t * L);
    // (a little radius jitter point to point: a smooth swell's crest lays a flat run of shore on the grid)
    out.push([r2(p[0]), r2(p[1]), r2(Math.max(1.2, rOf(t) + (i === 0 || i === n ? 0 : rng.range(-ARM_JITTER, ARM_JITTER))))]);
  }
  return out;
}
const ARM_STEP = 2;
/** The shore's points: their radius, and the gap between them along an arm. */
const NICK_R = [1.4, 2.2] as const;
const NICK_GAP = [3, 4.5] as const;
const ARM_JITTER = 0.8;

function meanderOnce(rng: Rng, a: Point, b: Point, m: Meander): Point[] {
  const L = dist(a, b);
  if (L < 4) return [a, b];
  const ux = (b[0] - a[0]) / L;
  const uy = (b[1] - a[1]) / L;
  const amp = rng.range(m.amp[0], m.amp[1]);
  const wave = rng.range(m.wave[0], m.wave[1]);
  const ph = rng.range(0, 6.283);
  const amp2 = rng.range(m.amp2[0], m.amp2[1]);
  const wave2 = rng.range(m.wave2[0], m.wave2[1]);
  const ph2 = rng.range(0, 6.283);
  const n = Math.max(2, Math.round(L / 1.2));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (k * L) / n;
    const taper = Math.min(1, t / MEANDER_IN, (L - t) / MEANDER_IN);
    const off = k === 0 || k === n ? 0 : taper * (amp * sin(ph + (6.283 * t) / wave) + amp2 * sin(ph2 + (6.283 * t) / wave2) + rng.range(-0.4, 0.4));
    out.push([r2(a[0] + ux * t - uy * off), r2(a[1] + uy * t + ux * off)]);
  }
  return out;
}

/** Layouts an attempt draws before it gives up. */
const LAYOUT_TRIES = 24;

// ------------------------------------------------------------------------------------------------- the plan's own numbers

export interface GateRun {
  /** The run's valley face, end to end, map coordinates (a line along the grid). */
  from: Point;
  to: Point;
  /** The crest's thickness behind it. */
  thick: number;
}

/** The wall with one gate's own numbers (as `StairPlan` is the lake stair's), kept so the invariants read them. */
export interface GateNumbers {
  /** The layout's turn (the start's orientation, 0 to 3) and whether it was mirrored. */
  turn: number;
  mirror: boolean;
  /** Levels: the lake's sill, the Veil's drop (`drop`), the wall's crest, the Pass, the megadam's water, the rim, the basin's
   *  floor (lowest and highest). */
  sill: number;
  drop: number;
  crest: number;
  pass: number;
  megadam: number;
  rim: number;
  floor: [number, number];
  /** The wall's valley face as runs along the grid, edge to edge; `bastion` is the run the cleft is cut into. */
  runs: GateRun[];
  bastion: number;
  /** Ids: the lake, the springs' pool (the cleft), the Still Pool and its inlet, the Veil, the Gate, the leat, the Low
   *  River; the ridges (the wall, the spur the gorge cuts, the rim's two pieces). */
  lake: string;
  pool: string;
  kettle: string;
  inlet: string;
  veil: string;
  gate: string;
  leat: string;
  low: string;
  wall: string;
  spur: string;
  rims: string[];
  /** The Gate: the slot's width, the index of the gate's path point where the slot ends (the Gate Bed begins); its bar's
   *  level and length from the shore. */
  slot: { width: number; to: number };
  bar: { level: number; length: number };
  /** The leat: the bar at its head (two over its bed), and the index of its path point at the Pass (the Pass Bed
   *  begins after it); the Pass's span along the crest. */
  leatBar: number;
  passAt: number;
  passSpan: [Point, Point];
  /** The rim's notch on the far edge, its middle and width. */
  notch: { at: Point; width: number };
  /** Which side the Low River leaves by: the Pass's or the Gate's. */
  lowSide: "pass" | "gate";
}

/** A plan of this premise: a `PremisePlan` with its numbers (`premise` is the id above, outside `PremiseId` until it is
 *  offered). */
export type GatePlan = Omit<PremisePlan, "premise"> & { premise: typeof GATE_ID; gate: GateNumbers };

/** The gate's numbers of a plan, or null. */
export const gateOf = (plan: PremisePlan): GateNumbers | null => (plan as unknown as Partial<GatePlan>).gate ?? null;

// ------------------------------------------------------------------------------------------------- eligibility

/** The springs' strength, the lake's meadow and the gorge's width for a spec. */
const flowOf = (spec: MapSpec) => GATE_FLOW[spec.settings.water.riverFlow];
const meadowOf = (spec: MapSpec) => GATE_MEADOW[spec.settings.terrain.buildableLand];
const gorgeOf = (spec: MapSpec) => (spec.settings.water.riverFlow === "lush" ? GORGE.lush : GORGE.normal);
/** The water's ceiling (as the lake stair's `stairTop`: never over the in-game editor's 16). */
const gateTop = (spec: MapSpec) => Math.min(spec.settings.terrain.highestTerrain, EDITOR_LEVEL);

export function wallGateEligible(spec: MapSpec): string | null {
  const { x, y } = spec.size;
  if (x !== y) return "The wall with one gate is drawn on square maps only, for now";
  if (x < GATE_SIDE[0]) return `The wall with one gate needs at least ${GATE_SIDE[0]} tiles a side for a valley and a basin`;
  if (x > GATE_SIDE[1]) return `The wall with one gate is drawn up to ${GATE_SIDE[1]} tiles a side`;
  if (spec.settings.start.easyStart) return "Easy start is not offered with the wall with one gate yet";
  if (spec.settings.water.lakes === "none") return "The wall with one gate needs its valley lake, and Lakes is None";
  if (spec.settings.water.waterfalls === "off") return "The wall with one gate needs its fall, and Waterfalls is Off";
  if (spec.settings.water.sources === "none") return "The wall with one gate needs its springs, and Sources is None";
  if (spec.settings.terrain.highestTerrain < CREST[0]) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the wall (its crest stands at ${CREST[0]} or more)`;
  if (LAKE_SILL + VEIL[0] > gateTop(spec) - 2) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for the springs over the fall`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the turn

/** The local frame onto the map: u along the wall, v across it toward the basin. `k` turns local v onto the camera's
 *  look (Cw0: north, Cw90: east, Cw180: south, Cw270: west); `m` mirrors u first. */
export interface Turn {
  k: number;
  m: boolean;
  N: number;
}

/** A point (continuous) from local to map. */
export function onMap(T: Turn, [u0, v]: Point): Point {
  const u = T.m ? T.N - u0 : u0;
  const N = T.N;
  return T.k === 0 ? [u, v] : T.k === 1 ? [v, N - u] : T.k === 2 ? [N - u, N - v] : [N - v, u];
}

/** A point from map to local. */
export function onLocal(T: Turn, [x, y]: Point): Point {
  const N = T.N;
  const [u, v]: Point = T.k === 0 ? [x, y] : T.k === 1 ? [N - y, x] : T.k === 2 ? [N - x, N - y] : [y, N - x];
  return [T.m ? N - u : u, v];
}

/** A tile index (its corner, as the plan's start and lips are) from local to map: the tile's middle turned. */
function tileOnMap(T: Turn, [i, j]: Point): Point {
  const [x, y] = onMap(T, [i + 0.5, j + 0.5]);
  return [Math.round(x - 0.5), Math.round(y - 0.5)];
}

/** A direction from local to map. */
function dirOnMap(T: Turn, [du0, dv]: Point): Point {
  const du = T.m ? -du0 : du0;
  return T.k === 0 ? [du, dv] : T.k === 1 ? [dv, -du] : T.k === 2 ? [-du, -dv] : [-dv, du];
}

/** The map edge a local edge lands on. */
function edgeOnMap(T: Turn, e: Edge): Edge {
  const out: Point = e === "N" ? [0, 1] : e === "S" ? [0, -1] : e === "E" ? [1, 0] : [-1, 0];
  const [dx, dy] = dirOnMap(T, out);
  return dx > 0.5 ? "E" : dx < -0.5 ? "W" : dy > 0.5 ? "N" : "S";
}

export const turnOf = (plan: PremisePlan, g: GateNumbers): Turn => ({ k: g.turn, m: g.mirror, N: plan.W });
const spineOnMap = (T: Turn, s: Spine): Spine => s.map(([u, v, r]) => [...onMap(T, [u, v]), r] as [number, number, number]);
const pathOnMap = (T: Turn, p: readonly Point[]): Point[] => p.map((q) => onMap(T, q));
const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Point): Point => [r2(p[0]), r2(p[1])];

// ------------------------------------------------------------------------------------------------- the wall in local

export interface LocalRun {
  u0: number;
  u1: number;
  v: number;
  thick: number;
}

/** The run at u (the last run owns the map's far edge). */
export function runAt(runs: readonly LocalRun[], u: number): LocalRun {
  for (const r of runs) if (u < r.u1) return r;
  return runs[runs.length - 1];
}

/** Lengths of runs 14 to 22 that fill `len` exactly, or null where it cannot (under 14). */
function fillRuns(rng: Rng, len: number): number[] | null {
  if (len < RUN[0]) return len <= 0 ? [] : null;
  const out: number[] = [];
  let rem = len;
  while (rem > RUN[1]) {
    // what is left after this run must be a run itself (14 to 22) or room for two (28 or more): never 23 to 27
    const ok: number[] = [];
    for (let L = RUN[0]; L <= RUN[1]; L++) if ((rem - L >= RUN[0] && rem - L <= RUN[1]) || rem - L >= 2 * RUN[0]) ok.push(L);
    if (!ok.length) return null;
    const L = ok[rng.int(0, ok.length)];
    out.push(L);
    rem -= L;
  }
  out.push(rem);
  return out;
}

/** The wall's runs (local), the bastion's index: the bastion the most southern face, the rest 1 to 12 north of it,
 *  each jog 4 to 6. */
function drawRuns(rng: Rng, N: number, veilMid: number): { runs: LocalRun[]; bastion: number } | null {
  const bl = rng.int(BASTION_RUN[0], BASTION_RUN[1] + 1);
  const b0 = Math.round(veilMid - bl / 2 + rng.range(-2, 2));
  const west = fillRuns(rng, b0);
  const east = fillRuns(rng, N - b0 - bl);
  if (!west || !east) return null;
  const vb = Math.round(N * rng.range(0.53, 0.58));
  // (each jog turns back from the last where it can: the face steps up and down, so its jogs show from the widest
  // view; a run of jogs one way read as one clean frame)
  let lastUp = false;
  const jogFrom = (v: number): number => {
    const j = rng.int(JOG[0], JOG[1] + 1);
    const canUp = v + j <= vb + 12;
    const canDown = v - j >= vb + 1;
    const up = canUp && (!canDown || !lastUp);
    lastUp = up;
    return up ? v + j : v - j;
  };
  const runs: LocalRun[] = [];
  let v = vb;
  const ws: LocalRun[] = [];
  let u = b0;
  lastUp = false;
  for (const L of west) {
    v = jogFrom(v);
    ws.push({ u0: u - L, u1: u, v, thick: rng.int(THICK[0], THICK[1] + 1) });
    u -= L;
  }
  runs.push(...ws.reverse());
  const bastion = runs.length;
  runs.push({ u0: b0, u1: b0 + bl, v: vb, thick: BASTION_THICK });
  v = vb;
  u = b0 + bl;
  lastUp = false;
  for (const L of east) {
    v = jogFrom(v);
    runs.push({ u0: u, u1: u + L, v, thick: rng.int(THICK[0], THICK[1] + 1) });
    u += L;
  }
  return { runs, bastion };
}

// ------------------------------------------------------------------------------------------------- the layout

const LAKE_NAMES = ["Wall Lake", "Long Lake", "Shadow Lake", "Foot Lake"];
const VEIL_NAMES = ["the Veil", "the Curtain", "the White Drop", "the Bridal Fall"];
const POOL_NAMES = ["the Cleft", "the Wellhead", "the Spring Cleft"];
const KETTLE_NAMES = ["the Still Pool", "the Door Pool", "the Quiet Pool"];
const PASS_NAMES = ["the Pass", "the Saddle", "the Col"];
const BROOK_WORDS = ["Valley", "Fern", "Alder", "Rowan", "Sedge", "Birch", "Hazel", "Willow"];

/** A failed layout says why in a word or two (for the tools). */
type Laid = { plan: GatePlan } | { why: string };

function layout(spec: MapSpec, attempt: number, t: number): Laid {
  const rng = premiseStream(spec, "premise.plan", attempt, "gate", t);
  const N = spec.size.x;
  const top = gateTop(spec);
  const sky = spec.settings.terrain.highestTerrain;
  const T: Turn = { k: rng.int(0, 4), m: rng.float() < 0.5, N };
  const S = LAKE_SILL;
  const veils = VEIL.filter((h) => S + h <= top - 2);
  const Hv = veils[rng.int(0, veils.length)];
  const poolSill = S + Hv;
  const C = rng.int(CREST[0], Math.min(CREST[1], sky) + 1);
  const P = poolSill - 2;
  const M = S + MEGADAM_RISE;
  const R = rng.int(RIM[0], Math.min(RIM[1], sky) + 1);
  // (the Low River leaves by the drain bay's side of the start: the bay cuts the start's bench there, and on the other
  // side the bench reaches the valley round the lake's far end, over the Gate's bar; a lake run on to the spur on that
  // side closed the bench in, 630 tiles of reach where 1,300 are aimed at)
  const draw = rng.float();
  void draw;
  const lowSide: GateNumbers["lowSide"] = T.m ? "gate" : "pass";
  const flow = flowOf(spec);
  const gorge = gorgeOf(spec);

  // ---- the wall
  const veilMid = N * rng.range(0.38, 0.5);
  const wr = drawRuns(rng, N, veilMid);
  if (!wr) return { why: "runs" };
  const { runs, bastion } = wr;
  const B = runs[bastion];
  const fb = B.v;
  const w = rng.int(LIP[0], LIP[1] + 1);
  const lu0 = Math.round(veilMid - w / 2);
  const lu1 = lu0 + w - 1;
  if (lu0 < B.u0 + 3 || lu1 > B.u1 - 4) return { why: "lip" };

  // ---- the cleft, the trench, the Still Pool
  const lm = (lu0 + lu1 + 1) / 2;
  const poolSpine: Spine = [[lm - 2.5, fb + CLEFT.back, CLEFT.r], [lm + 2.5, fb + CLEFT.back, CLEFT.r]];
  // the trench under the lip and the drain bay to the lake, one arm: stage 1 lays the arm nearest the landmark's lip as
  // the first frame's bay, a level deep with the drowned river's ribbon two (raster/bodies.ts `bayOf`), so it carries
  // the whole Veil to the lake (a shelf a tile or two wide at the sill carried half of it, and the foot stood over the
  // start's bench)
  // (the Still Pool stands beside the start, at the lip's end the camera leans to, where the frame puts the start; the
  // drain bay leaves by the other end, clear of the start's bench: on a mirrored layout the two swap ends)
  const ks = T.m ? -1 : 1;
  const kEnd = ks > 0 ? lu1 : lu0;
  const bEnd = ks > 0 ? lu0 : lu1;
  // (the bay opens wide at the lip's end: a trench a tile or two wide there between the foot and the bay, beside the
  // lip's shoulders, held the fall back over the start's bench)
  const trench: Spine = [[kEnd + ks, fb - 0.6, 0.7], [bEnd - 0.5 * ks, fb - 1.5, 1.4], [bEnd - 4 * ks, fb - 2.6, 2.4], [bEnd - 8 * ks, fb - 6, 2.6]];
  const cu = kEnd + 6.5 * ks;
  const kettle: Spine = [[cu, fb - 2.2, 1.8], [cu + 2.5 * ks, fb - 2.8, 1.8]];
  const inletPath: Point[] = [[kEnd + 1.6 * ks, fb - 0.7], [cu - 1.4 * ks, fb - 2.1]];

  // ---- the Gate: in a run on the Still Pool's side, its slot clear of the run's ends
  const slotW = rng.int(SLOT[0], SLOT[1] + 1);
  const gLeast = (ks > 0 ? cu + 2.5 + 1.8 : bEnd + 8 + 2.6) + 16;
  const gateRuns = runs.filter((r, k) => k > bastion && r.u1 - 3 - slotW / 2 > Math.max(gLeast, r.u0 + 3 + slotW / 2) && r.u1 < N - 18);
  if (!gateRuns.length) return { why: "gate run" };
  const G = gateRuns[rng.int(0, Math.min(2, gateRuns.length))];
  const gu = Math.round(rng.range(Math.max(gLeast, G.u0 + 3 + slotW / 2), G.u1 - 3 - slotW / 2)) + (slotW % 2 ? 0.5 : 0);
  const shoreV = G.v - SLOT_BENCH;
  const footV = G.v + G.thick + 3;

  // ---- the Low River's spur and the lake
  const spurU = lowSide === "pass" ? Math.round(0.08 * N) : N - Math.round(0.08 * N);
  const uW = lowSide === "pass" ? spurU + SPUR_HALF + 5 + 7 : Math.round(0.17 * N);
  const uE = lowSide === "gate" ? spurU - SPUR_HALF - 5 - 7 : gu + 3;
  // (the start's bench outranks the lake, D515: the lake stands off the wall's foot by the rows its pocket needs to hold
  // the bench, between the drain bay and the Gate's arm, or, mirrored, the lake's open end; and narrows where the
  // valley has no more room under it. The pocket is the lake's meadow at the sill + 1, so it is level)
  const benchAim = BENCH_OVER * Math.max(BENCH_FLOOR[spec.settings.start.area], WALK_READ);
  const bayIn = bEnd - 9 * ks + 2.6 * ks;
  const pocket = Math.max(8, ks > 0 ? gu - 4.5 - bayIn : bayIn - uW);
  const rows = Math.max(BENCH_ROWS, Math.ceil(benchAim / pocket) + 4);
  const lakeTop = fb - rows;
  const shrink = Math.max(0.55, Math.min(1, (lakeTop - UNDER_LAKE * N) / 19));
  if (lakeTop - 19 * shrink < UNDER_LAKE * N - 1) return { why: "bench" };
  const mv = lakeTop - (9 + 1.5) * shrink;
  if (uE - uW < 40 || (lowSide === "gate" && uE < gu + 8)) return { why: "lake span" };
  // (the Low River leaves over the lake's own wide sill, sized by the valley's flow as the lake stair's lowest sill
  // over its gorge: round 8's 14; its end of the lake as wide as the lip)
  const valleyFlow = flow * (1 + (3 * (BROOK_SPRING[0] + BROOK_SPRING[1])) / 2 / GATE_FLOW.normal);
  const lowLip = Math.max(10, Math.min(MAX_SILL_WIDTH, sillWidthFor(valleyFlow) + 2));
  const lowAt = lowSide === "pass" ? 0 : -1;
  // (a lake, not a trench: its main arm wanders across the valley a shore's width either way, its width swinging from
  // narrows to broads two-fold and more, and bays reach off it away from the start's bench; stage 1's outline wander
  // and shelf do the rest, as for the lake stair's lakes. One width on a straight line read as a canal in the game)
  const main: Spine = [];
  const nArm = Math.max(14, Math.round((uE - uW) / 2.2));
  const phase = rng.range(0, 6.283);
  const wave = rng.range(2.2, 3.4);
  const phaseR = rng.range(0, 6.283);
  const cycles = rng.range(1.6, 2.4);
  const swell: number[] = [];
  const benchWave = rng.range(BENCH_WAVE[0], BENCH_WAVE[1]);
  for (let i = 0; i <= nArm; i++) {
    const end = i === 0 || i === nArm;
    const sw = sin(phaseR + (2 * 3.14159 * cycles * i) / nArm);
    swell.push(end ? -1 : sw);
    // (the Low River's end of the lake as wide as its lip for two points in, so the lip pours from a pool)
    const fromLow = lowAt === 0 ? i : nArm - i;
    const r0 = (end ? rng.range(4.5, 6) : 6.4 + 2.9 * sw + rng.range(-1, 1)) * shrink;
    const r = fromLow === 0 ? lowLip / 2 + 0.5 : fromLow <= 2 ? Math.max(r0, lowLip / 2 - (fromLow - 1)) : r0;
    const sway = LAKE_SWAY * shrink * sin(phase + (wave * 3.14159 * i) / nArm) + 0.8 * sin(phase * 1.7 + (wave * 2.7 * 3.14159 * i) / nArm);
    // (the bench's side of the lake held under a wandering line, not one row: every broad touching one row laid a ruled
    // shore along the bench)
    const u = uW + ((uE - uW) * i) / nArm;
    const v = Math.min(lakeTop - r - BENCH_SHORE * (1 + sin(phase * 2.3 + (6.283 * u) / benchWave)), mv + sway);
    main.push([r2(u + (end ? 0 : rng.range(-0.8, 0.8))), r2(v), r2(r)]);
  }
  // bays off the broads, down-valley (away from the start's bench), 8 to 14 tiles, narrowing to their ends
  const bays: Spine[] = [];
  // (the broads: the widest points a point or two in from the ends, three points apart at the least)
  const nBays = rng.int(BAYS[0], BAYS[1] + 1);
  const broadAt: Spine = [];
  const taken: number[] = [];
  for (const k of main.map((_, k) => k).filter((k) => k > 1 && k < nArm - 1).sort((a, b) => swell[b] - swell[a] || a - b)) {
    if (taken.length >= nBays) break;
    if (taken.some((t) => Math.abs(t - k) < 6)) continue;
    taken.push(k);
    broadAt.push(main[k]);
  }
  for (const p of broadAt) {
    const ang = rng.range(-0.9, 0.9);
    const len = p[2] + Math.max(BAY_PAST, rng.range(8, 14) * shrink);
    const dx = sin(ang);
    const dy = -cos(ang);
    const r0 = p[2] * 0.6;
    bays.push(wanderArm(rng, [p[0], p[1]], [p[0] + dx * len, p[1] + dy * len], BROOK_MEANDER, (t) => 1.6 + (r0 - 1.6) * (1 - t) + (t > 0.3 && t < 0.7 ? 0.8 : 0)));
  }
  // (the Gate's arm and the drain bay's leg wander down to the lake, widening and narrowing: two straight arms of one
  // width read as a moat round the start's meadow)
  const armBulge = rng.range(0.35, 0.65);
  const gateArm = wanderArm(rng, [gu, mv], [gu, shoreV - 3.5], BROOK_MEANDER, (t) => r2(t > 0.82 ? 3.5 : 3 + 2.6 * Math.max(0, 1 - Math.abs(t - armBulge) / 0.35) + (t < 0.15 ? 1.5 * (1 - t / 0.15) : 0)));
  const legBulge = rng.range(0.35, 0.65);
  // (wide and gently wandering: the whole Veil runs down it to the lake, and a narrow winding leg held the trench's
  // water up under the fall, short of its drop)
  const leg = wanderArm(rng, [bEnd - 8 * ks, fb - 6], [bEnd - 9 * ks, mv], NOTCH_MEANDER, (t) => r2(3.2 + 1.8 * Math.max(0, 1 - Math.abs(t - legBulge) / 0.3)));
  for (const q of leg.slice(1)) trench.push(q);
  // (points and coves along the shore: little round arms on the main arm's and the Gate's arm's edges, every few tiles,
  // so no stretch of shore runs a ruled line on the grid; a broad's smooth flank laid one 7 tiles and more. None on the
  // bench's side over the lake's top line, none by the Low River's lip or the Gate's foot)
  const nicks: Spine[] = [];
  const lowPt = lowAt === 0 ? main[0] : main[main.length - 1];
  // (over the lake's top line only on the side away from the bench's pocket, between the drain bay's leg and the
  // Gate's arm)
  const pocketU = ks > 0 ? (bayIn + gu - 4.5) / 2 : (uW + bayIn) / 2;
  for (const arm of [main, gateArm, trench.slice(4)]) {
    const path = arm.map((q) => [q[0], q[1]] as Point);
    const L = pathLength(path);
    let side = rng.int(0, 2) ? 1 : -1;
    for (let t = rng.range(2, 4); t < L - 2; t += rng.range(NICK_GAP[0], NICK_GAP[1])) {
      const { p, dir } = pointAt(path, t);
      const rr = spineDist(p[0], p[1], arm);
      const nr = rng.range(NICK_R[0], NICK_R[1]);
      const c: Point = [p[0] - dir[1] * side * (-rr - nr * 0.35), p[1] + dir[0] * side * (-rr - nr * 0.35)];
      side = rng.int(0, 3) ? -side : side;
      if (c[1] + nr > lakeTop - 0.5 && (arm === main || Math.abs(c[0] - pocketU) < Math.abs(p[0] - pocketU))) continue;
      if (dist(c, [lowPt[0], lowPt[1]]) < lowPt[2] + 4 || dist(c, [gu, shoreV - 3.5]) < 8 || dist(c, [bEnd - 8 * ks, fb - 6]) < 6) continue;
      nicks.push([[r2(c[0]), r2(c[1]), r2(nr)]]);
    }
  }
  const lakeArms: Spine[] = [main, trench, gateArm, ...bays, ...nicks];

  // ---- the frame: the start in the Veil's lap, the lip whole in the first frame
  const z = S + 1;
  const orientation = ORIENTATIONS[T.k];
  const lipMap: [Point, Point] = [tileOnMap(T, [lu0, fb]), tileOnMap(T, [lu1, fb])];
  let start: { x: number; y: number } | null = null;
  let bestU = Infinity;
  let lipAhead = 0;
  const armsOnMap = lakeArms.map((a) => spineOnMap(T, a));
  for (let sv = fb - 5; sv >= fb - 6; sv--)
    for (let su = lu0 + 1; su <= lu1; su++) {
      // (its 5 × 5 clear of the lake, read on the map as `plan.overlap` reads it: a start by the drain bay's mouth
      // failed it)
      const [x, y] = tileOnMap(T, [su, sv]);
      let clear = true;
      for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 2 && clear; dx++) for (const arm of armsOnMap) if (spineDist(x + dx, y + dy, arm) < 0.75) clear = false;
      if (!clear) continue;
      const fr = lipInFrame({ x, y, z, orientation }, lipMap, poolSill, S + 0.3);
      if (frameReason(fr)) continue;
      const mid = Math.abs(fr.ends[0].u + fr.ends[1].u);
      if (mid < bestU) {
        bestU = mid;
        start = { x, y };
        lipAhead = r2((fr.ahead[0] + fr.ahead[1]) / 2);
      }
    }
  if (!start) return { why: "frame" };

  // ---- the Pass and the leat
  const passRuns = runs.filter((r, k) => k < bastion && r.u1 - 2 - 8 >= Math.max(r.u0 + 2, lowSide === "pass" ? spurU + 6 : 12));
  if (!passRuns.length) return { why: "pass run" };
  const PR = passRuns[rng.int(0, Math.min(2, passRuns.length))];
  const pu0 = Math.round(rng.range(Math.max(PR.u0 + 2, lowSide === "pass" ? spurU + 6 : 12), PR.u1 - 2 - 8));
  const pu = pu0 + 4;
  // (clear of the far corner's buttress)
  const notchU = Math.round(rng.range(Math.max(pu + 20, gu - 0.15 * N), N - RIM_CORNER_CLEAR));
  const vp = N - RIM_MOST - 6;
  if (notchU - 6 <= pu + 8 || vp - 6 <= footV + 6) return { why: "notch" };
  const mid = (r: LocalRun) => r.v + r.thick / 2;
  const leat: Point[] = [[lm - 2.5 - CLEFT.r + 1, fb + CLEFT.back]];
  for (let k = bastion; k > runs.indexOf(PR); k--) {
    const here = k === bastion ? fb + CLEFT.back : mid(runs[k]);
    leat.push([runs[k].u0 - 0.5, here], [runs[k].u0 - 0.5, mid(runs[k - 1])]);
  }
  leat.push([pu, mid(PR)]);
  const passAt = leat.length - 1;
  leat.push([pu, PR.v + PR.thick + 3]);
  // (the Pass Bed meanders down to the far side and along it to the notch: a dry river, never a ruled line)
  const passTurn: Point = [pu + rng.range(-2, 2), vp];
  leat.push(...meander(rng, [pu, PR.v + PR.thick + 3], passTurn, BED_MEANDER).slice(1));
  leat.push(...meander(rng, passTurn, [notchU - 8, vp], BED_MEANDER).slice(1));
  leat.push(...meander(rng, [notchU - 8, vp], [notchU - 4, N - RIM_DEPTH], NOTCH_MEANDER).slice(1));
  leat.push([notchU - 4, N]);
  unstraighten(leat, passAt + 1, leat.length - 2);

  // ---- the Gate's path: the slot, then the Gate Bed winding to the notch
  const gate: Point[] = [[gu, shoreV - 0.5], [gu, footV]];
  // (the Gate Bed meanders from the Gate's foot to the notch, its last tiles straight through the rim)
  // (under the Pass Bed's line to beyond its end, then up to the notch: the two beds meet only there)
  const gTurn: Point = [notchU + 4, vp - 8];
  gate.push(...meander(rng, [gu, footV], gTurn, BED_MEANDER).slice(1));
  gate.push(...meander(rng, gTurn, [notchU + 1, N - RIM_DEPTH - 2], NOTCH_MEANDER).slice(1));
  gate.push([notchU + 1, N]);
  unstraighten(gate, 1, gate.length - 2);

  // ---- the Low River, through the spur to the edge
  const lowEnd = lowSide === "pass" ? main[0] : main[main.length - 1];
  const out = lowSide === "pass" ? -1 : 1;
  const lowV = lowEnd[1] + rng.range(-3, 3);
  const lipAt: Point = [lowEnd[0] + out * (lowEnd[2] + 1), lowEnd[1]];
  const low: Point[] = [
    lipAt,
    [lowEnd[0] + out * (lowEnd[2] + 4), lowEnd[1]],
    [spurU, lowV],
    [lowSide === "pass" ? 0 : N, lowV + rng.range(-3, 3)],
  ];
  // (the spur runs from the wall's face to past the Low River by 14 rows: a lake stood off the wall for the start's bench
  // left the gorge near the spur's end, and the valley at the megadam's water walked round it)
  // (through the Low River's own point on it, so the gorge cuts it wherever the spur's end swings)
  const spurPath: Point[] = [[spurU, runAt(runs, spurU).v], [spurU, lowV], [spurU + rng.range(-3, 3), Math.max(6, Math.min(Math.round(0.25 * N), Math.round(lowV - 14)))]];

  // ---- the brooks: springs in the valley's far corners
  const tarnAt: Point[] = [
    [N * 0.12, N * 0.1],
    [N * rng.range(0.42, 0.58), N * 0.07],
    [N * 0.88, N * 0.12],
  ];
  const tarns: { spine: Spine; sill: number; path: Point[] }[] = [];
  for (const [tu, tv] of tarnAt) {
    const r = rng.range(2.6, 3.2);
    const sill = S + rng.int(3, 5);
    // the nearest point of the lake's outline (its main arm and its bays), a tile inside it
    let best: Point = [main[0][0], main[0][1]];
    let lr = main[0][2];
    let bd = Infinity;
    for (const arm of [main, ...bays])
      for (let k = 0; k + 1 < arm.length; k++)
        for (let s = 0; s <= 1; s += 0.1) {
          const p: Point = [arm[k][0] + (arm[k + 1][0] - arm[k][0]) * s, arm[k][1] + (arm[k + 1][1] - arm[k][1]) * s];
          const rad = arm[k][2] + (arm[k + 1][2] - arm[k][2]) * s;
          const d = dist(p, [tu, tv]) - rad;
          if (d < bd) [bd, best, lr] = [d, p, rad];
        }
    const bl = dist(best, [tu, tv]);
    const dx = (best[0] - tu) / bl;
    const dy = (best[1] - tv) / bl;
    const head: Point = [tu + dx * (r - 1), tv + dy * (r - 1)];
    const end: Point = [best[0] - dx * Math.max(0, lr - 1), best[1] - dy * Math.max(0, lr - 1)];
    void dx;
    void dy;
    const path: Point[] = meander(rng, head, end, BROOK_MEANDER);
    tarns.push({ spine: [[tu, tv, r]], sill, path });
  }

  // ---- onto the map
  const plan = emptyPlan(spec);
  const names = plan.names;
  const lakeName = LAKE_NAMES[rng.int(0, LAKE_NAMES.length)];
  const veilName = VEIL_NAMES[rng.int(0, VEIL_NAMES.length)];
  const passName = PASS_NAMES[rng.int(0, PASS_NAMES.length)];
  const kettleName = KETTLE_NAMES[rng.int(0, KETTLE_NAMES.length)];
  Object.assign(names, {
    lake: lakeName,
    pool: POOL_NAMES[rng.int(0, POOL_NAMES.length)],
    kettle: kettleName,
    inlet: `${kettleName}'s inlet`,
    veil: veilName,
    gate: "the Gate",
    leat: "the old leat",
    low: "the Low River",
  });
  const body = (id: string, kind: Body["kind"], sill: number, arms: Spine[], meadow: number, region: string, deep = 1): Body => ({ id, kind, sill, arms: arms.map((a) => spineOnMap(T, a)), meadow, deep, dry: false, region });
  // (the lake's and the cleft's floors by the drought they must last, as the lake stair's: `holdDeep`, its sill no
  // notch, so it keeps most of its water through the difficulty's longest drought; the start's trench stays a level
  // deep, stage 1's bay. The Still Pool and the springs' tarns a level)
  const hold = holdDeep(false, hazardDays(spec.designedFor, "drought"));
  plan.bodies.push(
    body("lake", "lake", S, lakeArms, meadowOf(spec), "low", Math.min(S - BED_FLOOR, hold)),
    body("pool", "pool", poolSill, [poolSpine], 4, "top"),
    body("kettle", "kettle", S, [kettle], 4, "home"),
  );
  const strengths = [0.36, 0.33, 0.31].map((f) => r2(f * flow));
  strengths[2] = r2(flow - strengths[0] - strengths[1]);
  const sources: Source[] = strengths.map((s, k) => ({ id: `spring${k + 1}`, at: rp(onMap(T, [lm - 2.5 + 2.5 * k, fb + CLEFT.back])), strength: s, into: "pool" }));
  plan.sources.push(...sources);

  const bedAlong = (path: readonly Point[], hi: number, lo: number, from = 0): number[] => {
    const len = pathLength(path.slice(from));
    let run = 0;
    return path.map((p, k) => {
      if (k <= from) return hi;
      run += dist(path[k - 1], p);
      return k === path.length - 1 ? lo : Math.max(lo, hi - Math.floor(((hi - lo + 0.999) * run) / len));
    });
  };
  const veilFace = dirOnMap(T, [0, -1]);
  const veilBack = dirOnMap(T, [0, 1]);
  const lipMid: Point = [(lipMap[0][0] + lipMap[1][0]) / 2, (lipMap[0][1] + lipMap[1][1]) / 2];
  plan.links.push(
    {
      id: "veil",
      from: "pool",
      to: "lake",
      kind: "fall",
      fall: { height: Hv, crest: poolSill, width: w, face: headingOf(veilFace[0], veilFace[1]), lip: lipMap, notch: 0, piers: 0, breach: 0 },
      // (the cleft's mouth: from inside the pool to the lip, the landmark's hanging valley at its shortest, so stage 1
      // lays the Veil as the first frame's landmark, its lip the plan's and its foot a shelf)
      // (it starts at the pool's front: stage 1 leads a channel 2 tiles into its body, so from further in its tiles
      // stood past the bastion's back)
      path: [rp([lipMid[0] + (CLEFT.back - CLEFT.r - 0.5) * veilBack[0], lipMid[1] + (CLEFT.back - CLEFT.r - 0.5) * veilBack[1]]), rp(lipMid)],
      half: 2,
      bed: [poolSill, poolSill],
      wet: true,
      gates: [],
      rows: [],
    },
    { id: "inlet", from: "lake", to: "kettle", kind: "channel", path: pathOnMap(T, inletPath).map(rp), half: 0.5, wet: true, gates: [1], rows: [] },
    {
      id: "gate",
      from: "lake",
      to: "notch",
      kind: "channel",
      path: pathOnMap(T, gate).map(rp),
      half: slotW / 2,
      bed: [S - 2, ...bedAlong(gate, S - 2, BED_FLOOR, 1).slice(1)],
      wet: false,
      gates: [],
      rows: [BAR_LENGTH + 1, BAR_LENGTH + 3],
    },
    {
      id: "leat",
      from: "pool",
      to: "notch",
      kind: "leat",
      path: pathOnMap(T, leat).map(rp),
      half: 0.5,
      bed: [...bedAlong(leat.slice(0, passAt + 1), poolSill - 1, P - 1), ...bedAlong(leat.slice(passAt), S - 2, BED_FLOOR).slice(1)],
      wet: false,
      gates: [],
      // (its first tile or so is in the cleft: the row 3.5 along leaves the bar its two tiles before it, round 8's)
      rows: [LEAT_ROW],
    },
    {
      id: "low",
      from: "lake",
      to: "lowExit",
      kind: "gorge",
      fall: {
        height: S - BED_FLOOR,
        crest: S,
        width: lowLip,
        face: headingOf(...dirOnMap(T, [out, 0])),
        lip: [rp(onMap(T, [lipAt[0], lipAt[1] - lowLip / 2])), rp(onMap(T, [lipAt[0], lipAt[1] + lowLip / 2]))],
        notch: 0,
        piers: 0,
        breach: 0,
      },
      path: pathOnMap(T, low).map(rp),
      half: gorge / 2,
      bed: low.map(() => BED_FLOOR),
      wet: true,
      gates: [],
      rows: [],
    },
  );
  // the permanent badwater source (D200) in the Low River's gorge past the spur, as the lake stair's in its gorge: its
  // water leaves by the exit and reaches no lake; its niche is stage 2's (`raster/relief.ts` `badwaterNiches`)
  const bw = spec.settings.hazards.badwater;
  if (bw !== "off") plan.sources.push({ id: "badwater", at: rp(pointAt(pathOnMap(T, low), pathLength(low) * 0.75).p), strength: bw === "low" ? 1 : bw === "normal" ? 1.5 : 2.75, into: "low", bad: true });
  tarns.forEach((tn, k) => {
    const id = `tarn${k + 1}`;
    const word = BROOK_WORDS[(rng.int(0, BROOK_WORDS.length) + k) % BROOK_WORDS.length];
    names[id] = `${word} Spring`;
    names[`brook${k + 1}`] = `${word} Brook`;
    plan.bodies.push(body(id, "tarn", tn.sill, [tn.spine], 6, "low"));
    plan.sources.push({ id: `${id}Spring`, at: rp(onMap(T, [tn.spine[0][0], tn.spine[0][1]])), strength: r2((rng.range(BROOK_SPRING[0], BROOK_SPRING[1]) * flow) / GATE_FLOW.normal), into: id });
    plan.links.push({ id: `brook${k + 1}`, from: id, to: "lake", kind: "brook", path: pathOnMap(T, tn.path).map(rp), half: 1.4, bed: bedAlong(tn.path, tn.sill, S), wet: true, gates: [], rows: [] });
  });
  const exits: Exit[] = [
    { id: "lowExit", edge: edgeOnMap(T, lowSide === "pass" ? "W" : "E"), at: rp(onMap(T, low[low.length - 1])) },
    { id: "notch", edge: edgeOnMap(T, "N"), at: rp(onMap(T, [notchU, N])) },
  ];
  plan.exits.push(...exits);
  plan.edges = { N: "ridge", E: "ridge", S: "ridge", W: "ridge" };
  for (const e of exits) plan.edges[e.edge] = "water leaves";

  // ---- ridges: the wall's crest, the spur the gorge cuts, the rim in two pieces about the notch
  const crestLine: Point[] = [];
  runs.forEach((r, k) => {
    if (k > 0) crestLine.push([r.u0, mid(runs[k - 1])]);
    crestLine.push([r.u0, mid(r)], [r.u1, mid(r)]);
  });
  const bandTop = (u: number) => runAt(runs, u).v + runAt(runs, u).thick;
  const ridge = (id: string, role: Ridge["role"], path: Point[], top: number, half: number): Ridge => ({ id, role, path: pathOnMap(T, path).map(rp), top, half, drop: 0, ledge: 0, rough: 0.5 });
  const rimV = N - RIM_DEPTH / 2;
  const rimGap = NOTCH / 2 + RIM_DEPTH / 2 + 0.5;
  plan.ridges.push(
    ridge("wall", "wall", crestLine, C, 2.5),
    ridge("spur", "spur", spurPath, M + 3, SPUR_HALF),
    ridge("rimW", "skyline", [[RIM_DEPTH / 2, bandTop(RIM_DEPTH / 2) + 1], [RIM_DEPTH / 2, rimV], [notchU - rimGap, rimV]], R, RIM_DEPTH / 2),
    ridge("rimE", "skyline", [[notchU + rimGap, rimV], [N - RIM_DEPTH / 2, rimV], [N - RIM_DEPTH / 2, bandTop(N - RIM_DEPTH / 2) + 1]], R, RIM_DEPTH / 2),
  );

  // ---- the start and its frame
  plan.frame = { start: { x: start.x, y: start.y, z, orientation }, landmark: "veil", lipAhead, bench: Math.round(benchAim) };

  // ---- the ladder (round 8's rungs)
  const at = (p: Point) => rp(onMap(T, p));
  const gives = (f: number, id = ""): [number, number] => [SHARE.has(id) ? 0 : Math.round(f * N), Math.round(2 * f * N)];
  const works: Work[] = [
    { id: "neck", rung: "first", kind: "levee", on: "inlet", at: at([(inletPath[0][0] + inletPath[1][0]) / 2, (inletPath[0][1] + inletPath[1][1]) / 2]), tiles: NECK.levee, needs: [], gives: { green: [0, 0] }, tradeoff: "Before the first badtide: it keeps the pool clean while the trench runs red", region: "home" },
    { id: "gateOpen", rung: "medium", kind: "canal", on: "gate", at: at([gu, shoreV + 1]), tiles: slotW * (BAR_LENGTH + 2), needs: [], gives: { green: gives(GIVES.gateOpen) }, tradeoff: "The river splits: the lake keeps less", region: "wet" },
    { id: "gateWhole", rung: "medium", kind: "levee", on: "low", at: at(low[1]), tiles: gorge * 2 + slotW, needs: ["gateOpen"], gives: { green: gives(GIVES.gateWhole, "gateWhole") }, tradeoff: "The lake sinks half a level and the Low River runs dry", region: "wet" },
    { id: "leatOpen", rung: "medium", kind: "leat", on: "leat", at: at(leat[0]), tiles: 3, needs: [], gives: { green: gives(GIVES.leatOpen) }, region: "top" },
    { id: "leatWhole", rung: "large", kind: "leat", on: "leat", at: at(leat[0]), tiles: 2, needs: ["leatOpen"], gives: { green: gives(GIVES.leatWhole, "leatWhole") }, tradeoff: `${veilName[0].toUpperCase()}${veilName.slice(1)} dwindles`, region: "top" },
    { id: "megadam", rung: "large", kind: "megadam", on: "low", at: at([spurU, lowV]), tiles: gorge + slotW, needs: [], gives: { green: [0, 0], reservoir: gives(GIVES.megadam) }, tradeoff: "It floods the bench and the low meadows, and the Gate is dammed with it", region: "low" },
  ];
  plan.works.push(...works);

  // ---- regions
  const region = (id: string, role: Region["role"], problem: string, prize: string, dayOne: Region["dayOne"], p: Point): Region => ({ id, role, problem, prize, dayOne, at: at(p) });
  plan.regions.push(
    region("home", "home", "The trench runs red in a badtide", `${kettleName} kept clean, ${veilName} at the door`, "green", [lm, fb - 6]),
    region("low", "low", "The lake leaves by the Low River", "Meadows, wood and the megadam's sea", "green", [N * 0.5, mv - 14]),
    region("top", "top", "Far and high, along the crest", `The old leat and ${passName}`, "dry", [pu, PR.v + PR.thick / 2]),
    region("wet", "wet", "Dry until the Gate is opened", "The Gate Bed's terraces", "dry", [(gu + notchU) / 2, (footV + vp) / 2]),
    region("dry", "dry", "No water reaches it", "Room, the rim's far view", "dryForGood", [Math.min(pu, notchU) / 2 + N * 0.1, vp - 6]),
  );

  plan.line = `A mountain wall runs across the map, a green valley on your side and a dry basin beyond; the river rises in a cleft of the wall and pours over ${veilName} into ${lakeName} at your door. Carry the water through the Gate or round by ${passName}, and before the first badtide shut ${kettleName}.`;

  const runsMap: GateRun[] = runs.map((r) => ({ from: rp(onMap(T, [r.u0, r.v])), to: rp(onMap(T, [r.u1, r.v])), thick: r.thick }));
  plan.gate = {
    turn: T.k,
    mirror: T.m,
    sill: S,
    drop: Hv,
    crest: C,
    pass: P,
    megadam: M,
    rim: R,
    floor: [BED_FLOOR, S + 1],
    runs: runsMap,
    bastion,
    lake: "lake",
    pool: "pool",
    kettle: "kettle",
    inlet: "inlet",
    veil: "veil",
    gate: "gate",
    leat: "leat",
    low: "low",
    wall: "wall",
    spur: "spur",
    rims: ["rimW", "rimE"],
    slot: { width: slotW, to: 1 },
    bar: { level: S + 1, length: BAR_LENGTH },
    leatBar: poolSill + 1,
    passAt,
    passSpan: [rp(onMap(T, [pu0, mid(PR)])), rp(onMap(T, [pu0 + 8, mid(PR)]))],
    notch: { at: rp(onMap(T, [notchU, N])), width: NOTCH },
    lowSide,
  };
  nickShore(plan as unknown as PremisePlan);
  return { plan };
}

/** Nicks Wall Lake's shore where its outline by stage 1's rule (`raster/bodies.ts`: the arms, a wander of `WANDER_LAKE`
 *  by the lake's own noise, a gap of `APART` to other bodies) runs straight for more than `SHORE_STRAIGHT`: a little
 *  round arm just outside the run's middle, a third of the way along if the middle is barred. Clear of the start, the
 *  other bodies and the dry beds and channels; a few rounds, `lake.shore` reads the real raster after. A broad's smooth
 *  flank on the grid lays a ruled run of 7 tiles and more however its arms swing. */
function nickShore(plan: PremisePlan): void {
  const lake = plan.bodies.find((b) => b.id === "lake");
  if (!lake) return;
  const { W, H } = plan;
  const others = plan.bodies.filter((b) => b !== lake);
  const sWob = seedOf(plan, lake.id, "wob");
  const trench = lake.arms[1].slice(0, 4);
  const gEnd = lake.arms[2][lake.arms[2].length - 1];
  const low = plan.links.find((l) => l.id === "low")?.path?.[0];
  const paths = plan.links.filter((l) => l.path && l.kind !== "brook").map((l) => l.path!);
  const { x: sx, y: sy } = plan.frame.start;
  const aside = (i: number) => {
    const x = (i % W) + 0.5;
    const y = Math.floor(i / W) + 0.5;
    return spineDist(x, y, trench) < 3 || dist([x, y], [gEnd[0], gEnd[1]]) < 7 || (!!low && dist([x, y], low) < 6);
  };
  for (let round = 0; round < NICK_ROUNDS; round++) {
    let bx0 = W;
    let by0 = H;
    let bx1 = 0;
    let by1 = 0;
    for (const arm of lake.arms)
      for (const [x, y, r] of arm) {
        bx0 = Math.min(bx0, x - r - 3);
        by0 = Math.min(by0, y - r - 3);
        bx1 = Math.max(bx1, x + r + 3);
        by1 = Math.max(by1, y + r + 3);
      }
    const box: [number, number, number, number] = [Math.max(0, Math.floor(bx0)), Math.max(0, Math.floor(by0)), Math.min(W - 1, Math.ceil(bx1)), Math.min(H - 1, Math.ceil(by1))];
    const inLake = new Uint8Array(W * H);
    for (let y = box[1]; y <= box[3]; y++)
      for (let x = box[0]; x <= box[2]; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (bodyDist(cx, cy, lake) + WANDER_LAKE * fbm(sWob, x, y, 16, 3) >= 0) continue;
        if (others.some((o) => bodyDist(cx, cy, o) < 2)) continue;
        inLake[y * W + x] = 1;
      }
    const runs = straightShores(W, H, box, (i) => !!inLake[i], () => false, aside);
    if (!runs.length) return;
    for (const run of runs) {
      // (the run's tiles from its last one back along it)
      const back = run.ny !== 0 ? [-1, 0] : [0, -1];
      for (const share of [0.5, 0.3, 0.7]) {
        const k = Math.round(run.len * share);
        const c: Point = [run.x + back[0] * k + 0.5 + run.nx * 0.9, run.y + back[1] * k + 0.5 + run.ny * 0.9];
        const nr = NICK_R[0];
        if (Math.max(Math.abs(c[0] - sx - 0.5), Math.abs(c[1] - sy - 0.5)) < 2.5 + nr + 1.5) continue;
        if (others.some((o) => bodyDist(c[0], c[1], o) < nr + 2.5)) continue;
        if (paths.some((q) => pathDist(c[0], c[1], q).d < nr + 2)) continue;
        if (plan.ridges.some((q) => pathDist(c[0], c[1], q.path).d < q.half + nr + 2)) continue;
        lake.arms.push([[r2(c[0]), r2(c[1]), nr]]);
        break;
      }
    }
  }
}
/** Stage 1's wander of a lake's outline (`raster/bodies.ts` `WANDER.lake`), and the rounds of nicks. */
const WANDER_LAKE = 1.2;
const NICK_ROUNDS = 4;

function emptyPlan(spec: MapSpec): GatePlan {
  return {
    premise: GATE_ID,
    seed: spec.seed,
    W: spec.size.x,
    H: spec.size.y,
    top: gateTop(spec),
    sky: spec.settings.terrain.highestTerrain,
    line: "",
    sources: [],
    bodies: [],
    links: [],
    exits: [],
    regions: [],
    ridges: [],
    edges: { N: "ridge", E: "ridge", S: "ridge", W: "ridge" },
    frame: { start: { x: 0, y: 0, z: -1, orientation: "Cw0" }, landmark: "", lipAhead: 0, bench: 0 },
    works: [],
    setPieces: [],
    names: {},
    gate: undefined as unknown as GateNumbers,
  };
}

// ------------------------------------------------------------------------------------------------- the first frame

/** The Veil in the first frame (§5.1 `frame.lip`, its plan half): both lip ends and the foot inside the frame (the
 *  foot allowed 0.1 under its bottom edge), the far end under the top edge's limit, the near end in front of the start.
 *  The lake stair's "square to the look" and "35 to 56 % of the width" do not hold here: the lip runs along the wall,
 *  which runs along the grid, 35° off the look by the camera's own turn, and the round's 9-tile lip spans about a
 *  quarter of the frame. */
function frameReason(fr: ReturnType<typeof lipInFrame>): string | null {
  const a = Math.min(...fr.ahead);
  const b = Math.max(...fr.ahead);
  if (a < 0.5) return `the lip's near end stands ${a.toFixed(2)} tiles in front of the start (0.5 at least)`;
  if (b > fr.limit + 0.05) return `the lip stands ${b.toFixed(2)} tiles in front of the start, past the frame's top edge (${fr.limit.toFixed(2)})`;
  for (const e of fr.ends) if (!(Math.abs(e.u) <= 0.95 && e.v <= 0.98)) return `a lip end falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  for (const e of fr.feet) if (!(Math.abs(e.u) <= 0.95 && e.v <= 0.98 && e.v >= -1.1)) return `the fall's foot falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the invariants

const linkOf = (plan: PremisePlan, id: string): Link | undefined => plan.links.find((l) => l.id === id);
const bodyOf = (plan: PremisePlan, id: string): Body | undefined => plan.bodies.find((b) => b.id === id);
/** The local run of a map run. */
const localRun = (T: Turn, r: GateRun): LocalRun & { thick: number } => {
  const a = onLocal(T, r.from);
  const b = onLocal(T, r.to);
  return { u0: Math.min(a[0], b[0]), u1: Math.max(a[0], b[0]), v: a[1], thick: r.thick };
};
export const localRuns = (plan: PremisePlan, g: GateNumbers) => {
  const T = turnOf(plan, g);
  return g.runs.map((r) => localRun(T, r)).sort((p, q) => p.u0 - q.u0);
};
/** The crest band's rows at local u, corners included (a jog's two columns hold both runs' bands). */
export function bandAt(runs: readonly LocalRun[], u: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of [-1, 0, 1]) {
    const r = runAt(runs, Math.min(runs[runs.length - 1].u1 - 0.01, Math.max(0, u + d)));
    lo = Math.min(lo, r.v);
    hi = Math.max(hi, r.v + r.thick);
  }
  return [lo, hi];
}

/** `gate.levels`: the levels by number. The lake's sill four over the floor; the cleft's springs the Veil's 6 or 7 over
 *  it, the Veil a fall from the pool onto the lake; the crest 17 to 19, 8 or more over the meadow and 9 or more over the
 *  basin's floor; the Pass two under the pool, over the meadow and under the crest; the Still Pool at the lake's level;
 *  the megadam's water two over the sill; the rim 12 or more over the basin's floor; the Gate's bar a level over the
 *  sill, its slot two under it on the floor or over it. */
const gateLevels: Invariant = {
  id: "gate.levels",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const S = g.sill;
    if (S !== LAKE_SILL) return fail(`The lake's sill is ${S}, not ${LAKE_SILL}`);
    const lake = bodyOf(plan, g.lake);
    const pool = bodyOf(plan, g.pool);
    const kettle = bodyOf(plan, g.kettle);
    if (!lake || lake.kind !== "lake" || lake.sill !== S) return fail(`${nameOf(plan, g.lake)} is not a lake on sill ${S}`);
    if (!(VEIL as readonly number[]).includes(g.drop)) return fail(`The fall is ${g.drop} levels (6 or 7)`);
    if (!pool || pool.sill !== S + g.drop) return fail(`${nameOf(plan, g.pool)} is not ${g.drop} over the lake's sill`);
    const veil = linkOf(plan, g.veil);
    if (plan.frame.landmark !== g.veil || !veil?.fall || veil.from !== g.pool || veil.to !== g.lake || veil.fall.height !== g.drop || veil.fall.crest !== pool.sill) return fail(`${nameOf(plan, g.veil)} is not the landmark, a fall of ${g.drop} from ${nameOf(plan, g.pool)} into ${nameOf(plan, g.lake)}`);
    if (g.crest < CREST[0] || g.crest > CREST[1] || g.crest > (plan.sky ?? plan.top)) return fail(`The crest stands at ${g.crest} (${CREST[0]} to ${CREST[1]}, under the highest ground)`);
    if (g.crest - (S + 1) < VALLEY_FACE) return fail(`The valley's face drops ${g.crest - S - 1} (${VALLEY_FACE} at least)`);
    if (g.floor[0] < BED_FLOOR || g.floor[1] > S + 1 || g.crest - g.floor[1] < BASIN_FACE) return fail(`The basin's floor is ${g.floor.join(" to ")} under a crest of ${g.crest} (on the floor, at most the sill + 1, ${BASIN_FACE} under the crest)`);
    if (g.pass !== pool.sill - 2 || g.pass <= S + 1 || g.pass >= g.crest) return fail(`The Pass stands at ${g.pass}, not two under the springs (${pool.sill - 2}) between the meadow and the crest`);
    if (!kettle || kettle.sill !== S) return fail(`${nameOf(plan, g.kettle)} is not at the lake's level`);
    if (g.megadam !== S + MEGADAM_RISE) return fail(`The megadam holds ${g.megadam}, not ${S + MEGADAM_RISE}`);
    if (g.rim < RIM[0] || g.rim > (plan.sky ?? plan.top) || g.rim <= g.floor[1]) return fail(`The rim stands at ${g.rim} (${RIM[0]} or more, under the highest ground, over the floor)`);
    if (g.bar.level !== S + 1) return fail(`The Gate's bar stands at ${g.bar.level}, not a level over the sill (${S + 1})`);
    if (g.leatBar !== pool.sill + 1) return fail(`The leat's bar stands at ${g.leatBar}, not two over its bed (${pool.sill + 1})`);
    return OK;
  },
};

/** `wall.grid` (§5.1): the valley's face is runs along the grid of 14 or more joined by jogs of 4 to 6, from edge to
 *  edge, no diagonal; the crest 4 to 6 thick, the bastion 8; the bastion the most southern run, the Veil's lip along its
 *  face, 9 to 12 tiles, inside its ends. */
const wallGrid: Invariant = {
  id: "wall.grid",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    for (const r of g.runs) if (r.from[0] !== r.to[0] && r.from[1] !== r.to[1]) return fail(`A run of the wall runs diagonally, (${r.from.join(", ")}) to (${r.to.join(", ")})`);
    const runs = localRuns(plan, g);
    if (runs[0].u0 > 0.01 || runs[runs.length - 1].u1 < plan.W - 0.01) return fail("The wall does not run from edge to edge");
    for (let k = 0; k < runs.length; k++) {
      const r = runs[k];
      if (r.u1 - r.u0 < RUN[0] - 0.01) return fail(`A run of the wall is ${r.u1 - r.u0} tiles (${RUN[0]} at least)`);
      if (k > 0) {
        if (Math.abs(r.u0 - runs[k - 1].u1) > 0.01) return fail("Two runs of the wall do not meet");
        const j = Math.abs(r.v - runs[k - 1].v);
        if (j < JOG[0] || j > JOG[1]) return fail(`A jog of the wall is ${j} tiles (${JOG[0]} to ${JOG[1]})`);
      }
      const want = k === g.bastion ? [BASTION_THICK, BASTION_THICK] : THICK;
      if (r.thick < want[0] || r.thick > want[1]) return fail(`A run's crest is ${r.thick} thick (${want.join(" to ")})`);
    }
    const B = runs[g.bastion];
    if (runs.some((r, k) => k !== g.bastion && r.v <= B.v)) return fail("The Veil's bastion is not the wall's most southern run");
    const veil = linkOf(plan, plan.frame.landmark);
    if (!veil?.fall) return fail("The plan has no fall");
    const T = turnOf(plan, g);
    const ends = veil.fall.lip.map((p) => onLocal(T, [p[0] + 0.5, p[1] + 0.5]));
    if (ends.some((e) => Math.abs(e[1] - 0.5 - B.v) > 0.01)) return fail(`${nameOf(plan, veil.id)}'s lip is not along its bastion's face`);
    const lo = Math.min(ends[0][0], ends[1][0]) - 0.5;
    const hi = Math.max(ends[0][0], ends[1][0]) + 0.5;
    if (lo < B.u0 + 2 || hi > B.u1 - 2) return fail(`${nameOf(plan, veil.id)}'s lip runs to its bastion's ends`);
    if (hi - lo !== veil.fall.width || veil.fall.width < LIP[0] || veil.fall.width > LIP[1]) return fail(`${nameOf(plan, veil.id)}'s lip is ${hi - lo} tiles for a width of ${veil.fall.width} (${LIP.join(" to ")})`);
    return OK;
  },
};

/** `wall.camera`, its plan half (§5.1): the start's turn faces the wall's valley face (its normal within 45° of the
 *  camera's look, against it) and the start stands in the valley, in front of the bastion. */
const wallCamera: Invariant = {
  id: "wall.camera",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const T = turnOf(plan, g);
    const s = plan.frame.start;
    if (s.orientation !== ORIENTATIONS[g.turn]) return fail(`The start faces ${s.orientation}, not the layout's turn (${ORIENTATIONS[g.turn]})`);
    const look = openingCamera(s).look;
    const n = dirOnMap(T, [0, -1]);
    const c = -(look[0] * n[0] + look[1] * n[1]);
    if (c < 0.7071) return fail(`The wall's face is ${((1 - c) * 90).toFixed(0)}° or more off the camera's look (45° at most)`);
    const B = localRuns(plan, g)[g.bastion];
    const [u, v] = onLocal(T, [s.x + 0.5, s.y + 0.5]);
    if (u < B.u0 || u > B.u1 || v > B.v - 3) return fail("The start does not stand in the valley in front of the Veil's bastion");
    return OK;
  },
};

/** `frame.lip`, the plan half (§5.1: the lake stair's, with the lip along the wall and its foot allowed 0.1 under the
 *  frame): the start on the bench a level over the lake, the Veil's lip and foot inside the first frame. */
const frameLip: Invariant = {
  id: "frame.lip",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    const veil = linkOf(plan, plan.frame.landmark);
    if (!g || !veil?.fall) return fail("The plan has no landmark fall");
    const s = plan.frame.start;
    if (s.z !== g.sill + 1) return fail(`The start stands on ${s.z}, not one over the lake's sill (${g.sill + 1})`);
    const fr = lipInFrame(s, veil.fall.lip, veil.fall.crest, g.sill + 0.3);
    const why = frameReason(fr);
    if (why) return fail(`In the first frame, ${why}`);
    if (Math.abs(fr.ahead[0] + fr.ahead[1] - 2 * plan.frame.lipAhead) > 0.3) return fail(`The plan says the lip stands ${plan.frame.lipAhead} in front; it stands ${((fr.ahead[0] + fr.ahead[1]) / 2).toFixed(2)}`);
    return OK;
  },
};

/** `gate.slot`, its plan half (§5.1): one slot through the crest band, 5 to 7 wide, straight across the wall in one
 *  run, clear of the run's ends, from 8 tiles of bench to past the basin's face, its floor two under the lake's sill the
 *  whole way; the bar a level over the sill at the shore and two rows of Blockages behind it inside the slot. No other
 *  water but the leat (on the crest, over the Pass) and the Veil's mouth (the cleft to its lip) crosses the wall. */
const gateSlot: Invariant = {
  id: "gate.slot",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const gate = linkOf(plan, g.gate);
    if (!gate?.path || !Array.isArray(gate.bed)) return fail("The plan has no Gate");
    if (gate.from !== g.lake) return fail(`The Gate leaves ${nameOf(plan, gate.from)}, not the lake`);
    if (g.slot.width < SLOT[0] || g.slot.width > SLOT[1] || g.slot.width !== 2 * (gate.half ?? 0)) return fail(`The Gate's slot is ${2 * (gate.half ?? 0)} wide (${SLOT.join(" to ")})`);
    const T = turnOf(plan, g);
    const runs = localRuns(plan, g);
    const a = onLocal(T, gate.path[0]);
    const b = onLocal(T, gate.path[g.slot.to]);
    if (Math.abs(a[0] - b[0]) > 0.01 || b[1] <= a[1]) return fail("The Gate's slot does not run straight across the wall");
    const r = runAt(runs, a[0]);
    if (a[0] - g.slot.width / 2 < r.u0 + 2 || a[0] + g.slot.width / 2 > r.u1 - 2) return fail("The Gate's slot stands at a jog of the wall");
    if (r.v - a[1] < SLOT_BENCH - 1) return fail(`The Gate's slot starts ${(r.v - a[1]).toFixed(1)} tiles before the wall (${SLOT_BENCH} of bench)`);
    if (b[1] < r.v + r.thick + 2) return fail("The Gate's slot stops inside the wall");
    for (let k = 0; k <= g.slot.to; k++) if (gate.bed[k] > g.sill - 2) return fail(`The Gate's slot floor stands at ${gate.bed[k]}, over two under the sill (${g.sill - 2})`);
    const slotLen = dist(gate.path[0], gate.path[g.slot.to]);
    if (g.bar.length < 1 || g.bar.length > 4) return fail(`The Gate's bar is ${g.bar.length} tiles long`);
    if (gate.rows.length !== 2 || gate.rows.some((s) => s <= g.bar.length || s >= slotLen)) return fail(`The Gate has ${gate.rows.length} rows of Blockages at ${gate.rows.join(", ")} (two, behind its bar, inside the slot)`);
    for (const l of plan.links) {
      // (the Veil's own mouth, from the cleft to its lip, is the crest's)
      if (l.id === g.gate || l.id === g.leat || l.id === g.veil || !l.path) continue;
      for (const p of l.path) {
        const [u, v] = onLocal(T, p);
        if (v >= bandAt(runs, u)[0] - 0.5) return fail(`${nameOf(plan, l.id)} crosses the wall`);
      }
    }
    return OK;
  },
};

/** `basin.bowl`, its plan half (§5.1): the rim, 12 or more, in two pieces along the basin's far edges from the wall's
 *  back on each side to the one notch on the far edge; the Gate and the leat both leave by that notch. */
const basinBowl: Invariant = {
  id: "basin.bowl",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const T = turnOf(plan, g);
    const N = plan.W;
    const runs = localRuns(plan, g);
    const rims = g.rims.map((id) => plan.ridges.find((r) => r.id === id));
    if (rims.length !== 2 || rims.some((r) => !r)) return fail("The rim is not two pieces about the notch");
    const notch = onLocal(T, g.notch.at);
    if (Math.abs(notch[1] - N) > 0.01) return fail("The notch is not on the basin's far edge");
    if (g.notch.width < NOTCH - 2 || g.notch.width > NOTCH + 2) return fail(`The notch is ${g.notch.width} wide (${NOTCH - 2} to ${NOTCH + 2})`);
    const ends: number[] = [];
    for (const r of rims as Ridge[]) {
      if (r.top < g.rim) return fail(`Ridge ${r.id} stands at ${r.top}, under the rim (${g.rim})`);
      const pts = r.path.map((p) => onLocal(T, p));
      const side = pts.find((p) => p[0] < r.half + 0.01 || p[0] > N - r.half - 0.01);
      if (!side) return fail(`Ridge ${r.id} does not run down the basin's side`);
      const back = bandAt(runs, side[0])[1];
      if (!pts.some((p) => Math.abs(p[0] - side[0]) < 0.01 && p[1] <= back + 2)) return fail(`Ridge ${r.id} does not reach the wall's back`);
      const far = pts.filter((p) => p[1] >= N - r.half - 0.01).map((p) => p[0]);
      if (!far.length) return fail(`Ridge ${r.id} does not run along the far edge`);
      ends.push(notch[0] < Math.min(...far) ? Math.min(...far) - r.half : Math.max(...far) + r.half);
    }
    const gap = Math.abs(ends[0] - ends[1]);
    if (!(Math.min(...ends) <= notch[0] && notch[0] <= Math.max(...ends)) || gap < g.notch.width || gap > g.notch.width + 2) return fail(`The rim's gap is ${gap.toFixed(1)} tiles about the notch (${g.notch.width} to ${g.notch.width + 2})`);
    for (const id of [g.gate, g.leat]) if (linkOf(plan, id)?.to !== "notch" || !plan.exits.some((e) => e.id === "notch")) return fail(`${nameOf(plan, id)} does not leave by the notch`);
    return OK;
  },
};

/** `start.neck`, its plan half (§5.1): the Still Pool, 12 tiles or more, beside the start, joined to the lake by its
 *  inlet alone, 3 wide at most and 3.5 long at most, a gate on it and the first rung's levee of 3 or fewer there. */
const startNeck: Invariant = {
  id: "start.neck",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const k = bodyOf(plan, g.kettle);
    const lake = bodyOf(plan, g.lake);
    if (!k || !lake) return fail("The plan has no Still Pool");
    const area = countTiles(k);
    if (area < NECK.least) return fail(`${nameOf(plan, k.id)} holds ${area} tiles (${NECK.least} at least)`);
    const s = plan.frame.start;
    if (bodyDist(s.x + 0.5, s.y + 0.5, k) > 12) return fail(`${nameOf(plan, k.id)} is not beside the start`);
    const joins = plan.links.filter((l) => l.from === k.id || l.to === k.id);
    if (joins.length !== 1 || joins[0].id !== g.inlet) return fail(`${nameOf(plan, k.id)} is joined to the river by ${joins.length} ways, not its inlet alone`);
    const inlet = joins[0];
    if (inlet.from !== g.lake || !inlet.wet || !inlet.gates.length) return fail(`${nameOf(plan, inlet.id)} is not a wet, gated way from the lake`);
    if (2 * (inlet.half ?? 0) > NECK.wide) return fail(`${nameOf(plan, inlet.id)} is ${2 * (inlet.half ?? 0)} wide (${NECK.wide} at most)`);
    const long = bodyGap(lake, k);
    if (long > NECK.long) return fail(`${nameOf(plan, inlet.id)} is ${long.toFixed(1)} tiles long (${NECK.long} at most)`);
    const levee = plan.works.find((w) => w.on === inlet.id && w.rung === "first" && w.kind === "levee");
    if (!levee || levee.tiles > NECK.levee) return fail(`No first levee of ${NECK.levee} or fewer on ${nameOf(plan, inlet.id)}`);
    return OK;
  },
};

/** The tiles inside a body's outline. */
function countTiles(b: Body): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arm of b.arms)
    for (const [x, y, r] of arm) {
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
  let n = 0;
  for (let j = Math.floor(y0); j <= y1; j++) for (let i = Math.floor(x0); i <= x1; i++) if (bodyDist(i + 0.5, j + 0.5, b) < 0) n++;
  return n;
}

/** `leat.own`, its plan half (§5.1): the leat leaves the cleft on the side away from the Gate, rides the crest band to
 *  the Pass (its bed from a level under the springs to a level under the Pass), and keeps 4 tiles or more from the
 *  Gate's slot; a bar and a row of Blockages at its head; the Pass's dip on the crest away from the Gate. */
const leatOwn: Invariant = {
  id: "leat.own",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const leat = linkOf(plan, g.leat);
    const gate = linkOf(plan, g.gate);
    const pool = bodyOf(plan, g.pool);
    if (!leat?.path || !Array.isArray(leat.bed) || !gate?.path || !pool) return fail("The plan has no leat");
    if (leat.from !== g.pool || leat.wet || leat.kind !== "leat") return fail(`${nameOf(plan, leat.id)} is not a dry leat from ${nameOf(plan, g.pool)}`);
    if (2 * (leat.half ?? 0) > 1) return fail(`${nameOf(plan, leat.id)} is ${2 * (leat.half ?? 0)} wide (one)`);
    if (leat.rows.length !== 1 || leat.rows[0] > LEAT_ROW) return fail(`${nameOf(plan, leat.id)} has ${leat.rows.length} rows of Blockages (one, at its head behind its bar)`);
    const T = turnOf(plan, g);
    const runs = localRuns(plan, g);
    const gu = onLocal(T, gate.path[0])[0];
    const head = onLocal(T, leat.path[0]);
    const pass = onLocal(T, leat.path[g.passAt]);
    if (Math.sign(pass[0] - head[0]) === Math.sign(gu - head[0])) return fail(`${nameOf(plan, leat.id)} runs toward the Gate`);
    for (let k = 0; k < g.passAt; k++) {
      const [a, b] = [onLocal(T, leat.path[k]), onLocal(T, leat.path[k + 1])];
      for (let s = 0; s <= 1; s += 0.25) {
        const u = a[0] + (b[0] - a[0]) * s;
        const v = a[1] + (b[1] - a[1]) * s;
        const [lo, hi] = bandAt(runs, u);
        if (v < lo + 1 || v > hi - 1) return fail(`${nameOf(plan, leat.id)} leaves the crest before ${nameOf(plan, "pass")}`);
      }
    }
    if (leat.bed[0] !== pool.sill - 1) return fail(`${nameOf(plan, leat.id)}'s bed starts at ${leat.bed[0]}, not a level under the springs (${pool.sill - 1})`);
    if (leat.bed[g.passAt] !== g.pass - 1) return fail(`${nameOf(plan, leat.id)}'s bed is ${leat.bed[g.passAt]} at the Pass, not a level under it (${g.pass - 1})`);
    const slot = gate.path.slice(0, g.slot.to + 1);
    for (const p of leat.path.slice(0, leat.path.length - 1)) if (pathDist(p[0], p[1], slot).d < 4 + (gate.half ?? 0)) return fail(`${nameOf(plan, leat.id)} meets the Gate's slot`);
    const span = g.passSpan.map((p) => onLocal(T, p)[0]);
    if (pass[0] < Math.min(...span) - 0.01 || pass[0] > Math.max(...span) + 0.01) return fail(`${nameOf(plan, leat.id)} leaves the crest outside the Pass`);
    return OK;
  },
};

/** `valley.enclosed`, its plan half (§5.1): the Low River is the valley's one wet way out, a gorge through the spur
 *  ridge, which stands three over the megadam's water and meets the wall's face; every other edge the valley touches
 *  rises (a "ridge" edge); the Gate, the valley's dry way out, is barred; the megadam on the gorge on the large rung. */
const valleyEnclosed: Invariant = {
  id: "valley.enclosed",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const low = linkOf(plan, g.low);
    if (!low?.path || low.kind !== "gorge" || !low.wet || low.from !== g.lake) return fail("The Low River is not a gorge out of the lake");
    const valley = new Set(plan.bodies.filter((b) => b.id !== g.pool).map((b) => b.id));
    const exits = new Set(plan.exits.map((e) => e.id));
    for (const l of plan.links) {
      if (!valley.has(l.from) || !l.wet || l.id === g.low) continue;
      const down = reach(plan, [l.to], (x) => x.wet && x.id !== g.low);
      down.add(l.to);
      if ([...down].some((id) => exits.has(id))) return fail(`${nameOf(plan, l.id)} lets the valley's water out besides the Low River`);
    }
    const gate = linkOf(plan, g.gate);
    if (!gate || gate.wet || !(g.bar.level > g.sill)) return fail("The Gate is not barred");
    const spur = plan.ridges.find((r) => r.id === g.spur);
    if (!spur) return fail("No spur for the Low River to cut");
    if (spur.top < g.megadam + 3) return fail(`The spur stands at ${spur.top}, under the megadam's water + 3 (${g.megadam + 3})`);
    if (pathDist(spur.path[0][0], spur.path[0][1], low.path).d > 40 && !low.path.some((p) => pathDist(p[0], p[1], spur.path).d < 1)) return fail("The Low River does not cut through the spur");
    const T = turnOf(plan, g);
    const runs = localRuns(plan, g);
    const top = onLocal(T, spur.path[0]);
    if (Math.abs(top[1] - runAt(runs, top[0]).v) > 1) return fail("The spur does not meet the wall's face");
    const lowExit = plan.exits.find((e) => e.id === low.to);
    if (!lowExit) return fail("The Low River leads to no exit");
    const valleyEdges = (["S", g.lowSide === "pass" ? "W" : "E", g.lowSide === "pass" ? "E" : "W"] as Edge[]).map((e) => edgeOnMap(T, e));
    for (const e of valleyEdges) if (e !== lowExit.edge && plan.edges[e] !== "ridge") return fail(`The valley's ${e} edge ${plan.edges[e]}, where it must rise`);
    const mega = plan.works.find((w) => w.kind === "megadam");
    if (!mega || mega.on !== g.low || mega.rung !== "large") return fail("No megadam on the Low River on the large rung");
    return OK;
  },
};

/** `gate.ladder` (§5.1's rungs): the first rung, the Still Pool's levee, inside the first frame; the Gate opened and the
 *  leat opened on the medium rung, needing nothing; the Gate made whole (the Low River levee'd) after the Gate is
 *  opened; the leat's whole share after its first; the megadam large. */
const gateLadder: Invariant = {
  id: "gate.ladder",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const find = (kind: Work["kind"], on: string, rung: Work["rung"]) => plan.works.filter((w) => w.kind === kind && w.on === on && w.rung === rung);
    const neck = find("levee", g.inlet, "first")[0];
    if (!neck) return fail("No first rung on the Still Pool's inlet");
    const s = plan.frame.start;
    const p = frameAt(openingCamera(s), neck.at[0] + 0.5, neck.at[1] + 0.5, s.z);
    if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) return fail("The first rung does not stand inside the first frame");
    const open = find("canal", g.gate, "medium")[0];
    if (!open || open.needs.length) return fail("The Gate is not opened on the medium rung, needing nothing");
    const whole = plan.works.find((w) => w.on === g.low && w.kind === "levee");
    if (!whole || !whole.needs.includes(open.id)) return fail("The Low River's levee does not follow the Gate's opening");
    const leat1 = find("leat", g.leat, "medium")[0];
    const leat2 = find("leat", g.leat, "large")[0];
    if (!leat1 || leat1.needs.length) return fail("The leat is not opened on the medium rung, needing nothing");
    if (!leat2 || !leat2.needs.includes(leat1.id)) return fail("The leat's whole share does not follow its opening");
    for (const w of plan.works) if (w.gives.green[1] > 0.12 * plan.W * plan.H) return fail(`Work ${w.id} would green ${w.gives.green[1]} tiles, over 12 % of the map`);
    return OK;
  },
};

/** `gate.skeleton`: the five regions of §5.1 (the start's bench, the valley, the wall, the Gate's canvas, the far side,
 *  which is dry for good), the wall a ridge of role wall at the crest's level, the rim skyline pieces, the spur. */
const gateSkeleton: Invariant = {
  id: "gate.skeleton",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const roles = new Set(plan.regions.map((r) => r.role));
    for (const r of ["home", "low", "wet", "top", "dry"] as const) if (!roles.has(r)) return fail(`No ${r} region`);
    if (plan.regions.find((r) => r.role === "dry")?.dayOne !== "dryForGood") return fail("The basin's far side is not dry for good");
    const wall = plan.ridges.find((r) => r.id === g.wall);
    if (!wall || wall.role !== "wall" || wall.top !== g.crest) return fail("No wall at the crest's level");
    for (const r of plan.ridges) if (r.top > (plan.sky ?? plan.top)) return fail(`Ridge ${r.id} rises to ${r.top}, over the highest ground`);
    return OK;
  },
};

/** The longest straight run of a course: the longest stretch whose every point stands within 0.75 of the chord between
 *  its ends. */
export function longestStraight(path: readonly Point[]): number {
  let best = 0;
  for (let i = 0; i + 1 < path.length; i++)
    for (let j = i + 1; j < path.length; j++) {
      const a = path[i];
      const b = path[j];
      let straight = true;
      for (let k = i + 1; k < j && straight; k++) if (segDist(path[k][0], path[k][1], a[0], a[1], b[0], b[1]).d > 0.75) straight = false;
      if (!straight) break;
      best = Math.max(best, dist(a, b));
    }
  return best;
}

/** `water.meander` (planning 2026-11-11: "drawn with a ruler"): the valley's brooks and the basin's two dry beds run
 *  straight for 8 tiles at most (the beds' last tiles through the rim's notch aside). */
const waterMeander: Invariant = {
  id: "water.meander",
  at: "plan",
  test({ plan }) {
    const g = gateOf(plan);
    if (!g) return fail("The plan has no wall with one gate");
    const courses: [string, Point[]][] = [];
    for (const l of plan.links) if (l.kind === "brook" && l.path) courses.push([l.id, l.path]);
    const gate = plan.links.find((l) => l.id === g.gate)?.path;
    const leat = plan.links.find((l) => l.id === g.leat)?.path;
    if (gate) courses.push([g.gate, gate.slice(g.slot.to, gate.length - 1)]);
    if (leat) courses.push([g.leat, leat.slice(g.passAt + 1, leat.length - 1)]);
    for (const [id, p] of courses) {
      const s = longestStraight(p);
      if (s > MEANDER_STRAIGHT) return fail(`${nameOf(plan, id)} runs straight for ${s.toFixed(1)} tiles (${MEANDER_STRAIGHT} at most)`);
    }
    return OK;
  },
};
export const MEANDER_STRAIGHT = 8;

const gatePlanInvariants: Invariant[] = [waterMeander, gateLevels, wallGrid, wallCamera, frameLip, gateSlot, basinBowl, startNeck, leatOwn, valleyEnclosed, gateLadder, gateSkeleton];

// ------------------------------------------------------------------------------------------------- the def

const invariants: Invariant[] = [...PLAN_CHECKS, ...gatePlanInvariants, ...GATE_WATER_CHECKS];

/** The first `plan` invariant a plan fails, as "id: reason", or null. */
function planFailure(spec: MapSpec, plan: PremisePlan): string | null {
  for (const inv of invariants) {
    if (inv.at !== "plan") continue;
    const r = inv.test({ spec, plan });
    if (!r.ok) return `${inv.id}: ${r.reason}`;
  }
  return null;
}

/** One layout try's plan (or why it stopped) and the first `plan` invariant it fails: for the tools. */
export function gateLayoutTry(spec: MapSpec, attempt: number, t: number): { plan: PremisePlan | null; failed: string | null } {
  const r = layout(spec, attempt, t);
  if ("why" in r) return { plan: null, failed: `layout: ${r.why}` };
  const plan = r.plan as unknown as PremisePlan;
  return { plan, failed: planFailure(spec, plan) };
}

/** One attempt: a layout try at a time from its own stream, the first whose plan passes every `plan` invariant. */
function draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string } {
  const why = wallGateEligible(spec);
  if (why) return { reason: why };
  let last = "";
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const r = gateLayoutTry(spec, attempt, t);
    if (r.plan && !r.failed) return r.plan;
    last = r.failed ?? "";
  }
  return { reason: `No wall with one gate fits seed ${spec.seed} at ${spec.size.x}² in ${LAYOUT_TRIES} layouts (${last})` };
}

/** The premise's definition, for the shared stage functions (`draw.ts` `firstPlan`, `failing`). Its id is outside
 *  `PremiseId` until it is offered (`premises/dev.ts`), hence the one cast here. */
export const wallGate: PremiseDef = {
  id: GATE_ID as unknown as PremiseDef["id"],
  eligible: wallGateEligible,
  draw,
  invariants,
};
