// The working area (PLAN §20 D254, D259): while the Select tool's selection is open, a brush stroke
// and a force change only the land inside it, and a tile at most as many levels as it is steps
// inside it (its feathered edge: the edit meets the locked land a level a tile, never a cliff along
// the edge). A stroke keeps its area, so it replays exactly: the page paints what the build makes, a
// rebuild round it equals a full build, and the project replays it.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { areaDepth, brushProblems, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

/** A 21 × 21 area far from the start (or centred at `at`), as runs, and its tiles' steps inside it. */
function areaAt(s: MapSession, at?: { x: number; y: number }): { runs: [number, number, number][]; inside: Uint8Array; x: number; y: number } {
  const st = s.built.start!;
  const x = at ? at.x : st.x < W / 2 ? 66 : 28;
  const y = at ? at.y : st.y < W / 2 ? 66 : 28;
  const tiles: number[] = [];
  for (let yy = y - 10; yy <= y + 10; yy++) for (let xx = x - 10; xx <= x + 10; xx++) tiles.push(yy * W + xx);
  const runs = tilesToRuns(tiles, W);
  return { runs, inside: areaDepth(runs, W, W), x, y };
}

// (seed 3 → 2 at 0.10.47, D(terrace-edges), D148: the 21 × 21 area on seed 3's new land is flat, so Smooth changes nothing
// in it; of seeds 1–10 the area on 3, 1, 7 and 9 gives Smooth nothing to ease, and seed 2 is the first where every brush
// changes land, Smooth 14 tiles)
function session(seed = 2, theme: "riverValley" | "canyon" = "riverValley"): MapSession {
  const r = generate(makeSpec({ seed, theme, size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}

/** Nothing outside the area changed, and inside a tile changed at most its steps inside it. */
function kept(before: Uint8Array, after: Uint8Array, inside: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    const d = Math.abs(after[i] - before[i]);
    if (!inside[i]) expect(d, `tile ${i} outside the area`).toBe(0);
    else expect(d, `tile ${i}, ${inside[i]} steps inside`).toBeLessThanOrEqual(inside[i]);
    if (d) changed++;
  }
  return changed;
}

describe("the working area (D254, D259)", () => {
  it("a stroke across its edge changes only the land inside, easing to the edge a level a tile, for every brush", () => {
    for (const tool of ["raise", "lower", "flatten", "smooth", "naturalize"] as const) {
      const s = session();
      const a = areaAt(s);
      const before = s.built.heights.slice();
      // held across the area's west edge, strong
      const dabs: number[] = [];
      for (let k = 0; k < 60; k++) dabs.push(4 * (a.x - 10 + (k % 7) - 3) + 2, 4 * (a.y + (k % 5) - 2) + 2);
      const p: BrushParams = { tool, size: 6, strength: 10, dabs, area: a.runs, ...(tool === "flatten" ? { level: 14 } : {}), ...(tool === "naturalize" ? { seed: 5 } : {}) };
      expect(s.apply({ op: "brush", params: p }, "user", tool).errors, tool).toEqual([]);
      expect(kept(before, s.built.heights, a.inside), tool).toBeGreaterThan(0);
    }
  });

  // (the build's integrity pass once filled a one-tile pit the stroke left at the area's edge, or cut a spike there, after
  // it: on River Valley seed 2 a raise across the edge of the area at (28, 28) lifted (18, 30), a step inside, two levels;
  // on Canyon seed 3 a lower cut (20, 29), three steps inside, four. A stroke's tiles are its own to the build, D342, as a
  // precise stroke's are; the page paints the same)
  it("a stroke's tiles at the area's edge are what the build keeps, and what the page paints", () => {
    for (const [seed, theme, tools] of [
      [2, "riverValley", ["raise", "flatten", "smooth"]],
      [3, "canyon", ["lower"]],
    ] as const)
      for (const tool of tools) {
        const s = session(seed, theme);
        const a = areaAt(s, { x: 28, y: 28 });
        const before = s.built.heights.slice();
        const dabs: number[] = [];
        for (let k = 0; k < 60; k++) dabs.push(4 * (a.x - 10 + (k % 7) - 3) + 2, 4 * (a.y + (k % 5) - 2) + 2);
        const p: BrushParams = { tool, size: 6, strength: 10, dabs, area: a.runs, ...(tool === "flatten" ? { level: 14 } : {}) };
        const shown = s.built.heights.slice();
        const { dabs: d, ...settings } = p;
        const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
        for (let j = 0; j < d.length; j += 8) preview.add(d.slice(j, j + 8));
        expect(s.apply({ op: "brush", params: p }, "user", tool).errors, `${theme} ${seed} ${tool}`).toEqual([]);
        expect(kept(before, s.built.heights, a.inside), `${theme} ${seed} ${tool}`).toBeGreaterThan(0);
        expect(Array.from(shown), `${theme} ${seed} ${tool}: the page paints the build`).toEqual(Array.from(s.built.heights));
      }
  });

  it("the page paints what the build makes; a rebuild round it equals a full build; the project replays it", () => {
    const s = session();
    const a = areaAt(s);
    const dabs: number[] = [];
    for (let k = 0; k < 40; k++) dabs.push(4 * (a.x - 10) + 2, 4 * (a.y + (k % 9) - 4) + 2);
    const p: BrushParams = { tool: "raise", size: 5, strength: 10, dabs, area: a.runs };
    const shown = s.built.heights.slice();
    const { dabs: d, ...settings } = p;
    const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
    for (let j = 0; j < d.length; j += 8) preview.add(d.slice(j, j + 8));
    expect(s.apply({ op: "brush", params: p }, "user", "Raise").errors).toEqual([]);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    expect(s.apply({ op: "brush", params: { tool: "lower", size: 2, strength: 8, dabs: [4 * (a.x - 12) + 2, 4 * a.y + 2] } }, "user", "Lower").errors).toEqual([]);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    expect(brushProblems({ ...p, area: [[3, 9, 2]] }, W, W)).not.toEqual([]);
  });

  it("a force: the land outside is unbreakable rock to it, and inside it eases to the edge; one clicked outside is refused", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const a = areaAt(s);
    const before = s.built.heights.slice();
    const r = ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 70 }, origin: [a.x - 6, a.y], cut: null, area: a.runs });
    expect(r.errors).toEqual([]);
    for (let k = 0; k < 400 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().errors).toEqual([]);
    const after = MapSession.open(decodeProject(ed.project().bytes)).built.heights;
    expect(kept(before, after, a.inside)).toBeGreaterThan(0);
    ed.undo();
    const out = ed.forceStart({ verb: "craterize", settings: CRATER_DEFAULTS, origin: [a.x - 20, a.y], cut: null, area: a.runs });
    expect(out.errors[0]).toMatch(/Outside the working area/);
  });
});
