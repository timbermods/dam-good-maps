// Select's actions on a map with caves (D487, D488): a selection that takes in a cave's or an overhang's ground, a whole
// map with a 3D form on it, shapes the rest, as a force runs round a cave; the columns with a cave or an overhang and the
// ground holding up their roofs (core/doc/start.ts `selectionHeld`) are left as they are, the answer says how many, and a
// selection of nothing else is refused with the core's one line. Nothing it leaves falls (D280 (3)).

import { describe, expect, it } from "vitest";
import { applySelection, selectionHeld } from "../../src/core/doc/start";
import { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;

describe("Select's actions on a map with a 3D form (D487)", () => {
  // (Highlands 96² seed 4242 grows a spring cave at the default Verticality, at (33–38, 37–41))
  const r = generate(makeSpec({ seed: 4242, theme: "highlands", size: { x: W, y: W } }));

  it("the whole map cut down to level 8: every tile but the cave's and its roof's holders, which stay as they were", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const held = selectionHeld(s);
    expect(held.size).toBeGreaterThan(0);
    for (const i of s.columns.keys()) expect(held.has(i)).toBe(true);
    const h0 = s.built.heights.slice();
    const all = Array.from({ length: W * W }, (_, i) => i);
    const above = all.filter((i) => h0[i] > 8);
    const op: EditOp = { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(above, W), level: 8 } };
    const u = applySelection(s, [op], "Cut down", above);
    expect(u.errors).toEqual([]);
    expect(u.left).toBe(above.filter((i) => held.has(i)).length);
    const h1 = s.built.heights;
    for (const i of above) expect(h1[i], `tile ${i}`).toBe(held.has(i) ? h0[i] : 8);
    expect(s.built.dropped ?? 0).toBe(0);
  });

  it("Delete's ground over a selection that takes in the cave (the Delete menu's Ground, the Delete key): a level off the rest, the cave's ground and its roof's holders left, counted", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const held = selectionHeld(s);
    const h0 = s.built.heights.slice();
    // (a box round the cave, as the page sends it: an exact lower of one level, useDelete.ts `deleteGround`)
    const box: number[] = [];
    for (let y = 30; y <= 48; y++) for (let x = 26; x <= 46; x++) if (h0[y * W + x] > 0) box.push(y * W + x);
    const inBox = box.filter((i) => held.has(i));
    expect(inBox.length).toBeGreaterThan(0);
    const op: EditOp = { op: "sculpt", params: { mode: "lower", cells: tilesToRuns(box, W), amount: 1, exact: true } };
    const u = applySelection(s, [op], "Delete a level of ground", box);
    expect(u.errors).toEqual([]);
    expect(u.left).toBe(inBox.length);
    for (const i of box) expect(s.built.heights[i], `tile ${i}`).toBe(held.has(i) ? h0[i] : h0[i] - 1);
    expect(s.built.dropped ?? 0).toBe(0);
  });

  it("a selection of only the ground holding up the roof is refused saying so", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const holders = [...selectionHeld(s)].filter((i) => !s.columns.has(i));
    expect(holders.length).toBeGreaterThan(0);
    const op: EditOp = { op: "sculpt", params: { mode: "lower", cells: tilesToRuns(holders, W), amount: 1, exact: true } };
    const u = applySelection(s, [op], "Lower", holders);
    expect(u.ok).toBe(false);
    expect(u.errors[0]).toMatch(/holds up the roof of a cave or overhang/);
  });

  it("a selection of the cave's ground alone is refused with the core's one line, and nothing changes", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const cave = [...s.columns.keys()];
    const h0 = s.built.heights.slice();
    const op: EditOp = { op: "sculpt", params: { mode: "raise", cells: tilesToRuns(cave, W), amount: 1 } };
    const u = applySelection(s, [op], "Raise", cave);
    expect(u.ok).toBe(false);
    expect(u.errors[0]).toMatch(/has a cave or overhang: shape its top with a brush/);
    expect(Array.from(s.built.heights)).toEqual(Array.from(h0));
  });
});
