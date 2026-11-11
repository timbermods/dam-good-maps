// The lake stair (docs/PREMISES.md §4): Four Lakes, generalised. "Lakes step down a valley, each over a rock sill
// and a fall. The badtide comes down the whole stair within a day, unless you open the old dry channel and shut the
// gates at the springs: then it runs round every lake."
//
// Stage 0 only (build step 1): `eligible`, `draw` (the plan, by arithmetic, from the stream `premise.plan`) and the
// `plan` invariants of §4.4 with §1.4's checks. The seed varies structure first (§4.4: n and f, the valley's line,
// which lake is the start's, where the landmark comes from, the bypass's side and exit, the works and the tarn
// chains), then outline and names. The later stages' invariants come with their stages.

import { openingCamera, frameAt } from "../../analysis/opening";
import { ORIENTATIONS } from "../../format/footprints";
import { cos, sin, sqrt } from "../../math/portable";
import type { Rng } from "../../math/rng";
import { BED_FLOOR } from "../../land/genome";
import { sillWidthFor, MAX_SILL_WIDTH } from "../../sim/sill";
import type { MapSpec } from "../../spec/mapspec";
import { premiseStream } from "../draw";
import { FRAME, frameLimit, frameWidthAt, lipInFrame } from "../frame";
import { bodyDist, bodyGap, dist, dist2, segDist, edgeGap, headingOf, norm, outlinePoints, unitAt, pathBodyGap, pathDist, pathGap, pathLength, pointAt, squareClear, subPath } from "../geom";
import { BODY_GAP, fail, linksFrom, nameOf, OK, PLAN_CHECKS, reach } from "../planChecks";
import { WATER_CHECKS } from "../waterChecks";
import type { Body, Edge, Exit, Fall, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, SetPiece, Source, Spine, StairPlan, Work } from "../types";

// ------------------------------------------------------------------------------------------------- the ranges

/** Square maps, 128² to 256² (PREMISES §4.1; ruling 7: squares only for now). */
export const STAIR_SIDE = [128, 256] as const;
/** The springs' total strength by River flow. */
export const STAIR_FLOW = { trickle: 10, normal: 14, strong: 18, lush: 22 } as const;
/** The meadow's base width by Buildable land. */
export const STAIR_MEADOW = { tight: 12, normal: 15, generous: 18 } as const;
/** The start's bench, level tiles, by Buildable land (580 to 980 in all). */
const BENCH = { tight: [580, 720], normal: [640, 860], generous: [760, 980] } as const;
/** Levels between sills. */
export const STAIR_STEPS = [3, 4, 5] as const;
/** The landmark's height (planning's ruling 3): 8 waits for a judged variant with the bench two over its lake. */
export const LANDMARK_HEIGHTS = [6, 7] as const;
/** The landmark's lip, tiles. */
export const LANDMARK_LIP = [10, 14] as const;
/** The hanging valley's length, tiles. */
export const HANGING_VALLEY = [20, 40] as const;
/** How far along the hanging valley its weir and the bed in front of it run, past which it keeps clear of its source. */
const VALLEY_HEAD = 7;
/** How far the hanging valley's head keeps from a stair fall's lip, past its own half-width: the fall's shoulders and
 *  the bed behind its crest, which its raster lays after the weir's. */
const LIP_CLEAR = 9;
/** How far the hanging valley's bed falls from its source's sill to the lip (assumption: riffles of a level each, so
 *  a landmark of 6 or 7 has a source on most steps; PREMISES §4.1 asks a source `H` or more above): at least a
 *  level, since a level valley takes a third more or less than the table's share from a lake, 16 % less from the
 *  springs' pool (the weir at its head drowned by the lip at its level, §2.2 "As built (step 2)"). */
export const VALLEY_DROP = { lake: [1, 3], pool: [1, 3] } as const;
/** The lowest lake's sill: the gorge's bed stands on the floor (`BED_FLOOR`, D325: the deepest bed three levels over
 *  the map's floor), the gorge's fall two under the sill. */
export const STAIR_BASE = BED_FLOOR + 2;
/** The lowest lake's depth, its bed on the floor: it carries the whole of the springs, the stair's and the landmark's,
 *  to the gorge, and a level deep it stood 0.7 over its level at the far end (seed 12 at 256², §2.2 "As built (step
 *  2)"). */
export const LOW_DEEP = STAIR_BASE - BED_FLOOR;
/** The valley's line, over the side. */
export const VALLEY_LENGTH = [1.25, 1.5] as const;
/** The bypass's length at 192² (scaled by side), its mouth and its rows. */
/** The megadam's slot through the wall, in tiles (§4.1). */
export const MEGADAM_SLOT = [5, 6] as const;
export const BYPASS_LENGTH = [250, 330] as const;
export const BYPASS_MOUTH = 10;
const BYPASS_HALF = 2.6;
/** Lake arms' radius (each arm's widest), and arms a lake. */
export const ARM_RADIUS = [7, 15] as const;
export const ARMS = [2, 5] as const;
/** The springs' pool: sources in it. */
export const POOL_SOURCES = [3, 5] as const;
/** A spring tarn's own spring. */
export const TARN_SPRING = [0.8, 1.5] as const;
/** The gates the player shuts to send the badtide round (§4.1: the neck, the hanging valley, each leat's head). */
export const GATES = [3, 4] as const;
/** The widest a gate is: a channel at most 5 wide. */
export const GATE_WIDTH = 5;
/** The small irrigation works at 192², scaled by area (§4.4 `spectrum`), and how many within the start's walk. */
export const SMALL_WORKS = [6, 8] as const;
export const SMALL_KINDS = ["notch", "damToPond", "levee"] as const;
export const NEAR_WORKS = 3;
export const NEAR_WALK = 40;
/** Side bodies placed near the start first, so its walk has its three small works. */
const NEAR_SIDE = 3;
/** The shortest dry bed with room for a dam to pond: a narrows and 8 tiles of bench beside it. */
const DAM_BED = 12;

/** The tile area over 192²'s: counts and gains scale by it (§4.2, §4.4). */
const areaRatio = (W: number, H: number) => (W * H) / (192 * 192);
/** The least ground between a lake and the map's edge: 10 at 192², by side (room for a meadow and a rim). */
const lakeEdge = (W: number) => Math.max(6, Math.round((10 * W) / 192));

function lakeCounts(spec: MapSpec): number[] {
  const side = spec.size.x;
  const all = side < 160 ? [3] : side < 224 ? [4] : [4, 5];
  if (all.length > 1 && spec.settings.water.lakes === "few") return [all[0]];
  if (all.length > 1 && spec.settings.water.lakes === "many") return [all[all.length - 1]];
  return all;
}

/** The tarns a size has: 3 at 128², 7 at 192², 12 at 256² (§4.1), by area between, one more or fewer for Lakes and
 *  Variety. */
function tarnCount(spec: MapSpec): number {
  const a = areaRatio(spec.size.x, spec.size.y);
  let n = a <= 1 ? 3 + ((a - 0.4444) / 0.5556) * 4 : 7 + ((a - 1) / 0.7778) * 5;
  if (spec.settings.water.lakes === "few") n -= 1;
  if (spec.settings.water.lakes === "many") n += 1;
  if (spec.settings.terrain.variety >= 85) n += 1;
  if (spec.settings.terrain.variety < 40) n -= 1;
  return Math.max(3, Math.round(n));
}

interface StairOption {
  n: number;
  f: number;
  /** The start's lake, from the bottom. */
  k: number;
  H: number;
}

/** A landmark of `H` into a lake on sill `F` has a source, the pool or a lake, on sill `F + H + 1` to `F + H + 3`
 *  (`VALLEY_DROP`). */
const sourceFits = (F: number, H: number, sill: number, pool: boolean) => {
  const [lo, hi] = pool ? VALLEY_DROP.pool : VALLEY_DROP.lake;
  return sill >= F + H + lo && sill <= F + H + hi;
};

/** Every (n, f, start's lake, H) the spec's size and highest ground allow, with a landmark source on the stair. Where
 *  the floor leaves the size's stair one step `f` at most (4 lakes under highest ground 17: `STAIR_BASE`), a stair of
 *  one lake fewer is offered beside it, so the seed still varies the step (§4.1). */
export function stairOptions(spec: MapSpec): StairOption[] {
  const top = spec.settings.terrain.highestTerrain;
  const counts = lakeCounts(spec);
  const out: StairOption[] = [];
  const add = (n: number) => {
    for (const f of STAIR_STEPS) {
      if (STAIR_BASE + (n - 1) * f + 2 > top) continue;
      for (const k of [0, 1])
        for (const H of LANDMARK_HEIGHTS) {
          const F = STAIR_BASE + k * f;
          let ok = sourceFits(F, H, STAIR_BASE + (n - 1) * f, true);
          for (let j = k + 1; j < n; j++) if (sourceFits(F, H, STAIR_BASE + j * f, false)) ok = true;
          if (ok) out.push({ n, f, k, H });
        }
    }
  };
  for (const n of counts) add(n);
  const least = Math.min(...counts);
  if (least > 3 && new Set(out.map((o) => o.f)).size < 2) add(least - 1);
  return out;
}

export function lakeStairEligible(spec: MapSpec): string | null {
  const { x, y } = spec.size;
  if (x !== y) return "The lake stair is drawn on square maps only, for now";
  if (x < STAIR_SIDE[0]) return `The lake stair needs at least ${STAIR_SIDE[0]} tiles a side for three lakes with meadows`;
  if (x > STAIR_SIDE[1]) return `The lake stair is drawn up to ${STAIR_SIDE[1]} tiles a side`;
  if (spec.settings.start.easyStart) return "Easy start is not offered with the lake stair yet";
  if (spec.settings.water.lakes === "none") return "The lake stair needs lakes, and Lakes is None";
  if (spec.settings.water.waterfalls === "off") return "The lake stair needs waterfalls, and Waterfalls is Off";
  if (spec.settings.water.sources === "none") return "The lake stair needs its springs, and Sources is None";
  if (!stairOptions(spec).length) return `Highest terrain ${spec.settings.terrain.highestTerrain} is too low for a stair of ${lakeCounts(spec)[0]} lakes with its landmark`;
  return null;
}

// ------------------------------------------------------------------------------------------------- the valley

type Shape = StairPlan["shape"];

/** The valley's line in a unit square, exit on the south edge (v = 0) to the springs, before its turn: a hook back
 *  to the start's lake (Four Lakes'), an S, or a diagonal whose head folds back beside the start. */
function template(shape: Shape, rng: Rng): Point[] {
  const j = (a: number) => a + rng.range(-0.035, 0.035);
  if (shape === "hook") {
    const u0 = rng.range(0.16, 0.3);
    return [[u0, 0], [j(u0 + 0.02), j(0.18)], [j(0.45), j(0.42)], [j(0.8), j(0.46)], [j(0.84), j(0.78)], [j(0.52), j(0.74)]];
  }
  if (shape === "S") {
    const u0 = rng.range(0.26, 0.38);
    return [[u0, 0], [j(u0), j(0.15)], [j(0.68), j(0.27)], [j(0.72), j(0.47)], [j(0.36), j(0.53)], [j(0.3), j(0.75)], [j(0.56), j(0.82)]];
  }
  const u0 = rng.range(0.14, 0.24);
  return [[u0, 0], [j(u0 + 0.04), j(0.16)], [j(0.42), j(0.4)], [j(0.7), j(0.66)], [j(0.64), j(0.86)], [j(0.44), j(0.74)], [j(0.34), j(0.6)]];
}

/** One of the square's eight symmetries (0–3 turns a quarter each, 4–7 the same mirrored), on a unit point. */
function turnPoint([u, v]: Point, turn: number): Point {
  let x = turn >= 4 ? 1 - u : u;
  let y = v;
  for (let k = 0; k < turn % 4; k++) {
    const nx = y;
    y = 1 - x;
    x = nx;
  }
  return [x, y];
}

