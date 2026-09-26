// Live editing, first phase (Kyler's triage): an edit never waits on the water. The editor's map
// shows the last settled water on the new ground at once ("defer"), settles it in the background
// from there (the live water), and the canonical settle follows, always before an export: a file
// never gets anything but the canonical settle, so the bytes are what they were. Imported maps
// warm-start from their own water, so their first edit is quick too. The checks run on a replica
// that follows the editor's map by its log, and the replica equals the map it follows.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planContextOf, planLake, planLandform } from "../../src/core/doc/tools";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { staleWater } from "../../src/core/sim/preview";
import { waterModel } from "../../src/core/sim/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const box = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) out.push([y, x0, x1]);
  return out;
};

/** A dry spot beside deep water, away from the start. */
function besideWater(s: MapSession): [number, number] {
  const b = s.built;
  for (let i = 0; i < W * W; i += 3) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (x < 12 || y < 12 || x > W - 14 || y > W - 14 || b.water[i] > 0) continue;
    if (b.start && Math.hypot(x - b.start.x, y - b.start.y) < 20) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (b.water[(y + dy) * W + x + dx] > 0.3) return [x, y];
  }
  throw new Error("no spot beside the water");
}

describe("an edit never waits on the water (live editing)", () => {
  it("the edit shows the last settled water on its new ground, the water settles after, and the export is the canonical file", () => {
    const r = generate(makeSpec({ seed: 3, size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const [x, y] = besideWater(s);
    const before = s.lastSettled()!;
    expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: box(x - 2, y - 2, x + 2, y + 2), amount: 2 } }).ok).toBe(true);
    // no settle ran: the map shows the last settled water, carried to the new ground
    expect(s.waterStale).toBe(true);
    expect(s.waterPending).toBe(true);
    expect(s.built.settle.ticks).toBe(0);
    expect(s.lastSettled()!.water).toBe(before.water);
    // the canonical settle follows (the background check does it in slices), and the export is
    // exactly the full build's file
    s.settleCanonical();
    expect(s.waterStale).toBe(false);
    const full = s.fullBuild();
    expect(Array.from(s.built.water)).toEqual(Array.from(full.water));
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(writeTimber(s.exportFile(full))))).toBe(true);
  });

  it("undo back to the settled map takes its settled water, with no settle", () => {
    const r = generate(makeSpec({ seed: 5, size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const water = Array.from(s.built.water);
    const [x, y] = besideWater(s);
    s.apply({ op: "sculpt", params: { mode: "raise", cells: box(x - 1, y - 1, x + 1, y + 1), amount: 1 } });
    expect(s.waterStale).toBe(true);
    s.undo();
    expect(s.waterStale).toBe(false);
    expect(Array.from(s.built.water)).toEqual(water);
  });

  it("stale water: raised ground comes out of the water, lowered ground under water keeps the surface, dry ground stays dry", () => {
    const heights = new Uint8Array(9).fill(4);
    const before = waterModel(3, 3, heights, []);
    const depth = new Float64Array(9);
    depth[0] = 1.5; // wet, raised to 6: out of the water
    depth[1] = 0.5; // wet, lowered to 2: the surface (4.5) stays
    const settled = { settled: true, ticks: 10, depth, contamination: new Float64Array(9), sat: new Uint8Array(9) };
    const next = heights.slice();
    next[0] = 6;
    next[1] = 2;
    next[2] = 1; // dry, lowered: stays dry
    const w = staleWater({ model: before, water: settled }, waterModel(3, 3, next, []));
    expect(w.depth[0]).toBe(0);
    expect(w.depth[1]).toBeCloseTo(2.5, 10);
    expect(w.depth[2]).toBe(0);
    expect(w.stale).toBe(true);
    expect(w.preview).toBe(true);
  });

  it("the worker's session: the edit answers at once, the background settle puts the settled water in place", async () => {
    await runGenerate(makeSpec({ seed: 21, size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const v = ed.sessionView();
    let at: [number, number] | null = null;
    for (let i = W * 16; i < W * (W - 16) && !at; i += 3) {
      const x = i % W;
      if (x > 16 && x < W - 16 && v.view.heights[i] > 3) at = [x, Math.floor(i / W)];
    }
    const u = ed.apply({ op: "sculpt", params: { mode: "lower", cells: box(at![0] - 2, at![1] - 2, at![0] + 2, at![1] + 2), amount: 1 } });
    expect(u.ok).toBe(true);
    expect(u.view.heights).toBeDefined();
    expect(ed.waterSettling()).toBe(true);
    ed.settleWater();
    expect(ed.waterSettling()).toBe(false);
    // the canonical settle and every check follow; the export is canonical
    const bg = await ed.backgroundCheck();
    expect(bg).not.toBeNull();
    expect((await ed.exportTimber(true)).ok).toBe(true);
  });
});

describe("the checks' replica follows the editor's map by its log", () => {
  it("after edits, an undo, a redo and new edits, the replica's map is the editor's", () => {
    const r = generate(makeSpec({ seed: 11, size: { x: W, y: W } }));
    const a = MapSession.fromGenerated(r, r.file);
    a.setWaterMode("defer");
    const b = MapSession.open(a.document);
    b.setWaterMode("defer");
    const same = () => {
      b.followLog(a.logOps.map((o) => JSON.parse(JSON.stringify(o))), 0);
      expect(Array.from(b.built.heights)).toEqual(Array.from(a.built.heights));
      expect(b.built.entities.map((e) => e.id)).toEqual(a.built.entities.map((e) => e.id));
      expect(b.features).toEqual(a.features);
    };
    const [x, y] = besideWater(a);
    a.apply({ op: "sculpt", params: { mode: "raise", cells: box(x - 2, y - 2, x + 2, y + 2), amount: 2 } });
    same();
    const lake = planLake({ outline: [[20.5, 70.5], [30.5, 70.5], [30.5, 78.5], [20.5, 78.5]], spring: 0.5 }, planContextOf(a), "0b8e9a64-1111-4c2d-9e1f-2a3b4c5d6e7f");
    if (lake.ok) a.applyAll(lake.ops, "user", lake.label);
    same();
    a.undo();
    same();
    a.redo();
    same();
    a.undo();
    a.apply({ op: "sculpt", params: { mode: "lower", cells: box(x, y, x + 3, y + 3), amount: 1 } });
    same();
  });
});

describe("an imported map's first edit starts from its own water", () => {
  it("the edit carries the file's water over; no settle runs before it answers", () => {
    const r = generate(makeSpec({ seed: 9, size: { x: W, y: W } }));
    const s = MapSession.importMap(r.bytes, "Import.timber");
    s.setWaterMode("defer");
    // unedited, the map shows the file's water, and that is where a settle starts from
    expect(s.showsStoredWater).toBe(true);
    const from = s.lastSettled();
    expect(from).not.toBeNull();
    expect(from!.water.preview).toBe(true);
    const [x, y] = besideWater(MapSession.fromGenerated(r, r.file));
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: box(x - 1, y - 1, x + 1, y + 1), amount: 1 } }).ok).toBe(true);
    expect(s.waterStale).toBe(true);
    expect(s.built.settle.ticks).toBe(0);
    // and the canonical file follows as before
    s.settleCanonical();
    expect(s.waterPending).toBe(false);
  });
});

