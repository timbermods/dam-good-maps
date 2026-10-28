// Strokes and sculpts hold a cave's or an overhang's rock (D280 (3), amended by #ROCKHOLD-PR; D270, D487, D491): on a map
// with caves or overhangs a brush stroke or a sculpt that would take away the ground holding up a roof keeps that ground
// (no lower than one above the underside it holds, `terrain/support.ts` `rockFloors`) and shapes the rest, never refused
// for it; the operation logs what it held, so the project replays byte for byte, and a log from before replays as it
// was; the page's stroke shows the hold as it is painted, and the answer names the tiles held, in one line.

import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { EditOp } from "../../src/core/doc/ops";
import { markBrushTiles, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { rockHeldWords } from "../../src/editor/caveWords";
import { CAVE_W as W, CAVE_H as H, caveSession } from "./caveMap";

const tile = (x: number, y: number, w = W) => [4 * x + 2, 4 * y + 2].map((v) => Math.min(4 * w - 1, v));
const at = (x: number, y: number) => y * W + x;
const area = (tool: "raise" | "lower" | "flatten", target: number, x0: number, y0: number, x1: number, y1: number): BrushParams => ({ tool, size: 1, strength: 5, shape: "area", target, dabs: [...tile(x0, y0), ...tile(x1, y1)] });

/** The page's copy of a stroke, painted dab by dab as the page does. */
function painted(s: MapSession, p: BrushParams, w = W, h = H): Uint8Array {
  const shown = s.built.heights.slice();
  const { dabs, ...settings } = p;
  const preview = new StrokePreview(settings, s.terrainState(), shown, w, h);
  for (let j = 0; j < dabs.length; j += 6) preview.add(dabs.slice(j, j + 6));
  return shown;
}

const falling = (s: MapSession) => unsupportedVoxels(s.terrain).reduce((n, v) => n + v, 0);

describe("strokes hold a cave's or an overhang's rock (D280 (3), amended)", () => {
  it("Lower across the cliff that holds a ledge keeps the cliff's edge one above the ledge's underside and lowers the rest", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    // (the ledge: x 30–32, y 10–14, solid from z 5 to 8, held by the cliff at x 29, which stands at 8)
    const p = area("lower", 0, 26, 9, 29, 15);
    const shown = painted(s, p);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    const edge = [10, 11, 12, 13, 14].map((y) => at(29, y));
    expect(u.held).toEqual(edge);
    expect(rockHeldWords(u.held!.length)).toBe("5 tiles left high enough to hold up a cave or overhang");
    expect(rockHeldWords(1)).toBe("1 tile left high enough to hold up a cave or overhang");
    for (let y = 9; y <= 15; y++)
      for (let x = 26; x <= 29; x++) expect(s.built.heights[at(x, y)], `(${x}, ${y})`).toBe(edge.includes(at(x, y)) ? 6 : 0);
    // (the ledge stands whole, nothing the game would drop, and the page showed exactly this land as it was painted)
    for (let y = 10; y <= 14; y++) for (let x = 30; x <= 32; x++) expect(s.terrain.runs(at(x, y))).toEqual([0, 2, 5, 8]);
    expect(falling(s)).toBe(0);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    // (the operation logs the hold: the edge's floor among the held tiles in its reach and one round it)
    const logged = decodeProject(s.project()).edits.at(-1)!.params as BrushParams;
    for (const i of edge) expect(logged.hold).toContainEqual([i, 6, 255]);
  });

  it("Lower over the overhang itself cuts the ledge's top to its lowest layer, keeps the cliff's edge, and the ledge stands", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    const p = area("lower", 0, 27, 9, 32, 15);
    const shown = painted(s, p);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    expect(u.held).toEqual([10, 11, 12, 13, 14].map((y) => at(29, y)));
    for (let y = 10; y <= 14; y++) {
      expect(s.built.heights[at(29, y)]).toBe(6);
      for (let x = 30; x <= 32; x++) expect(s.terrain.runs(at(x, y)), `(${x}, ${y})`).toEqual([0, 2, 5, 6]);
    }
    expect(falling(s)).toBe(0);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
  });

  it("a stroke over held ground alone that can change nothing is refused with one line; a sculpt holds the same ground", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    // (the cave's rim holds its roof, whose underside is z 6: the rim comes down to 7 and no lower)
    const rim = [15, 16, 17, 18, 19, 20].map((y) => at(14, y));
    const sculpt: EditOp = { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns([...rim, at(13, 17)], W), level: 2, exact: true } };
    const u = s.apply(sculpt);
    expect(u.errors).toEqual([]);
    expect(u.held).toEqual(rim);
    for (const i of rim) expect(s.built.heights[i]).toBe(7);
    expect(s.built.heights[at(13, 17)]).toBe(2);
    expect(falling(s)).toBe(0);
    // (again: the rim is already as low as it may go, so nothing can change)
    const again = s.apply({ op: "sculpt", params: { mode: "lower", cells: tilesToRuns(rim, W), amount: 1 } });
    expect(again.ok).toBe(false);
    expect(again.errors).toEqual(["nothing to shape here: this ground holds up a cave's or an overhang's rock, which the edit leaves as it is"]);
  });

  it("the project replays byte for byte, and a log from before the hold replays as it was", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    // (the west rim of the cave alone: the roof is still held from its other three sides, so before the hold this
    // stroke was taken and logged without one, lowering the rim to 0)
    const p = area("lower", 0, 12, 15, 14, 20);
    const u = s.apply({ op: "brush", params: p });
    expect(u.held).toEqual([15, 16, 17, 18, 19, 20].map((y) => at(14, y)));
    s.apply({ op: "brush", params: area("flatten", 3, 26, 8, 29, 16) });
    s.settleCanonical();
    const bytes = s.project();
    // (reopened, its stored map is the log's replay, D455, and exports the same bytes; rebuilt from the log alone, the
    // same runs)
    const again = MapSession.open(decodeProject(bytes));
    expect(again.checkReplay()).toBe(true);
    expect(again.exportTimber().bytes).toEqual(s.exportTimber().bytes);
    const rebuilt = MapSession.open(decodeProject(bytes), { rebuild: true });
    expect(Array.from(rebuilt.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(Array.from(rebuilt.built.heights)).toEqual(Array.from(s.built.heights));
    // (the same stroke logged without a hold, as before: the build reads only the log, so the rim goes to 0, and the
    // roof, held from its other sides, stands)
    const doc = decodeProject(bytes);
    const first = doc.edits.find((e) => e.op === "brush")!;
    expect((first.params as BrushParams).hold?.length).toBeGreaterThan(0);
    delete (first.params as BrushParams).hold;
    const old = MapSession.open(decodeProject(encodeProject(doc)), { rebuild: true });
    for (let y = 15; y <= 20; y++) expect(old.built.heights[at(14, y)]).toBe(0);
    expect(falling(old)).toBe(0);
  });
});

