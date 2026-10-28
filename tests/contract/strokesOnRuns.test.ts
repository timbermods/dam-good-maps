// The brushes on runs (3D step 3, D280 (3)): on a map with caves or overhangs a stroke shapes each
// tile's top run and never what is under a roof; a roof keeps its lowest layer; a stroke that would
// take the ground holding up a roof keeps it instead and shapes the rest (D280 (3), amended by
// #ROCKHOLD-PR: strokesHoldRock.test.ts), so the page's stroke shows nothing falling; undo gives back the exact runs, an incremental build equals a full one, and the log replays
// onto the same runs through the project file. (On a heightfield nothing changes: the stroke
// hashes, `tools/stroke-hashes.ts`, are dev's.)

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { decodeWorld } from "../../src/core/format/world";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { strFromU8, unzipSync } from "fflate";
import { mulberry } from "./brushRandom";
import { CAVE, CAVE_W as W, CAVE_H as H, caveSession, caveVoxels } from "./caveMap";
import { randomBrush, STROKE_TOOLS } from "./strokeRandom";

const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
const at = (x: number, y: number) => y * W + x;
const area = (tool: "raise" | "lower", target: number, x0: number, y0: number, x1: number, y1: number): BrushParams => ({ tool, size: 1, strength: 5, shape: "area", target, dabs: [...tile(x0, y0), ...tile(x1, y1)] });

/** What lies under each tile's top run (its runs but the top one), which no stroke changes. */
function under(t: ColumnTerrain, i: number): number[] {
  const r = t.runs(i);
  return r.slice(0, Math.max(0, r.length - 2));
}

/** The page's copy of a stroke, painted dab by dab as the page does, and the operation it records. */
function painted(s: MapSession, p: BrushParams): { shown: Uint8Array; preview: StrokePreview; params: BrushParams } {
  const shown = s.built.heights.slice();
  const { dabs, ...settings } = p;
  const preview = new StrokePreview(settings, s.terrainState(), shown, W, H);
  for (let j = 0; j < dabs.length; j += 6) preview.add(dabs.slice(j, j + 6));
  return { shown, preview, params: { ...settings, dabs } as BrushParams };
}

const voxelsOut = (s: MapSession) => decodeWorld(strFromU8(unzipSync(s.exportTimber().bytes)["world.json"]).replace(/^﻿/, "")).voxels;

