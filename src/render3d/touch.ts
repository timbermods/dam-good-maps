// Touch in the 3D view (#1074, slice 1; amends D185: phones and tablets edit maps). Fingers are pointers of their own
// type, so the mouse and the pen keep every path they had (renderer.ts); this is what a finger adds:
// - two fingers move the camera in one gesture: dragged they pan, pinched they zoom about the ground under their
//   middle (it stays under it, as the wheel's does), twisted they turn the view about that ground, and dragged up or
//   down together side by side they tilt it; let go moving, the view glides on and slows to a stop;
// - a second finger down during a one-finger press (a brush's stroke, a drag) cancels that press, nothing applied and
//   no step in the history, and becomes the camera's gesture; the rest of that touch is the camera's;
// - a two-finger tap is Undo, a three-finger tap Redo.
// One finger is the renderer's own path (it pans with nothing in hand, paints with a brush); this module notes its pan
// for the glide after it, and runs a press with something in hand that shows before it applies (`FingerPress`, slice 3,
// at the end of this file). The step's arithmetic is pure and checked exactly
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

/** The fingers' speed over their last moves, for the glide after they let go. Every time is an event's own
 *  (`timeStamp`, ms), never when a handler happened to run: a busy page's moves arrive a long frame apart, and their
 *  speed is the distance over that whole gap, never over a frame it did not take. */
export class Speed {
  private samples: { t: number; dt: number; m: Motion }[] = [];
  /** When the fingers went down: the first move's time is counted from it. */
  private since: number | null = null;

  /** The fingers went down (or a gesture began) at `t`: what came before is forgotten. */
  begin(t: number): void {
    this.samples = [];
    this.since = t;
  }

  /** A step of the camera's at time `t`. */
  add(t: number, m: Motion): void {
    // (the first move's time since a press not seen: a frame)
    const from = this.samples[this.samples.length - 1]?.t ?? this.since ?? t - 16;
    this.samples.push({ t, dt: Math.max(1, t - from), m });
    while (this.samples.length > 1 && t - this.samples[0].t > 100) this.samples.shift();
  }

  clear(): void {
    this.samples = [];
    this.since = null;
  }

  /** The speed at time `t`, per second: none when the fingers had stopped `FLING_RECENT_MS` before. */
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

/** One frame of a glide, `seconds` long (the wall clock's, however long the frame took): how far it goes and its speed
 *  after, slowed by `FLING_TAU`; `moving` is false once every speed is below its stop. The slowing is integrated exactly,
 *  so a long frame goes as far as the glide would have in that time and never past speed × `FLING_TAU` in all: a busy
 *  page's glide ends when a quick one's does, never stretched over its slow frames. Pure. */
export function flingStep(v: Motion, seconds: number): { move: Motion; v: Motion; moving: boolean } {
  const dt = Math.max(0, seconds);
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
  /** Each finger's last move's time (the touch's: both fingers' moves in one touch share it). */
  seen: [number, number];
  /** The decision waited once for the other finger's move. */
  waited: boolean;
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
      this.speed.begin(ev.timeStamp);
      return false;
    }
    const s = this.seq;
    s.max = Math.max(s.max, this.fingers.size);
    if (!s.camera) {
      s.camera = true;
      this.host.drop();
    }
    if (!this.pair) {
      this.pairUp();
      this.speed.begin(ev.timeStamp);
    }
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
      const mine = pr.ids[0] === ev.pointerId ? 0 : 1;
      const other = 1 - mine;
      const theirs = pr.seen[other] === ev.timeStamp;
      pr.seen[mine] = ev.timeStamp;
      if (!pr.mode) {
        const canTilt = this.host.canTilt();
        const mode = decide(pr.start, cur, canTilt);
        // (undecided, nothing moves yet; decided, the first step carries the whole move so far)
        if (!mode) return true;
        // (one touch moves both fingers, but the browser tells it a finger at a time, each at the touch's time: where
        // moves pile up behind a slow frame, the first finger's tells the whole of a two-finger tilt before the other's
        // has come; when the other going the same way would make it a tilt, the decision waits for the other's move)
        if (mode === "free" && canTilt && !theirs && !pr.waited) {
          const d = sub(now, was);
          const both: [Point, Point] = [cur[0], cur[1]];
          both[other] = { x: cur[other].x + d.x, y: cur[other].y + d.y };
          if (decide(pr.start, both, true) === "tilt") {
            pr.waited = true;
            return true;
          }
        }
        pr.mode = mode;
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
    this.pair = { ids: [a[0], b[0]], start: [{ ...a[1] }, { ...b[1] }], last: [{ ...a[1] }, { ...b[1] }], mode: null, seen: [-Infinity, -Infinity], waited: false };
  }
}

// ------------------------------------------------------------------------------------------- a press, seen first
// (#1074, slice 3) One finger with something in hand that shows before it applies (an object, a force, the Block tool, a
// shape, an object or source picked on the map) aims a little above itself, where the finger does not hide what shows:
// the press shows it there, a drag moves it, and the lift applies it; nothing is applied before the lift. A tap applies
// nothing (too short to have been seen), a second finger or a Cancel control drops it, and the browser taking the touch
// (`pointercancel`, as iOS Safari may) drops it too.

/** How far above the finger (CSS px) a press with something in hand aims: about a fingertip's breadth and a margin. */
export const FINGER_LIFT = 64;

