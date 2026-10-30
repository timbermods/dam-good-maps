// The drought line's geometry (render3d/droughtLineGeometry.ts): which sides get a strip, at which height, where the
// tint goes, that the start's water is a little stronger, and that the line is faint wherever today's water goes on
// across it (planning, 2026-10-30: below a fall, a river's last-day shore in the middle of today's river read as foam).

import { describe, expect, it } from "vitest";
import { droughtLine, emptyDroughtLine, SIDE_EAST, SIDE_NORTH, SIDE_SOUTH, SIDE_WEST, type DroughtLine } from "../../src/core/sim/droughtLine";
import { droughtLineGeometry, FACE_INSET, LINE_ALPHA, LINE_WIDTH, TINT_ALPHA, TINT_LIFT, underWater, type QuadBuffers } from "../../src/render3d/droughtLineGeometry";

const W = 8;
const H = 8;
const heights = new Uint8Array(W * H).fill(3);

function lineOf(entries: { tile: number; sides: number; level: number; start?: number; under?: number; onWater?: number; over?: number }[], bed: { tile: number; gone: number; start?: number }[] = []): DroughtLine {
  const l = emptyDroughtLine(W, H, 9);
  l.line = {
    count: entries.length,
    tile: Int32Array.from(entries.map((e) => e.tile)),
    sides: Uint8Array.from(entries.map((e) => e.sides)),
    level: Float32Array.from(entries.map((e) => e.level)),
    start: Uint8Array.from(entries.map((e) => e.start ?? 0)),
    under: Uint8Array.from(entries.map((e) => e.under ?? 0)),
    onWater: Uint8Array.from(entries.map((e) => e.onWater ?? 0)),
    over: Float32Array.from(entries.map((e) => e.over ?? 0)),
  };
  l.bed = { count: bed.length, tile: Int32Array.from(bed.map((b) => b.tile)), gone: Uint8Array.from(bed.map((b) => b.gone)), start: Uint8Array.from(bed.map((b) => b.start ?? 0)) };
  return l;
}

type Box = { x: number[]; y: number[]; z: number[] };

/** The quads as their bounding boxes and opacity. */
function quads(g: QuadBuffers): { b: Box; a: number }[] {
  const out: { b: Box; a: number }[] = [];
  for (let q = 0; q < g.indices.length / 6; q++) {
    const c: number[][] = [];
    for (let v = 0; v < 4; v++) c.push([...g.positions.subarray((q * 4 + v) * 3, (q * 4 + v) * 3 + 3)]);
    const ext = (k: number) => [Math.min(...c.map((p) => p[k])), Math.max(...c.map((p) => p[k]))];
    out.push({ b: { x: ext(0), y: ext(1), z: ext(2) }, a: g.colors[q * 4 * 4 + 3] });
  }
  return out;
}

