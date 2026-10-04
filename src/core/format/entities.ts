// Map entities in the shape official 1.1 maps store them (FORMAT.md §5), component order
// included. Every builder takes its Id from the caller: ids are hashed from the owning feature
// (PLAN §19.4), never random.

import { LOGS_PER_TREE_SPECIES } from "../data/logFloor";
import { CORE, FLUIDS, NO_DELAY, RESERVES, TIMED, type Timed } from "../data/parity";
import { F, isObject, num, type JsonObject } from "./json";
import type { Orientation, Placement } from "./footprints";

export interface EntitySpec {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  flipped: boolean;
  /** Components other than BlockObject, in file order. `before` ones precede BlockObject. */
  components: JsonObject;
  before?: JsonObject;
  /** The feature that placed it (kept in the document, never written to the .timber). */
  owner: string;
  /** An entity read from a file (an imported map, or a generation's stored base): its JSON exactly
   *  as read, written back unchanged. Edits replace it with an edited copy. */
  raw?: JsonObject;
}

export function entityJson(e: EntitySpec): JsonObject {
  if (e.raw) return e.raw;
  const bo: JsonObject = { Coordinates: { X: e.x, Y: e.y, Z: e.z } };
  if (e.orientation !== "Cw0") bo.Orientation = e.orientation;
  if (e.flipped) bo.Flipped = true;
  const comps: JsonObject = { ...(e.before ?? {}), BlockObject: bo, ...e.components };
  return { Id: e.id, Template: e.template, Components: comps };
}

/** An entity's components other than its placement as the file holds them: a read entity's own (its
 *  BlockObject among them), else the ones built for it, `before` first. */
export function componentsOf(e: EntitySpec): JsonObject {
  return (e.raw ? e.raw.Components : { ...(e.before ?? {}), ...e.components }) as JsonObject;
}

const yieldOf = (good: string, amount: number): JsonObject => ({ Yield: { Good: good, Amount: amount } });

/** The logs a grown tree of the species the generator plants gives (the game's blueprints, pinned
 *  in data/log-floor.json: Pine 2, Birch 1, Oak 8). */
export const TREE_LOGS: Record<string, number> = { Pine: LOGS_PER_TREE_SPECIES.Pine, Birch: LOGS_PER_TREE_SPECIES.Birch, Oak: LOGS_PER_TREE_SPECIES.Oak };
export const MAP_TREES = ["Pine", "Birch", "Oak", "Succulent"] as const;
export type TreeSpecies = (typeof MAP_TREES)[number];

interface Base {
  id: string;
  owner: string;
  x: number;
  y: number;
  z: number;
}

/** A wild tree. `growth` < 1 stores a sapling; `dead` stores LivingNaturalResource.IsDead (dead
 *  trees keep their logs, which is how official maps store trees on dry soil). */
export function tree(b: Base & { species: TreeSpecies; dead?: boolean; growth?: number }): EntitySpec {
  const c: JsonObject = { CoordinatesOffsetter: { Random: true } };
  if (b.dead) c.LivingNaturalResource = { IsDead: true };
  if (b.growth !== undefined && b.growth < 1) c.Growable = { GrowthProgress: F(b.growth) };
  if (b.species === "Succulent") {
    c["Yielder:Cuttable"] = yieldOf("Water", 2);
    c.DeadCuttableYieldRemover = { IsBlocked: false };
  } else {
    c["Yielder:Cuttable"] = yieldOf("Log", TREE_LOGS[b.species]);
    if (b.species === "Pine") c["Yielder:Gatherable"] = yieldOf("PineResin", 0);
  }
  return { ...pos(b), template: b.species, components: c };
}

/** A blueberry bush: ripe (3 berries ready) or regrowing its yield; `dead` stores
 *  LivingNaturalResource.IsDead (a kept bush on ground that kills it, D404). */
export function bush(b: Base & { ripe: boolean; regrowth?: number; dead?: boolean }): EntitySpec {
  const c: JsonObject = { CoordinatesOffsetter: { Random: true } };
  if (b.dead) c.LivingNaturalResource = { IsDead: true };
  if (b.ripe) {
    c["Yielder:Gatherable"] = yieldOf("Berries", 3);
    c.GatherableYieldGrower = { GrowthProgress: F(1) };
  } else {
    c["Yielder:Gatherable"] = yieldOf("Berries", 0);
    c.GatherableYieldGrower = { GrowthProgress: F(b.regrowth ?? 0.5) };
  }
  return { ...pos(b), template: "BlueberryBush", components: c };
}

export const RUIN_SCRAP_PER_LEVEL = 15;
export const RUIN_VARIANTS = ["A", "B", "C", "D", "E"] as const;

