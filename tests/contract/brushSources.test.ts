// Brushes and water sources (PLAN §20 D249). With Clear sources off, sources ride the ground: a
// brush changes a source's tile like any other and the source stands on it; a 3 × 3 badwater source
// rides as one rigid, level piece (the stroke's `rigid` rectangles); nothing is left in a pit or on
// a pillar, and no strength or footprint changes. What the page paints is what the build makes; a
// rebuild round it equals a full build; the project replays it. A stroke saved before this (its
// `keep` runs over a source) replays exactly as it did (D158). With Clear sources on, the stroke and
// the sources it pressed on go in one undo step.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { brushProblems, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const WATER = "d2490000-0000-4000-8000-000000000001";
const BAD = "d2490000-0000-4000-8000-000000000002";

/** A dry spot far from the start with room for a source and a badwater source beside it. */
function spot(s: MapSession): [number, number] | null {
  const b = s.built;
  const st = b.start!;
  for (let y = 14; y < W - 14; y++)
    for (let x = 14; x < W - 20; x++) {
      if (Math.hypot(x - st.x, y - st.y) < 36) continue;
      let dry = true;
      for (let yy = y - 8; yy <= y + 8 && dry; yy++) for (let xx = x - 8; xx <= x + 14 && dry; xx++) if (b.water[yy * W + xx] > 0 || b.channel[yy * W + xx] || b.heights[yy * W + xx] > 11) dry = false;
      if (dry && !b.entities.some((e) => Math.abs(e.x - x - 3) <= 9 && Math.abs(e.y - y) <= 9 && !/^(Pine|Birch|Oak|BlueberryBush)$/.test(e.template))) return [x, y];
    }
  return null;
}

/** The first of a few River Valley maps with such a spot (generator 0.7.0's land, #56). */
function session(): { s: MapSession; x: number; y: number } {
  let found: { s: MapSession; at: [number, number] } | null = null;
  for (let seed = 3; seed < 20 && !found; seed++) {
    const r = generate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const at = spot(s);
    if (at) found = { s, at };
  }
  if (!found) throw new Error("no spot");
  const { s } = found;
  const [x, y] = found.at;
  const place = (id: string, template: string, px: number, py: number) =>
    s.apply({ op: "placeEntity", params: { id, template, x: px, y: py, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } });
  expect(place(WATER, "WaterSource", x, y).errors).toEqual([]);
  expect(place(BAD, "BadwaterSource", x + 6, y - 1).errors).toEqual([]);
  return { s, x, y };
}

/** A raise held between the two sources: the badwater source's tiles under the brush's falloff. */
function raise(x: number, y: number, rigid?: [number, number, number, number][]): BrushParams {
  const dabs: number[] = [];
  for (let k = 0; k < 40; k++) dabs.push(4 * (x + 3) + 2, 4 * y + 2);
  return { tool: "raise", size: 5, strength: 10, dabs, ...(rigid ? { rigid } : {}) };
}

const byId = (s: MapSession, id: string) => s.built.entities.find((e) => e.id === id)!;
const strength = (s: MapSession, id: string) => JSON.stringify(byId(s, id).before ?? byId(s, id).components);

