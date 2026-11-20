// A stand of the map's own ruins in the game's first frame (D493's first step; prototype, generator 0.10.54).
//
// The game's first camera (analysis/opening.ts `openingCamera`, the start's turn at zoom z × 0.1) frames about 30
// tiles across round the start, from about 9 tiles behind it to 13 ahead on its own level. The map's ruin fields keep
// 22 tiles from the start (`nearStartTargets` `ruinsClear`), so none stands in that frame. This plans one stand there:
//  - on ground the frame shows (the picture's rays, cast at 320 × 180 without the stand), past Normal's clear distance
//    (`ruinsWithin` + 1 straight tiles from the start's 3 × 3, `start.ruins_clear`'s own reading);
//  - on dry ground, where the land offers a place: the foot of a step (a higher level within 2 tiles), a rise (ground
//    above the start's level) or the far side of the water (water on the straight line from the start); a plain dry
//    rim band where it offers none of those, the green off the start's level where the frame holds no dry ground;
//  - never between the start and its water (the ellipse round the start's walk to its nearest shore), never on the
//    start's room (past the clear distance, beyond its 14 tiles), and on the start's own green only as a last resort;
//  - grown as the generator's fields are (D518): a band along its level's rim, 2 to 4 tiles wide, its edge ragged and
//    12 to 22 % of it left as gaps, its size drawn from the bundled maps' nearest stands (median about 20 columns),
//    kept in one piece of 10 or more (`ruins.fields`), never a row (its long axis at most 3 × its short one; the bundled stands 1.0 to 2.4 but one).
import * as portable from "../math/portable";
import { castPicture, PIXEL } from "../analysis/picture";
import { COS_P, frameAt, openingCamera, SIN_P, TAN_H, TAN_V } from "../analysis/opening";
import type { Orientation } from "../format/footprints";
import { distanceFrom, N8 } from "../math/grid";
import type { Rng } from "../math/rng";
import { growBlob, punchHoles } from "./blobs";
import { RUIN_BAND, rimDistance, type BaselineGround } from "../resources/baseline";

/** (prototype only: the measure turns the stand off for its before and reads each stand's place) */
export const frameStandSwitch = { on: true, places: new Map<string, string>(), debug: [] as string[] };

export const FRAME_STAND = {
  /** The picture the candidate tiles are read from. */
  picture: [320, 180] as const,
  /** Columns: a log-normal round the bundled maps' nearest stands' median, kept to their middle range. */
  columns: { median: 20, sigma: 0.4, least: 12, most: 36 },
  /** The stand's long axis over its short one, at most (never a row). */
  elongation: 3,
  /** The ellipse round the start's walk to its water: a tile whose distances to the start and the shore sum to under
   *  the start's own distance to the shore plus this is between them. */
  between: 6,
  tries: 24,
} as const;

const sq = (v: number) => v * v;

export type StandPlace = "step" | "rise" | "far" | "rim" | "green" | "edge";

export interface FrameStand {
  tiles: number[];
  place: StandPlace;
  tallness: number;
}

