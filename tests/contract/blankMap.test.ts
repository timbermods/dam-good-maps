// A new blank map (File → New blank map…, core/doc/blank.ts): flat, dry ground and a start. It holds two absolutes: the
// file it exports passes every load check, and its project reopens byte for byte after edits (D455).

import { describe, expect, it } from "vitest";
import { blankProblem } from "../../src/core/doc/blank";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { failing } from "../../src/core/validate/report";

describe("a new blank map", () => {
  it("is flat, dry ground with the start at its middle, and fails no check but the playability ones an empty map can't meet", () => {
    const s = MapSession.blank(96, 4);
    expect(s.size).toEqual({ x: 96, y: 96 });
    expect([...new Set(s.built.heights)]).toEqual([4]);
    expect(s.built.entities.map((e) => [e.template, e.x, e.y, e.z])).toEqual([["StartingLocation", 47, 47, 4]]);
    const failed = s.validate().report.checks.filter(failing);
    expect(failed.every((c) => c.class === "playability")).toBe(true);
    expect(failed.map((c) => c.id).sort()).toEqual(["resources.badwater_source", "start.farmland", "start.food", "start.water", "start.wood", "start.wood_floor"]);
    // (the exported file reads back as a map of that size)
    expect(readTimber(s.exportTimber().bytes).world.sizeX).toBe(96);
  });
  it("saves a project that reopens byte for byte after an edit", () => {
    const s = MapSession.blank(96, 6);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[20, 20, 30], [21, 20, 30]], level: 2 } }).ok).toBe(true);
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    const again = MapSession.open(decodeProject(project));
    expect(again.project()).toEqual(project);
    expect(again.exportTimber().bytes).toEqual(s.exportTimber().bytes);
  });
  it("refuses a size or a level it isn't offered in, with one line", () => {
    expect(blankProblem(100, 4)).toBe("a blank map's size must be one of 96, 128, 192, 256, not 100");
    expect(blankProblem(96, 0)).toBe("a blank map's ground level must be a whole number from 1 to 16, not 0");
    expect(() => MapSession.blank(96, 17)).toThrow("ground level must be a whole number from 1 to 16");
  });
});
