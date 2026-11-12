// Ruled land (`validate/ruledLand.ts`, the gate's advisory `terrain.ruled_land`; planning on #236, 2026-11-11): a grid
// laid with a ruler fails and noise-shaped land passes; the Gate as laid today fails (the order's own example: when its
// land is rebuilt on the shared relief, these two cases flip to passing, and that is the rebuild's test); the lake
// stair's captured seed and a theme's sample pass; 256² costs milliseconds.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { generatePremise } from "../../src/core/premise/generate";
import { gateMap } from "../../src/core/premise/gateMap";
import { makeSpec } from "../../src/core/spec/mapspec";
import { RULED_LIMITS, ruledLand, wetOf } from "../../src/core/validate/ruledLand";
import { splitmix32 } from "../../src/core/math/rng";

/** A heightfield of smoothed value noise, quantised to levels: land with no ruler in it. */
function noiseLand(W: number, H: number, seed: number): Uint8Array {
  const rnd = splitmix32(seed);
  const C = 16;
  const g = Array.from({ length: (W / C + 2) * (H / C + 2) }, () => rnd());
  const gw = W / C + 2;
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = x / C;
      const fy = y / C;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const s = (t: number) => t * t * (3 - 2 * t);
      const a = g[iy * gw + ix] + (g[iy * gw + ix + 1] - g[iy * gw + ix]) * s(tx);
      const b = g[(iy + 1) * gw + ix] + (g[(iy + 1) * gw + ix + 1] - g[(iy + 1) * gw + ix]) * s(tx);
      h[y * W + x] = Math.floor(2 + 10 * (a + (b - a) * s(ty)) + 0.6 * rnd());
    }
  return h;
}

const measured = (b: { heights: ArrayLike<number>; settle: { depth: ArrayLike<number> }; W: number; H: number }) => ruledLand(b.heights, wetOf(b.settle.depth), b.W, b.H);

describe("ruled land", () => {
  it("a grid laid with a ruler fails: a straight wall, a canal and square plateaus", () => {
    const W = 96;
    const h = new Uint8Array(W * W).fill(3);
    const wet = new Uint8Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        if (y >= 40 && y < 45) h[y * W + x] = 9; // a wall 5 thick across the map
        if (x >= 60 && x < 63) wet[y * W + x] = 1; // a canal 3 wide
        if (x >= 10 && x < 30 && y >= 10 && y < 30) h[y * W + x] = 6; // a square plateau
      }
    const r = ruledLand(h, wet, W, W);
    expect(r.ok).toBe(false);
    expect(r.straight).toBeGreaterThan(0.8);
    expect(r.bands).toBeGreaterThan(0.1);
    expect(r.corners).toBeGreaterThan(0);
  });

  it("noise-shaped land passes, and the map's own edge does not count", () => {
    const W = 128;
    const h = noiseLand(W, W, 7);
    const r = ruledLand(h, new Uint8Array(W * W), W, W);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    // a cliff along the map's edge is the game's straightness, not the land's
    for (let x = 0; x < W; x++) h[x] = 20;
    expect(ruledLand(h, new Uint8Array(W * W), W, W).straight).toBeCloseTo(r.straight, 6);
  });

  it("channels: a moat round a meadow fails; a blob lake and a winding river of varying width pass", () => {
    const W = 128;
    const flat = new Uint8Array(W * W).fill(4);
    const moat = new Uint8Array(W * W);
    const lake = new Uint8Array(W * W);
    const river = new Uint8Array(W * W);
    const rnd = splitmix32(5);
    for (let y = 0; y < W; y++) {
      const centre = 64 + 22 * Math.sin(y / 11);
      const half = 2.5 + 2 * Math.sin(y / 7 + 1) + rnd();
      for (let x = 0; x < W; x++) {
        const ring = Math.max(Math.abs(x - 64), Math.abs(y - 64));
        if (ring >= 22 && ring < 26) moat[y * W + x] = 1; // 4 wide round a meadow 44 across
        const a = Math.atan2(y - 64, x - 64);
        if ((x - 64) ** 2 + (y - 64) ** 2 <= (24 + 5 * Math.sin(3 * a) + 3 * Math.cos(5 * a + 1)) ** 2) lake[y * W + x] = 1;
        if (y > 0 && y < W - 1 && Math.abs(x - centre) <= half) river[y * W + x] = 1;
      }
    }
    const m = ruledLand(flat, moat, W, W);
    expect(m.channels).toBeGreaterThan(0.9);
    expect(m.ok).toBe(false);
    expect(m.channel).not.toBeNull();
    expect(ruledLand(flat, lake, W, W).channels).toBeLessThanOrEqual(RULED_LIMITS.channels);
    expect(ruledLand(flat, river, W, W).channels).toBeLessThanOrEqual(RULED_LIMITS.channels);
  });

  it("the Gate as laid fails on seeds 1 and 2 at 128², on its edges and on its channels (flips to passes when the Gate's land is rebuilt)", () => {
    for (const seed of [1, 2]) {
      const g = gateMap(makeSpec({ seed, size: { x: 128, y: 128 }, theme: "any", premise: "any" }));
      if ("reason" in g || !g.map) throw new Error(`the Gate made no map on seed ${seed}`);
      const r = measured(g.map.built);
      expect(r.ok, `seed ${seed}`).toBe(false);
      expect(r.channels, `seed ${seed}`).toBeGreaterThan(RULED_LIMITS.channels);
    }
  });

  it("the lake stair's seed 1 passes but for its corners, and a River Valley sample passes, at 128²", () => {
    // (the lake stair's corners, 5.4 per 1,000 edges, are over planning's limit of 3 (2026-11-12): reported to
    // planning, not loosened for)
    const p = generatePremise(makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any", premise: "lakeStair" }));
    if ("reason" in p) throw new Error(p.reason);
    const r = measured(p.result.built);
    expect(r.straight).toBeLessThanOrEqual(RULED_LIMITS.straight);
    expect(r.bands).toBeLessThanOrEqual(RULED_LIMITS.bands);
    expect(r.channels).toBeLessThanOrEqual(RULED_LIMITS.channels);
    const t = generate(makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "riverValley" }));
    expect(measured(t.built).ok).toBe(true);
  });

  it("costs milliseconds at 256²", () => {
    const W = 256;
    const h = noiseLand(W, W, 3);
    const wet = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) wet[i] = h[i] <= 4 ? 1 : 0; // the low ground under water
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const t = performance.now();
      ruledLand(h, wet, W, W);
      best = Math.min(best, performance.now() - t);
    }
    // (about 10 ms alone; the bound leaves room for the other test workers on the machine)
    expect(best).toBeLessThan(100);
  });
});