describe("strokes over a generated map's 3D form (D488)", () => {
  // (Highlands 96² seed 4242 grows a spring cave at the default Verticality, at (33–38, 37–41))
  const G = 96;
  const r = generate(makeSpec({ seed: 4242, theme: "highlands", size: { x: G, y: G } }));

  it("a Flatten brush's square across the form's edge holds what holds its rock and flattens the rest", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const rock = s.rockHolds();
    expect(rock.length).toBeGreaterThan(0);
    const low = new Map(rock.map(([i, lo]) => [i, lo]));
    const caves = new Set(s.columns.keys());
    // (a 7 × 7 square centred on a tile that holds the roof, four levels below it)
    const [c] = rock[0];
    const cx = c % G;
    const cy = Math.floor(c / G);
    const L = Math.max(0, s.built.heights[c] - 4);
    const p: BrushParams = { tool: "flatten", size: 3.5, strength: 5, shape: "square", target: L, dabs: tile(cx, cy, G) };
    const foot = new Uint8Array(G * G);
    markBrushTiles(p, G, G, foot);
    const t0 = s.terrain;
    const shown = painted(s, p, G, G);
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    expect(u.held?.length).toBeGreaterThan(0);
    const h = s.built.heights;
    let flattened = 0;
    for (let i = 0; i < G * G; i++) {
      if (!foot[i]) continue;
      if (low.has(i)) expect(h[i], `held tile ${i}`).toBeGreaterThanOrEqual(low.get(i)!);
      else if (caves.has(i)) expect(h[i], `cave tile ${i}`).toBe(Math.max(L, t0.topFloor(i)));
      else {
        expect(h[i], `tile ${i}`).toBe(L);
        flattened++;
      }
    }
    expect(flattened).toBeGreaterThan(20);
    // (every held tile is one the stroke would have taken lower)
    for (const i of u.held!) expect(low.has(i)).toBe(true);
    expect(s.built.dropped ?? 0).toBe(0);
    expect(falling(s)).toBe(0);
    expect(Array.from(shown)).toEqual(Array.from(h));
  });

  it("Lower down to the bottom over the whole form keeps it standing, never refused", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const cols = [...s.columns.keys()];
    const xs = cols.map((i) => i % G);
    const ys = cols.map((i) => Math.floor(i / G));
    const p: BrushParams = { tool: "lower", size: 1, strength: 5, shape: "area", target: 0, dabs: [...tile(Math.min(...xs) - 2, Math.min(...ys) - 2, G), ...tile(Math.max(...xs) + 2, Math.max(...ys) + 2, G)] };
    const u = s.apply({ op: "brush", params: p });
    expect(u.errors).toEqual([]);
    expect(u.held?.length).toBeGreaterThan(0);
    expect(s.built.dropped ?? 0).toBe(0);
    expect(falling(s)).toBe(0);
  });
});
