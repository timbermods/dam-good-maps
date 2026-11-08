// The opening picture (Wave 2, judging by looks): what the game's first camera shows of a new game, as a small
// picture worked out in the core, the same on every machine. The camera is D493's (analysis/opening.ts: the
// opening camera pulled back to the default zoom's widest, `VISTA_ZOOM`, the frame the start is turned for and the
// map's own picture is drawn from, render3d/hero.ts). Each of its pixels casts a ray through the map as the game
// builds it, voxel by voxel (its caves, overhangs and arches included), its water on every column and its trees'
// crowns, and says what the game draws where the ray first meets something, and how far that is:
//
// - water, clean or bad (the game's badwater from half its share on: the colour turns across the middle, D496);
// - ground's top, grass or dry, by the game's own rule for its grass (SoilMoistureSystem `UpdateDesertIntensity`:
//   the desert texture over (1 − m / 5) × 0.7 of a top whose moisture m is under 5, over all of it at 0, none
//   above; render3d/palette.ts `DESERT`), grass where at least half the top shows grass;
// - a cliff's face (the ray met the ground from the side), a tree's crown (the map's trees, `MAP_TREES`, a crown of
//   `CROWN` levels over its ground), or nothing: past the map's edge, where the game draws its void.
//
// `looksScore` reads the picture as an eye would (`LOOKS`, weighed against a fresh eye's ranking of 28 maps' pictures):
// trees and green, land in depth (silhouettes against farther land), cliffs and water, against the void past the
// edge (a start near a corner shows little map) and bare brown. Exact arithmetic only (PLAN §2.1): + − × ÷ and `math/portable.ts`.

import { MAP_TREES } from "../format/entities";
import { sqrt } from "../math/portable";
import { COS_P, frameAt, openingCamera, SIN_P, TAN_H, TAN_V, VISTA_ZOOM, type OpeningStart } from "./opening";

/** The picture's size: the game's 16:9 at a pixel a ray. */
export const PICTURE_W = 160;
export const PICTURE_H = 90;

/** What a pixel shows. */
export const PIXEL = { void: 0, water: 1, badwater: 2, grass: 3, dry: 4, cliff: 5, tree: 6 } as const;
export type PixelKind = (typeof PIXEL)[keyof typeof PIXEL];

/** The game's grass rule (render3d/palette.ts `DESERT`, its SoilMoistureSimulatorSpec): the desert texture over all
 *  of a top at moisture 0, over (1 − m / threshold) × max of one at moisture m under the threshold, none above. */
export const GRASS_RULE = { threshold: 5, max: 0.7 } as const;
/** A tree's crown over its ground, in levels: the map's trees grown (Pine, Birch, Oak stand about three levels). */
export const CROWN = 3;

/** The map as the picture reads it: a build's land, water, soil and objects. */
export interface PictureLand {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** Bit z of `mask[i]` set: voxel z of tile i is solid (a map with caves or overhangs, `WaterModel.stacked`). */
  mask?: ArrayLike<number> | null;
  /** The water from above (a heightfield's), or on every column (`stack`). */
  water: ArrayLike<number>;
  contamination: ArrayLike<number>;
  stack?: { count: ArrayLike<number>; floor: ArrayLike<number>; depth: ArrayLike<number>; contamination: ArrayLike<number> } | null;
  moisture: ArrayLike<number>;
  entities: readonly { template: string; x: number; y: number }[];
}

export interface OpeningPicture {
  w: number;
  h: number;
  /** Each pixel's kind (`PIXEL`), rows top to bottom. */
  kind: Uint8Array;
  /** How far each pixel's ray went, in tiles (0 where it showed the void). */
  depth: Float32Array;
  /** Each pixel's tile (−1 for the void). */
  tile: Int32Array;
}

const TREES = new Set<string>(MAP_TREES);

/** A camera a picture is cast from (tile x, tile y, height in levels): its place, its look across the ground and the
 *  frame's right as unit grid directions, its pitch's sine and cosine, and the frame's half-width and half-height as
 *  tangents. */
export interface PictureCamera {
  eye: readonly [number, number, number];
  look: readonly [number, number];
  right: readonly [number, number];
  sinP: number;
  cosP: number;
  tanH: number;
  tanV: number;
}

/** The opening picture of `land` from `start` (D493's camera at `zoom`, the default zoom's widest by default). */
export function openingPicture(land: PictureLand, start: OpeningStart, opts: { w?: number; h?: number; zoom?: number } = {}): OpeningPicture {
  const cam = openingCamera(start, opts.zoom ?? VISTA_ZOOM);
  return castPicture(land, { eye: cam.eye, look: cam.look, right: cam.right, sinP: SIN_P, cosP: COS_P, tanH: TAN_H, tanV: TAN_V }, opts);
}

