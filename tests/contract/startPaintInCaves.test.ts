// The start and painted objects under a roof (D491, D342; #540): Timberborn keeps a start wherever its 3×3×5 is air on
// level ground and the tile at its door is ground at its level (`StartingBuildingPlacementValidator` reads only the
// entrance; GAME_RULES §5), and trees, bushes and thorns wherever their blocks fit, sky or no sky. So the start's
// operations take a level (`planStart`'s `z`: a start feature's `z`, an opened map's StartingLocation at it) and
// `paintObjects` a level per tile (`levels`), each held to the game's rule there (startFit.ts `startRoofProblem`,
// objects.ts `standProblem`); without one, neither is ever put on the roof's top under the pointer.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { paintLevels, planPaintObjects } from "../../src/core/doc/paint";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { MapSession } from "../../src/core/doc/session";
import { startMiddle } from "../../src/core/doc/start";
import { START_OPEN_GROUND } from "../../src/core/doc/startFit";
import { planStart } from "../../src/core/doc/tools";
import type { StartFeature } from "../../src/core/features/schema";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { CAVE, CAVE_W, caveFile, caveSession, caveVoxels, levelPatch } from "./caveMap";

const W = CAVE_W;
let n = 0;
const newId = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;

/** The cave map with its cave's air from `lo` up to (not including) `hi`, under the same roof. */
function caveWith(lo: number, hi: number): MapSession {
  const v = caveVoxels();
  const N = W * W;
  for (let y = CAVE.y0; y <= CAVE.y1; y++)
    for (let x = CAVE.x0; x <= CAVE.x1; x++)
      for (let z = 1; z < 8; z++) v[z * N + y * W + x] = z >= lo && z < hi ? 0 : 1;
  return MapSession.importMap(writeTimber(caveFile(v)), "cave.timber");
}

/** The load checks of the exported map that name the start. */
function startChecks(s: MapSession): Record<string, boolean> {
  const checks = validateMap(readTimber(s.exportTimber().bytes), { profile: "export", loadOnly: true }).report.checks;
  const out: Record<string, boolean> = {};
  for (const id of ["start.count", "start.flat", "start.entrance", "entities.placement"]) out[id] = !!checks.find((c) => c.id === id)?.ok;
  return out;
}

const startEntity = (s: MapSession) => s.built.entities.find((e) => e.template === "StartingLocation");

