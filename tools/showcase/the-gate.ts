// The Gate, the second premise map (docs/PREMISES.md §5.1), authored as a script of operations, the way Four Lakes
// is (four-lakes.ts): blank 192² ground, then only the core's document engine (D342), so the saved project replays
// to the same map byte for byte (D455).
//
//   node tools/showcase/run.mjs the-gate [--round r1] [--checks] [--weather] [--irrigate] [--save] [--out <dir>]
//   npx tsx tools/showcase/the-gate.ts …
//
// The map (x east, y north). A mountain wall runs along the grid across the map's middle, its crest at 17 (r6:
// planning's design, #236 08:05Z), nine levels over the green valley south of it and eleven over the dry basin north
// of it, both faces sheer. The valley's river rises in a cleft of the wall's bastion (the springs' pool, bed 13) and
// pours over the Veil, a fall of seven, into Wall Lake (sill 7) at the wall's foot; three brooks join the lake, which
// leaves the map by the Low River's gorge through the west ridge. The Gate is the one notch through the wall, a slot
// six wide from the lake's east arm to the basin, plugged by a bar of rock at its head and two rows of blockages.
// The basin is a bowl with a rim along its far edges; three seeps in hollows; the Gate Bed runs dry from the Gate's
// foot, in river terraces, to the one notch in the rim. The leat rides the crest from the cleft to the Pass, plugged
// at its head. The start stands in the valley at the Veil's foot with a side pool joined to the river by an inlet a
// tile wide: shut before the first badtide, it keeps clean water.
//
// The player's question: how to carry the water through or round the wall: open the Gate (the natural dam and its
// blockages), pump over it, or go round by the Pass (clear the old leat's head).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frameAt, hazardSoil, openingCamera, reachWalk, VISTA_ZOOM } from "./core";
import { applyOps, checksOf, emptySimulationSingletons, fallsOf, GAME_VERSION, HazardRun, LAYERS, MapSession, orientationForHigh, placeComponents, rowOf, startMiddleTile, StartWaterDays, startWaterWithin, TICKS_PER_DAY, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { gameMoistureReach } from "../../src/core/sim/soil";
import { MOIST_MIN } from "../../src/core/sim/soil3d";
import { fbm, measureLand } from "./four-lakes-design";
import { writePicture } from "./four-lakes-view";
import { hypot } from "../../src/core/math/portable";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : f;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const ROUND = arg("round", "dev");
const OUT = arg("out", ".scratch/showcase/the-gate");
const BASE_LEVEL = 8;

export const W = 192;
export const H = 192;
export const N = W * H;
const TOP = 20;

const log = (...a: unknown[]) => console.log(...a);
let t0 = performance.now();
const lap = (what: string) => {
  const t = performance.now();
  log(`  [${what}: ${((t - t0) / 1000).toFixed(1)} s]`);
  t0 = t;
};

/** Ids that are the same every run: a v4-shaped GUID from a counter. */
let idN = 0;
const newId = (): string => {
  const n = (++idN).toString(16).padStart(12, "0");
  return `47415445-0000-4000-8000-${n}`;
};

// ------------------------------------------------------------------------------------------------ geometry

type Pt = [number, number];
type Sp = [number, number, number];
const C = Math.SQRT1_2;
const SEED = 7731;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return { d: Math.sqrt(dx * dx + dy * dy), t };
}

/** Signed distance to a chain of capsules whose radius runs along it: below 0 inside. */
function spineDist(px: number, py: number, spine: readonly Sp[]): number {
  let best = Infinity;
  if (spine.length === 1) return hypot(px - spine[0][0], py - spine[0][1]) - spine[0][2];
  for (let k = 0; k + 1 < spine.length; k++) {
    const a = spine[k];
    const b = spine[k + 1];
    const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
    const v = d - (a[2] + (b[2] - a[2]) * t);
    if (v < best) best = v;
  }
  return best;
}

/** Distance to a path and how far along it. */
function pathDist(px: number, py: number, path: readonly Pt[]): { d: number; s: number } {
  let best = Infinity;
  let at = 0;
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = hypot(b[0] - a[0], b[1] - a[1]);
    const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) {
      best = d;
      at = run + t * len;
    }
    run += len;
  }
  return { d: best, s: at };
}

/** The point `s` tiles along a path. */
function pointAlong(path: readonly Pt[], s: number): Pt {
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= run + len || k + 2 === path.length) {
      const t = Math.max(0, Math.min(1, (s - run) / (len || 1)));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    run += len;
  }
  return path[path.length - 1];
}

function pathLength(path: readonly Pt[]): number {
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) run += hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
  return run;
}

// ------------------------------------------------------------------------------------------------ the design
//
// (r6: planning's design on #236, 08:05Z.) The wall runs along the grid, east to west across the map's middle, in
// straight runs of 14 to 22 tiles joined by bold jogs of 4 to 6 (bastions), its south face toward the opening
// camera: one sheer drop from the crest to the valley's meadow, no ledge. The valley lies south of it, the basin
// north; a rim along the basin's far edges makes it a bowl, and the Gate Bed leaves by one notch in the rim. The
// leat rides the crest: a channel one wide cut into the wall's top from the Veil's bastion to the Pass.

const LAKE_SILL = 7;
const BENCH = 8;
/** The start's own ground: the meadow's level. */
const HOME = BENCH;
/** The cleft's pool: its bed, and the lip's level (the Veil's crest). */
const POOL_BED = 13;
const LIP = 14;
/** The wall's crest. */
const CREST = 17;
/** The Pass: the crest dips to PASS between PASS_X. */
const PASS = 12;
const PASS_X: [number, number] = [20, 28];
/** The wall's south face: [from x, the face's y], straight runs joined by jogs. */
const FACE: [number, number][] = [[0, 112], [14, 107], [30, 111], [52, 106], [66, 110], [80, 104], [100, 109], [118, 105], [134, 110], [156, 106], [170, 111]];
function faceY(x: number): number {
  let y = FACE[0][1];
  for (const [x0, y0] of FACE) if (x >= x0) y = y0;
  return y;
}
/** The crest's thickness: five, seven at the Veil's bastion. */
const wallThick = (x: number) => (x >= 80 && x < 100 ? 7 : 5);
const topY = (x: number) => faceY(x) + wallThick(x);
/** The wall's band at `x`: its runs, and at a jog the corner that joins the two runs (two columns wide). */
function wallBand(x: number): [number, number] {
  const xs = [x, Math.max(0, x - 1), Math.min(W - 1, x + 1)];
  return [Math.min(...xs.map(faceY)), Math.max(...xs.map(topY))];
}
const inWall = (x: number, y: number) => y >= wallBand(x)[0] && y < wallBand(x)[1];
const inValleyAt = (x: number, y: number) => y < wallBand(x)[0];
const inBasinAt = (x: number, y: number) => y >= wallBand(x)[1];
/** The leat's line along the crest, west from the cleft to the Pass: each run's middle row, joined at the jogs
 *  inside the corner. */
const LEAT_PATH: Pt[] = (() => {
  const pts: Pt[] = [[84.5, 106.5], [80.5, 106.5]];
  for (let k = 5; k >= 1; k--) {
    const [x0, y0] = FACE[k];
    const mid = y0 + 2.5;
    if (k < 5) {
      const nextMid = FACE[k + 1][1] + 2.5;
      pts.push([FACE[k + 1][0] + 0.5, nextMid], [FACE[k + 1][0] + 0.5, mid]);
    }
    pts.push([Math.max(x0, PASS_X[0] - 1) + 0.5, mid]);
    if (x0 <= PASS_X[0]) break;
  }
  return pts;
})();

/** Wall Lake: along the wall's foot south of it; the drain bay from the Veil's trench; the start's side pool. */
const LAKE_ARMS: Sp[][] = [
  [[34, 84, 7], [50, 85, 9], [66, 85, 9], [82, 86, 9], [100, 86, 9], [116, 88, 8], [129, 92, 6]],
  // the drain bay: from the trench's west end west, then south into the body
  [[82, 102, 2.4], [74, 102, 2.4], [70, 95, 2.6]],
  // the inlet to the start's side pool: one tile wide, two long (a levee of two shuts it)
  [[97.5, 102.5, 0.6], [99, 102.5, 0.6]],
  // the south-west bay the valley brook comes to
  [[40, 80, 6], [36, 72, 4]],
  // creeks at the lake's level into the meadows, the water's veins
  [[60, 80, 1.3], [58, 70, 1.1], [54, 60, 0.9]],
  [[90, 80, 1.3], [92, 68, 1.1], [96, 58, 0.9]],
  [[112, 83, 1.2], [118, 72, 1.0], [124, 64, 0.9]],
  // the start's side pool itself (last): clean water through a badtide once its inlet is shut
  [[102.5, 101.5, 2.8]],
];
const LAKE_WANDER = 3;
const LAKE_MEADOW = 18;
const LAKE_ISLANDS: Sp[] = [[58, 83, 2.4], [108, 85, 2.2]];

/** The cleft in the Veil's bastion: the springs' pool behind the lip. */
const POOL: Sp[] = [[86.5, 107.5, 2.8], [92, 107.5, 2.6]];
/** The Veil's lip: a straight run facing south at the bastion's face. */
const LIP_Y = 104;
const LIP_X: [number, number] = [85, 93];
/** The start's middle: in the Veil's lap. */
const START_AT: Pt = [89, 100];

/** The Gate: a slot six wide straight north from the lake's east arm through the bench and the wall. */
const GATE_PATH: Pt[] = [[130.5, 97], [130.5, 113]];
/** The Low River: the lake's way out, west through the ridge to the edge. */
const LOW_PATH: Pt[] = [[27, 84], [16, 86], [6, 88], [-1, 89]];
/** The west ridge the Low River cuts through: the megadam's slot. */
const RIDGES: { path: Pt[]; top: number; half: number; drop: number; ledge: number; rough: number }[] = [
  { path: [[12, 60], [16, 74], [15, 86], [16, 98], [12, 106]], top: 12.6, half: 4.5, drop: 3, ledge: 3, rough: 1.1 },
];
/** The brooks: from springs in the valley's far corners to the lake. */
const BROOK_PATH: Pt[] = [[26, 24], [30, 40], [34, 56], [38, 70], [40, 78]];
const BROOK_POOL: Sp[] = [[25, 22, 3.2]];
const BROOK_POOL_BED = 10;
const WEST_PATH: Pt[] = [[100, 16], [98, 32], [96, 48], [94, 62], [92, 74], [91, 83]];
const WEST_POOL: Sp[] = [[100, 14, 3]];
const WEST_POOL_BED = 10;
const SOUTH_PATH: Pt[] = [[174, 32], [164, 48], [150, 64], [140, 78], [134, 88], [130, 94]];
const SOUTH_POOL: Sp[] = [[176, 30, 2.8]];
const SOUTH_POOL_BED = 9;
/** The Gate Bed: from the Gate's foot, winding north across the basin to the one notch in the far rim. */
const GATE_BED: Pt[] = [[130.5, 113], [134, 124], [128, 138], [136, 152], [146, 166], [150, 178], [150, 193]];
/** The Pass Bed: the leat's cascade down the basin face at the Pass, across the basin's west to the Gate Bed at the
 *  notch. */
const PASS_BED: Pt[] = [[24.5, 112], [26, 124], [34, 140], [50, 156], [78, 168], [110, 176], [138, 180], [150, 184]];
/** The far rim: from this row north, and these columns east and west of the basin. */
const RIM_Y = 184;
const RIM_X: [number, number] = [7, 185];
const RIM = 14;
/** The notch in the rim the Gate Bed leaves by. */
const NOTCH_X: [number, number] = [148, 152];
/** The seeps' hollows on the basin's flats: each a small basin with a seep in it. */
const SEEPS: { at: Pt; r: number; strength: number; name: string }[] = [
  { at: [62, 150], r: 2.2, strength: 0.02, name: "the West Seep" },
  { at: [108, 140], r: 2.0, strength: 0.02, name: "the Middle Seep" },
  { at: [172, 148], r: 2.2, strength: 0.02, name: "the East Seep" },
];

interface Channel {
  name: string;
  path: Pt[];
  half: (s: number) => number;
  bed?: (s: number) => number;
  /** The bed follows the land: `under` levels under the land beside it, never rising, never below `end`. */
  follow?: { start: number; under: number; end: number; grade?: number };
  wet: boolean;
  wander: number;
  /** How fast its banks open out beside the bed (0: walls). */
  open: number;
  /** A brook: its valley floor is level beside it, `meadow` wide. */
  brook?: { meadow: number };
  dry?: boolean;
}

function brookBed(path: Pt[], from: number, to: number): (s: number) => number {
  const len = pathLength(path);
  const steps = from - to;
  return (s: number) => Math.max(to, from - Math.floor((s / len) * (steps + 0.999)));
}

