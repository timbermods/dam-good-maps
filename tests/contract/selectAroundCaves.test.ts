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
