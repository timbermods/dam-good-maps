// Release gate (D385), Select's actions (D259, D264; EDITOR_PLAN "Select": "Select's actions are exact,
// with hard edges ... each action is one undo step with a clear label"). They are `sculpt` operations
// (src/editor/selection/useSelect.tsx builds them: raise and lower by `amount`, Set, Cut down and Fill
// up as `flatten` to a `level`). Without the operation's `exact` flag, the build's integrity pass
// (step 7: "remove single-tile pits and spikes") took back what they did to a lone tile (the release
// gate's bug hunt, D385): a one-tile selection raised, lowered, cut down or filled up was an undo step
// that changed nothing. The worker's applySelection now makes Select's sculpts exact.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
const open = () => MapSession.open(decodeProject(ed.project().bytes));

describe("Select's actions on a one-tile selection change that tile (D259, D264)", () => {
  // ((15, 8) on M9b's map, D148: dev's (18, 3) is not a lone level tile there; (44, 10) since the 96²
  // round's flow moved the map, investigation/canyon-highlands-96)
  it("Highlands 64², seed 3: the dry level tile (44, 10), at level 7, selected alone: Raise, Lower, Cut down to 4 and Fill up to 10 each leave it where they said", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const t = 10 * W + 44;
    const b = open().built;
    expect(b.heights[t]).toBe(7);
    expect(b.water[t]).toBe(0);
    // (level ground round it, nothing standing there)
    for (const j of [t - 1, t + 1, t - W, t + W]) expect(b.heights[j]).toBe(7);
    expect(b.entities.filter((e) => e.y * W + e.x === t)).toEqual([]);

    const cells = tilesToRuns([t], W);
    const actions: [string, EditOp, number][] = [
      ["Raise 1 tiles by 1", { op: "sculpt", params: { mode: "raise", cells, amount: 1 } }, 8],
      ["Lower 1 tiles by 1", { op: "sculpt", params: { mode: "lower", cells, amount: 1 } }, 6],
      ["Cut 1 tiles down to level 4", { op: "sculpt", params: { mode: "flatten", cells, level: 4 } }, 4],
      ["Fill 1 tiles up to level 10", { op: "sculpt", params: { mode: "flatten", cells, level: 10 } }, 10],
    ];
    const got: string[] = [];
    for (const [label, op, want] of actions) {
      expect(ed.applySelection([op], label, [t]).errors).toEqual([]);
      got.push(`${label}: ${open().built.heights[t]} (want ${want})`);
      ed.undo();
    }
    expect(got).toEqual(actions.map(([label, , want]) => `${label}: ${want} (want ${want})`));
  });
});
