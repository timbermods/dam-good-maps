// A selection taken on a run is drawn on that run (3D view, part 5): the Wand on a cave's floor names the floor's level
// in each tile it takes (`Selection.levels`), plain selections name none, and the renderer finds in each column the run
// that level names (overlayRuns.ts), so the tint and outline lie on the floor and not on the roof over it.

import { describe, expect, it } from "vitest";
import { rectTilesBetween, selectTool, Selection, type SelectHost, type SelectMode } from "../../src/editor/select";
import { columnMask, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";
import { OverlayRuns, overlayRunBytes, runHolding } from "../../src/render3d/overlayRuns";
import { hasTopAt, pickTerrain } from "../../src/render3d/pick";

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

// a cave under a roof at x 2…5, y 1…3 (floor at level 3, roof 6…8), open ground (height 3) at y = 0, rock (9) elsewhere
const src = terrain((x, y, z) => (y === 0 ? z < 3 : x >= 2 && x <= 5 ? z < 3 || (z >= 6 && z < 9) : z < 9));
const mask = (i: number) => columnMask(src, i);
const press = (shift = false, alt = false) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: shift, altKey: alt }) as PointerEvent;

function tool(mode: SelectMode, cut: number | null = null) {
  const sel = new Selection(W, H);
  const host: SelectHost = {
    W,
    H,
    heights: () => src.heights,
    mode: () => mode,
    changed: () => undefined,
    drawing: () => undefined,
    wet: () => false,
    hasTop: (i, level) => hasTopAt(src.heights[i], src.columns.has(i) ? mask(i) : undefined, level, cut),
  };
  return { sel, t: selectTool(sel, host) };
}

describe("the run a level names in a column", () => {
  it("the cave's floor, the roof, a run a cut caps, the map's floor under air, and none", () => {
    const cave = mask(1 * W + 3);
    expect(runHolding(cave, 3)).toEqual({ bottom: 0, top: 3, above: 6 });
    expect(runHolding(cave, 9)).toEqual({ bottom: 6, top: 9, above: 255 });
    // a layer cut at 7 caps the roof run: the selection taken there is on the roof
    expect(runHolding(cave, 7)).toEqual({ bottom: 6, top: 9, above: 255 });
    // no ground at 5 (air) or 0 (rock at the bottom)
    expect(runHolding(cave, 5)).toBeNull();
    expect(runHolding(cave, 0)).toBeNull();
    // a floating run: the map's floor under it
    expect(runHolding(0b1110000, 0)).toEqual({ bottom: 0, top: 0, above: 4 });
  });
});

describe("the Wand on a cave's floor names its level", () => {
  // a ray in over the open ground and under the roof, landing on the cave's floor
  const ray = { origin: [3.5, 4.2, 1.5] as [number, number, number], direction: [0, -0.25, -1].map((v) => v / Math.hypot(0, 0.25, 1)) as [number, number, number] };

  it("each tile taken carries the floor's level; the renderer's bytes put it on the floor's run in the cave's columns only", () => {
    const hit = pickTerrain(ray, W, H, mask)!;
    expect([hit.x, hit.y, hit.level]).toEqual([3, 3, 3]);
    const { sel, t } = tool("wand");
    t.down(hit, press());
    // the floor joined to it at level 3: the cave (x 2…5, y 1…3) and the open ground (y 0)
    const want = [...rectTilesBetween([0, 0], [W - 1, 0], W, H), ...[1, 2, 3].flatMap((y) => [2, 3, 4, 5].map((x) => y * W + x))].sort((a, b) => a - b);
    expect(sel.tiles()).toEqual(want);
    expect([...sel.levels!].map((l, i) => (l ? i : -1)).filter((i) => i >= 0)).toEqual(want);
    expect(want.every((i) => sel.levels![i] === 4)).toBe(true);
    const out = new Uint8Array(W * H * 4);
    expect(overlayRunBytes(src, sel.levels!, out)).toBe(true);
    for (let i = 0; i < W * H; i++) {
      const named = src.columns.has(i) && sel.mask[i];
      // R: named; G the run's top (the floor's 3), B its bottom, A the roof's underside over it
      expect([...out.subarray(i * 4, i * 4 + 4)]).toEqual(named ? [255, 3, 0, 6] : [0, 0, 0, 0]);
    }
  });

  it("the Wand on the roof names the roof; a cut plateau names the cut, on the roof's run", () => {
    const { sel, t } = tool("wand");
    t.down({ x: 3, y: 2, level: 9, face: "top" } as never, press());
    const out = new Uint8Array(W * H * 4);
    overlayRunBytes(src, sel.levels!, out);
    expect([...out.subarray((2 * W + 3) * 4, (2 * W + 3) * 4 + 4)]).toEqual([255, 9, 6, 255]);
    const cut = tool("wand", 7);
    cut.t.down({ x: 3, y: 2, level: 7, face: "top" } as never, press());
    expect(cut.sel.levels![2 * W + 3]).toBe(8);
    overlayRunBytes(src, cut.sel.levels!, out);
    expect([...out.subarray((2 * W + 3) * 4, (2 * W + 3) * 4 + 4)]).toEqual([255, 9, 6, 255]);
  });

  it("plain selections name no level; added tiles keep theirs, taken-out and plainly added ones none", () => {
    const rect = tool("rect");
    rect.t.down({ x: 1, y: 1 } as never, press());
    rect.t.move({ x: 4, y: 2 } as never, press());
    rect.t.up({ x: 4, y: 2 } as never, press());
    expect(rect.sel.count).toBe(8);
    expect(rect.sel.levels).toBeNull();

    const sel = new Selection(W, H);
    sel.apply([3 * W + 3, 3 * W + 4], "set", 3);
    sel.apply([0, 1], "add");
    expect([...sel.levels!].filter((l) => l)).toEqual([4, 4]);
    expect(sel.levels![0]).toBe(0);
    sel.apply([3 * W + 3], "subtract");
    expect(sel.levels![3 * W + 3]).toBe(0);
    expect(sel.levels![3 * W + 4]).toBe(4);
    // once no tile names a level, the selection is plain again
    sel.apply([3 * W + 4], "add");
    expect(sel.levels).toBeNull();
    sel.apply([5], "set", 3);
    sel.clear();
    expect(sel.levels).toBeNull();
  });
});

describe("the roof over a floor selected by level is outside the brushes' area", () => {
  const levels = new Uint8Array(W * H);
  levels[1 * W + 3] = 3 + 1; // the cave's floor
  levels[2 * W + 3] = 9 + 1; // the roof
  levels[0 * W + 3] = 3 + 1; // open ground at y = 0 (a plain run: nothing is below its top)
  const runs = new OverlayRuns({ value: null as never });
  runs.set(null, levels);

  it("a tile whose named run lies under its top is dimmed, so the brushes leave it out", () => {
    expect(runs.namesBelowTop(src, 1 * W + 3, src.heights[1 * W + 3])).toBe(true);
  });
  it("the roof named, a plain column and a tile naming nothing stay inside", () => {
    expect(runs.namesBelowTop(src, 2 * W + 3, src.heights[2 * W + 3])).toBe(false);
    expect(runs.namesBelowTop(src, 0 * W + 3, src.heights[0 * W + 3])).toBe(false);
    expect(runs.namesBelowTop(src, 1 * W + 4, src.heights[1 * W + 4])).toBe(false);
  });
});
