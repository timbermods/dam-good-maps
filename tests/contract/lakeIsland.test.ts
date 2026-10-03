// An island in a lake can hold objects (D369 (2), from Codex's Islands prototype): the object planner
// kept off every tile inside a lake's outline, so dry land standing above the lake (an island) could
// hold no mine site or other object. Only the lake's bed, the outline's tiles at or under its water
// level, is kept off now; every placement rule still holds on the island.
import { describe, expect, it } from "vitest";
import type { LakeFeature } from "../../src/core/features/schema";
import { footprintTiles, type Orientation } from "../../src/core/format/footprints";
import { fitProblems } from "../../src/core/features/objects";
import { planExtras } from "../../src/core/gen/extras";
import type { BuildResult } from "../../src/core/features/build";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;
const H = 96;
const N = W * H;

/** Rugged land at 6 (knolls a level over it every few tiles: no level ground for a site), a lake in
 *  the middle (its bed at 3, its water to its sill at 5) and an island in it, level, at 8. */
function ground() {
  const heights = new Uint8Array(N);
  const water = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 6 + ((2 * x + 3 * y) % 5 === 0 ? 1 : 0);
  for (let y = 30; y <= 80; y++)
    for (let x = 30; x <= 80; x++) {
      const i = y * W + x;
      const island = x >= 46 && x <= 64 && y >= 46 && y <= 64;
      heights[i] = island ? 8 : 3;
      if (!island) water[i] = 2;
    }
  const lake: LakeFeature = {
    id: "lake-1",
    kind: "lake",
    origin: "generated",
    locked: false,
    params: { outline: [[29.5, 29.5], [80.5, 29.5], [80.5, 80.5], [29.5, 80.5]], floorDepth: 1, outlet: { at: [80, 55], sill: 5, to: "none" }, inflow: { spring: 1 } },
  } as unknown as LakeFeature;
  const base = {
    W,
    H,
    heights,
    water,
    contamination: new Float64Array(N),
    moisture: new Float64Array(N),
    channel: new Uint8Array(N),
    occupied: new Uint8Array(N),
    cache: { terrain: { protect: new Uint8Array(N) } },
    start: { x: 12, y: 12 },
    entities: [],
  } as unknown as BuildResult;
  return { base, lake };
}

describe("an island in a lake", () => {
  it("can hold a mine site that meets every placement rule", () => {
    const { base, lake } = ground();
    const objects = planExtras({ spec: makeSpec({ seed: 1, theme: "islands", size: { x: W, y: H } }), base, features: [lake], candidate: 0, attempt: 0 });
    const mines = objects.filter((o) => o.params.kind === "mineSite");
    expect(mines.length).toBeGreaterThan(0);
    for (const m of mines) {
      const p = m.params.placement as { x: number; y: number; orientation: Orientation };
      const tiles = footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: p.x, y: p.y, z: 0, orientation: p.orientation, flipped: false }) as [number, number][];
      // (on the island, and every rule of the placement holds there)
      for (const [x, y] of tiles) expect(base.heights[y * W + x]).toBe(8);
      expect(fitProblems("mineSite", tiles, { W, H, heights: base.heights, water: base.water, channel: base.channel, occupied: base.occupied })).toEqual([]);
    }
  });
});
