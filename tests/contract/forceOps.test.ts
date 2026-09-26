// The four forces in the document and the editor's worker (PLAN §20 D202, D203, D206, D219, D220):
// each force is one `forceResult` operation, one undo step, stored literally, so it replays to the
// same bytes; Esc drops all of it; Try another replaces it and undo brings the earlier one back; a
// force keeps what the page showed; forces, brushes and placements share one history, the project
// file (format 3) and the .timber export. A carve saved as the carve operation of before still opens
// and replays exactly.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { carveParams, forceMapOf } from "../../src/core/forces/carve/result";
import { CarveRun, DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import type { ForceResultParams } from "../../src/core/forces/op";
import { QUAKE_DEFAULTS, type Point } from "../../src/core/forces/quake";
import { generate } from "../../src/core/gen/generate";
import { checkSchema } from "../../src/core/spec/schema";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

/** Dry ground far from the start (and a little high), for a force to act on. */
function farFromStart(b: { W: number; H: number; heights: Uint8Array; water: ArrayLike<number>; start?: { x: number; y: number } }): [number, number] {
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 16; y < b.H - 16; y += 4)
    for (let x = 16; x < b.W - 16; x += 4) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i];
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

/** A fault across the map's far half from the start, and the side away from it. */
function faultAway(b: { W: number; H: number; start?: { x: number; y: number } }): { path: Point[]; side: 1 | -1 } {
  const st = b.start!;
  const y = st.y < b.H / 2 ? Math.round(b.H * 0.72) : Math.round(b.H * 0.28);
  // a stroke eastward: side 1 moves the tiles north of it (y above the line)
  return { path: [{ x: 4, y }, { x: b.W * 0.5, y: y + 1.5 }, { x: b.W - 5, y }], side: st.y < y ? 1 : -1 };
}

const history = () => ed.sessionInfo().history.filter((h) => h.applied);
const lastOp = () => ed.sessionInfo().history.filter((h) => h.applied).at(-1)!;

/** Run the force in the worker to its end, the page's way: frames until done, then kept. */
function run(req: ed.ForceRequest, shown: { h: Uint8Array }) {
  const st = ed.forceStart(req);
  expect(st.errors).toEqual([]);
  if (st.frame?.heights) shown.h = st.frame.heights;
  for (let k = 0; k < 400; k++) {
    const f = ed.forceAdvance(2)!;
    expect(f).not.toBeNull();
    expect(f.cue.verb).toBe(req.verb);
    if (f.heights) shown.h = f.heights;
    if (f.done) break;
  }
  const kept = ed.forceStop();
  expect(kept.errors).toEqual([]);
  expect(kept.kept).toBe(true);
  return kept;
}