export function ruin(b: Base & { height: number; variant: string; orientation: Orientation }): EntitySpec {
  return {
    ...pos(b),
    orientation: b.orientation,
    template: `RuinColumnH${b.height}`,
    components: {
      "Yielder:Ruin": yieldOf("ScrapMetal", RUIN_SCRAP_PER_LEVEL * b.height),
      RuinModels: { VariantId: b.variant },
    },
  };
}

/** The `TimeActivatedComponent` a water object or a core writes: `IsEnabled` false starts at once (what the
 *  game's map editor writes for a new source, with the spec's countdown), true starts it `days` days into
 *  cycle `cycles` (TimedComponentActivator). Its four fields in the game's order. */
export function timeActivated(t: Timed = NO_DELAY): JsonObject {
  return { IsEnabled: t.enabled, CyclesUntilCountdownActivation: t.cycles, DaysUntilActivation: F(t.days), DaysPassed: F(0) };
}

/** A start delay from the component of an entity (the page's options read it). */
export function timedOf(components: JsonObject | Record<string, unknown> | undefined): Timed {
  const ta = components?.TimeActivatedComponent as Record<string, unknown> | undefined;
  if (!ta || typeof ta !== "object") return { ...NO_DELAY };
  const days = ta.DaysUntilActivation as { value?: number } | number | undefined;
  return {
    enabled: ta.IsEnabled === true,
    cycles: typeof ta.CyclesUntilCountdownActivation === "number" ? ta.CyclesUntilCountdownActivation : TIMED.cycles,
    days: typeof days === "number" ? days : typeof days?.value === "number" ? days.value : TIMED.days,
  };
}

/** WaterSource (1×1) or BadwaterSource (3×3). The WaterSource component precedes BlockObject,
 *  as in official maps. `timed`: a start delay (the source then stores no current strength until it starts). */
export function waterSource(b: Base & { strength: number; bad?: boolean; timed?: Timed }): EntitySpec {
  const running = !b.timed?.enabled;
  return {
    ...pos(b),
    template: b.bad ? "BadwaterSource" : "WaterSource",
    before: { WaterSource: { SpecifiedStrength: F(b.strength), CurrentStrength: F(running ? b.strength : 0) } },
    components: { TimeActivatedComponent: timeActivated(b.timed) },
  };
}

/** The objects the game's map editor places that carry a `WaterSource` beside the two sources: the seeps,
 *  the aquifer, the drill on it and the badtide drain (PLAN §20 D337), each written in the component order of
 *  the official maps (FORMAT.md §5, checked against Oasis, Pillars, Spillage and Nomads):
 *  - WaterSeep, BadwaterSeep: WaterSource, BlockObject, WaterDepthStrengthModifier, TimeActivatedComponent;
 *  - BadtideDrain: WaterSource, BlockObject, TimeActivatedComponent (its orientation is the way it flows);
 *  - Aquifer: BlockObject, WaterSource, no start delay, and no current strength (it gives nothing until a
 *    powered drill stands on it, and every drill starts without power);
 *  - AncientAquiferDrill: BlockObject alone.
 *  A negative strength is a sink (the game's `LimitStrength` only caps it from above). */
export function fluidObject(b: Base & { template: string; strength?: number; timed?: Timed; orientation?: Orientation; flipped?: boolean }): EntitySpec {
  const spec = FLUIDS[b.template];
  if (!spec) throw new Error(`${b.template} is not a water object`);
  const strength = b.strength ?? spec.defaultStrength ?? 1;
  const e = { ...pos(b), template: b.template, orientation: b.orientation ?? ("Cw0" as Orientation), flipped: !!b.flipped && spec.flippable };
  if (!spec.tiles) return { ...e, components: {} };
  if (spec.needsDrill) return { ...e, components: { WaterSource: { SpecifiedStrength: F(strength), CurrentStrength: F(0) } } };
  const delayed = !!b.timed?.enabled;
  const off = delayed || !!spec.activeIn;
  const components: JsonObject = {};
  if (spec.depthLimit !== undefined) components.WaterDepthStrengthModifier = { CurrentModifier: F(1) };
  components.TimeActivatedComponent = timeActivated(b.timed);
  return { ...e, before: { WaterSource: { SpecifiedStrength: F(strength), CurrentStrength: F(off ? 0 : strength) } }, components };
}

export function slope(b: Base & { orientation: Orientation }): EntitySpec {
  return { ...pos(b), orientation: b.orientation, template: "Slope", components: {} };
}

/** A map object official maps store with its BlockObject alone (FORMAT.md §5): Thorns, NaturalDam,
 *  Blockage, relics, GeothermalField, UndergroundRuins. Thorns, NaturalDam and Blockage are
 *  flippable, and the map editor turns and flips them at random. */
