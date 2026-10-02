// The moving water's current on a generated river (D353): it moves, it runs downstream, and the
// outflows it comes from are the ones the file stores.

import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { storedOutflows } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment } from "../../src/core/spec/codec";
import { outflowsOf } from "../../src/render3d/current";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";

const r = generate(decodeSpecFragment("s=4242&t=riverValley&z=128&d=n")!.spec);
const { W, H } = r.built;
const S = r.built.settle;
const view = waterFromDepth(r.built.heights, S.depth, S.contamination);
view.outflow = outflowsOf(view, W, H, S.out)!;
const sw0 = surfaceWater(W, H, view);
/** The current of each column (the renderer's, from the outflows the worker sends). */
const cur = Float32Array.from({ length: view.count * 2 }, (_, n) => sw0.current[view.tile[n >> 1] * 2 + (n & 1)]);

describe("the current of River Valley seed 4242 at 128 squared", () => {
  it("the river moves: a quarter of the wet columns are quicker than 0.5, none beyond 10", () => {
    let fast = 0;
    for (let k = 0; k < view.count; k++) {
      const s = Math.hypot(cur[k * 2], cur[k * 2 + 1]);
      expect(s).toBeLessThanOrEqual(10);
      if (s > 0.5) fast++;
    }
    expect(view.count).toBeGreaterThan(0);
    expect(fast / view.count).toBeGreaterThanOrEqual(0.25);
  });

  it("runs downstream: down the surface, for nearly every quick column on a measurable slope", () => {
    const sw = surfaceWater(W, H, view);
    let slopes = 0;
    let down = 0;
    for (let k = 0; k < view.count; k++) {
      const vx = cur[k * 2];
      const vy = cur[k * 2 + 1];
      if (Math.hypot(vx, vy) <= 0.5) continue;
      const i = view.tile[k];
      const x = i % W;
      const y = (i - x) / W;
      // the surface's gradient from neighbours on the same surface (within 0.65, as the shapes treat it)
      const at = (xx: number, yy: number) => {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) return NaN;
        const j = yy * W + xx;
        return sw.depth[j] > 0.06 && Math.abs(sw.surface[j] - sw.surface[i]) <= 0.65 ? sw.surface[j] : NaN;
      };
      const diff = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? 0 : (a - b) / 2);
      const gx = diff(at(x + 1, y), at(x - 1, y));
      const gy = diff(at(x, y + 1), at(x, y - 1));
      if (Math.hypot(gx, gy) < 0.01) continue;
      slopes++;
      if (-(vx * gx + vy * gy) > 0) down++;
    }
    expect(slopes).toBeGreaterThan(50);
    expect(down / slopes).toBeGreaterThanOrEqual(0.95);
  });

  it("the file stores the settle's outflows on every wet tile", () => {
    const stored = storedOutflows(readTimber(r.bytes).world.singletons, W, H)!;
    expect(stored).not.toBeNull();
    const out = S.out!;
    for (let i = 0; i < W * H; i++) {
      if (!(S.depth[i] > 1e-6)) continue;
      for (let d = 0; d < 4; d++) {
        const k = i * 4 + d;
        const want = out[k] > 1e-6 ? out[k] : 0;
        expect(Math.abs(stored[k] - want)).toBeLessThanOrEqual(1e-6 * Math.max(1, want));
      }
    }
  });
});
