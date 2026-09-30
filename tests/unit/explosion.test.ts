// What an Unstable Core does when it goes off (PLAN §20 D339), by the game's own rule: a sphere of radius
// `ExplosionRadius + 1` round the footprint's centre at the height of its base; every solid voxel in it is removed
// and every object with a block in it deleted; what the removal leaves unsupported (more than 3 sideways steps from
// a supported voxel in its layer) falls; a core the blast reaches goes off too. `sim/explosion.ts` says where each
// piece is read from.

import { describe, expect, it } from "vitest";
import { blastCentre, blastRadius, blastSummary, explode, sphereVoxels, type BlastObject } from "../../src/core/sim/explosion";
import { ColumnTerrain } from "../../src/core/terrain/runs";

const W = 48;
const H = 48;
const flat = (h: number) => ColumnTerrain.fromHeights(new Uint8Array(W * H).fill(h), W, H);
const core = (id: string, x: number, y: number, z: number, radius: number): BlastObject => ({ id, template: "UnstableCore", x, y, z, orientation: "Cw0", flipped: false, radius });
const tree = (id: string, x: number, y: number, z: number): BlastObject => ({ id, template: "Pine", x, y, z, orientation: "Cw0", flipped: false });

describe("the blast's rule (Explosions/ExplosionOutcomeGatherer, UnstableCore)", () => {
  it("is a sphere of radius + 1 (the blueprint's inner radius), centred on the footprint's middle at its base's height", () => {
    expect(blastRadius(0)).toBe(1);
    expect(blastRadius(5)).toBe(6);
    // a 2 x 2 core at Coordinates (20, 20): the middle is (21, 21) in grid units; turned a quarter it covers (20-21, 19-20), the middle (21, 20)
    expect(blastCentre(core("c", 20, 20, 6, 2))).toEqual([21, 21, 6]);
    expect(blastCentre({ ...core("c", 20, 20, 6, 2), orientation: "Cw90" })).toEqual([21, 20, 6]);
    // the voxels inside: those whose centres are within the radius
    let n = 0;
    sphereVoxels(W, H, [24, 24, 12], 3, () => n++);
    expect(n).toBeGreaterThan(100);
    expect(n).toBe(136);
    // (the sphere's volume is 113 voxels; a sphere centred on a corner of the lattice holds 136)
    const seen = new Set<number>();
    sphereVoxels(W, H, [24, 24, 12], 3, (t, z) => seen.add(t * 100 + z));
    expect(seen.size).toBe(n);
  });

  it("digs a bowl in flat ground: the centre drops the sphere's depth, the rim by less, and beyond the radius nothing changes", () => {
    const t = flat(6);
    const e = explode(t, [core("c", 20, 20, 6, 2)], ["c"]);
    const h = e.terrain.heights();
    // at the centre the sphere (radius 3) reaches 3 levels down
    expect(h[21 * W + 21]).toBe(3);
    expect(h[20 * W + 20]).toBe(3);
    // 2.5 tiles out it reaches 1.58 levels down, so 2 voxels are taken (levels 4 and 5)
    expect(h[21 * W + 23]).toBe(4);
    // 3.5 tiles out the sphere no longer touches the ground
    expect(h[21 * W + 24]).toBe(6);
    expect(h[30 * W + 30]).toBe(6);
    // and the count of what changed is the bowl's
    expect(e.tiles.length).toBeGreaterThan(20);
    expect(e.removedVoxels).toBeGreaterThan(40);
    expect(e.fellVoxels).toBe(0);
    // the input terrain is left as it was
    expect(t.heights()[21 * W + 21]).toBe(6);
  });

  it("a radius of 5 (the default) blows a crater to the bottom of the map: radius 6 from level 6", () => {
    const e = explode(flat(6), [core("c", 20, 20, 6, 5)], ["c"]);
    expect(e.terrain.heights()[21 * W + 21]).toBe(0);
  });

  it("deletes the objects with a block in the sphere, and only those; the core itself goes", () => {
    const objects = [core("c", 20, 20, 6, 2), tree("near", 22, 21, 6), tree("far", 30, 30, 6), tree("edge", 24, 21, 6)];
    const e = explode(flat(6), objects, ["c"]);
    expect([...e.removed].sort()).toEqual(["c", "near"]);
    expect(e.detonated).toEqual(["c"]);
  });

  it("ground left hanging more than 3 steps from support falls, and what stood on it goes with it", () => {
    // a one-tile pillar of level 12 on the level-6 plain, next to the core: the blast takes its middle, and the
    // top, over air with nothing beside it at that height, falls with the objects on it
    const h = new Uint8Array(W * H).fill(6);
    h[21 * W + 23] = 12;
    const t = ColumnTerrain.fromHeights(h, W, H);
    const e = explode(t, [core("c", 20, 20, 6, 2), tree("top", 23, 21, 12)], ["c"]);
    expect(e.terrain.heights()[21 * W + 23]).toBe(4);
    expect(e.fellVoxels).toBe(4);
    expect(e.removed.has("top")).toBe(true);
  });

  it("a wall the blast undercuts keeps its top where the ground beside it still holds it: the column is left with a cave", () => {
    const h = new Uint8Array(W * H).fill(6);
    for (let y = 0; y < H; y++) for (let x = 23; x < W; x++) h[y * W + x] = 12;
    const e = explode(ColumnTerrain.fromHeights(h, W, H), [core("c", 20, 20, 6, 2)], ["c"]);
    const i = 21 * W + 23;
    // the middle of the column is gone, the top (within 3 steps of the wall behind it) stays
    expect(e.terrain.isPlain(i)).toBe(false);
    expect(e.terrain.runs(i)).toEqual([0, 4, 8, 12]);
    expect(e.terrain.surface(i)).toBe(12);
    expect(e.fellVoxels).toBe(0);
  });

  it("sets off the cores it reaches: one inside the sphere, and one beside a voxel it takes; the chain is counted", () => {
    const objects = [core("a", 20, 20, 6, 2), core("inside", 22, 20, 6, 0), core("beside", 26, 21, 6, 0), core("apart", 40, 40, 6, 3)];
    // "beside" stands at x 26–27: its west neighbours (25, 21) are 4 tiles from the centre: outside a radius of 3,
    // so it is not reached by the first blast, but "inside" (radius 0, blast 1) is deleted by it, and its own
    // blast is 1 round (22.5 ± 1): it does not reach 25 either
    const e = explode(flat(6), objects, ["a"]);
    expect(e.detonated).toEqual(["a", "inside"]);
    expect(e.removed.has("inside")).toBe(true);
    expect(e.removed.has("beside")).toBe(false);
    expect(e.removed.has("apart")).toBe(false);
    // a core standing right at the sphere's edge is set off by the voxel beside it
    const near = [core("a", 20, 20, 6, 2), core("edge", 24, 20, 6, 1)];
    const f = explode(flat(6), near, ["a"]);
    expect(f.detonated).toEqual(["a", "edge"]);
  });

  it("says in numbers what a core will clear: the sphere, the tiles, the objects, the cores of the chain", () => {
    const s = blastSummary(flat(6), [core("a", 20, 20, 6, 2), tree("t", 22, 21, 6), tree("u", 18, 19, 6)], "a");
    expect(s.radius).toBe(3);
    expect(s.cores).toBe(1);
    expect(s.objects).toBe(3);
    expect(s.heightLost).toBe(3);
    expect(s.tiles).toBeGreaterThan(20);
  });
});
