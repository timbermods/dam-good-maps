// A river that starts at the map's edge flows into the map, never off it (the forces-preview
// feedback's item 27, PLAN §20 D325): the lip round an edge row of sources, src/core/water/edgeLip.ts,
// the one piece the generator, the forces and the Real places conversion share.

import { describe, expect, it } from "vitest";
import { edgeLip, LIP_REACH, rowTiles } from "../../src/core/water/edgeLip";
import { canonicalSettle } from "../../src/core/sim/prefill";
import type { WaterModel } from "../../src/core/sim/water";

const W = 40;
const H = 40;

/** Level ground at 3 along the south edge (y 0–5, x 10–30), a channel 3 wide running north from a
 *  row of three sources at x 19–21, the land round them at 8. */
function field(): Uint8Array {
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inChannel = x >= 19 && x <= 21;
      h[y * W + x] = inChannel ? 3 : y < 6 && Math.abs(x - 20) <= 10 ? 3 : 8;
    }
  // the channel falls a level every 12 tiles and leaves by the north edge
  for (let y = 0; y < H; y++) for (let x = 19; x <= 21; x++) h[y * W + x] = Math.max(0, 3 - Math.floor(y / 12));
  return h;
}

/** What drains off the map in the settled water, beside the row (within the lip's reach) and at
 *  the far end, in blocks a second (the flows into each boundary tile). */
function losses(h: Uint8Array, row: readonly number[]): { beside: number; far: number } {
  const model: WaterModel = { W, H, floor: Float64Array.from(h), dam: null, emitters: row.map((i) => ({ cells: [i], strength: 1, contamination: 0 })) };
  const s = canonicalSettle(model, { rules: "game" });
  const out = s.out!;
  let beside = 0;
  let far = 0;
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (!(x === 0 || y === 0 || x === W - 1 || y === H - 1) || row.includes(i)) continue;
    let inflow = 0;
    if (y > 0) inflow += out[4 * (i - W) + 2];
    if (x > 0) inflow += out[4 * (i - 1) + 3];
    if (y < H - 1) inflow += out[4 * (i + W) + 0];
    if (x < W - 1) inflow += out[4 * (i + 1) + 1];
    if (y < LIP_REACH) beside += inflow;
    else far += inflow;
  }
  return { beside, far };
}

describe("the edge lip (item 27)", () => {
  const row = rowTiles("south", [19, 20, 21], W, H);

  it("water from an edge row with low land beside it pours off the map there", () => {
    const l = losses(field(), row);
    expect(l.beside).toBeGreaterThan(0.5);
  });

  it("the lip holds it: the row's water leaves only by the river's far end", () => {
    const h = field();
    const r = edgeLip(h, W, H, { row, surface: 3.6 });
    expect(r.level).toBe(5);
    const l = losses(h, row);
    expect(l.beside).toBeLessThan(0.05);
    expect(l.far).toBeGreaterThan(2.5);
  });

  it("raises only the boundary tiles the head's water reaches and the tiles inside them, a level lower", () => {
    const h = field();
    const before = h.slice();
    const r = edgeLip(h, W, H, { row, surface: 3.6 });
    for (const i of row) expect(h[i]).toBe(before[i]);
    for (const i of r.raised) {
      const x = i % W;
      const y = (i - x) / W;
      expect(y).toBeLessThanOrEqual(1);
      expect(Math.abs(x - 20)).toBeLessThanOrEqual(LIP_REACH + 1);
      expect(h[i]).toBe(y === 0 ? 5 : 4);
    }
    // (not a wall along the whole edge: tiles beyond the reach are left)
    expect(h[0 * W + 0]).toBe(before[0]);
    expect(h[0 * W + W - 1]).toBe(before[W - 1]);
    // the channel inland stays
    for (let y = 2; y < H; y++) for (let x = 19; x <= 21; x++) expect(h[y * W + x]).toBe(before[y * W + x]);
  });

  it("keeps what it is told to keep, and is the same every time", () => {
    const keep = new Uint8Array(W * H);
    keep[18] = 1;
    const a = field();
    const b = field();
    edgeLip(a, W, H, { row, surface: 3.6, keep });
    edgeLip(b, W, H, { row, surface: 3.6, keep });
    expect(a[18]).toBe(3);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
