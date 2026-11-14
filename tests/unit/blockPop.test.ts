// The Block tool's blocks growing and crumbling (blockPop.ts; 3D view, "The Block tool's blocks grow and crumble"): the
// growth's curve, which rock a block grows from, the faces drawn as it grows and sinks, wound to face out.

import { describe, expect, it } from "vitest";
import { GROW_MS, growScale, popsOf, QuadWriter, setPopCells, popUniforms, SINK_MS, sinkAt, writePops } from "../../src/render3d/blockPop";

/** Flat ground solid below layer 4 on a 10 × 10 map, plus `extra` cells. */
const land = (extra: [number, number, number][] = []) => {
  const set = new Set(extra.map((c) => c.join(",")));
  return (x: number, y: number, z: number) => z < 0 || (x >= 0 && y >= 0 && x < 10 && y < 10 && (z < 4 || set.has(`${x},${y},${z}`)));
};

/** Each quad's winding normal ((b − a) × (c − a)) against its normal attribute. */
function windings(w: QuadWriter): number[] {
  const out: number[] = [];
  for (let q = 0; q < w.n; q++) {
    const p = (k: number, c: number) => w.pos[q * 12 + k * 3 + c];
    const u = [p(1, 0) - p(0, 0), p(1, 1) - p(0, 1), p(1, 2) - p(0, 2)];
    const v = [p(2, 0) - p(0, 0), p(2, 1) - p(0, 1), p(2, 2) - p(0, 2)];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    out.push(Math.sign(c[0] * w.nrm[q * 12] + c[1] * w.nrm[q * 12 + 1] + c[2] * w.nrm[q * 12 + 2]));
  }
  return out;
}

describe("growScale and sinkAt", () => {
  it("grows from nothing a few hundredths past its size and settles", () => {
    expect(growScale(0)).toBeCloseTo(0, 6);
    expect(growScale(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, k) => growScale(k / 100)));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.08);
  });
  it("sinks a level, shrinking", () => {
    expect(sinkAt(0)).toEqual({ drop: 0, size: 1 });
    expect(sinkAt(1)).toEqual({ drop: 1, size: 0.65 });
  });
});

describe("popsOf", () => {
  it("grows a block on flat ground up from the rock under it, its top and sides open", () => {
    const { grows } = popsOf([[5, 5, 4]], [], land([[5, 5, 4]]), 0);
    expect(grows).toHaveLength(1);
    // (ways: 0 +x, 1 −x, 2 +y, 3 −y, 4 up, 5 down)
    expect(grows[0]).toMatchObject({ base: 5, faces: 0b011111, covers: 0b100000 });
  });
  it("grows a block added to a wall out of the wall when nothing is under it", () => {
    // a wall at x = 4 up to layer 8, the block at (5, 5, 6) with air under it
    const solid = (x: number, y: number, z: number) => land([[5, 5, 6]])(x, y, z) || (x === 4 && z < 8);
    const { grows } = popsOf([[5, 5, 6]], [], solid, 0);
    expect(grows[0].base).toBe(1);
    expect(grows[0].covers).toBe(0b000010);
  });
  it("a taken block's faces are those open before: its top and sides, not the rock under it", () => {
    const { sinks } = popsOf([], [[5, 5, 3]], land(), 0);
    // (a block dug out of the flat ground: the ground round it is rock below 4, so only its top was open)
    expect(sinks[0].faces).toBe(0b010000);
    const lone = popsOf([], [[5, 5, 4]], land(), 0).sinks[0];
    expect(lone.faces).toBe(0b011111);
  });
  it("caps the blocks that play at once", () => {
    const many: [number, number, number][] = Array.from({ length: 100 }, (_, k) => [k % 10, Math.floor(k / 10), 4]);
    expect(popsOf(many, many, land(many), 0).grows).toHaveLength(64);
  });
});

describe("writePops", () => {
  it("draws a growing block's open faces and the rock it covers, all wound to face their normals, and nothing once over", () => {
    const { grows } = popsOf([[5, 5, 4]], [], land([[5, 5, 4]]), 0);
    const w = new QuadWriter(64);
    expect(writePops(w, grows, [], GROW_MS / 2)).toBe(true);
    // five open faces and the ground's top under it, facing up into the cell
    expect(w.n).toBe(6);
    expect(windings(w).every((s) => s === 1)).toBe(true);
    // the covered top lies on the grid at layer 4; the growing block's faces stand off it
    const covered = w.pos.slice(5 * 12, 6 * 12);
    expect([covered[1], covered[4], covered[7], covered[10]]).toEqual([4, 4, 4, 4]);
    expect(w.nrm[5 * 12 + 1]).toBe(1);
    expect(writePops(w, grows, [], GROW_MS)).toBe(false);
    expect(w.n).toBe(0);
  });
  it("sinks a taken block a level by its end", () => {
    const { sinks } = popsOf([], [[5, 5, 4]], land(), 0);
    const w = new QuadWriter(64);
    writePops(w, [], sinks, SINK_MS * 0.999);
    expect(w.n).toBe(5);
    expect(windings(w).every((s) => s === 1)).toBe(true);
    let low = Infinity;
    for (let k = 1; k < w.n * 12; k += 3) low = Math.min(low, w.pos[k]);
    expect(low).toBeCloseTo(3, 1);
  });
});

describe("setPopCells", () => {
  it("names the growing cells by key, four to a vec4, with their box", () => {
    const u = popUniforms();
    const { grows } = popsOf([[5, 5, 4], [6, 5, 4]], [], land([[5, 5, 4], [6, 5, 4]]), 0);
    setPopCells(u, grows, 10);
    expect(u.popCount.value).toBe(2);
    expect(u.popCells.value[0].toArray()).toEqual([5 + 256 * 5 + 65536 * 4, 6 + 256 * 5 + 65536 * 4, -1, -1]);
    expect(u.popLo.value.toArray().slice(0, 3)).toEqual([5, 5, 4]);
    expect(u.popHi.value.toArray().slice(0, 3)).toEqual([6, 5, 4]);
    setPopCells(u, grows, GROW_MS);
    expect(u.popCount.value).toBe(0);
  });
});
