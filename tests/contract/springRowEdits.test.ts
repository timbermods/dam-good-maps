// A generated spring's row of sources stands as it was generated through edits (PLAN §20 D368 (10),
// D404, D425: no edit adds an object). The nightly sweep's River Valley 96² seed 5: a Lower stroke
// beside the head of `river/spring/2` left its row's second source a level off its anchor, so the
// row was placed again with one source; the Erupt after it levelled the ground and the row's second
// source came back, an object the edit added. The row is placed on the ground as generated, so it
// keeps its sources whatever the edits do to the ground under them.

import { describe, expect, it } from "vitest";
import { sequences, sweepSequences } from "./editSequences";

describe("a generated spring's row keeps its sources through edits (D447 follow-up, D425)", () => {
  it("River Valley 96² seed 5: Lower at (53, 59), then Erupt at (51, 56), adds no source", async () => {
    // (the sweep's first three sequences: the third is the case, the first two draw its settings)
    const failures = await sweepSequences("riverValley", 96, 5, sequences(6, 96, 5).slice(0, 3));
    expect(failures).toEqual([]);
  }, 600_000);
});
