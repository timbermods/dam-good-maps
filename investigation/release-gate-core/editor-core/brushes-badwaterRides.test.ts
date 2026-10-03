// Release gate (D385), brushes: sources ride the ground under a brush, "a 3×3 BadwaterSource as one
// rigid level piece; no brush ... leaves one buried or floating" (D249, D322 item 31: Ride, the
// default). The core's brush operation (`brush` in ops.schema.json, D342: every change is an operation
// the core validates and applies) does this only when its caller lists the source as a `rigid` piece;
// the page works that out itself (src/editor/brushes.ts `rides`), so any other caller of the core
// (Claude's steps, a script, the Rust port's tests) gets a stroke that leaves the source floating, a
// load error the export refuses, with the operation accepted as valid.

import { describe, expect, it } from "vitest";
import type { EditOp } from "../../../src/core/doc/ops";
import { MapSession } from "../../../src/core/doc/session";
import { generate } from "../../../src/core/gen/generate";
import { makeSpec } from "../../../src/core/spec/mapspec";

describe("a brush stroke over a badwater source leaves it level, never floating (D249)", () => {
  it("Highlands 64², seed 3: a BadwaterSource at (27, 5); a Raise (target 15, Size 1.5) over its corner; the stroke is refused, or the source rides level, and the map has no load error", () => {
    const W = 64;
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const id = "00000000-0000-4000-8000-000000000777";
    expect(s.apply({ op: "placeEntity", params: { id, template: "BadwaterSource", x: 27, y: 5, orientation: "Cw0" } } as EditOp).errors).toEqual([]);
    const loadErrors = () => s.validate(undefined, { loadOnly: true }).report.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.id}: ${c.message}`);
    expect(loadErrors()).toEqual([]);

    const res = s.apply({ op: "brush", params: { tool: "raise", size: 1.5, strength: 10, target: 15, dabs: [27 * 4 + 2, 5 * 4 + 2] } } as EditOp);
    if (res.ok) {
      const e = s.built.entities.find((g) => g.id === id)!;
      const under: number[] = [];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) under.push(s.built.heights[(e.y + dy) * W + e.x + dx]);
      expect(new Set(under).size, `its nine tiles: ${under.join(", ")}`).toBe(1);
      expect(loadErrors()).toEqual([]);
    }
  });
});
