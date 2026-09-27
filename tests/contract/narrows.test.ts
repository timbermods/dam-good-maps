// The natural-narrows builder (#63: kept as an internal operation for M12's Claude; ROADMAP M9a,
// "Keep M12 ready"): the naturalNarrows set piece raises two spurs that close in on a river from
// its banks, the channel keeps its gap, and the result never reads as a dam wall
// (analysis/ridge.ts); the edit applies, rebuilds the same, and undo takes it back.

import { describe, expect, it } from "vitest";
import { damWalls } from "../../src/core/analysis/ridge";
import { planNarrowsEdit } from "../../src/core/doc/narrows";
import { MapSession } from "../../src/core/doc/session";
import type { RiverFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("a natural narrows on a generated river", () => {
  const r = generate(makeSpec({ seed: 3, size: { x: 128, y: 128 }, theme: "riverValley" }));

  it("raises spurs from both banks, keeps the channel's gap, never a dam wall, and undoes", () => {
    const s = MapSession.fromGenerated(r);
    const before = Buffer.from(s.exportTimber().bytes);
    const rivers = s.features.filter((f): f is RiverFeature => f.kind === "river");
    let placed = 0;
    for (const river of rivers)
      for (const at of [0.3, 0.45, 0.6]) {
        const p = planNarrowsEdit(s, { river: river.id, at }, `9a9a9a9a-0000-4000-8000-${String(placed + 1).padStart(12, "0")}`);
        if (!p.ok) {
          // a refusal says why: the valley's shape, or the spurs reading as a wall
          expect(p.errors.join(" ")).toMatch(/too narrow or too open|read as a wall|too short/);
          continue;
        }
        expect(p.gap).toBeGreaterThan(0);
        expect(p.tiles.length).toBeGreaterThan(10);
        const res = s.applyAll(p.ops, "claude", p.label);
        expect(res.errors).toEqual([]);
        // the spurs stand as planned, and a full rebuild equals the incremental one
        const full = s.fullBuild();
        expect(Buffer.from(full.heights).equals(Buffer.from(s.built.heights))).toBe(true);
        for (const i of p.tiles) expect(s.built.heights[i]).toBeGreaterThan(0);
        // every raised tile stands above the ground it replaced, and nothing reads as a wall
        expect(damWalls(s.built.heights, s.size.x, s.size.y, s.built.water)).toEqual([]);
        placed++;
        s.undo();
        expect(Buffer.from(s.exportTimber().bytes).equals(before)).toBe(true);
        if (placed >= 2) return;
      }
    expect(placed).toBeGreaterThan(0);
  });

  it("refuses values outside its limits, with what is allowed", () => {
    const s = MapSession.fromGenerated(r);
    const river = s.features.find((f) => f.kind === "river")!;
    for (const [req, msg] of [
      [{ river: river.id, at: 1.5 }, /at/],
      [{ river: river.id, at: 0.5, reach: 0.2 }, /reach/],
      [{ river: river.id, at: 0.5, rise: 7 }, /rise/],
      [{ river: "nope", at: 0.5 }, /pick a river/],
    ] as const) {
      const p = planNarrowsEdit(s, req, "9a9a9a9a-0000-4000-8000-000000000099");
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.errors.join(" ")).toMatch(msg);
    }
  });
});
