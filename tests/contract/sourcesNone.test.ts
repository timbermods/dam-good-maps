// Sources: Placed · None (PLAN §20 D330, the UI brief §8): None generates the map as usual, then
// removes every water and badwater source and its water, keeping the dry valleys, basins and pits
// they carved; the trees stay as generated; item 47's water must-haves don't apply ("No water
// source", information); Save to Timberborn still works; old links read as Placed.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment, encodeSpecFragment } from "../../src/core/spec/mapspec";
import { blocks } from "../../src/core/validate/report";
/** What a water check says on a map made with Sources: None (rust/checks/src/report.rs `NO_WATER_SOURCE`). */
const NO_WATER_SOURCE = "No water source: the map was made with Sources: None";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const plants = (e: { template: string; x: number; y: number }[]) =>
  e
    .filter((x) => /^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(x.template))
    .map((x) => `${x.template}@${x.x},${x.y}`)
    .sort();

describe("Sources: None (D330)", () => {
  const placed = generate(decodeSpecFragment("s=5&t=riverValley&z=96")!.spec);
  const none = generate(decodeSpecFragment("s=5&t=riverValley&z=96&so=n")!.spec);

  it("is the same map without its sources and their water: the land, the trees and bushes as generated", () => {
    expect(placed.spec.settings.water.sources).toBe("placed");
    expect(none.spec.settings.water.sources).toBe("none");
    expect(none.report.passed).toBe(true);
    expect(none.bytes.length).toBeGreaterThan(0);
    expect(placed.built.entities.some((e) => e.template === "WaterSource")).toBe(true);
    expect(none.built.entities.some((e) => e.template === "WaterSource" || e.template === "BadwaterSource")).toBe(false);
    expect(none.built.water.every((d) => d === 0)).toBe(true);
    expect(Array.from(none.built.heights)).toEqual(Array.from(placed.built.heights));
    expect(plants(none.built.entities)).toEqual(plants(placed.built.entities));
  });

  it("its water checks say 'No water source' as information; the rest still apply, and nothing blocks", () => {
    const na = none.report.checks.filter((c) => c.applicable === false && c.message === NO_WATER_SOURCE).map((c) => c.id);
    for (const id of ["start.water", "resources.badwater_source", "water.clean_exists", "plants.survive"]) expect(na).toContain(id);
    expect(none.report.checks.find((c) => c.id === "start.wood_floor")!.applicable).not.toBe(false);
    expect(none.report.checks.find((c) => c.id === "resources.mine_site")!.ok).toBe(true);
    const s = MapSession.fromGenerated(none, none.file);
    expect(s.validate("export").report.checks.filter((c) => blocks("export", c))).toEqual([]);
  });

  it("the link carries it, and a link without it reads as Placed", () => {
    expect(encodeSpecFragment(none.spec)).toMatch(/&so=n/);
    expect(encodeSpecFragment(placed.spec)).not.toMatch(/so=/);
    expect(decodeSpecFragment("v=0.7.0&s=5&t=riverValley&z=96")!.spec.settings.water.sources).toBe("placed");
  });

  it("its project reopens as the same file, and a source the player places runs", () => {
    const s = MapSession.open(decodeProject(encodeProject(generatedDocument(none))));
    expect(sha(s.exportTimber().bytes)).toBe(sha(none.bytes));
    // a source in a dry riverbed: its water flows, and the water checks apply again
    const b = s.built;
    let at = -1;
    for (let i = 0; i < b.W * b.H && at < 0; i++) if (b.channel[i]) at = i;
    expect(at).toBeGreaterThanOrEqual(0);
    const u = s.apply({ op: "placeEntity", params: { id: "5a0e1d2c-3b4f-4a6e-8c7d-9e0f1a2b3c4d", template: "WaterSource", x: at % b.W, y: Math.floor(at / b.W), orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } }, "user", "Place water source");
    expect(u.errors).toEqual([]);
    s.settleCanonical();
    expect(s.built.water.some((d) => d > 0.05)).toBe(true);
    const water = s.validate("export").report.checks.find((c) => c.id === "start.water")!;
    expect(water.message).not.toBe(NO_WATER_SOURCE);
  });
});
