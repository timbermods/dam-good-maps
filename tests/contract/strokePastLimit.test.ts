// A stroke longer than one operation holds is never lost (D342, #787's review): past MAX_DABS dabs (a hard stroke dabs
// every quarter tile, so about 10,000 tiles of travel) the session applies it as consecutive strokes of at most
// MAX_DABS, one step, one undo (brush.ts `strokeParts`). A hard stroke's map is the same as its dabs would make in one
// stroke: each tile it reaches goes all the way to its target, so it is the map of the same stroke without the dabs it
// repeats. A soft one is applied too, starting again past the limit as a new stroke would.

import { describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { MAX_DABS, strokeParts, type BrushParams } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 64;
const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
const session = () => {
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
};

/** Back and forth along rows 20 to 27 of the map's west half, a dab every quarter tile: `n` dabs. */
function path(n: number): number[] {
  const out: number[] = [];
  let x = 40;
  let y = 82;
  let dir = 1;
  for (let k = 0; k < n; k++) {
    out.push(x, y);
    x += dir;
    if (x > 120 || x < 40) {
      dir = -dir;
      x += 2 * dir;
      y = y >= 110 ? 82 : y + 4;
    }
  }
  return out;
}

describe("a stroke past MAX_DABS", () => {
  it("a hard stroke is applied in parts as one step, its map that of the same stroke without its repeated dabs", () => {
    const n = 2 * MAX_DABS + 12_345;
    const dabs = path(n);
    const stroke: BrushParams = { tool: "raise", size: 1.5, strength: 5, target: 12, dabs };
    expect(strokeParts(stroke).map((p) => p.dabs.length / 2)).toEqual([MAX_DABS, MAX_DABS, 12_345]);
    const s = session();
    const before = s.built.heights.slice();
    const steps = s.history().length;
    const res = s.apply({ op: "brush", params: stroke } as EditOp, "user", "Raise");
    expect(res.errors).toEqual([]);
    expect(res.applied.length).toBe(3);
    expect(s.history().length).toBe(steps + 1);
    // (the same stroke, each dab once: within the limit, one operation)
    const seen = new Set<string>();
    const once: number[] = [];
    for (let k = 0; k < dabs.length; k += 2) if (!seen.has(`${dabs[k]},${dabs[k + 1]}`)) seen.add(`${dabs[k]},${dabs[k + 1]}`), once.push(dabs[k], dabs[k + 1]);
    expect(once.length / 2).toBeLessThan(MAX_DABS);
    const ref = session();
    expect(ref.apply({ op: "brush", params: { ...stroke, dabs: once } } as EditOp).errors).toEqual([]);
    expect(Buffer.from(s.built.heights).equals(Buffer.from(ref.built.heights))).toBe(true);
    expect(s.built.heights.some((h, i) => h !== before[i])).toBe(true);
    // one undo takes the whole stroke back
    expect(s.undo()).toBe(true);
    expect(Buffer.from(s.built.heights).equals(Buffer.from(before))).toBe(true);
  }, 300_000);

  it("a soft stroke past the limit is applied too, never refused", () => {
    const s = session();
    const before = s.built.heights.slice();
    const res = s.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs: path(MAX_DABS + 500) } } as EditOp, "user", "Raise");
    expect(res.errors).toEqual([]);
    expect(res.applied.length).toBe(2);
    expect(s.built.heights.some((h, i) => h !== before[i])).toBe(true);
  }, 300_000);
});
