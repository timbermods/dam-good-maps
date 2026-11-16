// What you see is what you get (PERFECT): the preview's water once it stops ends within placeNoSpill's 0.1 of the
// canonical settle after edits beside a river on generated land (#1181), and a pool a walk only crosses, where no walk
// ends, drains in the preview as in the settle (#1173). previewWarmStream.test.ts holds the measure (`gap`): the most a
// tile's water differs between the two, over the tiles wet before the edit or holding more than 0.05 in either.
//
// Two causes, two mends (sim/preview.ts):
// - A pool the edit deepened (a rim it raised round a tile that used to drain, a hollow the walk newly crosses) kept
//   the film it had; the canonical settle starts it full, and the film filled it only by a trickle long after the
//   preview stopped. It takes the canonical start now (`deepenedPools`): River Valley 96² seed 12, an Underground Ruins
//   at 34,30 shut the pit at 39,33–34 off, 0.02 in the preview against the settle's 1.00 (gap 0.989).
// - A pool that lost flow and that a walk now only crosses, where none ends (no emitter in it, no walk coming down into
//   it from higher ground), is unfed (`crossedPools`, planning's ruling of 2026-11-15): it takes the canonical start and
//   keeps its water only where D385's rule finds a source reaching it. Before, a trench another river's walk still
//   crossed with half the flow kept 1.79 in the preview against the settle's 0.
// - A surge passing down a river after an edit rose by under 0.05 a check on every tile, so one check on its crest
//   stopped the preview there; it now stops only when two checks in a row pass (`PREVIEW_PASSES`): seed 8's Ruins at
//   72,56, 0.64 against 0.53 on the reach at 84–90,32–43.
//
// The land: River Valley 96² seeds 12, 8 and 9 of generator 0.10.27 (#1145's land, where these were found), saved once
// as tools/fixture-projects.ts saves a fixture (D148), so a generator change moves none of these numbers.

import { describe, expect, it } from "vitest";
import * as ed from "../../src/worker/session";
import { namedInEditor } from "../fixtureEditor";
import { openHeights, rect, sourceOp } from "./gateWater";

const W = 96;
const ID = "11111111-2222-4333-8444-555555555555";
const TOL = 0.1;

function settle() {
  ed.settleWater();
  ed.collabSession()!.settleCanonical();
}

function snap() {
  const v = ed.sessionView();
  const d = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) d[v.view.water.tile[k]] = v.view.water.depth[k];
  return d;
}

/** Make the edit, settle its preview and then the canonical water: the most the two differ (previewWarmStream's `gap`). */
function gap(edit: () => boolean): number {
  const before = snap();
  expect(edit(), "the edit is made").toBe(true);
  ed.settleWater();
  const preview = snap();
  ed.collabSession()!.settleCanonical();
  const canon = snap();
  let biggest = 0;
  for (let i = 0; i < W * W; i++) if (before[i] > 0 || canon[i] > 0.05 || preview[i] > 0.05) biggest = Math.max(biggest, Math.abs(canon[i] - preview[i]));
  ed.undo();
  settle();
  return biggest;
}

const ruins = (x: number, y: number) => () => ed.applyTool({ tool: "entity", template: "UndergroundRuins", x, y, orientation: "Cw0" }, ID).ok;
const dig = (x: number, y: number) => () => ed.apply({ op: "sculpt", params: { mode: "lower", cells: [[y, x, x]], amount: 1 } } as never).ok;

describe("the preview after an edit beside a river on generated land ends where the canonical settle does (#1181)", () => {
  it.each([
    // (a pool the edit deepened: the Ruins shut a pit off, which the settle starts full; before the mend 0.989 and 0.857)
    [12, "an Underground Ruins at 34,30", ruins(34, 30)],
    [12, "an Underground Ruins at 30,32", ruins(30, 32)],
    // (a surge down the river: one check on its crest stopped the preview; before the mend 0.120, 0.102 and 0.101)
    [8, "an Underground Ruins at 72,56", ruins(72, 56)],
    [8, "an Underground Ruins at 71,56", ruins(71, 56)],
    [9, "a dig at 24,31", dig(24, 31)],
  ] as const)("River Valley 96² seed %i: %s", (seed, what, edit) => {
    namedInEditor(`preview-riverValley-96-${seed}.damgoodmaps`);
    settle();
    const g = gap(edit);
    expect(g, `${what}: the preview differs from the settle by ${g.toFixed(3)}`).toBeLessThan(TOL);
  }, 120000);
});

describe("a dead-end pool its river is turned away from drains in the preview as in the settle (#1173)", () => {
  it("on #780's plateau (sourceDeletedPit's): a trench a basin's river filled, the basin given an outlet to the gorge", () => {
    // (a plateau at 4, 40×24, a gorge at 2 on rows 9–11 fed by a 1.5 source at 1,10; a basin at 3 on 10–12 × 2–4 with a
    // 1.5 source of its own, which fills it and runs over the plateau into a trench at 2 on row 6, 20–28)
    const W = 40;
    const H = 24;
    const h = new Uint8Array(W * H).fill(4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gorge = y >= 9 && y <= 11;
        if (x < 6) h[y * W + x] = gorge ? 6 : 8;
        else if (x >= 7 && gorge) h[y * W + x] = 2;
      }
    for (let y = 2; y <= 4; y++) for (let x = 10; x <= 12; x++) h[y * W + x] = 3;
    for (let x = 20; x <= 28; x++) h[6 * W + x] = 2;
    const s = openHeights(W, H, h);
    expect(s.apply(sourceOp(1, 10, 1.5)).errors).toEqual([]);
    expect(s.apply(sourceOp(11, 3, 1.5)).errors).toEqual([]);
    s.settleCanonical();
    const far = 6 * W + 28;
    expect(s.built.water[far], "the basin's river fills the trench").toBeGreaterThan(1.9);
    // the outlet: a channel at 3 from the basin down to the gorge, so the basin's walk leaves the trench while the gorge's
    // still crosses it with half the flow; no source touched
    s.setPreviewWater(true);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: rect(11, 5, 11, 8), level: 3, exact: true } }).errors).toEqual([]);
    expect(s.waterPending).toBe(true);
    const live = s.built.water[far];
    s.settleCanonical();
    expect(s.built.water[far], "the settle drains it").toBe(0);
    expect(live, `the trench's far end in the preview once it stops: ${live.toFixed(3)} deep`).toBeLessThan(TOL);
  }, 120000);
});
