// Time to an editable map (PLAN §20 D329, amending D278 (1a)): the first candidate that passes the
// absolutes is the map, never swapped; a map that misses an outcome that matters gets a background
// search for a version meeting all three (src/core/gen/versions.ts), each version a sibling with its
// own share link.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { findVersion, missesOf, notifies, siblingSpec, versionNote, worthSearching } from "../../src/core/gen/versions";
import { encodeSpecFragment, decodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

describe("the first map that passes is the map (D329)", () => {
  it("generate returns its first passing candidate, whatever its outcomes", () => {
    const r = generate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 96, y: 96 } }));
    expect(r.report.passed).toBe(true);
    // (no attempt after a passing one: every failure listed came before it)
    expect(r.failures.length).toBe(r.attempts - 1);
    expect(r.outcomes).toBeDefined();
  });

  it("which misses start a search, which get a note (D333 (5): only a missed promise), and what it says", () => {
    expect(worthSearching({ promise: true, water: false, standout: false })).toBe(true);
    expect(worthSearching({ promise: false, water: true, standout: false })).toBe(true);
    expect(worthSearching({ promise: false, water: false, standout: true })).toBe(false);
    expect(notifies({ promise: true, water: false, standout: false })).toBe(true);
    expect(notifies({ promise: true, water: true, standout: false })).toBe(true);
    expect(notifies({ promise: false, water: true, standout: false })).toBe(false);
    expect(notifies({ promise: false, water: false, standout: true })).toBe(false);
    expect(versionNote("islands", { promise: true, water: false, standout: false })).toBe("A version with its sea is ready");
    expect(versionNote("riverValley", { promise: true, water: true, standout: false })).toBe("A version with its broad valley and clearer water is ready");
    expect(versionNote("any", { promise: false, water: true, standout: false })).toBe("A version with water you can follow is ready");
  });

  it("the background search finds a sibling that meets all three, with its own share link", () => {
    // (River Valley 96² seed 1 since D333's maps: seed 4's six siblings met all three on none; seed 2 since M9b's small starts and speed rounds, where seed 1's first map meets all three and needs no search, D148)
    const r = generate(makeSpec({ seed: 2, theme: "riverValley", size: { x: 96, y: 96 } }));
    const m = missesOf(r.outcomes!);
    expect(worthSearching(m)).toBe(true);
    const v = findVersion({ spec: r.spec, intentions: r.info.genome?.intentions ?? [], heights: r.built.heights });
    expect(v.result).not.toBeNull();
    const found = v.result!;
    expect(found.report.passed).toBe(true);
    expect(found.outcomes!.met).toBe(true);
    expect(found.spec.variation).toBeGreaterThan(0);
    // its link opens the same map
    const back = decodeSpecFragment(encodeSpecFragment(found.spec))!.spec;
    const again = generate(back);
    expect(Array.from(again.bytes)).toEqual(Array.from(found.bytes));
    // and a sibling spec keeps the seed, theme and settings
    const s = siblingSpec(r.spec, 3, ["under-cliff"]);
    expect(s.seed).toBe(r.spec.seed);
    expect(s.settings).toEqual(r.spec.settings);
    expect(s.accepted).toBeUndefined();
  });
});
