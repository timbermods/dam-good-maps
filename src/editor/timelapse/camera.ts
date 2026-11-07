// The time-lapse's camera (D505): the video's own, on a renderer of its own, never the player's
// view. A slow drone, never a turntable: it opens wide on the generated map, glides to each framing (eased, never cut,
// never shaken, never following anything that moves; across the map rising as it travels), holds there while its
// steps play with a slow push in, and ends on the finished map's hero view, the map's picture's framing
// (render3d/heroView.ts: 40° down, face-on, turned to the start's orientation, the map filling the frame).
// Nearby scenes share one framing, so edits close together never move the camera; it looks down at one steady
// pitch until the glide to the hero view, and its heading turns only a little over the whole video (at most 20°,
// under half a degree a second), arriving at the hero view's as the glide to it ends. Plain data from the plan
// (plan.ts): the same frames every time.

import { OPENING } from "../../core/analysis/opening";
import { heroCamera, heroScene } from "../../render3d/heroView";
import type { LapseBox } from "../../core/doc/timelapse";
import type { EntityView, MapView } from "../../render3d/model";
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
/** How far the heading turns over the whole video at most (radians), and at most a second. */
const TURN_MOST = deg(20);
const TURN_RATE = deg(0.45);
/** The one pitch the video looks down at until the glide to the hero view (the game's opening camera's 60°). */
const PITCH = deg(52);
/** Scenes share a framing while framing them together stands the camera back at most this much further than the
 *  nearer of the two framings would. */
const JOIN = 1.4;
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
  return { x: (W - 1) / 2, y: (H - 1) / 2, level: meanLevel(heights, W, all), distance: (Math.max(W, H) * 0.62) / TAN_H + Math.max(W, H) * 0.25, pitch: PITCH };
}

const fitBox = (b: LapseBox) => fit(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
const union = (a: LapseBox, b: LapseBox): LapseBox => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

function sceneShot(box: LapseBox, heights: Uint8Array, W: number, wide: Shot): Shot {
  const d = Math.min(wide.distance, fitBox(box));
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, level: meanLevel(heights, W, box), distance: d, pitch: PITCH };
}

/** A framing: the scene whose glide and start it takes (its first with a place), its last scene, and its shot. */
interface Framing {
  lead: number;
  last: number;
  shot: Shot;
}

/** The scenes in framings: a scene joins the framing before it while their places framed together stand the camera
 *  back at most JOIN times the nearer framing's (a scene without a place always joins). Scenes without a place before
 *  the first with one join that one's framing, which glides and starts with it: the camera holds the opening until
 *  then, never cutting on a placeless scene's glide (one that may last no frames). */
function framings(plan: LapsePlan, heights: Uint8Array, W: number, wide: Shot): Framing[] {
  const out: { lead: number; last: number; box: LapseBox | null }[] = [];
  plan.scenes.forEach((s, k) => {
    const cur = out[out.length - 1];
    if (cur && (!s.box || !cur.box || fitBox(union(cur.box, s.box)) <= JOIN * Math.min(fitBox(cur.box), fitBox(s.box)))) {
      cur.last = k;
      if (s.box && !cur.box) cur.lead = k;
      if (s.box) cur.box = cur.box ? union(cur.box, s.box) : s.box;
    } else out.push({ lead: k, last: k, box: s.box });
  });
  return out.map((g) => ({ lead: g.lead, last: g.last, shot: g.box ? sceneShot(g.box, heights, W, wide) : wide }));
}

/** The finished map's hero view (heroView.ts `heroCamera`, the map's picture's framing, on the map as it is, not turned
 *  under the sun), as a shot and its turn: turned to the start's orientation, north without a start. Given the finished
 *  map itself, exactly the map's picture's camera (`heroScene`: the place its looks score chose along the map). */
function heroShot(end: EntityView, heights: Uint8Array, W: number, H: number, finished: MapView | null): { shot: Shot; yaw: number } {
  if (finished) {
    const c = heroScene(finished).camera;
    // (a shot's x and y are tile indices: the picture's target is in world coordinates, a tile's middle at its index + 0.5)
    return { shot: { x: c.target[0] - 0.5, y: -c.target[2] - 0.5, level: c.target[1], distance: c.distance, pitch: c.pitch }, yaw: c.yaw };
  }
  let o = 0;
  for (let k = 0; k < end.count; k++) if (end.templates[end.template[k]] === "StartingLocation") o = end.orientation[k] & 3;
  const c = heroCamera(W, H, heights, o);
  // (a shot's x and y are tile indices: heroCamera's are tile coordinates, a tile's middle at its index + 0.5)
  return { shot: { x: c.x - 0.5, y: c.y - 0.5, level: c.level, distance: c.distance, pitch: c.pitch }, yaw: c.yaw };
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
 *  the finished map's objects (its start places the hero view), `finished` the finished map itself, when the video ends on
 *  it, so its last shot is the map's picture's. */
export function lapseCamera(plan: LapsePlan, heights: Uint8Array, W: number, H: number, end: EntityView, finished: MapView | null = null): (frame: number) => LapseView {
  const wide = wideShot(heights, W, H);
  const hero = heroShot(end, heights, W, H, finished);
  const groups = framings(plan, heights, W, wide);
  /** Where the camera stands at the end of framing g (pushed in), or the opening's. */
  const after = (g: number): Shot => (g < 0 ? pushed(wide, 1) : pushed(groups[g].shot, 1));
  const shotAt = (f: number): Shot => {
    if (f < plan.intro) return pushed(wide, f / plan.intro);
    if (f >= plan.outro.hold) return pushed(hero.shot, (f - plan.outro.hold) / Math.max(1, plan.frames - plan.outro.hold) / 2);
    if (f >= plan.outro.glide) return mix(after(groups.length - 1), hero.shot, (f - plan.outro.glide) / Math.max(1, plan.outro.hold - plan.outro.glide));
    for (let g = groups.length - 1; g >= 0; g--) {
      const glide = plan.scenes[groups[g].lead].glide;
      const from = plan.scenes[groups[g].lead].from;
      const to = plan.scenes[groups[g].last].to;
      if (f < glide) continue;
      if (f < from) return mix(after(g - 1), groups[g].shot, (f - glide) / Math.max(1, from - glide));
      // (one slow push in through all the framing's scenes, the glides between them held)
      return pushed(groups[g].shot, (f - from) / Math.max(1, to - from));
    }
    return pushed(wide, 1);
  };
  // the turn: a little over the whole video, eased, arriving at the hero view's as the glide to it ends
  const arrive = plan.outro.hold;
  const turn = Math.min(TURN_MOST, (TURN_RATE * arrive) / plan.fps);
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return (f: number) => {
    const s = shotAt(f);
    const yaw = hero.yaw - turn * (1 - smooth(f / arrive));
    return { yaw, pitch: s.pitch, distance: s.distance, target: [s.x + 0.5, s.level, -(s.y + 0.5)] };
  };
}
