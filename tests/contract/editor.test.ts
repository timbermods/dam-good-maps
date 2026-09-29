// The editor's worker side (EDITOR_PLAN §8) in Node: the page's journey through it. Generate,
// refine, edit, go back to the settings, regenerate and refine again keeps the player's edits
// (ROADMAP M4); updates carry only what changed; the export check follows the export profile, and
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
  it("generate → refine → edit → back to settings → regenerate → refine keeps the edits", async () => {
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
    expect(card.edits).toBe(2);
    expect(card.features.some((f) => f.id === forest.id)).toBe(true);

    // change a setting and regenerate: the player's features are kept
    const hard = makeSpec({ seed: 77, size: { x: W, y: W }, designedFor: "hard" });
    const r = await ed.regenerate(hard);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.response!.spec.designedFor).toBe("hard");
    for (const f of [forest, plateau]) expect(r.info.features.find((x) => x.id === f.id)).toEqual(f);
    expect(r.response!.entities.filter((e) => e.owner === forest.id).length).toBeGreaterThan(0);

    // refine again: the edits are in the history and on the map
    const again = ed.sessionView();
    expect(again.info.edits).toBe(2);
    expect(again.info.history.map((h) => h.label)).toEqual(["Add forest", "Add landform", "Change settings and regenerate"]);
    for (let y = 80; y <= 88; y++) for (let x = 80; x <= 88; x++) expect(again.view.heights[y * W + x]).toBe(14);

    // undo the regeneration, then redo it
    const back = ed.undo();
    expect(back.info.spec!.designedFor).toBe("normal");
    const fwd = ed.redo();
    expect(fwd.info.spec!.designedFor).toBe("hard");

    // the export check (export profile) and the export
    const c = ed.exportCheck();
    expect(c.blocking).toEqual([]);
    expect(c.playability).toBe(true);
    const out = await ed.exportTimber(true);
    expect(out.ok).toBe(true);
    expect(out.fileName).toBe("River Valley (77).timber");
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

  it("undo and redo across a change of size send the whole map at its own size (fix/size-edits)", async () => {
    // an unedited map generated again at another size (the settings step of Claude, later a replaced
    // map brought back): the view the page built is for the other size, so it is sent whole
    const spec = makeSpec({ seed: 5, size: { x: W, y: W } });
    const r = generate(spec);
    await runGenerate(spec);
    ed.refine();
    const g = await ed.regenerate(makeSpec({ seed: 5, size: { x: 128, y: 128 } }));
    expect(g.ok).toBe(true);
    const big = ed.sessionView();
    expect(big.view.W).toBe(128);
    const back = ed.undo();
    expect(back.info.W).toBe(W);
    expect(back.view.reopen?.view.W).toBe(W);
    expect(back.view.reopen?.view.H).toBe(W);
    expect(Buffer.from(back.view.reopen!.view.heights).equals(Buffer.from(r.built.heights))).toBe(true);
    expect(back.view.reopen!.view.entities.count).toBe(r.built.entities.length);
    expect(back.view.heights).toBeUndefined();
    const fwd = ed.redo();
    expect(fwd.view.reopen?.view.W).toBe(128);
    expect(Buffer.from(fwd.view.reopen!.view.heights).equals(Buffer.from(big.view.heights))).toBe(true);
    // the history's jump too
    expect(ed.jump(-1).view.reopen?.view.W).toBe(W);
  });

  it("an imported map opens with its own water, and exports unchanged even with its own problems", async () => {
    // a generated file, opened as an import: its water comes from the file
    const r = generate(makeSpec({ seed: 9, size: { x: W, y: W } }));
    const bytes = writeTimber(r.file);
    const open = ed.openTimber(bytes, "Mine.timber");
    expect(open.info.kind).toBe("import");
    expect(open.info.timberName).toBe("Mine.timber");
    expect(open.view.water.count).toBe(r.built.water.filter((d) => d > 0.001).length);
    // since M8 the water and colony checks run on imports too (decisions-pending #9)
    const c = ed.exportCheck();
    expect(c.playability).toBe(true);
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
