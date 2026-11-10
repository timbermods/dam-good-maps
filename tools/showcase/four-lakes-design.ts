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
  /** Islands: land inside the outline, a level or two over the water. */
  islands?: Sp[];
}

/** A fall over a sill: the water of `from` goes over crest tiles (level = the lake's sill) and drops to `to`.
 *  `face`: the way the water falls. `at`: the crest's row (S) or column (W). `span`: the gap between the rock
 *  shoulders, inclusive. `notch`: crest tiles one level lower, where the lake drains in a drought. `piers`: tiles
 *  of the gap that stand one level over the crest (a ruined weir's piers). */
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
  /** A brook: it meanders widely and opens into small pools. */
  brook?: boolean;
}

/** A plug in the old channel: a row of Blockages across it, `at` tiles along it. */
export const PLUGS = [2.2, 160, 244];

export const LAKES: Lake[] = [
  {
    name: "Low Lake",
    sill: 2,
    arms: [
      [[40, 36, 12], [52, 46, 17], [66, 56, 15], [76, 64, 11]],
      [[76, 64, 10], [85, 72, 8], [88.5, 79, 6.5]],
      [[42, 36, 10], [40, 29, 8.5], [40, 26, 7.5]],
      [[40, 44, 9], [27, 50, 6]],
      // the start's cove: deep water at the meadow's edge
      [[72, 64, 9], [71, 74, 6], [70, 80, 4.5]],
    ],
    wander: 4,
    deep: 2,
    seed: [60, 54],
    islands: [[50, 45, 5.2], [66, 54, 3]],
  },
  {
    name: "Weir Lake",
    sill: 6,
    arms: [
      [[92, 97, 10], [104, 99, 15], [116, 100, 11]],
      [[100, 104, 11], [100, 113, 10]],
      [[92, 97, 7], [88.5, 91, 5.5]],
      [[116, 100, 8], [121, 100, 5]],
    ],
    wander: 3,
    deep: 3,
    seed: [104, 100],
  },
  {
    name: "Steam Lake",
    sill: 10,
    arms: [
      [[139, 104, 12], [153, 108, 15], [163, 99, 12]],
      [[139, 104, 8], [131, 100, 5]],
      [[150, 112, 9], [150, 122, 6]],
      [[163, 99, 9], [170, 108, 6]],
    ],
    wander: 3,
    deep: 3,
    seed: [150, 108],
    islands: [[157, 103, 2.6]],
  },
  {
    name: "Crown Lake",
    sill: 14,
    arms: [
      [[141, 144, 10], [154, 150, 14], [151, 160, 10]],
      [[150, 141, 8], [150, 133, 5]],
      [[160, 156, 8], [166, 160, 5]],
    ],
    wander: 2.5,
    deep: 3,
    seed: [153, 150],
    islands: [[156, 152, 2.2]],
  },
];

export const FALLS: Fall[] = [
  { name: "Low Fall", from: 1, to: 0, face: "S", at: 85, span: [84, 93], notch: [88], piers: [86, 90], crest: 6, foot: 0 },
  { name: "Weir Fall", from: 2, to: 1, face: "W", at: 125, span: [96, 103], notch: [100], piers: [], crest: 10, foot: 3 },
  { name: "Crown Fall", from: 3, to: 2, face: "S", at: 128, span: [146, 153], notch: [150], piers: [], crest: 14, foot: 7 },
  { name: "Great Fall", from: -1, to: 1, face: "S", at: 118, span: [96, 104], notch: [], piers: [], crest: 14, foot: 3 },
  // the Low Sill: Low Lake's own, wide and whole (no notch: the bottom lake keeps its water below the sill and
  // loses it only to the sun), into the gorge's pool
  { name: "Low Sill", from: 0, to: -1, face: "S", at: 22, span: [34, 46], notch: [], piers: [], crest: 2, foot: 0 },
];

/** The springs' pool at the head of the hanging valley (bed 13): the sources stand in it; three ways out, each
 *  a gate's width: the neck to Crown Lake, the hanging valley to the Great Fall, and the old channel (plugged). */
export const POOL: Sp[] = [[119, 141, 5], [123, 145, 4.5]];
export const POOL_BED = 13;

