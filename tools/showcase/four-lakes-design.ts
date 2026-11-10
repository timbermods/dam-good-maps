// Four Lakes: the land as a design, by number. Pure arithmetic, no core: `designLand` gives the level of every
// tile of the 192² map and the named places the authoring script (four-lakes.ts) builds on: the lakes and
// their sills, the falls, the hanging valley, the old channel and its plugs, the gorge, the start.
//
// The map (x east, y north): a valley that winds up the diagonal from the gorge in the south-west to the springs
// in the north-east. Four lakes with sill crests at levels 2, 6, 10 and 14 (the water stands in the 3rd, 7th,
// 11th and 15th layer), a fall of 4 between each; the Great Fall, 8 levels, from the hanging valley (bed 14)
// into the second lake; an old dry channel down the south-east side.
//
// Each helper here is a tool the editor should have (the showcase brief's changes 2, 3 and 5): land from lake
// outlines and levels (`bowl`), ground that rolls in one-level steps (`rise` on warped distance), a lake set
// to a level with its sill (`Fall`), a channel along a path with a bed profile (`Channel`).

export const W = 192;
export const H = 192;
export const N = W * H;
export const TOP = 16;

// ------------------------------------------------------------------------------------------------ noise

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, −1 to 1. */
function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Fractal noise, about −1 to 1: `scale` is the size of its largest feature in tiles. */
export function fbm(x: number, y: number, scale: number, seed: number, octaves = 4): number {
  let amp = 1;
  let f = 1 / scale;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f + 31.7 * o, y * f - 17.3 * o, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// --------------------------------------------------------------------------------------------- geometry

export type Pt = [number, number];
/** A spine point: x, y and the radius of the shape there. */
export type Sp = [number, number, number];

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
  if (spine.length === 1) return Math.hypot(px - spine[0][0], py - spine[0][1]) - spine[0][2];
  for (let k = 0; k + 1 < spine.length; k++) {
    const a = spine[k];
    const b = spine[k + 1];
    const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
    const v = d - (a[2] + (b[2] - a[2]) * t);
    if (v < best) best = v;
  }
  return best;
}

/** Distance to a path, how far along it (tiles from its first point) and its whole length. */
function pathDist(px: number, py: number, path: readonly Pt[]): { d: number; s: number } {
  let best = Infinity;
  let at = 0;
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) {
      best = d;
      at = run + t * len;
    }
    run += len;
  }
  return { d: best, s: at };
}

export function pathLength(path: readonly Pt[]): number {
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) run += Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
  return run;
}

/// ------------------------------------------------------------------------------------------- the design

export interface Lake {
  name: string;
  /** Its sill's crest: the water stands a little over it. */
  sill: number;
  /** Its outline: capsule chains (arms), a tile inside any of them is lake. */
  arms: Sp[][];
  /** How far its outline wanders, in tiles. */
  wander: number;
  /** The deepest its bed goes below the sill. */
  deep: number;
  /** A tile in its deep water. */
  seed: Pt;
  /** Islands: land inside the outline, a level over the water. */
  islands?: Sp[];
  /** How wide its level meadow is, in tiles. */
  meadow: number;
  /** A tarn's spring: where, and its strength. */
  spring?: [number, number, number];
}

/** A fall over a sill: the water of `from` goes over crest tiles (level = the lake's sill) and drops to `to`.
 *  `face`: the way the water falls. `at`: the crest's row (S) or column (W) at the gap's ends; the lip bends
 *  upstream toward its middle (a horseshoe). `span`: the gap between the rock shoulders, inclusive. `notch`: crest
 *  tiles one level lower, where the lake drains in a drought. `piers`: tiles of the gap that stand one level over
 *  the crest (a ruined weir's piers). */
export interface Fall {
  name: string;
  from: number;
  to: number;
  face: "S" | "W";
  at: number;
  span: [number, number];
  notch: number[];
  piers: number[];
  /** Its crest's level (the lake's sill; the hanging valley's bed for the Great Fall). */
  crest: number;
  /** The drop's foot: the lower lake's bed there. */
  foot: number;
}

/** A channel along a path: its bed's width, and its bed's level either given (`bed`) or following the land
 *  (`follow`: from `start`, `under` levels under the land beside it, never rising, never below `end`). `wet`: it
 *  carries water from the first day (the guard keeps its banks a level over its bed). */
export interface Channel {
  name: string;
  path: Pt[];
  /** Half its bed's width, in tiles. */
  half: (s: number) => number;
  bed?: (s: number) => number;
  follow?: { start: number; under: number; end: number; hold?: number };
  /** Banks at least this far over the bed, this wide beside it (a raise): 0 for none. */
  bank: number;
  bankWide: number;
  wet: boolean;
  /** How far its course wanders from the path, in tiles. */
  wander: number;
  /** How fast its banks open out beside the bed, levels a tile (0: walls, the gorge). */
  open: number;
  /** A brook: its valley floor is level beside it (the land's envelope makes it), `meadow` tiles wide. */
  brook?: { meadow: number };
}

/** A plug in the old channel: a row of Blockages across it, `at` tiles along it. */
export const PLUGS = [2.2, 190, 300];

