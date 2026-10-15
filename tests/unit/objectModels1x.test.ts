// The 1.x objects have models of their own (the succulent, the seeps, the aquifer and its drill, the
// badtide drain, the unstable core, the reserves): each stays within the game's footprint (the succulent's
// leaves reach a little past it, as tree crowns do), centred on it, and within a triangle budget, and is drawn as itself (not the generic block).

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { FOOTPRINTS } from "../../src/core/format/footprints";
import { buildEntities, mineCutout, modelKeyOf, modelOf, modelTriangles } from "../../src/render3d/entities3d";
import { entityView } from "../../src/render3d/model";

const BUDGET: Record<string, number> = {
  Succulent: 200,
  "Succulent.dead": 90,
  WaterSeep: 400,
  BadwaterSeep: 400,
  Aquifer: 400,
  AncientAquiferDrill: 450,
  BadtideDrain: 260,
  UnstableCore: 380,
  ReservePile: 340,
  ReserveWarehouse: 400,
  ReserveTank: 340,
};

describe("the 1.x objects' models", () => {
  for (const [key, budget] of Object.entries(BUDGET)) {
    const template = key.replace(".dead", "");
    it(`${key}: a model of its own, within ${budget} triangles and its footprint`, () => {
      expect(modelKeyOf(template, key.endsWith(".dead") ? 1 : 0)).not.toBe("block");
      expect(modelTriangles(key)).toBeLessThanOrEqual(budget);
      const fp = FOOTPRINTS[template].size;
      // (the model is centred on its footprint: x east, z south, the footprint's y running north)
      const p = modelOf(key).pos;
      const half = [fp[0] / 2, fp[1] / 2];
      let lo = [Infinity, Infinity];
      let hi = [-Infinity, -Infinity];
      for (let k = 0; k < p.length; k += 3) {
        lo = [Math.min(lo[0], p[k]), Math.min(lo[1], p[k + 2])];
        hi = [Math.max(hi[0], p[k]), Math.max(hi[1], p[k + 2])];
      }
      // (a plant's leaves reach past its tile, as a tree's crown does; buildings and the rest stay inside)
      const slack = template === "Succulent" ? 0.25 : 0.03;
      expect(lo[0]).toBeGreaterThanOrEqual(-half[0] - slack);
      expect(hi[0]).toBeLessThanOrEqual(half[0] + slack);
      expect(lo[1]).toBeGreaterThanOrEqual(-half[1] - slack);
      expect(hi[1]).toBeLessThanOrEqual(half[1] + slack);
    });
  }

  it("each is built as a batch of its own, in both the full and the light look", () => {
    const list = Object.keys(BUDGET)
      .filter((k) => !k.endsWith(".dead"))
      .map((template, i) => ({ template, x: 4 + i * 4, y: 4, z: 0 }));
    for (const lite of [false, true]) {
      const names = new Set((buildEntities(entityView(list as unknown as Parameters<typeof entityView>[0]), new ShaderMaterial(), null, 0, lite).group.children as unknown as { name: string }[]).map((m) => m.name));
      for (const { template } of list) expect(names.has(lite && template === "Succulent" ? "Succulent.lite" : template)).toBe(true);
    }
  });

  it("a seep's pit cuts out the terrain over its whole 2 × 2, as a mine site's does", () => {
    const view = entityView([{ template: "WaterSeep", x: 10, y: 20, z: 5, orientation: "Cw90" }, { template: "Aquifer", x: 40, y: 40, z: 5, orientation: "Cw0" }] as unknown as Parameters<typeof entityView>[0]);
    const cut = mineCutout(view, 64, 64);
    // (turned a quarter, its tiles run west to east and south to north from its corner: x 10–11, y 19–20)
    expect([...cut.keys()].sort((a, b) => a - b)).toEqual([19 * 64 + 10, 19 * 64 + 11, 20 * 64 + 10, 20 * 64 + 11]);
    for (const v of cut.values()) expect(v).toBe(5);
  });
});
