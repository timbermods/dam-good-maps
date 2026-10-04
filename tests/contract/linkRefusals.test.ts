// Share links the codec must refuse with a word rather than pass on (PLAN §14.5: "decoding never
// throws; a value it cannot use is reported in `problems` and the preset's value stays, so a mistyped
// link still opens a map"; D342: an invalid request is rejected with a reason, never silently changed).
// The release-gate generator hunt's finding 5 (investigation/release-gate-generator).
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { INTENTIONS } from "../../src/core/land/intentions";
import { decodeSpecFragment, encodeSpecFragment } from "../../src/core/spec/mapspec";
import { MAPSPEC_SCHEMA } from "../../src/core/spec/schema";

describe("share links the codec passes on that the generator cannot use", () => {
  it("a link asking for two colonies (c=2t) is reported as a problem and still opens a map, instead of throwing", () => {
    const d = decodeSpecFragment("s=5&t=riverValley&z=96&c=2t")!;
    expect(d.spec.colonies).toEqual({ count: 1, mod: "none" });
    expect(() => generate(d.spec)).not.toThrow();
    expect(d.problems.some((p) => /colon/i.test(p))).toBe(true);
  });

  it("a link with intentions that do not exist is refused with a reason, not silently made into a map steered toward none", () => {
    // (another.test.ts refuses a name with a capital letter; the schema lists the ids, so a lowercase
    // name the set does not hold is refused too, instead of being dropped silently and carried on)
    const d = decodeSpecFragment("s=5&t=riverValley&z=96&vr=2&in=not-an-intention.also-bad")!;
    expect(d.problems.some((p) => /intentions/.test(p))).toBe(true);
    expect(d.spec.intentions).toBeUndefined();
    expect(encodeSpecFragment(generate(d.spec).spec)).not.toMatch(/not-an-intention/);
  });

  it("the schema's intention ids are the generator's", () => {
    const items = (MAPSPEC_SCHEMA.properties as Record<string, { items: { enum: string[] } }>).intentions.items.enum;
    expect(items).toEqual([...INTENTIONS]);
  });
});
