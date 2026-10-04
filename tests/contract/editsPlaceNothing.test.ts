// Only the player places objects (PLAN §20 D368 (10)): no force, brush or editor action, and nothing
// one of them triggers, ever adds a Slope or any other shelf object to the map. An eruption used to
// make Slope objects appear across the map, far from the cone: the build derived the slopes again
// after every edit, and a change anywhere moved the whole network. Slopes are derived once, at
// generation; an edited map keeps those that still stand and loses those an edit took away. An edit
// that leaves something unreachable shows in the checks (the mine site's walk,
// `resources.mine_site`, advisory in the editor), for the player to fix; nothing is placed silently.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import type { BrushTool } from "../../src/core/features/raster/brush";
import type { RiverFeature } from "../../src/core/features/schema";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { buildMap } from "../../src/core/features/build";
import { writeTimber } from "../../src/core/format/timber";
import { toTimberFile } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 128;

/** The map as the document now has it (reopened from its project, so the replay is what's read). */
const entities = () => MapSession.open(decodeProject(ed.project().bytes)).built.entities;

/** What the edit added: the objects that stand now and did not before, by id (an object a force
 *  carried keeps its id; one it destroyed is gone, and removing stays allowed). */
function added(before: ReturnType<typeof entities>, after: ReturnType<typeof entities>) {
  const had = new Set(before.map((e) => e.id));
  return after.filter((e) => !had.has(e.id));
}

async function open(seed: number, side = W) {
  await runGenerate(makeSpec({ seed, theme: "highlands", size: { x: side, y: side } }));
  ed.refine();
  const b = MapSession.open(decodeProject(ed.project().bytes)).built;
  const st = b.start!;
  // dry ground well away from the start, and a fault across the far half
  let at: [number, number] = [W >> 1, W >> 1];
  let far = -1;
  for (let y = 16; y < W - 16; y += 4)
    for (let x = 16; x < W - 16; x += 4) {
      const i = y * W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i];
      if (d > far) {
        far = d;
        at = [x, y];
      }
    }
  const fy = st.y < W / 2 ? Math.round(W * 0.72) : Math.round(W * 0.28);
  const fault = { path: [{ x: 4, y: fy }, { x: W * 0.5, y: fy + 1.5 }, { x: W - 5, y: fy }], side: (st.y < fy ? 1 : -1) as 1 | -1 };
  return { at, fault };
}

/** A force to its end, kept, the page's way. */
function run(req: ed.ForceRequest) {
  expect(ed.forceStart(req).errors).toEqual([]);
  for (let k = 0; k < 600; k++) if (ed.forceAdvance(2)!.done) break;
  const kept = ed.forceStop();
  expect(kept.errors).toEqual([]);
  expect(kept.kept).toBe(true);
}

/** A wandering stroke of dabs (quarter tiles), three times over, where the old build moved the most slopes. */
function stroke(tool: BrushTool, at: [number, number]): EditOp {
  const dabs: number[] = [];
  for (let rep = 0; rep < 3; rep++) for (let k = 0; k < 40; k++) dabs.push(Math.round((at[0] - 12 + k * 0.6) * 4), Math.round((at[1] + 4 * Math.sin(k / 5)) * 4));
  return { op: "brush", params: { tool, size: 14, strength: 10, ...(tool === "flatten" ? { level: 9 } : {}), ...(tool === "naturalize" ? { seed: 5 } : {}), dabs } };
}

