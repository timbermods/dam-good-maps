// A stand of the map's own ruins in the colony's opening view (D493, planning's ruling of 2026-11-20 on #236).
//
// The view is D493's frame: the game's first camera pulled back to the default zoom's widest, `VISTA_ZOOM`
// (analysis/opening.ts), keeping the start's turn and target, what a player sees once they pull back. The bundled maps'
// nearest stand of ruins stands about 42 tiles from the start, ahead along that camera's look, a few levels over the
// start (19 maps, read locally, numbers only); the generator's own fields keep 22 tiles off and land anywhere. This
// plans one stand there, a place to go:
//  - on dry ground only (green is for crops and trees), its whole self in the pulled-back frame and its ground seen
//    from the camera (the picture's rays), past Normal's clear distance (`ruinsWithin` + 1 straight tiles from the
//    start's 3 × 3, `start.ruins_clear`'s own reading), never between the start and its water (the ellipse round the
//    start's walk to its nearest shore), two tiles off the water and off the map's other fields, and on a map that
//    draws the two-ways intention past its reach (gen/resources.ts `standBeyond`), so the stand never tips its sides;
//  - ahead along the look and raised first (the bundled maps' 42 tiles out, 3 levels up), then ahead, then raised;
//    within each, a step's foot (a higher level within 2 tiles), a rise (ground over the start's level), a level's rim,
//    the far side of the water (water on the straight line from the start), in that order; nearer 42 tiles first;
//  - grown as the generator's fields are (D518): a band along its level's rim, 2 to 4 tiles wide, its edge ragged and
//    12 to 22 % of it left as gaps, its size drawn round the bundled maps' nearest stands (median about 20 columns),
//    kept in one piece of 10 or more (`ruins.fields`), never a row (its long axis at most 2.4 × its short one, the
//    bundled stands' range).
// A map whose view offers no such place keeps its ruins as they are.
import * as portable from "../math/portable";
import { castPicture, PIXEL } from "../analysis/picture";
import { COS_P, frameAt, openingCamera, SIN_P, TAN_H, TAN_V, VISTA_ZOOM } from "../analysis/opening";
import type { Orientation } from "../format/footprints";
import { distanceFrom, N8 } from "../math/grid";
import type { Rng } from "../math/rng";
import { growBlob, punchHoles } from "./blobs";
import { RUIN_BAND, rimDistance, type BaselineGround } from "../resources/baseline";

export const FRAME_STAND = {
  /** The pulled-back picture the stand's ground is read from. */
  picture: [480, 270] as const,
  /** The whole stand within this share of the frame's half-width and half-height (its tallest column's top too). */
  inside: 0.92,
  /** Columns: a log-normal round the bundled maps' nearest stands' median, kept to their middle range. */
  columns: { median: 20, sigma: 0.4, least: 12, most: 36 },
  /** The stand's long axis over its short one, at most: the bundled stands' 1.0 to 2.4 (but one), so never a row. */
  elongation: 2.4,
  /** The ellipse round the start's walk to its water: a tile whose distances to the start and the shore sum to under
   *  the start's own distance to the shore plus this is between them. */
  between: 6,
  /** Ahead: within this angle of the camera's look (its cosine). */
  ahead: 0.7,
  /** The bundled maps' nearest stand, tiles from the start, and how far either side of it a seed is as good. */
  distance: 42,
  spread: 20,
  tries: 24,
} as const;

const sq = (v: number) => v * v;

export type StandPlace = "step" | "rise" | "rim" | "far";
const PLACES: readonly StandPlace[] = ["step", "rise", "rim", "far"];

export interface FrameStand {
  tiles: number[];
  place: StandPlace;
  /** Ahead along the look, raised over the start's level. */
  ahead: boolean;
  raised: boolean;
  tallness: number;
}

/** `mask` set on the tiles within `ring` tiles (Chebyshev) of `tiles`, the tiles too. */
export function markAround(mask: Uint8Array, tiles: readonly number[], W: number, H: number, ring: number): void {
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) mask[(y + dy) * W + x + dx] = 1;
  }
}

/** The stand's tiles, or null where the pulled-back view holds no place for one. `free` is the ground it may take,
 *  `moist` the green, `startDist` the straight distance from the start's 3 × 3, `walk` the colony's walk from it, `clear`
 *  the least distance from the start. */
