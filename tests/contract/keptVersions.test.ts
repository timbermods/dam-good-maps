// Kept versions (showcase: fearless iteration): a map kept or branched at a step of its History reopens exactly as it
// stood at that step, byte for byte (D455), with its History through that step (D456), on the same land (D336), and
// the map it was taken from is left as it was. Nothing new is stored: a version is an ordinary project file whose
// meta says where it came from (src/core/library/keptVersions.ts).
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { compareProblem, parentFull, parentLine, projectParent, versionName, withParent } from "../../src/core/library/keptVersions";
import type { YourMapEntry } from "../../src/core/library/yourMaps";
import { guid, reopen, session, timber } from "./gateHelpers";

/** Three steps: a raise stroke, a source made stronger (two operations, one step), a lower stroke. */
function edited(): MapSession {
  const s = session(3, 64);
  const stroke = (x: number, y: number, tool: "raise" | "lower", label: string) =>
    expect(s.apply({ op: "brush", params: { tool, size: 5, strength: 10, dabs: [x * 4, y * 4, (x + 4) * 4, y * 4] } }, "user", label).ok).toBe(true);
  stroke(20, 20, "raise", "Raise, 12 tiles");
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
  stroke(40, 40, "lower", "Lower, 12 tiles");
  s.settleCanonical();
  return s;
}

const depth = (s: MapSession) => s.history().filter((h) => h.applied).length - 1;

/** The map `s` shows with its history stood at step `k`; the session is put back where it was. */
function standingAt(s: MapSession, k: number): string {
  const at = depth(s);
  while (depth(s) > k) s.undo();
  while (depth(s) < k) s.redo();
  s.settleCanonical();
  const hash = timber(s);
  while (depth(s) > at) s.undo();
  while (depth(s) < at) s.redo();
  s.settleCanonical();
  return hash;
}

describe("a version of a map at a step of its History", () => {
  const s = edited();
  const labels = s.history().map((h) => h.label);

  it("reopens byte for byte as the map stood at that step, with its History through that step, at every step", () => {
    expect(labels).toEqual(["Raise, 12 tiles", "Make a source stronger", "Lower, 12 tiles"]);
    for (let k = -1; k < labels.length; k++) {
      const v = s.versionProject(k, { id: "parent-id" })!;
      expect(v, `step ${k}`).not.toBeNull();
      // (the project opens from its stored map, and its replay agrees with it: undo goes all the way back, D455)
      const opened = MapSession.open(decodeProject(v.bytes));
      expect(opened.checkReplay(), `replay at ${k}`).toBe(true);
      // the same map as the original showed at that step, and as a rebuild from the log gives
      expect(timber(opened), `map at ${k}`).toBe(standingAt(s, k));
      expect(timber(MapSession.open(decodeProject(v.bytes), { rebuild: true })), `rebuilt at ${k}`).toBe(timber(opened));
      // History through that step, the multi-operation step still one step (D456)
      expect(opened.history().map((h) => h.label)).toEqual(labels.slice(0, k + 1));
      expect(opened.canRedo).toBe(false);
      // and the steps come back out in order on undo
      for (let n = k; n >= 0; n--) expect(opened.undo()).toBe(true);
      expect(opened.canUndo).toBe(false);
      expect(timber(opened)).toBe(standingAt(s, -1));
    }
  });

  it("is named for the map and the step, and remembers where it came from", () => {
    const v = s.versionProject(1, { id: "parent-id" })!;
    expect(v.name).toBe(`${s.meta.name} — Make a source stronger`);
    expect(v.parent).toEqual({ id: "parent-id", name: s.meta.name, label: "Make a source stronger", steps: 2 });
    expect(decodeProject(v.bytes).meta.name).toBe(v.name);
    expect(projectParent(v.bytes)).toEqual(v.parent);
    expect(parentLine(v.parent)).toBe(`${s.meta.name} · step 2`);
    expect(parentFull(v.parent)).toBe(`From ${s.meta.name}, step 2`);
    expect(parentFull({ ...v.parent, name: "A".repeat(90) }).length).toBeLessThanOrEqual(60);
    const begin = s.versionProject(-1)!;
    expect(begin.name).toBe(`${s.meta.name} — The generated map`);
    expect(begin.parent.steps).toBe(0);
    expect(begin.parent.id).toBeUndefined();
    // it is on the same land: the generation is the original's
    const a = decodeProject(s.project());
    const b = decodeProject(v.bytes);
    expect(b.spec).toEqual(a.spec);
    expect(b.generatorVersion).toBe(a.generatorVersion);
    expect(b.base).toEqual(a.base);
  });

  it("leaves the map it was taken from as it was, and takes a step that was undone", () => {
    const before = timber(s);
    const history = JSON.stringify(s.history());
    s.versionProject(0);
    s.versionProject(-1);
    expect(timber(s)).toBe(before);
    expect(JSON.stringify(s.history())).toBe(history);
    // a step undone since is still in History to branch from
    const t = reopen(s);
    t.undo();
    expect(t.history().findIndex((h) => !h.applied)).toBe(2);
    const v = t.versionProject(2)!;
    expect(timber(MapSession.open(decodeProject(v.bytes)))).toBe(before);
    // and the map it was taken from is still where the undo left it
    expect(depth(t)).toBe(1);
    expect(t.versionProject(3)).toBeNull();
    expect(t.versionProject(-2)).toBeNull();
  });

  it("is a map of its own: branching from it again names the chain, and its edits do not touch the original", () => {
    const before = timber(s);
    const branch = MapSession.open(decodeProject(s.versionProject(1)!.bytes));
    branch.checkReplay();
    expect(branch.apply({ op: "brush", params: { tool: "raise", size: 5, strength: 10, dabs: [200, 200, 220, 200] } }, "user", "Raise, 4 tiles").ok).toBe(true);
    const again = branch.versionProject(2)!;
    expect(again.name).toBe(`${s.meta.name} — Make a source stronger — Raise, 4 tiles`);
    expect(again.parent.name).toBe(branch.meta.name);
    expect(timber(s)).toBe(before);
  });
});

describe("a version in Your maps", () => {
  const entry: YourMapEntry = { id: "x", name: "x", kind: "generated", createdAt: "", editedAt: "", thumbnail: null, revision: 1, savedToTimberborn: null, bytes: 0 };

  it("shows its parent, and a map with none shows nothing", () => {
    const s = edited();
    const v = s.versionProject(0, { id: "p" })!;
    expect(withParent(entry, v.bytes).parent).toEqual(v.parent);
    expect(withParent(entry, s.project()).parent).toBeUndefined();
    // (a map that stops being a version loses the line)
    expect(withParent({ ...entry, parent: v.parent }, s.project()).parent).toBeUndefined();
    const same = withParent(entry, v.bytes);
    expect(withParent(same, v.bytes)).toBe(same);
  });

  it("names keep to what a name holds, and two maps compare only at the same size", () => {
    const long = versionName("A".repeat(90), "Raise, 12 tiles");
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith(" — Raise, 12 tiles")).toBe(true);
    expect(versionName("Dam", "Smooth")).toBe("Dam — Smooth");
    expect(compareProblem({ w: 64, h: 64 }, { w: 64, h: 64 })).toBeNull();
    expect(compareProblem({ w: 64, h: 64 }, { w: 96, h: 96 })).toBe("Maps of different sizes can't be compared (64×64 and 96×96)");
    expect(compareProblem({ w: 64, h: 64 }, undefined)).toBe("That map's size is unknown");
  });
});
