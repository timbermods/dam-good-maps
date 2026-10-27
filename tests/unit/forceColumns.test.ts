// Erode's frames add the tiles whose voxels changed to the voxel columns the renderer holds (D281).

import { describe, expect, it } from "vitest";
import { LAYERS } from "../../src/core/format/world";
import { mergeColumns } from "../../src/editor/forces/columns";

const cols = (entries: [number, number][]) => ({ tiles: Int32Array.from(entries.map(([t]) => t)), voxels: Uint8Array.from(entries.flatMap(([, fill]) => Array.from({ length: LAYERS }, () => fill))) });

describe("a force frame's columns join the map's", () => {
  it("keeps the tiles it had, adds new ones, replaces the ones a frame changed, tiles ascending", () => {
    const out = mergeColumns(cols([[3, 1], [9, 1]]), cols([[9, 0], [5, 1]]));
    expect(Array.from(out.tiles)).toEqual([3, 5, 9]);
    expect(Array.from({ length: 3 }, (_, k) => out.voxels[k * LAYERS])).toEqual([1, 1, 0]);
    expect(out.voxels.length).toBe(3 * LAYERS);
  });
  it("carries each tile's mask with its voxels when both sets have them", () => {
    const withMasks = (entries: [number, number][]) => ({ ...cols(entries), masks: Uint32Array.from(entries.map(([t]) => t * 100)) });
    const out = mergeColumns(withMasks([[3, 1], [9, 1]]), { ...withMasks([[9, 0], [5, 1]]), masks: Uint32Array.from([7, 8]) });
    expect(Array.from(out.masks!)).toEqual([300, 8, 7]);
    expect(mergeColumns(cols([[3, 1]]), withMasks([[5, 1]])).masks, "a set without masks: none").toBeUndefined();
  });
  it("from a map with no columns, a frame's are all there are", () => {
    const out = mergeColumns({ tiles: new Int32Array(0), voxels: new Uint8Array(0) }, cols([[7, 1]]));
    expect(Array.from(out.tiles)).toEqual([7]);
  });
});
