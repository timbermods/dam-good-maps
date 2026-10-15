// The Block tool's preview as drawn (3D step 3, D488): the instance matrices of the cells (plain data), and the
// mesh per kind that is kept, rewritten only when its cells or the layer cut change, and put away.

import { Scene, type Mesh } from "three";
import { describe, expect, it } from "vitest";
import { BlockCells, packCells, writeCellMatrices, type Cell } from "../../src/render3d/blockGhost";

describe("the preview's instance matrices", () => {
  it("puts each cell's centre in world space (X = x + ½, Y = layer + ½, Z = −y − ½), scaled", () => {
    const out = new Float32Array(16 * 4);
    const n = writeCellMatrices(packCells([[3, 5, 2], [0, 0, 0]]), 0.5, null, out);
    expect(n).toBe(2);
    expect([out[0], out[5], out[10], out[15]]).toEqual([0.5, 0.5, 0.5, 1]);
    expect([out[12], out[13], out[14]]).toEqual([3.5, 2.5, -5.5]);
    expect([out[16 + 12], out[16 + 13], out[16 + 14]]).toEqual([0.5, 0.5, -0.5]);
  });

  it("leaves out cells at or above the layer cut, and stops at the room it has", () => {
    const cells = packCells([[0, 0, 0], [1, 0, 3], [2, 0, 4], [3, 0, 5], [4, 0, 2]]);
    expect(writeCellMatrices(cells, 1, 4, new Float32Array(16 * 8))).toBe(3);
    expect(writeCellMatrices(cells, 1, 0, new Float32Array(16 * 8))).toBe(0);
    expect(writeCellMatrices(cells, 1, null, new Float32Array(16 * 2))).toBe(2);
  });
});

describe("the preview's meshes", () => {
  const preview = (n: number) => ({
    added: Array.from({ length: n }, (_, i): Cell => [i, 1, 4]),
    removed: [[2, 2, 1]] as Cell[],
    falls: [[5, 5, 6], [5, 5, 7]] as Cell[],
  });

  it("draws the three kinds and puts them away", () => {
    const scene = new Scene();
    const cells = new BlockCells(scene);
    expect(cells.set(preview(3), null)).toBe(true);
    expect(cells.drawn).toEqual({ added: 3, removed: 1, falls: 2 });
    expect(scene.children.map((c) => c.name).sort()).toEqual(["blocks.added", "blocks.falls", "blocks.removed"]);
    expect(cells.set(null, null)).toBe(true);
    expect(cells.drawn).toEqual({ added: 0, removed: 0, falls: 0 });
    cells.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("rewrites only when the lists change, and keeps its meshes", () => {
    const scene = new Scene();
    const cells = new BlockCells(scene);
    cells.set(preview(3), null);
    const meshes = [...scene.children];
    // (new arrays, the same cells: nothing to do)
    expect(cells.set(preview(3), null)).toBe(false);
    expect(cells.set(preview(4), null)).toBe(true);
    expect(cells.drawn.added).toBe(4);
    expect(scene.children).toEqual(meshes);
    // (a preview that needs more room than the mesh has gets a bigger one)
    cells.set(preview(200), null);
    expect(cells.drawn.added).toBe(200);
    expect(scene.children.length).toBe(3);
    cells.dispose();
  });

  it("draws what would fall in solid red, and while any would, what is added and removed muted (D335)", () => {
    const scene = new Scene();
    const cells = new BlockCells(scene);
    const mat = (name: string) => (scene.getObjectByName(name) as Mesh).material;
    const valid = { added: preview(2).added, removed: [] as Cell[], falls: [] as Cell[] };
    cells.set(valid, null);
    expect(cells.isRefused).toBe(false);
    const added = mat("blocks.added");
    // a valid remove keeps the area brush's red look
    cells.set({ added: [], removed: [[2, 2, 1]], falls: [] }, null);
    const removed = mat("blocks.removed");
    expect(removed).not.toBe(added);
    // the same remove, refused with its falls: added and removed muted (one grey look), the falls red
    cells.set({ added: preview(2).added, removed: [[2, 2, 1]], falls: [[5, 5, 6]] }, null);
    expect(cells.isRefused).toBe(true);
    const falls = mat("blocks.falls");
    expect(mat("blocks.added")).not.toBe(added);
    expect(mat("blocks.added")).toBe(mat("blocks.removed"));
    expect(mat("blocks.removed")).not.toBe(removed);
    expect(falls).not.toBe(mat("blocks.added"));
    expect(falls).not.toBe(removed);
    // (the same cells again change nothing; the falls gone, the looks come back)
    expect(cells.set({ added: preview(2).added, removed: [[2, 2, 1]], falls: [[5, 5, 6]] }, null)).toBe(false);
    cells.set({ added: preview(2).added, removed: [[2, 2, 1]], falls: [] }, null);
    expect(cells.isRefused).toBe(false);
    expect(mat("blocks.added")).toBe(added);
    expect(mat("blocks.removed")).toBe(removed);
    cells.dispose();
  });

  it("follows the layer cut: cells at or above it are not drawn, and come back with it", () => {
    const scene = new Scene();
    const cells = new BlockCells(scene);
    cells.set(preview(2), 5);
    // (added at layer 4 stay; the falls at 6 and 7 go; the removed at 1 stays)
    expect(cells.drawn).toEqual({ added: 2, removed: 1, falls: 0 });
    expect(cells.setCut(7)).toBe(true);
    expect(cells.drawn).toEqual({ added: 2, removed: 1, falls: 1 });
    expect(cells.setCut(7)).toBe(false);
    expect(cells.setCut(null)).toBe(true);
    expect(cells.drawn).toEqual({ added: 2, removed: 1, falls: 2 });
    expect(cells.setCut(1)).toBe(true);
    expect(cells.drawn).toEqual({ added: 0, removed: 0, falls: 0 });
    cells.dispose();
  });
});
