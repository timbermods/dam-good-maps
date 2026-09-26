// Live editing: terrain brushes (raise, lower, flatten, smooth, naturalize) painted in strokes.
// Blocking, breakage (Kyler's brief): a stroke's operation replays to identical bytes; what the page
// paints under the cursor is exactly what the operation builds; undo and redo are always correct,
// and an incremental rebuild equals a full one; a stroke survives "Generate, keeping my edits" and
// the project file.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, brushProblems, BrushStroke, type BrushParams, type BrushTool } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { mulberry } from "./brushRandom";

const TOOLS: BrushTool[] = ["raise", "lower", "flatten", "smooth", "naturalize"];

/** A random stroke on a W × H map: a wandering path of dabs away from the start. */
function randomStroke(rand: () => number, W: number, H: number, tool: BrushTool, avoid: { x: number; y: number } | null): BrushParams {
  const size = [1, 2, 3.5, 6, 9][Math.floor(rand() * 5)];
  let x = 12 + rand() * (W - 24);
  let y = 12 + rand() * (H - 24);
  if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < 18) {
    x = (x + W / 2) % (W - 12);
    y = (y + H / 2) % (H - 12);
  }
  const dabs: number[] = [];
  const n = 1 + Math.floor(rand() * 60);
  for (let k = 0; k < n; k++) {
    x = Math.min(W - 1, Math.max(0, x + (rand() - 0.5) * 3));
    y = Math.min(H - 1, Math.max(0, y + (rand() - 0.5) * 3));
    dabs.push(Math.min(4 * W - 1, Math.round(x * 4)), Math.min(4 * H - 1, Math.round(y * 4)));
  }
  return { tool, size, strength: 1 + Math.floor(rand() * 10), ...(tool === "flatten" ? { level: Math.floor(rand() * 17) } : {}), ...(tool === "naturalize" ? { seed: Math.floor(rand() * 1e6) } : {}), dabs };
}

