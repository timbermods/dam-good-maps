// A force's sources at the map's edge flow into the map (PLAN §20 D321, item 27): the check finds a
// placed source whose water has a way straight off the map beside or behind it; Carve's source row
// runs it on every kept river. The fix is M9b's edge lip, plugged in at `EDGE_LIP` once it reaches dev
// (pending): until then the check reports and changes nothing.

import { describe, expect, it } from "vitest";
import { DEFAULTS, CarveRun } from "../../src/core/forces/carve/run";
import type { ForceMap } from "../../src/core/forces/force";
import { EDGE_LIP, edgeLeaks, keepSourcesOnMap } from "../../src/core/water/edgeSources";

const W = 48;

/** Level ground at 8: its edge no higher than a source's ground. */
const ground = (): Uint8Array => new Uint8Array(W * W).fill(8);

describe("a force's sources at the map's edge (D321, item 27)", () => {
  it("finds a source whose water can leave by the edge beside it; one inside the map, or behind a higher edge, is fine", () => {
    const flat = ground();
    expect(edgeLeaks({ W, H: W, heights: flat }, [{ x: 1, y: 20 }])).toHaveLength(1);
    expect(edgeLeaks({ W, H: W, heights: flat }, [{ x: 10, y: 20 }])).toHaveLength(0);
    const lipped = flat.slice();
    for (let y = 0; y < W; y++) lipped[y * W] = 9;
    expect(edgeLeaks({ W, H: W, heights: lipped }, [{ x: 1, y: 20 }])).toHaveLength(0);
  });

  it("Carve's source row runs the check: a river started at the edge reports its leak, one inside none; the hook changes nothing until the lip lands", () => {
    const run = (x: number) => {
      const m: ForceMap = { W, H: W, heights: ground(), entities: [], water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) }, maxHeight: 22 };
      const r = new CarveRun(m, { ...DEFAULTS, power: 40, width: 4 }, { origin: 24 * W + x });
      while (!r.done) r.step();
      return r;
    };
    expect(run(1).edgeLeaks.length).toBeGreaterThan(0);
    expect(run(24).edgeLeaks).toEqual([]);
    expect(EDGE_LIP).toBeNull();
    const h = ground();
    const kept = keepSourcesOnMap({ W, H: W, heights: h }, [{ x: 0, y: 20 }]);
    expect(kept.changed).toEqual([]);
    expect(kept.leaks).toHaveLength(1);
  });
});
