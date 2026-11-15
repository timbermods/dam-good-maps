// Starting wood (D164) and saplings: a tree's growth read as the file stores it. The parser keeps a
// float as a JsonFloat, and older files wrap values as {"Value": …}; the page once read the growth
// with Number(), which gave NaN for a JsonFloat, so no sapling ever read as young (the 3D view drew
// them grown, the hover never said "young", and wood counted them as grown).

import { describe, expect, it } from "vitest";
import { growthOf, isSapling, treeLogs, woodDetail, woodWords } from "../../src/core/analysis/wood";
import { F, parse, type JsonObject } from "../../src/core/format/json";
import { bush, tree } from "../../src/core/format/entities";
import { modelKeyOf, modelOf } from "../../src/render3d/entities3d";
import { model as highModel } from "../../src/render3d/high/models";
import { cssColor, TREE_COLOURS, type Rgb } from "../../src/render3d/palette";
import { lifeOf } from "../../src/worker/api";
import { BARE, DEAD, entityView, YOUNG } from "../../src/render3d/model";

describe("a tree's growth (Growable.GrowthProgress)", () => {
  it("a sapling reads as a sapling, in every form the value takes", () => {
    for (const v of [0.5, F(0.5), { Value: 0.5 }, { Value: F(0.5) }] as JsonObject[keyof JsonObject][]) {
      const c = { Growable: { GrowthProgress: v } } as JsonObject;
      expect(growthOf(c)).toBe(0.5);
      expect(isSapling(c)).toBe(true);
      expect(lifeOf(c as Record<string, unknown>).young).toBe(true);
    }
    // as the generator writes it, and as a file is read back
    const e = tree({ id: "t", owner: "o", x: 1, y: 1, z: 3, species: "Oak", growth: 0.3 });
    expect(isSapling(e.components)).toBe(true);
    const read = parse(JSON.stringify({ Growable: { GrowthProgress: 0.3 } })) as JsonObject;
    expect(isSapling(read)).toBe(true);
  });

  it("a grown tree has no Growable, a growth of 1, or no readable growth: never a made-up number", () => {
    const grown = [{}, { Growable: { GrowthProgress: F(1) } }, { Growable: {} }, { Growable: { GrowthProgress: "half" } }, { Growable: { GrowthProgress: null } }, { Growable: 0.5 }] as JsonObject[];
    for (const c of grown) {
      expect(isSapling(c), JSON.stringify(c)).toBe(false);
      expect(lifeOf(c as Record<string, unknown>).young, JSON.stringify(c)).toBeUndefined();
    }
    expect(growthOf({})).toBeNull();
    expect(growthOf({ Growable: { GrowthProgress: "half" } })).toBeNull();
    expect(isSapling(tree({ id: "t", owner: "o", x: 1, y: 1, z: 3, species: "Oak" }).components)).toBe(false);
  });

  it("the page marks saplings young (the 3D view draws them small, the hover says so)", () => {
    const young = tree({ id: "t", owner: "o", x: 1, y: 1, z: 3, species: "Pine", growth: 0.4 });
    const grown = tree({ id: "u", owner: "o", x: 2, y: 1, z: 3, species: "Pine" });
    const v = entityView([
      { template: "Pine", x: 1, y: 1, z: 3, orientation: "Cw0", owner: "o", ...lifeOf(young.components as Record<string, unknown>) },
      { template: "Pine", x: 2, y: 1, z: 3, orientation: "Cw0", owner: "o", ...lifeOf(grown.components as Record<string, unknown>) },
    ]);
    expect(v.flags[0] & YOUNG).toBe(YOUNG);
    expect(v.flags[1] & YOUNG).toBe(0);
  });
});