describe("the drought line's geometry", () => {
  it("draws a refused or empty line as nothing", () => {
    for (const l of [emptyDroughtLine(W, H, 9), emptyDroughtLine(W, H, 9, "refused")]) {
      const g = droughtLineGeometry(l, heights);
      expect(g.line.indices.length + g.tint.indices.length).toBe(0);
    }
  });

  it("lays a side's strip flat at the level, just inside the tile, with an upright one beside the bank", () => {
    const x = 2;
    const y = 3;
    const g = droughtLineGeometry(lineOf([{ tile: x + y * W, sides: SIDE_WEST, level: 3.4 }]), heights);
    expect(g.line.quads).toBe(2);
    const [flat, up] = quads(g.line).map((q) => q.b);
    // flat: at the level, from the side inward, along the whole side (tile y spans z −y−1 … −y)
    expect(flat.y[0]).toBeCloseTo(3.4, 5);
    expect(flat.y[1]).toBeCloseTo(3.4, 5);
    expect(flat.x[0]).toBe(x);
    expect(flat.x[1]).toBeCloseTo(x + LINE_WIDTH, 5);
    expect(flat.z).toEqual([-y - 1, -y]);
    // upright: on the plane just inside the side, centred on the level
    expect(up.x[0]).toBeCloseTo(x + FACE_INSET, 5);
    expect(up.x[1]).toBeCloseTo(x + FACE_INSET, 5);
    expect((up.y[0] + up.y[1]) / 2).toBeCloseTo(3.4, 5);
    expect(up.z).toEqual([-y - 1, -y]);
  });

  it("gives every corner its strip's middle line and width, for the shader's minimum on-screen width", () => {
    const x = 2;
    const y = 3;
    const g = droughtLineGeometry(lineOf([{ tile: x + y * W, sides: SIDE_WEST | SIDE_SOUTH, level: 3.4 }]), heights);
    const { positions: p, centers: c, widths: wd } = g.line;
    expect(c.length).toBe(p.length);
    expect(wd.length).toBe(p.length / 3);
    for (let v = 0; v < wd.length; v++) expect(wd[v]).toBeCloseTo(LINE_WIDTH, 5);
    // the first strip is the west side's flat one: its middle line runs along X = x + width / 2
    for (let v = 0; v < 4; v++) {
      expect(c[v * 3]).toBeCloseTo(x + LINE_WIDTH / 2, 5);
      expect(c[v * 3 + 2]).toBeCloseTo(p[v * 3 + 2], 5);
      expect(Math.abs(p[v * 3] - c[v * 3])).toBeCloseTo(LINE_WIDTH / 2, 5);
    }
  });

  it("puts each side on its own edge (west x−1, east x+1, north y−1, south y+1)", () => {
    const x = 4;
    const y = 4;
    for (const [side, check] of [
      [SIDE_WEST, (b: Box) => b.x[0] === x],
      [SIDE_EAST, (b: Box) => b.x[1] === x + 1],
      [SIDE_NORTH, (b: Box) => b.z[1] === -y],
      [SIDE_SOUTH, (b: Box) => b.z[0] === -y - 1],
    ] as const) {
      const g = droughtLineGeometry(lineOf([{ tile: x + y * W, sides: side, level: 5 }]), heights);
      expect(g.line.quads).toBe(2);
      expect(quads(g.line).some((q) => check(q.b))).toBe(true);
    }
  });

  it("stops the strips short of each other at a corner, so no corner is drawn twice", () => {
    const x = 1;
    const y = 1;
    const g = droughtLineGeometry(lineOf([{ tile: x + y * W, sides: SIDE_WEST | SIDE_NORTH, level: 4 }]), heights);
    expect(g.line.quads).toBe(4);
    const flats = quads(g.line)
      .map((q) => q.b)
      .filter((b) => b.y[0] === b.y[1]);
    expect(flats.length).toBe(2);
    const [a, b] = flats;
    const overlap = a.x[0] < b.x[1] - 1e-6 && b.x[0] < a.x[1] - 1e-6 && a.z[0] < b.z[1] - 1e-6 && b.z[0] < a.z[1] - 1e-6;
    expect(overlap).toBe(false);
  });

  it("draws the start's water a little stronger, and both faint", () => {
    const a = quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST, level: 4, start: 1 }]), heights).line)[0].a;
    const b = quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST, level: 4 }]), heights).line)[0].a;
    expect(a).toBeCloseTo(LINE_ALPHA.start, 5);
    expect(b).toBeCloseTo(LINE_ALPHA.other, 5);
    // faint: an editing aid, never as strong as a selection's outline
    expect(LINE_ALPHA.start).toBeLessThanOrEqual(0.5);
    // under today's water (the line says so: `under`) it is seen through the water as the bed is, by the game's
    // see-through at that depth (D148: a flat 0.4 until the line was drawn on the bed, planning 2026-10-30)
    expect(quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST, level: 4, under: 1, over: 1 }]), heights).line)[0].a).toBeCloseTo(LINE_ALPHA.other * underWater(1), 5);
    expect(quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST, level: 4, under: 1, start: 1, over: 2 }]), heights).line)[0].a).toBeCloseTo(LINE_ALPHA.start * underWater(2), 5);
    expect(underWater(0)).toBeCloseTo(0.175, 5);
    expect(underWater(5)).toBe(0);
    expect(a).toBeGreaterThan(b);
    expect(a).toBeLessThan(1);
    // where today's water goes on across the line (`onWater`), as faint as under it, side by side: a tile on today's
    // shore keeps its strength there
    const both = quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST | SIDE_WEST, level: 4, onWater: SIDE_EAST }]), heights).line);
    // (tile 10 is x 2: its east side's strips lie past x 2.5)
    const eastSide = both.filter((q) => Math.min(...q.b.x) > 2.5);
    expect(both.some((q) => Math.abs(q.a - LINE_ALPHA.other * underWater(0)) < 1e-6)).toBe(true);
    expect(both.some((q) => Math.abs(q.a - LINE_ALPHA.other) < 1e-6)).toBe(true);
    expect(eastSide.every((q) => Math.abs(q.a - LINE_ALPHA.other * underWater(0)) < 1e-6)).toBe(true);
    // (never fainter twice over: under today's water, by its depth alone)
    expect(quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST, level: 4, under: 1, onWater: SIDE_EAST, over: 1 }]), heights).line)[0].a).toBeCloseTo(LINE_ALPHA.other * underWater(1), 5);
    // the tint's opacity per look: the start's a little stronger, High's near-opaque water asking for more, all faint
    for (const look of [TINT_ALPHA.standard, TINT_ALPHA.high]) {
      expect(look.start).toBeGreaterThan(look.other);
      expect(look.start).toBeLessThanOrEqual(0.65);
    }
    expect(TINT_ALPHA.high.other).toBeGreaterThan(TINT_ALPHA.standard.other);
  });

  it("tints only the beds that dry out completely, over the ground, a run of tiles a quad, apart from the line", () => {
    const ground = new Uint8Array(W * H).fill(3);
    ground[2 + W] = 5; // (a step in the run's ground)
    const bed = [
      { tile: 0 + W, gone: 1 },
      { tile: 1 + W, gone: 1 },
      { tile: 2 + W, gone: 1 },
      { tile: 3 + W, gone: 1 },
      { tile: 5 + W, gone: 0 }, // drew back only: not tinted
      { tile: 0 + 4 * W, gone: 1, start: 1 },
    ];
    const g = droughtLineGeometry(lineOf([], bed), ground);
    expect(g.line.quads).toBe(0);
    const qs = quads(g.tint);
    // row 1: x 0–2 at 3, the stepped tile at 5, x 3–4 at 3; row 4: the start's, stronger
    const row1 = qs.filter((q) => q.b.z[1] === -1).map((q) => q.b);
    expect(row1.map((b) => [b.x[0], b.x[1], Math.round((b.y[0] - TINT_LIFT) * 1000) / 1000])).toEqual([
      [0, 2, 3],
      [2, 3, 5],
      [3, 4, 3],
    ]);
    expect(qs.some((q) => q.b.x[0] === 5 && q.b.z[1] === -1)).toBe(false);
    // (a vertex carries 1 on the start's water, else 0: the tint's shader turns it into the look's opacity)
    expect(qs.find((q) => q.b.z[1] === -4)!.a).toBe(1);
    expect(qs.find((q) => q.b.z[1] === -1)!.a).toBe(0);
  });
});

