// Release gate (D385), forces: a force is bound only by nature and refuses only for the map's physical
// limits, in plain words (D257; Glaciate: only "At the map floor: no ground left to carve"); a refusal is
// one plain line (D342 (1)); nothing is scary (PERFECT, "The forces"). Glaciate names its springs from
// its seed, its point and a serial (`glacier_source_id`, rust/forces). It skipped only the ids standing
// on the map at its end (the release gate's bug hunt, D385): a glacier used again where an earlier one
// stood sweeps that one's springs away and took their ids again, which the document still holds from
// the earlier operation, so the glacier played to its end and was dropped with "an entity with the Id
// … already exists". It now skips every id the document has used (`MapSession.usedEntityIds`).

import { describe, expect, it } from "vitest";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("Glaciate used again in the same valley is kept every time (D257)", () => {
  it("Highlands 64², seed 3: Glaciate (Power 60) clicked at (32, 33) three times, the editor's way: each is kept", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const kept: string[] = [];
    for (let k = 0; k < 3; k++) {
      expect(ed.forceStart({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 60 }, origin: [32, 33], cut: null, natural: true }).errors).toEqual([]);
      for (let j = 0; j < 4000 && !(ed.forceAdvance(32)?.done ?? true); j++);
      const r = ed.forceStop();
      kept.push(r.kept ? "kept" : `refused: ${r.errors.join("; ")}`);
    }
    expect(kept).toEqual(["kept", "kept", "kept"]);
  });
});
