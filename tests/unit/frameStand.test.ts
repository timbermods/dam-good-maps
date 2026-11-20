// The stand of ruins in the opening view (gen/frameStand.ts, D493 as planning ruled it on 2026-11-20): on dry ground
// only, never between the start and its water, past Normal's clear distance, its whole self in the pulled-back frame,
// never a row or a grid; ahead of the colony and raised where the land offers it.

import { describe, expect, it } from "vitest";
import { elongation, FRAME_STAND, planFrameStand } from "../../src/core/gen/frameStand";
import { frameAt, openingCamera, VISTA_ZOOM } from "../../src/core/analysis/opening";
import { distanceFrom } from "../../src/core/math/grid";
import { Rng } from "../../src/core/math/rng";

const W = 160, H = 160, N = W * H;
const START = { x: 64, y: 40, z: 2, orientation: "Cw0" as const };
const CLEAR = 16;

/** Level 2 ground with plateaus of level 4 (one ahead of the start's look, one green, one behind it), a pond ahead of
 *  the start with green round it, and the start's own green round it. */
function land(allGreen = false) {
  const heights = new Uint8Array(N).fill(2);
  const water = new Float64Array(N);
  const moisture = new Float64Array(N);
  const box = (x0: number, y0: number, x1: number, y1: number, f: (i: number) => void) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f(y * W + x);
  };
  box(76, 84, 98, 104, (i) => (heights[i] = 4)); // ahead and up
  box(20, 90, 40, 110, (i) => {
    heights[i] = 4;
    moisture[i] = 3; // a green plateau: never
  });
  box(100, 10, 120, 30, (i) => (heights[i] = 4)); // off the look
  box(60, 52, 68, 58, (i) => (water[i] = 1)); // the start's pond
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (!water[i] && Math.hypot(x - 64, y - 55) < 9) moisture[i] = 4;
    if (Math.hypot(x - START.x, y - START.y) < 12) moisture[i] = 5;
    if (allGreen && !water[i]) moisture[i] = 2;
  }
  const startMask = new Uint8Array(N);
  box(START.x - 1, START.y - 1, START.x + 2, START.y + 2, (i) => (startMask[i] = 1));
  const startDist = distanceFrom(startMask, W, H);
  const walk = Float64Array.from(startDist);
  const moist = Uint8Array.from(moisture, (m, i) => (m > 0 && !water[i] ? 1 : 0));
  const free = Uint8Array.from(water, (d) => (d > 0 ? 0 : 1));
  const g = { W, H, heights, water, moisture, soilContamination: new Float64Array(N), taken: new Uint8Array(N), entities: [] };
  return { g, moist, free, startDist, walk, water };
}

function stands(allGreen = false) {
  const l = land(allGreen);
  const out = [];
  for (let seed = 1; seed <= 8; seed++) out.push(planFrameStand(l.g, START, l.free, l.moist, l.startDist, l.walk, CLEAR, new Rng(seed)));
  return { l, out };
}

describe("the stand of ruins in the opening view", () => {
  const { l, out } = stands();
  const got = out.filter((s) => s !== null);

  it("finds a stand on the land that offers one, ahead of the colony and raised first", () => {
    expect(got.length).toBe(8);
    for (const s of got) {
      expect(s.ahead && s.raised).toBe(true);
      expect(s.tiles.every((i) => l.g.heights[i] === 4)).toBe(true);
    }
  });

  it("stands on dry ground only, past the clear distance, off the water", () => {
    for (const s of got)
      for (const i of s.tiles) {
        expect(l.moist[i]).toBe(0);
        expect(l.startDist[i]).toBeGreaterThanOrEqual(CLEAR);
        expect(l.water[i]).toBe(0);
      }
  });

  it("never stands between the start and its water", () => {
    // the shore the walk reaches first, and the ellipse round the way there
    let shore = -1;
    for (let i = 0; i < N; i++) {
      if (l.water[i]) continue;
      const x = i % W, y = (i - x) / W;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => l.water[(y + dy) * W + x + dx] > 0);
      if (touches && (shore < 0 || l.walk[i] < l.walk[shore])) shore = i;
    }
    const sx = START.x + 0.5, sy = START.y + 0.5, wx = (shore % W) + 0.5, wy = Math.floor(shore / W) + 0.5;
    const toShore = Math.hypot(wx - sx, wy - sy);
    for (const s of got)
      for (const i of s.tiles) {
        const x = (i % W) + 0.5, y = Math.floor(i / W) + 0.5;
        expect(Math.hypot(x - sx, y - sy) + Math.hypot(x - wx, y - wy)).toBeGreaterThanOrEqual(toShore + FRAME_STAND.between);
      }
  });

  it("stands whole in the pulled-back frame", () => {
    const cam = openingCamera(START, VISTA_ZOOM);
    for (const s of got)
      for (const i of s.tiles)
        for (const z of [l.g.heights[i], l.g.heights[i] + 8]) {
          const p = frameAt(cam, (i % W) + 0.5, Math.floor(i / W) + 0.5, z)!;
          expect(Math.abs(p.u)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.v)).toBeLessThanOrEqual(1);
        }
  });

  it("is never a row or a grid: one ragged piece of 10 or more, its long axis at most 3 × its short one", () => {
    for (const s of got) {
      expect(s.tiles.length).toBeGreaterThanOrEqual(10);
      expect(elongation(s.tiles, W)).toBeLessThanOrEqual(FRAME_STAND.elongation);
      const xs = s.tiles.map((i) => i % W), ys = s.tiles.map((i) => Math.floor(i / W));
      const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      expect(s.tiles.length).toBeLessThan(box);
    }
    // and each map's stand its own shape
    expect(new Set(got.map((s) => s.tiles.join())).size).toBeGreaterThan(1);
  });

  it("finds none where the view holds only green: the map keeps its ruins as they are", () => {
    expect(stands(true).out.every((s) => s === null)).toBe(true);
  });
});
