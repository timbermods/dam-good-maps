// A project saved with one generator version opens with a newer one "exactly as it was saved" (D336 (2);
// PLAN §19.7): the stored base, with the player's edits. M9b moves GENERATOR_VERSION from 0.7.0 to 0.8.0,
// so every project saved today (Your maps, the autosave) opens this way after the next release. Here the
// version change is made the only way the session sees it: the project's generatorVersion.
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject } from "../../../src/core/doc/document";
import { MapSession } from "../../../src/core/doc/session";
import { deleteEdit, moveEdit } from "../../../src/core/doc/tools";
import { session } from "./helpers";

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
    // today the start is back where the generator put it (the move is orphaned: "the map keeps what
    // generator 0.6.9 made as it was saved"), while the objects cleared for it stay gone
    expect(at(opened)).toEqual(at(s));
    expect(opened.orphans()).toEqual([]);
    expect(content(opened)).toEqual(content(s));
  });

  it("keeps a generated river the player deleted deleted", () => {
    const s = session(1, 64);
    const river = s.features.find((f) => f.origin === "generated" && f.kind === "river" && deleteEdit(s, f.id).ok)!;
    const d = deleteEdit(s, river.id);
    if (!d.ok) throw new Error("no river to delete");
    expect(s.applyAll(d.ops, "user", d.label).ok).toBe(true);
    const opened = underNewerGenerator(s);
    // today its source comes back
    expect(content(opened)).toEqual(content(s));
  });
});
