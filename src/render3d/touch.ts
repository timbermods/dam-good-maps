// Touch in the 3D view (#1074, slice 1; amends D185: phones and tablets edit maps). Fingers are pointers of their own
// type, so the mouse and the pen keep every path they had (renderer.ts); this is what a finger adds:
// - two fingers move the camera in one gesture: dragged they pan, pinched they zoom about the ground under their
//   middle (it stays under it, as the wheel's does), twisted they turn the view about that ground, and dragged up or
//   down together side by side they tilt it; let go moving, the view glides on and slows to a stop;
// - a second finger down during a one-finger press (a brush's stroke, a drag) cancels that press, nothing applied and
//   no step in the history, and becomes the camera's gesture; the rest of that touch is the camera's;
// - a two-finger tap is Undo, a three-finger tap Redo.
// One finger is the renderer's own path (it pans with nothing in hand, presses the tool in hand otherwise); this
// module only notes its pan for the glide after it. The step's arithmetic is pure and checked exactly
// (tests/unit/touch.test.ts); the browser's own gestures are kept off the editor by CSS and `BROWSER_ZOOM_EVENTS`.

export interface Point {
  x: number;
  y: number;
}

/** What a touch does to the camera in one step: a pan in CSS pixels (as a drag moves the map), a zoom (the log of the
 *  factor the distance is multiplied by: below 0 in), a turn (radians, clockwise on the screen) and a tilt (radians
 *  added to the view's pitch). */
export interface Motion {
  dx: number;
  dy: number;
  zoom: number;
  turn: number;
  tilt: number;
}

export const NO_MOTION: Motion = { dx: 0, dy: 0, zoom: 0, turn: 0, tilt: 0 };

/** A press that moved less than this (CSS px, per finger) is a tap; a one-finger pan starts past it. */
export const TAP_SLOP = 10;
/** The longest a tap lasts (ms), from its first finger down to its last up. */
export const TAP_MS = 350;
/** A second tap this soon (ms) and this near (CSS px) to the first is a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;
/** How far a finger moves (CSS px) before a two-finger gesture decides whether it tilts. */
export const DECIDE_PX = 10;
/** Tilt per pixel the fingers move up or down (the mouse's orbit drag: renderer.ts). */
export const TILT_PER_PX = 0.005;
/** Fingers nearer than this (CSS px) turn nothing: their angle is all noise. */
export const TURN_MIN_GAP = 24;
/** The glide after a flick: its speed falls by a factor e every this many seconds (about the camera keys' glide to a
 *  stop, cameraGlide.ts, stretched for a thrown map). */
export const FLING_TAU = 0.25;
/** A flick: the fingers were still moving this recently (ms) when they let go. */
export const FLING_RECENT_MS = 60;
/** The speeds a glide starts above and stops below: pan (CSS px/s), zoom (log/s), turn and tilt (rad/s). */
export const FLING_START = { pan: 150, zoom: 0.5, turn: 0.5, tilt: 0.5 };
export const FLING_STOP = { pan: 12, zoom: 0.04, turn: 0.04, tilt: 0.04 };

/** The gesture's way: "free" pans, pinches and twists; "tilt" (two fingers side by side dragged up or down together)
 *  tilts with its vertical move and still pinches, twists and pans sideways. */
