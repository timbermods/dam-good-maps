// Power and size are separate in every force (PLAN §20 D226): each size control follows Power by
// default or is set by hand. Carve's new Depth caps how deep it cuts below the land it runs through
// (a wide, shallow river at high Power); Erupt's Size is its breadth; both are kept in the force's
// operation, checked by the engine and the schema alike; an operation from before them (no Depth, no
// Size) still opens and replays as it was.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { MapSession } from "../../src/core/doc/session";
import { naturalDepth } from "../../src/core/forces/carve/character";
import { carveForceParams, forceMapOf } from "../../src/core/forces/carve/result";
import { CarveRun, DEFAULTS as CARVE_DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { forceSettingsProblems, type ForceResultParams } from "../../src/core/forces/op";
import { generate } from "../../src/core/gen/generate";
import { checkSchema } from "../../src/core/spec/schema";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;

function session() {
  const r = generate(makeSpec({ seed: 5, theme: "highlands", size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}

/** Dry, high ground far from the start, for a carve to run down from. */
function spot(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < b.H - 12; y += 3)
    for (let x = 12; x < b.W - 12; x += 3) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i] * 2;
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

function carve(s: MapSession, settings: CarveSettings, at: [number, number]) {
  const m = forceMapOf(s.built);
  const run = new CarveRun(m, settings, { origin: at[1] * W + at[0] }, { sourceId: "22222222-2222-4333-8444-555555555555" });
  for (let k = 0; k < 900 && !run.done; k++) run.step();
  return { m, run };
}

describe("Power and size are separate in every force (D226)", () => {
  it("Carve's Depth caps how deep it cuts below the land it runs through: a wide, shallow river at high Power; following Power it cuts as before", () => {
    const s = session();
    const at = spot(s);
    const power = 95;
    const deep = carve(s, { ...CARVE_DEFAULTS, power, width: 16 }, at);
    const shallow = carve(s, { ...CARVE_DEFAULTS, power, width: 16, depth: 2 }, at);
    const cut = (r: typeof deep) => {
      let most = 0;
      for (let i = 0; i < r.m.heights.length; i++) most = Math.max(most, r.m.heights[i] - r.run.map.heights[i]);
      return most;
    };
    // (following Power it cuts deeper than two levels here; set to two, never deeper)
    expect(cut(deep)).toBeGreaterThan(2);
    expect(cut(shallow)).toBeLessThanOrEqual(2);
    expect(cut(shallow)).toBeGreaterThan(0);
    // what Depth reads while it follows Power: the carve's own cut where it starts
    expect(naturalDepth(65)).toBe(5);
    expect(naturalDepth(100, 24)).toBeLessThan(naturalDepth(100));
    // kept, its Depth is in its operation; the project reopens it and replays the same land
    const params = carveForceParams(shallow.m, shallow.run, { settings: { ...CARVE_DEFAULTS, power, width: 16, depth: 2 }, origin: at, cut: null })!;
    expect(params.settings).toMatchObject({ width: 16, depth: 2 });
    expect(s.apply({ op: "forceResult", params }, "user").errors).toEqual([]);
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    // following Power, no Depth is written (as before D226)
    const plain = carveForceParams(deep.m, deep.run, { settings: { ...CARVE_DEFAULTS, power, width: 16 }, origin: at, cut: null })!;
    expect("depth" in plain.settings).toBe(false);
  });

  it("each size is checked alike by the engine and the schema; operations from before D226 (no Depth, no Size) still fit", () => {
    expect(forceSettingsProblems("carve", { ...CARVE_DEFAULTS, depth: 3 })).toEqual([]);
    expect(forceSettingsProblems("carve", { ...CARVE_DEFAULTS, depth: null })).toEqual([]);
    expect(forceSettingsProblems("carve", { ...CARVE_DEFAULTS })).toEqual([]);
    expect(forceSettingsProblems("carve", { ...CARVE_DEFAULTS, depth: 13 }).length).toBe(1);
    expect(forceSettingsProblems("carve", { ...CARVE_DEFAULTS, depth: 2.5 }).length).toBe(1);
    expect(forceSettingsProblems("erupt", { ...ERUPT_DEFAULTS, size: 40 })).toEqual([]);
    expect(forceSettingsProblems("erupt", { ...ERUPT_DEFAULTS, size: null })).toEqual([]);
    const { size: _size, ...old } = ERUPT_DEFAULTS;
    expect(forceSettingsProblems("erupt", old)).toEqual([]);
    expect(forceSettingsProblems("erupt", { ...ERUPT_DEFAULTS, size: 4 }).length).toBe(1);
    expect(forceSettingsProblems("erupt", { ...ERUPT_DEFAULTS, size: 141 }).length).toBe(1);

    const s = session();
    const at = spot(s);
    const carveOp = (settings: Record<string, unknown>): ForceResultParams => ({ version: 1, verb: "carve", settings: { mode: "unleash", power: 70, wander: 35, width: null, seed: 1, walls: "steep", defyGravity: false, dry: true, ...settings } as never, where: { origin: at }, steps: 1, reason: "stopped", tiles: [at[1] * W + at[0]], heights: [Math.max(0, s.built.heights[at[1] * W + at[0]] - 1)], removed: [] });
    const eruptOp = (settings: Record<string, unknown>): ForceResultParams => ({ version: 1, verb: "erupt", settings: { ...ERUPT_DEFAULTS, ...settings } as never, where: { origin: at }, steps: 1, reason: "done", tiles: [at[1] * W + at[0]], heights: [Math.min(16, s.built.heights[at[1] * W + at[0]] + 1)], removed: [] });
    const good = [carveOp({ depth: 3 }), carveOp({}), eruptOp({ size: 40 }), eruptOp({ size: null }), eruptOp({ size: undefined })];
    const bad = [carveOp({ depth: 13 }), carveOp({ depth: 0 }), eruptOp({ size: 2 })];
    for (const p of good) {
      expect(s.apply({ op: "forceResult", params: JSON.parse(JSON.stringify(p)) }).errors, JSON.stringify(p.settings)).toEqual([]);
      s.undo();
    }
    for (const p of bad) expect(s.apply({ op: "forceResult", params: p }).errors.length, JSON.stringify(p.settings)).toBeGreaterThan(0);
    // the schema agrees with Ajv on each
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(opsSchema);
    for (const p of [...good, carveOp({ depth: 13 }), carveOp({ depth: 2.5 })]) {
      const v = { op: "forceResult", params: JSON.parse(JSON.stringify(p)) };
      expect(checkSchema(opsSchema as Record<string, unknown>, v).length === 0, JSON.stringify(p.settings)).toBe(validate(v));
    }
    expect(validate({ op: "forceResult", params: JSON.parse(JSON.stringify(carveOp({ depth: 3 }))) })).toBe(true);
    expect(validate({ op: "forceResult", params: carveOp({ depth: 13 }) })).toBe(false);
  });
});
