// The time-lapse's camera (D265's time-lapse rule): the video's own, on a renderer of its own, never the player's
// view. It opens wide on the generated map, glides to each scene (eased, never cut, never shaken, never following
// anything that moves; across the map rising as it travels), holds there while its steps play with a slow push in,
// and ends on the finished map's hero view, the game's opening camera (render3d/heroView.ts: 60° down, turned to the
// start's orientation + 35°, pulled back to the default zoom's widest). Through it all the camera turns slowly round,
// 2.5° a second, arriving at the hero view's turn as the video ends. Plain data from the plan (plan.ts): the same
// frames every time.

import { openingCamera, OPENING, VISTA_ZOOM } from "../../core/analysis/opening";
import { ORIENTATIONS, startMiddleTile } from "../../core/format/footprints";
import type { LapseBox } from "../../core/doc/timelapse";
import type { EntityView } from "../../render3d/model";
import type { LapsePlan } from "./plan";

/** The renderer's orbit camera (`MapRenderer.setView`): world X east, Y up, Z south (−tile y). */
export interface LapseView {
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
}

const deg = (d: number) => (d * Math.PI) / 180;
/** The vertical field of view the video draws with: the game camera's (OPENING.fov, 35°). */
export const LAPSE_FOV = OPENING.fov;
const TAN_V = Math.tan(deg(LAPSE_FOV / 2));
const TAN_H = (TAN_V * 16) / 9;
/** How fast the camera turns round (radians a second). */
const DRIFT = deg(2.5);
/** Pitches: the opening's wide view, a scene's, the hero view's (the game's opening camera). */
const WIDE_PITCH = deg(46);
const SCENE_PITCH = deg(52);
/** A scene is framed with room round it, never nearer than this (tiles), and a scene's camera pushes in this share. */
const ROOM = 1.35;
const NEAREST = 28;
const PUSH = 0.06;

/** A place to look at: its middle (tile x, y) and level, and how far back. */
interface Shot {
  x: number;
  y: number;
  level: number;
  distance: number;
  pitch: number;
}

function meanLevel(heights: Uint8Array, W: number, b: LapseBox): number {
  let sum = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.max(b.x1 - b.x0, b.y1 - b.y0) / 24));
  for (let y = b.y0; y <= b.y1; y += step)
    for (let x = b.x0; x <= b.x1; x += step) {
      sum += heights[y * W + x];
      n++;
    }
  return n ? sum / n : 0;
}

/** How far back the camera stands to frame a box `w` × `h` tiles whatever its turn, with room round it. */
function fit(w: number, h: number): number {
  const r = Math.hypot(w, h) / 2;
  return Math.max(NEAREST, ((r * ROOM) / Math.min(TAN_V, TAN_H)) * 0.92);
}

function wideShot(heights: Uint8Array, W: number, H: number): Shot {
  const all = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  // (the whole map: its longer side across the frame, the near edge in view)
  return { x: (W - 1) / 2, y: (H - 1) / 2, level: meanLevel(heights, W, all), distance: (Math.max(W, H) * 0.62) / TAN_H + Math.max(W, H) * 0.25, pitch: WIDE_PITCH };
}

function sceneShot(box: LapseBox, heights: Uint8Array, W: number, wide: Shot): Shot {
  const d = Math.min(wide.distance, fit(box.x1 - box.x0 + 1, box.y1 - box.y0 + 1));
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, level: meanLevel(heights, W, box), distance: d, pitch: SCENE_PITCH };
}

/** The finished map's hero view (heroView.ts `heroScene`'s camera, on the map as it is, not turned under the sun),
 *  as a shot and its turn; without a start, the wide view looking north. */
function heroShot(end: EntityView, wide: Shot): { shot: Shot; yaw: number } {
  for (let k = 0; k < end.count; k++) {
    if (end.templates[end.template[k]] !== "StartingLocation") continue;
    const o = end.orientation[k] & 3;
    const orientation = ORIENTATIONS[o];
    const [mx, my] = startMiddleTile({ x: end.x[k], y: end.y[k], z: end.z[k], orientation });
    const cam = openingCamera({ x: mx, y: my, z: end.z[k], orientation }, VISTA_ZOOM);
    // (openingCamera's target is the tile's middle, (x + 0.5, y + 0.5), a level over the ground)
    return { shot: { x: cam.target[0] - 0.5, y: cam.target[1] - 0.5, level: cam.target[2], distance: cam.distance, pitch: deg(OPENING.pitch) }, yaw: -deg(o * 90 + OPENING.turn) };
  }
  return { shot: wide, yaw: 0 };
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function mix(a: Shot, b: Shot, t: number): Shot {
  const e = ease(t);
  // across the map the camera rises as it travels, enough mid-way to see both places, and comes down again (as a map's
  // fly-to does: never a whip across the land up close)
  const travel = Math.hypot(b.x - a.x, b.y - a.y);
  const rise = Math.max(0, (0.9 * travel) / Math.sqrt(a.distance * b.distance) - 1);
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    level: a.level + (b.level - a.level) * e,
    // (zoom eases in proportion, as the editor's glides do)
    distance: Math.exp(Math.log(a.distance) + (Math.log(b.distance) - Math.log(a.distance)) * e) * (1 + rise * 4 * e * (1 - e)),
    pitch: a.pitch + (b.pitch - a.pitch) * e,
  };
}

const pushed = (s: Shot, t: number): Shot => ({ ...s, distance: s.distance * (1 - PUSH * Math.max(0, Math.min(1, t))) });

/** The camera of every frame of `plan`: `heights` the generated map's (each scene's level is read from them), `end`
 *  the finished map's objects (its start places the hero view). */
export function lapseCamera(plan: LapsePlan, heights: Uint8Array, W: number, H: number, end: EntityView): (frame: number) => LapseView {
  const wide = wideShot(heights, W, H);
  const hero = heroShot(end, wide);
  // each scene's shot; a scene without a place keeps the one before
  const shots: Shot[] = [];
  let prev = wide;
  for (const s of plan.scenes) {
    prev = s.box ? sceneShot(s.box, heights, W, wide) : prev;
    shots.push(prev);
  }
  /** Where the camera stands at the end of scene k (pushed in), or the opening's. */
  const after = (k: number): Shot => (k < 0 ? pushed(wide, 1) : pushed(shots[k], 1));
  const shotAt = (f: number): Shot => {
    if (f < plan.intro) return pushed(wide, f / plan.intro);
    if (f >= plan.outro.hold) return pushed(hero.shot, (f - plan.outro.hold) / Math.max(1, plan.frames - plan.outro.hold) / 2);
    if (f >= plan.outro.glide) return mix(after(plan.scenes.length - 1), hero.shot, (f - plan.outro.glide) / Math.max(1, plan.outro.hold - plan.outro.glide));
    for (let k = plan.scenes.length - 1; k >= 0; k--) {
      const s = plan.scenes[k];
      if (f < s.glide) continue;
      if (f < s.from) return mix(after(k - 1), shots[k], (f - s.glide) / Math.max(1, s.from - s.glide));
      return pushed(shots[k], (f - s.from) / Math.max(1, s.to - s.from));
    }
    return pushed(wide, 1);
  };
  // the turn: slowly round all the way, arriving at the hero view's as the glide to it ends
  const arrive = plan.outro.hold;
  return (f: number) => {
    const s = shotAt(f);
    const yaw = hero.yaw - (DRIFT * Math.max(0, arrive - f)) / plan.fps;
    return { yaw, pitch: s.pitch, distance: s.distance, target: [s.x + 0.5, s.level, -(s.y + 0.5)] };
  };
}
