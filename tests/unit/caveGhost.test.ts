// The caves seen through the rock (caveGhost.ts; 3D view, "The caves through the rock"): which cells are air under a
// roof, their floors, walls and mouths, on hand-made columns.

import { describe, expect, it } from "vitest";
import { caveFaces } from "../../src/render3d/caveGhost";

const mask = (...solid: number[]): number => solid.reduce((m, z) => m | (1 << z), 0);
const span = (lo: number, hi: number): number[] => Array.from({ length: hi - lo }, (_, k) => lo + k);

/** A W × H map of plain ground at `ground`, with `cols` (x, y, mask) set. */
function map(W: number, H: number, ground: number, cols: [number, number, number][]) {
  const masks = new Uint32Array(W * H).fill(mask(...span(0, ground)));
  const plain = masks[0];
  for (const [x, y, m] of cols) masks[y * W + x] = m;
  return caveFaces(W, H, (i) => masks[i] !== plain, (i) => masks[i]);
}

describe("caveFaces", () => {
  it("draws nothing on a map without terrain above terrain", () => {
    const f = map(6, 6, 4, []);
    expect(f).toMatchObject({ cells: 0, floors: 0, walls: 0, mouths: 0 });
    expect(f.fill.pos).toHaveLength(0);
    expect(f.line.pos).toHaveLength(0);
  });

  it("finds a closed pocket's floor and four walls, and no mouth", () => {
    // ground 0–7; one tile with air 2–3 under a roof 4–7, ringed by solid ground
    const f = map(5, 5, 8, [[2, 2, mask(0, 1, ...span(4, 8))]]);
    expect(f.cells).toBe(2);
    expect(f.floors).toBe(1);
    expect(f.walls).toBe(8);
    expect(f.mouths).toBe(0);
    // (a fill per floor and wall, at the layer's quads: four corners of three numbers each)
    expect(f.fill.pos).toHaveLength((1 + 8) * 12);
    expect(f.fill.col).toHaveLength((1 + 8) * 16);
  });

  it("finds an overhang's mouths where its air meets the open, and frames them", () => {
    // ground 0–3 everywhere; tile (2, 2) is a ledge 0–1 with air 2–3 under a roof 4–5: the ground round it stops at 4, so
    // air at 2–3 beside it is rock (walls), while the ledge (3, 2) lower at 2 leaves its layers 2–3 open (mouths)
    const f = map(5, 5, 4, [
      [2, 2, mask(0, 1, 4, 5)],
      [3, 2, mask(0, 1)],
    ]);
    expect(f.cells).toBe(2);
    expect(f.mouths).toBe(2);
    expect(f.walls).toBe(6);
    // the mouth two blocks high and one wide: framed below and above, and at both ends of each block (each a line over its
    // dark edge)
    const frames = 6;
    // the floor's outline: its east side opens to the ledge's floor at 2, which is no cave's floor; the other three sides
    // end at walls
    const outlines = 4;
    expect(f.line.pos).toHaveLength((frames + outlines) * 2 * 12);
  });

  it("keeps cells above a layer cut out (the masks as drawn)", () => {
    const col = mask(0, 1, ...span(4, 8));
    const cut = (1 << 3) - 1;
    const W = 5;
    const masks = new Uint32Array(W * W).fill(mask(...span(0, 8)));
    masks[2 * W + 2] = col;
    const f = caveFaces(W, W, (i) => i === 12, (i) => masks[i] & cut);
    // (under a cut at 3 the roof is gone: the air at 2 is open, no cave)
    expect(f.cells).toBe(0);
  });
});
