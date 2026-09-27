// Flatten's Ramped edges lay their own natural slopes (PLAN §20 D270, Kyler's answer to #84): where
// the pad's rim meets ground one level lower, slopes spaced along every stretch of it, so the pad is
// walkable from each side that has such ground; a cliff pad gets none. They are kept in the stroke
// (the page lays them when it ends), placed again by every build, and a saved ramped stroke replays
// exactly; a ramped stroke saved before D270 (no slopes of its own) still asks the slope planner.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { RIM_SLOPES } from "../../src/core/features/ids";
import { applyBrush, markBrushTiles, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { RIM_SPACING, rimSlopes } from "../../src/core/features/slopes";
import { slopeHighSide, ORIENTATIONS } from "../../src/core/format/footprints";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 48;
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

/** Uneven ground: 5 in the west, 6 in the east, 4 in a strip along the south. */
function ground(): Uint8Array {
  const g = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) g[y * W + x] = y > 34 ? 4 : x < 24 ? 5 : 6;
  return g;
}

describe("a ramped Flatten lays its own slopes (D270)", () => {
  it("spaced along every stretch of rim that meets ground a level lower, each standing right; a cliff pad gets none", () => {
    const h = ground();
    const p: BrushParams = { tool: "flatten", size: 7, strength: 5, level: 8, precise: true, edges: "ramped", dabs: [...tile(24, 24), ...tile(25, 24)] };
    applyBrush(p, h, W, W);
    const own = new Uint8Array(W * W);
    markBrushTiles(p, W, W, own);
    const slopes = rimSlopes(h, W, W, own, new Uint8Array(W * W));
    expect(slopes.length).toBeGreaterThan(0);
    for (const [x, y, o] of slopes) {
      const [dx, dy] = slopeHighSide(ORIENTATIONS[o]);
      const i = y * W + x;
      expect(h[(y + dy) * W + x + dx], `(${x}, ${y})`).toBe(h[i] + 1);
      expect(h[(y - dy) * W + x - dx], `(${x}, ${y})`).toBe(h[i]);
    }
    // every step of the rim, each way it faces: at least one slope at every level it steps through
    const steps = new Set<string>();
    for (let y = 1; y < W - 1; y++)
      for (let x = 1; x < W - 1; x++)
        for (const [o, dx, dy] of [
          [0, 0, -1],
          [1, -1, 0],
          [2, 0, 1],
          [3, 1, 0],
        ] as const) {
          const i = y * W + x;
          const j = (y + dy) * W + x + dx;
          if ((own[i] || own[j]) && h[j] === h[i] + 1 && h[(y - dy) * W + x - dx] === h[i]) steps.add(`${o}:${h[i]}`);
        }
    const laid = new Set(slopes.map(([x, y, o]) => `${o}:${h[y * W + x]}`));
    for (const s of steps) expect(laid.has(s), s).toBe(true);
    // all four ways out of the pad (it stands above the ground on every side)
    expect(new Set(slopes.map(([, , o]) => o)).size).toBe(4);
    // spaced: two slopes the same way at the same level stand at least a few tiles apart
    for (const a of slopes)
      for (const b of slopes)
        if (a !== b && a[2] === b[2] && h[a[1] * W + a[0]] === h[b[1] * W + b[0]]) expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeGreaterThanOrEqual(Math.floor(RIM_SPACING / 2));
    // nothing stands where it's blocked
    const blocked = new Uint8Array(W * W).fill(1);
    expect(rimSlopes(h, W, W, own, blocked)).toEqual([]);
  });

  it("kept in the stroke: the editor lays them when the stroke is applied, the build places them, the project replays them exactly; a cliff pad and a stroke from before D270 lay none of their own", async () => {
    await runGenerate(makeSpec({ seed: 5, theme: "riverValley", size: { x: 96, y: 96 } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const b = s0.built;
    const st = b.start!;
    // dry ground well away from the start and the water
    let at: [number, number] | null = null;
    for (let y = 16; y < 80 && !at; y += 2)
      for (let x = 16; x < 80 && !at; x += 2) {
        if (Math.hypot(x - st.x, y - st.y) < 24) continue;
        let dry = true;
        for (let yy = y - 9; yy <= y + 9 && dry; yy++) for (let xx = x - 9; xx <= x + 9 && dry; xx++) if (b.water[yy * 96 + xx] > 0 || b.channel[yy * 96 + xx]) dry = false;
        if (dry) at = [x, y];
      }
    expect(at).not.toBeNull();
    const level = Math.min(16, b.heights[at![1] * 96 + at![0]] + 2);
    const dabs = [...tile(at![0], at![1]), ...tile(at![0] + 1, at![1])];
    const settings = { tool: "flatten" as const, size: 5, strength: 5, level, precise: true, edges: "ramped" as const };
    // the page's preview is the build's ground
    const shown = b.heights.slice();
    const preview = new StrokePreview(settings, s0.terrainState(), shown, 96, 96);
    preview.add(dabs);
    expect(ed.apply({ op: "brush", params: { ...settings, dabs } }, "user", "Flatten").errors).toEqual([]);
    const s = MapSession.open(decodeProject(ed.project().bytes));
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    const op = s.state.sculpts.at(-1)!.params as BrushParams;
    expect(op.slopes!.length).toBeGreaterThan(0);
    // each one laid is placed, standing right
    const rim = s.built.entities.filter((e) => e.owner === RIM_SLOPES);
    expect(rim.map((e) => [e.x, e.y, ORIENTATIONS.indexOf(e.orientation)]).sort()).toEqual(op.slopes!.map((t) => [...t]).sort());
    const h = s.built.heights;
    for (const e of rim) {
      const [dx, dy] = slopeHighSide(e.orientation);
      expect(h[(e.y + dy) * 96 + e.x + dx]).toBe(h[e.y * 96 + e.x] + 1);
    }
    const again = MapSession.open(decodeProject(s.project()));
    expect(again.built.entities.filter((e) => e.owner === RIM_SLOPES)).toEqual(rim);
    expect(Array.from(again.built.heights)).toEqual(Array.from(h));
    // a cliff pad: none of its own
    ed.undo();
    expect(ed.apply({ op: "brush", params: { tool: "flatten", size: 5, strength: 5, level, precise: true, dabs } }, "user", "Flatten").errors).toEqual([]);
    expect(MapSession.open(decodeProject(ed.project().bytes)).built.entities.some((e) => e.owner === RIM_SLOPES)).toBe(false);
    ed.undo();
    // a ramped stroke saved before D270 (no slopes of its own) replays as it did: the planner's
    const old = MapSession.open(decodeProject(ed.project().bytes));
    expect(old.apply({ op: "brush", params: { ...settings, dabs } }, "user", "Flatten").errors).toEqual([]);
    expect(old.built.entities.some((e) => e.owner === RIM_SLOPES)).toBe(false);
    expect((old.state.sculpts.at(-1)!.params as BrushParams).slopes).toBeUndefined();
  });
});