const GATE_LEN = pathLength(GATE_PATH);
const LEAT_LEN = pathLength(LEAT_PATH);
const GATE_BED_LEN = pathLength(GATE_BED);
/** The Gate Bed's level along it: four at the Gate's foot, one at the notch. */
const gateBedAt = (s: number) => Math.max(1, 4 - Math.floor((3.999 * s) / GATE_BED_LEN));
const CHANNELS: Channel[] = [
  // the Gate's slot: the bar's sill at the lake's level, then its floor two under, both faces sheer
  { name: "Gate", path: GATE_PATH, half: () => 3.0, bed: (s) => (s < 3.5 ? LAKE_SILL : Math.max(4, LAKE_SILL - 2 - Math.floor((s - 3.5) / 8))), wet: false, wander: 0, open: 0, dry: true },
  // the Low River: the lake's sill (two tiles thick, fourteen wide), then a gorge bed falling to the edge
  { name: "Low River", path: LOW_PATH, half: (s) => (s < 2.5 ? 7.0 : s < 8 ? 7.0 - (s - 2.5) * 0.8 : 2.6), bed: (s) => (s < 2.5 ? LAKE_SILL : Math.max(1, 5 - Math.floor((s - 2.5) / 6))), wet: true, wander: 0.6, open: 0 },
  { name: "Valley Brook", path: BROOK_PATH, half: () => 1.6, bed: brookBed(BROOK_PATH, BROOK_POOL_BED, 9), wet: true, wander: 3.6, open: 0, brook: { meadow: 15 } },
  { name: "West Brook", path: WEST_PATH, half: () => 1.4, bed: brookBed(WEST_PATH, WEST_POOL_BED, 7), wet: true, wander: 3.2, open: 0, brook: { meadow: 14 } },
  { name: "South Brook", path: SOUTH_PATH, half: () => 1.3, bed: brookBed(SOUTH_PATH, SOUTH_POOL_BED, 7), wet: true, wander: 3.0, open: 0, brook: { meadow: 13 } },
  // the leat on the crest: one wide, from the pool's east side (bed 13) falling to the Pass (11)
  { name: "Leat", path: LEAT_PATH, half: () => 0.6, bed: (s) => (s < 6 ? POOL_BED : s < LEAT_LEN - 12 ? POOL_BED - Math.floor(((s - 6) / (LEAT_LEN - 18)) * 1.999) : PASS - 1), wet: false, wander: 0, open: 0, dry: true },
  { name: "Gate Bed", path: GATE_BED, half: () => 2.4, bed: gateBedAt, wet: false, wander: 3.0, open: 0, dry: true },
  { name: "Pass Bed", path: PASS_BED, half: () => 1.8, follow: { start: 6, under: 2, end: 1, grade: 24 }, wet: false, wander: 2.4, open: 0, dry: true },
];
const chan = (name: string) => CHANNELS.findIndex((c) => c.name === name);

/** How far the land has risen `t` tiles beyond a meadow's edge: a crag, a bench that climbs a level, a second crag. */
function rise(t: number, c1: number, w1: number, c2: number): number {
  if (t <= 0) return 0;
  if (t < 1.2) return (c1 * t) / 1.2;
  t -= 1.2;
  if (t < w1) return c1 + t / w1;
  t -= w1;
  let base = c1 + 1;
  let c = c2;
  for (;;) {
    if (t < 1.2) return base + (c * t) / 1.2;
    t -= 1.2;
    base += c;
    if (t < w1) return base + (0.6 * t) / w1;
    t -= w1;
    base += 0.6;
    c = 2;
  }
}

export interface Land {
  heights: Uint8Array;
  /** 1 on Wall Lake's bed (the pool at the Veil's foot included). */
  lake: Uint8Array;
  /** 1 + the channel's index on a channel's bed. */
  channel: Uint8Array;
  /** 1 on the cleft's pool, 2 on a brook's springs' pool, 3 + k on seep k's hollow. */
  pool: Uint8Array;
  /** The Veil's lip tiles. */
  lip: number[];
  /** The Gate's plug: the natural dam's bar at its head, then its blockage rows. */
  gatePlugs: number[][];
  /** The leat's bar at its head, then its blockage row. */
  leatPlugs: number[][];
  /** The Pass: the leat's tiles at the crest's dip. */
  pass: number[];
  /** A row across the Low River's head (the lake's sill): a dam here raises the lake. */
  lowHead: number[];
  /** The megadam's row: across the gorge where the ridge is narrowest. */
  megadam: number[];
  /** Rows across the Gate Bed at its narrows in the basin: check dams. */
  checkDams: number[][];
  /** Each seep's spill tiles. */
  seepLips: number[][];
  guarded: number;
}

