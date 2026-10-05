// Forces can clear sources (D474): every force takes Sources, Ride or Clear (the default, and what an
// operation without the choice is). Clear removes every water and badwater source and seep on ground
// the force changes, at the step its showing first changes the source's tile (no pop); Ride keeps them
// riding the ground, on every force (Carve and Glaciate included: their plans keep them, and Glaciate's
// springs take none of their water). The operation keeps the choice and what it cleared, so undo
// brings the sources back.

import { describe, expect, test } from "vitest";
import { fluidObject, waterSource, type EntitySpec } from "../../src/core/format/entities";
import { plainEntities, type FullForceMap } from "../../src/core/forces/force";
import { footprint } from "../../src/core/forces/objects";
import { CarvePlay } from "../../src/core/forces/carve/play";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { planForce, type ForceRequest } from "../../src/core/forces/start";
import { keptForceParams } from "../../src/core/forces/keep";
import { forceProblems, type ForceResultParams } from "../../src/core/forces/op";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { fixture, type FixtureKind } from "./forceFixtures";

const W = 64;

/** A study with a source every four tiles where nothing stands (every fifth badwater, every seventh
 *  a seep). */
function sourced(kind: FixtureKind): FullForceMap {
  const m = fixture(kind, W);
  const taken = new Set(m.entities.flatMap((e) => footprint(m, e)));
  let k = 0;
  for (let y = 2; y < W - 2; y += 4)
    for (let x = 2; x < W - 2; x += 4) {
      const i = y * W + x;
      if (taken.has(i) || m.water.depth[i] > 0) continue;
      const b = { x, y, z: m.heights[i], id: `src-${x}-${y}`, owner: "test" };
      k++;
      m.entities.push(...plainEntities([k % 7 === 6 ? fluidObject({ ...b, template: "WaterSeep" }) : waterSource({ ...b, strength: 1, ...(k % 5 === 4 ? { bad: true } : {}) })]));
    }
  return m;
}

const at = (x: number, y: number) => ({ x, y });
/** Each force's request, the editor's way, and its study. Carve and Glaciate plan in Rust with the
 *  sources they keep, so their land may differ between the two; the others' never does. */
const CASES: { name: string; kind: FixtureKind; request: ForceRequest; plans?: true }[] = [
  { name: "carve", kind: "plain", request: { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 80, width: null, dry: false, seed: 3 }, origin: [10, 32], end: [54, 32], cut: null, natural: true } as ForceRequest, plans: true },
  { name: "carve shown from its end", kind: "plain", request: { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 80, width: null, dry: false, seed: 3 }, origin: [10, 32], end: [54, 32], cut: null, natural: true, shownFrom: "end" } as ForceRequest, plans: true },
  { name: "craterize", kind: "plain", request: { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 70, size: 30 }, origin: [32, 32], cut: null } as ForceRequest },
  { name: "craterize in a working area", kind: "plain", request: { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 90, size: 40 }, origin: [32, 32], cut: null, area: Array.from({ length: 30 }, (_, k) => [20 + k, 20, 44] as [number, number, number]) } as ForceRequest },
  { name: "erupt", kind: "plain", request: { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "vent", power: 70, size: 30 }, origin: [32, 32], cut: null } as ForceRequest },
  { name: "quake lift", kind: "plain", request: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power: 90 }, path: [at(8, 30), at(32, 33), at(56, 30)], side: 1, cut: null } as ForceRequest },
  { name: "quake slide", kind: "slide", request: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 90 }, path: [at(8, 30), at(32, 33), at(56, 30)], side: 1, cut: null } as ForceRequest },
  { name: "glaciate", kind: "river", request: { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "flow", power: 80, size: 24 }, origin: [35, 4], cut: null } as ForceRequest, plans: true },
  { name: "rift", kind: "plain", request: { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 100, size: 22 }, path: [at(12, 30), at(32, 33), at(52, 29)], cut: null } as ForceRequest },
  { name: "deposit", kind: "river", request: { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power: 100, size: 40 }, path: [at(20, 32), at(40, 32)], cut: null } as ForceRequest },
];

