import { describe, expect, it } from "vitest";
import { cosDet, expDet, sinDet } from "../../src/core/math/detmath";
import { guidFrom, hash32, hash64Base32 } from "../../src/core/math/hash";
import { stream, Rng } from "../../src/core/math/rng";
import { fbm, valueNoise } from "../../src/core/math/noise";
import { lnDet, density } from "../../src/core/gen/calibrated";
import { distanceFrom, MinHeap, runsToTiles, tilesToRuns } from "../../src/core/math/grid";

describe("deterministic math", () => {
  it("sinDet and cosDet stay within 1e-9 of Math.sin/cos", () => {
    let worst = 0;
    for (let k = -2000; k <= 2000; k++) {
      const x = k * 0.0173 + k * k * 1e-5;
      worst = Math.max(worst, Math.abs(sinDet(x) - Math.sin(x)), Math.abs(cosDet(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("expDet and lnDet agree with Math.exp/log", () => {
    for (let x = -20; x <= 20; x += 0.37) expect(Math.abs(expDet(x) / Math.exp(x) - 1)).toBeLessThan(1e-13);
    for (let x = 1; x <= 64; x += 0.73) expect(Math.abs(lnDet(x) - Math.log(x))).toBeLessThan(1e-12);
  });

  it("density interpolates between the official size classes", () => {
    expect(density("scrap_per_1k_tiles", 16384)).toBeCloseTo(705, 9);
    expect(density("scrap_per_1k_tiles", 100)).toBe(840);
    // the max class's median as measured without Nomads and Oasis (Kyler, 2026-09-25; D148)
    expect(density("scrap_per_1k_tiles", 70000)).toBe(235);
    const mid = density("trees_per_10k", 9216);
    expect(mid).toBeGreaterThan(1061);
    expect(mid).toBeLessThan(1715);
  });
});

describe("hashing and random streams", () => {
  it("are pinned: changing them silently would change every map and id", () => {
    expect(hash32("seed", "beaver")).toBe(hash32("seed", "beaver"));
    expect(hash64Base32(1, "river", "river/main")).toMatch(/^[a-z2-7]{13}$/);
    expect(guidFrom("f-x", "Pine", 5)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const r = new Rng(7);
    const snapshot = {
      hash: hash32("dam", "good", 42),
      id: hash64Base32(4242, "river", "river/main"),
      guid: guidFrom("f-abc", "Oak", 1234),
      rng: Array.from({ length: 4 }, () => r.nextU32()),
    };
    expect(snapshot).toMatchInlineSnapshot(`
      {
        "guid": "16bd435d-060a-45a7-9dcb-0556fefcc0ac",
        "hash": 1453681844,
        "id": "4s244jiu6ko66",
        "rng": [
          838155491,
          1550620431,
          3610122010,
          3621410451,
        ],
      }
    `);
  });

  it("streams are independent and reproducible", () => {
    const a = stream(1, "layout", 0, 0);
    const b = stream(1, "layout", 0, 0);
    const c = stream(1, "layout", 0, 1);
    const xs = Array.from({ length: 8 }, () => a.nextU32());
    expect(Array.from({ length: 8 }, () => b.nextU32())).toEqual(xs);
    expect(Array.from({ length: 8 }, () => c.nextU32())).not.toEqual(xs);
  });

  it("noise is bounded and depends only on (seed, x, y)", () => {
    for (let x = 0; x < 50; x += 3) {
      const v = fbm(9, x, 7, 24);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(fbm(9, x, 7, 24)).toBe(v);
    }
    expect(valueNoise(1, 3, 3, 8)).not.toBe(valueNoise(2, 3, 3, 8));
  });
});

describe("grid helpers", () => {
  it("runs round-trip", () => {
    const tiles = [5, 6, 7, 20, 21, 40];
    expect(runsToTiles(tilesToRuns(tiles, 10), 10)).toEqual(tiles);
  });

  it("chamfer distance", () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    const d = distanceFrom(m, 5, 5);
    expect(d[12]).toBe(0);
    expect(d[13]).toBe(1);
    expect(d[18]).toBeCloseTo(Math.SQRT2, 12);
  });

  it("heap pops in key order, ties by item", () => {
    const h = new MinHeap();
    [[3, 1], [1, 9], [1, 2], [2, 0]].forEach(([k, i]) => h.push(k, i));
    const out = [];
    while (h.size) out.push(h.pop());
    expect(out).toEqual([2, 9, 0, 1]);
  });
});
