// A stroke longer than one operation holds is never lost (D342, #787's review), and its map is the stroke the page showed
// (PERFECT): past MAX_DABS dabs (a hard stroke dabs every quarter tile, so about 10,000 tiles of travel) the session
// keeps it as consecutive operations of at most MAX_DABS, each after the first continuing the one before, one step and
// one undo (brush.ts `strokeParts`), and the build applies them as the one stroke again (`joinStrokes`). So the map is
// the page's preview of the whole stroke, whatever the tool: a soft stroke's falloff, and a working area's feathered
// edge, which a stroke begun again at the limit would move further.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { MAX_DABS, strokeParts, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 64;
const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
const session = () => {
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
};

/** Back and forth along rows 20 to 27 of the map's west half, a dab every quarter tile: `n` dabs. */
function path(n: number): number[] {
  const out: number[] = [];
  let x = 40;
  let y = 82;
  let dir = 1;
  for (let k = 0; k < n; k++) {
    out.push(x, y);
    x += dir;
    if (x > 120 || x < 40) {
      dir = -dir;
      x += 2 * dir;
      y = y >= 110 ? 82 : y + 4;
    }
  }
  return out;
}

/** The page's preview of the whole stroke on `s` (its dabs a few hundred at a time, as the page sends them): the heights
 *  it shows. */
function preview(s: MapSession, stroke: BrushParams): Uint8Array {
  const { dabs, ...settings } = stroke;
  const shown = s.built.heights.slice();
  const p = new StrokePreview(settings, s.terrainState(), shown, W, W);
  for (let k = 0; k < dabs.length; k += 512) p.add(dabs.slice(k, k + 512));
  return shown;
}

/** Applies `stroke` past the limit on `s`: the preview's map, in `parts` operations as one step, saved and reopened the
 *  same, and taken back by one undo. */
function expectAsShown(s: MapSession, stroke: BrushParams, parts: number): void {
  const before = s.built.heights.slice();
  const steps = s.history().length;
  const shown = preview(s, stroke);
  const res = s.apply({ op: "brush", params: stroke } as EditOp, "user", "Raise");
  expect(res.errors).toEqual([]);
  expect(res.applied.length).toBe(parts);
  expect(res.applied.slice(1).every((a) => a.op === "brush" && a.params.continues === true)).toBe(true);
  expect(s.history().length).toBe(steps + 1);
  expect(s.built.heights.some((h, i) => h !== before[i])).toBe(true);
  expect(Buffer.from(s.built.heights).equals(Buffer.from(shown))).toBe(true);
  expect(Buffer.from(MapSession.open(decodeProject(s.project())).built.heights).equals(Buffer.from(shown))).toBe(true);
  expect(s.undo()).toBe(true);
  expect(Buffer.from(s.built.heights).equals(Buffer.from(before))).toBe(true);
}

describe("a stroke past MAX_DABS is the stroke the page showed", () => {
  it("a hard stroke: three operations, one step, the preview's map", () => {
    const stroke: BrushParams = { tool: "raise", size: 1.5, strength: 5, target: 12, dabs: path(2 * MAX_DABS + 12_345) };
    expect(strokeParts(stroke).map((p) => p.dabs.length / 2)).toEqual([MAX_DABS, MAX_DABS, 12_345]);
    expectAsShown(session(), stroke, 3);
  }, 300_000);

  it("a hard stroke in a working area: its feathered edge moves only as far as the one stroke moves it", () => {
    const area: [number, number, number][] = [];
    for (let y = 18; y <= 30; y++) area.push([y, 8, 32]);
    expectAsShown(session(), { tool: "raise", size: 1.5, strength: 5, target: 12, area, dabs: path(MAX_DABS + 5_000) }, 2);
  }, 300_000);

  it("a soft stroke: its falloff carries on across the parts", () => {
    expectAsShown(session(), { tool: "raise", size: 1, strength: 5, dabs: path(MAX_DABS + 500) }, 2);
  }, 300_000);

  it("a stroke past the limit in a group (a Clear sources stroke's, with what it removes) is applied, never refused", () => {
    const s = session();
    const before = s.built.heights.slice();
    const tree = s.built.entities.find((e) => e.template === "Pine" || e.template === "Birch" || e.template === "Oak");
    expect(tree).toBeDefined();
    const stroke = { op: "brush", params: { tool: "raise", size: 1.5, strength: 5, target: 12, dabs: path(MAX_DABS + 10) } } as EditOp;
    const res = s.applyAll([stroke, { op: "deleteEntities", params: { entities: [tree!.id] } } as EditOp], "user", "Raise");
    expect(res.errors).toEqual([]);
    expect(res.applied.length).toBe(3);
    expect(s.built.heights.some((h, i) => h !== before[i])).toBe(true);
  }, 300_000);
});
