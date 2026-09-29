// The candidates strip (docs/UI-BRIEF.md §5, PLAN §20 D329, D330): generated maps only, otherwise
// empty; the background version goes in with its note, never swapped in; More's siblings appear as
// they finish; a new map starts it over. The core's state directly (D342 (5)); the row is exercised in
// tests/e2e/page-parts.spec.ts.

import { describe, expect, it } from "vitest";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";
import { candidateId, EMPTY_STRIP, nextVariation, strip, stripShown, type CandidateMap, type StripState } from "../../src/core/library/strip";

const spec = makeSpec({ seed: 7, theme: "islands", size: { x: 128, y: 128 } });
const sib = (variation: number): CandidateMap => ({ spec: { ...spec, variation } as MapSpec, name: `v${variation}`, premise: "", W: 4, H: 4, heights: new Uint8Array(16), water: null });
const offer = { misses: { promise: true, water: false, standout: false }, note: "A version with its sea is ready" };

describe("the strip", () => {
  it("shows only for a generated map, and is empty at first", () => {
    const s = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer: null });
    expect(stripShown(s)).toBe(true);
    expect(s.items).toEqual([]);
    expect(s.searching).toBe(false);
    expect(stripShown(strip(s, { type: "shown", map: null, generated: false, offer: null }))).toBe(false);
  });

  it("takes the background version with its note, first in the row", () => {
    let s = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer });
    expect(s.searching).toBe(true);
    s = strip(s, { type: "more" });
    s = strip(s, { type: "sibling", forMap: s.forMap!, map: sib(5) });
    s = strip(s, { type: "version", forMap: s.forMap!, map: sib(2), note: offer.note });
    expect(s.searching).toBe(false);
    expect(s.items.map((i) => [i.kind, i.map.name])).toEqual([
      ["version", "v2"],
      ["sibling", "v5"],
    ]);
    expect(s.notice).toBe("A version with its sea is ready");
    expect(strip(s, { type: "noticeSeen" }).notice).toBe(null);
  });

  it("keeps a version quietly when it has no note, and nothing when none was found", () => {
    let s = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer: { ...offer, note: null } });
    s = strip(s, { type: "version", forMap: s.forMap!, map: sib(1), note: null });
    expect(s.items.length).toBe(1);
    expect(s.notice).toBe(null);
    const none = strip(strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer }), { type: "version", forMap: candidateId(spec), map: null, note: null });
    expect(none.items).toEqual([]);
    expect(none.searching).toBe(false);
  });

  it("ignores a search or sibling for a map no longer shown", () => {
    const first = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer });
    const other = strip(first, { type: "shown", map: { spec: { ...spec, seed: 8 } }, generated: true, offer: null });
    expect(strip(other, { type: "version", forMap: first.forMap!, map: sib(1), note: "x" })).toBe(other);
    expect(strip(other, { type: "sibling", forMap: first.forMap!, map: sib(1) })).toBe(other);
  });

  it("counts More's siblings on their way, and drops a duplicate or failed one", () => {
    let s = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer: null });
    s = strip(strip(s, { type: "more" }), { type: "more" });
    expect(s.pending).toBe(2);
    s = strip(s, { type: "sibling", forMap: s.forMap!, map: sib(1) });
    s = strip(s, { type: "sibling", forMap: s.forMap!, map: sib(1) });
    expect(s.pending).toBe(0);
    expect(s.items.length).toBe(1);
    s = strip(strip(s, { type: "more" }), { type: "sibling", forMap: s.forMap!, map: null });
    expect(s.pending).toBe(0);
  });

  it("opening a candidate keeps the strip; the shown map never swaps by itself", () => {
    let s: StripState = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer: null });
    s = strip(strip(s, { type: "more" }), { type: "sibling", forMap: s.forMap!, map: sib(1) });
    const id = s.items[0].id;
    s = strip(s, { type: "open", id });
    expect(s.current).toBe(id);
    expect(s.items.length).toBe(1);
    // back to the first map
    expect(strip(s, { type: "open", id: s.forMap! }).current).toBe(null);
  });

  it("gives More the next variation past every one made", () => {
    let s = strip(EMPTY_STRIP, { type: "shown", map: { spec }, generated: true, offer: null });
    expect(nextVariation(spec, s)).toBe(1);
    s = strip(s, { type: "version", forMap: s.forMap!, map: sib(3), note: null });
    expect(nextVariation(spec, s)).toBe(4);
    s = strip(s, { type: "more" });
    expect(nextVariation(spec, s)).toBe(5);
  });

  it("tells a sibling from its map", () => {
    expect(candidateId(sib(1).spec)).not.toBe(candidateId(spec));
    expect(candidateId(sib(1).spec)).toBe(candidateId(sib(1).spec));
  });
});
