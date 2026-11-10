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

// ------------------------------------------------------------------------------------------- the design

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

export interface Channel {
  name: string;
  path: Pt[];
  /** Half its bed's width, in tiles. */
  half: (s: number) => number;
  /** Its bed's level, by how far along the path. */
  bed: (s: number) => number;
  /** Banks at least this far over the bed, this wide beside it (a raise): 0 for none. */
  bank: number;
  bankWide: number;
}

export const LAKES: Lake[] = [
  {
    name: "Low Lake",
    sill: 2,
    arms: [
      [[44, 41, 12], [58, 50, 16], [72, 61, 12]],
      [[72, 61, 10], [84, 71, 7], [88, 79, 6]],
      [[44, 41, 9], [40, 30, 5]],
    ],
    wander: 4,
    deep: 2,
    seed: [60, 54],
    islands: [[50, 44, 4.6], [66, 52, 2.4]],
  },
  {
    name: "Weir Lake",
    sill: 6,
    arms: [
      [[93, 97, 10], [104, 99, 14], [115, 100, 10]],
      [[100, 104, 10], [100, 113, 9]],
      [[93, 97, 6], [89, 91, 4.5]],
      [[115, 100, 7], [120, 100, 4.5]],
    ],
    wander: 3,
    deep: 3,
    seed: [104, 100],
  },
  {
    name: "Steam Lake",
    sill: 10,
    arms: [
      [[140, 104, 12], [153, 108, 14], [161, 98, 11]],
      [[140, 104, 7], [131, 100, 4.5]],
      [[150, 112, 8], [150, 122, 5]],
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
      [[143, 143, 10], [154, 148, 12], [148, 157, 9]],
      [[150, 140, 7], [150, 133, 5]],
    ],
    wander: 2.5,
    deep: 3,
    seed: [152, 147],
  },
];

export const FALLS: Fall[] = [
  { name: "Low Fall", from: 1, to: 0, face: "S", at: 85, span: [85, 92], notch: [88], piers: [], crest: 6, foot: 0 },
  { name: "Weir Fall", from: 2, to: 1, face: "W", at: 125, span: [96, 103], notch: [100], piers: [], crest: 10, foot: 3 },
  { name: "Crown Fall", from: 3, to: 2, face: "S", at: 128, span: [146, 153], notch: [150], piers: [], crest: 14, foot: 7 },
  { name: "Great Fall", from: -1, to: 1, face: "S", at: 118, span: [96, 104], notch: [], piers: [], crest: 14, foot: 3 },
];

/** The springs' pool in the cirque (bed 13): the sources stand in it; three ways out, each a gate's width: the
 *  neck to Crown Lake, the hanging valley, and the old channel (plugged). */
export const POOL: Sp[] = [[166, 169, 5.5], [171, 173, 4.5]];
export const POOL_BED = 13;

const HANG_PATH: Pt[] = [[162, 172], [150, 176], [135, 172], [123, 160], [113, 146], [105, 133], [100, 125], [100, 118]];
const HANG_LEN = pathLength(HANG_PATH);
const NECK_PATH: Pt[] = [[164, 165], [160, 160], [156, 154]];
const OLD_PATH: Pt[] = [[174, 168], [180, 160], [182, 132], [181, 106], [176, 88], [162, 75], [144, 66], [126, 56], [112, 44], [106, 30], [104, 14], [104, -1]];
const OLD_LEN = pathLength(OLD_PATH);
const GORGE_PATH: Pt[] = [[40, 27], [38, 17], [41, 8], [40, -1]];

/** The old channel's bed by how far along it: 14 at its mouth on the pool (under the plug), then down with the
 *  land beside it, two to three levels under it, never rising (`designLand` fills the table from the land). */
const OLD_BED: number[] = [];
function oldBed(s: number): number {
  if (s < 5) return 14;
  const k = Math.min(OLD_BED.length - 1, Math.max(0, Math.floor(s / 2)));
  return OLD_BED.length ? OLD_BED[k] : 13;
}

export const CHANNELS: Channel[] = [
  { name: "Hanging valley", path: HANG_PATH, half: (s) => (s > HANG_LEN - 10 ? 4.6 : s > HANG_LEN - 22 ? 3 : 1.6), bed: () => 14, bank: 1, bankWide: 3 },
  { name: "Neck", path: NECK_PATH, half: () => 1.6, bed: () => 14, bank: 2, bankWide: 3 },
  { name: "Old channel", path: OLD_PATH, half: () => 2.1, bed: oldBed, bank: 2, bankWide: 3 },
  { name: "Gorge", path: GORGE_PATH, half: () => 2.6, bed: (s) => (s < 4 ? 2 : s < 16 ? 1 : 0), bank: 0, bankWide: 0 },
];