/** The picture of `land` from any camera (the map's own picture's framing, render3d/heroView.ts, as the opening's). */
export function castPicture(land: PictureLand, camera: PictureCamera, opts: { w?: number; h?: number } = {}): OpeningPicture {
  const w = opts.w ?? PICTURE_W;
  const h = opts.h ?? PICTURE_H;
  const { W, H, heights } = land;
  const N = W * H;
  const mask = land.mask ?? null;
  // each tile's highest solid voxel + 1, and its crown's top
  const top = new Int16Array(N);
  let zTop = 1;
  for (let i = 0; i < N; i++) {
    let t = heights[i];
    if (mask) {
      const m = mask[i] >>> 0;
      t = m ? 32 - Math.clz32(m) : 0;
    }
    top[i] = t;
  }
  const crown = new Int16Array(N).fill(-1);
  for (const e of land.entities) {
    if (!TREES.has(e.template) || e.x < 0 || e.y < 0 || e.x >= W || e.y >= H) continue;
    const i = e.y * W + e.x;
    crown[i] = top[i];
  }
  // the water's columns, each [floor, surface, contamination]
  const st = land.stack ?? null;
  const cols = (i: number, f: (floor: number, surface: number, c: number) => boolean): boolean => {
    if (st) {
      const n = st.count[i];
      for (let q = 0; q < n; q++) {
        const c = q * N + i;
        const d = st.depth[c];
        if (d > 0.05 && f(st.floor[c], st.floor[c] + d, st.contamination[c])) return true;
      }
      return false;
    }
    const d = land.water[i];
    return d > 0.05 && f(heights[i], heights[i] + d, land.contamination[i]);
  };
  for (let i = 0; i < N; i++) {
    let t = Math.max(top[i], crown[i] >= 0 ? crown[i] + CROWN : 0);
    cols(i, (_f, s) => {
      if (s > t) t = s;
      return false;
    });
    if (t > zTop) zTop = t;
  }
  zTop += 1;
  const solid = mask ? (i: number, z: number) => z >= 0 && z < 32 && ((mask[i] >>> z) & 1) === 1 : (i: number, z: number) => z < heights[i];
  const [ex, ey, ez] = camera.eye;
  const [lx, ly] = camera.look;
  const [rx, ry] = camera.right;
  const { sinP, cosP, tanH: TAN_H, tanV: TAN_V } = camera;
  // the camera's axes: forward (look × cos p, down sin p), up (look × sin p, cos p), right
  const fwd = [lx * cosP, ly * cosP, -sinP];
  const up = [lx * sinP, ly * sinP, cosP];
  const kind = new Uint8Array(w * h);
  const depth = new Float32Array(w * h);
  const tileOf = new Int32Array(w * h).fill(-1);
  for (let py = 0; py < h; py++) {
    const v = 1 - ((py + 0.5) * 2) / h;
    for (let px = 0; px < w; px++) {
      const u = ((px + 0.5) * 2) / w - 1;
      let dx = fwd[0] + u * TAN_H * rx + v * TAN_V * up[0];
      let dy = fwd[1] + u * TAN_H * ry + v * TAN_V * up[1];
      let dz = fwd[2] + v * TAN_V * up[2];
      const len = sqrt(dx * dx + dy * dy + dz * dz);
      dx /= len;
      dy /= len;
      dz /= len;
      const p = py * w + px;
      const hit = cast(ex, ey, ez, dx, dy, dz);
      if (!hit) continue;
      kind[p] = hit.kind;
      depth[p] = hit.t;
      tileOf[p] = hit.tile;
    }
  }
  return { w, h, kind, depth, tile: tileOf };

  /** The ray from (ox, oy, oz) along the unit (dx, dy, dz): what it meets first, and how far. */
  function cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { kind: PixelKind; t: number; tile: number } | null {
    // into the box the map stands in: [0, W] × [0, H] × [0, zTop]
    let t0 = 0;
    let t1 = Infinity;
    const slab = (o: number, d: number, lo: number, hi: number): boolean => {
      if (d === 0) return o >= lo && o <= hi;
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      return t0 <= t1;
    };
    if (!slab(ox, dx, 0, W) || !slab(oy, dy, 0, H) || !slab(oz, dz, 0, zTop)) return null;
    const eps = 1e-9;
    let t = t0 + eps;
    let x = Math.floor(ox + dx * t);
    let y = Math.floor(oy + dy * t);
    let z = Math.floor(oz + dz * t);
    if (x >= W) x = W - 1;
    if (y >= H) y = H - 1;
    if (z >= zTop) z = zTop - 1;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let nx = dx !== 0 ? ((dx > 0 ? x + 1 : x) - ox) / dx : Infinity;
    let ny = dy !== 0 ? ((dy > 0 ? y + 1 : y) - oy) / dy : Infinity;
    let nz = dz !== 0 ? ((dz > 0 ? z + 1 : z) - oz) / dz : Infinity;
    // which face the ray came in by: 0 the top or bottom, 1 a side
    let side = 0;
    for (;;) {
      if (x < 0 || y < 0 || x >= W || y >= H || z < 0) return null;
      if (z < zTop) {
        const i = y * W + x;
        const out = Math.min(nx, ny, nz);
        if (solid(i, z)) {
          if (side) return { kind: PIXEL.cliff, t, tile: i };
          const m = land.moisture[i];
          const desert = m > 0 ? (m < GRASS_RULE.threshold ? (1 - m / GRASS_RULE.threshold) * GRASS_RULE.max : 0) : 1;
          return { kind: desert <= 0.5 ? PIXEL.grass : PIXEL.dry, t, tile: i };
        }
        // a tree's crown
        if (crown[i] >= 0 && z >= crown[i] && z < crown[i] + CROWN) return { kind: PIXEL.tree, t, tile: i };
        // water in this cell: the ray's lowest point in it (where it leaves, going down) under a column's surface
        const zOut = oz + dz * out;
        const zIn = oz + dz * t;
        let wet = null as { kind: PixelKind; t: number; tile: number } | null;
        cols(i, (floor, surface, c) => {
          if (z < floor || z >= surface) return false;
          const lo = Math.min(zIn, zOut);
          if (lo >= surface) return false;
          const at = zIn <= surface ? t : dz !== 0 ? (surface - oz) / dz : t;
          wet = { kind: c >= 0.5 ? PIXEL.badwater : PIXEL.water, t: at, tile: i };
          return true;
        });
        if (wet) return wet;
      }
      if (nx <= ny && nx <= nz) {
        x += sx;
        t = nx;
        nx += tdx;
        side = 1;
      } else if (ny <= nz) {
        y += sy;
        t = ny;
        ny += tdy;
        side = 1;
      } else {
        z += sz;
        t = nz;
        nz += tdz;
        side = 0;
      }
      if (t > t1 + 1) return null;
    }
  }
}

