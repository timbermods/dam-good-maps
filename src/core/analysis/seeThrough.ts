// Whether a 3D form reads as what it is from the game's camera (D503). An arch is open through: a
// camera looking down at it sees far land or water beyond it, under its rock, where a grotto (an
// opening closed at the back) shows only its own back wall. Rays from the opening's air go back up to
// the camera and on down the other way: a sightline counts when its way up is clear to the sky, its
// way down lands on the top of ground or water open to the sky two or more tiles past the rock (not
// into a wall right behind it), and between the two it runs under the rock for a tile or more (a ray
// grazing a lip is no window). An overhang's roof reaches two or more tiles over its floor: a roof a
// tile deep reads as a ridge's lip.
//
// The camera angles: the game's opening camera looks down at 60° (analysis/opening.ts `OPENING`), and a
// player tilts it lower to look at the land; 30° and 45° are both ordinary. The headings: the eight
// compass ones. Exact arithmetic only (PLAN §2.1): the angles' sines and cosines are constants, the
// rays march in fixed steps of + − × ÷.

import { TERRAIN_LAYERS } from "../terrain/runs";

export interface SeeTerrain {
  W: number;
  H: number;
  /** The solid voxels per tile (terrain/runs.ts). */
  mask: Uint32Array;
  /** Whether the point at height `z` (layers, from 0) on tile `i` is under water. */
  wet(i: number, z: number): boolean;
}

/** The camera's angles below the horizon, as [cos, sin]: 30°, 45°, 60°. */
export const SEE_PITCHES: readonly (readonly [number, number])[] = [
  [0.8660254037844386, 0.5],
  [0.7071067811865476, 0.7071067811865476],
  [0.5, 0.8660254037844386],
];
const R2 = 0.7071067811865476;
/** The eight compass headings, a quarter turn apart in twos: heading `w + 4` is `w`'s opposite. */
export const SEE_HEADINGS: readonly (readonly [number, number])[] = [
  [1, 0],
  [R2, R2],
  [0, 1],
  [-R2, R2],
  [-1, 0],
  [-R2, -R2],
  [0, -1],
  [R2, -R2],
];
/** Where in each air voxel its rays start: the eight corners of its middle half. */
const STARTS: readonly (readonly [number, number, number])[] = [0.25, 0.75].flatMap((x) => [0.25, 0.75].flatMap((y) => [0.25, 0.75].map((z) => [x, y, z] as const)));
/** A ray's step along its way (in tiles). */
const STEP = 0.125;
/** The least run under the rock a sightline takes (tiles, across the ground). */
const UNDER = 1;
/** How far past the rock a sightline lands at least (tiles, across the ground). */
const PAST = 2;
/** The tiles a window's sightlines at 45° land on beyond it, at least. */
export const SEE_LEAST = 3;

export interface SeeThrough {
  /** Sightlines through the opening at each of `SEE_PITCHES`. */
  lines: number[];
  /** The tiles beyond the opening the sightlines land on, at each pitch. */
  beyond: number[];
  /** The same by heading (`SEE_HEADINGS`, the way the sightline runs from the camera), at each pitch. */
  ways: number[][];
}

/** The sightlines through the openings at `cells` (air voxels under rock: tile index and layer, as
 *  `z * W * H + i`). `quick`: only what `readsThrough` reads (45°, then 30° only when 45° sees through
 *  enough; the rest left 0), for a grower trying many places. */
