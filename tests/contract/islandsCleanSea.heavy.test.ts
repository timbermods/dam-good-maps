// Islands' sea reads as sea at 128² and 256² (#446, D498): no more than 1% of it at 5% badwater or more, as it
// settled and after 10 more days of the game's water. 96² is in islandsCleanSea.test.ts.
import { describe, expect, it } from "vitest";
import { islandsSea } from "./islandsCleanSea";

describe("Islands' sea is clean water at 128² and 256² (D498)", () => {
  // (128² seed 7 is the map #446 found mostly 10–20% badwater; seed 16's ditch runs beside the sea to the edge)
  it.each([
    [128, 7],
    [128, 16],
    [256, 1],
    [256, 3],
  ])("at %i² seed %i, as it settled and after 10 days of play", (size, seed) => {
    const { settled, played, sources } = islandsSea(seed, size, [10]);
    expect(sources).toBeGreaterThan(0);
    expect(settled.tiles).toBeGreaterThan(0.2 * size * size);
    expect(settled.bad).toBeLessThanOrEqual(0.01);
    expect(played[0].bad).toBeLessThanOrEqual(0.01);
  });
});