/** The weights of the looks score's measures (each measure 0–1): each measure's rank agreement with a fresh eye's
 *  ranking of the pictures of 14 maps (docs/progress/showcase-looks.md, the training half of 28), rounded. A focal
 *  point near the thirds counted against the eye's ranking there, and Showcase's landmark beat already counts one, so
 *  the picture does not. */
export const LOOKS = {
  depth: 0.15,
  water: 0.05,
  cliffs: 0.15,
  green: 0.4,
  trees: 0.7,
  void: -0.8,
  bare: -0.2,
} as const;

export interface LooksScore {
  score: number;
  /** Each measure, 0–1. */
  depth: number;
  water: number;
  cliffs: number;
  green: number;
  trees: number;
  void: number;
  bare: number;
}

/** How much farther, in tiles, the land just above a pixel must be for the pixel to be a silhouette: a ridge or a
 *  ledge standing in front of land it hides. The opening camera looks down at 60° from about 154 tiles off, so a
 *  silhouette hides a few tiles, never a share of the distance; 4 tiles is a few levels of rise (128² maps: 0.6 to
 *  2.6 such silhouettes a column). */
const SILHOUETTE = 4;
/** The scales each share is read against (raw shares of twelve 128² maps, generator 0.10.11): the picture's sky
 *  beyond the map is 34 to 57% of a 128² map's frame at the widest zoom, so only what is over 30% counts. */
const SCALE = { depth: 2.5, water: 0.2, cliffs: 0.08, trees: 0.06, voidFrom: 0.3, voidSpan: 0.3 } as const;

/** The looks of an opening picture (`LOOKS`). */
export function looksScore(pic: OpeningPicture): LooksScore {
  const { w, h, kind, depth } = pic;
  const n = w * h;
  const share = new Float64Array(7);
  for (let p = 0; p < n; p++) share[kind[p]]++;
  for (let k = 0; k < 7; k++) share[k] /= n;
  // land in depth: up each column of the picture, the silhouettes where nearer land stands against land it hides (a
  // jump in distance)
  let layers = 0;
  for (let px = 0; px < w; px++)
    for (let py = h - 1; py > 0; py--) {
      const a = py * w + px;
      const b = a - w;
      if (kind[a] !== PIXEL.void && kind[b] !== PIXEL.void && depth[b] - depth[a] > SILHOUETTE) layers++;
    }
  const depthLayers = Math.min(1, layers / w / SCALE.depth);
  const ground = share[PIXEL.grass] + share[PIXEL.dry] + share[PIXEL.cliff] + share[PIXEL.tree];
  const m = {
    depth: depthLayers,
    water: Math.min(1, (share[PIXEL.water] + 0.5 * share[PIXEL.badwater]) / SCALE.water),
    cliffs: Math.min(1, share[PIXEL.cliff] / SCALE.cliffs),
    green: ground > 0 ? Math.min(1, share[PIXEL.grass] / ground / 0.5) : 0,
    trees: Math.min(1, share[PIXEL.tree] / SCALE.trees),
    void: Math.min(1, Math.max(0, share[PIXEL.void] - SCALE.voidFrom) / SCALE.voidSpan),
    bare: ground > 0 ? Math.min(1, Math.max(0, share[PIXEL.dry] / ground - 0.5) / 0.5) : 0,
  };
  const score = LOOKS.depth * m.depth + LOOKS.water * m.water + LOOKS.cliffs * m.cliffs + LOOKS.green * m.green + LOOKS.trees * m.trees + LOOKS.void * m.void + LOOKS.bare * m.bare;
  return { score, ...m };
}