describe("the line over today's water below a fall", () => {
  it("marks the sides where today's water goes on across the last day's shore, and not today's own shore", () => {
    // west to east on one row of 8 between dry banks: a pool at 6 falling to a river at 3 (x 2–7), all wet today; on the
    // drought's last day the river holds water only at x 2–4 (the pool keeps its own): the last day's shore at x 4's
    // east side lies in the middle of today's river
    const W8 = 8;
    const H3 = 3;
    const N = W8 * H3;
    const heights = new Uint8Array(N).fill(9);
    const depth = new Float32Array(N);
    const last = new Float32Array(N);
    for (let x = 0; x < W8; x++) {
      const i = W8 + x;
      heights[i] = x < 2 ? 6 : 3;
      depth[i] = 0.5;
      last[i] = x < 2 || x <= 4 ? 0.4 : 0;
    }
    const line = droughtLine({ W: W8, H: H3, heights, settled: { depth, contamination: new Float32Array(N) }, last, days: 9, startWater: null });
    const at = (x: number) => [...line.line.tile].indexOf(W8 + x);
    // x 4: its east side faces x 5, dry on the last day but wet today: on today's water
    expect(at(4)).toBeGreaterThanOrEqual(0);
    expect(line.line.sides[at(4)] & SIDE_EAST).toBeTruthy();
    expect(line.line.onWater[at(4)]).toBe(SIDE_EAST);
    // the sides facing the dry banks are today's own shore: not on today's water
    for (let k = 0; k < line.line.count; k++) expect(line.line.onWater[k] & (SIDE_NORTH | SIDE_SOUTH)).toBe(0);
    // drawn: the strip over today's river as faint as under today's water
    const g = quads(droughtLineGeometry(line, heights).line);
    const east = g.filter((q) => Math.min(...q.b.x) >= 4.5 && Math.max(...q.b.x) <= 5.01);
    expect(east.length).toBeGreaterThan(0);
    for (const q of east) expect(q.a).toBeCloseTo(LINE_ALPHA.other * underWater(0.1), 5);
  });

  it("holds the line below Canyon 128² seed 3's river fall to the bed's see-through, its shore 1.46 under today's river", () => {
    // (the case planning ruled on, 2026-10-30: the start's water, today at 10.6 over its last day's 9.14; the line read
    // as a white zigzag at 0.45 × 0.4; now as the bed reads through 1.46 levels of water)
    const g = quads(droughtLineGeometry(lineOf([{ tile: 10, sides: SIDE_EAST | SIDE_SOUTH, level: 9.14, start: 1, under: 1, onWater: SIDE_SOUTH, over: 1.46 }]), heights).line);
    for (const q of g) expect(q.a).toBeCloseTo(LINE_ALPHA.start * underWater(1.46), 5);
    expect(LINE_ALPHA.start * underWater(1.46)).toBeLessThan(0.06);
  });

  it("keeps its full strength on a dry stretch, where no water stands over it today", () => {
    // a pond that keeps its level through the drought on one side (its shore today and on the last day alike) and falls
    // on the other: the kept shore is drawn at full strength, so the aid is never lost where there is no water
    const W8 = 8;
    const H3 = 3;
    const N = W8 * H3;
    const hts = new Uint8Array(N).fill(9);
    const depth = new Float32Array(N);
    const last = new Float32Array(N);
    for (let x = 1; x < 7; x++) {
      const i = W8 + x;
      hts[i] = 4;
      depth[i] = x < 4 ? 0.5 : 0.8;
      last[i] = x < 4 ? 0.5 : x < 6 ? 0.3 : 0;
    }
    const line = droughtLine({ W: W8, H: H3, heights: hts, settled: { depth, contamination: new Float32Array(N) }, last, days: 9, startWater: null });
    const at = (x: number) => [...line.line.tile].indexOf(W8 + x);
    expect(line.line.under[at(1)]).toBe(0);
    expect(line.line.onWater[at(1)]).toBe(0);
    const g = quads(droughtLineGeometry(line, hts).line);
    // x 1's west side: today's shore, dry beyond it, nothing over it
    const west = g.filter((q) => Math.max(...q.b.x) <= 1.5);
    expect(west.length).toBeGreaterThan(0);
    for (const q of west) expect(q.a).toBeCloseTo(LINE_ALPHA.other, 5);
  });
});
