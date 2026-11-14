// Ruled land (`validate/ruledLand.ts`, the gate's advisory `terrain.ruled_land`; planning on #236, 2026-11-11): a grid
// laid with a ruler fails and noise-shaped land passes; the Gate's land, rebuilt on the shared relief (a range, a gap and
// a dry lake, planning's ruling of 2026-11-11), passes on seeds 1 to 3 (the case that failed while its land was laid,
// flipped as the order asked); the lake stair's captured seed and a theme's sample pass; 256² costs milliseconds.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { generatePremise } from "../../src/core/premise/generate";
import { gateMap } from "../../src/core/premise/gateMap";
import { makeSpec } from "../../src/core/spec/mapspec";
import { RULED_LIMITS, ruledLand, ruledLandMessage, ruledReach, wetOf } from "../../src/core/validate/ruledLand";
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

  it("channels (reported, no limit): a canal of straight reaches meeting at sharp bends and a moat measure high; a winding river of even width and a blob lake low", () => {
    const W = 128;
    const flat = new Uint8Array(W * W).fill(4);
    const moat = new Uint8Array(W * W);
    const canal = new Uint8Array(W * W);
    const lake = new Uint8Array(W * W);
    const river = new Uint8Array(W * W);
    for (let y = 1; y < W - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const ring = Math.max(Math.abs(x - 64), Math.abs(y - 64));
        if (ring >= 22 && ring < 26) moat[y * W + x] = 1; // 4 wide round a meadow 44 across
        const a = Math.atan2(y - 64, x - 64);
        if ((x - 64) ** 2 + (y - 64) ** 2 <= (24 + 5 * Math.sin(3 * a) + 3 * Math.cos(5 * a + 1)) ** 2) lake[y * W + x] = 1;
        if (Math.abs(x - (64 + 24 * Math.sin(y / 14))) <= 2.5) river[y * W + x] = 1; // 5 wide, winding
      }
    // a canal 4 wide: straight legs of 20 to 40 tiles joined at right angles
    let cx = 10;
    let cy = 10;
    for (const [dx, dy, n] of [[1, 0, 30], [0, 1, 25], [1, 0, 28], [0, 1, 30], [-1, 0, 20], [0, 1, 25], [1, 0, 40]]) {
      for (let k = 0; k < n; k++, cx += dx, cy += dy) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) canal[(cy + b) * W + cx + a] = 1;
    }
    for (const [name, wet] of [["moat", moat], ["canal", canal]] as const) {
      const r = ruledLand(flat, wet, W, W);
      expect(r.channels, name).toBeGreaterThan(0.8);
      expect(r.channel, name).not.toBeNull();
      expect(ruledLandMessage(r), name).toMatch(/of the water in straight even channels/);
    }
    expect(ruledLand(flat, lake, W, W).channels).toBeLessThanOrEqual(0.1);
    expect(ruledLand(flat, river, W, W).channels).toBeLessThanOrEqual(0.1);
    // channels never fails the row: the verdict is the other three's alone
    for (const wet of [moat, canal, lake, river]) {
      const r = ruledLand(flat, wet, W, W);
      expect(r.ok).toBe(r.straight <= RULED_LIMITS.straight && r.bands <= RULED_LIMITS.bands && r.corners <= RULED_LIMITS.corners);
    }
  });

  it("the reach rule: a straight stretch with no bend at its ends is a reach at 12 rows, whatever its width", () => {
    // (D520, planning's ruling of 2026-11-14: the five-widths allowance is for a crossing between bends only; an
    // isolated straight brook, its two ends dead, is a canal at 12 rows. Until that ruling this test let water under 5
    // wide run to five times its width here: 3 wide to 15 rows, 4 wide to 20)
    const W = 64;
    const flat = new Uint8Array(W * W).fill(4);
    // a straight brook `wide` tiles wide and `rows` rows long, along the grid
    const brook = (wide: number, rows: number) => {
      const wet = new Uint8Array(W * W);
      for (let y = 10; y < 10 + rows; y++) for (let x = 20; x < 20 + wide; x++) wet[y * W + x] = 1;
      return ruledLand(flat, wet, W, W).channel;
    };
    for (const wide of [2, 3, 4, 5, 8]) {
      expect(brook(wide, 11), `${wide} wide, 11 rows`).toBeNull();
      expect(brook(wide, 12)?.tiles, `${wide} wide, 12 rows`).toBe(wide * 12);
    }
    // (the same reach read down the columns: 4 wide and 12 long along x)
    const across = new Uint8Array(W * W);
    for (let x = 10; x < 22; x++) for (let y = 20; y < 24; y++) across[y * W + x] = 1;
    expect(ruledLand(flat, across, W, W).channel?.tiles).toBe(48);
    // at 45° too: slices 5 wide (water 3.5 wide), 12 rows
    const diagonal = (rows: number) => {
      const wet = new Uint8Array(W * W);
      for (let y = 10; y < 10 + rows; y++) for (let x = y; x < y + 5; x++) wet[y * W + x] = 1;
      return ruledLand(flat, wet, W, W).channel;
    };
    expect(diagonal(11)).toBeNull();
    expect(diagonal(12)?.tiles).toBe(60);
    // the widths, as a crossing between bends is read: past five times its mean width (3 wide: over 15 rows; 3.5:
    // over 17.5; at 45° a row's slice is √2 wider than the water and a row √2 longer); 5 wide and more at 12 rows
    expect(ruledReach(15, 45, false)).toBe(false);
    expect(ruledReach(16, 48, false)).toBe(true);
    expect(ruledReach(16, 56, false)).toBe(false);
    expect(ruledReach(18, 63, false)).toBe(true);
    expect(ruledReach(12, 60, true)).toBe(false);
    expect(ruledReach(13, 65, true)).toBe(true);
    expect(ruledReach(12, 60, false)).toBe(true);
    expect(ruledReach(11, 55, false)).toBe(false);
  });

  it("the reach rule's bends: a crossing between two bends of 0.5 rad or more runs five widths; a link from a lake, or bending at one end only, is a reach at 12 rows", () => {
    const W = 128;
    const flat = new Uint8Array(W * W).fill(4);
    type P = [number, number];
    const brush = (wet: Uint8Array, a: P, b: P, half: number) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      for (let y = 1; y < W - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const t = Math.max(0, Math.min(1, ((x + 0.5 - a[0]) * dx + (y + 0.5 - a[1]) * dy) / (dx * dx + dy * dy)));
          if (Math.hypot(x + 0.5 - a[0] - t * dx, y + 0.5 - a[1] - t * dy) <= half) wet[y * W + x] = 1;
        }
    };
    // a straight leg `wide` tiles wide down rows 50 to 50 + rows - 1; beyond each end an arm 30 tiles long turning
    // `turn` off the leg's line (the two arms to opposite sides, a meander's S), a lake, or nothing
    type End = "bend" | "lake" | "none";
    const leg = (wide: number, rows: number, top: End, bottom: End, turn = Math.PI / 3) => {
      const wet = new Uint8Array(W * W);
      const x0 = 64;
      const y0 = 50;
      const cx = x0 + wide / 2;
      for (let y = y0; y < y0 + rows; y++) for (let x = x0; x < x0 + wide; x++) wet[y * W + x] = 1;
      if (top === "bend") brush(wet, [cx, y0], [cx - 30 * Math.sin(turn), y0 - 30 * Math.cos(turn)], wide / 2);
      if (bottom === "bend") brush(wet, [cx, y0 + rows], [cx + 30 * Math.sin(turn), y0 + rows + 30 * Math.cos(turn)], wide / 2);
      // a lake 32 across, its shore at the leg's end (the lake below is the one above mirrored)
      const u = new Uint8Array(W * W);
      for (let y = 1; y < W - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - (y0 - 22);
          const a = Math.atan2(-dy, dx);
          if (dx * dx + dy * dy <= (16 + 4 * Math.sin(3 * a) + 2 * Math.cos(5 * a + 1)) ** 2) u[y * W + x] = 1;
        }
      let shore = 0;
      for (let y = 0; y < W; y++) for (let x = x0; x < x0 + wide; x++) if (u[y * W + x]) shore = Math.max(shore, y);
      const sh = y0 - 1 - shore;
      for (let y = 0; y < W; y++)
        for (let x = 0; x < W; x++) {
          if (!u[y * W + x]) continue;
          if (top === "lake" && y + sh >= 1) wet[(y + sh) * W + x] = 1;
          const yy = y0 + rows + (y0 - 1 - (y + sh));
          if (bottom === "lake" && yy < W - 1) wet[yy * W + x] = 1;
        }
      return ruledLand(flat, wet, W, W).channel;
    };
    // a link 3 wide straight from lake to lake: a canal (13 rows between the shores, and the lakes' narrow tips
    // with it: 15 rows, which the widths would have let through; 9 rows and the tips, 11: no reach)
    expect(leg(3, 9, "lake", "lake")).toBeNull();
    expect(leg(3, 13, "lake", "lake")?.tiles).toBe(45);
    // bending at one end only: into a lake, or to a dead end, is a reach at 12 rows
    expect(leg(3, 13, "bend", "lake")?.tiles).toBe(45);
    expect(leg(3, 11, "bend", "none")?.tiles).toBe(39);
    // a crossing between two bends of 60°: 3 wide, let through to 15 rows (the leg of 14 reads as 15 with its
    // joins), a reach over five widths (16 rows read as 17); 4 wide, let through to 20 rows, a reach at 21
    expect(leg(3, 14, "bend", "bend")).toBeNull();
    expect(leg(3, 16, "bend", "bend")?.tiles).toBe(51);
    expect(leg(4, 20, "bend", "bend")).toBeNull();
    expect(leg(4, 21, "bend", "bend")?.tiles).toBe(86);
    // bends under 0.5 rad are no bends: the same crossing between turns of 0.4 rad is a reach
    expect(leg(3, 14, "bend", "bend", 0.4)).not.toBeNull();
    // at 45°: slices 5 wide (water 3.5 wide) between two bends of 60° are let through to 12 rows (17 tiles long),
    // a reach at 13 (18.4 tiles, over five widths); the same 12 rows alone are a reach
    const diagonal = (rows: number, bends: boolean) => {
      const wet = new Uint8Array(W * W);
      for (let y = 40; y < 40 + rows; y++) for (let x = y; x < y + 5; x++) wet[y * W + x] = 1;
      if (bends) {
        const top: P = [42.5, 40.5];
        const end: P = [rows + 41.5, rows + 39.5];
        const a = (285 * Math.PI) / 180;
        const b = (105 * Math.PI) / 180;
        brush(wet, top, [top[0] + 30 * Math.cos(a), top[1] + 30 * Math.sin(a)], 1.75);
        brush(wet, end, [end[0] + 30 * Math.cos(b), end[1] + 30 * Math.sin(b)], 1.75);
      }
      return ruledLand(flat, wet, W, W).channel;
    };
    expect(diagonal(12, true)).toBeNull();
    expect(diagonal(13, true)?.tiles).toBe(65);
    expect(diagonal(12, false)?.tiles).toBe(60);
  });

  it("the Gate's seeds 1 to 3 pass at 128²", () => {
    for (const seed of [1, 2, 3]) {
      const g = gateMap(makeSpec({ seed, size: { x: 128, y: 128 }, theme: "any", premise: "any" }));
      if ("reason" in g || !g.map) throw new Error(`the Gate made no map on seed ${seed}`);
      const m = measured(g.map.built);
      expect(m.ok, `seed ${seed}: ${JSON.stringify(m)}`).toBe(true);
    }
  });

  it("the lake stair's seed 1 passes but for its corners, and a River Valley sample passes, at 128²", () => {
    // (the lake stair's corners, 5.4 per 1,000 edges, are over planning's limit of 3 (2026-11-12): rectangular
    // plates of one level, half of them on the outlands' rim; reported to planning, not loosened for)
    const p = generatePremise(makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any", premise: "lakeStair" }));
    if ("reason" in p) throw new Error(p.reason);
    const r = measured(p.result.built);
    expect(r.straight).toBeLessThanOrEqual(RULED_LIMITS.straight);
    expect(r.bands).toBeLessThanOrEqual(RULED_LIMITS.bands);
    expect(r.channels).toBeLessThanOrEqual(0.1);
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