export function designLand(): Land {
  const f = new Float64Array(N);
  const lake = new Uint8Array(N);
  const channel = new Uint8Array(N);
  const pool = new Uint8Array(N);
  const gLake = new Float64Array(N);
  /** 1 where the wall's own profile (its crest) sets the land. */
  const wallOn = new Uint8Array(N);

  const along: { d: number; s: number }[][] = CHANNELS.map((c) => {
    const out: { d: number; s: number }[] = new Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) out[y * W + x] = pathDist(x + 0.5 + c.wander * fbm(x, y, 14, SEED + 60, 2), y + 0.5 + c.wander * fbm(x, y, 14, SEED + 61, 2), c.path);
    return out;
  });
  const kBrook = chan("Valley Brook");
  const kWest = chan("West Brook");
  const kSouth = chan("South Brook");
  const kLow = chan("Low River");
  const kGateBed = chan("Gate Bed");
  const kPassBed = chan("Pass Bed");

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // a wandering of the whole picture, so no contour follows a ruler
      const wx = x + 0.5 + 6 * fbm(x, y, 36, SEED + 1, 3);
      const wy = y + 0.5 + 6 * fbm(x, y, 36, SEED + 2, 3);
      const wob = fbm(x, y, 16, SEED + 3, 3);

      // ---- the valley: the lower envelope of the lake's bowl and the brooks', outlands rising to the south
      let dLake = Infinity;
      let dLakeW = Infinity;
      let thin = Infinity;
      LAKE_ARMS.forEach((arm, k) => {
        if (k === 0 || k === 3) {
          dLake = Math.min(dLake, spineDist(x + 0.5, y + 0.5, arm));
          dLakeW = Math.min(dLakeW, spineDist(wx, wy, arm));
        } else thin = Math.min(thin, spineDist(x + 0.5, y + 0.5, arm));
      });
      const own = dLake + LAKE_WANDER * wob * Math.min(1, Math.max(0.15, (dLake + 14) / 14));
      gLake[i] = Math.min(thin, own < 6 ? own : Math.max(6, dLakeW + LAKE_WANDER * wob));
      const el: { level: number; d: number; meadow: number }[] = [{ level: LAKE_SILL, d: gLake[i], meadow: LAKE_MEADOW }];
      for (const kB of [kBrook, kWest, kSouth]) {
        const { d, s } = along[kB][i];
        const c = CHANNELS[kB];
        el.push({ level: c.bed!(s), d: d - c.half(s), meadow: c.brook!.meadow });
      }
      el.push({ level: BROOK_POOL_BED + 1, d: spineDist(x + 0.5, y + 0.5, BROOK_POOL), meadow: 6 });
      el.push({ level: WEST_POOL_BED + 1, d: spineDist(x + 0.5, y + 0.5, WEST_POOL), meadow: 6 });
      el.push({ level: SOUTH_POOL_BED + 1, d: spineDist(x + 0.5, y + 0.5, SOUTH_POOL), meadow: 6 });
      let near = Infinity;
      for (const e of el) if (e.d < near) near = e.d;

      const warpA = fbm(x, y, 34, SEED + 4, 3);
      const warpB = fbm(x, y, 19, SEED + 5, 3);
      const c1 = near < 28 + 4 * fbm(x, y, 20, SEED + 37, 2) ? 1 : Math.max(1, Math.min(4, Math.round(2.4 + 3.2 * fbm(x, y, 31, SEED + 16, 2))));
      const c2 = Math.max(1, Math.min(3, Math.round(1.9 + 2.4 * fbm(x, y, 24, SEED + 18, 2))));
      const w1 = 10 + 6 * fbm(x, y, 27, SEED + 17, 2);
      const meadowN = fbm(x, y, 27, SEED + 6, 2);
      // the valley's outlands: plates rising toward the south edge
      let out = BENCH + 1.4 + 0.03 * Math.max(0, 90 - y) + 3.2 * fbm(x, y, 64, SEED + 7, 3) + 1.4 * fbm(x, y, 27, SEED + 8, 3);
      if (out > 15) out = 15;
      let land = out;
      for (const e of el) {
        const meadow = e.meadow + 3 * meadowN;
        const hill = Math.max(0, e.d - meadow);
        const dw = hill * (1 + 0.3 * warpA) + 5 * warpB * Math.min(1, hill / 6);
        const lv = e.level + 1 + Math.min(rise(Math.max(0, dw), c1, w1, c2), c1 + 1 + c2);
        if (lv < land) land = lv;
      }
      const dryLand = near > 19 + 4 * fbm(x, y, 23, SEED + 27, 2) && hypot(x - START_AT[0], y - START_AT[1]) > 30;
      if (!dryLand) land += 0.7 * fbm(x, y, 21, SEED + 9, 3) * Math.min(1, Math.max(0, (near - 18) / 6));
      const scarp = Math.max(-1, Math.min(1, fbm(x, y, 44, SEED + 19, 2) * 60));
      land += 1.3 * scarp * Math.min(1, Math.max(0, (near - 22) / 5));
      if (dryLand) {
        if (near > 0.5) land = Math.round(land / 3) * 3;
        if (fbm(x, y, 9, SEED + 36, 2) > 0.5) land += 1;
      } else {
        if (near > 21) land = fbm(x, y, 50, SEED + 24, 2) > -0.25 ? Math.round(land / 3) * 3 : Math.round(land / 2) * 2;
        if (near > 4 && near < 9 && fbm(x, y, 9, SEED + 22, 2) > 0.42) land += 1;
      }
      for (const r of RIDGES) {
        const { d } = pathDist(x + 0.5, y + 0.5, r.path);
        const t = d - r.half + 0.9 * fbm(x, y, 6, SEED + 70, 2);
        const crest = r.top + r.rough * fbm(x, y, 9, SEED + 18, 2);
        const lv = t <= 0 ? crest : t <= r.ledge ? crest - r.drop : -Infinity;
        if (lv > land && near > 2.5) land = lv;
      }
      const valley = land;

      // ---- the basin: river terraces along the Gate Bed and the Pass Bed, broad unequal flats beyond, a rim along
      // the far edges
      const gb = along[kGateBed][i];
      const pb = along[kPassBed][i];
      const bedHere = gb.d <= pb.d ? gateBedAt(gb.s) : Math.max(1, 6 - Math.floor(pb.s / 24));
      const dBed = Math.min(gb.d, pb.d) - 2.4;
      const t0 = 3.5 + 1.5 * fbm(x, y, 11, SEED + 81, 2);
      const t1 = 9 + 3 * fbm(x, y, 17, SEED + 82, 2);
      let basin: number;
      if (dBed < t0) basin = bedHere + 2;
      else if (dBed < t1) basin = bedHere + 3;
      else {
        // the flats: broad and unequal, higher toward the wall's foot, in ones and twos by a wide noise
        const flat = 5.2 + 1.6 * fbm(x, y, 70, SEED + 83, 2) + 1.0 * fbm(x, y, 28, SEED + 84, 2) + 0.8 * Math.max(0, 1 - (y - topY(Math.min(W - 1, x))) / 30);
        basin = Math.max(bedHere + 3, Math.round(flat));
      }
      if (y >= RIM_Y || (x < RIM_X[0] && y > topY(x) + 2) || x > RIM_X[1]) basin = RIM + Math.round(1.2 * fbm(x, y, 20, SEED + 85, 2));

      // ---- the wall: the crest's band, sheer on both faces; the Pass's dip
      const [lo, hi] = wallBand(x);
      let crest = CREST + 0.9 * fbm(x, y, 26, SEED + 14, 2) + (x >= 80 && x < 100 ? 1 : 0) + (fbm(x + 500, 0, 60, SEED + 17, 2) > 0.3 ? 1 : 0);
      const px = Math.abs(x - (PASS_X[0] + PASS_X[1]) / 2) - (PASS_X[1] - PASS_X[0]) / 2;
      if (px < 5) crest = Math.min(crest, PASS + Math.max(0, px) * 1.2);
      if (y >= lo && y < hi) {
        land = crest;
        wallOn[i] = 1;
      } else land = y < lo ? valley : basin;
      if (land > TOP) land = TOP;
      f[i] = land;
    }

  // the start's bench: level ground between the lake and the wall's foot round the Veil
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, [[62, 100, 3.5], [78, 100, 4.5], [92, 100, 5], [110, 100, 5], [126, 100, 4]]) + 2.0 * fbm(x, y, 13, SEED + 20, 2);
      if (d < 0 && gLake[i] > 0 && !wallOn[i]) f[i] = HOME;
    }

  // the channels' beds: a follow bed reads the land beside it
  const bedOf: ((s: number) => number)[] = CHANNELS.map((c, k) => {
    if (c.bed) return c.bed;
    const fo = c.follow!;
    const bins = Math.ceil(pathLength(c.path) / 2) + 1;
    const sum = new Float64Array(bins);
    const cnt = new Float64Array(bins);
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      if (d > 3) continue;
      const key = Math.min(bins - 1, Math.floor(s / 2));
      sum[key] += f[i];
      cnt[key]++;
    }
    const table: number[] = [];
    let run = fo.start;
    let last = fo.start;
    for (let b = 0; b < bins; b++) {
      const v = cnt[b] ? sum[b] / cnt[b] : last;
      last = v;
      const want = Math.round(v - fo.under);
      if (want < run) run = Math.max(want, run - 4);
      if (fo.grade) run = Math.min(run, fo.start - Math.floor((b * 2) / fo.grade));
      table.push(Math.max(fo.end, run));
    }
    return (s: number) => table[Math.min(table.length - 1, Math.max(0, Math.floor(s / 2)))];
  });
  // the brooks' springs' rims
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const [sp, bed] of [[BROOK_POOL, BROOK_POOL_BED], [WEST_POOL, WEST_POOL_BED], [SOUTH_POOL, SOUTH_POOL_BED]] as const) {
        const d = spineDist(x + 0.5, y + 0.5, sp);
        if (d < 4 && f[i] < bed + 2) f[i] = bed + 2;
      }
    }
  CHANNELS.forEach((c, k) => {
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const x = i % W;
      const y = (i - x) / W;
      const half = c.half(s) + (c.brook ? 0.3 + 2.0 * Math.max(0, fbm(x, y, 13, SEED + 30 + k, 2) + 0.12) : 0);
      const b = bedOf[k](s);
      if (d <= half) {
        if (c.wet && channel[i] && CHANNELS[channel[i] - 1].wet && f[i] <= b) continue;
        // (the Gate's slot cuts the leat: its water, let loose, falls into the slot unless the player spans it)
        if (c.name === "Leat" && channel[i] === chan("Gate") + 1) continue;
        f[i] = b;
        channel[i] = k + 1;
      } else if (c.brook && d <= half + 1.2 && !channel[i]) {
        if (f[i] < b + 1) f[i] = b + 1;
      } else if (c.name === "Gate" && s >= 3.5 && s < 8 && d <= half + 1.6 && !channel[i]) {
        // (the slot's banks across the bench stand a level over it: the old river's levees of rock)
        if (f[i] < BENCH + 1) f[i] = BENCH + 1;
      }
    }
  });
  // the pools' beds
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      if (d < 0 && channel[i] !== chan("Leat") + 1) {
        f[i] = d < -1.2 ? POOL_BED : LIP;
        pool[i] = 1;
        channel[i] = 0;
      }
      for (const [sp, bed] of [[BROOK_POOL, BROOK_POOL_BED], [WEST_POOL, WEST_POOL_BED], [SOUTH_POOL, SOUTH_POOL_BED]] as const) {
        const dp = spineDist(x + 0.5, y + 0.5, sp);
        if (dp < 0) {
          f[i] = dp < -1.4 ? bed - 1 : bed;
          pool[i] = 2;
          channel[i] = 0;
        }
      }
    }
  // the seeps' hollows
  SEEPS.forEach((S, k) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = hypot(x + 0.5 - S.at[0], y + 0.5 - S.at[1]) - S.r + 1.0 * fbm(x, y, 5, SEED + 80 + k, 2);
        if (d >= 0 || channel[i]) continue;
        pool[i] = 3 + k;
      }
  });

  // quantise the land
  const h = new Uint8Array(N);
  for (let i = 0; i < N; i++) h[i] = Math.max(0, Math.min(TOP, Math.round(f[i])));
  // (each seep's hollow sits in its flat: a pond three and four under it, its rim a level over the water)
  const seepLips: number[][] = [];
  SEEPS.forEach((S, k) => {
    let rim = 0;
    let n = 0;
    for (let i = 0; i < N; i++) if (pool[i] === 3 + k) (rim += h[i]), n++;
    const bench = Math.round(rim / Math.max(1, n));
    for (let i = 0; i < N; i++) {
      if (pool[i] !== 3 + k) continue;
      const x = i % W;
      const y = (i - x) / W;
      const dd = hypot(x + 0.5 - S.at[0], y + 0.5 - S.at[1]);
      h[i] = Math.max(0, dd < 1.2 ? bench - 6 : bench - 5);
    }
    const ring: number[] = [];
    for (let i = 0; i < N; i++) {
      if (pool[i]) continue;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && pool[j] === 3 + k) { ring.push(i); break; }
    }
    for (const i of ring) if (!channel[i] && h[i] < bench - 4) h[i] = Math.max(1, bench - 4);
    // the gully: from the ring toward the nearest bed, a tile at a time, falling a level every two tiles until it
    // meets the bed, so the pond stands four under its flat (the soil reaches nothing up there) and the seep's
    // trickle dies in the gully; without it a closed hollow fills to the flat and wets a disc of it
    const bedTiles: number[] = [];
    for (let i = 0; i < N; i++) if (channel[i] === chan("Gate Bed") + 1 || channel[i] === chan("Pass Bed") + 1) bedTiles.push(i);
    let gx = S.at[0];
    let gy = S.at[1];
    let nearest = -1;
    let nd = Infinity;
    for (const t of bedTiles) {
      const d = hypot((t % W) - gx, Math.floor(t / W) - gy);
      if (d < nd) (nd = d), (nearest = t);
    }
    const gully: number[] = [];
    let lv = Math.max(1, bench - 4);
    for (let step = 0; nearest >= 0 && step < 40; step++) {
      const dx = (nearest % W) - gx;
      const dy = Math.floor(nearest / W) - gy;
      if (Math.abs(dx) >= Math.abs(dy)) gx += Math.sign(dx);
      else gy += Math.sign(dy);
      const j = gy * W + gx;
      if (channel[j]) break;
      if (pool[j] === 3 + k) continue;
      if (step % 2 === 1 && lv > 1) lv--;
      if (h[j] > lv) h[j] = lv;
      pool[j] = 3 + k;
      gully.push(j);
    }
    seepLips.push(gully.slice(0, 1));
  });

  // the lake's bed: a shelf at the sill, a shallow margin, then the deeper water along the old river's line
  for (let i = 0; i < N; i++) {
    const d = gLake[i];
    if (d >= 0) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (wallOn[i]) continue;
    if (channel[i] === kLow + 1) continue; // the Low River's sill is the lake's way out
    let isle = Infinity;
    for (const s of LAKE_ISLANDS) isle = Math.min(isle, hypot((x + 0.5 - s[0]) * 0.7 + (y + 0.5 - s[1]) * 0.35, (y + 0.5 - s[1]) * 0.95 - (x + 0.5 - s[0]) * 0.3) - s[2] + 2.4 * fbm(x, y, 7, SEED + 45, 2));
    if (isle < 0) {
      h[i] = LAKE_SILL + 1;
      channel[i] = 0;
      continue;
    }
    const line = pathDist(x + 0.5 + 2.5 * fbm(x, y, 12, SEED + 47, 2), y + 0.5 + 2.5 * fbm(x, y, 12, SEED + 48, 2), LAKE_ARMS[0].map((q) => [q[0], q[1]] as Pt)).d;
    const shore = Math.max(0, Math.floor((Math.min(-d, isle) - 1.0) / 1.5));
    // (the lake's bed a level under its sill everywhere: a level and a half of water, which the game draws teal, not
    // the near black of two)
    const channelDepth = 1;
    let depth = shore === 0 ? 0 : shore === 1 ? Math.min(1, channelDepth) : channelDepth;
    const arm = LAKE_ARMS.findIndex((a) => spineDist(x + 0.5, y + 0.5, a) < 0);
    if (arm >= 1 && arm !== 3) depth = 1;
    h[i] = LAKE_SILL - depth;
    lake[i] = 1;
    channel[i] = 0;
  }

  // the Veil: the pool's bed behind the lip, the lip itself, the trench at its foot
  const lip = veil(h, lake, channel, pool);
  // the side pool's rim: a level over the bench all round it but at its inlet
  {
    const poolArm = LAKE_ARMS[LAKE_ARMS.length - 1];
    for (let i = 0; i < N; i++) {
      if (lake[i] || channel[i] || pool[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      const d = spineDist(x + 0.5, y + 0.5, poolArm);
      if (d >= 0 && d < 2.2 && h[i] === BENCH) h[i] = BENCH + 1;
    }
  }

  // the start's pad: level ground, the trench kept beside it
  for (let y = START_AT[1] - 2; y <= START_AT[1] + 2; y++)
    for (let x = START_AT[0] - 2; x <= START_AT[0] + 2; x++) {
      const i = y * W + x;
      const own = Math.abs(x - START_AT[0]) <= 1 && Math.abs(y - START_AT[1]) <= 1;
      if (!own && VEIL_POOL.has(i)) continue;
      h[i] = HOME;
      lake[i] = 0;
      channel[i] = 0;
    }

  tidy(h, lake, channel, pool);

  // the plugs and the works' rows
  const rowAt = (name: string, s0: number, s1: number): number[] => {
    const k = chan(name);
    const row: number[] = [];
    for (let i = 0; i < N; i++) if (channel[i] === k + 1 && along[k][i].s >= s0 && along[k][i].s < s1) row.push(i);
    return row;
  };
  // a row of a channel's bed that spans it (the water cannot pass beside it within the bed), the first at or after
  // `sMin` along it
  const spanRow = (name: string, sMin: number): number[] => {
    const k = chan(name);
    const T: number[] = [];
    for (let i = 0; i < N; i++) if (channel[i] === k + 1) T.push(i);
    const inT = new Set(T);
    const len = pathLength(CHANNELS[k].path);
    const nb = (i: number) => [i - 1, i + 1, i - W, i + W].filter((j) => j >= 0 && j < N && Math.abs((j % W) - (i % W)) <= 1);
    for (let s0 = sMin; s0 < len - 1; s0 += 0.5) {
      const row = T.filter((i) => along[k][i].s >= s0 && along[k][i].s < s0 + 1.45);
      if (!row.length) continue;
      const rowSet = new Set(row);
      const down = T.filter((i) => along[k][i].s >= s0 + 1.45);
      if (!down.length) continue;
      const seen = new Set(down);
      const q = [...down];
      let leak = false;
      while (q.length && !leak) {
        const i = q.pop()!;
        for (const j of nb(i)) {
          if (!inT.has(j) || rowSet.has(j) || seen.has(j)) continue;
          if (along[k][j].s < s0) leak = true;
          seen.add(j);
          q.push(j);
        }
      }
      if (!leak) return row;
    }
    return [];
  };
  const bar1 = spanRow("Gate", 2);
  const bar2 = spanRow("Gate", 3.5);
  const gatePlugs = [[...bar1, ...bar2.filter((i) => !bar1.includes(i))], spanRow("Gate", 10), spanRow("Gate", 13)];
  // (the natural dam: the slot's first rows past the lake's shore stand a level over the sill, at the bench's level:
  // rock the player blasts, and the bench's own way across the slot until then)
  for (const i of gatePlugs[0]) h[i] = LAKE_SILL + 1;
  const leatPlugs = [spanRow("Leat", 1.0), spanRow("Leat", 8)];
  // (the leat's natural dam: its head row stands two over its bed, a level over the pool's water)
  for (const i of leatPlugs[0]) h[i] = LIP + 1;
  const lowHead = spanRow("Low River", 0.6);
  const pass: number[] = [];
  for (let i = 0; i < N; i++) if (channel[i] === chan("Leat") + 1 && (i % W) >= PASS_X[0] && (i % W) <= PASS_X[1]) pass.push(i);
  let megadam: number[] = [];
  {
    for (let s0 = 6; s0 < 30; s0 += 0.5) {
      const row = rowAt("Low River", s0, s0 + 1.45);
      if (!row.length) continue;
      const walls = row.every((i) => [i - 1, i + 1, i - W, i + W].every((j) => j < 0 || j >= N || channel[j] === kLow + 1 || h[j] >= 11));
      if (walls && (!megadam.length || row.length < megadam.length)) megadam = row;
    }
  }
  const checkDams: number[][] = [];

  // the guard: every tile beside the water that would let it out stands a level over it. The ways out: the Low
  // River, the Veil's lip (the pool's own), the Gate's head (its bar) and the leat's head (its bar).
  let guarded = 0;
  {
    const need = new Int8Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (lake[i]) need[i] = LAKE_SILL + 1;
      if (pool[i] === 1) need[i] = LIP + 1;
      if (pool[i] === 2) need[i] = h[i] + 1;
      const c = channel[i];
      if (c && CHANNELS[c - 1].wet && CHANNELS[c - 1].name !== "Low River") need[i] = h[i] + 1;
    }
    const exit = new Uint8Array(N);
    for (const i of lip) exit[i] = 1;
    for (let i = 0; i < N; i++) {
      const c = channel[i];
      if (c && (CHANNELS[c - 1].name === "Low River" || (CHANNELS[c - 1].name === "Gate" && along[c - 1][i].s < 2.2) || (CHANNELS[c - 1].name === "Leat" && along[c - 1][i].s < 3))) exit[i] = 1;
    }
    for (let i = 0; i < N; i++) {
      if (need[i] < 0) continue;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || Math.abs((j % W) - x) > 1) continue;
        if (need[j] >= 0 || exit[j] || h[j] >= need[i]) continue;
        h[j] = need[i];
        guarded++;
      }
    }
  }
  return { heights: h, lake, channel, pool, lip, gatePlugs, leatPlugs, pass, lowHead, megadam, checkDams, seepLips, guarded };
}

