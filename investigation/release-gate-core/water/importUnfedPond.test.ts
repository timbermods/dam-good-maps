// Release gate (D385), the water: an imported map's own unfed water and the first edit.
//
// An imported .timber can hold standing water no source feeds (a pond whose source the map's maker
// removed: the game's editor keeps the water). EDITOR_PLAN's water preview: "The preview's water once
// it stops matches the canonical settle's, except under roofs", and water "changes only through its
// causes" (D260). On the import's first edit, far from the pond, the live water (warm-started from the
// file's water) keeps the pond, while the canonical settle (the quiet dot's background check, every
// export) takes it away: the pond vanishes a moment after a stroke that never came near it. Which of
// the two is right is a decision (D260 keeps it, D385/D420 "no map keeps water nothing feeds" drop
// it); they must not disagree.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../../src/core/doc/session";
import { planFill } from "../../../src/core/doc/waterEdits";
import { openHeights, rect, sourceOp, tilesOf } from "./synthetic";

const W = 48;
const H = 48;

/** A .timber with a river along a channel (y 5–6, a source at its west end) and an 8×8 pond at
 *  level 8 in a pit (x, y 20–27) that no source feeds. */
function pondFile(): Uint8Array {
  const h = new Uint8Array(W * H).fill(8);
  for (const i of tilesOf(W, 20, 20, 27, 27)) h[i] = 6;
  for (const i of tilesOf(W, 0, 5, W - 1, 6)) h[i] = 6;
  const s = openHeights(W, H, h);
  expect(s.apply(sourceOp(10, 5, 1)).errors).toEqual([]);
  expect(s.apply(planFill(s, 23, 23, 8).op!).errors).toEqual([]);
  return s.exportTimber().bytes;
}

describe("an imported map's unfed pond after an edit elsewhere (EDITOR_PLAN water preview; D260, D385)", () => {
  it("the editor's water once it stops is the canonical settle's: the pond is either kept by both or gone from both", () => {
    const s = MapSession.importMap(pondFile(), "pond.timber");
    const pond = 23 * W + 23;
    expect(s.waterNow().depth[pond]).toBe(2);
    s.setPreviewWater(true);
    // a one-level bump in the far corner, 13 tiles from the pond
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: rect(40, 40, 41, 41), amount: 1 } }).errors).toEqual([]);
    expect(s.waterPending).toBe(true);
    const live = s.built.water[pond];
    s.settleCanonical();
    const canonical = s.built.water[pond];
    expect(Math.abs(live - canonical), `the pond: live water ${live.toFixed(3)} deep, canonical ${canonical.toFixed(3)}`).toBeLessThan(0.1);
  });
});
