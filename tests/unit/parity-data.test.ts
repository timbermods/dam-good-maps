// The game's values for the objects the shelf places by the game's rules (PLAN §20 D337-D339), and the files they
// write: each object's components in the order the official maps store them (Oasis, Pillars, Spillage, Nomads),
// the ceilings, the defaults and the reserves. The numbers are read from the game's blueprints
// (`src/core/data/parity.ts` says where); these tests pin what the shelf builds to them.

import { FOOTPRINTS } from "../../src/core/format/footprints";
import { describe, expect, it } from "vitest";
import { CORE, defaultStock, defaultStrength, FLUIDS, goodsFor, isReserve, maxStrength, NO_DELAY, RESERVES, SEEP_RESTART_SCALE, TIMED } from "../../src/core/data/parity";
import { entityJson, fluidObject, reserve, unstableCore, waterSource } from "../../src/core/format/entities";
import { stringify } from "../../src/core/format/json";
import { defaultOptions, optionProblems, optionsPatch, placeComponents } from "../../src/core/doc/objectOps";
import { SEEP_OFF, SEEP_ON, MAX_STRENGTH_PER_TILE } from "../../src/core/sim/model";

const base = { id: "00000000-0000-4000-8000-000000000001", owner: "placed", x: 5, y: 6, z: 7 };
const keys = (e: ReturnType<typeof fluidObject>) => Object.keys(entityJson(e).Components as object);

describe("the game's values (the blueprints, read by tools/export-parity.ts)", () => {
  it("parity values and the existing exported footprints agree for every fluid and reserve", () => {
    for (const [template, spec] of Object.entries({ ...FLUIDS, ...RESERVES })) expect(FOOTPRINTS[template].size, template).toEqual(spec.size);
  });

  it("water objects: the tiles each emits into, its default strength and its ceiling of 8 for every tile", () => {
    expect(MAX_STRENGTH_PER_TILE).toBe(8);
    expect(FLUIDS.WaterSource.tiles).toHaveLength(1);
    expect(FLUIDS.BadwaterSource.tiles).toHaveLength(9);
    expect(FLUIDS.WaterSeep.tiles).toHaveLength(4);
    expect(FLUIDS.BadwaterSeep.tiles).toHaveLength(4);
    expect(FLUIDS.Aquifer.tiles).toHaveLength(1);
    expect(FLUIDS.BadtideDrain.tiles).toHaveLength(1);
    // (a badwater source reaches 72, a seep 32, the two 1x1 objects 8)
    expect([maxStrength("WaterSource"), maxStrength("BadwaterSource"), maxStrength("WaterSeep"), maxStrength("BadwaterSeep"), maxStrength("Aquifer"), maxStrength("BadtideDrain")]).toEqual([8, 72, 32, 32, 8, 8]);
    // the game's editor: a new water source at 1 (not the 8 that is its most), badwater at 3, the rest at 1
    expect([defaultStrength("WaterSource"), defaultStrength("BadwaterSource"), defaultStrength("WaterSeep"), defaultStrength("BadwaterSeep"), defaultStrength("Aquifer"), defaultStrength("BadtideDrain")]).toEqual([1, 3, 1, 1, 1, 1]);
  });

  it("seeps stop while the water over them is deeper than 0.8 and restart below 0.72; the drain is 1 x 3, not 1 x 2", () => {
    expect(FLUIDS.WaterSeep.depthLimit).toBe(0.8);
    expect(FLUIDS.BadwaterSeep.depthLimit).toBe(0.8);
    expect(SEEP_RESTART_SCALE).toBe(0.9);
    expect([SEEP_OFF, SEEP_ON]).toEqual([0.8, 0.72]);
    expect(FLUIDS.BadtideDrain.size).toEqual([1, 3, 1]);
    expect(FLUIDS.BadtideDrain.activeIn).toEqual(["BadtideWeather"]);
  });

  it("the start delay: every water object but an aquifer has one; cycles from 1, days from 0; defaults 5 and 10", () => {
    expect(TIMED).toMatchObject({ cycles: 5, days: 10, minCycles: 1, minDays: 0 });
    for (const t of ["WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep", "BadtideDrain"]) expect(FLUIDS[t].timed, t).toBe(true);
    expect(FLUIDS.Aquifer.timed).toBe(false);
    expect(FLUIDS.AncientAquiferDrill.on).toEqual(["Aquifer"]);
    expect(NO_DELAY).toEqual({ enabled: false, cycles: 5, days: 10 });
  });

  it("an unstable core: radius 0 to 5 (default 5), a blast of radius + 1, cycle 5 and 10.5 days by default", () => {
    expect(CORE).toMatchObject({ minRadius: 0, maxRadius: 5, defaultRadius: 5, innerRadius: 1, cycles: 5, days: 10.5, optional: false });
  });

  it("reserves: capacity 160, 200 and 300, one kind of good each, a new one full of the first good of its kind", () => {
    expect(Object.fromEntries(Object.entries(RESERVES).map(([k, r]) => [k, [r.type, r.capacity]]))).toEqual({ ReservePile: ["Pileable", 160], ReserveWarehouse: ["Box", 200], ReserveTank: ["Liquid", 300] });
    expect(defaultStock("ReservePile")).toEqual({ good: "Dirt", amount: 160 });
    expect(defaultStock("ReserveWarehouse")).toEqual({ good: "Berries", amount: 200 });
    expect(defaultStock("ReserveTank")).toEqual({ good: "Badwater", amount: 300 });
    expect(goodsFor("ReservePile").map((g) => g.id)).toEqual(["Dirt", "Log", "MetalBlock", "Plank", "ScrapMetal", "TreatedPlank"]);
    // Nomads' warehouses hold Explosives: a box good
    expect(goodsFor("ReserveWarehouse").some((g) => g.id === "Explosives")).toBe(true);
    expect(goodsFor("ReserveTank").some((g) => g.id === "Water")).toBe(true);
    expect(goodsFor("ReserveTank").some((g) => g.id === "Log")).toBe(false);
    expect(isReserve("Slope")).toBe(false);
  });
});

