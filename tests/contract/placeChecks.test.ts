// A real place's checks tell the truth (D245, D331, PERFECT "Real places"): opened from Real places, a
// place is a map we made and the player gets, so its problems are never set apart as "in the map when you
// opened it". A missed absolute (the starting-logs floor, the water floor) is a warning the dot counts;
// a load problem blocks; every other row is information. The same file opened as a plain import keeps
// D3's rule (its own problems listed apart).

import { describe, expect, it } from "vitest";
import { groupChecks } from "../../src/core/doc/checkItems";
import { MapSession } from "../../src/core/doc/session";
import { placeTimber } from "../../src/core/places/place";
import { INDEX, placeData } from "./placesCommon";

function opened(id: string, asPlace: boolean) {
  const entry = INDEX.places.find((p) => p.id === id)!;
  const data = placeData(entry);
  const s = MapSession.importMap(placeTimber(data).bytes, `${data.name}.timber`, asPlace ? data.id : undefined);
  const v = s.validate("export");
  return { s, groups: groupChecks(s, v, v) };
}

describe("a real place's check summary", () => {
  it("a place under the starting-logs floor is not 'all pass': the floor is a warning", () => {
    const { s, groups } = opened("near-aso-caldera", true);
    expect(s.meta.place).toBe("near-aso-caldera");
    expect(groups.warnings.map((c) => c.id)).toContain("start.wood_floor");
    expect(groups.existing).toEqual([]);
    // (the difficulty's own wood target is information on a place)
    expect(groups.warnings.map((c) => c.id)).not.toContain("start.wood");
  });

  it("a place whose start reaches no clean water warns", () => {
    const { groups } = opened("near-drumheller", true);
    expect(groups.warnings.map((c) => c.id)).toContain("start.water");
    expect(groups.existing).toEqual([]);
  });

  it("a place meeting the floors has no warnings; its other rows are information", () => {
    const { groups } = opened("near-tagliamento-river", true);
    expect(groups.blocking).toEqual([]);
    expect(groups.warnings).toEqual([]);
    expect(groups.existing).toEqual([]);
  });

  it("the same file opened as a plain import lists its own problems apart (D3)", () => {
    const { groups } = opened("near-aso-caldera", false);
    expect(groups.existing.map((c) => c.id)).toContain("start.wood_floor");
    expect(groups.warnings).toEqual([]);
  });
});
