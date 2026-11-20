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
    // (named by the map's name as written, D443 amended 2026-11-18; it was dgm-beaver-bend before, D148)
    expect(documentFileName(b)).toBe("Beaver Bend.damgoodmaps.json");
  });

  it("the .timber file's name is the map's name: its generated one, then the one it is renamed to", () => {
    const s = open();
    expect(s.exportTimberName()).toBe(`${s.meta.name}.timber`);
    s.setName("Beaver Bend");
    expect(s.exportTimberName()).toBe("Beaver Bend.timber");
  });

  it("refuses a name that leaves nothing to name its files by, and keeps the old one", () => {
    const s = open();
    const was = s.meta.name;
    for (const n of ["???", " ... ", "<|>"]) expect(s.setName(n).ok, n).toBe(false);
    expect(s.meta.name).toBe(was);
  });

  it("Your maps' entry takes the stored name on the next save, given beside the project (never unzipped from it)", async () => {
    const s = open();
    s.setName("Beaver Bend");
    const put: YourMapEntry[] = [];
    const saver = new YourMapsSaver({ put: async (e) => (put.push(e), { ok: true }) }, { setTimer: () => 0, clearTimer: () => {} });
    const entry: YourMapEntry = { id: "a", name: "Old", kind: "generated", createdAt: "x", editedAt: "x", thumbnail: null, revision: 1, savedToTimberborn: null, bytes: 0, size: { w: 64, h: 64 } };
    // (the name the worker's project() hands back with the bytes: the session's stored one, the same the file carries)
    const project = s.project();
    expect(decodeProject(project).meta.name).toBe(s.meta.name);
    saver.changed("a", () => ({ entry, project, name: s.meta.name }));
    await saver.flush();
    expect(put[0].name).toBe("Beaver Bend");
    // a blank or missing name keeps the entry's
    saver.changed("a", () => ({ entry, project }));
    await saver.flush();
    expect(put[1].name).toBe("Old");
  });

  it("an old project without a stored name opens with the name it had", () => {
    const s = open();
    const was = s.meta.name;
    const raw = JSON.parse(strFromU8(gunzipSync(encodeProject(s.document))));
    delete raw.meta.name;
    expect(decodeProject(gzipSync(strToU8(JSON.stringify(raw)))).meta.name).toBe(was);
  });

  it("a hand-made project whose name makes no file name opens with the name it had, as an empty one does", () => {
    const s = open();
    const was = s.meta.name;
    const raw = JSON.parse(strFromU8(gunzipSync(encodeProject(s.document))));
    // (what is left of each is nothing a file can be called, D443: the same rule Rename and Save as apply)
    for (const bad of ["???", " ... ", "<|>", ".timber", "‮‬‏", 7, null]) {
      raw.meta.name = bad;
      expect(decodeProject(gzipSync(strToU8(JSON.stringify(raw)))).meta.name, String(bad)).toBe(was);
    }
  });

  it("a name the app could have written comes through a project unchanged, byte for byte (D455)", () => {
    const s = open();
    // (every name here passes `setName`, so the app can save it; the stored name is the trimmed one)
    for (const name of ["Old Loop Lakelands", "Drumheller (Alberta)", "Émile's dam", "ビーバーの谷", "CON", "Lake.timber.", "A‮B", "Lakes: North/South", "x".repeat(300), " Padded "]) {
      expect(s.setName(name).ok, name).toBe(true);
      const bytes = s.project(9);
      const opened = decodeProject(bytes);
      expect(opened.meta.name).toBe(s.meta.name);
      expect(Buffer.compare(Buffer.from(encodeProject(opened)), Buffer.from(bytes)), name).toBe(0);
    }
  });
});
