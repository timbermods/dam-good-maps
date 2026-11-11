// The Gate, the second premise map (docs/PREMISES.md §5.1), authored as a script of operations, the way Four Lakes
// is (four-lakes.ts): blank 192² ground, then only the core's document engine (D342), so the saved project replays
// to the same map byte for byte (D455).
//
//   node tools/showcase/run.mjs the-gate [--round r1] [--checks] [--weather] [--irrigate] [--save] [--out <dir>]
//   npx tsx tools/showcase/the-gate.ts …
//
// The map (x east, y north). A mountain wall runs corner to corner, from the north-west to the south-east, its crest
// at 17, ten levels over the green valley south-west of it and twelve over the dry basin north-east of it. The
// valley's river rises in a cleft high in the wall (the springs' pool, bed 13) and pours over the Veil, a fall of
// seven, into Wall Lake (sill 7) at the wall's foot; a brook from the valley's far corner joins the lake; the lake
// leaves the map by the Low River's gorge through the west ridge. The Gate is the one notch through the wall, a slot
// from the lake's shore to the basin, plugged by a natural dam at its mouth and two rows of blockages. The basin has
// three seeps in hollows and two dry beds that run where the water once ran: from the Gate's foot and from the
// Pass's foot to the basin's exit on the east edge. The old leat, a ledge cut along the wall's valley face from the
// cleft to the Pass, is plugged at its head. The start stands in the valley at the Veil's foot, so the game's first
// camera holds the fall and the wall with the Gate's mouth beside it.
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
import { hypot, sqrt } from "../../src/core/math/portable";

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
  return { d: sqrt(dx * dx + dy * dy), t };
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

/** The wall's own frame: u across it (positive toward the basin, north-east), v along it (positive toward the
 *  south-east); its centre line is x + y = WALL_SUM, through (98, 98). */
const WALL_SUM = 196;
const uOf = (x: number, y: number) => (x + y - WALL_SUM) * C;
const vOf = (x: number, y: number) => (x - y) * C;
const xyOf = (u: number, v: number): Pt => [98 + (u + v) * C, 98 + (u - v) * C];
/** How far the wall's line has swung across (toward the basin) at `v` along it: a long swing and a short one, none
 *  at the Veil (v 0), so the cleft, the lip and the start stand where their numbers say. */
function wallSwing(v: number): number {
  return 8 * (fbm(v + 300, 0, 72, SEED + 11, 2) - fbm(300, 0, 72, SEED + 11, 2)) + 2.6 * (fbm(v + 300, 0, 23, SEED + 12, 2) - fbm(300, 0, 23, SEED + 12, 2));
}
/** The crest's half width at `v`: 8 at the Veil (the lip stands at its edge), 5 to 11 elsewhere. */
function wallHalfAt(v: number): number {
  return 8 + 3.4 * (fbm(v + 300, 0, 48, SEED + 13, 2) - fbm(300, 0, 48, SEED + 13, 2));
}
/** A point given in the wall's own frame, placed where the wall is at that `v`. */
const xyW = (u: number, v: number): Pt => xyOf(u - wallSwing(v), v);

// ------------------------------------------------------------------------------------------------ the design

/** The lake's sill, the valley meadows' level (sill + 1) and the start's bench. */
const LAKE_SILL = 7;
const BENCH = 8;
/** The cleft's pool: its bed, and the lip's level (the Veil's crest). */
const POOL_BED = 13;
const LIP = 14;
/** The wall's crest. */
const CREST = 17;
/** The ledge along the wall's valley face (the old leat runs on it) and the lower bench under it. */
const LEDGE = 13;
const LOWER = 10;
/** The Pass: where the crest dips along the wall (v), and the level it dips to. */
const PASS_V = 56;
const PASS = 11;

/** Wall Lake: along the wall's foot, centred about u −25; a bay each side of the start's peninsula. */
const LAKE_ARMS: Sp[][] = [
  [xyS(-33, -36, 8), xyS(-34, -24, 9), xyS(-35, -12, 9), xyS(-34, 2, 10), xyS(-33, 16, 10), xyS(-31, 30, 9)],
  // the bay north-west of the start: the trench's way out to the lake
  [[...xyOf(-11, -7.5), 3.0], [...xyOf(-15, -10.5), 2.6], [...xyOf(-18.5, -13), 2.0], xyS(-22, -15, 3.0), xyS(-27, -17, 4.5)],
  // the Still Pool south-east of the start: a dead end from the trench along the wall's foot, held through a
  // drought at the lake's level; a levee on its neck keeps it clean in a badtide
  [[...xyOf(-11, 6.5), 2.2], [...xyOf(-12.5, 9.5), 2.4]],
  // the south-west bay the valley brook comes to
  [xyS(-37, -12, 8), xyS(-44, -14, 5)],
  // creeks at the lake's level into the meadows, the water's veins
  [xyS(-43, 4, 1.4), xyS(-52, 8, 1.2), xyS(-60, 4, 1.0), xyS(-66, 8, 0.9)],
  [xyS(-42, 22, 1.4), xyS(-50, 28, 1.2), xyS(-57, 36, 1.0), xyS(-60, 44, 0.9)],
  [xyS(-40, -28, 1.4), xyS(-47, -34, 1.2), xyS(-52, -42, 1.0), xyS(-58, -48, 0.9)],
  [xyS(-44, -4, 1.3), xyS(-52, -10, 1.1), xyS(-62, -14, 0.9)],
  [xyS(-38, 32, 1.2), xyS(-44, 40, 1.0), xyS(-48, 50, 0.9)],
];
function xyS(u: number, v: number, r: number): Sp {
  const [x, y] = xyW(u, v);
  return [x, y, r];
}
const LAKE_WANDER = 3;
const LAKE_MEADOW = 18;
const LAKE_ISLANDS: Sp[] = [xyS(-34, 22, 2.6), xyS(-32, -26, 2.2)];

