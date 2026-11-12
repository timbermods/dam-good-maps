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
import { cos, log, sin, sqrt } from "../../math/portable";
import type { Rng } from "../../math/rng";
import { BED_FLOOR } from "../../land/genome";
import { hash32 } from "../../math/hash";
import { sillWidthFor, MAX_SILL_WIDTH } from "../../sim/sill";
import { hazardDays } from "../../sim/weather";
import { EDITOR_LEVEL, type MapSpec } from "../../spec/mapspec";
import { rulesFor } from "../../validate/playability";
import { premiseStream } from "../draw";
import { holdDeep } from "../levels";
import { FRAME, frameLimit, frameWidthAt, lipInFrame, START } from "../frame";
import { bodyDist, bodyGap, bodyWithin, dist, dist2, outlineBox, segDist, edgeGap, headingOf, norm, outlinePoints, unitAt, pathBodyGap, pathDist, pathGap, pathLength, pathWithin, pointAt, squareClear, subPath } from "../geom";
import { BODY_GAP, fail, linksFrom, nameOf, OK, PLAN_CHECKS, reach } from "../planChecks";
import { WATER_CHECKS } from "../waterChecks";
import type { Body, Edge, Exit, Fall, Invariant, Link, Point, PremiseDef, PremisePlan, Region, Ridge, SetPiece, SiteLand, Source, Spine, StairPlan, Work, WorkKind } from "../types";
import { NARROWS, narrowsFit } from "../ladder";
import { SiteModel, type Ground, type Wet } from "../siting";

// ------------------------------------------------------------------------------------------------- the ranges

/** Square maps, 128² to 256² (PREMISES §4.1; ruling 7: squares only for now). */
export const STAIR_SIDE = [128, 256] as const;
/** The springs' total strength by River flow. */
export const STAIR_FLOW = { trickle: 10, normal: 14, strong: 18, lush: 22 } as const;
/** The meadow's base width by Buildable land, at 192² and over. */
export const STAIR_MEADOW = { tight: 12, normal: 15, generous: 18 } as const;
/** The meadow's base width for a spec: `STAIR_MEADOW`, four fifths of it at 128² and between by side. Three lakes'
 *  meadows hold most of a 128² map, whose moist ground stood over `spectrum`'s 42 % on seven seeds of twelve at step 5. */
export function stairMeadow(spec: MapSpec): number {
  const k = Math.min(1, 0.8 + (0.2 * Math.max(0, spec.size.x - 128)) / 64);
  return Math.round(STAIR_MEADOW[spec.settings.terrain.buildableLand] * k);
}
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
 *  the map's floor), the gorge's fall two under the sill; a level higher where the lowest lake is the start's and
 *  the stair still fits under the highest ground (`stairBase`). */
export const STAIR_BASE = BED_FLOOR + 2;
/** The lowest lake's sill for a stair of `n` lakes a step `f` apart under highest ground `top`, its start's lake `k`
 *  (0, the lowest, or 1): the lowest lake that is the start's sinks a level through its ruined weir's breach in a
 *  drought, and on a bed two deep it kept 13 to 15 % of its water at the drought's worst day, three deep 31 to 34 %
 *  (§4.4 `drought.lakes`, §9), so it stands a level higher where the stair's top lake still fits; where it would not,
 *  the stair keeps its count and step (§4.4: they vary) and that lake its two levels. */
export const stairBase = (n: number, f: number, k: number, top: number): number =>
  STAIR_BASE + (k === 0 && STAIR_BASE + 1 + (n - 1) * f + 2 <= top ? 1 : 0);
/** The valley's line, over the side. */
export const VALLEY_LENGTH = [1.25, 1.5] as const;
/** The bypass's length at 192² (scaled by side), its mouth and its rows. */
/** The megadam's slot through the wall, in tiles (§4.1). */
export const MEGADAM_SLOT = [5, 6] as const;
export const BYPASS_LENGTH = [250, 330] as const;
export const BYPASS_MOUTH = 10;
const BYPASS_HALF = 2.6;
/** The bypass's room from the bodies and channels it runs past, tiles beyond its half: 4 left a lake's shore two
 *  tiles thick over the bypass's bed, which reads as a dam wall (`terrain.dam_wall`, seed 1 at 128² after #986). */
const BYPASS_ROOM = 5;
/** Lake arms' radius (each arm's widest), and arms a lake, to 192²: a larger map scales the radii in a lake's middle,
 *  the arms' length and their most by `mapScale`, so the stair's water keeps its share of the map. */
export const ARM_RADIUS = [7, 15] as const;
export const ARMS = [2, 5] as const;
/** How far a map's side is from 192² to 256², 0 to 1: the sizes past 192² whose stair made no map with the lakes and
 *  tarns sized as at 192² (water 12 to 15 % and moist 20 to 33 % at 256², PREMISES §9). */
const pastMid = (W: number) => Math.min(1, Math.max(0, (W - 192) / 64));
/** How much larger a map's lakes and tarns are drawn than at 192²: 1 to 192², √2 at 256² (the valley's spans already
 *  grow with the side; a radius grown by √2 too keeps the water's share, §4.1). */
export function mapScale(W: number): number {
  return 1 + (sqrt(2) - 1) * pastMid(W);
}
/** The spring tarns along the map's rim: two at 128², six at 192², ten at 256². Their springs and runs are most of
 *  the moist ground a larger map gains: a lake's shore grows with the side, the map with its square (§4.1). */
export const rimTarns = (W: number) => 2 + Math.round(Math.min(8, Math.max(0, (8 * (W - 128)) / 128)));
/** The most arms a lake has on a map of side `W`. */
export const armsMost = (W: number) => Math.round(ARMS[1] * mapScale(W));
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
/** A notch's dry bed at its shortest, tiles, at every size (the soil's reach does not scale). Its tarn's green runs
 *  about 16 tiles down it and its target lake's meadow covers its end, so a shorter bed buys little (§4.2: the ground a
 *  work pays on is dry on day 1); the longest of the nearest four that is this long is taken. (At step 5, with spring
 *  tarns 8 tiles from the lakes, asking 18 failed ten seeds of twelve; with the basins past the lakes' meadows, 20
 *  fails none. Scaled by side it asked 40 at 256², and a third of the layouts there found no notch.) */
const NOTCH_BED = 20;
/** How far a rim tarn stands from its edge at most, tiles: its run to the edge stays short, a thread of green. (14 lost
 *  seed 12 at 128² to its layouts, and in proportion to the side lost seed 3 at 256²; 9 left too few places.) */
const RIM_EDGE = 11;
/** A run to the edge never runs square to it like a ruler (D208): its mouth slides along the edge by up to `slide` of
 *  its distance, and its course bends `bend` of its length across, at most `most` tiles, at points `every` tiles apart
 *  (drawn from the run's own hash, so the plan's other draws stay put; a course that is not clear runs straight). */
const RUN_WANDER = { slide: 0.7, bend: 0.16, most: 7, every: 9 };
/** How far past a lake's or the pool's meadow its green reaches on day 1, and a little room, tiles: an empty basin
 *  stands past it, so the ground its works turn green is dry on day 1 (the soil reaches 16 tiles from water over level
 *  ground and stops at the first step up; a meadow is its width ± 3). */
const GREEN_PAST = 6;
/** How far a spring tarn's own green reaches past its outline, tiles (its narrow meadow under a crag of two). */
const SPRING_GREEN = 10;
/** How far a wet channel's green reaches past its banks, tiles (half or more of the ground within it is green). */
const CHANNEL_GREEN = 8;
/** Tiles a dry bed's thread turns green for each tile of it that runs through ground dry on day 1: the bed two deep
 *  in the land (`raster/relief.ts` `followsLand`), its thread three wide reaching 16 tiles, a level up to the bench
 *  and about seven tiles over it on each side. */
const GREEN_A_TILE = 20;
/** Tiles of a leat for each level it falls, at the least: it runs along the contour, as a leat is dug. */
const LEAT_RUN = 20;
/** How far out from the springs' pool a basin its leat fills is drawn, tiles from the outline to the basin's middle. */
const LEAT_OUT = [12, 30] as const;
/** How much further a channel's head keeps from a fall's head out of the same body: the lip's crest and piers take
 *  every tile within 2 of it (`rasterFalls`). */
const LIP_ROOM = 3;

/** The green the side network's works buy (§4.2), the same at every size since the soil's reach does not scale with
 *  the map; their count scales by area. Each is a floor and the most the plan expects (`Work.gives`): a work must buy
 *  at least its floor, the low end of §4.2's old range, never under `spectrum`'s 250 for a small work (§4.4); paying
 *  more is fine (the milestone's ruling within D508, 2026-11-11: what the ladder promises a player is "this work is
 *  worth building", not a tile count). The most is §4.2's old top, a small work's capped at 3 % of the map
 *  (`ladder.plan`): what the siting aims under, so the works together stay inside `spectrum`. */
const GIVES = {
  notch: [430, 570],
  damToPond: [270, 470],
  levee: [260, 340],
  leat: [1000, 1500],
} as const;
/** `spectrum`'s least for a small irrigation work (§4.4). */
const SMALL_LEAST = 250;
/** A work's floor and most on a map `W` a side. */
export function givesOf(kind: keyof typeof GIVES, W: number): [number, number] {
  const [lo, hi] = GIVES[kind];
  if (kind === "leat") return [lo, hi];
  const floor = Math.max(SMALL_LEAST, lo);
  return [floor, Math.max(floor, Math.min(hi, Math.floor(0.03 * W * W)))];
}
/** The tile area over 192²'s: counts and water held scale by it (§4.2, §4.4). */
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

/** The highest ground the stair is drawn under: Highest terrain, at most the in-game editor's 16 (PREMISES §1.3). A
 *  tall map's land rises past it away from the water (the plan's `sky`); its stair, water and works are a standard
 *  map's, since a stair drawn under 22 takes more lakes or taller steps, which moves the water's numbers. */
export const stairTop = (spec: MapSpec): number => Math.min(spec.settings.terrain.highestTerrain, EDITOR_LEVEL);

/** Every (n, f, start's lake, H) the spec's size and the stair's highest ground (`stairTop`) allow, with a landmark
 *  source on the stair. Where the floor leaves the size's stair one step `f` at most (4 lakes under highest ground 17:
 *  `STAIR_BASE`), a stair of one lake fewer is offered beside it, so the seed still varies the step (§4.1). */
