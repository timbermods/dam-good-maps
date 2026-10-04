// The editor's worker side (EDITOR_PLAN §8) in Node: the page's journey through it. Generate,
// refine, edit, go back to the settings, generate a new map: the edited map is untouched and one
// step away, and its edits are never applied to the new one (PLAN §20, D336); updates carry only what changed; the export check follows the export profile, and
// an unedited map exports exactly as it came.

import { describe, expect, it } from "vitest";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const box = (x0: number, y0: number, x1: number, y1: number) => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return tilesToRuns(t, W);
};

describe("the editor's document in the worker", () => {
  it("generate → refine → edit → back to settings → Generate: a new map, and the edited one untouched (D336)", async () => {
    const spec = makeSpec({ seed: 77, size: { x: W, y: W } });
    const gen = await runGenerate(spec);
    expect(gen.passed).toBe(true);
    const open = ed.refine();
    expect(open.info.kind).toBe("generated");
    expect(open.view.heights.length).toBe(W * W);
    expect(open.view.entities.count).toBeGreaterThan(100);
    expect(open.view.water.count).toBeGreaterThan(0);

    // a user forest (a new feature) and a plateau
    const forest = { id: "0b8e9a64-1111-4c2d-9e1f-2a3b4c5d6e7f", kind: "forest" as const, origin: "user" as const, locked: false, params: { area: box(4, 80, 12, 88), density: 1, speciesMix: { Oak: 1 }, life: "auto" as const, youngShare: 0 } };
    const u1 = ed.apply({ op: "addFeature", params: { feature: forest } });
    expect(u1.errors).toEqual([]);
    expect(u1.view.entities).toBeDefined(); // new trees
    expect(u1.info.edits).toBe(1);
    const plateau = { id: "0b8e9a64-2222-4c2d-9e1f-2a3b4c5d6e7f", kind: "landform" as const, origin: "user" as const, locked: false, params: { kind: "plateau" as const, edgeStyle: "cliff" as const, outline: [[79.5, 79.5], [88.5, 79.5], [88.5, 88.5], [79.5, 88.5]] as [number, number][], height: 14 } };
    const u2 = ed.apply({ op: "addFeature", params: { feature: plateau } });
    expect(u2.errors).toEqual([]);
    expect(u2.view.heights).toBeDefined();
    expect(u2.view.terrainRect).toMatchObject({ x0: 80, y0: 80, x1: 88, y1: 88 });

    // back to settings: the card shows the edited map
    const card = await ed.settingsResponse();
    expect(ed.sessionInfo().edits).toBe(2);
    expect(card.features.some((f) => f.id === forest.id)).toBe(true);

    const edited = await ed.exportTimber(true);
    expect(edited.ok).toBe(true);

    // Generate with another setting: a new map, made as if nothing was edited (the page's Generate
    // runs the generator alone; the edited map stays the open document)
    const hard = makeSpec({ seed: 77, size: { x: W, y: W }, designedFor: "hard" });
    const fresh = generate(hard);
    const made = await runGenerate(hard);
    expect(made.spec.designedFor).toBe("hard");
    expect(Buffer.from(made.heights).equals(Buffer.from(fresh.built.heights))).toBe(true);
    expect(made.features.some((f) => f.id === forest.id || f.id === plateau.id)).toBe(false);

    // the edited map is one step away (Back to editing), exactly as it was
    const again = ed.sessionView();
    expect(again.info.spec!.designedFor).toBe("normal");
    expect(again.info.edits).toBe(2);
    expect(again.info.history.map((h) => h.label)).toEqual(["Add forest", "Add landform"]);
    for (let y = 80; y <= 88; y++) for (let x = 80; x <= 88; x++) expect(again.view.heights[y * W + x]).toBe(14);
    expect(ed.undo().info.edits).toBe(1);
    expect(ed.redo().info.edits).toBe(2);
    const still = await ed.exportTimber(true);
    expect(Buffer.from(still.bytes).equals(Buffer.from(edited.bytes))).toBe(true);

    // the export check (export profile) and the export
    const c = ed.exportCheck();
    expect(c.blocking).toEqual([]);
    const out = await ed.exportTimber(true);
    expect(out.ok).toBe(true);
    expect(out.fileName).toBe("dgm-river-valley-77.timber");
  });

  it("an unedited generated map exports the generator's own file, and history jumps", async () => {
    const spec = makeSpec({ seed: 5, size: { x: W, y: W } });
    const r = generate(spec);
    await runGenerate(spec);
    ed.refine();
    const c = ed.exportCheck();
    expect(c.blocking).toEqual([]);
    expect(c.warnings).toEqual([]);
    const out = await ed.exportTimber(false);
    expect(out.ok).toBe(true);
    expect(Buffer.from(out.bytes).equals(Buffer.from(r.bytes))).toBe(true);
    // two edits, jump back to the start and forward to the first
    const trees = r.built.entities.filter((e) => e.template === "Pine").slice(0, 2);
    ed.apply({ op: "deleteEntities", params: { entities: [trees[0].id] } });
    ed.apply({ op: "deleteEntities", params: { entities: [trees[1].id] } });
    expect(ed.jump(-1).info.history.map((h) => h.applied)).toEqual([false, false]);
    const one = ed.jump(0);
    expect(one.info.history.map((h) => h.applied)).toEqual([true, false]);
    expect(one.view.entities!.count).toBe(r.built.entities.length - 1);
  });

  it("an imported map opens with its own water, and exports unchanged even with its own problems", async () => {
    // a generated file, opened as an import: its water comes from the file
    const r = generate(makeSpec({ seed: 9, size: { x: W, y: W } }));
    const bytes = writeTimber(r.file);
    const open = ed.openTimber(bytes, "Mine.timber");
    expect(open.info.kind).toBe("import");
    expect(open.info.timberName).toBe("dgm-mine.timber");
    expect(open.view.water.count).toBe(r.built.water.filter((d) => d > 0.001).length);
    // since M8 the water and colony checks run on imports too (decisions-pending #9)
    const c = ed.exportCheck();
    expect(c.blocking).toEqual([]);
    expect(c.warnings).toEqual([]);
    const out = await ed.exportTimber(false);
    expect(out.ok).toBe(true);
    expect(Buffer.from(out.bytes).equals(Buffer.from(bytes))).toBe(true);
    // a project file round trip
    const p = ed.project();
    const reopened = ed.openProject(p.bytes);
    expect(reopened.info.name).toBe("Mine");
  });
});