describe("the forces at work in the editor's worker (D202, D203, D206, D219)", () => {
  it("each force frames as it runs, Esc drops all of it, its end keeps it as one step exactly as shown, and Try another replaces it", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const ground = ed.sessionView().view.heights.slice();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const at = farFromStart(s.built);
    const fault = faultAway(s.built);
    const cases: [string, ed.ForceRequest, RegExp][] = [
      ["Craterize, Strike", { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: at, cut: null }, /^Craterize$/],
      ["Craterize, Aim", { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "aim", power: 45, rays: true }, origin: at, end: [at[0] + (at[0] < W / 2 ? 20 : -20), at[1]], cut: null }, /^Craterize$/],
      ["Erupt, Vent", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 45 }, origin: at, cut: null }, /^Erupt$/],
      ["Erupt, Fissure", { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 45 }, origin: at, path: [{ x: at[0] - 10, y: at[1] }, { x: at[0] + 12, y: at[1] + 3 }], cut: null }, /^Erupt a fissure$/],
      ["Quake, Lift", { verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 60 }, ...fault, cut: null }, /^Quake: lift$/],
      ["Quake, Slide", { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 60 }, ...fault, cut: null }, /^Quake: slide$/],
    ];
    for (const [name, req, label] of cases) {
      const n0 = history().length;
      const before = ed.terrainNow().heights.slice();
      // Esc: all of it goes at once, and the history never had it
      expect(ed.forceStart(req).errors, name).toEqual([]);
      expect(ed.forcing()).toBe(true);
      for (let k = 0; k < 6; k++) ed.forceAdvance(2);
      const back = ed.forceCancel();
      expect(Array.from(back.heights!), name).toEqual(Array.from(before));
      expect(ed.forcing()).toBe(false);
      expect(history().length).toBe(n0);
      // to its end: one step, the ground exactly as the page showed it
      const shown = { h: before };
      const kept = run(req, shown);
      expect(history().length, name).toBe(n0 + 1);
      expect(lastOp().label, name).toMatch(label);
      const first = ed.terrainNow().heights.slice();
      expect(Array.from(first), name).toEqual(Array.from(shown.h));
      expect(Array.from(first), name).not.toEqual(Array.from(before));
      expect(kept.info.forceAgain).toBe(req.verb);
      // Try another: the same force from the same land, the next seed; it replaces the first
      const again = ed.forceAgain();
      expect(again.errors, name).toEqual([]);
      expect(again.verb).toBe(req.verb);
      expect(again.settings!.seed).toBe((req.settings.seed ?? 0) + 1);
      for (let k = 0; k < 400 && !ed.forceAdvance(4)!.done; k++);
      expect(ed.forceStop().kept).toBe(true);
      expect(lastOp().label, name).toMatch(/^Try another$/);
      expect(history().length).toBe(n0 + 2);
      // undo: the first, exactly; again: the land before it
      ed.undo();
      expect(Array.from(ed.terrainNow().heights), name).toEqual(Array.from(first));
      ed.undo();
      expect(Array.from(ed.terrainNow().heights), name).toEqual(Array.from(before));
      expect(ed.sessionInfo().forceAgain).toBe(null);
    }
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(ground));
    ed.settleWater();
  });

  it("a painted Lift shows its whole result as it is painted, and is kept when it's let go", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const fault = faultAway(s.built);
    const before = ed.terrainNow().heights.slice();
    const st = ed.forceStart({ verb: "quake", settings: QUAKE_DEFAULTS, path: fault.path.slice(0, 2), side: fault.side, cut: null, painting: true });
    expect(st.errors).toEqual([]);
    const short = st.frame!.heights!.slice();
    expect(Array.from(short)).not.toEqual(Array.from(before));
    const f = ed.forcePaint(fault.path, fault.side)!;
    expect(f.heights).toBeTruthy();
    const long = f.heights!;
    let more = 0;
    for (let i = 0; i < long.length; i++) if (long[i] !== before[i] && short[i] === before[i]) more++;
    expect(more).toBeGreaterThan(20);
    expect(ed.forceStop().kept).toBe(true);
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(long));
    expect(lastOp().label).toBe("Quake: lift");
    ed.settleWater();
  });

  it("refuses where the start sits, with the quiet word, and changes nothing", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const st = s.built.start!;
    const n0 = history().length;
    const on: [number, number] = [st.x, st.y];
    for (const req of [
      { verb: "craterize", settings: CRATER_DEFAULTS, origin: on, cut: null },
      { verb: "erupt", settings: ERUPT_DEFAULTS, origin: on, cut: null },
      { verb: "quake", settings: QUAKE_DEFAULTS, path: [{ x: st.x - 20, y: st.y }, { x: st.x + 20, y: st.y }], side: 1, cut: null },
    ] as ed.ForceRequest[]) {
      const r = ed.forceStart(req);
      expect(r.ok, req.verb).toBe(false);
      expect(r.errors[0]).toBe("Start here");
      expect(ed.forcing()).toBe(false);
    }
    // a Slide that would carry the start is refused too (X flips the side that moves)
    const across = { verb: "quake" as const, settings: { ...QUAKE_DEFAULTS, mode: "slide" as const }, path: [{ x: 3, y: st.y + 12 }, { x: W - 4, y: st.y + 12 }], cut: null };
    const one = ed.forceStart({ ...across, side: -1 });
    const other = ed.forceStart({ ...across, side: 1 });
    expect([one.ok, other.ok].filter((ok) => !ok).length).toBeGreaterThanOrEqual(1);
    if (ed.forcing()) ed.forceCancel();
    expect(history().length).toBe(n0);
  });
});

/** A force's operation on a map session, run whole (no worker). */
function forceOp(s: MapSession, verb: "craterize" | "erupt" | "quake"): EditOp {
  const b = s.built;
  const at = farFromStart(b);
  const fault = faultAway(b);
  const req: ed.ForceRequest =
    verb === "craterize"
      ? { verb, settings: { ...CRATER_DEFAULTS, power: 40, rays: true }, origin: at, cut: null }
      : verb === "erupt"
        ? { verb, settings: { ...ERUPT_DEFAULTS, power: 40 }, origin: at, cut: null }
        : { verb, settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 50 }, ...fault, cut: null };
  return { op: "forceResult", params: paramsOf(s, req) };
}