export function stairOptions(spec: MapSpec): StairOption[] {
  const top = stairTop(spec);
  const counts = lakeCounts(spec);
  const out: StairOption[] = [];
  const add = (n: number) => {
    for (const f of STAIR_STEPS) {
      for (const k of [0, 1]) {
        const base = stairBase(n, f, k, top);
        if (base + (n - 1) * f + 2 > top) continue;
        for (const H of LANDMARK_HEIGHTS) {
          const F = base + k * f;
          let ok = sourceFits(F, H, base + (n - 1) * f, true);
          for (let j = k + 1; j < n; j++) if (sourceFits(F, H, base + j * f, false)) ok = true;
          if (ok) out.push({ n, f, k, H });
        }
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
  /** Stage 0's second pass: the skeleton's land and day 1's soil the side network is sited on (`siteSide`). */
  site?: SiteModel;
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
    top: stairTop(spec),
    sky: spec.settings.terrain.highestTerrain,
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
function drawLake(L: Layout, id: string, a: number, b: number, sill: number, drops: boolean): Body | null {
  const { rng, W } = L;
  const valley = L.stair.valley;
  const m = mapScale(W);
  const rMost = Math.min(ARM_RADIUS[1], 7 + W / 24) * m;
  const ra = rng.range(7, 9.5);
  const rb = rng.range(7, 9.5);
  const s0 = a + ra;
  const s1 = b - rb;
  if (s1 - s0 < 6) return null;
  const steps = Math.max(1, Math.round((s1 - s0) / 11));
  const main: Spine = [];
  for (let k = 0; k <= steps; k++) {
    const s = s0 + ((s1 - s0) * k) / steps;
    const r = k === 0 ? ra : k === steps ? rb : rng.range(8 * m, rMost);
    const { p } = pointAt(valley, s);
    main.push([r1(p[0]), r1(p[1]), r1(r)]);
  }
  return { id, kind: "lake", sill, arms: [main], meadow: L.stair.meadow + rng.int(-2, 3), deep: Math.min(sill - BED_FLOOR, holdDeep(drops, hazardDays(L.spec.designedFor, "drought"))), dry: false, region: "top" };
}

/** Side arms off a lake's main arm (2 to 5 arms in all): coves and bays, kept where they stay clear of every other
 *  body, the map's edge and the valley's line outside the lake's own stretch. */
function addArms(L: Layout, body: Body, span: [number, number]): boolean {
  const { rng, W } = L;
  const valley = L.stair.valley;
  const main = body.arms[0];
  const m = mapScale(W);
  const want = rng.int(ARMS[0] - 1, armsMost(W));
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
    const len = rng.range(8, 20) * m;
    const rBase = Math.max(7, Math.min(base[2], rng.range(7, base[2])));
    const tip = rng.range(4, 6.5) * m;
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
  // (the lakes' ends keep 192²'s radii, so the spans fit as they did; their middles swell by `mapScale`)
  const rMost = Math.min(ARM_RADIUS[1], 7 + W / 24);
  const room = to - from - gaps.reduce((s, x) => s + x, 0);
  const base = stairBase(n, f, k, L.plan.top);
  const F = base + k * f;
  const sourceLakes: number[] = [];
  for (let j = k + 1; j < n; j++) if (sourceFits(F, H, base + j * f, false)) sourceLakes.push(j);
  const poolFits = sourceFits(F, H, base + (n - 1) * f, true);
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
    // (every lake but the lowest sinks a level through its notch in a drought, and the start's through its breach)
    const lake = drawLake(L, `lake${i}`, span[0], span[1], stairBase(o.n, o.f, o.k, plan.top) + i * f, i > 0 || o.k === 0);
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
  L.pool = { id: "pool", kind: "pool", sill: top.sill, arms: [[[r1(pa[0]), r1(pa[1]), r1(pr)], [r1(pb[0]), r1(pb[1]), r1(pr - 0.5)]]], meadow: 6, deep: holdDeep(false, hazardDays(L.spec.designedFor, "drought")), dry: false, region: "top" };
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
      height: stairBase(o.n, o.f, o.k, plan.top) - BED_FLOOR,
      crest: stairBase(o.n, o.f, o.k, plan.top),
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

/** The dry ground a start needs within its walk (`START.near`), as a multiple of the moist land the gate asks of it
 *  (`start.farmland` and `start.forester`'s plot, D515): a share of it climbs off its meadow. 1.5 keeps the 300 tiles
 *  of room the speed step settled on (2.65 × the 113 tiles of the old level land; under 300, half the frames fell
 *  short on the relief); the start's bench itself is built on the land (`frame.ts` `buildBench`). */
const MEADOW_ROOM = 1.5;

/** How far a lake's water reaches past its spine's outline once stage 1 lays it on its ground, about. */
const MEADOW_SHORE = 3;

/** The tiles a start walks to within `START.near` steps without crossing water (`MEADOW_SHORE` from any body). */
function meadowRoom(sx: number, sy: number, bodies: Body[], W: number, H: number): number {
  const R = START.near;
  const side = 2 * R + 1;
  const seen = new Uint8Array(side * side);
  // (a body whose outline's box stands further off than the shore needs no closer look)
  const boxes = bodies.map((b) => outlineBox(b));
  const lim = (MEADOW_SHORE + 0.01) * (MEADOW_SHORE + 0.01);
  const dry = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const px = x + 0.5;
    const py = y + 0.5;
    for (let k = 0; k < bodies.length; k++) {
      const o = boxes[k];
      const gx = Math.max(0, o[0] - px, px - o[2]);
      const gy = Math.max(0, o[1] - py, py - o[3]);
      if (gx * gx + gy * gy > lim) continue;
      if (!(bodyDist(px, py, bodies[k]) > MEADOW_SHORE)) return false;
    }
    return true;
  };
  let q: [number, number][] = [[sx, sy]];
  seen[R * side + R] = 1;
  let n = 0;
  for (let k = 0; k <= R && q.length; k++) {
    const next: [number, number][] = [];
    for (const [x, y] of q) {
      n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        const u = xx - sx + R;
        const v = yy - sy + R;
        if (u < 0 || v < 0 || u >= side || v >= side || seen[v * side + u]) continue;
        seen[v * side + u] = 1;
        if (dry(xx, yy)) next.push([xx, yy]);
      }
    }
    q = next;
  }
  return n;
}

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
  // (the lip's line stands `lipStair` short of the top edge: its tiles step a tile either side of it)
  const limit = frameLimit(z, crest + FRAME.overLip) - FRAME.lipStair;
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
      // the start's meadow: dry ground it walks to without crossing water (a start between its lake and the bay has
      // none to build on)
      const rules = rulesFor(L.spec);
      if (meadowRoom(sx, sy, bodies, plan.W, plan.H) < MEADOW_ROOM * (rules.farmland + rules.forester)) continue;
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
    if (K.arms.length >= armsMost(L.W)) K.arms.length = armsMost(L.W) - 1;
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
 *  lowest sill, 250 to 330 tiles at 192² (scaled by side), mouth 10 wide, three rows of Blockages, the first at the
 *  mouth. Its course is a path of its own over the land (`bypassCourses`): out of the pool to a turning point the seed
 *  draws on the dry side, then on to its exit, each leg the cheapest way clear of every body and channel over the
 *  seed's rises and hollows, kept off the map's edge but where it leaves by it. A ring at a fixed distance in from the
 *  edge, as before, read as a band drawn parallel to the border on every map. */
function placeBypass(L: Layout): string | null {
  const { rng, plan, W } = L;
  const lo = (BYPASS_LENGTH[0] * W) / 192;
  const hi = (BYPASS_LENGTH[1] * W) / 192;
  const others = plan.links.filter((l) => l.path).map((l) => l.path!);
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const gl = pathLength(gorge.path!);
  const below = subPath(gorge.path!, gl * 0.6, gl);
  const rows = (len: number) => [2, Math.round(len * rng.range(0.45, 0.6)), Math.round(len * rng.range(0.75, 0.88))];
  // the exit the seed draws: an edge of its own, or the gorge below the lowest sill (past the megadam's slot); an
  // edge when no course reaches the gorge
  for (const toGorge of rng.float() < 0.5 ? [true, false] : [false]) {
    for (const [mouth, ...cells] of bypassCourses(L, others, toGorge ? below : null, lo, hi)) {
      const last = cells[cells.length - 1];
      const join = toGorge ? pointAt(below, pathDist(last[0], last[1], below).s).p : null;
      const out = join ?? toEdge(last, W, W);
      if (!join && plan.exits.some((x) => dist(x.at, out) < 16)) continue;
      const pts = cells.filter((_, k) => k === 0 || k === cells.length - 1 || k % 2 === 0);
      // (it winds as an old channel would, where its room lets it; straight where not)
      const clear = (p: Point[]) => (join ? clearPath(plan, p.slice(0, -1), BYPASS_HALF, [L.pool.id], others.filter((o) => o !== gorge.path), BYPASS_ROOM) : clearPath(plan, p, BYPASS_HALF, [L.pool.id], others, BYPASS_ROOM));
      const wave = rng.range(COURSE_WIND[1], COURSE_WIND[2]);
      const phase = rng.range(0, 6.2831853);
      const wound = [1, 0.5].map((k) => softCorners([mouth, ...wind(pts, wave, phase, k * COURSE_WIND[0]), out].map(rp))).find(clear);
      const simple = wound ?? softCorners([mouth, ...pts, out].map(rp));
      const len = pathLength(simple);
      if (len < lo || len > hi) continue;
      if (join) {
        if (simple !== wound && !clear(simple)) continue;
        plan.links.push({ id: "bypass", from: L.pool.id, to: gorge.to, kind: "bypass", path: simple, half: BYPASS_HALF, mouth: BYPASS_MOUTH, bed: { under: 3 }, wet: false, gates: [], rows: rows(len) });
      } else {
        if (simple !== wound && !clear(simple)) continue;
        const exit: Exit = { id: "exitBypass", edge: edgeOf(out, W, W), at: rp(out) };
        plan.exits.push(exit);
        plan.links.push({ id: "bypass", from: L.pool.id, to: exit.id, kind: "bypass", path: simple, half: BYPASS_HALF, mouth: BYPASS_MOUTH, bed: { under: 3 }, wet: false, gates: [], rows: rows(len) });
      }
      addName(plan, "bypass", rng.pick(BYPASS_NAMES));
      return null;
    }
  }
  return "placeBypass#1";
}

/** How the bypass winds about its course: the most it stands off it, tiles, and the length of a bend, tiles. */
const COURSE_WIND = [3, 28, 46] as const;

/** A course wound about itself: each point but the first and last moved across it by a wave `wave` tiles long and
 *  `amp` high (`COURSE_WIND`, half that where the whole does not clear), growing from nothing at each end. */
function wind(pts: Point[], wave: number, phase: number, amp: number): Point[] {
  const total = pathLength(pts);
  const out: Point[] = [pts[0]];
  let s = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    s += dist(pts[k - 1], pts[k]);
    const t = norm([pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]]);
    const ramp = Math.min(1, s / 10, (total - s) / 10);
    const off = amp * ramp * sin((6.2831853 * s) / wave + phase);
    out.push([pts[k][0] - t[1] * off, pts[k][1] + t[0] * off]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** The grid the bypass's course is found on, tiles a cell. */
const COURSE_CELL = 2;
/** The course's edge: no cell of it nearer the map's edge than the first, tiles (it leaves straight out from there
 *  to its exit); a cell costs more inside the second, by the third at the first, falling off smoothly (a square), so
 *  it keeps off the edge with no line to run along. */
const COURSE_EDGE = [4, 14, 3] as const;
/** The seed's rises and hollows the course weaves through: how many soft bumps, their radius a share of the map's side,
 *  and what each adds to a cell's cost at its middle. Dense and strong enough that no straight run is the cheapest
 *  way for long. */
const COURSE_BUMPS = [24, 0.06, 0.16, -0.6, 1.8] as const;
/** How far the bypass runs straight out of the pool before its course turns, tiles past the outline. */
const COURSE_LEAD = 8;
/** What a cell of the course at the start costs over one past its walk and `COURSE_AWAY` (`NEAR_WALK`), falling off
 *  straight. */
const COURSE_WALK = 3;
/** The start's ground the course keeps out of, tiles from it (its small works and the near basins stand there); and
 *  how far short of the farthest from the start its turning point may stand, tiles, and how far past its walk the
 *  course's cost falls off: the bypass runs on the far side, the dry side, leaving the start's side to the works (one
 *  turning anywhere left three layouts in four short of the works near the start). */
const COURSE_START = 26;
const COURSE_AWAY = 20;
/** Where the course's turning point stands along it, a share of its least length; how many turning points are tried,
 *  and how many exits from each. */
const COURSE_TURN = [0.3, 0.65, 10, 3] as const;

/** The bypass's course grid last worked out: its open cells, their distance from the start and the leads out of the
 *  pool (cells and mouths), for the land its key names (`bypassCourses`). Read only. */
const courseGrid = { key: "", open: new Uint8Array(0), near: new Float64Array(0), mouthOf: new Map<number, Point>(), seeds: [] as [number, number][] };

/** The bypass's course search's heap, kept between searches and grown when a search needs more. */
let courseHeapBuf = new Int32Array(0);
function courseHeap(n: number): Int32Array {
  if (courseHeapBuf.length < n) courseHeapBuf = new Int32Array(n);
  return courseHeapBuf;
}

/** The bypass's courses (`placeBypass`), each its mouth on the pool's outline and the cells it runs by, `lo` to `hi`
 *  tiles long with the way out: on a grid `COURSE_CELL` tiles a side, a cell costing its length times the seed's rises
 *  and hollows (`COURSE_BUMPS`), more the nearer the map's edge and none at it (`COURSE_EDGE`), none within the
 *  bypass's room of a body, a channel or the start. The first leg is the cheapest way from the pool's leads to a
 *  turning point (`COURSE_TURN`), the second the cheapest on from there, kept off the first, to a cell by the map's
 *  edge or beside `join` (the gorge below the slot) at the room it keeps. Two legs, since the cheapest way anywhere
 *  from the pool is too short for the bypass's length on a small map: it would take the length by running round the
 *  map's edge. */
function* bypassCourses(L: Layout, others: Point[][], join: Point[] | null, lo: number, hi: number): Generator<Point[]> {
  const { rng, plan, W } = L;
  const G = Math.floor(W / COURSE_CELL);
  const N = G * G;
  const at = (c: number): Point => [((c % G) + 0.5) * COURSE_CELL, (Math.floor(c / G) + 0.5) * COURSE_CELL];
  // (clearPath's room and half a cell over: the course runs between cell middles)
  const room = BYPASS_HALF + BYPASS_ROOM + 1.5;
  const s0: Point = [plan.frame.start.x, plan.frame.start.y];
  // (the graded band by the side past 128²: the rim tarns' band and their runs keep the edge's room)
  const edgeIn = (COURSE_EDGE[1] * Math.max(128, W)) / 128;
  const bumps = Array.from({ length: COURSE_BUMPS[0] }, () => ({ p: [rng.range(0, W), rng.range(0, W)] as Point, r: rng.range(COURSE_BUMPS[1], COURSE_BUMPS[2]) * W, a: rng.range(COURSE_BUMPS[3], COURSE_BUMPS[4]) }));
  const open = new Uint8Array(N);
  const cost = new Float64Array(N);
  // (each other channel's box: a cell further from it than the room needs no closer look)
  const otherBox = others.map((o) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of o) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1];
  });
  const roomBox = (room + 0.01) * (room + 0.01);
  // (and every body's but the pool's, round its outline: a cell further from it than the room needs no closer look)
  const bodies = plan.bodies.filter((b) => b !== L.pool);
  const bodyBox = bodies.map((b) => outlineBox(b));
  const nearBody = (p: Point): boolean => {
    for (let k = 0; k < bodies.length; k++) {
      const o = bodyBox[k];
      const gx = Math.max(0, o[0] - p[0], p[0] - o[2]);
      const gy = Math.max(0, o[1] - p[1], p[1] - o[3]);
      if (gx * gx + gy * gy > roomBox) continue;
      if (bodyDist(p[0], p[1], bodies[k]) <= room) return true;
    }
    return false;
  };
  const nearOther = (p: Point): boolean => {
    for (let k = 0; k < others.length; k++) {
      const [x0, y0, x1, y1] = otherBox[k];
      const gx = Math.max(0, x0 - p[0], p[0] - x1);
      const gy = Math.max(0, y0 - p[1], p[1] - y1);
      if (gx * gx + gy * gy > roomBox) continue;
      if (pathWithin(p[0], p[1], others[k], room)) return true;
    }
    return false;
  };
  // (the open cells and their distance from the start depend on the land laid so far alone: a layout's tail drawn
  // again, and the gorge's course and the edge's, ask for the same grid, so the last is kept)
  const key = JSON.stringify([W, plan.H, plan.frame.start, L.pool.id, plan.bodies.map((b) => b.arms), others]);
  if (courseGrid.key !== key) {
    const near = new Float64Array(N);
    const shut = new Uint8Array(N);
    for (let c = 0; c < N; c++) {
      const p = at(c);
      const edge = Math.min(p[0], p[1], W - p[0], W - p[1]);
      near[c] = dist(p, s0);
      if (edge < COURSE_EDGE[0] || near[c] <= COURSE_START || bodyWithin(p[0], p[1], L.pool, BYPASS_HALF + 1.5)) continue;
      if (nearBody(p)) continue;
      if (nearOther(p)) continue;
      shut[c] = 1;
    }
    // the leads: straight out of the pool from its middle, `COURSE_LEAD` tiles past its outline, so the mouth's first
    // row seals it
    const pc: Point = [L.pool.arms[0][0][0], L.pool.arms[0][0][1]];
    const mouthOf = new Map<number, Point>();
    const seeds: [number, number][] = [];
    for (let k = 0; k < 64; k++) {
      const dir = unitAt(k);
      let mouth: Point = pc;
      for (let t = 0; t < 80 && bodyDist(mouth[0], mouth[1], L.pool) < 0; t++) mouth = [mouth[0] + dir[0] * 0.5, mouth[1] + dir[1] * 0.5];
      const end: Point = [mouth[0] + dir[0] * COURSE_LEAD, mouth[1] + dir[1] * COURSE_LEAD];
      if (end[0] < 0 || end[1] < 0 || end[0] >= G * COURSE_CELL || end[1] >= G * COURSE_CELL) continue;
      const c = Math.floor(end[1] / COURSE_CELL) * G + Math.floor(end[0] / COURSE_CELL);
      // (at the bypass's own room: a lead nearer another channel than that left most courses short of it)
      if (!shut[c] || mouthOf.has(c) || !clearPath(plan, [mouth, at(c)], BYPASS_HALF, [L.pool.id], others, BYPASS_ROOM)) continue;
      mouthOf.set(c, rp(mouth));
      seeds.push([c, dist(mouth, at(c))]);
    }
    courseGrid.key = key;
    courseGrid.open = shut;
    courseGrid.near = near;
    courseGrid.mouthOf = mouthOf;
    courseGrid.seeds = seeds;
  }
  open.set(courseGrid.open);
  const { mouthOf, seeds } = courseGrid;
  const fromStart = courseGrid.near;
  // (each cell's rises and hollows, each bump added in turn over the cells it reaches)
  const rise = new Float64Array(N).fill(1);
  for (const b of bumps) {
    const r2 = b.r * b.r;
    const gx0 = Math.max(0, Math.floor((b.p[0] - b.r) / COURSE_CELL) - 1);
    const gx1 = Math.min(G - 1, Math.ceil((b.p[0] + b.r) / COURSE_CELL) + 1);
    const gy0 = Math.max(0, Math.floor((b.p[1] - b.r) / COURSE_CELL) - 1);
    const gy1 = Math.min(G - 1, Math.ceil((b.p[1] + b.r) / COURSE_CELL) + 1);
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = gy * G + gx;
        if (!open[c]) continue;
        const dx = (gx + 0.5) * COURSE_CELL - b.p[0];
        const dy = (gy + 0.5) * COURSE_CELL - b.p[1];
        const d2 = (dx * dx + dy * dy) / r2;
        if (d2 < 1) rise[c] += b.a * (1 - d2) * (1 - d2);
      }
  }
  for (let c = 0; c < N; c++) {
    if (!open[c]) continue;
    const p = at(c);
    const edge = Math.min(p[0], p[1], W - p[0], W - p[1]);
    const e = Math.max(0, (edgeIn - edge) / (edgeIn - COURSE_EDGE[0]));
    // (and more within the start's walk, where its small works stand: it leaves that land to them)
    const walk = Math.max(0, 1 - fromStart[c] / (NEAR_WALK + COURSE_AWAY));
    cost[c] = Math.max(0.4, rise[c]) + COURSE_EDGE[2] * e * e + COURSE_WALK * walk;
  }
  /** The cheapest ways out from `seeds` (cell, length so far) over the open cells but `shut` (Dijkstra, a heap). */
  const ways = (seeds: [number, number][], shut?: Uint8Array) => {
    const best = new Float64Array(N).fill(Infinity);
    const len = new Float64Array(N);
    const from = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    // (a binary heap of cells by `best` in a typed array: each cell is pushed at most once a neighbour, eight, and
    // once a seed)
    const heap = courseHeap(8 * N + seeds.length);
    let size = 0;
    const push = (c: number) => {
      let k = size++;
      heap[k] = c;
      while (k > 0) {
        const q = (k - 1) >> 1;
        if (best[heap[q]] <= best[heap[k]]) break;
        const t = heap[q];
        heap[q] = heap[k];
        heap[k] = t;
        k = q;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap[--size];
      if (size) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const a = 2 * k + 1;
          let m = k;
          if (a < size && best[heap[a]] < best[heap[m]]) m = a;
          if (a + 1 < size && best[heap[a + 1]] < best[heap[m]]) m = a + 1;
          if (m === k) break;
          const t = heap[m];
          heap[m] = heap[k];
          heap[k] = t;
          k = m;
        }
      }
      return top;
    };
    for (const [c, l] of seeds) {
      best[c] = 0;
      len[c] = l;
      push(c);
    }
    while (size) {
      const c = pop();
      if (done[c]) continue;
      done[c] = 1;
      const x = c % G;
      const y = (c - x) / G;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue;
          const n = yy * G + xx;
          if (!open[n] || done[n] || shut?.[n]) continue;
          const step = (dx && dy ? 1.41421356 : 1) * COURSE_CELL;
          const v = best[c] + (step * (cost[c] + cost[n])) / 2;
          if (v < best[n]) {
            best[n] = v;
            len[n] = len[c] + step;
            from[n] = c;
            push(n);
          }
        }
    }
    const back = (end: number): number[] => {
      const cells: number[] = [];
      for (let c = end; c >= 0; c = from[c]) cells.push(c);
      return cells.reverse();
    };
    return { done, len, back };
  };
  const first = ways(seeds);
  // (the way out adds a few tiles from the last cell, the softened corners take a few off)
  const isEnd = (c: number, l: number) => {
    if (l < lo - 8 - COURSE_EDGE[0] || l > hi - 6 - COURSE_EDGE[0]) return false;
    const p = at(c);
    if (!join) return Math.min(p[0], p[1], W - p[0], W - p[1]) < COURSE_EDGE[0] + COURSE_CELL;
    const d = pathDist(p[0], p[1], join).d;
    return d < BYPASS_HALF + 10 && d > room;
  };
  const turns: number[] = [];
  for (let c = 0; c < N; c++) if (first.done[c] && first.len[c] >= COURSE_TURN[0] * lo && first.len[c] <= COURSE_TURN[1] * lo) turns.push(c);
  // (the farthest from the start, `COURSE_AWAY`)
  let far = 0;
  for (const c of turns) far = Math.max(far, dist(at(c), s0));
  const isFar = (c: number) => dist(at(c), s0) >= Math.max(NEAR_WALK, far - COURSE_AWAY);
  // (then any other, where channels shut the far side off: each found only when the ones before it are refused)
  const tries = [...rng.shuffle(turns.filter(isFar)).slice(0, COURSE_TURN[2]), ...rng.shuffle(turns.filter((c) => !isFar(c))).slice(0, COURSE_TURN[2])];
  const reach = Math.ceil((1.5 * room) / COURSE_CELL);
  for (const t of tries) {
    const leg = first.back(t);
    // (the second leg keeps off the first, but where it turns)
    const shut = new Uint8Array(N);
    const tx = t % G;
    const ty = (t - tx) / G;
    for (const c of leg) {
      const x = c % G;
      const y = (c - x) / G;
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= G || yy >= G || (Math.abs(xx - tx) <= reach && Math.abs(yy - ty) <= reach)) continue;
          shut[yy * G + xx] = 1;
        }
    }
    const second = ways([[t, first.len[t]]], shut);
    const ends: number[] = [];
    for (let c = 0; c < N; c++) if (second.done[c] && isEnd(c, second.len[c])) ends.push(c);
    for (const e of rng.shuffle(ends).slice(0, COURSE_TURN[3])) {
      const cells = [...leg, ...second.back(e).slice(1)];
      yield [mouthOf.get(cells[0])!, ...cells.map(at)];
    }
  }
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
  // (its head clear of every other channel's head out of the same body: a leat whose head the bypass's mouth took ran
  // dry behind the bypass's first row; and of a fall's lip by `LIP_ROOM`, whose pier cut a leat off its pool)
  for (const l of plan.links) {
    if (l.from !== from.id || !l.path) continue;
    const room = (l.mouth ?? 2 * (l.half ?? 1)) / 2 + half + 1 + (l.fall ? LIP_ROOM : 0);
    if (dist(start, l.path[0]) < room) return null;
  }
  const path: Point[] = [rp(start), rp(to)];
  // (past its head it keeps a tile of ground from the body it leaves: one running along that body's shore touched its
  // water, and stage 1 parts the two there, cutting the channel; seed 11's leat at 128²)
  const len = pathLength(path);
  if (len > OWN_HEAD + 1 && pathBodyGap(path, from, OWN_HEAD, len, half + OWN_ROOM) < half + OWN_ROOM) return null;
  const others = plan.links.filter((l) => l.path).map((l) => l.path!);
  return clearPath(plan, path, half, ends, others, 3) ? path : null;
}

