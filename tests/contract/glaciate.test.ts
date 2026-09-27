// Glaciate in the editor's worker and the document (PLAN §20 D246, D257, D258, D265, D266, D289, D291,
// D292): its planner is the investigation's round 4, byte for byte on its hero cases (with the floor's
// water left as round 4 left it); a click Flows and a drag Aims; through the start it completes and the
// start lands on level ground; Try another varies it; it is one operation, one undo step, stored
// literally (its springs and its tarn included), Esc drops all of it at once, and it replays to the
// same bytes; bound only by nature, it respects the height ceiling.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { MapSession } from "../../src/core/doc/session";
import { pieceTiles, startMiddle, startProblem } from "../../src/core/doc/tools";
import type { StartFeature } from "../../src/core/features/schema";
import { snapshotMap, type FullForceMap } from "../../src/core/forces/force";
import { GLACIATE_DEFAULTS, glaciateNextSeed } from "../../src/core/forces/glaciate/model";
import { makePlan } from "../../src/core/forces/glaciate/plan";
import { GlaciateRun } from "../../src/core/forces/glaciate/run";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { checkSchema } from "../../src/core/spec/schema";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { storedMap } from "../../investigation/forces-core/core/map";
import { makePlan as protoPlan } from "../../investigation/glaciate/model";

const history = () => ed.sessionInfo().history.filter((h) => h.applied);
const lastOp = () => history().at(-1)!;

/** The investigation's fixture (a snapshot of the editor's generator: Canyon 10 at 128²). */
function fixture(id: string): FullForceMap {
  const raw = readFileSync(join(__dirname, "../../investigation/glaciate/maps", `${id}.json.gz`));
  return storedMap(JSON.parse(strFromU8(gunzipSync(raw)))) as unknown as FullForceMap;
}

const digest = (m: Pick<FullForceMap, "heights" | "entities" | "water">) =>
  createHash("sha256")
    .update(m.heights)
    .update(JSON.stringify(m.entities.map((e) => e.id).sort()))
    .update(new Uint8Array(m.water.depth.buffer))
    .digest("hex");

/** The highest dry ground well inside the map (a glacier's head). */
function highGround(b: { W: number; H: number; heights: Uint8Array; water: ArrayLike<number> }): [number, number] {
  let best: [number, number] = [b.W >> 1, b.H >> 1];
  let top = -1;
  for (let y = 14; y < b.H - 14; y += 2)
    for (let x = 14; x < b.W - 14; x += 2) {
      const i = y * b.W + x;
      if (b.water[i] > 0 || b.heights[i] <= top) continue;
      top = b.heights[i];
      best = [x, y];
    }
  return best;
}

/** Run a glacier in the worker to its end, the page's way: frames until done, then kept. */
function run(req: ed.ForceRequest): { shown: Uint8Array } {
  const st = ed.forceStart(req);
  expect(st.errors).toEqual([]);
  let shown = st.frame?.heights ?? ed.terrainNow().heights.slice();
  for (let k = 0; k < 400; k++) {
    const f = ed.forceAdvance(1)!;
    expect(f.cue.verb).toBe("glaciate");
    if (f.heights) shown = f.heights;
    if (f.done) break;
  }
  const kept = ed.forceStop();
  expect(kept.errors).toEqual([]);
  expect(kept.kept).toBe(true);
  return { shown };
}

describe("Glaciate's planner is the investigation's (round 4, #69)", () => {
  it("gives the investigation's land, water and objects on its hero click and Kyler's cross-valley Aim, with the floor's water left as round 4 left it", () => {
    for (const [x, y, end] of [
      [22, 22, null],
      [24, 80, [96, 36]],
    ] as const) {
      const m = fixture("canyon-128");
      const intent = { origin: y * m.W + x, ...(end ? { end: end[1] * m.W + end[0] } : {}) };
      const settings = { ...GLACIATE_DEFAULTS, mode: end ? ("aim" as const) : ("flow" as const) };
      const p = makePlan(snapshotMap(m), settings, intent, undefined, false);
      const q = protoPlan(snapshotMap(m) as never, settings, intent);
      // (the investigation moves the start itself; in the editor the start is the editor's, D257)
      const without = (e: { template: string }) => e.template !== "StartingLocation";
      expect(digest({ ...p.map, entities: p.map.entities.filter(without) }), `${x},${y}`).toBe(digest({ ...(q.map as unknown as FullForceMap), entities: q.map.entities.filter(without) }));
    }
  });

  it("finishes the floor's water (D292): the river visits the falls' pools and inflows, and no join runs along a wall's foot", () => {
    const m = fixture("canyon-128");
    const p = makePlan(snapshotMap(m), GLACIATE_DEFAULTS, { origin: 22 * m.W + 22 });
    expect(p.finished.reached).toBeGreaterThan(0);
    for (const j of p.joins) expect(j.length, j.kind).toBeLessThanOrEqual(j.kind === "inflow" ? 40 : 12);
  });

  it("is sliced without changing its result, and never goes past the ceiling", () => {
    const m = fixture("canyon-128");
    const whole = makePlan(snapshotMap(m), GLACIATE_DEFAULTS, { origin: 22 * m.W + 22 });
    const r = new GlaciateRun(snapshotMap(m), GLACIATE_DEFAULTS, { origin: 22 * m.W + 22 });
    let planning = 0;
    while (!r.planned) {
      r.step();
      planning++;
    }
    expect(planning).toBeGreaterThan(1);
    r.finishAll();
    expect(Array.from(r.final()!.heights)).toEqual(Array.from(whole.map.heights));
    const low = { ...snapshotMap(m), maxHeight: 16 };
    const p = makePlan(low, GLACIATE_DEFAULTS, { origin: 22 * m.W + 22 });
    for (let i = 0; i < p.map.heights.length; i++) if (p.map.heights[i] !== m.heights[i]) expect(p.map.heights[i]).toBeLessThanOrEqual(16);
  });
});

