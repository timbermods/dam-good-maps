// The first land shown is the map (PLAN §20 D348, clarifying D329 (1) and D333 (2)): a land is never
// shown and then replaced. What needs the settled water is fixed on it (the start where the plan put
// it, a spring by the start) or planned again on it, never by drawing new land.
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

// maps whose land was shown and then replaced before D348 (no place for a start on the settled
// water, the start's water gone, a check on the start), measured at 128² on 2026-09-29
const CASES: [ThemeId, number][] = [
  ["highlands", 3],
  ["any", 4],
  ["islands", 7],
  ["highlands", 7],
];

describe("a shown land is never replaced (D348)", () => {
  it.each(CASES)("%s 128² seed %i: one land shown, and the map is that land", (theme, seed) => {
    const shown: Uint8Array[] = [];
    const r = generate(makeSpec({ seed, theme, size: { x: 128, y: 128 } }), { onLand: (l) => shown.push(l.heights.slice()) });
    expect(shown.length).toBe(1);
    expect(r.info.lands).toBe(1);
    expect(r.report.passed).toBe(true);
    // the finished ground is the land shown but for the start's pad and the badwater hollows
    let changed = 0;
    for (let i = 0; i < shown[0].length; i++) if (shown[0][i] !== r.built.heights[i]) changed++;
    expect(changed).toBeLessThan(0.02 * shown[0].length);
  });
});
