// The Block tool's gestures (src/editor/block): which face a hit points at, the operation a click or a drag makes,
// and the cells a drag sweeps in the plane of its first face. The core's own checks are tests/contract/blocks.test.ts.

import { describe, expect, it } from "vitest";
import { blockParams, clampSize, DEFAULT_BLOCK, modeFor, noteSpot, paramsKey, planeCell, planeHit, PlaneSweep, sizeFromPointer, type BlockAim } from "../../src/editor/block/blockTool";
import { blockAim, pickTerrain, type Ray, type TileHit } from "../../src/render3d/pick";
import { blockProblems } from "../../src/core/terrain/blocks";

/** A ray from a point towards another, in world space (X = x, Y = layer, Z = −y). */
const ray = (from: [number, number, number], to: [number, number, number]): Ray => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  return { origin: from, direction: [d[0] / n, d[1] / n, d[2] / n] };
};

/** A 6 × 6 map of plain ground three layers high, with a pillar of height 6 at (3, 3), as masks. */
const W = 6;
const mask = (i: number) => (i === 3 * W + 3 ? (1 << 6) - 1 : (1 << 3) - 1);

describe("which face a hit points at", () => {
  it("names the block and the direction for the top, the walls and an underside", () => {
    const top = pickTerrain(ray([2.5, 10, -2.5], [2.5, 0, -2.5]), W, W, mask)!;
    expect(blockAim(top)).toEqual({ at: [2, 2, 2], side: "+z" });
    // from the east, along the layer 4 of the pillar's east wall
    const east = pickTerrain(ray([8, 4.5, -3.5], [4, 4.5, -3.5]), W, W, mask)!;
    expect(east.face).toBe("side");
    expect(blockAim(east)).toEqual({ at: [3, 3, 4], side: "+x" });
    // from the west, the -x face
    const west = pickTerrain(ray([-2, 4.5, -3.5], [2, 4.5, -3.5]), W, W, mask)!;
    expect(blockAim(west)).toEqual({ at: [3, 3, 4], side: "-x" });
    // from the south (small y, larger Z) and the north
    const south = pickTerrain(ray([3.5, 4.5, 3], [3.5, 4.5, -2]), W, W, mask)!;
    expect(blockAim(south)).toEqual({ at: [3, 3, 4], side: "-y" });
    const north = pickTerrain(ray([3.5, 4.5, -9], [3.5, 4.5, -4]), W, W, mask)!;
    expect(blockAim(north)).toEqual({ at: [3, 3, 4], side: "+y" });
    // from below a roof: the underside of a block floating over air
    const roof = (i: number) => (i === 2 * W + 2 ? 0b11100 : 0b111);
    const under = pickTerrain(ray([2.5, 0.2, -2.5], [2.5, 3, -2.5]), W, W, roof)!;
    expect(under.face).toBe("bottom");
    expect(blockAim(under)).toEqual({ at: [2, 2, 2], side: "-z" });
  });
  it("points at nothing where the pick found nothing or the map's floor under air", () => {
    expect(blockAim(null)).toBeNull();
    expect(blockAim({ x: 1, y: 1, point: [1, 0, -1], face: "top", run: { bottom: 0, top: 0 }, level: 0, t: 1 } as TileHit)).toBeNull();
  });
});

describe("the operation a click makes", () => {
  it("is the setting, or its opposite with Shift", () => {
    expect(modeFor(DEFAULT_BLOCK, false)).toBe("add");
    expect(modeFor(DEFAULT_BLOCK, true)).toBe("remove");
    expect(modeFor({ ...DEFAULT_BLOCK, mode: "remove" }, true)).toBe("add");
  });
  it("is a valid core operation for any size, shape and face", () => {
    for (const size of [0.2, 1, 4, 8, 12]) {
      const p = blockParams({ ...DEFAULT_BLOCK, size, shape: "round" }, "add", "+x", [[2, 2, 2]]);
      expect(p.size).toBe(clampSize(size));
      expect(blockProblems(p, 16, 16)).toEqual([]);
    }
    expect(blockParams(DEFAULT_BLOCK, "add", "+z", [[1, 1, 1]]).shape).toBeUndefined();
    expect(paramsKey(blockParams(DEFAULT_BLOCK, "add", "+z", [[1, 1, 1]]))).not.toBe(paramsKey(blockParams({ ...DEFAULT_BLOCK, size: 4 }, "add", "+z", [[1, 1, 1]])));
  });
});

