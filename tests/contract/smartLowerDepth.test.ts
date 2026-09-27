// Smart Lower's depth comes from strokes, not from holding (PLAN §20 D263). A new channel's bed
// starts a level below the surface of the water it leaves, holds while its dabs are still in that
// water (no pit where it leaves), never rises along the stroke, and no tile is cut below it however
// long the brush is held; a deepening pass along a channel takes exactly one level off; plain Lower
// still digs deeper while held; a stroke saved before D263 replays as it always did; the page paints
// what the build makes, and the project replays it.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { applyBrush, brushProblems, type BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { generate } from "../../src/core/gen/generate";
import { hash32 } from "../../src/core/math/hash";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 48;
const L = 8;
const ROW = 20;
/** Flat land at 8 with a river down x = 10..12, its bed `depth` below the land. */
function land(depth: number): Uint8Array {
  const g = new Uint8Array(W * W).fill(L);
  for (let y = 0; y < W; y++) for (let x = 10; x <= 12; x++) g[y * W + x] = L - depth;
  return g;
}
/** A stroke from the river's middle east along row 20, a dab every quarter tile, held `hold` dabs at
 *  its far end and `mid` dabs halfway. */
function stroke(hold: number, mid = 0, to = 40): number[] {
  const d: number[] = [];
  for (let q = 4 * 11 + 2; q <= 4 * to + 2; q++) {
    d.push(q, 4 * ROW + 2);
    if (q === 4 * 26 + 2) for (let k = 0; k < mid; k++) d.push(q, 4 * ROW + 2);
  }
  for (let k = 0; k < hold; k++) d.push(4 * to + 2, 4 * ROW + 2);
  return d;
}
/** The first dab whose tile is dry land (east of the river). */
const dryAt = (dabs: number[]) => {
  for (let k = 0; k < dabs.length; k += 2) if (Math.floor(dabs[k] / 4) > 12) return k / 2;
  return dabs.length / 2;
};
const lower = (g: Uint8Array, p: Omit<BrushParams, "dabs" | "tool" | "size" | "strength">, dabs: number[]) => {
  const out = g.slice();
  applyBrush({ tool: "lower", size: 2, strength: 5, dabs, ...p }, out, W, W);
  return out;
};

