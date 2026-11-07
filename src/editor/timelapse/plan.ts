// The time-lapse's timeline (D205, D285 (4)): how many frames each step of the history plays in, which steps share a
// scene (one camera place), and the opening and the ending, all decided before the first frame from the steps alone
// (core/doc/timelapse.ts `LapseStep`: kind and place), so the video's length, the progress shown and the frame count
// are known at once and the same every time. Chosen by eye: a short history plays each step for about a second (a
// force's moment longer), the camera's glides between places taking less than half that time; a long one is paced
// down so the whole video stays about a minute: edits close together share one camera place, and a very long history
// plays several steps to a frame in fewer, longer scenes.

import type { LapseBox, LapseStep } from "../../core/doc/timelapse";

/** Frames a second. */
export const FPS = 30;
/** Frames between two views of the flowing water (ten a second, the pace the live editor's water journey shows). */
export const WATER_EVERY = 3;
/** The water's game ticks a second of video: about two thirds of a game day (768 ticks), so a basin fills in seconds. */
export const TICKS_PER_SECOND = 512;

/** Seconds: the opening on the generated map; the steps' whole budget, and a step's most per unit of weight (a long
 *  history shares it out, several steps to a frame when it must); the camera's glides' whole budget. */
const INTRO_S = 1.6;
const STEPS_S = 36;
const MOST_S = 1.2;
const GLIDES_S = 14;
/** The glides' share of the steps' time at most, so a short history is mostly its edits. */
const GLIDES_SHARE = 0.45;
/** A scene's camera place holds at most this long (or twice its least, when a long history needs longer scenes), and
 *  frames at most this share of the map's side (or 48 tiles). */
const SCENE_MOST_S = 6;
const SCENE_SHARE = 0.45;
const SCENE_LEAST_SIDE = 48;
/** The least a scene holds, tried in turn until the glides fit their budget (seconds). */
const SCENE_LEAST_S = [0, 1, 2, 3, 4, 6, 9, 14];
/** The camera's glide into a scene (seconds): short when it only re-frames, longer across the map. */
const GLIDE_LEAST_S = 0.5;
const GLIDE_MOST_S = 1.6;
/** The ending: the last water flowing on, the glide to the finished map's view, and the hold on it. */
const TAIL_S = 0.6;
const OUTRO_GLIDE_S = 2.4;
const HOLD_S = 2.8;

/** How long a step plays, relative to the others: a force's moment longest, an object placed briefly. */
const WEIGHT: Record<LapseStep["kind"], number> = { force: 1.7, land: 1, water: 1.2, objects: 0.6, other: 0 };

/** A step's frames: it plays (its ground changes) over [from, to); its water flows on until `until` (the next step's
 *  `from`, or the ending's). A step that shows nothing has from = to. */
export interface PlanStep {
  index: number;
  scene: number;
  from: number;
  to: number;
  until: number;
}

/** A camera place: the steps it frames (their places' union) and its frames (the glide into it, then its steps). */
export interface PlanScene {
  box: LapseBox | null;
  glide: number;
  from: number;
  to: number;
}

export interface LapsePlan {
  fps: number;
  frames: number;
  /** The opening: [0, intro) on the generated map. */
  intro: number;
  steps: PlanStep[];
  scenes: PlanScene[];
  /** The ending: the last water flows on from `tail`, the camera glides from `glide` to the finished map's view,
   *  and holds on it from `hold` to `frames`. */
  outro: { tail: number; glide: number; hold: number };
}

const union = (a: LapseBox | null, b: LapseBox | null): LapseBox | null => (!a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const sideOf = (b: LapseBox) => Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
const middle = (b: LapseBox) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];

/** Scenes for steps of `length` frames (fractional): steps in order, each joining the scene before while the camera
 *  place still frames them all and the scene is not too long, or while the scene is shorter than `least` frames; a
 *  step that shows nothing stays in the scene it falls in. */
