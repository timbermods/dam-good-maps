// A setting at an ordinary value that makes no map (PLAN §7.8, D278: the generator makes candidates
// until one passes the absolutes, within the attempts; a map that passes none is shown failing, with
// no file; the page says "No valid map after N attempts. Try another seed."). Lake Basin at 96² fails
// outright at settings a player can pick from the panel: Rivers 3 on 4 of seeds 1–20 (1, 9, 17, 18;
// seed 1 uses every attempt and free draw, 40 in all) and Buildable land: Tight on 1 of 20 (seed 3,
// stuck after 18). At the preset settings, 0 of 140 maps at 96² failed.
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