/** The tiles of the Veil's own trench (the start's pad leaves them). */
const VEIL_POOL = new Set<number>();

/** The Veil: the bastion's cleft opens south over a straight lip at the face (LIP_Y, LIP_X); behind the lip a row
 *  of bed a tile deeper than the pool's shelf feeds it; in front, a trench three rows deep: the foot row at the sill
 *  (shallow), two rows a level under it, which carry the fall's water west to the drain. */
function veil(h: Uint8Array, lake: Uint8Array, channel: Uint8Array, pool: Uint8Array): number[] {
  const tiles: number[] = [];
  for (let x = LIP_X[0]; x <= LIP_X[1]; x++) {
    const t = LIP_Y * W + x;
    h[t] = LIP;
    lake[t] = 0;
    channel[t] = 0;
    pool[t] = 1;
    tiles.push(t);
    // the shelf behind the lip, and the pool's bed behind that
    const b = (LIP_Y + 1) * W + x;
    if (channel[b] !== chan("Leat") + 1) {
      h[b] = LIP;
      lake[b] = 0;
      channel[b] = 0;
      pool[b] = 1;
    }
  }
  for (let x = LIP_X[0] - 2; x <= LIP_X[1] + 3; x++)
    for (let p = 1; p <= 3; p++) {
      const i = (LIP_Y - p) * W + x;
      h[i] = p === 1 ? LAKE_SILL : x <= LIP_X[0] + 2 ? LAKE_SILL - 2 : LAKE_SILL - 1;
      lake[i] = 1;
      channel[i] = 0;
      pool[i] = 0;
      VEIL_POOL.add(i);
    }
  return tiles;
}

/** One-tile pits and spikes on the land go (the game's own look has none), and one-tile tongues. */
function tidy(h: Uint8Array, lake: Uint8Array, channel: Uint8Array, pool: Uint8Array): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (lake[i] || channel[i] || pool[i]) continue;
        const a = h[i - 1];
        const b = h[i + 1];
        const c = h[i - W];
        const d = h[i + W];
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        if (h[i] < lo) {
          h[i] = lo;
          changed++;
        } else if (h[i] > hi) {
          h[i] = hi;
          changed++;
        } else {
          const up = (a > h[i] ? 1 : 0) + (b > h[i] ? 1 : 0) + (c > h[i] ? 1 : 0) + (d > h[i] ? 1 : 0);
          const down = (a < h[i] ? 1 : 0) + (b < h[i] ? 1 : 0) + (c < h[i] ? 1 : 0) + (d < h[i] ? 1 : 0);
          if (up >= 3 && down === 0) {
            h[i] = [a, b, c, d].sort((p, q) => p - q)[1];
            changed++;
          } else if (down >= 3 && up === 0) {
            h[i] = [a, b, c, d].sort((p, q) => p - q)[2];
            changed++;
          }
        }
      }
    if (!changed) break;
  }
}

// ------------------------------------------------------------------------------------------- blank ground

/** TOOL: a blank start: flat ground of a size, nothing on it (as four-lakes.ts; #962's blank map is not on dev). */
function blank(): MapSession {
  const heights = new Uint8Array(N).fill(BASE_LEVEL);
  const file: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-11-11 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
  const s = MapSession.importMap(writeTimber(file), "The Gate.timber");
  s.setName("The Gate");
  return s;
}

/** Runs [y, x0, x1] of the tiles where `pick` holds. */
function runsWhere(pick: (i: number) => boolean): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = 0; y < H; y++) {
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && pick(y * W + x);
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        out.push([y, a, x - 1]);
        a = -1;
      }
    }
  }
  return out;
}

/** The land from the design: every tile set to its level, one Flatten per level, lowest first. */
function shapeLand(s: MapSession, land: Land): void {
  const h = land.heights;
  for (let level = 0; level <= TOP; level++) {
    if (level === BASE_LEVEL) continue;
    const cells = runsWhere((i) => h[i] === level);
    if (!cells.length) continue;
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells, level, exact: true }, label: `Land at level ${level}` }]);
  }
  const b = s.built.heights;
  let off = 0;
  for (let i = 0; i < N; i++) if (b[i] !== h[i]) off++;
  if (off) throw new Error(`${off} tiles are not at the design's level`);
}

// ------------------------------------------------------------------------------------------------- water

/** The springs: three in the cleft's pool, two in the brook's pool in the far corner. */
const SPRINGS: [number, number, number][] = [
  [87, 107, 3.0],
  [89, 108, 3.0],
  [92, 107, 3.0],
  [24, 22, 1.6],
  [26, 21, 1.4],
  [99, 14, 1.5],
  [101, 13, 1.3],
  [175, 30, 1.3],
  [177, 29, 1.2],
];

const PLUG_IDS: Record<string, string[]> = { gate: [], leat: [] };
function placePlugs(s: MapSession, land: Land): void {
  const ops: unknown[] = [];
  land.gatePlugs.forEach((row, k) => {
    if (!row.length) throw new Error(`the Gate's plug ${k} has no row`);
    if (k === 0) return; // (the natural dam is the mouth's bar of rock, in the land)
    for (const i of row) {
      const id = newId();
      PLUG_IDS.gate.push(id);
      ops.push({ op: "placeEntity", params: { id, template: "Blockage", x: i % W, y: Math.floor(i / W), orientation: "Cw0" }, label: `The Gate's ${["", "first", "second"][k]} blockage` });
    }
  });
  land.leatPlugs.forEach((row, k) => {
    if (!row.length) throw new Error(`the leat's plug ${k} has no row`);
    if (k === 0) return; // (the leat's natural dam is its head's bar of rock, in the land)
    for (const i of row) {
      const id = newId();
      PLUG_IDS.leat.push(id);
      ops.push({ op: "placeEntity", params: { id, template: "Blockage", x: i % W, y: Math.floor(i / W), orientation: "Cw0" }, label: `The old leat's ${["first", "second"][k]} blockage` });
    }
  });
  applyOps(s, ops);
  log(`  plugs: the Gate ${land.gatePlugs.map((r) => r.length).join(", ")} tiles (the natural dam's bar of rock, then two blockage rows); the leat ${land.leatPlugs.map((r) => r.length).join(", ")} (its head's bar of rock, then a blockage row)`);
}

const START = { x: START_AT[0], y: START_AT[1], orientation: "Cw0" as const };
function placeStart(s: MapSession): void {
  applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "StartingLocation", x: START.x, y: START.y, orientation: START.orientation }, label: "The start" }]);
}

/** The springs and the seeps as one step: the water settles once. */
function placeSources(s: MapSession): void {
  const ops = [
    ...SPRINGS.map(([x, y, strength]) => ({ op: "placeEntity", params: { id: newId(), template: "WaterSource", x, y, orientation: "Cw0", components: placeComponents("WaterSource", { strength }) } })),
    ...SEEPS.map((S) => ({ op: "placeEntity", params: { id: newId(), template: "WaterSource", x: Math.floor(S.at[0]), y: Math.floor(S.at[1]), orientation: "Cw0", components: placeComponents("WaterSource", { strength: S.strength }) } })),
  ];
  const r = s.applyBatch(ops as never, "user", "The springs and the seeps");
  if (!r.ok) throw new Error(`the springs: ${r.errors[0]}`);
}

interface WaterReport {
  wetShare: number;
  lake: { level: number; tiles: number; volume: number };
  pool: number;
  veil: { drop: number; width: number; depth: number };
  seeps: { name: string; level: number; tiles: number }[];
}

function readWater(s: MapSession, land: Land, depth: ArrayLike<number> = s.built.water): WaterReport {
  const h = s.built.heights;
  let wet = 0;
  for (let i = 0; i < N; i++) if (depth[i] > 0.05) wet++;
  const levels: number[] = [];
  let volume = 0;
  for (let i = 0; i < N; i++) {
    if (!land.lake[i] || !(depth[i] > 0.05)) continue;
    if (h[i] <= LAKE_SILL - 1) levels.push(h[i] + depth[i]);
    volume += depth[i];
  }
  levels.sort((a, b) => a - b);
  const level = levels.length ? levels[levels.length >> 1] : NaN;
  let pool = 0;
  for (let i = 0; i < N; i++) if (land.pool[i] === 1 && depth[i] > 0.05) pool = Math.max(pool, h[i] + depth[i]);
  let width = 0;
  let dsum = 0;
  let top = 0;
  for (const i of land.lip)
    if (depth[i] > 0.02) {
      width++;
      dsum += depth[i];
      top = Math.max(top, h[i] + depth[i]);
    }
  const foot = (() => {
    let v = 0;
    let n = 0;
    for (const i of VEIL_POOL) if (depth[i] > 0.05) (v += h[i] + depth[i]), n++;
    return n ? v / n : level;
  })();
  const seeps = SEEPS.map((S, k) => {
    let lv = 0;
    let n = 0;
    for (let i = 0; i < N; i++) if (land.pool[i] === 3 + k && depth[i] > 0.05) (lv = Math.max(lv, h[i] + depth[i])), n++;
    return { name: S.name, level: lv, tiles: n };
  });
  return { wetShare: wet / N, lake: { level, tiles: levels.length, volume }, pool, veil: { drop: top - foot, width, depth: width ? dsum / width : 0 }, seeps };
}

function printWater(r: WaterReport, s?: MapSession, land?: Land): void {
  log(`  water on ${(r.wetShare * 100).toFixed(1)} % of the map`);
  if (s && land) {
    const by: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      if (!(s.built.water[i] > 0.05)) continue;
      const c = land.channel[i];
      const key = c ? CHANNELS[c - 1].name : land.pool[i] >= 3 ? "a seep's hollow" : land.pool[i] ? "a springs' pool" : land.lake[i] ? "the lake" : "elsewhere";
      by[key] = (by[key] ?? 0) + 1;
    }
    log(`  wet tiles by place: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join("; ")}`);
  }
  log(`  Wall Lake at ${r.lake.level.toFixed(2)} (+${(r.lake.level - LAKE_SILL).toFixed(2)} over its sill), volume ${Math.round(r.lake.volume)}; the cleft's pool at ${r.pool.toFixed(2)}`);
  log(`  the Veil falls ${r.veil.drop.toFixed(2)} levels, ${r.veil.width} tiles wide, ${r.veil.depth.toFixed(2)} deep on the lip`);
  log(`  seeps: ${r.seeps.map((q) => `${q.name} ${q.tiles ? `${q.level.toFixed(2)} on ${q.tiles} tiles` : "dry"}`).join("; ")}`);
}

function cover(s: MapSession): { water: number; moist: number; bare: number } {
  const b = s.built;
  let wet = 0;
  let moist = 0;
  for (let i = 0; i < N; i++) {
    if (b.water[i] > 0.05) wet++;
    else if (b.moisture[i] > 0) moist++;
  }
  return { water: wet / N, moist: moist / N, bare: (N - wet - moist) / N };
}

/** The basin's share of the map, and how much of it is moist or wet on day 1 (the invariant: under 12 %). */
function basinCover(s: MapSession): { tiles: number; moist: number } {
  const b = s.built;
  let n = 0;
  let m = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!inBasinAt(x, y)) continue;
      n++;
      if (b.water[i] > 0.05 || b.moisture[i] > 0) m++;
    }
  return { tiles: n, moist: m / n };
}

function coverPicture(s: MapSession, file: string): void {
  const b = s.built;
  const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (b.water[i] > 0.05) continue;
    marks.push({ x, y, rgb: b.moisture[i] > 0 ? [60, 150, 60] : [200, 180, 140] });
  }
  writePicture(file, b.heights, b.water, 2, marks);
}

/** Water where the design has none: each body's size and where it is. */
function strayWater(s: MapSession, land: Land): { x: number; y: number; rgb: [number, number, number] }[] {
  const b = s.built;
  const seen = new Uint8Array(N);
  const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
  const dry = (i: number) => {
    const c = land.channel[i];
    return !land.lake[i] && !land.pool[i] && !c;
  };
  const bodies: string[] = [];
  for (let i0 = 0; i0 < N; i0++) {
    if (seen[i0] || !(b.water[i0] > 0.05) || !dry(i0)) continue;
    const stack = [i0];
    seen[i0] = 1;
    let n = 0, lo = Infinity, hi = -Infinity, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W, y = (i - x) / W;
      n++;
      const lv = b.heights[i] + b.water[i];
      lo = Math.min(lo, lv); hi = Math.max(hi, lv);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      marks.push({ x, y, rgb: [230, 40, 40] });
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || Math.abs((j % W) - x) > 1) continue;
        if (b.water[j] > 0.05 && dry(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n >= 3) bodies.push(`${n} tiles x ${x0}-${x1} y ${y0}-${y1}, level ${lo.toFixed(1)}-${hi.toFixed(1)}`);
  }
  if (bodies.length) log(`  stray water (${marks.length} tiles): ` + bodies.join("; "));
  return marks;
}

