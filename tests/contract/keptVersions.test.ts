// Kept versions (showcase: fearless iteration): a map kept or branched at a step of its History reopens exactly as it
// stood at that step, byte for byte (D455), with its History through that step (D456), on the same land (D336), and
// the map it was taken from is left as it was. Nothing new is stored: a version is an ordinary project file whose
// meta says where it came from (src/core/library/keptVersions.ts).
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { compareProblem, nameTip, parentFull, parentLine, parentStep, splitVersionName, versionName } from "../../src/core/library/keptVersions";
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
    expect(decodeProject(v.bytes).meta.parent).toEqual(v.parent);
    expect(parentLine(v.parent)).toBe(`${s.meta.name} · step 2`);
    expect(parentFull(v.parent)).toBe(`From ${s.meta.name}, step 2`);
    expect(parentFull({ ...v.parent, name: "A".repeat(90) }).length).toBeLessThanOrEqual(60);
    // (the line's step is its own piece, so the tile can keep it whole when the name gives way)
    expect(parentStep(v.parent)).toBe(" · step 2");
    expect(splitVersionName(v.name)).toEqual({ head: s.meta.name, tail: "— Make a source stronger" });
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

describe("a version of a map the editor is working on", () => {
  it("uses a build the session kept, with no rebuild; a step with none comes without its stored map for the page to build elsewhere", () => {
    const s = edited();
    const near = s.versionProject(0, {}, 6, { rebuild: false })!;
    expect(near.stored).toBe(true);
    expect(near.built).not.toBeNull();
    expect(timber(MapSession.open(decodeProject(near.bytes)))).toBe(standingAt(s, 0));
    // (a session that has only just opened has the build of where it stands, none of the steps before it)
    const t = MapSession.open(decodeProject(s.project()));
    expect(t.checkReplay()).toBe(true);
    const far = t.versionProject(0, {}, 6, { rebuild: false })!;
    expect(far.stored).toBe(false);
    expect(far.built).toBeNull();
    // (built elsewhere, as the page does: a full build of that project is the map as it stood)
    expect(timber(MapSession.open(decodeProject(far.bytes), { rebuild: true }))).toBe(standingAt(s, 0));
    expect(decodeProject(far.bytes).meta.parent?.steps).toBe(1);
  });

  it("a map opened from its stored map gives an earlier step once its replay is compared, as the save point of none", () => {
    const s = edited();
    const t = MapSession.open(decodeProject(s.project()));
    expect(t.replayPending).toBe(true);
    const v = t.versionProject(0)!;
    expect(t.replayPending).toBe(false);
    expect(timber(MapSession.open(decodeProject(v.bytes)))).toBe(standingAt(s, 0));
    expect(v.parent.steps).toBe(1);
  });
});

describe("a version in Your maps", () => {
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

describe("a kept version's name in a tile that cannot hold it (the tile keeps the step, the tooltip the whole)", () => {
  it("splits at the last em dash, and not a name that has none", () => {
    expect(splitVersionName("The Very Long Winding River Valley B — The generated map")).toEqual({ head: "The Very Long Winding River Valley B", tail: "— The generated map" });
    expect(splitVersionName("A — B — C")).toEqual({ head: "A — B", tail: "— C" });
    expect(splitVersionName("River Valley")).toBeNull();
    expect(splitVersionName(" — nothing before it")).toBeNull();
    expect(splitVersionName("a map — ")).toBeNull();
  });

  it("gives a tooltip of at most 60 characters that keeps the step", () => {
    const short = "River Valley — Raise a tile";
    expect(nameTip(short)).toBe(short);
    const long = versionName("A".repeat(70), "Raise a wall");
    const tipped = nameTip(long);
    expect(tipped.length).toBeLessThanOrEqual(60);
    expect(tipped.endsWith("— Raise a wall")).toBe(true);
    expect(tipped).toContain("…");
    expect(nameTip("B".repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

