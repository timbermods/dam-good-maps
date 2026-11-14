// The Block tool's blocks growing and crumbling (blockPop.ts; 3D view, "The Block tool's blocks grow and crumble"): the
// growth's curve, which rock a block grows from, the faces drawn as it grows and sinks, wound to face out; no slit past
// the caps; the pops an undo contradicts stopped; the edit glow coming in as the blocks grow.

import { MeshBasicMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { BlockPops, GROW_MS, glowRiseAt, growScale, POP_CELLS, popDustMaterial, popsOf, QuadWriter, setPopCells, popUniforms, SINK_MS, sinkAt, writePops } from "../../src/render3d/blockPop";

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
  it("a taken block's faces are those open now: its top and sides, not the rock under it", () => {
    // (the land after the dig: the cell is air)
    const dug = (x: number, y: number, z: number) => !(x === 5 && y === 5 && z === 3) && land()(x, y, z);
    const { sinks } = popsOf([], [[5, 5, 3]], dug, 0);
    // (a block dug out of the flat ground: the ground round it is rock below 4, so only its top was open)
    expect(sinks[0].faces).toBe(0b010000);
    const lone = popsOf([], [[5, 5, 4]], land(), 0).sinks[0];
    expect(lone.faces).toBe(0b011111);
    // (two taken together: each shows its side toward the other, as they shrink apart)
    const pair = popsOf([], [[5, 5, 4], [6, 5, 4]], land(), 0).sinks;
    expect(pair[0].faces & 0b000001).toBe(1);
    expect(pair[1].faces & 0b000010).toBe(2);
  });
  it("caps the blocks that play at once", () => {
    const many: [number, number, number][] = Array.from({ length: 100 }, (_, k) => [k % 10, Math.floor(k / 10), 4]);
    expect(popsOf(many, many, land(many), 0).grows).toHaveLength(64);
  });
  it("leaves no slit past the cap: a growing block's side toward a block drawn at once is covered", () => {
    // a whole layer of 100 added: the first 64 grow, the rest are drawn at once by the terrain
    const many: [number, number, number][] = Array.from({ length: 100 }, (_, k) => [k % 10, Math.floor(k / 10), 4]);
    const { grows } = popsOf(many, [], land(many), 0);
    for (const g of grows) {
      // every side is drawn one way or the other: its own face (air, or a block growing too) or the rock it covers
      expect(g.faces | g.covers).toBe(0b111111);
      expect(g.faces & g.covers).toBe(0);
    }
    // (cell 63 is (3, 6, 4); (3, 7, 4), the 74th, is drawn at once: covered on the grid, toward +y)
    const edge = grows.find((g) => g.x === 3 && g.y === 6)!;
    expect(edge.covers & 0b000100).toBe(0b000100);
    const w = new QuadWriter(POP_CELLS * 12);
    writePops(w, [edge], [], GROW_MS / 2);
    const onGrid = Array.from({ length: w.n }, (_, q) => q).filter((q) => w.nrm[q * 12 + 2] === 1 && w.pos[q * 12 + 2] === -7);
    expect(onGrid).toHaveLength(1);
  });
  it("drops the pops the land now contradicts and reshapes the rest (an undo, a redo, other land)", () => {
    const grown = popsOf([[5, 5, 4]], [[2, 2, 3]], land([[5, 5, 4]]), 0);
    // undone: the block added is air again, the block taken rock again
    const undone = popsOf([], [], land(), 10, grown);
    expect(undone.grows).toHaveLength(0);
    expect(undone.sinks).toHaveLength(0);
    // other land beside the growing block: its side there becomes a cover; it still grows from where it did
    const beside = popsOf([], [], land([[5, 5, 4], [6, 5, 4]]), 10, popsOf([[5, 5, 4]], [], land([[5, 5, 4]]), 0));
    expect(beside.grows[0]).toMatchObject({ base: 5, faces: 0b011110, covers: 0b100001, t0: 0 });
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

describe("BlockPops", () => {
  const make = () => {
    const clock = { t: 1000, now() { return this.t; }, driven: true };
    const glow = { value: 1 };
    const pops = new BlockPops(new Scene(), () => new MeshBasicMaterial(), popUniforms(), popDustMaterial(), () => {}, clock, glow);
    return { pops, clock, glow };
  };
  it("stops a dig's sink and dust at once when an undo brings the block back", () => {
    const { pops, clock } = make();
    pops.add([], [[5, 5, 4]], land());
    clock.t += 60;
    pops.advance();
    expect(pops.drawn.sinks).toBe(1);
    expect(pops.drawn.puffs).toBeGreaterThan(0);
    pops.reconcile(land([[5, 5, 4]]));
    expect(pops.drawn).toEqual({ grows: 0, sinks: 0, quads: 0, puffs: 0 });
  });
  it("covers a growing block's side toward a neighbour once that neighbour has finished growing", () => {
    const { pops, clock } = make();
    const shape = () => (pops as unknown as { grows: { x: number; faces: number; covers: number }[] }).grows.find((g) => g.x === 6)!;
    pops.add([[5, 5, 4]], [], land([[5, 5, 4]]));
    // the next block, 200 ms later, beside the first, which is still growing: its side there is its own face
    clock.t += 200;
    pops.add([[6, 5, 4]], [], land([[5, 5, 4], [6, 5, 4]]));
    expect(shape().faces & 0b000010).toBe(0b000010);
    // the first finishes (260 ms) while the second still grows: that side is now covered, on the grid
    clock.t += 70;
    pops.advance();
    expect(shape().faces & 0b000010).toBe(0);
    expect(shape().covers & 0b000010).toBe(0b000010);
  });
  it("stops a growing block when an undo takes it, and the edit glow's added faces are full again", () => {
    const { pops, clock, glow } = make();
    pops.add([[5, 5, 4]], [], land([[5, 5, 4]]));
    expect(glow.value).toBe(0);
    clock.t += 30;
    pops.advance();
    expect(pops.drawn.grows).toBe(1);
    pops.reconcile(land());
    expect(pops.drawn.grows).toBe(0);
    expect(glow.value).toBe(1);
  });
});

describe("glowRiseAt", () => {
  it("keeps the white off the block while it is small, and is full once it has its size or nothing grows", () => {
    const { grows } = popsOf([[5, 5, 4]], [], land([[5, 5, 4]]), 0);
    expect(glowRiseAt(grows, 25)).toBe(0);
    expect(glowRiseAt(grows, GROW_MS / 2)).toBeCloseTo(0.5, 6);
    expect(glowRiseAt(grows, GROW_MS * 0.8)).toBe(1);
    expect(glowRiseAt([], 0)).toBe(1);
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
