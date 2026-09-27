// A map's water story (M9b, D273 outcome 1): can a player follow its water at a glance, from where
// it starts, into a main river or lake system, to where it leaves? A few tributaries, never a
// tangle of small channels. The measures are information (D273); the generator's candidate choice
// uses `readable` to prefer a map whose water reads (D278).
//
// Read on the settled water: the wet tiles (0.05 deep or more, as the map shows water) in
// 4-connected systems. The main system is the one holding the most water; its share of the map's
// water is the headline measure. Other systems are counted when they hold 0.1% of the map or more
// (a pond is smaller). The rivers' heads (edge inflows and springs) are counted by whether their
// water joins the main system, and each river's course by how much of it holds water: a river whose
// course stands dry for a stretch cannot be followed.

import type { Feature, RiverFeature } from "../features/schema";
import { distanceFrom } from "../math/grid";

export interface WaterStory {
  /** Tiles with water 0.05 deep or more. */
  wet: number;
  /** The main system's share of the wet tiles, and of the water's volume. */
  mainShare: number;
  mainVolume: number;
  /** Other systems of 0.1% of the map or more, their share of the wet tiles, and smaller ponds. */
  systems: number;
  otherShare: number;
  ponds: number;
  /** River heads whose water joins the main system (its sources and tributaries), and rivers whose
   *  water never does (separate systems crossing the map). */
  heads: number;
  separate: number;
  /** The share of the main river's course that holds water, and the least of any river's. */
  mainWet: number;
  leastWet: number;
  /** The share of the dry land within `REACH` of the map's side from clean water (D294: water that
   *  sits in one corner leaves most of the land bare rock). */
  reach: number;
  /** The water reads at a glance (D273 (1)). */
  readable: boolean;
  /** Why it does not read, in words (empty when it reads). */
  why: string[];
}

/** Limits a readable story keeps (information; the candidate choice prefers maps within them). */
export const STORY = { mainShare: 0.72, systems: 3, heads: 7, separate: 1, mainWet: 0.85, riverWet: 0.6, reach: 0.35 } as const;
/** How far from clean water land counts as within reach of it, as a share of the map's side. */
export const REACH = 0.14;

const D4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The labels of the wet systems (−1 dry) and each system's tiles and volume. */
export function wetSystems(W: number, H: number, depth: ArrayLike<number>, min = 0.05): { labels: Int32Array; tiles: number[]; volume: number[] } {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  const tiles: number[] = [];
  const volume: number[] = [];
  const q = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (labels[s] >= 0 || !(depth[s] >= min)) continue;
    const id = tiles.length;
    let head = 0;
    let tail = 0;
    q[tail++] = s;
    labels[s] = id;
    let v = 0;
    while (head < tail) {
      const i = q[head++];
      v += depth[i];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (labels[j] >= 0 || !(depth[j] >= min)) continue;
        labels[j] = id;
        q[tail++] = j;
      }
    }
    tiles.push(tail);
    volume.push(v);
  }
  return { labels, tiles, volume };
}

/** A river's course, a tile at a time inside the map (the first and last two tiles left out). */
function courseTiles(r: RiverFeature, W: number, H: number): number[] {
  const out: number[] = [];
  const path = r.params.path;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let t = 0; t < n; t++) {
      const x = Math.round(ax + ((bx - ax) * t) / n);
      const y = Math.round(ay + ((by - ay) * t) / n);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (out[out.length - 1] !== i) out.push(i);
    }
  }
  return out.slice(2, Math.max(2, out.length - 2));
}

/** Whether the river's water stands at a tile of its course: the tile or one beside it wet (a
 *  course line runs within its channel, which may wander a tile off it). */
function wetNear(i: number, W: number, H: number, depth: ArrayLike<number>): boolean {
  if (depth[i] >= 0.05) return true;
  const x = i % W;
  const y = (i - x) / W;
  for (const [dx, dy] of D4) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && depth[yy * W + xx] >= 0.05) return true;
  }
  return false;
}