/** A channel's head, tiles along it, past which it keeps `OWN_ROOM` tiles past its half from the body it leaves. */
const OWN_HEAD = 4;
const OWN_ROOM = 2;

/** A run from a body to the edge (`RUN_WANDER`): its mouth slid along the edge, its course bent across; the straight
 *  run square to the edge where neither is clear. Its path and its mouth on the edge. */
function edgeRun(plan: PremisePlan, b: Body, c: Point, half: number): { path: Point[]; out: Point } | null {
  const { W } = plan;
  const u = (k: number) => (hash32(plan.seed, plan.W, "premise.run", b.id, k) % 10007) / 10006;
  const square = toEdge(c, W, W);
  const e = edgeOf(square, W, W);
  const along = e === "S" || e === "N" ? 0 : 1;
  const slid: Point = [square[0], square[1]];
  slid[along] = Math.max(10, Math.min(W - 10, square[along] + (2 * u(0) - 1) * RUN_WANDER.slide * dist(c, square)));
  for (const out of [slid, square]) {
    if (plan.exits.some((x) => dist(x.at, out) < 10)) continue;
    const straight = straightLink(plan, b, out, half, [b.id]);
    if (!straight) continue;
    straight[straight.length - 1] = rp(out);
    // (the bend: points `every` tiles apart moved across the run, none at its ends)
    const len = pathLength(straight);
    const n = Math.floor(len / RUN_WANDER.every);
    if (n >= 1) {
      const a = straight[0];
      const z = straight[1];
      const dx = (z[0] - a[0]) / len;
      const dy = (z[1] - a[1]) / len;
      const most = Math.min(RUN_WANDER.most, RUN_WANDER.bend * len);
      const bent: Point[] = [a];
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const o = most * (2 * u(k) - 1) * Math.min(1, 4 * t, 4 * (1 - t));
        bent.push(rp([a[0] + dx * len * t - dy * o, a[1] + dy * len * t + dx * o]));
      }
      bent.push(z);
      const others = plan.links.filter((l) => l.path).map((l) => l.path!);
      if (clearPath(plan, bent, half, [b.id], others, 3)) return { path: bent, out };
    }
    return { path: straight, out };
  }
  return null;
}

/** A run's bed at each point of its path: from `hi` at its head down to `lo` at its mouth, a whole level at a time by
 *  the length run. */