export function planFrameStand(
  g: BaselineGround & { entities: readonly { template: string; x: number; y: number }[] },
  start: { x: number; y: number; z: number; orientation: Orientation },
  free: Uint8Array,
  moist: Uint8Array,
  startDist: Float64Array,
  walk: Float64Array | null,
  clear: number,
  rng: Rng,
): FrameStand | null {
  const { W, H, heights: h } = g;
  const N = W * H;
  const wet = (i: number) => g.water[i] > 0;
  // the tiles whose ground the pulled-back view shows
  const cam = openingCamera(start, VISTA_ZOOM);
  const [pw, ph] = FRAME_STAND.picture;
  const pic = castPicture({ W, H, heights: h, water: g.water, contamination: new Float64Array(N), moisture: g.moisture, entities: g.entities }, { eye: cam.eye, look: cam.look, right: cam.right, sinP: SIN_P, cosP: COS_P, tanH: TAN_H, tanV: TAN_V }, { w: pw, h: ph });
  const seen = new Uint8Array(N);
  for (let p = 0; p < pw * ph; p++) if (pic.tile[p] >= 0 && (pic.kind[p] === PIXEL.dry || pic.kind[p] === PIXEL.grass)) seen[pic.tile[p]] = 1;
  const inside = (i: number) => {
    const x = (i % W) + 0.5, y = Math.floor(i / W) + 0.5;
    const lim = FRAME_STAND.inside;
    for (const z of [h[i], h[i] + 8]) {
      const p = frameAt(cam, x, y, z);
      if (!p || Math.abs(p.u) > lim || Math.abs(p.v) > lim) return false;
    }
    return true;
  };
  // the start's water: the shore its walk reaches first
  let shore = -1;
  if (walk) {
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      if (wet(i) || !(walk[i] < best)) continue;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && wet(yy * W + xx)) {
          best = walk[i];
          shore = i;
          break;
        }
      }
    }
  }
  const sx = start.x + 0.5, sy = start.y + 0.5;
  const shoreX = shore >= 0 ? (shore % W) + 0.5 : 0, shoreY = shore >= 0 ? Math.floor(shore / W) + 0.5 : 0;
  const toShore = shore >= 0 ? portable.sqrt(sq(shoreX - sx) + sq(shoreY - sy)) : 0;
  const between = (x: number, y: number) =>
    shore >= 0 && portable.sqrt(sq(x + 0.5 - sx) + sq(y + 0.5 - sy)) + portable.sqrt(sq(x + 0.5 - shoreX) + sq(y + 0.5 - shoreY)) < toShore + FRAME_STAND.between;
  // a column needs a dry neighbour at its level (two tiles off the water, as the fields keep)
  const wetMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) wetMask[i] = wet(i) ? 1 : 0;
  const waterDist = distanceFrom(wetMask, W, H);
  const ok = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!free[i] || moist[i] || wet(i) || waterDist[i] < 2 || startDist[i] < clear || between(x, y)) continue;
      ok[i] = 1;
    }
  const rim = rimDistance(g, RUIN_BAND.width[1] + 1);
  const placeOf = (i: number): StandPlace | null => {
    if (!ok[i] || !seen[i] || rim[i] < 1 || rim[i] > RUIN_BAND.width[1] || !inside(i)) return null;
    const x = i % W, y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && !wet(yy * W + xx) && h[yy * W + xx] > h[i]) return "step";
      }
    if (h[i] > start.z) return "rise";
    const n = Math.ceil(portable.sqrt(sq(x - start.x) + sq(y - start.y)));
    for (let s = 2; s < n; s++) {
      const xx = Math.round(start.x + ((x - start.x) * s) / n), yy = Math.round(start.y + ((y - start.y) * s) / n);
      if (wet(yy * W + xx)) return "far";
    }
    return "rim";
  };
  const isAhead = (i: number) => {
    const dx = (i % W) + 0.5 - sx, dy = Math.floor(i / W) + 0.5 - sy;
    return dx * cam.look[0] + dy * cam.look[1] >= FRAME_STAND.ahead * portable.sqrt(dx * dx + dy * dy);
  };
  // the pools: (ahead and raised, ahead, raised, the rest) × the places in order
  const pools: number[][] = [];
  for (let k = 0; k < 4 * PLACES.length; k++) pools.push([]);
  for (let i = 0; i < N; i++) {
    const p = placeOf(i);
    if (!p) continue;
    const a = isAhead(i), r = h[i] > start.z;
    const tier = a && r ? 0 : a ? 1 : r ? 2 : 3;
    pools[tier * PLACES.length + PLACES.indexOf(p)].push(i);
  }
  const c = FRAME_STAND.columns;
  for (const pool of pools) {
    if (!pool.length) continue;
    // (nearer the bundled maps' distance first)
    const weights = pool.map((i) => {
      const d = portable.sqrt(sq((i % W) + 0.5 - sx) + sq(Math.floor(i / W) + 0.5 - sy));
      const t = (d - FRAME_STAND.distance) / FRAME_STAND.spread;
      return 1 / (1 + t * t);
    });
    for (let tries = 0; tries < FRAME_STAND.tries; tries++) {
      const s = pool[rng.weighted(weights)];
      const size = Math.max(c.least, Math.min(c.most, Math.round(rng.logNormal(c.median, c.sigma))));
      const width = RUIN_BAND.width[0] + rng.int(0, RUIN_BAND.width[1] - RUIN_BAND.width[0] + 1);
      const gaps = RUIN_BAND.gaps[0] + (RUIN_BAND.gaps[1] - RUIN_BAND.gaps[0]) * rng.float();
      const want = Math.floor(size / (1 - gaps));
      // a band along the seed's level's rim, within 10 tiles of it, its whole self in the frame
      const band = new Uint8Array(N);
      const x0 = s % W, y0 = (s - x0) / W;
      let have = 0;
      for (let y = Math.max(0, y0 - 10); y <= Math.min(H - 1, y0 + 10); y++)
        for (let x = Math.max(0, x0 - 10); x <= Math.min(W - 1, x0 + 10); x++) {
          const i = y * W + x;
          if (ok[i] && h[i] === h[s] && rim[i] >= 1 && rim[i] <= width && inside(i)) {
            band[i] = 1;
            have++;
          }
        }
      if (have < want) continue;
      let tiles = growBlob(rng, band, W, H, s, want, 1.5);
      tiles = punchHoles(rng, tiles, W, gaps);
      tiles = largestPiece(tiles, W);
      if (tiles.length < Math.max(10, Math.floor(size * 0.7))) continue;
      if (elongation(tiles, W) > FRAME_STAND.elongation) continue;
      // (it stands to be seen from afar: most of its columns three storeys or more, as the bundled stands')
      const tallness = Math.round(rng.range(0.1, 0.7) * 1000) / 1000;
      tiles.sort((a, b) => a - b);
      return { tiles, place: placeOf(s)!, ahead: isAhead(s), raised: h[s] > start.z, tallness };
    }
  }
  return null;
}

