// No sequence of edits adds an object (PLAN §20 D368 (10), D404): a handful of sequences of two or
// three brushes and forces on one generated map, every run. The wide sweep (every theme, several seeds,
// 96² and 128²) is nightly: editSequences.heavy.test.ts. The sweep itself: editSequences.ts.

import { describe, expect, it } from "vitest";
import { sequences, sweepSequences } from "./editSequences";

describe("no sequence of edits adds an object (D368 (10), D404)", () => {
  it("Highlands 96², seed 3: four sequences of brushes and forces add nothing", async () => {
    // (before the fix, two of these four added trees, bushes and slopes back where an earlier edit's
    // water had taken them)
    expect(await sweepSequences("highlands", 96, 3, sequences(4, 96, 3))).toEqual([]);
  }, 300000);
});