describe("the brushes on a map with caves and overhangs (D280 (3))", () => {
  it("Raise grows a roof's top run and keeps the cave under it", () => {
    const s = caveSession();
    const i = at(17, 17);
    expect(s.terrain.runs(i)).toEqual([0, 3, 6, 8]);
    const u = s.apply({ op: "brush", params: area("raise", 10, 16, 16, 19, 19) });
    expect(u.errors).toEqual([]);
    expect(s.terrain.runs(i)).toEqual([0, 3, 6, 10]);
    expect(s.columns.get(i)!.slice(0, 11)).toEqual(Uint8Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0]));
  });

  it("Lower cuts a roof down to its lowest layer and no further", () => {
    const s = caveSession();
    const u = s.apply({ op: "brush", params: area("lower", 0, 16, 16, 19, 19) });
    expect(u.errors).toEqual([]);
    for (let y = 16; y <= 19; y++) for (let x = 16; x <= 19; x++) expect(s.terrain.runs(at(x, y))).toEqual([0, 3, 6, 7]);
    // (the roof's rim, outside the stroke, as it was)
    expect(s.terrain.runs(at(15, 15))).toEqual([0, 3, 6, 8]);
    expect(s.terrainState().floor![at(17, 17)]).toBe(7);
  });

  it("a stroke that would take the ground holding up a ledge keeps it and lowers the rest, and the page shows nothing falling (D280 (3), amended)", () => {
    const s = caveSession();
    const seq = s.nextSeq;
    // the cliff that holds the ledge, cut down: its edge stays one above the ledge's underside
    const p = area("lower", 0, 26, 9, 29, 15);
    const { preview } = painted(s, p);
    expect(preview.falls()).toEqual([]);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    expect(u.held).toEqual([10, 11, 12, 13, 14].map((y) => at(29, y)));
    expect(unsupportedVoxels(s.terrain).some((v) => v === 1)).toBe(false);
    expect(s.canUndo).toBe(true);
    expect(s.nextSeq).toBe(seq + 1);
    // (a stroke over the cave's roof shows nothing falling either)
    expect(painted(s, area("lower", 0, 16, 16, 19, 19)).preview.falls()).toEqual([]);
  });

  it("what the page paints is what the stroke builds, roofs included", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    const rand = mulberry(11);
    for (let k = 0; k < 15; k++) {
      const p = randomBrush(rand, W, H, STROKE_TOOLS[k % STROKE_TOOLS.length], { x: 18, y: 18, r: 5 });
      const { shown, params } = painted(s, p);
      const u = s.apply({ op: "brush", params });
      if (!u.ok) continue;
      expect(Array.from(shown), `stroke ${k} (${p.tool})`).toEqual(Array.from(s.built.heights));
    }
  });

  it("random strokes keep what is under every roof, drop nothing, undo to the exact runs, and replay onto the same runs", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    const base = s.terrain;
    const roofs = [...s.roofedTiles];
    const rand = mulberry(5);
    const states: Uint32Array[] = [base.mask.slice()];
    let refused = 0;
    let roofsShaped = 0;
    for (let k = 0; k < 40; k++) {
      const tool = STROKE_TOOLS[Math.floor(rand() * STROKE_TOOLS.length)];
      const p = randomBrush(rand, W, H, tool, rand() < 0.6 ? { x: 18, y: 18, r: 6 } : { x: 31, y: 12, r: 4 });
      const u = s.apply({ op: "brush", params: p });
      if (!u.ok) {
        // (never for ground that would fall, D280 (3), amended: only a stroke over held ground alone that changes nothing)
        expect(u.errors[0]).toMatch(/^nothing to shape here: /);
        expect(Array.from(s.terrain.mask)).toEqual(Array.from(states.at(-1)!));
        refused++;
        continue;
      }
      const t = s.terrain;
      for (const i of roofs) {
        expect(under(t, i), `stroke ${k} (${tool}) tile ${i}`).toEqual(under(base, i));
        expect(t.runCount(i)).toBe(base.runCount(i));
        if (t.surface(i) !== base.surface(i)) roofsShaped++;
      }
      expect(unsupportedVoxels(t).some((v) => v === 1), `stroke ${k} (${tool})`).toBe(false);
      states.push(t.mask.slice());
    }
    expect(roofsShaped).toBeGreaterThan(0);
    // an incremental build equals a full one
    const full = s.fullBuild();
    expect(Array.from(full.heights)).toEqual(Array.from(s.built.heights));
    // the project file replays onto the same runs, and exports the same voxels
    s.settleCanonical();
    const again = MapSession.open(decodeProject(s.project()), { rebuild: true });
    expect(Array.from(again.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(MapSession.replayMatchesStored(decodeProject(s.project()))).toBe(true);
    expect(Array.from(voxelsOut(again))).toEqual(Array.from(voxelsOut(s)));
    expect(Array.from(voxelsOut(s))).toEqual(Array.from(s.terrain.voxels()));
    // undo, step by step, gives back each state's exact runs
    for (let k = states.length - 2; k >= 0; k--) {
      expect(s.undo()).toBe(true);
      expect(Array.from(s.terrain.mask), `undo to ${k}`).toEqual(Array.from(states[k]));
    }
    expect(refused + states.length - 1).toBe(40);
  });

  it("an unedited cave map exports its voxels as they were", () => {
    expect(Array.from(voxelsOut(caveSession()))).toEqual(Array.from(caveVoxels()));
  });
});

