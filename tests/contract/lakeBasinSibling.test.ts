// Another like this (PLAN §20 D278 (1c)): a sibling keeps the map's theme, settings and intentions and
// grows different land, and a Lake Basin map looks like a Lake Basin whatever its settings, intentions
// or siblings (Kyler, 2026-10-03): round 2's shaping (`shapeLakeBasin`, D453, D458) applies to every
// Lake Basin map. While it ran only on a spec with no intentions, half the siblings missed the promise
// and seed 7's made no map (the release-gate generator hunt's finding 1).
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

function sibling(seed: number): { map: ReturnType<typeof generate>; sib: ReturnType<typeof generate> } {
  const spec = makeSpec({ seed, theme: "lakeBasin", size: { x: 96, y: 96 } });
  const map = generate(spec);
  const sib: MapSpec = { ...spec, variation: 1, intentions: map.info.genome?.intentions ?? [] };
  return { map, sib: generate(sib) };
}

describe("Another like this on a Lake Basin map (D278 (1c))", () => {
  it("Lake Basin 96² seed 7: the first sibling makes a map", () => {
    const { map, sib } = sibling(7);
    expect(map.report.passed).toBe(true);
    expect(sib.report.passed, `${sib.attempts} attempts; ${sib.report.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")}`).toBe(true);
  });

  it("Lake Basin 96² seeds 1–12: the siblings keep the theme's promise about as often as the maps do (12 of 12; at least 10)", () => {
    const kept: number[] = [];
    const missed: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { map, sib } = sibling(seed);
      expect(map.outcomes?.promise, `seed ${seed}'s map`).toBe(true);
      (sib.outcomes?.promise ? kept : missed).push(seed);
    }
    // (10 of 12 with round 2 on every Lake Basin map, 5 and 12 missing, as River Valley's siblings keep
    // theirs on 10 of 12; 6 of 12 while round 2 ran on the preset path only; 12 of 12 since #265 reads a
    // lake as it holds water, where the settled lake stands wider than the lake planned)
    expect(kept.length, `siblings missing the promise: ${missed.join(", ")}`).toBeGreaterThanOrEqual(10);
  }, 1_200_000);
});
