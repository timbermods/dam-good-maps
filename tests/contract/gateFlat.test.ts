// The Gate's dry side has no knobs and no one-tile pits (docs/PREMISES.md §5.1, "No knobs, no pits"; `gateFlat.ts`):
// the finder and the mend on hand-built ground, and the land of seeds whose playa carried knobs (128² seeds 3, 5 and 11
// before the mend) read clean.

import { describe, expect, it } from "vitest";
import { firstWater } from "../../src/core/premise/draw";
import { dryFlat, gateLand, gateRelief } from "../../src/core/premise/gateLand";
import { flatKnobs, flatPits, KNOB, mendFlat } from "../../src/core/premise/gateFlat";
import { wallGate } from "../../src/core/premise/premises/wallGate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 24;
const H = 24;
/** Level ground at 5, every tile the mend's. */
const ground = () => ({ h: new Uint8Array(W * H).fill(5), own: new Uint8Array(W * H).fill(1) });
const put = (h: Uint8Array, x: number, y: number, w: number, d: number, level: number) => {
  for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) h[yy * W + xx] = level;
};

describe("the dry side's knobs and pits (`gateFlat.ts`)", () => {
  it("reads a 2 × 2 block two levels over the flat as a knob, and one a level over, or of 12 tiles, as none", () => {
    const { h, own } = ground();
    put(h, 3, 3, 2, 2, 7);
    put(h, 10, 3, 2, 2, 6);
    put(h, 3, 12, 4, 3, 8);
    const k = flatKnobs(h, W, H, own);
    expect(k.map((q) => [q.tiles.length, q.base, q.top])).toEqual([[4, 5, 7]]);
  });

  it("reads a stepped block (a tile of 8 on a piece at 6) as one knob over its base", () => {
    const { h, own } = ground();
    put(h, 5, 5, 3, 2, 6);
    h[5 * W + 6] = 8;
    expect(flatKnobs(h, W, H, own).map((q) => [q.tiles.length, q.base, q.top])).toEqual([[6, 5, 8]]);
  });

  it("leaves a knob alone when any of its tiles is off the ground it reads", () => {
    const { h, own } = ground();
    put(h, 3, 3, 2, 2, 7);
    own[3 * W + 3] = 0;
    expect(flatKnobs(h, W, H, own)).toEqual([]);
  });

  it("reads a tile lower than its four neighbours as a pit, and a notch open on one side as none", () => {
    const { h, own } = ground();
    h[8 * W + 8] = 3;
    h[8 * W + 14] = 4;
    h[8 * W + 15] = 4;
    expect(flatPits(h, W, H, own)).toEqual([8 * W + 8]);
  });

  it("lowers a small knob to a level over the flat and fills a pit to its lowest neighbour", () => {
    const { h, own } = ground();
    put(h, 3, 3, 2, 2, 8);
    h[15 * W + 15] = 2;
    h[15 * W + 16] = 6;
    const done = mendFlat(h, W, H, own, 1);
    expect(done).toEqual({ lowered: 1, aproned: 0, filled: 1 });
    for (const i of [3 * W + 3, 3 * W + 4, 4 * W + 3, 4 * W + 4]) expect(h[i]).toBe(6);
    expect(h[15 * W + 15]).toBe(5);
    expect(flatKnobs(h, W, H, own)).toEqual([]);
    expect(flatPits(h, W, H, own)).toEqual([]);
  });

  it("gives a larger knob, by the seed, an apron a level over the flat, 1 to 3 tiles wide and uneven, its top kept", () => {
    // (a seed for which the 3 × 3 knob takes an apron: half of them do)
    let seen = 0;
    for (let seed = 1; seed < 40; seed++) {
      const { h, own } = ground();
      put(h, 10, 10, 3, 3, 7);
      const done = mendFlat(h, W, H, own, seed);
      expect(done.lowered + done.aproned).toBe(1);
      if (!done.aproned) {
        expect(h[11 * W + 11]).toBe(6);
        continue;
      }
      seen++;
      expect(h[11 * W + 11], "its top kept").toBe(7);
      const apron: number[] = [];
      for (let i = 0; i < W * H; i++) if (h[i] === 6) apron.push(i);
      // (every apron tile within 3 of the knob; straight out from each of the knob's twelve edge tiles the apron runs
      // 1 to 3 tiles, and not as far from all of them)
      const off = apron.map((i) => Math.max(Math.abs((i % W) - 11) - 1, Math.abs(Math.floor(i / W) - 11) - 1));
      expect(Math.max(...off)).toBeLessThanOrEqual(KNOB.apron[1]);
      const runs: number[] = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        for (let k = -1; k <= 1; k++) {
          let [x, y] = [11 + 2 * dx + (dy ? k : 0), 11 + 2 * dy + (dx ? k : 0)];
          let n = 0;
          while (h[y * W + x] === 6) [x, y, n] = [x + dx, y + dy, n + 1];
          runs.push(n);
        }
      expect(Math.min(...runs)).toBeGreaterThanOrEqual(KNOB.apron[0]);
      expect(new Set(runs).size, "an uneven apron").toBeGreaterThan(1);
      expect(flatKnobs(h, W, H, own)).toEqual([]);
    }
    expect(seen, "some seeds give an apron").toBeGreaterThan(5);
    expect(seen, "some seeds lower it").toBeLessThan(34);
  });

  it("touches no tile off the ground it mends", () => {
    const { h, own } = ground();
    put(h, 10, 10, 3, 3, 7);
    for (let i = 0; i < W * H; i++) if (i % W >= 12) own[i] = 0;
    const before = Uint8Array.from(h);
    for (let seed = 1; seed < 20; seed++) {
      const g = Uint8Array.from(before);
      mendFlat(g, W, H, own, seed);
      for (let i = 0; i < W * H; i++) if (!own[i]) expect(g[i]).toBe(before[i]);
    }
  });

  // (the seeds whose playa carried knobs on dev before the mend: 128² seed 3 a block of 8 tiles four levels over the
  // floor, seed 5 two 2 × 2 cubes on the map's edge, seed 11 one of 9 tiles three over)
  for (const seed of [3, 5, 11])
    it(`leaves no knob or pit on the dry side of 128² seed ${seed}'s land`, () => {
      const s = makeSpec({ seed, size: { x: 128, y: 128 }, theme: "any", premise: "any" });
      const r = firstWater(wallGate, s);
      if ("reason" in r) throw new Error(r.reason);
      const land = gateLand(r.plan, r.water);
      const marks: { rise?: [number, number]; riseR?: number } = {};
      gateRelief(r.plan, r.water, undefined, [], marks);
      const own = dryFlat(r.plan, r.water, land.niches, marks);
      expect(flatKnobs(land.heights, r.plan.W, r.plan.H, own)).toEqual([]);
      expect(flatPits(land.heights, r.plan.W, r.plan.H, own)).toEqual([]);
    });
});
