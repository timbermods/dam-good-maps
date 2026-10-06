// Every thing on the map has a hover readout (PLAN §20 D347, B11; D342): `describeTile` is a plain core
// function returning plain data, and the readout only words it. Each kind of thing the editor has is
// described here, on the map that holds it, and with the ground it stands on.

import { describe, expect, it } from "vitest";
import { describeObject, describeTile, describeTileOf, tileWords, type TileFacts } from "../../src/core/doc/describeTile";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { footprintTiles } from "../../src/core/format/footprints";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

/** A spot where `template` fits (the hover check says so) and nothing else stands, scanning from a corner. */
function spotFor(template: string, taken: Set<number>): [number, number] {
  for (let y = 10; y < W - 10; y += 2)
    for (let x = 10; x < W - 10; x += 2) {
      const own = footprintTiles(template, { template, x, y, z: 0, orientation: "Cw0", flipped: false }).map(([a, b]) => b * W + a);
      if (own.some((i) => taken.has(i))) continue;
      const c = ed.footprintCheck({ tool: "entity", template, x, y, orientation: "Cw0" });
      if (c.problem) continue;
      for (const i of own) taken.add(i);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) taken.add((y + dy) * W + x + dx);
      return [x, y];
    }
  throw new Error(`no room for ${template}`);
}

