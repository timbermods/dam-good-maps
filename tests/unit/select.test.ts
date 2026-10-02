// The Select tool's tiles (PLAN §20 D184, D259, D261, D264): a rectangle, a circle, a freehand
// outline, the Wand (the ground at a level, or a river's or lake's water as the view draws it);
// added and taken away; its size in words (D183); Max water depth's levels.

import { describe, expect, it } from "vitest";
import { circleTiles, depthLevels, outlineTiles, rectTilesBetween, sameLevelTiles, Selection, selectTool, sizeWords, waterTiles, type SelectHost, type SelectMode } from "../../src/editor/select";

const W = 20;
const H = 16;

describe("the Select tool", () => {
  it("a rectangle either way round, clipped to the map", () => {
    expect(rectTilesBetween([2, 3], [4, 4], W, H)).toEqual([62, 63, 64, 82, 83, 84]);
    expect(rectTilesBetween([4, 4], [2, 3], W, H)).toEqual(rectTilesBetween([2, 3], [4, 4], W, H));
    expect(rectTilesBetween([18, 14], [25, 30], W, H).length).toBe(4);
  });

  it("a freehand outline takes its inside and its line", () => {
    const t = outlineTiles([[2, 2], [10, 2], [10, 8], [2, 8]], W, H);
    expect(t).toContain(5 * W + 5);
    expect(t).toContain(2 * W + 2);
    expect(t).not.toContain(12 * W + 12);
  });

  it("a circle: the tiles within its radius of its middle", () => {
    const t = circleTiles(10, 8, 3, W, H);
    expect(t).toContain(8 * W + 13);
    expect(t).not.toContain(11 * W + 13);
    expect(t.length).toBe(29);
  });

  it("the Wand on water: the water joined to the tile, and no bank tile; on dry ground, nothing", () => {
    // a river along y 6–7, a lake at x 14–17, y 10–13 joined to it by x 15, y 8–9; a bank film
    // the view doesn't draw beside it
    const wet = new Uint8Array(W * H);
    for (let x = 0; x < W; x++) wet[6 * W + x] = wet[7 * W + x] = 1;
    for (let y = 8; y <= 9; y++) wet[y * W + 15] = 1;
    for (let y = 10; y <= 13; y++) for (let x = 14; x <= 17; x++) wet[y * W + x] = 1;
    wet[2 * W + 2] = 1;
    const t = waterTiles((i) => wet[i] === 1, W, H, 3, 6);
    expect(t.length).toBe(2 * W + 2 + 16);
    expect(t).not.toContain(5 * W + 3);
    expect(t).not.toContain(2 * W + 2);
    expect(waterTiles((i) => wet[i] === 1, W, H, 3, 3)).toEqual([]);
  });

  it("Max water depth: the ground under deeper water rises so the water sits that deep, surface kept", () => {
    // a lake 6 deep (floor 2, surface 8), a shallow edge 1 deep (floor 7), a dry tile
    const h = new Uint8Array([2, 2, 7, 9]);
    const water = [6, 6, 1, 0];
    const surface = [8, 8, 8, NaN];
    const by = depthLevels([0, 1, 2, 3], h, water, surface, 3);
    expect([...by.entries()]).toEqual([[5, [0, 1]]]);
  });

  it("the same level: the ground at the clicked level joined to it", () => {
    const h = new Uint8Array(W * H).fill(3);
    for (let x = 0; x < W; x++) h[8 * W + x] = 5;
    const t = sameLevelTiles(h, W, H, 4, 4);
    expect(t.length).toBe(8 * W);
    expect(t).not.toContain(10 * W + 4);
  });

  it("adds, takes away, and says its size", () => {
    const s = new Selection(W, H);
    s.apply(rectTilesBetween([0, 0], [11, 7], W, H), "set");
    expect(sizeWords(s.size()!)).toBe("12 × 8 tiles");
    s.apply(rectTilesBetween([0, 0], [1, 1], W, H), "subtract");
    expect(sizeWords(s.size()!)).toBe("12 × 8 tiles (92)");
    s.apply(rectTilesBetween([15, 10], [15, 10], W, H), "add");
    expect(s.count).toBe(93);
    s.clear();
    expect(s.size()).toBeNull();
  });
});

// Ctrl+click on the land only sets the Level box to that spot's height and never changes the selection
// (PLAN §20 D361, item 7): three or four of them used to clear it.
describe("Select's Ctrl+click on land", () => {
  const heights = new Uint8Array(W * H).map((_, i) => 1 + (i % 7));
  const hitAt = (x: number, y: number) => ({ x, y }) as never;
  const press = (ctrl: boolean): PointerEvent => ({ button: 0, ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false }) as PointerEvent;
  function setup(mode: SelectMode) {
    const sel = new Selection(W, H);
    sel.apply(rectTilesBetween([2, 2], [6, 5], W, H), "set");
    const before = [...sel.mask];
    const sampled: number[] = [];
    let changed = 0;
    const host: SelectHost = {
      W,
      H,
      heights: () => heights,
      mode: () => mode,
      changed: () => changed++,
      drawing: () => undefined,
      sample: (level) => sampled.push(level),
      wet: () => false,
    };
    return { sel, before, sampled, host, changed: () => changed, tool: selectTool(sel, host) };
  }

  for (const mode of ["rect", "circle", "free", "brush", "wand"] as const) {
    it(`${mode}: a click samples the level and leaves the selection alone`, () => {
      const t = setup(mode);
      t.tool.down(hitAt(10, 8), press(true));
      t.tool.up(hitAt(10, 8) as never, press(true));
      expect(t.sampled).toEqual([heights[8 * W + 10]]);
      expect([...t.sel.mask]).toEqual(t.before);
      expect(t.changed()).toBe(0);
    });

    it(`${mode}: hand jitter to a neighbouring tile is still a click, never a selection`, () => {
      const t = setup(mode);
      t.tool.down(hitAt(10, 8), press(true));
      t.tool.move(hitAt(11, 8), press(true));
      t.tool.move(hitAt(11, 9), press(true));
      t.tool.up(hitAt(11, 9) as never, press(true));
      expect(t.sampled).toEqual([heights[8 * W + 10]]);
      expect([...t.sel.mask]).toEqual(t.before);
      expect(t.changed()).toBe(0);
    });
  }

  it("four Ctrl+clicks in a row leave the selection as it was", () => {
    const t = setup("rect");
    for (const [x, y] of [[9, 9], [12, 3], [14, 12], [1, 14]] as const) {
      t.tool.down(hitAt(x, y), press(true));
      t.tool.move(hitAt(x + 1, y), press(true));
      t.tool.up(hitAt(x + 1, y) as never, press(true));
    }
    expect(t.sampled.length).toBe(4);
    expect([...t.sel.mask]).toEqual(t.before);
  });

  it("a plain drag still selects", () => {
    const t = setup("rect");
    t.tool.down(hitAt(10, 8), press(false));
    t.tool.move(hitAt(12, 9), press(false));
    t.tool.up(hitAt(12, 9) as never, press(false));
    expect(t.sampled).toEqual([]);
    expect(t.sel.count).toBe(6);
  });
});
