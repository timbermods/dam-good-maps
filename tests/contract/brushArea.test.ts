// The area brush (Timberborn's own editor's Terrain, Kyler 2026-10-03): a third shape on Raise and Lower.
// The stroke's two dabs are the opposite corners of a rectangle, and every tile in it changes with hard
// edges: to the tool's Level (its target) as the Square and Straight lines shapes use it, or one whole
// level when Free, a block added or taken on each tile. Holding adds nothing; the corners may come in
// either order. In the document it is one operation (`brush`, shape "area"), one undo step, and it
// replays to the same bytes (D158, D342); a stroke with another shape replays as before.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, areaRect, brushProblems, markBrushTiles, type BrushParams } from "../../src/core/features/raster/brush";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const N = 32;
/** A slope rising a level every four tiles eastward, from level 4. */
function slope(): Uint8Array {
  const t = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = 4 + Math.floor(x / 4);
  return t;
}
const at = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
/** The corners (8, 10) and (19, 16): a 12 × 7 rectangle. */
const corners = [...at(8, 10), ...at(19, 16)];
const inside = (x: number, y: number) => x >= 8 && x <= 19 && y >= 10 && y <= 16;

describe("the area brush (Timberborn's Terrain)", () => {
  it("Raise and Lower with a Level: every tile in the rectangle to it, as the other shapes use it; nothing outside", () => {
    const t0 = slope();
    for (const [tool, target] of [["raise", 8], ["lower", 6]] as const) {
      const t = t0.slice();
      applyBrush({ tool, size: 5, strength: 5, target, shape: "area", dabs: corners }, t, N, N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const h0 = t0[y * N + x];
          const want = !inside(x, y) ? h0 : tool === "raise" ? Math.max(h0, target) : Math.min(h0, target);
          expect(t[y * N + x], `${tool} (${x}, ${y})`).toBe(want);
        }
    }
  });

  it("Free: a block added or taken on every tile of the rectangle, hard-edged", () => {
    const t0 = slope();
    for (const [tool, d] of [["raise", 1], ["lower", -1]] as const) {
      const t = t0.slice();
      applyBrush({ tool, size: 5, strength: 5, shape: "area", dabs: corners }, t, N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) expect(t[y * N + x], `${tool} (${x}, ${y})`).toBe(t0[y * N + x] + (inside(x, y) ? d : 0));
    }
  });

  it("the corners in either order make the same rectangle; holding adds nothing; the brush's size plays no part", () => {
    const a = slope();
    const b = slope();
    const c = slope();
    applyBrush({ tool: "raise", size: 5, strength: 5, shape: "area", dabs: corners }, a, N, N);
    applyBrush({ tool: "raise", size: 24, strength: 10, shape: "area", dabs: [...at(19, 10), ...at(8, 16)] }, b, N, N);
    applyBrush({ tool: "raise", size: 1, strength: 1, shape: "area", dabs: [...at(19, 16), ...at(8, 10)] }, c, N, N);
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(Array.from(c)).toEqual(Array.from(a));
    expect(areaRect(corners, N, N)).toEqual({ x0: 8, y0: 10, x1: 19, y1: 16 });
    const marked = new Uint8Array(N * N);
    markBrushTiles({ size: 5, shape: "area", dabs: corners }, N, N, marked);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) expect(marked[y * N + x], `(${x}, ${y})`).toBe(inside(x, y) ? 1 : 0);
  });

  it("an area is Raise's or Lower's, with its two corners; the operation's schema takes it", () => {
    const ok: BrushParams = { tool: "lower", size: 5, strength: 5, target: 3, shape: "area", dabs: corners };
    expect(brushProblems(ok, N, N)).toEqual([]);
    expect(brushProblems({ ...ok, tool: "flatten" }, N, N).length).toBe(1);
    expect(brushProblems({ ...ok, dabs: [...corners, ...at(1, 1)] }, N, N).length).toBe(1);
    expect(brushProblems({ ...ok, target: undefined, pressure: [255, 255] }, N, N).length).toBe(1);
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(opsSchema);
    expect(validate({ op: "brush", params: ok }), JSON.stringify(validate.errors)).toBe(true);
  });

  it("in the document: one operation, one undo step, replayed to the same bytes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const before = s.built.heights.slice();
    const steps = () => s.history().filter((h) => h.applied).length;
    const n0 = steps();
    for (const p of [
      { tool: "raise", size: 5, strength: 5, target: 12, shape: "area", dabs: [...at(30, 30), ...at(41, 37)] },
      { tool: "lower", size: 5, strength: 5, shape: "area", dabs: [...at(50, 50), ...at(44, 58)] },
    ] satisfies BrushParams[]) {
      const was = s.built.heights.slice();
      expect(s.apply({ op: "brush", params: p }).errors).toEqual([]);
      expect(steps()).toBe(n0 + (p.tool === "raise" ? 1 : 2));
      expect(Array.from(s.built.heights)).not.toEqual(Array.from(was));
      // the project opened again builds the same land
      expect(Array.from(MapSession.open(decodeProject(s.project())).built.heights)).toEqual(Array.from(s.built.heights));
    }
    // each one undo step
    s.undo();
    s.undo();
    expect(steps()).toBe(n0);
    expect(Array.from(s.built.heights)).toEqual(Array.from(before));
    // a single tile raised, Free: the build keeps its one block (hard-edged, its tiles out of the
    // integrity pass), as the block shown while it was dragged promised
    let spot = -1;
    for (let i = 30 * 96 + 30; i < 66 * 96 && spot < 0; i++) {
      const x = i % 96;
      if (x < 30 || x > 66 || s.built.water[i] > 0 || s.built.heights[i] >= 15) continue;
      if ([i - 1, i + 1, i - 96, i + 96].every((j) => s.built.heights[j] === s.built.heights[i] && !(s.built.water[j] > 0))) spot = i;
    }
    expect(spot).toBeGreaterThan(0);
    const h0 = s.built.heights[spot];
    const one = [...at(spot % 96, Math.floor(spot / 96)), ...at(spot % 96, Math.floor(spot / 96))];
    expect(s.apply({ op: "brush", params: { tool: "raise", size: 5, strength: 5, shape: "area", dabs: one } }).errors).toEqual([]);
    expect(s.built.heights[spot]).toBe(h0 + 1);
  });
});
