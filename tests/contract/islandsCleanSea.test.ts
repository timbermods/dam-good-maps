// Islands' sea reads as sea at 96² and 128² (#446, D498): no more than 1% of it at 5% badwater or more, as it
// settled and, on a map whose badwater ditch runs past the sea to the edge, after 10 more days of the game's water.
// 256² is in islandsCleanSea.heavy.test.ts.
import { describe, expect, it } from "vitest";
import { islandsSea } from "./islandsCleanSea";

describe("Islands' sea is clean water (D498)", () => {
  // (128² seed 7 is the map #446 found mostly 10–20% badwater; seed 16's ditch runs beside the sea to the edge)
  it.each([
    [96, 1],
    [96, 7],
    [128, 7],
  ])("at %i² seed %i, as it settled", (size, seed) => {
    const { settled, sources } = islandsSea(seed, size);
    expect(sources).toBeGreaterThan(0);
    expect(settled.tiles).toBeGreaterThan(0.2 * size * size);
    expect(settled.bad).toBeLessThanOrEqual(0.01);
  });

  it("at 128² seed 16, where the ditch runs past the sea, as it settled and after 10 days of play", () => {
    const { settled, played, sources } = islandsSea(16, 128, [10]);
    expect(sources).toBeGreaterThan(0);
    expect(settled.bad).toBeLessThanOrEqual(0.01);
    expect(played[0].bad).toBeLessThanOrEqual(0.01);
  });
});
