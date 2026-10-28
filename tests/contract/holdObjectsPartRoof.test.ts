// Strokes hold the ground under an object standing partly under a roof (D491, amended; D270): a badwater
// source or a ruin with some of its tiles under a ledge and the rest in the open, or an object partly on a run's top and
// partly on plain ground, keeps the ground under every part of it, as the game needs it, and the stroke shapes the
// rest, never refused for it. The page's stroke shows the same, the answer counts the tiles in its one line, the
// operation logs them in its `hold`, so the project replays byte for byte, and a log from before replays as it was.
// The roof-holding ground a stroke keeps is no more than the roof needs where a cave's own ground beside it holds it.

import { describe, expect, it } from "vitest";
import { caveFile, CAVE_W as W } from "./caveMap";
import { decodeProject, encodeProject } from "../../src/core/doc/document";
import { placeComponents } from "../../src/core/doc/objectOps";
import { MapSession } from "../../src/core/doc/session";
import { placedEntity } from "../../src/core/features/edits";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { entityJson } from "../../src/core/format/entities";
import { footprintTiles, type Orientation } from "../../src/core/format/footprints";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { rockFloors, unsupportedVoxels } from "../../src/core/terrain/support";
import { validateMap } from "../../src/core/validate/checks";
import { heldWords } from "../../src/editor/caveWords";

const H = 40;
const ID = "00000000-0000-4000-8000-0000000000a1";
const at = (x: number, y: number) => y * W + x;
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
const lower = (x0: number, y0: number, x1: number, y1: number): BrushParams => ({ tool: "lower", size: 1, strength: 5, shape: "area", target: 0, dabs: [...tile(x0, y0), ...tile(x1, y1)] });

/** The cave fixture (caveMap.ts: a ledge at x 30–32, y 10–14, solid z 5–8, over lowland at level 2 from x 30) opened with
 *  one object the file holds where it stands (an import's own). */
function withObject(template: string, x: number, y: number, z: number, orientation: Orientation): MapSession {
  const file = caveFile();
  file.world.entities = [entityJson(placedEntity({ id: ID, template, x, y, orientation, components: placeComponents(template) }, z))];
  const s = MapSession.importMap(writeTimber(file), `${template}.timber`);
  s.setWaterMode("defer");
  return s;
}

/** The tiles an object covers, those in the open (a plain column) and those under the ledge. */
function parts(s: MapSession, template: string, x: number, y: number, z: number, orientation: Orientation): { open: number[]; roofed: number[] } {
  const mask = s.standGround().mask;
  const tiles = footprintTiles(template, { template, x, y, z, orientation, flipped: false }).map(([tx, ty]) => at(tx, ty));
  const plain = (i: number) => (mask[i] & (mask[i] + 1)) === 0;
  return { open: tiles.filter(plain).sort((a, b) => a - b), roofed: tiles.filter((i) => !plain(i)).sort((a, b) => a - b) };
}

/** The page's copy of a stroke, as the page paints it. */
function painted(s: MapSession, p: BrushParams): Uint8Array {
  const shown = s.built.heights.slice();
  const { dabs, ...settings } = p;
  new StrokePreview(settings, s.terrainState(), shown, W, H).add(dabs);
  return shown;
}

const placementOk = (s: MapSession) => validateMap(readTimber(s.exportTimber().bytes), { profile: "export", loadOnly: true }).report.checks.find((c) => c.id === "entities.placement")!;

// (a badwater source's 3 × 3 and an underground ruin's 5 × 5, set with their Coordinates in the open, east of the ledge,
// and two columns of their tiles under it)
const OBJECTS = [
  { name: "a badwater source", template: "BadwaterSource", x: 33, y: 13, z: 2, orientation: "Cw180" as Orientation, open: 3, roofed: 6 },
  { name: "an underground ruin", template: "UndergroundRuins", x: 35, y: 14, z: 2, orientation: "Cw180" as Orientation, open: 15, roofed: 10 },
];