/** What the worker would keep for `req` on the session's map, run to its end. */
function paramsOf(s: MapSession, req: ed.ForceRequest): ForceResultParams {
  ed.setEditorWaterMode("defer");
  ed.openProject(s.project());
  const r = ed.forceStart(req);
  expect(r.errors).toEqual([]);
  for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
  const kept = ed.forceStop();
  expect(kept.errors).toEqual([]);
  const op = MapSession.open(decodeProject(ed.project().bytes)).logOps.at(-1)!;
  expect(op.op).toBe("forceResult");
  return op.params as ForceResultParams;
}

describe("the forces in the document (breakage rule)", () => {
  it("forces, brushes and placements share one history: undo and redo in any order give the same maps, the project file reopens them, and the export is the same bytes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const maps: Uint8Array[] = [s.built.heights.slice()];
    const st = s.built.start!;
    const dabs: number[] = [];
    for (let k = 0; k < 20; k++) for (let x = st.x + 8; x <= st.x + 14; x++) dabs.push(4 * x + 2, 4 * (st.y + 9) + 2);
    const ops: EditOp[] = [
      { op: "brush", params: { tool: "raise", size: 3, strength: 10, dabs } },
      forceOp(s, "craterize"),
      { op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "Pine", x: st.x + 10, y: st.y - 9, orientation: "Cw0" } },
    ];
    for (const op of ops) {
      const u = s.apply(op, "user");
      expect(u.errors, op.op).toEqual([]);
      maps.push(s.built.heights.slice());
    }
    for (const verb of ["erupt", "quake"] as const) {
      const op = forceOp(s, verb);
      expect(checkSchema(opsSchema as Record<string, unknown>, op), verb).toEqual([]);
      expect(s.apply(op, "user").errors, verb).toEqual([]);
      maps.push(s.built.heights.slice());
    }
    // the objects each force left: knocked down trees are dead, carried objects moved
    const all = s.state.sculpts.filter((o) => o.op === "forceResult").map((o) => o.params as ForceResultParams);
    const felled = all.flatMap((p) => p.felled ?? []);
    for (const f of felled) {
      const e = s.built.entities.find((x) => x.id === f.id);
      if (e) expect((e.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead, f.id).toBe(true);
    }
    // an incremental build is a full one; the project file replays all of it; the file is the same
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    s.settleCanonical();
    again.settleCanonical();
    expect(again.built.entities.map((e) => e.id).sort()).toEqual(s.built.entities.map((e) => e.id).sort());
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
    // undo all the way back, then redo all of it: the same maps at every step
    for (let k = maps.length - 1; k > 0; k--) {
      expect(s.undo()).toBe(true);
      expect(Array.from(s.built.heights), `undo to ${k - 1}`).toEqual(Array.from(maps[k - 1]));
    }
    for (let k = 1; k < maps.length; k++) {
      expect(s.redo()).toBe(true);
      expect(Array.from(s.built.heights), `redo to ${k}`).toEqual(Array.from(maps[k]));
    }
  });

  it("a carve kept as the carve operation of before the forces shared one still opens and replays exactly", () => {
    const r = generate(makeSpec({ seed: 5, theme: "highlands", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const m = forceMapOf(s.built);
    const at = farFromStart(s.built);
    const run = new CarveRun(m, { ...CARVE_DEFAULTS, power: 70 }, { origin: at[1] * 96 + at[0] }, { sourceId: "22222222-2222-4333-8444-555555555555" });
    for (let k = 0; k < 1200 && !run.done; k++) run.step();
    const params = carveParams(m, run, { settings: { ...CARVE_DEFAULTS, power: 70 }, origin: at, cut: null })!;
    expect(s.apply({ op: "carve", params }, "user").errors).toEqual([]);
    const saved = s.project();
    const again = MapSession.open(decodeProject(saved));
    expect(again.logOps.at(-1)!.op).toBe("carve");
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    s.settleCanonical();
    again.settleCanonical();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
    // Try another can replace it with the shared operation, and undo brings it back
    const before = s.built.heights.slice();
    const other = { ...params, seed: 1, tiles: params.tiles.slice(0, 10), heights: params.heights.slice(0, 10) };
    const op: ForceResultParams = { version: 1, verb: "carve", settings: { mode: "unleash", power: 70, wander: 35, width: null, seed: 1, walls: "steep", defyGravity: false, dry: true }, where: { origin: at }, steps: 1, reason: "stopped", tiles: other.tiles, heights: other.heights, removed: [], replaces: s.history().at(-1)!.seq };
    expect(s.apply({ op: "forceResult", params: op }, "user").errors).toEqual([]);
    expect(s.history().at(-1)!.label).toBe("Try another path");
    s.undo();
    expect(Array.from(s.built.heights)).toEqual(Array.from(before));
  });

  it("the engine refuses a force result that doesn't fit, and the schema agrees with Ajv", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const base: ForceResultParams = { version: 1, verb: "craterize", settings: { ...CRATER_DEFAULTS }, where: { origin: [30, 30] }, steps: 1, reason: "done", tiles: [30 * 64 + 30], heights: [2], removed: [] };
    expect(s.apply({ op: "forceResult", params: base }).errors).toEqual([]);
    s.undo();
    const tree = s.built.entities.find((e) => e.template === "Pine" || e.template === "Birch" || e.template === "Oak")!;
    const bad: Partial<ForceResultParams>[] = [
      { verb: "wave" as never },
      { version: 2 as never },
      { settings: { ...CRATER_DEFAULTS, walls: "wide" } as never },
      { settings: { ...CRATER_DEFAULTS, power: 120 } },
      { settings: { ...CRATER_DEFAULTS, mode: "aim" } },
      { where: { origin: [70, 3] } },
      { where: {} },
      { tiles: [5, 4], heights: [1, 1] },
      { tiles: [64 * 64], heights: [1] },
      { heights: [40] },
      { rock: { tiles: [5], bits: [2 ** 22] } },
      { rock: { tiles: [5, 4], bits: [1, 1] } },
      { removed: ["00000000-0000-4000-8000-000000000000"] },
      { moved: [{ id: tree.id, x: 70, y: 3 }] },
      { felled: [{ id: tree.id, dx: 3, dy: 0 }] },
      { source: { id: "11111111-2222-4333-8444-555555555555", x: 3, y: 3, strength: 2 } },
      { replaces: 999 },
    ];
    for (const b of bad) expect(s.apply({ op: "forceResult", params: { ...base, ...b } }).errors.length, JSON.stringify(b)).toBeGreaterThan(0);
    const quake: ForceResultParams = { ...base, verb: "quake", settings: { ...QUAKE_DEFAULTS }, where: { path: [[1.5, 2.25], [40, 20]], side: -1 } };
    expect(s.apply({ op: "forceResult", params: quake }).errors).toEqual([]);
    s.undo();
    expect(s.apply({ op: "forceResult", params: { ...quake, where: { path: [[1, 2]], side: 1 } } }).errors.length).toBeGreaterThan(0);
    expect(s.apply({ op: "forceResult", params: { ...quake, where: { path: [[1, 2], [3, 4]] } } }).errors.length).toBeGreaterThan(0);
    // the schema agrees with Ajv
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(opsSchema);
    const samples: unknown[] = [
      { op: "forceResult", params: base },
      { op: "forceResult", params: quake },
      { op: "forceResult", params: { ...base, rock: { tiles: [3], bits: [7] }, moved: [{ id: tree.id, x: 3, y: 4 }], felled: [{ id: tree.id, dx: 0.6, dy: -0.8 }], cut: 9, replaces: 2 } },
      { op: "forceResult", params: { ...base, version: 2 } },
      { op: "forceResult", params: { ...base, verb: "wave" } },
      { op: "forceResult", params: { ...base, where: { origin: [3, 4], extra: 1 } } },
      { op: "forceResult", params: { ...base, felled: [{ id: tree.id, dx: 3, dy: 0 }] } },
      { op: "forceResult", params: { ...base, tiles: undefined } },
      { op: "moveEntity", params: { id: tree.id, x: 3, y: 4, quiet: true } },
      { op: "setEntityProps", params: { id: tree.id, components: {}, quiet: true } },
    ];
    for (const v of samples) expect(checkSchema(opsSchema as Record<string, unknown>, v).length === 0, JSON.stringify(v)).toBe(validate(v));
    // a force's quiet edits are its own: an operation in the log can't ask for them
    expect(s.apply({ op: "moveEntity", params: { id: tree.id, x: tree.x, y: tree.y, quiet: true } } as EditOp).errors.length).toBeGreaterThan(0);
  });
});
