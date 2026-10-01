// Water sources in rows and clusters (PLAN §20 D314): the placement rule in
// src/core/water/sourceGroups.ts, against the investigation's numbers
// (investigation/source-groups/REPORT.md).

import { describe, expect, it } from "vitest";
import {
  cleanCount,
  groupTiles,
  MAX_ROW,
  PAIR_CHANCE,
  placeSourceGroup,
  shareEqually,
  wantedCount,
  type SourceGroundInput,
  type SourceGroup,
  type SourceGroupRequest,
} from "../../src/core/water/sourceGroups";
import { MAX_STRENGTH_PER_TILE } from "../../src/core/sim/model";

const S = 64;

function flat(level = 5, W = S, H = S): SourceGroundInput {
  return { W, H, heights: new Uint8Array(W * H).fill(level) };
}

/** A valley running east (+x), falling a level every 8 tiles, its floor 5 tiles wide (y 30-34),
 *  its sides rising a level a tile. */
function valley(): SourceGroundInput {
  const h = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = 12 - Math.floor(x / 8) + Math.max(0, Math.abs(y - 32) - 2);
  return { W: S, H: S, heights: h };
}

const water = (x: number, y: number, strength: number, seed: number, more: Partial<SourceGroupRequest> = {}): SourceGroupRequest => ({ kind: "water", x, y, strength, seed, ...more });
const bad = (x: number, y: number, strength: number, seed: number): SourceGroupRequest => ({ kind: "badwater", x, y, strength, seed });

const thousandths = (g: SourceGroup) => g.sources.reduce((s, v) => s + Math.round(v.strength * 1000), 0);

function expectRow(g: SourceGroup) {
  expect(g.refused).toBeNull();
  for (let k = 1; k < g.sources.length; k++) {
    const a = g.sources[k - 1];
    const b = g.sources[k];
    if (g.axis === "x") expect([b.x - a.x, b.y - a.y]).toEqual([1, 0]);
    else expect([b.x - a.x, b.y - a.y]).toEqual([0, 1]);
  }
}

