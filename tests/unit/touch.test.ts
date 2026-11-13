// Touch in the 3D view (render3d/touch.ts, #1074): the two-finger step's arithmetic, how a gesture decides to tilt,
// the glide after a flick, and the touch layer's own bookkeeping (a second finger drops the press and takes the
// camera; a two- or three-finger tap is Undo or Redo; a lone finger left pans). touch.spec drives real touch events.

import { describe, expect, it } from "vitest";
import { decide, DECIDE_PX, flingFrom, flingStep, FLING_TAU, NO_MOTION, Speed, TAP_MS, TILT_PER_PX, Touches, twoStep, type Motion, type Point } from "../../src/render3d/touch";

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
  it("waits until a finger has moved far enough", () => {
    expect(decide(side, [P(100, 300 - DECIDE_PX + 1), P(220, 300 - DECIDE_PX + 1)], true)).toBeNull();
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
  const log = { dropped: 0, moves: [] as Motion[], fingers: [] as number[] };
  const t = new Touches({
    drop: () => void log.dropped++,
    move: (m) => void log.moves.push(m),
    fingers: (n) => void log.fingers.push(n),
    canTilt: () => canTilt,
    still: () => true,
  });
  const ev = (type: string, id: number, x: number, y: number, timeStamp: number) => ({ type, pointerId: id, clientX: x, clientY: y, timeStamp }) as unknown as PointerEvent;
  return { t, log, ev };
}

describe("Touches", () => {
  it("leaves one finger to the view, and takes the camera at a second, dropping the press", () => {
    const { t, log, ev } = layer();
    expect(t.down(ev("pointerdown", 1, 100, 300, 0))).toBe(false);
    expect(t.move(ev("pointermove", 1, 140, 300, 16))).toBe(false);
    expect(t.down(ev("pointerdown", 2, 300, 300, 400))).toBe(true);
    expect(log.dropped).toBe(1);
    // a pinch apart: a zoom in, once decided
    expect(t.move(ev("pointermove", 2, 330, 300, 420))).toBe(true);
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
    const { t, log, ev } = layer();
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 220, 300, 5));
    t.move(ev("pointermove", 1, 100, 294, 20));
    t.move(ev("pointermove", 2, 220, 294, 21));
    expect(log.moves).toEqual([]);
    t.move(ev("pointermove", 1, 100, 290, 40));
    expect(log.moves.length).toBe(1);
    // decided a tilt: finger 1's 10 px and finger 2's 6 px, the middle up 8 px
    expect(log.moves[0].tilt).toBeCloseTo(-8 * TILT_PER_PX, 9);
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
    expect(p.log.moves.length).toBe(1);
    expect(p.log.moves[0]).toMatchObject({ dx: 0, dy: -25, tilt: 0 });
    expect(p.log.moves[0].turn).not.toBe(0);
  });

  it("in the top-down view the same drag pans", () => {
    const { t, log, ev } = layer(false);
    t.down(ev("pointerdown", 1, 100, 300, 0));
    t.down(ev("pointerdown", 2, 220, 300, 5));
    t.move(ev("pointermove", 1, 100, 280, 20));
    expect(log.moves[0]).toMatchObject({ dy: -10, tilt: 0 });
  });
});
