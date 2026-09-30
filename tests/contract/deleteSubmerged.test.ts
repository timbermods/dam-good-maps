// Delete's counts and "Everything" include the objects under water (PLAN §20 D345, B5): the resource
// features hold trees and bushes on ground a lake later covers (a source the player placed in a
// forest, say), and they stand again when the water drains. A selection's counts include them, and
// deleting everything in it leaves nothing to grow back when the sources go and the water drains.

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
  it("a lake over a forest: the counts include the trees it hides, and deleting everything leaves none to appear as it drains", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const [x, y] = inTheTrees();
    const dry = growing();
    // a strong source in the forest floods some of it
    const r = ed.applyTool({ tool: "entity", template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } }, "11111111-2222-4333-8444-555555555555");
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    ed.settleWater();
    const flooded = growing();
    expect(flooded, "the water hides some of the trees").toBeLessThan(dry);
    const counts = ed.objectsInArea(ALL);
    // the counts are the objects standing plus the ones the water hides
    expect(total(counts.submerged)).toBeGreaterThan(0);
    expect(total(counts.counts) - total(counts.submerged)).toBeGreaterThanOrEqual(flooded);
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