export const LAKES: Lake[] = [
  {
    name: "Low Lake",
    sill: 2,
    arms: [
      [[38, 34, 11], [50, 44, 15], [64, 54, 14], [78, 64, 11], [90, 72, 9]],
      [[90, 72, 8.5], [90.5, 79, 8.5]],
      [[42, 36, 10], [40, 29, 8.5], [40, 26, 7.5]],
      [[40, 44, 9], [27, 50, 6]],
      // the start's cove: deep water at the meadow's edge
      [[72, 62, 9], [71, 69, 6], [69, 74, 4.5]],
      // the south bay behind a peninsula
      [[62, 44, 7], [74, 40, 6]],
    ],
    wander: 4,
    deep: 2,
    seed: [60, 54],
    islands: [[49, 45, 5.2], [80, 56, 2.6]],
    meadow: 16,
  },
  {
    name: "Weir Lake",
    sill: 6,
    arms: [
      [[98, 96, 8.5], [107, 99, 12.5], [116, 100, 10]],
      // the west bay under the Great Fall
      [[97, 97, 7.5], [90, 94, 5.5], [85, 95, 4], [83, 100, 3]],
      // to the Low Fall
      [[94, 95, 7.5], [90.5, 89, 7.5]],
      // to the Weir Fall's foot
      [[116, 100, 8.5], [121, 99.5, 7.5]],
      [[108, 108, 7], [112, 111, 4.5]],
    ],
    wander: 2.5,
    deep: 5,
    seed: [104, 99],
    // a birch islet in the Great Fall's bay, in the right half of the game's first frame
    islands: [[91.8, 95.4, 0.5]],
    meadow: 15,
  },
  {
    name: "Steam Lake",
    sill: 10,
    arms: [
      [[139, 104, 11], [153, 108, 14], [163, 99, 11]],
      [[139, 104, 9], [132, 99.5, 7.5]],
      [[150, 112, 9], [149.5, 121, 7.5]],
      [[163, 99, 9], [170, 108, 6]],
      [[146, 96, 7], [150, 90, 5]],
    ],
    wander: 3,
    deep: 5,
    seed: [150, 106],
    islands: [[158, 103, 2.8]],
    meadow: 15,
  },
  {
    name: "Crown Lake",
    sill: 14,
    arms: [
      [[141, 145, 9], [154, 150, 13], [151, 158, 9]],
      [[150, 141, 8.5], [149.5, 134, 7.5]],
      [[160, 156, 7], [165, 160, 4.5]],
    ],
    wander: 2.5,
    deep: 5,
    seed: [153, 150],
    islands: [[157, 151, 2.2]],
    meadow: 15,
  },
];

/** The tarns: small lakes on the benches, each with its own spring, each the head of a brook. */
export const TARNS: Lake[] = [
  // the west chain, fed from the springs' pool through the West Leat's one-tile notch
  { name: "High Tarn", sill: 13, arms: [[[61, 148, 4], [68, 151, 6], [77, 153, 4.5]]], wander: 2, deep: 2, seed: [68, 151], meadow: 15 },
  { name: "Birch Tarn", sill: 9, arms: [[[38, 116, 7.5], [40, 108, 6.5]]], wander: 2.5, deep: 3, seed: [36, 112], meadow: 15, islands: [[40, 113, 1.9]] },
  { name: "Hill Tarn", sill: 7, arms: [[[49, 101, 4.5], [53, 98, 3.5]]], wander: 1.2, deep: 2, seed: [50, 100], meadow: 12 },
  // the east chain, fed from Steam Lake through a notch in its south shore
  { name: "Bench Tarn", sill: 8, arms: [[[143, 71, 5], [150, 68, 6.5], [156, 72, 4.5]]], wander: 2.2, deep: 2, seed: [150, 69], meadow: 15 },
  { name: "South Tarn", sill: 6, arms: [[[124, 47, 3.5], [129, 49, 4.5]]], wander: 1.5, deep: 2, seed: [128, 49], meadow: 14 },
  // the rim's own: a spring whose run leaves by the west edge and never meets the lakes
  { name: "Gate Tarn", sill: 10, arms: [[[58, 15, 3.5], [64, 14, 4.5]]], wander: 1.2, deep: 2, seed: [63, 14], meadow: 15, spring: [63, 14, 1.2] },
  { name: "Fell Tarn", sill: 15, arms: [[[90, 179, 3.5], [98, 180, 5], [106, 181, 3.5]]], wander: 1.5, deep: 2, seed: [98, 180], meadow: 14, spring: [98, 180, 1.5] },
];
const BODIES: Lake[] = [...LAKES, ...TARNS];

export const FALLS: Fall[] = [
  // (the ruined weir is breached between two of its piers, two tiles wide and a level deep: in a drought Weir Lake
  // sinks a level through it and the bay at the start drains to the drowned river's ribbon, which a pump at the
  // start still draws; mending the breach, two tiles, is the first reservoir)
  { name: "Low Fall", from: 1, to: 0, face: "S", at: 84, span: [84, 97], notch: [89, 90], piers: [87, 91, 94], crest: 6, foot: 0 },
  { name: "Weir Fall", from: 2, to: 1, face: "W", at: 125, span: [93, 106], notch: [99], piers: [], crest: 10, foot: 2 },
  { name: "Crown Fall", from: 3, to: 2, face: "S", at: 128, span: [143, 156], notch: [149], piers: [], crest: 14, foot: 6 },
  // the Great Fall is built by `greatFall` below (a diagonal lip): this entry keeps its place and its numbers
  { name: "Great Fall", from: -1, to: 1, face: "S", at: 108, span: [78, 87], notch: [], piers: [], crest: 14, foot: 2 },
  // the Low Sill: Low Lake's own, wide and whole (no notch: the bottom lake keeps its water below the sill and
  // loses it only to the sun), into the gorge's pool
  { name: "Low Sill", from: 0, to: -1, face: "S", at: 22, span: [34, 46], notch: [], piers: [], crest: 2, foot: 0 },
];

/** How far the lip of a fall stands back upstream at `u` along its gap: none at the ends, two tiles in the middle. */
function recess(F: Fall, u: number): number {
  if (F.name === "Low Sill" || F.name.startsWith("Great Fall")) return 0;
  const [a, b] = F.span;
  const mid = (a + b) / 2;
  const half = (b - a) / 2 + 0.5;
  const t = (u - mid) / half;
  return Math.max(0, Math.round(2.3 * (1 - t * t) - 0.35));
}

/** The springs' pool at the head of the hanging valley (bed 13): the sources stand in it; three ways out, each
 *  a gate's width: the neck to Crown Lake, the hanging valley to the Great Fall, and the old channel (plugged). */
export const POOL: Sp[] = [[104, 127, 4.5], [108, 131, 4]];
export const POOL_BED = 13;

const HANG_PATH: Pt[] = [[101, 124], [96, 117], [91, 111], [87, 106.5]];
const NECK_PATH: Pt[] = [[111, 133], [120, 139], [132, 145]];
const OLD_PATH: Pt[] = [[101, 133], [98, 142], [104, 156], [120, 170], [140, 181], [165, 184], [183, 175], [187, 152], [187, 130], [186, 106], [179, 88], [171, 70], [161, 55], [143, 40], [126, 30], [112, 20], [104, 10], [104, -1]];
const GORGE_PATH: Pt[] = [[40, 21], [39, 14], [41, 7], [40, -1]];
/** The West Leat: out of the springs' pool by a notch one tile wide, to High Tarn. Everything on the west side
 *  drinks from it, so the gate that shuts it shuts the west side's water. */