describe("an edit never places an object (D368 (10))", () => {
  /** Every force, each from the same ground: one `it` apiece, so each one's failure on the old build
   *  (which derived the slopes again after the force kept) is its own. */
  const forces: [string, (at: [number, number], fault: { path: { x: number; y: number }[]; side: 1 | -1 }) => ed.ForceRequest][] = [
    ["Carve", (at) => ({ verb: "carve", settings: { ...CARVE_DEFAULTS, power: 80, dry: true }, origin: at, cut: null, natural: true })],
    ["Craterize", (at) => ({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 80 }, origin: at, cut: null, natural: true })],
    ["Erupt", (at) => ({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 80 }, origin: at, cut: null, natural: true })],
    ["Quake, Lift", (_, fault) => ({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 80 }, ...fault, cut: null, natural: true })],
    ["Quake, Slide", (_, fault) => ({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 80 }, ...fault, cut: null, natural: true })],
    ["Glaciate", (at) => ({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 80, meltwater: false }, origin: at, cut: null, natural: true })],
  ];
  for (const [name, request] of forces)
    it(`${name} adds no Slope or any other object, at the far end of the map and in the middle of it`, async () => {
      // (seed 3 caught a river-head spring derived again a tile over with a new id after a Lift; a
      // row keeps its ids since #172, water/sourceGroups.ts groupIds)
      const { at, fault } = await open(3);
      // (the second try: the middle of the map, and a fault across its upper part)
      const upper = { path: [{ x: 4, y: 40 }, { x: W * 0.5, y: 41.5 }, { x: W - 5, y: 40 }], side: -1 as 1 | -1 };
      for (const [where, across] of [[at, fault], [[W >> 1, W >> 1], upper]] as [[number, number], typeof fault][]) {
        const before = entities();
        run(request(where, across));
        const now = entities();
        expect(added(before, now).map((e) => `${e.template}@${e.x},${e.y}`), `${name} at ${where}`).toEqual([]);
        // (the map keeps its one start; a force may carry it)
        expect(now.filter((e) => e.template === "StartingLocation").length, name).toBe(1);
        ed.undo();
      }
    }, 240000);

  it("the two forces that make water place that water's source and nothing else: Carve's river (D314) and Glaciate's meltwater (D246)", async () => {
    const { at } = await open(3);
    for (const req of [
      { verb: "carve", settings: { ...CARVE_DEFAULTS, power: 60, dry: false }, origin: at, cut: null, natural: true },
      { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 60, meltwater: true }, origin: at, cut: null, natural: true },
    ] as ed.ForceRequest[]) {
      const before = entities();
      run(req);
      expect(added(before, entities()).filter((e) => e.template !== "WaterSource").map((e) => `${e.template}@${e.x},${e.y}`), req.verb).toEqual([]);
      ed.undo();
    }
  }, 240000);

  for (const tool of ["raise", "lower", "flatten", "smooth", "naturalize"] as const) {
    it(`${tool} adds no object`, async () => {
      await open(3);
      const before = entities();
      const r = ed.apply(stroke(tool, [90, 40]), "user", tool);
      expect(r.errors).toEqual([]);
      const now = entities();
      expect(added(before, now).map((e) => `${e.template}@${e.x},${e.y}`)).toEqual([]);
    }, 120000);
  }

  it("a Quake Lift after a wide Flatten adds nothing back: what the Flatten's ground and water took stays gone (D404)", async () => {
    // (the finding, Highlands seed 3 at 128²: the Flatten flooded groves, bushes and ruin fields and
    // broke slopes' steps; a Lift that drained the ground or gave a step back brought them back, 122
    // objects on one side of the fault and 266 on the other. The build re-marks a kept tree dead or
    // alive and keeps every bush and ruin column where the generation put them; a slope an edit
    // broke stays gone)
    await open(3);
    const dabs: number[] = [];
    for (let y = 30; y <= 100; y += 4) for (let x = 14; x <= 124; x += 4) dabs.push(x * 4, y * 4);
    expect(ed.apply({ op: "brush", params: { tool: "flatten", size: 14, strength: 10, level: 8, dabs } }, "user", "flatten").errors).toEqual([]);
    const before = entities();
    for (const side of [1, -1] as const) {
      run({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 80 }, path: [{ x: 4, y: 64.5 }, { x: W * 0.5, y: 64.5 }, { x: W - 5, y: 64.5 }], side, cut: null, natural: true });
      const now = entities();
      expect(added(before, now).map((e) => `${e.template}@${e.x},${e.y}`), `the Lift on side ${side}`).toEqual([]);
      // the project replays to the map a build from scratch gives, and undo gives the Flatten's map back
      const replay = MapSession.open(decodeProject(ed.project().bytes));
      const shown = (es: ReturnType<typeof entities>) => es.map((e) => `${e.template} ${e.id}@${e.x},${e.y},${e.z}`);
      expect(shown(replay.built.entities)).toEqual(shown(replay.fullBuild().entities));
      ed.undo();
      expect(shown(entities())).toEqual(shown(before));
    }
  }, 300000);
});