describe("a brush stroke is exact", () => {
  it("the same dabs give the same levels however they are handed in, and a click always shows", () => {
    const W = 40;
    const H = 30;
    const rand = mulberry(7);
    const ground = new Uint8Array(W * H);
    for (let i = 0; i < ground.length; i++) ground[i] = 3 + Math.floor(rand() * 6);
    for (const tool of TOOLS) {
      const p = randomStroke(rand, W, H, tool, null);
      const whole = ground.slice();
      applyBrush(p, whole, W, H);
      // in chunks, as the page hands them in frame by frame
      const chunked = ground.slice();
      const { dabs, ...settings } = p;
      const s = new BrushStroke(settings, chunked, W, H);
      for (let k = 0; k < dabs.length; ) {
        const n = 2 * (1 + Math.floor(rand() * 4));
        s.add(dabs.slice(k, k + n));
        k += n;
      }
      expect(Array.from(chunked), tool).toEqual(Array.from(whole));
    }
    // one click of a raise brush lifts the middle of the brush a level
    const flat = new Uint8Array(W * H).fill(5);
    applyBrush({ tool: "raise", size: 3, strength: 1, dabs: [4 * 20 + 2, 4 * 15 + 2] }, flat, W, H);
    expect(flat[15 * W + 20]).toBe(6);
    expect(flat[15 * W + 30]).toBe(5);
  });

  it("a brush never makes a cliff of its own: its change steps down one level at a time", () => {
    const W = 48;
    const H = 48;
    const flat = new Uint8Array(W * H).fill(2);
    const dabs: number[] = [];
    for (let k = 0; k < 400; k++) dabs.push(4 * 24 + 2, 4 * 24 + 2);
    applyBrush({ tool: "raise", size: 4, strength: 10, dabs }, flat, W, H);
    // pressed long in one place: a peak as high as its brush lets it slope, one level a tile
    expect(flat[24 * W + 24]).toBeGreaterThanOrEqual(6);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        for (const j of [i - 1, i + 1, i - W, i + W]) expect(Math.abs(flat[i] - flat[j])).toBeLessThanOrEqual(1);
      }
  });

  it.each([
    ["riverValley", 96, 3],
    ["islands", 96, 5],
  ] as [ThemeId, number, number][])("%s %i²: what the page paints is what the operation builds, byte for byte, and replays to the same file", (theme, size, seed) => {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const rand = mulberry(seed * 31);
    const W = size;
    for (let k = 0; k < 10; k++) {
      const tool = TOOLS[k % TOOLS.length];
      const p = randomStroke(rand, W, W, tool, s.built.start ?? null);
      // the page: its copy of the terrain, painted dab by dab
      const shown = s.built.heights.slice();
      const { dabs, ...settings } = p;
      const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
      for (let j = 0; j < dabs.length; j += 6) preview.add(dabs.slice(j, j + 6));
      // the worker: the operation
      const u = s.apply({ op: "brush", params: p }, "user", "stroke");
      expect(u.errors).toEqual([]);
      expect(Array.from(shown), `${tool} stroke ${k}`).toEqual(Array.from(s.built.heights));
      expect(Array.from(preview.pre)).toEqual(Array.from(s.terrainState().pre));
    }
    // the log replays to the same map: a full build, and the project file opened again
    const full = s.fullBuild();
    expect(Array.from(full.heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    s.settleCanonical();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
  });
});

describe("the brush kit (D182) and smart Lower (D184)", () => {
  const W = 40;
  const H = 30;
  const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

  it("precise: at size 1 a click moves one tile one level, and holding it still moves it no more", () => {
    const g = new Uint8Array(W * H).fill(5);
    const dabs: number[] = [];
    for (let k = 0; k < 50; k++) dabs.push(...tile(10, 10));
    applyBrush({ tool: "raise", size: 1, strength: 10, precise: true, dabs }, g, W, H);
    expect(g[10 * W + 10]).toBe(6);
    expect(Array.from(g).filter((v) => v !== 5).length).toBe(1);
    // size 2: the 3 × 3 round it, each a level
    const h = new Uint8Array(W * H).fill(5);
    applyBrush({ tool: "lower", size: 2, strength: 1, precise: true, dabs: tile(20, 15) }, h, W, H);
    expect(Array.from(h).filter((v) => v === 4).length).toBe(9);
  });

  it("square reaches the corners a round brush leaves; round and square agree along the axes", () => {
    const round = new Uint8Array(W * H).fill(5);
    const square = new Uint8Array(W * H).fill(5);
    applyBrush({ tool: "raise", size: 3, strength: 1, precise: true, dabs: tile(20, 15) }, round, W, H);
    applyBrush({ tool: "raise", size: 3, strength: 1, precise: true, shape: "square", dabs: tile(20, 15) }, square, W, H);
    expect(square[(15 + 2) * W + 20 + 2]).toBe(6);
    expect(round[(15 + 2) * W + 20 + 2]).toBe(5);
    expect(square[15 * W + 22]).toBe(round[15 * W + 22]);
    expect(Array.from(square).filter((v) => v === 6).length).toBe(25);
  });

  it("a pen's light pressure works more slowly than a full press, and the same pressures replay the same", () => {
    const dabs: number[] = [];
    for (let k = 0; k < 40; k++) dabs.push(...tile(20, 15));
    const full = new Uint8Array(W * H).fill(3);
    const light = new Uint8Array(W * H).fill(3);
    applyBrush({ tool: "raise", size: 4, strength: 5, dabs }, full, W, H);
    const pressure = dabs.filter((_, k) => k % 2 === 0).map(() => 60);
    applyBrush({ tool: "raise", size: 4, strength: 5, dabs, pressure }, light, W, H);
    expect(light[15 * W + 20]).toBeGreaterThan(3);
    expect(light[15 * W + 20]).toBeLessThan(full[15 * W + 20]);
    // handed in piece by piece, with their pressures
    const chunked = new Uint8Array(W * H).fill(3);
    const s = new BrushStroke({ tool: "raise", size: 4, strength: 5 }, chunked, W, H);
    for (let k = 0; k < dabs.length; k += 8) s.add(dabs.slice(k, k + 8), pressure.slice(k / 2, k / 2 + 4));
    expect(Array.from(chunked)).toEqual(Array.from(light));
    expect(brushProblems({ tool: "raise", size: 4, strength: 5, dabs, pressure: [1] }, W, H)).not.toEqual([]);
    expect(brushProblems({ tool: "raise", size: 4, strength: 5, dabs, shape: "hex" as "square" }, W, H)).not.toEqual([]);
  });

  it("smart Lower: from water, its bed starts at the water's bed and never rises along the stroke", () => {
    // a pond at level 2 on the west (x < 6), ground at 6 with a hill of 9 on the way east
    const g = new Uint8Array(W * H).fill(6);
    for (let y = 0; y < H; y++) for (let x = 0; x < 6; x++) g[y * W + x] = 2;
    for (let y = 10; y < 20; y++) for (let x = 18; x < 24; x++) g[y * W + x] = 9;
    const dabs: number[] = [];
    for (let x = 6; x <= 34; x++) dabs.push(4 * x + 2, 4 * 15 + 2);
    const carved = g.slice();
    applyBrush({ tool: "lower", size: 3, strength: 3, channel: true, dabs }, carved, W, H);
    // along the stroke's middle: never above the pond's bed, and never rising toward its end
    let last = Infinity;
    for (let x = 6; x <= 34; x++) {
      const h = carved[15 * W + x];
      expect(h, `x ${x}`).toBeLessThanOrEqual(2);
      expect(h).toBeLessThanOrEqual(last);
      last = h;
    }
    // the same stroke without it lowers as a plain brush: the hill stays above the pond
    const plain = g.slice();
    applyBrush({ tool: "lower", size: 3, strength: 3, dabs }, plain, W, H);
    expect(plain[15 * W + 20]).toBeGreaterThan(2);
    // and it replays the same, whole or in pieces
    const chunked = g.slice();
    const s = new BrushStroke({ tool: "lower", size: 3, strength: 3, channel: true }, chunked, W, H);
    for (let k = 0; k < dabs.length; k += 6) s.add(dabs.slice(k, k + 6));
    expect(Array.from(chunked)).toEqual(Array.from(carved));
  });

  it("smart Lower through a session: the page's stroke is the operation's, and it replays from the project", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const W2 = 96;
    // from a river's channel, away from the start
    const start = s.built.start!;
    let from = -1;
    for (let i = 0; i < W2 * W2 && from < 0; i++) {
      const x = i % W2;
      const y = Math.floor(i / W2);
      if (s.built.channel[i] && x > 8 && x < W2 - 20 && Math.hypot(x - start.x, y - start.y) > 24) from = i;
    }
    expect(from).toBeGreaterThanOrEqual(0);
    const fx = from % W2;
    const fy = Math.floor(from / W2);
    const dabs: number[] = [];
    for (let k = 0; k <= 16; k++) dabs.push(4 * (fx + k) + 2, 4 * fy + 2);
    const p: BrushParams = { tool: "lower", size: 2, strength: 4, channel: true, dabs };
    const shown = s.built.heights.slice();
    const { dabs: d, ...settings } = p;
    const preview = new StrokePreview(settings, s.terrainState(), shown, W2, W2);
    for (let j = 0; j < d.length; j += 4) preview.add(d.slice(j, j + 4));
    const u = s.apply({ op: "brush", params: p }, "user", "Lower");
    expect(u.errors).toEqual([]);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });
});