describe("the start under a roof (D491): where the game keeps it, at its level", () => {
  it("on an opened map: no level is refused, never the roof's top; at the cave's floor it stands there and the checks keep it", () => {
    const s = caveWith(1, 7);
    // (the cave's air from 1 to 6: five levels for the start, its door on the floor inside)
    expect(planStart(s, 17, 17, "Cw0", newId)).toEqual({ ok: false, errors: [START_OPEN_GROUND] });
    const p = planStart(s, 17, 17, "Cw0", newId, 1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    // (nothing is levelled under a roof)
    expect(p.ops.map((o) => o.op)).toEqual(["placeEntity"]);
    const r = s.applyAll(p.ops, "user", p.label);
    expect(r.errors).toEqual([]);
    expect(startEntity(s)).toMatchObject({ x: 16, y: 16, z: 1 });
    expect(startChecks(s)).toEqual({ "start.count": true, "start.flat": true, "start.entrance": true, "entities.placement": true });
    // turned in place it keeps its level; out onto the lowland's top it stands there
    const turn = planStart(s, 17, 17, "Cw180", newId);
    expect(turn.ok && s.applyAll(turn.ops).errors).toEqual([]);
    expect(startEntity(s)).toMatchObject({ z: 1, orientation: "Cw180" });
    const out = planStart(s, 35, 30, undefined, newId, 2);
    expect(out.ok && s.applyAll(out.ops).errors).toEqual([]);
    expect(startEntity(s)?.z).toBe(2);
    // a saved project reopens with it there, to the same bytes
    const back = planStart(s, 17, 17, "Cw0", newId, 1);
    expect(back.ok && s.applyAll(back.ops).errors).toEqual([]);
    const bytes = s.exportTimber().bytes;
    const again = MapSession.open(decodeProject(s.project()));
    expect(startEntity(again)?.z).toBe(1);
    expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("where the game would not keep it, it is refused with the game's reason, in one line", () => {
    // (the cave map's own cave has three levels of air: the start needs five)
    const low = caveSession();
    const p = planStart(low, 17, 17, "Cw0", newId, 3);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(low.applyAll(p.ops).errors).toEqual(["not enough room under the roof here: the start needs 5"]);
    const tall = caveWith(1, 7);
    const refused = (x: number, y: number, z: number, o: "Cw0" | "Cw90" = "Cw0") => {
      const q = planStart(tall, x, y, o, newId, z);
      return q.ok ? tall.applyAll(q.ops).errors : q.errors;
    };
    // its ground not level (no floor at the level, a wall in its 3×3), its door on rock, a level above the top
    expect(refused(17, 17, 2)).toEqual(["the ground under it is not level"]);
    expect(refused(15, 17, 1)).toEqual(["the ground under it is not level"]);
    expect(refused(17, 16, 1)).toEqual(["its door would open onto rock"]);
    expect(refused(17, 17, 9)).toEqual(["level 9 is not under a roof here: the ground's top is 8, where the start stands without a level"]);
    expect(startEntity(tall)).toBeUndefined();
  });

  it("on a generated map: a start feature at a level has no bench, stands there, saves and reopens to the same bytes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const M = s.size.x;
    const from = startMiddle(s)!;
    // a plateau over a level patch, and a chamber 5 × 5 × 5 dug into its west face at the patch's level, a roof over it
    const { x, y, h } = levelPatch(s);
    expect(h).toBeLessThanOrEqual(16);
    const plateau = Math.min(h + 8, 22);
    const x0 = x - 1;
    const cells: number[] = [];
    for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x0; xx <= x0 + 8; xx++) cells.push(yy * M + xx);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(cells, M), level: plateau, exact: true } }).errors).toEqual([]);
    for (let k = 0; k < 5; k++) {
      const dug = s.apply({ op: "blocks", params: { mode: "remove", side: "-x", at: [[x0 + k, y, h + 2]], size: 5 } });
      expect(dug.errors).toEqual([]);
    }
    const startFeature = () => s.features.find((f): f is StartFeature => f.kind === "start")!;
    expect(planStart(s, x0 + 2, y, "Cw0", newId)).toEqual({ ok: false, errors: [START_OPEN_GROUND] });
    const p = planStart(s, x0 + 2, y, "Cw0", newId, h);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(s.applyAll(p.ops, "user", p.label).errors).toEqual([]);
    expect(startFeature().params).toMatchObject({ position: [x0 + 2, y], z: h });
    expect(startEntity(s)?.z).toBe(h);
    // (no bench: the chamber's roof and the plateau stand as they were)
    expect(s.built.heights[y * M + x0 + 2]).toBe(plateau);
    expect(startChecks(s)).toEqual({ "start.count": true, "start.flat": true, "start.entrance": true, "entities.placement": true });
    const bytes = s.exportTimber().bytes;
    const again = MapSession.open(decodeProject(s.project()));
    expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(bytes))).toBe(true);
    // without a level it keeps its own, which is not under a roof back where it was; named at the top, it stands there
    const topFrom = s.built.heights[from[1] * M + from[0]];
    if (topFrom !== h) {
      const kept = planStart(s, from[0], from[1], undefined, newId);
      expect(kept.ok && s.applyAll(kept.ops).errors.length).toBe(1);
    }
    const home = planStart(s, from[0], from[1], undefined, newId, topFrom);
    expect(home.ok && s.applyAll(home.ops).errors).toEqual([]);
    expect(startFeature().params.z).toBeUndefined();
    expect(startEntity(s)?.z).toBe(topFrom);
  });
});