describe("strokes hold the ground under an object partly under a roof (D491, amended)", () => {
  for (const o of OBJECTS)
    it(`a Lower cut across ${o.name} partly under a ledge keeps every tile it stands on and cuts the rest`, () => {
      const s = withObject(o.template, o.x, o.y, o.z, o.orientation);
      const { open, roofed } = parts(s, o.template, o.x, o.y, o.z, o.orientation);
      expect([open.length, roofed.length]).toEqual([o.open, o.roofed]);
      // (its Coordinates in the open: the gap D491's hold left before)
      expect(open).toContain(at(o.x, o.y));
      expect(s.holds().filter(([i]) => open.includes(i))).toEqual(open.map((i) => [i, 2, 2]));
      const runs = roofed.map((i) => s.terrain.runs(i));
      // (the lowland round it, east of the ledge, down to the bottom)
      const p = lower(33, 8, 38, 16);
      const shown = painted(s, p);
      const u = s.apply({ op: "brush", params: p });
      expect(u.errors).toEqual([]);
      // (the ground under it in the open stays at its level; under the ledge it stands as it was)
      for (const i of open) expect(s.built.heights[i], `tile ${i}`).toBe(2);
      expect(roofed.map((i) => s.terrain.runs(i))).toEqual(runs);
      // (the rest of the stroke is cut to the bottom)
      for (let y = 8; y <= 16; y++) for (let x = 33; x <= 38; x++) if (!open.includes(at(x, y))) expect(s.built.heights[at(x, y)], `(${x}, ${y})`).toBe(0);
      // (the object stands where it stood, the game keeps it, and the page showed exactly this land)
      expect(s.built.entities.find((e) => e.id === ID)).toMatchObject({ x: o.x, y: o.y, z: o.z });
      const placement = placementOk(s);
      expect(placement.ok, placement.message).toBe(true);
      expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
      // (the answer counts the tiles kept for it, in one line, and the operation logs them)
      expect(u.held).toEqual(open);
      expect(u.heldUnder).toBe(open.length);
      expect(heldWords(u.held!.length, u.heldUnder)).toBe(`${open.length} tiles left as they are: an object under a roof stands on them`);
      const logged = decodeProject(s.project()).edits.at(-1)!.params as BrushParams;
      for (const i of open) expect(logged.hold).toContainEqual([i, 2, 2]);
    });

  it("a cut across the ledge's cliff and the source holds both, in one line", () => {
    const o = OBJECTS[0];
    const s = withObject(o.template, o.x, o.y, o.z, o.orientation);
    const { open } = parts(s, o.template, o.x, o.y, o.z, o.orientation);
    const p = lower(26, 8, 38, 16);
    const shown = painted(s, p);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    const cliff = [10, 11, 12, 13, 14].map((y) => at(29, y));
    expect(u.held).toEqual([...cliff, ...open].sort((a, b) => a - b));
    expect(u.heldUnder).toBe(open.length);
    expect(heldWords(u.held!.length, u.heldUnder)).toBe("8 tiles left to hold up a cave or overhang and an object under a roof");
    for (const i of open) expect(s.built.heights[i]).toBe(2);
    for (const i of cliff) expect(s.built.heights[i]).toBe(6);
    expect(unsupportedVoxels(s.terrain).reduce((n, v) => n + v, 0)).toBe(0);
    expect(placementOk(s).ok).toBe(true);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
  });

  it("a relic partly on the ledge's top and partly on the cliff's ground keeps both where it stands", () => {
    // (a small relic, two tiles: one on the cliff at x 29, level 8; one on the ledge's top at x 30, level 8)
    const s = withObject("SmallRelic", 29, 12, 8, "Cw0");
    const both = [at(29, 12), at(30, 12)];
    expect(s.holds()).toEqual(both.map((i) => [i, 8, 8]));
    const p = lower(26, 9, 32, 15);
    const shown = painted(s, p);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    for (const i of both) expect(s.built.heights[i]).toBe(8);
    expect(s.built.entities.find((e) => e.id === ID)).toMatchObject({ x: 29, y: 12, z: 8 });
    expect(placementOk(s).ok).toBe(true);
    expect(unsupportedVoxels(s.terrain).reduce((n, v) => n + v, 0)).toBe(0);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
  });

  it("a stroke over the source's open part alone is refused with one line", () => {
    const o = OBJECTS[0];
    const s = withObject(o.template, o.x, o.y, o.z, o.orientation);
    const u = s.apply({ op: "sculpt", params: { mode: "lower", cells: [[11, 33, 33], [12, 33, 33], [13, 33, 33]], amount: 1 } });
    expect(u.errors).toEqual(["nothing to shape here: this ground holds an object under a roof, which the edit leaves as it is"]);
  });

  it("the project replays byte for byte, and a log from before the hold replays as it was", () => {
    const o = OBJECTS[1];
    const s = withObject(o.template, o.x, o.y, o.z, o.orientation);
    // (a stroke beside the ruin, its reach over the ruin's east column: before, it was taken and logged without a hold,
    // as it changes nothing the ruin stands on)
    const beside = lower(36, 8, 38, 16);
    expect(s.apply({ op: "brush", params: beside }).errors).toEqual([]);
    expect(s.apply({ op: "brush", params: lower(33, 8, 38, 16) }).errors).toEqual([]);
    s.settleCanonical();
    const bytes = s.project();
    const again = MapSession.open(decodeProject(bytes));
    expect(again.checkReplay()).toBe(true);
    expect(again.exportTimber().bytes).toEqual(s.exportTimber().bytes);
    const rebuilt = MapSession.open(decodeProject(bytes), { rebuild: true });
    expect(Array.from(rebuilt.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(rebuilt.built.entities.find((e) => e.id === ID)).toMatchObject({ x: o.x, y: o.y, z: o.z });
    // (the first stroke logged without a hold, as before: the build reads only the log, and builds the same land)
    const doc = decodeProject(bytes);
    const first = doc.edits.find((e) => e.op === "brush")!;
    expect((first.params as BrushParams).hold?.length).toBeGreaterThan(0);
    delete (first.params as BrushParams).hold;
    doc.edits.splice(doc.edits.indexOf(first) + 1);
    const old = MapSession.open(decodeProject(encodeProject(doc)), { rebuild: true });
    const was = withObject(o.template, o.x, o.y, o.z, o.orientation);
    expect(was.apply({ op: "brush", params: { ...beside, hold: [] } }).errors).toEqual([]);
    expect(Array.from(old.built.heights)).toEqual(Array.from(was.built.heights));
  });
});

describe("the ground kept to hold up a roof is what the roof needs (D280 (3), amended)", () => {
  it("an underside beside a cave's own ground from the bottom needs no other ground kept", () => {
    // (three tiles in a row: A, plain ground at 7; B, a roof from z 5 to 6 over air at 3–4, ground 0–2; C, a cave whose
    // ground from the bottom reaches z 5, under a roof at 8)
    const run = (a: number, b: number) => ((1 << b) - 1) & ~((1 << a) - 1);
    const masks = Uint32Array.from([run(0, 7), run(0, 3) | run(5, 7), run(0, 6) | run(8, 10)]);
    const t = new ColumnTerrain(3, 1, masks);
    expect(rockFloors(t, [1, 2])).toEqual([]);
    // (without C's ground there, A holds B's roof: no lower than one above its underside)
    const alone = new ColumnTerrain(3, 1, Uint32Array.from([run(0, 7), run(0, 3) | run(5, 7), run(0, 3) | run(8, 10)]));
    expect(rockFloors(alone, [1, 2])).toEqual([[0, 6]]);
  });
});
