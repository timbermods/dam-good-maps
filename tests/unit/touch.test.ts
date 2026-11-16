// Touch in the 3D view (render3d/touch.ts, #1074): the two-finger step's arithmetic, how a gesture decides to tilt,
// the glide after a flick, and the touch layer's own bookkeeping (a second finger drops the press and takes the
// camera; a two- or three-finger tap is Undo or Redo; a lone finger left pans), and a press with something in hand,
// seen a little above the finger and applied only on its lift (slice 3). touch.spec drives real touch events.

import { describe, expect, it } from "vitest";
import { decisionLine } from "../../src/ui/viewportReadout";
import { aimAt, CONE_PX, decide, FINGER_LIFT, LEAD_PX, OPPOSE_PX, REAL_PX, settle, type Decision, FingerPress, flingFrom, HOLD_MS, flingStep, FLING_TAU, NO_MOTION, Speed, TAP_MS, TAP_SLOP, TILT_PER_PX, Touches, twoStep, type Motion, type Point, type PressHost, type PressMode } from "../../src/render3d/touch";

const P = (x: number, y: number): Point => ({ x, y });

describe("twoStep", () => {
  it("pans by the middle's move, with no zoom or turn when the fingers keep their gap and angle", () => {
    const { motion, at } = twoStep(P(100, 100), P(200, 100), P(130, 80), P(230, 80), "free");
    expect(motion).toMatchObject({ dx: 30, dy: -20, turn: 0, tilt: 0 });
    expect(motion.zoom).toBeCloseTo(0, 12);
    expect(at).toEqual(P(180, 80));
  });

  it("zooms in as the fingers spread, by the log of the gap's ratio, about the middle now", () => {
    const { motion, at } = twoStep(P(100, 100), P(200, 100), P(50, 100), P(250, 100), "free");
    expect(motion.zoom).toBeCloseTo(Math.log(0.5), 12);
    expect(motion.dx).toBe(0);
    expect(at).toEqual(P(150, 100));
  });

  it("turns clockwise on the screen as positive, the short way round", () => {
    // (y down: b swings from the right of a to below it, a quarter turn clockwise)
    expect(twoStep(P(0, 0), P(100, 0), P(0, 0), P(0, 100), "free").motion.turn).toBeCloseTo(Math.PI / 2, 12);
    // across the ±π seam (b to the left of a, swinging up: clockwise): a small turn, not nearly a whole one
    expect(twoStep(P(100, 0), P(0, 1), P(100, 0), P(0, -1), "free").motion.turn).toBeCloseTo(0.02, 3);
  });

  it("turns nothing with the fingers nearly together", () => {
    expect(twoStep(P(0, 0), P(10, 0), P(0, 0), P(0, 10), "free").motion.turn).toBe(0);
  });

  it("in a tilt, the up-and-down move tilts instead of panning", () => {
    const { motion } = twoStep(P(100, 300), P(200, 300), P(105, 260), P(205, 260), "tilt");
    expect(motion).toMatchObject({ dx: 5, dy: 0, tilt: -40 * TILT_PER_PX });
  });
});

describe("decide", () => {
  const side: [Point, Point] = [P(100, 300), P(220, 300)];
  it("waits until both fingers have moved far enough", () => {
    expect(decide(side, [P(100, 300 - REAL_PX + 1), P(220, 300 - REAL_PX + 1)], true)).toBeNull();
    // (one finger past the old instant of decision, 10 px, the other not yet moving: still unsettled, a hand's lead)
    expect(decide(side, [P(100, 288), P(220, 300)], true)).toBeNull();
  });
  it("tilts for two fingers side by side dragged up or down together", () => {
    expect(decide(side, [P(102, 270), P(221, 268)], true)).toBe("tilt");
    expect(decide(side, [P(100, 330), P(219, 331)], true)).toBe("tilt");
  });
  it("is free otherwise: a pan sideways, a pinch, fingers one above the other, or the top-down view", () => {
    expect(decide(side, [P(130, 300), P(250, 300)], true)).toBe("free");
    expect(decide(side, [P(100, 280), P(220, 320)], true)).toBe("free");
    expect(decide(side, [P(80, 300), P(240, 300)], true)).toBe("free");
    expect(decide([P(200, 100), P(200, 250)], [P(200, 70), P(200, 220)], true)).toBe("free");
    expect(decide(side, [P(102, 270), P(221, 268)], false)).toBe("free");
  });
});

