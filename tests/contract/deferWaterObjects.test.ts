// The editor edits in the "defer" water mode (live editing: the last settled water carried over to
// the new ground, the canonical settle adopted in the background). The map it then exports must be the
// one the same operations give anywhere else: replayed in a fresh session, reopened from the project
// file, rebuilt from a share link (D366: the same operations give the same bytes every time; PERFECT,
// water 1: what you see is what you get).
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import { map, sha } from "./gateHelpers";

// a ruin field the player adds, then a Raise stroke beside it
const OPS: EditOp[] = [{"op": "addFeature", "params": {"feature": {"id": "0e323938-c1f4-477c-846b-eacba5886802", "kind": "ruinField", "origin": "user", "locked": false, "params": {"area": [[36, 25, 32], [37, 25, 32], [38, 25, 32], [39, 25, 32], [40, 25, 32], [41, 25, 32], [42, 25, 32], [43, 25, 32], [44, 25, 32]], "scrapTarget": 500, "heightMix": [0.3, 0.2, 0.2, 0.1, 0.1, 0.05, 0.03, 0.02], "centerBias": 0.5}}}}, {"op": "brush", "params": {"tool": "raise", "size": 7.5, "strength": 4, "dabs": [87, 143, 93, 141, 94, 147, 95, 142, 101, 145, 98, 143, 103, 142, 104, 144, 99, 141, 98, 136, 101, 135, 105, 132, 105, 129, 99, 133, 104, 135, 102, 135, 102, 135, 103, 139]}}];

describe("an imported map edited in the editor's water mode", () => {
  it("exports the same file as the same operations replayed canonically (a ruin field, then a Raise stroke)", () => {
    // any .timber opened in the editor: here our own 64² map (seed 2), exported and opened again
    const bytes = map(2, 64).bytes;
    const editor = MapSession.importMap(bytes, "opened.timber");
    editor.setWaterMode("defer");
    for (const op of OPS) expect(editor.apply(op).errors).toEqual([]);
    // the background settle is adopted before the export (exportTimber settles canonically)
    const exported = editor.exportTimber().bytes;

    const replayed = MapSession.importMap(bytes, "opened.timber");
    for (const op of OPS) expect(replayed.apply(op).errors).toEqual([]);
    const ruins = (s: MapSession) => s.built.entities.filter((e) => e.template.startsWith("RuinColumn")).length;
    // (the release gate's bug hunt, D385: the editor's map kept two ruin columns placed against the
    // carried-over water, which its own full build and every replay left out)
    expect(ruins(editor)).toBe(ruins(replayed));
    expect(sha(exported)).toBe(sha(replayed.exportTimber().bytes));
  });
});
