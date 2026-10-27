// Startup part 1 (PLAN §20 D367, D455; ROADMAP "Startup: maps open fast"): a saved project carries
// the map as it was saved, and opens from it without rebuilding. On reopen the log is replayed once
// and compared with the stored map, byte for byte: the same, and undo below the save point works
// as normal; different (the code changed since the save), and undo stops at the save point, so the
// map as saved is the earliest state, never an approximate replay. A project without a stored map
// (an older file, or one saved while its water was still pending) opens by rebuilding, as before.
import { deflateSync, inflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, type MapDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { fromBase64, toBase64 } from "../../src/core/format/base64";
import { tilesToRuns } from "../../src/core/math/grid";
import * as ed from "../../src/worker/session";
import { guid, map, session, sha, timber } from "./gateHelpers";

const W = 64;
const box = (x0: number, y0: number, x1: number, y1: number) => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return tilesToRuns(t, W);
};

/** A session with a few edits: a raised box, a stronger spring (one step of two operations, D456)
 *  and a lowered box; the exports after each step. */
function edited(): { s: MapSession; exports: string[] } {
  const s = session();
  const exports = [timber(s)];
  expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: box(4, 4, 9, 8), amount: 2 } }).ok).toBe(true);
  exports.push(timber(s));
  const src = s.built.entities.find((e) => e.template === "WaterSource")!;
  const r = s.applyAll(
    [
      { op: "deleteEntities", params: { entities: [src.id] } },
      { op: "placeEntity", params: { id: guid(), template: "WaterSource", x: src.x, y: src.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } },
    ],
    "user",
    "Make a source stronger",
  );
  expect(r.ok, r.errors.join("; ")).toBe(true);
  exports.push(timber(s));
  expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: box(40, 40, 46, 45), amount: 1 } }).ok).toBe(true);
  exports.push(timber(s));
  return { s, exports };
}

/** The saved project without its stored map: an older file, which opens by rebuilding. */
function withoutStored(bytes: Uint8Array): Uint8Array {
  const { stored, ...doc } = decodeProject(bytes);
  expect(stored).toBeDefined();
  return encodeProject(doc as MapDocument);
}

/** The saved project with its stored map's ground changed on one tile: a map the log does not
 *  give (as a save whose code has changed since would be). */
function tampered(bytes: Uint8Array): { bytes: Uint8Array; heights: Uint8Array } {
  const doc = decodeProject(bytes);
  const st = doc.stored!;
  // the stored map's heights are the first blob of 64² bytes (one byte wide: as they are), deflated
  const blobs = [...st.blobs];
  const raw = blobs.map((b) => inflateSync(fromBase64(b)));
  const k = raw.findIndex((b) => b.length === W * W);
  const heights = raw[k];
  heights[W * 20 + 20] = heights[W * 20 + 20] > 8 ? heights[W * 20 + 20] - 1 : heights[W * 20 + 20] + 1;
  blobs[k] = toBase64(deflateSync(heights));
  return { bytes: encodeProject({ ...doc, stored: { ...st, blobs } }), heights };
}

describe("a cacheless editor open defers water only", () => {
  it("the canonical map and project match the synchronous open, and an intervening edit is kept", () => {
    const { s } = edited();
    const bytes = withoutStored(s.project(6));
    const exact = MapSession.open(decodeProject(bytes));
    const quick = MapSession.open(decodeProject(bytes), { deferWater: true });
    expect(quick.waterPending).toBe(true);
    expect(decodeProject(quick.project(6)).stored).toBeUndefined();
    expect(quick.features).toEqual(exact.features);
    expect(quick.history()).toEqual(exact.history());
    quick.settleCanonical();
    expect(timber(quick)).toBe(timber(exact));
    expect(sha(quick.project(6))).toBe(sha(exact.project(6)));
    const mid = MapSession.open(decodeProject(bytes), { deferWater: true });
    mid.setWaterMode("defer");
    const op = { op: "sculpt" as const, params: { mode: "raise" as const, cells: box(24, 24, 27, 27), amount: 1 } };
    expect(mid.apply(op).ok).toBe(true);
    expect(exact.apply(op).ok).toBe(true);
    mid.settleCanonical();
    expect(timber(mid)).toBe(timber(exact));
    expect(mid.undo()).toBe(true);
    expect(timber(mid)).toBe(timber(quick));
  });

  it("a stored map still opens exactly and keeps D455's comparison", () => {
    const { s } = edited();
    const { bytes, heights } = tampered(s.project());
    const quick = MapSession.open(decodeProject(bytes), { deferWater: true });
    expect(quick.openedFromStored).toBe(true);
    expect(quick.built.heights).toEqual(heights);
    expect(quick.undo()).toBe(false);
    expect(quick.canUndo).toBe(false);
  });
});