describe("the glide after a flick", () => {
  it("measures the fingers' speed over their last moves, none once they had stopped", () => {
    const s = new Speed();
    for (let t = 0; t <= 80; t += 16) s.add(t, { ...NO_MOTION, dx: 16 });
    expect(s.at(80).dx).toBeCloseTo(1000, 6);
    expect(s.at(300).dx).toBe(0);
  });

  it("on a busy page, moves a long frame apart are as fast as their events' times say, never a frame's worth", () => {
    // (a slow phone: the press at 0, then a move every 620 ms of 100 px, 161 px a second; capping each gap at a frame
    // read 2000 px a second and threw the view)
    const s = new Speed();
    s.begin(0);
    for (let t = 620; t <= 1860; t += 620) s.add(t, { ...NO_MOTION, dx: 100 });
    expect(s.at(1860).dx).toBeCloseTo(100 / 0.62, 6);
    // the first move after a press is counted from the press
    s.begin(5000);
    s.add(5400, { ...NO_MOTION, dx: 40 });
    expect(s.at(5400).dx).toBeCloseTo(100, 6);
  });

  it("starts only above a speed, and slows by e every FLING_TAU seconds, going as far as the speed times FLING_TAU", () => {
    expect(flingFrom({ ...NO_MOTION, dx: 50 })).toBeNull();
    const v0: Motion = { ...NO_MOTION, dx: 1000, zoom: 0.1, turn: 2 };
    let v = flingFrom(v0)!;
    expect(v.zoom).toBe(0);
    expect(v.turn).toBe(2);
    let x = 0;
    let frames = 0;
    for (let moving = true; moving; frames++) {
      const s = flingStep(v, 1 / 60);
      x += s.move.dx;
      v = s.v;
      moving = s.moving;
      expect(frames).toBeLessThan(400);
    }
    expect(x).toBeGreaterThan(1000 * FLING_TAU * 0.95);
    expect(x).toBeLessThan(1000 * FLING_TAU);
    // a long frame (a busy page) goes as far as the glide would have in that time, never past speed × FLING_TAU, and a
    // glide in slow frames ends when one in quick frames does
    expect(flingStep({ ...NO_MOTION, dx: 1000 }, 0.6).move.dx).toBeCloseTo(1000 * FLING_TAU * (1 - Math.exp(-0.6 / FLING_TAU)), 9);
    expect(flingStep({ ...NO_MOTION, dx: 1000 }, 60).move.dx).toBeLessThanOrEqual(1000 * FLING_TAU);
    const lasts = (frame: number) => {
      let v: Motion = { ...NO_MOTION, dx: 1000 };
      let t = 0;
      for (let moving = true; moving; t += frame) ({ v, moving } = flingStep(v, frame));
      return t;
    };
    expect(Math.abs(lasts(0.62) - lasts(1 / 60))).toBeLessThanOrEqual(0.62);
  });
});

/** A touch layer with a host that records what it is asked. */
function layer(canTilt = true) {
  const log = { dropped: 0, moves: [] as Motion[], at: [] as Point[], fingers: [] as number[], decided: [] as Decision[] };
  const timers = new Map<number, () => void>();
  let id = 0;
  const t = new Touches({
    drop: () => void log.dropped++,
    move: (m, at) => void (log.moves.push(m), log.at.push(at)),
    fingers: (n) => void log.fingers.push(n),
    canTilt: () => canTilt,
    decided: (d) => void log.decided.push(d),
    still: () => true,
    later: (fn) => (timers.set(++id, fn), id),
    clear: (k) => void timers.delete(k),
  });
  const ev = (type: string, id: number, x: number, y: number, timeStamp: number) => ({ type, pointerId: id, clientX: x, clientY: y, timeStamp }) as unknown as PointerEvent;
  /** The page's next task: what waited for the rest of its touch runs. */
  const next = () => {
    const due = [...timers.values()];
    timers.clear();
    for (const fn of due) fn();
  };
  return { t, log, ev, next };
}

