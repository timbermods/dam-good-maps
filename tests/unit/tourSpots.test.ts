// The 20-second tour's spots (D377): chosen from the land by rules, so the same map always gets the same tour and every
// kind of land gets a sensible one: a river down a slope on dry ground, a crater on flat ground clear of it, and (once
// those have played) a hill and a shelf on flat dry ground clear of both, near each other, all inside the map.

import { describe, expect, it } from "vitest";
import { brushSpots, craterPowerFor, flatness, forceSpots, HILL_REACH, RIVER_REACH, type TourGround } from "../../src/editor/tour/spots";
import { naturalSize } from "../../src/core/forces/craterize";

const N = 96;

/** A made-up land: flat; or a plateau in the north that steps down to the south in three-tile terraces; either with a
 *  lake in the east, or not. */
function land(kind: "slope" | "flat" | "lake"): TourGround {
  const heights = new Uint8Array(N * N);
  const depth = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (kind === "flat") heights[i] = 8;
      else heights[i] = y < 44 ? 20 : Math.max(2, 20 - Math.floor((y - 44) / 3));
      if (kind === "lake" && x > 60 && y > 20 && y < 70) {
        heights[i] = 3;
        depth[i] = 1.5;
      }
    }
  return { W: N, H: N, heights, depth, objects: [{ x: 30, y: 30 }] };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("the tour's spots (D377)", () => {
  for (const kind of ["slope", "flat", "lake"] as const) {
    it(`on ${kind} land: the same every time, on the map, dry, clear of each other`, () => {
      const g = land(kind);
      const f = forceSpots(g);
      expect(forceSpots(land(kind))).toEqual(f);
      // the river: a course of dry points inside the map, going down (never up) from its first
      expect(f.river.length).toBeGreaterThanOrEqual(5);
      for (const p of f.river) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.y).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(N - 1);
        expect(p.y).toBeLessThan(N - 1);
        expect(g.depth[p.y * N + p.x]).toBe(0);
      }
      for (let k = 1; k < f.river.length; k++) expect(g.heights[f.river[k].y * N + f.river[k].x]).toBeLessThanOrEqual(g.heights[f.river[k - 1].y * N + f.river[k - 1].x]);
      // the crater: struck on flat ground, at a Power whose crater is a share of the map, clear of the river
      expect(flatness(g, f.crater.x, f.crater.y, 8)).toBeGreaterThan(0.5);
      expect(f.craterPower % 5).toBe(0);
      expect(f.craterRadius).toBe(naturalSize(f.craterPower) / 2);
      expect(f.craterRadius * 2).toBeLessThanOrEqual(N * 0.45);
      expect(Math.min(...f.river.map((p) => dist(p, f.crater)))).toBeGreaterThanOrEqual(RIVER_REACH + f.craterRadius - 4);
      // the hill and the shelf, on the land as the forces left it: dry, apart from each other, near, off the objects
      const b = brushSpots(g, f);
      expect(brushSpots(g, f)).toEqual(b);
      expect(flatness(g, b.hill.x, b.hill.y, 6)).toBeGreaterThan(0.5);
      expect(g.depth[b.hill.y * N + b.hill.x] + g.depth[b.shelf.y * N + b.shelf.x]).toBe(0);
      expect(dist(b.hill, b.shelf)).toBeGreaterThanOrEqual(HILL_REACH);
      expect(dist(b.hill, b.shelf)).toBeLessThanOrEqual(24);
      expect(dist(b.hill, { x: 30, y: 30 })).toBeGreaterThan(3);
    });
  }

  it("the crater's Power makes about three tenths of the map's width, on steps of five", () => {
    for (const size of [64, 96, 128, 192, 256]) {
      const p = craterPowerFor(size, size);
      expect(p % 5).toBe(0);
      const width = naturalSize(p);
      expect(width).toBeGreaterThanOrEqual(18);
      expect(width).toBeLessThanOrEqual(48);
    }
  });
});
