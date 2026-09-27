// Unleash, on a source (PLAN §20 D239): a placed source carves its own course with Carve's engine.
// From a pool it breaks out where the water would spill over (its rim's lowest point); aimed, where
// the rim is nearest the aim. Its strength sets the river's width. The source stays its origin: no
// second source; one undo step; Esc takes it all back; Try another re-rolls the course; a badwater
// source carves a badwater river. Stored literally as the forces' one operation, so it replays.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { checkSchema } from "../../src/core/spec/schema";
import { forceProblems } from "../../src/core/forces/op";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { breakout, sourceTile, strengthOfWidth, unleashWidth } from "../../src/core/forces/carve/unleash";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("Unleash, on a source (D239)", () => {
  it("from a pool it breaks out at its rim's lowest point; aimed, where the rim is nearest the aim; out of water, at the source; never on ground it keeps (the layer showing, caves)", () => {
    const W = 40;
    const H = 40;
    const heights = new Uint8Array(W * H).fill(8);
    const depth = new Float64Array(W * H);
    // a pool round (20, 20): its floor at 4, its water up to 6.5; its rim at 8, but a notch at 7 east
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (Math.hypot(x - 20, y - 20) < 6) {
          heights[i] = 4;
          depth[i] = 2.5;
        }
      }
    for (let x = 26; x < 32; x++) heights[20 * W + x] = 7;
    const b = breakout(W, H, heights, depth, 20 * W + 20);
    expect(b.origin).toBe(20 * W + 26);
    expect(b.spill).toBe(20 * W + 26);
    expect(b.pool).toContain(20 * W + 20);
    expect(b.pool!.length).toBeGreaterThan(80);
    expect(b.pool).not.toContain(20 * W + 26);
    // aimed north: where the rim is nearest (20, 2)
    expect(breakout(W, H, heights, depth, 20 * W + 20, null, 2 * W + 20).origin).toBe(14 * W + 20);
    // out of water it starts at the source
    expect(breakout(W, H, heights, depth, 5 * W + 5)).toEqual({ origin: 5 * W + 5, pool: null, spill: null });
    // never on ground it keeps (the land above the layer showing; the start's is nature's since
    // D257): the next lowest
    const keep = new Uint8Array(W * H);
    keep[20 * W + 26] = 1;
    expect(breakout(W, H, heights, depth, 20 * W + 20, keep).origin).not.toBe(20 * W + 26);
    // a badwater source's water rises from its middle
    expect(sourceTile({ template: "BadwaterSource", x: 3, y: 4 }, W)).toBe(5 * W + 4);
    expect(sourceTile({ template: "WaterSource", x: 3, y: 4 }, W)).toBe(4 * W + 3);
  });

  it("its width follows the source's strength: the width whose Keep river source has that strength", () => {
    let last = 0;
    for (const s of [0.5, 1, 2, 3, 4, 6, 8]) {
      const w = unleashWidth(s);
      expect(w).toBeGreaterThanOrEqual(2);
      expect(w).toBeLessThanOrEqual(24);
      expect(w).toBeGreaterThan(last);
      last = w;
      expect(Math.abs(strengthOfWidth(w) - s)).toBeLessThan(0.08);
    }
    expect(unleashWidth(64)).toBe(24);
  });

  it("in the editor's worker: one undo step, the source stays its origin (no second source), its width from its strength, aimed by an end; Esc takes it all back; Try another replaces it; a badwater source's river is badwater", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const s0 = open();
    const st = s0.built.start!;
    // dry high ground far from the start
    let best: [number, number] = [0, 0];
    let far = -1;
    for (let y = 12; y < W - 12; y += 3)
      for (let x = 12; x < W - 12; x += 3) {
        const i = y * W + x;
        if (s0.built.water[i] > 0) continue;
        const d = Math.hypot(x - st.x, y - st.y) + s0.built.heights[i] * 2;
        if (d > far) {
          far = d;
          best = [x, y];
        }
      }
    const id = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
    const placed = ed.apply({ op: "placeEntity", params: { id, template: "WaterSource", x: best[0], y: best[1], orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } });
    expect(placed.errors).toEqual([]);
    const sources = (s: MapSession) => s.built.entities.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource").length;
    const before = open();
    const n0 = before.history().filter((h) => h.applied).length;
    const heights0 = Array.from(before.built.heights);

    // Esc (the worker's forceCancel): all of it goes
    const run = (end?: [number, number]) => {
      const started = ed.forceStart({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: end ? "aim" : "unleash", power: 70 }, origin: best, ...(end ? { end } : {}), cut: null, source: id });
      expect(started.errors, JSON.stringify({ end, best })).toEqual([]);
      for (let k = 0; k < 300; k++) if (ed.forceAdvance(4)!.done) break;
    };
    run();
    ed.forceCancel();
    expect(Array.from(open().built.heights)).toEqual(heights0);
    expect(open().history().filter((h) => h.applied).length).toBe(n0);

    // kept: one step, the source still its origin, no second one, its width from its strength
    run();
    expect(ed.forceStop().kept).toBe(true);
    const s1 = open();
    const op = s1.logOps.at(-1)!;
    expect(op.op).toBe("forceResult");
    const p = op.params as ForceResultParams;
    expect(p.where.source).toBe(id);
    expect(p.source).toBeUndefined();
    expect(p.settings).toMatchObject({ dry: true, width: unleashWidth(4), power: 70 });
    expect(s1.history().filter((h) => h.applied).length).toBe(n0 + 1);
    expect(s1.history().at(-1)!.label).toBe("Unleash a source");
    expect(sources(s1)).toBe(sources(before));
    expect(s1.built.entities.some((e) => e.id === id)).toBe(true);
    expect(Array.from(s1.built.heights)).not.toEqual(heights0);
    // it replays the same land
    expect(Array.from(MapSession.open(decodeProject(s1.project())).built.heights)).toEqual(Array.from(s1.built.heights));
    // Try another: another course, replacing it; undo brings the first back
    const again = ed.forceAgain();
    expect(again.errors).toEqual([]);
    for (let k = 0; k < 300; k++) if (ed.forceAdvance(4)!.done) break;
    expect(ed.forceStop().kept).toBe(true);
    const s2 = open();
    expect(s2.history().at(-1)!.label).toBe("Try another course");
    expect(s2.history().filter((h) => h.applied).length).toBe(n0 + 2);
    ed.undo();
    ed.undo();
    expect(Array.from(open().built.heights)).toEqual(heights0);

    // aimed: dragged to an end (the lowest ground 15 to 25 tiles away: water runs downhill); uphill,
    // it says so
    let end: [number, number] = best;
    let high: [number, number] = best;
    for (let y = 4; y < W - 4; y++)
      for (let x = 4; x < W - 4; x++) {
        const d = Math.hypot(x - best[0], y - best[1]);
        if (d < 15 || d > 25) continue;
        if (s0.built.heights[y * W + x] < s0.built.heights[end[1] * W + end[0]]) end = [x, y];
        if (s0.built.heights[y * W + x] > s0.built.heights[high[1] * W + high[0]]) high = [x, y];
      }
    if (s0.built.heights[high[1] * W + high[0]] > s0.built.heights[best[1] * W + best[0]]) {
      const uphill = ed.forceStart({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 70 }, origin: best, end: high, cut: null, source: id });
      expect(uphill.errors[0]).toMatch(/uphill of the source/);
    }
    run(end);
    expect(ed.forceStop().kept).toBe(true);
    const aimed = open().logOps.at(-1)!.params as ForceResultParams;
    expect(aimed.settings.mode).toBe("aim");
    expect(aimed.where.end).toEqual(end);
    expect(aimed.where.source).toBe(id);
    ed.undo();

    // a badwater source's river is badwater: the water it shows as it carves is bad
    const bad = "1b1c2d3e-4f50-4617-8899-aabbccddeeff";
    expect(ed.apply({ op: "deleteEntities", params: { entities: [id] } }).errors).toEqual([]);
    // (its 3 x 3 on level, dry ground, away from the start)
    const s3 = open();
    let spot: [number, number] | null = null;
    for (let y = 10; y < W - 10 && !spot; y += 2)
      for (let x = 10; x < W - 10 && !spot; x += 2) {
        if (Math.hypot(x - st.x, y - st.y) < 20) continue;
        const h = s3.built.heights[y * W + x];
        let level = true;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (s3.built.heights[(y + dy) * W + x + dx] !== h || s3.built.water[(y + dy) * W + x + dx] > 0) level = false;
        if (level && h >= 4) spot = [x, y];
      }
    expect(spot).not.toBeNull();
    expect(ed.apply({ op: "placeEntity", params: { id: bad, template: "BadwaterSource", x: spot![0], y: spot![1], orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } }).errors).toEqual([]);
    const sb = ed.forceStart({ verb: "carve", settings: { ...CARVE_DEFAULTS, power: 70 }, origin: [spot![0] + 1, spot![1] + 1], cut: null, source: bad });
    expect(sb.errors).toEqual([]);
    let contaminated = 0;
    for (let k = 0; k < 120; k++) {
      const f = ed.forceAdvance(4)!;
      if (f.water) for (const c of f.water.contamination) if (c > 0.5) contaminated++;
      if (f.done) break;
    }
    expect(contaminated).toBeGreaterThan(0);
    expect(ed.forceStop().kept).toBe(true);
    expect((open().logOps.at(-1)!.params as ForceResultParams).where.source).toBe(bad);
  });

  it("its operation names the source it unleashed; the engine and the schema agree; only a carve names one, adding none of its own", () => {
    const base: ForceResultParams = { version: 1, verb: "carve", settings: { mode: "unleash", power: 70, wander: 35, width: 7.5, seed: 0, walls: "steep", defyGravity: false, dry: true }, where: { origin: [3, 4], source: "0b1c2d3e-4f50-4617-8899-aabbccddeeff" }, steps: 10, reason: "power spent", tiles: [4 * 16 + 3], heights: [2], removed: [] };
    expect(forceProblems(base, 16, 16, 22)).toEqual([]);
    expect(forceProblems({ ...base, verb: "craterize" as never, settings: { mode: "strike", power: 40, size: null, walls: "steep", centre: "auto", debris: "light", rays: false, seed: 0 } }, 16, 16, 22).length).toBe(1);
    expect(forceProblems({ ...base, source: { id: "1b1c2d3e-4f50-4617-8899-aabbccddeeff", x: 3, y: 4, strength: 2 } }, 16, 16, 22).length).toBe(1);
    expect(forceProblems({ ...base, where: { ...base.where, source: "" } }, 16, 16, 22).length).toBe(1);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(opsSchema);
    for (const v of [{ op: "forceResult", params: base }, { op: "forceResult", params: { ...base, where: { ...base.where, source: "" } } }, { op: "forceResult", params: { ...base, where: { ...base.where, source: 7 } } }])
      expect(checkSchema(opsSchema as Record<string, unknown>, v).length === 0, JSON.stringify(v.params.where)).toBe(validate(v));
    expect(validate({ op: "forceResult", params: base })).toBe(true);
  });
});