/** How a finger's press works what is in hand:
 *  - "aim": the press shows the tool's preview above the finger (its hover there), a drag moves it, the lift applies it
 *    there (its click). An object from the shelf, a force, the Block tool.
 *  - "draw": the tool's own press, drag and release, above the finger, begun once the press is no tap. A shape's line,
 *    a selection's outline, a Slope's stair.
 *  - "move": the object or source picked goes where the finger aims, begun once the press is no tap; the lift moves it. */
export type PressMode = "aim" | "draw" | "move";

/** The point a finger at `p` aims at: `FINGER_LIFT` above it, never above the view's top edge (`top`). */
export function aimAt(p: Point, top: number): Point {
  return { x: p.x, y: Math.max(top + 1, p.y - FINGER_LIFT) };
}

/** What a finger's press asks of the view. Points are client coordinates, the aim's (above the finger). */
export interface PressHost {
  /** Show what the press would do aimed at `at`: an aim's preview, a begun draw's or move's stroke. */
  show(at: Point): void;
  /** A draw or a move begins, aimed at `at` (where the press first aimed): false when nothing takes it there. */
  begin(at: Point): boolean;
  /** Lifted, no tap: it applies, aimed at `at`. */
  apply(at: Point): void;
  /** Dropped, nothing applied: what shows goes (`begun`: a draw or a move had begun). */
  drop(begun: boolean): void;
  /** A tap: a short press that hardly moved (the view's own: a double tap zooms). */
  tap(): void;
  /** Whether a finger at `p` is over a Cancel control (a lift there drops the press). */
  overCancel(p: Point): boolean;
  /** Where the press aims now, and whether the finger is over a Cancel control; null when the press is over. */
  mark(at: Point | null, over: boolean): void;
  /** A timer: run `fn` after `ms`; its id, for `clear`. */
  later(fn: () => void, ms: number): number;
  clear(id: number): void;
}

/** One finger's press with something in hand, from its down to its lift (or its drop). */
export class FingerPress {
  private now: Point;
  private moved = 0;
  private begun = false;
  /** It began on the timer, by the page's clock: the events' own times still decide whether it was a tap. */
  private byTime = false;
  private over = false;
  private live = true;
  private timer = 0;

  constructor(
    readonly mode: PressMode,
    readonly id: number,
    private readonly from: Point,
    private readonly t0: number,
    private readonly top: number,
    private readonly host: PressHost,
  ) {
    this.now = { ...from };
    // (an aim shows at once; a draw or a move once it is no tap: held a tap's time, or moved past the slop)
    if (mode === "aim") this.showNow();
    else this.timer = host.later(() => this.start(true), TAP_MS);
  }

  /** Where the press aims now. */
  get aim(): Point {
    return aimAt(this.now, this.top);
  }

  /** Whether a draw or a move has begun (an aim shows from its press). */
  get started(): boolean {
    return this.mode === "aim" || this.begun;
  }

  /** The finger moved to `p`. */
  move(p: Point): void {
    if (!this.live) return;
    this.moved += Math.hypot(p.x - this.now.x, p.y - this.now.y);
    this.now = { ...p };
    this.over = this.host.overCancel(p);
    // (over Cancel: the lift there drops it; an aim's preview goes meanwhile, the renderer's `mark`)
    if (this.over) return this.host.mark(this.aim, true);
    if (!this.started) {
      if (this.moved >= TAP_SLOP) this.start();
      return;
    }
    this.showNow();
  }

  /** The finger lifted at `p`, time `t` (ms, the event's own). */
  up(p: Point, t: number): void {
    if (!this.live) return;
    if (p.x !== this.now.x || p.y !== this.now.y) this.move(p);
    if (!this.live) return;
    // (a press the timer began on a busy page, its lift coming late, is still a tap by its events' times: what it began
    // is dropped first)
    const tap = (!this.begun || this.byTime) && this.moved < TAP_SLOP && t - this.t0 <= TAP_MS;
    this.end();
    if (this.over) return this.host.drop(this.begun);
    if (tap) {
      if (this.begun) this.host.drop(true);
      return this.host.tap();
    }
    // (held past a tap's time on a page too busy to have run the timer: it begins now)
    if (!this.started) {
      if (!this.host.begin(aimAt(this.from, this.top))) return;
      this.begun = true;
    }
    this.host.apply(this.aim);
  }

  /** Dropped (a second finger, Cancel, the browser took the touch, the window lost focus): nothing applied. */
  cancel(): void {
    if (!this.live) return;
    this.end();
    this.host.drop(this.begun);
  }

  private start(byTime = false): void {
    this.timer = 0;
    if (!this.live || this.begun || this.over) return;
    this.byTime = byTime;
    if (!this.host.begin(aimAt(this.from, this.top))) {
      // (nothing takes it there: the press is over, nothing shown and nothing applied)
      this.end();
      return;
    }
    this.begun = true;
    this.showNow();
  }

  private showNow(): void {
    const at = this.aim;
    this.host.show(at);
    this.host.mark(at, false);
  }

  private end(): void {
    this.live = false;
    if (this.timer) this.host.clear(this.timer);
    this.timer = 0;
    this.host.mark(null, false);
  }
}

/** iOS Safari zooms the page on a pinch whatever `touch-action` says; these events are its own (only it sends them), and
 *  the view prevents them on the document while it is there, so the page never zooms. */
export const BROWSER_ZOOM_EVENTS = ["gesturestart", "gesturechange", "gestureend"] as const;
