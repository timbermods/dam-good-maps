// Edge walls on a map being edited (PLAN §20 D323, feedback item 12): a wall raised along an edge
// is a warning in the checks, never a block on the save, with a one-click "Lower the wall" fix
// (the outer tiles cut down to the land inside, one undo step). Generated maps and Real places
// still guarantee no walls (D151): the `generate` profile and `place.ts` do not take `editing`.

import { describe, expect, it } from "vitest";
import { edgeWalls, EDGE_SHARE } from "../../src/core/analysis/edges";
import type { EditOp } from "../../src/core/doc/ops";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import type { CheckItem } from "../../src/worker/session";

const W = 64;

/** Raise the two outer columns on the west edge to level 15: a wall along the whole edge. */
function raiseWall(): void {
  const tiles: number[] = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < 2; x++) tiles.push(y * W + x);
  const r = ed.apply({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles, W), level: 15 } }, "user", "Raise a wall");
  expect(r.ok).toBe(true);
}

const wallItem = (items: CheckItem[]) => items.find((i) => i.id === "terrain.edge_wall");

describe("an edge wall on an edited map (D323)", () => {
  it("warns and never blocks the save; Lower the wall is one undo step and leaves no wall", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    // the generated map has none (D151)
    expect(wallItem(ed.exportCheck().warnings)).toBeUndefined();
    const before = ed.sessionView().info.history.filter((h) => h.applied).length;
    raiseWall();
    expect(edgeWalls(ed.sessionView().view.heights, W, W).find((e) => e.edge === "west")!.share).toBeGreaterThanOrEqual(EDGE_SHARE);

    const c = ed.exportCheck();
    expect(wallItem(c.blocking)).toBeUndefined();
    const warn = wallItem(c.warnings)!;
    expect(warn, "a warning").toBeDefined();
    expect(warn.fix?.[0]?.label).toBe("Lower the wall");
    // the quick checks after the edit name it too, in the dot
    expect(wallItem(ed.instantCheck().items)).toBeDefined();
    // the save goes through
    const saved = await ed.exportTimber(true);
    expect(saved.errors).toEqual([]);
    expect(saved.ok).toBe(true);

    // the fix: one step
    const steps = ed.sessionView().info.history.filter((h) => h.applied).length;
    const fixed = ed.applyAll(warn.fix!.map(({ label: _l, ...op }) => op as EditOp), "Lower the wall", "fix");
    expect(fixed.ok).toBe(true);
    expect(ed.sessionView().info.history.filter((h) => h.applied).length).toBe(steps + 1);
    expect(edgeWalls(ed.sessionView().view.heights, W, W).every((e) => e.share < EDGE_SHARE)).toBe(true);
    expect(wallItem(ed.exportCheck().warnings)).toBeUndefined();
    // the outer tiles now stand at the land inside, and nothing else moved
    const h = ed.sessionView().view.heights;
    for (let y = 2; y < W - 2; y++) expect(h[y * W]).toBeLessThanOrEqual(Math.max(h[y * W + 2], h[y * W + 3], h[y * W + 4]));
    // one undo brings the wall back
    ed.undo();
    expect(wallItem(ed.exportCheck().warnings)).toBeDefined();
    expect(ed.sessionView().info.history.filter((h2) => h2.applied).length).toBe(steps);
    expect(before).toBeLessThan(steps);
  });
});
