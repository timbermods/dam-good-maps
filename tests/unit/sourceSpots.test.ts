// The map's sources as the page's tools see them (PLAN §20 D249): easy to hit (the pointer within
// about two tiles targets one; a direct hit on another object wins; the nearest wins), and a brush
// with Clear sources takes exactly the sources with a tile it presses on (the stroke's own tiles).

import { describe, expect, it } from "vitest";
import { markBrushTiles } from "../../src/core/features/raster/brush";
import type { EntityView } from "../../src/render3d/model";
import { SOURCE_REACH, sourceSpots, sourcesOn, sourcesPressed, targetSource } from "../../src/editor/sourceSpots";

const W = 40;
const H = 40;

function view(list: { template: string; x: number; y: number }[]): EntityView {
  const templates = [...new Set(list.map((e) => e.template))];
  const n = list.length;
  return {
    count: n,
    templates,
    owners: ["placed"],
    template: Uint16Array.from(list.map((e) => templates.indexOf(e.template))),
    x: Int16Array.from(list.map((e) => e.x)),
    y: Int16Array.from(list.map((e) => e.y)),
    z: new Int16Array(n),
    orientation: new Uint8Array(n),
    flags: new Uint8Array(n),
    owner: new Uint16Array(n),
    variant: new Uint8Array(n),
    strength: new Float32Array(n),
  };
}

describe("sources on the page (D249)", () => {
  const spots = sourceSpots(
    view([
      { template: "WaterSource", x: 10, y: 10 },
      { template: "Pine", x: 12, y: 10 },
      { template: "BadwaterSource", x: 20, y: 20 },
      { template: "WaterSource", x: 14, y: 10 },
    ]),
    W,
    H,
  );

  it("finds every water and badwater source, a badwater source on its 3 × 3 tiles", () => {
    expect(spots.map((s) => [s.x, s.y, s.bad, s.tiles.length])).toEqual([
      [10, 10, false, 1],
      [20, 20, true, 9],
      [14, 10, false, 1],
    ]);
    expect(spots[1].rect).toEqual([20, 20, 22, 22]);
  });

  it("the pointer within about two tiles targets a source; the nearest wins; another object there wins", () => {
    // on it, and near it (over bare ground or water)
    expect(targetSource(spots, 10, 10, W, false)?.x).toBe(10);
    expect(targetSource(spots, 8, 12, W, false)?.x).toBe(10);
    expect(targetSource(spots, 10 - SOURCE_REACH - 1, 10, W, false)).toBeNull();
    // between two: the nearer
    expect(targetSource(spots, 11, 11, W, false)?.x).toBe(10);
    expect(targetSource(spots, 13, 11, W, false)?.x).toBe(14);
    // a tree on the tile is the tree
    expect(targetSource(spots, 11, 11, W, true)).toBeNull();
    // but a source standing on the tile is always that source
    expect(targetSource(spots, 21, 22, W, true)?.bad).toBe(true);
    // a badwater source is hit from two tiles round its whole footprint
    expect(targetSource(spots, 24, 24, W, false)?.bad).toBe(true);
    expect(targetSource(spots, 25, 21, W, false)).toBeNull();
  });

  it("a brush with Clear sources takes exactly the sources with a tile among the tiles it presses", () => {
    for (const p of [
      { size: 2, dabs: [4 * 12 + 2, 4 * 10 + 2] },
      { size: 3.5, dabs: [4 * 17, 4 * 17, 4 * 18 + 1, 4 * 18] },
      { size: 1, precise: true, dabs: [4 * 14 + 2, 4 * 11 + 2] },
      { size: 2, shape: "square" as const, dabs: [4 * 18 + 2, 4 * 18 + 2] },
    ]) {
      const mask = new Uint8Array(W * H);
      markBrushTiles(p, W, H, mask);
      const pressed = [...mask.keys()].filter((i) => mask[i]);
      expect(sourcesPressed(spots, p, p.dabs, W).map((s) => s.corner), JSON.stringify(p)).toEqual(sourcesOn(spots, pressed).map((s) => s.corner));
    }
    expect(sourcesPressed(spots, { size: 2 }, [4 * 12 + 2, 4 * 10 + 2], W)).toEqual([]);
    expect(sourcesPressed(spots, { size: 2.5 }, [4 * 12 + 2, 4 * 10 + 2], W).map((s) => s.x)).toEqual([10, 14]);
  });
});