/** The largest 8-connected piece of `tiles` (a field the checks count is one piece). */
function largestPiece(tiles: readonly number[], W: number): number[] {
  const set = new Set(tiles);
  const done = new Set<number>();
  let best: number[] = [];
  for (const t of tiles) {
    if (done.has(t)) continue;
    const q = [t];
    done.add(t);
    for (let k = 0; k < q.length; k++) {
      const x = q[k] % W, y = (q[k] - x) / W;
      for (const [dx, dy] of N8) {
        const j = (y + dy) * W + x + dx;
        if (x + dx < 0 || x + dx >= W || !set.has(j) || done.has(j)) continue;
        done.add(j);
        q.push(j);
      }
    }
    if (q.length > best.length) best = q;
  }
  return best;
}

/** The long axis over the short one, by the tiles' second moments. */
export function elongation(tiles: readonly number[], W: number): number {
  const n = tiles.length;
  let mx = 0, my = 0;
  for (const t of tiles) {
    mx += t % W;
    my += (t - (t % W)) / W;
  }
  mx /= n;
  my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const t of tiles) {
    const x = (t % W) - mx, y = (t - (t % W)) / W - my;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const tr = (sxx + syy) / n, det = (sxx * syy - sxy * sxy) / (n * n);
  const d = portable.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l2 = tr / 2 - d;
  return l2 > 1e-6 ? portable.sqrt((tr / 2 + d) / l2) : Infinity;
}
