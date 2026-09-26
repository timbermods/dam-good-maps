// Live editing, first phase (Kyler's triage): the legend lists only what is on the map shown, and
// each of its lines points to its tiles; the player never sees the plans' section numbers.

import { describe, expect, it } from "vitest";
import { plain } from "../../src/editor/words";
import { entityView, surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { legendEntries, objectLegend } from "../../src/render3d/palette";
import { legendKey, presentEntries, type LegendMap } from "../../src/ui/legendMap";

/** A 6×4 map: a step up in the east, a pond of clean water and one of badwater, moist and dry
 *  soil, a living pine, a dead birch and a slope. */
function map(): LegendMap {
  const W = 6;
  const H = 4;
  const heights = new Uint8Array(W * H).fill(2);
  for (let y = 0; y < H; y++) heights[y * W + 5] = 3;
  const depth = new Float64Array(W * H);
  const bad = new Float64Array(W * H);
  depth[0] = 1;
  depth[1] = 0.8;
  bad[1] = 1;
  const moisture = new Uint8Array(W * H);
  moisture[2] = 20;
  moisture[8] = 5;
  return {
    W,
    H,
    heights,
    surface: surfaceWater(W, H, waterFromDepth(heights, depth, bad)),
    soil: { moisture, contamination: new Uint8Array(W * H) },
    entities: entityView([
      { template: "Pine", x: 2, y: 1, z: 2, orientation: "Cw0", owner: "f" },
      { template: "Birch", x: 3, y: 2, z: 2, orientation: "Cw0", owner: "f", dead: true },
      { template: "Slope", x: 4, y: 3, z: 2, orientation: "Cw90", owner: "derived" },
    ]),
  };
}

describe("the legend: only what is on the map", () => {
  it("every palette line has a meaning the legend can find on a map", () => {
    for (const e of [...legendEntries("moisture"), ...legendEntries("height"), ...objectLegend()]) expect(legendKey(e.label), e.label).not.toBeNull();
  });

  it("lists the lines the map has, each with its tiles, and leaves the others out", () => {
    const m = map();
    const shown = presentEntries([...legendEntries("moisture"), ...objectLegend()], m);
    const byKey = new Map(shown.map((e) => [e.key, e.tiles]));
    expect(byKey.get("water")).toEqual([0]);
    expect(byKey.get("badwater")).toEqual([1]);
    expect(byKey.get("moist")).toEqual(expect.arrayContaining([2, 8]));
    expect(byKey.get("plants")).toEqual([1 * 6 + 2]);
    expect(byKey.get("dead")).toEqual([2 * 6 + 3]);
    expect(byKey.get("slope")).toEqual([3 * 6 + 4]);
    expect(byKey.get("walls")).toEqual([5, 11, 17, 23]);
    // nothing of these on this map
    for (const k of ["mixed", "contaminated", "start", "ruin", "mine", "source", "badSource", "geothermal", "relic", "thorns", "blockage", "other"]) expect(byKey.has(k), k).toBe(false);
    // the markers' lines follow their meaning too
    expect(shown.filter((e) => e.markers).map((e) => e.key)).toEqual(["slope", "walls"]);
  });

  it("keeps a page's own line with the tiles it gives, and drops it when it has none", () => {
    const m = map();
    expect(presentEntries([{ swatch: "", label: "Dam sites", markers: true, tiles: [3, 4] }], m)).toEqual([{ swatch: "", label: "Dam sites", markers: true, tiles: [3, 4], key: "Dam sites" }]);
    expect(presentEntries([{ swatch: "", label: "Dam sites", markers: true, tiles: [] }], m)).toEqual([]);
  });
});

describe("the player's words", () => {
  it("never show the plans' sections or ids", () => {
    expect(plain("another fall is less than 12 tiles away on this river (PLAN §5.3)")).toBe("Another fall is less than 12 tiles away on this river");
    expect(plain("a gorge has (PLAN §9.9)")).toBe("A gorge has");
    expect(plain("it moves (D97)")).toBe("It moves");
    expect(plain("feature f-abc12345 is gone")).toBe("Feature it is gone");
  });
});