describe("painting objects under a roof (D491): a level per tile, the game's rule there", () => {
  const caveTiles: number[] = [];
  for (let y = CAVE.y0 + 1; y <= CAVE.y1 - 1; y++) for (let x = CAVE.x0 + 1; x <= CAVE.x1 - 1; x++) caveTiles.push(y * W + x);
  const stroke = (kind: PaintParams["kind"], template: string | undefined, tiles: number[], z?: number): PaintParams => ({
    kind,
    ...(template ? { template } : {}),
    area: tilesToRuns(tiles, W),
    density: 1,
    seed: 7,
    ...(z !== undefined ? { levels: [{ z, area: tilesToRuns(tiles, W) }] } : {}),
  });

  it("trees, bushes and thorns painted at the cave's floor stand there, save and reopen to the same bytes", () => {
    for (const [kind, template] of [["trees", "Pine"], ["bushes", "BlueberryBush"], ["thorns", undefined]] as const) {
      const s = caveSession();
      const r = s.apply({ op: "paintObjects", params: stroke(kind, template, caveTiles, CAVE.air[0]) });
      expect(r.errors, kind).toEqual([]);
      const placed = s.built.entities.filter((e) => e.template === (template ?? "Thorns"));
      expect(placed.length, kind).toBeGreaterThan(0);
      expect(new Set(placed.map((e) => e.z)), kind).toEqual(new Set([CAVE.air[0]]));
      const checks = validateMap(readTimber(s.exportTimber().bytes), { profile: "export", loadOnly: true }).report.checks;
      for (const id of ["entities.placement", "plants.clearance"]) expect(checks.find((c) => c.id === id)?.ok ?? true, `${kind} ${id}`).toBe(true);
      const bytes = s.exportTimber().bytes;
      const again = MapSession.open(decodeProject(s.project()));
      expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(bytes)), kind).toBe(true);
    }
  });

  it("without levels a stroke paints the top as before; with them nothing lands on the roof's top", () => {
    const top = caveSession();
    expect(top.apply({ op: "paintObjects", params: stroke("bushes", "BlueberryBush", caveTiles) }).errors).toEqual([]);
    expect(new Set(top.built.entities.map((e) => e.z))).toEqual(new Set([8]));
    // the pick's level gives each tile its floor: the cave's tiles 3, its walls stay rock at 3 (refused), the lowland its top
    const s = caveSession();
    const wide: number[] = [];
    for (let x = CAVE.x0 - 2; x <= CAVE.x1; x++) wide.push(17 * W + x);
    for (let x = 30; x <= 32; x++) wide.push(25 * W + x);
    const levels = paintLevels(s, tilesToRuns(wide, W), CAVE.air[0]);
    expect(levels).toEqual([{ z: 3, area: [[17, CAVE.x0 - 2, CAVE.x1]] }]);
    const r = s.apply({ op: "paintObjects", params: { ...stroke("bushes", "BlueberryBush", wide), levels } });
    expect(r.errors).toEqual([]);
    const at = new Map(s.built.entities.map((e) => [e.y * W + e.x, e.z]));
    for (let x = CAVE.x0 - 2; x < CAVE.x0; x++) expect(at.has(17 * W + x)).toBe(false);
    for (let x = CAVE.x0; x <= CAVE.x1; x++) if (at.has(17 * W + x)) expect(at.get(17 * W + x)).toBe(3);
    expect([...at.values()].every((z) => z === 3 || z === 2)).toBe(true);
  });

  it("where nothing fits at the level, the stroke is refused with the game's reason, in one line", () => {
    // (two levels of air: a pine needs three, a birch fits)
    const s = caveWith(3, 5);
    const pine = planPaintObjects(s, stroke("trees", "Pine", caveTiles, 3));
    expect(pine).toEqual({ ok: false, errors: ["nothing can stand at level 3 there: not enough room under the roof here: the pine needs 3"] });
    const birch = planPaintObjects(s, stroke("trees", "Birch", caveTiles, 3));
    expect(birch.ok).toBe(true);
    expect(birch.ok && birch.ops.every((o) => o.op === "placeEntity" && o.params.z === 3)).toBe(true);
    // in the rock under the roof
    expect(planPaintObjects(s, stroke("bushes", "BlueberryBush", caveTiles, 6))).toEqual({ ok: false, errors: ["there is no free ground at that level under the stroke: it is rock, air or other objects"] });
  });

  it("a level's tiles lie in the stroke, one level a tile", () => {
    const s = caveSession();
    const p = stroke("bushes", "BlueberryBush", caveTiles, 3);
    expect(s.check({ op: "paintObjects", params: { ...p, levels: [{ z: 3, area: [[30, 30, 30]] }] } })).toEqual(["(30, 30) has a level but is not in the stroke"]);
    expect(s.check({ op: "paintObjects", params: { ...p, levels: [...p.levels!, { z: 4, area: [[17, 17, 17]] }] } })).toEqual(["(17, 17) has two levels"]);
    expect(s.check({ op: "paintObjects", params: { ...p, levels: [{ z: 23, area: [[17, 17, 17]] }] } })[0]).toMatch(/levels/);
  });
});
