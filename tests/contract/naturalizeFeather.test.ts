// Release gate (D385), brushes: the working area's feathered edge (D254, D259; EDITOR_PLAN "The working
// area is Select's open selection"): "A feathered edge: a tile changes at most as many levels as it is
// steps inside the area, so edited land meets locked land a level a tile, never a cliff." The release
// gate's bug hunt (D385) found a Naturalize stroke inside an open selection breaking it: its
// weathering counted the feather from each dab's land, not the stroke's first, and its order repairs
// (`keepOrder`) ignored it, up to three levels on the area's own edge and eleven a few tiles in.

import { describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { areaDepth, type BrushParams } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

const W = 64;

/** The rectangle [x0, x0 + w) × [y0, y0 + h) as runs, clipped to the map. */
function rect(x0: number, y0: number, w: number, h: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = y0; y < Math.min(W, y0 + h); y++) out.push([y, x0, Math.min(W - 1, x0 + w - 1)]);
  return out;
}

/** Each tile the stroke changed by more levels than it is steps inside the area, and each tile
 *  outside the area it changed, as "x,y (steps inside): before -> after". */
function apply(theme: ThemeId, seed: number, p: BrushParams): string[] {
  const r = generate(makeSpec({ seed, theme, size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  const before = s.built.heights.slice();
  const res = s.apply({ op: "brush", params: p } as EditOp);
  expect(res.errors).toEqual([]);
  const depth = areaDepth(p.area!, W, W);
  const out: string[] = [];
  for (let i = 0; i < W * W; i++) {
    const d = Math.abs(s.built.heights[i] - before[i]);
    if (d > depth[i]) out.push(`${i % W},${Math.floor(i / W)} (${depth[i]}): ${before[i]} -> ${s.built.heights[i]}`);
  }
  return out;
}

describe("a Naturalize stroke keeps the working area's feathered edge (D254)", () => {
  it("River valley 64², seed 5: Size 16, Strength 10, inside the area x 49–63, y 17–39: no tile changes by more levels than its steps inside (it was: (49, 27..29) on the area's edge dropped 3)", () => {
    const changed = apply("riverValley", 5, {
      tool: "naturalize",
      size: 16,
      strength: 10,
      seed: 3,
      weathers: true,
      area: rect(49, 17, 23, 23),
      dabs: [255, 114, 241, 123, 231, 117, 220, 103, 224, 105, 231, 101, 236, 105, 227, 103, 235, 90, 245, 99, 246, 89, 244, 89, 237, 94, 228, 108, 233, 100, 224, 109, 236, 112, 235, 119, 229, 111, 224, 102],
    });
    expect(changed).toEqual([]);
  });

  it("Canyon 64², seed 2: Size 8, Strength 10, inside the area x 11–29, y 18–36: no tile changes by more levels than its steps inside (it was: (23, 27), 7 steps in, dropped 11)", () => {
    const changed = apply("canyon", 2, {
      tool: "naturalize",
      size: 8,
      strength: 10,
      seed: 3,
      weathers: true,
      area: rect(11, 18, 19, 19),
      dabs: [74, 98, 87, 98, 87, 96, 85, 97, 91, 102, 80, 113, 78, 106, 83, 112, 74, 112, 64, 117, 67, 129, 60, 122, 62, 107, 60, 107, 48, 100, 63, 112, 72, 115, 68, 118, 71, 108, 80, 117],
    });
    expect(changed).toEqual([]);
  });
});
