// A map's name is stored data (D443): set by a core function, not an operation, never on the undo history.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject, documentFileName, encodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { YourMapsSaver } from "../../src/core/library/saver";
import type { YourMapEntry } from "../../src/core/library/yourMaps";
import { makeSpec } from "../../src/core/spec/mapspec";

const open = () => MapSession.fromGenerated(generate(makeSpec({ seed: 7, size: { x: 64, y: 64 } })));

describe("renaming a map (D443)", () => {
  it("sets the name, trimmed, and leaves the history alone", () => {
    const s = open();
    const before = [s.history().length, s.canUndo, s.document.edits.length];
    expect(s.setName("  Beaver Bend ")).toEqual({ ok: true, name: "Beaver Bend" });
    expect(s.meta.name).toBe("Beaver Bend");
    expect([s.history().length, s.canUndo, s.document.edits.length]).toEqual(before);
  });

  it("refuses an empty or blank name with a reason, and keeps the old one", () => {
    const s = open();
    const was = s.meta.name;
    for (const n of ["", "   ", "\t\n"]) expect(s.setName(n)).toEqual({ ok: false, reason: "A map needs a name" });
    expect(s.meta.name).toBe(was);
  });

  it("the project file carries the name and changes nothing else", () => {
    const s = open();
    const a = decodeProject(s.project());
    s.setName("Beaver Bend");
    const b = decodeProject(s.project());
    expect(b.meta.name).toBe("Beaver Bend");
    expect({ ...b, meta: { ...b.meta, name: a.meta.name } }).toEqual(a);
    expect(documentFileName(b)).toBe("dgm-beaver-bend.damgoodmaps.json");
  });

  it("the .timber file's name follows a rename; a generated map keeps its seed name until then", () => {
    const s = open();
    expect(s.exportTimberName()).toMatch(/^dgm-.*-7\.timber$/);
    s.setName("Beaver Bend");
    expect(s.exportTimberName()).toBe("dgm-beaver-bend.timber");
  });

  it("Your maps' entry takes the stored name on the next save", async () => {
    const s = open();
    s.setName("Beaver Bend");
    const put: YourMapEntry[] = [];
    const saver = new YourMapsSaver({ put: async (e) => (put.push(e), { ok: true }) }, { setTimer: () => 0, clearTimer: () => {} });
    const entry: YourMapEntry = { id: "a", name: "Old", kind: "generated", createdAt: "x", editedAt: "x", thumbnail: null, revision: 1, savedToTimberborn: null, bytes: 0 };
    saver.changed("a", () => ({ entry, project: s.project() }));
    await saver.flush();
    expect(put[0].name).toBe("Beaver Bend");
  });

  it("an old project without a stored name opens with the name it had", () => {
    const s = open();
    const was = s.meta.name;
    const raw = JSON.parse(strFromU8(gunzipSync(encodeProject(s.document))));
    delete raw.meta.name;
    expect(decodeProject(gzipSync(strToU8(JSON.stringify(raw)))).meta.name).toBe(was);
  });
});
