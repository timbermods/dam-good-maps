// Real places: the water follows the real place (Kyler, 2026-09-27, PLAN §20 D271). The conversion
// (tools/places/convert.ts `beginnings`) puts sources only where ESA WorldCover's permanent water
// is (tools/places/worldcover.ts), so dry land stays dry: a river where one is observed, a lake's
// spring fed with what the lake evaporates, and none for the sea or dry land.

import { describe, expect, it } from "vitest";
import { beginnings, LAKE_FEED } from "../../tools/places/convert";
import { quantise } from "../../tools/places/hydro";
import { tileName } from "../../tools/places/worldcover";

const SIZE = 48;
const HALO = 32;
const W = SIZE + 2 * HALO;

/** A patch (its halo included): land falling north to south, `valley` metres deep along x = 24 (a
 *  river's valley), and `bowl` a basin in the middle. */
function patch({ valley = 0, bowl = 0 }: { valley?: number; bowl?: number }): Float32Array {
  const raw = new Float32Array(W * W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const mx = x - HALO;
      const my = y - HALO;
      let z = 200 + y * 2 + Math.abs(mx - 24) * 1.5;
      if (valley) z -= Math.max(0, valley - Math.abs(mx - 24) * 4);
      const r = Math.hypot(mx - 24, my - 24);
      if (bowl && r < 10) z = Math.min(z, 200 + 24 * 2 - bowl + r);
      raw[y * W + x] = z;
    }
  return raw;
}

const heights = (raw: Float32Array) => {
  const c = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) c[y * SIZE + x] = raw[(y + HALO) * W + x + HALO];
  return quantise(c, "normalised", 16);
};

const observed = (wet: (x: number, y: number) => boolean) => {
  const obs = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (wet(x - HALO, y - HALO)) obs[y * W + x] = 1;
  return obs;
};

describe("the water follows the real place (D271)", () => {
  it("dry land stays dry: no observed water, no source", () => {
    const raw = patch({ valley: 20 });
    const { groups } = beginnings(raw, new Float32Array(W * W), SIZE, heights(raw), 5);
    expect(groups).toEqual([]);
  });

  it("an observed river gets a source where it comes in, and only there", () => {
    const raw = patch({ valley: 20 });
    const h = heights(raw);
    // the river runs down the valley, from the north edge to the south
    const obs = observed((x) => Math.abs(x - 24) <= 1);
    const { groups } = beginnings(raw, obs, SIZE, h, 5);
    expect(groups.length).toBe(1);
    expect(groups[0].lake).toBeUndefined();
    // a row across the river's mouth on the north edge (row 0 is the south edge), its flow all of it
    for (const t of groups[0].tiles) {
      expect(Math.floor(t / SIZE)).toBe(SIZE - 1);
      expect(Math.abs((t % SIZE) - 24)).toBeLessThanOrEqual(6);
    }
    expect(groups[0].share).toBeCloseTo(5);
  });

  it("an observed lake gets one spring in its middle that gives what it evaporates", () => {
    const raw = patch({ bowl: 30 });
    const h = heights(raw);
    // the lake's surface as the elevation data gives it: flat water in the bowl
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - HALO - 24, y - HALO - 24) < 7) raw[y * W + x] = 200 + 24 * 2 - 30 + 7;
    const obs = observed((x, y) => Math.hypot(x - 24, y - 24) < 7);
    const { groups } = beginnings(raw, obs, SIZE, heights(raw), 5);
    expect(h.length).toBe(SIZE * SIZE);
    expect(groups.length).toBe(1);
    expect(groups[0].lake).toBe(true);
    expect(groups[0].tiles.length).toBe(1);
    const t = groups[0].tiles[0];
    expect(Math.hypot((t % SIZE) - 24, Math.floor(t / SIZE) - 24)).toBeLessThanOrEqual(2);
    let area = 0;
    for (let i = 0; i < obs.length; i++) area += obs[i] && Math.hypot((i % W) - HALO - 24, Math.floor(i / W) - HALO - 24) < 7 ? 1 : 0;
    expect(groups[0].share).toBeCloseTo(LAKE_FEED * area);
  });

  it("the sea gets no source: the land has no rim to hold it", () => {
    const raw = patch({});
    // the south third is the sea: 0 m, observed water, touching the edge
    for (let y = 0; y < HALO + 16; y++) for (let x = 0; x < W; x++) raw[y * W + x] = 0;
    const obs = observed((_x, y) => y < 16);
    const { groups, sea } = beginnings(raw, obs, SIZE, heights(raw), 5);
    expect(groups).toEqual([]);
    expect(sea).toBe(1);
  });

  it("names WorldCover's tiles by their south-west corner, 3 degrees a side", () => {
    expect(tileName(36.1, -112.1)).toBe("ESA_WorldCover_10m_2021_v200_N36W114_Map.tif");
    expect(tileName(-3.2, 35.5)).toBe("ESA_WorldCover_10m_2021_v200_S06E033_Map.tif");
    expect(tileName(62.1, 7.1)).toBe("ESA_WorldCover_10m_2021_v200_N60E006_Map.tif");
  });
});