const WEST_LEAT: Pt[] = [[99.5, 127.5], [91, 130], [82, 137], [76, 145], [73, 149]];
const HIGH_BROOK: Pt[] = [[57, 146], [52, 138], [47, 129], [43, 121]];
const BIRCH_BROOK: Pt[] = [[37, 101], [34, 91], [33, 80], [30, 68], [28, 58], [27, 53]];
/** Crag Brook: Birch Tarn's second way out, to Hill Tarn under its crag. */
const CRAG_BROOK: Pt[] = [[45, 111], [48, 107], [50, 104]];
/** The Steam Leat: out of Steam Lake's south bay by a notch, to Bench Tarn. */
const STEAM_LEAT: Pt[] = [[150, 86], [151, 80], [150, 75]];
const BENCH_BROOK: Pt[] = [[141, 68], [129, 67], [117, 68], [106, 69], [97, 70]];
const SOUTH_LEAT: Pt[] = [[149, 62], [142, 56], [134, 52]];
/** The North Run: Fell Tarn's own water, west along the rim and off the map. */
/** The Gate Run: Gate Tarn's own water, east along the south ridge and off the map by the south edge. */
const GATE_RUN: Pt[] = [[68, 13], [78, 12], [87, 9], [92, 4], [92, -1]];
const NORTH_RUN: Pt[] = [[87, 179], [72, 178], [56, 180], [40, 176], [24, 172], [8, 168], [-1, 167]];
/** Hill Brook: Hill Tarn down the hill behind the start and across the meadow, an inlet of Low Lake at its end. */
const HILL_BROOK: Pt[] = [[51, 94], [50, 87], [51, 79], [53, 72], [55, 64]];
/** South Brook: South Tarn to Low Lake's south bay. */
const SOUTH_BROOK: Pt[] = [[118, 47], [106, 45], [94, 43], [84, 41], [77, 40]];

/** A brook's bed: from `from` at its head down a level at a time to `to`, which it keeps for its last reach (it
 *  comes to its lake two or three levels over the water and falls in). */
function brookBed(path: Pt[], from: number, to: number): (s: number) => number {
  const len = pathLength(path);
  const steps = from - to;
  return (s: number) => Math.max(to, from - Math.floor((s / len) * (steps + 0.999)));
}

export const CHANNELS: Channel[] = [
  { name: "Hanging valley", path: HANG_PATH, half: () => 2.4, bed: () => 14, bank: 1, bankWide: 3, wet: true, wander: 0, open: 1 },
  { name: "Neck", path: NECK_PATH, half: () => 2.1, bed: () => 14, bank: 1, bankWide: 3, wet: true, wander: 0, open: 1 },
  { name: "Old channel", path: OLD_PATH, half: (s) => (s < 7 ? 4.9 : s < 10 ? 3.6 : 2.6), follow: { start: 14, under: 2.7, end: 1, hold: 7 }, bank: 2, bankWide: 3, wet: false, wander: 2.2, open: 0.8 },
  { name: "Gorge", path: GORGE_PATH, half: (s) => (s < 3 ? 5.6 : s < 13 ? 2.6 : s < 16 ? 3.6 : 4.6), bed: () => 0, bank: 0, bankWide: 0, wet: true, wander: 0, open: 0 },
  { name: "West Leat", path: WEST_LEAT, half: (s) => (s < 3 ? 0.55 : 1.1), bed: () => 14, bank: 0, bankWide: 0, wet: true, wander: 0.8, open: 0, brook: { meadow: 11 } },
  { name: "High Brook", path: HIGH_BROOK, half: () => 1.1, bed: brookBed(HIGH_BROOK, 13, 11), bank: 0, bankWide: 0, wet: true, wander: 4.2, open: 0, brook: { meadow: 12 } },
  { name: "Birch Brook", path: BIRCH_BROOK, half: () => 1.1, bed: brookBed(BIRCH_BROOK, 9, 4), bank: 0, bankWide: 0, wet: true, wander: 4.2, open: 0, brook: { meadow: 13 } },
  { name: "Crag Brook", path: CRAG_BROOK, half: () => 1.1, bed: brookBed(CRAG_BROOK, 9, 9), bank: 0, bankWide: 0, wet: true, wander: 1.0, open: 0, brook: { meadow: 9 } },
  { name: "Hill Brook", path: HILL_BROOK, half: () => 1.1, bed: brookBed(HILL_BROOK, 7, 4), bank: 0, bankWide: 0, wet: true, wander: 3.2, open: 0, brook: { meadow: 11 } },
  { name: "Steam Leat", path: STEAM_LEAT, half: (s) => (s < 2.5 ? 1.7 : 1.1), bed: brookBed(STEAM_LEAT, 10, 10), bank: 0, bankWide: 0, wet: true, wander: 0.8, open: 0, brook: { meadow: 10 } },
  { name: "Bench Brook", path: BENCH_BROOK, half: () => 1.1, bed: brookBed(BENCH_BROOK, 8, 4), bank: 0, bankWide: 0, wet: true, wander: 4.2, open: 0, brook: { meadow: 13 } },
  { name: "South Leat", path: SOUTH_LEAT, half: () => 1.1, bed: brookBed(SOUTH_LEAT, 8, 8), bank: 0, bankWide: 0, wet: true, wander: 1.0, open: 0, brook: { meadow: 10 } },
  { name: "South Brook", path: SOUTH_BROOK, half: () => 1.1, bed: brookBed(SOUTH_BROOK, 6, 4), bank: 0, bankWide: 0, wet: true, wander: 4.2, open: 0, brook: { meadow: 13 } },
  { name: "North Run", path: NORTH_RUN, half: () => 1.1, bed: brookBed(NORTH_RUN, 15, 9), bank: 0, bankWide: 0, wet: true, wander: 4.2, open: 0, brook: { meadow: 16 } },
  { name: "Gate Run", path: GATE_RUN, half: () => 1.1, bed: brookBed(GATE_RUN, 10, 6), bank: 0, bankWide: 0, wet: true, wander: 2.2, open: 0, brook: { meadow: 14 } },
];
// The kettles: the two closed hollows by the springs that the game fills from the top water (r9's 16 and 4 stray
// tiles), made deliberate: each a pond a level under the top water's bed, joined to it by a neck one tile wide below
// the gate's place, so the gate that shuts the hanging valley or the neck shuts its pond too.
CHANNELS.push(
  { name: "Valley Kettle", path: [[96.3, 120.0], [94.6, 121.0], [91.3, 122.0]], half: (s) => (s < 2.6 ? 0.6 : 2.6), bed: (s) => (s < 2.6 ? 14 : 13), bank: 0, bankWide: 0, wet: true, wander: 0, open: 0 },
  { name: "Neck Kettle", path: [[129.6, 144.4], [129.2, 146.8], [128.6, 149.6]], half: (s) => (s < 2.8 ? 0.6 : 2.1), bed: (s) => (s < 2.8 ? 14 : 13), bank: 0, bankWide: 0, wet: true, wander: 0, open: 0 },
);
const chan = (name: string) => CHANNELS.findIndex((c) => c.name === name);

