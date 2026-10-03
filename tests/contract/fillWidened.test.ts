// Release gate (D385), the water: a Fill whose hollow an edit later widens.
//
// D413 stores a sealed basin that is only evaporating as the pre-fill started it (a Fill at exactly
// its level), "the game evaporates them from there" (PLAN §10). EDITOR_PLAN's water preview: "A stored
// lake keeps its water only while its hollow holds it", and the file is what the game plays (PERFECT,
// Water 1). When an edit after the Fill lowers ground beside it below its level, the Fill's water
// runs into the new ground in the settle, but the canonical settle then puts every tile of the sealed
// basin back to its pre-fill start: the Fill's tiles brim at the old level and the new ground beside
// them is dry again. The file holds water standing a level above a dry tile beside it, which the game
// moves at once; the editor's live water showed it flowing in, the canonical water shows it dry.

import { describe, expect, it } from "vitest";
import { planFill } from "../../src/core/doc/waterEdits";
import { PreviewJob } from "../../src/core/sim/preview";
import { gameRun, openHeights, rect, tilesOf } from "./gateWater";

const W = 48;
const H = 48;

/** Level ground at 8 with an 8×8 pit at 6 (x, y 20–27), filled to level 8, then a 3×3 patch beside it
 *  (x 28–30, y 22–24) lowered one level to 7: below the Fill's surface and joined to it. */
function widened(mode: "canonical" | "defer") {
  const h = new Uint8Array(W * H).fill(8);
  for (const i of tilesOf(W, 20, 20, 27, 27)) h[i] = 6;
  const s = openHeights(W, H, h);
  s.setWaterMode(mode);
  const plan = planFill(s, 23, 23, 8);
  expect(plan.reason).toBeNull();
  expect(s.apply(plan.op!).errors).toEqual([]);
  s.settleCanonical();
  expect(s.built.water[23 * W + 23]).toBe(2);
  const from = s.lastSettled()!;
  expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: rect(28, 22, 30, 24), amount: 1 } }).errors).toEqual([]);
  expect(s.built.heights[23 * W + 29]).toBe(7);
  return { s, from };
}

describe("a Fill whose hollow an edit widens below its level (D413, D385; PERFECT Water 1)", () => {
  it("the stored water is what the game keeps: the widened ground holds the Fill's water, and the game moves nothing but by evaporation", () => {
    const { s } = widened("canonical");
    s.exportTimber();
    const b = s.built;
    const strip = tilesOf(W, 28, 22, 30, 24);
    // the game's rules from the stored water, for a fifth of a day: water only evaporates
    const g = gameRun(s, 150);
    let rose = 0;
    for (let i = 0; i < W * H; i++) if (g.D[i] > b.water[i] + 0.01) rose++;
    expect(
      rose,
      `tiles the game fills within 150 ticks of loading the file (the widened patch stored ${strip.map((i) => b.water[i].toFixed(2)).join(" ")}, the game gives it ${g.D[23 * W + 29].toFixed(2)})`,
    ).toBe(0);
    // and the patch below the Fill's surface holds its water, as the Fill's hollow now includes it
    for (const i of strip) expect(b.water[i], `tile ${i}`).toBeGreaterThan(0.5);
  });

  it("the editor's live water once it stops is the canonical settle's (EDITOR_PLAN, Water changes only through its causes)", () => {
    const { s, from } = widened("defer");
    const job = new PreviewJob(from, s.built.waterModel);
    let r = job.advance(Infinity);
    while (!r) r = job.advance(Infinity);
    s.settleCanonical();
    const canon = s.built.water;
    const i = 23 * W + 29;
    expect(r.depth[i]).toBeGreaterThan(0.5);
    expect(Math.abs(r.depth[i] - canon[i]), `the widened patch: live ${r.depth[i].toFixed(3)}, canonical ${canon[i].toFixed(3)}`).toBeLessThan(0.1);
  });
});
