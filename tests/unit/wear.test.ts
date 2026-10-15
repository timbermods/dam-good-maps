// Erode's dust and stones (D281, D240; src/render3d/wear.ts): from the voxels that went in a stage, a few
// spread through them, each opening toward the air that was there (out of a cliff's cave, up from a
// scoured hollow), its stone landing on the ground below the opening, whether the columns shown have the
// stage's voxels gone yet or not.

import { describe, expect, it } from "vitest";
import { STONE_REACH, WEAR_STRIDE, wearCount, wearSamples, type Voxels } from "../../src/render3d/wear";

const W = 20;
const N = W * W;
/** Voxels from heights, with `gone` (z·N + tile) taken out. */
function voxels(height: (x: number, y: number) => number, gone: number[] = []): Voxels {
  const masks = new Uint32Array(N);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) masks[y * W + x] = (1 << height(x, y)) - 1;
  for (const v of gone) masks[v % N] &= ~(1 << Math.floor(v / N));
  return { W, H: W, mask: (i) => masks[i] };
}
const voxel = (x: number, y: number, z: number) => z * N + y * W + x;
const sample = (out: Float32Array, j: number) => {
  const o = j * WEAR_STRIDE;
  return { x: out[o], y: out[o + 1], z: out[o + 2], dx: out[o + 3], dy: out[o + 4], dz: out[o + 5], floor: out[o + 6], roofed: out[o + 7] };
};
// a cliff: level 3 west of x = 10, level 12 from it
const cliff = (x: number) => (x < 10 ? 3 : 12);

describe("where Erode's dust and stones start (wearSamples)", () => {
  it("a cave at a cliff's foot opens west, out of the cliff, a little upward; its stones land on the ground outside", () => {
    // the cave's mouth went last stage; this stage its next voxels in
    const before = [voxel(10, 10, 3), voxel(10, 10, 4)];
    const went = [voxel(11, 10, 3), voxel(11, 10, 4)];
    for (const shown of [voxels(cliff, before), voxels(cliff, [...before, ...went])]) {
      const out = new Float32Array(4 * WEAR_STRIDE);
      expect(wearSamples(went, shown, { x: 10, y: 10 }, 4, out)).toBe(2);
      for (const j of [0, 1]) {
        const s = sample(out, j);
        expect(s.x).toBe(11.5);
        expect(s.dx).toBeLessThan(-0.8);
        expect(Math.abs(s.dy)).toBeLessThan(0.01);
        expect(s.dz).toBeGreaterThan(0);
        expect(Math.hypot(s.dx, s.dy, s.dz)).toBeCloseTo(1, 5);
        // (on the cave's floor, level 3, the ground outside's; under the cliff's rock)
        expect(s.floor).toBe(3);
        expect(s.roofed).toBe(1);
      }
    }
  });

  it("a stone from high on the cliff's face falls to the ground at its foot", () => {
    const went = [voxel(10, 4, 8)];
    const out = new Float32Array(WEAR_STRIDE);
    wearSamples(went, voxels(cliff), { x: 10, y: 4 }, 1, out);
    const s = sample(out, 0);
    expect(s.dx).toBeLessThan(-0.8);
    // (STONE_REACH out, west of the face: the ground there is at level 3)
    expect(Math.floor(s.x + s.dx / Math.hypot(s.dx, s.dy) * STONE_REACH)).toBe(9);
    expect(s.floor).toBe(3);
  });

  it("a scoured hollow's dust rises; its stones hop and land in it", () => {
    const flat = () => 5;
    const went = [voxel(6, 6, 4)];
    const out = new Float32Array(WEAR_STRIDE);
    wearSamples(went, voxels(flat), { x: 6, y: 6 }, 1, out);
    const s = sample(out, 0);
    expect(s.dz).toBeGreaterThan(0.99);
    expect(s.floor).toBe(4);
    expect(s.roofed).toBe(0);
  });

  it("a voxel the columns still show enclosed (they lag the stage) opens toward where the gesture touched", () => {
    const went = [voxel(14, 10, 4)];
    const out = new Float32Array(WEAR_STRIDE);
    wearSamples(went, voxels(cliff), { x: 9, y: 10 }, 1, out);
    expect(sample(out, 0).dx).toBeLessThan(-0.8);
  });

  it("more where more went, spread through all of it, never more than asked or than room for", () => {
    expect(wearCount(0, 14)).toBe(0);
    expect(wearCount(1, 14)).toBeGreaterThan(0);
    expect(wearCount(30, 14)).toBeGreaterThan(wearCount(5, 14));
    expect(wearCount(5000, 14)).toBe(14);
    const went = Array.from({ length: 40 }, (_, k) => voxel(10 + (k % 8), 2 + Math.floor(k / 8), 3));
    const out = new Float32Array(3 * WEAR_STRIDE);
    expect(wearSamples(went, voxels(cliff), { x: 9, y: 4 }, 14, out)).toBe(3);
    const ys = [0, 1, 2].map((j) => sample(out, j).y);
    expect(ys[0]).toBeLessThan(ys[2]);
  });
});
