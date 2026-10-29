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
//   + `RotateWithCameraOffset`, 40°): the game's thumbnails are always lit from behind the camera's left shoulder.
//   The view's sun is fixed (from the north-west, `LIGHT`, baked into its shadows), so the picture turns the map
//   under it instead, in quarter turns, the one that puts the sun nearest where the game's would be (within 30°).
//   The camera is then set on the turned map exactly as on the map itself, so the picture frames the same land.
// - **What shows** is what the game's thumbnail shows (`MapThumbnailCapturing`'s rendering listeners): the land,
//   the water, the objects; the starting location is hidden (`StartingLocationThumbnailRenderingListener`).

import { openingCamera, OPENING, VISTA_ZOOM } from "../core/analysis/opening";
import { coordinatesForMinCorner, FOOTPRINTS, ORIENTATIONS, startMiddleTile } from "../core/format/footprints";
import { LAYERS, type EntityView, type MapView, type RunSoilView, type SoilView, type WaterView } from "./model";
import { LIGHT } from "./palette";

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
/** The game's sun turns with the camera: its turn is the camera's + this (SkySystem `SunSpec.RotateWithCameraOffset`). */
const SUN_OFFSET = 40;

/** Compass degrees (clockwise from north) the view's sun stands toward. */
const VIEW_SUN = (Math.atan2(LIGHT.sunAzimuth[0], LIGHT.sunAzimuth[1]) * 180) / Math.PI;

const deg = (d: number) => (d * Math.PI) / 180;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The start (its corner tile, level and orientation 0–3), or null. */
function startOf(e: EntityView): { x: number; y: number; z: number; o: number } | null {
  for (let k = 0; k < e.count; k++) if (e.templates[e.template[k]] === "StartingLocation") return { x: e.x[k], y: e.y[k], z: e.z[k], o: e.orientation[k] & 3 };
  return null;
}

/** The quarter turns (clockwise) to turn a map under the view's sun so the light falls as the game's would on a
 *  camera looking toward compass `look` degrees: the game's sun stands toward the camera's turn + 180° + 40°. */
export function sunTurns(look: number): number {
  const want = look + 180 + SUN_OFFSET;
  let best = 0;
  let off = Infinity;
  for (let k = 0; k < 4; k++) {
    // turning the map k quarter turns turns the camera with it (k × 90°) under the fixed sun
    const d = Math.abs(mod(VIEW_SUN - (look + 90 * k) - (want - look) + 180, 360) - 180);
    if (d < off - 1e-9) {
      off = d;
      best = k;
    }
  }
  return best;
}

/** The view turned `k` quarter turns clockwise (seen from above, north up): tile (x, y) goes to (y, W − 1 − x) for
 *  each turn, everything on it with it (its objects' places and orientations, its water's outflows' directions). */
export function turnView(v: MapView, k: number): MapView {
  let out = v;
  for (let t = 0; t < mod(k, 4); t++) out = quarter(out);
  return out;
}

function quarter(v: MapView): MapView {
  const { W, H } = v;
  // (x, y) → (y, W − 1 − x) on a map H wide and W high
  const to = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return (W - 1 - x) * H + y;
  };
  const N = W * H;
  const heights = new Uint8Array(N);
  for (let i = 0; i < N; i++) heights[to(i)] = v.heights[i];
  // the columns, by their new tiles
  const order = Array.from(v.columns.tiles, (t, k) => [to(t), k] as const).sort((a, b) => a[0] - b[0]);
  const columns = { tiles: Int32Array.from(order, ([t]) => t), voxels: new Uint8Array(v.columns.voxels.length) };
  order.forEach(([, k], j) => columns.voxels.set(v.columns.voxels.subarray(k * LAYERS, (k + 1) * LAYERS), j * LAYERS));
  return { W: H, H: W, heights, columns, water: turnWater(v.water, to), entities: turnEntities(v.entities, W), soil: v.soil && turnSoil(v.soil, to) };
}

