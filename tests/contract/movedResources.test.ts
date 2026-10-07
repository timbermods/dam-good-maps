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
    const PATCH = "f-6mchtl6r53jc6"; // a generated berry patch on seed 11, 96² (re-picked for each generator whose map lacks the earlier one, D148: 0.8.1, #265, and 0.8.3, D476, twice)
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
    const FOREST = "f-lgrjgixe37lue"; // a generated oak grove on seed 11, 96², 37 oaks (re-picked for each generator whose map lacks the earlier one, D148: 0.8.1, #265, and 0.8.3, D476, twice)
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
