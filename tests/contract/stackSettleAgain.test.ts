// A map with caves settles at once after an edit that leaves its water as it was (D453): the last
// canonical settle stands for the new one, provably (sim/stackWater.ts `settledAgain`), with the same
// bytes as a settle from cold; an edit by the water settles in full. A project saved while the water
// settles reopens to the same file as one saved settled. The collaboration's settled hash covers the
// water under the roofs.

import { describe, expect, it } from "vitest";
import { settledHash } from "../../src/core/collab";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { canonicalRun, type CanonicalWater } from "../../src/core/sim/prefill";
import { REACH_MARGIN, settledAgain, type StackSettle } from "../../src/core/sim/stackWater";
import { makeSpec } from "../../src/core/spec/mapspec";
import { caveSession, dig, hillsides } from "./caveMap";

const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

/** The canonical settle of the map's water from cold. */
function cold(s: MapSession): CanonicalWater {
  const run = canonicalRun(s.built.waterModel);
  let w = run.advance(Infinity);
  while (!w) w = run.advance(Infinity);
  return w;
}

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function expectSame(a: StackSettle, b: StackSettle): void {
  for (const k of ["count", "floor", "ceil", "depth", "overflow", "contamination", "sat", "reach", "flows"] as const) expect(bytes(a[k]!).equals(bytes(b[k]!)), k).toBe(true);
  for (const k of ["ids", "depth", "overflow", "contamination"] as const) expect(bytes(a.start![k]).equals(bytes(b.start![k])), `start ${k}`).toBe(true);
  expect([a.L, a.settled, a.ticks]).toEqual([b.L, b.settled, b.ticks]);
}

/** How far (Chebyshev, in tiles) (x, y) lies from every column the settle wet. */
function fromReach(st: StackSettle, x: number, y: number): number {
  const N = st.W * st.H;
  let best = Infinity;
  for (let c = 0; c < st.reach!.length; c++) {
    if (!st.reach![c]) continue;
    const i = c % N;
    best = Math.min(best, Math.max(Math.abs((i % st.W) - x), Math.abs(Math.floor(i / st.W) - y)));
  }
  return best;
}

describe("a map with caves settles again at once when an edit leaves its water as it was (D453)", () => {
  it("an edit away from the water: the last settle, the same bytes as from cold; an edit by the water settles in full", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const h = hillsides(s)[0];
    expect(s.apply(dig(h.x, h.y, h.z, "-x")).errors).toEqual([]);
    const st = s.built.settle.stack!;
    expect(st.reach).toBeDefined();
    // the top block of a tile, taken off: the tiles nothing stands on, by their distance from the water's reach
    const W = s.built.W;
    const held = new Set(s.built.entities.map((e) => e.y * W + e.x));
    const tiles: { x: number; y: number; d: number }[] = [];
    for (let y = 3; y < s.built.H - 3; y++) for (let x = 3; x < W - 3; x++) if (!held.has(y * W + x) && s.plainAt(y * W + x)) tiles.push({ x, y, d: fromReach(st, x, y) });
    tiles.sort((a, b) => b.d - a.d);
    const top = (t: { x: number; y: number }) => dig(t.x, t.y, s.built.heights[t.y * W + t.x] - 1, "+z");
    // three in a row, each standing on the one before
    for (const far of [tiles[0], tiles[6], tiles[12]]) {
      expect(far.d).toBeGreaterThan(REACH_MARGIN + 2);
      const prev = { model: s.built.waterModel, water: s.built.settle };
      expect(s.apply(top(far)).errors).toEqual([]);
      const again = settledAgain(prev.water.stack!, prev.model, s.built.waterModel);
      expect(again).not.toBeNull();
      const c = cold(s);
      expectSame(again!, c.stack!);
      // (the build took it, and the map from above is the cold settle's too)
      expectSame(s.built.settle.stack!, c.stack!);
      expect(bytes(s.built.water).equals(bytes(c.depth))).toBe(true);
    }
    // by the water: no shortcut, and the settle is the cold one
    const near = tiles.find((t) => t.d === 1 && s.built.water[t.y * W + t.x] === 0)!;
    const before = { model: s.built.waterModel, water: s.built.settle };
    expect(s.apply(top(near)).errors).toEqual([]);
    expect(settledAgain(before.water.stack!, before.model, s.built.waterModel)).toBeNull();
    expectSame(s.built.settle.stack!, cold(s).stack!);
  }, 60000);

  it("a project saved while a hollowed map's water settles reopens to the same file as one saved settled", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const { x, y, z } = hillsides(s)[0];
    expect(s.apply(dig(x, y, z, "-x")).errors).toEqual([]);
    expect(s.waterPending).toBe(true);
    const run = s.canonicalRun();
    expect(run.advance(64)).toBeNull();
    const mid = s.project();
    let w = run.advance(Infinity);
    while (!w) w = run.advance(Infinity);
    expect(s.adoptWater(run.model, w)).toBe(true);
    const settled = s.project();
    const file = s.exportTimber().bytes;
    for (const p of [mid, settled]) {
      const again = MapSession.open(decodeProject(p));
      again.settleCanonical();
      expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(file))).toBe(true);
    }
  }, 60000);

  it("the collaboration's settled hash covers the water under a roof", () => {
    const s = caveSession();
    expect(s.apply(dig(10, 10, 7, "+z")).errors).toEqual([]);
    const st = s.built.settle.stack!;
    expect(st.stacked).toBe(true);
    const N = st.W * st.H;
    // a column under a roof: the lowest of a tile with two
    let c = -1;
    for (let i = 0; i < N && c < 0; i++) if (st.count[i] > 1) c = i;
    expect(c).toBeGreaterThanOrEqual(0);
    const hash = settledHash(s);
    const top = bytes(s.built.water).slice();
    const was = st.depth[c];
    st.depth[c] = was + 0.5;
    // (the map from above is as it was: a hash of it alone would not see it)
    expect(bytes(s.built.water).equals(top)).toBe(true);
    expect(settledHash(s)).not.toBe(hash);
    st.depth[c] = was;
    expect(settledHash(s)).toBe(hash);
  });
});