/** The cliff behind Weir Lake that the Great Fall comes over: north of this line the land is the hanging
 *  valley's bench. */
function greatWall(x: number): number {
  const d = x - 100;
  return 118 - 0.011 * d * d - (Math.abs(d) > 5 ? 1 : 0);
}

const SEED = 4107;

/** How far the land has risen `d` tiles from a lake's shore: a meadow, a slope, a bench (where `bench` puts it), a
 *  slope again. */
function rise(d: number, meadow: number, bench: number): number {
  const t = d - meadow;
  if (t <= 0) return 0;
  const first = 9 + 5 * bench; // tiles of the first slope
  const lift = first / 2.9;
  if (t < first) return t / 2.9;
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
  /** The land's level along the old channel before it was cut, every 4 tiles (for setting its bed). */
  oldProfile: number[];
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

  // what the outlands follow: each place's level in the stair (the lakes' sills, weighted by nearness)
  const anchors: [number, number, number][] = [];
  for (const L of LAKES) for (const arm of L.arms) for (const p of arm) anchors.push([p[0], p[1], L.sill]);
  anchors.push([168, 170, 14], [40, 8, 1], [120, 165, 14], [104, 135, 13]);

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
      const far = Math.max(0, near - 26);
      const dry = Math.max(0, 1 - Math.abs(fbm(x, y, 24, SEED + 13, 3)) * 5) * Math.min(1, far / 12);
      let out = stair + 4.2 - 0.3 * Math.max(0, stair - 8) + 3.1 * fbm(x, y, 46, SEED + 1, 4) + 1.2 * fbm(x, y, 13, SEED + 2, 3) - 0.085 * far - 2.2 * dry;
      if (out > TOP) out = TOP;
      if (out < 4) out = 4 + 0.6 * fbm(x, y, 9, SEED + 14, 2);
      // behind the Great Fall's cliff the land is the upper world: the two lower lakes dig nothing there
      const upper = y >= greatWall(x) + 1.4 * fbm(x, y, 9, SEED + 9, 2);
      // (its floor fades to the west and the east, where the cliff dies into the hillside)
      const upperFloor = 12.6 + 0.9 * fbm(x, y, 10, SEED + 15, 2) - 0.3 * Math.max(0, 82 - x) - 0.3 * Math.max(0, x - 122);
      if (upper && out < upperFloor) out = upperFloor;
      // the lower envelope of the lakes' bowls, a higher lake's rim kept from the lakes below it
      const warpA = fbm(x, y, 34, SEED + 4, 3);
      const warpB = fbm(x, y, 19, SEED + 5, 3);
      const gully = Math.abs(fbm(x, y, 15, SEED + 16, 3));
      const meadowN = fbm(x, y, 27, SEED + 6, 2);
      const benchN = fbm(x, y, 40, SEED + 17, 2);
      let land = out;
      for (let k = Math.max(0, top); k < LAKES.length; k++) {
        const d = Math.max(0, g[k][i]);
        const open = Math.min(1, d / 7);
        const dw = d * (1 + 0.4 * warpA) + (8 * warpB - 9 * Math.max(0, 0.16 - gully)) * open;
        const meadow = 4 + 5 * meadowN + (k === 0 ? 3 : 0);
        let v = LAKES[k].sill + 1 + rise(Math.max(0, dw), meadow, benchN);
        if (upper && k < 2 && v < upperFloor) v = upperFloor;
        if (v < land) land = v;
      }
      // small relief everywhere but the meadows, and crags: bands of rock two or three levels high that wander
      // across the slopes (hillsides in one-level steps alone read as a staircase)
      const over = Math.min(1, Math.max(0, (land - (top >= 0 ? LAKES[top].sill + 2 : 3.6)) / 2));
      land += 0.6 * fbm(x, y, 7, SEED + 7, 2) * over;
      const cr = fbm(x, y, 19, SEED + 19, 2);
      const crag = Math.max(-1, Math.min(1, cr * 40));
      land += 1.25 * crag * Math.min(1, Math.max(0, (land - (top >= 0 ? LAKES[top].sill + 3 : 5)) / 2));
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
    }

  // the start's meadow: level 3, wide, north-west of Low Lake below the Low Fall's west shoulder
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, [[50, 68, 9], [66, 78, 12], [72, 84, 8]]) + 2.5 * fbm(x, y, 13, SEED + 20, 2);
      if (d < 0 && g[0][i] > 0 && g[1][i] > 3.2) f[i] = 3;
    }

  // channels: banks first (a raise), then the bed (a carve); their courses wander a little
  const along: { d: number; s: number }[][] = CHANNELS.map((c) => {
    const out: { d: number; s: number }[] = new Array(N);
    const w = c.name === "Gorge" || c.name === "Neck" ? 0 : 2.2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = pathDist(x + 0.5 + w * fbm(x, y, 14, SEED + 60, 2), y + 0.5 + w * fbm(x, y, 14, SEED + 61, 2), c.path);
    return out;
  });
  const oldProfile: number[] = [];
  {
    const k = CHANNELS.findIndex((c) => c.name === "Old channel");
    const bins = Math.ceil(OLD_LEN / 2) + 1;
    const sum = new Float64Array(bins);
    const cnt = new Float64Array(bins);
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      if (d > 3) continue;
      const key = Math.min(bins - 1, Math.floor(s / 2));
      sum[key] += f[i];
      cnt[key]++;
    }
    OLD_BED.length = 0;
    let run = 13;
    let last = 13;
    for (let b = 0; b < bins; b++) {
      const v = cnt[b] ? sum[b] / cnt[b] : last;
      last = v;
      // (its last steps go down to the edge)
      const want = Math.round(v - 2.7);
      if (want < run) run = Math.max(want, run - 4);
      OLD_BED.push(Math.max(1, run));
      if (b % 2 === 0) oldProfile.push(Math.round(v * 10) / 10);
    }
  }
  CHANNELS.forEach((c, k) => {
    if (!c.bank) return;
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const half = c.half(s);
      if (d > half + c.bankWide) continue;
      const need = c.bed(s) + c.bank - Math.max(0, d - half - 1.2) * 0.9;
      if (f[i] < need) f[i] = Math.min(TOP, need);
    }
  });
  // the pool's rim
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = spineDist(x + 0.5, y + 0.5, POOL);
      if (d < 4 && f[i] < 15.6) f[i] = 15.6;
    }
  CHANNELS.forEach((c, k) => {
    for (let i = 0; i < N; i++) {
      const { d, s } = along[k][i];
      const x = i % W;
      const y = (i - x) / W;
      const half = c.half(s) + (c.name === "Gorge" || c.name === "Neck" ? 0 : 0.9 * fbm(x, y, 9, SEED + 30 + k, 2));
      const b = c.bed(s);
      if (d <= half) {
        f[i] = b;
        channel[i] = k + 1;
      } else if (c.name !== "Gorge") {
        // banks open out (the gorge keeps its walls)
        const v = b + (d - half) * (c.name === "Old channel" ? 0.8 : 1.0) + 0.5;
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
      for (const s of L.islands ?? []) isle = Math.min(isle, Math.hypot(x + 0.5 - s[0], y + 0.5 - s[1]) - s[2] + 1.5 * fbm(x, y, 6, SEED + 45, 2));
      if (isle < 0) {
        h[i] = L.sill + (isle < -2.2 ? 2 : 1);
        continue;
      }
      const depth = Math.min(L.deep, Math.max(0, Math.floor((Math.min(-d, isle) - 1.2) / 2.6 + 0.35 * fbm(x, y, 8, SEED + 40 + k, 2))));
      h[i] = L.sill - depth;
      lake[i] = k + 1;
      channel[i] = 0;
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
        const outGap = u < a ? a - u : u - b;
        // (the two tiles beside the gap are rock whatever the lake's outline says: the gap is exactly its span)
        if (lake[i] && (outGap > 2 || v > 2)) continue;
        const rock = outGap <= 2 && v <= 2;
        const level = Math.min(TOP, Math.round(rock ? Math.max(want, crest + 3) : want));
        if (level > h[i] || (lake[i] && rock)) {
          h[i] = level;
          lake[i] = 0;
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
        channel[i] = up ? 0 : channel[i];
        if (v === 0) tiles.push(i);
      }
      for (let v = 2; v <= 5; v++) {
        const i = at(u, v);
        if (!up) continue;
        if (h[i] > crest - 1) h[i] = crest - 1;
        lake[i] = up;
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
        const bedHere = F.foot + (e > 0.72 ? 1 : 0);
        if (!lake[i] || h[i] > bedHere) h[i] = bedHere;
        lake[i] = F.to + 1;
      }
    crests.push(tiles);
  }

  tidy(h, lake, channel, pool);
  return { heights: h, lake, channel, pool, crests, oldProfile };
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
    if (c && (CHANNELS[c - 1].name === "Hanging valley" || CHANNELS[c - 1].name === "Neck" || CHANNELS[c - 1].name === "Gorge")) d[i] = 0.3;
  }
  return d;
}
