// The water's outflows and current (D353): the worker sends each column's outflows (four, in the order
// -y, -x, +y, +x); the renderer's current is the net across each face, averaged over a tile's two opposite
// faces and divided by the depth.

import { describe, expect, it } from "vitest";
import { currentOf, outflowsOf } from "../../src/render3d/current";
import type { WaterView } from "../../src/render3d/model";

const W = 3;
const H = 3;
const MID = 4; // the middle tile (1, 1)

/** The current at the given tiles (each `depth` deep, the rest dry), two numbers a tile. */
function at(tiles: number[], depth: number, out: Float32Array): Float32Array {
  const grid = new Float32Array(W * H);
  for (const t of tiles) grid[t] = depth;
  const c = currentOf(W, H, out, grid);
  return Float32Array.from(tiles.flatMap((t) => [c[t * 2], c[t * 2 + 1]]));
}

/** A view of the given tiles (all with the same depth). */
function viewOf(tiles: number[], depth: number): WaterView {
  const n = tiles.length;
  return { count: n, tile: Int32Array.from(tiles), floor: new Float32Array(n), depth: new Float32Array(n).fill(depth), contamination: new Float32Array(n) };
}


/** The current at the middle tile when it sends `v` out of face `face` (0 north, 1 west, 2 south, 3 east). */
function middle(face: number, v: number, depth = 0.5) {
  const out = new Float32Array(W * H * 4);
  out[MID * 4 + face] = v;
  return at([MID], depth, out);
}

describe("the water's current from the outflows", () => {
  it("a tile sending 0.8 east gives vx = 0.8 x 0.5 / depth, and the other directions have the right signs", () => {
    const e = middle(3, 0.8);
    expect(e[0]).toBeCloseTo((0.8 * 0.5) / 0.5, 5);
    expect(e[1]).toBe(0);
    const w = middle(1, 0.8);
    expect(w[0]).toBeCloseTo(-0.8, 5);
    expect(w[1]).toBe(0);
    const n = middle(0, 0.8);
    expect(n[0]).toBe(0);
    expect(n[1]).toBeCloseTo(-0.8, 5);
    const s = middle(2, 0.8);
    expect(s[0]).toBe(0);
    expect(s[1]).toBeCloseTo(0.8, 5);
  });

  it("is the net across a face: equal opposing exchange between two tiles gives 0", () => {
    const out = new Float32Array(W * H * 4);
    out[MID * 4 + 3] = 0.8; // the middle sends east
    out[(MID + 1) * 4 + 1] = 0.8; // its east neighbour sends the same back west
    const c = at([MID, MID + 1], 0.5, out);
    expect(Array.from(c)).toEqual([0, 0, 0, 0]);
  });

  it("a tile on the edge reads nothing outside the array", () => {
    const out = new Float32Array(W * H * 4).fill(0.2);
    const corners = [0, W - 1, W * (H - 1), W * H - 1];
    const c = at(corners, 1, out);
    expect(c.length).toBe(corners.length * 2);
    for (const v of c) expect(Number.isFinite(v)).toBe(true);
    // the top left corner sending 0.6 east: no west face to take away
    const only = new Float32Array(W * H * 4);
    only[3] = 0.6;
    expect(at([0], 1, only)[0]).toBeCloseTo(0.3, 5);
  });

  it("dry or film-deep columns get 0", () => {
    const out = new Float32Array(W * H * 4).fill(1);
    for (const d of [0, 0.001, -1]) {
      const c = at([MID], d, out);
      expect([c[0], c[1]]).toEqual([0, 0]);
    }
  });

  it("the worker's outflows: four a column, copied from its tile, never negative", () => {
    const out = new Float32Array(W * H * 4);
    out.set([0.1, -0.2, 0.3, 0.4], MID * 4);
    out.set([0.5, 0.6, 0.7, 0.8], 0);
    const o = outflowsOf(viewOf([MID, 0], 1), W, H, out)!;
    expect(Array.from(o)).toEqual(Array.from(Float32Array.from([0.1, 0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])));
  });

  it("the worker sends none when the outflows are missing or the wrong length", () => {
    const v = viewOf([MID], 1);
    expect(outflowsOf(v, W, H, undefined)).toBeUndefined();
    expect(outflowsOf(v, W, H, null)).toBeUndefined();
    expect(outflowsOf(v, W, H, new Float32Array(W * H * 4 - 1))).toBeUndefined();
  });
});