/** The water's surface in a window (north up): the ground's level where it is dry. */
function printWindow(s: MapSession, land?: Land): void {
  const [x0, y0, x1, y1] = arg("window", "80,80,100,100").split(",").map(Number);
  for (let y = y1; y >= y0; y--) {
    let row = `y ${String(y).padStart(3)}: `;
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      row += has("masks") && land ? `${String(s.built.heights[i]).padStart(3)}${land.lake[i] ? "L" : land.channel[i] ? "c" : land.pool[i] ? "p" : s.built.water[i] > 0.02 ? "~" : " "}` : has("beds") ? `${String(s.built.heights[i]).padStart(3)}${s.built.water[i] > 0.02 ? "~" : " "}` : s.built.water[i] > 0.02 ? (s.built.heights[i] + s.built.water[i]).toFixed(1).padStart(5) : `  ${String(s.built.heights[i]).padStart(2)} `;
    }
    log(row);
  }
}

function startOf(s: MapSession): { x: number; y: number; z: number; orientation: "Cw0" | "Cw90" | "Cw180" | "Cw270" } {
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  if (!e) throw new Error("the map has no start");
  const [x, y] = startMiddleTile(e as never);
  return { x, y, z: e.z, orientation: e.orientation as "Cw0" };
}

// ------------------------------------------------------------------------------------------------ weather

/** A drought or a badtide of `days` on the settled water, by the editor's own model: the lake's level, the Veil,
 *  the day the start's water goes or turns bad. */
function weather(s: MapSession, land: Land, hazard: "drought" | "badtide", days: number): void {
  const b = s.built;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: (b.settle as unknown as { stack?: unknown }).stack ?? null } as never, hazard, days);
  log(`${hazard}, ${days} days:`);
  const st = startOf(s);
  const sw = new StartWaterDays(hazard, { depth: b.water, contamination: b.contamination }, { W, H, heights: b.heights, objects: b.entities as never, start: { x: st.x, y: st.y }, within: startWaterWithin(s) });
  for (let day = 1; day <= days; day++) {
    run.step(TICKS_PER_DAY);
    const w = run.water();
    sw.see({ depth: w.depth, contamination: w.contamination });
    const r = readWater(s, land, w.depth);
    let bad = 0;
    let n = 0;
    for (let i = 0; i < N; i++) if (land.lake[i] && w.depth[i] > 0.05) { n++; if (w.contamination[i] > 0.05) bad++; }
    const soil = hazardSoil(b.waterModel, b.heights, w as never, b.entities as never);
    const bench = benchTiles(s);
    const green = bench.filter((i) => soil.moisture[i] > 0 && !(soil.contamination[i] > 0)).length;
    log(`  day ${day}: Wall Lake ${isNaN(r.lake.level) ? "dry" : r.lake.level.toFixed(2)}${hazard === "badtide" ? ` bad ${n ? Math.round((100 * bad) / n) : 0} %` : ""}; the Veil ${r.veil.width ? `${r.veil.width}w ${r.veil.depth.toFixed(2)}` : "dry"}; the bench green ${Math.round((100 * green) / bench.length)} %`);
  }
  run.dispose();
  log(`  the start's water ${hazard === "drought" ? "is gone" : "turns bad"}: ${sw.has ? (sw.day ? "day " + sw.day : "not in " + days + " days") : "the start has no water a pump reaches"}`);
}

/** The badtide again with a levee on the Still Pool's neck, built while the water is clean (the start's one small
 *  defence, as Four Lakes' r14 measured): the pool's clean water stays, and the bench's green beside it. */
function stillPoolBadtide(s: MapSession, land: Land): void {
  const neck = STILL_NECK.filter((i) => land.lake[i]);
  if (!neck.length) return;
  const b = s.built;
  const full = { depth: Float64Array.from(b.water), contamination: Float64Array.from(b.contamination), stack: (b.settle as unknown as { stack?: unknown }).stack ?? null };
  const was = neck.map((i) => b.heights[i]);
  // (the map settles again with the levee, so the run's water model has it; the hazard runs from the water as it
  // stood before, the neck's taken out)
  const set = new Set(neck);
  applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => set.has(i)), level: BENCH, exact: true }, label: "A levee on the Still Pool's neck" }]);
  for (const i of neck) full.depth[i] = 0;
  const bb = s.built;
  const run = new HazardRun(bb.waterModel, { depth: full.depth, contamination: full.contamination, stack: full.stack } as never, "badtide", 8);
  const bench = benchTiles(s);
  const st = startOf(s);
  const near = bench.filter((i) => hypot((i % W) - st.x, Math.floor(i / W) - st.y) <= 12);
  log(`badtide, 8 days, a levee of ${neck.length} tiles on the Still Pool's neck:`);
  for (let day = 1; day <= 8; day++) {
    run.step(TICKS_PER_DAY);
    const w = run.water();
    const soil = hazardSoil(bb.waterModel, bb.heights, w as never, bb.entities as never);
    const green = (t: number[]) => t.filter((i) => soil.moisture[i] > 0 && !(soil.contamination[i] > 0)).length;
    let vol = 0;
    let bad = 0;
    let wet = 0;
    for (let i = 0; i < N; i++) if (STILL_POOL_TILES(land)(i) && w.depth[i] > 0.02) { wet++; vol += w.depth[i]; bad = Math.max(bad, w.contamination[i]); }
    log(`  day ${day}: the pool ${wet ? `${(vol / wet).toFixed(2)} deep on ${wet} tiles, ${bad > 0.05 ? `bad ${(bad * 100).toFixed(0)} %` : "clean"}` : "dry"}; the bench green ${Math.round((100 * green(bench)) / bench.length)} % (within 12 tiles ${Math.round((100 * green(near)) / near.length)} %)`);
    if (day === 1 && has("diag")) {
      const badTiles: string[] = [];
      for (let i = 0; i < N; i++) if (STILL_POOL_TILES(land)(i) && w.contamination[i] > 0.05) badTiles.push(`${i % W},${Math.floor(i / W)}:${w.contamination[i].toFixed(2)}`);
      log(`    bad pool tiles: ${badTiles.join(" ")}; neck at ${neck.map((i) => `${i % W},${Math.floor(i / W)}`).join(" ")}`);
    }
  }
  run.dispose();
  neck.forEach((i, k) => applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: [[Math.floor(i / W), i % W, i % W]], level: was[k], exact: true }, label: "The neck as it was" }]));
}

/** The Still Pool's neck: the tiles of its one-wide link to the trench, where a levee shuts it. */
const STILL_NECK: number[] = (() => {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (spineDist((i % W) + 0.5, Math.floor(i / W) + 0.5, LAKE_ARMS[2]) < 0) out.push(i);
  return out;
})();
/** The Still Pool's own tiles. */
const STILL_POOL_TILES = (land: Land) => (i: number) => land.lake[i] === 1 && spineDist((i % W) + 0.5, Math.floor(i / W) + 0.5, LAKE_ARMS[LAKE_ARMS.length - 1]) < 0;

/** The premise's rung at a badtide: the Gate's bar blasted and the Low River's head levee'd, so the valley's water
 *  leaves by the Gate into the basin; the lake's bad share by day against the map left alone. The valley's lake is
 *  fed by the Veil through the drain bay and by the three brooks, every one red in a badtide, so what the Gate
 *  changes is where the red goes, not whether the lake runs red. A what-if on the map as saved: the works are
 *  undone after. */
function gateBadtide(s: MapSession, land: Land): void {
  const b0 = s.built;
  const full = { depth: Float64Array.from(b0.water), contamination: Float64Array.from(b0.contamination), stack: (b0.settle as unknown as { stack?: unknown }).stack ?? null };
  const lakeBad = (w: { depth: Float64Array; contamination: Float64Array }) => {
    let n = 0;
    let bad = 0;
    for (let i = 0; i < N; i++) if (land.lake[i] && w.depth[i] > 0.05) { n++; if (w.contamination[i] > 0.05) bad++; }
    return n ? Math.round((100 * bad) / n) : 0;
  };
  const basinBad = (w: { depth: Float64Array; contamination: Float64Array }) => {
    let n = 0;
    for (let i = 0; i < N; i++) if (inBasinAt(i % W, Math.floor(i / W)) && w.depth[i] > 0.05 && w.contamination[i] > 0.05) n++;
    return n;
  };
  const run = (label: string) => {
    const b = s.built;
    const r = new HazardRun(b.waterModel, { depth: full.depth, contamination: full.contamination, stack: full.stack } as never, "badtide", 8);
    const out: string[] = [];
    for (let day = 1; day <= 8; day++) {
      r.step(TICKS_PER_DAY);
      const w = r.water();
      if ([1, 2, 4, 8].includes(day)) out.push(`day ${day}: the lake ${lakeBad(w)} % bad, red water on ${basinBad(w)} basin tiles`);
    }
    r.dispose();
    log(`  badtide, ${label}: ${out.join("; ")}`);
  };
  log("the Gate at a badtide (8 days, by the model):");
  run("left alone");
  const barWas = land.gatePlugs[0].map((i) => s.built.heights[i]);
  const headWas = land.lowHead.map((i) => s.built.heights[i]);
  const bar = new Set(land.gatePlugs[0]);
  const head = new Set(land.lowHead);
  applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => bar.has(i)), level: LAKE_SILL - 1, exact: true }, label: "Blast the Gate's bar" }]);
  applyOps(s, [{ op: "deleteEntities", params: { entities: PLUG_IDS.gate }, label: "Clear the Gate's blockages" }]);
  applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => head.has(i)), level: LAKE_SILL + 1, exact: true }, label: "A levee on the Low River's head" }]);
  for (const i of head) full.depth[i] = 0;
  run("the Gate open (its bar blasted twice, its blockages cleared) and the Low River's head levee'd");
  // (undone: the ladder measures from the map as saved; the blockages come back by undo)
  s.undo();
  s.undo();
  s.undo();
  void barWas;
  void headWas;
}

/** The start's bench: level, dry tiles joined to the start. */
function benchTiles(s: MapSession): number[] {
  const b = s.built;
  const st = startOf(s);
  const seen = new Uint8Array(N);
  const q = [st.y * W + st.x];
  seen[q[0]] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && b.heights[j] === st.z && !(b.water[j] > 0.05)) (seen[j] = 1), q.push(j);
  }
  return q;
}

// ------------------------------------------------------------------------------------------------- plants

/** Tiles' distance to water (4-neighbour steps), and how far each stands over that water's surface. */
function waterReach(s: MapSession): { dist: Int16Array; over: Int8Array } {
  const b = s.built;
  const dist = new Int16Array(N).fill(-1);
  const over = new Int8Array(N);
  const top = new Int8Array(N);
  let q: number[] = [];
  for (let i = 0; i < N; i++)
    if (b.water[i] > 0.05) {
      dist[i] = 0;
      top[i] = Math.ceil(b.heights[i] + b.water[i]);
      q.push(i);
    }
  while (q.length) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        top[j] = top[i];
        over[j] = b.heights[j] - top[i];
        next.push(j);
      }
    }
    q = next;
  }
  return { dist, over };
}

function spread(pick: (i: number) => boolean, max: number): Int16Array {
  const d = new Int16Array(N).fill(99);
  let q: number[] = [];
  for (let i = 0; i < N; i++)
    if (pick(i)) {
      d[i] = 0;
      q.push(i);
    }
  for (let step = 1; step <= max && q.length; step++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W])
        if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && d[j] > step) {
          d[j] = step;
          next.push(j);
        }
    }
    q = next;
  }
  return d;
}

/** Planting by zone, each a stroke of the shelf's brush. The valley: birch in ribbons along the water, oak in small
 *  groves on the meadows, pine massed on the ground a level or more over its water; the start's own stand and
 *  berries. The basin: dead woods in clumps on the dry beds, succulent drifts on the far benches, thorns. Wood is
 *  a budget (Kyler): about the official maps' living trees for this size, and green ground needs no tree. */