/** The cleft in the wall: the springs' pool, open to the south-west over the Veil's lip. */
const POOL: Sp[] = [xyS(-6.5, 0, 3.2), xyS(-2.5, 0.5, 3.6), xyS(-2.2, 4.8, 2.4)];
/** The Veil's lip, as Four Lakes' Great Fall: [row, the first tile of the pool's bed in it], north to south; runs
 *  of one to three tiles facing south and west by turns about the diagonal x + y = 184. */
const LIP_ROWS: [number, number][] = [[97, 87], [96, 88], [95, 88], [94, 91], [93, 91], [92, 92], [91, 93], [90, 93], [89, 96], [88, 96]];
function lipXmin(y: number): number {
  for (const [ry, x] of LIP_ROWS) if (ry === y) return x;
  return y > 97 ? 87 : Infinity;
}
/** The start's middle: in the Veil's lap, so its lip fills the top of the game's first frame. */
const START_AT: Pt = [89, 89];
/** The throat: the trench's one way out round the start's south-east corner, deep. */
const THROAT: Pt[] = [[92, 90], [93, 90], [93, 89], [94, 89], [94, 88]];

/** The Gate: a slot through the wall at v 17, from the lake's shore to the basin. */
const GATE_V = 16;
const GATE_PATH: Pt[] = [xyW(-23, GATE_V + 2.5), xyW(-16, GATE_V + 1.5), xyW(-10, GATE_V + 0.5), xyW(-3, GATE_V + 0.5), xyW(6, GATE_V - 0.5), xyW(16, GATE_V + 1)];
/** The Low River: the lake's way out, west through the ridge to the edge. */
const LOW_PATH: Pt[] = [[50, 100], [40, 106], [32, 112], [20, 115], [8, 118], [-1, 119]];
/** The west ridge the Low River cuts through: the megadam's slot. */
const RIDGES: { path: Pt[]; top: number; half: number; drop: number; ledge: number; rough: number }[] = [
  { path: [[12, 84], [20, 98], [22, 112], [18, 128], [10, 144]], top: 12.6, half: 4.5, drop: 3, ledge: 3, rough: 1.1 },
  // a spur that closes the valley's south-east end
  { path: [[134, 30], [140, 44], [150, 52]], top: 12.2, half: 3, drop: 3, ledge: 2.4, rough: 0.9 },
];
/** The valley brook: from the springs in the far corner down to the lake's south-west bay. */
const BROOK_PATH: Pt[] = [[28, 30], [36, 42], [46, 54], [55, 66], [61, 75], [65, 81]];
const BROOK_POOL: Sp[] = [[27, 28, 3.4]];
const BROOK_POOL_BED = 10;
/** The west brook: from springs under the north-west hills to the lake's north-west end. */
const WEST_PATH: Pt[] = [[32, 158], [36, 146], [41, 134], [47, 122], [54, 110], [61, 99]];
const WEST_POOL: Sp[] = [[31, 160, 3]];
const WEST_POOL_BED = 10;
/** The south brook: from springs on the valley's south side to the lake's south-east end. */
const SOUTH_PATH: Pt[] = [[101, 24], [98, 34], [94, 44], [92, 54], [94, 62]];
const SOUTH_POOL: Sp[] = [[101, 22, 2.8]];
const SOUTH_POOL_BED = 9;
/** The old leat: along the ledge from the cleft's pool to the Pass. */
const LEAT_PATH: Pt[] = [[...xyW(-2.2, 4.8)], [100.5, 90], [100.5, 86], xyW(-9.0, 12), xyW(-9.3, 16), xyW(-9.4, 22), xyW(-9.4, 29), xyW(-9.4, 36), xyW(-9.3, 42), xyW(-9.2, 48), xyW(-8.5, PASS_V - 3), xyW(-6, PASS_V), xyW(0, PASS_V + 0.5), xyW(8, PASS_V - 1)];
/** The two dry beds in the basin, and where they leave the map. */
const GATE_BED: Pt[] = [xyW(16, GATE_V + 1), [126, 104], [133, 118], [143, 131], [156, 142], [170, 150], [182, 156], [193, 160]];
const PASS_BED: Pt[] = [xyW(8, PASS_V - 1), [153, 72], [163, 86], [171, 104], [177, 124], [181, 142], [184, 154]];
/** The seeps' hollows in the basin: each a small basin a level deep with a seep in it and a spill to a bed. */
const SEEPS: { at: Pt; r: number; strength: number; name: string; to: Pt }[] = [
  { at: [124, 126], r: 3.2, strength: 0.02, name: "the Near Seep", to: [134, 119] },
  { at: [150, 150], r: 2.8, strength: 0.02, name: "the Middle Seep", to: [157, 143] },
  { at: [176, 165], r: 3.0, strength: 0.02, name: "the Far Seep", to: [178, 157] },
];
/** The basin's exit: where its beds leave the map. */
const EXIT: Pt = [192, 158];

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
const CHANNELS: Channel[] = [
  // the Gate's slot: its floor at the lake's sill through the wall's first half, then a stair down to the basin
  { name: "Gate", path: GATE_PATH, half: () => 3.4, bed: (s) => (s < 3.5 ? LAKE_SILL : Math.max(4, LAKE_SILL - 2 - Math.floor((s - 3.5) / 8))), wet: false, wander: 0, open: 0, dry: true },
  // the Low River: the lake's sill (two tiles thick, ten wide), then a gorge bed falling to the edge
  { name: "Low River", path: LOW_PATH, half: (s) => (s < 2.5 ? 7.0 : s < 16 ? 2.6 : 3.4), bed: (s) => (s < 2.5 ? LAKE_SILL : Math.max(3, 5 - Math.floor((s - 2.5) / 20))), wet: true, wander: 0.6, open: 0 },
  { name: "Valley Brook", path: BROOK_PATH, half: () => 1.6, bed: brookBed(BROOK_PATH, BROOK_POOL_BED, 9), wet: true, wander: 3.6, open: 0, brook: { meadow: 15 } },
  { name: "West Brook", path: WEST_PATH, half: () => 1.4, bed: brookBed(WEST_PATH, WEST_POOL_BED, 8), wet: true, wander: 3.2, open: 0, brook: { meadow: 14 } },
  { name: "South Brook", path: SOUTH_PATH, half: () => 1.3, bed: brookBed(SOUTH_PATH, SOUTH_POOL_BED, 8), wet: true, wander: 3.0, open: 0, brook: { meadow: 13 } },
  // the old leat: a bed cut a level into the ledge, falling to the Pass
  { name: "Leat", path: LEAT_PATH, half: (s) => (s < 2 ? 0.8 : 1.1), bed: (s) => (s < 6 ? LEDGE : s < LEAT_LEN - 14 ? LEDGE - 1 - Math.floor(((s - 6) / (LEAT_LEN - 20)) * 1.999) : s < LEAT_LEN - 10 ? PASS : Math.max(6, PASS - 1 - Math.floor((s - (LEAT_LEN - 10)) / 1.4))), wet: false, wander: 0, open: 0, dry: true },
  { name: "Gate Bed", path: GATE_BED, half: () => 2.2, follow: { start: 4, under: 3, end: 0, grade: 16 }, wet: false, wander: 3.2, open: 0.8, dry: true },
  { name: "Pass Bed", path: PASS_BED, half: () => 1.8, follow: { start: 6, under: 3, end: 0, grade: 16 }, wet: false, wander: 3.2, open: 0.8, dry: true },
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
  /** 1 on the cleft's pool, 2 on the brook's springs' pool, 3 + k on seep k's hollow. */
  pool: Uint8Array;
  /** The Veil's lip tiles. */
  lip: number[];
  /** The Gate's plug: the natural dam's row at its mouth, then its blockage rows. */
  gatePlugs: number[][];
  /** The leat's blockage rows at its head. */
  leatPlugs: number[][];
  /** The Pass: the crest's lowest tiles, where the leat's water goes over. */
  pass: number[];
  /** A row across the Low River's head (the lake's sill): a dam here raises the lake. */
  lowHead: number[];
  /** The megadam's row: across the gorge where the ridge is narrowest. */
  megadam: number[];
  /** Rows across the Gate Bed at its narrows in the basin: check dams. */
  checkDams: number[][];
  /** Each seep's spill tiles: a levee here holds its pond a level higher. */
  seepLips: number[][];
  guarded: number;
}