const HANG_PATH: Pt[] = [[116, 138], [109, 131], [103, 125], [100, 118]];
const HANG_LEN = pathLength(HANG_PATH);
const NECK_PATH: Pt[] = [[126, 146], [130, 146], [134, 146]];
const OLD_PATH: Pt[] = [[120, 148], [121, 158], [132, 172], [150, 182], [168, 182], [181, 172], [185, 152], [185, 132], [184, 106], [178, 88], [162, 75], [144, 66], [126, 56], [112, 44], [106, 30], [104, 14], [104, -1]];
const GORGE_PATH: Pt[] = [[40, 21], [39, 14], [41, 7], [40, -1]];
/** Meadow Brook: out of the hanging valley's west bank, along the bench over the Great Fall's cliff, down the
 *  hillside behind the start and across the meadow into Low Lake. It waters the west side of the valley. */
const MEADOW_BROOK: Pt[] = [[106.5, 131.5], [96, 130], [84, 131], [72, 128], [62, 120], [54, 110], [46, 100], [38, 90], [32, 78], [28, 66], [27, 56], [28, 51]];
/** Bench Brook: out of Steam Lake's south shore, along the bench under Weir Lake and into Low Lake's north-east arm. */
const BENCH_BROOK: Pt[] = [[146, 95], [143, 88], [134, 81], [122, 76], [110, 72], [100, 70], [91, 70]];

export const CHANNELS: Channel[] = [
  { name: "Hanging valley", path: HANG_PATH, half: (s) => (s > HANG_LEN - 9 ? 4.6 : s > HANG_LEN - 18 ? 3.1 : 2.1), bed: () => 14, bank: 2, bankWide: 3, wet: true, wander: 1.5, open: 1 },
  { name: "Neck", path: NECK_PATH, half: () => 1.6, bed: () => 14, bank: 2, bankWide: 3, wet: true, wander: 0, open: 1 },
  { name: "Old channel", path: OLD_PATH, half: (s) => (s < 9 ? 1.3 : 2.1), follow: { start: 15, under: 2.7, end: 1, hold: 6 }, bank: 2, bankWide: 3, wet: false, wander: 2.2, open: 0.8 },
  { name: "Gorge", path: GORGE_PATH, half: (s) => (s < 3 ? 5.6 : s < 13 ? 2.6 : s < 16 ? 3.6 : 4.6), bed: () => 0, bank: 0, bankWide: 0, wet: true, wander: 0, open: 0 },
  // (left out of round 1: its water got over its banks on the hillside; it comes back when they hold)
  // { name: "Meadow Brook", path: MEADOW_BROOK, half: () => 1.5, follow: { start: 14, under: 1.2, end: 2, hold: 3 }, bank: 1, bankWide: 1.5, wet: true, wander: 2.4, open: 1.2, brook: true },
  { name: "Bench Brook", path: BENCH_BROOK, half: () => 1.5, follow: { start: 10, under: 1.2, end: 2, hold: 3 }, bank: 1, bankWide: 1.5, wet: true, wander: 2.4, open: 1.2, brook: true },
];
const chan = (name: string) => CHANNELS.findIndex((c) => c.name === name);

/** The cliff behind Weir Lake that the Great Fall comes over: north of this line the land is the hanging
 *  valley's bench. */
function greatWall(x: number): number {
  const d = x - 100;
  return 118 - 0.011 * d * d - (Math.abs(d) > 5 ? 1 : 0);
}

const SEED = 4107;

/** How far the land has risen `d` tiles from a lake's shore: a meadow at the shore's level, a low terrace one
 *  level up (both green: the lake waters ground up to two levels over it), a slope, a bench, a slope again. */
function rise(d: number, meadow: number, terrace: number, bench: number): number {
  let t = d - meadow;
  if (t <= 0) return 0;
  if (t < terrace) return 0.55 + 0.9 * (t / terrace);
  t -= terrace;
  const first = 9 + 5 * bench; // tiles of the first slope
  const lift = 1.45 + first / 2.9;
  if (t < first) return 1.45 + t / 2.9;
  const wide = 9 + 4 * bench;
  if (t < first + wide) return lift + (t - first) / 6;
  return lift + wide / 6 + (t - first - wide) / 3;
}

export interface Land {
  heights: Uint8Array;
  /** 1 + the lake's index where a tile is lake bed (the sill's crest and notch included), else 0. */
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
}

/** A ridge: rock along a line, `top` high within `half` tiles of it, falling `fall` a tile beyond. */
interface Ridge {
  path: Pt[];
  top: number;
  half: number;
  fall: number;
}

/** The Gate: the ridge that closes the valley below Low Lake; the gorge is cut through it. */
const RIDGES: Ridge[] = [{ path: [[6, 40], [20, 22], [40, 13], [60, 10], [84, 12]], top: 10.6, half: 5, fall: 0.75 }];