function plant(s: MapSession, land: Land): void {
  const b = s.built;
  const st = startOf(s);
  const { dist, over } = waterReach(s);
  const moist = (i: number) => b.moisture[i] > 0 && !(b.water[i] > 0);
  const nearStart = (i: number, r: number) => hypot((i % W) - st.x, Math.floor(i / W) - st.y) < r;
  const n = (i: number, scale: number, seed: number) => fbm(i % W, Math.floor(i / W), scale, 9000 + seed, 2);
  const paint = (kind: string, template: string | undefined, pick: (i: number) => boolean, density: number, seed: number, label: string, age?: string) => {
    const area = runsWhere(pick);
    if (!area.length) return 0;
    try {
      const r = applyOps(s, [{ op: "paintObjects", params: { kind, ...(template ? { template } : {}), area, density, seed, ...(age ? { age } : {}) }, label }]);
      return Object.values(r.objects.added).reduce((a, v) => a + v, 0);
    } catch (e) {
      log(`    (${label}: ${(e as Error).message})`);
      return 0;
    }
  };
  const inValley = (i: number) => inValleyAt(i % W, Math.floor(i / W));
  const meadow = (i: number) => moist(i) && over[i] <= 0 && dist[i] > 2 && dist[i] <= 8;
  const highGround = (i: number) => moist(i) && dist[i] > 2 && over[i] >= 1;
  const grove = (i: number) => n(i, 17, 1) > 0.22;
  const berries = (i: number) => n(i, 9, 2) > 0.26 || (nearStart(i, 15) && !nearStart(i, 7) && n(i, 6, 3) > 0.1);
  // (the start's view of the Veil and the Gate stays open: no oak or pine north and east of it)
  const sight = (i: number) => nearStart(i, 26) && (i % W) >= st.x - 5 && Math.floor(i / W) >= st.y - 3;
  const count: Record<string, number> = {};
  count.birch = paint("trees", "Birch", (i) => inValley(i) && moist(i) && dist[i] <= 2 && !nearStart(i, 7) && n(i, 11, 31) > 0.0, 0.4, 11, "Birch in ribbons along the water", "mixed");
  count.berries = paint("bushes", "BlueberryBush", (i) => inValley(i) && meadow(i) && berries(i) && !nearStart(i, 6), 0.55, 12, "Blueberry patches on the meadows");
  count.oak = paint("trees", "Oak", (i) => inValley(i) && meadow(i) && grove(i) && !berries(i) && !nearStart(i, 21) && !sight(i), 0.3, 13, "Parkland oak on the meadows", "mixed");
  count.pine = paint("trees", "Pine", (i) => inValley(i) && highGround(i) && !nearStart(i, 21) && !sight(i) && n(i, 15, 9) > 0.0, 0.7, 15, "Pine woods on the high ground", "mixed");
  // a stand with a purpose: pine on the brook's valley, oak on the lake's far shore
  const dBrook = spread((i) => land.channel[i] === chan("Valley Brook") + 1 || land.pool[i] === 2, 12);
  count.brookPine = paint("trees", "Pine", (i) => inValley(i) && moist(i) && dBrook[i] >= 2 && dBrook[i] <= 10 && n(i, 17, 55) > 0.1 && !nearStart(i, 21), 0.5, 35, "Pine along the valley brook", "mixed");
  const dWest = spread((i) => land.channel[i] === chan("West Brook") + 1, 12);
  count.westOak = paint("trees", "Oak", (i) => inValley(i) && moist(i) && dWest[i] >= 2 && dWest[i] <= 10 && n(i, 15, 57) > 0.1 && !nearStart(i, 21), 0.35, 36, "Oak along the west brook", "mixed");
  count.shoreOak = paint("trees", "Oak", (i) => inValley(i) && moist(i) && land.lake[i] === 0 && dist[i] >= 3 && dist[i] <= 12 && (i % W) < 60 && n(i, 19, 51) > 0.2 && !nearStart(i, 21) && !sight(i), 0.25, 31, "Oak stands on the lake's west shore", "mixed");
  // the start's own: berries, and one wood on the bench's west side, a short walk from the door
  const level = (i: number) => b.heights[i] === st.z && moist(i);
  const xI = (i: number) => i % W;
  const yI = (i: number) => Math.floor(i / W);
  const poolNear = (i: number) => spineDist(xI(i) + 0.5, yI(i) + 0.5, LAKE_ARMS[LAKE_ARMS.length - 1]) < 2.6;
  count.startBerries = paint("bushes", "BlueberryBush", (i) => level(i) && !nearStart(i, 4) && nearStart(i, 13) && yI(i) <= st.y && xI(i) < st.x + 3 && !poolNear(i), 0.8, 21, "The start's berries");
  // (a stand of oak on the bench east of the door, finite: about thirty trees, 240 logs grown; pine beyond it)
  count.startOaks = paint("trees", "Oak", (i) => level(i) && !nearStart(i, 4) && xI(i) >= st.x + 3 && xI(i) <= st.x + 22 && yI(i) >= 96 && yI(i) <= 103 && !poolNear(i), 0.9, 22, "The start's oak stand");
  count.startPines = paint("trees", "Pine", (i) => level(i) && xI(i) > st.x + 22 && xI(i) <= st.x + 34 && yI(i) >= 96 && yI(i) <= 103 && n(i, 8, 33) > -0.2, 0.7, 24, "The start's pine wood", "mixed");
  // the basin, dressed on purpose: dead woods in clumps on the dry beds and round the seeps' hollows, succulents
  // on the far benches, thorns in the gullies
  const dry = (i: number) => !(b.moisture[i] > 0) && !(b.water[i] > 0) && !land.lake[i] && !land.pool[i];
  const inBasin = (i: number) => inBasinAt(i % W, Math.floor(i / W));
  const dryBed = (i: number) => land.channel[i] > 0 && (CHANNELS[land.channel[i] - 1].name === "Gate Bed" || CHANNELS[land.channel[i] - 1].name === "Pass Bed") && !(b.water[i] > 0.05);
  const dBed = spread(dryBed, 5);
  const far = (i: number, j: number) => hypot((i % W) - (j % W), Math.floor(i / W) - Math.floor(j / W));
  const hash = (i: number, seed: number) => Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b) >>> 0;
  const centres = (cand: number[], apart: number, max: number, seed: number): number[] => {
    const order = cand.slice().sort((p, q) => hash(p, seed) - hash(q, seed) || p - q);
    const c: number[] = [];
    for (const i of order) {
      if (c.length >= max) break;
      if (c.every((j) => far(i, j) >= apart)) c.push(i);
    }
    return c;
  };
  const keepClear = [...land.checkDams.flat(), ...land.gatePlugs.flat(), ...land.seepLips.flat()];
  const gateBedTile = (i: number) => land.channel[i] === chan("Gate Bed") + 1;
  const bedCentres = [
    ...centres(Array.from({ length: N }, (_, i) => i).filter((i) => dryBed(i) && gateBedTile(i) && inBasin(i) && keepClear.every((j) => far(i, j) > 7)), 22, 8, 71),
    ...centres(Array.from({ length: N }, (_, i) => i).filter((i) => dryBed(i) && !gateBedTile(i) && inBasin(i) && keepClear.every((j) => far(i, j) > 7)), 40, 2, 73),
  ];
  const inWood = (c: number[], r: number, seed: number) => (i: number) => c.some((j) => far(i, j) < r + 1.5 * n(i, 5, seed));
  const birchHere = (i: number) => n(i, 4, 61) > -0.12;
  const bedWood = (i: number) => (dry(i) || dryBed(i)) && dBed[i] <= 4 && inWood(bedCentres, 6.5, 62)(i);
  const before = new Set(s.built.entities.map((e) => e.id));
  count.dead = paint("trees", "Birch", (i) => bedWood(i) && birchHere(i), 0.8, 18, "The dead woods on the dry beds: birch");
  count.dead += paint("trees", "Oak", (i) => bedWood(i) && !birchHere(i), 0.8, 19, "The dead woods on the dry beds: oak");
  const dead = s.built.entities.filter((e) => !before.has(e.id) && (e.template === "Birch" || e.template === "Oak" || e.template === "Pine"));
  if (dead.length) {
    const r = s.applyAll(dead.map((e) => ({ op: "setEntityProps", params: { id: e.id, components: { LivingNaturalResource: { IsDead: true } } } })) as never, "user", "The basin's wood is dead");
    if (!r.ok) throw new Error(r.errors[0]);
  }
  // the seeps' oases: a few live birch where a seep's water reaches
  count.oasis = paint("trees", "Birch", (i) => inBasin(i) && moist(i) && dist[i] <= 3 && n(i, 5, 64) > -0.2, 0.5, 65, "Birch at the seeps", "mixed");
  count.succulents = paint("succulents", "Succulent", (i) => dry(i) && inBasin(i) && dBed[i] > 5 && n(i, 26, 4) > 0.12 && n(i, 7, 41) > -0.05, 0.45, 16, "Succulent drifts on the basin's far benches");
  count.thorns = paint("thorns", undefined, (i) => dry(i) && inBasin(i) && dBed[i] > 6 && n(i, 14, 6) > 0.55, 0.3, 17, "Thorns in the basin's gullies");
  log(`  dead woods at: ${bedCentres.map((i) => `${i % W},${Math.floor(i / W)}`).join("; ")}`);
  log(`  planted: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

function woodReport(s: MapSession): void {
  const b = s.built;
  const LOGS: Record<string, number> = { Oak: 8, Pine: 2, Birch: 1 };
  const kinds: Record<string, number> = { Oak: 0, Pine: 0, Birch: 0 };
  const under = new Uint8Array(N);
  let all = 0;
  let deadN = 0;
  let logs = 0;
  let berries = 0;
  let succ = 0;
  for (const e of b.entities) {
    if (e.template === "BlueberryBush") berries++;
    if (e.template === "Succulent") succ++;
    if (LOGS[e.template] === undefined) continue;
    all++;
    if ((e.components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead === true) {
      deadN++;
      continue;
    }
    under[e.y * W + e.x] = 1;
    logs += LOGS[e.template];
    kinds[e.template]++;
  }
  let levelMoist = 0;
  let wooded = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!(b.moisture[i] > 0) || b.water[i] > 0.05) continue;
      let flat = true;
      for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (b.heights[j] !== b.heights[i]) flat = false;
      if (!flat) continue;
      levelMoist++;
      if (under[i]) wooded++;
    }
  const living = all - deadN;
  log(`  wood: ${living} living trees (${Math.round((living * 10000) / N)} per 10,000 tiles; ${deadN} dead): ${kinds.Pine} pine, ${kinds.Oak} oak, ${kinds.Birch} birch; ${logs} logs when grown; ${berries} berry bushes (${Math.round((berries * 10000) / N)} per 10,000), ${succ} succulents`);
  log(`  level moist ground: ${levelMoist} tiles, ${wooded} under a tree (${Math.round((100 * wooded) / Math.max(1, levelMoist))} %)`);
}

// ------------------------------------------------------------------------------------------------ objects

/** The nearest place to (x, y) where a w x h footprint stands on level, dry, free ground of the design. */
function levelSpot(s: MapSession, land: Land, x: number, y: number, w: number, hgt: number): [number, number] {
  const b = s.built;
  const taken = new Set<number>();
  for (const e of b.entities) for (let dy = -1; dy <= 5; dy++) for (let dx = -1; dx <= 5; dx++) taken.add((e.y + dy) * W + e.x + dx);
  const fits = (cx: number, cy: number): boolean => {
    if (cx < 2 || cy < 2 || cx + w > W - 2 || cy + hgt > H - 2) return false;
    const z = b.heights[cy * W + cx];
    for (let dy = -1; dy < hgt + 1; dy++)
      for (let dx = -1; dx < w + 1; dx++) {
        const i = (cy + dy) * W + cx + dx;
        const inside = dx >= 0 && dy >= 0 && dx < w && dy < hgt;
        if (land.lake[i] || land.channel[i] || land.pool[i] || b.water[i] > 0) return false;
        if (inside && (taken.has(i) || b.heights[i] !== z)) return false;
      }
    return true;
  };
  for (let r = 0; r <= 22; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (fits(x + dx, y + dy)) return [x + dx, y + dy];
      }
  throw new Error(`no level ground for a ${w}x${hgt} near ${x},${y}`);
}

/** TOOL: a way up (natural slopes, as four-lakes.ts): near (x, y), where ground at `hi` stands straight over ground
 *  at `lo`, a ramp of rock is raised out from the cliff's foot, a level a tile, with a Slope on each tile. */
function ramp(s: MapSession, land: Land, x0: number, y0: number, lo: number, hi: number, label: string): boolean {
  const b = s.built;
  const n = hi - lo;
  const taken = new Set<number>();
  for (const e of b.entities) taken.add(e.y * W + e.x);
  const open = (i: number) => !land.lake[i] && !land.channel[i] && !land.pool[i] && !(b.water[i] > 0) && !taken.has(i);
  for (let r = 0; r <= 26; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = x0 + dx;
        const py = y0 + dy;
        if (px < n + 3 || py < n + 3 || px >= W - n - 3 || py >= H - n - 3) continue;
        if (b.heights[py * W + px] !== hi || !open(py * W + px)) continue;
        for (const [ux, uy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          let ok = true;
          for (let k = 1; k <= n + 2 && ok; k++) {
            const i = (py + uy * k) * W + px + ux * k;
            if (b.heights[i] !== lo || !open(i) || !open(i + uy + ux * W) || !open(i - uy - ux * W)) ok = false;
          }
          if (!ok) continue;
          buildRamp(s, px, py, ux, uy, n, label);
          log(`  ${label}: ${n} slopes from X ${px + ux * n} Y ${py + uy * n} (level ${lo}) up to X ${px} Y ${py} (level ${hi})`);
          return true;
        }
      }
  log(`    (${label}: no cliff from ${lo} to ${hi} with room for a ramp near ${x0},${y0})`);
  return false;
}

/** A ramp of rock out from a cliff's foot: from the top tile P, `n` tiles along (ux, uy), a level a tile, a Slope on each. */
function buildRamp(s: MapSession, px: number, py: number, ux: number, uy: number, n: number, label: string): void {
  const hi = s.built.heights[py * W + px];
  const ops: unknown[] = [];
  for (let k = 1; k < n; k++) ops.push({ op: "sculpt", params: { mode: "flatten", cells: [[py + uy * k, px + ux * k, px + ux * k]], level: hi - k, exact: true }, label });
  if (ops.length) applyOps(s, ops);
  for (let k = 1; k <= n; k++) applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "Slope", x: px + ux * k, y: py + uy * k, orientation: orientationForHigh(-ux, -uy) }, label }]);
}

/** The route: the walk from the start to each place by the core's own walking graph; where a place can't be
 *  walked to, ramps of one or two slopes are made toward it, nearest first, until it can. */
function walkRoute(s: MapSession, land: Land, places: { name: string; tiles: number[]; far?: boolean }[]): void {
  const dirs = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;
  const reachNow = () => {
    const st = startOf(s);
    const b = s.built;
    const h = Uint8Array.from(b.heights);
    for (let i = 0; i < N; i++) if (b.water[i] > 0.1) h[i] = 40;
    return reachWalk(h, W, H, b.entities as never, { x: st.x, y: st.y });
  };
  let made = 0;
  for (const place of places) {
    if (!place.tiles.length) continue;
    const near = [...new Set(place.tiles.flatMap((i) => [i, i - 1, i + 1, i - W, i + W, i - 2, i + 2, i - 2 * W, i + 2 * W]))].filter((i) => i >= 0 && i < N);
    const cx = place.tiles.reduce((a, i) => a + (i % W), 0) / place.tiles.length;
    const cy = place.tiles.reduce((a, i) => a + Math.floor(i / W), 0) / place.tiles.length;
    const far = (i: number) => hypot((i % W) - cx, Math.floor(i / W) - cy);
    let found = Infinity;
    for (let round = 0; round < (place.far ? 1 : 40); round++) {
      const b = s.built;
      const reach = reachNow();
      found = Infinity;
      for (const i of near) if (reach[i] < found) found = reach[i];
      if (Number.isFinite(found) || place.far) break;
      const taken = new Set<number>();
      for (const e of b.entities) taken.add(e.y * W + e.x);
      const open = (i: number) => !land.lake[i] && !(land.channel[i] && CHANNELS[land.channel[i] - 1].wet) && !land.pool[i] && !(b.water[i] > 0) && !taken.has(i);
      let reached = Infinity;
      for (let i = 0; i < N; i++) if (Number.isFinite(reach[i]) && far(i) < reached) reached = far(i);
      let best: { px: number; py: number; ux: number; uy: number; n: number; score: number } | null = null;
      for (let y = 9; y < H - 9; y++)
        for (let x = 9; x < W - 9; x++) {
          const P = y * W + x;
          if (!open(P)) continue;
          for (const [ux, uy] of dirs)
            for (let n = 1; n <= 2; n++) {
              const end = (y + uy * (n + 1)) * W + x + ux * (n + 1);
              const pIn = Number.isFinite(reach[P]);
              const eIn = Number.isFinite(reach[end]);
              if (pIn === eIn) continue;
              let ok = true;
              for (let k = 1; k <= n + 1 && ok; k++) {
                const j = (y + uy * k) * W + x + ux * k;
                if (b.heights[j] !== b.heights[P] - n || !open(j)) ok = false;
              }
              if (!ok) continue;
              const score = far(pIn ? end : P) + (n - 1) * 2;
              if (score < reached + 4 && (!best || score < best.score)) best = { px: x, py: y, ux, uy, n, score };
            }
        }
      if (!best) break;
      buildRamp(s, best.px, best.py, best.ux, best.uy, best.n, `The way to ${place.name}`);
      made += best.n;
    }
    log(Number.isFinite(found) ? `  walk from the start to ${place.name}: ${Math.round(found)} tiles` : `  walk to ${place.name}: no walk from the start${place.far ? " (over water or the wall)" : ""}`);
  }
  log(`  ways made for the route: ${made} natural slopes`);
  {
    const reach = reachNow();
    const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
    for (let i = 0; i < N; i++) if (Number.isFinite(reach[i])) marks.push({ x: i % W, y: Math.floor(i / W), rgb: [240, 80, 200] });
    writePicture(join(OUT, `${ROUND}-reach.png`), s.built.heights, s.built.water, 4, marks);
    if (has("window")) {
      const [x0, y0, x1, y1] = arg("window", "80,80,100,100").split(",").map(Number);
      const taken = new Map<number, string>();
      for (const e of s.built.entities) taken.set(e.y * W + e.x, e.template.slice(0, 1));
      for (let y = y1; y >= y0; y--) {
        let row = `r ${String(y).padStart(3)}: `;
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          row += `${String(s.built.heights[i]).padStart(3)}${Number.isFinite(reach[i]) ? "*" : s.built.water[i] > 0.1 ? "~" : taken.get(i) ?? " "}`;
        }
        log(row);
      }
    }
  }
}

/** The set pieces: each a place with a purpose. */
function placeObjects(s: MapSession, land: Land): void {
  const put = (template: string, x0: number, y0: number, label: string, extra: Record<string, unknown> = {}, size: [number, number] | null = null) => {
    let x = x0;
    let y = y0;
    try {
      if (size) [x, y] = levelSpot(s, land, x0, y0, size[0], size[1]);
      applyOps(s, [{ op: "placeEntity", params: { id: newId(), template, x, y, orientation: "Cw0", ...extra }, label }]);
      return true;
    } catch (e) {
      log(`    (${label} at ${x},${y}: ${(e as Error).message})`);
      return false;
    }
  };
  const ruin = (hgt: number, x: number, y: number, label: string, variant = "A") =>
    put(`RuinColumnH${hgt}`, x, y, label, { components: { "Yielder:Ruin": { Yield: { Good: "ScrapMetal", Amount: 15 * hgt } }, RuinModels: { VariantId: variant } } });
  const bank = (row: number[], side: 1 | -1, k: number): number => {
    // a bank tile beside the row's k-th tile, on the side across the channel
    const i = row[Math.min(row.length - 1, Math.max(0, k))];
    for (const j of side > 0 ? [i + 1, i + W, i - 1, i - W] : [i - 1, i - W, i + 1, i + W]) {
      if (j < 0 || j >= N || Math.abs((j % W) - (i % W)) > 1 || land.channel[j] || land.lake[j] || land.pool[j] || s.built.water[j] > 0.05) continue;
      return j;
    }
    return -1;
  };
  // the Gate's towers: a pair of piers on each bank at its mouth, the first metal
  {
    const row = land.gatePlugs[1];
    let k = 0;
    for (const side of [1, -1] as const) {
      const j = bank(row, side, side > 0 ? row.length - 1 : 0);
      if (j < 0) continue;
      ruin(7, j % W, Math.floor(j / W), "The Gate's towers", "ABCD"[k++]);
      const j2 = j + (side > 0 ? 1 : -1) * ((j % W) - (row[0] % W) !== 0 ? 1 : W);
      if (j2 >= 0 && j2 < N && !land.channel[j2] && !(s.built.water[j2] > 0.05)) ruin(5, j2 % W, Math.floor(j2 / W), "The Gate's towers", "ABCD"[k++ % 4]);
    }
  }
  // the old aqueduct's piers along the leat's ledge: every nine tiles, on its outer bank
  {
    const kL = chan("Leat");
    const tiles: number[] = [];
    for (let i = 0; i < N; i++) if (land.channel[i] === kL + 1) tiles.push(i);
    const len = LEAT_LEN;
    let q = 0;
    for (let s0 = 9; s0 < len - 14; s0 += 9) {
      const row = tiles.filter((i) => {
        const { s: at } = pathDist((i % W) + 0.5, Math.floor(i / W) + 0.5, LEAT_PATH);
        return at >= s0 && at < s0 + 1.2;
      });
      if (!row.length) continue;
      const j = bank(row, -1, 0);
      if (j >= 0) ruin(2 + (q % 3), j % W, Math.floor(j / W), "The old aqueduct's piers along the leat", "ABCDE"[q++ % 5]);
    }
  }
  // the old sluice at the leat's head: two piers on the ledge beside its blockages
  {
    const row = land.leatPlugs[0];
    for (const side of [1, -1] as const) {
      const j = bank(row, side, 0);
      if (j >= 0) ruin(4, j % W, Math.floor(j / W), "The old sluice at the leat's head", side > 0 ? "A" : "C");
    }
  }
  // relics: at the Pass, at the Gate's foot in the basin, on the lake's island
  put("SmallRelic", 172, 116, "The relic at the Pass's foot", {}, [2, 2]);
  put("MediumRelic", 136, 116, "The relic at the Gate's foot", {}, [3, 3]);
  put("SmallRelic", Math.round(LAKE_ISLANDS[0][0]) - 1, Math.round(LAKE_ISLANDS[0][1]) - 1, "The relic on the island", {}, [2, 2]);
  // the basin's finds: an aquifer and the old drill by the Gate Bed, ruins under a bench, the geothermal field far
  // out, an unstable core in the valley's far corner
  const aq = put("Aquifer", 118, 140, "An aquifer under the basin's flats", {}, [3, 3]);
  if (aq) {
    const a = s.built.entities.find((e) => e.template === "Aquifer");
    if (a) put("AncientAquiferDrill", a.x, a.y, "The ancient drill on the aquifer");
  }
  put("UndergroundRuins", 150, 130, "The ruins under the basin's flats", {}, [5, 5]);
  put("GeothermalField", 170, 170, "The geothermal field in the basin's far corner", {}, [3, 3]);
  put("UnstableCore", 36, 30, "An unstable core by the brook's springs", { components: placeComponents("UnstableCore") }, [2, 2]);
  // a ruin pier pair at each check dam's site and each seep's spill, so the answers read from far
  land.checkDams.forEach((row, k) => {
    for (const side of [1, -1] as const) {
      const j = bank(row, side, side > 0 ? row.length - 1 : 0);
      if (j >= 0) ruin(3 + (side > 0 ? 1 : 0), j % W, Math.floor(j / W), `The old weir at the ${["first", "second", "third", "fourth"][k] ?? ""} narrows`, side > 0 ? "B" : "D");
    }
  });
}

/** Where the Veil and the Gate's mouth stand in the game's first camera: the lip's ends and its foot, in the first
 *  frame and at the widest zoom (u across, v up, each −1 to 1 inside the frame). */
function firstFrame(s: MapSession, land: Land): void {
  const st = startOf(s);
  const lip = land.lip;
  const a = lip[0];
  const z = lip[lip.length - 1];
  const gate = (() => {
    const kG = chan("Gate") + 1;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < N; i++) if (land.channel[i] === kG) { const d = Math.abs(Math.floor(i / W) - (faceY(130) + 2)) + Math.abs((i % W) - 130) * 0.1; if (d < bd) (bd = d), (best = i); }
    return best;
  })();
  for (const [name, cam] of [["first frame", openingCamera(st)], ["widest", openingCamera(st, VISTA_ZOOM)]] as const) {
    const pts = [
      frameAt(cam, (a % W) + 0.5, Math.floor(a / W) + 0.5, LIP + 0.2),
      frameAt(cam, (z % W) + 0.5, Math.floor(z / W) + 0.5, LIP + 0.2),
      frameAt(cam, (a % W) - 0.5, Math.floor(a / W) - 0.5, LAKE_SILL + 0.4),
      frameAt(cam, (z % W) - 0.5, Math.floor(z / W) - 0.5, LAKE_SILL + 0.4),
    ];
    const f = (p: { u: number; v: number } | null) => (p ? `(${p.u.toFixed(2)}, ${p.v.toFixed(2)})` : "behind");
    const inside = pts.every((p) => p && Math.abs(p.u) <= 1 && Math.abs(p.v) <= 1);
    let vmax = -Infinity;
    for (const i of lip) {
      const p = frameAt(cam, (i % W) + 1, Math.floor(i / W) + 1, LIP + 0.2);
      if (p && p.v > vmax) vmax = p.v;
    }
    const g = frameAt(cam, (gate % W) + 0.5, Math.floor(gate / W) + 0.5, LAKE_SILL + 1);
    const crest = frameAt(cam, 90, 108, CREST);
    log(`  the Veil in the ${name}: lip ${f(pts[0])} to ${f(pts[1])}, foot ${f(pts[2])} to ${f(pts[3])}${inside ? ": whole in the frame" : ": cut by the frame"}; the lip's highest corner at v ${vmax.toFixed(2)}; the Gate's notch at ${f(g)}; the crest over the cleft at ${f(crest)}`);
  }
}

// ------------------------------------------------------------------------------------------- how it plays

/** What each work waters, by the Irrigation view's reach (analysis/irrigation.ts: the game's soil rule on the
 *  settled water): the works done one after another on this session after the round is saved, the water settled
 *  each time, and the tiles that turn moist or wet counted. */
function irrigation(s: MapSession, land: Land): void {
  const greenNow = () => {
    const b = s.built;
    const g = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (b.water[i] > 0.05 || b.moisture[i] > 0) g[i] = 1;
    return g;
  };
  const nearNow = () => {
    // the Irrigation view's "near": dry ground within one level's cost of the water (what a small work waters)
    const b = s.built;
    const reach = gameMoistureReach(W, H, b.heights, b.water, b.contamination, b.entities as never);
    let near = 0;
    for (let i = 0; i < N; i++) if (!(b.water[i] > 0) && !(b.moisture[i] > 0) && !reach.barred[i] && reach.value[i] + 6 >= MOIST_MIN) near++;
    return near;
  };
  const count = (g: Uint8Array) => g.reduce((a, v) => a + v, 0);
  gateBadtide(s, land);
  const day1 = greenNow();
  let prev = day1;
  log(`irrigation: green or wet on day 1: ${count(day1)} tiles (${((100 * count(day1)) / N).toFixed(1)} % of the map); within one level's cost of water (the Irrigation view's near): ${nearNow()} tiles`);
  const step = (name: string, rung: string, what: string, act: () => void) => {
    act();
    const g = greenNow();
    let more = 0;
    let water = 0;
    let less = 0;
    for (let i = 0; i < N; i++) {
      if (g[i] && !prev[i]) {
        more++;
        if (s.built.water[i] > 0.05) water++;
      } else if (!g[i] && prev[i]) less++;
    }
    const w = readWater(s, land);
    log(`  ${rung}: ${name}: ${more} more tiles green or wet (${water} of them water; ${((100 * more) / N).toFixed(1)} % of the map)${less ? `, ${less} fewer` : ""}: ${what} [the lake ${w.lake.level.toFixed(2)}, near ${nearNow()}]`);
    prev = g;
  };
  const flatten = (row: number[], level: number, label: string) => {
    const set = new Set(row);
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => set.has(i)), level, exact: true }, label }]);
  };
  // medium: the Gate opened: the natural dam and the two blockage rows cleared; the lake's water splits between the
  // Low River and the Gate
  step(`the Gate opened (the natural dam blasted, ${land.gatePlugs[0].length} tiles a level down, and ${land.gatePlugs[1].length + land.gatePlugs[2].length} blockages cleared)`, "medium", "the Gate Bed runs from the Gate's foot to the exit", () => {
    flatten(land.gatePlugs[0], LAKE_SILL, "Blast the Gate's natural dam");
    applyOps(s, [{ op: "deleteEntities", params: { entities: PLUG_IDS.gate }, label: "Clear the Gate's blockages" }]);
  });
  // medium: a levee on the Low River's head, one level: the whole river goes through the Gate
  step(`the Gate's sill blasted again (${land.gatePlugs[0].length} tiles, to ${LAKE_SILL - 1}) and a levee across the Low River's head (${land.lowHead.length} tiles, one level)`, "medium", "the whole river through the Gate; the lake sinks a level and the Low River runs dry", () => {
    flatten(land.gatePlugs[0], LAKE_SILL - 1, "Blast the Gate's sill again");
    flatten(land.lowHead, LAKE_SILL + 1, "A levee on the Low River's head");
  });
  if (has("window")) printWindow(s);
  // large: the old leat opened: its blockages cleared; the pool's water runs along the ledge, over the Pass and
  // down the Pass Bed
  step(`the leat's bar blasted once (${land.leatPlugs[0].length} tiles) and its ${land.leatPlugs[1].length} blockages cleared`, "medium", "a trickle along the crest west to the Pass and down the Pass Bed: the basin's west", () => {
    flatten(land.leatPlugs[0], LIP, "Blast the leat's bar");
    applyOps(s, [{ op: "deleteEntities", params: { entities: PLUG_IDS.leat }, label: "Clear the leat's blockages" }]);
  });
  step(`the leat's bar blasted twice`, "large", "the springs' share along the crest to the Pass Bed; the Veil dwindles", () => flatten(land.leatPlugs[0], POOL_BED, "Blast the leat's bar again"));
  {
    const kL = chan("Leat") + 1;
    let wet = 0;
    let n = 0;
    let deep = 0;
    for (let i = 0; i < N; i++) if (land.channel[i] === kL) { n++; if (s.built.water[i] > 0.05) (wet++), (deep = Math.max(deep, s.built.water[i])); }
    const head = land.leatPlugs[0][0];
    log(`    the leat: ${wet} of its ${n} tiles wet (deepest ${deep.toFixed(2)}); its head row at X ${head % W} Y ${Math.floor(head / W)} ground ${s.built.heights[head]} water ${s.built.water[head].toFixed(2)}`);
  }
  const after = count(prev);
  log(`  totals: green or wet on day 1 ${((100 * count(day1)) / N).toFixed(1)} %; after every work ${((100 * after) / N).toFixed(1)} %; the rest ${((100 * (N - after)) / N).toFixed(1)} % (the wall, the ridges, the far benches)`);
  // the megadam in the ridge's slot, with the Gate's bar dammed too: what it would hold, by a flood fill (no settle)
  if (land.megadam.length) {
    const h = s.built.heights;
    const b = s.built;
    const surface = (i: number) => h[i] + (b.water[i] > 0.05 ? b.water[i] : 0);
    for (const level of [LAKE_SILL + 2, LAKE_SILL + 3]) {
      const dam = new Set([...land.megadam, ...land.gatePlugs[0]]);
      const seen = new Uint8Array(N);
      const seed = land.lake.findIndex((v) => v === 1);
      const q = [seed];
      seen[seed] = 1;
      let added = 0;
      let out = false;
      let landN = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        added += Math.max(0, level - surface(i));
        if (!(b.water[i] > 0.05)) landN++;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
          if (!out) log(`    (the flood to ${level} reaches the edge at X ${x} Y ${y}, ground ${h[i]})`);
          out = true;
        }
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && !dam.has(j) && h[j] < level) (seen[j] = 1), q.push(j);
      }
      log(`  the megadam in the ridge's slot (${land.megadam.length} tiles) and a dam on the Gate's bar (${land.gatePlugs[0].length}) to level ${level}: ${out ? "the water gets out elsewhere" : `holds ${Math.round(added)} more over ${q.length} tiles (${landN} of them land now)`}`);
    }
  }
}