export function designLand(): Land {
  const f = new Float64Array(N);
  const lake = new Uint8Array(N);
  const channel = new Uint8Array(N);
  const pool = new Uint8Array(N);
  const gLake = new Float64Array(N);

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

  // the wall as a field: its warped frame, its crest's half width and level, the Pass's dip
  const wallU = new Float64Array(N);
  const wallHalf = new Float64Array(N);
  /** 1 where the wall's own profile (crest, ledge, bench) sets the land. */
  const wallOn = new Uint8Array(N);
  const crestOf = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = vOf(x + 0.5, y + 0.5);
      // (the wall's line wanders by a long swing and a short one, read along it, so the crest bows and the faces
      // have re-entrants and buttresses; its width and height vary the same way)
      const u = uOf(x + 0.5, y + 0.5) + wallSwing(v) + 1.0 * fbm(x, y, 9, SEED + 15, 2);
      wallU[i] = u;
      wallHalf[i] = wallHalfAt(v) + 1.0 * fbm(x, y, 11, SEED + 16, 2);
      const halfHere = wallHalfAt(v);
      const ridge = 1.6 * Math.max(0, 1 - Math.abs(u) / Math.max(1, halfHere));
      const peak = fbm(v + 300, 0, 60, SEED + 17, 2);
      let crest = CREST - 0.8 + ridge + 0.9 * fbm(x, y, 26, SEED + 14, 2) + (peak > 0.22 ? 1 : 0) + (peak > 0.42 ? 1 : 0);
      // the Pass: the crest dips to PASS over about eight tiles, its sides easing up
      const pv = Math.abs(v - PASS_V) - 3.5;
      if (pv < 6) crest = Math.min(crest, PASS + Math.max(0, pv) * 1.2);
      crestOf[i] = crest;
    }

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const u = wallU[i];
      const half = wallHalf[i];
      const v = vOf(x + 0.5, y + 0.5);
      // a wandering of the whole picture, so no contour follows a ruler
      const wx = x + 0.5 + 6 * fbm(x, y, 36, SEED + 1, 3);
      const wy = y + 0.5 + 6 * fbm(x, y, 36, SEED + 2, 3);
      const wob = fbm(x, y, 16, SEED + 3, 3);

      // ---- the valley: the lower envelope of the lake's bowl and the brook's, outlands rising to the far corner
      // (the lake's body and its south-west bay wander; the bays' necks and the creeks are thin and keep their line)
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
      // the valley's outlands: a little over the lake near it, rising toward the far corner, in threes where dry
      const farCorner = hypot(x - 10, y - 10);
      let out = BENCH + 1.4 + 0.022 * Math.max(0, 150 - farCorner) + 3.2 * fbm(x, y, 64, SEED + 7, 3) + 1.4 * fbm(x, y, 27, SEED + 8, 3);
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

      // ---- the basin: benches in threes, falling away to the exit; the wall's basin foot a little higher
      const dExit = hypot(x - EXIT[0], y - EXIT[1]);
      let basin = 3.6 + 3.4 * Math.min(1, Math.max(0, (dExit - 14) / 120)) + 2.6 * fbm(x, y, 58, SEED + 31, 3) + 1.1 * fbm(x, y, 21, SEED + 32, 3);
      const step3 = fbm(x, y, 60, SEED + 33, 2) > -0.3;
      basin = step3 ? Math.round(basin / 3) * 3 : Math.round(basin / 2) * 2;
      // (a few low knolls on the plates: the game has one dry tone, and a dead-flat plate reads as a table)
      if (fbm(x, y, 9, SEED + 34, 2) > 0.5) basin += 1;
      if (fbm(x, y, 9, SEED + 38, 2) < -0.55) basin -= 1;
      if (fbm(x, y, 30, SEED + 35, 2) > 0.38) basin += 1;
      if (basin < 3) basin = 3;

      // ---- the wall: the crest, a ledge and a lower bench on each face; elsewhere the land's own
      const crest = crestOf[i];
      const faceV = Math.abs(v);
      let wall = -Infinity;
      if (Math.abs(u) <= half) wall = crest;
      else if (u < 0) {
        const t = -u - half;
        // (at the Veil the face is sheer from the lip to the pool: no ledge, no bench)
        const spur = 2.4 * Math.max(0, fbm(v + 300, 0, 31, SEED + 41, 2));
        if (faceV > 7.5 + 1.2 * fbm(x, y, 6, SEED + 40, 2)) {
          if (t < 3.6 + spur) wall = Math.min(crest - 4, LEDGE);
          else if (faceV > 36 && t < 6.4 + 2.5 * spur) wall = Math.min(crest - 7, LOWER);
        }
      } else {
        const t = u - half;
        const spur = 3 * Math.max(0, fbm(v + 300, 0, 37, SEED + 42, 2));
        if (t < 2.4 + spur) wall = Math.min(crest - 4, LEDGE);
        else if (t < 5.6 + 2.5 * spur) wall = Math.min(crest - 8, 9);
      }
      // (near the Pass the ledge and bench on the basin side fall to the Pass's own level)
      const side = u < 0 ? valley : basin;
      land = Math.max(side, wall);
      if (wall > side) wallOn[i] = 1;
      // (the wall's own faces blend into the land a tile or two beyond their last bench)
      if (land > TOP) land = TOP;
      f[i] = land;
    }

  // the start's bench: level BENCH on the lake's shore round the Veil's foot
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, [xyS(-14, -24, 4), xyS(-16, -12, 7), xyS(-17, 0, 9), xyS(-16, 12, 7), xyS(-14, 24, 4)]) + 2.2 * fbm(x, y, 13, SEED + 20, 2);
      if (d < 0 && gLake[i] > 0 && !wallOn[i]) f[i] = BENCH;
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
      // (a graded bed falls at least a level every `grade` tiles, so a trickle in it runs to the exit)
      if (fo.grade) run = Math.min(run, fo.start - Math.floor((b * 2) / fo.grade));
      table.push(Math.max(fo.end, run));
    }
    return (s: number) => table[Math.min(table.length - 1, Math.max(0, Math.floor(s / 2)))];
  });
  // the brook's springs' rim
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, BROOK_POOL);
      if (d < 4 && f[i] < BROOK_POOL_BED + 2) f[i] = BROOK_POOL_BED + 2;
      const dw = spineDist(x + 0.5, y + 0.5, WEST_POOL);
      if (dw < 4 && f[i] < WEST_POOL_BED + 2) f[i] = WEST_POOL_BED + 2;
      const ds = spineDist(x + 0.5, y + 0.5, SOUTH_POOL);
      if (ds < 4 && f[i] < SOUTH_POOL_BED + 2) f[i] = SOUTH_POOL_BED + 2;
    }
  CHANNELS.forEach((c, k) => {
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const x = i % W;
      const y = (i - x) / W;
      const half = c.half(s) + (c.brook ? 0.3 + 2.0 * Math.max(0, fbm(x, y, 13, SEED + 30 + k, 2) + 0.12) : c.open > 0 ? 0.8 * fbm(x, y, 9, SEED + 30 + k, 2) : 0);
      const b = bedOf[k](s);
      if (d <= half) {
        if (c.wet && channel[i] && CHANNELS[channel[i] - 1].wet && f[i] <= b) continue;
        // (the Gate's slot cuts the old leat's ledge: the leat is broken there, and its water, let loose, falls
        // into the slot unless the player spans it)
        if (c.name === "Leat" && channel[i] === chan("Gate") + 1) continue;
        f[i] = b;
        channel[i] = k + 1;
      } else if (c.open > 0) {
        const t = d - half;
        // (a dry bed's floodplain: a strip a level over the bed, four tiles wide and ragged, the old river's)
        const v = t < 3.6 + 2.2 * fbm(x, y, 9, SEED + 71, 2) ? b + 1 : Infinity;
        if (v < f[i]) f[i] = v;
      } else if (c.brook && d <= half + 1.2 && !channel[i]) {
        if (f[i] < b + 1) f[i] = b + 1;
      } else if (c.name === "Gate" && s >= 3.5 && s < 15 && d <= half + 1.6 && !channel[i]) {
        if (f[i] < BENCH + 1) f[i] = BENCH + 1;
      }
    }
  });
  // the two pools' beds
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      if (d < 0 && channel[i] !== chan("Leat") + 1) {
        f[i] = d < -1.4 ? POOL_BED : LIP;
        pool[i] = 1;
        channel[i] = 0;
      } else if (d >= 0 && d < 1.6 && f[i] < LIP + 1 && channel[i] !== chan("Leat") + 1) f[i] = LIP + 1;
      const db = spineDist(x + 0.5, y + 0.5, BROOK_POOL);
      if (db < 0) {
        f[i] = db < -1.4 ? BROOK_POOL_BED - 1 : BROOK_POOL_BED;
        pool[i] = 2;
        channel[i] = 0;
      }
      const dwp = spineDist(x + 0.5, y + 0.5, WEST_POOL);
      if (dwp < 0) {
        f[i] = dwp < -1.4 ? WEST_POOL_BED - 1 : WEST_POOL_BED;
        pool[i] = 2;
        channel[i] = 0;
      }
      const dsp = spineDist(x + 0.5, y + 0.5, SOUTH_POOL);
      if (dsp < 0) {
        f[i] = dsp < -1.4 ? SOUTH_POOL_BED - 1 : SOUTH_POOL_BED;
        pool[i] = 2;
        channel[i] = 0;
      }
    }
  // the seeps' hollows: a basin a level under its bench, its floor two under at the middle
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
  // (each seep's hollow sits in its bench: the bench's level is read after rounding)
  const seepLips: number[][] = [];
  SEEPS.forEach((S, k) => {
    let rim = 0;
    let n = 0;
    for (let i = 0; i < N; i++) if (pool[i] === 3 + k) (rim += h[i]), n++;
    const bench = Math.round(rim / n);
    for (let i = 0; i < N; i++) {
      if (pool[i] !== 3 + k) continue;
      const x = i % W;
      const y = (i - x) / W;
      const dd = hypot(x + 0.5 - S.at[0], y + 0.5 - S.at[1]);
      h[i] = Math.max(0, dd < 1.6 ? bench - 4 : bench - 3);
    }
    // the ring round it stands at the bench, but for its spill: the lowest ring tile toward the nearest bed
    const ring: number[] = [];
    for (let i = 0; i < N; i++) {
      if (pool[i]) continue;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && pool[j] === 3 + k) { ring.push(i); break; }
    }
    for (const i of ring) if (!channel[i] && h[i] < bench - 2) h[i] = Math.max(1, bench - 2);
    // the spill: the ring tile nearest a bed, cut to the hollow's floor + 1 (the water stands at bench − 1 + head)
    let best = -1;
    let bestD = Infinity;
    for (const i of ring) {
      const x = i % W;
      const y = (i - x) / W;
      const d = Math.min(along[chan("Gate Bed")][i].d, along[chan("Pass Bed")][i].d);
      if (d < bestD) (bestD = d), (best = i);
      void y;
    }
    if (best >= 0) {
      h[best] = Math.max(1, bench - 2);
      seepLips.push([best]);
      // the gully: from the spill toward the bed, a tile at a time, falling a level every two tiles, until it
      // meets the bed's floodplain
      let gx = best % W;
      let gy = Math.floor(best / W);
      let lv = bench - 1;
      const bedTiles: number[] = [];
      // (the gully is not cut: the hollows are closed, and a seep this weak evaporates in its own)
      (gx = -99), (gy = -99);
      for (let i = 0; i < N; i++) if (channel[i] === chan("Gate Bed") + 1 || channel[i] === chan("Pass Bed") + 1) bedTiles.push(i);
      for (let step = 0; gx >= 0 && step < 40; step++) {
        let tx = S.to[0];
        let ty = S.to[1];
        let bd = Infinity;
        for (const t of bedTiles) {
          const d = hypot((t % W) - gx, Math.floor(t / W) - gy);
          if (d < bd) (bd = d), (tx = t % W), (ty = Math.floor(t / W));
        }
        const dx = tx - gx;
        const dy = ty - gy;
        if (Math.abs(dx) >= Math.abs(dy)) gx += Math.sign(dx);
        else gy += Math.sign(dy);
        const j = gy * W + gx;
        if (channel[j]) break;
        if (step % 2 === 1) lv--;
        if (h[j] > lv) h[j] = lv;
        pool[j] = 3 + k;
      }
    } else seepLips.push([]);
  });

  // the lake's bed: a shelf at the sill, a shallow margin, then the deep water along the old river's line
  for (let i = 0; i < N; i++) {
    const d = gLake[i];
    if (d >= 0) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (f[i] >= LEDGE && wallU[i] > -wallHalf[i] - 3.5) continue; // the lake stops at the wall's ledge and crest
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
    // (r4: the lake a level and a half deep over its old river's line only, lighter in the game than two)
    const channelDepth = line < 2.2 ? 2 : 1;
    let depth = shore === 0 ? 0 : shore === 1 ? Math.min(1, channelDepth) : channelDepth;
    // (the two bays' necks carry the Veil's whole flow from the trench: two deep their whole length; a creek a level)
    const arm = LAKE_ARMS.findIndex((a) => spineDist(x + 0.5, y + 0.5, a) < 0);
    if (arm === 1) depth = 3;
    else if (arm === 2) depth = 2;
    else if (arm >= 4) depth = 1;
    // (the water the first frame holds, round the start, stays shallow: deep water is near black in the game)
    if (Math.abs(vOf(x + 0.5, y + 0.5)) < 16 && wallU[i] > -24) depth = Math.min(depth, 1);
    h[i] = LAKE_SILL - depth;
    lake[i] = 1;
    channel[i] = 0;
  }

  // the Veil: the pool's bed behind the lip, the lip itself, the trench at its foot, the throat
  const lip = veil(h, lake, channel, pool);

  // the start's pad: level ground, the trench kept beside it
  for (let y = START_AT[1] - 2; y <= START_AT[1] + 2; y++)
    for (let x = START_AT[0] - 2; x <= START_AT[0] + 2; x++) {
      const i = y * W + x;
      const own = Math.abs(x - START_AT[0]) <= 1 && Math.abs(y - START_AT[1]) <= 1;
      if (!own && VEIL_POOL.has(i)) continue;
      h[i] = BENCH;
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
  const bar2 = spanRow("Gate", 2 + 1.5);
  const gatePlugs = [[...bar1, ...bar2.filter((i) => !bar1.includes(i))], spanRow("Gate", 16), spanRow("Gate", 22)];
  // (the natural dam: the slot's first two rows past the lake's shore stand a level over its floor, at the bench's
  // level: rock the player blasts, and the bench's own way across the slot until then)
  for (const i of gatePlugs[0]) h[i] = LAKE_SILL + 1;
  const leatPlugs = [spanRow("Leat", 4.0), spanRow("Leat", 9)];
  // (the leat's natural dam: its head row stands two over its bed, a level over the pool's water)
  for (const i of leatPlugs[0]) h[i] = LIP + 1;
  const lowHead = spanRow("Low River", 0.6);
  // the Pass: the crest's tiles the leat's last reach crosses at PASS
  const pass: number[] = [];
  for (let i = 0; i < N; i++) if (channel[i] === chan("Leat") + 1 && h[i] === PASS && Math.abs(wallU[i]) <= wallHalf[i]) pass.push(i);
  // the megadam: the gorge's narrowest row through the ridge
  let megadam: number[] = [];
  {
    const kG = chan("Low River");
    for (let s0 = 6; s0 < 40; s0 += 0.5) {
      const row = rowAt("Low River", s0, s0 + 1.45);
      if (!row.length) continue;
      const walls = row.every((i) => [i - 1, i + 1, i - W, i + W].every((j) => j < 0 || j >= N || channel[j] === kG + 1 || h[j] >= 11));
      if (walls && (!megadam.length || row.length < megadam.length)) megadam = row;
    }
  }
  // check dams: rows across the Gate Bed where its banks stand two over the bed on both sides
  const checkDams: number[][] = [];
  {
    const kB = chan("Gate Bed");
    const len = pathLength(GATE_BED);
    let last = -99;
    for (let s0 = 14; s0 < len - 10; s0 += 0.5) {
      if (s0 - last < 28) continue;
      const row = rowAt("Gate Bed", s0, s0 + 1.45);
      if (!row.length || row.length > 5) continue;
      const bed = Math.max(...row.map((i) => h[i]));
      // (the banks: ground two over the bed within four tiles of the row on both sides of it)
      const cx = row.reduce((a, i) => a + (i % W), 0) / row.length;
      const cy = row.reduce((a, i) => a + Math.floor(i / W), 0) / row.length;
      const dir = GATE_BED.length ? (() => { const { s: at } = pathDist(cx, cy, GATE_BED); const p = pointAlong(GATE_BED, at + 2); const q = pointAlong(GATE_BED, at - 2); const l = hypot(p[0] - q[0], p[1] - q[1]) || 1; return [(p[1] - q[1]) / l, -(p[0] - q[0]) / l]; })() : [1, 0];
      let left = false;
      let right = false;
      for (let t = 1; t <= 5; t++) {
        const L = Math.round(cy + dir[1] * t) * W + Math.round(cx + dir[0] * t);
        const R = Math.round(cy - dir[1] * t) * W + Math.round(cx - dir[0] * t);
        if (L >= 0 && L < N && channel[L] !== kB + 1 && h[L] >= bed + 2) left = true;
        if (R >= 0 && R < N && channel[R] !== kB + 1 && h[R] >= bed + 2) right = true;
      }
      if (!left || !right) continue;
      checkDams.push(row);
      last = s0;
    }
  }

  // the guard: every tile beside the water that would let it out stands a level over it. The ways out: the Low
  // River, the Veil's lip (the pool's own), the Gate's mouth (its natural dam) and the leat's head (its blockages).
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
      if (c && (CHANNELS[c - 1].name === "Low River" || (CHANNELS[c - 1].name === "Gate" && along[c - 1][i].s < 2.2) || (CHANNELS[c - 1].name === "Leat" && along[c - 1][i].s < 6))) exit[i] = 1;
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

/** The Veil: the pool's bed (LIP) from each row's first tile north-eastward to the cleft; its lip is every tile of
 *  that bed with open air to its south or its west. In front, a trench two tiles wide: the foot row at the sill
 *  (shallow), the row beside it a level deeper; the throat round the start's corner; one buttress. */
function veil(h: Uint8Array, lake: Uint8Array, channel: Uint8Array, pool: Uint8Array): number[] {
  const bed = new Set<number>();
  for (let k = 0; k < 10; k++)
    for (let d = 0; d <= 4; d++)
      for (let e = 0; e <= d; e++) {
        const x = 87 + k + (d - e);
        const y = 97 - k + e;
        if (x >= lipXmin(y)) bed.add(y * W + x);
      }
  for (const [y, x0] of LIP_ROWS) for (let x = x0; x <= x0 + 4; x++) bed.add(y * W + x);
  for (const i of bed) {
    if (pool[i] === 1 && h[i] === POOL_BED) continue;
    if (channel[i] === chan("Leat") + 1) continue;
    h[i] = LIP;
    lake[i] = 0;
    channel[i] = 0;
    pool[i] = 1;
  }
  let tiles: number[] = [];
  LIP_ROWS.forEach(([y, x0], r) => {
    const below = r + 1 < LIP_ROWS.length ? LIP_ROWS[r + 1][1] : x0 + 1;
    for (let x = x0; x <= Math.max(x0, below - 1); x++) tiles.push(y * W + x);
  });
  // (r3: a lip tile fed only by the lip tiles north and east of it pours a film and stood dry in the game, a
  // pillar of rock in the curtain: it is the foot's instead)
  {
    const lipSet = new Set(tiles);
    const corners = tiles.filter((t) => lipSet.has(t + W) && lipSet.has(t + 1));
    for (const t of corners) {
      h[t] = LAKE_SILL;
      lake[t] = 1;
      channel[t] = 0;
      pool[t] = 0;
      bed.delete(t);
      VEIL_POOL.add(t);
    }
    tiles = tiles.filter((t) => !corners.includes(t));
  }
  // (the trench: the foot row at the sill, shallow; the row beside it two deeper, which carries the fall's water
  // along to the drain; a third row a level under the sill, the lake's own shelf)
  for (const pass of [3, 2, 1])
    for (const t of tiles) {
      const x = t % W;
      const y = (t - x) / W;
      for (let a = 0; a <= 3; a++)
        for (let b = 0; a + b <= 3; b++) {
          if (a + b !== pass) continue;
          const i = (y - b) * W + x - a;
          if (bed.has(i)) continue;
          h[i] = pass === 1 ? LAKE_SILL : pass === 2 ? LAKE_SILL - 2 : LAKE_SILL - 1;
          lake[i] = 1;
          channel[i] = 0;
          pool[i] = 0;
          VEIL_POOL.add(i);
        }
    }
  for (const [x, y] of THROAT) if (VEIL_POOL.has(y * W + x)) h[y * W + x] = LAKE_SILL - 3;
  // the buttress: a fin of rock out from the face's east end, a level over the lip
  {
    const i = 89 * W + 95;
    h[i] = LIP + 1;
    lake[i] = 0;
    channel[i] = 0;
    pool[i] = 0;
    VEIL_POOL.delete(i);
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
  [...xyW(-3, 0).map(Math.floor), 3.4] as [number, number, number],
  [...xyW(-5, -1.2).map(Math.floor), 3.4] as [number, number, number],
  [...xyW(-4.5, 1.6).map(Math.floor), 3.2] as [number, number, number],
  [26, 28, 1.6],
  [28, 27, 1.4],
  [30, 160, 1.5],
  [31, 159, 1.3],
  [100, 22, 1.2],
  [101, 21, 1.1],
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
      if (uOf(x + 0.5, y + 0.5) < 10) continue;
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
function printWindow(s: MapSession): void {
  const [x0, y0, x1, y1] = arg("window", "80,80,100,100").split(",").map(Number);
  for (let y = y1; y >= y0; y--) {
    let row = `y ${String(y).padStart(3)}: `;
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      row += has("beds") ? `${String(s.built.heights[i]).padStart(3)}${s.built.water[i] > 0.02 ? "~" : " "}` : s.built.water[i] > 0.02 ? (s.built.heights[i] + s.built.water[i]).toFixed(1).padStart(5) : `  ${String(s.built.heights[i]).padStart(2)} `;
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
  const inValley = (i: number) => uOf((i % W) + 0.5, Math.floor(i / W) + 0.5) < -6;
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
  count.shoreOak = paint("trees", "Oak", (i) => inValley(i) && moist(i) && land.lake[i] === 0 && dist[i] >= 3 && dist[i] <= 12 && vOf((i % W) + 0.5, Math.floor(i / W) + 0.5) < -14 && n(i, 19, 51) > 0.2 && !nearStart(i, 21) && !sight(i), 0.25, 31, "Oak stands on the lake's west shore", "mixed");
  // the start's own: berries, and one wood on the bench's west side, a short walk from the door
  const level = (i: number) => b.heights[i] === st.z && moist(i);
  const uS = uOf(st.x + 0.5, st.y + 0.5);
  const uI = (i: number) => uOf((i % W) + 0.5, Math.floor(i / W) + 0.5);
  const vI = (i: number) => vOf((i % W) + 0.5, Math.floor(i / W) + 0.5);
  count.startBerries = paint("bushes", "BlueberryBush", (i) => level(i) && !nearStart(i, 5) && nearStart(i, 14) && uI(i) < uS - 1 && vI(i) < 2 && n(i, 5, 27) > -0.15, 0.55, 21, "The start's berries");
  count.startOaks = paint("trees", "Oak", (i) => level(i) && !nearStart(i, 9) && nearStart(i, 22) && vI(i) > 4 && n(i, 8, 33) > 0.1, 0.7, 22, "The start's oaks");
  count.startPines = paint("trees", "Pine", (i) => level(i) && !nearStart(i, 9) && nearStart(i, 24) && vI(i) > 4 && n(i, 8, 33) <= 0.1, 0.7, 24, "The start's pine wood", "mixed");
  // the basin, dressed on purpose: dead woods in clumps on the dry beds and round the seeps' hollows, succulents
  // on the far benches, thorns in the gullies
  const dry = (i: number) => !(b.moisture[i] > 0) && !(b.water[i] > 0) && !land.lake[i] && !land.pool[i];
  const inBasin = (i: number) => uOf((i % W) + 0.5, Math.floor(i / W) + 0.5) > 10;
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
  const bedCentres = centres(
    Array.from({ length: N }, (_, i) => i).filter((i) => dryBed(i) && inBasin(i) && keepClear.every((j) => far(i, j) > 7)),
    40,
    7,
    71,
  );
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
  put("SmallRelic", ...(xyW(10, PASS_V + 4).map(Math.round) as [number, number]), "The relic at the Pass", {}, [2, 2]);
  put("MediumRelic", ...(xyW(19, GATE_V + 5).map(Math.round) as [number, number]), "The relic at the Gate's foot", {}, [3, 3]);
  put("SmallRelic", Math.round(LAKE_ISLANDS[0][0]) - 1, Math.round(LAKE_ISLANDS[0][1]) - 1, "The relic on the island", {}, [2, 2]);
  // the basin's finds: an aquifer and the old drill by the Gate Bed, ruins under a bench, the geothermal field far
  // out, an unstable core in the valley's far corner
  const aq = put("Aquifer", 136, 118, "An aquifer under the basin's bench", {}, [3, 3]);
  if (aq) {
    const a = s.built.entities.find((e) => e.template === "Aquifer");
    if (a) put("AncientAquiferDrill", a.x, a.y, "The ancient drill on the aquifer");
  }
  put("UndergroundRuins", 150, 124, "The ruins under the basin's bench", {}, [5, 5]);
  put("GeothermalField", 172, 172, "The geothermal field in the basin's far corner", {}, [3, 3]);
  put("UnstableCore", 40, 20, "An unstable core by the brook's springs", { components: placeComponents("UnstableCore") }, [2, 2]);
  // the way up to the ledge: a ramp from the bench south-east of the Gate up the wall's face
  {
    const [rx, ry] = xyOf(-14, 27).map(Math.round);
    if (!ramp(s, land, rx, ry, BENCH, LEDGE, "The way up to the ledge")) ramp(s, land, rx, ry, BENCH, LEDGE - 1, "The way up to the ledge");
  }
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
    for (let i = 0; i < N; i++) if (land.channel[i] === kG) { const d = Math.abs(uOf((i % W) + 0.5, Math.floor(i / W) + 0.5) + 6); if (d < bd) (bd = d), (best = i); }
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
    const crest = frameAt(cam, ...xyOf(0, 0), CREST);
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
  step(`the old leat's bar blasted once (${land.leatPlugs[0].length} tiles) and its ${land.leatPlugs[1].length} blockages cleared`, "medium", "a trickle along the ledge, into the Gate's slot where it cuts the ledge", () => {
    flatten(land.leatPlugs[0], LIP, "Blast the leat's bar");
    applyOps(s, [{ op: "deleteEntities", params: { entities: PLUG_IDS.leat }, label: "Clear the leat's blockages" }]);
  });
  step(`the old leat's bar blasted twice`, "large", "the springs' share along the ledge; the Veil dwindles", () => flatten(land.leatPlugs[0], LEDGE, "Blast the leat's bar again"));
  {
    // (the span: the slot's tiles under the leat's line raised to the leat's bed; an aqueduct in the game, which the
    // model can only stand in for by blocking the slot there)
    const kG = chan("Gate") + 1;
    const span: number[] = [];
    for (let i = 0; i < N; i++) if (land.channel[i] === kG && pathDist((i % W) + 0.5, Math.floor(i / W) + 0.5, LEAT_PATH).d < 1.6) span.push(i);
    step(`the leat spanned over the Gate (${span.length} tiles to the ledge's level; an aqueduct in the game, which blocks nothing)`, "large", "the Pass Bed runs: the far basin", () => flatten(span, LEDGE - 1, "Span the Gate"));
  }
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
  "A mountain wall runs corner to corner: a green valley on your side, a dry basin beyond. The river rises in a cleft of the wall and pours over the Veil into Wall Lake at your door. " +
  "The Gate is the one notch through the wall, plugged by a natural dam and old rubble; the basin's riverbeds run dry from its foot. " +
  "Carry the water through: open the Gate, pump it over the wall, or clear the old leat along the ledge and send the river round by the Pass. " +
  "In a drought the Veil stops and the lake holds. In a badtide every spring runs red: the basin is where to send it.";

// --------------------------------------------------------------------------------------------------- main

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const land = designLand();
  const m = measureLand(land.heights);
  log(`The Gate, round ${ROUND}`);
  log(`  guard raised ${land.guarded} tiles; the Pass ${land.pass.length} tiles at ${PASS}; the megadam's row ${land.megadam.length} tiles; check dams ${land.checkDams.map((r) => r.length).join(", ")}; the Low River's head ${land.lowHead.length}`);
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
    if (stray0.length && has("window")) printWindow(s);
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
      { name: "the lake's north-west shore", tiles: tilesOf((i) => land.lake[i] === 0 && s.built.heights[i] === BENCH && vOf((i % W) + 0.5, Math.floor(i / W) + 0.5) < -20 && uOf((i % W) + 0.5, Math.floor(i / W) + 0.5) < -12), far: true },
      { name: "the lake's south meadow", tiles: tilesOf((i) => land.lake[i] === 0 && s.built.heights[i] === BENCH && vOf((i % W) + 0.5, Math.floor(i / W) + 0.5) > 20 && uOf((i % W) + 0.5, Math.floor(i / W) + 0.5) < -40) },
      { name: "the Gate's natural dam", tiles: land.gatePlugs[0] },
      { name: "the brooks' springs", tiles: tilesOf((i) => land.pool[i] === 2, 3), far: true },
      { name: "the Low River's head", tiles: land.lowHead, far: true },
      { name: "the megadam's slot", tiles: land.megadam, far: true },
      { name: "the ledge and the leat's head", tiles: land.leatPlugs[0] },
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
    const f = { timber: s.exportTimber().bytes, project: s.project(9) };
    writeFileSync(join(OUT, `${ROUND}.timber`), f.timber);
    writeFileSync(join(OUT, `${ROUND}.damgoodmaps.json`), f.project);
    log(`  saved ${join(OUT, `${ROUND}.timber`)} (${f.timber.length} bytes), project ${f.project.length} bytes`);
    lap("save");
  }
  if (has("irrigate")) {
    irrigation(s, land);
    lap("irrigation");
  }
}

main();
