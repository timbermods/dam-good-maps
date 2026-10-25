// Objects may stand in caves where the game allows them (D491): on a cave's floor, under a ledge and on a
// roof's top, held to the game's own rule (features/objects.ts `standProblem`: the cells it occupies are air,
// the ground under it solid, the water objects and mine sites on the run that reaches the map's bottom). The
// editor's rule (doc/placing.ts `entityProblem`) and the generator's (`fitProblems`) must agree exactly with
// the checks (rust/checks `entities.placement` and `plants.clearance`, what the game keeps when it loads the
// file), a placed object stands at its run top's level and the export writes it there, and a source on a
// cave's floor feeds the stacked settle.

import { describe, expect, it } from "vitest";
import { caveFile, caveSession, caveVoxels, CAVE, LEDGE, LOWLAND_X } from "./caveMap";
import { decodeProject } from "../../src/core/doc/document";
import { placeComponents } from "../../src/core/doc/objectOps";
import { entityProblem, planEntity, planMoveEntity } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { applyEntityEdits, placedEntity } from "../../src/core/features/edits";
import { bottomRunTop, fitProblems, footprintAt, OBJECT_TEMPLATE, openPart, rasterizeObjects } from "../../src/core/features/objects";
import type { MapObjectKind } from "../../src/core/features/schema";
import { entityJson, type EntitySpec } from "../../src/core/format/entities";
import { coordinatesForMinCorner, FOOTPRINTS, footprintTiles, ORIENTATIONS, type Orientation } from "../../src/core/format/footprints";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { validateMap } from "../../src/core/validate/checks";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import type { BrushParams } from "../../src/core/features/raster/brush";

const W = 40;
const ID = "00000000-0000-4000-8000-000000000001";

/** Whether the game keeps one object standing at (x, y, z) on the cave map (or `voxels`): the checks'
 *  verdict on a file holding it alone, or after `others`. */
function gameKeeps(template: string, x: number, y: number, z: number, orientation: Orientation, others: EntitySpec[] = [], voxels?: Uint8Array): boolean {
  const file = caveFile(voxels);
  const e = placedEntity({ id: ID, template, x, y, orientation, components: placeComponents(template) }, z);
  file.world.entities = [...others, e].map(entityJson);
  const checks = validateMap(file, { profile: "import", loadOnly: true }).report.checks;
  const dropped = (id: string) => (checks.find((c) => c.id === id)?.where?.entities ?? []).includes(ID);
  return !dropped("entities.placement") && !dropped("plants.clearance");
}

/** The level of every run top on a tile, and one level above its lowest (ground that is not there). */
function levelsAt(mask: number): number[] {
  const out = new Set<number>();
  for (let z = 1; z < 23; z++) if (mask & (1 << (z - 1)) && !(mask & (1 << z))) out.add(z);
  out.add(bottomRunTop(mask) + 1);
  return [...out].sort((a, b) => a - b);
}

/** Spots around the cave and the ledge: inside, at the cave's corners and walls, under the ledge, on its
 *  top and beside both. */
const SPOTS: [number, number][] = [
  [17, 17], [CAVE.x0, CAVE.y0], [CAVE.x1, CAVE.y1], [CAVE.x1 - 1, CAVE.y0 + 1], [CAVE.x0 - 1, 17],
  [31, 12], [LEDGE.x0, LEDGE.y0], [LEDGE.x1, LEDGE.y1], [LEDGE.x0 - 1, 12], [LEDGE.x1 + 1, 12],
];

const TEMPLATES = [
  "WaterSource", "BadwaterSource", "WaterSeep", "Aquifer", "BadtideDrain", "UndergroundRuins", "GeothermalField",
  "SmallRelic", "LargeRelic", "UnstableCore", "RuinColumnH1", "RuinColumnH3", "RuinColumnH5",
  "Pine", "Birch", "BlueberryBush", "Thorns", "Blockage", "NaturalDam",
];

