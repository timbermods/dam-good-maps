// Release gate (D385), the water: a pit's only source deleted on ground another river's pre-fill walk
// crosses keeps its pool in the editor's water.
//
// EDITOR_PLAN, "Water changes only through its causes" (D260): after a source is removed, "the tiles
// whose water lost its feed on the new ground take the canonical start in the warm start, so their
// water drains away as part of the edit's own journey", and "the preview's water once it stops matches
// the canonical settle's"; "No water from nowhere" (D385): the warm start keeps the pre-fill's water
// only where a running source, a stored lake or the kept water reaches it. When the pit stands on
// flat ground another river's pre-fill walk crosses, the canonical start fills the pit at its spill
// level, and the walk's thin water over the flat (or the removed source's own overflow sheet, kept as
// "water from before") joins it to the river, so the pool counts as fed and keeps its water. The live
// water settles with the pool full ("Water settled"); the canonical settle (the background check, the
// export) has it dry, so the pool vanishes seconds after the edit, with nothing more done.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { openHeights, rect, sourceOp } from "./gateWater";

/** Dig, place a source in the pit, settle; delete the source in preview mode: the preview's stopped
 *  water and then the canonical settle's, on the pit's middle tile. */
function deleteTheSource(s: MapSession, x: number, y: number, strength: number) {
  const W = s.size.x;
  const P = y * W + x;
  s.setPreviewWater(true);
  expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: rect(x - 1, y - 1, x + 1, y + 1), amount: 2 } }).errors).toEqual([]);
  s.settleCanonical();
  expect(s.built.water[P], "the dug pit is dry (D385)").toBe(0);
  const src = sourceOp(x, y, strength);
  expect(s.apply(src).errors).toEqual([]);
  s.settleCanonical();
  expect(s.built.water[P], "the source fills its pit").toBeGreaterThan(1.9);
  expect(s.apply({ op: "deleteEntities", params: { entities: [src.params.id] } }).errors).toEqual([]);
  expect(s.waterPending).toBe(true);
  const live = s.built.water[P];
  s.settleCanonical();
  return { live, canonical: s.built.water[P] };
}

describe("a pit whose only source is deleted, on flat ground a river's pre-fill walk crosses (D260, D385)", () => {
  it("M9b's River Valley 96² seed 34, the dry plateau at (41, 11), a 0.25 source (the shelf's smallest): the editor's water once it stops is the canonical settle's, the pit dry", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync("tests/fixtures/m9b-river-valley-96-34.timber")), "m9b-river-valley-96-34.timber");
    const r = deleteTheSource(s, 41, 11, 0.25);
    expect(r.canonical).toBe(0);
    expect(r.live, `the pit's pool in the editor's water once it stops: ${r.live.toFixed(3)} deep (canonical ${r.canonical})`).toBeLessThan(0.01);
  });

  it("a synthetic dry plateau (tests/contract/waterFromNowhere.test.ts's), a 0.5 source: the same", () => {
    const W = 40;
    const H = 24;
    const h = new Uint8Array(W * H).fill(4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const gorge = y >= 9 && y <= 11;
        if (x < 6) h[y * W + x] = gorge ? 6 : 8;
        else if (x >= 7 && gorge) h[y * W + x] = 2;
      }
    const s = openHeights(W, H, h);
    expect(s.apply(sourceOp(1, 10, 1.5)).errors).toEqual([]);
    const r = deleteTheSource(s, 25, 4, 0.5);
    expect(r.canonical).toBe(0);
    expect(r.live, `the pit's pool in the editor's water once it stops: ${r.live.toFixed(3)} deep (canonical ${r.canonical})`).toBeLessThan(0.01);
  });
});
