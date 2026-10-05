// Delete's counts and "Everything" include the objects under water (PLAN §20 D345, B5). A generated
// map's own trees, bushes and ruin columns stand in a lake that later covers them (a source the player
// placed in a forest, say), a tree dead (D404): the water never hides one, and none appears when it
// drains (D368 (10)). A resource feature without the generation's record (an old document's) holds its
// objects under the water and grows them back as it drains; the counts include those too. Deleting
// everything in a selection leaves nothing to grow back when the sources go and the water drains.

import { describe, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const ALL = Array.from({ length: W * W }, (_, i) => i);
const PLANTS = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent)$|Bush$/;
const growing = () => {
  const e = ed.sessionView().view.entities;
  let n = 0;
  for (let k = 0; k < e.count; k++) if (PLANTS.test(e.templates[e.template[k]])) n++;
  return n;
};
const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** A tile in the middle of a stand of trees on flat ground, away from the map's edge. */
function inTheTrees(): [number, number] {
  const v = ed.sessionView().view;
  const e = v.entities;
  const near = new Map<number, number>();
  for (let k = 0; k < e.count; k++) if (PLANTS.test(e.templates[e.template[k]])) near.set(e.y[k] * W + e.x[k], 1);
  let best: [number, number] = [-1, -1];
  let most = 0;
  for (let y = 12; y < W - 12; y += 2)
    for (let x = 12; x < W - 12; x += 2) {
      let n = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) n += near.get((y + dy) * W + x + dx) ?? 0;
      if (near.has(y * W + x) && n > most) {
        most = n;
        best = [x, y];
      }
    }
  if (most < 20) throw new Error("no stand of trees");
  return best;
}

describe("Delete counts what is under water too (D345, B5)", () => {
  it("a lake over a forest: its trees stand in the water and are counted, none hidden, and deleting everything leaves none to appear as it drains", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const [x, y] = inTheTrees();
    const dry = growing();
    // a strong source in the forest floods some of it
    const r = ed.applyTool({ tool: "entity", template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } }, "11111111-2222-4333-8444-555555555555");
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    ed.settleWater();
    const flooded = growing();
    // (the source took its own tile's tree; the rest stand in the water, D404)
    expect(flooded, "the water hides none of the trees").toBeGreaterThanOrEqual(dry - 1);
    const counts = ed.objectsInArea(ALL);
    // the counts are the objects standing, those in the water too: nothing is held under it
    expect(total(counts.submerged)).toBe(0);
    expect(total(counts.counts)).toBeGreaterThanOrEqual(flooded);
    // Everything: the source goes, the water drains (D260), and the hidden trees go with the rest
    const gone = ed.removeAt(ALL, ["trees", "bushes", "ruins", "sources", "slopes", "objects", "start"], "Delete everything");
    expect(gone.ok, JSON.stringify(gone.errors)).toBe(true);
    ed.settleWater();
    expect(growing(), "objects appeared as the water drained").toBe(0);
    expect(ed.objectsInArea(ALL).counts).toEqual({});
    // one undo brings it back as it was
    ed.undo();
    ed.settleWater();
    expect(total(ed.objectsInArea(ALL).counts)).toBe(total(counts.counts));
  }, 300000);
});

describe("Delete takes the ruin columns inside a selection, under water too, when a ruin field is only partly selected (D360 b)", () => {
  it("the columns outside the selection stay exactly as they were", async () => {
    let checked = false;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
      ed.refine();
      const info = ed.sessionView().info;
      for (const f of info.features.filter((g) => g.kind === "ruinField")) {
        const runs = (f.params as { area: [number, number, number][] }).area;
        const tiles = runs.flatMap(([y, a, b]) => Array.from({ length: b - a + 1 }, (_, k) => y * W + a + k));
        if (tiles.length < 12) continue;
        const xs = tiles.map((i) => i % W).sort((a, b) => a - b);
        const cut = xs[xs.length >> 1];
        const cx = Math.round(tiles.reduce((a, i) => a + (i % W), 0) / tiles.length);
        const cy = Math.round(tiles.reduce((a, i) => a + Math.floor(i / W), 0) / tiles.length);
        const ruinCount = () => {
          const e = ed.sessionView().view.entities;
          let n = 0;
          for (let k = 0; k < e.count; k++) if (/^RuinColumnH/.test(e.templates[e.template[k]]) && tiles.includes(e.y[k] * W + e.x[k])) n++;
          return n;
        };
        const dry = ruinCount();
        // a strong source beside the field floods some of it
        let placed = false;
        for (let d = 0; d < 10 && !placed; d++)
          for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
            const req = { tool: "entity" as const, template: "WaterSource", x: cx + dx, y: cy + dy, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } };
            if (ed.footprintCheck(req).problem) continue;
            if (ed.applyTool(req, crypto.randomUUID()).ok) {
              placed = true;
              break;
            }
          }
        if (!placed) continue;
        ed.settleWater();
        const selection = tiles.filter((i) => i % W < cut);
        const inside = new Set(selection);
        const ruins = () => {
          const e = ed.sessionView().view.entities;
          const out: string[] = [];
          for (let k = 0; k < e.count; k++) if (/^RuinColumnH/.test(e.templates[e.template[k]]) && tiles.includes(e.y[k] * W + e.x[k])) out.push(`${e.templates[e.template[k]]}@${e.x[k]},${e.y[k]}`);
          return out;
        };
        // (the water drowned some of the field's columns)
        const hiddenRuins = dry - ruinCount();
        const outsideBefore = ruins().filter((r) => !inside.has(Number(r.split("@")[1].split(",")[1]) * W + Number(r.split("@")[1].split(",")[0]))).sort();
        if (!hiddenRuins || !outsideBefore.length) continue;
        checked = true;
        const r = ed.removeAt(selection, ["ruins"], "Delete ruins");
        expect(r.ok, JSON.stringify(r.errors)).toBe(true);
        ed.settleWater();
        const after = ruins();
        const outsideAfter = after.filter((r) => !inside.has(Number(r.split("@")[1].split(",")[1]) * W + Number(r.split("@")[1].split(",")[0]))).sort();
        expect(after.length - outsideAfter.length, "no column left inside the selection").toBe(0);
        expect(outsideAfter, "the columns outside stay exactly as they were").toEqual(outsideBefore);
        // the water goes: nothing inside comes back, and nothing outside changes
        ed.removeAt(Array.from({ length: W * W }, (_, i) => i), ["sources"], "Delete sources");
        ed.settleWater();
        const drained = ruins();
        const at = (r: string) => Number(r.split("@")[1].split(",")[1]) * W + Number(r.split("@")[1].split(",")[0]);
        expect(drained.filter((r) => inside.has(at(r))).length, "nothing comes back inside the selection").toBe(0);
        for (const r of outsideBefore) expect(drained, "the columns outside still stand").toContain(r);
        expect(ed.objectsInArea(selection).counts, "nothing of the ruins inside the selection").not.toHaveProperty("RuinColumnH1");
        break;
      }
      if (checked) break;
    }
    expect(checked, "a map with a partly flooded ruin field").toBe(true);
  }, 300000);
});