export function seeThrough(t: SeeTerrain, cells: readonly number[], quick = false): SeeThrough {
  const { W, H, mask } = t;
  const N = W * H;
  const solid = (x: number, y: number, z: number): boolean => {
    if (z < 0) return true;
    if (z >= TERRAIN_LAYERS || x < 0 || y < 0 || x >= W || y >= H) return false;
    return !!(mask[Math.floor(y) * W + Math.floor(x)] & (1 << Math.floor(z)));
  };
  // (rock over a point: the tile's top stands above its layer)
  const tops = new Uint8Array(N);
  let highest = 0;
  for (let i = 0; i < N; i++) {
    tops[i] = mask[i] === 0 ? 0 : 32 - Math.clz32(mask[i]);
    if (tops[i] > highest) highest = tops[i];
  }
  const roofed = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return tops[Math.floor(y) * W + Math.floor(x)] > Math.floor(z) + 1;
  };
  const lines = [0, 0, 0];
  const beyond = [0, 0, 0];
  const ways = SEE_PITCHES.map(() => SEE_HEADINGS.map(() => 0));
  // (45° first: a quick look stops there when too little is seen through)
  for (const at of [1, 0, 2]) {
    if (quick && at !== 1 && (at === 2 || beyond[1] < SEE_LEAST)) break;
    const [cp, sp] = SEE_PITCHES[at];
    let n = 0;
    const landed = new Set<number>();
    const by = SEE_HEADINGS.map(() => new Set<number>());
    for (const c of cells) {
      const i = c % N;
      for (const [ox, oy, oz] of STARTS) {
        const z0 = (c - i) / N + oz;
        const x0 = (i % W) + ox;
        const y0 = Math.floor(i / W) + oy;
        for (let w = 0; w < SEE_HEADINGS.length; w++) {
          const [hx, hy] = SEE_HEADINGS[w];
          const dx = hx * cp * STEP;
          const dy = hy * cp * STEP;
          const dz = sp * STEP;
          const across = cp * STEP;
          // up toward the camera: clear of rock and water to over the land
          let under = 0;
          let x = x0;
          let y = y0;
          let z = z0;
          let clear = true;
          for (;;) {
            x -= dx;
            y -= dy;
            z += dz;
            if (z >= highest || x < 0 || y < 0 || x >= W || y >= H) break;
            if (solid(x, y, z) || t.wet(Math.floor(y) * W + Math.floor(x), z)) {
              clear = false;
              break;
            }
            if (roofed(x, y, z)) under += across;
          }
          if (!clear) continue;
          // and down the other way, to the first ground or water: its top, open to the sky, and far
          // enough past the rock that a wall right behind it is no window
          x = x0;
          y = y0;
          z = z0;
          let hit = -1;
          let past = 0;
          let was = Math.floor(y) * W + Math.floor(x);
          for (;;) {
            x += dx;
            y += dy;
            z -= dz;
            if (x < 0 || y < 0 || x >= W || y >= H) break;
            const j = Math.floor(y) * W + Math.floor(x);
            if (solid(x, y, z) || t.wet(j, z)) {
              // (its top: the ray came down onto it in the same tile, not into a wall from beside)
              if (j === was && !roofed(x, y, z)) hit = j;
              break;
            }
            was = j;
            if (roofed(x, y, z)) {
              under += across;
              past = 0;
            } else past += across;
          }
          if (hit < 0 || under < UNDER || past < PAST) continue;
          n++;
          landed.add(hit);
          by[w].add(hit);
        }
      }
    }
    lines[at] = n;
    beyond[at] = landed.size;
    ways[at] = by.map((b) => b.size);
  }
  return { lines, beyond, ways };
}

/** Whether an opening reads as a window (an arch, not a grotto): at 30° or 45° it is seen through
 *  both ways along one of `axes` (headings 0–3 of `SEE_HEADINGS`: by default along x or along y, the
 *  ways a window through a wall or under a span looks), two or more tiles beyond it each way, and at
 *  45° on `SEE_LEAST` or more tiles in all. An opening closed at one end is a grotto from there. */
export function readsThrough(s: SeeThrough, axes: readonly number[] = [0, 2]): boolean {
  if (s.beyond[1] < SEE_LEAST) return false;
  for (const p of [0, 1]) for (const w of axes) if (s.ways[p][w] >= 2 && s.ways[p][w + 4] >= 2) return true;
  return false;
}

/** The heading a window is seen through best along (the most tiles beyond, at 45° and 30°). */
export function bestHeading(s: SeeThrough): number {
  let best = 0;
  for (let w = 1; w < SEE_HEADINGS.length; w++) if (s.ways[1][w] + s.ways[0][w] > s.ways[1][best] + s.ways[0][best]) best = w;
  return best;
}

/** The air voxels under rock in `tiles`: every free layer of a tile below its top. */
export function underRock(mask: Uint32Array, N: number, tiles: Iterable<number>): number[] {
  const out: number[] = [];
  for (const i of tiles) {
    const m = mask[i];
    const top = m === 0 ? 0 : 32 - Math.clz32(m);
    for (let z = 0; z < top - 1; z++) if (!(m & (1 << z))) out.push(z * N + i);
  }
  return out;
}

/** How deep an overhang's roof reaches: each roofed tile of `tiles` (one that is not one plain run)
 *  and its distance in tiles, over roofed tiles, from open ground (or water) under the sky no higher
 *  than a level over its floor. */
export function roofDepths(mask: Uint32Array, W: number, H: number, tiles: Iterable<number>): Map<number, number> {
  const plain = (m: number) => (m & (m + 1)) === 0;
  const top = (m: number) => (m === 0 ? 0 : 32 - Math.clz32(m));
  const set = new Set<number>();
  for (const i of tiles) if (!plain(mask[i])) set.add(i);
  const d = new Map<number, number>();
  const q: number[] = [];
  for (const i of set) {
    const x = i % W;
    const y = (i - x) / W;
    const floor = top(mask[i] & ~(mask[i] + 1));
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!set.has(j) && plain(mask[j]) && top(mask[j]) <= floor + 1) {
        d.set(i, 1);
        q.push(i);
        break;
      }
    }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of D4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (!set.has(j) || d.has(j)) continue;
      d.set(j, d.get(i)! + 1);
      q.push(j);
    }
  }
  return d;
}

/** Whether an overhang's roof reads as a shelter, not a ridge's lip: three or more of its tiles two or
 *  more deep. */
export function shelters(depths: ReadonlyMap<number, number>): boolean {
  let n = 0;
  for (const v of depths.values()) if (v >= 2) n++;
  return n >= 3;
}

const D4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