describe("Touches", () => {
  it("leaves one finger to the view, and takes the camera at a second, dropping the press", () => {
    const { t, log, ev, next } = layer();
    expect(t.down(ev("pointerdown", 1, 100, 300, 0))).toBe(false);
    expect(t.move(ev("pointermove", 1, 140, 300, 16))).toBe(false);
    expect(t.down(ev("pointerdown", 2, 300, 300, 400))).toBe(true);
    expect(log.dropped).toBe(1);
    // a pinch apart: a zoom in, once decided (and the touch's events all in)
    expect(t.move(ev("pointermove", 2, 330, 300, 420))).toBe(true);
    next();
    expect(log.moves.length).toBe(1);
    expect(log.moves[0].zoom).toBeLessThan(0);
    // the first finger up: the second, alone now, pans; the press is never the view's again
    expect(t.up(ev("pointerup", 1, 140, 300, 500))).toBe(true);
    expect(t.move(ev("pointermove", 2, 300, 280, 520))).toBe(true);
    expect(log.moves.at(-1)).toMatchObject({ dx: -30, dy: -20, zoom: 0 });
    expect(t.up(ev("pointerup", 2, 300, 280, 600))).toBe(true);
    expect(log.fingers).toEqual([]);
    expect(t.active).toBe(false);
  });

  it("a two-finger tap is 2, a three-finger tap 3; a slow or moving one is no tap", () => {
    const { t, log, ev } = layer();
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 200, 300, 30));
    t.move(ev("pointermove", 2, 203, 301, 60));
    t.up(ev("pointerup", 1, 100, 300, 120));
    t.up(ev("pointerup", 2, 203, 301, 130));
    t.down(ev("pointerdown", 4, 100, 300, 1000));
    t.down(ev("pointerdown", 5, 200, 300, 1010));
    t.down(ev("pointerdown", 6, 300, 300, 1020));
    for (const id of [4, 5, 6]) t.up(ev("pointerup", id, 100 * (id - 3), 300, 1100));
    expect(log.fingers).toEqual([2, 3]);
    // held too long
    t.down(ev("pointerdown", 7, 100, 300, 2000));
    t.down(ev("pointerdown", 8, 200, 300, 2010));
    t.up(ev("pointerup", 7, 100, 300, 2000 + TAP_MS + 1));
    t.up(ev("pointerup", 8, 200, 300, 2000 + TAP_MS + 2));
    // moved: a pinch
    t.down(ev("pointerdown", 9, 100, 300, 3000));
    t.down(ev("pointerdown", 10, 200, 300, 3010));
    t.move(ev("pointermove", 10, 260, 300, 3050));
    t.up(ev("pointerup", 9, 100, 300, 3100));
    t.up(ev("pointerup", 10, 260, 300, 3110));
    // the browser took them (pointercancel)
    t.down(ev("pointerdown", 11, 100, 300, 4000));
    t.down(ev("pointerdown", 12, 200, 300, 4010));
    t.up(ev("pointercancel", 11, 100, 300, 4050));
    t.up(ev("pointercancel", 12, 200, 300, 4050));
    expect(log.fingers).toEqual([2, 3]);
  });

  it("moves nothing until the gesture has decided, then carries the whole move so far", () => {
    const { t, log, ev, next } = layer();
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 220, 300, 5));
    t.move(ev("pointermove", 1, 100, 294, 20));
    t.move(ev("pointermove", 2, 220, 294, 21));
    next();
    expect(log.moves).toEqual([]);
    t.move(ev("pointermove", 1, 100, 290, 40));
    next();
    // (finger 1 at 10 px, finger 2 at 6: a hand's lead, still unsettled)
    expect(log.moves).toEqual([]);
    t.move(ev("pointermove", 2, 220, 292, 41));
    next();
    expect(log.moves.length).toBe(1);
    // decided a tilt: finger 1's 10 px and finger 2's 8 px, the middle up 9 px
    expect(log.moves[0].tilt).toBeCloseTo(-9 * TILT_PER_PX, 9);
    expect(log.moves[0].dy).toBe(0);
  });

  it("a tilt told a finger at a time (the moves piled up behind a slow frame) is a tilt; a pivot about a still finger is not", () => {
    const { t, log, ev } = layer();
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 220, 300, 5));
    // one touch, both fingers up 40 px: the browser tells finger 1's move, then finger 2's, at the touch's time
    t.move(ev("pointermove", 1, 100, 260, 100));
    expect(log.moves).toEqual([]);
    t.move(ev("pointermove", 2, 220, 260, 100));
    expect(log.moves.length).toBe(1);
    expect(log.moves[0].tilt).toBeCloseTo(-40 * TILT_PER_PX, 9);
    expect(log.moves[0]).toMatchObject({ dx: 0, dy: 0 });
    // finger 2 still: finger 1's next move decides, and carries the whole move so far
    const p = layer();
    p.t.down(p.ev("pointerdown", 1, 100, 300, 0));
    p.t.down(p.ev("pointerdown", 2, 220, 300, 5));
    p.t.move(p.ev("pointermove", 1, 100, 260, 100));
    expect(p.log.moves).toEqual([]);
    p.t.move(p.ev("pointermove", 1, 100, 250, 116));
    p.next();
    expect(p.log.moves.length).toBe(1);
    expect(p.log.moves[0]).toMatchObject({ dx: 0, dy: -25, tilt: 0 });
    expect(p.log.moves[0].turn).not.toBe(0);
  });

  it("in the top-down view the same drag pans", () => {
    const { t, log, ev, next } = layer(false);
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 220, 300, 5));
    t.move(ev("pointermove", 1, 100, 280, 20));
    next();
    expect(log.moves[0]).toMatchObject({ dy: -10, tilt: 0 });
  });

  it("a pinch told a finger at a time is one step per touch: the fingers' middle never steps aside and back", () => {
    const { t, log, ev, next } = layer();
    t.down(ev("pointerdown", 1, 200, 300, 0));
    t.down(ev("pointerdown", 2, 260, 300, 0));
    // one touch, both fingers apart 30 px: finger 1's move, then finger 2's, at the touch's time
    for (let k = 1; k <= 3; k++) {
      t.move(ev("pointermove", 1, 200 - 10 * k, 300, 16 * k));
      t.move(ev("pointermove", 2, 260 + 10 * k, 300, 16 * k));
    }
    expect(log.moves.length).toBeGreaterThan(0);
    for (const m of log.moves) expect(m).toMatchObject({ dx: 0, dy: 0, turn: 0 });
    expect(log.at.every((a) => a.x === 230 && a.y === 300)).toBe(true);
    expect(log.moves.reduce((z, m) => z + m.zoom, 0)).toBeCloseTo(Math.log(60 / 120), 9);
    // a finger lifted while its touch's step waits: the step goes first
    t.move(ev("pointermove", 1, 160, 300, 64));
    t.up(ev("pointerup", 1, 160, 300, 70));
    expect(log.moves.at(-1)!.zoom).toBeLessThan(0);
    next();
  });
});