/** The stand's tiles, or null where the first frame holds no place for one. `free` is the ground nothing has taken yet,
 *  `moist` the green, `startDist` the straight distance from the start's 3 × 3, `walk` the colony's walk from it. */
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
  // the tiles whose ground the first frame shows
  const cam = openingCamera(start);
  const [pw, ph] = FRAME_STAND.picture;
  const pic = castPicture({ W, H, heights: h, water: g.water, contamination: new Float64Array(N), moisture: g.moisture, entities: g.entities }, { eye: cam.eye, look: cam.look, right: cam.right, sinP: SIN_P, cosP: COS_P, tanH: TAN_H, tanV: TAN_V }, { w: pw, h: ph });
  const seen = new Uint8Array(N);
  for (let p = 0; p < pw * ph; p++) if (pic.tile[p] >= 0 && (pic.kind[p] === PIXEL.dry || pic.kind[p] === PIXEL.grass)) seen[pic.tile[p]] = 1;
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
  const startLevel = start.z;
  const ok = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!free[i] || wet(i) || waterDist[i] < 2 || startDist[i] < clear || between(x, y)) continue;
      ok[i] = 1;
    }
  // the places the land offers, among the tiles the frame shows
  const rim = rimDistance(g, RUIN_BAND.width[1] + 1);
  const placeOf = (i: number): StandPlace | null => {
    if (!ok[i] || rim[i] < 1 || rim[i] > RUIN_BAND.width[1]) return null;
    // (its ground in the frame, or a column three storeys tall standing into it over the frame's edge)
    if (!seen[i]) {
      const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, h[i] + 3);
      if (!p || Math.abs(p.u) > 0.9 || p.v > 0.85 || p.v < -0.9) return null;
    }
    const x = i % W, y = (i - x) / W;
    // (the green: off the start's level, or on it past the room, `clear` being past the room's 14 tiles: its edge)
    if (moist[i]) return h[i] !== startLevel ? "green" : "edge";
    // the far side of the water: water on the straight line from the start
    const n = Math.ceil(portable.sqrt(sq(x - start.x) + sq(y - start.y)));
    for (let s = 2; s < n; s++) {
      const xx = Math.round(start.x + ((x - start.x) * s) / n), yy = Math.round(start.y + ((y - start.y) * s) / n);
      if (wet(yy * W + xx)) return "far";
    }
    if (h[i] > startLevel) return "rise";
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && !wet(yy * W + xx) && h[yy * W + xx] > h[i]) return "step";
      }
    return "rim";
  };
  const byPlace: Record<StandPlace, number[]> = { step: [], rise: [], far: [], rim: [], green: [], edge: [] };
  for (let i = 0; i < N; i++) {
    const p = placeOf(i);
    if (p) byPlace[p].push(i);
  }
  const offered = [...byPlace.step, ...byPlace.rise, ...byPlace.far];
  // (each kind of place with its ground in the frame first, then those whose columns stand into it over its edge)
  const pools = [offered, byPlace.rim, byPlace.green, byPlace.edge].flatMap((p) => [p.filter((i) => seen[i]), p.filter((i) => !seen[i])]);
  const c = FRAME_STAND.columns;
  for (const pool of pools) {
    for (let tries = 0; tries < FRAME_STAND.tries && pool.length; tries++) {
      const s = pool[rng.int(0, pool.length)];
      const size = Math.max(c.least, Math.min(c.most, Math.round(rng.logNormal(c.median, c.sigma))));
      const width = RUIN_BAND.width[0] + rng.int(0, RUIN_BAND.width[1] - RUIN_BAND.width[0] + 1);
      const gaps = RUIN_BAND.gaps[0] + (RUIN_BAND.gaps[1] - RUIN_BAND.gaps[0]) * rng.float();
      const want = Math.floor(size / (1 - gaps));
      // a band along the seed's level's rim (its whole level on a green or a small rise), within 10 tiles of it
      const band = new Uint8Array(N);
      const level0 = h[s];
      const x0 = s % W, y0 = (s - x0) / W;
      let have = 0;
      for (let y = Math.max(0, y0 - 10); y <= Math.min(H - 1, y0 + 10); y++)
        for (let x = Math.max(0, x0 - 10); x <= Math.min(W - 1, x0 + 10); x++) {
          const i = y * W + x;
          if (ok[i] && h[i] === level0 && !!moist[i] === !!moist[s] && rim[i] >= 1 && rim[i] <= width) {
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
      // (the stand stands tall enough to read: half of its columns three storeys or more, as the bundled stands')
      const tallness = Math.round(rng.range(0.1, 0.7) * 1000) / 1000;
      const place = placeOf(s)!;
      tiles.sort((a, b) => a - b);
      frameStandSwitch.places.set(`${tiles[0]}:${tiles.length}`, place);
      return { tiles, place, tallness };
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
