// The game's support rule (D121; src/core/terrain/support.ts): the investigation's 38 tall shapes
// behave as the rule predicts (GAME_RULES.md §2), the mask version deletes exactly what the rule's
// queue over the voxel array deletes, and a run floating over air down to z = 0 is checked
// (INVENTORY.md, bug 1).

import { describe, expect, it } from "vitest";
import { allPlain, stackableTops, supportRule } from "../../src/core/terrain/support";
import { referenceSupport, supportShapes, Vox, LAYERS } from "./supportShapes";

/** A small deterministic generator (the tests must not depend on Math.random). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("the support rule", () => {
  it("lets the investigation's 38 tall shapes stand or fall as the game's rule predicts", () => {
    const shapes = supportShapes();
    expect(shapes.length).toBe(38);
    for (const s of shapes) {
      const r = supportRule(s.vox.masks());
      expect({ name: s.name, stands: r.dropped.length === 0 }).toEqual({ name: s.name, stands: s.stands });
      expect(Array.from(r.dropped)).toEqual(referenceSupport(s.vox.W, s.vox.H, s.vox.v));
    }
  });

  it("deletes exactly what the rule's queue deletes, on random layered terrain", () => {
    const next = rng(20260927);
    for (let k = 0; k < 60; k++) {
      const W = 6 + Math.floor(next() * 14);
      const H = 6 + Math.floor(next() * 14);
      const vx = new Vox(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) vx.column(x, y, Math.floor(next() * 12));
      // slabs, ledges and pillars in the air; holes cut out of the ground
      for (let n = 0; n < 12; n++) {
        const x0 = Math.floor(next() * W);
        const y0 = Math.floor(next() * H);
        const z0 = 1 + Math.floor(next() * 20);
        const w = 1 + Math.floor(next() * 8);
        const h = 1 + Math.floor(next() * 3);
        const t = 1 + Math.floor(next() * 3);
        const solid = next() < 0.7;
        for (let y = y0; y < Math.min(H, y0 + h); y++) for (let x = x0; x < Math.min(W, x0 + w); x++) for (let z = z0; z < z0 + t; z++) vx.set(x, y, z, solid);
      }
      const tops: number[] = [];
      if (k % 3 === 0) for (let n = 0; n < 4; n++) tops.push(Math.floor(next() * 20) * W * H + Math.floor(next() * W * H));
      const r = supportRule(vx.masks(), tops.length ? new Set(tops) : null);
      expect(Array.from(r.dropped)).toEqual(referenceSupport(W, H, vx.v, LAYERS, tops));
      // the terrain it keeps is the terrain less what it deleted
      const kept = vx.masks().mask;
      for (const v of r.dropped) kept[v % (W * H)] &= ~(1 << Math.floor(v / (W * H)));
      expect(Array.from(r.kept)).toEqual(Array.from(kept));
    }
  });

  it("checks a run floating over air down to z = 0, which has one floor (INVENTORY bug 1)", () => {
    // a 3-high block standing on air at z = 0, 5 tiles from any rock
    const vx = new Vox(11, 11);
    vx.column(0, 0, 4);
    for (let z = 1; z <= 3; z++) vx.set(5, 5, z, true);
    const t = vx.masks();
    expect(allPlain(t)).toBe(false);
    const r = supportRule(t);
    expect(r.dropped.length).toBe(3);
    // rock 2 tiles away holds nothing (support passes only through rock); rock beside it holds it
    vx.column(3, 5, 4);
    expect(supportRule(vx.masks()).dropped.length).toBe(3);
    vx.column(4, 5, 4);
    expect(supportRule(vx.masks()).dropped.length).toBe(0);
  });

  it("has nothing to check on a heightfield, and a stackable's top holds the rock above it", () => {
    const vx = new Vox(8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) vx.column(x, y, (x + y) % 7);
    expect(allPlain(vx.masks())).toBe(true);
    expect(supportRule(vx.masks()).dropped.length).toBe(0);
    // a voxel at z 5 over air, 4 tiles from rock: it falls, unless a platform's top is under it
    const w = new Vox(9, 1);
    w.column(0, 0, 6);
    w.set(4, 0, 5, true);
    expect(supportRule(w.masks()).dropped.length).toBe(1);
    expect(supportRule(w.masks(), new Set([4 * 9 + 4])).dropped.length).toBe(0);
    // a NaturalOverhang3x1 lying along y from (4, 0, 4): the rock on its far end stands
    const o = new Vox(9, 4);
    for (let y = 0; y < 4; y++) o.column(0, y, 6);
    o.set(4, 2, 5, true);
    expect(supportRule(o.masks()).dropped.length).toBe(1);
    const tops = stackableTops(9, 4, [{ template: "NaturalOverhang3x1", x: 4, y: 0, z: 4, orientation: "Cw0", flipped: false }]);
    expect([...tops].sort((a, b) => a - b)).toEqual([4 * 36 + 4, 4 * 36 + 9 + 4, 4 * 36 + 18 + 4]);
    expect(supportRule(o.masks(), tops).dropped.length).toBe(0);
  });
});