/** Moves as a phone tells them: each finger's own pointer event, [finger, x, y, time (ms)]. */
type Trace = [number, number, number, number][];

/** A hand's two fingers (1 down at `a`, 2 at `b`), a frame (16 ms) apart: frame k moves finger 1 by `da(k)` and finger 2
 *  by `db(k)` from where each went down (null: that finger still, no event). Finger 2's events come `late` ms after its
 *  frame's (0: one touch, both told at its time, finger 1's first). */
function hand(a: Point, b: Point, frames: number, da: (k: number) => Point | null, db: (k: number) => Point | null, late = 0): Trace {
  const out: Trace = [];
  for (let k = 1; k <= frames; k++) {
    const pa = da(k);
    const pb = db(k);
    if (pa) out.push([1, a.x + pa.x, a.y + pa.y, 16 * k]);
    if (pb) out.push([2, b.x + pb.x, b.y + pb.y, 16 * k + late]);
  }
  return out.sort((p, q) => p[3] - q[3]);
}

/** Plays `trace` on a touch layer whose fingers went down at `a` and `b`: each event's handler, then the page's next task
 *  wherever the next event is another touch's (another time). How it settled, and the camera's moves summed. */
function play(a: Point, b: Point, trace: Trace) {
  const L = layer();
  L.t.down(L.ev("pointerdown", 1, a.x, a.y, 0));
  L.t.down(L.ev("pointerdown", 2, b.x, b.y, 1));
  trace.forEach(([id, x, y, t], i) => {
    L.t.move(L.ev("pointermove", id, x, y, t));
    if (trace[i + 1]?.[3] !== t) L.next();
  });
  const sum = (k: keyof Motion) => L.log.moves.reduce((n, m) => n + m[k], 0);
  const end = (id: number, from: Point) => {
    const e = trace.filter((q) => q[0] === id).at(-1);
    return e ? P(e[1], e[2]) : from;
  };
  const [ea, eb] = [end(1, a), end(2, b)];
  return {
    decided: L.log.decided,
    tilt: sum("tilt"),
    dx: sum("dx"),
    dy: sum("dy"),
    zoom: sum("zoom"),
    /** How far the fingers' middle went, across and up or down, in all. */
    midDx: (ea.x + eb.x) / 2 - (a.x + b.x) / 2,
    midDy: (ea.y + eb.y) / 2 - (a.y + b.y) / 2,
  };
}