describe("clean water: a row across the flow", () => {
  it("lies across a given flow, never along it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const east = placeSourceGroup(water(30, 30, 2, seed, { flow: [1, 0] }), flat());
      expect(east.flowFrom).toBe("given");
      if (east.sources.length > 1) expect(east.axis).toBe("y");
      expect(new Set(east.sources.map((s) => s.x))).toEqual(new Set([30]));
      const north = placeSourceGroup(water(30, 30, 2, seed, { flow: [0.2, -1] }), flat());
      if (north.sources.length > 1) expect(north.axis).toBe("x");
      expect(new Set(north.sources.map((s) => s.y))).toEqual(new Set([30]));
      // a flow mostly east but a little south: still across it (within 45°)
      const skew = placeSourceGroup(water(30, 30, 2, seed, { flow: [2, 1] }), flat());
      if (skew.sources.length > 1) expect(skew.axis).toBe("y");
    }
  });

  it("reads the flow from the ground at a valley head: across the valley", () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = placeSourceGroup(water(23, 32, 2, seed), valley());
      expect(g.flowFrom).toBe("ground");
      expect(g.axis).toBe("y");
      expect(g.sources.every((s) => s.x === 23 && s.y >= 30 && s.y <= 34)).toBe(true);
      expect(new Set(g.sources.map((s) => s.z)).size).toBe(1);
    }
  });

  it("reads the flow from the settled water's outflow", () => {
    const ground = flat();
    const outflow = new Float64Array(4 * S * S);
    for (let i = 0; i < S * S; i++) outflow[4 * i + 2] = 0.3; // everything runs +y
    const g = placeSourceGroup(water(30, 30, 2, 7), { ...ground, outflow });
    expect(g.flowFrom).toBe("water");
    expect(g.axis).toBe("x");
  });

  it("lies along the map edge where a river enters", () => {
    for (let seed = 0; seed < 30; seed++) {
      const west = placeSourceGroup(water(0, 20, 2, seed), flat());
      expect(west.flowFrom).toBe("edge");
      expect(west.sources.every((s) => s.x === 0)).toBe(true);
      const south = placeSourceGroup(water(40, S - 1, 2, seed), flat());
      expect(south.sources.every((s) => s.y === S - 1)).toBe(true);
    }
    // a mouth sealed tile for tile: the caller's count
    const mouth = placeSourceGroup(water(40, 0, 3.5, 1, { count: 7 }), flat());
    expect(mouth.sources.map((s) => s.x)).toEqual([37, 38, 39, 40, 41, 42, 43]);
    expect(mouth.sources.every((s) => s.y === 0)).toBe(true);
  });

  it("spaces its sources 1 tile apart, edge to edge, and keeps its anchor", () => {
    for (let seed = 0; seed < 200; seed++) {
      const total = 0.5 + (seed % 12) * 0.5;
      const g = placeSourceGroup(water(30, 31, total, seed, { flow: seed & 1 ? [1, 0] : [0, 1] }), flat());
      expectRow(g);
      expect(g.sources.some((s) => s.x === 30 && s.y === 31)).toBe(true);
      // centred on the anchor: at most one more on one side than the other
      const k = g.sources.findIndex((s) => s.x === 30 && s.y === 31);
      expect(Math.abs(k - (g.sources.length - 1 - k))).toBeLessThanOrEqual(1);
    }
  });

  it("shares the strength equally, summing to the total", () => {
    for (let seed = 0; seed < 300; seed++) {
      const total = [0.75, 1, 1.5, 2, 2.5, 3, 3.75, 4, 4.5, 1.333, 2.001, 7][seed % 12];
      const g = placeSourceGroup(water(30, 30, total, seed, { flow: [1, 0] }), flat());
      expect(thousandths(g)).toBe(Math.round(total * 1000));
      expect(g.total).toBe(Math.round(total * 1000) / 1000);
      const each = g.sources.map((s) => s.strength);
      expect(Math.max(...each) - Math.min(...each)).toBeLessThanOrEqual(0.001 + 1e-12);
    }
    expect(shareEqually(1.5, 3)).toEqual([0.5, 0.5, 0.5]);
    expect(shareEqually(2.5, 5)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(shareEqually(0.002, 3)).toEqual([0.001, 0.001, 0]);
    expect(shareEqually(1, 3)).toEqual([0.333, 0.334, 0.333]);
  });

  it("gives a count that follows the strength, in the official range", () => {
    // the official rows' bands: totals 0.75-1 mostly 2, 1.5-2 mostly 3, 2.5-3 mostly 3, 3.5+ mostly 5
    const bands: [number, number][] = [[1, 2], [2, 3], [3, 3], [4, 5]];
    const means: number[] = [];
    for (const [total, mode] of bands) {
      const seen = new Map<number, number>();
      let sum = 0;
      const n = 2000;
      for (let seed = 0; seed < n; seed++) {
        const g = placeSourceGroup(water(30, 30, total, seed, { flow: [0, 1] }), flat());
        const c = g.sources.length;
        expect(c).toBe(g.wanted);
        expect(c).toBeGreaterThanOrEqual(2);
        expect(c).toBeLessThanOrEqual(5);
        seen.set(c, (seen.get(c) ?? 0) + 1);
        sum += c;
      }
      const top = [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0];
      expect(top).toBe(mode);
      means.push(sum / n);
    }
    for (let k = 1; k < means.length; k++) expect(means[k]).toBeGreaterThan(means[k - 1]);
    // over the official rows' totals, 3 is the most common count (13 of 36 groups)
    const totals = [2, 2, 3, 3, 2, 2, 2, 3, 2.5, 1, 3.5, 1.5, 3.75, 4, 3, 2.5, 1, 1, 1, 2, 1, 1.5, 2.5, 0.75, 2.5, 1.5, 1, 1.5, 2];
    const all = new Map<number, number>();
    for (let seed = 0; seed < 50; seed++)
      for (const t of totals) {
        const c = cleanCount(t, ((seed * 7919 + t * 1000) % 1000) / 1000);
        all.set(c, (all.get(c) ?? 0) + 1);
      }
    expect([...all.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe(3);
  });

  it("never spreads thinner than the official least, never past the game's cap", () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(placeSourceGroup(water(30, 30, 0.25, seed, { flow: [1, 0] }), flat()).sources.length).toBe(1);
      expect(placeSourceGroup(water(30, 30, 0.5, seed, { flow: [1, 0] }), flat()).sources.length).toBeLessThanOrEqual(2);
      const big = placeSourceGroup(water(30, 30, 40, seed, { flow: [1, 0] }), flat());
      expect(big.sources.length).toBeGreaterThanOrEqual(5);
      expect(big.sources.every((s) => s.strength <= MAX_STRENGTH_PER_TILE)).toBe(true);
      expect(thousandths(big)).toBe(40000);
    }
    const huge = placeSourceGroup(water(30, 30, 1000, 1, { flow: [1, 0] }), flat());
    expect(huge.sources.length).toBe(MAX_ROW);
    expect(huge.clamped).toBe(true);
    expect(huge.total).toBe(MAX_ROW * MAX_STRENGTH_PER_TILE);
  });
});

