// The map card's own view state (docs/UI-BRIEF.md §3, PLAN §20 D330): hover highlights, a click pins;
// a generated map shows its seed, a real place its signature and credits instead. The questions the
// card shows are core functions (tests/contract/cardNumbers.test.ts).

import { describe, expect, it } from "vitest";
import { generatedCard, highlighted, legendFocus, originText, placeCard, type LegendFocus } from "../../src/page/card/cardModel";

describe("the legend's highlight", () => {
  it("highlights while hovered, pins on a click, returns to the pin when the pointer leaves", () => {
    let f: LegendFocus = { hover: null, pinned: null };
    f = legendFocus(f, { type: "enter", key: "mine" });
    expect(highlighted(f)).toBe("mine");
    f = legendFocus(f, { type: "leave" });
    expect(highlighted(f)).toBe(null);
    f = legendFocus(f, { type: "click", key: "ruin" });
    expect(f.pinned).toBe("ruin");
    f = legendFocus(f, { type: "enter", key: "source" });
    expect(highlighted(f)).toBe("source");
    f = legendFocus(f, { type: "leave" });
    expect(highlighted(f)).toBe("ruin");
    // clicking the pinned one again drops the pin; Esc clears it
    f = legendFocus(f, { type: "click", key: "ruin" });
    expect(f.pinned).toBe(null);
    f = legendFocus(legendFocus(f, { type: "click", key: "trees" }), { type: "clear" });
    expect(highlighted(f)).toBe(null);
  });
});

describe("the card's origin", () => {
  it("a generated map shows its seed", () => {
    const c = generatedCard({ name: "Willow Bend", premise: "A river winds.", spec: { seed: 7 }, W: 128, H: 128, entities: [] });
    expect(c.origin).toEqual({ kind: "generated", seed: 7, W: 128, H: 128 });
    expect(originText(c.origin)).toBe("128×128 · seed 7");
    expect(c.walkReach).toBe(null);
    expect(c.levers).toBe(null);
  });
  it("a real place shows its signature and credits instead", () => {
    const c = placeCard({ name: "Near Yosemite Valley", plays: "A deep valley.", W: 128, H: 128, signature: "Granite walls" }, { entities: [] }, { text: "Elevation data: Terrain Tiles" });
    expect(c.origin.kind).toBe("place");
    expect(originText(c.origin)).toBe("128×128");
    expect(c.origin.kind === "place" && c.origin.signature).toBe("Granite walls");
  });
});
