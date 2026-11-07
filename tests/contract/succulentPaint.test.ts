// Painting succulents plants them only where they live (PLAN §20 D235): a succulent dies on moist ground, so a stroke
// leaves moist tiles empty, by the rule `plants.survive` applies (plantSoil.ts `diesOnSoil`), as trees and bushes
// avoid water. On River Valley 64×256 seed 740973 the stroke below put 6 on moist tiles, where the check said they die.

import { describe, expect, it } from "vitest";
import { applyPaintObjects, paintDying, planPaintObjects } from "../../src/core/doc/paint";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { footprintCheck, planEntity, planMoveEntity } from "../../src/core/doc/placing";
import { diesOnSoil } from "../../src/core/doc/plantSoil";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { decodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

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

describe("the soil a stroke reads is the map's as edited (D235)", () => {
  it("after carving a channel, a lake source and a settle, succulents painted across the whole map still land on none that plants.survive flags", () => {
    const r = generate(makeSpec({ seed: 5, theme: "highlands", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const W = s.size.x;
    const N = W * s.size.y;
    const moistBefore = Uint8Array.from(s.built.moisture, (v) => (v > 0 ? 1 : 0));
    // a channel carved across the map at row 40, a water source at its west end, then the settle
    const dabs: number[] = [];
    for (let x = 6; x <= 58; x += 1) dabs.push(x * 4, 40 * 4);
    expect(s.apply({ op: "brush", params: { tool: "lower", size: 3, strength: 10, dabs } } as never).errors).toEqual([]);
    expect(
      s.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-0000000000a1", template: "WaterSource", x: 6, y: 40, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } }).errors,
    ).toEqual([]);
    s.settleCanonical();
    const b = s.built;
    // (the edit changed the soil, or this proves nothing)
    let changed = 0;
    for (let i = 0; i < N; i++) if ((b.moisture[i] > 0 ? 1 : 0) !== moistBefore[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    const all = Array.from({ length: N }, (_, i) => i);
    const before = new Set(b.entities.map((e) => e.id));
    expect(applyPaintObjects(s, { kind: "succulents", template: "Succulent", area: tilesToRuns(all, W), density: 1, seed: 3 }, "user").errors).toEqual([]);
    const planted = s.built.entities.filter((e) => !before.has(e.id) && e.template === "Succulent");
    expect(planted.length).toBeGreaterThan(0);
    const flagged = new Set(s.validate().report.checks.find((c) => c.id === "plants.survive")!.where?.entities ?? []);
    expect(planted.filter((e) => flagged.has(e.id)).map((e) => `${e.x},${e.y}`)).toEqual([]);
  });
});

describe("a click and a move put a succulent only where it survives (D235, D342)", () => {
  const ID = "00000000-0000-4000-8000-0000000000b1";
  /** A free dry tile with a free moist one beside it (east): [dry, moist]. */
  function pair(s: MapSession): { dry: number; moist: number } {
    const W = s.size.x;
    const b = s.built;
    const taken = new Set(b.entities.map((e) => e.y * W + e.x));
    const ok = (i: number) => !taken.has(i) && !(b.water[i] > 0.05);
    for (let i = 0; i < W * s.size.y - 1; i++) {
      if (i % W === W - 1 || !ok(i) || !ok(i + 1)) continue;
      if (b.moisture[i] === 0 && b.moisture[i + 1] > 0) return { dry: i, moist: i + 1 };
    }
    throw new Error("no dry tile beside a moist one");
  }
  const at = (W: number, i: number) => ({ x: i % W, y: Math.floor(i / W) });

  it("refuses a click on moist ground with the stroke's own reason, and shows it on the ghost", () => {
    const s = session();
    const W = s.size.x;
    const { moist } = pair(s);
    const req = { template: "Succulent", ...at(W, moist), orientation: "Cw0" as const };
    const stroke = planPaintObjects(s, { kind: "succulents", template: "Succulent", area: tilesToRuns([moist], W), density: 1, seed: 1 });
    expect(stroke.ok).toBe(false);
    const p = planEntity(s, req, ID);
    expect(p.ok).toBe(false);
    if (!p.ok && !stroke.ok) expect(p.errors[0]).toBe(stroke.errors[0]);
    expect(footprintCheck(s, req).problem).toMatch(/moist ground/);
    expect(s.apply({ op: "placeEntity", params: { id: ID, ...req } }).errors[0]).toMatch(/moist ground/);
  });

  it("accepts a click on dry ground, and refuses to move it onto moist ground", () => {
    const s = session();
    const W = s.size.x;
    const { dry, moist } = pair(s);
    const req = { template: "Succulent", ...at(W, dry), orientation: "Cw0" as const };
    expect(footprintCheck(s, req).problem).toBeNull();
    expect(planEntity(s, req, ID).ok).toBe(true);
    expect(s.apply({ op: "placeEntity", params: { id: ID, ...req } }).errors).toEqual([]);
    const moved = planMoveEntity(s, ID, 1, 0);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.errors[0]).toMatch(/moist ground/);
    expect(s.apply({ op: "moveEntity", params: { id: ID, ...at(W, moist) } }).errors[0]).toMatch(/moist ground/);
    // (it stays where it was, alive)
    expect(s.built.entities.find((e) => e.id === ID)).toMatchObject(at(W, dry));
    expect(s.validate().report.checks.find((c) => c.id === "plants.survive")!.where?.entities ?? []).not.toContain(ID);
  });
});