describe("what the shelf writes, in the game's component order (Oasis, Pillars, Spillage, Nomads)", () => {
  it("a seep: WaterSource, BlockObject, WaterDepthStrengthModifier, TimeActivatedComponent", () => {
    for (const template of ["WaterSeep", "BadwaterSeep"]) expect(keys(fluidObject({ ...base, template })), template).toEqual(["WaterSource", "BlockObject", "WaterDepthStrengthModifier", "TimeActivatedComponent"]);
  });

  it("the badtide drain: WaterSource, BlockObject, TimeActivatedComponent, its orientation kept and stored at zero (it runs only in a badtide)", () => {
    const e = fluidObject({ ...base, template: "BadtideDrain", orientation: "Cw270" });
    expect(keys(e)).toEqual(["WaterSource", "BlockObject", "TimeActivatedComponent"]);
    const c = entityJson(e).Components as Record<string, Record<string, unknown>>;
    expect(c.BlockObject.Orientation).toBe("Cw270");
    expect(stringify(c.WaterSource as never)).toBe('{"SpecifiedStrength":1.0,"CurrentStrength":0.0}');
  });

  it("an aquifer: BlockObject, WaterSource (no delay, no current strength); the drill: BlockObject alone", () => {
    const a = fluidObject({ ...base, template: "Aquifer" });
    expect(keys(a)).toEqual(["BlockObject", "WaterSource"]);
    expect(stringify(entityJson(a).Components as never)).toContain('"WaterSource":{"SpecifiedStrength":1.0,"CurrentStrength":0.0}');
    expect(keys(fluidObject({ ...base, template: "AncientAquiferDrill" }))).toEqual(["BlockObject"]);
  });

  it("a delayed source stores its countdown and no current strength; a sink is stored as it is", () => {
    const d = waterSource({ ...base, strength: 2, timed: { enabled: true, cycles: 3, days: 4.5 } });
    const c = entityJson(d).Components as Record<string, never>;
    expect(stringify(c.WaterSource)).toBe('{"SpecifiedStrength":2.0,"CurrentStrength":0.0}');
    expect(stringify(c.TimeActivatedComponent)).toBe('{"IsEnabled":true,"CyclesUntilCountdownActivation":3,"DaysUntilActivation":4.5,"DaysPassed":0.0}');
    const sink = fluidObject({ ...base, template: "WaterSeep", strength: -1.5 });
    expect(stringify((entityJson(sink).Components as Record<string, never>).WaterSource)).toBe('{"SpecifiedStrength":-1.5,"CurrentStrength":-1.5}');
  });

  it("an unstable core: BlockObject, TimeActivatedComponent (always on), UnstableCore", () => {
    const e = unstableCore({ ...base, orientation: "Cw90", radius: 3, cycles: 6 });
    expect(keys(e as never)).toEqual(["BlockObject", "TimeActivatedComponent", "UnstableCore"]);
    const c = entityJson(e).Components as Record<string, never>;
    expect(stringify(c.TimeActivatedComponent)).toBe('{"IsEnabled":true,"CyclesUntilCountdownActivation":6,"DaysUntilActivation":10.5,"DaysPassed":0.0}');
    expect(stringify(c.UnstableCore)).toBe('{"ExplosionRadius":3}');
  });

  it("a reserve, as Nomads' warehouses: BlockObject, FixedStockpile, SingleGoodAllower, Inventory:Stockpile, StockpileVisualizers, Inventory:ConstructionSite", () => {
    const e = reserve({ ...base, template: "ReserveWarehouse", good: "Explosives", amount: 40, orientation: "Cw90", flipped: true });
    const json = entityJson(e);
    expect(Object.keys(json.Components as object)).toEqual(["BlockObject", "FixedStockpile", "SingleGoodAllower", "Inventory:Stockpile", "StockpileVisualizers", "Inventory:ConstructionSite"]);
    expect(stringify(json)).toContain('"FixedStockpile":{"FixedGoodId":"Explosives"},"SingleGoodAllower":{"AllowedGood":"Explosives"},"Inventory:Stockpile":{"Storage":{"Goods":[{"Good":"Explosives","Amount":40}]}},"StockpileVisualizers":{"CurrentGood":"Explosives"},"Inventory:ConstructionSite":{"Storage":{"Goods":[{"Good":"ScrapMetal","Amount":10}]}}');
    // An empty reserve holds no goods; invalid requests stay literal so the operation can refuse.
    expect(stringify(entityJson(reserve({ ...base, template: "ReservePile", good: "Log", amount: 0 })))).toContain('"Inventory:Stockpile":{"Storage":{"Goods":[]}}');
    expect(stringify(entityJson(reserve({ ...base, template: "ReservePile", good: "Log", amount: 999 })))).toContain('"Amount":999');
  });

  it("placement components, in the game's names and order, for the game's defaults", () => {
    expect(Object.keys(placeComponents("WaterSeep")!)).toEqual(["WaterSource", "WaterDepthStrengthModifier", "TimeActivatedComponent"]);
    expect(Object.keys(placeComponents("Aquifer")!)).toEqual(["WaterSource"]);
    expect(placeComponents("AncientAquiferDrill")).toBeUndefined();
    expect(placeComponents("UnstableCore")).toMatchObject({ UnstableCore: { ExplosionRadius: 5 }, TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: 5, DaysUntilActivation: 10.5 } });
    expect(placeComponents("ReserveTank")).toMatchObject({ FixedStockpile: { FixedGoodId: "Badwater" }, "Inventory:Stockpile": { Storage: { Goods: [{ Good: "Badwater", Amount: 300 }] } } });
    expect(defaultOptions("BadwaterSource")).toMatchObject({ strength: 3 });
  });
});