function runBed(path: Point[], hi: number, lo: number): number[] {
  const len = pathLength(path);
  const bed: number[] = [hi];
  let s = 0;
  for (let k = 1; k < path.length; k++) {
    s += dist(path[k - 1], path[k]);
    bed.push(k === path.length - 1 ? lo : hi - Math.floor(((hi - lo) * s) / len));
  }
  return bed;
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
  const pc: Point = [L.pool.arms[0][0][0], L.pool.arms[0][0][1]];
  // (a basin stands past a lake's meadow, so its works' ground is dry on day 1: the soil reaches a meadow's width over
  // level ground and stops at the first step up; a rim tarn hugs its edge, and the pool's basins stand near the pool)
  // (the pool's basins keep 6 from a lake, as from any body: 8 left a pool by the top lake no room for its basins)
  const sideGap = (o: Body, role: "rim" | "pool" | "wet") => (role === "rim" ? (o.kind === "lake" ? 8 : 6) : role === "pool" ? 6 : o.kind === "lake" || o.kind === "pool" ? o.meadow + GREEN_PAST : o.dry ? 6 : SPRING_GREEN);
  const site = (near: Point | null, role: "rim" | "pool" | "wet", edges?: number[]): Body | null => {
    const rim = role === "rim";
    for (let t = 0; t < 60; t++) {
      const r = rng.range(3.5, 6) * mapScale(W);
      // (a rim tarn's middle is drawn in the band along an edge it may stand in, the rest anywhere or near `near`)
      const rimAt = (e: number, a: number, d: number): Point => (e === 0 ? [a, d] : e === 1 ? [W - d, a] : e === 2 ? [a, W - d] : [d, a]);
      const p: Point = near ? [near[0] + rng.range(-42, 42), near[1] + rng.range(-42, 42)] : rim ? rimAt(edges ? edges[rng.int(0, edges.length)] : rng.int(0, 4), rng.range(8, W - 8), rng.range(4 + r, RIM_EDGE + r)) : [rng.range(8, W - 8), rng.range(8, W - 8)];
      const u = unitAt(rng.int(0, 64));
      // (a further rim tarn is drawn long or round, so the rim's tarns never stand in a row of one shape)
      const len = edges ? rng.range(0.6, 2) * r : rng.range(4, 8);
      const q: Point = [p[0] + u[0] * len, p[1] + u[1] * len];
      const b: Body = { id: "", kind: "tarn", sill: 0, arms: [[[r1(p[0]), r1(p[1]), r1(r)], [r1(q[0]), r1(q[1]), r1(r * 0.8)]]], meadow: 0, deep: 2, dry: false, region: "wet" };
      const eg = edgeGap(b, W, W);
      if (eg < 4 || (rim && eg > RIM_EDGE) || (!rim && eg < lakeEdge(W))) continue;
      // (the cheap checks first)
      if (dist2(p, s0) < (r + 16) * (r + 16)) continue;
      if (plan.bodies.some((o) => bodyGap(o, b, sideGap(o, role)) < sideGap(o, role))) continue;
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
    const run = edgeRun(plan, b, c, 1.1);
    if (!run) return false;
    const { path, out } = run;
    if (pathLength(path) > 0.3 * W) return false;
    const exit: Exit = { id: `exit${plan.exits.length}`, edge: edgeOf(out, W, W), at: rp(out) };
    plan.exits.push(exit);
    const id = `run${b.id}`;
    plan.links.push({ id, from: b.id, to: exit.id, kind: "brook", path, half: 1.1, bed: runBed(path, b.sill, Math.max(BED_FLOOR, b.sill - 3)), wet: true, gates: [], rows: [] });
    addName(plan, id, `${plan.names[b.id].split(" ")[0]} Run`);
    return true;
  };
  /** A rim tarn with its run to the edge, up to 8 draws; false where none fits. */
  const rimTarn = (spread = false): boolean => {
    // (a further one on the edges with the fewest so far: the rim's tarns spread round it, never a row along one edge)
    let edges: number[] | undefined;
    if (spread) {
      const used = [0, 0, 0, 0];
      for (const id of L.stair.rims ?? []) {
        const o = plan.bodies.find((x) => x.id === id);
        if (o) used[["S", "E", "N", "W"].indexOf(edgeOf([o.arms[0][0][0], o.arms[0][0][1]], W, W))]++;
      }
      const least = Math.min(...used);
      edges = [0, 1, 2, 3].filter((e) => used[e] === least);
    }
    for (let t = 0; t < 8; t++) {
      const b = site(null, "rim", edges);
      if (!b) return false;
      const sill = groundSill(b);
      const keep = plan.bodies.length;
      addTarn(b, "spring", sill);
      if (runToEdge(b)) {
        (L.stair.rims ??= []).push(b.id);
        return true;
      }
      plan.bodies.length = keep;
      tarns.pop();
      plan.sources.pop();
      spring--;
    }
    return false;
  };
  // the two rim tarns
  for (let k = 0; k < 2; k++) if (!rimTarn()) return "placeTarns#4";
  // the basins the pool's leats fill: enough that the gates are three (the neck, the hanging valley if it leaves the
  // pool, each pool leat's head); each leat is laid with its basin, so later channels go round it
  const gatedNow = plan.links.filter((l) => l.gates.length).length;
  for (let k = 0; k < GATES[0] - gatedNow; k++) {
    let leat: Point[] | null = null;
    let b: Body | null = null;
    for (let t = 0; t < 24 && !leat; t++) {
      b = site(pc, "pool");
      if (!b) break;
      leat = straightLink(plan, L.pool, nearestOn(b, pc), 0.55, [L.pool.id, ""]);
      if (leat && (pathLength(leat) > 0.32 * W || pathLength(leat) < 6)) leat = null;
    }
    if (!b || !leat) return "placeTarns#5";
    // (its leat runs along the contour, a level down for each `LEAT_RUN` tiles of it: the basin stands that high)
    addTarn(b, "basin", Math.min(L.pool.sill - 1, Math.max(groundSill(b), L.pool.sill - 1 - Math.floor(pathLength(leat) / LEAT_RUN))));
    L.poolBasins.add(b.id);
    plan.links.push({ id: `leat${b.id}`, from: L.pool.id, to: b.id, kind: "leat", path: leat, half: 0.55, bed: [L.pool.sill, b.sill + 1], wet: false, gates: [2], rows: [1] });
    addName(plan, `leat${b.id}`, `${plan.names[b.id].split(" ")[0]} Leat`);
  }
  // a larger map's further rim tarns (`rimTarns`), after the pool's basins, as many as the rim has room for
  // (on the edges with the fewest first, then any edge: a rim with fewer tarns is drier than the spectrum allows)
  for (let k = 2; k < rimTarns(W); k++) if (!rimTarn(true) && !rimTarn()) break;
  // the rest: near the start first (NEAR_SIDE of them), so three small works stand within its walk; then anywhere on
  // the wet side, until the count and the ladder's floor are met. At 128² they are empty basins (only the two rim tarns
  // carry springs, §4.1: a spring tarn's green and its run's were three to five points of the map's moist ground each,
  // seven seeds of twelve over `spectrum`'s 42 % at step 5); on a larger map, where a tarn's green is a smaller share
  // and the works' count asks more side bodies than an empty basin a leat can fill, the first near one and two in
  // five of the rest are spring tarns, where their runs find an edge
  const floor = Math.ceil(0.75 * Math.max(3, Math.round(SMALL_WORKS[0] * areaRatio(W, W))));
  let nearCount = 0;
  let misses = 0;
  const extra = Math.round(2 * areaRatio(W, W));
  while ((tarns.length < Math.max(want, floor) + extra || nearCount < NEAR_SIDE) && misses < 4) {
    const isNear = nearCount < NEAR_SIDE;
    const b = site(isNear ? s0 : null, "wet");
    if (isNear) nearCount++;
    if (!b) {
      misses++;
      continue;
    }
    const isSpring = W > 128 && (isNear ? nearCount === 1 : rng.float() < 0.4);
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

/** Whether a point is green on day 1 by the plan's arithmetic: within a lake's or the pool's meadow and the few tiles
 *  its green reaches past it, a spring tarn's spot, or beside a wet channel. */
function greenAt(plan: PremisePlan, p: Point, skip: string): boolean {
  for (const b of plan.bodies) {
    if (b.id === skip || b.dry) continue;
    if (bodyDist(p[0], p[1], b) < (b.kind === "lake" || b.kind === "pool" ? b.meadow + GREEN_PAST : SPRING_GREEN)) return true;
  }
  for (const l of plan.links) if (l.wet && l.path && l.kind !== "fall" && pathDist(p[0], p[1], l.path).d < (l.half ?? 1) + CHANNEL_GREEN) return true;
  return false;
}

/** How much of a dry bed runs through ground dry on day 1 (`greenAt`), past its own body's green: its tiles, and how far
 *  along the middle of its longest dry run stands. */
function dryRun(plan: PremisePlan, path: Point[], from: Body): { dry: number; mid: number } {
  const len = pathLength(path);
  let dry = 0;
  let run = 0;
  let best = 0;
  let mid = len / 2;
  for (let s = 0.5; s < len; s += 1) {
    const p = pointAt(path, s).p;
    if (bodyDist(p[0], p[1], from) >= (from.dry ? 3 : 6) && !greenAt(plan, p, from.id)) {
      dry++;
      run++;
      if (run > best) {
        best = run;
        mid = s - run / 2;
      }
    } else run = 0;
  }
  return { dry, mid };
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
  // spring tarns first: a dry bed to a lower lake or basin, opened by clearing its row: the notch. Its green is its thread's
  // through ground dry on day 1 (`dryRun`), so the bed is drawn to the point of a lower body's shore whose bed runs that far
  // through dry ground as the notch's `gives` asks, about `GREEN_A_TILE` a tile
  const notchGives = givesOf("notch", W);
  const notchDry = (notchGives[0] * AIM) / GREEN_A_TILE;
  for (const t of tarns.filter((b) => b.kind === "tarn")) {
    const c: Point = [t.arms[0][0][0], t.arms[0][0][1]];
    let link: Link | null = null;
    let target: Body | undefined;
    let fit = Infinity;
    let at = 0;
    for (const x of plan.bodies.filter((b) => (b.kind === "lake" && b.sill <= t.sill - 2) || (b.kind === "basin" && !fed.has(b.id) && !L.poolBasins.has(b.id) && b.sill <= t.sill - 1))) {
      for (const q of outlinePoints(x, 3)) {
        const d = dist(c, q);
        if (d < NOTCH_BED || d > 0.32 * W) continue;
        const path = straightLink(plan, t, q, 1.6, [t.id, x.id]);
        if (!path || pathLength(path) < NOTCH_BED || pathLength(path) > 0.32 * W) continue;
        const run = dryRun(plan, path, t);
        const miss = Math.abs(run.dry - notchDry);
        if (miss < fit) {
          fit = miss;
          link = { id: `bed${t.id}`, from: t.id, to: x.id, kind: "brook", path, half: 1.6, bed: [t.sill, x.sill], wet: false, gates: [], rows: [] };
          target = x;
          at = run.mid;
        }
      }
    }
    if (link && target) {
      link.rows = [1];
      plan.links.push(link);
      addName(plan, link.id, `${plan.names[t.id].split(" ")[0]} Brook`);
      const head = link.path![0];
      const notch = work({ rung: "small", kind: "notch", on: link.id, at: head, tiles: rng.int(3, 5), needs: [], gives: { green: givesOf("notch", W) }, tradeoff: `${plan.names[t.id]}'s water runs red down it in a badtide`, region: t.region });
      smallWorks.push(notch);
      if (target.kind === "basin") fed.add(target.id);
      if (pathLength(link.path!) >= DAM_BED) {
        // (in the middle of its dry run, where the bench beside its pond is dry ground)
        const mid = pointAt(link.path!, at).p;
        smallWorks.push(work({ rung: "small", kind: "damToPond", on: link.id, at: rp(mid), tiles: rng.int(4, 7), needs: [notch.id], gives: { green: givesOf("damToPond", W) }, region: t.region }));
      }
    }
  }
  // basins: fed by a leat from gated water (the pool, gated at its head; or a lake below the neck), spilling down a bed
  for (const b of tarns.filter((x) => x.kind === "basin")) {
    let feed: Work | undefined = plan.works.find((w) => w.kind === "notch" && plan.links.find((l) => l.id === w.on)?.to === b.id);
    const laid = plan.links.find((l) => l.id === `leat${b.id}`);
    if (!feed && laid) feed = work({ rung: "medium", kind: "leat", on: laid.id, at: laid.path![0], tiles: 3, needs: [], gives: { green: givesOf("leat", W) }, region: b.region });
    if (!feed) {
      const sources = L.poolBasins.has(b.id) ? [L.pool] : [L.pool, ...L.lakes].filter((s) => s.sill >= b.sill + 1).sort((p, q) => bodyGap(p, b) - bodyGap(q, b));
      for (const s of sources.slice(0, 3)) {
        if (s.id === L.pool.id && gated() >= GATES[1]) continue;
        if (s.sill < b.sill + 1) continue;
        const link = bedLink(`leat${b.id}`, s, b, "leat", false);
        if (!link) continue;
        // (along the contour: a level down for each `LEAT_RUN` tiles at most)
        if ((link.bed as number[])[0] - (link.bed as number[])[1] > Math.floor(pathLength(link.path!) / LEAT_RUN)) continue;
        link.rows = [1];
        if (s.id === L.pool.id) link.gates = [2];
        plan.links.push(link);
        addName(plan, link.id, `${plan.names[b.id].split(" ")[0]} Leat`);
        feed = work({ rung: "medium", kind: "leat", on: link.id, at: link.path![0], tiles: 3, needs: [], gives: { green: givesOf("leat", W) }, region: b.region });
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
      smallWorks.push(work({ rung: "small", kind: "levee", on: b.id, at: link.path![0], tiles: rng.int(6, 10), needs: [feed.id], gives: { green: givesOf("levee", W) }, region: b.region }));
      const run = dryRun(plan, link.path!, b);
      if (pathLength(link.path!) >= DAM_BED) {
        const mid = pointAt(link.path!, run.mid).p;
        smallWorks.push(work({ rung: "small", kind: "damToPond", on: link.id, at: rp(mid), tiles: rng.int(4, 7), needs: [feed.id], gives: { green: givesOf("damToPond", W) }, region: b.region }));
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
  // (on a lake with no other way out: a lake the landmark's valley also leaves pours its raised water down the valley)
  const allFalls = plan.links.filter((l) => l.kind === "fall" && l.id !== "landmark" && l.id !== weir.id);
  const alone = allFalls.filter((l) => !plan.links.some((x) => x !== l && x.from === l.from && !x.rows.length));
  const stairFalls = alone.length ? alone : allFalls;
  if (stairFalls.length) {
    const l = rng.pick(stairFalls);
    const mid: Point = rp([(l.fall!.lip[0][0] + l.fall!.lip[1][0]) / 2, (l.fall!.lip[0][1] + l.fall!.lip[1][1]) / 2]);
    work({ rung: "medium", kind: "raisedSill", on: l.id, at: mid, tiles: Math.max(11, Math.min(17, l.fall!.width + 3)), needs: [], gives: { green: [0, 0], reservoir: scale([600, 1400]) }, region: plan.bodies.find((b) => b.id === l.from)!.region });
  }
  // the large rung: the bypass (its rows cleared, the gates built) and the megadam in the gorge's slot
  const by = plan.links.find((l) => l.id === "bypass")!;
  work({ rung: "large", kind: "bypass", on: by.id, at: by.path![0], tiles: bypassTiles(plan), needs: [], gives: { green: scale([1100, 1500]) }, tradeoff: "The water it carries is the badtide's: nothing below it can drink", region: "dry" });
  const gorge = plan.links.find((l) => l.id === "gorge")!;
  const slot = pointAt(gorge.path!, pathLength(gorge.path!) * 0.5).p;
  work({ rung: "large", kind: "megadam", on: gorge.id, at: rp(slot), tiles: Math.min(MEGADAM_SLOT[1], Math.round(2 * gorge.half!)), needs: [], gives: { green: [0, 0], reservoir: [Math.round(0.4 * W * W), Math.round(0.5 * W * W)] }, tradeoff: o.k === 0 ? "It drowns the low meadows and the home bay's" : "It drowns the low meadows", region: "low" });
  return null;
}

/** The bypass's tiles to build: its three rows cleared and a gate on each gated link (§4.1). */
function bypassTiles(plan: PremisePlan): number {
  const rowTiles = BYPASS_MOUTH + 6 + Math.round(2 * BYPASS_HALF) + Math.round(2 * BYPASS_HALF) + 2;
  return rowTiles + plan.links.filter((l) => l.gates.length).reduce((t, l) => t + Math.round(2 * (l.half ?? 1)) + 2, 0);
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
  // (on a tall map the skyline rises to 21 over the stair, which stays under 16: `sky`)
  const skyTop = Math.min(plan.sky ?? plan.top, 21);
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
  const wallTop = Math.min(plan.top, stairBase(o.n, o.f, o.k, plan.top) + o.f + 3 + rng.int(0, 2));
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
    meadow: stairMeadow(spec),
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

// ------------------------------------------------------------------------------------------------- the works sited

/** Draws of stage 0's second pass, each from its own stream: a side network that falls short is drawn again. */
const SITE_TRIES = 3;
/** Draws for one side body's place before it is given up (arithmetic checks only, so cheap). */
const SITE_DRAWS = 200;
/** Side-body candidates weighed for each body placed (the first that pass the arithmetic checks), and how many of the
 *  best by their feed's estimate are weighed whole (levee and dam too). */
const SITE_CANDIDATES = 10;
const SITE_WHOLE = 2;

/** Empty basins' beach and its crag (`raster/relief.ts` `BASIN`), and a brook's and a leat's meadow (`MEADOW`). */
const BEACH = 3;
const BROOK_MEADOW = 12;
const LEAT_MEADOW = 10;

/** How far round a side body the siting reads day 1's soil, tiles past its outline, and the share of that ring that
 *  must be dry for a basin to stand there: its levee's and dam's green is the dry ground round it. */
const DRY_RING = 12;
const DRY_LEAST = 0.5;

/** A chain the first pass drew for a basin a leat fills: its basin (unnamed), sill, the leat's source, the leat and the
 *  spill. */
interface FirstChain {
  b: Body;
  src: string;
  s: number;
  path: Point[];
  spill?: { path: Point[]; to: string; lo: number; into: boolean; exit?: Exit };
}

/** The kinds of works that stand on the side network, drawn again by the second pass. */
const SIDE_KINDS: ReadonlySet<WorkKind> = new Set(["notch", "damToPond", "leat"]);
const isSide = (w: Work) => SIDE_KINDS.has(w.kind) || (w.kind === "levee" && w.rung !== "first");

/** The skeleton (`PremiseDef.skeleton`): the plan without its side network, the water day 1 has whatever the works
 *  do: every side body but the rim tarns, the links to and from them and the rim tarns' dry beds, their exits,
 *  sources and names, and the works on them. */
function skeletonOf(plan: PremisePlan): PremisePlan {
  const p = JSON.parse(JSON.stringify(plan)) as PremisePlan;
  const rims = new Set(p.stair?.rims ?? []);
  const side = new Set(p.bodies.filter((b) => (b.kind === "tarn" || b.kind === "basin") && !rims.has(b.id)).map((b) => b.id));
  const gone = new Set(p.links.filter((l) => side.has(l.from) || side.has(l.to) || (rims.has(l.from) && !l.wet)).map((l) => l.id));
  for (const id of [...side, ...gone]) delete p.names[id];
  p.bodies = p.bodies.filter((b) => !side.has(b.id));
  p.links = p.links.filter((l) => !gone.has(l.id));
  p.exits = p.exits.filter((e) => p.links.some((l) => l.to === e.id));
  p.sources = p.sources.filter((s) => !side.has(s.into));
  p.works = p.works.filter((w) => !isSide(w));
  delete p.notes;
  return p;
}

/** A body's tiles out to `out` past its outline: [tile, signed distance]. */
function bodyTiles(b: Body, W: number, out: number): [number, number][] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arm of b.arms)
    for (const [x, y, r] of arm) {
      x0 = Math.min(x0, x - r - out);
      y0 = Math.min(y0, y - r - out);
      x1 = Math.max(x1, x + r + out);
      y1 = Math.max(y1, y + r + out);
    }
  const res: [number, number][] = [];
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(W - 1, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const d = bodyDist(x + 0.5, y + 0.5, b);
      if (d <= out) res.push([y * W + x, d]);
    }
  return res;
}

/** A path's tiles within `half` of its line: [tile, distance along, distance across]. */
function pathTiles(path: readonly Point[], W: number, half: number): [number, number, number][] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of path) {
    x0 = Math.min(x0, x - half - 1);
    y0 = Math.min(y0, y - half - 1);
    x1 = Math.max(x1, x + half + 1);
    y1 = Math.max(y1, y + half + 1);
  }
  const res: [number, number, number][] = [];
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(W - 1, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      const { d, s } = pathDist(x + 0.5, y + 0.5, path);
      if (d <= half) res.push([y * W + x, s, d]);
    }
  return res;
}

/** A bed's stage 1 level `s` along a straight path of length `len` from `hi` to `lo`, a whole level at a time
 *  (`raster/channels.ts` `bedAt`). */
function stepBed(hi: number, lo: number, s: number, len: number): number {
  const t = len > 0 ? Math.max(0, Math.min(1, s / len)) : 1;
  return hi >= lo ? Math.max(lo, hi - Math.floor(t * (hi - lo + 0.999))) : Math.min(lo, hi + Math.floor(t * (lo - hi + 0.999)));
}

/** An empty basin at sill `s` as stages 2 and 4 lay it (§4.2): its floor, a beach at its sill + 1 within `BEACH` tiles
 *  (lower land kept lower, but for the ring beside its water), a crag of two past it; its water filled (ceiled at
 *  `s + 1`), and as its levee holds it (`s + 2`, over the beach, its bank a level over the beach). */
function basinPiece(M: SiteModel, b: Body, s: number, ground: Ground, fill: Wet, held?: Wet): void {
  for (const [i, d] of bodyTiles(b, M.W, 7)) {
    if (d < 0) {
      ground.set(i, s - 1);
      fill.set(i, s + 1);
      held?.set(i, s + 2);
      continue;
    }
    const h = M.at(i, ground);
    if (d < BEACH) {
      const v = d < 1.5 ? s + 1 : Math.min(h, s + 1);
      ground.set(i, v);
      if (v <= s + 1) held?.set(i, s + 2);
    } else ground.set(i, d < BEACH + 1 && h <= s + 1 ? s + 2 : Math.min(h, s + 3));
  }
}

/** A leat as stages 1 and 2 lay it: its bed a tile wide falling a level at a time from `hi` to `lo`, its meadow
 *  (`LEAT_MEADOW` tiles at bed + 1) beside it, its water ceiled a level over its bed. */
function leatPiece(M: SiteModel, path: readonly Point[], hi: number, lo: number, ends: Body[], ground: Ground, wet: Wet): void {
  const len = pathLength(path);
  for (const [i, s, d] of pathTiles(path, M.W, LEAT_MEADOW)) {
    const x = i % M.W;
    const y = (i - x) / M.W;
    if (ends.some((b) => bodyDist(x + 0.5, y + 0.5, b) < 0.5)) continue;
    const bed = stepBed(hi, lo, s, len);
    if (d <= 0.75) {
      ground.set(i, bed);
      wet.set(i, bed + 1);
    } else ground.set(i, Math.min(M.at(i, ground), bed + 1));
  }
}

/** A dry brook (a notch's bed, a basin's spill) as stages 1 and 2 lay it: its valley floor at its stage 1 bed + 2,
 *  `BROOK_MEADOW` tiles out; its bed two under the lowest land within 3 tiles, never rising, never under its end, a
 *  level over the lake it falls into but for its last 3 tiles (`raster/relief.ts` `followLand`); its thread of water
 *  ceiled a level over its bed, a tile either side of its line. Its bed a tile at a time along it, and its thread's
 *  tiles with their distance along. */
/** A dry bed as `brookPiece` lays it: its bed level a tile at a time along it, its thread's tiles and its bed's (three
 *  wide), each with its distance along. */
interface BedLay {
  bed: number[];
  thread: [number, number][];
  tiles: [number, number][];
}

function brookPiece(M: SiteModel, path: readonly Point[], hi: number, lo: number, into: boolean, ends: Body[], ground: Ground, wet: Wet): BedLay {
  const W = M.W;
  const len = pathLength(path);
  const tiles = pathTiles(path, W, BROOK_MEADOW).filter(([i]) => {
    const x = i % W;
    const y = (i - x) / W;
    return !ends.some((b) => bodyDist(x + 0.5, y + 0.5, b) < 0.5);
  });
  const inBed = new Set<number>();
  for (const [i, s, d] of tiles) {
    if (d <= 1.6) inBed.add(i);
    else ground.set(i, Math.min(M.at(i, ground), stepBed(hi, lo, s, len) + 2));
  }
  const bins = Math.floor(len) + 2;
  const want = new Array<number>(bins).fill(Infinity);
  for (const [i, s, d] of tiles) {
    if (d > 1.6) continue;
    const x = i % W;
    const y = (i - x) / W;
    let low = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
        const j = yy * W + xx;
        if (inBed.has(j) || M.soil[j] === 2) continue;
        low = Math.min(low, M.at(j, ground));
      }
    const b = Math.max(0, Math.floor(s));
    want[b] = Math.min(want[b], stepBed(hi, lo, s, len), Math.floor(low) - 2);
  }
  let run = Infinity;
  for (let b = 0; b < bins; b++) {
    if (b > 2 && want[b] < run) run = want[b];
    want[b] = Math.max(into && b < len - 3 ? lo + 1 : lo, Math.min(stepBed(hi, lo, b, len), run));
  }
  const thread: [number, number][] = [];
  const bedTiles: [number, number][] = [];
  for (const [i, s, d] of tiles) {
    if (d > 1.6) continue;
    const bed = want[Math.max(0, Math.floor(s))];
    ground.set(i, bed);
    bedTiles.push([i, s]);
    if (d <= 1) {
      wet.set(i, bed + 1);
      thread.push([i, s]);
    }
  }
  return { bed: want, thread, tiles: bedTiles };
}

const union = (...ws: Wet[]): Wet => {
  const out: Wet = new Map();
  for (const w of ws) for (const [i, v] of w) out.set(i, Math.max(out.get(i) ?? -Infinity, v));
  return out;
};

/** What the siting aims at, over a work's floor: an estimate lands within a quarter of the measure on most works, so a
 *  site estimated at its floor alone would measure under it about half the time. */
const AIM = 1.25;
/** How far an estimate stands under what the siting aims at (`AIM` over the floor of `r`, its `gives`), 0 at or over
 *  it, and a little past the most the plan expects of it (the works together stay inside `spectrum`). */
const shortOf = (v: number, r: readonly [number, number]) => (v >= r[0] * AIM ? (v > r[1] * AIM ? 0.1 * log((v + 1) / (r[1] * AIM + 1)) : 0) : log((r[0] * AIM + 1) / (v + 1)));
/** An estimate at or over its floor. */
const pays = (v: number | undefined, r: readonly [number, number]) => v !== undefined && v >= r[0];

/** Stage 0's second pass (`siting.ts`): the side network drawn on the skeleton's land, each work where its water
 *  reaches ground day 1 leaves dry. Each empty basin is placed with its feed (a leat, or a rim tarn's notch), its
 *  spill and the levee and dam on the spill as one chain, weighed by the soil's reach of each work's water on the land
 *  as its templates lay it (`SiteModel.gain`); a dam stands at a narrows with its pan behind it (`ladder.ts`
 *  `narrowsGround`). Each rim tarn's notch bed goes to a lake two or more below or feeds a chain, whichever buys the
 *  most over its floor; a rim whose notch buys under its floor everywhere has none, said in the notes.
 *
 *  A work is laid where its estimate reaches its floor (§4.2, a floor not a band), within the map's count of small
 *  works, keeping room for the kinds still missing and the three the start's walk needs. Where nothing on the land
 *  pays for a kind or for the start's walk, the best site short of its floor is laid and said short in `plan.notes`
 *  (never silent, D342); a ladder that still lacks a kind or its count is drawn again. */
function siteSide(L: Layout, firsts: readonly FirstChain[]): string | null {
  const { rng, plan, W } = L;
  const M = L.site!;
  const R = { notch: givesOf("notch", W), damToPond: givesOf("damToPond", W), levee: givesOf("levee", W), leat: givesOf("leat", W) };
  const notes: string[] = [];
  const st = plan.stair!;
  const s0: Point = [plan.frame.start.x, plan.frame.start.y];
  const bypassAll = plan.links.find((l) => l.id === "bypass")!.path!;
  const bypass = subPath(bypassAll, 25, pathLength(bypassAll));
  const lakeGap = (b: Body) => Math.min(...L.lakes.map((k) => bodyGap(k, b)));
  const used = Object.values(plan.names);
  const tarnWords = rng.shuffle(TARN_WORDS.filter((w) => !used.some((n) => n.startsWith(`${w} `))));
  const others = () => plan.links.filter((l) => l.path).map((l) => l.path!);
  const pc: Point = [L.pool.arms[0][0][0], L.pool.arms[0][0][1]];
  const rims = (st.rims ?? []).map((id) => plan.bodies.find((b) => b.id === id)!).filter(Boolean);
  const tarns: Body[] = [...rims];
  let tarnN = 1 + Math.max(-1, ...plan.bodies.filter((b) => /^tarn\d+$/.test(b.id)).map((b) => Number(b.id.slice(4))));
  let wn = 1 + Math.max(-1, ...plan.works.map((w) => Number(w.id.slice(1))));
  const side: Work[] = [];
  const work = (w: Omit<Work, "id">): Work => {
    const full = { id: `w${wn++}`, ...w };
    side.push(full);
    return full;
  };
  const gated = () => plan.links.filter((l) => l.gates.length).length;
  // the ladder's count of small works by area, and the start's walk
  const lo = Math.max(3, Math.round(SMALL_WORKS[0] * areaRatio(W, W)));
  const hi = Math.max(lo + 1, Math.round(SMALL_WORKS[1] * areaRatio(W, W)));
  const benchR = sqrt(plan.frame.bench / 3.141592653589793);
  const small = () => side.filter((w) => w.rung === "small");
  const isNear = (p: Point) => dist(p, s0) <= NEAR_WALK + benchR;
  const kindsMissing = () => SMALL_KINDS.filter((k) => !small().some((w) => w.kind === k));
  const nearShort = () => Math.max(0, NEAR_WORKS - small().filter((w) => isNear(w.at)).length);
  /** Whether a small work of `kind` at `at` may be laid: the count stays within the map's most, with room kept for the
   *  kinds still missing and the works the start's walk still lacks (one work may answer both). */
  const room = (kind: WorkKind, at: Point, taken = 0): boolean => {
    const left = hi - small().length - taken;
    if (left <= 0) return false;
    const missing = kindsMissing();
    const helps = missing.includes(kind as (typeof SMALL_KINDS)[number]) || (isNear(at) && nearShort() > 0);
    return helps || left - 1 >= Math.max(missing.length, nearShort());
  };
  // (the land's own soil says where day 1 is green, so a basin may stand nearer a lake than stage 0's blind guess of
  // its meadow and the green past it: its chain's estimate weighs what is left dry)
  /** Whether a new link's middle meets another's (`plan.overlap`'s rule: four tiles in from each end, 1.5 apart). */
  const mid = (path: Point[]) => {
    const len = pathLength(path);
    return len > 10 ? subPath(path, 4, len - 4) : null;
  };
  const crosses = (path: Point[] | undefined) => {
    const p = path && mid(path);
    return !!p && plan.links.some((l) => l.path && l.kind !== "fall" && (() => (q => !!q && pathGap(p, q, 1.5) < 1.5)(mid(l.path!)))());
  };
  const sideGap = (o: Body) => (o.dry ? 6 : o.kind === "lake" || o.kind === "pool" ? 5 : SPRING_GREEN);
  /** A point out from the springs' pool where a leat's head can leave it: an outline point clear of every other head
   *  out of it (`straightLink`'s room), `LEAT_OUT` tiles on outward. The pool's outline is crowded (the neck, the
   *  hanging valley, the bypass's mouth), so a basin drawn anywhere near it mostly has no clear line back. */
  const outFrom = (src: Body): Point | null => {
    const heads = plan.links.filter((l) => l.from === src.id && l.path);
    const clear = outlinePoints(src, 3).filter((q) => heads.every((l) => dist(q, l.path![0]) >= (l.mouth ?? 2 * (l.half ?? 1)) / 2 + 0.55 + 2 + (l.fall ? LIP_ROOM : 0)));
    if (!clear.length) return null;
    const q = clear[rng.int(0, clear.length - 1)];
    let c: Point = [src.arms[0][0][0], src.arms[0][0][1]];
    for (const arm of src.arms) for (const [x, y] of arm) if (dist2([x, y], q) < dist2(c, q)) c = [x, y];
    const d = dist(c, q) || 1;
    const out = rng.range(LEAT_OUT[0], LEAT_OUT[1]);
    return [q[0] + ((q[0] - c[0]) / d) * out, q[1] + ((q[1] - c[1]) / d) * out];
  };
  /** Whether a side body stands clear: of the map's edge, the start, every body, path and ridge, the bypass (but a
   *  pool basin's), and of every tile day 1 or the side network laid so far has water on. */
  const fits = (b: Body, pool: boolean, loose = false): boolean => {
    const line = b.arms[0].map(([x, y]) => [x, y] as Point);
    const [p, r] = [line[0], b.arms[0][0][2]];
    if (edgeGap(b, W, W) < lakeEdge(W)) return false;
    if (dist2(p, s0) < (r + 16) * (r + 16)) return false;
    // (`loose`: as near as the plan's checks let any two bodies stand)
    const gap = (o: Body) => (loose ? BODY_GAP + 1 : sideGap(o));
    if (plan.bodies.some((o) => bodyGap(o, b, gap(o)) < gap(o))) return false;
    if (others().some((o) => pathGap(o, line, r + 5) < r + 5)) return false;
    if (plan.ridges.some((rd) => pathGap(rd.path, line, rd.half + r + 3) < rd.half + r + 3)) return false;
    if (!pool && pathDist(p[0], p[1], bypass).d < lakeGap(b) + 4) return false;
    let dry = 0;
    let all = 0;
    for (const [i, d] of bodyTiles(b, W, DRY_RING)) {
      if (d < 2 && (M.soil[i] === 2 || M.taken[i])) return false;
      if (d < 3) continue;
      all++;
      if (!M.soil[i] && !M.taken[i]) dry++;
    }
    // (its works pay only on ground day 1 leaves dry: a basin in green land buys nothing; `loose`, for the last resort
    // that lays the best short of its floor, it may)
    return loose || dry >= DRY_LEAST * all;
  };
  const candidate = (near: Point | null, pool: boolean, loose = false): Body | null => {
    for (let t = 0; t < SITE_DRAWS; t++) {
      const r = rng.range(3.5, 6) * mapScale(W);
      // (a pool basin every other draw out from a clear stretch of the pool's outline: the outline is crowded)
      const out = pool && t % 2 === 0 ? outFrom(L.pool) : null;
      const p: Point = out ? [out[0] + rng.range(-4, 4), out[1] + rng.range(-4, 4)] : near ? [near[0] + rng.range(-42, 42), near[1] + rng.range(-42, 42)] : [rng.range(8, W - 8), rng.range(8, W - 8)];
      const u = unitAt(rng.int(0, 64));
      const len = rng.range(4, 8);
      const q: Point = [p[0] + u[0] * len, p[1] + u[1] * len];
      const b: Body = {
        id: "",
        kind: "basin",
        sill: 0,
        arms: [
          [
            [r1(p[0]), r1(p[1]), r1(r)],
            [r1(q[0]), r1(q[1]), r1(r * 0.8)],
          ],
        ],
        meadow: 0,
        deep: 2,
        dry: true,
        region: "wet",
      };
      if (fits(b, pool, loose)) return b;
    }
    return null;
  };
  /** The land round a body: the commonest level 1 to 4 tiles past its outline. */
  const levelAround = (b: Body): number => {
    const count = new Map<number, number>();
    for (const [i, d] of bodyTiles(b, W, 4)) if (d >= 1) count.set(M.land[i], (count.get(M.land[i]) ?? 0) + 1);
    let best = 0;
    let n = -1;
    for (const [h, c] of count) if (c > n || (c === n && h < best)) [best, n] = [h, c];
    return best;
  };
  /** A dam to pond on a dry bed (§4.2): at a narrows with its pan behind it (`narrowsGround`), where the pond buys the
   *  most over its floor; eight places along the bed at most. `wet` is the water its chain lays (no pan reaches it). */
  type Dam = { at: number; gain: number; ground: Ground; feed?: boolean };
  /** The levees and dams on laid chains and beds that buy under their floor: the ladder's last resort for their kind
   *  and the start's walk. */
  const shorts: { kind: "notch" | "levee" | "damToPond"; gain: number; at: Point; lay: () => void; laid?: boolean }[] = [];
  const layShort = (d: (typeof shorts)[number]) => {
    d.laid = true;
    d.lay();
  };
  const damOn = (bed: BedLay, len: number, before: Wet, ground: Ground, wet: Wet): Dam | undefined => {
    if (len < DAM_BED) return undefined;
    const { x: sx, y: sy } = plan.frame.start;
    const free = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      return M.soil[i] !== 2 && !M.taken[i] && !wet.has(i) && (Math.abs(x - sx) > 3 || Math.abs(y - sy) > 3);
    };
    let best: Dam | undefined;
    // (the pan stands `NARROWS.off` tiles clear of the water at the bed's head)
    for (let at = NARROWS.least + NARROWS.off; at <= len - 3; at += Math.max(2, Math.ceil(len / 8))) {
      const back = Math.min(NARROWS.back, Math.floor(at) - NARROWS.off);
      const b = bed.bed[Math.floor(at)];
      const lay = narrowsFit(bed.tiles, at, b, W, W, (i) => M.at(i, ground), free, back);
      if (!lay) continue;
      const g2: Ground = new Map(ground);
      for (const [i, v] of lay.ground) g2.set(i, v);
      // (the pond: the pan and the bed through it, a level over the dam's bed, read at the bench's level)
      const pond: Wet = new Map();
      for (const i of lay.pan) pond.set(i, b + 2);
      for (const [i, s] of bed.tiles) if (s < at && s >= at - lay.back - 2) pond.set(i, b + 2);
      const g = M.gain(union(before, pond), before, g2);
      if (!best || shortOf(g, R.damToPond) < shortOf(best.gain, R.damToPond)) best = { at, gain: g, ground: lay.ground };
    }
    return best;
  };

  // ---- an empty basin's chain: its feed (a leat from gated water, or a spring tarn's notch), the basin, its spill,
  // and the levee and dam on the spill
  interface Chain {
    b: Body;
    s: number;
    src: Body;
    kind: "leat" | "notch";
    path: Point[];
    /** None for a pool basin its gated leat alone keeps (the first pass draws them too): no levee, no dam on a spill. */
    spill?: { path: Point[]; to: string; lo: number; into: boolean; exit?: Exit };
    ground: Ground;
    feed: Wet;
    held: Wet;
    spillBed?: BedLay;
    gain: number;
    levee?: number;
    dam?: Dam;
  }
  const spillOf = (b: Body, s: number, feed: Point[]): NonNullable<Chain["spill"]> | null => {
    const lower = [
      ...L.lakes.filter((k) => k.sill <= s - 2).sort((p, q) => bodyGap(p, b) - bodyGap(q, b)).slice(0, 2),
      ...tarns.filter((t) => t.sill <= s - 1).sort((p, q) => bodyGap(p, b) - bodyGap(q, b)).slice(0, 2),
    ];
    // (clear of the basin's own feed)
    const clearOfFeed = (path: Point[]) => pathGap(subPath(path, 2.5, pathLength(path)), feed, 4.2) >= 4.2;
    for (const k of lower) {
      const path = straightLink(plan, b, nearestOn(k, [b.arms[0][0][0], b.arms[0][0][1]]), 1.6, [b.id, k.id]);
      if (!path || pathLength(path) > 0.32 * W || pathLength(path) < 6 || !clearOfFeed(path)) continue;
      return { path, to: k.id, lo: k.sill, into: !k.dry };
    }
    const c: Point = [b.arms[0][0][0], b.arms[0][0][1]];
    const at = toEdge(c, W, W);
    if (plan.exits.some((x) => dist(x.at, at) < 10)) return null;
    const path = straightLink(plan, b, at, 1.6, [b.id]);
    if (!path || pathLength(path) > 0.32 * W || !clearOfFeed(path)) return null;
    path[path.length - 1] = rp(at);
    return { path, to: "", lo: Math.max(BED_FLOOR, s - 3), into: false, exit: { id: `exit${plan.exits.length}`, edge: edgeOf(at, W, W), at: rp(at) } };
  };
  /** The sill a basin stands at: a level under the land round it, or two where its feed's fall asks it. */
  const sillsFor = (b: Body, lo: number, hi: number): number[] => {
    const P = levelAround(b);
    const want = [P - 1, P - 2].filter((s) => s >= lo && s <= hi).slice(0, 1);
    const out = want.length ? want : [Math.max(lo, Math.min(hi, P - 1))];
    return out.filter((s) => s >= BED_FLOOR + 2 && s <= plan.top - 2);
  };
  /** A chain weighed: its feed's gain (its leat's or notch's water, the basin filled and its spill's thread), then,
   *  `whole`, its levee's and its best dam's. */
  const weigh = (c: Omit<Chain, "ground" | "feed" | "held" | "spillBed" | "gain" | "levee" | "dam">, whole: boolean): Chain => {
    const { b, s, src, path, spill } = c;
    const ground: Ground = new Map();
    const fill: Wet = new Map();
    const held: Wet = new Map();
    basinPiece(M, b, s, ground, fill, held);
    const way: Wet = new Map();
    let feedBed: BedLay | undefined;
    if (c.kind === "leat") leatPiece(M, path, src.sill, s + 1, [src, b], ground, way);
    else feedBed = brookPiece(M, path, src.sill, s, false, [src, b], ground, way);
    const spillWet: Wet = new Map();
    const target = spill && plan.bodies.find((x) => x.id === spill.to);
    const spillBed = spill && brookPiece(M, spill.path, s, spill.lo, spill.into, target ? [b, target] : [b], ground, spillWet);
    const feed = union(fill, way, spillWet);
    const out: Chain = { ...c, ground, feed, held, spillBed, gain: M.gain(feed, new Map(), ground) };
    if (!whole) return out;
    if (spill && spillBed) {
      out.levee = M.gain(union(feed, held), feed, ground);
      out.dam = damOn(spillBed, pathLength(spill.path), feed, ground, union(fill, way, held));
    }
    // (a notch's bed is a dry bed too: its dam where it buys more)
    const onFeed = feedBed && damOn(feedBed, pathLength(path), feed, ground, union(fill, held, spillWet));
    if (onFeed && (!out.dam || onFeed.gain > out.dam.gain)) out.dam = { ...onFeed, feed: true };
    return out;
  };
  /** Where a chain's dam stands: on its spill, or on its notch's bed. */
  const damPoint = (c: Chain): Point => (c.dam ? pointAt(c.dam.feed || !c.spill ? c.path : c.spill.path, c.dam.at).p : (c.spill?.path[0] ?? c.path[c.path.length - 1]));
  const feedRange = (c: Pick<Chain, "kind">) => (c.kind === "leat" ? R.leat : R.notch);
  /** A chain's worth: its works' shortfalls under what the siting aims at (`want` weighs a kind the ladder still
   *  lacks, or the start's walk, double). */
  const chainShort = (c: Chain, want?: WorkKind) => {
    const w = (k: WorkKind) => (k === want ? 2 : 1) * 0.5;
    return (
      (c.kind === "notch" ? 1 : 0.5) * shortOf(c.gain, feedRange(c)) +
      w("levee") * (c.levee !== undefined ? shortOf(c.levee, R.levee) : 3) +
      w("damToPond") * (c.dam ? shortOf(c.dam.gain, R.damToPond) : 3)
    );
  };
  /** Chains on up to `SITE_CANDIDATES` basins drawn near `near`, fed by a leat (from the pool alone, `pool`) or by
   *  `spring`'s notch; the best `SITE_WHOLE` by their feed's estimate weighed whole, best first. */
  const chainsNear = (near: Point | null, pool: boolean, spring?: Body, want?: WorkKind, loose = false): Chain[] => {
    const weighed: Chain[] = [];
    // (the chains stage 0's first pass drew, as it drew them, while unused: the pool's for the pool's, and near the
    // start for the start's walk where nothing else stands, since the lakes leave a basin there least room)
    for (const f of firsts) {
        const src = plan.bodies.find((x) => x.id === f.src);
        if (!src || spring || (pool ? src.id !== L.pool.id : !near || !loose || dist([f.b.arms[0][0][0], f.b.arms[0][0][1]], near) > NEAR_WALK)) continue;
        if (!pool && src.id === L.pool.id && gated() >= GATES[1]) continue;
        if (plan.bodies.some((o) => bodyGap(o, f.b, BODY_GAP) < BODY_GAP)) continue;
        const line = f.b.arms[0].map(([x, y]) => [x, y] as Point);
        const r = f.b.arms[0][0][2];
        if (others().some((o) => pathGap(o, line, r + 2) < r + 2)) continue;
        if (!clearPath(plan, f.path, 0.55, [src.id], others()) || (f.spill && !clearPath(plan, f.spill.path, 1.6, f.spill.to ? [f.spill.to] : [], others()))) continue;
        const exit = f.spill?.exit ? { ...f.spill.exit, id: `exit${plan.exits.length}` } : undefined;
        const b: Body = { ...f.b, arms: f.b.arms.map((a) => a.map((q) => [...q] as [number, number, number])) };
        const spill = f.spill && { ...f.spill, path: f.spill.path.map((q) => [...q] as Point), exit };
        weighed.push(weigh({ b, s: f.s, src, kind: "leat", path: f.path.map((q) => [...q] as Point), spill }, false));
      }
    for (let t = 0; t < SITE_CANDIDATES; t++) {
      const b = candidate(near, pool, loose);
      if (!b) break;
      if (spring) {
        const path = straightLink(plan, spring, nearestOn(b, [spring.arms[0][0][0], spring.arms[0][0][1]]), 1.6, [spring.id, ""]);
        if (!path || pathLength(path) < NOTCH_BED || pathLength(path) > 0.32 * W) continue;
        for (const s of sillsFor(b, BED_FLOOR + 2, spring.sill - 1)) {
          const spill = spillOf(b, s, path);
          if (spill) weighed.push(weigh({ b, s, src: spring, kind: "notch", path, spill }, false));
        }
        continue;
      }
      const sources = pool ? [L.pool] : [L.pool, ...L.lakes].filter((x) => !(x.id === L.pool.id && gated() >= GATES[1])).sort((p, q) => bodyGap(p, b) - bodyGap(q, b)).slice(0, 3);
      for (const src of sources) {
        const path = straightLink(plan, src, nearestOn(b, [src.arms[0][0][0], src.arms[0][0][1]]), 0.55, [src.id, ""]);
        if (!path || pathLength(path) > 0.32 * W || pathLength(path) < 6) continue;
        // (along the contour: a level down for each `LEAT_RUN` tiles at most)
        const lo = src.sill - 1 - Math.floor(pathLength(path) / LEAT_RUN);
        for (const s of sillsFor(b, lo, src.sill - 1)) {
          const spill = spillOf(b, s, path);
          // (a pool basin may go without: its gated leat keeps it, as the first pass's may)
          if (spill || (pool && loose)) weighed.push(weigh({ b, s, src, kind: "leat", path, spill: spill ?? undefined }, false));
        }
      }
    }
    for (let k = weighed.length - 1; k >= 0; k--) if (crosses(weighed[k].path) || crosses(weighed[k].spill?.path)) weighed.splice(k, 1);
    weighed.sort((p, q) => shortOf(p.gain, feedRange(p)) - shortOf(q.gain, feedRange(q)));
    const whole = weighed.slice(0, SITE_WHOLE).map((c) => weigh(c, true));
    return whole.sort((p, q) => chainShort(p, want) - chainShort(q, want));
  };
  /** The small works a chain would lay: its notch (its feed) where it has one; its levee and dam where they pay their
   *  floor, or the one kind `force` names though it falls short; each within the ladder's room. */
  const chainWorks = (c: Chain, force?: WorkKind): WorkKind[] => {
    const out: WorkKind[] = [];
    if (c.kind === "notch") {
      if (!room("notch", c.path[0])) return [];
      out.push("notch");
    }
    const levee = c.levee !== undefined && c.levee > 0 && (pays(c.levee, R.levee) || force === "levee");
    const dam = !!c.dam && c.dam.gain > 0 && (pays(c.dam.gain, R.damToPond) || force === "damToPond");
    const damAt = damPoint(c);
    // (the better paying of the two first, so a full ladder keeps it)
    const both: [WorkKind, boolean, Point, number][] = [
      ["levee", levee, c.spill?.path[0] ?? c.path[0], c.levee ?? 0],
      ["damToPond", dam, damAt, c.dam?.gain ?? 0],
    ];
    both.sort((p, q) => q[3] / R[p[0] as "levee"][0] - p[3] / R[q[0] as "levee"][0]);
    for (const [k, ok, at] of both) if (ok && room(k, at, out.length)) out.push(k);
    return out;
  };
  /** Lays a chain with the small works `chainWorks` gives it: the basin, its feed's link (a pool leat gated at its
   *  head), its spill, its works and the ground. */
  const layChain = (c: Chain, pool: boolean, kinds: WorkKind[]): void => {
    const id = `tarn${tarnN++}`;
    c.b.id = id;
    c.b.sill = c.s;
    c.b.meadow = Math.max(7, L.stair.meadow - rng.int(0, 6));
    plan.bodies.push(c.b);
    tarns.push(c.b);
    addName(plan, id, `${tarnWords[(tarns.length - 1) % tarnWords.length]} Basin`);
    if (pool) L.poolBasins.add(id);
    const feedId = c.kind === "leat" ? `leat${id}` : `bed${c.src.id}`;
    const word = (plan.names[c.kind === "leat" ? id : c.src.id] ?? "").split(" ")[0];
    if (c.kind === "leat") plan.links.push({ id: feedId, from: c.src.id, to: id, kind: "leat", path: c.path, half: 0.55, bed: [c.src.sill, c.s + 1], wet: false, gates: c.src.id === L.pool.id ? [2] : [], rows: [1] });
    else plan.links.push({ id: feedId, from: c.src.id, to: id, kind: "brook", path: c.path, half: 1.6, bed: [c.src.sill, c.s], wet: false, gates: [], rows: [1] });
    addName(plan, feedId, `${word} ${c.kind === "leat" ? "Leat" : "Brook"}`);
    const spillId = `spill${id}`;
    if (c.spill) {
      if (c.spill.exit) {
        plan.exits.push(c.spill.exit);
        c.spill.to = c.spill.exit.id;
      }
      plan.links.push({ id: spillId, from: id, to: c.spill.to, kind: "brook", path: c.spill.path, half: 1.6, bed: [c.s, c.spill.lo], wet: false, gates: [], rows: [] });
      addName(plan, spillId, `${plan.names[id].split(" ")[0]} Beck`);
    }
    M.lay(c.ground);
    M.mark(c.feed);
    const range = feedRange(c);
    const feed =
      c.kind === "leat"
        ? work({
            rung: "medium",
            kind: "leat",
            on: feedId,
            at: c.path[0],
            tiles: 3,
            needs: [],
            gives: { green: range },
            estimate: c.gain,
            region: "wet",
          })
        : work({
            rung: "small",
            kind: "notch",
            on: feedId,
            at: c.path[0],
            tiles: rng.int(3, 5),
            needs: [],
            gives: { green: range },
            estimate: c.gain,
            tradeoff: `${plan.names[c.src.id]}'s water runs red down it in a badtide`,
            region: c.src.region,
          });
    if (c.kind === "leat" && !pays(c.gain, range)) notes.push(`${plan.names[feedId]} greens about ${c.gain} by the land, under its floor of ${range[0]}: no basin site bought more`);
    const layLevee = () => work({ rung: "small", kind: "levee", on: id, at: c.spill!.path[0], tiles: rng.int(6, 10), needs: [feed.id], gives: { green: R.levee }, estimate: c.levee, region: "wet" });
    if (kinds.includes("levee")) layLevee();
    else if (c.levee) shorts.push({ kind: "levee", gain: c.levee, at: c.spill!.path[0], lay: layLevee });
    const layDam = (dam: Dam) => {
      M.lay(dam.ground);
      work({
        rung: "small",
        kind: "damToPond",
        on: dam.feed ? feedId : spillId,
        at: rp(pointAt(dam.feed || !c.spill ? c.path : c.spill.path, dam.at).p),
        tiles: rng.int(4, 7),
        needs: [feed.id],
        gives: { green: R.damToPond },
        estimate: dam.gain,
        region: "wet",
      });
    };
    if (kinds.includes("damToPond") && c.dam) layDam(c.dam);
    else if (c.dam && c.dam.gain > 0) shorts.push({ kind: "damToPond", gain: c.dam.gain, at: damPoint(c), lay: () => layDam(c.dam!) });
  };
  /** The best chain near a point that lays a small work (`kinds` of them, `near` the start's walk when asked), or the
   *  best short of its floor with `force`. */
  const bestChain = (at: Point | null, opts: { near?: boolean; want?: WorkKind; force?: boolean }): { c: Chain; kinds: WorkKind[] } | null => {
    const cs = chainsNear(at, false, undefined, opts.want, opts.force);
    for (const c of cs) {
      const kinds = chainWorks(c, opts.force ? opts.want : undefined);
      const fit = kinds.filter((k) => (opts.want ? k === opts.want : true) && (!opts.near || isNear(k === "levee" ? c.spill!.path[0] : damPoint(c))));
      if (fit.length) return { c, kinds };
    }
    return null;
  };

  // the pool's basins: enough that the gates are three (the neck, the hanging valley if it leaves the pool, each pool
  // leat's head); their leats are medium works, their levee and dam small ones where they pay
  const poolWant = GATES[0] - gated();
  for (let k = 0; k < poolWant; k++) {
    const c = chainsNear(pc, true)[0] ?? chainsNear(null, true)[0] ?? chainsNear(pc, true, undefined, undefined, true)[0];
    if (!c) return "siteSide#1 (no basin for a leat from the pool)";
    layChain(c, true, chainWorks(c));
  }
  // each rim tarn's notch: its dry bed to a lake two or more below, or a basin it fills (a chain), whichever buys the
  // most over its floor; a dam on a bed to a lake where its pond pays. A notch whose best buys under its floor is left
  // out, kept as the ladder's last resort for its kind
  type Bed = { t: Body; path: Point[]; x: Body; ground: Ground; wet: Wet; bed: BedLay; gain: number; dry: number; laid?: boolean };
  for (const t of rims) {
    if (!room("notch", [t.arms[0][0][0], t.arms[0][0][1]])) break;
    const beds: Bed[] = [];
    const c: Point = [t.arms[0][0][0], t.arms[0][0][1]];
    for (const x of L.lakes.filter((k) => k.sill <= t.sill - 2))
      for (const q of outlinePoints(x, 3)) {
        const d = dist(c, q);
        if (d < NOTCH_BED || d > 0.32 * W) continue;
        const path = straightLink(plan, t, q, 1.6, [t.id, x.id]);
        if (!path || pathLength(path) < NOTCH_BED || pathLength(path) > 0.32 * W || crosses(path)) continue;
        // (cheap first: the tiles of its line day 1 leaves dry)
        let dry = 0;
        const len = pathLength(path);
        for (let s = 0.5; s < len; s += 1) {
          const p = pointAt(path, s).p;
          const i = Math.min(W - 1, Math.floor(p[1])) * W + Math.min(W - 1, Math.floor(p[0]));
          if (!M.soil[i] && !M.taken[i]) dry++;
        }
        beds.push({
          t,
          path,
          x,
          ground: new Map(),
          wet: new Map(),
          bed: { bed: [], thread: [], tiles: [] },
          gain: 0,
          dry,
        });
      }
    // (the longest dry runs, at about `GREEN_A_TILE` of green a tile of dry bed, weighed whole)
    beds.sort((p, q) => q.dry - p.dry);
    const top = beds.slice(0, 4);
    // (and, while the start's walk lacks works, the two whose notch stands nearest the start)
    if (nearShort() > 0) for (const b of [...beds].sort((p, q) => dist(p.path[0], s0) - dist(q.path[0], s0)).slice(0, 2)) if (!top.includes(b) && isNear(b.path[0])) top.push(b);
    for (const b of top) {
      b.bed = brookPiece(M, b.path, t.sill, b.x.sill, true, [t, b.x], b.ground, b.wet);
      b.gain = M.gain(b.wet, new Map(), b.ground);
    }
    // (of the beds that pay, one whose notch stands in the start's walk while the walk lacks works)
    const walk = (b: Bed) => (nearShort() > 0 && pays(b.gain, R.notch) && isNear(b.path[0]) ? 1 : 0);
    top.sort((p, q) => walk(q) - walk(p) || shortOf(p.gain, R.notch) - shortOf(q.gain, R.notch));
    const bed = top[0];
    const chain = chainsNear(c, false, t)[0];
    const chainBetter = chain && (!bed || shortOf(chain.gain, R.notch) + 0.25 * chainShort(chain) < shortOf(bed.gain, R.notch) + 0.25 * 3);
    if (chain && chainBetter && pays(chain.gain, R.notch)) {
      layChain(chain, false, chainWorks(chain));
      continue;
    }
    if (!bed || !pays(bed.gain, R.notch)) {
      const best = Math.max(bed?.gain ?? 0, chain?.gain ?? 0);
      notes.push(`${plan.names[t.id]} has no notch: its best dry bed greens about ${best}, under a notch's floor of ${R.notch[0]}`);
      if (bed) shorts.push({ kind: "notch", gain: bed.gain, at: bed.path[0], lay: () => layBed(bed, true) });
      continue;
    }
    layBed(bed);
  }
  /** Lays a rim tarn's notch on its dry bed to a lake, and the dam on the bed where it pays (or `force`). */
  function layBed(bed: Bed, force = false): void {
    const { t } = bed;
    bed.laid = true;
    const linkId = `bed${t.id}`;
    plan.links.push({ id: linkId, from: t.id, to: bed.x.id, kind: "brook", path: bed.path, half: 1.6, bed: [t.sill, bed.x.sill], wet: false, gates: [], rows: [1] });
    addName(plan, linkId, `${plan.names[t.id].split(" ")[0]} Brook`);
    M.lay(bed.ground);
    M.mark(bed.wet);
    const notch = work({
      rung: "small",
      kind: "notch",
      on: linkId,
      at: bed.path[0],
      tiles: rng.int(3, 5),
      needs: [],
      gives: { green: R.notch },
      estimate: bed.gain,
      tradeoff: `${plan.names[t.id]}'s water runs red down it in a badtide`,
      region: t.region,
    });
    if (force) return;
    const dam = damOn(bed.bed, pathLength(bed.path), bed.wet, bed.ground, bed.wet);
    if (!dam || !dam.gain) return;
    const at = pointAt(bed.path, dam.at).p;
    const lay = () => {
      M.lay(dam.ground);
      work({
        rung: "small",
        kind: "damToPond",
        on: linkId,
        at: rp(at),
        tiles: rng.int(4, 7),
        needs: [notch.id],
        gives: { green: R.damToPond },
        estimate: dam.gain,
        region: t.region,
      });
    };
    if (pays(dam.gain, R.damToPond) && room("damToPond", at)) lay();
    else shorts.push({ kind: "damToPond", gain: dam.gain, at, lay });
  }
  // the start's walk: three small works within it (the rim tarns' may stand in it), each where it pays; the last try
  // lays the best short of its floor: a chain's, or a dam or a notch on a rim tarn's bed
  for (let misses = 0; nearShort() > 0 && misses <= NEAR_SIDE;) {
    const force = misses === NEAR_SIDE;
    // (forced: the kind still missing first, then either)
    const wants = force ? [...(["levee", "damToPond"] as const)].sort((p, q) => Number(kindsMissing().includes(q)) - Number(kindsMissing().includes(p))) : [undefined];
    let got: ReturnType<typeof bestChain> = null;
    for (const want of wants) if (!got) got = bestChain(s0, { near: true, want, force });
    if (got) layChain(got.c, false, got.kinds);
    else misses++;
  }
  const byFloor = (p: (typeof shorts)[number], q: (typeof shorts)[number]) => q.gain / R[q.kind][0] - p.gain / R[p.kind][0];
  for (const d of shorts.filter((x) => isNear(x.at)).sort(byFloor)) if (nearShort() > 0 && room(d.kind, d.at) && !d.laid) layShort(d);
  // the count: chains anywhere on the wet side where their works pay, until the ladder's least is met
  for (let misses = 0; small().length < lo && misses < 4;) {
    const got = bestChain(null, {});
    if (got) layChain(got.c, false, got.kinds);
    else misses++;
  }
  // a kind still missing, or the count still short: the best site short of its floor (said short in the notes)
  // (a dam on a bed already laid first: its pond adds no basin)
  for (const kind of SMALL_KINDS) {
    const left = shorts.filter((d) => d.kind === kind && !d.laid).sort(byFloor);
    if (kindsMissing().includes(kind) && left.length && room(kind, left[0].at)) layShort(left[0]);
  }
  for (const kind of ["levee", "damToPond"] as const)
    for (let t = 0; t < 3 && kindsMissing().includes(kind); t++) {
      const got = bestChain(null, { want: kind, force: true });
      if (got) layChain(got.c, false, got.kinds);
    }
  for (let t = 0; t < 3 && small().length < lo; t++) {
    const want = (["levee", "damToPond"] as const)[t % 2];
    const got = bestChain(null, { want, force: true });
    if (got) layChain(got.c, false, got.kinds);
  }
  // the last: a short levee or dam a kind or the start's walk still lacks, in place of a levee or dam the ladder has
  // another of (the least over its floor), where the count is full
  for (let t = 0; t < 4; t++) {
    const lacks = (d: (typeof shorts)[number]) => (kindsMissing().includes(d.kind) ? 2 : 0) + (nearShort() > 0 && isNear(d.at) ? 1 : 0);
    const c = shorts.filter((d) => !d.laid && lacks(d) > 0).sort((p, q) => lacks(q) - lacks(p) || byFloor(p, q))[0];
    if (!c) break;
    if (!room(c.kind, c.at)) {
      const near = nearShort() > 0 && isNear(c.at);
      const worth = (w: Work) => (w.estimate ?? 0) / w.gives.green[0];
      const victim = small()
        .filter((w) => (w.kind === "levee" || w.kind === "damToPond") && (w.kind === c.kind || small().filter((x) => x.kind === w.kind).length > 1) && (near || !isNear(w.at) || nearShort() === 0))
        .sort((p, q) => worth(p) - worth(q))[0];
      if (!victim) break;
      side.splice(side.indexOf(victim), 1);
    }
    layShort(c);
  }
  const all = small();
  for (const kind of SMALL_KINDS) if (!all.some((w) => w.kind === kind)) return `siteSide#2 (no ${kind} on the land)`;
  if (all.length < lo) return `siteSide#3 (${all.length} small works on the land, ${lo} asked)`;
  if (nearShort() > 0) return `siteSide#4 (${NEAR_WORKS - nearShort()} small works within the start's walk, ${NEAR_WORKS} asked)`;
  const what = (w: Work) => (w.kind === "damToPond" ? "dam to pond" : w.kind);
  for (const w of all.filter((x) => !pays(x.estimate, x.gives.green)))
    notes.push(`The ${what(w)} on ${plan.names[w.on] ?? w.on} stands short: about ${w.estimate} where its floor is ${w.gives.green[0]}, the best this land has for its kind`);
  // the works in the plan's order: the first works and sill notches, the side network's, then the medium and large
  // rungs; the bypass's tiles counted again for the gates the pool's leats add
  const head = plan.works.filter((w) => w.rung === "first" || w.kind === "breach");
  const tail = plan.works.filter((w) => !head.includes(w));
  plan.works = [...head, ...side, ...tail];
  const by = plan.works.find((w) => w.kind === "bypass");
  if (by) by.tiles = bypassTiles(plan);
  plan.notes = notes;
  return null;
}

/** Stage 0's second pass (`PremiseDef.site`): the plan's side network drawn again on its skeleton's land, up to
 *  `SITE_TRIES` draws, the first whose plan passes every `plan` invariant. */
function siteStair(spec: MapSpec, plan: PremisePlan, attempt: number, land: SiteLand): PremisePlan | { reason: string } {
  const base = JSON.stringify(skeletonOf(plan));
  // (the chains the first pass drew for its leats: a second-pass candidate each, weighed with the rest)
  const firsts: FirstChain[] = [];
  for (const l of plan.links) {
    if (l.kind !== "leat" || !l.path) continue;
    const b = plan.bodies.find((x) => x.id === l.to);
    const sp = plan.links.find((x) => x.id === `spill${l.to}`);
    if (!b || (sp && !sp.path)) continue;
    // (a pool basin its gated leat alone keeps has no spill)
    if (!sp) {
      if (l.from === plan.stair?.pool) firsts.push({ b: { ...b, id: "", meadow: 0 }, src: l.from, s: b.sill, path: l.path });
      continue;
    }
    const exit = plan.exits.find((e) => e.id === sp.to);
    const to = plan.bodies.find((x) => x.id === sp.to);
    // (a spill into another side body is the first pass's alone)
    if (!exit && (!to || to.kind === "basin" || (to.kind === "tarn" && !(plan.stair?.rims ?? []).includes(to.id)))) continue;
    firsts.push({ b: { ...b, id: "", meadow: 0 }, src: l.from, s: b.sill, path: l.path, spill: { path: sp.path!, to: exit ? "" : sp.to, lo: (sp.bed as number[])[1], into: !!to && !to.dry, exit: exit ? { ...exit } : undefined } });
  }
  let last = "";
  for (let k = 0; k < SITE_TRIES; k++) {
    const p = JSON.parse(base) as PremisePlan;
    const st = p.stair!;
    const byId = new Map(p.bodies.map((b) => [b.id, b]));
    const lakes = st.lakes.map((id) => byId.get(id)!);
    const L: Layout = { W: p.W, rng: premiseStream(spec, "premise.plan", attempt, "site", k), spec, plan: p, stair: st, lakes, pool: byId.get(st.pool)!, spans: [], poolBasins: new Set(), site: new SiteModel(land) };
    const why = siteSide(L, firsts);
    if (why) {
      last = why;
      continue;
    }
    placeRegions(L, { n: st.n, f: st.f, k: st.lakes.indexOf(st.startLake), H: st.H });
    const bad = planFailure(spec, p);
    if (!bad) return p;
    last = bad;
  }
  // (no draw passed: the side network stays as the first pass drew it, every plan invariant already held, and the
  // notes say so)
  return { ...plan, notes: [`The side network stands as stage 0's first pass drew it, not sited by moisture: ${last}`] };
}

// ------------------------------------------------------------------------------------------------- invariants

const lakesOf = (plan: PremisePlan): Body[] => (plan.stair ? plan.stair.lakes.map((id) => plan.bodies.find((b) => b.id === id)!).filter(Boolean) : []);
const linkOf = (plan: PremisePlan, id: string) => plan.links.find((l) => l.id === id);

/** `stair.levels` (§4.4): sills descend along the valley by `f`, from `stairBase` (2 over the floor, 3 when the
 *  lowest lake is the start's and the stair fits); every water ≤ top − 2; a fall of `f` between
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
      const want = stairBase(st.n, st.f, st.lakes.indexOf(st.startLake), plan.top) + i * st.f;
      if (lakes[i].sill !== want) return fail(`${nameOf(plan, lakes[i].id)}'s sill is ${lakes[i].sill}, not ${want}`);
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
    const meadow = stairMeadow(spec);
    for (const lake of lakesOf(plan)) {
      if (lake.arms.length < ARMS[0] || lake.arms.length > armsMost(plan.W)) return fail(`${nameOf(plan, lake.id)} has ${lake.arms.length} arms (2 to ${armsMost(plan.W)} at ${plan.W}²)`);
      for (const arm of lake.arms) {
        const widest = Math.max(...arm.map((p) => p[2]));
        const most = r1(ARM_RADIUS[1] * mapScale(plan.W));
        if (widest < ARM_RADIUS[0] || widest > most) return fail(`An arm of ${nameOf(plan, lake.id)} is ${widest} wide at most (radius 7 to ${most} at ${plan.W}²)`);
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
  skeleton: skeletonOf,
  site: siteStair,
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
