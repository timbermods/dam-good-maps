// Placing an object never visibly spills water (PLAN §20 D345, B6; D328 enforced): the levelling
// fills no wet tile, cuts no dry tile below the water beside it, and the water round the placement
// stays exactly where it was once it settles. A footprint that stands in water on uneven ground is
// refused with one plain reason instead (levelling it would fill or drain the water).

import { describe, expect, it } from "vitest";
import { footprintTiles } from "../../src/core/format/footprints";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const cover = (template: string) => (x: number, y: number) => footprintTiles(template, { template, x, y, z: 0, orientation: "Cw0", flipped: false }).map(([a, b]) => b * W + a);

function snap() {
  const v = ed.sessionView();
  const d = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) d[v.view.water.tile[k]] = v.view.water.depth[k];
  return { h: v.view.heights.slice(), d };
}

/** Settle the map's water on the ground it has, so that a later edit's water is compared with the
 *  water as the editor settles it (an edit re-settles the whole map's water a little). */
function canonical() {
  for (let y = 10; y < W - 10; y++)
    for (let x = 10; x < W - 10; x++) {
      const p = { tool: "entity" as const, template: "SmallRelic", x, y, orientation: "Cw0" as const };
      if (ed.footprintCheck(p).problem) continue;
      if (!ed.applyTool(p, "11111111-2222-4333-8444-555555555555").ok) continue;
      ed.settleWater();
      ed.undo();
      ed.settleWater();
      return;
    }
  throw new Error("no spot for the control");
}

/** What a placement did to the water: wet tiles it filled, dry tiles it cut below the surface
 *  beside them, and tiles whose water moved when it settled. */
function spill(before: ReturnType<typeof snap>, after: ReturnType<typeof snap>, settled: ReturnType<typeof snap>) {
  let filled = 0;
  let cutBelow = 0;
  let moved = 0;
  for (let i = 0; i < W * W; i++) {
    if (before.d[i] > 0 && after.h[i] > before.h[i]) filled++;
    if (after.h[i] < before.h[i] && before.d[i] <= 0) {
      const ix = i % W;
      const iy = (i - ix) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (iy + dy) * W + ix + dx;
        if (before.d[j] > 0 && after.h[i] < before.h[j] + before.d[j] - 1e-6) {
          cutBelow++;
          break;
        }
      }
    }
  }
  // (the editor's settle drifts a little in the low dry ground far from any water after any edit; what
  // counts is the water that was there: it must not move, and must not run onto the dry tiles beside it)
  let biggest = 0;
  for (let i = 0; i < W * W; i++) {
    const ix = i % W;
    const iy = (i - ix) / W;
    if (before.d[i] > 0) {
      biggest = Math.max(biggest, Math.abs(settled.d[i] - after.d[i]));
      continue;
    }
    if (settled.d[i] <= 0.05) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < W && before.d[ny * W + nx] > 0) biggest = Math.max(biggest, settled.d[i]);
    }
  }
  moved = biggest;
  return { filled, cutBelow, moved };
}

describe("placing an object never visibly spills water (D345, B6)", () => {
  for (const template of ["UndergroundRuins", "LargeRelic"]) {
    it(`a ${template} placed on uneven ground by water fills no wet tile, cuts nothing below the water beside it, and leaves the water where it was`, async () => {
      let placed = 0;
      let refused = 0;
      for (const seed of [1, 2]) {
        await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
        ed.setEditorWaterMode("defer");
        ed.refine();
        // the water as the editor settles it, so that a placement is compared with that
        canonical();
        const base = snap();
        for (let y = 10; y < W - 10; y += 3)
          for (let x = 10; x < W - 10; x += 3) {
            const own = cover(template)(x, y);
            if (own.every((i) => base.h[i] === base.h[own[0]])) continue;
            let near = false;
            for (let dy = -7; dy <= 7 && !near; dy++) for (let dx = -7; dx <= 7 && !near; dx++) if (base.d[(y + dy) * W + x + dx] > 0) near = true;
            if (!near) continue;
            const check = ed.footprintCheck({ tool: "entity", template, x, y, orientation: "Cw0" });
            const wet = own.some((i) => base.d[i] > 0);
            if (check.problem) {
              // a footprint in water on uneven ground is refused for the water, in one plain line
              if (wet && /^the water is in the way/.test(check.problem)) {
                refused++;
                const r = ed.applyTool({ tool: "entity", template, x, y, orientation: "Cw0" }, "11111111-2222-4333-8444-555555555555");
                expect(r.ok).toBe(false);
              }
              continue;
            }
            expect(wet, `${template} at ${x},${y} stands in water and isn't level: it should have been refused`).toBe(false);
            const before = snap();
            const r = ed.applyTool({ tool: "entity", template, x, y, orientation: "Cw0" }, "11111111-2222-4333-8444-555555555555");
            // (a slope the map has there is refused by the placement, not the hover: not this test's business)
            if (!r.ok) {
              expect(r.errors.join()).toMatch(/stands there/);
              continue;
            }
            placed++;
            const after = snap();
            ed.settleWater();
            const s = spill(before, after, snap());
            const at = `${template} at ${x},${y} (seed ${seed})`;
            expect(s.filled, `${at} filled wet tiles`).toBe(0);
            expect(s.cutBelow, `${at} cut dry tiles below the water beside them`).toBe(0);
            expect(s.moved, `${at}: the water moved by ${s.moved.toFixed(2)} when it settled`).toBeLessThan(0.1);
            ed.undo();
            ed.settleWater();
          }
      }
      // (the sweep is not vacuous)
      expect(placed).toBeGreaterThan(5);
      expect(refused).toBeGreaterThan(0);
    }, 300000);
  }

  it("a footprint that is level already may stand in shallow water: nothing changes", async () => {
    await runGenerate(makeSpec({ seed: 1, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const base = snap();
    const own = cover("SmallRelic");
    for (let y = 8; y < W - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const tiles = own(x, y);
        if (!tiles.some((i) => base.d[i] > 0) || !tiles.every((i) => base.h[i] === base.h[tiles[0]])) continue;
        if (ed.footprintCheck({ tool: "entity", template: "SmallRelic", x, y, orientation: "Cw0" }).problem) continue;
        const r = ed.applyTool({ tool: "entity", template: "SmallRelic", x, y, orientation: "Cw0" }, "11111111-2222-4333-8444-555555555555");
        expect(r.ok).toBe(true);
        expect([...snap().h]).toEqual([...base.h]);
        return;
      }
    throw new Error("no level wet spot");
  }, 120000);
});