describe("a drag in the plane of its first face", () => {
  const top: BlockAim = { at: [0, 0, 2], side: "+z" };

  it("finds the cell of the plane under the pointer, for each way a face can point", () => {
    // the top of layer 2 is the plane Y = 3
    expect(planeCell(top, ray([4.5, 10, -1.5], [4.5, 0, -1.5]), W, W)).toEqual([4, 1, 2]);
    // a +x face of x = 2 is the plane X = 3, at layer 1 and y 4
    expect(planeCell({ at: [2, 0, 0], side: "+x" }, ray([9, 1.5, -4.5], [0, 1.5, -4.5]), W, W)).toEqual([2, 4, 1]);
    // a -y face of y = 2 is the plane y = 2, so Z = −2
    expect(planeCell({ at: [0, 2, 0], side: "-y" }, ray([5.5, 1.5, 4], [5.5, 1.5, -6]), W, W)).toEqual([5, 2, 1]);
    // off the map: none
    expect(planeCell(top, ray([9.5, 10, -1.5], [9.5, 0, -1.5]), W, W)).toBeNull();
    // a ray parallel to the plane never meets it
    expect(planeCell(top, { origin: [0, 5, 0], direction: [1, 0, 0] }, W, W)).toBeNull();
  });

  it("sweeps cells without gaps and stays in the plane", () => {
    const s = new PlaneSweep(top, W, W);
    expect(s.at).toEqual([[0, 0, 2]]);
    // a quick drag to (4, 0) fills the cells between
    expect(s.move(ray([4.5, 10, -0.5], [4.5, 0, -0.5]))).toBe(true);
    expect(s.at.map((c) => c.join())).toEqual(["0,0,2", "1,0,2", "2,0,2", "3,0,2", "4,0,2"]);
    // the same cell again adds nothing
    expect(s.move(ray([4.5, 10, -0.5], [4.5, 0, -0.5]))).toBe(false);
    // a pointer off the map adds nothing and does not lose the sweep
    expect(s.move(ray([40.5, 10, -0.5], [40.5, 0, -0.5]))).toBe(false);
    expect(s.at.length).toBe(5);
    for (const c of s.at) expect(c[2]).toBe(2);
  });

  it("sweeps the cells it crosses whether or not a block is there (the core adds only against a block)", () => {
    const s = new PlaneSweep({ at: [3, 3, 4], side: "+z" }, W, W);
    s.move(ray([5.5, 10, -3.5], [5.5, 0, -3.5]));
    expect(s.at.map((c) => c.join())).toEqual(["3,3,4", "4,3,4", "5,3,4"]);
  });

  it("is limited to the core's most positions", () => {
    const s = new PlaneSweep(top, 80, 80);
    for (let y = 0; y < 80; y++) {
      s.move(ray([0.5, 10, -(y + 0.5)], [0.5, 0, -(y + 0.5)]));
      s.move(ray([79.5, 10, -(y + 0.5)], [79.5, 0, -(y + 0.5)]));
      s.move(ray([0.5, 10, -(y + 0.5)], [0.5, 0, -(y + 0.5)]));
    }
    expect(s.at.length).toBeLessThanOrEqual(4096);
    expect(blockProblems(blockParams(DEFAULT_BLOCK, "add", "+z", s.at), 80, 80)).toEqual([]);
  });
});

describe("F held: the Size from how far the pointer is from the face's middle", () => {
  const aim: BlockAim = { at: [4, 4, 2], side: "+z" };
  it("a square reaches by its farther axis, a disc by its distance", () => {
    const at = (x: number, y: number) => ray([x, 10, -y], [x, 0, -y]);
    expect(planeHit(aim, at(4.5, 4.5))).toEqual([4.5, 4.5, 3]);
    expect(sizeFromPointer(aim, at(4.5, 4.5), "square")).toBe(1);
    expect(sizeFromPointer(aim, at(6, 4.5), "square")).toBe(3);
    expect(sizeFromPointer(aim, at(6, 6), "square")).toBe(3);
    expect(sizeFromPointer(aim, at(6, 6), "round")).toBe(4);
    expect(sizeFromPointer(aim, at(40, 4.5), "square")).toBe(8);
  });
});

describe("the refusal's note stays clear of the blocks it describes", () => {
  const canvas = { w: 1920, h: 1000 };
  const note = { w: 300, h: 52 };
  const overlaps = (n: { x: number; y: number }, b: { x0: number; y0: number; x1: number; y1: number }) => n.x < b.x1 && n.x + note.w > b.x0 && n.y < b.y1 && n.y + note.h > b.y0;
  it("goes below the blocks, across by the pointer, when there is room", () => {
    const box = { x0: 800, y0: 300, x1: 1100, y1: 500 };
    const n = noteSpot(box, { x: 950, y: 400 }, canvas, note);
    expect(overlaps(n, box)).toBe(false);
    expect(n.y).toBeGreaterThanOrEqual(box.y1);
  });
  it("goes to a side or above when the blocks reach the foot of the canvas, and never off it", () => {
    for (const box of [{ x0: 800, y0: 600, x1: 1100, y1: 990 }, { x0: 0, y0: 100, x1: 1900, y1: 990 }, { x0: 1700, y0: 800, x1: 1900, y1: 990 }]) {
      const n = noteSpot(box, { x: 1000, y: 900 }, canvas, note);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + note.w).toBeLessThanOrEqual(canvas.w);
      expect(n.y + note.h).toBeLessThanOrEqual(canvas.h);
    }
    const box = { x0: 800, y0: 600, x1: 1100, y1: 990 };
    expect(overlaps(noteSpot(box, { x: 950, y: 800 }, canvas, note), box)).toBe(false);
  });
  it("without a box sits below and right of the pointer", () => {
    expect(noteSpot(null, { x: 100, y: 100 }, canvas, note)).toEqual({ x: 116, y: 116 });
  });
});
