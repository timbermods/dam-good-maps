// A step of several operations (a source made badwater, a stroke that clears sources, a force with
// its objects, a moved feature) is one undo step (EDITOR_PLAN "Forgiveness": every stroke or
// placement is one instant undo step; PERFECT, the editor 2: "one undo fixes it"). Saving and
// reopening the map, as Your maps and the autosave's recovery do, must keep it one step.
import { describe, expect, it } from "vitest";
import { guid, reopen, session, timber } from "./gateHelpers";

describe("a step of several operations after the project is reopened", () => {
  it("one undo after reopening takes back the whole step (a source replaced by a stronger one), as it did before saving", () => {
    const s = session();
    const before = timber(s);
    const src = s.built.entities.find((e) => e.template === "WaterSource")!;
    // as the page's source rows do (useRows "Make a source badwater"): the source deleted and another
    // placed in its spot, one step
    const r = s.applyAll(
      [
        { op: "deleteEntities", params: { entities: [src.id] } },
        { op: "placeEntity", params: { id: guid(), template: "WaterSource", x: src.x, y: src.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } },
      ],
      "user",
      "Make a source stronger",
    );
    expect(r.ok, r.errors.join("; ")).toBe(true);
    expect(s.history().length).toBe(1);

    const again = reopen(s);
    // one undo returns the map as it was before the step (before D456 it took back only the placing:
    // the map was left with no source there, a map the player never had)
    again.undo();
    expect(timber(again)).toBe(before);
    expect(again.canUndo).toBe(false);
    // and the history showed one step, as it did before saving
    expect(reopen(s).history().map((h) => h.label)).toEqual(s.history().map((h) => h.label));
  });
});
