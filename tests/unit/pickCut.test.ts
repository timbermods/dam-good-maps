// What a cursor and the Wand read under a layer cut, and what an editing tool aims at over a roof (3D view,
// part 5): the Select ring follows the run the pointer aims at, the brushes and forces aim at the tile's top.

import { describe, expect, it } from "vitest";
import { selectTool, Selection, type SelectHost } from "../../src/editor/select";
import { columnMask, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";
import { aimedHeights, hasTopAt, pickTerrain } from "../../src/render3d/pick";

const W = 8;
const H = 4;

function terrain(solid: (x: number, y: number, z: number) => boolean): TerrainSource {
  const heights = new Uint8Array(W * H);
  const columns = new Map<number, Uint8Array>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = new Uint8Array(LAYERS);
      let top = 0;
      for (let z = 0; z < LAYERS; z++) if (solid(x, y, z)) (c[z] = 1), (top = z + 1);
      heights[y * W + x] = top;
      if (c.subarray(0, top).some((v) => !v)) columns.set(y * W + x, c);
    }
  return { W, H, heights, columns };
}

describe("an editing tool over a roof", () => {
  // a cave under a roof at x 2…5, y 1…3 (floor at level 3, roof 6…8), open ground (height 3) at y = 0
  const src = terrain((x, y, z) => (y === 0 ? z < 3 : x >= 2 && x <= 5 ? z < 3 || (z >= 6 && z < 9) : z < 9));
  const mask = (i: number) => columnMask(src, i);
  // a ray in over the open ground and under the roof, landing on the cave's floor
  const ray = { origin: [3.5, 4.2, 1.5] as [number, number, number], direction: [0, -0.4, -1].map((v) => v / Math.hypot(0, 0.4, 1)) as [number, number, number] };

  it("the pick lands on the floor under the roof, the tile's top is the roof's", () => {
    const hit = pickTerrain(ray, W, H, mask)!;
    expect([hit.x, hit.y, hit.face, hit.level]).toEqual([3, 1, "top", 3]);
    expect(src.heights[1 * W + 3]).toBe(9);
  });

  it("brushes and forces aim at the tile's top (the same heights); only the Select ring follows the run", () => {
    const hit = pickTerrain(ray, W, H, mask)!;
    const at = { x: 3.5, y: 1.5, radius: 1 };
    expect(aimedHeights(src.heights, W, H, src.columns, mask, hit.level!, at, false)).toBe(src.heights);
    const ring = aimedHeights(src.heights, W, H, src.columns, mask, hit.level!, at, true);
    expect(ring[1 * W + 3]).toBe(3);
    expect(src.heights[1 * W + 3]).toBe(9);
  });

  it("the tops under a layer cut: the cave's floor, the cut where rock crosses it, the plain tile flattened", () => {
    const m = mask(1 * W + 3);
    // a cut at 5 removes the roof: only the floor's top is left
    expect(hasTopAt(9, m, 3, 5)).toBe(true);
    expect(hasTopAt(9, m, 9, 5)).toBe(false);
    // a cut at 7 crosses the roof run: the cut is a top, the roof's own top is gone
    expect(hasTopAt(9, m, 7, 7)).toBe(true);
    expect(hasTopAt(9, m, 9, 7)).toBe(false);
    expect(hasTopAt(12, undefined, 8, 8)).toBe(true);
    expect(hasTopAt(12, undefined, 12, 8)).toBe(false);
    expect(hasTopAt(5, undefined, 5, 8)).toBe(true);
    expect(hasTopAt(12, undefined, 12, null)).toBe(true);
  });
});

describe("the Wand on a plateau under a layer cut", () => {
  // a plateau 6 × 3 at height 12, a shoulder of height 10 round it, low ground (4) beyond; the world cut at 8
  const W2 = 12;
  const H2 = 9;
  const heights = new Uint8Array(W2 * H2).fill(4);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 11; x++) heights[y * W2 + x] = 10;
  for (let y = 3; y < 6; y++) for (let x = 3; x < 9; x++) heights[y * W2 + x] = 12;
  const cut = 8;
  const host = (): SelectHost => ({
    W: W2,
    H: H2,
    heights: () => heights,
    mode: () => "wand",
    changed: () => undefined,
    drawing: () => undefined,
    wet: () => false,
    hasTop: (i, level) => hasTopAt(heights[i], undefined, level, cut),
  });

  it("a click on the cut plateau selects the whole joined flat the cut shows, not only the clicked tile", () => {
    const sel = new Selection(W2, H2);
    const t = selectTool(sel, host());
    const press = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false } as PointerEvent;
    // under the cut the pick lands on the cut: level 8, over a plateau tile
    t.down({ x: 5, y: 4, level: cut, face: "top", run: { bottom: 0, top: cut } } as never, press);
    const want = [];
    for (let i = 0; i < W2 * H2; i++) if (heights[i] >= cut) want.push(i);
    expect(sel.tiles()).toEqual(want);
    expect(sel.count).toBe(70);
  });
});
