// Another like this (M9b; PLAN §20 D278 (1c), D143): a sibling keeps the map's theme, settings and
// intentions, grows different land, has its own share link, and is never a clone.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sameLand } from "../../src/core/analysis/story";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment, encodeSpecFragment, makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("Another like this (D278 (1c))", () => {
  it("keeps the theme, settings and intentions, grows different land, and its link reproduces it", () => {
    const spec = makeSpec({ seed: 31, theme: "riverValley", size: { x: 96, y: 96 } });
    const r = generate(spec);
    expect(r.report.passed).toBe(true);
    const drawn = r.info.genome?.intentions ?? [];
    expect(drawn.length).toBeGreaterThan(0);
    const sib: MapSpec = { ...spec, variation: 1, intentions: drawn };
    const s = generate(sib);
    expect(s.report.passed).toBe(true);
    // the same theme, settings and intentions
    expect(s.spec.theme).toBe(spec.theme);
    expect(s.spec.settings).toEqual(spec.settings);
    expect(s.info.genome?.intentions).toEqual(drawn);
    // different land, not a clone of the map it came from
    expect(sameLand(r.built.heights, s.built.heights)).toBe(false);
    // its own share link carries the sibling and reproduces its file
    const frag = encodeSpecFragment(sib);
    expect(frag).toMatch(/(^|&)vr=1(&|$)/);
    expect(frag).toMatch(/(^|&)in=/);
    const d = decodeSpecFragment(frag)!;
    expect(d.problems).toEqual([]);
    expect(d.spec.variation).toBe(1);
    expect(d.spec.intentions).toEqual(drawn);
    expect(sha(generate(d.spec).bytes)).toBe(sha(s.bytes));
  });

  it("a link with intentions the set does not hold is refused, not guessed", () => {
    const frag = encodeSpecFragment(makeSpec({ seed: 31, theme: "riverValley", size: { x: 96, y: 96 } })) + "&vr=2&in=not-an-intention.Also-bad";
    const d = decodeSpecFragment(frag)!;
    expect(d.spec.variation).toBe(2);
    expect(d.problems.some((p) => /intentions/.test(p))).toBe(true);
    expect(d.spec.intentions).toBeUndefined();
  });
});
