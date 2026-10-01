// The camera keys' motion (render3d/cameraGlide.ts), a frame at a time on exact frame times: held, it
// moves every frame, easing in; let go, it glides to a stop and stays; Shift is faster; Q turns; a
// stalled frame never throws it. (The page's own frames are the browser's: camera.spec checks the keys
// reach it there.)

import { describe, expect, it } from "vitest";
import { FAST_PAN, glideStep, MAX_DT, PAN_PER_SECOND, STILL, wanted, type Glide } from "../../src/render3d/cameraGlide";

/** Hold `keys` for `ms`, then let go, at `frameMs` a frame: how far it went (screen heights), frames
 *  that moved while held, and how long it took to stop after letting go. */
function hold(keys: string[], ms: number, frameMs = 1000 / 60, shift = false) {
  let g: Glide = { ...STILL, fast: shift };
  let x = 0;
  let y = 0;
  let movedFrames = 0;
  let frames = 0;
  for (let t = 0; t < ms; t += frameMs) {
    const s = glideStep(g, wanted(new Set(keys), true), frameMs / 1000);
    g = s.glide;
    x += s.pan.x;
    y += s.pan.y;
    frames++;
    if (s.pan.x || s.pan.y) movedFrames++;
  }
  let stopMs = 0;
  for (;;) {
    const s = glideStep(g, wanted(new Set(), true), frameMs / 1000);
    g = s.glide;
    x += s.pan.x;
    y += s.pan.y;
    if (!s.moving) break;
    stopMs += frameMs;
    if (stopMs > 5000) throw new Error("it never stopped");
  }
  return { distance: Math.hypot(x, y), x, y, frames, movedFrames, stopMs, glide: g };
}

describe("the camera keys' glide", () => {
  it("held, it moves every frame, easing in to full speed", () => {
    const h = hold(["d"], 400);
    expect(h.movedFrames).toBe(h.frames);
    expect(h.x).toBeLessThan(0);
    // (eased in over about 0.12 s: a little under full speed's distance)
    expect(h.distance).toBeGreaterThan(PAN_PER_SECOND * 0.3);
    expect(h.distance).toBeLessThan(PAN_PER_SECOND * 0.6);
  });

  it("let go, it glides to a stop in about 0.18 s and stays", () => {
    const h = hold(["w"], 400);
    expect(h.stopMs).toBeGreaterThan(100);
    expect(h.stopMs).toBeLessThan(250);
    const again = glideStep(h.glide, wanted(new Set(), true), 1 / 60);
    expect(again.moving).toBe(false);
    expect(again.pan).toEqual({ x: 0, y: 0 });
  });

  it("Shift is faster: the same hold goes about 2.5 times as far", () => {
    const plain = hold(["w"], 400);
    const fast = hold(["s"], 400, 1000 / 60, true);
    expect(fast.y).toBeLessThan(0);
    expect(fast.distance / plain.distance).toBeCloseTo(FAST_PAN, 6);
  });

  it("the same at any frame rate, and a stalled frame never throws it", () => {
    const smooth = hold(["d"], 600, 1000 / 120);
    const slow = hold(["d"], 600, 1000 / 30);
    expect(Math.abs(slow.distance - smooth.distance) / smooth.distance).toBeLessThan(0.1);
    const stalled = glideStep({ ...STILL, x: 1 }, wanted(new Set(["d"]), true), 2);
    expect(Math.abs(stalled.pan.x)).toBeCloseTo(PAN_PER_SECOND * MAX_DT, 9);
  });

  it("Q turns the 3D view; top-down doesn't turn", () => {
    let g: Glide = { ...STILL };
    let yaw = 0;
    for (let k = 0; k < 18; k++) {
      const s = glideStep(g, wanted(new Set(["q"]), true), 1 / 60);
      g = s.glide;
      yaw += s.yaw;
    }
    expect(yaw).toBeGreaterThan(0);
    expect(wanted(new Set(["q"]), false).yaw).toBe(0);
  });
});