/** A hand's sideways wobble (CSS px), frame by frame: ±3 at most. */
const WOBBLE = [0, 2, -1, -3, 1, 3, -2, 2, -3, 0, 1, -2, 3, -1, 2, -3, 0, 2, -2, 1];
const wob = (k: number) => WOBBLE[k % WOBBLE.length];

describe("two fingers as a hand moves them, not a robot (Kyler on an iPhone: the tilt almost never came)", () => {
  // (an index and a middle finger of one hand: about 70 px apart on a phone)
  const A = P(160, 420);
  const B = P(230, 420);

  /** It settled once, a tilt, and the whole of the fingers' up-and-down move tilted, none of it panned. */
  const tilted = (r: ReturnType<typeof play>) => {
    expect(r.decided.map((d) => d.mode)).toEqual(["tilt"]);
    expect(r.tilt).toBeCloseTo(r.midDy * TILT_PER_PX, 9);
    expect(Math.abs(r.midDy)).toBeGreaterThan(40);
    expect(r.dy).toBe(0);
  };

  it("one finger leading the other by three events is a tilt", () => {
    tilted(play(A, B, hand(A, B, 18, (k) => P(0, -4 * k), (k) => (k > 3 ? P(0, -4 * (k - 3)) : null))));
    // the other way round, down, and two events
    tilted(play(A, B, hand(A, B, 18, (k) => (k > 2 ? P(0, 5 * (k - 2)) : null), (k) => P(0, 5 * k))));
  });

  it("each finger wobbling ±3 px sideways while going up is a tilt", () => {
    tilted(play(A, B, hand(A, B, 16, (k) => P(wob(k), -4 * k), (k) => P(-wob(k + 3), -4 * k))));
  });

  it("the gap drifting 9 px over a 60 px drag is a tilt", () => {
    tilted(play(A, B, hand(A, B, 15, (k) => P(-0.3 * k, -4 * k), (k) => P(0.3 * k, -4 * k))));
    // drifting together as they go
    tilted(play(A, B, hand(A, B, 15, (k) => P(0, -4 * k), (k) => P(-0.6 * k, -4 * k))));
  });

  it("a slanted pair (30° off level) is a tilt; one clearly above the other is not", () => {
    const b = P(A.x + 100 * Math.cos(Math.PI / 6), A.y - 100 * Math.sin(Math.PI / 6));
    tilted(play(A, b, hand(A, b, 16, (k) => (k > 2 ? P(0, -4 * (k - 2)) : null), (k) => P(0, -4 * k))));
    const above = P(A.x + 30, A.y - 90);
    const r = play(A, above, hand(A, above, 16, (k) => P(0, -4 * k), (k) => P(0, -4 * k)));
    expect(r.decided.map((d) => [d.mode, d.why])).toEqual([["free", "one above the other"]]);
  });

  it("the two fingers' events interleaved one at a time, each at its own time, finger 2's up to a frame and a half behind, are a tilt", () => {
    tilted(play(A, B, hand(A, B, 16, (k) => P(0, -4 * k), (k) => P(0, -4 * k), 8)));
    tilted(play(A, B, hand(A, B, 16, (k) => P(0, -4 * k), (k) => P(0, -4 * k), 24)));
  });

  it("all of it at once (a slant, a lead, a wobble, a drifting gap, interleaved events) is a tilt", () => {
    const a = P(140, 430);
    const b = P(a.x + 80 * Math.cos(0.45), a.y - 80 * Math.sin(0.45));
    tilted(play(a, b, hand(a, b, 20, (k) => (k > 2 ? P(wob(k) - 0.3 * k, 3.5 * (k - 2)) : null), (k) => P(-wob(k + 5) + 0.2 * k, 3.5 * k), 20)));
  });

  /** It settled once, free, by `why`, the farther finger no farther than `by` (CSS px), and panned the middle's move. */
  const free = (r: ReturnType<typeof play>, why: string, by: number) => {
    expect(r.decided.map((d) => [d.mode, d.why])).toEqual([["free", why]]);
    expect(Math.max(r.decided[0].a, r.decided[0].b)).toBeLessThanOrEqual(by);
    expect(r.tilt).toBe(0);
    expect(r.dx).toBeCloseTo(r.midDx, 9);
    expect(r.dy).toBeCloseTo(r.midDy, 9);
  };

  it("a sideways pan, a diagonal pan, a pinch, a twist and a one-finger-led drag are free, as soon as each is clear", () => {
    // a sideways pan (wobbling up and down): once a finger has gone a deliberate move
    free(play(A, B, hand(A, B, 12, (k) => P(4 * k, wob(k) / 2), (k) => P(4 * k, -wob(k + 3) / 2))), "sideways", REAL_PX + 1);
    // a diagonal pan: once a finger's direction is its own, past the tilt's cone
    free(play(A, B, hand(A, B, 12, (k) => P(3 * k, -3 * k), (k) => P(3 * k, -3 * k))), "diagonal", CONE_PX + 5);
    // a pinch: the gap changed by a clear share, or one finger going sideways
    const pinch = play(A, B, hand(A, B, 10, (k) => P(-3 * k, wob(k) / 3), (k) => P(3 * k, 0)));
    free(pinch, "pinch", OPPOSE_PX + 3);
    expect(pinch.zoom).toBeCloseTo(Math.log(70 / Math.hypot(130, wob(10) / 3)), 9);
    free(play(A, B, hand(A, B, 10, () => null, (k) => P(4 * k, 0))), "sideways", REAL_PX + 4);
    // a twist about the middle: opposite ways; about one finger held still: past a turn of 15° or one finger led
    free(play(A, B, hand(A, B, 10, (k) => P(0, 3 * k), (k) => P(0, -3 * k))), "opposite ways", OPPOSE_PX + 3);
    const pivot = play(A, B, hand(A, B, 12, () => null, (k) => P(70 * Math.cos(-0.07 * k) - 70, 70 * Math.sin(-0.07 * k))));
    expect(pivot.decided.map((d) => d.mode)).toEqual(["free"]);
    expect(pivot.decided[0].b).toBeLessThanOrEqual(LEAD_PX + 5);
    // one finger leading alone, the other still: not a tilt's lead (fingers wide apart, where its line turns slowly)
    const wide = P(A.x + 120, A.y);
    free(play(A, wide, hand(A, wide, 12, (k) => P(wob(k) / 2, -4 * k), () => null)), "one finger led", LEAD_PX + 4);
  });

  it("the readout names how the last gesture settled", () => {
    const d = settle([A, B], [P(160, 400), P(231, 398)], true)!;
    expect(d.mode).toBe("tilt");
    expect(decisionLine(d)).toBe("two fingers: tilt (tilt)  travel 20px 22px  gap +1px  turn -2°");
    expect(decisionLine(null)).toBe("two fingers: none yet");
  });
});