describe("drawn landforms stand on the ground, and say the level they reach", () => {
  it("a gentle hill never lowers the ground under it, and a small one says it tops out lower", () => {
    const r = generate(makeSpec({ seed: 3, size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const ctx = planContextOf(s);
    // a spot away from the start, on ground that is not flat
    let at: [number, number] = [70, 20];
    for (let y = 14; y < W - 14; y += 5)
      for (let x = 14; x < W - 14; x += 5) {
        if (s.built.start && Math.hypot(x - s.built.start.x, y - s.built.start.y) < 20) continue;
        let lo = 99;
        let hi = 0;
        for (let dy = -6; dy <= 6; dy++)
          for (let dx = -6; dx <= 6; dx++) {
            const h = s.built.heights[(y + dy) * W + x + dx];
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        if (hi - lo >= 2) at = [x, y];
      }
    const outline: [number, number][] = [[at[0] - 6.5, at[1] - 6.5], [at[0] + 6.5, at[1] - 6.5], [at[0] + 6.5, at[1] + 6.5], [at[0] - 6.5, at[1] + 6.5]];
    const p = planLandform({ outline, kind: "hill", edgeStyle: "gentle", height: 16 }, ctx, "0b8e9a64-5555-4c2d-9e1f-2a3b4c5d6e7f");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    // 13 tiles across climb only a few levels: the plan says so before it is placed
    expect(p.report[0]).toMatch(/^reaches level \d+ here, not 16/);
    const reached = Number(/reaches level (\d+)/.exec(p.report[0])![1]);
    const before = s.built.heights.slice();
    expect(s.applyAll(p.ops, "user", p.label).ok).toBe(true);
    let top = 0;
    for (const i of p.tiles) {
      expect(s.built.heights[i]).toBeGreaterThanOrEqual(Math.min(before[i], 16) - (s.built.channel[i] ? 16 : 0));
      top = Math.max(top, s.built.heights[i]);
    }
    expect(top).toBeGreaterThanOrEqual(reached);
  });
});

describe("Generate, keeping my edits, with a moved start", () => {
  it("does not retry every layout when only the player's edits fail a check", () => {
    const r = generate(makeSpec({ seed: 1, size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    const start = s.features.find((f) => f.kind === "start")!;
    const pos = (start.params as { position: [number, number] }).position;
    // the start moved somewhere the new layout will not give it water or plants
    s.apply({ op: "updateFeature", params: { id: start.id, patch: { params: { position: [W - 8, 8], benchLevel: 1, bank: null } } } });
    void pos;
    const g = s.regenerate({ designedFor: "hard", settings: makeSpec({ seed: 1, size: { x: W, y: W }, designedFor: "hard" }).settings });
    expect(g.ok).toBe(true);
    if (g.editProblems.length) {
      // the generator's own map passed: one attempt, and the edits' problems are named
      expect(g.attempts).toBe(1);
      expect(g.editProblems.every((c) => c.id.length > 0 && c.message.length > 0)).toBe(true);
    } else expect(g.report!.passed).toBe(true);
  });
});
