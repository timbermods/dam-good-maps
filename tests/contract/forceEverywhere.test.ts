// A force has a visible effect wherever it is used (PLAN §20 D356), a sample every run: on one map,
// each force at low and high Power on each kind of ground it has (flat, water, a peak, a slope, the
// map's edge, beside the start) and at random places. Every theme at 128², at three Powers, is the
// nightly's (forceEverywhere.heavy.test.ts); tools/force-everywhere.ts sweeps 128² and 256² and reports.

import { describe, expect, it } from "vitest";
import { describe as line, sweep, unexpected, VISIBLE_TILES } from "./forceEverywhere";

describe("every force has a visible effect wherever it is used (D356)", () => {
  it(`Carve, Craterize, Erupt, Glaciate and Quake (Slide and Lift): at least ${VISIBLE_TILES} tiles change, on every kind of ground, at low and high Power`, async () => {
    const o = await sweep("highlands", 96, 5, 2, undefined, [10, 90]);
    expect(o.length).toBeGreaterThanOrEqual(6 * 2 * 7);
    expect(unexpected(o).map(line)).toEqual([]);
  }, 300_000);
});