/** The cliff behind Weir Lake that the Great Fall comes over: north of this line the land is the upper world. */
const WALL: Pt[] = [[40, 97], [58, 100], [66, 104], [73, 108], [78, 108], [87, 99], [93, 99.5], [98, 107], [103, 113], [112, 115], [120, 111], [128, 106], [150, 104]];
function greatWall(x: number): number {
  if (x <= WALL[0][0]) return WALL[0][1];
  for (let k = 0; k + 1 < WALL.length; k++) {
    const [x0, y0] = WALL[k];
    const [x1, y1] = WALL[k + 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return WALL[WALL.length - 1][1];
}

const SEED = 4107;
/** The drowned river through the Great Fall's bay: from the fall's foot round the start to the breach in the weir. */
const BAY_RIVER: Pt[] = [[83.5, 100.5], [84.5, 96.5], [87.5, 92.5], [90, 90.3], [89.9, 87.6]];
/** The Great Fall's lip: ten tiles on a diagonal from (78, 108) south-east to (87, 99), a face 14 tiles long that
 *  looks south-west. The game's first camera on this start looks 35 degrees east of north, and its sun rides
 *  40 degrees clockwise of that: a south-west face is square to the camera (its whole length within two and a half
 *  tiles of depth, so the lip stays inside the frame) and takes the light at 0.61 (a south face: 0.18). */
export const GREAT_LIP: Pt[] = Array.from({ length: 10 }, (_, k) => [78 + k, 108 - k] as Pt);
/** The start's middle tile: nine tiles in front of the Great Fall's lip, so the curtain fills the upper middle of the
 *  game's first camera (Cw0: it looks 35 degrees east of north). */
export const START_AT: Pt = [80, 101];

/** How far the land has risen `t` tiles beyond a meadow's edge: a crag (`c1` levels in a tile), a bench `w1` wide
 *  that climbs a level, a second crag (`c2`), then a slope. Where `c1` is 1 the crag is a plain step: a way up. */
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
  /** 1 + the body's index where a tile is lake or tarn bed (the sill's crest and notch included), else 0: 1–4 the
   *  four lakes, 5 and up the tarns. */
  lake: Uint8Array;
  /** 1 + the channel's index on a channel's bed. */
  channel: Uint8Array;
  /** The pool's tiles. */
  pool: Uint8Array;
  /** Crest tiles of each fall (in FALLS order). */
  crests: number[][];
  /** Each follow channel's bed along it, every 2 tiles (for the log). */
  beds: Record<string, number[]>;
  /** Each plug's tiles: a row across the old channel. */
  plugs: number[][];
  /** Tiles the guard raised to keep the water in (a count, for the log). */
  guarded: number;
  /** Where the player's gates go when the old channel is opened: the neck's and the hanging valley's first rows. */
  gates: number[][];
  /** Each brook's first row (a dam there shuts the brook). */
  brookHeads: number[][];
}

/** A ridge: rock along a line, `top` high within `half` tiles of it, falling `fall` a tile beyond. */
interface Ridge {
  path: Pt[];
  top: number;
  half: number;
  /** Its one ledge: this far below the crest, this wide. Beyond it the land lies as it is: a crag, never a stair
   *  (a slope of a level a tile is a row of treads in the game). */
  drop: number;
  ledge: number;
  /** How far its crest goes up and down. */
  rough: number;
}

const RIDGES: Ridge[] = [
  // the Gate: the ridge that closes the valley below Low Lake; the gorge is cut through it
  { path: [[6, 40], [20, 22], [40, 13], [60, 10], [84, 12]], top: 10.6, half: 5, drop: 3, ledge: 3, rough: 1.1 },
  // the Crown: the skyline behind the top lake (the one place over level 16: a ridge has to stand over its lake)
  { path: [[110, 162], [124, 171], [146, 176], [166, 175], [178, 165], [181, 146], [179, 128]], top: 19.2, half: 2.2, drop: 3, ledge: 2.6, rough: 1.8 },
  // spurs that close the valley at each fall
  // the crag over Hill Tarn
  { path: [[56, 104], [59, 101]], top: 11.6, half: 1.4, drop: 2, ledge: 1.4, rough: 0.5 },
  { path: [[98, 86], [105, 84], [113, 80]], top: 8.2, half: 2.3, drop: 2, ledge: 1.6, rough: 0.9 },
  { path: [[127, 92], [130, 86], [136, 80]], top: 12.2, half: 2.3, drop: 2, ledge: 1.6, rough: 0.9 },
  { path: [[127, 107], [129, 113], [130, 120]], top: 12.2, half: 2.3, drop: 2, ledge: 1.6, rough: 0.9 },
  { path: [[142, 130], [135, 131], [127, 129]], top: 16, half: 2.3, drop: 2, ledge: 1.6, rough: 0.7 },
  { path: [[157, 130], [164, 132], [172, 131]], top: 16, half: 2.3, drop: 2, ledge: 1.6, rough: 0.7 },
];
/** The highest land: 16 everywhere but the Crown. */
const CROWN_TOP = 21;

export function designLand(): Land {
  const f = new Float64Array(N);
  const lake = new Uint8Array(N);
  const channel = new Uint8Array(N);
  const pool = new Uint8Array(N);
  const g: Float64Array[] = BODIES.map(() => new Float64Array(N));

  // what the outlands follow: each place's level in the stair (the lakes' sills, weighted by nearness)
  const anchors: [number, number, number][] = [];
  for (const L of BODIES) for (const arm of L.arms) for (const p of arm) anchors.push([p[0], p[1], L.sill]);
  anchors.push([106, 129, 14], [40, 8, 1], [120, 165, 14], [158, 178, 14], [185, 150, 13], [100, 150, 14]);

  // the channels' courses (they wander a little), read once
  const along: { d: number; s: number }[][] = CHANNELS.map((c) => {
    const out: { d: number; s: number }[] = new Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) out[y * W + x] = pathDist(x + 0.5 + c.wander * fbm(x, y, 14, SEED + 60, 2), y + 0.5 + c.wander * fbm(x, y, 14, SEED + 61, 2), c.path);
    return out;
  });
  const brooks = CHANNELS.map((c, k) => (c.brook ? k : -1)).filter((k) => k >= 0);
  const topWater = [chan("Hanging valley"), chan("Neck")];

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // a wandering of the whole picture, so no contour follows a ruler or a compass
      const wx = x + 0.5 + 7 * fbm(x, y, 36, SEED + 11, 3);
      const wy = y + 0.5 + 7 * fbm(x, y, 36, SEED + 12, 3);
      const wob = fbm(x, y, 16, SEED + 3, 3);
      // every water near this tile: its level, how far, how wide its meadow
      const el: { level: number; d: number; meadow: number; rim: number }[] = [];
      let near = Infinity;
      for (let k = 0; k < BODIES.length; k++) {
        const L = BODIES[k];
        let d = Infinity;
        let dw = Infinity;
        for (const arm of L.arms) {
          d = Math.min(d, spineDist(x + 0.5, y + 0.5, arm));
          dw = Math.min(dw, spineDist(wx, wy, arm));
        }
        // (the outline itself wanders little: the lake's shape is the design's; the land round it wanders freely)
        const own = d + L.wander * wob * Math.min(1, Math.max(0.15, (d + 14) / 14));
        g[k][i] = own < 6 ? own : Math.max(6, dw + L.wander * wob);
        el.push({ level: L.sill, d: g[k][i], meadow: L.meadow, rim: 3.2 });
        if (own < near) near = own;
      }
      for (const k of brooks) {
        const { d, s } = along[k][i];
        const c = CHANNELS[k];
        const dd = d - c.half(s);
        el.push({ level: c.bed!(s), d: dd, meadow: c.brook!.meadow, rim: 2.6 });
        if (dd < near) near = dd;
      }
      let hv = spineDist(x + 0.5, y + 0.5, POOL);
      for (const k of topWater) hv = Math.min(hv, along[k][i].d - CHANNELS[k].half(along[k][i].s));
      el.push({ level: 14, d: hv, meadow: 9, rim: 2.6 });
      if (hv < near) near = hv;

      // the outlands: a little over the stair near the valley, falling away far from it
      let sw = 0;
      let sv = 0;
      for (const [ax, ay, lv] of anchors) {
        const d2 = (x - ax) * (x - ax) + (y - ay) * (y - ay) + 60;
        const w = 1 / (d2 * d2);
        sw += w;
        sv += w * lv;
      }
      const stair = sv / sw;
      const far = Math.max(0, near - 30);
      const lift = 3.4 * Math.max(0, 1 - stair / 10);
      let out = stair + 4.6 + lift - 0.3 * Math.max(0, stair - 8) + 2.6 * fbm(x, y, 46, SEED + 1, 4) + 1.0 * fbm(x, y, 13, SEED + 2, 3) - 0.06 * far;
      if (out > TOP) out = TOP;
      if (out < 5) out = 5 + 0.6 * fbm(x, y, 9, SEED + 14, 2);
      // behind the Great Fall's cliff the land is the upper world: the two lower lakes dig nothing there
      const upper = y >= greatWall(x) + (x > 74 && x < 96 ? 0 : 1.3 * fbm(x, y, 9, SEED + 9, 2));
      // (its floor fades to the west and the east, where the cliff dies into the hillside)
      const upperFloor = 13.2 + 0.9 * fbm(x, y, 10, SEED + 15, 2) - 0.32 * Math.max(0, 70 - x) - 0.3 * Math.max(0, x - 124);
      if (upper && out < upperFloor) out = upperFloor;

      // the lower envelope of every water's bowl, a higher water's rim kept from the waters below it
      let top = -Infinity;
      for (const e of el) if (e.d < e.rim && e.level > top) top = e.level;
      const warpA = fbm(x, y, 34, SEED + 4, 3);
      const warpB = fbm(x, y, 19, SEED + 5, 3);
      const cragN = fbm(x, y, 31, SEED + 16, 2);
      const benchN = fbm(x, y, 27, SEED + 17, 2);
      const c1 = Math.max(1, Math.min(4, Math.round(2.4 + 3.2 * cragN)));
      const c2 = Math.max(1, Math.min(3, Math.round(1.9 + 2.4 * fbm(x, y, 24, SEED + 18, 2))));
      const w1 = 10 + 6 * benchN;
      const meadowN = fbm(x, y, 27, SEED + 6, 2);
      let land = out;
      for (const e of el) {
        if (e.level < top) continue;
        // (the meadow is measured true from the shore: water reaches 16 tiles over level ground and stops at the
        // first step up; the hillside behind it wanders)
        const meadow = e.meadow + 3 * meadowN;
        const hill = Math.max(0, e.d - meadow);
        const dw = hill * (1 + 0.3 * warpA) + 5 * warpB * Math.min(1, hill / 6);
        let v = e.level + 1 + rise(Math.max(0, dw), c1, w1, c2);
        if (upper && e.level < 10 && v < upperFloor) v = upperFloor;
        if (v < land) land = v;
      }
      // the high ground rolls a little; the meadows keep a few knolls (the water still reaches a level up, 9 tiles)
      land += 0.7 * fbm(x, y, 21, SEED + 7, 3) * Math.min(1, Math.max(0, (near - 18) / 6));
      const scarp = Math.max(-1, Math.min(1, fbm(x, y, 44, SEED + 19, 2) * 60));
      land += 1.3 * scarp * Math.min(1, Math.max(0, (near - 22) / 5));
      const scarp2 = Math.max(-1, Math.min(1, fbm(x, y, 26, SEED + 23, 2) * 60));
      land += 1.0 * scarp2 * Math.min(1, Math.max(0, (near - 19) / 4));
      if (near > 21) land = fbm(x, y, 50, SEED + 24, 2) > -0.25 ? Math.round(land / 3) * 3 : Math.round(land / 2) * 2;
      if (near > 4 && near < 9 && fbm(x, y, 9, SEED + 22, 2) > 0.42) land += 1;
      for (const r of RIDGES) {
        const { d } = pathDist(x + 0.5, y + 0.5, r.path);
        const t = d - r.half + 0.9 * fbm(x, y, 6, SEED + 70, 2);
        const crest = r.top + r.rough * fbm(x, y, 9, SEED + 18, 2);
        const v = t <= 0 ? crest : t <= r.ledge ? crest - r.drop : -Infinity;
        if (v > land && near > 2.5) land = v;
      }
      const cap = RIDGES[1] && pathDist(x + 0.5, y + 0.5, RIDGES[1].path).d < 9 ? CROWN_TOP : TOP;
      if (land > cap) land = cap;
      f[i] = land;
    }

  // the start's bench: level 7, on Weir Lake's shore, the Great Fall's basin at its door
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, [[60, 93, 7], [68, 94, 9], [75, 94, 6]]) + 2.2 * fbm(x, y, 13, SEED + 20, 2);
      if (d < 0 && g[1][i] > 0 && y < greatWall(x) - 2) f[i] = 7;
      if (g[1][i] > 0 && x >= 54 && x <= 86 && y >= 89 + 2 * fbm(x, y, 10, SEED + 26, 2) && y < greatWall(x) && f[i] < 7) f[i] = 7;
    }

  const beds: Record<string, number[]> = {};
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
      if (b * 2 >= (fo.hold ?? 0) && want < run) run = Math.max(want, run - 4);
      table.push(Math.max(fo.end, run));
    }
    beds[c.name] = table;
    return (s: number) => table[Math.min(table.length - 1, Math.max(0, Math.floor(s / 2)))];
  });
  // banks first (a raise), then the bed (a carve)
  CHANNELS.forEach((c, k) => {
    if (!c.bank) return;
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const half = c.half(s);
      if (d > half + c.bankWide) continue;
      const need = bedOf[k](s) + c.bank - Math.max(0, d - half - 1.2) * 0.9;
      if (c.name.startsWith("Hanging valley") && Math.floor(i / W) < greatWall(i % W)) continue;
      if (f[i] < need) f[i] = Math.min(TOP, need);
    }
  });
  // the springs' rim: a level over the pool, as the land round it is
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      if (d < 5 && f[i] < 15) f[i] = 15;
    }
  CHANNELS.forEach((c, k) => {
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const x = i % W;
      const y = (i - x) / W;
      const half = c.half(s) + (c.wander && !c.brook ? 0.9 * fbm(x, y, 9, SEED + 30 + k, 2) : 0) + (c.brook && c.wander > 1.5 ? 0.3 + 2.4 * Math.max(0, fbm(x, y, 13, SEED + 30 + k, 2) + 0.12) + (s > pathLength(c.path) - 5 ? 1.5 : 0) : 0);
      const b = bedOf[k](s);
      if (d <= half) {
        if (c.wet && channel[i] && CHANNELS[channel[i] - 1].wet && f[i] <= b) continue; // (a wet channel keeps the lower bed where two meet)
        f[i] = b;
        channel[i] = k + 1;
      } else if (c.open > 0) {
        // banks open out (the gorge keeps its walls); a wet channel's first ring stays a level over its bed
        // (a dry channel is a wadi: a strip a level over its bed, ragged, then its walls as the land stands)
        const t = d - half;
        const v = c.wet ? b + t * c.open + 1.5 : t < 1.7 + 1.3 * fbm(x, y, 7, SEED + 71, 2) ? b + 1 : Infinity;
        if (v < f[i]) f[i] = v;
      }
    }
  });
  // the pool's bed
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      if (d < 0) {
        f[i] = d < -1.5 ? POOL_BED : 14;
        pool[i] = 1;
        channel[i] = 0;
      }
    }

  // quantise the land
  const h = new Uint8Array(N);
  for (let i = 0; i < N; i++) h[i] = Math.max(0, Math.min(CROWN_TOP, Math.round(f[i])));

  // lake beds: a shelf at the sill's level, then down toward the lake's middle
  for (let k = 0; k < BODIES.length; k++) {
    const L = BODIES[k];
    for (let i = 0; i < N; i++) {
      const d = g[k][i];
      if (d >= 0) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (k === 1 && y >= greatWall(x) - 0.5) continue; // Weir Lake stops at the Great Fall's cliff
      let isle = Infinity;
      for (const s of L.islands ?? []) isle = Math.min(isle, Math.hypot((x + 0.5 - s[0]) * 0.7 + (y + 0.5 - s[1]) * 0.35, (y + 0.5 - s[1]) * 0.95 - (x + 0.5 - s[0]) * 0.3) - s[2] + 2.6 * fbm(x, y, 7, SEED + 45, 2));
      if (isle < 0) {
        h[i] = L.sill + 1;
        channel[i] = 0;
        continue;
      }
      // (how far from the old river's line: the lake's main arm and the arms to its falls)
      let line = Infinity;
      for (let a = 0; a < L.arms.length && a < 4; a++) line = Math.min(line, pathDist(x + 0.5 + 2.5 * fbm(x, y, 12, SEED + 47, 2), y + 0.5 + 2.5 * fbm(x, y, 12, SEED + 48, 2), L.arms[a].map((q) => [q[0], q[1]] as Pt)).d);
      const shore = Math.max(0, Math.floor((Math.min(-d, isle) - 1.0) / 1.5));
      const channelDepth = L.deep > 2 ? (line < 2.6 ? 5 : line < 4.8 ? 3 : 1) : line < 4.5 ? 2 : 1;
      // (a shelf at the sill's level, a shallow margin, then the drop into the channel: drop-offs, not rings)
      let depth = Math.min(L.deep, shore === 0 ? 0 : shore === 1 ? (L.deep > 2 ? Math.min(2, channelDepth) : 1) : channelDepth);
      if (k >= LAKES.length) depth = Math.min(L.deep, Math.max(0, Math.floor((Math.min(-d, isle) - 0.6) / 2.4 + 1.5 * fbm(x + 3 * k, y - 5 * k, 5, SEED + 46, 2) + 0.2)));
      // (the cove's head has a cut bank: deep water right at the meadow, so a pump there works through a drought)
      if (k === 0 && Math.hypot(x + 0.5 - 69, y + 0.5 - 74) < 5.5) depth = 2;
      // (the Great Fall's bay, all of Weir Lake that the game's first frame holds: shallow. In the game water five
      // deep is near black (luminance 18 of 255 in the r9 capture), water under half a level deep is the lightest
      // there is (65); the drowned river's line keeps a level and a half of water through the bay, which a pump at
      // the start still draws at the end of a Normal drought; the deep water begins east of the frame)
      // (the drowned river's line is two deep: with the weir's breach open it is what a drought leaves at the start)
      if (k === 1 && x < 102) {
        const river = pathDist(x + 0.5 + 0.8 * fbm(x, y, 6, SEED + 49, 2), y + 0.5 + 0.8 * fbm(x, y, 6, SEED + 50, 2), BAY_RIVER).d;
        depth = river < 1.15 ? 2 : Math.min(depth, x < 97 ? 1 : x < 99 ? 2 : x < 101 ? 3 : 4);
      }
      h[i] = L.sill - depth;
      lake[i] = k + 1;
      channel[i] = 0;
    }
  }

  // the falls: the gap between two shoulders, the crest (a horseshoe), the notch, the drop
  const crests: number[][] = [];
  for (const F of FALLS) {
    if (F.name === "Great Fall") {
      crests.push(greatFall(h, lake, channel));
      continue;
    }
    const tiles: number[] = [];
    const [a, b] = F.span;
    const mid = (a + b) / 2;
    const crest = F.crest;
    const at = (u: number, v: number): number => {
      // u along the crest, v across it (v > 0: upstream)
      const x = F.face === "S" ? u : F.at + v;
      const y = F.face === "S" ? F.at + v : u;
      return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    };
    const up = F.from >= 0 ? F.from + 1 : 0;
    // the shoulders: two knobs of rock beside the gap, three and four over the crest, upstream of the lip only
    for (let u = a - 9; u <= b + 9; u++)
      for (let v = 0; v <= 7; v++) {
        const i = at(u, v);
        if (i < 0 || (u >= a && u <= b) || !up) continue;
        // (the cliff's line steps back upstream away from the gap, unevenly: no ruler-straight lip)
        const away = u < a ? a - u : u - b;
        const back = away <= 2 ? 0 : Math.max(0, Math.round(0.3 * (away - 2) + 1.3 * fbm(u * 3.1, F.at * 1.7, 4, SEED + 51, 2)));
        if (v < back) continue;
        const x = i % W;
        const y = (i - x) / W;
        const side = u < a ? a - 3.2 : b + 3.2;
        const dist = Math.hypot(u - side, (v - 1.2) * 1.25);
        const tier = dist + 0.9 * fbm(x, y, 5, SEED + 50, 2);
        const want = tier < 5.8 ? crest + 2 : -99;
        // (the two tiles beside the gap are rock whatever the lake's outline says: the gap is exactly its span)
        if (lake[i] && (away > 2 || v > 2)) continue;
        const rock = away <= 2 && v <= 2;
        const level = Math.min(TOP, Math.round(rock ? Math.max(want, crest + 3) : want));
        if (level > h[i] || (lake[i] && rock)) {
          h[i] = level;
          lake[i] = 0;
          channel[i] = 0;
        }
      }
    for (let u = a; u <= b; u++) {
      const notch = F.notch.includes(u);
      const pier = F.piers.includes(u);
      const r = recess(F, u);
      // below the lip, inside the horseshoe: the plunge pool's own water
      for (let v = 0; v < r; v++) {
        const i = at(u, v);
        h[i] = F.foot;
        lake[i] = F.to + 1;
        channel[i] = F.to < 0 ? chan("Gorge") + 1 : 0;
      }
      // the crest, two tiles thick; behind it the bed leads up to it
      for (let v = r; v <= r + 1; v++) {
        const i = at(u, v);
        h[i] = pier ? crest + 1 : notch ? crest - 1 : crest;
        lake[i] = up;
        if (up) channel[i] = 0;
        else channel[i] = chan("Hanging valley") + 1;
        if (v === r) tiles.push(i);
      }
      for (let v = r + 2; v <= r + 5; v++) {
        const i = at(u, v);
        if (!up) continue;
        if (h[i] > crest - 1) h[i] = crest - 1;
        lake[i] = up;
        channel[i] = 0;
      }
    }
    // the drop: the lower lake's plunge pool at the cliff's foot, rounded
    for (let u = a - 3; u <= b + 3; u++)
      for (let v = -1; v >= -7; v--) {
        const i = at(u, v);
        if (i < 0) continue;
        const e = Math.hypot((u - mid) / ((b - a) / 2 + 1.8), (v + 1) / 6.2);
        if (e > 1) continue;
        const inGap = u >= a && u <= b;
        if (!inGap && v === -1) continue;
        const cw = channel[i] ? CHANNELS[channel[i] - 1] : null;
        if (cw && cw.wet && !cw.brook && cw.name !== "Gorge") continue;
        const bedHere = F.foot + (e > 0.72 && F.to >= 0 ? 1 : 0);
        if (!lake[i] || h[i] > bedHere) h[i] = bedHere;
        lake[i] = F.to + 1;
        channel[i] = F.to < 0 ? chan("Gorge") + 1 : 0;
      }
    crests.push(tiles);
  }

  for (let y = START_AT[1] - 2; y <= START_AT[1] + 2; y++)
    for (let x = START_AT[0] - 2; x <= START_AT[0] + 2; x++) {
      const i = y * W + x;
      const own = Math.abs(x - START_AT[0]) <= 1 && Math.abs(y - START_AT[1]) <= 1;
      if (!own && GREAT_POOL.has(i)) continue;
      h[i] = 7;
      lake[i] = 0;
      channel[i] = 0;
    }

  tidy(h, lake, channel, pool);

  // the plugs: a row of the old channel's tiles, across it
  const plugs: number[][] = [];
  {
    const k = chan("Old channel");
    for (const s0 of PLUGS) {
      const row: number[] = [];
      for (let i = 0; i < N; i++) if (channel[i] === k + 1 && along[k][i].s >= s0 && along[k][i].s < s0 + 1.45) row.push(i);
      plugs.push(row);
    }
  }

  // the guard: every tile beside the water that would let it out stands a level over it. The ways out are the
  // falls' lips, the gorge, and the old channel's mouth under its plug.
  let guarded = 0;
  {
    // the level a wet tile's neighbours must reach: a lake's sill + 1; the top water's 15; a brook's own bed + 1
    const need = new Int8Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (lake[i]) need[i] = BODIES[lake[i] - 1].sill + 1;
      const c = channel[i];
      if (pool[i]) need[i] = 15;
      else if (c && CHANNELS[c - 1].wet && CHANNELS[c - 1].name !== "Gorge") need[i] = CHANNELS[c - 1].brook ? h[i] + 1 : 15;
    }
    const exit = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const c = channel[i];
      if (c && (CHANNELS[c - 1].name === "Gorge" || (CHANNELS[c - 1].name === "Old channel" && along[c - 1][i].s < 8))) exit[i] = 1;
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
  const rowAt = (name: string, s0: number, s1: number): number[] => {
    const k = chan(name);
    const row: number[] = [];
    for (let i = 0; i < N; i++) if (channel[i] === k + 1 && along[k][i].s >= s0 && along[k][i].s < s1) row.push(i);
    return row;
  };
  const gates = [rowAt("Neck", 3, 5), rowAt("Hanging valley", 3, 5), rowAt("West Leat", 0.4, 2.6)];
  const brookHeads = CHANNELS.filter((c) => c.brook).map((c) => rowAt(c.name, 1, 2.6));
  return { heights: h, lake, channel, pool, crests, beds, plugs, guarded, gates, brookHeads };
}