/** A finger's press on a host that writes down what it was asked: shows, begins, applies, drops, taps and marks. */
function press(mode: PressMode, opts: { top?: number; begins?: boolean; cancelAt?: (p: Point) => boolean; held?: boolean } = {}) {
  const log: string[] = [];
  const marks: ({ at: Point; over: boolean } | null)[] = [];
  let timer: (() => void) | null = null;
  const host: PressHost = {
    show: (p) => log.push(`show ${p.x},${p.y}`),
    begin: (p) => (log.push(`begin ${p.x},${p.y}`), opts.begins ?? true),
    apply: (p) => log.push(`apply ${p.x},${p.y}`),
    drop: (begun) => log.push(`drop${begun ? " begun" : ""}`),
    tap: () => log.push("tap"),
    pan: (p) => log.push(`pan ${p.x},${p.y}`),
    overCancel: (p) => opts.cancelAt?.(p) ?? false,
    mark: (p, over) => marks.push(p ? { at: p, over } : null),
    later: (fn) => ((timer = fn), 1),
    clear: () => (timer = null),
  };
  const f = new FingerPress(mode, 7, P(200, 400), 1000, opts.top ?? 0, host, opts.held);
  return { f, log, marks, fire: () => timer?.() };
}

describe("a finger's press with something in hand (slice 3)", () => {
  const above = (x: number, y: number) => `${x},${y - FINGER_LIFT}`;

  it("aims a little above the finger, never above the view's top", () => {
    expect(aimAt(P(50, 300), 0)).toEqual(P(50, 300 - FINGER_LIFT));
    expect(aimAt(P(50, 90), 60)).toEqual(P(50, 61));
  });

  it("an aim shows at the press, follows the drag and applies once, on the lift, where it last showed", () => {
    const { f, log, marks } = press("aim");
    expect(log).toEqual([`show ${above(200, 400)}`]);
    f.move(P(230, 380), 1050);
    f.move(P(260, 360), 1050);
    expect(log.filter((l) => l.startsWith("apply"))).toEqual([]);
    f.up(P(260, 360), 1600);
    expect(log).toEqual([`show ${above(200, 400)}`, `show ${above(230, 380)}`, `show ${above(260, 360)}`, `apply ${above(260, 360)}`]);
    expect(marks.at(-1)).toBeNull();
    expect(marks[0]).toEqual({ at: P(200, 400 - FINGER_LIFT), over: false });
  });

  it("an aim held still past a tap's time applies on the lift; a tap applies nothing", () => {
    const held = press("aim");
    held.f.up(P(202, 401), 1000 + TAP_MS + 50);
    expect(held.log.at(-1)).toBe(`apply ${above(202, 401)}`);
    const tap = press("aim");
    tap.f.up(P(203, 402), 1120);
    expect(tap.log.at(-1)).toBe("tap");
    expect(tap.log.some((l) => l.startsWith("apply"))).toBe(false);
  });

  it("a draw begins where the press first aimed, once it moves past the slop, and draws on to the lift", () => {
    const { f, log } = press("draw");
    expect(log).toEqual([]);
    f.move(P(204, 400), 1050);
    expect(log).toEqual([]);
    f.move(P(200 + TAP_SLOP + 2, 400), 1050);
    expect(log).toEqual([`begin ${above(200, 400)}`, `show ${above(212, 400)}`]);
    f.move(P(260, 420), 1050);
    f.up(P(260, 420), 1200);
    expect(log.slice(2)).toEqual([`show ${above(260, 420)}`, `apply ${above(260, 420)}`]);
  });

  it("a draw or a move held still begins on the timer, and is still a tap by its events' times when the lift was quick", () => {
    const held = press("move");
    held.fire();
    expect(held.log).toEqual([`begin ${above(200, 400)}`, `show ${above(200, 400)}`]);
    held.f.up(P(200, 400), 1000 + TAP_MS + 100);
    expect(held.log.at(-1)).toBe(`apply ${above(200, 400)}`);
    // (a busy page ran the timer before the lift it had already been sent: the events say it was a tap)
    const busy = press("move");
    busy.fire();
    busy.f.up(P(200, 400), 1090);
    expect(busy.log.slice(2)).toEqual(["drop begun", "tap"]);
  });

  it("a draw or a move nothing takes is over: nothing shows, nothing applies, its lift does nothing", () => {
    const { f, log, marks } = press("move", { begins: false });
    f.move(P(240, 400), 1050);
    expect(log).toEqual([`begin ${above(200, 400)}`]);
    f.move(P(260, 400), 1050);
    f.up(P(260, 400), 1500);
    expect(log).toEqual([`begin ${above(200, 400)}`]);
    expect(marks).toEqual([null]);
  });

  it("dropped (a second finger, Cancel, the browser taking the touch): nothing applied, and nothing after", () => {
    const aim = press("aim");
    aim.f.move(P(240, 380), 1050);
    aim.f.cancel();
    aim.f.up(P(240, 380), 1500);
    expect(aim.log.at(-1)).toBe("drop");
    expect(aim.log.some((l) => l.startsWith("apply"))).toBe(false);
    const draw = press("draw");
    draw.f.move(P(240, 380), 1050);
    draw.f.cancel();
    expect(draw.log.at(-1)).toBe("drop begun");
    expect(draw.marks.at(-1)).toBeNull();
  });

  it("lifted over Cancel, nothing is applied; over it, what shows stays where it was and the mark says so", () => {
    const cancelAt = (p: Point) => p.y < 100;
    const { f, log, marks } = press("aim", { cancelAt });
    f.move(P(220, 300), 1050);
    f.move(P(200, 50), 1050);
    expect(log.at(-1)).toBe(`show ${above(220, 300)}`);
    expect(marks.at(-1)).toEqual({ at: P(200, 1), over: true });
    f.up(P(200, 50), 1600);
    expect(log.at(-1)).toBe("drop");
    // (off it again before the lift: it applies)
    const back = press("aim", { cancelAt });
    back.f.move(P(200, 50), 1050);
    back.f.move(P(210, 300), 1050);
    back.f.up(P(210, 300), 1600);
    expect(back.log.at(-1)).toBe(`apply ${above(210, 300)}`);
  });
});

