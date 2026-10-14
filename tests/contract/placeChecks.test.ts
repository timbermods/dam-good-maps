// A real place's checks tell the truth (D245, D331, PERFECT "Real places"): opened from Real places, a
// place is a map we made and the player gets, so its problems are never set apart as "in the map when you
// opened it". A missed absolute (the starting-logs floor, the water floor, water that keeps moving) is a
// warning the dot counts; a load problem blocks; every other row is information, worded as a fact. The
// same file opened as a plain import keeps D3's rule (its own problems listed apart).

import { describe, expect, it } from "vitest";
import { groupChecks, informationMessage, PLACE_WARNING_CHECKS } from "../../src/core/doc/checkItems";
import { decodeProject, encodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { placeTimber } from "../../src/core/places/place";
import { makeSpec } from "../../src/core/spec/mapspec";
import { INDEX, placeData } from "./placesCommon";

const built = new Map<string, { bytes: Uint8Array; name: string; id: string }>();
function opened(id: string, asPlace: boolean) {
  if (!built.has(id)) {
    const data = placeData(INDEX.places.find((p) => p.id === id)!);
    built.set(id, { bytes: placeTimber(data).bytes, name: `${data.name}.timber`, id: data.id });
  }
  const b = built.get(id)!;
  const s = MapSession.importMap(b.bytes, b.name, asPlace ? b.id : undefined);
  const v = s.validate("export");
  return { s, v, groups: groupChecks(s, v, v) };
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

  it("a place whose start reaches no clean water warns, once", () => {
    const { groups } = opened("near-drumheller", true);
    expect(groups.warnings.map((c) => c.id)).toContain("start.water");
    expect(groups.advisory.map((c) => c.id)).not.toContain("water.storage_possible");
    expect(groups.existing).toEqual([]);
  });

  it("its information rows read as facts, without a target that reads failed", () => {
    const { groups } = opened("near-aso-caldera", true);
    for (const c of groups.advisory) expect(c.message).not.toMatch(/at least|aim for|needed|allows/);
    expect(informationMessage("0 of 0 mine sites reachable from the start, at least 2 needed")).toBe("No mine sites");
    expect(informationMessage("124 logs within 20 tiles' walk of the start, all pine (at least 200)")).toBe("124 logs within 20 tiles' walk of the start, all pine");
  });

  it("a place meeting the floors has no warnings; its other failing rows are information", () => {
    const { v, groups } = opened("near-tagliamento-river", true);
    expect(groups.blocking).toEqual([]);
    expect(groups.warnings).toEqual([]);
    expect(groups.existing).toEqual([]);
    const other = v.report.checks.filter((c) => !c.ok && c.applicable !== false && c.class !== "load" && !PLACE_WARNING_CHECKS.has(c.id)).map((c) => c.id);
    expect(other.length).toBeGreaterThan(0);
    expect(groups.advisory.map((c) => c.id).sort()).toEqual(other.sort());
  });

  it("a load problem blocks a place: its start taken away", () => {
    const { s } = opened("near-tagliamento-river", true);
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    expect(s.apply({ op: "deleteEntities", params: { entities: [start.id] } }).ok).toBe(true);
    const v = s.validate("export", { loadOnly: true });
    expect(groupChecks(s, v, null).blocking.map((c) => c.id)).toContain("start.count");
  });

  it("the same file opened as a plain import lists its own problems apart (D3)", () => {
    const { groups } = opened("near-aso-caldera", false);
    expect(groups.existing.map((c) => c.id)).toContain("start.wood_floor");
    expect(groups.warnings).toEqual([]);
  });

  it("a place stays a place when saved and reopened; a map generated afterwards is not one", () => {
    const { s } = opened("near-tagliamento-river", true);
    expect(MapSession.open(decodeProject(encodeProject(s.document))).meta.place).toBe("near-tagliamento-river");
    const r = generate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 96, y: 96 } }));
    expect(MapSession.fromGenerated(r, r.file).meta.place).toBeUndefined();
  });
});
