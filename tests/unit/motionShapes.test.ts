// The moving water's shapes (D353): lanes down the current, the foam ribbons' arrays and the Flow
// view's streaks, made from the surface water and its current.

import { describe, expect, it } from "vitest";
import { motionShapes, shapeBuffers, STEPS } from "../../src/render3d/motionShapes";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";

const W = 64;
const H = 12;

/** A W x H map with a channel on rows 4..7 (depth 1, flat floor); the current is `speed` tiles a second east. */
function channel(speed: number) {
  const depth = new Float32Array(W * H);
  const current = new Float32Array(W * H * 2);
  for (let y = 4; y < 8; y++)
    for (let x = 0; x < W; x++) {
      depth[y * W + x] = 1;
      current[(y * W + x) * 2] = speed;
    }
  const sw = surfaceWater(W, H, waterFromDepth(new Uint8Array(W * H).fill(5), depth, new Float32Array(W * H)));
  return { sw, current };
}

describe("the moving water's shapes", () => {
  it("a long straight channel gives lanes that run east on wet tiles, with arrays of matching lengths", () => {
    const { sw, current } = channel(2);
    const s = motionShapes(W, H, sw, current);
    expect(s.stats.lanes).toBeGreaterThanOrEqual(1);
    const { cues, streaks } = s;
    const vertices = cues.position.length / 3;
    expect(vertices).toBeGreaterThan(0);
    expect(vertices % 6).toBe(0);
    expect(cues.direction.length).toBe(vertices * 3);
    expect(cues.detail.length).toBe(vertices * 4);
    expect(cues.energy.length).toBe(vertices * 4);
    expect(streaks.rows).toBe(s.stats.lanes);
    expect(streaks.paths.length).toBe(STEPS * 4 * streaks.rows);
    expect(streaks.track.length).toBe(s.stats.streaks * 3);
    // every lane's points (x, height, -y, badwater) move east and stand on wet tiles
    for (let row = 0; row < streaks.rows; row++) {
      let last = -Infinity;
      for (let k = 0; k < STEPS; k++) {
        const o = (row * STEPS + k) * 4;
        const x = streaks.paths[o];
        const y = -streaks.paths[o + 2];
        expect(x).toBeGreaterThanOrEqual(last);
        last = x;
        expect(sw.depth[Math.floor(y) * W + Math.floor(x)]).toBeGreaterThan(0);
      }
      expect(streaks.paths[(row * STEPS + STEPS - 1) * 4]).toBeGreaterThan(streaks.paths[row * STEPS * 4]);
    }
  });

  it("a still lake gives no lanes, wakes, streaks or cue triangles", () => {
    const { sw, current } = channel(0);
    const s = motionShapes(W, H, sw, current);
    expect(s.stats).toEqual({ lanes: 0, wakes: 0, seams: 0, streaks: 0, triangles: 0 });
    expect(s.cues.position.length).toBe(0);
    expect(s.streaks.track.length).toBe(0);
  });

  it("the same input twice gives identical arrays", () => {
    const { sw, current } = channel(2);
    const a = motionShapes(W, H, sw, current);
    const b = motionShapes(W, H, sw, current);
    expect(b.stats).toEqual(a.stats);
    expect(Array.from(b.cues.position)).toEqual(Array.from(a.cues.position));
    expect(Array.from(b.cues.energy)).toEqual(Array.from(a.cues.energy));
    expect(Array.from(b.streaks.paths)).toEqual(Array.from(a.streaks.paths));
    expect(Array.from(b.streaks.track)).toEqual(Array.from(a.streaks.track));
  });

  it("shapeBuffers returns the 7 underlying buffers", () => {
    const { sw, current } = channel(2);
    const s = motionShapes(W, H, sw, current);
    const b = shapeBuffers(s);
    expect(b.length).toBe(7);
    expect(b[0]).toBe(s.cues.position.buffer);
    expect(b[4]).toBe(s.streaks.paths.buffer);
    expect(b[6]).toBe(s.streaks.position.buffer);
  });
});