describe("hold to dig, terraces and walkable ground (D184, D193)", () => {
  const W = 40;
  const H = 30;
  const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

  it("a precise hold digs a level deeper for each level its dabs carry, with vertical walls, and stops at its floor", () => {
    const g = new Uint8Array(W * H).fill(8);
    const dabs = [...tile(20, 15), ...tile(20, 15), ...tile(20, 15), ...tile(20, 15)];
    const deep = g.slice();
    applyBrush({ tool: "lower", size: 2, strength: 5, precise: true, levels: [1, 2, 3, 4], dabs }, deep, W, H);
    expect(deep[15 * W + 20]).toBe(4);
    expect(deep[15 * W + 21]).toBe(4);
    // vertical walls: the ground right beside the pit is untouched
    expect(deep[15 * W + 22]).toBe(8);
    // a floor at level 6: the hold stops there however long it lasts
    const floored = g.slice();
    applyBrush({ tool: "lower", size: 2, strength: 5, precise: true, levels: [1, 2, 3, 4], stop: 6, dabs }, floored, W, H);
    expect(floored[15 * W + 20]).toBe(6);
    // a ceiling for raise
    const raised = g.slice();
    applyBrush({ tool: "raise", size: 2, strength: 5, precise: true, levels: [1, 2, 3, 4], stop: 10, dabs }, raised, W, H);
    expect(raised[15 * W + 20]).toBe(10);
    // the kept tiles stay as they are
    const kept = g.slice();
    applyBrush({ tool: "lower", size: 2, strength: 5, precise: true, levels: [1, 2, 3, 4], keep: [[15, 20, 20]], dabs }, kept, W, H);
    expect(kept[15 * W + 20]).toBe(8);
    expect(kept[15 * W + 21]).toBe(4);
    expect(brushProblems({ tool: "lower", size: 2, strength: 5, levels: [1, 2, 3, 4], dabs }, W, H)).not.toEqual([]);
  });

  it("flatten in steps makes benches every few levels from its level", () => {
    const g = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 2 + Math.floor(x / 4);
    const dabs: number[] = [];
    for (let k = 0; k < 60; k++) for (let x = 4; x <= 36; x += 2) dabs.push(...tile(x, 15));
    applyBrush({ tool: "flatten", size: 3, strength: 10, level: 6, steps: 3, dabs }, g, W, H);
    const row = Array.from({ length: 29 }, (_, k) => g[15 * W + 6 + k]);
    // every level on the row is a bench: 6 plus a multiple of 3
    for (const v of row) expect(Math.abs((v - 6) % 3), `${row}`).toBe(0);
    expect(new Set(row).size).toBeGreaterThan(1);
    expect(brushProblems({ tool: "raise", size: 3, strength: 5, steps: 3, dabs: tile(5, 5) }, W, H)).not.toEqual([]);
  });

  it("smooth, make walkable wears cliffs to 1-level steps, and the build puts natural slopes on the steps under it", () => {
    const g = new Uint8Array(W * H).fill(4);
    for (let y = 0; y < H; y++) for (let x = 20; x < W; x++) g[y * W + x] = 8;
    const dabs: number[] = [];
    for (let k = 0; k < 40; k++) for (let y = 8; y <= 22; y += 2) dabs.push(...tile(20, y));
    const walk = g.slice();
    applyBrush({ tool: "smooth", size: 4, strength: 10, walkable: true, dabs }, walk, W, H);
    for (let y = 12; y <= 18; y++) for (let x = 16; x < 24; x++) expect(Math.abs(walk[y * W + x] - walk[y * W + x + 1]), `(${x}, ${y})`).toBeLessThanOrEqual(1);
    // on a map: a walkable stroke over a cliff near the start gets slopes on its steps
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const st = s.built.start!;
    const path: number[] = [];
    for (let k = 0; k < 30; k++) for (let x = st.x + 8; x <= st.x + 16; x++) path.push(4 * x + 2, 4 * (st.y + 8) + 2);
    const raise: BrushParams = { tool: "raise", size: 3, strength: 10, precise: true, levels: path.filter((_, k) => k % 2 === 0).map(() => 3), dabs: path };
    expect(s.apply({ op: "brush", params: raise }, "user", "Raise").errors).toEqual([]);
    const slopesBefore = s.built.entities.filter((e) => e.template === "Slope").length;
    const u = s.apply({ op: "brush", params: { tool: "smooth", size: 5, strength: 10, walkable: true, dabs: path } }, "user", "Smooth");
    expect(u.errors).toEqual([]);
    expect(s.built.entities.filter((e) => e.template === "Slope").length).toBeGreaterThan(slopesBefore);
    // a full build agrees
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
  });

  it("a precise one-tile pit stays a pit through the build, and the page paints what the build makes", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const st = s.built.start!;
    const x = st.x + 14;
    const y = st.y - 14;
    const p: BrushParams = { tool: "lower", size: 1, strength: 5, precise: true, levels: [1, 2, 2], dabs: [4 * x + 2, 4 * y + 2, 4 * x + 2, 4 * y + 2, 4 * x + 2, 4 * y + 2] };
    const h0 = s.built.heights[y * 96 + x];
    const shown = s.built.heights.slice();
    const { dabs, levels, ...settings } = p;
    const preview = new StrokePreview(settings, s.terrainState(), shown, 96, 96);
    preview.add(dabs.slice(0, 2), undefined, levels!.slice(0, 1));
    preview.add(dabs.slice(2), undefined, levels!.slice(1));
    expect(s.apply({ op: "brush", params: p }, "user", "Lower").errors).toEqual([]);
    expect(s.built.heights[y * 96 + x]).toBe(Math.max(0, h0 - 2));
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    expect(Array.from(preview.protect)).toEqual(Array.from(s.terrainState().protect));
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });
});

