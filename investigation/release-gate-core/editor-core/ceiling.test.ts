// Operations are refused with a plain one-line reason when they cannot do what they say, never clamped
// silently (D342 (1), (4); EDITOR_PLAN "Edit operations": "reject invalid ones instead of clamping
// silently"). Select's Raise and Lower (the row's buttons, the Up and Down keys) send a `sculpt` of the
// selection by 1 (useSelect.tsx); the ceiling is 22 (D244, CEILING) and the floor 0.
import { describe, expect, it } from "vitest";
import type { EditOp } from "../../../src/core/doc/ops";
import { CEILING } from "../../../src/core/format/world";
import { session } from "./helpers";

const W = 64;
const box = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) out.push([y, x0, x1]);
  return out;
};
const cells = box(30, 30, 37, 37);
const heightsIn = (h: Uint8Array) => cells.flatMap(([y, x0, x1]) => Array.from({ length: x1 - x0 + 1 }, (_, k) => h[y * W + x0 + k]));

describe("Select's Raise at the ceiling", () => {
  it("raising a selection that already stands at the ceiling is refused with a reason, not applied as a step that changes nothing", () => {
    const s = session(1, W);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells, level: CEILING } }).ok).toBe(true);
    const before = heightsIn(s.built.heights);
    expect(before.every((v) => v === CEILING)).toBe(true);
    const raise: EditOp = { op: "sculpt", params: { mode: "raise", cells, amount: 1 } };
    const r = s.apply(raise);
    // today: accepted, an undo step "Raise terrain" whose land is unchanged
    expect(r.ok && heightsIn(s.built.heights).join() === before.join()).toBe(false);
    expect(r.ok ? [] : r.errors).toHaveLength(1);
  });

  it("raising a selection partly at the ceiling is refused or says so, not silently flattened at the top", () => {
    const s = session(1, W);
    // half the selection at the ceiling, half one below
    expect(s.applyAll([
      { op: "sculpt", params: { mode: "flatten", cells, level: CEILING - 1 } },
      { op: "sculpt", params: { mode: "flatten", cells: box(30, 30, 37, 33), level: CEILING } },
    ]).ok).toBe(true);
    const before = heightsIn(s.built.heights);
    const notes = s.built.notes.length;
    const r = s.apply({ op: "sculpt", params: { mode: "raise", cells, amount: 1 } });
    const after = heightsIn(s.built.heights);
    // a raise by 1 raises every tile by 1, or is refused with its reason, or tells the player what stayed
    const raisedAll = r.ok && after.every((v, k) => v === before[k] + 1);
    const said = r.ok && s.built.notes.length > notes;
    expect(raisedAll || said || (!r.ok && r.errors.length === 1)).toBe(true);
  });
});