export function designLand(): Land {
  const f = new Float64Array(N);
  const lake = new Uint8Array(N);
  const channel = new Uint8Array(N);
  const pool = new Uint8Array(N);
  const g: Float64Array[] = LAKES.map(() => new Float64Array(N));
  const back = new Uint8Array(N);

  // what the outlands follow: each place's level in the stair (the lakes' sills, weighted by nearness)
  const anchors: [number, number, number][] = [];
  for (const L of LAKES) for (const arm of L.arms) for (const p of arm) anchors.push([p[0], p[1], L.sill]);
  anchors.push([121, 143, 14], [40, 8, 1], [120, 165, 14], [158, 178, 14], [185, 150, 13], [104, 135, 13]);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // a wandering of the whole picture, so no contour follows a ruler or a compass
      const wx = x + 0.5 + 7 * fbm(x, y, 36, SEED + 11, 3);
      const wy = y + 0.5 + 7 * fbm(x, y, 36, SEED + 12, 3);
      const wob = fbm(x, y, 16, SEED + 3, 3);
      let top = -1;
      let near = Infinity;
      for (let k = 0; k < LAKES.length; k++) {
        const L = LAKES[k];
        let d = Infinity;
        let dw = Infinity;
        for (const arm of L.arms) {
          d = Math.min(d, spineDist(x + 0.5, y + 0.5, arm));
          dw = Math.min(dw, spineDist(wx, wy, arm));
        }
        // (the outline itself wanders little: the lake's shape is the design's; the land round it wanders freely)
        const own = d + L.wander * wob * Math.min(1, Math.max(0.15, (d + 14) / 14));
        g[k][i] = own < 6 ? own : Math.max(6, dw + L.wander * wob);
        if (own < 3.2) top = k;
        if (own < near) near = own;
      }
      // the stair's level here, and the outlands: a little over it near the valley, falling away far from it
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
      const dry = Math.max(0, 1 - Math.abs(fbm(x, y, 24, SEED + 13, 3)) * 5) * Math.min(1, far / 12);
      const lift = 3.4 * Math.max(0, 1 - stair / 10);
      let out = stair + 4.2 + lift - 0.3 * Math.max(0, stair - 8) + 3.1 * fbm(x, y, 46, SEED + 1, 4) + 1.2 * fbm(x, y, 13, SEED + 2, 3) - 0.07 * far - 2.2 * dry;
      if (out > TOP) out = TOP;
      if (out < 4) out = 4 + 0.6 * fbm(x, y, 9, SEED + 14, 2);
      // behind the Great Fall's cliff the land is the upper world: the two lower lakes dig nothing there
      const upper = y >= greatWall(x) + 1.4 * fbm(x, y, 9, SEED + 9, 2);
      const hv = Math.min(pathDist(x + 0.5, y + 0.5, HANG_PATH).d, pathDist(x + 0.5, y + 0.5, NECK_PATH).d, spineDist(x + 0.5, y + 0.5, POOL) + 2);
      // (its floor fades to the west and the east, where the cliff dies into the hillside)
      const upperFloor = 12.6 + 0.9 * fbm(x, y, 10, SEED + 15, 2) - 0.3 * Math.max(0, 82 - x) - 0.3 * Math.max(0, x - 122);
      // (the hanging valley is a valley: the land beside it stands over its water)
      const beside = 15.3 - 0.3 * Math.max(0, hv - 9);
      if (out < beside) out = beside;
      if (hv < 30 && out > 15.4) out = 15.4;
      if (upper && out < upperFloor) out = upperFloor;
      // the lower envelope of the lakes' bowls, a higher lake's rim kept from the lakes below it
      const warpA = fbm(x, y, 34, SEED + 4, 3);
      const warpB = fbm(x, y, 19, SEED + 5, 3);
      const gully = Math.abs(fbm(x, y, 15, SEED + 16, 3));
      const meadowN = fbm(x, y, 27, SEED + 6, 2);
      const terraceN = fbm(x, y, 23, SEED + 21, 2);
      const benchN = fbm(x, y, 40, SEED + 17, 2);
      let land = out;
      for (let k = Math.max(0, top); k < LAKES.length; k++) {
        const d = Math.max(0, g[k][i]);
        // (the meadow is measured true from the shore: the lake waters 16 tiles of level ground; the hillside
        // behind it wanders)
        const meadow = 13 + 4 * meadowN;
        const hill = Math.max(0, d - meadow);
        const open = Math.min(1, hill / 7);
        const dw = hill * (1 + 0.35 * warpA) + (7 * warpB - 9 * Math.max(0, 0.16 - gully)) * open;
        const terrace = 4 + 2 * terraceN;
        let v = LAKES[k].sill + 1 + rise(Math.max(0, dw), 0, terrace, benchN);
        if (upper && k < 2 && v < upperFloor) v = upperFloor;
        if (v < land) land = v;
      }
      // small relief everywhere but the meadows, and crags: bands of rock two or three levels high that wander
      // across the slopes (hillsides in one-level steps alone read as a staircase)
      // the hillsides roll (their contours wander; a slope of even one-level steps reads as a staircase), and a
      // few bold scarps, two or three levels high, cross the outlands
      const hillside = Math.min(1, Math.max(0, (near - 15) / 8));
      land += (1.9 * fbm(x, y, 29, SEED + 7, 3) + 0.3 * fbm(x, y, 8, SEED + 8, 2)) * hillside;
      const scarp = Math.max(-1, Math.min(1, fbm(x, y, 52, SEED + 19, 2) * 60));
      land += 1.3 * scarp * Math.min(1, Math.max(0, (near - 24) / 6));
      // knolls on the meadows: a level up, here and there (the lake still waters them)
      if (near > 3.5 && near < 15 && fbm(x, y, 11, SEED + 22, 2) > 0.36) land += 1;
      // every lake keeps its rim: the shore a level over the sill, a low bank behind it where the land falls away
      for (let k = 0; k < LAKES.length; k++) {
        const d = g[k][i];
        if (d >= 6) continue;
        const need = LAKES[k].sill + (d < 2 ? 1 : 1.6 - 0.45 * Math.max(0, d - 4.4));
        if (land < need) land = need;
      }
      for (const r of RIDGES) {
        const { d } = pathDist(x + 0.5, y + 0.5, r.path);
        const v = r.top + 1.1 * fbm(x, y, 11, SEED + 18, 2) - r.fall * Math.max(0, d - r.half);
        if (v > land) land = v;
      }
      if (land > TOP) land = TOP;
      f[i] = land;
      // backwaters: creeks and ponds at the lake's level that finger into its meadows (they carry the green
      // out: a lake waters 16 tiles of ground at its shore's level and no slope above that)
      if (top < 0 || g[top][i] > 1.5) {
        for (let k = 0; k < LAKES.length; k++) {
          if (g[k][i] < 1.5 || g[k][i] > 24 || Math.round(land) !== LAKES[k].sill + 1) continue;
          const c = Math.abs(fbm(x, y, 22, SEED + 70 + k, 2));
          const pond = fbm(x, y, 13, SEED + 75, 2);
          if (c < 0.11 + 0.12 * Math.max(0, pond)) back[i] = k + 1;
        }
      }
    }

  // the start's meadow: level 3, wide, north-west of Low Lake below the Low Fall's west shoulder
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, [[50, 70, 9], [62, 80, 12], [70, 91, 9]]) + 2.5 * fbm(x, y, 13, SEED + 20, 2);
      if (d < 0 && g[0][i] > 0 && g[1][i] > 3.2) f[i] = 3;
      // (the start's own ground stays whole)
      if (Math.hypot(x - 70, y - 88) < 11) back[i] = 0;
    }

  // channels: their courses wander a little; a bed that follows the land is set from the land beside it
  const along: { d: number; s: number }[][] = CHANNELS.map((c) => {
    const out: { d: number; s: number }[] = new Array(N);
    const me = c.brook ? 6 : 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        out[y * W + x] = pathDist(x + 0.5 + c.wander * fbm(x, y, 14, SEED + 60, 2) + me * fbm(x, y, 30, SEED + 62, 2), y + 0.5 + c.wander * fbm(x, y, 14, SEED + 61, 2) + me * fbm(x, y, 30, SEED + 63, 2), c.path);
    return out;
  });
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
      if (f[i] < need) f[i] = Math.min(TOP, need);
    }
  });
  // the pool's rim
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      // (a broad dome of rock round the springs, never a thin ring: the pool stands near 15)
      if (d < 11 && f[i] < 15.6 + 0.1 * (11 - d)) f[i] = 16;
    }
  CHANNELS.forEach((c, k) => {
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const x = i % W;
      const y = (i - x) / W;
      const half = c.half(s) + (c.wander ? (c.brook ? 0.3 * Math.abs(fbm(x, y, 9, SEED + 30 + k, 2)) : 0.9 * fbm(x, y, 9, SEED + 30 + k, 2)) : 0) + (c.brook ? 2.4 * Math.max(0, fbm(x, y, 17, SEED + 64, 2) - 0.28) * 4 : 0);
      const b = bedOf[k](s);
      if (d <= half) {
        if (c.wet && channel[i] && CHANNELS[channel[i] - 1].wet && f[i] <= b) continue; // (a wet channel keeps the lower bed where two meet)
        f[i] = b;
        channel[i] = k + 1;
      } else if (c.open > 0) {
        // banks open out (the gorge keeps its walls); a wet channel's first ring stays a level over its bed
        const v = b + (d - half) * c.open + (c.wet ? 1.5 : 0.5);
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
  for (let i = 0; i < N; i++) h[i] = Math.max(0, Math.min(TOP, Math.round(f[i])));

  // lake beds: a shelf at the sill's level, then one level down every few tiles
  for (let k = 0; k < LAKES.length; k++) {
    const L = LAKES[k];
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
      let depth = Math.min(L.deep, Math.max(0, Math.floor((Math.min(-d, isle) - 1.2) / 2.6 + 0.35 * fbm(x, y, 8, SEED + 40 + k, 2))));
      // (the cove's head has a cut bank: deep water right at the meadow, so a pump there works through a drought)
      if (k === 0 && Math.hypot(x + 0.5 - 70, y + 0.5 - 80) < 5.5) depth = 2;
      h[i] = L.sill - depth;
      lake[i] = k + 1;
      channel[i] = 0;
    }
  }

  // the backwaters that reach their lake (the rest stay meadow): a level under the sill, so they hold through a drought
  for (let k = 0; k < LAKES.length; k++) {
    const stack: number[] = [];
    for (let i = 0; i < N; i++) if (lake[i] === k + 1) stack.push(i);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || Math.abs((j % W) - x) > 1) continue;
        if (back[j] !== k + 1 || lake[j] || channel[j] || pool[j] || h[j] !== LAKES[k].sill + 1) continue;
        lake[j] = k + 1;
        h[j] = LAKES[k].sill - 1;
        stack.push(j);
      }
    }
  }

  // the falls: the gap between two shoulders, the crest, the notch, the drop
  const crests: number[][] = [];
  for (const F of FALLS) {
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
        const want = crest + 4.1 - 0.62 * Math.max(0, dist - 1.6) + 0.7 * fbm(x, y, 5, SEED + 50, 2);
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
      // the crest, two tiles thick; behind it the bed leads up to it
      for (let v = 0; v <= 1; v++) {
        const i = at(u, v);
        h[i] = pier ? crest + 1 : notch ? crest - 1 : crest;
        lake[i] = up;
        if (up) channel[i] = 0;
        if (v === 0) tiles.push(i);
      }
      for (let v = 2; v <= 5; v++) {
        const i = at(u, v);
        if (!up) continue;
        if (h[i] > crest - 1) h[i] = crest - 1;
        lake[i] = up;
        channel[i] = 0;
      }
    }
    // the drop: the lower lake's plunge pool at the cliff's foot, rounded
    for (let u = a - 3; u <= b + 3; u++)
      for (let v = -1; v >= -6; v--) {
        const i = at(u, v);
        if (i < 0) continue;
        const e = Math.hypot((u - mid) / ((b - a) / 2 + 1.8), (v + 1) / 5.2);
        if (e > 1) continue;
        const inGap = u >= a && u <= b;
        if (!inGap && v === -1) continue;
        const bedHere = F.foot + (e > 0.72 && F.to >= 0 ? 1 : 0);
        if (!lake[i] || h[i] > bedHere) h[i] = bedHere;
        lake[i] = F.to + 1;
        channel[i] = F.to < 0 ? chan("Gorge") + 1 : 0;
      }
    crests.push(tiles);
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
      if (lake[i]) need[i] = LAKES[lake[i] - 1].sill + 1;
      const c = channel[i];
      if (pool[i]) need[i] = 15;
      else if (c && CHANNELS[c - 1].wet && CHANNELS[c - 1].name !== "Gorge") need[i] = CHANNELS[c - 1].follow ? h[i] + 1 : 15;
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
  return { heights: h, lake, channel, pool, crests, beds, plugs, guarded };
}

/** One-tile pits and spikes on the land go (the game's own look has none), and one-tile pillars two or more over
 *  everything beside them. */
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
          // a one-tile tongue: three of its four neighbours on the other side by the same step
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
  const hist = new Array(23).fill(0);
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
      const top = LAKES[k - 1].sill + 0.3;
      if (h[i] < top) d[i] = top - h[i];
    }
    if (land.pool[i]) d[i] = Math.max(0, 14.5 - h[i]);
    const c = land.channel[i];
    if (c && CHANNELS[c - 1].wet) d[i] = 0.3;
  }
  return d;
}