describe("the options are checked in words, never clamped (D337 (5), (6); D342)", () => {
  it("a strength above the ceiling is refused with the ceiling in the reason; a negative one (a sink) is allowed", () => {
    expect(optionProblems("WaterSeep", { WaterSource: { SpecifiedStrength: 32 } })).toEqual([]);
    expect(optionProblems("WaterSeep", { WaterSource: { SpecifiedStrength: 33 } })[0]).toMatch(/at most 32 water a second \(8 for each of its 4 tiles\)/);
    expect(optionProblems("BadwaterSource", { WaterSource: { SpecifiedStrength: 72 } })).toEqual([]);
    expect(optionProblems("BadwaterSource", { WaterSource: { SpecifiedStrength: 73 } })[0]).toMatch(/at most 72/);
    expect(optionProblems("WaterSource", { WaterSource: { SpecifiedStrength: 9 } })[0]).toMatch(/at most 8/);
    expect(optionProblems("WaterSource", { WaterSource: { SpecifiedStrength: -3, CurrentStrength: -3 } })).toEqual([]);
    expect(optionProblems("WaterSource", { WaterSource: { SpecifiedStrength: Number.NaN } })[0]).toMatch(/number of water/);
  });

  it("a start delay: whole cycles from 1, days from 0; none for an aquifer; a core's countdown is always on", () => {
    const ok = { TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: 1, DaysUntilActivation: 0 } };
    expect(optionProblems("WaterSource", ok)).toEqual([]);
    expect(optionProblems("WaterSource", { TimeActivatedComponent: { CyclesUntilCountdownActivation: 0 } })[0]).toMatch(/from 1/);
    expect(optionProblems("WaterSource", { TimeActivatedComponent: { CyclesUntilCountdownActivation: 2.5 } })[0]).toMatch(/whole number/);
    expect(optionProblems("WaterSource", { TimeActivatedComponent: { DaysUntilActivation: -1 } })[0]).toMatch(/0 or more/);
    expect(optionProblems("Aquifer", ok)[0]).toMatch(/no start delay/);
    expect(optionProblems("UnstableCore", { TimeActivatedComponent: { IsEnabled: false } })[0]).toMatch(/always on/);
  });

  it("a core's radius is a whole number from 0 to 5; a reserve holds one of its kind's goods, up to its capacity", () => {
    expect(optionProblems("UnstableCore", { UnstableCore: { ExplosionRadius: 0 } })).toEqual([]);
    expect(optionProblems("UnstableCore", { UnstableCore: { ExplosionRadius: 5 } })).toEqual([]);
    expect(optionProblems("UnstableCore", { UnstableCore: { ExplosionRadius: 6 } })[0]).toMatch(/from 0 to 5/);
    expect(optionProblems("UnstableCore", { UnstableCore: { ExplosionRadius: 2.5 } })[0]).toMatch(/from 0 to 5/);
    expect(optionProblems("ReservePile", { FixedStockpile: { FixedGoodId: "Water" } })[0]).toMatch(/holds piles: Water is not one/);
    expect(optionProblems("ReserveTank", { FixedStockpile: { FixedGoodId: "Water" } })).toEqual([]);
    expect(optionProblems("ReserveTank", { "Inventory:Stockpile": { Storage: { Goods: [{ Good: "Water", Amount: 301 }] } } })[0]).toMatch(/at most 300/);
    expect(optionProblems("ReserveTank", { "Inventory:Stockpile": { Storage: { Goods: [{ Good: "Water", Amount: -1 }] } } })[0]).toMatch(/0 or more/);
  });

  it("an option's patch for a placed object: a delay zeroes a source's current strength; a good keeps its amount", () => {
    const seep = placeComponents("WaterSeep", { strength: 2 })!;
    const delayed = optionsPatch("WaterSeep", seep, { timed: { enabled: true, cycles: 3, days: 2 } }) as Record<string, Record<string, unknown>>;
    expect(delayed.WaterSource).toEqual({ SpecifiedStrength: 2, CurrentStrength: 0 });
    expect(delayed.TimeActivatedComponent).toEqual({ IsEnabled: true, CyclesUntilCountdownActivation: 3, DaysUntilActivation: 2 });
    const pile = placeComponents("ReservePile", { good: "Log", amount: 40 })!;
    const swapped = optionsPatch("ReservePile", pile, { good: "Plank" }) as Record<string, Record<string, unknown>>;
    expect(swapped["Inventory:Stockpile"]).toEqual({ Storage: { Goods: [{ Good: "Plank", Amount: 40 }] } });
    expect(swapped.FixedStockpile).toEqual({ FixedGoodId: "Plank" });
  });
});