function sceneSteps(steps: readonly Pick<LapseStep, "place">[], length: number[], limit: number, least: number, most: number) {
  const sceneOf: number[] = [];
  const boxes: (LapseBox | null)[] = [];
  const spans: number[] = [];
  steps.forEach((s, k) => {
    const c = boxes.length - 1;
    const grown = c >= 0 ? union(boxes[c], s.place) : null;
    const fits = c >= 0 && (!grown || sideOf(grown) <= limit) && spans[c] + length[k] <= most;
    if (c >= 0 && (fits || length[k] === 0 || spans[c] < least)) {
      if (length[k]) boxes[c] = grown;
      spans[c] += length[k];
    } else {
      boxes.push(s.place);
      spans.push(length[k]);
    }
    sceneOf.push(boxes.length - 1);
  });
  return { sceneOf, boxes, spans };
}

/** A glide's frames from one place to the next (`far`: how far apart, a share of the map's side; 1 when unknown). */
const glideFrames = (far: number) => Math.round((GLIDE_LEAST_S + (GLIDE_MOST_S - GLIDE_LEAST_S) * Math.min(1, far * 1.6)) * FPS);

/** The timeline of a history of `steps` on a W × H map. */
export function lapsePlan(steps: readonly Pick<LapseStep, "kind" | "place">[], W: number, H: number): LapsePlan {
  const f = (s: number) => Math.max(1, Math.round(s * FPS));
  const side = Math.max(W, H);
  const weights = steps.map((s) => WEIGHT[s.kind]);
  const total = weights.reduce((a, b) => a + b, 0);
  const unit = total > 0 ? Math.min(MOST_S, STEPS_S / total) : 0;
  // each step's frames, fractional: a short history plays each over a second or so, a long one several to a frame
  const length = weights.map((w) => w * unit * FPS);
  // scenes: the least each holds grows until the glides between them fit their budget
  const limit = Math.max(SCENE_LEAST_SIDE, Math.round(side * SCENE_SHARE));
  let scenesFound = sceneSteps(steps, length, limit, 0, SCENE_MOST_S * FPS);
  for (const least of SCENE_LEAST_S) {
    scenesFound = sceneSteps(steps, length, limit, least * FPS, Math.max(SCENE_MOST_S, 2 * least) * FPS);
    let glides = 0;
    let last: LapseBox | null = null;
    scenesFound.boxes.forEach((b, n) => {
      if (scenesFound.spans[n] <= 0) return;
      glides += glideFrames(b && last ? Math.hypot(middle(b)[0] - middle(last)[0], middle(b)[1] - middle(last)[1]) / side : 1);
      if (b) last = b;
    });
    if (glides <= Math.min(GLIDES_S * FPS, GLIDES_SHARE * length.reduce((a, b) => a + b, 0))) break;
  }
  const { sceneOf, boxes, spans } = scenesFound;
  const intro = f(INTRO_S);
  const scenes: PlanScene[] = [];
  const planSteps: PlanStep[] = [];
  // (time runs in fractional frames; each step's frames are its start and end rounded, so none is lost or doubled)
  let at = intro;
  let last: LapseBox | null = null;
  steps.forEach((s, k) => {
    const n = sceneOf[k];
    if (!scenes[n]) {
      const box = boxes[n];
      // (across the map a longer glide; within the place already framed, a short re-frame)
      const glide = spans[n] > 0 ? glideFrames(box && last ? Math.hypot(middle(box)[0] - middle(last)[0], middle(box)[1] - middle(last)[1]) / side : 1) : 0;
      const g = Math.round(at);
      at = g + glide;
      scenes[n] = { box, glide: g, from: at, to: at };
      if (box) last = box;
    }
    const from = Math.round(at);
    at += length[k];
    planSteps.push({ index: k, scene: n, from, to: Math.round(at), until: 0 });
    scenes[n].to = Math.round(at);
  });
  const tail = Math.round(at);
  // each step's water flows on until the next step plays (through the next scene's glide), the last one's into the ending
  for (let k = 0; k < planSteps.length; k++) planSteps[k].until = k + 1 < planSteps.length ? planSteps[k + 1].from : tail;
  const glide = tail + f(TAIL_S);
  const hold = glide + f(OUTRO_GLIDE_S);
  return { fps: FPS, frames: hold + f(HOLD_S), intro, steps: planSteps, scenes, outro: { tail, glide, hold } };
}