export function blockObject(b: Base & { template: string; orientation: Orientation; flipped?: boolean }): EntitySpec {
  return { ...pos(b), orientation: b.orientation, flipped: !!b.flipped, template: b.template, components: {} };
}

/** Official maps' countdown: 10.5 days after its cycle starts (notes/navigation_ruins_entities §8; the
 *  blueprint's `DaysUntilActivation`). */
export const CORE_DAYS = CORE.days;

/** An UnstableCore (2×2): it explodes `DaysUntilActivation` days into cycle `cycles`, removing the
 *  terrain and objects within a sphere of radius `radius` + 1 (the blueprint's `InnerRadius`; PLAN §20
 *  D339, `sim/explosion.ts`). `UnstableCore` must be written (the loader throws without it); the component
 *  order is the official maps': BlockObject, TimeActivatedComponent, UnstableCore. The countdown is not
 *  optional (`IsEnabled` is always true). */
export function unstableCore(b: Base & { orientation: Orientation; radius: number; cycles: number; days?: number; flipped?: boolean }): EntitySpec {
  return {
    ...pos(b),
    orientation: b.orientation,
    flipped: !!b.flipped,
    template: "UnstableCore",
    components: {
      TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: b.cycles, DaysUntilActivation: F(b.days ?? CORE_DAYS), DaysPassed: F(0) },
      UnstableCore: { ExplosionRadius: b.radius },
    },
  };
}

/** A reserve (ReservePile, ReserveWarehouse or ReserveTank): a stockpile of one good the map starts with,
 *  written as the official maps store it (Nomads' warehouses): BlockObject, FixedStockpile,
 *  SingleGoodAllower, Inventory:Stockpile, StockpileVisualizers, Inventory:ConstructionSite (the building's
 *  cost, kept because a reserve is placed finished). */
export function reserve(b: Base & { template: string; good: string; amount: number; orientation?: Orientation; flipped?: boolean }): EntitySpec {
  const spec = RESERVES[b.template];
  if (!spec) throw new Error(`${b.template} is not a reserve`);
  const amount = b.amount; // Validation refuses invalid stock; never round or clamp it.
  return {
    ...pos(b),
    orientation: b.orientation ?? "Cw0",
    flipped: !!b.flipped,
    template: b.template,
    components: {
      FixedStockpile: { FixedGoodId: b.good },
      SingleGoodAllower: { AllowedGood: b.good },
      "Inventory:Stockpile": { Storage: { Goods: amount !== 0 ? [{ Good: b.good, Amount: amount }] : [] } },
      StockpileVisualizers: { CurrentGood: b.good },
      "Inventory:ConstructionSite": { Storage: { Goods: Object.entries(spec.cost).map(([Good, Amount]) => ({ Good, Amount })) } },
    },
  };
}

export function startingLocation(b: Base & { orientation: Orientation; player?: number }): EntitySpec {
  // player is reserved for Timber Together maps (PLAN §20, D5); vanilla maps never write it
  return { ...pos(b), orientation: b.orientation, template: "StartingLocation", components: {} };
}

function pos(b: Base): Omit<EntitySpec, "template" | "components"> {
  return { id: b.id, owner: b.owner, x: b.x, y: b.y, z: b.z, orientation: "Cw0", flipped: false };
}

/** An entity of a world.json as a spec that writes back exactly as it was read. */
export function rawEntity(e: JsonObject, owner: string): EntitySpec {
  const p = placementOf(e);
  return {
    id: String(e.Id),
    template: String(e.Template),
    x: p?.x ?? 0,
    y: p?.y ?? 0,
    z: p?.z ?? 0,
    orientation: p?.orientation ?? "Cw0",
    flipped: p?.flipped ?? false,
    components: {},
    owner,
    raw: e,
  };
}

/** Where a world.json entity stands: template, Coordinates, Orientation and Flipped (0.6 maps
 *  wrap the enums as {"Value": ...}). Null for entities without a BlockObject. */
export function placementOf(e: JsonObject): Placement | null {
  const comps = e.Components;
  if (!isObject(comps)) return null;
  const bo = comps.BlockObject;
  if (!isObject(bo) || !isObject(bo.Coordinates)) return null;
  let o = bo.Orientation ?? "Cw0";
  if (isObject(o)) o = (o.Value as string) ?? "Cw0";
  let fl = bo.Flipped ?? false;
  if (isObject(fl)) fl = (fl.Value as boolean) ?? false;
  return {
    template: String(e.Template),
    x: num(bo.Coordinates.X),
    y: num(bo.Coordinates.Y),
    z: num(bo.Coordinates.Z),
    orientation: o as Orientation,
    flipped: fl === true,
  };
}