describe("Flatten: cut and fill, cliff or ramped edges, objects ride the ground (D204)", () => {
  const W = 40;
  const H = 30;
  const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
  const hold = (x: number, y: number, n: number) => Array.from({ length: n }, () => tile(x, y)).flat();

  it("one stroke cuts the high ground down and fills the low ground up to its level", () => {
    const rand = mulberry(5);
    const g = new Uint8Array(W * H);
    for (let i = 0; i < g.length; i++) g[i] = 4 + Math.floor(rand() * 5);
    const flat = g.slice();
    applyBrush({ tool: "flatten", size: 6, strength: 10, level: 6, dabs: hold(20, 15, 60) }, flat, W, H);
    let cut = 0;
    let filled = 0;
    for (let y = 13; y <= 17; y++)
      for (let x = 18; x <= 22; x++) {
        const i = y * W + x;
        expect(flat[i], `(${x}, ${y})`).toBe(6);
        if (g[i] > 6) cut++;
        if (g[i] < 6) filled++;
      }
    expect(cut).toBeGreaterThan(0);
    expect(filled).toBeGreaterThan(0);
  });

  it("ramped edges: the rim steps down a level a tile, even precise; a cliff keeps its straight wall", () => {
    const g = new Uint8Array(W * H).fill(4);
    const dabs = hold(20, 15, 4);
    const p: BrushParams = { tool: "flatten", size: 5, strength: 5, level: 9, precise: true, levels: [5, 5, 5, 5], dabs };
    const cliff = g.slice();
    applyBrush(p, cliff, W, H);
    expect(cliff[15 * W + 20]).toBe(9);
    // the precise stroke's wall: level 9 right beside level 4
    let wall = 0;
    for (let x = 12; x < 28; x++) wall = Math.max(wall, Math.abs(cliff[15 * W + x] - cliff[15 * W + x + 1]));
    expect(wall).toBe(5);
    const ramped = g.slice();
    applyBrush({ ...p, edges: "ramped" }, ramped, W, H);
    expect(ramped[15 * W + 20]).toBe(9);
    for (let y = 8; y < 22; y++)
      for (let x = 12; x < 28; x++) {
        const i = y * W + x;
        expect(Math.abs(ramped[i] - ramped[i + 1]), `(${x}, ${y})`).toBeLessThanOrEqual(1);
        expect(Math.abs(ramped[i] - ramped[i + W]), `(${x}, ${y})`).toBeLessThanOrEqual(1);
      }
    expect(brushProblems({ tool: "raise", size: 3, strength: 5, edges: "ramped", dabs: tile(5, 5) }, W, H)).not.toEqual([]);
  });

  it("on a map: a ramped flatten gets the natural slopes on its rim, and the trees on it ride the ground", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const make = () => {
      const s = MapSession.fromGenerated(r, r.file);
      s.setWaterMode("defer");
      return s;
    };
    const s = make();
    const st = s.built.start!;
    // dry ground beyond the start's own slopes (40 tiles round it), where a cliff's rim gets none
    const b = s.built;
    let cx = -1;
    let cy = -1;
    for (let y = 10; y < 86 && cx < 0; y++)
      for (let x = 10; x < 86 && cx < 0; x++) {
        if (Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) < 50) continue;
        let dry = true;
        for (let yy = y - 9; yy <= y + 9 && dry; yy++) for (let xx = x - 9; xx <= x + 9 && dry; xx++) if (b.water[yy * 96 + xx] > 0 || b.channel[yy * 96 + xx]) dry = false;
        if (dry) [cx, cy] = [x, y];
      }
    expect(cx).toBeGreaterThanOrEqual(0);
    const level = Math.min(16, s.built.heights[cy * 96 + cx] + 3);
    const dabs = Array.from({ length: 40 }, () => [4 * cx + 2, 4 * cy + 2]).flat();
    const p: BrushParams = { tool: "flatten", size: 6, strength: 10, level, dabs };
    const plants = (m: MapSession) => m.built.entities.filter((e) => /^(Pine|Birch|Oak|BlueberryBush)$/.test(e.template));
    const near = (e: { x: number; y: number }) => Math.hypot(e.x - cx, e.y - cy) <= 7;
    expect(s.apply({ op: "brush", params: p }, "user", "Flatten").errors).toEqual([]);
    const slopesCliff = s.built.entities.filter((e) => e.template === "Slope" && near(e)).length;
    const ramped = make();
    expect(ramped.apply({ op: "brush", params: { ...p, edges: "ramped" } }, "user", "Flatten").errors).toEqual([]);
    expect(ramped.built.entities.filter((e) => e.template === "Slope" && near(e)).length).toBeGreaterThan(slopesCliff);
    // every plant stands on the ground as it is now
    for (const m of [s, ramped]) for (const e of plants(m).filter(near)) expect(e.z, `${e.template} at (${e.x}, ${e.y})`).toBe(m.built.heights[e.y * 96 + e.x]);
    expect(plants(s).filter(near).length).toBeGreaterThan(0);
    expect(Array.from(ramped.fullBuild().heights)).toEqual(Array.from(ramped.built.heights));
    const again = MapSession.open(decodeProject(ramped.project()));
    expect(again.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`)).toEqual(ramped.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`));
    // an imported map's own objects ride the ground too
    const imp = MapSession.importMap(writeTimber(r.file), "valley.timber");
    const before = new Map(imp.built.entities.map((e) => [e.id, e]));
    expect(imp.apply({ op: "brush", params: p }, "user", "Flatten").errors).toEqual([]);
    let rode = 0;
    for (const e of imp.built.entities) {
      if (!near(e) || !/^(Pine|Birch|Oak|BlueberryBush)$/.test(e.template)) continue;
      const was = before.get(e.id);
      if (!was || was.z === e.z) continue;
      expect(e.z, `${e.template} at (${e.x}, ${e.y})`).toBe(imp.built.heights[e.y * 96 + e.x]);
      rode++;
    }
    expect(rode).toBeGreaterThan(0);
  });
});

