// Forces can clear sources (D474): every force takes Sources, Ride or Clear (the default for a new
// force). Clear removes every water and badwater source on ground the force changes, at the step its
// showing first changes the source's tile (no pop); Ride keeps them riding the ground, as before D474
// (Carve and Glaciate took every source they reached already). Clear changes only objects, never the
// land. The operation keeps the choice and what it cleared, so undo brings the sources back, and an
// operation without the choice (saved before D474) replays as Ride.

import { describe, expect, test } from "vitest";
import { waterSource } from "../../src/core/format/entities";
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

/** A study with a source every four tiles where nothing stands (every fifth badwater). */
function sourced(kind: FixtureKind): FullForceMap {
  const m = fixture(kind, W);
  const taken = new Set(m.entities.flatMap((e) => footprint(m, e)));
  let k = 0;
  for (let y = 2; y < W - 2; y += 4)
    for (let x = 2; x < W - 2; x += 4) {
      const i = y * W + x;
      if (taken.has(i) || m.water.depth[i] > 0) continue;
      m.entities.push(...plainEntities([waterSource({ x, y, z: m.heights[i], id: `src-${x}-${y}`, owner: "test", strength: 1, ...(k++ % 5 === 4 ? { bad: true } : {}) })]));
    }
  return m;
}

const at = (x: number, y: number) => ({ x, y });
/** Each force's request, the editor's way (its row's details left to nature), and its study. */
const CASES: { name: string; kind: FixtureKind; request: ForceRequest; takes?: true }[] = [
  { name: "carve", kind: "plain", request: { verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power: 80, width: null, dry: false, seed: 3 }, origin: [10, 32], end: [54, 32], cut: null, natural: true } as ForceRequest, takes: true },
  { name: "craterize", kind: "plain", request: { verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "strike", power: 70, size: 30 }, origin: [32, 32], cut: null } as ForceRequest },
  { name: "erupt", kind: "plain", request: { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "vent", power: 70, size: 30 }, origin: [32, 32], cut: null } as ForceRequest },
  { name: "quake lift", kind: "plain", request: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power: 90 }, path: [at(8, 30), at(32, 33), at(56, 30)], side: 1, cut: null } as ForceRequest },
  { name: "quake slide", kind: "slide", request: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 90 }, path: [at(8, 30), at(32, 33), at(56, 30)], side: 1, cut: null } as ForceRequest },
  { name: "glaciate", kind: "river", request: { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "flow", power: 80, size: 24 }, origin: [35, 4], cut: null } as ForceRequest, takes: true },
  { name: "rift", kind: "plain", request: { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 100, size: 22 }, path: [at(12, 30), at(32, 33), at(52, 29)], cut: null } as ForceRequest },
  { name: "deposit", kind: "river", request: { verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power: 100, size: 40 }, path: [at(20, 32), at(40, 32)], cut: null } as ForceRequest },
];

/** The force used to its end as the editor shows it, every frame checked against the sources it
 *  clears: each stands until its step and is gone from it on. Its operation, and the cleared ones. */
function use(m: FullForceMap, request: ForceRequest): ForceResultParams {
  const N = m.W * m.H;
  const state = { W: m.W, H: m.H, pre: m.heights.slice(), protect: new Uint8Array(N), channel: new Uint8Array(N) } as never;
  const plan = planForce({ base: m, request, state, caves: [], newId: () => "carve-own-source" });
  if (!plan.ok) throw new Error(plan.error);
  const frames: { shown: number; ids: Set<string> }[] = [];
  let kept;
  if (plan.carve) {
    const play = new CarvePlay(plan.carve);
    play.plan();
    for (let k = 1; k <= play.total; k++) {
      play.showTo(k);
      frames.push({ shown: k, ids: new Set(play.map.entities.map((e) => e.id)) });
    }
    kept = keptForceParams({ before: plan.before, request: plan.request, carve: plan.carve, staged: null, shownCleared: play.cleared });
  } else {
    const r = plan.staged!;
    while (!r.done) {
      r.step();
      frames.push({ shown: r.shown, ids: new Set(r.map.entities.map((e) => e.id)) });
    }
    kept = keptForceParams({ before: plan.before, request: plan.request, carve: null, staged: r });
  }
  if (!kept.ok) throw new Error(kept.error);
  const p = kept.params;
  for (const c of p.cleared ?? []) for (const f of frames) expect(f.ids.has(c.id), `${c.id} at step ${f.shown} (cleared at ${c.step})`).toBe(f.shown < c.step);
  return p;
}

