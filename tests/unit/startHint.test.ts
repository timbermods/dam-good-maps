// "The start fits here" (PLAN §20 D204 (4)): the spots a Flatten stroke's level ground offers the
// district center.

import { describe, expect, it } from "vitest";
import { startSpots } from "../../src/editor/startHint";

const W = 40;
const H = 30;
const hold = (x: number, y: number, n = 3) => Array.from({ length: n }, () => [4 * x + 2, 4 * y + 2]).flat();

describe("where the start fits after a Flatten stroke", () => {
  const heights = new Uint8Array(W * H).fill(5);
  // the stroke's level ground: a disc of level 8 round (20, 15)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 20, y - 15) <= 5) heights[y * W + x] = 8;
  const dry = new Float32Array(W * H);
  const p = { size: 6, level: 8, dabs: hold(20, 15) };

  it("finds the spot nearest the stroke's middle, its footprint and door on the level ground", () => {
    const spots = startSpots(p, heights, dry, W, H, "Cw0", null);
    expect(spots.length).toBeGreaterThan(0);
    expect(Math.hypot(spots[0].x - 20, spots[0].y - 15)).toBeLessThanOrEqual(1.5);
    for (const s of spots) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(heights[(s.y + dy) * W + s.x + dx]).toBe(8);
  });

  it("none on ground too small, under water, at another level, or where the start stands already", () => {
    expect(startSpots({ ...p, level: 7 }, heights, dry, W, H, "Cw0", null)).toEqual([]);
    const wet = new Float32Array(W * H).fill(0.5);
    expect(startSpots(p, heights, wet, W, H, "Cw0", null)).toEqual([]);
    const small = new Uint8Array(W * H).fill(5);
    for (let y = 14; y <= 16; y++) for (let x = 19; x <= 20; x++) small[y * W + x] = 8;
    expect(startSpots({ ...p, size: 2 }, small, dry, W, H, "Cw0", null)).toEqual([]);
    expect(startSpots(p, heights, dry, W, H, "Cw0", { x: 20, y: 15 }, 3, 10)).toEqual([]);
  });
});