describe("Glaciate in the editor's worker", () => {
  it("a click Flows and a drag Aims; Esc drops all of it at once; its end is one step exactly as shown; Try another varies it and undo brings the first back", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const at = highGround(s.built);
    const before = ed.terrainNow().heights.slice();
    const n0 = history().length;
    // Esc: all of it goes at once, and the history never had it
    expect(ed.forceStart({ verb: "glaciate", settings: GLACIATE_DEFAULTS, origin: at, cut: null }).errors).toEqual([]);
    for (let k = 0; k < 40; k++) ed.forceAdvance(1);
    const back = ed.forceCancel();
    expect(Array.from(back.heights!)).toEqual(Array.from(before));
    expect(ed.forcing()).toBe(false);
    expect(history().length).toBe(n0);
    // a click: it Flows
    const { shown } = run({ verb: "glaciate", settings: GLACIATE_DEFAULTS, origin: at, cut: null });
    expect(history().length).toBe(n0 + 1);
    expect(lastOp().label).toBe("Glaciate");
    const first = ed.terrainNow().heights.slice();
    expect(Array.from(first)).toEqual(Array.from(shown));
    expect(Array.from(first)).not.toEqual(Array.from(before));
    const op1 = MapSession.open(decodeProject(ed.project().bytes)).logOps.at(-1)!.params as ForceResultParams;
    expect(op1.verb).toBe("glaciate");
    expect(op1.settings.mode).toBe("flow");
    expect(op1.where.end).toBeUndefined();
    expect(op1.sources?.length).toBeGreaterThan(0);
    // Try another: the same glacier from the same land, the next personality; it replaces the first
    const again = ed.forceAgain();
    expect(again.errors).toEqual([]);
    expect(again.verb).toBe("glaciate");
    expect(again.settings!.seed).toBe(glaciateNextSeed(GLACIATE_DEFAULTS.seed));
    for (let k = 0; k < 400 && !ed.forceAdvance(4)!.done; k++);
    expect(ed.forceStop().kept).toBe(true);
    expect(lastOp().label).toBe("Try another");
    expect(history().length).toBe(n0 + 2);
    const second = ed.terrainNow().heights.slice();
    let differ = 0;
    for (let i = 0; i < second.length; i++) if (second[i] !== first[i]) differ++;
    expect(differ).toBeGreaterThan(50);
    ed.undo();
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(first));
    ed.undo();
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(before));
    // a drag: it Aims, grinding through to where it was dragged
    const end: [number, number] = [Math.min(W - 12, Math.max(12, W - at[0])), Math.min(W - 12, Math.max(12, W - at[1]))];
    run({ verb: "glaciate", settings: GLACIATE_DEFAULTS, origin: at, end, cut: null });
    const op2 = MapSession.open(decodeProject(ed.project().bytes)).logOps.at(-1)!.params as ForceResultParams;
    expect(op2.settings.mode).toBe("aim");
    expect(op2.where.end).toEqual(end);
    ed.undo();
    ed.settleWater();
  });

  it("through the start it completes, and the start lands on level ground in the same undo step (D257)", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const st = open().built.start!;
    const n0 = history().length;
    run({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 70 }, origin: [Math.max(12, st.x - 30), st.y], end: [Math.min(W - 12, st.x + 30), st.y], cut: null });
    expect(history().length).toBe(n0 + 1);
    const s = open();
    // it went through the start's ground
    const p = s.logOps.findLast((o) => o.op === "forceResult")!.params as ForceResultParams;
    const cut = new Set(p.tiles);
    let under = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cut.has((st.y + dy) * W + st.x + dx)) under++;
    expect(under).toBeGreaterThan(0);
    // and the start stands on level ground, off rivers and objects (carried there, or on the new floor)
    expect(s.built.entities.filter((e) => e.template === "StartingLocation")).toHaveLength(1);
    const where = startMiddle(s)!;
    const f = s.features.find((g) => g.kind === "start") as StartFeature;
    const problem = startProblem(s.built, where[0], where[1], f.params.orientation, true, f.id, pieceTiles(s));
    expect(problem === null || problem === "under water", String(problem)).toBe(true);
    ed.undo();
    expect(startMiddle(open())).toEqual([st.x, st.y]);
    ed.settleWater();
  });

  it("replays to the same bytes: the project file reopens it, its springs and tarn, and the export is the same", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const at = highGround(MapSession.open(decodeProject(ed.project().bytes)).built);
    run({ verb: "glaciate", settings: GLACIATE_DEFAULTS, origin: at, cut: null });
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    const p = s.logOps.at(-1)!.params as ForceResultParams;
    for (const q of p.sources ?? []) expect(s.built.entities.some((e) => e.id === q.id && e.template === "WaterSource"), q.id).toBe(true);
    s.settleCanonical();
    again.settleCanonical();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
    // the schema takes it, and agrees with Ajv
    const op = { op: "forceResult", params: p };
    expect(checkSchema(opsSchema as Record<string, unknown>, op)).toEqual([]);
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    expect(ajv.compile(opsSchema)(op)).toBe(true);
    ed.undo();
    ed.settleWater();
  });
});