describe("forces clear sources (D474)", () => {
  for (const c of CASES)
    test(`${c.name}: Clear takes the sources it reaches at their step, Ride keeps them, the land the same`, () => {
      const m = sourced(c.kind);
      const ride = use(m, { ...c.request, settings: { ...c.request.settings, sources: "ride" } } as ForceRequest);
      const clear = use(m, { ...c.request, settings: { ...c.request.settings, sources: "clear" } } as ForceRequest);
      for (const p of [ride, clear]) expect(forceProblems(p, W, W, 22)).toEqual([]);
      expect(ride.settings.sources).toBe("ride");
      expect(ride.cleared).toBeUndefined();
      expect(clear.settings.sources).toBe("clear");
      // (Clear changes objects only: the land, the objects the force took and the trees it felled are Ride's)
      expect(clear.tiles).toEqual(ride.tiles);
      expect(clear.heights).toEqual(ride.heights);
      expect(clear.removed).toEqual(ride.removed);
      expect(clear.felled).toEqual(ride.felled);
      const changed = new Set(clear.tiles.filter((i, k) => clear.heights[k] !== m.heights[i]));
      const reached = m.entities.filter((e) => e.id.startsWith("src-") && footprint(m, e).some((i) => changed.has(i))).map((e) => e.id);
      expect(reached.length).toBeGreaterThan(0);
      // with Clear, no source stays on ground the force changed
      const gone = new Set([...clear.removed, ...(clear.cleared ?? []).map((q) => q.id)]);
      expect(reached.filter((id) => !gone.has(id))).toEqual([]);
      if (c.takes) {
        // Carve takes what loses its ground and Glaciate sweeps its path: they took every source they
        // reached before D474, so Ride and Clear leave the same map
        expect(reached.filter((id) => !ride.removed.includes(id))).toEqual([]);
        expect(clear.cleared).toBeUndefined();
      } else expect(clear.cleared?.length).toBeGreaterThan(0);
      for (const { id } of clear.cleared ?? []) {
        const e = m.entities.find((q) => q.id === id)!;
        expect(e.template === "WaterSource" || e.template === "BadwaterSource").toBe(true);
        expect(footprint(m, e).some((i) => changed.has(i))).toBe(true);
        // (Ride kept it: it stood, or rode the ground)
        expect(ride.removed).not.toContain(id);
        expect(clear.moved?.some((q) => q.id === id) ?? false).toBe(false);
      }
      // a new force clears unless its row says Ride
      expect(use(m, c.request)).toEqual(clear);
    }, 60000);

  test("the operation's Sources and cleared list are checked, each refusal one line", () => {
    const m = sourced("plain");
    const p = use(m, CASES[6].request);
    const problem = (q: object) => forceProblems({ ...p, ...q } as ForceResultParams, W, W, 22);
    expect(problem({ settings: { ...p.settings, sources: "sweep" } })).toEqual(["a rift's sources are ride or clear"]);
    expect(problem({ settings: { ...p.settings, sources: "ride" } })).toEqual(["only a force set to clear sources clears them"]);
    expect(problem({ cleared: [] })).toEqual(["a force's cleared sources are a list of 1 to 65536"]);
    expect(problem({ cleared: [{ id: p.cleared![0].id, step: -1 }] })).toEqual(["a cleared source is its id and the step that took it (a whole number from 0)"]);
    expect(problem({ cleared: [p.cleared![0], p.cleared![0]] })[0]).toMatch(/is cleared once/);
    // (an operation from before D474: no choice, nothing cleared, it rode)
    const { cleared: _c, ...old } = p;
    expect(forceProblems({ ...old, settings: { ...RIFT_DEFAULTS, power: 100, size: 22 } } as ForceResultParams, W, W, 22)).toEqual([]);
  });

  test("kept in the editor: a cleared source goes with the force, undo brings it back, reopening keeps it gone, and an old operation replays as Ride", async () => {
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
    const after = ed.terrainNow().heights.slice();
    ed.undo();
    expect(ed.terrainNow().heights).toEqual(before);
    expect(open().built.entities.some((e) => e.id === src.id)).toBe(true);
    // the same operation without the choice, as saved before D474: the same land, the source rides
    const { cleared: _c, ...old } = op.params;
    const { sources: _s, ...settings } = old.settings;
    expect(ed.apply({ op: "forceResult", params: { ...old, settings } as ForceResultParams }).errors).toEqual([]);
    expect(ed.terrainNow().heights).toEqual(after);
    expect(open().built.entities.some((e) => e.id === src.id)).toBe(true);
  }, 120000);
});
