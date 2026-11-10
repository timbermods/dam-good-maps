// Islands' sea reads as sea at 96² (#446, D498): no more than 1% of it at 5% badwater or more, as it settled.
// 128² (#446's seed 7; seed 16, whose ditch runs past the sea to the edge, played on) and 256² are in
// islandsCleanSea.heavy.test.ts.
import { describe, expect, it } from "vitest";
import { islandsSea } from "./islandsCleanSea";

describe("Islands' sea is clean water (D498)", () => {
  it.each([1, 7])("at 96² seed %i, as it settled", (seed) => {
    const { settled, sources } = islandsSea(seed, 96);
    expect(sources).toBeGreaterThan(0);
    expect(settled.tiles).toBeGreaterThan(0.2 * 96 * 96);
    expect(settled.bad).toBeLessThanOrEqual(0.01);
  });
});
