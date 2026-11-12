// The one composer (#922 step 4): a stroke's operation completed on the page as the session completes it, so the
// session adds nothing, and its land before and after as the build leaves it.

import { describe, expect, it } from "vitest";
import { brushBounds, type BrushParams } from "../../src/core/features/raster/brush";
import { completeStroke, composeStroke, type StrokeFacts } from "../../src/core/features/raster/strokeComposer";
import type { TerrainState } from "../../src/core/features/raster/strokePreview";

const W = 32;
/** A flat map at level 6 with a water source at (14, 10), the rock's ground held at four tiles (two inside a stroke's reach,
 *  two far from it). */
function facts(): StrokeFacts {
  const pre = new Uint8Array(W * W).fill(6);
  const terrain: Pick<TerrainState, "pre" | "hold" | "rockHold" | "water" | "moisture" | "worn"> = {
    pre,
    rockHold: [
      [10 * W + 12, 5, 255],
      [11 * W + 12, 5, 255],
      [30 * W + 30, 5, 255],
      [31 * W + 31, 5, 255],
    ],
    water: new Float64Array(W * W),
    moisture: new Float64Array(W * W),
    worn: new Uint8Array(W * W),
  };
  return { W, H: W, heights: pre.slice(), terrain, entities: [{ template: "WaterSource", x: 14, y: 10, z: 6, orientation: "Cw0", flipped: false }] };
}
const stroke = (): BrushParams => ({ tool: "naturalize", size: 3, strength: 5, seed: 1, weathers: true, dabs: [12 * 4 + 2, 10 * 4 + 2, 14 * 4 + 2, 10 * 4 + 2] });

describe("completeStroke: what the session adds, added on the page", () => {
  it("holds the ground in the stroke's reach and the tile round it, records the rule and the ground under the objects", () => {
    const p = completeStroke(stroke(), facts());
    expect(p.weathering).toBe(6);
    expect(p.hold).toEqual([
      [10 * W + 12, 5, 255],
      [11 * W + 12, 5, 255],
    ]);
    expect(p.keep).toEqual([[10, 14, 14]]);
    expect(p.worn).toBeDefined();
  });

  it("is idempotent: a stroke complete already gains nothing (the session's call on the page's stroke)", () => {
    const f = facts();
    const once = completeStroke(stroke(), f);
    expect(completeStroke(once, f)).toEqual(once);
    // (ground the stroke kept already, as the page records Keep's, is not recorded twice)
    const kept = completeStroke({ ...stroke(), keep: [[10, 14, 14]] }, f);
    expect(kept.keep).toEqual([[10, 14, 14]]);
  });
});

describe("composeStroke: the land a stroke changes, as the build leaves it", () => {
  it("protects the held tiles in its reach, and leaves the rock's ground the preview guarded elsewhere as it was", () => {
    const f = facts();
    const start = f.heights as Uint8Array;
    const shown = start.slice();
    shown[10 * W + 13] = 5;
    const pre = shown.slice();
    // (the preview guards every tile holding up the rock, all over the map)
    const protect = new Uint8Array(W * W);
    for (const [i] of f.terrain.rockHold!) protect[i] = 1;
    const before = { pre: f.terrain.pre, protect: new Uint8Array(W * W), rockHold: f.terrain.rockHold };
    const c = composeStroke(stroke(), "Naturalize", { start, shown, pre, protect, bounds: { x0: 13, y0: 10, x1: 13, y1: 10 }, before }, f);
    expect(c.tiles).toBe(1);
    expect(c.label).toBe("Naturalize 1 tile");
    const reach = brushBounds(c.params, W, W)!;
    const { rect, after } = c.overlay;
    const at = (x: number, y: number) => (y - rect.y0) * (rect.x1 - rect.x0 + 1) + (x - rect.x0);
    // (the overlay covers the held tiles, protected as the build protects them)
    for (const [i] of c.params.hold!) {
      const x = i % W;
      const y = (i - x) / W;
      if (x < reach.x0 || x > reach.x1 || y < reach.y0 || y > reach.y1) continue;
      expect(after.protect[at(x, y)]).toBe(1);
    }
    expect(rect.x1).toBeLessThan(30);
    expect(after.heights[at(13, 10)]).toBe(5);
  });

  it("a stroke that changed no tile has no land to lay: its operation still comes complete", () => {
    const f = facts();
    const start = f.heights as Uint8Array;
    const c = composeStroke(stroke(), "Naturalize", { start, shown: start, pre: start, protect: new Uint8Array(W * W), bounds: null, before: { pre: start, protect: new Uint8Array(W * W) } }, f);
    expect(c.tiles).toBe(0);
    expect(c.params.weathering).toBe(6);
  });
});
