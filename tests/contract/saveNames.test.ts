// A saved map's file name comes from the map itself (PLAN §20 D345, B10): its theme and seed, the seed
// as typed when it is a word; it survives editing, undo and a project file round trip.

import { describe, expect, it } from "vitest";
import { seedFromText } from "../../src/core/spec/codec";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("the name a map is saved under (D345, B10)", () => {
  it("dgm-<theme>-<seed>.timber, with a word seed made file-safe", async () => {
    const spec = makeSpec({ seed: seedFromText("Big Beaver"), theme: "canyon", size: { x: 96, y: 96 } });
    await runGenerate(spec, undefined, "Big Beaver");
    const open = ed.refine();
    expect(open.info.timberName).toBe("dgm-canyon-big-beaver.timber");
    // the same map after an edit and its undo is saved under the same name
    ed.setEditorWaterMode("defer");
    ed.applyAll([{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 1 } }], "Raise");
    expect(ed.sessionView().info.timberName).toBe("dgm-canyon-big-beaver.timber");
    // the project file keeps the word
    const project = ed.project();
    ed.openProject(project.bytes);
    expect(ed.sessionView().info.timberName).toBe("dgm-canyon-big-beaver.timber");
  }, 120000);

  it("a number seed is named by its number", async () => {
    await runGenerate(makeSpec({ seed: 12, theme: "riverValley", size: { x: 96, y: 96 } }));
    expect(ed.refine().info.timberName).toBe("dgm-river-valley-12.timber");
  }, 120000);
});