export function waterStory(W: number, H: number, depth: ArrayLike<number>, features: readonly Feature[], contamination: ArrayLike<number> | null = null): WaterStory {
  const sys = wetSystems(W, H, depth);
  // the land within reach of clean water
  const clean = new Uint8Array(W * H);
  let dry = 0;
  for (let i = 0; i < W * H; i++) {
    if (depth[i] >= 0.05) {
      if (!contamination || !(contamination[i] >= 0.05)) clean[i] = 1;
    } else dry++;
  }
  const dist = distanceFrom(clean, W, H);
  const R = REACH * Math.min(W, H);
  let near = 0;
  for (let i = 0; i < W * H; i++) if (!(depth[i] >= 0.05) && dist[i] <= R) near++;
  const reach = dry > 0 ? near / dry : 1;
  let wet = 0;
  let vol = 0;
  let main = -1;
  sys.tiles.forEach((t, k) => {
    wet += t;
    vol += sys.volume[k];
    if (main < 0 || sys.volume[k] > sys.volume[main]) main = k;
  });
  const min = Math.max(8, Math.round(0.001 * W * H));
  let systems = 0;
  let other = 0;
  let ponds = 0;
  sys.tiles.forEach((t, k) => {
    if (k === main) return;
    if (t >= min) {
      systems++;
      other += t;
    } else ponds++;
  });
  const rivers = features.filter((f): f is RiverFeature => f.kind === "river" && !f.params.badwater);
  // a plug's river runs dry below it until the plug is opened (the plug-lake intention, D274): its
  // course's water is not asked for
  const plugTiles = new Set<number>();
  for (const f of features) {
    if (f.kind !== "mapObject" || (f.params as { kind: string }).kind !== "plug") continue;
    const area = (f.params as { placement: { area?: [number, number, number][] } }).placement.area ?? [];
    for (const [y, x0, x1] of area) for (let x = x0; x <= x1; x++) plugTiles.add(y * W + x);
  }
  let heads = 0;
  let separate = 0;
  let mainWet = 1;
  let leastWet = 1;
  for (const r of rivers) {
    const tiles = courseTiles(r, W, H);
    const count = new Map<number, number>();
    let w = 0;
    for (const i of tiles) {
      if (wetNear(i, W, H, depth)) w++;
      const l = sys.labels[i];
      if (l >= 0) count.set(l, (count.get(l) ?? 0) + 1);
    }
    const plugged = plugTiles.size > 0 && tiles.some((i) => {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (plugTiles.has((y + dy) * W + x + dx)) return true;
      return false;
    });
    const share = tiles.length && !plugged ? w / tiles.length : 1;
    if (r.role === "river/main") mainWet = share;
    if (share < leastWet) leastWet = share;
    // the system most of its course's water lies in
    let s = -1;
    let sn = 0;
    for (const [l, n] of count) if (n > sn || (n === sn && l < s)) {
      s = l;
      sn = n;
    }
    if (s === main) heads++;
    else if (s >= 0 && sys.tiles[s] >= min) separate++;
  }
  const mainShare = main >= 0 && wet > 0 ? sys.tiles[main] / wet : 0;
  const mainVolume = main >= 0 && vol > 0 ? sys.volume[main] / vol : 0;
  const why: string[] = [];
  if (mainShare < STORY.mainShare) why.push(`the main system holds ${Math.round(mainShare * 100)}% of the water`);
  if (systems > STORY.systems) why.push(`${systems} other water systems`);
  if (heads > STORY.heads) why.push(`${heads} heads feed the main system`);
  if (separate > STORY.separate) why.push(`${separate} rivers never join it`);
  if (reach < STORY.reach) why.push(`only ${Math.round(reach * 100)}% of the land lies near clean water`);
  if (mainWet < STORY.mainWet) why.push(`the main river holds water on ${Math.round(mainWet * 100)}% of its course`);
  else if (leastWet < STORY.riverWet) why.push(`a river holds water on ${Math.round(leastWet * 100)}% of its course`);
  return {
    wet,
    mainShare: round3(mainShare),
    mainVolume: round3(mainVolume),
    systems,
    otherShare: round3(wet > 0 ? other / wet : 0),
    ponds,
    heads,
    separate,
    mainWet: round3(mainWet),
    leastWet: round3(leastWet),
    reach: round3(reach),
    readable: why.length === 0,
    why,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Whether two maps' land is the same map (Another like this never gives a clone, D278 (1c)): 85%
 *  or more of the tiles within a level of each other. Two different lands share far less. */
export function sameLand(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length || !a.length) return false;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) <= 1) same++;
  return same >= 0.85 * a.length;
}