export type Mode = "free" | "tilt";

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (p: Point): number => Math.hypot(p.x, p.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Decide a two-finger gesture's way from where its fingers went down (`start`) and are now: null until a finger has
 *  moved `DECIDE_PX`. It tilts when the view can tilt and the two fingers, side by side (the line between them nearer
 *  level than upright), both moved mostly up or mostly down, the same way, keeping their gap; otherwise it is free. */
export function decide(start: readonly [Point, Point], now: readonly [Point, Point], canTilt: boolean): Mode | null {
  const da = sub(now[0], start[0]);
  const db = sub(now[1], start[1]);
  const moved = Math.max(len(da), len(db));
  if (moved < DECIDE_PX) return null;
  if (!canTilt) return "free";
  const side = Math.abs(start[1].x - start[0].x) > Math.abs(start[1].y - start[0].y);
  const upright = (d: Point) => Math.abs(d.y) > 2 * Math.abs(d.x) && Math.abs(d.y) >= DECIDE_PX / 2;
  const together = Math.sign(da.y) === Math.sign(db.y);
  const gapKept = Math.abs(len(sub(now[1], now[0])) - len(sub(start[1], start[0]))) < moved / 2;
  return side && upright(da) && upright(db) && together && gapKept ? "tilt" : "free";
}

/** One step of a two-finger gesture, from the fingers' last places (`a0`, `b0`) to their places now: the middle's move
 *  pans (in a tilt, its sideways move only, its up-and-down move tilting), the gap's change zooms about the middle now
 *  (`at`), and the turn of the line between them turns the view (clockwise on the screen, positive). Pure. */
export function twoStep(a0: Point, b0: Point, a1: Point, b1: Point, mode: Mode): { motion: Motion; at: Point } {
  const m0 = mid(a0, b0);
  const m1 = mid(a1, b1);
  const g0 = len(sub(b0, a0));
  const g1 = len(sub(b1, a1));
  const zoom = g0 > 0 && g1 > 0 ? Math.log(g0 / g1) : 0;
  let turn = 0;
  if (g0 >= TURN_MIN_GAP && g1 >= TURN_MIN_GAP) {
    turn = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
  }
  const dx = m1.x - m0.x;
  const dy = m1.y - m0.y;
  const motion = mode === "tilt" ? { dx, dy: 0, zoom, turn, tilt: dy * TILT_PER_PX } : { dx, dy, zoom, turn, tilt: 0 };
  return { motion, at: m1 };
}

/** The fingers' speed over their last moves, for the glide after they let go. */
export class Speed {
  private samples: { t: number; dt: number; m: Motion }[] = [];

  /** A step of the camera's at time `t` (ms). */
  add(t: number, m: Motion): void {
    const last = this.samples[this.samples.length - 1];
    // (the first move's time since the one before is unknown: a frame)
    const dt = Math.min(50, Math.max(1, last ? t - last.t : 16));
    this.samples.push({ t, dt, m });
    while (this.samples.length && t - this.samples[0].t > 100) this.samples.shift();
  }

  clear(): void {
    this.samples = [];
  }

  /** The speed at time `t` (ms), per second: none when the fingers had stopped `FLING_RECENT_MS` before. */
  at(t: number): Motion {
    const s = this.samples.filter((x) => t - x.t <= 100);
    if (!s.length || t - s[s.length - 1].t > FLING_RECENT_MS) return { ...NO_MOTION };
    const span = s.reduce((n, x) => n + x.dt, 0) / 1000;
    const sum = (k: keyof Motion) => s.reduce((n, x) => n + x.m[k], 0) / span;
    return { dx: sum("dx"), dy: sum("dy"), zoom: sum("zoom"), turn: sum("turn"), tilt: sum("tilt") };
  }
}

/** The speeds a glide starts with: each one below its threshold is dropped (null: no glide at all). */
export function flingFrom(v: Motion): Motion | null {
  const pan = Math.hypot(v.dx, v.dy) >= FLING_START.pan;
  const out: Motion = {
    dx: pan ? v.dx : 0,
    dy: pan ? v.dy : 0,
    zoom: Math.abs(v.zoom) >= FLING_START.zoom ? v.zoom : 0,
    turn: Math.abs(v.turn) >= FLING_START.turn ? v.turn : 0,
    tilt: Math.abs(v.tilt) >= FLING_START.tilt ? v.tilt : 0,
  };
  return out.dx || out.dy || out.zoom || out.turn || out.tilt ? out : null;
}

/** One frame of a glide, `seconds` long: how far it goes and its speed after, slowed by `FLING_TAU`; `moving` is false
 *  once every speed is below its stop. Pure. */
export function flingStep(v: Motion, seconds: number): { move: Motion; v: Motion; moving: boolean } {
  const dt = Math.min(0.05, Math.max(0, seconds));
  // (the distance the slowing speed covers over the frame, exactly)
  const k = FLING_TAU * (1 - Math.exp(-dt / FLING_TAU));
  const f = Math.exp(-dt / FLING_TAU);
  const move: Motion = { dx: v.dx * k, dy: v.dy * k, zoom: v.zoom * k, turn: v.turn * k, tilt: v.tilt * k };
  const next: Motion = { dx: v.dx * f, dy: v.dy * f, zoom: v.zoom * f, turn: v.turn * f, tilt: v.tilt * f };
  const moving =
    Math.hypot(next.dx, next.dy) >= FLING_STOP.pan || Math.abs(next.zoom) >= FLING_STOP.zoom || Math.abs(next.turn) >= FLING_STOP.turn || Math.abs(next.tilt) >= FLING_STOP.tilt;
  return { move, v: next, moving };
}

/** What the touch layer asks of the view. */
export interface TouchHost {
  /** Drop the one-finger press in progress (a stroke, a drag): cancelled, nothing applied. */
  drop(): void;
  /** Move the camera by `m` about the ground under `at` (client coordinates). */
  move(m: Motion, at: Point): void;
  /** A two- or three-finger tap. */
  fingers(n: 2 | 3): void;
  /** The view can tilt (the angled view; the top-down one looks straight down). */
  canTilt(): boolean;
  /** The viewer prefers reduced motion: no glide. */
  still(): boolean;
}

interface Pair {
  ids: [number, number];
  start: [Point, Point];
  last: [Point, Point];
  mode: Mode | null;
}

/** The fingers on the view, and the camera's gesture once there are two. */
export class Touches {
  private fingers = new Map<number, Point>();
  /** From the first finger down to the last up: when it began, the most fingers at once, how far they moved in all,
   *  and whether it is the camera's (a second finger came). */
  private seq: { t0: number; max: number; travel: number; camera: boolean } | null = null;
  private pair: Pair | null = null;
  /** The one finger left after a gesture: it pans. */
  private lone: number | null = null;
  private speed = new Speed();
  private at: Point = { x: 0, y: 0 };
  private flingFrame = 0;

  constructor(private readonly host: TouchHost) {}

  /** A finger went down: true when the camera's gesture takes it (a second finger, or any finger once there was one);
   *  false leaves it to the view's one-finger path. */
  down(ev: PointerEvent): boolean {
    this.stop();
    const p = { x: ev.clientX, y: ev.clientY };
    this.fingers.set(ev.pointerId, p);
    if (this.fingers.size === 1 || !this.seq) {
      this.seq = { t0: ev.timeStamp, max: 1, travel: 0, camera: false };
      this.speed.clear();
      return false;
    }
    const s = this.seq;
    s.max = Math.max(s.max, this.fingers.size);
    if (!s.camera) {
      s.camera = true;
      this.host.drop();
    }
    if (!this.pair) this.pairUp();
    this.lone = null;
    return true;
  }

  /** A finger moved: true when the camera's gesture took it. */
  move(ev: PointerEvent): boolean {
    const was = this.fingers.get(ev.pointerId);
    const s = this.seq;
    if (!was || !s) return false;
    const now = { x: ev.clientX, y: ev.clientY };
    this.fingers.set(ev.pointerId, now);
    s.travel += len(sub(now, was));
    if (!s.camera) return false;
    const pr = this.pair;
    if (pr && pr.ids.includes(ev.pointerId)) {
      const cur: [Point, Point] = [this.fingers.get(pr.ids[0])!, this.fingers.get(pr.ids[1])!];
      if (!pr.mode) {
        pr.mode = decide(pr.start, cur, this.host.canTilt());
        // (undecided, nothing moves yet; decided, the first step carries the whole move so far)
        if (!pr.mode) return true;
      }
      const { motion, at } = twoStep(pr.last[0], pr.last[1], cur[0], cur[1], pr.mode);
      pr.last = cur;
      this.apply(motion, at, ev.timeStamp);
      return true;
    }
    if (this.lone === ev.pointerId) this.apply({ ...NO_MOTION, dx: now.x - was.x, dy: now.y - was.y }, now, ev.timeStamp);
    return true;
  }

  /** A finger came up (or the browser took it: `pointercancel`): true when the camera's gesture had it. */
  up(ev: PointerEvent): boolean {
    if (!this.fingers.delete(ev.pointerId)) return false;
    const s = this.seq;
    if (!s) return false;
    if (!s.camera) {
      if (!this.fingers.size) this.seq = null;
      return false;
    }
    if (this.pair?.ids.includes(ev.pointerId)) this.pair = null;
    if (this.fingers.size >= 2) {
      if (!this.pair) this.pairUp();
    } else if (this.fingers.size === 1) {
      this.pair = null;
      this.lone = [...this.fingers.keys()][0];
    } else {
      this.seq = null;
      this.lone = null;
      const tap = ev.type === "pointerup" && ev.timeStamp - s.t0 <= TAP_MS && s.travel < TAP_SLOP * s.max && (s.max === 2 || s.max === 3);
      if (tap) this.host.fingers(s.max as 2 | 3);
      else this.release(ev.timeStamp);
    }
    return true;
  }

  /** The view's own one-finger pan moved by (dx, dy) at `at`, time `t`: noted for the glide after it. */
  panned(dx: number, dy: number, at: Point, t: number): void {
    this.at = at;
    this.speed.add(t, { ...NO_MOTION, dx, dy });
  }

  /** Let go at time `t` (ms): the view glides on at the fingers' speed and slows to a stop. */
  release(t: number): void {
    const v = flingFrom(this.speed.at(t));
    this.speed.clear();
    if (!v || this.host.still()) return;
    let speed = v;
    let last = performance.now();
    const at = { ...this.at };
    const step = () => {
      const now = performance.now();
      const s = flingStep(speed, (now - last) / 1000);
      last = now;
      speed = s.v;
      this.host.move(s.move, at);
      this.flingFrame = s.moving ? requestAnimationFrame(step) : 0;
    };
    this.flingFrame = requestAnimationFrame(step);
  }

  /** Whether the view is still gliding after a flick (tests). */
  get gliding(): boolean {
    return this.flingFrame !== 0;
  }

  /** Whether a finger is on the view. */
  get active(): boolean {
    return this.fingers.size > 0;
  }

  /** Stop a glide. */
  stop(): void {
    if (this.flingFrame) cancelAnimationFrame(this.flingFrame);
    this.flingFrame = 0;
  }

  /** Forget every finger (the window lost focus: their releases go elsewhere). */
  reset(): void {
    this.stop();
    this.fingers.clear();
    this.seq = null;
    this.pair = null;
    this.lone = null;
    this.speed.clear();
  }

  private apply(m: Motion, at: Point, t: number): void {
    this.at = at;
    this.speed.add(t, m);
    this.host.move(m, at);
  }

  /** The first two fingers down make the gesture. */
  private pairUp(): void {
    const [a, b] = [...this.fingers.entries()];
    if (!a || !b) return;
    this.pair = { ids: [a[0], b[0]], start: [{ ...a[1] }, { ...b[1] }], last: [{ ...a[1] }, { ...b[1] }], mode: null };
  }
}

/** iOS Safari zooms the page on a pinch whatever `touch-action` says; these events are its own (only it sends them), and
 *  the view prevents them on the document while it is there, so the page never zooms. */
export const BROWSER_ZOOM_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;
