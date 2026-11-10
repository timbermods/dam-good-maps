// Islands' sea reads as sea at 256² (#446, D498): no more than 1% of it at 5% badwater or more, as it settled and
// after 10 more days of the game's water. 96² and 128² are in islandsCleanSea.test.ts.
import { describe, expect, it } from "vitest";
import { islandsSea } from "./islandsCleanSea";

describe("Islands' sea is clean water at 256² (D498)", () => {
  it.each([1, 3])("seed %i, as it settled and after 10 days of play", (seed) => {
    const { settled, played, sources } = islandsSea(seed, 256, [10]);
    expect(sources).toBeGreaterThan(0);
    expect(settled.tiles).toBeGreaterThan(0.2 * 256 * 256);
    expect(settled.bad).toBeLessThanOrEqual(0.01);
    expect(played[0].bad).toBeLessThanOrEqual(0.01);
  });
});