describe("clean water: the fallback on cramped ground", () => {
  it("falls back to fewer on a narrow valley head, keeping the strength, never turning along the flow", () => {
    // a channel 1 tile wide running east: open along x, walled across
    const h = new Uint8Array(S * S).fill(9);
    for (let x = 0; x < S; x++) h[32 * S + x] = 5;
    const ground = { W: S, H: S, heights: h };
    for (let seed = 0; seed < 50; seed++) {
      const g = placeSourceGroup(water(20, 32, 2, seed, { flow: [1, 0] }), ground);
      expect(g.sources).toEqual([{ x: 20, y: 32, z: 5, strength: 2, tiles: [32 * S + 20] }]);
      expect(g.shape).toBe("single");
      expect(g.fellBack).toBe(true);
      expect(g.total).toBe(2);
    }
    // two tiles wide: a pair across it
    for (let x = 0; x < S; x++) h[33 * S + x] = 5;
    for (let seed = 0; seed < 50; seed++) {
      const g = placeSourceGroup(water(20, 32, 2, seed, { flow: [1, 0] }), ground);
      expect(g.sources.map((s) => s.y)).toEqual([32, 33]);
      expect(g.sources.map((s) => s.strength)).toEqual([1, 1]);
    }
  });

  it("goes round objects and taken ground, and keeps out of other water", () => {
    const ground = flat();
    // a source standing right beside the anchor, across the flow, and taken tiles on the other side
    const occupied = new Uint8Array(S * S);
    occupied[29 * S + 30] = 1;
    const objects = [{ template: "WaterSource", x: 30, y: 31, z: 5, orientation: "Cw0" as const, flipped: false }];
    for (let seed = 0; seed < 30; seed++) {
      const g = placeSourceGroup(water(30, 30, 3, seed, { flow: [1, 0] }), { ...ground, occupied, objects });
      expect(g.sources.map((s) => s.y)).toEqual([30]);
      expect(g.fellBack).toBe(true);
      expect(g.total).toBe(3);
    }
    // a dry head beside a pool: the row never steps into the pool's water
    const depth = new Float32Array(S * S);
    for (let y = 31; y < 40; y++) depth[y * S + 30] = 0.8;
    for (let seed = 0; seed < 30; seed++) {
      const g = placeSourceGroup(water(30, 30, 3, seed, { flow: [1, 0] }), { ...ground, depth });
      expect(g.sources.every((s) => s.y <= 30)).toBe(true);
    }
  });

  it("refuses only where not even one source can stand", () => {
    const ground = flat();
    const occupied = new Uint8Array(S * S);
    occupied[10 * S + 10] = 1;
    expect(placeSourceGroup(water(10, 10, 1, 1), { ...ground, occupied }).refused).toBe("something already stands there");
    expect(placeSourceGroup(water(-1, 10, 1, 1), ground).refused).toBe("it is outside the map");
    expect(placeSourceGroup(water(10, S, 1, 1), ground).refused).toBe("it is outside the map");
    expect(placeSourceGroup(water(10, 10, 0, 1), ground).refused).toBe("a source needs a strength above 0");
    const r = placeSourceGroup(water(10, 10, 1, 1), { ...ground, occupied });
    expect(r.sources).toEqual([]);
  });
});

