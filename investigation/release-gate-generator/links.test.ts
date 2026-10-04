// Share links the codec accepts but the generator cannot use (PLAN §14.5: "decoding never throws; a
// value it cannot use is reported in `problems` and the preset's value stays, so a mistyped link still
// opens a map"; D342: an invalid request is rejected with a reason, never silently changed).
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment, encodeSpecFragment } from "../../src/core/spec/mapspec";

describe("share links the codec passes on that the generator cannot use", () => {
  it("a link asking for two colonies (c=2t) is reported as a problem and still opens a map, instead of throwing", () => {
    const d = decodeSpecFragment("s=5&t=riverValley&z=96&c=2t")!;
    // today: no problem reported, the spec passes the schema, and generate throws
    // "multi-colony (Timber Together) maps are not built yet"
    expect(() => generate(d.spec)).not.toThrow();
    expect(d.problems.some((p) => /colon/i.test(p))).toBe(true);
  });

  it("a link with intentions that do not exist is refused with a reason, not silently made into a map steered toward none", () => {
    // another.test.ts checks a link with a capital letter is refused: that is the schema's pattern.
    // Lowercase names the set does not hold pass, generate drops them, the map keeps no intention, and
    // the map's own share link carries the bad names on.
    const d = decodeSpecFragment("s=5&t=riverValley&z=96&vr=2&in=not-an-intention.also-bad")!;
    expect(d.problems.some((p) => /intentions/.test(p))).toBe(true);
    expect(d.spec.intentions).toBeUndefined();
    expect(encodeSpecFragment(generate(d.spec).spec)).not.toMatch(/not-an-intention/);
  });
});