function turnWater(w: WaterView, to: (i: number) => number): WaterView {
  const out: WaterView = { count: w.count, tile: Int32Array.from(w.tile, to), floor: w.floor, depth: w.depth, contamination: w.contamination };
  if (w.outflow) {
    // four a column, −y, −x, +y, +x: a quarter turn clockwise takes −y to −x, −x to +y, +y to +x, +x to −y
    const o = new Float32Array(w.outflow.length);
    for (let c = 0; c < w.count; c++) {
      o[c * 4] = w.outflow[c * 4 + 3];
      o[c * 4 + 1] = w.outflow[c * 4];
      o[c * 4 + 2] = w.outflow[c * 4 + 1];
      o[c * 4 + 3] = w.outflow[c * 4 + 2];
    }
    out.outflow = o;
  }
  return out;
}

function turnSoil(s: SoilView, to: (i: number) => number): SoilView {
  const moisture = new Uint8Array(s.moisture.length);
  const contamination = new Uint8Array(s.contamination.length);
  for (let i = 0; i < moisture.length; i++) {
    moisture[to(i)] = s.moisture[i];
    contamination[to(i)] = s.contamination[i];
  }
  const out: SoilView = { moisture, contamination };
  if (s.runs) {
    // (tiles in ascending order, each tile's runs from the bottom, as `runSoilView` gives them)
    const r = s.runs;
    const order = Array.from(r.tile, (t, k) => [to(t), k] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const runs: RunSoilView = { tile: Int32Array.from(order, ([t]) => t), level: Uint8Array.from(order, ([, k]) => r.level[k]), moisture: Uint8Array.from(order, ([, k]) => r.moisture[k]), contamination: Uint8Array.from(order, ([, k]) => r.contamination[k]) };
    out.runs = runs;
  }
  return out;
}

/** Each object's place on the turned map: the tiles it covers turned, its orientation a quarter on, its corner
 *  where the game puts it for that orientation (footprints.ts `coordinatesForMinCorner`). */
function turnEntities(e: EntityView, W: number): EntityView {
  const x = new Int16Array(e.count);
  const y = new Int16Array(e.count);
  const orientation = new Uint8Array(e.count);
  for (let k = 0; k < e.count; k++) {
    const fp = FOOTPRINTS[e.templates[e.template[k]]];
    const [sx, sy] = fp ? fp.size : [1, 1];
    const o = e.orientation[k] & 3;
    // the covered rectangle's corner and its extent
    const ex = o % 2 ? sy : sx;
    const ey = o % 2 ? sx : sy;
    const mx = o === 0 || o === 1 ? e.x[k] : e.x[k] - ex + 1;
    const my = o === 0 || o === 3 ? e.y[k] : e.y[k] - ey + 1;
    const o2 = (o + 1) & 3;
    const [nx, ny] = coordinatesForMinCorner(sx, sy, my, W - mx - ex, ORIENTATIONS[o2]);
    x[k] = nx;
    y[k] = ny;
    orientation[k] = (e.orientation[k] & ~3) | o2;
  }
  return { ...e, x, y, orientation };
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

/** What the picture draws (the map turned under the view's sun, its start hidden) and the camera it draws it from. */
export function heroScene(view: MapView): { view: MapView; camera: HeroCamera } {
  const start = startOf(view.entities);
  const look = start ? start.o * 90 + OPENING.turn : 0;
  const turned = turnView(view, sunTurns(look));
  const { W, H } = turned;
  let camera: HeroCamera;
  const s = start && startOf(turned.entities);
  if (s) {
    const orientation = ORIENTATIONS[s.o];
    const [mx, my] = startMiddleTile({ x: s.x, y: s.y, z: s.z, orientation });
    const cam = openingCamera({ x: mx, y: my, z: s.z, orientation }, VISTA_ZOOM);
    camera = { yaw: -deg(s.o * 90 + OPENING.turn), pitch: deg(OPENING.pitch), distance: cam.distance, target: [cam.target[0], cam.target[2], -cam.target[1]], fov: OPENING.fov };
  } else {
    // (the game's camera stands the map's width back from its middle at the foot of the ground, looking north: the
    // map turned a quarter, its north is east)
    const north = sunTurns(0);
    camera = { yaw: -deg(90 * north), pitch: deg(DEFAULT_PITCH), distance: north % 2 ? H : W, target: [W / 2, 0, -H / 2], fov: OPENING.fov };
  }
  return { view: { ...turned, entities: withoutStart(turned.entities) }, camera };
}