describe("a finger's line, and a press held still (slice 3b)", () => {
  const above = (x: number, y: number) => `${x},${y - FINGER_LIFT}`;

  it("a line shows at the press as an aim does, then a drag past the slop draws it from where the press aimed, applied on the lift", () => {
    const { f, log } = press("line");
    expect(log).toEqual([`show ${above(200, 400)}`]);
    expect(f.drawing).toBe(false);
    f.move(P(205, 400), 1050);
    expect(log.at(-1)).toBe(`show ${above(205, 400)}`);
    f.move(P(200 + TAP_SLOP + 2, 400), 1050);
    expect(log.slice(2)).toEqual([`begin ${above(200, 400)}`, `show ${above(212, 400)}`]);
    expect(f.drawing).toBe(true);
    f.move(P(280, 430), 1050);
    expect(log.filter((l) => l.startsWith("apply"))).toEqual([]);
    f.up(P(280, 430), 1300);
    expect(log.slice(-2)).toEqual([`show ${above(280, 430)}`, `apply ${above(280, 430)}`]);
  });

  it("a line held still and lifted applies at its aim (its click); a tap applies nothing", () => {
    const held = press("line");
    held.f.up(P(201, 400), 1000 + TAP_MS + 40);
    expect(held.log).toEqual([`show ${above(200, 400)}`, `show ${above(201, 400)}`, `apply ${above(201, 400)}`]);
    expect(held.log.some((l) => l.startsWith("begin"))).toBe(false);
    const tap = press("line");
    tap.f.up(P(200, 400), 1100);
    expect(tap.log).toEqual([`show ${above(200, 400)}`, "tap"]);
  });

  it("a line dropped once drawn says so (its stroke goes); one nothing takes is over, its preview gone", () => {
    const drawn = press("line");
    drawn.f.move(P(240, 400), 1050);
    drawn.f.cancel();
    expect(drawn.log.at(-1)).toBe("drop begun");
    const refused = press("line", { begins: false });
    refused.f.move(P(240, 400), 1050);
    expect(refused.log.slice(-2)).toEqual([`begin ${above(200, 400)}`, "drop"]);
    refused.f.up(P(240, 400), 1500);
    expect(refused.log.at(-1)).toBe("drop");
  });

  it("a press begun by a finger held still begins at once, and is no tap once held by its events' times", () => {
    const { f, log } = press("draw", { held: true });
    expect(log).toEqual([`begin ${above(200, 400)}`, `show ${above(200, 400)}`]);
    f.move(P(260, 450), 1000 + HOLD_MS + 20);
    f.up(P(260, 450), 1000 + 600);
    expect(log.slice(-2)).toEqual([`show ${above(260, 450)}`, `apply ${above(260, 450)}`]);
    const still = press("draw", { held: true });
    still.f.up(P(200, 400), 1000 + HOLD_MS + 100);
    expect(still.log.at(-1)).toBe(`apply ${above(200, 400)}`);
    // (a busy page ran the hold's timer late: lifted at a tap's time by its events, it is the tap; between, nothing)
    const quick = press("draw", { held: true });
    quick.f.up(P(201, 400), 1000 + TAP_MS - 20);
    expect(quick.log.slice(-2)).toEqual(["drop begun", "tap"]);
    const between = press("draw", { held: true });
    between.f.up(P(201, 400), 1000 + HOLD_MS - 50);
    expect(between.log.at(-1)).toBe("drop begun");
  });

  it("a press begun as held, moved past the slop before the hold by its events' times, was a pan: what it began goes", () => {
    // (a busy page ran the hold's timer before the drag's first move, sent 16 ms after the press)
    const { f, log, marks } = press("draw", { held: true });
    f.move(P(200 + TAP_SLOP + 2, 400), 1016);
    expect(log.slice(2)).toEqual(["drop begun", `pan ${200 + TAP_SLOP + 2},400`]);
    expect(marks.at(-1)).toBeNull();
    f.move(P(260, 450), 1032);
    f.up(P(260, 450), 1048);
    expect(log.length).toBe(4);
    // (moved within the slop first, then past it after the hold: it draws)
    const late = press("draw", { held: true });
    late.f.move(P(203, 400), 1016);
    late.f.move(P(260, 450), 1000 + HOLD_MS + 10);
    expect(late.log.at(-1)).toBe(`show ${above(260, 450)}`);
  });

  it("a press begun as held whose lift is its first move past the slop, before the hold by its events' times, leaves nothing", () => {
    // (no move delivered before the lift: the finger is up, so what it began goes and no pan is left for it; as a pan with
    // no move before its lift, it moves nothing, and having moved past the slop it is no tap)
    const { f, log, marks } = press("draw", { held: true });
    f.up(P(200 + TAP_SLOP + 5, 400), 1100);
    expect(log.slice(2)).toEqual(["drop begun"]);
    expect(marks.at(-1)).toBeNull();
    f.move(P(260, 450), 1120);
    f.up(P(260, 450), 1140);
    expect(log.length).toBe(3);
  });
});