describe("a saved project opens from its stored map (D367)", () => {
  it("the reopened project's map equals what was saved, byte for byte, with its stored map (no rebuild) and without it (rebuilt)", () => {
    const { s, exports } = edited();
    const bytes = s.project();
    expect(decodeProject(bytes).stored?.edits).toBe(4);

    const fast = MapSession.open(decodeProject(bytes));
    expect(fast.openedFromStored).toBe(true);
    expect(timber(fast)).toBe(exports[3]);
    expect(fast.features).toEqual(s.features);
    expect(fast.editCount).toBe(4);

    const slow = MapSession.open(decodeProject(withoutStored(bytes)));
    expect(slow.openedFromStored).toBe(false);
    expect(timber(slow)).toBe(exports[3]);

    // the autosave's faster gzip level opens the same way
    expect(timber(MapSession.open(decodeProject(s.project(6))))).toBe(exports[3]);
  });

  it("undo below the save point: the replay compared once (by the checks, or by the first undo that crosses the save point), then as normal when it matches; at once without a stored map", () => {
    const { s, exports } = edited();
    const bytes = s.project();

    const fast = MapSession.open(decodeProject(bytes));
    // the log's replay is still to be compared: the history is all there, and the first undo that
    // crosses the save point does the comparison itself when the checks have not yet
    expect(fast.replayPending).toBe(true);
    expect(fast.canUndo).toBe(true);
    expect(fast.history().map((h) => h.label)).toEqual(["Raise terrain", "Make a source stronger", "Lower terrain"]);
    expect(fast.undoStopped).toBeNull();
    expect(fast.undo()).toBe(true);
    expect(fast.replayPending).toBe(false);
    expect(timber(fast)).toBe(exports[2]);
    for (let k = 1; k >= 0; k--) {
      expect(fast.undo()).toBe(true);
      expect(timber(fast)).toBe(exports[k]);
    }
    expect(fast.canUndo).toBe(false);
    expect(fast.redo()).toBe(true);
    expect(timber(fast)).toBe(exports[1]);

    // the checks' comparison first (the page's checks worker), then undo as normal
    const checked = MapSession.open(decodeProject(bytes));
    expect(checked.checkReplay()).toBe(true);
    expect(checked.replayPending).toBe(false);
    expect(checked.history().length).toBe(3);
    for (let k = 2; k >= 0; k--) {
      expect(checked.undo()).toBe(true);
      expect(timber(checked)).toBe(exports[k]);
    }

    const slow = MapSession.open(decodeProject(withoutStored(bytes)));
    expect(slow.replayPending).toBe(false);
    expect(slow.canUndo).toBe(true);
    for (let k = 2; k >= 0; k--) {
      expect(slow.undo()).toBe(true);
      expect(timber(slow)).toBe(exports[k]);
    }
  });

  it("when the replay differs from the stored map, the map as saved is the earliest state: undo stops at the save point, and later edits undo back to it exactly", () => {
    const { s } = edited();
    const { bytes, heights } = tampered(s.project());

    const fast = MapSession.open(decodeProject(bytes));
    expect(fast.openedFromStored).toBe(true);
    // what opens is the stored map, as saved, not a replay
    expect(fast.built.heights).toEqual(heights);
    const saved = timber(fast);
    // the first undo does the comparison: the replay differs, so it is refused, with the reason
    expect(fast.canUndo).toBe(true);
    expect(fast.undo()).toBe(false);
    expect(fast.replayPending).toBe(false);
    expect(fast.undoStopped).toContain("cannot be undone");
    expect(timber(fast)).toBe(saved);
    expect(fast.canUndo).toBe(false);
    expect(fast.history()).toEqual([]);
    expect(fast.notices.some((n) => n.includes("cannot be undone"))).toBe(true);
    expect(fast.editCount).toBe(4);
    // (and the checks' comparison says the same)
    const checked = MapSession.open(decodeProject(bytes));
    expect(checked.checkReplay()).toBe(false);
    expect(checked.canUndo).toBe(false);

    // a new edit on it undoes back to the map as saved, byte for byte, and no further
    expect(fast.apply({ op: "sculpt", params: { mode: "raise", cells: box(30, 30, 33, 33), amount: 1 } }).ok).toBe(true);
    expect(fast.history().map((h) => h.label)).toEqual(["Raise terrain"]);
    expect(timber(fast)).not.toBe(saved);
    expect(fast.undo()).toBe(true);
    expect(timber(fast)).toBe(saved);
    expect(fast.canUndo).toBe(false);
    expect(fast.undo()).toBe(false);
    // and it saves again with the map it shows
    expect(timber(MapSession.open(decodeProject(fast.project())))).toBe(saved);
  });

  it("an edit on the reopened map builds on from the stored map and undoes to it exactly; the replay of a late-grown log compares at the save point", () => {
    const { s, exports } = edited();
    const bytes = s.project();
    const fast = MapSession.open(decodeProject(bytes));
    expect(fast.apply({ op: "sculpt", params: { mode: "raise", cells: box(30, 30, 33, 33), amount: 1 } }).ok).toBe(true);
    s.apply({ op: "sculpt", params: { mode: "raise", cells: box(30, 30, 33, 33), amount: 1 } });
    // the same edit on the map built the slow way gives the same map
    expect(timber(fast)).toBe(timber(s));
    // the comparison looks at the log as saved, though it has grown since
    expect(fast.checkReplay()).toBe(true);
    expect(fast.undo()).toBe(true);
    expect(timber(fast)).toBe(exports[3]);
    expect(fast.undo()).toBe(true);
    expect(timber(fast)).toBe(exports[2]);
  });

  it("the stored map is left out while the water is the preview's (the project opens by rebuilding), and a file from another version rebuilds", () => {
    const s = session();
    s.setPreviewWater(true);
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: box(4, 4, 9, 8), amount: 2 } }).ok).toBe(true);
    expect(s.waterPending).toBe(true);
    expect(decodeProject(s.project()).stored).toBeUndefined();
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(reopened.openedFromStored).toBe(false);
    s.settleCanonical();
    expect(timber(reopened)).toBe(timber(s));
    expect(decodeProject(s.project()).stored).toBeDefined();

    const doc = decodeProject(s.project());
    const other = { ...doc, stored: { ...doc.stored!, version: "0.0.1" } };
    const old = MapSession.open(other);
    expect(old.openedFromStored).toBe(false);
    expect(timber(old)).toBe(timber(s));
    expect(old.canUndo).toBe(true);
  });

  it("a freshly generated map's project carries its map, and reopens as generated", () => {
    const r = map();
    const bytes = MapSession.fromGenerated(r).project();
    const s = MapSession.open(decodeProject(bytes));
    expect(s.openedFromStored).toBe(true);
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    expect(s.checkReplay()).toBe(true);
  });
});

