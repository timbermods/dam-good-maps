// What the map's picture (D488, `hero.ts`) draws, and from where: the game's own camera and light for a map's
// picture, as plain data (no three.js, no page), so it is tested headless.
//
// - **The camera** frames the map (amended 2026-11-07, showcase craft's look gap 2: the game's opening camera, centred
//   on a start near an edge, showed the backdrop past the map in half its frame). It is the game's own map thumbnail
//   camera (`ThumbnailCameraDefaultPositionProvider`: 40° down, face-on, the game camera's 35° field of view), turned
//   to the start's orientation (the side the colony faces, where the landmark is steered, D502; north without a
//   start), centred across the land and pulled back only as far as the frame's corners still land on the map at the
//   ground's mean level: the map fills the picture, no backdrop past its edge (`heroCamera`). Along the map it slides,
//   within the room it has, to the place whose picture scores best by Showcase's looks score (core
//   `analysis/picture.ts` `looksScore`, D506: the measure fitted to the eye, cast from this camera; showcase craft's
//   twin falls, whose river runs near an edge), of `SLIDES` places; the map's middle where they score the same.
// - **The light** follows the camera, as the game's sun does (`Sun.GetCameraYAngle`: the sun's turn is the camera's
//   + `RotateWithCameraOffset`, 40°): the game's thumbnails are always lit from behind the camera's left shoulder. The
//   renderer's sun turns with its camera the same way (light.ts `sunOfYaw`), so the picture is the map as it is, from
//   that camera, under that sun (hero.ts bakes it at once: `MapRenderer.sunNow`).
// - **What shows** is what the game's thumbnail shows (`MapThumbnailCapturing`'s rendering listeners): the land,
//   the water, the objects; the starting location is hidden (`StartingLocationThumbnailRenderingListener`).

import { OPENING } from "../core/analysis/opening";
import { castPicture, looksScore, PIXEL, type PictureLand } from "../core/analysis/picture";
import { columnMasks, type EntityView, type MapView } from "./model";

/** The picture's camera, in the renderer's terms (`MapRenderer.setView`; world X east, Y up, Z south), and its
 *  vertical field of view in degrees. */
export interface HeroCamera {
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
  fov: number;
}

/** The game's default thumbnail camera's pitch (`ThumbnailCameraDefaultPositionProvider.DefaultRotation`). */
const PITCH = 40;
const deg = (d: number) => (d * Math.PI) / 180;

/** The picture's camera on a W × H map (`heights` its ground), turned to `orientation` (0–3: the start's, a quarter
 *  turn each; 0 looks north): 40° down, face-on, centred across the map, pulled back as far as the frame's four corners
 *  still land on the map at the ground's mean level (16:9, `OPENING.fov` high), so the land fills the frame. Along the
 *  map, where the frame has room to slide with no backdrop showing, it takes the best of `SLIDES` places by the looks
 *  score of `land`'s picture from each (`pictureLand`), the map's middle where they score the same. In tile terms:
 *  `x`, `y` the point looked at (tile x, tile y), `level` its height. */
export function heroCamera(W: number, H: number, heights: ArrayLike<number>, orientation: number, land: PictureLand | null = null): { x: number; y: number; level: number; distance: number; pitch: number; yaw: number } {
  let sum = 0;
  for (let i = 0; i < W * H; i++) sum += heights[i];
  const level = W * H ? sum / (W * H) : 0;
  const o = orientation & 3;
  const p = deg(PITCH);
  const tanV = Math.tan(deg(OPENING.fov / 2));
  const tanH = tanV * OPENING.aspect;
  // a corner ray (b 1 the frame's top, −1 its bottom) meets the ground's plane at t × the distance along it; where it
  // lands, along the look and across it, per unit of distance
  const t = (b: number) => Math.sin(p) / (Math.sin(p) - b * tanV * Math.cos(p));
  const along = (b: number) => -Math.cos(p) + t(b) * (Math.cos(p) + b * tanV * Math.sin(p));
  const far = along(1);
  const near = along(-1);
  // the map's length along the look and its width across it
  const [len, wide] = o % 2 === 0 ? [H, W] : [W, H];
  const distance = Math.min(len / (far - near), wide / (2 * tanH * t(1)));
  // the frame's footprint centred along the map (s: the point looked at, from the map's edge nearest the camera), or
  // slid within the room it has to where it shows the most interest
  const middle = len / 2 - (distance * (far + near)) / 2;
  const s = land ? slide(land, o, level, distance, p, tanH, tanV, -distance * near, len - distance * far, middle) : middle;
  const [x, y] = lookedAt(W, H, o, s);
  return { x, y, level, distance, pitch: p, yaw: -deg(o * 90) };
}

/** How many places along the map the picture's frame is scored at (each a picture cast, about 40 ms at 160 × 90). */
export const SLIDES = 5;

/** The point looked at (tile x, tile y) for orientation `o`, `s` along the map from its edge nearest the camera. */
const lookedAt = (W: number, H: number, o: number, s: number): [number, number] => (o === 0 ? [W / 2, s] : o === 1 ? [s, H / 2] : o === 2 ? [W / 2, H - s] : [W - s, H / 2]);

/** Of `SLIDES` places along the map from `lo` to `hi` (and its middle), the one whose picture from the camera scores
 *  best by the looks score among those that show no more of the backdrop past the map than the middle does; ties keep
 *  the place nearest the middle. */