/** Corners cut twice (Chaikin), the ends kept. */
function smooth(path: Point[], rounds = 2): Point[] {
  let p = path;
  for (let r = 0; r < rounds; r++) {
    const q: Point[] = [p[0]];
    for (let k = 0; k + 1 < p.length; k++) {
      const a = p[k];
      const b = p[k + 1];
      if (k > 0) q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      if (k + 2 < p.length) q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

const edgeOf = (p: Point, W: number, H: number): Edge => {
  const d = { S: p[1], N: H - p[1], W: p[0], E: W - p[0] };
  let best: Edge = "S";
  for (const e of ["S", "N", "W", "E"] as Edge[]) if (d[e] < d[best]) best = e;
  return best;
};

/** The nearest point on the map's edge. */
const toEdge = (p: Point, W: number, H: number): Point => {
  const e = edgeOf(p, W, H);
  return e === "S" ? [p[0], 0] : e === "N" ? [p[0], H] : e === "W" ? [0, p[1]] : [W, p[1]];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const rp = (p: Point): Point => [r1(p[0]), r1(p[1])];

/** How far a corner of the bypass's course is cut back each way: a turn sharper than `SOFT_TURN` becomes two, so the
 *  old channel never turns a right angle (D208; stage 1 wanders it). */
const SOFT_CUT = 5;
const SOFT_TURN = 0.75;

/** A path with each sharp corner cut: the corner replaced by two points `SOFT_CUT` (or under half a leg) back along
 *  its legs. */
function softCorners(path: Point[]): Point[] {
  const out: Point[] = [path[0]];
  for (let k = 1; k + 1 < path.length; k++) {
    const [a, b, c] = [path[k - 1], path[k], path[k + 1]];
    const u = norm([b[0] - a[0], b[1] - a[1]]);
    const v = norm([c[0] - b[0], c[1] - b[1]]);
    if (u[0] * v[0] + u[1] * v[1] > SOFT_TURN) {
      out.push(b);
      continue;
    }
    const ca = Math.min(SOFT_CUT, dist(a, b) * 0.45);
    const cb = Math.min(SOFT_CUT, dist(b, c) * 0.45);
    out.push(rp([b[0] - u[0] * ca, b[1] - u[1] * ca]), rp([b[0] + v[0] * cb, b[1] + v[1] * cb]));
  }
  out.push(path[path.length - 1]);
  return out;
}

// ------------------------------------------------------------------------------------------------- names

const LAKE_WORDS = ["Reed", "Mill", "Steam", "Heron", "Glass", "Alder", "Otter", "Willow", "Stone", "Mirror", "Kettle", "Moss"];
const TOP_WORDS = ["Crown", "High", "Head", "Cloud"];
const TARN_WORDS = ["Birch", "Hill", "Fell", "Gate", "Bench", "Crag", "Heather", "Sedge", "Rowan", "Larch", "Peat", "Bracken", "Thorn", "Hazel", "Linden", "Pike"];
const LANDMARK_NAMES = ["the Great Fall", "the Long Drop", "the Veil", "the White Stair", "the Hanging Fall"];
const POOL_NAMES = ["the springs' pool", "the Wellhead", "the Spring Pool"];
const BYPASS_NAMES = ["the old channel", "the Old Cut", "the dry aqueduct"];
const COUNT = ["", "One", "Two", "Three", "Four", "Five"];

// ------------------------------------------------------------------------------------------------- the draw

/** Layout tries inside one attempt: arithmetic only, so cheap; a try that fails a check is drawn again. */
const LAYOUT_TRIES = 48;

interface Layout {
  W: number;
  rng: Rng;
  spec: MapSpec;
  plan: PremisePlan;
  stair: StairPlan;
  lakes: Body[];
  pool: Body;
  /** Arc length of the valley where each lake begins and ends. */
  spans: [number, number][];
  /** The basins a leat from the springs' pool fills. */
  poolBasins: Set<string>;
}

/** A channel's path stays clear of every body but its own ends, of other channels and of the start. */
function clearPath(plan: PremisePlan, path: Point[], half: number, ends: string[], others: Point[][], room = 3, startRoom = 8): boolean {
  const len = pathLength(path);
  for (const b of plan.bodies) {
    const own = ends.includes(b.id);
    const lim = half + (own ? 0 : room);
    if (pathBodyGap(path, b, own ? 2.5 : 0, own ? len - 2.5 : Infinity, lim) < lim) return false;
  }
  const mid = len > 8 ? subPath(path, 3, len - 3) : path;
  for (const o of others) if (pathGap(mid, o, half + room) < half + room) return false;
  const s = plan.frame.start;
  if (s.z >= 0 && pathDist(s.x, s.y, path).d < half + startRoom) return false;
  for (let k = 0; k < path.length; k++) {
    const [x, y] = path[k];
    if (x < -0.01 || y < -0.01 || x > plan.W + 0.01 || y > plan.H + 0.01) return false;
  }
  return true;
}

function emptyPlan(spec: MapSpec): PremisePlan {
  const W = spec.size.x;
  return {
    premise: "lakeStair",
    seed: spec.seed,
    W,
    H: spec.size.y,
    top: spec.settings.terrain.highestTerrain,
    line: "",
    sources: [],
    bodies: [],
    links: [],
    exits: [],
    regions: [],
    ridges: [],
    edges: { N: "falls away", E: "falls away", S: "falls away", W: "falls away" },
    frame: { start: { x: 0, y: 0, z: -1, orientation: "Cw0" }, landmark: "", lipAhead: 0, bench: 0 },
    works: [],
    setPieces: [],
    names: {},
  };
}

/** The lake counts a spec's stair may have, and the attempt's: drawn once an attempt, so a count that lays out more
 *  easily does not crowd out the other over the layout tries. */
function lakeCountOf(spec: MapSpec, attempt: number): number {
  const ns = [...new Set(stairOptions(spec).map((o) => o.n))];
  return ns.length > 1 ? premiseStream(spec, "premise.plan", attempt, "n").pick(ns) : ns[0];
}

/** The structure (§4.4, varied first): n (the attempt's), f, the start's lake and the landmark's height; the valley's
 *  shape and turn. */
function drawStructure(spec: MapSpec, rng: Rng, n: number): StairOption & { shape: Shape; turn: number } {
  const options = stairOptions(spec);
  const vt = spec.settings.terrain.verticality;
  const fs = [...new Set(options.filter((o) => o.n === n).map((o) => o.f))];
  const f = fs[rng.weighted(fs.map((x) => (x === 3 ? 100 - vt : x === 4 ? 50 : vt) + 5))];
  const o = rng.pick(options.filter((p) => p.n === n && p.f === f));
  const shapes: Shape[] = ["hook", "S", "diagonal"];
  const shape = shapes[rng.weighted([2, 1, 1])];
  return { ...o, shape, turn: rng.int(0, 8) };
}

/** The valley's line on the map, and its length in range, or null. */
function drawValley(W: number, shape: Shape, turn: number, rng: Rng): Point[] | null {
  const pts = smooth(template(shape, rng).map((p) => turnPoint(p, turn)).map(([u, v]) => [u * W, v * W] as Point));
  const len = pathLength(pts);
  if (len < VALLEY_LENGTH[0] * W || len > VALLEY_LENGTH[1] * W) return null;
  return pts;
}

/** A lake's main arm along the valley from arc `a` to `b`, the radius varying along it. */
function drawLake(L: Layout, id: string, index: number, a: number, b: number, sill: number): Body | null {
  const { rng, W } = L;
  const valley = L.stair.valley;
  const rMost = Math.min(ARM_RADIUS[1], 7 + W / 24);
  const ra = rng.range(7, 9.5);
  const rb = rng.range(7, 9.5);
  const s0 = a + ra;
  const s1 = b - rb;
  if (s1 - s0 < 6) return null;
  const steps = Math.max(1, Math.round((s1 - s0) / 11));
  const main: Spine = [];
  for (let k = 0; k <= steps; k++) {
    const s = s0 + ((s1 - s0) * k) / steps;
    const r = k === 0 ? ra : k === steps ? rb : rng.range(8, rMost);
    const { p } = pointAt(valley, s);
    main.push([r1(p[0]), r1(p[1]), r1(r)]);
  }
  return { id, kind: "lake", sill, arms: [main], meadow: L.stair.meadow + rng.int(-2, 3), deep: Math.min(sill - BED_FLOOR, index === 0 ? LOW_DEEP : rng.int(3, 6)), dry: false, region: "top" };
}

/** Side arms off a lake's main arm (2 to 5 arms in all): coves and bays, kept where they stay clear of every other
 *  body, the map's edge and the valley's line outside the lake's own stretch. */
function addArms(L: Layout, body: Body, span: [number, number]): boolean {
  const { rng, W } = L;
  const valley = L.stair.valley;
  const main = body.arms[0];
  const want = rng.int(ARMS[0] - 1, ARMS[1]);
  for (let t = 0; t < want * 5 && body.arms.length < want + 1; t++) {
    const j = rng.int(0, main.length);
    const base = main[j];
    const pa = main[Math.max(0, j - 1)];
    const pb = main[Math.min(main.length - 1, j + 1)];
    const dir = norm([pb[0] - pa[0], pb[1] - pa[1]]);
    const turn = rng.range(0.55, 1.25) * (rng.float() < 0.5 ? 1 : -1);
    // the arm's heading: the valley's turned by `turn` radians
    const c = cos(turn);
    const sn = sin(turn);
    const d: Point = [dir[0] * c - dir[1] * sn, dir[0] * sn + dir[1] * c];
    const len = rng.range(8, 20);
    const rBase = Math.max(7, Math.min(base[2], rng.range(7, base[2])));
    const tip = rng.range(4, 6.5);
    const mid: Point = [base[0] + d[0] * len * 0.55, base[1] + d[1] * len * 0.55];
    const end: Point = [base[0] + d[0] * len, base[1] + d[1] * len];
    const arm: Spine = [
      [base[0], base[1], r1(rBase)],
      [r1(mid[0]), r1(mid[1]), r1((rBase + tip) / 2 + 0.5)],
      [r1(end[0]), r1(end[1]), r1(tip)],
    ];
    const trial: Body = { ...body, arms: [arm] };
    if (edgeGap(trial, W, W) < lakeEdge(W)) continue;
    if (L.plan.bodies.some((o) => o.id !== body.id && bodyGap(o, trial, BODY_GAP + 3) < BODY_GAP + 3)) continue;
    // an arm never reaches over the valley's line beyond its own lake's stretch
    if (pathBodyGap(valley, trial, 0, span[0] - 3, 3) < 3 || pathBodyGap(valley, trial, span[1] + 3, Infinity, 3) < 3) continue;
    body.arms.push(arm);
  }
  return body.arms.length >= ARMS[0];
}

function addName(plan: PremisePlan, id: string, name: string): void {
  plan.names[id] = name;
}

/** The arc between the start's lake's middle stretch and a landmark source's (centre lines), within which a hanging
 *  valley of 20 to 40 tiles can join them: a lake source, and the springs' pool. */
const REACH_LAKE = [30, 66] as const;
const REACH_POOL = [22, 58] as const;
/** Weight draws for the lakes' stretches, and the shortest stretch (a main arm's two ends and a middle). */
const SPAN_TRIES = 40;
const SPAN_LEAST = 26;

/** The lakes' stretches of the valley's line, from arc `from` to `to` with `gaps` between: drawn so that lakes not
 *  next to each other stay apart where the line folds, and the start's lake comes within a hanging valley's reach of
 *  a landmark source (§4.1: the pool, or a lake `H` or more above). Null when no draw does. */
function drawSpans(L: Layout, o: StairOption, from: number, to: number, gaps: number[], pr: number): [number, number][] | null {
  const { rng, W } = L;
  const valley = L.stair.valley;
  const Lv = pathLength(valley);
  const { n, f, k, H } = o;
  const rMost = Math.min(ARM_RADIUS[1], 7 + W / 24);
  const room = to - from - gaps.reduce((s, x) => s + x, 0);
  const F = STAIR_BASE + k * f;
  const sourceLakes: number[] = [];
  for (let j = k + 1; j < n; j++) if (sourceFits(F, H, STAIR_BASE + j * f, false)) sourceLakes.push(j);
  const poolFits = sourceFits(F, H, STAIR_BASE + (n - 1) * f, true);
  const poolCore = subPath(valley, Lv - 2 * pr - 3, Lv);
  for (let t = 0; t < SPAN_TRIES; t++) {
    const weights = Array.from({ length: n }, () => rng.range(0.55, 1.6));
    const sumW = weights.reduce((s, x) => s + x, 0);
    const spans: [number, number][] = [];
    let at = from;
    for (let i = 0; i < n; i++) {
      const len = (room * weights[i]) / sumW;
      if (len < SPAN_LEAST) break;
      spans.push([at, at + len]);
      at += len + (gaps[i] ?? 0);
    }
    if (spans.length < n) continue;
    const cores = spans.map(([a, b]) => subPath(valley, a + 6, Math.max(a + 6.5, b - 6)));
    let apart = true;
    for (let i = 0; i < n && apart; i++) {
      for (let j = i + 2; j < n && apart; j++) if (pathGap(cores[i], cores[j], 2 * rMost + BODY_GAP + 2) < 2 * rMost + BODY_GAP + 2) apart = false;
      if (i < n - 1 && pathGap(cores[i], poolCore, rMost + pr + BODY_GAP + 3) < rMost + pr + BODY_GAP + 3) apart = false;
    }
    if (!apart) continue;
    const near = (d: number, [lo, hi]: readonly [number, number]) => d >= lo && d <= hi;
    if (sourceLakes.some((j) => near(pathGap(cores[k], cores[j]), REACH_LAKE)) || (poolFits && near(pathGap(cores[k], poolCore), REACH_POOL))) return spans;
  }
  return null;
}

/** The lakes, the pool, the stair's falls, the gorge, the neck and the springs, along the valley's line. */
function placeStair(L: Layout, o: StairOption): string | null {
  const { rng, plan, stair, W } = L;
  const valley = stair.valley;
  const Lv = pathLength(valley);
  const { n, f } = o;
  const g = Math.max(10, Math.min(20, 0.07 * W)) + rng.range(0, 4);
  const pr = rng.range(4, 5);
  const poolEdge = Lv - 2 * pr - 3;
  const neck = rng.range(9, 15);
  const gaps = Array.from({ length: n - 1 }, () => rng.range(6, 10));
  const spans = drawSpans(L, o, g + 3, poolEdge - neck, gaps, pr);
  if (!spans) return "placeStair#0";
  const names = rng.shuffle([...LAKE_WORDS]);
  for (let i = 0; i < n; i++) {
    const span = spans[i];
    const lake = drawLake(L, `lake${i}`, i, span[0], span[1], STAIR_BASE + i * f);
    if (!lake) return "placeStair#1";
    if (plan.bodies.some((b) => bodyGap(b, lake, BODY_GAP + 1) < BODY_GAP + 1)) return "placeStair#2";
    if (edgeGap(lake, W, W) < lakeEdge(W)) return "placeStair#3";
    plan.bodies.push(lake);
    L.lakes.push(lake);
    L.spans.push(span);
    addName(plan, lake.id, i === 0 ? "Low Lake" : i === n - 1 ? `${rng.pick(TOP_WORDS)} Lake` : `${names[i]} Lake`);
  }
  // the springs' pool at the line's head, at the top lake's level
  const pa = pointAt(valley, Lv - pr - 2.5).p;
  const pb = pointAt(valley, Lv - pr + 0.5).p;
  const top = L.lakes[n - 1];
  L.pool = { id: "pool", kind: "pool", sill: top.sill, arms: [[[r1(pa[0]), r1(pa[1]), r1(pr)], [r1(pb[0]), r1(pb[1]), r1(pr - 0.5)]]], meadow: 6, deep: 1, dry: false, region: "top" };
  if (plan.bodies.some((b) => bodyGap(b, L.pool, BODY_GAP + 2) < BODY_GAP + 2) || edgeGap(L.pool, W, W) < lakeEdge(W) - 2) return "placeStair#4";
  plan.bodies.push(L.pool);
  addName(plan, "pool", rng.pick(POOL_NAMES));
  for (let i = 0; i < n; i++) if (!addArms(L, L.lakes[i], L.spans[i])) return "placeStair#5";
  // the springs: 3 to 5 in the pool, the River flow's total shared in tenths
  const count = rng.int(POOL_SOURCES[0], POOL_SOURCES[1] + 1);
  const tenths = Math.round(stair.flow * 10);
  for (let k = 0; k < count; k++) {
    const t = (k + 0.5) / count;
    const p: Point = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
    const share = Math.floor(tenths / count) + (k < tenths % count ? 1 : 0);
    plan.sources.push({ id: `spring${k}`, at: rp(p), strength: share / 10, into: "pool" });
  }
  // the neck: the pool to the top lake, at the top level, a gate's width
  const neckPath = subPath(valley, L.spans[n - 1][1] - 2, poolEdge + 1.5).reverse().map(rp);
  plan.links.push({ id: "neck", from: "pool", to: top.id, kind: "channel", path: neckPath, half: 2.5, bed: neckPath.map(() => top.sill), wet: true, gates: [2], rows: [] });
  addName(plan, "neck", "the Neck");
  // the stair's falls: over each lake's sill into the one below, across the valley at the upper lake's foot
  const width = Math.max(8, Math.min(MAX_SILL_WIDTH, sillWidthFor(stair.flow)));
  for (let i = 0; i + 1 < n; i++) {
    const s = L.spans[i + 1][0] - 1;
    const { p, dir } = pointAt(valley, s);
    const across: Point = [-dir[1], dir[0]];
    const fall: Fall = {
      height: f,
      crest: L.lakes[i + 1].sill,
      width,
      face: headingOf(-dir[0], -dir[1]),
      lip: [rp([p[0] - (across[0] * width) / 2, p[1] - (across[1] * width) / 2]), rp([p[0] + (across[0] * width) / 2, p[1] + (across[1] * width) / 2])],
      notch: 1,
      piers: 0,
      breach: 0,
    };
    plan.links.push({ id: `fall${i + 1}`, from: L.lakes[i + 1].id, to: L.lakes[i].id, kind: "fall", fall, wet: true, gates: [], rows: [] });
    addName(plan, `fall${i + 1}`, `${plan.names[L.lakes[i + 1].id].replace(" Lake", "")} Fall`);
  }
  // the gorge: Low Lake's own wide sill, whole, then a slot through the closing ridge to the exit
  const exitAt = valley[0];
  const edge = edgeOf(exitAt, W, W);
  const exit: Exit = { id: "exit", edge, at: rp(toEdge(exitAt, W, W)) };
  plan.exits.push(exit);
  const lipS = L.spans[0][0] - 1.5;
  const { p: lp, dir: ld } = pointAt(valley, lipS);
  const lowWidth = Math.max(10, Math.min(MAX_SILL_WIDTH, sillWidthFor(stair.flow) + 2));
  const lowAcross: Point = [-ld[1], ld[0]];
  const gorgePath = subPath(valley, 0, lipS).reverse().map(rp);
  gorgePath[gorgePath.length - 1] = exit.at;
  plan.links.push({
    id: "gorge",
    from: L.lakes[0].id,
    to: exit.id,
    kind: "gorge",
    fall: {
      height: STAIR_BASE - BED_FLOOR,
      crest: STAIR_BASE,
      width: lowWidth,
      face: headingOf(-ld[0], -ld[1]),
      lip: [rp([lp[0] - (lowAcross[0] * lowWidth) / 2, lp[1] - (lowAcross[1] * lowWidth) / 2]), rp([lp[0] + (lowAcross[0] * lowWidth) / 2, lp[1] + (lowAcross[1] * lowWidth) / 2])],
      notch: 0,
      piers: 0,
      breach: 0,
    },
    path: gorgePath,
    // 5 wide carries about 13 a level deep (§2.2, stage 1: the stair's 15.5 runs 1.2 deep), 6 wide the lush 22 about
    // 1.5 deep: the megadam's slot is 5 or 6 (§4.1)
    half: stair.flow > 18 ? 3 : 2.5,
    bed: gorgePath.map(() => BED_FLOOR),
    wet: true,
    gates: [],
    rows: [],
  });
  addName(plan, "gorge", "the Gate Gorge");
  return null;
}

/** The nearest point on a spine's centre line to `q`, with the spine's radius there. */
function nearestOnSpine(spine: Spine, q: Point): [number, number, number] {
  let best: [number, number, number] = spine[0];
  let bd = Infinity;
  for (let k = 0; k + 1 < spine.length; k++) {
    const a = spine[k];
    const b = spine[k + 1];
    const { d, t } = segDist(q[0], q[1], a[0], a[1], b[0], b[1]);
    if (d < bd) {
      bd = d;
      best = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return best;
}

/** Candidate starts tried for each landmark source, and kept (the first that holds: a candidate holds one time in 30
 *  to 40, so keeping four to pick from cost most of stage 0's time, §3.3). */
const FRAME_TRIES = 120;
const FRAME_KEEP = 1;
/** The bay under the landmark: its end's radius, and the radius where it leaves its lake. */
const BAY_END = [3.2, 4.8] as const;
const BAY_ROOT = 7;

/** The start, its first frame and the landmark (§4.3), placed together: the lip across the look, 5.5 tiles or more in
 *  front of the start and under the frame's top edge, between the start's lake and the landmark's source; a bay of the
 *  lake under the lip, on the far side from the start, so the fall's foot opens to its lake; the hanging valley
 *  behind the lip to the source. */
function placeFrame(L: Layout, o: StairOption): string | null {
  const { rng, plan, stair, W } = L;
  const K = L.lakes[o.k];
  const F = K.sill;
  const z = F + 1;
  const crest = F + o.H;
  const limit = frameLimit(z, crest + FRAME.overLip);
  if (limit < FRAME.lipNearest + 0.15) return "placeFrame#1";
  // the sources the landmark may come from: the pool or a lake H to H + 3 above
  const sources = rng.shuffle([L.pool, ...L.lakes.slice(o.k + 1)].filter((b) => sourceFits(F, o.H, b.sill, b === L.pool)));
  const views = ORIENTATIONS.map((or) => {
    const cam = openingCamera({ x: 0, y: 0, z, orientation: or });
    return { or, look: cam.look as Point, right: cam.right as Point, fw: frameWidthAt({ x: 0, y: 0, z, orientation: or }, 6, crest + FRAME.overLip) };
  });
  const others = plan.links.filter((l) => l.path).map((l) => l.path!);
  const channels = plan.links.filter((l) => l.path);
  for (const src of sources) {
    const srcPts = outlinePoints(src, 2);
    const nearest = (q: Point): Point => {
      let best = Infinity;
      let out = srcPts[0];
      for (const x of srcPts) {
        const d = dist2(x, q);
        if (d < best) {
          best = d;
          out = x;
        }
      }
      return out;
    };
    // the shore the landmark may stand off: in reach of the source, nothing else between
    const anchors: { pk: Point; D: number; toward: Point; fits: typeof views }[] = [];
    for (const pk of outlinePoints(K, 2)) {
      const ps = nearest(pk);
      const D = dist(pk, ps);
      if (D < 16 || D > HANGING_VALLEY[1] + 20) continue;
      if (plan.bodies.some((b) => b.id !== K.id && b.id !== src.id && pathBodyGap([pk, ps], b, 0, Infinity, BODY_GAP + 2) < BODY_GAP + 2)) continue;
      const toward = norm([ps[0] - pk[0], ps[1] - pk[1]]);
      const fits = views.filter((v) => v.look[0] * toward[0] + v.look[1] * toward[1] > 0.45);
      if (fits.length) anchors.push({ pk, D, toward, fits });
    }
    if (!anchors.length) continue;
    const found: { start: PremisePlan["frame"]["start"]; C: Point; w: number; a: number; look: Point; right: Point; hv: Point[]; bay: Spine }[] = [];
    for (let t = 0; t < FRAME_TRIES && found.length < FRAME_KEEP; t++) {
      const { pk, D, toward, fits } = rng.pick(anchors);
      const { look, right, or, fw } = rng.pick(fits);
      const wLo = Math.max(LANDMARK_LIP[0], Math.ceil(FRAME.lipShare[0] * fw + 0.2));
      const wHi = Math.min(LANDMARK_LIP[1], Math.floor(FRAME.lipShare[1] * fw - 0.2));
      if (wLo > wHi) continue;
      const w = rng.int(wLo, wHi + 1);
      // the lip's middle: out from the lake toward the source, to one side or the other
      const a = FRAME.lipNearest + 0.08 + rng.float() * (Math.min(limit, FRAME.lipFarthest) - FRAME.lipNearest - 0.16);
      const along = rng.range(a + 5, Math.max(a + 5.5, Math.min(D - 10, a + 16)));
      const lat = rng.range(-6, 6);
      let C: Point = [pk[0] + toward[0] * along + right[0] * lat, pk[1] + toward[1] * along + right[1] * lat];
      // the start beside the bay: `sigma` the side the bay is on, the start the other
      const sigma = rng.float() < 0.5 ? 1 : -1;
      const side = rng.range(2.5, Math.min(6.5, w / 2));
      const sx = Math.round(C[0] - a * look[0] - sigma * side * right[0]);
      const sy = Math.round(C[1] - a * look[1] - sigma * side * right[1]);
      if (sx < 10 || sy < 10 || sx > plan.W - 11 || sy > plan.H - 11) continue;
      // (the 5 × 5 dry of the waters already placed turns down most candidates: first, before any more is drawn)
      if (!squareClear(sx, sy, 2, 1.2, plan.bodies)) continue;
      // the lip square to the look at exactly `a` in front of the start's tile
      const cl = (C[0] - sx) * right[0] + (C[1] - sy) * right[1];
      C = [sx + a * look[0] + cl * right[0], sy + a * look[1] + cl * right[1]];
      const start = { x: sx, y: sy, z, orientation: or };
      const lip: [Point, Point] = [
        [C[0] - (w / 2) * right[0], C[1] - (w / 2) * right[1]],
        [C[0] + (w / 2) * right[0], C[1] + (w / 2) * right[1]],
      ];
      if (!frameHolds(lipInFrame(start, lip, crest, F + 0.3))) continue;
      // the bay: from the lake's main arm to under the lip, on the side away from the start
      const rb = rng.range(BAY_END[0], BAY_END[1]);
      const bayLat = rng.range(0, Math.max(0.5, w / 2 - rb));
      const end: Point = [C[0] - (rb + 1) * look[0] + sigma * bayLat * right[0], C[1] - (rb + 1) * look[1] + sigma * bayLat * right[1]];
      // it leaves the lake away from the start's side, so the start's 5 × 5 stays dry beside it
      const away = norm([-look[0] + sigma * 0.8 * right[0], -look[1] + sigma * 0.8 * right[1]]);
      const toward2 = nearestOnSpine(K.arms[0], [end[0] + 10 * away[0], end[1] + 10 * away[1]]);
      const reachOut = dist([toward2[0], toward2[1]], end);
      if (reachOut < 6 || reachOut > 34) continue;
      const bend = Math.min(7, reachOut / 2);
      const mid: Point = [end[0] + bend * away[0], end[1] + bend * away[1]];
      const bay: Spine = [
        [r1(toward2[0]), r1(toward2[1]), BAY_ROOT],
        [r1(mid[0]), r1(mid[1]), r1(rb + 0.5)],
        [r1(end[0]), r1(end[1]), r1(rb)],
      ];
      const bayBody: Body = { ...K, arms: [bay] };
      if (edgeGap(bayBody, W, W) < 8) continue;
      // (the checks from here on draw nothing, so they run cheapest and likeliest to fail first: the 5 × 5 turns down
      // most candidates)
      const withBay: Body = { ...K, arms: [...K.arms, bay] };
      const bodies = plan.bodies.map((b) => (b.id === K.id ? withBay : b));
      // the 5 × 5 dry, a tile from any water; the lip and its middle on land
      if (!squareClear(sx, sy, 2, 1.2, bodies)) continue;
      if ([...lip, C].some((q) => bodies.some((b) => bodyDist(q[0], q[1], b) < 1))) continue;
      if (plan.bodies.some((b) => b.id !== K.id && bodyGap(b, bayBody, BODY_GAP + 2) < BODY_GAP + 2)) continue;
      if (channels.some((l) => pathBodyGap(l.path!, bayBody, 3, pathLength(l.path!) - 3, (l.half ?? 1) + 2) < (l.half ?? 1) + 2)) continue;
      // the hanging valley: straight back from the lip, then to the source
      const trial: PremisePlan = { ...plan, bodies, frame: { ...plan.frame, start } };
      let hv: Point[] | null = null;
      for (const back of [4, 6, 9, 12, 16, 20]) {
        const knee: Point = [C[0] + back * look[0], C[1] + back * look[1]];
        const path: Point[] = [nearest(knee), knee, C];
        const len = pathLength(path);
        if (len < HANGING_VALLEY[0] || len > HANGING_VALLEY[1]) continue;
        if (!clearPath(trial, path, 2.4, [src.id, K.id], others, 3, 3)) continue;
        // (past the weir at its head it keeps clear of its source: a valley that hooks back beside it drowns its weir)
        if (pathBodyGap(path, src, VALLEY_HEAD, Infinity, 2.4 + 3) < 2.4 + 3) continue;
        // (and its head, the weir, clear of a stair fall's lip and shoulders: a fall drawn over it leaves no weir)
        const head = subPath(path, 0, VALLEY_HEAD + 3);
        if (plan.links.some((l) => l.fall && !l.path && pathGap(head, l.fall.lip, 2.4 + LIP_CLEAR) < 2.4 + LIP_CLEAR)) continue;
        hv = path;
        break;
      }
      if (!hv) continue;
      found.push({ start, C, w, a, look, right, hv, bay });
    }
    if (!found.length) continue;
    const { start, C, w, a, look, right, hv, bay } = rng.pick(found);
    // the bay is one of the lake's arms (five at most): it takes the last side arm's place
    if (K.arms.length >= ARMS[1]) K.arms.length = ARMS[1] - 1;
    K.arms.push(bay);
    const lip: [Point, Point] = [rp([C[0] - (w / 2) * right[0], C[1] - (w / 2) * right[1]]), rp([C[0] + (w / 2) * right[0], C[1] + (w / 2) * right[1]])];
    const path = hv.map(rp);
    const lenAt: number[] = [0];
    for (let k = 1; k < path.length; k++) lenAt.push(lenAt[k - 1] + dist(path[k - 1], path[k]));
    const total = lenAt[lenAt.length - 1];
    // the bed falls in whole levels from the source's sill to the lip's crest
    const bed = lenAt.map((s) => Math.max(crest, src.sill - Math.floor(((src.sill - crest) * s) / total + 1e-9)));
    bed[bed.length - 1] = crest;
    plan.links.push({
      id: "landmark",
      from: src.id,
      to: K.id,
      kind: "fall",
      path,
      half: 2.4,
      bed,
      fall: { height: o.H, crest, width: w, face: headingOf(-look[0], -look[1]), lip, notch: 0, piers: 0, breach: 0 },
      wet: true,
      gates: src.id === L.pool.id ? [3] : [],
      rows: [],
    });
    addName(plan, "landmark", rng.pick(LANDMARK_NAMES));
    plan.frame = { start, landmark: "landmark", lipAhead: r1(a), bench: rng.int(BENCH[L.spec.settings.terrain.buildableLand][0], BENCH[L.spec.settings.terrain.buildableLand][1] + 1) };
    stair.landmarkSource = src.id;
    return null;
  }
  return "placeFrame#2";
}

/** The first frame's plan half (§4.4 `frame.lip`): the lip's ends and its foot inside the frame, the lip far enough
 *  for the start's 5 × 5 to stay dry, near enough to stay under the top edge, square to the look, and a third to a
 *  half of the frame's width. */
function frameHolds(fr: ReturnType<typeof lipInFrame>): boolean {
  return frameReason(fr) === null;
}

function frameReason(fr: ReturnType<typeof lipInFrame>): string | null {
  const a = Math.min(...fr.ahead);
  const b = Math.max(...fr.ahead);
  if (a < FRAME.lipNearest - 0.05) return `the lip stands ${a.toFixed(2)} tiles in front of the start (${FRAME.lipNearest} at least, for a dry 5 × 5)`;
  if (b > fr.limit + 0.05) return `the lip stands ${b.toFixed(2)} tiles in front of the start, past the frame's top edge (${fr.limit.toFixed(2)})`;
  if (b > FRAME.lipFarthest + 0.05) return `the lip stands ${b.toFixed(2)} tiles in front of the start (${FRAME.lipFarthest} at most)`;
  for (const e of fr.ends) if (!(Math.abs(e.u) <= FRAME.uSide && e.v <= FRAME.vTop)) return `a lip end falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  for (const e of fr.feet) if (!(Math.abs(e.u) <= FRAME.uSide && e.v <= FRAME.vTop && e.v >= -1)) return `the fall's foot falls outside the first frame (u ${e.u.toFixed(2)}, v ${e.v.toFixed(2)})`;
  if (fr.skew > FRAME.acrossSin) return `the lip runs ${((fr.skew * 180) / 3.14159).toFixed(0)}° off square to the look (15° at most)`;
  if (fr.share < FRAME.lipShare[0] - 0.005 || fr.share > FRAME.lipShare[1] + 0.005) return `the lip spans ${(fr.share * 100).toFixed(0)} % of the frame's width (35 to 56 %)`;
  return null;
}

/** The bypass (§4.1): a dry channel from the springs' pool round one side to an edge or into the gorge below the
 *  lowest sill, 250 to 320 tiles at 192² (scaled by side), mouth 10 wide, three rows of Blockages, the first at the
 *  mouth. It follows a ring inside the map's edge on the side the seed draws, wherever that ring is clear of the
 *  stair. */
function placeBypass(L: Layout): string | null {
  const { rng, plan, W } = L;
  const lo = (BYPASS_LENGTH[0] * W) / 192;
  const hi = (BYPASS_LENGTH[1] * W) / 192;
  const m = Math.round(W * 0.04) + rng.int(0, 3);
  const c = 0.12 * W;
  const ring: Point[] = [
    [m + c, m], [W - m - c, m], [W - m, m + c], [W - m, W - m - c], [W - m - c, W - m], [m + c, W - m], [m, W - m - c], [m, m + c], [m + c, m],
  ];
  const per = pathLength(ring);
  const others = plan.links.filter((l) => l.path).map((l) => l.path!);
  const okPoint = (p: Point) =>
    plan.bodies.every((b) => bodyDist(p[0], p[1], b) > BYPASS_HALF + 4) &&
    others.every((o) => pathDist(p[0], p[1], o).d > BYPASS_HALF + 4) &&
    dist(p, [plan.frame.start.x, plan.frame.start.y]) > 14;
  // (the walks from each entry, both ways, come by the same points of the ring: each is placed and judged once)
  const ringAt = new Map<number, { p: Point; ok: boolean }>();
  const atRing = (s: number) => {
    let e = ringAt.get(s);
    if (!e) {
      const p = pointAt(ring, s).p;
      e = { p, ok: okPoint(p) };
      ringAt.set(s, e);
    }
    return e;
  };
  const pc: Point = [L.pool.arms[0][0][0], L.pool.arms[0][0][1]];
  const entries: { s: number; p: Point; d: number }[] = [];
  for (let s = 0; s < per; s += 4) {
    const p = pointAt(ring, s).p;
    entries.push({ s, p, d: dist(p, pc) });
  }
  entries.sort((a, b) => a.d - b.d);
  const target = lo + rng.float() * (hi - lo) * 0.8;
  // the exit the seed draws: an edge of its own, or the gorge below the lowest sill (past the megadam's slot), where
  // the walk comes by it; an edge when it never does
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const gl = pathLength(gorge.path!);
  const below = subPath(gorge.path!, gl * 0.6, gl);
  const tries = rng.shuffle(entries.slice(0, 24));
  for (const toGorge of rng.float() < 0.5 ? [true, false] : [false]) {
    for (const e of tries) {
      // the mouth: from the pool's outline toward the ring
      const dir = norm([e.p[0] - pc[0], e.p[1] - pc[1]]);
      let mouth: Point = pc;
      for (let t = 0; t < 30 && bodyDist(mouth[0], mouth[1], L.pool) < 0; t++) mouth = [mouth[0] + dir[0] * 0.5, mouth[1] + dir[1] * 0.5];
      const lead: Point[] = [mouth, e.p];
      if (!clearPath(plan, lead, BYPASS_HALF, [L.pool.id], others, 4)) continue;
      for (const way of rng.shuffle([1, -1])) {
        const path: Point[] = [mouth, e.p];
        let run = dist(mouth, e.p);
        for (let k = 1; k * 2 < per * 0.9; k++) {
          const s = (((e.s + way * k * 2) % per) + per) % per;
          const { p, ok } = atRing(s);
          const join = toGorge ? pathDist(p[0], p[1], below) : null;
          if (join && join.d < BYPASS_HALF + (gorge.half ?? 3) + 10 && join.d > 4) {
            const at = rp(pointAt(below, join.s).p);
            const full = [...path, p, at];
            const simple = softCorners([...full.slice(0, -2).filter((_, i) => i === 0 || i % 3 === 0), p, at].map(rp));
            const len = pathLength(simple);
            if (len >= lo && len <= hi && clearPath(plan, simple.slice(0, -1), BYPASS_HALF, [L.pool.id], others.filter((o) => o !== gorge.path), 4)) {
              plan.links.push({
                id: "bypass",
                from: L.pool.id,
                to: gorge.to,
                kind: "bypass",
                path: simple,
                half: BYPASS_HALF,
                mouth: BYPASS_MOUTH,
                bed: { under: 3 },
                wet: false,
                gates: [],
                rows: [2, Math.round(len * rng.range(0.45, 0.6)), Math.round(len * rng.range(0.75, 0.88))],
              });
              addName(plan, "bypass", rng.pick(BYPASS_NAMES));
              return null;
            }
          }
          if (!ok) break;
          run += dist(path[path.length - 1], p);
          path.push(p);
          if (run > hi) break;
          if (run < target || toGorge) continue;
          const out = toEdge(p, W, W);
          if (run + dist(p, out) > hi) break;
          if (plan.exits.some((x) => dist(x.at, out) < 16)) continue;
          const full = [...path, out];
          const simple = softCorners(full.filter((_, i) => i === 0 || i === full.length - 1 || i % 3 === 0).map(rp));
          if (pathLength(simple) < lo || pathLength(simple) > hi) continue;
          if (!clearPath(plan, simple, BYPASS_HALF, [L.pool.id], others, 4)) continue;
          const exit: Exit = { id: "exitBypass", edge: edgeOf(out, W, W), at: rp(out) };
          plan.exits.push(exit);
          const len = pathLength(simple);
          plan.links.push({
            id: "bypass",
            from: L.pool.id,
            to: exit.id,
            kind: "bypass",
            path: simple,
            half: BYPASS_HALF,
            mouth: BYPASS_MOUTH,
            bed: { under: 3 },
            wet: false,
            gates: [],
            rows: [2, Math.round(len * rng.range(0.45, 0.6)), Math.round(len * rng.range(0.75, 0.88))],
          });
          addName(plan, "bypass", rng.pick(BYPASS_NAMES));
          return null;
        }
      }
    }
  }
  return "placeBypass#1";
}

/** A dry or wet brook, a leat or a run, straight from one outline toward a point, if it is clear. */
function straightLink(plan: PremisePlan, from: Body, to: Point, half: number, ends: string[]): Point[] | null {
  // start on the outline nearest the target
  let start: Point | null = null;
  let best = Infinity;
  for (const q of outlinePoints(from, 1.5)) {
    const d = dist2(q, to);
    if (d < best) {
      best = d;
      start = q;
    }
  }
  if (!start) return null;
  const path: Point[] = [rp(start), rp(to)];
  const others = plan.links.filter((l) => l.path).map((l) => l.path!);
  return clearPath(plan, path, half, ends, others, 3) ? path : null;
}

/** The nearest outline point of a body to a point. */
function nearestOn(b: Body, p: Point): Point {
  let best = Infinity;
  let out: Point = [b.arms[0][0][0], b.arms[0][0][1]];
  for (const q of outlinePoints(b, 1.5)) {
    const d = dist2(q, p);
    if (d < best) {
      best = d;
      out = q;
    }
  }
  return out;
}

/** The tarns and basins (§4.1, §4.2): two rim tarns with their own springs whose runs leave by an edge, spring tarns
 *  whose second outlet is a dry bed (a notch: it runs red in a badtide), empty basins a leat from gated water fills,
 *  their spill beds; and the small works on them. */
function placeTarns(L: Layout): string | null {
  const { rng, plan, W, spec } = L;
  const want = tarnCount(spec);
  const s0: Point = [plan.frame.start.x, plan.frame.start.y];
  const bypassAll = plan.links.find((l) => l.id === "bypass")!.path!;
  // (past its mouth: the pool's own basins stand near where it leaves)
  const bypass = subPath(bypassAll, 25, pathLength(bypassAll));
  const lakeGap = (b: Body) => Math.min(...L.lakes.map((k) => bodyGap(k, b)));
  const tarnWords = rng.shuffle([...TARN_WORDS]);
  const others = () => plan.links.filter((l) => l.path).map((l) => l.path!);
  const site = (near: Point | null, rim: boolean): Body | null => {
    for (let t = 0; t < 60; t++) {
      const r = rng.range(3.5, 6);
      const p: Point = near ? [near[0] + rng.range(-42, 42), near[1] + rng.range(-42, 42)] : [rng.range(8, W - 8), rng.range(8, W - 8)];
      const u = unitAt(rng.int(0, 64));
      const len = rng.range(4, 8);
      const q: Point = [p[0] + u[0] * len, p[1] + u[1] * len];
      const b: Body = { id: "", kind: "tarn", sill: 0, arms: [[[r1(p[0]), r1(p[1]), r1(r)], [r1(q[0]), r1(q[1]), r1(r * 0.8)]]], meadow: 0, deep: 2, dry: false, region: "wet" };
      const eg = edgeGap(b, W, W);
      if (eg < 4 || (rim && eg > 14) || (!rim && eg < lakeEdge(W))) continue;
      // (the cheap checks first)
      if (dist2(p, s0) < (r + 16) * (r + 16)) continue;
      if (plan.bodies.some((o) => bodyGap(o, b, o.kind === "lake" ? 8 : 6) < (o.kind === "lake" ? 8 : 6))) continue;
      if (others().some((o) => pathGap(o, b.arms[0].map(([x, y]) => [x, y] as Point), r + 5) < r + 5)) continue;
      // the wet side: nearer the lakes than the bypass
      if (!rim && pathDist(p[0], p[1], bypass).d < lakeGap(b) + 4) continue;
      return b;
    }
    return null;
  };
  const tarns: Body[] = [];
  let spring = 0;
  const addTarn = (b: Body, kind: "spring" | "basin", sill: number) => {
    const id = `tarn${tarns.length}`;
    b.id = id;
    b.kind = kind === "spring" ? "tarn" : "basin";
    b.dry = kind === "basin";
    b.sill = sill;
    b.meadow = Math.max(7, L.stair.meadow - rng.int(0, 6));
    plan.bodies.push(b);
    tarns.push(b);
    addName(plan, id, `${tarnWords[tarns.length - 1]} ${kind === "spring" ? "Tarn" : "Basin"}`);
    if (kind === "spring") {
      const c = b.arms[0][0];
      plan.sources.push({ id: `tarnSpring${spring++}`, at: [c[0], c[1]], strength: r1(rng.range(TARN_SPRING[0], TARN_SPRING[1])), into: id });
    }
  };
  /** A site's sill: the nearest lake's, a level for its meadow and one for each bench beyond. */
  const groundSill = (b: Body) => {
    let best = L.lakes[0];
    for (const k of L.lakes) if (bodyGap(k, b) < bodyGap(best, b)) best = k;
    return Math.min(plan.top - 2, best.sill + 1 + Math.max(1, Math.min(3, Math.floor(bodyGap(best, b) / 10))));
  };
  /** A spring tarn's run to its nearest edge, wet, never meeting a lake. */
  const runToEdge = (b: Body): boolean => {
    const c: Point = [b.arms[0][0][0], b.arms[0][0][1]];
    const out = toEdge(c, W, W);
    if (plan.exits.some((x) => dist(x.at, out) < 10)) return false;
    const path = straightLink(plan, b, out, 1.1, [b.id]);
    if (!path) return false;
    path[path.length - 1] = rp(out);
    if (pathLength(path) > 0.3 * W) return false;
    const exit: Exit = { id: `exit${plan.exits.length}`, edge: edgeOf(out, W, W), at: rp(out) };
    plan.exits.push(exit);
    const id = `run${b.id}`;
    plan.links.push({ id, from: b.id, to: exit.id, kind: "brook", path, half: 1.1, bed: [b.sill, Math.max(BED_FLOOR, b.sill - 3)], wet: true, gates: [], rows: [] });
    addName(plan, id, `${plan.names[b.id].split(" ")[0]} Run`);
    return true;
  };
  // the two rim tarns
  for (let k = 0; k < 2; k++) {
    let placed = false;
    for (let t = 0; t < 8 && !placed; t++) {
      const b = site(null, true);
      if (!b) break;
      const sill = groundSill(b);
      const keep = plan.bodies.length;
      addTarn(b, "spring", sill);
      if (runToEdge(b)) placed = true;
      else {
        plan.bodies.length = keep;
        tarns.pop();
        plan.sources.pop();
        spring--;
      }
    }
    if (!placed) return "placeTarns#4";
  }
  // the basins the pool's leats fill: enough that the gates are three (the neck, the hanging valley if it leaves the
  // pool, each pool leat's head); each leat is laid with its basin, so later channels go round it
  const pc: Point = [L.pool.arms[0][0][0], L.pool.arms[0][0][1]];
  const gatedNow = plan.links.filter((l) => l.gates.length).length;
  for (let k = 0; k < GATES[0] - gatedNow; k++) {
    let leat: Point[] | null = null;
    let b: Body | null = null;
    for (let t = 0; t < 12 && !leat; t++) {
      b = site(pc, false);
      if (!b) break;
      leat = straightLink(plan, L.pool, nearestOn(b, pc), 0.55, [L.pool.id, ""]);
      if (leat && (pathLength(leat) > 0.32 * W || pathLength(leat) < 6)) leat = null;
    }
    if (!b || !leat) return "placeTarns#5";
    addTarn(b, "basin", Math.min(groundSill(b), L.pool.sill - 1));
    L.poolBasins.add(b.id);
    plan.links.push({ id: `leat${b.id}`, from: L.pool.id, to: b.id, kind: "leat", path: leat, half: 0.55, bed: [L.pool.sill, b.sill + 1], wet: false, gates: [2], rows: [1] });
    addName(plan, `leat${b.id}`, `${plan.names[b.id].split(" ")[0]} Leat`);
  }
  // the rest: near the start first (NEAR_SIDE of them, the first a spring tarn where its run finds an edge), so three
  // small works stand within its walk; then anywhere on the wet side, until the count and the ladder's floor are met
  const floor = Math.ceil(0.75 * Math.max(3, Math.round(SMALL_WORKS[0] * areaRatio(W, W))));
  let nearCount = 0;
  let misses = 0;
  const extra = Math.round(2 * areaRatio(W, W));
  while ((tarns.length < Math.max(want, floor) + extra || nearCount < NEAR_SIDE) && misses < 4) {
    const isNear = nearCount < NEAR_SIDE;
    const b = site(isNear ? s0 : null, false);
    if (!b) {
      misses++;
      if (isNear) nearCount++;
      continue;
    }
    if (isNear) nearCount++;
    const isSpring = isNear ? nearCount === 1 : rng.float() < 0.4;
    addTarn(b, isSpring ? "spring" : "basin", groundSill(b));
    if (isSpring && !runToEdge(b)) {
      // no way to an edge: it stays an empty basin
      plan.sources.pop();
      spring--;
      b.kind = "basin";
      b.dry = true;
      plan.names[b.id] = plan.names[b.id].replace("Tarn", "Basin");
    }
  }
  return tarns.length >= 3 ? null : "placeTarns#6";
}

/** The ladder (§4.2): the first works, the sill notches, the small irrigation works on the tarns and basins, the leats,
 *  a raised sill, the bypass and the megadam; and the links the side works stand on. */
function placeWorks(L: Layout, o: StairOption): string | null {
  const { rng, plan, W } = L;
  const A = areaRatio(W, W);
  const scale = (r: [number, number]): [number, number] => [Math.round(r[0] * A), Math.round(r[1] * A)];
  let wn = 0;
  const work = (w: Omit<Work, "id">): Work => {
    const full = { id: `w${wn++}`, ...w };
    plan.works.push(full);
    return full;
  };
  const lm = plan.links.find((l) => l.id === "landmark")!;
  const start = plan.frame.start;
  // the first works: the Still Pool beside the fall's foot (one levee), the weir's breach below the start's lake
  const lipMid: Point = [(lm.fall!.lip[0][0] + lm.fall!.lip[1][0]) / 2, (lm.fall!.lip[0][1] + lm.fall!.lip[1][1]) / 2];
  const still: Point = rp([(lipMid[0] * 2 + start.x) / 3, (lipMid[1] * 2 + start.y) / 3]);
  const bench = plan.frame.bench;
  const stillWork = work({ rung: "first", kind: "levee", on: lm.id, at: still, tiles: 1, needs: [], gives: { green: [Math.round(bench * 0.25), Math.round(bench * 0.4)] }, region: "home" });
  const weir = o.k === 0 ? plan.links.find((l) => l.id === "gorge")! : plan.links.find((l) => l.id === `fall${o.k}`)!;
  const diff = L.spec.designedFor;
  const reserve = L.spec.settings.water.droughtReserve;
  const breach = Math.max(1, Math.min(2, 1 + (diff === "hard" ? 1 : 0) + (reserve === "scarce" ? 1 : 0) - (diff === "easy" || reserve === "plenty" ? 1 : 0) + rng.int(0, 2)));
  weir.fall!.notch = 0;
  weir.fall!.piers = 3;
  weir.fall!.breach = breach;
  const weirMid: Point = rp([(weir.fall!.lip[0][0] + weir.fall!.lip[1][0]) / 2, (weir.fall!.lip[0][1] + weir.fall!.lip[1][1]) / 2]);
  work({ rung: "first", kind: "breach", on: weir.id, at: weirMid, tiles: breach, needs: [], gives: { green: [0, 0], reservoir: scale([600, 850]) }, region: "home" });
  plan.setPieces.push({ id: "weir", kind: "ruinedWeir", on: weir.id }, { id: "stillPool", kind: "stillPool", on: stillWork.id }, { id: "cave", kind: "cave", on: lm.id });
  // the sill notches: plugging one keeps its lake's water through a drought
  for (const l of plan.links)
    if (l.kind === "fall" && l.id !== "landmark" && l.fall!.notch > 0) {
      const mid: Point = rp([(l.fall!.lip[0][0] + l.fall!.lip[1][0]) / 2, (l.fall!.lip[0][1] + l.fall!.lip[1][1]) / 2]);
      work({ rung: "small", kind: "breach", on: l.id, at: mid, tiles: 1, needs: [], gives: { green: [0, 0], reservoir: scale([700, 1200]) }, region: plan.bodies.find((b) => b.id === l.from)!.region });
    }
  // the side network: each spring tarn's dry outlet (a notch), each basin's feed (a notch's bed or a leat) and spill
  const tarns = plan.bodies.filter((b) => b.kind === "tarn" || b.kind === "basin");
  const gated = () => plan.links.filter((l) => l.gates.length).length;
  const smallWorks: Work[] = [];
  const bedLink = (id: string, from: Body, target: Body, kind: "brook" | "leat", wet: boolean): Link | null => {
    const path = straightLink(plan, from, nearestOn(target, [from.arms[0][0][0], from.arms[0][0][1]]), kind === "leat" ? 0.55 : 1.6, [from.id, target.id]);
    if (!path || pathLength(path) > 0.32 * W || pathLength(path) < 6) return null;
    const lo = kind === "leat" ? target.sill + 1 : target.sill;
    const hi = kind === "leat" ? from.sill : from.sill;
    const link: Link = { id, from: from.id, to: target.id, kind, path, half: kind === "leat" ? 0.55 : 1.6, bed: [hi, Math.max(lo, Math.min(hi, lo))], wet, gates: [], rows: [] };
    return link;
  };
  const fed = new Set<string>();
  // spring tarns first: a dry bed to a lower lake or basin, opened by clearing its row: the notch
  for (const t of tarns.filter((b) => b.kind === "tarn")) {
    const targets = [...plan.bodies.filter((b) => (b.kind === "lake" && b.sill <= t.sill - 2) || (b.kind === "basin" && !fed.has(b.id) && !L.poolBasins.has(b.id) && b.sill <= t.sill - 1))].sort((a, b) => bodyGap(a, t) - bodyGap(b, t));
    for (const target of targets.slice(0, 3)) {
      const link = bedLink(`bed${t.id}`, t, target, "brook", false);
      if (!link) continue;
      link.rows = [1];
      plan.links.push(link);
      addName(plan, link.id, `${plan.names[t.id].split(" ")[0]} Brook`);
      const head = link.path![0];
      const notch = work({ rung: "small", kind: "notch", on: link.id, at: head, tiles: rng.int(3, 5), needs: [], gives: { green: scale([430, 570]) }, tradeoff: `${plan.names[t.id]}'s water runs red down it in a badtide`, region: t.region });
      smallWorks.push(notch);
      if (target.kind === "basin") fed.add(target.id);
      if (pathLength(link.path!) >= DAM_BED) {
        const mid = pointAt(link.path!, pathLength(link.path!) / 2).p;
        smallWorks.push(work({ rung: "small", kind: "damToPond", on: link.id, at: rp(mid), tiles: rng.int(4, 7), needs: [notch.id], gives: { green: scale([270, 470]) }, region: t.region }));
      }
      break;
    }
  }
  // basins: fed by a leat from gated water (the pool, gated at its head; or a lake below the neck), spilling down a bed
  for (const b of tarns.filter((x) => x.kind === "basin")) {
    let feed: Work | undefined = plan.works.find((w) => w.kind === "notch" && plan.links.find((l) => l.id === w.on)?.to === b.id);
    const laid = plan.links.find((l) => l.id === `leat${b.id}`);
    if (!feed && laid) feed = work({ rung: "medium", kind: "leat", on: laid.id, at: laid.path![0], tiles: 3, needs: [], gives: { green: scale([1000, 1500]) }, region: b.region });
    if (!feed) {
      const sources = L.poolBasins.has(b.id) ? [L.pool] : [L.pool, ...L.lakes].filter((s) => s.sill >= b.sill + 1).sort((p, q) => bodyGap(p, b) - bodyGap(q, b));
      for (const s of sources.slice(0, 3)) {
        if (s.id === L.pool.id && gated() >= GATES[1]) continue;
        if (s.sill < b.sill + 1) continue;
        const link = bedLink(`leat${b.id}`, s, b, "leat", false);
        if (!link) continue;
        link.rows = [1];
        if (s.id === L.pool.id) link.gates = [2];
        plan.links.push(link);
        addName(plan, link.id, `${plan.names[b.id].split(" ")[0]} Leat`);
        feed = work({ rung: "medium", kind: "leat", on: link.id, at: link.path![0], tiles: 3, needs: [], gives: { green: scale([1000, 1500]) }, region: b.region });
        break;
      }
    }
    if (!feed) continue;
    fed.add(b.id);
    // its spill: a dry bed to the nearest lake two or more below, else to a lower side body, else off the map by the
    // nearest edge; a levee at the spill point, a dam where the bed narrows
    const lower = [
      ...L.lakes.filter((k) => k.sill <= b.sill - 2).sort((p, q) => bodyGap(p, b) - bodyGap(q, b)).slice(0, 2),
      ...tarns.filter((t) => t.id !== b.id && t.sill <= b.sill - 1 && (t.kind === "tarn" || fed.has(t.id))).sort((p, q) => bodyGap(p, b) - bodyGap(q, b)).slice(0, 2),
    ];
    let spill: Link | null = null;
    for (const k of lower) {
      spill = bedLink(`spill${b.id}`, b, k, "brook", false);
      if (spill) break;
    }
    if (!spill) {
      const c: Point = [b.arms[0][0][0], b.arms[0][0][1]];
      const at = toEdge(c, W, W);
      const path = plan.exits.some((x) => dist(x.at, at) < 10) ? null : straightLink(plan, b, at, 1.6, [b.id]);
      if (path && pathLength(path) <= 0.32 * W) {
        path[path.length - 1] = rp(at);
        const exit: Exit = { id: `exit${plan.exits.length}`, edge: edgeOf(at, W, W), at: rp(at) };
        plan.exits.push(exit);
        spill = { id: `spill${b.id}`, from: b.id, to: exit.id, kind: "brook", path, half: 1.6, bed: [b.sill, Math.max(BED_FLOOR, b.sill - 3)], wet: false, gates: [], rows: [] };
      }
    }
    if (spill) {
      const link = spill;
      plan.links.push(link);
      addName(plan, link.id, `${plan.names[b.id].split(" ")[0]} Beck`);
      smallWorks.push(work({ rung: "small", kind: "levee", on: b.id, at: link.path![0], tiles: rng.int(6, 10), needs: [feed.id], gives: { green: scale([260, 340]) }, region: b.region }));
      if (pathLength(link.path!) >= DAM_BED) {
        const mid = pointAt(link.path!, pathLength(link.path!) / 2).p;
        smallWorks.push(work({ rung: "small", kind: "damToPond", on: link.id, at: rp(mid), tiles: rng.int(4, 7), needs: [feed.id], gives: { green: scale([270, 470]) }, region: b.region }));
      }
    }
  }
  // a basin nothing can fill is dropped with its name
  for (const b of tarns.filter((x) => x.kind === "basin" && !fed.has(x.id))) {
    plan.bodies.splice(plan.bodies.indexOf(b), 1);
    delete plan.names[b.id];
  }
  // the small irrigation works: each kind at least once, their count by area, three near the start
  const lo = Math.max(3, Math.round(SMALL_WORKS[0] * A));
  const hi = Math.max(lo + 1, Math.round(SMALL_WORKS[1] * A));
  for (const kind of SMALL_KINDS) if (!smallWorks.some((w) => w.kind === kind)) return "placeWorks#1";
  if (smallWorks.length < lo) return "placeWorks#2";
  // too many: drop dams, then levees, farthest from the start first (never the last of a kind; a notch stays: its
  // bed's trade-off is said on it)
  const far = (w: Work) => -dist(w.at, [start.x, start.y]);
  for (const kind of ["damToPond", "levee"] as const) {
    const list = smallWorks.filter((w) => w.kind === kind).sort((a, b) => far(a) - far(b));
    while (smallWorks.length > hi && list.length > 1) {
      const w = list.shift()!;
      smallWorks.splice(smallWorks.indexOf(w), 1);
      plan.works.splice(plan.works.indexOf(w), 1);
    }
  }
  // the medium rung's raised sill: on a stair fall that is not the weir, rock shoulders two over its crest
  const stairFalls = plan.links.filter((l) => l.kind === "fall" && l.id !== "landmark" && l.id !== weir.id);
  if (stairFalls.length) {
    const l = rng.pick(stairFalls);
    const mid: Point = rp([(l.fall!.lip[0][0] + l.fall!.lip[1][0]) / 2, (l.fall!.lip[0][1] + l.fall!.lip[1][1]) / 2]);
    work({ rung: "medium", kind: "raisedSill", on: l.id, at: mid, tiles: Math.max(11, Math.min(17, l.fall!.width + 3)), needs: [], gives: { green: [0, 0], reservoir: scale([600, 1400]) }, region: plan.bodies.find((b) => b.id === l.from)!.region });
  }
  // the large rung: the bypass (its rows cleared, the gates built) and the megadam in the gorge's slot
  const by = plan.links.find((l) => l.id === "bypass")!;
  const gates = plan.links.filter((l) => l.gates.length);
  const rowTiles = BYPASS_MOUTH + 6 + Math.round(2 * BYPASS_HALF) + Math.round(2 * BYPASS_HALF) + 2;
  const gateTiles = gates.reduce((s, l) => s + Math.round(2 * (l.half ?? 1)) + 2, 0);
  work({ rung: "large", kind: "bypass", on: by.id, at: by.path![0], tiles: rowTiles + gateTiles, needs: [], gives: { green: scale([1100, 1500]) }, tradeoff: "The water it carries is the badtide's: nothing below it can drink", region: "dry" });
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const slot = pointAt(gorge.path!, pathLength(gorge.path!) * 0.5).p;
  work({ rung: "large", kind: "megadam", on: gorge.id, at: rp(slot), tiles: Math.min(MEGADAM_SLOT[1], Math.round(2 * gorge.half!)), needs: [], gives: { green: [0, 0], reservoir: [Math.round(0.4 * W * W), Math.round(0.5 * W * W)] }, tradeoff: o.k === 0 ? "It drowns the low meadows and the home bay's" : "It drowns the low meadows", region: "low" });
  return null;
}

/** The ridges (§4.1): the skyline behind the top lake, the wall the gorge cuts through, the spurs at each fall. */
function placeRidges(L: Layout, o: StairOption): string | null {
  const { rng, plan, W } = L;
  const avoid = (p: Point, half: number) => plan.bodies.every((b) => bodyDist(p[0], p[1], b) > half + 2) && p[0] > 1 && p[1] > 1 && p[0] < W - 1 && p[1] < W - 1;
  // the skyline: the top lake's main arm, offset away from the map's middle past its meadow
  const top = L.lakes[o.n - 1];
  const centre: Point = [W / 2, W / 2];
  const main = top.arms[0];
  const pts: Point[] = [];
  for (let k = 0; k < main.length; k++) {
    const a = main[Math.max(0, k - 1)];
    const b = main[Math.min(main.length - 1, k + 1)];
    const d = norm([b[0] - a[0], b[1] - a[1]]);
    let nrm: Point = [-d[1], d[0]];
    const [x, y, r] = main[k];
    if ((x - centre[0]) * nrm[0] + (y - centre[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
    // past the meadow, or nearer where the map's edge comes close
    for (const off of [r + top.meadow + 4, r + top.meadow / 2 + 3, r + 4]) {
      const p: Point = [x + nrm[0] * off, y + nrm[1] * off];
      if (!avoid(p, 2.2)) continue;
      pts.push(rp(p));
      break;
    }
  }
  if (pts.length < 2) return "placeRidges#1";
  const skyTop = plan.top <= 16 ? plan.top : Math.min(plan.top, 21);
  plan.ridges.push({ id: "skyline", role: "skyline", path: pts, top: skyTop, half: 2.2, drop: 3, ledge: 2.6, rough: 1.8 });
  // the wall: across the gorge at its middle, the valley's own high ground, ten tiles thick, as far as it is clear
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const len = pathLength(gorge.path!);
  const { p: gm, dir } = pointAt(gorge.path!, len * 0.5);
  const across: Point = [-dir[1], dir[0]];
  const reach = 0.15 * W;
  const wall: Point[] = [];
  for (const sgn of [-1, 1]) {
    const side: Point[] = [];
    for (let t = 6; t <= reach; t += 3) {
      const p: Point = [gm[0] + sgn * across[0] * t, gm[1] + sgn * across[1] * t];
      if (!avoid(p, 5)) break;
      side.push(rp(p));
    }
    if (sgn < 0) wall.push(...side.reverse());
    else wall.push(rp(gm), ...side);
  }
  if (wall.length < 3) return "placeRidges#2";
  const wallTop = Math.min(plan.top, STAIR_BASE + o.f + 3 + rng.int(0, 2));
  plan.ridges.push({ id: "wall", role: "wall", path: wall, top: wallTop, half: 5, drop: 3, ledge: 3, rough: 1.1 });
  // the spurs: rock shoulders out from each stair fall's lip ends, two over its crest
  for (const l of plan.links.filter((x) => x.kind === "fall" && x.id !== "landmark")) {
    const [a, b] = l.fall!.lip;
    const d = norm([b[0] - a[0], b[1] - a[1]]);
    for (const [end, sgn] of [[a, -1], [b, 1]] as [Point, number][]) {
      const tip: Point = [end[0] + sgn * d[0] * rng.range(5, 8), end[1] + sgn * d[1] * rng.range(5, 8)];
      if (!avoid(tip, 1)) continue;
      plan.ridges.push({ id: `spur${plan.ridges.length}`, role: "spur", path: [rp(end), rp(tip)], top: l.fall!.crest + 2, half: 1.8, drop: 2, ledge: 1.4, rough: 0.6 });
    }
  }
  return null;
}

/** The five regions, each its role, problem and prize (§4.1), every body and work in one, and the edges. */
function placeRegions(L: Layout, o: StairOption): void {
  const { plan } = L;
  const n = (id: string) => plan.names[id];
  const K = L.lakes[o.k];
  const low = L.lakes[0];
  const s = plan.frame.start;
  const lm = n("landmark");
  const by = plan.links.find((l) => l.id === "bypass")!;
  const centroid = (bs: Body[]): Point => (bs.length ? rp([bs.reduce((t, b) => t + b.arms[0][0][0], 0) / bs.length, bs.reduce((t, b) => t + b.arms[0][0][1], 0) / bs.length]) : [plan.W / 2, plan.H / 2]);
  const side = plan.bodies.filter((b) => b.kind === "tarn" || b.kind === "basin");
  const farLow = low.arms[0][low.arms[0].length - 1];
  const regions: Region[] = [
    { id: "home", role: "home", problem: `${n(K.id)} sinks through the weir's breach in a drought; the red arrives on day 1 of a badtide`, prize: `The first reservoir (the breach mended), the Still Pool, first metal on the weir, power at ${lm} later`, dayOne: "green", at: [s.x, s.y] },
    { id: "low", role: "low", problem: "Lowest, so the megadam drowns it", prize: "Level meadows to farm; the megadam's sea", dayOne: "green", at: o.k === 0 ? [farLow[0], farLow[1]] : centroid([low]) },
    { id: "wet", role: "wet", problem: "Dry basins and beds on day 1", prize: "Green benches and wood stands, a work at a time", dayOne: "dry", at: centroid(side.filter((b) => b.region === "wet")) },
    { id: "top", role: "top", problem: "Far, and across water", prize: `The gates at ${n("pool")}; aquifers and the drill; the tallest stair fall's power`, dayOne: "green", at: centroid([L.pool]) },
    { id: "dry", role: "dry", problem: "No water reaches it", prize: `Metal in ${n("bypass")}, geothermal, succulent fields`, dayOne: "dryForGood", at: rp(pointAt(by.path!, pathLength(by.path!) * 0.5).p) },
  ];
  plan.regions = regions;
  for (const b of plan.bodies) {
    if (b.id === K.id) b.region = "home";
    else if (b.id === low.id) b.region = "low";
    else if (b.kind === "lake" || b.kind === "pool") b.region = "top";
    else b.region = pathDist(b.arms[0][0][0], b.arms[0][0][1], by.path!).d < Math.min(...L.lakes.map((k) => bodyGap(k, b))) ? "dry" : "wet";
  }
  for (const w of plan.works) {
    if (w.region !== "home" && w.region !== "dry" && w.region !== "low") {
      const on = plan.bodies.find((b) => b.id === w.on) ?? plan.bodies.find((b) => b.id === plan.links.find((l) => l.id === w.on)?.from);
      if (on) w.region = on.region;
    }
  }
  const edges: PremisePlan["edges"] = { N: "falls away", E: "falls away", S: "falls away", W: "falls away" };
  const sky = plan.ridges.find((r) => r.role === "skyline");
  if (sky) for (const p of sky.path) edges[edgeOf(p, plan.W, plan.H)] = Math.min(p[0], p[1], plan.W - p[0], plan.H - p[1]) < 14 ? "ridge" : edges[edgeOf(p, plan.W, plan.H)];
  for (const e of plan.exits) edges[e.edge] = "water leaves";
  plan.edges = edges;
}

/** The permanent badwater source (D200, D498): in the gorge below the lowest sill, so it leaves by the exit; none
 *  when Badwater is off. Strength by the setting (assumption: 1, 1.5 or 2.75 a source, the official maps' range). */
function placeBadwater(L: Layout): void {
  const { plan, spec } = L;
  const setting = spec.settings.hazards.badwater;
  if (setting === "off") return;
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const p = pointAt(gorge.path!, pathLength(gorge.path!) * 0.75).p;
  plan.sources.push({ id: "badwater", at: rp(p), strength: setting === "low" ? 1 : setting === "normal" ? 1.5 : 2.75, into: gorge.id, bad: true });
}

function placeLine(L: Layout, o: StairOption): void {
  const { plan } = L;
  plan.line = `${COUNT[o.n]} lakes step down below ${plan.names.landmark}, each over a rock sill and a fall. The badtide comes down the whole stair within a day, unless you open ${plan.names.bypass} and shut the gates at ${plan.names.pool}: then it runs round every lake.`;
  plan.setPieces.push(
    { id: "aquifer", kind: "aquifer", on: "pool" },
    { id: "drill", kind: "drill", on: "pool" },
    { id: "geothermal", kind: "geothermal", on: "bypass" },
    { id: "aqueduct", kind: "aqueduct", on: "bypass" },
    { id: "relic", kind: "relic", on: plan.bodies.find((b) => b.islands?.length)?.id ?? "gorge" },
  );
}

/** Islands: one or two lakes get one, a level over the water, inside a wide stretch of the main arm. */
function placeIslands(L: Layout): void {
  const { rng } = L;
  const count = rng.int(1, 3);
  for (const lake of rng.shuffle([...L.lakes]).slice(0, count)) {
    const wide = lake.arms[0].filter(([, , r]) => r >= 9);
    if (!wide.length) continue;
    const [x, y, r] = rng.pick(wide);
    const ir = rng.range(1.5, Math.min(3, r - 6));
    const off = rng.range(0, r - ir - 5);
    lake.islands = [[[r1(x + off * 0.6), r1(y - off * 0.8), r1(ir)]]];
  }
}

/** Re-draws of a layout's tail (the bypass, the tarns, the works, the ridges) on the same stair and frame before the
 *  layout is drawn again: the stair and the frame are most of a layout's cost, and the tail fails most often at 128²
 *  (its tarns and works find no room), so a tail drawn again from its own stream is a cheap re-draw (§3.3). */
const TAIL_TRIES = 2;

/** A layout's state once its stair and frame stand, copied so its tail can be drawn again from it. */
function restore(snap: string, L: Layout, rng: Rng): Layout {
  const { plan, spans, poolBasins } = JSON.parse(snap) as { plan: PremisePlan; spans: [number, number][]; poolBasins: string[] };
  const byId = new Map(plan.bodies.map((b) => [b.id, b]));
  return { ...L, rng, plan, stair: plan.stair!, lakes: L.lakes.map((b) => byId.get(b.id)!), pool: byId.get(L.pool.id)!, spans, poolBasins: new Set(poolBasins) };
}

/** One layout: the plan, or how far it got and the step that failed. Its tail is drawn again up to `TAIL_TRIES` times
 *  on the same stair and frame when it fails a step or `holds` (the `plan` invariants) turns it down. */
function layout(spec: MapSpec, attempt: number, t: number, n: number, holds: (plan: PremisePlan) => string | null = () => null): { plan: PremisePlan; why: string | null } {
  const rng = premiseStream(spec, "premise.plan", attempt, t);
  const o = drawStructure(spec, rng, n);
  const W = spec.size.x;
  const plan = emptyPlan(spec);
  const valley = drawValley(W, o.shape, o.turn, rng);
  if (!valley) return { plan, why: "valley" };
  const stair: StairPlan = {
    n: o.n,
    lakes: [],
    f: o.f,
    startLake: `lake${o.k}`,
    H: o.H,
    landmarkSource: "",
    valley: valley.map(rp),
    shape: o.shape,
    turn: o.turn,
    pool: "pool",
    neck: "neck",
    bypass: "bypass",
    gorge: "gorge",
    flow: STAIR_FLOW[spec.settings.water.riverFlow],
    meadow: STAIR_MEADOW[spec.settings.terrain.buildableLand],
  };
  plan.stair = stair;
  const L: Layout = { W, rng, spec, plan, stair, lakes: [], pool: null as unknown as Body, spans: [], poolBasins: new Set() };
  const head = placeStair(L, o);
  if (head) return { plan, why: head };
  stair.lakes = L.lakes.map((b) => b.id);
  placeIslands(L);
  const framed = placeFrame(L, o);
  if (framed) return { plan, why: framed };
  const snap = JSON.stringify({ plan, spans: L.spans, poolBasins: [...L.poolBasins] });
  let last: { plan: PremisePlan; why: string } = { plan, why: "" };
  for (let k = 0; k < TAIL_TRIES; k++) {
    // (the first tail goes on from the layout's own stream; each re-draw from one of its own)
    const M = k === 0 ? L : restore(snap, L, premiseStream(spec, "premise.plan", attempt, t, "tail", k));
    const why = placeBypass(M) ?? placeTarns(M) ?? placeWorks(M, o) ?? placeRidges(M, o);
    if (why) {
      last = { plan: M.plan, why };
      continue;
    }
    placeRegions(M, o);
    placeBadwater(M);
    placeLine(M, o);
    const bad = holds(M.plan);
    if (!bad) return { plan: M.plan, why: null };
    last = { plan: M.plan, why: bad };
  }
  return last;
}

// ------------------------------------------------------------------------------------------------- invariants

const lakesOf = (plan: PremisePlan): Body[] => (plan.stair ? plan.stair.lakes.map((id) => plan.bodies.find((b) => b.id === id)!).filter(Boolean) : []);
const linkOf = (plan: PremisePlan, id: string) => plan.links.find((l) => l.id === id);

/** `stair.levels` (§4.4): sills descend along the valley by `f`, from 2; every water ≤ top − 2; a fall of `f` between
 *  each two lakes over the upper's sill; the pool at the top lake's level; the landmark `H` (6 or 7) into the start's
 *  lake (the lowest or the second), from a source `H` or more above. */
const stairLevels: Invariant = {
  id: "stair.levels",
  at: "plan",
  test({ plan }) {
    const st = plan.stair;
    if (!st) return fail("The plan has no stair");
    const lakes = lakesOf(plan);
    if (lakes.length !== st.n) return fail(`The stair names ${st.lakes.length} lakes, ${lakes.length} of them there, for n = ${st.n}`);
    if (!(STAIR_STEPS as readonly number[]).includes(st.f)) return fail(`The step between sills is ${st.f} (3, 4 or 5)`);
    for (let i = 0; i < lakes.length; i++) {
      if (lakes[i].sill !== STAIR_BASE + i * st.f) return fail(`${nameOf(plan, lakes[i].id)}'s sill is ${lakes[i].sill}, not ${STAIR_BASE + i * st.f}`);
      if (i > 0) {
        const fall = plan.links.find((l) => l.from === lakes[i].id && l.to === lakes[i - 1].id && l.kind === "fall" && l.fall);
        if (!fall) return fail(`No fall from ${nameOf(plan, lakes[i].id)} into ${nameOf(plan, lakes[i - 1].id)}`);
        if (fall.fall!.height !== st.f || fall.fall!.crest !== lakes[i].sill) return fail(`${nameOf(plan, fall.id)} drops ${fall.fall!.height} from ${fall.fall!.crest}, not ${st.f} from ${lakes[i].sill}`);
      }
    }
    for (const b of plan.bodies) if (b.sill > plan.top - 2) return fail(`${nameOf(plan, b.id)}'s water (${b.sill}) is over the highest ground less two (${plan.top - 2})`);
    const pool = plan.bodies.find((b) => b.id === st.pool);
    if (!pool || pool.sill !== lakes[lakes.length - 1].sill) return fail(`${nameOf(plan, st.pool)} is not at the top lake's level`);
    const neck = linkOf(plan, st.neck);
    if (!neck || neck.from !== st.pool || neck.to !== lakes[lakes.length - 1].id || !neck.wet) return fail("The neck does not carry the springs' pool into the top lake");
    if (!(LANDMARK_HEIGHTS as readonly number[]).includes(st.H)) return fail(`The landmark is ${st.H} levels (6 or 7: an 8 waits for its judged variant)`);
    const k = st.lakes.indexOf(st.startLake);
    if (k !== 0 && k !== 1) return fail(`The start's lake is ${nameOf(plan, st.startLake)}, neither the lowest nor the second`);
    const lm = linkOf(plan, plan.frame.landmark);
    if (!lm || !lm.fall) return fail("The landmark is not a fall");
    if (lm.to !== st.startLake) return fail(`${nameOf(plan, lm.id)} falls into ${nameOf(plan, lm.to)}, not the start's lake`);
    const F = lakes[k].sill;
    if (lm.fall.height !== st.H || lm.fall.crest !== F + st.H) return fail(`${nameOf(plan, lm.id)} drops ${lm.fall.height} from ${lm.fall.crest}, not ${st.H} from ${F + st.H}`);
    const src = plan.bodies.find((b) => b.id === lm.from);
    if (!src || src.id !== st.landmarkSource) return fail(`${nameOf(plan, lm.id)} is not fed from its source`);
    if (!sourceFits(F, st.H, src.sill, src.kind === "pool")) {
      const [lo, hi] = src.kind === "pool" ? VALLEY_DROP.pool : VALLEY_DROP.lake;
      return fail(`${nameOf(plan, src.id)} (${src.sill}) is not ${st.H + lo} to ${st.H + hi} over ${nameOf(plan, lakes[k].id)}'s sill (${F})`);
    }
    return OK;
  },
};

/** `stair.shape` (§4.1's ranges): the size, n, the valley's length, the lakes' arms and meadows, the falls' widths, the
 *  springs, the hanging valley, the bypass, the gates, the tarns. */
const stairShape: Invariant = {
  id: "stair.shape",
  at: "plan",
  test({ plan, spec }) {
    const st = plan.stair!;
    if (!st) return fail("The plan has no stair");
    if (plan.W !== plan.H || plan.W < STAIR_SIDE[0] || plan.W > STAIR_SIDE[1]) return fail(`${plan.W} × ${plan.H} is not a square of 128 to 256`);
    const nWant = [...new Set(stairOptions(spec).map((o) => o.n))].sort();
    if (!nWant.includes(st.n)) return fail(`${st.n} lakes at ${plan.W}² under highest ground ${spec.settings.terrain.highestTerrain} (${nWant.join(" or ")})`);
    const vl = pathLength(st.valley);
    if (vl < VALLEY_LENGTH[0] * plan.W - 1 || vl > VALLEY_LENGTH[1] * plan.W + 1) return fail(`The valley is ${vl.toFixed(0)} tiles long (${VALLEY_LENGTH[0]} to ${VALLEY_LENGTH[1]} × the side)`);
    const meadow = STAIR_MEADOW[spec.settings.terrain.buildableLand];
    for (const lake of lakesOf(plan)) {
      if (lake.arms.length < ARMS[0] || lake.arms.length > ARMS[1]) return fail(`${nameOf(plan, lake.id)} has ${lake.arms.length} arms (2 to 5)`);
      for (const arm of lake.arms) {
        const widest = Math.max(...arm.map((p) => p[2]));
        if (widest < ARM_RADIUS[0] || widest > ARM_RADIUS[1]) return fail(`An arm of ${nameOf(plan, lake.id)} is ${widest} wide at most (radius 7 to 15)`);
      }
      if (Math.abs(lake.meadow - meadow) > 3) return fail(`${nameOf(plan, lake.id)}'s meadow is ${lake.meadow} (${meadow} ± 3 for this Buildable land)`);
    }
    for (const l of plan.links)
      if (l.kind === "fall" && l.id !== plan.frame.landmark && (l.fall!.width < 8 || l.fall!.width > MAX_SILL_WIDTH)) return fail(`${nameOf(plan, l.id)}'s lip is ${l.fall!.width} wide (8 to 16)`);
    const springs = plan.sources.filter((s) => s.into === st.pool);
    const total = springs.reduce((t, s) => t + s.strength, 0);
    const want = STAIR_FLOW[spec.settings.water.riverFlow];
    if (springs.length < POOL_SOURCES[0] || springs.length > POOL_SOURCES[1]) return fail(`${springs.length} springs in ${nameOf(plan, st.pool)} (3 to 5)`);
    if (Math.abs(total - want) > 0.5) return fail(`The springs give ${total.toFixed(1)} (River flow asks ${want})`);
    const lm = linkOf(plan, plan.frame.landmark);
    if (lm?.fall && (lm.fall.width < LANDMARK_LIP[0] || lm.fall.width > LANDMARK_LIP[1])) return fail(`${nameOf(plan, lm.id)}'s lip is ${lm.fall.width} tiles (10 to 14)`);
    if (lm?.path) {
      const hv = pathLength(lm.path);
      if (hv < HANGING_VALLEY[0] - 0.5 || hv > HANGING_VALLEY[1] + 0.5) return fail(`The hanging valley is ${hv.toFixed(0)} tiles long (20 to 40)`);
    }
    const by = linkOf(plan, st.bypass);
    if (!by || by.kind !== "bypass" || !by.path) return fail("The plan has no bypass");
    const bl = pathLength(by.path);
    const lo = (BYPASS_LENGTH[0] * plan.W) / 192;
    const hi = (BYPASS_LENGTH[1] * plan.W) / 192;
    if (bl < lo - 1 || bl > hi + 1) return fail(`${nameOf(plan, by.id)} is ${bl.toFixed(0)} tiles long (${lo.toFixed(0)} to ${hi.toFixed(0)} at ${plan.W}²)`);
    if (by.mouth !== BYPASS_MOUTH) return fail(`${nameOf(plan, by.id)}'s mouth is ${by.mouth} wide (10)`);
    if (by.rows.length !== 3 || by.rows[0] > 3) return fail(`${nameOf(plan, by.id)} has ${by.rows.length} rows of Blockages, the first ${by.rows[0]} tiles in (three, the first at the mouth)`);
    const gates = plan.links.filter((l) => l.gates.length);
    if (gates.length < GATES[0] || gates.length > GATES[1]) return fail(`${gates.length} gates (3 or 4: the neck, the hanging valley, each leat's head)`);
    const rims = plan.bodies.filter((b) => b.kind === "tarn" && plan.sources.some((s) => s.into === b.id && s.strength >= TARN_SPRING[0] - 1e-9 && s.strength <= TARN_SPRING[1] + 1e-9));
    if (rims.length < 2) return fail(`${rims.length} tarns with their own springs (two at least)`);
    return OK;
  },
};

/** `springs.side` (§4.4): a body with its own spring drains to a map edge without meeting a lake, unless it is a notch's
 *  whose trade-off says its water runs red. The springs' pool is the stair's own head, gated. */
const springsSide: Invariant = {
  id: "springs.side",
  at: "plan",
  test({ plan }) {
    const st = plan.stair;
    const lakes = new Set(plan.bodies.filter((b) => b.kind === "lake").map((b) => b.id));
    const exits = new Set(plan.exits.map((e) => e.id));
    const out = linksFrom(plan);
    for (const s of plan.sources) {
      if (s.bad || s.into === st?.pool || lakes.has(s.into)) continue;
      if (!plan.bodies.some((b) => b.id === s.into)) continue;
      const wet = reach(plan, [s.into], (l) => l.wet);
      const met = [...wet].find((id) => lakes.has(id));
      if (met) return fail(`${nameOf(plan, s.into)}'s spring runs into ${nameOf(plan, met)} on day 1`);
      if (![...wet].some((id) => exits.has(id))) return fail(`${nameOf(plan, s.into)}'s spring never leaves the map`);
      // its dry ways: any that reach a lake is a notch the player opens, with its trade-off said
      for (const l of out.get(s.into) ?? []) {
        if (l.wet) continue;
        const down = reach(plan, [l.to], () => true);
        down.add(l.to);
        if (![...down].some((id) => lakes.has(id))) continue;
        const w = plan.works.find((x) => x.on === l.id && x.kind === "notch");
        if (!w || !w.tradeoff || !/red/.test(w.tradeoff)) return fail(`${nameOf(plan, l.id)} would carry ${nameOf(plan, s.into)}'s spring to a lake with no notch saying it runs red`);
      }
    }
    return OK;
  },
};

/** `frame.lip`, its plan half (§4.3, §4.4): the start on a bench one over its lake's sill, the landmark's lip across
 *  the look, far enough for a dry 5 × 5 and near enough for the frame's top edge, its ends and its foot inside the
 *  first frame, 35 to 56 % of its width. */
const frameLip: Invariant = {
  id: "frame.lip",
  at: "plan",
  test({ plan }) {
    const st = plan.stair;
    const lm = linkOf(plan, plan.frame.landmark);
    if (!st || !lm?.fall) return fail("The plan has no landmark fall");
    const K = plan.bodies.find((b) => b.id === st.startLake)!;
    const s = plan.frame.start;
    if (s.z !== K.sill + 1) return fail(`The start stands on ${s.z}, not one over ${nameOf(plan, K.id)}'s sill (${K.sill + 1})`);
    const fr = lipInFrame(s, lm.fall.lip, lm.fall.crest, K.sill + 0.3);
    const why = frameReason(fr);
    if (why) return fail(`In the first frame, ${why}`);
    if (Math.abs(fr.ahead[0] + fr.ahead[1] - 2 * plan.frame.lipAhead) > 0.3) return fail(`The plan says the lip stands ${plan.frame.lipAhead} in front; it stands ${((fr.ahead[0] + fr.ahead[1]) / 2).toFixed(2)}`);
    return OK;
  },
};

/** `premise.graph`, the plan's half of `premise.closed` and `premise.open` (§4.4, by the graph): left alone, the
 *  springs' water reaches every lake; with the bypass's rows cleared and its gates shut (3 or 4, each at most 5 wide),
 *  it reaches none and leaves by the bypass. */
const premiseGraph: Invariant = {
  id: "premise.graph",
  at: "plan",
  test({ plan }) {
    const st = plan.stair;
    if (!st) return fail("The plan has no stair");
    const lakes = plan.bodies.filter((b) => b.kind === "lake");
    const closed = reach(plan, [st.pool], (l) => l.wet);
    for (const k of lakes) if (!closed.has(k.id)) return fail(`Left alone, the badtide never reaches ${nameOf(plan, k.id)}`);
    for (const l of plan.links.filter((x) => x.gates.length)) if (2 * (l.half ?? 0) > GATE_WIDTH) return fail(`${nameOf(plan, l.id)} is ${2 * (l.half ?? 0)} wide at its gate (5 at most)`);
    const open = reach(plan, [st.pool], (l) => !l.gates.length && (l.wet || l.id === st.bypass));
    const met = lakes.find((k) => open.has(k.id));
    if (met) return fail(`With the bypass open and the gates shut, the badtide still reaches ${nameOf(plan, met.id)}`);
    const by = linkOf(plan, st.bypass);
    if (!by || !plan.exits.some((e) => e.id === by.to)) return fail("The bypass leads to no exit");
    return OK;
  },
};

/** `ladder.plan`, the plan's half of `ladder.kinds` and `spectrum` (§4.2, §4.4): each small irrigation kind at least
 *  once, their count by area, each at most 3 % of the map; three within the start's walk (as the crow flies from the
 *  bench: the walk is longer); the first and small works with all four kinds; one first work inside the first frame;
 *  the bypass and the megadam on the large rung. */
const ladderPlan: Invariant = {
  id: "ladder.plan",
  at: "plan",
  test({ plan }) {
    const A = areaRatio(plan.W, plan.H);
    const small = plan.works.filter((w) => w.rung === "small" && (SMALL_KINDS as readonly string[]).includes(w.kind));
    for (const kind of SMALL_KINDS) if (!small.some((w) => w.kind === kind)) return fail(`No small work of kind ${kind}`);
    const lo = Math.max(3, Math.round(SMALL_WORKS[0] * A));
    const hi = Math.max(lo + 1, Math.round(SMALL_WORKS[1] * A));
    if (small.length < lo || small.length > hi) return fail(`${small.length} small irrigation works (${lo} to ${hi} at ${plan.W}²)`);
    for (const w of small) if (w.gives.green[1] > 0.03 * plan.W * plan.H) return fail(`Work ${w.id} would green ${w.gives.green[1]} tiles, over 3 % of the map`);
    const s = plan.frame.start;
    const benchR = sqrt(plan.frame.bench / 3.141592653589793);
    const near = small.filter((w) => dist(w.at, [s.x, s.y]) <= NEAR_WALK + benchR);
    if (near.length < NEAR_WORKS) return fail(`${near.length} small irrigation works within ${NEAR_WALK} tiles of the start's bench (three)`);
    const firstSmall = new Set(plan.works.filter((w) => w.rung === "first" || w.rung === "small").map((w) => w.kind));
    for (const kind of ["breach", "levee", "notch", "damToPond"]) if (!firstSmall.has(kind as Work["kind"])) return fail(`The first and small works have no ${kind}`);
    const cam = openingCamera(s);
    const inFirst = plan.works.filter((w) => w.rung === "first").some((w) => {
      const p = frameAt(cam, w.at[0] + 0.5, w.at[1] + 0.5, s.z);
      return !!p && Math.abs(p.u) <= 1 && Math.abs(p.v) <= 1;
    });
    if (!inFirst) return fail("No first work stands inside the first frame");
    for (const kind of ["bypass", "megadam"] as const) if (!plan.works.some((w) => w.kind === kind && w.rung === "large")) return fail(`No ${kind} on the large rung`);
    const mega = plan.works.find((w) => w.kind === "megadam")!;
    if (mega.on !== plan.stair?.gorge || mega.tiles < MEGADAM_SLOT[0] || mega.tiles > MEGADAM_SLOT[1]) return fail(`The megadam is ${mega.tiles} tiles on ${mega.on} (5 to 6 in the gorge's slot)`);
    return OK;
  },
};

/** `stair.skeleton`: the five regions of §4.1, a skyline behind the top lake and the wall the gorge cuts. */
const stairSkeleton: Invariant = {
  id: "stair.skeleton",
  at: "plan",
  test({ plan }) {
    const roles = new Set(plan.regions.map((r) => r.role));
    for (const r of ["home", "low", "wet", "top", "dry"] as const) if (!roles.has(r)) return fail(`No ${r} region`);
    if (plan.regions.find((r) => r.role === "dry")?.dayOne !== "dryForGood") return fail("The dry side is not dry for good");
    if (!plan.ridges.some((r) => r.role === "skyline")) return fail("No skyline behind the top lake");
    if (!plan.ridges.some((r) => r.role === "wall")) return fail("No wall for the gorge to cut");
    for (const r of plan.ridges) if (r.top > Math.max(plan.top, 21)) return fail(`Ridge ${r.id} rises to ${r.top}, over the highest ground`);
    return OK;
  },
};

const stairPlanInvariants: Invariant[] = [stairLevels, stairShape, springsSide, frameLip, premiseGraph, ladderPlan, stairSkeleton];

// ------------------------------------------------------------------------------------------------- the def

/** One attempt: a layout try at a time from its own stream, the first whose plan passes every `plan` invariant. */
function draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string } {
  const why = lakeStairEligible(spec);
  if (why) return { reason: why };
  const n = lakeCountOf(spec, attempt);
  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const { plan, why } = layout(spec, attempt, t, n, (p) => planFailure(spec, p));
    if (!why) return plan;
  }
  return { reason: `No lake stair fits seed ${spec.seed} at ${spec.size.x}² in ${LAYOUT_TRIES} layouts` };
}

export const lakeStair: PremiseDef = {
  id: "lakeStair",
  eligible: lakeStairEligible,
  draw,
  invariants: [...PLAN_CHECKS, ...stairPlanInvariants, ...WATER_CHECKS],
};

/** The first `plan` invariant a plan fails, as "id: reason", or null. */
function planFailure(spec: MapSpec, plan: PremisePlan): string | null {
  for (const inv of lakeStair.invariants) {
    if (inv.at !== "plan") continue;
    const r = inv.test({ spec, plan });
    if (!r.ok) return `${inv.id}: ${r.reason}`;
  }
  return null;
}

/** For the tools: one layout try's plan (as far as it got, its tail drawn again as `draw` does) and the step or first
 *  invariant it fails (or none). */
export function layoutTry(spec: MapSpec, attempt: number, t: number): { plan: PremisePlan; failed: string | null } {
  const { plan, why } = layout(spec, attempt, t, lakeCountOf(spec, attempt), (p) => planFailure(spec, p));
  if (why) return { plan, failed: /^place|^valley/.test(why) ? `layout: ${why}` : why };
  return { plan, failed: null };
}

export type { Ridge, SetPiece, Source };
