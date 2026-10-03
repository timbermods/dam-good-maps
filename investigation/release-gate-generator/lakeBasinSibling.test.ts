// Another like this (PLAN §20 D278 (1c)): a sibling keeps the map's theme, settings and intentions and
// grows different land. Lake Basin's round-2 shaping (`shapeLakeBasin`, D453, D458) runs in
// gen/generate.ts only on a spec with no intentions, so every sibling of a Lake Basin map (and every
// version the candidates strip searches for) is shaped by the shared path instead: the promise the map
// kept is missed by half its siblings, and some make no map at all.
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

  it("Lake Basin 96² seeds 1–12: the siblings keep the theme's promise about as often as the maps do (12 of 12)", () => {
    const kept: number[] = [];
    const missed: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { map, sib } = sibling(seed);
      expect(map.outcomes?.promise, `seed ${seed}'s map`).toBe(true);
      (sib.outcomes?.promise ? kept : missed).push(seed);
    }
    // today: kept on 6 (3, 4, 5, 8, 11, 12), missed on 1, 2, 6, 9, 10 and seed 7's sibling fails
    expect(missed, `siblings missing the promise`).toEqual([]);
  }, 1_200_000);
});
