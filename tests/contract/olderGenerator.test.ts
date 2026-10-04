// A project saved with one generator version opens with a newer one "exactly as it was saved" (D336 (2);
// PLAN §19.7): the stored base, with the player's edits. M9b moves GENERATOR_VERSION from 0.7.0 to 0.8.0,
// so every project saved before it (Your maps, the autosave) opens this way after the next release. Here the
// version change is made the only way the session sees it: the project's generatorVersion.
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { dependentsOf } from "../../src/core/doc/ops";
import { moveEdit } from "../../src/core/doc/tools";
import { session } from "./gateHelpers";

/** The project as a newer generator opens it. */
function underNewerGenerator(s: MapSession): MapSession {
  const doc = decodeProject(s.project());
  doc.generatorVersion = "0.6.9";
  return MapSession.open(decodeProject(encodeProject(doc)));
}
/** The exported map as the game would read it: heights and every object's place. */
function content(s: MapSession): { heights: number[]; objects: string[] } {
  const again = MapSession.importMap(s.exportTimber().bytes, "saved.timber");
  return { heights: Array.from(again.built.heights), objects: again.built.entities.map((e) => `${e.template} ${e.x},${e.y},${e.z} ${e.orientation}`).sort() };
}

describe("a project opened by a newer generator", () => {
  it("keeps the start where the player moved it", () => {
    const s = session(1, 64);
    const start = s.features.find((f) => f.kind === "start")!;
    // the page's Move on the start (worker moveFeature → moveEdit), one step
    const m = moveEdit(s, start.id, 3, 0);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(s.applyAll(m.ops, "user", m.label).ok).toBe(true);
    const at = (t: MapSession) => t.built.entities.filter((e) => e.template === "StartingLocation").map((e) => `${e.x},${e.y}`);
    const opened = underNewerGenerator(s);
    // (the release gate's bug hunt, D385: the start went back where the generator put it, the move
    // orphaned, while the objects cleared for it stayed gone)
    expect(at(opened)).toEqual(at(s));
    expect(opened.orphans()).toEqual([]);
    expect(content(opened)).toEqual(content(s));
  });

  it("keeps a generated river the player deleted deleted", () => {
    const s = session(1, 64);
    const river = s.features.find((f) => f.origin === "generated" && f.kind === "river" && !dependentsOf(s.features, f.id).length);
    if (!river) throw new Error("no river to delete");
    expect(s.apply({ op: "deleteFeature", params: { id: river.id } }, "user", "Delete river").ok).toBe(true);
    const opened = underNewerGenerator(s);
    // (its source came back)
    expect(content(opened)).toEqual(content(s));
  });
});