describe("describeTile: what is on a tile, in plain data (D347, B11)", () => {
  it("each kind of thing the editor places is named, with its key fact and the ground under it", async () => {
    // (seed 2 on M9b's maps, D148: the start's footprint is read at (+1, +1) of its anchor, which only holds for orientation Cw0, and seed 4's start now faces another way)
    await runGenerate(makeSpec({ seed: 2, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    const taken = new Set<number>();
    const cases: [string, RegExp, Record<string, unknown>?][] = [
      ["UndergroundRuins", /^Mine site$/],
      ["GeothermalField", /^Geothermal field$/],
      ["SmallRelic", /^Relic, small$/],
      ["MediumRelic", /^Relic, medium$/],
      ["LargeRelic", /^Relic, large$/],
      ["RuinColumnH5", /^Ruin, 5 levels, 75 scrap metal$/],
      ["RuinColumnH1", /^Ruin, 1 level, 15 scrap metal$/],
      ["Thorns", /^Thorns$/],
      ["NaturalDam", /^Natural dam$/],
      ["Blockage", /^Blockage$/],
      ["Pine", /^Pine, (grown|young|dead)$/],
      ["Birch", /^Birch, (grown|young|dead)$/],
      ["Oak", /^Oak, (grown|young|dead)$/],
      ["BlueberryBush", /^Blueberry bush, (grown|young|dead)$/],
      ["WaterSource", /^Water source, 1 water\/s$/],
      ["BadwaterSource", /^Badwater source, 3 badwater\/s$/],
    ];
    for (const [template, words, components] of cases) {
      const isSource = /Source$/.test(template);
      // (a slope the hover check doesn't see can refuse a spot: the next one)
      let x = 0;
      let y = 0;
      let placed = false;
      for (let tries = 0; tries < 8 && !placed; tries++) {
        [x, y] = spotFor(template, taken);
        const req = isSource ? { tool: "entity" as const, template, x, y, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: template === "WaterSource" ? 1 : 3, CurrentStrength: template === "WaterSource" ? 1 : 3 } } } : { tool: "entity" as const, template, x, y, orientation: "Cw0" as const, ...(components ? { components } : {}) };
        placed = ed.applyTool(req, crypto.randomUUID()).ok;
      }
      expect(placed, `${template} could be placed`).toBe(true);
      // the tile the thing was placed on
      const d = ed.describeTileAt(x, y);
      expect(d, template).not.toBeNull();
      const mine = d!.objects.find((o) => o.template === template);
      expect(mine, `${template} is on its own tile`).toBeTruthy();
      expect(mine!.text, template).toMatch(words);
      // the readout gives the object and the ground it sits on
      const text = tileWords(d);
      expect(text, template).toMatch(/ · (Height \d+|(Water|Badwater) [\d.]+ deep)/);
      expect(text.startsWith(mine!.text)).toBe(true);
    }
    // a slope, the start and a tile with nothing on it
    const v = ed.sessionView().view;
    const e = v.entities;
    let start = -1;
    let slope = -1;
    for (let k = 0; k < e.count; k++) {
      const t = e.templates[e.template[k]];
      if (t === "StartingLocation") start = k;
      if (t === "Slope" && slope < 0) slope = k;
    }
    expect(ed.describeTileAt(e.x[start] + 1, e.y[start] + 1)!.objects.map((o) => o.text)).toContain("Start");
    if (slope >= 0) expect(ed.describeTileAt(e.x[slope], e.y[slope])!.objects.map((o) => o.text)).toContain("Slope");
    const bare = ed.describeTileAt(1, 1)!;
    expect(bare.objects).toEqual([]);
    expect(tileWords(bare)).toMatch(/^Height \d+/);
    expect(ed.describeTileAt(-1, 3)).toBeNull();
  }, 120000);

  it("a tree is grown, young or dead; a source says its strength; water gives its depth and bed", () => {
    expect(describeObject({ template: "Pine" }).text).toBe("Pine, grown");
    expect(describeObject({ template: "Oak", young: true }).text).toBe("Oak, young");
    expect(describeObject({ template: "Birch", dead: true }).text).toBe("Birch, dead");
    expect(describeObject({ template: "WaterSource", strength: 2 }).text).toBe("Water source, 2 water/s");
    const facts: TileFacts = {
      W: 4,
      H: 4,
      height: () => 4,
      water: (i) => (i === 5 ? { depth: 0.6, contamination: 0 } : i === 6 ? { depth: 2, contamination: 1 } : null),
      soil: () => "moist",
      objects: (i) => (i === 5 ? [{ template: "Slope" }] : i === 9 ? [{ template: "Pine" }, { template: "RuinColumnH2" }] : []),
    };
    expect(tileWords(describeTile(facts, 1, 1))).toBe("Slope · Water 0.6 deep, bed level 4");
    expect(tileWords(describeTile(facts, 2, 1))).toBe("Badwater 2.0 deep, bed level 4");
    expect(tileWords(describeTile(facts, 1, 2))).toBe("Pine, grown; Ruin, 2 levels, 30 scrap metal · Height 4, moist soil");
  });

  it("the description follows the water: re-asking after the water under a tile changes gives the new depth, with nothing else to refresh", async () => {
    // (seed 1 on M9b's maps, D148: seed 3's River Valley has no dry, flat, empty 7×7 at level 5 or
    // above, 6 tiles clear of the water, that the test edits on; seed 2 since 0.8.3's badwater courses
    // follow the land, D476, D148: seed 1 has none)
    await runGenerate(makeSpec({ seed: 2, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const b0 = s.built;
    // dry, flat ground far from any water and anything standing
    let at: [number, number] | null = null;
    for (let y = 12; y < W - 12 && !at; y++)
      for (let x = 12; x < W - 12 && !at; x++) {
        const h0 = b0.heights[y * W + x];
        let ok = h0 >= 5;
        for (let yy = y - 6; yy <= y + 6 && ok; yy++) for (let xx = x - 6; xx <= x + 6 && ok; xx++) if (b0.water[yy * W + xx] > 0 || b0.channel[yy * W + xx]) ok = false;
        for (let yy = y - 3; yy <= y + 3 && ok; yy++) for (let xx = x - 3; xx <= x + 3 && ok; xx++) if (b0.heights[yy * W + xx] !== h0) ok = false;
        if (ok && b0.entities.some((e) => Math.abs(e.x - x) <= 5 && Math.abs(e.y - y) <= 5)) ok = false;
        if (ok) at = [x, y];
      }
    expect(at).not.toBeNull();
    const [x, y] = at!;
    const i = y * W + x;
    /** The description, checked against the session's own water arrays. */
    const ask = () => {
      const d = describeTileOf(s, x, y)!;
      const depth = s.built.water[i];
      if (depth > 0.001) {
        expect(d.ground.water, "wet in the arrays, wet in the description").not.toBeNull();
        expect(d.ground.water!.depth).toBe(depth);
        expect(tileWords(d)).toMatch(/(Water|Badwater) [\d.]+ deep, bed level \d+$/);
      } else {
        expect(d.ground.water, "dry in the arrays, dry in the description").toBeNull();
        expect(tileWords(d)).toMatch(/Height \d+/);
      }
      expect(d.ground.height).toBe(s.built.heights[i]);
      return d;
    };
    expect(ask().ground.water).toBeNull();

    // an edit: a source on the tile floods it
    const SRC = "d3870000-0000-4000-8000-000000000001";
    const source = { id: SRC, template: "WaterSource", x, y, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } };
    expect(s.apply({ op: "placeEntity", params: source }).errors).toEqual([]);
    const wet = ask();
    expect(wet.ground.water, "the source's tile is under water").not.toBeNull();
    expect(wet.ground.water!.depth).toBeGreaterThan(0.001);

    // another edit: the source goes again, and the tile is dry as it was
    expect(s.apply({ op: "deleteEntities", params: { entities: [SRC] } }).errors).toEqual([]);
    expect(ask().ground.water).toBeNull();

    // the water settling, on the open session: between the two questions nothing changes but the settle
    const depthIn = (tile: number) => {
      const w = ed.sessionView().view.water;
      let d = 0;
      for (let k = 0; k < w.count; k++) if (w.tile[k] === tile && w.depth[k] > d) d = w.depth[k];
      return d;
    };
    expect(ed.apply({ op: "placeEntity", params: source }).errors).toEqual([]);
    const before = ed.describeTileAt(x, y)!;
    ed.settleWater();
    const after = ed.describeTileAt(x, y)!;
    const settled = depthIn(i);
    expect(settled).toBeGreaterThan(0.001);
    expect(after.ground.water, "the settled water is reported").not.toBeNull();
    expect(after.ground.water!.depth).toBeCloseTo(settled, 6);
    expect(before.ground.water?.depth ?? 0, "the settle changed the answer").not.toBe(after.ground.water!.depth);
    // the source removed and the water settled again: dry once more
    expect(ed.apply({ op: "deleteEntities", params: { entities: [SRC] } }).errors).toEqual([]);
    ed.settleWater();
    expect(ed.describeTileAt(x, y)!.ground.water).toBeNull();
  }, 120000);
});
