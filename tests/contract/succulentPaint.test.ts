// Painting succulents plants them only where they live (PLAN §20 D235): a succulent dies on moist ground, so a stroke
// leaves moist tiles empty, by the rule `plants.survive` applies (plantSoil.ts `diesOnSoil`), as trees and bushes
// avoid water. On River Valley 64×256 seed 740973 the stroke below put 6 on moist tiles, where the check said they die.

import { describe, expect, it } from "vitest";
import { applyPaintObjects, paintDying, planPaintObjects } from "../../src/core/doc/paint";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { diesOnSoil } from "../../src/core/doc/plantSoil";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";

const FRAGMENT = "v=0.10.5&s=740973&t=riverValley&z=64x256&d=n&vt=69";

const rect = (x0: number, y0: number, x1: number, y1: number, W: number): number[] => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return t;
};

function session(): MapSession {
  const r = generate(decodeSpecFragment(FRAGMENT)!.spec);
  return MapSession.fromGenerated(r, r.file);
}

describe("painted succulents stand only on ground where they survive (D235)", () => {
  it("none lands where plants.survive would flag it, and moist tiles are left empty", () => {
    const s = session();
    const W = s.size.x;
    const tiles = rect(57, 84, 63, 110, W);
    const params: PaintParams = { kind: "succulents", template: "Succulent", area: tilesToRuns(tiles, W), density: 0.3, seed: 11 };
    const ground = { moisture: s.built.moisture, contamination: s.built.soilContamination, depth: s.built.water };
    // (the region holds moist ground, or this proves nothing)
    expect(tiles.filter((i) => ground.moisture[i] > 0 && !(ground.depth[i] > 0.05)).length).toBeGreaterThan(0);
    const before = new Set(s.built.entities.map((e) => e.id));
    const res = applyPaintObjects(s, params, "user");
    expect(res.errors).toEqual([]);
    const planted = s.built.entities.filter((e) => !before.has(e.id) && e.template === "Succulent");
    expect(planted.length).toBeGreaterThan(0);
    for (const e of planted) expect(diesOnSoil("Succulent", ground, e.y * W + e.x), `${e.x},${e.y}`).toBe(false);
    const flagged = new Set(s.validate().report.checks.find((c) => c.id === "plants.survive")!.where?.entities ?? []);
    for (const e of planted) expect(flagged.has(e.id), `${e.x},${e.y}`).toBe(false);
    // nothing is left to warn of
    expect(paintDying(s, params)).toEqual([]);
  });

  it("a stroke over moist ground alone is refused with the reason", () => {
    const s = session();
    const W = s.size.x;
    const b = s.built;
    const taken = new Set(b.entities.map((e) => e.y * W + e.x));
    const moist = rect(57, 84, 63, 110, W).filter((i) => b.moisture[i] > 0 && !(b.water[i] > 0.05) && !taken.has(i));
    expect(moist.length).toBeGreaterThan(0);
    const p = planPaintObjects(s, { kind: "succulents", template: "Succulent", area: tilesToRuns([moist[0]], W), density: 1, seed: 1 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.errors[0]).toMatch(/moist ground/);
  });
});
