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
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
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
  ed.setEditorWaterMode("defer");
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
      // (Quake, Lift on seed 4 on M9b's maps, D148: seed 3's lift carries a river's head, whose spring the build derives again one tile over, with a new id)
      const { at, fault } = await open(name === "Quake, Lift" ? 4 : 3);
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
