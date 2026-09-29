// The map card (docs/UI-BRIEF.md §3, PLAN §20 D330): the legend only for what's on this map, with
// counts; hover highlights, click pins; the numbers from M9b's `walkReach` and `levers` (D325); a
// real place with its signature and credits instead of a seed. The component is exercised in
// tests/e2e/page-parts.spec.ts.

import { describe, expect, it } from "vitest";
import {
  generatedCard,
  highlighted,
  legendFocus,
  legendItems,
  legendTiles,
  leverDetail,
  leverGrade,
  leverMarks,
  originText,
  placeCard,
  reachText,
  type CardEntity,
  type LegendFocus,
} from "../../src/page/card/cardModel";

const e = (template: string, x = 0, y = 0, extra: Partial<CardEntity> = {}): CardEntity => ({ template, x, y, orientation: "Cw0", ...extra });

describe("the legend row", () => {
  const ents = [e("WaterSource", 1, 1), e("WaterSource", 2, 1), e("BadwaterSource", 9, 9), e("UndergroundRuins", 20, 20), e("RuinColumnH3", 5, 5), e("RuinColumnH1", 6, 5), e("Pine", 3, 3), e("Oak", 4, 3), e("Birch", 5, 3, { dead: true }), e("BlueberryBush", 7, 7), e("StartingLocation", 10, 10), e("LargeRelic", 30, 30)];

  it("lists only what's on the map, in order, with counts, and never the start", () => {
    expect(legendItems(ents)).toEqual([
      { key: "source", name: "Water sources", count: 2 },
      { key: "badSource", name: "Badwater source", count: 1 },
      { key: "mine", name: "Mine site", count: 1 },
      { key: "ruin", name: "Ruins", count: 2 },
      { key: "berries", name: "Berry bush", count: 1 },
      { key: "trees", name: "Trees", count: 2 },
      { key: "deadTrees", name: "Dead tree", count: 1 },
      { key: "relic", name: "Relic", count: 1 },
    ]);
    expect(legendItems([])).toEqual([]);
  });

  it("points to each thing's tiles on the land, footprints included", () => {
    expect(legendTiles(ents, "source", 64, 64)).toEqual([
      [1, 1],
      [2, 1],
    ]);
    // a mine site covers more than its corner tile
    expect(legendTiles(ents, "mine", 64, 64).length).toBeGreaterThan(1);
    // nothing off the map
    expect(legendTiles([e("WaterSource", 70, 1)], "source", 64, 64)).toEqual([]);
  });

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

describe("the numbers line", () => {
  it("trees within walking reach, with their logs", () => {
    expect(reachText({ trees: 182, logs: 1640, farmland: 0, level: 0 })).toBe("182 trees in reach, 1,640 logs");
    expect(reachText({ trees: 1, logs: 8, farmland: 0, level: 0 })).toBe("1 tree in reach, 8 logs");
  });

  it("the five levers as marks, in order, with detail on hover", () => {
    const marks = leverMarks({ farmland: 320, metal: 30, badwater: 12, shelter: 6, buildable: 150 });
    expect(marks.map((m) => [m.key, m.grade])).toEqual([
      ["farmland", "easier"],
      ["metal", "middling"],
      ["badwater", "harder"],
      ["shelter", "easier"],
      ["buildable", "harder"],
    ]);
    expect(marks[2].detail).toBe("Badwater: harder. The nearest badwater is 12 tiles from the start.");
  });

  it("reads a missing metal or dam as harder, and no badwater as easier", () => {
    expect(leverGrade("metal", null)).toBe("harder");
    expect(leverGrade("shelter", null)).toBe("harder");
    expect(leverGrade("badwater", null)).toBe("easier");
    expect(leverDetail("shelter", null)).toBe("Shelter from a badtide: harder. No dam near the start holds the drought's water.");
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
