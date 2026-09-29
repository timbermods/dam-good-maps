// Another feature's water or badwater source under an edit (decisions-pending #89, accepted by
// Kyler in PLAN §20 D270 for the generator's feature operations and Claude's steps only). A planned
// edit (a lake, a landform, a set piece, a move) that would reshape the ground under a source keeps
// off it and says why (`objectsOnNewGround` in src/core/doc/tools.ts). The brushes, the Select tool
// and the forces never meet that refusal: sources ride the ground under brushes and Select actions
// (D249), and the forces sweep their path (D257).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

function session(): MapSession {
  const r = generate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 96, y: 96 } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}

describe("a badwater spring under the brushes and the Select tool (#89, D270)", () => {
  it("a Select action over a badwater spring is never refused", () => {
    const s = session();
    const spring = s.built.entities.find((e) => e.template === "BadwaterSource");
    expect(spring, "the map's badwater spring").toBeDefined();
    const { x, y } = spring!;
    // the selection: the spring's 3 × 3 and the ground round it; raise it by a level, then set it
    // to a level (what Select's Raise and Set level send)
    const cells: [number, number, number][] = [];
    for (let row = Math.max(0, y - 3); row <= Math.min(95, y + 5); row++) cells.push([row, Math.max(0, x - 3), Math.min(95, x + 5)]);
    const raised = s.apply({ op: "sculpt", params: { mode: "raise", cells, amount: 1 } }, "user", "Raise 81 tiles by 1");
    expect(raised.errors).toEqual([]);
    expect(raised.ok).toBe(true);
    const level = s.apply({ op: "sculpt", params: { mode: "flatten", cells, level: s.built.heights[y * 96 + x] } }, "user", "Set 81 tiles to a level");
    expect(level.errors).toEqual([]);
    expect(level.ok).toBe(true);
  });

  it("a brush stroke across a badwater spring is never refused", () => {
    const s = session();
    const spring = s.built.entities.find((e) => e.template === "BadwaterSource")!;
    const cx = spring.x + 1;
    const cy = spring.y + 1;
    // a Raise stroke from one side of the spring to the other, through its middle (dabs in
    // quarter tiles)
    const dabs: number[] = [];
    for (let dx = -4; dx <= 4; dx++) dabs.push(4 * (cx + dx) + 2, 4 * cy + 2);
    for (const tool of ["raise", "lower", "flatten", "smooth"] as const) {
      const p: BrushParams = { tool, size: 5, strength: 5, dabs, ...(tool === "flatten" ? { level: s.built.heights[cy * 96 + cx] } : {}) };
      const u = s.apply({ op: "brush", params: p }, "user", tool);
      expect(u.errors, tool).toEqual([]);
      expect(u.ok, tool).toBe(true);
    }
  });
});