describe("smart Lower's depth from strokes (D263)", () => {
  it("from a one-deep river, a held stroke across flat land leaves a channel exactly one level below the land beside it", () => {
    const g = land(1);
    // (the page's bed: a level below the river's surface, about level 8)
    for (const [hold, mid] of [
      [0, 0],
      [400, 300],
    ]) {
      const dabs = stroke(hold, mid);
      const c = lower(g, { channel: true, bed: L - 1, dry: dryAt(dabs) }, dabs);
      for (let x = 15; x <= 38; x++) expect(c[ROW * W + x], `x ${x}, held ${hold}`).toBe(L - 1);
      // nothing anywhere below the bed, and the river as it was
      expect(Math.min(...c)).toBe(L - 1);
      for (let y = 0; y < W; y++) for (let x = 10; x <= 12; x++) expect(c[y * W + x]).toBe(L - 1);
      // the land beside it stands
      expect(c[(ROW + 6) * W + 30]).toBe(L);
    }
  });

  it("from a three-deep river, the channel's water is about a tile deep across flat land, with no pit where it leaves", () => {
    const g = land(3);
    const dabs = stroke(300, 200);
    const c = lower(g, { channel: true, bed: L - 1, dry: dryAt(dabs) }, dabs);
    for (let x = 15; x <= 38; x++) expect(c[ROW * W + x], `x ${x}`).toBe(L - 1);
    // the river keeps its bed: no tile below it, none of its tiles dug
    for (let y = 0; y < W; y++) for (let x = 10; x <= 12; x++) expect(c[y * W + x]).toBe(L - 3);
    expect(Math.min(...c)).toBe(L - 3);
    // the old rule dug it from the river's bed, three deep all the way
    const old = lower(g, { channel: true }, stroke(0));
    expect(old[ROW * W + 30]).toBeLessThanOrEqual(L - 3);
  });

  it("a deepening pass along the channel makes it two deep, however long it's held", () => {
    const g = land(1);
    const dabs = stroke(0);
    const one = lower(g, { channel: true, bed: L - 1, dry: dryAt(dabs) }, dabs);
    const along: number[] = [];
    for (let q = 4 * 16 + 2; q <= 4 * 36 + 2; q++) along.push(q, 4 * ROW + 2);
    for (let k = 0; k < 500; k++) along.push(4 * 36 + 2, 4 * ROW + 2);
    const two = lower(one, { channel: true, deepen: true }, along);
    for (let x = 16; x <= 36; x++) expect(two[ROW * W + x], `x ${x}`).toBe(L - 2);
    expect(Math.min(...two)).toBe(L - 2);
  });

  it("across a rise its bed never rises; plain Lower still digs deeper while held", () => {
    const g = land(1);
    for (let y = 10; y < 30; y++) for (let x = 25; x <= 28; x++) g[y * W + x] = L + 3;
    const dabs = stroke(0);
    const c = lower(g, { channel: true, bed: L - 1, dry: dryAt(dabs) }, dabs);
    let last = Infinity;
    for (let x = 13; x <= 38; x++) {
      const h = c[ROW * W + x];
      expect(h, `x ${x}`).toBeLessThanOrEqual(last);
      last = h;
    }
    for (let x = 25; x <= 28; x++) expect(c[ROW * W + x]).toBe(L - 1);
    // plain Lower (away from water): holding keeps digging
    const held: number[] = [];
    for (let k = 0; k < 300; k++) held.push(4 * 30 + 2, 4 * 35 + 2);
    const plain = land(1);
    applyBrush({ tool: "lower", size: 6, strength: 5, dabs: held }, plain, W, W);
    expect(plain[35 * W + 30]).toBeLessThanOrEqual(L - 4);
    expect(brushProblems({ tool: "raise", size: 2, strength: 5, bed: 3, dabs: held }, W, W)).not.toEqual([]);
    expect(brushProblems({ tool: "lower", size: 2, strength: 5, channel: true, bed: 3, deepen: true, dabs: held }, W, W)).not.toEqual([]);
  });

  it("a stroke saved before D263 replays as it always did", () => {
    // the old rule's bytes for this stroke, pinned before D263 was built
    const old = lower(land(1), { channel: true }, stroke(400, 300));
    expect(hash32(...Array.from(old))).toBe(OLD_RULE_HASH);
  });

  it("the page paints what the build makes, and the project replays it", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const start = s.built.start!;
    let from = -1;
    for (let i = 0; i < 96 * 96 && from < 0; i++) {
      const x = i % 96;
      const y = Math.floor(i / 96);
      if (s.built.channel[i] && x > 8 && x < 96 - 20 && Math.hypot(x - start.x, y - start.y) > 24) from = i;
    }
    const fx = from % 96;
    const fy = Math.floor(from / 96);
    const dabs: number[] = [];
    for (let k = 0; k <= 16; k++) dabs.push(4 * (fx + k) + 2, 4 * fy + 2);
    for (let k = 0; k < 200; k++) dabs.push(4 * (fx + 16) + 2, 4 * fy + 2);
    const bed = Math.max(0, s.built.heights[from]);
    for (const p of [
      { tool: "lower", size: 2, strength: 4, channel: true, bed, dry: 3, dabs },
      { tool: "lower", size: 2, strength: 4, channel: true, deepen: true, dabs },
    ] as BrushParams[]) {
      const shown = s.built.heights.slice();
      const { dabs: d, ...settings } = p;
      const preview = new StrokePreview(settings, s.terrainState(), shown, 96, 96);
      for (let j = 0; j < d.length; j += 6) preview.add(d.slice(j, j + 6));
      const u = s.apply({ op: "brush", params: p }, "user", "Lower");
      expect(u.errors).toEqual([]);
      expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    }
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
  });
});

const OLD_RULE_HASH = 1717232175;