describe("a bush's berries (Yielder:Gatherable)", () => {
  it("a bush whose berries were picked is drawn bare, as the game draws it; a ripe one, a pine's resin or no yield is not", () => {
    // (the Four Lakes r14 capture's bush at 76, 96 holds none and the game shows none: 400 of its 839 bushes)
    const picked = bush({ id: "b", owner: "o", x: 1, y: 1, z: 3, ripe: false, regrowth: 0.384 });
    const ripe = bush({ id: "c", owner: "o", x: 2, y: 1, z: 3, ripe: true });
    const read = parse(JSON.stringify(picked.components)) as JsonObject;
    for (const c of [picked.components, read]) expect(lifeOf(c as Record<string, unknown>).bare).toBe(true);
    for (const c of [ripe.components, {}, tree({ id: "t", owner: "o", x: 1, y: 1, z: 3, species: "Pine" }).components])
      expect(lifeOf(c as Record<string, unknown>).bare, JSON.stringify(c)).toBeUndefined();
    const v = entityView([
      { template: "BlueberryBush", x: 1, y: 1, z: 3, orientation: "Cw0", owner: "o", ...lifeOf(picked.components as Record<string, unknown>) },
      { template: "BlueberryBush", x: 2, y: 1, z: 3, orientation: "Cw0", owner: "o", ...lifeOf(ripe.components as Record<string, unknown>) },
    ]);
    expect(v.flags[0] & BARE).toBe(BARE);
    expect(v.flags[1] & BARE).toBe(0);
    // drawn without its berries in both looks (Standard's model, High's near and far)
    expect(modelKeyOf("BlueberryBush", BARE)).toBe("BlueberryBush.bare");
    expect(modelKeyOf("BlueberryBush", BARE | DEAD)).toBe("BlueberryBush.dead");
    const berry = cssColor(TREE_COLOURS.berry);
    const cols = (m: { col: readonly number[] }) => new Set(Array.from({ length: m.col.length / 9 }, (_, t) => cssColor(m.col.slice(t * 9, t * 9 + 3) as unknown as Rgb)));
    expect(cols(modelOf("BlueberryBush")).has(berry)).toBe(true);
    expect(cols(modelOf("BlueberryBush.bare")).has(berry)).toBe(false);
    for (const detail of ["near", "far"] as const) {
      const near = highModel("BlueberryBush", 0, detail, "alive").getAttribute("position").count;
      const bare = highModel("BlueberryBush", 0, detail, "bare").getAttribute("position").count;
      expect(bare, detail).toBeLessThan(near);
    }
  });
});

describe("a tree's logs", () => {
  it("each species' yield, what the file holds when it is logs, and none from anything else", () => {
    expect(treeLogs("Oak", {})).toBe(8);
    expect(treeLogs("Pine", {})).toBe(2);
    expect(treeLogs("Birch", {})).toBe(1);
    expect(treeLogs("Succulent", {})).toBe(0);
    expect(treeLogs("BlueberryBush", {})).toBe(0);
    expect(treeLogs("Oak", { "Yielder:Cuttable": { Yield: { Good: "Log", Amount: 5 } } })).toBe(5);
    expect(treeLogs("Oak", { "Yielder:Cuttable": { Yield: { Good: "Log", Amount: { Value: 6 } } } })).toBe(6);
    // another good is ignored, as the game ignores it
    expect(treeLogs("Oak", { "Yielder:Cuttable": { Yield: { Good: "Water", Amount: 2 } } })).toBe(8);
    expect(treeLogs("Oak", { "Yielder:Cuttable": { Yield: { Good: "Log", Amount: "many" } } })).toBe(8);
  });

  it("says the wood in plain words", () => {
    expect(woodWords({ Oak: 80, Pine: 0, Birch: 0 })).toBe("all oak");
    expect(woodWords({ Oak: 80, Pine: 20, Birch: 5 })).toBe("mostly oak");
    expect(woodWords({ Oak: 40, Pine: 50, Birch: 10 })).toBe("pine and oak");
    expect(woodWords({ Oak: 0, Pine: 0, Birch: 0 })).toBe("");
    expect(woodDetail({ Oak: 80, Pine: 0, Birch: 0 }, 11)).toBe(", all oak, plus about 11 growing");
    expect(woodDetail({ Oak: 0, Pine: 0, Birch: 0 }, 0)).toBe("");
  });
});