function slide(land: PictureLand, o: number, level: number, d: number, p: number, tanH: number, tanV: number, lo: number, hi: number, middle: number): number {
  if (!(hi - lo > 1)) return middle;
  const a = (o * Math.PI) / 2;
  const look: [number, number] = [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
  const right: [number, number] = [look[1], -look[0]];
  const sinP = Math.sin(p);
  const cosP = Math.cos(p);
  const judge = (s: number) => {
    const [x, y] = lookedAt(land.W, land.H, o, s);
    const eye: [number, number, number] = [x - look[0] * d * cosP, y - look[1] * d * cosP, level + d * sinP];
    const pic = castPicture(land, { eye, look, right, sinP, cosP, tanH, tanV });
    let empty = 0;
    for (let k = 0; k < pic.kind.length; k++) if (pic.kind[k] === PIXEL.void) empty++;
    return { score: looksScore(pic).score, empty };
  };
  let best = middle;
  const here = judge(middle);
  let most = here.score;
  for (let k = 0; k < SLIDES; k++) {
    const s = lo + ((hi - lo) * k) / (SLIDES - 1);
    // (the middle, one of them where the room is even about it, is judged once)
    if (Math.abs(s - middle) < 1e-9) continue;
    const v = judge(s);
    // (never more of the backdrop than the middle shows: the room is worked out at the ground's mean level, so land
    // lower than that at its end can show a strip of it, which the looks score only weighs over 30%)
    if (v.empty > here.empty) continue;
    if (v.score > most + 1e-9 || (Math.abs(v.score - most) <= 1e-9 && Math.abs(s - middle) < Math.abs(best - middle))) {
      best = s;
      most = v.score;
    }
  }
  return best;
}

/** The map as the looks score reads it (core `analysis/picture.ts` `PictureLand`), from the view: its ground (every
 *  tile's voxels as a mask on a map with columns), its water on every column, its soil's moisture in the game's levels
 *  and its objects. */
export function pictureLand(view: MapView): PictureLand {
  const { W, H, heights, water } = view;
  const N = W * H;
  const listed = columnMasks(N, view.columns);
  let mask: Uint32Array | null = null;
  if (listed) {
    const listedAt = new Uint8Array(N);
    for (const t of view.columns.tiles) listedAt[t] = 1;
    mask = new Uint32Array(N);
    for (let i = 0; i < N; i++) mask[i] = listedAt[i] ? listed[i] : heights[i] >= 32 ? 0xffffffff : (1 << heights[i]) - 1;
  }
  // the water's columns, q × N + i for the q-th column of tile i
  const count = new Uint8Array(N);
  for (let k = 0; k < water.count; k++) count[water.tile[k]]++;
  let most = 0;
  for (let i = 0; i < N; i++) if (count[i] > most) most = count[i];
  const floor = new Float32Array(Math.max(1, most) * N);
  const depth = new Float32Array(Math.max(1, most) * N);
  const contamination = new Float32Array(Math.max(1, most) * N);
  const at = new Uint8Array(N);
  for (let k = 0; k < water.count; k++) {
    const i = water.tile[k];
    const c = at[i]++ * N + i;
    floor[c] = water.floor[k];
    depth[c] = water.depth[k];
    contamination[c] = water.contamination[k];
  }
  const moisture = new Float32Array(N);
  if (view.soil) for (let i = 0; i < N; i++) moisture[i] = view.soil.moisture[i] / 15;
  const e = view.entities;
  const entities = Array.from({ length: e.count }, (_, k) => ({ template: e.templates[e.template[k]], x: e.x[k], y: e.y[k] }));
  return { W, H, heights, mask, water: new Float32Array(N), contamination: new Float32Array(N), stack: { count, floor, depth, contamination }, moisture, entities };
}

/** The start (its corner tile, level and orientation 0–3), or null. */
function startOf(e: EntityView): { x: number; y: number; z: number; o: number } | null {
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return { x: e.x[k], y: e.y[k], z: e.z[k], o: e.orientation[k] & 3 };
  return null;
}

/** The view without its starting location (the game's thumbnail hides it). */
function withoutStart(e: EntityView): EntityView {
  const keep: number[] = [];
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] !== "StartingLocation") keep.push(k);
  if (keep.length === e.count) return e;
  const typed = <A extends Int16Array | Uint16Array | Uint8Array | Float32Array>(a: A): A => {
    const out = new (a.constructor as new (n: number) => A)(keep.length);
    keep.forEach((k, j) => (out[j] = a[k]));
    return out;
  };
  return {
    count: keep.length,
    templates: e.templates,
    owners: e.owners,
    template: typed(e.template),
    x: typed(e.x),
    y: typed(e.y),
    z: typed(e.z),
    orientation: typed(e.orientation),
    flags: typed(e.flags),
    owner: typed(e.owner),
    variant: typed(e.variant),
    strength: typed(e.strength),
    ids: keep.map((k) => e.ids[k] ?? ""),
  };
}

/** What the picture draws (the map, its start hidden) and the camera it draws it from. */
export function heroScene(view: MapView): { view: MapView; camera: HeroCamera } {
  const { W, H } = view;
  const s = startOf(view.entities);
  const c = heroCamera(W, H, view.heights, s ? s.o : 0, pictureLand(view));
  const camera: HeroCamera = { yaw: c.yaw, pitch: c.pitch, distance: c.distance, target: [c.x, c.level, -c.y], fov: OPENING.fov };
  return { view: { ...view, entities: withoutStart(view.entities) }, camera };
}
