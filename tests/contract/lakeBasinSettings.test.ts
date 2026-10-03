// Every Lake Basin setting makes a map (Kyler, 2026-10-03; PLAN §7.8, D278: the generator makes
// candidates until one passes the absolutes, within the attempts). Lake Basin at 96² failed outright
// at settings a player picks from the panel while round 2's shaping ran only on the preset: Rivers 3
// on 4 of seeds 1–20 (1, 9, 17, 18) and Buildable land: Tight on seed 3 (the release-gate generator
// hunt's finding 2).
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment } from "../../src/core/spec/mapspec";

describe("Lake Basin 96² at panel settings makes a map", () => {
  for (const frag of ["s=1&t=lakeBasin&z=96&rv=3", "s=3&t=lakeBasin&z=96&bl=t"])
    it(`${frag} passes within the attempts`, () => {
      const r = generate(decodeSpecFragment(frag)!.spec);
      expect(r.report.passed, `${r.attempts} attempts; last failed: ${r.report.checks.filter((c) => !c.ok).map((c) => c.id).join(", ")}`).toBe(true);
      expect(r.bytes.length).toBeGreaterThan(0);
    });
});