describe("badwater: alone, or a close pair", () => {
  it("is a pair about one time in six, never more, on open ground", () => {
    let pairs = 0;
    const n = 3000;
    for (let seed = 0; seed < n; seed++) {
      const g = placeSourceGroup(bad(32, 32, 3, seed), flat());
      expect(g.refused).toBeNull();
      expect(g.sources.length).toBeLessThanOrEqual(2);
      expect(g.fellBack).toBe(false);
      if (g.sources.length === 2) {
        pairs++;
        expect(g.shape).toBe("pair");
        const [a, b] = g.sources;
        // touching to a 2-tile gap between the squares, as the official pairs
        const cheb = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        expect(cheb).toBeGreaterThanOrEqual(3);
        expect(cheb).toBeLessThanOrEqual(5);
        expect(a.z).toBe(b.z);
        expect([a.strength, b.strength]).toEqual([1.5, 1.5]);
        expect(new Set(groupTiles(g)).size).toBe(18);
      } else {
        expect(g.sources[0].strength).toBe(3);
      }
      // the anchor's square is centred on the requested tile
      expect([g.sources[0].x, g.sources[0].y]).toEqual([31, 31]);
      expect(g.sources[0].tiles.length).toBe(9);
    }
    const rate = pairs / n;
    expect(rate).toBeGreaterThan(PAIR_CHANCE - 0.035);
    expect(rate).toBeLessThan(PAIR_CHANCE + 0.035);
  });

  it("stays single below twice the official least strength", () => {
    for (let seed = 0; seed < 500; seed++) expect(placeSourceGroup(bad(32, 32, 0.9, seed), flat()).sources.length).toBe(1);
  });

  it("never stands on a map edge, the pair's partner neither", () => {
    expect(placeSourceGroup(bad(1, 20, 1.5, 1), flat()).refused).toBe("a badwater source never stands on the map's edge");
    expect(placeSourceGroup(bad(20, S - 2, 1.5, 1), flat()).refused).toBe("a badwater source never stands on the map's edge");
    expect(placeSourceGroup(bad(0, 20, 1.5, 1), flat()).refused).toBe("it would reach outside the map");
    for (let seed = 0; seed < 2000; seed++)
      for (const [x, y] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]]) {
        const g = placeSourceGroup(bad(x, y, 3, seed), flat());
        for (const i of groupTiles(g)) {
          const tx = i % S;
          const ty = (i - tx) / S;
          expect(tx > 0 && ty > 0 && tx < S - 1 && ty < S - 1).toBe(true);
        }
      }
  });

  it("refuses uneven or taken ground, and falls back to one where no partner fits", () => {
    const h = new Uint8Array(S * S).fill(5);
    h[33 * S + 33] = 6;
    expect(placeSourceGroup(bad(32, 32, 3, 1), { W: S, H: S, heights: h }).refused).toBe("the ground under it is not level");
    const occupied = new Uint8Array(S * S);
    occupied[31 * S + 31] = 1;
    expect(placeSourceGroup(bad(32, 32, 3, 1), { ...flat(), occupied }).refused).toBe("something already stands there");
    // a level 3×3 on a knoll: nothing around it on its level, so a pair falls back to one
    const knoll = new Uint8Array(S * S).fill(2);
    for (let y = 31; y <= 33; y++) for (let x = 31; x <= 33; x++) knoll[y * S + x] = 7;
    let fell = 0;
    for (let seed = 0; seed < 600; seed++) {
      const g = placeSourceGroup(bad(32, 32, 3, seed), { W: S, H: S, heights: knoll });
      expect(g.sources.length).toBe(1);
      expect(g.sources[0].strength).toBe(3);
      if (g.fellBack) fell++;
    }
    expect(fell).toBeGreaterThan(0);
  });
});

describe("determinism", () => {
  it("gives the same group for the same request, whatever was asked before", () => {
    const ground = valley();
    const reqs = [water(20, 32, 2.5, 11), water(0, 31, 4, 12), bad(40, 10, 3, 13), water(30, 30, 1, 14, { flow: [0, 1] })];
    const first = reqs.map((r) => placeSourceGroup(r, ground));
    const again = [...reqs].reverse().map((r) => placeSourceGroup(r, ground)).reverse();
    expect(again).toEqual(first);
    expect(JSON.stringify(reqs.map((r) => placeSourceGroup(r, ground)))).toBe(JSON.stringify(first));
  });

  it("tells a caller the rule's count before placing (a mouth sized to the row)", () => {
    for (let seed = 0; seed < 200; seed++) {
      const req = water(0, 20, 0.5 + (seed % 9) * 0.5, seed);
      expect(placeSourceGroup(req, flat()).sources.length).toBe(wantedCount(req));
    }
    expect(wantedCount(water(5, 5, 2, 1, { count: 9 }))).toBe(9);
  });

  it("varies with the seed", () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) counts.add(placeSourceGroup(water(30, 30, 2.5, seed, { flow: [1, 0] }), flat()).sources.length);
    expect(counts.size).toBeGreaterThan(1);
  });
});
