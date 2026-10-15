// Saving, reopening and saving again gives the same project file, byte for byte (D455), and a step of
// several operations (a placement stroke, a group of edits) stays one undo step after a reopen (D456).
// The log keeps its keys in one order whether an entry was just applied or read back from a file.
import { describe, expect, it } from "vitest";
import { decodeProject, type MapDocument } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { applyPaintObjects } from "../../src/core/doc/paint";
import { MapSession } from "../../src/core/doc/session";
import { carveForceParams, forceMapOf } from "../../src/core/forces/carve/result";
import { CarveRun, DEFAULTS } from "../../src/core/forces/carve/run";
import { guid, reopen, session, sha, timber } from "./gateHelpers";

const stroke = (dabs: number[], tool: "raise" | "lower" = "raise"): EditOp => ({ op: "brush", params: { tool, size: 3, strength: 10, target: 12, dabs } }) as EditOp;

function carve(s: MapSession, origin: [number, number]): EditOp {
  const m = forceMapOf(s.built);
  const r = new CarveRun(m, DEFAULTS, { origin: origin[1] * m.W + origin[0] }, { sourceId: guid() });
  for (let k = 0; k < 600 && !r.done; k++) r.step();
  return { op: "forceResult", params: carveForceParams(m, r, { settings: DEFAULTS, origin, cut: null })! };
}

const treeArea = (): [number, number, number][] => {
  const area: [number, number, number][] = [];
  for (let y = 5; y < 15; y++) area.push([y, 5, 15]);
  return area;
};

/** A session with brush strokes, a force, a group of edits, a placement stroke, and undo and redo in its log. */
function worked(): MapSession {
  const s = session();
  expect(s.apply(stroke([20 * 4 + 2, 21 * 4 + 2, 22 * 4 + 2, 21 * 4 + 2])).errors).toEqual([]);
  expect(s.apply(stroke([40 * 4 + 2, 41 * 4 + 2, 42 * 4 + 2, 41 * 4 + 2], "lower")).errors).toEqual([]);
  expect(s.apply(carve(s, [12, 50]), "user", "Carve").errors).toEqual([]);
  // a group of feature edits: log entries that carry undo data and a step mark
  const forest = s.document.features.find((f) => f.kind === "forest")!;
  const h = s.applyAll(
    [
      { op: "updateFeature", params: { id: forest.id, patch: { params: { density: 0.1 } } } },
      { op: "updateFeature", params: { id: forest.id, patch: { params: { density: 0.2 } } } },
    ],
    "user",
    "Thin the forest",
  );
  expect(h.errors).toEqual([]);
  const src = s.built.entities.find((e) => e.template === "WaterSource")!;
  const g = s.applyAll(
    [
      { op: "deleteEntities", params: { entities: [src.id] } },
      { op: "placeEntity", params: { id: guid(), template: "WaterSource", x: src.x, y: src.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } },
    ],
    "user",
    "Make a source stronger",
  );
  expect(g.errors).toEqual([]);
  const p = applyPaintObjects(s, { kind: "trees", template: "Pine", area: treeArea(), density: 1, seed: 7 }, "user");
  expect(p.errors).toEqual([]);
  expect(p.applied.length).toBeGreaterThan(1);
  // undo and redo, and an undone step replaced by another
  expect(s.undo()).toBe(true);
  expect(s.redo()).toBe(true);
  expect(s.undo()).toBe(true);
  expect(s.apply(stroke([10 * 4 + 2, 55 * 4 + 2])).errors).toEqual([]);
  return s;
}

describe("a project reopens byte for byte", () => {
  it("saving, reopening and saving again gives the same file, every time", () => {
    const s = worked();
    const a = s.project();
    expect(decodeProject(a).edits.some((e) => e.undo && e.step !== undefined)).toBe(true);
    const b = reopen(s).project();
    expect(sha(b)).toBe(sha(a));
    const again = MapSession.open(decodeProject(b));
    expect(sha(again.project())).toBe(sha(a));
    expect(timber(again)).toBe(timber(s));
  });

  it("and when the log is replayed to open it (no stored map), and after an undo and redo of a step", () => {
    const s = worked();
    const a = s.project();
    const { stored, ...doc } = decodeProject(a);
    expect(stored).toBeDefined();
    const replayed = MapSession.open(doc as MapDocument, { rebuild: true });
    expect(JSON.stringify(decodeProject(replayed.project()).edits)).toBe(JSON.stringify(decodeProject(a).edits));
    expect(replayed.history().map((h) => h.label)).toEqual(s.history().map((h) => h.label));
    // a step taken back and given again is as it was
    const before = sha(s.project());
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(sha(s.project())).toBe(before);
  });

  it("a placement stroke is one undo step before and after a reopen", () => {
    const s = session();
    const before = timber(s);
    const p = applyPaintObjects(s, { kind: "trees", template: "Pine", area: treeArea(), density: 1, seed: 7 }, "user");
    expect(p.errors).toEqual([]);
    expect(p.applied.length).toBeGreaterThan(1);
    expect(s.history().length).toBe(1);
    const again = reopen(s);
    expect(again.history().map((h) => h.label)).toEqual(s.history().map((h) => h.label));
    expect(again.history().length).toBe(1);
    again.undo();
    expect(timber(again)).toBe(before);
    expect(again.canUndo).toBe(false);
  });
});