/** The trench's beds: its foot row and its outer row. */
const TRENCH: [number, number] = (process.env.FL_TRENCH ?? "6,5").split(",").map(Number) as [number, number];
/** The tiles of the Great Fall's own pool (the start's pad leaves them). */
const GREAT_POOL = new Set<number>();

/** The Great Fall: the lip's ten tiles and the row behind them at the hanging valley's bed (14), three more rows of
 *  bed behind those; in front, a shelf two tiles wide under shallow water (each lip tile pours over its south and
 *  its west side). */
function greatFall(h: Uint8Array, lake: Uint8Array, channel: Uint8Array): number[] {
  const hv = chan("Hanging valley") + 1;
  const tiles: number[] = [];
  for (const [x, y] of GREAT_LIP) {
    // the valley's bed behind the lip: toward the north-east
    for (let d = 0; d <= 4; d++)
      for (let e = 0; e <= d; e++) {
        const i = (y + e) * W + x + (d - e);
        h[i] = 14;
        lake[i] = 0;
        channel[i] = hv;
      }
    tiles.push(y * W + x);
  }
  for (const [x, y] of GREAT_LIP)
    for (let a = 0; a <= 2; a++)
      for (let b = 0; a + b <= 2; b++) {
        if (a + b === 0) continue;
        const i = (y - b) * W + x - a;
        if (channel[i] === hv) continue;
        // (the foot is a shelf at the sill's level where the water lands, a level deeper beside it: light water)
        // (west of the start the shelf is a trench between the cliff and the bench: it carries half the fall's water
        // out past the start's corner, so its outer row is deep; r10a's two shallow rows put the water on the bench)
        const k = x - 78;
        h[i] = k <= 5 ? (a + b === 1 ? TRENCH[0] : TRENCH[1]) : a + b === 1 ? 6 : 5;
        lake[i] = 2;
        channel[i] = 0;
        GREAT_POOL.add(i);
      }
  // the throat: the one way out of the trench, round the start's corner, is a tile wide; it is deep (the start's
  // building stands between it and the first camera)
  for (const [x, y] of THROAT) if (GREAT_POOL.has(y * W + x)) h[y * W + x] = Number(process.env.FL_THROAT ?? 3);
  return tiles;
}
const THROAT: Pt[] = [[81, 103], [82, 103], [82, 102], [83, 102], [83, 101]];

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

