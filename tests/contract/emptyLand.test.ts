// Empty land (`validate/emptyLand.ts`, the gate's advisory `terrain.empty_land`; planning on #236, 2026-11-12): a bare
// flat plate is slab; the same plate under trees, stepped into small plates, or wet or green, is not; the row is on
// every map's report and never fails it.

import { describe, expect, it } from "vitest";
import { emptyLand, EMPTY_MIN, occupiedBy } from "../../src/core/validate/emptyLand";

const W = 32;
const none = () => new Uint8Array(W * W);
const flat = () => new Uint8Array(W * W).fill(5);

describe("empty land", () => {
  it("a bare flat plate is all slab, its middle the largest's", () => {
    const r = emptyLand(flat(), none(), none(), none(), W, W);
    expect(r.share).toBe(1);
    expect(r.largest).toEqual({ tiles: W * W, x: 16, y: 16 });
  });

  it("the plate under trees a few tiles apart is not; one lone tree takes out only its square", () => {
    const trees = [];
    for (let y = 1; y < W; y += 3) for (let x = 1; x < W; x += 3) trees.push({ template: "Pine", x, y, z: 5, orientation: "Cw0" as const, flipped: false });
    expect(emptyLand(flat(), none(), none(), occupiedBy(trees, W, W), W, W).share).toBe(0);
    const lone = emptyLand(flat(), none(), none(), occupiedBy([{ template: "Pine", x: 10, y: 10, z: 5, orientation: "Cw0", flipped: false }], W, W), W, W);
    expect(lone.empty).toBe(W * W - 9);
  });

  it("the plate stepped into small plates is not", () => {
    const h = flat();
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) h[y * W + x] = 5 + ((Math.floor(x / 5) + Math.floor(y / 5)) % 3);
    expect(25).toBeLessThan(EMPTY_MIN);
    expect(emptyLand(h, none(), none(), none(), W, W).share).toBe(0);
  });

  it("the plate under water, or moist (green) or contaminated, is not; water is not land", () => {
    const all = () => new Uint8Array(W * W).fill(1);
    const wet = emptyLand(flat(), all(), none(), none(), W, W);
    expect([wet.land, wet.share]).toEqual([0, 0]);
    expect(emptyLand(flat(), none(), all(), none(), W, W).share).toBe(0);
    // half the plate green: the dry half alone is slab, a share of the land
    const half = none();
    for (let i = 0; i < W * W / 2; i++) half[i] = 1;
    expect(emptyLand(flat(), none(), half, none(), W, W).share).toBe(0.5);
  });
});
