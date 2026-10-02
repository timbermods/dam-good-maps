// The map card's questions (docs/UI-BRIEF.md §3; PLAN §20 D325, D330, D342): the legend row only for
// what's on this map, with counts, and the tiles each kind covers; trees within walking reach with
// their logs; the five difficulty levers as marks with their detail. The core directly (D342 (5));
// the card is exercised in tests/e2e/page-parts.spec.ts.

import { describe, expect, it } from "vitest";
import { legendItems, legendTiles, type LegendEntity } from "../../src/core/analysis/legend";
import { leverDetail, leverGrade, leverMarks, reachText } from "../../src/core/analysis/levers";

const e = (template: string, x = 0, y = 0, extra: Partial<LegendEntity> = {}): LegendEntity => ({ template, x, y, orientation: "Cw0", ...extra });

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