// --------------------------------------------------------------------------------------------- measures

export interface LandMeasures {
  flat8: number;
  flat4: number;
  step1: number;
  top3: number;
  histogram: number[];
  maxStep: number;
}

export function measureLand(h: Uint8Array): LandMeasures {
  let flat8 = 0;
  let flat4 = 0;
  let steps = 0;
  let steps1 = 0;
  let maxStep = 0;
  const hist = new Array(24).fill(0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      hist[v]++;
      let f8 = true;
      let f4 = true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const yy = Math.min(H - 1, Math.max(0, y + dy));
          if (h[yy * W + xx] !== v) {
            f8 = false;
            if (!dx || !dy) f4 = false;
          }
        }
      if (f8) flat8++;
      if (f4) flat4++;
      if (x + 1 < W) {
        const d = Math.abs(h[i + 1] - v);
        if (d) {
          steps++;
          if (d === 1) steps1++;
          if (d > maxStep) maxStep = d;
        }
      }
      if (y + 1 < H) {
        const d = Math.abs(h[i + W] - v);
        if (d) {
          steps++;
          if (d === 1) steps1++;
          if (d > maxStep) maxStep = d;
        }
      }
    }
  const sorted = hist.slice().sort((a, b) => b - a);
  return { flat8: flat8 / N, flat4: flat4 / N, step1: steps ? steps1 / steps : 0, top3: (sorted[0] + sorted[1] + sorted[2]) / N, histogram: hist, maxStep };
}

/** Still water on the design: each lake filled to a little over its sill, the pool and the wet channels with it:
 *  a picture's water before the real settle, never the map's. */
export function sketchWater(land: Land): Float64Array {
  const d = new Float64Array(N);
  const h = land.heights;
  for (let i = 0; i < N; i++) {
    const k = land.lake[i];
    if (k) {
      const top = BODIES[k - 1].sill + 0.3;
      if (h[i] < top) d[i] = top - h[i];
    }
    if (land.pool[i]) d[i] = Math.max(0, 14.5 - h[i]);
    const c = land.channel[i];
    if (c && CHANNELS[c - 1].wet) d[i] = 0.3;
  }
  return d;
}
