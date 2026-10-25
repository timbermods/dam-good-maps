// Ruins placed with meaning (D488 (2), gen/ruinStories.ts): a ruined dam across the natural narrows
// and a drowned village, each with its line in a player's words. The dam holds no water (D111): the
// map's settled water is the same with its storied ruins and without them, and no column stands in
// the river's gap.

import { describe, expect, it } from "vitest";
import { buildMap, type GeneratedField } from "../../src/core/features/build";
import { generate } from "../../src/core/gen/generate";
import { ruinStories } from "../../src/core/gen/ruinStories";
import { runsToTiles } from "../../src/core/math/grid";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { terrainColumns } from "../../src/core/terrain/runs";

/** Maps that show each story (tools/ruin-stories.ts finds more). */
const DAM: [ThemeId, number] = ["riverValley", 4];
const VILLAGE: [ThemeId, number] = ["lakeBasin", 2];

function map([theme, seed]: [ThemeId, number]) {
  return generate(makeSpec({ seed, size: { x: 128, y: 128 }, theme, designedFor: "normal" }));
}

describe("ruins placed with meaning", () => {
  it("a ruined dam across the narrows holds no water: the settled water is the same without it, its gap open", () => {
    const r = map(DAM);
    expect(r.report.passed).toBe(true);
    const { W, H } = r.built;
    const dam = r.features.find((f) => f.kind === "ruinField" && f.params.story?.kind === "dam");
    expect(dam, "the map shows a ruined dam").toBeTruthy();
    if (dam?.kind !== "ruinField") return;
    expect(dam.params.story!.say).toMatch(/^A ruined dam lies across the narrows \d+ tiles [a-z-]+ of the start, the river running through its gap: rebuilt, it would hold [\d,]+ water\.$/);
    // its columns stand on the map, none in a river's channel (the gap where the river runs)
    const tiles = new Set(runsToTiles(dam.params.area, W));
    const columns = r.built.entities.filter((e) => e.owner === dam.id);
    expect(columns.length).toBe(tiles.size);
    for (const e of columns) expect(r.built.channel[e.y * W + e.x]).toBe(0);
    // D111: the water settles the same with the storied ruins and without them, and as the map has it
    const fd = r.field!;
    const ramps: [number, number][] = [];
    for (let k = 0; k + 1 < (fd.ramps ?? []).length; k += 2) ramps.push([fd.ramps![k], fd.ramps![k + 1]]);
    const field = (): GeneratedField => ({ heights: terrainColumns(fd, W * H).heights, contains: new Set(fd.contains), ...(ramps.length ? { ramps } : {}), ...(fd.top !== undefined ? { top: fd.top } : {}) });
    const without = buildMap({ W, H, seed: r.spec.seed, features: r.features.filter((f) => !(f.kind === "ruinField" && f.params.story)), field: field() });
    const again = buildMap({ W, H, seed: r.spec.seed, features: r.features, field: field() });
    const bytes = (a: Float64Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    expect(bytes(without.water).equals(bytes(r.built.water))).toBe(true);
    expect(bytes(again.water).equals(bytes(r.built.water))).toBe(true);
    expect(without.entities.length).toBeLessThan(again.entities.length);
  });

  it("a drowned village stands in the water, its tops rising out of it, and the Showcase reads its line", () => {
    const r = map(VILLAGE);
    expect(r.report.passed).toBe(true);
    const { W } = r.built;
    const village = r.features.find((f) => f.kind === "ruinField" && f.params.story?.kind === "village");
    expect(village, "the map shows a drowned village").toBeTruthy();
    if (village?.kind !== "ruinField") return;
    const columns = r.built.entities.filter((e) => e.owner === village.id);
    expect(columns.length).toBeGreaterThanOrEqual(12);
    let wet = 0;
    let out = 0;
    for (const e of columns) {
      const i = e.y * W + e.x;
      if (r.built.water[i] > 0) wet++;
      const storeys = Number(/^RuinColumnH(\d)$/.exec(e.template)![1]);
      if (e.z + storeys > r.built.heights[i] + r.built.water[i]) out++;
    }
    expect(wet).toBe(columns.length);
    expect(out).toBeGreaterThan(columns.length / 2);
    const said = ruinStories(r.features, W).find((s) => s.kind === "village");
    expect(said?.say).toMatch(/^A drowned village stands (in a lake's shallows|in the shallows off the shore|on the flooded valley floor) \d+ tiles [a-z-]+ of the start, its ruins rising out of the water\.$/);
  });
});
