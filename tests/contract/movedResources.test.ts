// A generated forest, berry patch or ruin field keeps the objects the generation placed only while the
// player has not changed it; once changed (moved, its density changed) it is built as it now says
// (D368 (10), D404, D425). The map the session shows and exports must be the one its project file
// opens to (saving and reopening a map exactly as left), and the one the same operations give in a
// fresh session (D366).
import { describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import type { MapSession } from "../../src/core/doc/session";
import { moveEdit } from "../../src/core/doc/tools";
import { reopen, session, sha } from "./gateHelpers";

const W = 96;
const owned = (s: MapSession, id: string) => s.built.entities.filter((e) => e.owner === id).length;

describe("a generated resource feature the player changes", () => {
  it("a berry patch moved (as an older editor's Move recorded it): the session's map is the one its project reopens to", () => {
    const PATCH = "f-bpupopyw6djfc"; // a generated berry patch on seed 11, 96², 68 bushes that a Move leaves 54 (re-picked for each generator whose map lacks the earlier one, D148: 0.8.1, #265, and 0.8.3, D476, twice; 0.10.1, ruins placed with meaning; 0.10.6, D498; 0.10.7, D502, twice; 0.10.11, the D410 round; 0.10.13, whose starts frame the map, D507; 0.10.16's ground with grade, for f-7kqcsyotecayc; 0.10.17's start floors, D515, for f-ulehhemqvmsp2, gone from the map: each of seed 11's 9 berry patches moved still reopens to the same file; 0.10.20's contour edges, D518, for f-zhwp5hwkvn22y, gone from the map, and the first of the map's 6 berry patches, f-f5l4btd52usjc, has its Move refused: of the other 5 each moved still reopens to the same file, and f-tmq7t2k5yveiq is the first; since the D518 mends (wash treads and dead-stand knots), D148, f-tmq7t2k5yveiq is gone from the map: each of the 8 berry patches now on seed 11 moved still reopens to the same file, and f-lkipwevbydium, the third, is the largest that a Move changes; since generator 0.10.21's look round, D518, D148: f-lkipwevbydium is gone from the map: each of the 12 berry patches now on seed 11 moved still reopens to the same file, and f-bpupopyw6djfc is the largest that a Move changes)
    const s = session(11, W);
    // the Move's plan on the session, applied as one step
    const m = moveEdit(s, PATCH, 2, 1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(s.applyAll(m.ops, "user", m.label).ok).toBe(true);
    const again = reopen(s);
    // (before #194 the session showed 18 bushes and the reopened project 23)
    expect(owned(s, PATCH)).toBe(owned(again, PATCH));
    expect(sha(s.exportTimber().bytes)).toBe(sha(again.exportTimber().bytes));
  });

  it("a forest's density changed after another edit shows at once, as with no earlier edit and in the reopened project", () => {
    const FOREST = "f-inn3kdzrdplem"; // a generated forest on seed 11, 96², 53 trees that density 0.36 leaves 17 (re-picked for each generator whose map lacks the earlier one, D148: 0.8.1, #265, and 0.8.3, D476, twice; 0.10.1, ruins placed with meaning; 0.10.2, D493; 0.10.6, D498; 0.10.7, D502, twice; 0.10.11, the D410 round; 0.10.13, whose starts frame the map, D507; 0.10.16's ground with grade, for f-3yfjfe2bgarbk; 0.10.17's start floors, D515, for f-ch3sw3soo3vje, gone from the map: each of seed 11's 23 forests agrees in all three; 0.10.20's contour edges, D518, for f-36czjeg653h2u, gone from the map: each of the 25 forests now on seed 11 agrees in all three, and f-23tjmhqoalhzw is the first; since the D518 mends (wash treads and dead-stand knots), D148, f-23tjmhqoalhzw is gone from the map: each of the 44 forests now on seed 11 agrees in all three, and f-27crwuohveu2i is the one with the most trees; since generator 0.10.21's look round, D518, D148: f-27crwuohveu2i is gone from the map: each of the 23 forests now on seed 11 agrees in all three, and f-inn3kdzrdplem is the one with the most trees)
    const first: EditOp = { op: "sculpt", params: { mode: "raise", cells: [[1, 86, 89], [2, 86, 89]], amount: 1 } };
    const density: EditOp = { op: "updateFeature", params: { id: FOREST, patch: { params: { density: 0.36 } } } };
    const alone = session(11, W);
    expect(alone.apply(density).ok).toBe(true);
    const s = session(11, W);
    expect(s.apply(first).ok).toBe(true);
    expect(s.apply(density).ok).toBe(true);
    // (before #194 the session kept all 15 generated oaks, the change ignored, while the session
    // without the earlier edit and the reopened project built 6)
    expect(owned(s, FOREST)).toBe(owned(alone, FOREST));
    expect(owned(s, FOREST)).toBe(owned(reopen(s), FOREST));
  });
});
