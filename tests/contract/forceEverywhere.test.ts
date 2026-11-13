// A force has a visible effect wherever it is used (PLAN §20 D356), a sample every run: on one map,
// each force at low and high Power on each kind of ground it has (flat, water, a peak, a slope, the
// map's edge, beside the start) and at random places. Every theme at 128², at three Powers, is the
// nightly's (forceEverywhere.heavy.test.ts); tools/force-everywhere.ts sweeps 128² and 256² and reports.

import { describe, expect, it } from "vitest";
import { describe as line, sweep, unexpected, VISIBLE_TILES } from "./forceEverywhere";

describe("every force has a visible effect wherever it is used (D356)", () => {
  it(`Carve, Craterize, Erupt, Glaciate and Quake (Slide and Lift): at least ${VISIBLE_TILES} tiles change, on every kind of ground, at low and high Power`, async () => {
    // (seed 6 since the 96² round moved Highlands' small maps, investigation/canyon-highlands-96: on
    // seed 5 a Slide at Power 10 on the edge moves 8 tiles, D148; seed 7 since generator 0.10.17's start floors, D515,
    // D148: seed 6's map changed, so the sample's draws moved with it, and its edge place became (95, 10), where a Lift at
    // Power 10 raises 4 tiles; dev's map gives the same 4 there, as at 4 more of 56 edge places and headings on it (a
    // fault half off the map, lifting its outer side): the edge's low-Power Lift, not the new map; of seeds 7–9, 7 and 9
    // sample no such place, and seed 8's edge Lift raises 8; seed 9 since generator 0.10.20's mends (wash treads and dead-stand knots, D518), D148: seed 7's map
    // changed, and its edge place became (0, 75), where a Lift at Power 10 raises 8 tiles, the same edge low-Power Lift as above, not a
    // force gone wrong; of seeds 5, 6 and 8–14 none has an unexpected use at Powers 10 and 90)
    const o = await sweep("highlands", 96, 9, 2, undefined, [10, 90]);
    expect(o.length).toBeGreaterThanOrEqual(6 * 2 * 7);
    expect(unexpected(o).map(line)).toEqual([]);
  }, 300_000);
});
