// The moving water's current on a generated river (D353): it moves, it runs downstream, and the
// outflows it comes from are the ones the file stores.

import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { storedOutflows } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment } from "../../src/core/spec/codec";
import { outflowsOf, surfaceCurrent } from "../../src/render3d/current";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";

// (seed 25: a map whose water is flat columns with the settle's outflows, as the file stores them; a map with terrain
// above terrain has its columns' own, `stack.flows`. Seed 4241 before generator 0.10.10, whose land grows a cliff
// overhang under D503, as most 128² maps now do, D148; seed 4242's since D502's landmark forms; seed 7 for seed 4 since generator 0.10.11, #726,
// D148: of River Valley's seeds 1–8 only seed 7's water was flat columns then; seed 20 for seed 7 since generator 0.10.13,
// whose starts frame the map (D507): seed 7's map still has flat columns but no film left on its bank, which the third
// test needs, and of River Valley's seeds 1–30 only seeds 7, 20, 24 and 29 have flat columns now, and of those only seed 20 has films, D148; seed 25 for seed 20 since generator 0.10.14, the opening camera's target on height
// 0 (D493): seed 20's start moved (43,83 to 30,70) and its map now has terrain above terrain; of seeds 1–30 only 7, 24
// and 25 have flat columns now, and only seed 25 has films, D148; seed 20 for seed 25 since generator 0.10.16's ground
// with grade: seed 25's map now has terrain above terrain; of seeds 1–30 only 7, 9, 20 and 26 have flat columns now, and
// only seeds 20 and 26 have films, D148; seed 26 for seed 20 since generator 0.10.17's start floors (D515): seed 20's map
// now has terrain above terrain, so its water has no flat columns' outflows; of seeds 1–12, 20, 24–26 and 29 only 7, 9
// and 26 have flat columns now, and only seed 26 has films, D148; seed 7 for seed 26 since the D518 mends (compact hills, no broad wash flats, dead-stand knots), D148: seed 26's map has no film on its banks now; of seeds 1–34 only 4, 7, 9, 24, 26 and 31 have flat columns, and only seeds 7 and 24 have films (1 and 2 tiles), seed 7 the first)
// (seed 4 since generator 0.10.21's look round (D518: the land's long straight steps jog, the dead stands read the dry land as the checks do), D148:
// seed 7's map has no film on its banks now; of seeds 1–12, 24, 26 and 29 only 4 and 24 pass every rule below, and seed 4 is the first)
// (seed 9 since generator 0.10.23's round forms, the look round, D148: seed 4's map has terrain above terrain now, so its water has no
// flat columns' outflows; of seeds 1–12, 24, 26 and 29 only 9 and 24 have flat columns, and only seed 9 has films, 2 tiles)
const r = generate(decodeSpecFragment("s=9&t=riverValley&z=128&d=n")!.spec);
const { W, H } = r.built;
const S = r.built.settle;
const view = waterFromDepth(r.built.heights, S.depth, S.contamination);
view.outflow = outflowsOf(view, W, H, S.out)!;
const sw0 = surfaceWater(W, H, view);
/** The current of each column (the renderer's, from the outflows the worker sends). */
const c0 = surfaceCurrent(W, H, sw0);
const cur = Float32Array.from({ length: view.count * 2 }, (_, n) => c0[view.tile[n >> 1] * 2 + (n & 1)]);

describe("the current of River Valley seed 9 at 128 squared", () => {
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
    const singletons = readTimber(r.bytes).world.singletons;
    const stored = storedOutflows(singletons, W, H)!;
    expect(stored).not.toBeNull();
    // (the reader reads the water deeper than a film, 0.001, as `storedWater` does; a film's outflows are read from its
    // own token: this map has films on its bank)
    const tokens = String(((singletons.WaterMapNew as Record<string, unknown>).ColumnOutflows as { Array: string }).Array).split(" ");
    const out = S.out!;
    let films = 0;
    for (let i = 0; i < W * H; i++) {
      if (!(S.depth[i] > 1e-6)) continue;
      const film = !(S.depth[i] > 0.001);
      if (film) films++;
      const parts = tokens[i] === "0" ? [] : tokens[i].split(":");
      for (let d = 0; d < 4; d++) {
        const k = i * 4 + d;
        const want = out[k] > 1e-6 ? out[k] : 0;
        const got = film ? Number((parts[d] ?? "0").split("|")[1]) || 0 : stored[k];
        expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-6 * Math.max(1, want));
      }
    }
    expect(films).toBeGreaterThan(0);
  });
});