describe("the editor's worker (D455's comparison runs where the checks run)", () => {
  it("the checks worker's replica, which opens by rebuilding, answers whether the replay gives the stored map; without one, the first background check replays, then undo works", async () => {
    const { s, exports } = edited();
    const bytes = s.project();
    const doc = decodeProject(bytes);
    // the replica's side: the document with its stored map, opened by rebuilding
    const same = ed.follow({ version: 1, doc, keep: 0, add: [] });
    expect(same.stored).toBe("same");
    expect(same.instant).not.toBeNull();
    const differs = ed.follow({ version: 2, doc: decodeProject(tampered(bytes).bytes), keep: 0, add: [] });
    expect(differs.stored).toBe("differs");
    // a document without a stored map has nothing to compare
    expect(ed.follow({ version: 3, doc: decodeProject(withoutStored(bytes)), keep: 0, add: [] }).stored).toBeUndefined();

    // the editor's side, with no checks worker: the first background check does the comparison
    const open = ed.openProject(bytes);
    expect(open.info.canUndo).toBe(true);
    expect(open.info.history.map((h) => h.label)).toEqual(["Raise terrain", "Make a source stronger", "Lower terrain"]);
    const bg = await ed.backgroundCheck();
    expect(bg).not.toBeNull();
    expect(bg!.info.canUndo).toBe(true);
    expect(ed.undo().ok).toBe(true);
    expect(sha((await ed.exportTimber(true)).bytes)).toBe(exports[2]);
    ed.closeSession();

    // a stored map the replay does not give: the undo that crosses the save point is refused, with its reason
    ed.openProject(tampered(bytes).bytes);
    const refused = ed.undo();
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toContain("cannot be undone");
    expect(refused.info.canUndo).toBe(false);
    ed.closeSession();
  });
});
