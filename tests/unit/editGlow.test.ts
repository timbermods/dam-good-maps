// What an edit just changed in 3D (editGlow.ts; 3D view, "What an edit changed"): the cells whose solid state differs
// between the columns drawn before an edit and the update's, and the faces they leave open, on hand-made columns.

import { describe, expect, it } from "vitest";
import { editedCells, glowFade, glowFaces, GLOW_FADE, GLOW_HOLD, plainMask } from "../../src/render3d/editGlow";

/** A column's mask from its solid layers. */
const mask = (...solid: number[]): number => solid.reduce((m, z) => m | (1 << z), 0);
const span = (lo: number, hi: number): number[] => Array.from({ length: hi - lo }, (_, k) => lo + k);
const sorted = <T extends readonly number[]>(cells: T[]) => [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

// 6 × 5, ground at 4 everywhere, a cliff: x ≥ 3 stands at 8
const W = 6;
const H = 5;
const ground = () => {
  const h = new Uint8Array(W * H).fill(4);
  for (let y = 0; y < H; y++) for (let x = 3; x < W; x++) h[y * W + x] = 8;
  return h;
};

describe("editedCells", () => {
  it("finds a hole dug into a cliff's wall: the air under the roof, nothing else", () => {
    const heights = ground();
    // dig (3, 2) at layers 4–5 into the wall: the tile keeps its top, with air under its roof
    const masks = new Uint32Array(W * H);
    masks[2 * W + 3] = mask(0, 1, 2, 3, 6, 7);
    const c = editedCells(W, H, { heights }, { heights, masks }, false);
    expect(c.added).toEqual([]);
    expect(sorted(c.removed)).toEqual([
      [3, 2, 4],
      [3, 2, 5],
    ]);
  });

  it("finds an overhang built out from a wall, and filling it again", () => {
    const heights = ground();
    const before = { heights };
    // a block at (2, 1) layer 6, out from the wall's face, over air (layers 4–5)
    const masks = new Uint32Array(W * H);
    masks[1 * W + 2] = mask(0, 1, 2, 3, 6);
    const grown = new Uint8Array(heights);
    grown[1 * W + 2] = 7;
    const built = { heights: grown, masks };
    expect(editedCells(W, H, before, built, false)).toEqual({ added: [[2, 1, 6]], removed: [] });
    // the undo: the column plain again, from the stored mask back to its height
    expect(editedCells(W, H, built, before, false)).toEqual({ added: [], removed: [[2, 1, 6]] });
  });

  it("counts a roof's top a stroke reshaped, though the heights were painted already", () => {
    // a cave: rock 0–1, air 2–4, roof 5–7 (top 8) at (1, 1); a Lower stroke takes the roof's top block
    const masks = new Uint32Array(W * H);
    masks[1 * W + 1] = mask(0, 1, 5, 6, 7);
    const painted = ground();
    painted[1 * W + 1] = 7;
    const after = new Uint32Array(W * H);
    after[1 * W + 1] = mask(0, 1, 5, 6);
    // (the page painted the heights before the worker's columns came: the stored masks still have the old top)
    expect(editedCells(W, H, { heights: painted, masks }, { heights: painted, masks: after }, false)).toEqual({ added: [], removed: [[1, 1, 7]] });
  });

  it("leaves plain tiles out unless asked, and then reads their heights", () => {
    const was = ground();
    const now = new Uint8Array(was);
    now[0] = 6;
    now[W + 4] = 7;
    expect(editedCells(W, H, { heights: was }, { heights: now }, false)).toEqual({ added: [], removed: [] });
    const c = editedCells(W, H, { heights: was }, { heights: now }, true);
    expect(sorted(c.added)).toEqual([
      [0, 0, 4],
      [0, 0, 5],
    ]);
    expect(c.removed).toEqual([[4, 1, 7]]);
    // only within the rectangle given
    expect(editedCells(W, H, { heights: was }, { heights: now }, true, { x0: 2, y0: 0, x1: 5, y1: 4 }).added).toEqual([]);
  });

  it("finds nothing when nothing changed", () => {
    const heights = ground();
    const masks = new Uint32Array(W * H);
    masks[7] = mask(0, 1, 5, 6, 7);
    expect(editedCells(W, H, { heights, masks }, { heights, masks: masks.slice() }, true)).toEqual({ added: [], removed: [] });
    expect(plainMask(0)).toBe(0);
    expect(plainMask(3)).toBe(0b111);
  });
});

describe("glowFaces", () => {
  const key = (x: number, y: number, z: number) => (y * W + x) * 32 + z;

  it("a block added on flat ground shows its five open faces", () => {
    const masks = new Uint32Array(W * H).fill(plainMask(4));
    masks[2 * W + 1] = plainMask(5);
    const f = glowFaces([key(1, 2, 4)], W, H, (x, y) => masks[y * W + x]);
    expect(f).toMatchObject({ added: 5, removed: 0 });
    expect(f.positions.length).toBe(5 * 12);
    // every corner on the block's own box, a hair outside it
    for (let k = 0; k < f.positions.length; k += 3) {
      expect(f.positions[k]).toBeGreaterThanOrEqual(1 - 0.02);
      expect(f.positions[k]).toBeLessThanOrEqual(2 + 0.02);
      expect(f.positions[k + 1]).toBeGreaterThanOrEqual(4 - 0.02);
      expect(f.positions[k + 1]).toBeLessThanOrEqual(5 + 0.02);
      expect(-f.positions[k + 2]).toBeGreaterThanOrEqual(2 - 0.02);
      expect(-f.positions[k + 2]).toBeLessThanOrEqual(3 + 0.02);
    }
    expect([...f.kind].every((k) => k === 0)).toBe(true);
  });

  it("a block dug into a wall shows the hollow's floor, ceiling, back and sides, not its mouth", () => {
    // ground at 4, a wall at x ≥ 3 up to 8; (3, 2) dug at layer 5
    const heights = ground();
    const masks = Array.from(heights, (h) => plainMask(h));
    masks[2 * W + 3] = mask(...span(0, 5), 6, 7);
    const f = glowFaces([key(3, 2, 5)], W, H, (x, y) => masks[y * W + x]);
    // floor (3,2,4), ceiling (3,2,6), back (4,2,5), sides (3,1,5) and (3,3,5); the mouth at x = 2 is open air
    expect(f).toMatchObject({ added: 0, removed: 5 });
    expect([...f.kind].every((k) => k === 1)).toBe(true);
  });

  it("leaves out what the layer cut hides, and treats the map's edge as air and its floor as rock", () => {
    const masks = new Uint32Array(W * H).fill(plainMask(4));
    masks[0] = plainMask(5);
    const at = (x: number, y: number) => masks[y * W + x];
    // the corner block's sides off the map are open
    expect(glowFaces([key(0, 0, 4)], W, H, at).added).toBe(5);
    expect(glowFaces([key(0, 0, 4)], W, H, at, 4).added).toBe(0);
    // a dug cell on the floor: the map's floor under it glows
    masks[2 * W + 2] = 0;
    expect(glowFaces([key(2, 2, 0)], W, H, at).removed).toBe(5);
  });
});

describe("glowFade", () => {
  it("holds, then eases out to nothing in about a second", () => {
    expect(glowFade(0)).toBe(1);
    expect(glowFade(GLOW_HOLD)).toBe(1);
    expect(glowFade(GLOW_HOLD + GLOW_FADE / 2)).toBeCloseTo(0.5, 5);
    expect(glowFade(GLOW_HOLD + GLOW_FADE)).toBe(0);
    expect(GLOW_HOLD + GLOW_FADE).toBeGreaterThan(0.9);
    expect(GLOW_HOLD + GLOW_FADE).toBeLessThan(1.4);
  });
});
