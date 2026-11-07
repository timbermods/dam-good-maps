// What the map's picture (D488, `hero.ts`) draws, and from where: the game's own camera and light for a map's
// picture, as plain data (no three.js, no page), so it is tested headless.
//
// - **The camera** frames the map (amended 2026-11-07, showcase craft's look gap 2: the game's opening camera, centred
//   on a start near an edge, showed the backdrop past the map in half its frame). It is the game's own map thumbnail
//   camera (`ThumbnailCameraDefaultPositionProvider`: 40° down, face-on, the game camera's 35° field of view), turned
//   to the start's orientation (the side the colony faces, where the landmark is steered, D502; north without a
//   start), centred on the land and pulled back only as far as the frame's corners still land on the map at the
//   ground's mean level: the map fills the picture, no backdrop past its edge (`heroCamera`).
// - **The light** follows the camera, as the game's sun does (`Sun.GetCameraYAngle`: the sun's turn is the camera's
//   + `RotateWithCameraOffset`, 40°): the game's thumbnails are always lit from behind the camera's left shoulder. The
//   renderer's sun turns with its camera the same way (light.ts `sunOfYaw`), so the picture is the map as it is, from
//   that camera, under that sun (hero.ts bakes it at once: `MapRenderer.sunNow`).
// - **What shows** is what the game's thumbnail shows (`MapThumbnailCapturing`'s rendering listeners): the land,
//   the water, the objects; the starting location is hidden (`StartingLocationThumbnailRenderingListener`).

import { OPENING } from "../core/analysis/opening";
import type { EntityView, MapView } from "./model";

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
 *  turn each; 0 looks north): 40° down, face-on, centred across the map and along it so the land fills the frame
 *  (16:9, `OPENING.fov` high), pulled back as far as the frame's four corners still land on the map at the ground's
 *  mean level. In tile terms: `x`, `y` the point looked at (tile x, tile y), `level` its height. */
export function heroCamera(W: number, H: number, heights: ArrayLike<number>, orientation: number): { x: number; y: number; level: number; distance: number; pitch: number; yaw: number } {
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
  // the frame's footprint centred along the map (s: the point looked at, from the map's edge nearest the camera)
  const s = len / 2 - (distance * (far + near)) / 2;
  const [x, y] = o === 0 ? [W / 2, s] : o === 1 ? [s, H / 2] : o === 2 ? [W / 2, H - s] : [W - s, H / 2];
  return { x, y, level, distance, pitch: p, yaw: -deg(o * 90) };
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
  const c = heroCamera(W, H, view.heights, s ? s.o : 0);
  const camera: HeroCamera = { yaw: c.yaw, pitch: c.pitch, distance: c.distance, target: [c.x, c.level, -c.y], fov: OPENING.fov };
  return { view: { ...view, entities: withoutStart(view.entities) }, camera };
}