describe("undo and redo of strokes", () => {
  it("random strokes, undone and redone: undo all gives back the map exactly, and each state equals a full build", () => {
    const r = generate(makeSpec({ seed: 13, size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const W = 96;
    const rand = mulberry(99);
    const start = { heights: Array.from(s.built.heights), entities: s.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`) };
    const ops: EditOp[] = [];
    for (let k = 0; k < 14; k++) ops.push({ op: "brush", params: randomStroke(rand, W, W, TOOLS[Math.floor(rand() * TOOLS.length)], s.built.start ?? null) });
    const states: number[][] = [];
    for (const op of ops) {
      expect(s.apply(op).ok).toBe(true);
      states.push(Array.from(s.built.heights));
    }
    // back and forth at random, checking against a full build now and then
    let at = ops.length;
    for (let k = 0; k < 30; k++) {
      if (rand() < 0.55 && at > 0) {
        s.undo();
        at--;
      } else if (at < ops.length) {
        s.redo();
        at++;
      }
      expect(Array.from(s.built.heights)).toEqual(at ? states[at - 1] : start.heights);
      if (k % 7 === 0) expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    }
    while (s.undo()) at--;
    expect(Array.from(s.built.heights)).toEqual(start.heights);
    expect(s.built.entities.map((e) => `${e.id}@${e.x},${e.y},${e.z}`)).toEqual(start.entities);
    const cleanFile = writeTimber(s.exportFile(s.fullBuild()));
    expect(Buffer.from(cleanFile).equals(Buffer.from(r.bytes))).toBe(true);
  });
});

describe("strokes survive regenerating and the project file", () => {
  it("Generate, keeping my edits: the stroke is applied to the new map", () => {
    const r = generate(makeSpec({ seed: 21, size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const dabs: number[] = [];
    for (let k = 0; k < 30; k++) dabs.push(4 * 70 + 2, 4 * 20 + 2 + Math.round((4 * k) / 3));
    const stroke: BrushParams = { tool: "raise", size: 4, strength: 6, dabs };
    expect(s.apply({ op: "brush", params: stroke }, "user", "Raise, 40 tiles").ok).toBe(true);
    const g = s.regenerate({ designedFor: "hard", settings: makeSpec({ seed: 21, size: { x: 96, y: 96 }, designedFor: "hard" }).settings });
    expect(g.ok).toBe(true);
    expect(s.orphans()).toEqual([]);
    expect(s.history().map((h) => h.label)).toEqual(["Raise, 40 tiles", "Change settings and regenerate"]);
    const op = s.document.edits.find((e) => e.op === "brush");
    expect(op?.params).toEqual(stroke);
    // the new map with the stroke is a full build of the new generation and the stroke
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    // and the project file keeps it
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });
});
