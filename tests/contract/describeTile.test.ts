// Every thing on the map has a hover readout (PLAN §20 D347, B11; D342): `describeTile` is a plain core
// function returning plain data, and the readout only words it. Each kind of thing the editor has is
// described here, on the map that holds it, and with the ground it stands on.

import { describe, expect, it } from "vitest";
import { describeObject, describeTile, tileWords, type TileFacts } from "../../src/core/doc/describeTile";
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
    await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
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
});