interface Used {
  params: ForceResultParams;
  /** Its last frame: the land and the objects shown. */
  heights: Uint8Array;
  entities: EntitySpec[];
  /** Each frame's step and the ids standing in it. */
  frames: { shown: number; heights: Uint8Array; ids: Set<string> }[];
}

/** The force used to its end as the editor shows it, every frame checked against the sources it
 *  clears: each stands until its step and is gone from it on. */
function use(m: FullForceMap, request: ForceRequest): Used {
  const N = m.W * m.H;
  const state = { W: m.W, H: m.H, pre: m.heights.slice(), protect: new Uint8Array(N), channel: new Uint8Array(N) } as never;
  const plan = planForce({ base: m, request, state, caves: [], newId: () => "carve-own-source" });
  if (!plan.ok) throw new Error(plan.error);
  const frames: Used["frames"] = [];
  let kept;
  let shown: { heights: Uint8Array; entities: EntitySpec[] };
  if (plan.carve) {
    const play = new CarvePlay(plan.carve, request.verb === "carve" && request.shownFrom === "end");
    play.plan();
    for (let k = 1; k <= play.total; k++) {
      play.showTo(k);
      frames.push({ shown: k, heights: play.map.heights.slice(), ids: new Set(play.map.entities.map((e) => e.id)) });
    }
    shown = play.map;
    kept = keptForceParams({ before: plan.before, request: plan.request, carve: plan.carve, staged: null, shownCleared: play.cleared });
  } else {
    const r = plan.staged!;
    while (!r.done) {
      r.step();
      frames.push({ shown: r.shown, heights: r.map.heights.slice(), ids: new Set(r.map.entities.map((e) => e.id)) });
    }
    shown = r.map;
    kept = keptForceParams({ before: plan.before, request: plan.request, carve: null, staged: r });
    // (the showing cleared what the operation keeps cleared, a working area's feather included)
    expect(r.cleared.map((c) => c.id).sort()).toEqual((kept.ok ? (kept.params.cleared ?? []) : []).map((c) => c.id).sort());
  }
  if (!kept.ok) throw new Error(kept.error);
  const p = kept.params;
  for (const c of p.cleared ?? []) for (const f of frames) expect(f.ids.has(c.id), `${c.id} at step ${f.shown} (cleared at ${c.step})`).toBe(f.shown < c.step);
  return { params: p, heights: shown.heights.slice(), entities: shown.entities, frames };
}

