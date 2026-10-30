// What the map's picture (D488, `hero.ts`) draws, and from where: the game's own camera and light for a map's
// picture, as plain data (no three.js, no page), so it is tested headless.
//
// - **The camera** is the new game's opening camera (core `analysis/opening.ts`, the game's `CameraService` and
//   `StartingBuildingInitializer.SetCamera`): 60° down, turned to the start's orientation + 35°, on the district
//   center, with the game camera's 35° field of view, pulled back to the default zoom's widest (`VISTA_ZOOM`): the
//   frame the start is turned for (D493) and the landmark is steered into, what a player sees of the land round the
//   colony before they first turn the camera. (At the opening zoom itself the frame holds only about 30 × 45 tiles
//   round the start.) A map without a start takes the game's default map thumbnail camera
//   (`ThumbnailCameraDefaultPositionProvider`): 40° down, looking north, from the map's width away from its middle
//   at the ground's foot.
// - **The light** follows the camera, as the game's sun does (`Sun.GetCameraYAngle`: the sun's turn is the camera's
//   + `RotateWithCameraOffset`, 40°): the game's thumbnails are always lit from behind the camera's left shoulder. The
//   renderer's sun turns with its camera the same way (light.ts `sunOfYaw`), so the picture is the map as it is, from
//   that camera, under that sun (hero.ts bakes it at once: `MapRenderer.sunNow`).
// - **What shows** is what the game's thumbnail shows (`MapThumbnailCapturing`'s rendering listeners): the land,
//   the water, the objects; the starting location is hidden (`StartingLocationThumbnailRenderingListener`).

import { openingCamera, OPENING, VISTA_ZOOM } from "../core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../core/format/footprints";
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
const DEFAULT_PITCH = 40;
const deg = (d: number) => (d * Math.PI) / 180;

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
  let camera: HeroCamera;
  if (s) {
    const orientation = ORIENTATIONS[s.o];
    const [mx, my] = startMiddleTile({ x: s.x, y: s.y, z: s.z, orientation });
    const cam = openingCamera({ x: mx, y: my, z: s.z, orientation }, VISTA_ZOOM);
    camera = { yaw: -deg(s.o * 90 + OPENING.turn), pitch: deg(OPENING.pitch), distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]], fov: OPENING.fov };
  } else {
    // (the game's camera stands the map's width back from its middle at the foot of the ground, looking north)
    camera = { yaw: 0, pitch: deg(DEFAULT_PITCH), distance: W, target: [W / 2, 0, -H / 2], fov: OPENING.fov };
  }
  return { view: { ...view, entities: withoutStart(view.entities) }, camera };
}
