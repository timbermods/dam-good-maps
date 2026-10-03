// The water status the bar shows is the worker's real state (PLAN §20 D345, B14; D342): every update the
// worker answers with says whether the map's water is settled, so that the page's readout never waits for
// a journey that will not come. After an undo, a redo or an edit, the readout matches the worker's settled
// state ("Water settled" once it is, flowing only while a settle is running). Before the fix the page began a
// journey on every update and an undo back to already-settled water left it at "Water flowing… 0%" for good.

import { describe, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

async function fresh() {
  await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: W, y: W } }));
  ed.refine();
}

/** An edit that moves the ground beside water, so that the water has to settle again. */
const edit = () => ed.apply({ op: "sculpt", params: { mode: "lower", cells: [[40, 30, 46], [41, 30, 46], [42, 30, 46]], amount: 1 } });

describe("the water status after undo, redo and an edit (D345, B14)", () => {
  it("every update says whether the water is settled, and it is the worker's own state", async () => {
    await fresh();
    // an edit: the water has to settle again, so it is not settled yet
    const e = edit();
    expect(e.ok).toBe(true);
    expect(e.waterSettled, "an edit that moves the ground leaves the water to settle").toBe(!ed.waterSettling());
    expect(e.waterSettled).toBe(false);
    // once it has settled the worker says so, on the next update too
    ed.settleWater();
    expect(ed.waterSettling()).toBe(false);
    // undo back to the water that was settled: nothing is left to flow, and the update says so
    const u = ed.undo();
    expect(u.ok).toBe(true);
    expect(u.waterSettled, "an undo to settled water is settled").toBe(!ed.waterSettling());
    expect(u.waterSettled).toBe(true);
    // redo: the edit's ground again; the update matches the worker whichever it is
    const r = ed.redo();
    expect(r.ok).toBe(true);
    expect(r.waterSettled).toBe(!ed.waterSettling());
    ed.settleWater();
    const again = ed.undo();
    expect(again.waterSettled).toBe(!ed.waterSettling());
    expect(again.waterSettled).toBe(true);
  }, 120000);

  it("the background check ends the journey: its answer says the water is settled, with or without water in it", async () => {
    await fresh();
    const e = edit();
    expect(e.waterSettled).toBe(false);
    // the check settles the canonical water and puts it in place: no settle is running for the map any more
    const r = await ed.backgroundCheck();
    expect(r).not.toBeNull();
    expect(ed.waterSettling()).toBe(false);
    expect(r!.waterSettled, "the check's answer says the water is settled").toBe(true);
    // asked again with nothing to settle: it still says so (the page's journey may have begun without water frames)
    const again = await ed.backgroundCheck();
    expect(again!.waterSettled).toBe(true);
  }, 120000);

  it("an edit that leaves the water as it is is settled at once", async () => {
    await fresh();
    // a tree planted on dry ground: no water moves
    const spot = (() => {
      const v = ed.sessionView().view;
      for (let y = 10; y < W - 10; y++)
        for (let x = 10; x < W - 10; x++) {
          if (ed.footprintCheck({ tool: "entity", template: "SmallRelic", x, y, orientation: "Cw0" }).problem) continue;
          let dry = true;
          for (let k = 0; k < v.water.count; k++) if (Math.abs(v.water.tile[k] % W - x) < 8 && Math.abs(Math.floor(v.water.tile[k] / W) - y) < 8) dry = false;
          if (dry) return [x, y] as [number, number];
        }
      throw new Error("no dry spot");
    })();
    const p = ed.applyTool({ tool: "entity", template: "SmallRelic", x: spot[0], y: spot[1], orientation: "Cw0" }, crypto.randomUUID());
    expect(p.ok).toBe(true);
    expect(p.waterSettled).toBe(!ed.waterSettling());
  }, 120000);
});
