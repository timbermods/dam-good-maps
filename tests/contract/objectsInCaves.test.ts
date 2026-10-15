// Objects may stand in caves where the game allows them (D491): on a cave's floor, under a ledge and on a
// roof's top, held to the game's own rule (features/objects.ts `standProblem`: the cells it occupies are air,
// the ground under it solid, the water objects and mine sites on the run that reaches the map's bottom). The
// editor's rule (doc/placing.ts `entityProblem`) and the generator's (`fitProblems`) must agree exactly with
// the checks (rust/checks `entities.placement` and `plants.clearance`, what the game keeps when it loads the
// file), a placed object stands at its run top's level and the export writes it there, and a source on a
// cave's floor feeds the stacked settle.

import { describe, expect, it } from "vitest";
import { caveFile, caveSession, CAVE, LEDGE } from "./caveMap";
import { decodeProject } from "../../src/core/doc/document";
import { placeComponents } from "../../src/core/doc/objectOps";
import { entityProblem, planEntity, planMoveEntity } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { placedEntity } from "../../src/core/features/edits";
import { bottomRunTop, fitProblems, footprintAt, OBJECT_TEMPLATE, rasterizeObjects } from "../../src/core/features/objects";
import type { MapObjectKind } from "../../src/core/features/schema";
import { entityJson } from "../../src/core/format/entities";
import { coordinatesForMinCorner, FOOTPRINTS, ORIENTATIONS, type Orientation } from "../../src/core/format/footprints";
import { readTimber } from "../../src/core/format/timber";
import { validateMap } from "../../src/core/validate/checks";

const W = 40;
const ID = "00000000-0000-4000-8000-000000000001";

/** Whether the game keeps one object standing at (x, y, z) on the cave map: the checks' verdict on a file
 *  holding it alone. */
function gameKeeps(template: string, x: number, y: number, z: number, orientation: Orientation): boolean {
  const file = caveFile();
  const e = placedEntity({ id: ID, template, x, y, orientation, components: placeComponents(template) }, z);
  file.world.entities = [entityJson(e)];
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
  it("on a cave map, the editor accepts exactly what the checks keep", () => {
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
            const game = gameKeeps(template, x, y, z, orientation);
            tried++;
            if (game) kept++;
            if ((editor === null) !== game) wrong.push(`${template} at (${x}, ${y}, ${z}) ${orientation}: the editor ${editor === null ? "accepts" : `refuses (${editor})`}, the game ${game ? "keeps it" : "drops it"}`);
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
          for (const z of levelsAt(mask[cy * W + cx])) {
            // (a feature under a roof names its level: rasterizeObjects places it there)
            const fit = fitProblems(kind, tiles, { W, H, heights, masks: mask, z }, line ? undefined : { x, y, orientation });
            const roofed = z < heights[cy * W + cx] || tiles.some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && (mask[ty * W + tx] & (mask[ty * W + tx] + 1)) !== 0);
            if (!roofed) continue;
            const game = gameKeeps(template, cx, cy, z, orientation);
            if ((fit.length === 0) !== game) wrong.push(`${kind} at (${x}, ${y}, ${z}) ${orientation}: fitProblems ${fit.length ? `refuses (${fit.join("; ")})` : "accepts"}, the game ${game ? "keeps it" : "drops it"}`);
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