describe("a spring the build derives again after an edit keeps its id (PLAN §19.4, D314)", () => {
  // M9b's finding (Highlands seed 3 at 128²): a Quake Lift across a river's head left part of its
  // springs' row on the lifted side; the build placed the row again a tile over, and the moved spring
  // came back with a new id, counted as added. A row's ids follow its places along the row
  // (water/sourceGroups.ts `groupIds`), never its tiles. A flat imported map (no generator, the same
  // on every branch) and a river an old project drew on it, its bed 9 tiles across: room for its head's row to move.
  const S = 64;
  const flat = buildMap({ W: S, H: S, seed: 1, features: [], base: { heights: new Uint8Array(S * S).fill(8), columns: new Map(), entities: [] } });
  const bytes = writeTimber(toTimberFile(makeSpec({ seed: 1, theme: "highlands", size: { x: S, y: S } }), flat));
  const shown = (es: ReturnType<typeof entities>) => es.map((e) => `${e.template} ${e.id}@${e.x},${e.y},${e.z}`);

  it("a Quake Lift across a river's head adds no spring; undo and the project give the same map", async () => {
    for (const flow of [1, 2]) {
      ed.openTimber(bytes, "flat.timber");
      const id = `11111111-2222-4333-8444-00000000000${flow}`;
      // (a river as the retired river tool drew it, kept in an old project: its head a spring)
      const river = { id, kind: "river", origin: "user", locked: false, params: { path: [[16, 32], [40, 32], [S - 1, 32]], width: 9, bedDepth: 1, bedProfile: { start: 7, steps: [] }, flow, style: "straight", entry: { spring: [16, 32] }, exit: { edge: "east" }, badwater: false, banks: true } } as RiverFeature;
      expect(ed.apply({ op: "addFeature", params: { feature: river } }, "user", "Add river").errors).toEqual([]);
      const before = entities();
      const springs = (es: ReturnType<typeof entities>) => es.filter((e) => e.template === "WaterSource" && e.owner === id);
      expect(springs(before).length, "the river's head has a spring").toBeGreaterThan(0);
      // (the fault between the head's rows: above it, below it)
      for (const fy of [31.5, 32.5]) {
        run({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 60 }, path: [{ x: 2, y: fy }, { x: S / 2, y: fy }, { x: S - 3, y: fy }], side: 1, cut: null });
        const now = entities();
        expect(added(before, now).map((e) => `${e.template}@${e.x},${e.y}`), `flow ${flow}, the fault at y ${fy}`).toEqual([]);
        expect(springs(now).length, "the head keeps a spring").toBeGreaterThan(0);
        // the project replays to the map a build from scratch gives
        const replay = MapSession.open(decodeProject(ed.project().bytes));
        expect(shown(replay.built.entities)).toEqual(shown(replay.fullBuild().entities));
        ed.undo();
        expect(shown(entities())).toEqual(shown(before));
      }
    }
  }, 240000);
});

describe("an edit that leaves the mine site out of reach shows in the checks, and places nothing (D368 (10))", () => {
  it("walling the mine site off from the start adds no slope and reports resources.mine_site", async () => {
    // a generated map whose mine site the colony reaches
    let mine: { x: number; y: number; z: number } | null = null;
    for (const seed of [4, 2, 5, 6]) {
      await open(seed, 96);
      const found = entities().find((e) => e.template === "UndergroundRuins");
      if (!found) continue;
      // (the ring below, 8 tiles out from the site's middle, has to stay on the map: M9b's seed 4 puts the site at the edge, D148)
      if (found.x + 2 < 10 || found.y + 2 < 10 || found.x + 2 > 85 || found.y + 2 > 85) continue;
      // (before any edit the check has nothing to say; a harmless first edit makes it apply)
      expect(ed.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 1, target: 0, dabs: [8, 8] } }, "user", "touch").errors).toEqual([]);
      const c = ed.exportCheck();
      if ([...c.advisory, ...c.warnings, ...c.blocking].some((i) => i.id === "resources.mine_site")) {
        ed.undo();
        continue;
      }
      ed.undo();
      mine = found;
      break;
    }
    expect(mine, "a generated map with a reachable mine site").toBeTruthy();
    // (the footprint is 5 × 5 from its corner: its middle)
    const cx = mine!.x + 2;
    const cy = mine!.y + 2;
    const before = entities();
    // a wall high above the site's ground in a ring round it, exact (D322): nothing joins it to the rest
    const dabs: number[] = [];
    for (let k = 0; k < 96; k++) dabs.push(Math.round((cx + 0.5 + 8 * Math.cos((k / 96) * 2 * Math.PI)) * 4), Math.round((cy + 0.5 + 8 * Math.sin((k / 96) * 2 * Math.PI)) * 4));
    const r = ed.apply({ op: "brush", params: { tool: "raise", size: 2.5, strength: 10, target: Math.min(16, mine!.z + 6), dabs } }, "user", "wall");
    expect(r.errors).toEqual([]);
    expect(added(before, entities()).map((e) => `${e.template}@${e.x},${e.y}`)).toEqual([]);
    const c = ed.exportCheck();
    const item = [...c.advisory, ...c.warnings, ...c.blocking].find((i) => i.id === "resources.mine_site");
    expect(item, "the checks say the mine site is out of reach").toBeTruthy();
    expect(item!.message).toMatch(/mine site/);
  }, 300000);
});