/** The map's own words (600 characters at most). */
const DESCRIPTION =
  "A mountain wall runs across the map: a green valley on your side, a dry basin beyond. The river rises in a cleft of the wall and pours over the Veil into Wall Lake at your door. " +
  "The Gate is the one notch through the wall, plugged by a bar of rock and old rubble; the Gate Bed runs dry from its foot to the one notch in the far rim. " +
  "Carry the water through: blast the Gate, pump it over the wall, or open the leat on the crest and send the river round by the Pass. " +
  "Before the first badtide, shut the inlet of the pool by your door: it keeps clean water. In a drought the Veil stops and the lake holds.";

// --------------------------------------------------------------------------------------------------- main

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const land = designLand();
  const m = measureLand(land.heights);
  log(`The Gate, round ${ROUND}`);
  log(`  guard raised ${land.guarded} tiles; the Pass ${land.pass.length} leat tiles at the crest's dip to ${PASS}; the megadam's row ${land.megadam.length} tiles; the Low River's head ${land.lowHead.length}`);
  log(`  land: flat ${(m.flat8 * 100).toFixed(1)} % (8-neighbour), one-level steps ${(m.step1 * 100).toFixed(1)} %, top-3 levels ${(m.top3 * 100).toFixed(1)} %, highest ${m.histogram.reduce((a, v, k) => (v ? k : a), 0)}`);
  lap("design");
  if (has("design")) {
    writePicture(join(OUT, `${ROUND}-design.png`), land.heights, null, 4);
    return;
  }
  const s = blank();
  lap("blank");
  shapeLand(s, land);
  lap("land");
  placePlugs(s, land);
  placeSources(s);
  lap("sources and settle");
  {
    const stray0 = strayWater(s, land);
    if (stray0.length) writePicture(join(OUT, `${ROUND}-stray.png`), s.built.heights, s.built.water, 4, stray0);
    if ((stray0.length || has("masks")) && has("window")) printWindow(s, land);
  }
  placeStart(s);
  firstFrame(s, land);
  lap("start");
  if (!has("bare")) {
    placeObjects(s, land);
    lap("objects");
    const tilesOf = (pick: (i: number) => boolean, every = 7) => {
      const out: number[] = [];
      for (let i = 0, c = 0; i < N; i++) if (pick(i) && c++ % every === 0) out.push(i);
      return out;
    };
    const ent = (template: string) => s.built.entities.filter((e) => e.template === template).map((e) => e.y * W + e.x);
    walkRoute(s, land, [
      { name: "the lake's west meadow", tiles: tilesOf((i) => land.lake[i] === 0 && s.built.heights[i] === BENCH && (i % W) < 60 && Math.floor(i / W) < 100), far: true },
      { name: "the lake's south meadow", tiles: tilesOf((i) => land.lake[i] === 0 && s.built.heights[i] === BENCH && Math.floor(i / W) < 76 && (i % W) > 60 && (i % W) < 130) },
      { name: "the Gate's natural dam", tiles: land.gatePlugs[0] },
      { name: "the brooks' springs", tiles: tilesOf((i) => land.pool[i] === 2, 3), far: true },
      { name: "the Low River's head", tiles: land.lowHead, far: true },
      { name: "the megadam's slot", tiles: land.megadam, far: true },
      { name: "the leat's head on the crest", tiles: land.leatPlugs[0], far: true },
      { name: "the Gate's foot in the basin", tiles: land.gatePlugs[2], far: true },
      { name: "the ancient drill", tiles: ent("AncientAquiferDrill"), far: true },
    ]);
    lap("the route");
    plant(s, land);
    woodReport(s);
    lap("plants");
  }
  const settle = s.built.settle as unknown as { ticks: number; settled: boolean };
  log(`  settle: ${settle.ticks} ticks, settled ${settle.settled}`);
  const wr = readWater(s, land);
  printWater(wr, s, land);
  const falls = fallsOf(s.built.heights, s.built.water, W, H, 1.5);
  log(`  falls the core sees: ${falls.length} tiles, tallest ${falls.reduce((a, f) => Math.max(a, f.drop), 0).toFixed(1)}`);
  const cv = cover(s);
  const bc = basinCover(s);
  log(`  cover: water ${(cv.water * 100).toFixed(1)} %, moist ground ${(cv.moist * 100).toFixed(1)} %, bare ${(cv.bare * 100).toFixed(1)} %; the basin (${bc.tiles} tiles, ${((100 * bc.tiles) / N).toFixed(0)} % of the map) moist or wet ${(bc.moist * 100).toFixed(1)} %`);
  {
    const bench = benchTiles(s);
    const st = startOf(s);
    const near = bench.filter((i) => hypot((i % W) - st.x, Math.floor(i / W) - st.y) <= 14).length;
    log(`  the start's bench: ${bench.length} level tiles at level ${st.z} (${near} within 14)`);
  }
  coverPicture(s, join(OUT, `${ROUND}-cover.png`));
  const stray = strayWater(s, land);
  writePicture(join(OUT, `${ROUND}-map.png`), s.built.heights, s.built.water, 4);
  if (stray.length) writePicture(join(OUT, `${ROUND}-stray.png`), s.built.heights, s.built.water, 4, stray);
  if (has("window")) printWindow(s);
  lap("picture");
  if (has("weather")) {
    weather(s, land, "drought", 9);
    lap("drought");
    weather(s, land, "badtide", 8);
    lap("badtide");
    stillPoolBadtide(s, land);
    lap("the Still Pool's badtide");
  }
  applyOps(s, [{ op: "setDescription", params: { text: DESCRIPTION } }]);
  if (has("checks") || has("save")) {
    const c = checksOf(s);
    log(`  checks: ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
    for (const row of [...c.blocking, ...c.warnings].slice(0, 30)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message} ${JSON.stringify(rowOf(row).where ?? "").slice(0, 300)}`);
    lap("checks");
  }
  if (has("save")) {
    const c = checksOf(s);
    if (c.blocking.length) throw new Error(`not saved: ${rowOf(c.blocking[0]).message}`);
    const f = { timber: s.exportTimber({ warnings: [] }).bytes, project: s.project(9) };
    writeFileSync(join(OUT, `${ROUND}.timber`), f.timber);
    writeFileSync(join(OUT, `${ROUND}.damgoodmaps.json`), f.project);
    const st = startOf(s);
    const deg = Math.PI / 180;
    const opening = (c: ReturnType<typeof openingCamera>) => ({ yaw: -35 * deg, pitch: 60 * deg, distance: c.distance, target: [c.target[0], c.target[2], c.target[1]] });
    writeFileSync(join(OUT, `${ROUND}-shots.json`), JSON.stringify([
      { name: "first", label: "The game's first frame (its own camera)", view: opening(openingCamera(st)) },
      { name: "widest", label: "The game's first camera pulled back to its widest", view: opening(openingCamera(st, VISTA_ZOOM)) },
    ], null, 1));
    log(`  saved ${join(OUT, `${ROUND}.timber`)} (${f.timber.length} bytes), project ${f.project.length} bytes, the shots file for our own view`);
    lap("save");
  }
  if (has("irrigate")) {
    irrigation(s, land);
    lap("irrigation");
  }
}

main();