describe("forces clear sources (D474)", () => {
  for (const c of CASES)
    test(`${c.name}: Clear takes the sources and seeps it reaches at their step, Ride keeps them riding`, () => {
      const m = sourced(c.kind);
      const ride = use(m, { ...c.request, settings: { ...c.request.settings, sources: "ride" } } as ForceRequest);
      const clear = use(m, { ...c.request, settings: { ...c.request.settings, sources: "clear" } } as ForceRequest);
      for (const u of [ride, clear]) expect(forceProblems(u.params, W, W, 22)).toEqual([]);
      expect(ride.params.settings.sources).toBe("ride");
      expect(ride.params.cleared).toBeUndefined();
      expect(clear.params.settings.sources).toBe("clear");
      const ours = (e: EntitySpec) => e.id.startsWith("src-");
      const reachedBy = (u: Used) => {
        const changed = new Set(u.params.tiles.filter((i, k) => u.params.heights[k] !== m.heights[i]));
        return m.entities.filter((e) => ours(e) && footprint(m, e).some((i) => changed.has(i))).map((e) => e.id);
      };
      // with Clear, no source or seep stays on ground the force changed, and it is gone from the last frame
      const reached = reachedBy(clear);
      expect(reached.length).toBeGreaterThan(0);
      const gone = new Set([...clear.params.removed, ...(clear.params.cleared ?? []).map((q) => q.id)]);
      expect(reached.filter((id) => !gone.has(id))).toEqual([]);
      const lastIds = new Set(clear.entities.map((e) => e.id));
      expect(reached.filter((id) => lastIds.has(id))).toEqual([]);
      // with Ride, every one it reached stays, standing on the ground it rode
      const kept = reachedBy(ride);
      expect(kept.length).toBeGreaterThan(0);
      expect(kept.filter((id) => ride.params.removed.includes(id))).toEqual([]);
      for (const id of kept) {
        const e = ride.entities.find((q) => q.id === id);
        expect(e, `${id} rides`).toBeDefined();
        expect(e!.z).toBe(ride.heights[e!.y * W + e!.x]);
      }
      if (!c.plans) {
        // (Clear changes objects only: the land, the objects the force took and the trees it felled are Ride's)
        expect(clear.params.tiles).toEqual(ride.params.tiles);
        expect(clear.params.heights).toEqual(ride.params.heights);
        expect(clear.params.removed).toEqual(ride.params.removed);
        expect(clear.params.felled).toEqual(ride.params.felled);
        expect(clear.params.cleared?.length).toBeGreaterThan(0);
      }
      // a source the force takes (Carve's, Glaciate's) or clears never goes before the land under it moves
      for (const id of reached) {
        const tiles = footprint(m, m.entities.find((e) => e.id === id)!);
        const goneAt = clear.frames.find((f) => !f.ids.has(id))?.shown;
        const movedAt = clear.frames.find((f) => tiles.some((i) => f.heights[i] !== m.heights[i]))?.shown;
        expect(goneAt, `${id} goes`).toBeDefined();
        expect(goneAt!, `${id} goes once its ground moves`).toBeGreaterThanOrEqual(movedAt!);
      }
      // a force that says nothing clears
      expect(use(m, c.request).params).toEqual(clear.params);
    }, 60000);

  test("a seep is cleared like a source, and rides like one", () => {
    const m = fixture("plain", W);
    m.entities.push(...plainEntities([fluidObject({ x: 32, y: 32, z: m.heights[32 * W + 32], id: "seep", owner: "test", template: "WaterSeep" })]));
    const req = CASES.find((c) => c.name === "rift")!.request;
    expect(use(m, { ...req, settings: { ...req.settings, sources: "clear" } } as ForceRequest).params.cleared?.map((c) => c.id)).toEqual(["seep"]);
    const ride = use(m, { ...req, settings: { ...req.settings, sources: "ride" } } as ForceRequest);
    expect(ride.params.cleared).toBeUndefined();
    expect(ride.entities.find((e) => e.id === "seep")?.z).toBe(ride.heights[32 * W + 32]);
  }, 60000);

  test("Glaciate under Ride takes no kept source's water into its springs", () => {
    const m = sourced("river");
    const req = CASES.find((c) => c.name === "glaciate")!.request;
    const ride = use(m, { ...req, settings: { ...req.settings, sources: "ride" } } as ForceRequest).params;
    const clear = use(m, { ...req, settings: { ...req.settings, sources: "clear" } } as ForceRequest).params;
    const total = (p: ForceResultParams) => (p.sources ?? []).reduce((s, q) => s + q.strength, 0);
    expect(total(ride)).toBeLessThan(total(clear));
  }, 60000);

  test("the operation's Sources and cleared list are checked, each refusal one line", () => {
    const m = sourced("plain");
    const p = use(m, CASES.find((c) => c.name === "rift")!.request).params;
    const problem = (q: object) => forceProblems({ ...p, ...q } as ForceResultParams, W, W, 22);
    expect(problem({ settings: { ...p.settings, sources: "sweep" } })).toEqual(["a rift's sources are ride or clear"]);
    expect(problem({ settings: { ...p.settings, sources: "ride" } })).toEqual(["a force set to ride clears no sources"]);
    expect(problem({ cleared: [] })).toEqual(["a force's cleared sources are a list of 1 to 65536"]);
    expect(problem({ cleared: [{ id: p.cleared![0].id, step: -1 }] })).toEqual(["a cleared source is its id and the step that took it (a whole number from 0)"]);
    expect(problem({ cleared: [p.cleared![0], p.cleared![0]] })[0]).toMatch(/is cleared once/);
  });

  test("kept in the editor: a cleared source goes with the force, undo brings it back, reopening keeps it gone", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const src = open().built.entities.find((e) => e.template === "WaterSource" && e.x > 20 && e.x < 76 && e.y > 20 && e.y < 76)!;
    expect(src).toBeDefined();
    const before = ed.terrainNow().heights.slice();
    const request = { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 100, size: 22 }, path: [at(src.x - 12, src.y + 0.5), at(src.x + 12, src.y + 0.5)], cut: null } as ForceRequest;
    expect(ed.forceStart(request).errors).toEqual([]);
    let cleared: { id: string; step: number }[] = [];
    for (let k = 0; k < 80; k++) {
      const frame = ed.forceAdvance(2)!;
      if (frame.cleared) cleared = frame.cleared;
      if (frame.done) break;
    }
    expect(ed.forceStop().errors).toEqual([]);
    expect(cleared.map((c) => c.id)).toContain(src.id);
    const kept = open();
    const op = [...kept.logOps].reverse().find((o) => o.op === "forceResult") as unknown as { params: ForceResultParams };
    expect(op.params.settings.sources).toBe("clear");
    expect(op.params.cleared).toEqual(cleared);
    expect(kept.built.entities.some((e) => e.id === src.id)).toBe(false);
    ed.undo();
    expect(ed.terrainNow().heights).toEqual(before);
    expect(open().built.entities.some((e) => e.id === src.id)).toBe(true);
  }, 120000);

  test("a carve's water: a source it keeps (Ride) feeds it as it plays, one it takes (Clear) stops; the map's water flows on from where play ended", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 96, y: 96 } }));
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const b = open().built;
    // a source of our own on dry ground, with dry ground round it, for the carve to cut under
    const dry = (x: number, y: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (b.water[(y + dy) * 96 + x + dx] > 0) return false; return true; };
    let spot: [number, number] | null = null;
    for (let y = 30; y < 66 && !spot; y++) for (let x = 30; x < 66 && !spot; x++) if (dry(x, y) && !b.entities.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) spot = [x, y];
    expect(spot, "a dry spot").not.toBeNull();
    const [sx, sy] = spot!;
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-000000000474";
    expect(ed.apply({ op: "placeEntity", params: { id, template: "WaterSource", x: sx, y: sy, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never).errors).toEqual([]);
    const i = sy * 96 + sx;
    const near = (d: Float64Array) => { let v = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) v += d[(sy + dy) * 96 + sx + dx]; return v; };
    const play = (sources: "ride" | "clear") => {
      const request = { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 90, width: 8, dry: false, defyGravity: true, seed: 1, sources }, origin: [sx - 14, sy], end: [sx + 14, sy], cut: null } as ForceRequest;
      expect(ed.forceStart(request).errors).toEqual([]);
      for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++) ed.flowForceWater(4);
      return ed.flowForceWater(80)!;
    };
    // Clear: the carve takes the source as it reaches it, and its emitter stops then
    const cleared = play("clear");
    ed.forceCancel();
    // Ride: the source rides the cut and keeps running in the carve's water
    const ridden = play("ride");
    expect(ridden[i], "its water runs on its new ground").toBeGreaterThan(0);
    expect(near(ridden), "the kept source feeds the carve's water").toBeGreaterThan(near(cleared) + 1);
    const stop = ed.forceStop();
    expect(stop.errors).toEqual([]);
    const after = open().built;
    expect(after.heights[i], "the carve cut under the source").not.toBe(b.heights[i]);
    const kept = after.entities.find((e) => e.id === id);
    expect(kept, "the source rides").toBeDefined();
    expect(kept!.z).toBe(after.heights[i]);
    // the map's water starts from the water play ended on
    const view = stop.view.water;
    expect(view).toBeDefined();
    expect(view!.count).toBeGreaterThan(0);
    for (let k = 0; k < view!.count; k++) expect(view!.depth[k]).toBeCloseTo(ridden[view!.tile[k]], 4);
  }, 180000);
});