describe("objects in caves (D491): the editor's rule is the game's", () => {
  it("on a cave map, the editor accepts exactly what the checks keep, but at a level partly in the open", () => {
    const s = caveSession();
    const mask = s.standGround().mask;
    const heights = s.built.heights;
    const wrong: string[] = [];
    let kept = 0;
    let tried = 0;
    for (const template of TEMPLATES) {
      for (const [x, y] of SPOTS) {
        for (const orientation of FOOTPRINTS[template].size[0] * FOOTPRINTS[template].size[1] > 1 ? (["Cw0", "Cw180"] as const) : (["Cw0"] as const)) {
          for (const z of levelsAt(mask[y * W + x])) {
            const top = z === heights[y * W + x];
            const editor = entityProblem(s, { template, x, y, ...(top ? {} : { z }), orientation });
            // (at a level, it must stand wholly under the roof, so no later stroke reaches its ground)
            const open = !top && !!openPart(footprintTiles(template, { template, x, y, z, orientation, flipped: false }), z, { W, H: 40, heights });
            const game = gameKeeps(template, x, y, z, orientation);
            tried++;
            if (game) kept++;
            if ((editor === null) !== (game && !open)) wrong.push(`${template} at (${x}, ${y}, ${z}) ${orientation}: the editor ${editor === null ? "accepts" : `refuses (${editor})`}, the game ${game ? "keeps it" : "drops it"}${open ? ", partly in the open" : ""}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    // (both answers are well represented)
    expect(kept).toBeGreaterThan(tried / 5);
    expect(tried - kept).toBeGreaterThan(tried / 5);
  });

  it("the generator's rule (fitProblems) agrees with the checks under a roof", () => {
    const s = caveSession();
    const { mask } = s.standGround();
    const heights = s.built.heights;
    const H = 40;
    const kinds: MapObjectKind[] = ["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal", "unstableCore", "thornBelt", "weir", "plug"];
    const wrong: string[] = [];
    for (const kind of kinds) {
      const template = OBJECT_TEMPLATE[kind];
      const line = kind === "thornBelt" || kind === "weir" || kind === "plug";
      for (const [x, y] of SPOTS) {
        for (const orientation of line ? (["Cw0"] as const) : ORIENTATIONS) {
          const tiles = line ? [[x, y] as [number, number]] : footprintAt(kind, x, y, orientation);
          const [cx, cy] = line ? [x, y] : coordinatesForMinCorner(FOOTPRINTS[template].size[0], FOOTPRINTS[template].size[1], x, y, orientation);
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          const inMap = tiles.filter(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H);
          // (on the top, a feature stands at the highest level under it: rasterizeObjects)
          const onTop = Math.max(...inMap.map(([tx, ty]) => heights[ty * W + tx]));
          for (const z of levelsAt(mask[cy * W + cx])) {
            const top = z >= heights[cy * W + cx];
            const fit = fitProblems(kind, tiles, { W, H, heights, masks: mask }, line ? (top ? undefined : { z }) : { x, y, orientation, ...(top ? {} : { z }) });
            const roofed = !top || inMap.some(([tx, ty]) => (mask[ty * W + tx] & (mask[ty * W + tx] + 1)) !== 0);
            if (!roofed || (top && z !== heights[cy * W + cx])) continue;
            const open = !top && !!openPart(tiles, z, { W, H, heights });
            const game = gameKeeps(template, cx, cy, top && !line ? onTop : z, orientation);
            if ((fit.length === 0) !== (game && !open)) wrong.push(`${kind} at (${x}, ${y}, ${z}) ${orientation}: fitProblems ${fit.length ? `refuses (${fit.join("; ")})` : "accepts"}, the game ${game ? "keeps it" : "drops it"}${open ? ", partly in the open" : ""}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    // and a feature that names its level stands there
    const relic = rasterizeObjects({ id: "f-aaaaaaaaaaaaa", kind: "mapObject", origin: "user", locked: false, params: { kind: "relicSmall", placement: { x: 17, y: 17, orientation: "Cw0", z: 3 } } }, W, H, heights);
    expect(relic.map((e) => e.z)).toEqual([3]);
  });

  it("says why in one plain line: no room under the roof, or not on ground that reaches the bottom", () => {
    const s = caveSession();
    // the cave is three levels high: a pine fits, a ruin five high does not
    expect(entityProblem(s, { template: "Pine", x: 17, y: 17, z: 3, orientation: "Cw0" })).toBeNull();
    expect(entityProblem(s, { template: "RuinColumnH5", x: 17, y: 17, z: 3, orientation: "Cw0" })).toBe("not enough room under the roof here: the ruin needs 5");
    // a source stands on the cave's floor, never on the ledge's top or under it on ground over air
    expect(entityProblem(s, { template: "WaterSource", x: 17, y: 17, z: 3, orientation: "Cw0" })).toBeNull();
    expect(entityProblem(s, { template: "WaterSource", x: 31, y: 12, orientation: "Cw0" })).toBe("the game keeps a water source only on ground that goes down to the bottom of the map, not on a roof or a ledge");
    expect(entityProblem(s, { template: "WaterSource", x: 17, y: 17, z: 8, orientation: "Cw0" })).toMatch(/not under a roof here/);
  });
});

/** The cave fixture with a taller cave: ground at level 12, air at z 3–8 under a roof three thick. */
function tallCave(): Uint8Array {
  const v = caveVoxels();
  const N = W * 40;
  for (let y = 0; y < 40; y++) for (let x = 0; x < LOWLAND_X; x++) for (let z = 8; z < 12; z++) v[z * N + y * W + x] = 1;
  for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = CAVE.x0; x <= CAVE.x1; x++) for (let z = 3; z < 9; z++) v[z * N + y * W + x] = 0;
  return v;
}

describe("objects in caves (D491): the edge cases", () => {
  it("a drill stands on an aquifer under a roof where its five levels fit, as the game keeps it", () => {
    const s = MapSession.importMap(writeTimber(caveFile(tallCave())), "tall.timber");
    const aquifer = planEntity(s, { template: "Aquifer", x: 16, y: 16, z: 3, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000c1");
    expect(aquifer.ok && s.applyBatch(aquifer.ops).ok).toBe(true);
    const drill = { template: "AncientAquiferDrill", x: 16, y: 16, z: 3, orientation: "Cw0" as const };
    expect(entityProblem(s, drill)).toBeNull();
    const a = s.built.entities.find((e) => e.id === "00000000-0000-4000-8000-0000000000c1")!;
    expect(gameKeeps(drill.template, 16, 16, 3, "Cw0", [a], tallCave())).toBe(true);
    // in the low cave it has no room, and without the aquifer it has nothing to stand on
    const low = caveSession();
    expect(entityProblem(low, drill)).toBe("a drill needs an aquifer under it");
  });

  it("an object stacked on a stackable is refused, though the game keeps it: ground of objects is not counted", () => {
    const s = caveSession();
    const bridge = planEntity(s, { template: "NaturalOverhang2x1", x: 16, y: 16, z: 3, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000d1");
    expect(bridge.ok && s.applyBatch(bridge.ops).ok).toBe(true);
    const o = s.built.entities.find((e) => e.id === "00000000-0000-4000-8000-0000000000d1")!;
    expect(entityProblem(s, { template: "RuinColumnH1", x: 16, y: 16, z: 4, orientation: "Cw0" })).toBe("the ground under it is not level");
    expect(gameKeeps("RuinColumnH1", 16, 16, 4, "Cw0", [o])).toBe(true);
  });

  it("at a level, partly in the open, is refused: no later stroke buries it or leaves it floating", () => {
    const s = caveSession();
    expect(entityProblem(s, { template: "GeothermalField", x: 32, y: 11, z: 2, orientation: "Cw0" })).toBe("part of it would stand in the open: under a roof it stands wholly under it");
    expect(gameKeeps("GeothermalField", 32, 11, 2, "Cw0")).toBe(true);
  });

  it("on a roof's top straddling the open, a stroke under its open part never leaves it buried or floating", () => {
    for (const tool of ["raise", "lower"] as const) {
      const s = caveSession();
      // a small relic on the cave's roof top and the open ground beside it, both at level 8
      const relic = planEntity(s, { template: "SmallRelic", x: CAVE.x1, y: 17, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000e1");
      expect(relic.ok && s.applyBatch(relic.ops).ok).toBe(true);
      s.apply({ op: "brush", params: { tool, size: 1, strength: 5, shape: "area", target: tool === "raise" ? 10 : 5, dabs: [4 * (CAVE.x1 + 1) + 2, 4 * 17 + 2, 4 * (CAVE.x1 + 4) + 2, 4 * 17 + 2] } });
      const file = readTimber(s.exportTimber().bytes);
      const placement = validateMap(file, { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "entities.placement")!;
      expect(placement.ok, `${tool}: ${placement.message}`).toBe(true);
    }
  });

  it("a map object feature's level is checked on the map's ground, in one line", () => {
    const s = caveSession();
    const relic = (x: number, y: number, z: number) => ({ op: "addFeature" as const, params: { feature: { id: "f-aaaaaaaaaaaab", kind: "mapObject", origin: "user", locked: false, params: { kind: "relicSmall", placement: { x, y, orientation: "Cw0", z } } } as never } });
    expect(s.check(relic(17, 17, 3))).toEqual([]);
    expect(s.check(relic(17, 17, 4))).toEqual(["the small relic can't stand at level 4 there: the ground under it is not level"]);
    expect(s.check(relic(5, 5, 20))).toEqual(["the small relic can't stand at level 20 there: part of it would stand in the open: under a roof it stands wholly under it"]);
  });

  it("the start stays on open ground", () => {
    expect(entityProblem(caveSession(), { template: "StartingLocation", x: 16, y: 16, orientation: "Cw0" })).toBe("the start needs open ground: there is a cave or overhang there");
  });

  it("an object under a roof that a force carries keeps its level", () => {
    const e = placedEntity({ id: ID, template: "RuinColumnH1", x: 17, y: 17, orientation: "Cw0", components: placeComponents("RuinColumnH1") }, 3);
    const heights = caveSession().built.heights;
    const out = applyEntityEdits([e], [{ seq: 5, op: "moveEntity", params: { id: ID, x: 18, y: 17, quiet: true } }], { W, H: 40, heights }, true);
    expect(out.entities[0]).toMatchObject({ x: 18, z: 3 });
  });
});

/** The cave fixture opened with a geothermal field the file holds under the ledge, six of its nine tiles
 *  over the open lowland (an import's own: the editor would not place it so). */
function straddled(): MapSession {
  const file = caveFile();
  const e = placedEntity({ id: ID, template: "GeothermalField", x: 32, y: 11, orientation: "Cw0", components: placeComponents("GeothermalField") }, 2);
  file.world.entities = [entityJson(e)];
  return MapSession.importMap(writeTimber(file), "straddled.timber");
}
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
const area = (tool: "raise" | "lower", target: number, x0: number, y0: number, x1: number, y1: number): BrushParams => ({ tool, size: 1, strength: 5, shape: "area", target, dabs: [...tile(x0, y0), ...tile(x1, y1)] });

describe("objects in caves (D491): strokes hold the ground under objects set under a roof", () => {
  for (const [tool, target] of [["raise", 6], ["lower", 0]] as const) {
    it(`a ${tool} stroke over an object's open part holds its tiles, shapes the rest, and the preview shows exactly that`, () => {
      const s = straddled();
      const before = s.built.heights.slice();
      const params = area(tool, target, 32, 11, 37, 14);
      // the page's preview, from the terrain state, as the page paints it
      const { dabs, ...settings } = params;
      const preview = new StrokePreview(settings, s.terrainState(), s.built.heights.slice(), W, 40);
      preview.add(dabs);
      const u = s.apply({ op: "brush", params });
      expect(u.ok, u.errors.join("; ")).toBe(true);
      // (its tiles in the open stay; under the ledge the stroke shapes only the ledge's top, D487)
      const mask = s.standGround().mask;
      const footprint = new Set(footprintTiles("GeothermalField", { template: "GeothermalField", x: 32, y: 11, z: 2, orientation: "Cw0", flipped: false }).map(([x, y]) => y * W + x).filter((i) => (mask[i] & (mask[i] + 1)) === 0));
      expect(footprint.size).toBe(6);
      for (const i of footprint) expect(s.built.heights[i], `tile ${i}`).toBe(before[i]);
      // (the rest of the stroke is shaped as normal)
      expect(s.built.heights[12 * W + 36]).not.toBe(before[12 * W + 36]);
      expect(Array.from(preview.pre.slice(0)).filter((_, i) => footprint.has(i))).toEqual([...footprint].sort((a, b) => a - b).map((i) => before[i]));
      expect(Array.from(s.terrainState().pre)).toEqual(Array.from(preview.pre));
      const placement = validateMap(readTimber(s.exportTimber().bytes), { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "entities.placement")!;
      expect(placement.ok, placement.message).toBe(true);
    });
  }

  it("a stroke only over held ground is refused, saying why; a sculpt there leaves it too", () => {
    const s = straddled();
    const u = s.apply({ op: "brush", params: area("raise", 6, 33, 12, 34, 13) });
    expect(u).toMatchObject({ ok: false, errors: ["nothing to shape here: this ground holds an object under a roof, which the edit leaves as it is"] });
    const before = s.built.heights.slice();
    const k = s.apply({ op: "sculpt", params: { mode: "raise", cells: [[12, 33, 36]], amount: 2 } });
    expect(k.ok, k.errors.join("; ")).toBe(true);
    expect([s.built.heights[12 * W + 33], s.built.heights[12 * W + 34], s.built.heights[12 * W + 36]]).toEqual([before[12 * W + 33], before[12 * W + 34], before[12 * W + 36] + 2]);
  });
});

describe("objects in caves (D491): placed at their level, exported there, feeding the water", () => {
  it("a source on a cave's floor and a ruin under the ledge stand at their run tops, save, reopen and export there", () => {
    const s = caveSession();
    const source = planEntity(s, { template: "WaterSource", x: 17, y: 17, z: 3, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000a1");
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    // (nothing is levelled under a roof)
    expect(source.ops.map((o) => o.op)).toEqual(["placeEntity"]);
    expect(s.applyBatch(source.ops).ok).toBe(true);
    const ruin = planEntity(s, { template: "RuinColumnH2", x: 31, y: 12, z: 2, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000a2");
    expect(ruin.ok && s.applyBatch(ruin.ops).ok).toBe(true);
    const at = (m: MapSession, id: string) => m.built.entities.find((e) => e.id === id)?.z;
    expect([at(s, "00000000-0000-4000-8000-0000000000a1"), at(s, "00000000-0000-4000-8000-0000000000a2")]).toEqual([3, 2]);
    // a move under the ledge keeps the level it stands on
    const moved = planMoveEntity(s, "00000000-0000-4000-8000-0000000000a2", 0, 1);
    expect(moved.ok && moved.ops.at(-1)).toMatchObject({ op: "moveEntity", params: { x: 31, y: 13, z: 2 } });
    // the stacked settle: the source fills its cave and leaves the roof's top dry
    s.settleCanonical();
    const st = s.built.settle.stack!;
    expect(st.stacked).toBe(true);
    const N = st.W * st.H;
    const i = 17 * W + 17;
    const depthOn = (floor: number) => {
      for (let k = 0; k < st.count[i]; k++) if (st.floor[k * N + i] === floor) return st.depth[k * N + i];
      return NaN;
    };
    expect(depthOn(CAVE.air[0])).toBeGreaterThan(0.5);
    expect(depthOn(8)).toBeLessThan(0.05);
    // the export writes them where they stand, and the game keeps them
    const bytes = s.exportTimber().bytes;
    const file = readTimber(bytes);
    const z = (id: string) => ((file.world.entities.find((e) => e.Id === id)?.Components as { BlockObject: { Coordinates: { Z: number } } }).BlockObject.Coordinates.Z);
    expect([z("00000000-0000-4000-8000-0000000000a1"), z("00000000-0000-4000-8000-0000000000a2")]).toEqual([3, 2]);
    const placement = validateMap(file, { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "entities.placement")!;
    expect(placement.ok).toBe(true);
    // a saved project reopens with them there, to the same bytes
    const again = MapSession.open(decodeProject(s.project()));
    expect(at(again, "00000000-0000-4000-8000-0000000000a1")).toBe(3);
    again.settleCanonical();
    expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("a placement the game refuses is refused with its reason, and the operation too", () => {
    const s = caveSession();
    // (three levels of air under the ledge: a pine fits, a ruin four high does not)
    expect(planEntity(s, { template: "Pine", x: 31, y: 12, z: 2, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000b0").ok).toBe(true);
    const r = planEntity(s, { template: "RuinColumnH4", x: 31, y: 12, z: 2, orientation: "Cw0" }, "00000000-0000-4000-8000-0000000000b1");
    expect(r).toEqual({ ok: false, errors: ["not enough room under the roof here: the ruin needs 4"] });
    const op = { op: "placeEntity" as const, params: { id: "00000000-0000-4000-8000-0000000000b2", template: "Birch", x: 17, y: 17, z: 4, orientation: "Cw0" as const } };
    expect(s.check(op)).toEqual(["the ground under it is not level"]);
  });
});
