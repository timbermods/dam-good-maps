// The History's words and the checks list's rows (EDITOR_PLAN §3 and §6): one pattern for every
// operation's label, with correct articles and plurals and the Items list's names.

import { describe, expect, it } from "vitest";
import { labelOf } from "../../src/core/doc/session";
import { paintLabel } from "../../src/core/doc/paintOps";
import { itemName, placeLabel, plantLabel, tileCount, withArticle, pluralOf } from "../../src/core/doc/labels";
import { forceLabel } from "../../src/core/forces/op";
import { checkRows } from "../../src/core/doc/checkItems";
import type { MapSession } from "../../src/core/doc/session";
import type { CheckResult } from "../../src/core/validate/report";

type AppliedOp = Parameters<typeof labelOf>[0];
const op = (name: string, params: Record<string, unknown> = {}) => ({ op: name, params, seq: 1, origin: "user" }) as unknown as AppliedOp;

describe("labels read 'Verb the thing', with articles and plurals", () => {
  it("plurals and articles", () => {
    expect(pluralOf("birch")).toBe("birches");
    expect(pluralOf("berry bush")).toBe("berry bushes");
    expect(pluralOf("pine")).toBe("pines");
    expect(withArticle("oak")).toBe("an oak");
    expect(withArticle("pine")).toBe("a pine");
    expect(tileCount(1)).toBe("1 tile");
    expect(tileCount(2354)).toBe("2,354 tiles");
  });

  it("planting, singular and plural, in the Items list's names", () => {
    expect(plantLabel("Birch", 34)).toBe("Plant 34 birches");
    expect(plantLabel("Birch", 1)).toBe("Plant a birch");
    expect(plantLabel("Oak", 1)).toBe("Plant an oak");
    expect(plantLabel("Oak", 2)).toBe("Plant 2 oaks");
    expect(plantLabel("BlueberryBush", 1)).toBe("Plant a berry bush");
    expect(plantLabel("BlueberryBush", 22)).toBe("Plant 22 berry bushes");
    expect(paintLabel("bushes", "BlueberryBush", 8)).toBe("Plant 8 berry bushes");
    expect(paintLabel("trees", "Pine", 1)).toBe("Plant a pine");
    expect(paintLabel("succulents", "Succulent", 3)).toBe("Plant 3 succulents");
    expect(paintLabel("woods", "", 1)).toBe("Plant a tree");
    expect(paintLabel("ruins", "", 1)).toBe("Place a ruin");
    expect(paintLabel("ruins", "", 31)).toBe("Paint 31 ruins");
    expect(paintLabel("thorns", "", 1)).toBe("Place a thorn");
    expect(paintLabel("thorns", "", 4)).toBe("Paint 4 thorns");
  });

  it("placing and moving", () => {
    expect(placeLabel("Place", "WaterSource")).toBe("Place a water source");
    expect(placeLabel("Place", "BadwaterSource")).toBe("Place a badwater source");
    expect(placeLabel("Place", "UndergroundRuins")).toBe("Place a mine site");
    expect(placeLabel("Place", "SmallRelic")).toBe("Place a relic");
    expect(placeLabel("Place", "RuinColumnH3")).toBe("Place a ruin");
    expect(placeLabel("Move", "NaturalDam")).toBe("Move a natural dam");
    expect(itemName("GeothermalField")).toBe("geothermal field");
  });

  it("every operation kind", () => {
    expect(labelOf(op("placeEntity", { template: "WaterSource" }))).toBe("Place a water source");
    expect(labelOf(op("moveEntity"))).toBe("Move an object");
    expect(labelOf(op("deleteEntities", { entities: ["a"] }))).toBe("Remove an object");
    expect(labelOf(op("deleteEntities", { entities: ["a", "b"] }))).toBe("Remove 2 objects");
    expect(labelOf(op("setEntityProps"))).toBe("Change an object");
    expect(labelOf(op("pinSlope"))).toBe("Place a slope");
    expect(labelOf(op("removeSlope"))).toBe("Remove a slope");
    expect(labelOf(op("removeUnfedWater", { pools: 1 }))).toBe("Remove unfed water from 1 pool");
    expect(labelOf(op("removeUnfedWater", { pools: 3 }))).toBe("Remove unfed water from 3 pools");
    expect(labelOf(op("fillHollow"))).toBe("Fill a hollow");
    expect(labelOf(op("sculpt", { mode: "raise" }))).toBe("Raise terrain");
    expect(labelOf(op("brush", { tool: "smooth" }))).toBe("Smooth");
    expect(labelOf(op("addFeature", { feature: { kind: "berryPatch" } }))).toBe("Add a berry patch");
    expect(labelOf(op("updateFeature"))).toBe("Change a feature");
    expect(labelOf(op("deleteFeature"))).toBe("Delete a feature");
    expect(labelOf(op("reorderFeature"))).toBe("Reorder a feature");
  });

  it("forces", () => {
    const f = (verb: string, settings: object = {}, where: object = {}) => forceLabel({ verb, settings, where } as never);
    expect(f("craterize")).toBe("Craterize");
    expect(f("quake", { mode: "lift" })).toBe("Quake: lift");
    expect(f("quake", { mode: "slide" })).toBe("Quake: slide");
    expect(f("carve", { dry: false })).toBe("Carve a river");
    expect(f("erupt", { mode: "fissure" })).toBe("Erupt a fissure");
  });
});

describe("a check that names several things is one row for each", () => {
  const s = { built: { entities: [{ id: "a", x: 3, y: 4 }, { id: "b", x: 9, y: 9 }] } } as unknown as MapSession;
  const base = { id: "extras.placement", class: "playability", severity: "warn", ok: false } as unknown as CheckResult;

  it("one row per line, each with its own place, the last 'and more' with none", () => {
    const rows = checkRows(s, { ...base, message: "Mine site on uneven ground · X 3 · Y 4 · Z 1\nSmall relic within 2 tiles of water · X 9 · Y 9 · Z 1\nand 3 more", where: { tiles: [[3, 4], [9, 9]] } });
    expect(rows.map((r) => r.message)).toEqual(["Mine site on uneven ground · X 3 · Y 4 · Z 1", "Small relic within 2 tiles of water · X 9 · Y 9 · Z 1", "and 3 more"]);
    expect(rows[0].where?.tiles).toEqual([[3, 4]]);
    expect(rows[1].where?.tiles).toEqual([[9, 9]]);
    expect(rows[2].where).toBeUndefined();
  });

  it("entities find their tiles", () => {
    const rows = checkRows(s, { ...base, id: "entities.placement", message: "Pine floating\nOak floating", where: { entities: ["a", "b"] } });
    expect(rows.map((r) => r.where?.entities)).toEqual([["a"], ["b"]]);
  });

  it("a one-line check stays one row", () => {
    expect(checkRows(s, { ...base, message: "1 of 3 reachable" })).toHaveLength(1);
  });
});
