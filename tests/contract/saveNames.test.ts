// A saved map's file name is the map's name as the header shows it (D443, amended 2026-11-18): a generated map's own
// name until it is renamed, then the new one, kept as written; it survives editing, undo and a project file round
// trip. (Until 2026-11-18 a generated map was saved as dgm-<theme>-<seed> and a named one as dgm-<slug>, D345 B10; this
// file pinned that and is updated to the decision, D148.)

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { seedFromText } from "../../src/core/spec/codec";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("the name a map is saved under (D443)", () => {
  it("a generated map never renamed: its own generated name, as the header shows it", async () => {
    const spec = makeSpec({ seed: seedFromText("Big Beaver"), theme: "canyon", size: { x: 96, y: 96 } });
    const made = await runGenerate(spec, undefined, "Big Beaver");
    const open = ed.refine();
    const name = made.name;
    expect(name).not.toMatch(/^dgm-/);
    expect(made.timberName).toBe(`${name}.timber`);
    expect(open.info.timberName).toBe(`${name}.timber`);
    // (the core's own session says the same)
    const s = MapSession.fromGenerated(generate(spec));
    expect(s.exportTimberName()).toBe(`${s.meta.name}.timber`);
    // the same map after an edit and its undo is saved under the same name
    ed.applyAll([{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 1 } }], "Raise");
    expect(ed.sessionView().info.timberName).toBe(`${name}.timber`);
    // the project file keeps it, and is named by it too
    const project = ed.project();
    expect(project.fileName).toBe(`${name}.damgoodmaps.json`);
    ed.openProject(project.bytes);
    expect(ed.sessionView().info.timberName).toBe(`${name}.timber`);
  }, 120000);

  it("a renamed map: the new name, case and spaces kept, what a file can't hold replaced", async () => {
    await runGenerate(makeSpec({ seed: 12, theme: "riverValley", size: { x: 96, y: 96 } }));
    ed.refine();
    expect(ed.setName("Old Loop Lakelands").info.timberName).toBe("Old Loop Lakelands.timber");
    expect(ed.setName("Lakes: North/South").info.timberName).toBe("Lakes North South.timber");
    expect(ed.project().fileName).toBe("Lakes North South.damgoodmaps.json");
    // a name that leaves nothing to name a file by is refused, and the name before it stays
    const no = ed.setName("???");
    expect(no.result.ok).toBe(false);
    expect(no.info.timberName).toBe("Lakes North South.timber");
  }, 120000);

  it("an imported map and a real place are saved under their own name (D360 c)", async () => {
    await runGenerate(makeSpec({ seed: 12, theme: "riverValley", size: { x: 96, y: 96 } }));
    ed.refine();
    const saved = await ed.exportTimber(true);
    expect(saved.ok).toBe(true);
    for (const [file, saveAs] of [
      ["My Island.timber", "My Island.timber"],
      ["Drumheller (Alberta).timber", "Drumheller (Alberta).timber"],
      ["Ünïcode Map?.timber", "Ünïcode Map.timber"],
      ["dgm-river-valley-5.timber", "dgm-river-valley-5.timber"],
      ["???.timber", "Imported map.timber"],
    ]) {
      ed.openTimber(saved.bytes, file);
      expect(ed.sessionView().info.timberName, file).toBe(saveAs);
    }
  }, 120000);
});
