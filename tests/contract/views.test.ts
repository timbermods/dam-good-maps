// Camera bookmarks (PLAN §20 D205): kept with the project, never an edit; an older project without
// them opens as before.

import { describe, expect, it } from "vitest";
import { decodeProject, type SavedView } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("camera bookmarks", () => {
  it("go into the project and come back, with no undo step and no change to the map", () => {
    const r = generate(makeSpec({ seed: 5, size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    expect(s.views).toEqual([]);
    const bytes = s.exportTimber().bytes;
    const v: SavedView = { slot: 3, mode: "orbit", yaw: 0.5, pitch: 0.8, distance: 40, target: [20, 6, -30] };
    s.setViews([v]);
    expect(s.canUndo).toBe(false);
    expect(s.views).toEqual([v]);
    // the map's file never changes
    expect(Array.from(s.exportTimber().bytes)).toEqual(Array.from(bytes));
    const again = MapSession.open(decodeProject(s.project()));
    expect(again.views).toEqual([v]);
    // cleared: the field goes
    s.setViews([]);
    expect(MapSession.open(decodeProject(s.project())).views).toEqual([]);
    // an older project, saved before bookmarks: it opens with none
    const doc = decodeProject(s.project());
    delete (doc.meta as { views?: unknown }).views;
    expect(MapSession.open(doc).views).toEqual([]);
  });
});