describe("brushes and water sources (D249)", () => {
  it("with Clear sources off, a source rides a stroke's ground: a water source on its raised tile, a badwater source whole and level", () => {
    const { s, x, y } = session();
    const h0 = s.built.heights.slice();
    const was = strength(s, BAD);
    const piece: [number, number, number, number] = [x + 6, y - 1, x + 8, y + 1];
    // the control: without the piece riding whole, the falloff would leave its ground uneven, so the
    // stroke is refused with its reason and changes nothing (D342 (4); the release gate, D385)
    const loose = session();
    const before = loose.s.built.heights.slice();
    const steps = loose.s.history().length;
    expect(loose.s.apply({ op: "brush", params: raise(x, y) }, "user", "Raise").errors[0]).toMatch(/badwater source at .* off level ground/);
    expect(Array.from(loose.s.built.heights)).toEqual(Array.from(before));
    expect(loose.s.history().length).toBe(steps);

    expect(s.apply({ op: "brush", params: raise(x, y, [piece]) }, "user", "Raise").errors).toEqual([]);
    const h = s.built.heights;
    // the water source stands on its tile, raised: no pit
    expect(h[y * W + x]).toBeGreaterThan(h0[y * W + x]);
    expect(byId(s, WATER).z).toBe(h[y * W + x]);
    // the badwater source: its nine tiles at its middle's level, raised, and it stands on them
    const mid = h[y * W + x + 7];
    expect(mid).toBeGreaterThan(h0[y * W + x + 7]);
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x + 6; xx <= x + 8; xx++) expect(h[yy * W + xx], `(${xx}, ${yy})`).toBe(mid);
    expect(byId(s, BAD).z).toBe(mid);
    // its strength and footprint as they were
    expect(strength(s, BAD)).toBe(was);
    expect([byId(s, BAD).x, byId(s, BAD).y]).toEqual([x + 6, y - 1]);
  });

  it("the page paints what the build makes; a rebuild round it equals a full build; undo, redo and the project replay it", () => {
    const { s, x, y } = session();
    const piece: [number, number, number, number] = [x + 6, y - 1, x + 8, y + 1];
    const p = raise(x, y, [piece]);
    const shown = s.built.heights.slice();
    const { dabs, rigid, ...settings } = p;
    // the page: the dabs a few at a time, then the pieces ride it whole when it is let go
    const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
    for (let j = 0; j < dabs.length; j += 6) preview.add(dabs.slice(j, j + 6));
    preview.finish(rigid!);
    const before = s.built.heights.slice();
    expect(s.apply({ op: "brush", params: p }, "user", "Raise").errors).toEqual([]);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    const after = Array.from(s.built.heights);
    // another stroke touching only the piece's corner: rebuilt round it, it equals a full build
    const touch: BrushParams = { tool: "lower", size: 1.5, strength: 10, dabs: [4 * (x + 9) + 2, 4 * (y + 2) + 2, 4 * (x + 9) + 2, 4 * (y + 2) + 2] };
    expect(s.apply({ op: "brush", params: touch }, "user", "Lower").errors).toEqual([]);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    s.undo();
    expect(Array.from(s.built.heights)).toEqual(after);
    s.undo();
    expect(Array.from(s.built.heights)).toEqual(Array.from(before));
    s.redo();
    expect(Array.from(s.built.heights)).toEqual(after);
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(after);
    const sources = (m: MapSession) => m.built.entities.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource").map((e) => `${e.id}@${e.x},${e.y},${e.z}`);
    expect(sources(again)).toEqual(sources(s));
  });

  it("a stroke saved before this, its kept runs over the sources, replays exactly as it did", () => {
    const { s, x, y } = session();
    const h0 = s.built.heights.slice();
    // (the page kept every non-plant object's tiles in a precise stroke: the sources' too)
    const keep: [number, number, number][] = [[y, x, x], [y - 1, x + 6, x + 8], [y, x + 6, x + 8], [y + 1, x + 6, x + 8]];
    const dabs: number[] = [];
    for (let k = -2; k <= 10; k++) dabs.push(4 * (x + k) + 2, 4 * y + 2);
    const p: BrushParams = { tool: "raise", size: 3, strength: 5, precise: true, levels: dabs.filter((_, j) => j % 2 === 0).map(() => 2), keep, dabs };
    expect(s.apply({ op: "brush", params: p }, "user", "Raise").errors).toEqual([]);
    // the badwater source's ground as it was, the ground round it raised
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x + 6; xx <= x + 8; xx++) expect(s.built.heights[yy * W + xx]).toBe(h0[yy * W + xx]);
    expect(s.built.heights[y * W + x + 5]).toBeGreaterThan(h0[y * W + x + 5]);
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });

  it("Keep holds a source's ground as the map shows it, also over a spike the integrity pass levels (D322, item 31)", () => {
    // (found on Highlands 96² seed 4242 when its map changed with D385: a soft raise left a one-tile
    // spike under a source, shown at its neighbours' level; Keep kept the spike, so the source rose)
    const { s, x: sx, y } = session();
    // a level tile in the spot, its four neighbours at its level, with a source of its own
    const h = s.built.heights;
    let x = -1;
    for (let k = sx - 6; k <= sx - 2 && x < 0; k++) {
      const i = y * W + k;
      if (h[i - 1] === h[i] && h[i + 1] === h[i] && h[i - W] === h[i] && h[i + W] === h[i]) x = k;
    }
    expect(x).toBeGreaterThan(0);
    const KEPT = "d2490000-0000-4000-8000-000000000003";
    expect(s.apply({ op: "placeEntity", params: { id: KEPT, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } }).errors).toEqual([]);
    // a spike on its tile: raised alone, the integrity pass shows it at its neighbours' level
    const h0 = s.built.heights[y * W + x];
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[y, x, x]], amount: 1 } }).errors).toEqual([]);
    expect(s.terrainState().pre[y * W + x]).toBe(h0 + 1);
    expect(s.built.heights[y * W + x]).toBe(h0);
    expect(byId(s, KEPT).z).toBe(h0);
    // a Keep stroke round it: the source and its ground stay where the map showed them; the land round rises
    const dabs: number[] = [];
    for (let k = 0; k < 30; k++) dabs.push(4 * x + 2, 4 * y + 2);
    const settings: Omit<BrushParams, "dabs"> = { tool: "raise", size: 5, strength: 5, sources: "keep", keep: [[y, x, x]] };
    const shown = s.built.heights.slice();
    const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
    for (let j = 0; j < dabs.length; j += 6) preview.add(dabs.slice(j, j + 6));
    expect(s.apply({ op: "brush", params: { ...settings, dabs } }, "user", "Raise").errors).toEqual([]);
    expect(s.built.heights[y * W + x]).toBe(h0);
    expect(byId(s, KEPT).z).toBe(h0);
    expect(s.built.heights[y * W + x + 1]).toBeGreaterThan(h0);
    // the page painted what the build made, and a full build and the project agree
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    expect(Array.from(MapSession.open(decodeProject(s.project())).built.heights)).toEqual(Array.from(s.built.heights));
  });

  it("a stroke's riding pieces are rectangles on the map, a few tiles across", () => {
    const base: BrushParams = { tool: "raise", size: 3, strength: 5, dabs: [40, 40] };
    expect(brushProblems({ ...base, rigid: [[4, 4, 6, 6]] }, W, W)).toEqual([]);
    expect(brushProblems({ ...base, rigid: [[6, 4, 4, 6]] }, W, W)).not.toEqual([]);
    expect(brushProblems({ ...base, rigid: [[94, 4, 96, 6]] }, W, W)).not.toEqual([]);
    expect(brushProblems({ ...base, rigid: [[4, 4, 20, 6]] }, W, W)).not.toEqual([]);
    const ajv = new Ajv2020({ strict: false });
    const check = ajv.compile(opsSchema);
    expect(check({ op: "brush", params: { ...base, rigid: [[4, 4, 6, 6]] } })).toBe(true);
    expect(check({ op: "brush", params: { ...base, rigid: [[4, 4, 6]] } })).toBe(false);
  });

  it("Clear sources: the stroke and the sources it pressed on go in one undo step; the others stay; undo brings them back", async () => {
    // (the map the other tests use: the first with a dry spot)
    const seed = Number(session().s.spec?.seed ?? 3);
    await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const open = () => MapSession.open(decodeProject(ed.project().bytes));
    const [x, y] = spot(open())!;
    const place = (id: string, template: string, px: number, py: number) =>
      ed.apply({ op: "placeEntity", params: { id, template, x: px, y: py, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } });
    expect(place(WATER, "WaterSource", x, y).errors).toEqual([]);
    expect(place(BAD, "BadwaterSource", x + 6, y - 1).errors).toEqual([]);
    const ids = () => open().built.entities.filter((e) => e.template === "WaterSource" || e.template === "BadwaterSource").map((e) => e.id);
    const n0 = ed.sessionInfo().history.filter((h) => h.applied).length;
    const heights0 = Array.from(open().built.heights);
    const dabs: number[] = [];
    for (let k = 0; k < 10; k++) dabs.push(4 * x + 2, 4 * y + 2);
    const op: EditOp = { op: "brush", params: { tool: "raise", size: 2, strength: 8, dabs } };
    // the page sends the tiles of the sources the brush pressed on: the water source's
    const u = ed.strokeClearing(op, "Raise, 13 tiles", [y * W + x]);
    expect(u.ok).toBe(true);
    const h = ed.sessionInfo().history.filter((e) => e.applied);
    expect(h).toHaveLength(n0 + 1);
    expect(h.at(-1)!.label).toBe("Raise, 13 tiles, a source cleared");
    expect(ids()).not.toContain(WATER);
    expect(ids()).toContain(BAD);
    expect(open().built.heights[y * W + x]).toBeGreaterThan(heights0[y * W + x]);
    ed.undo();
    expect(ids()).toContain(WATER);
    expect(Array.from(open().built.heights)).toEqual(heights0);
    // no source there: the stroke alone, under its own label
    ed.redo();
    const v = ed.strokeClearing({ op: "brush", params: { tool: "raise", size: 2, strength: 8, dabs: dabs.map((d, j) => (j % 2 ? d + 40 : d)) } }, "Raise, 12 tiles", [(y + 10) * W + x]);
    expect(v.ok).toBe(true);
    expect(ed.sessionInfo().history.filter((e) => e.applied).at(-1)!.label).toBe("Raise, 12 tiles");
  });
});
