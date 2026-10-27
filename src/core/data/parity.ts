// The game's own values for the objects the shelf places by the game's editor's rules (PLAN §20 D337,
// D338, D339), read from Timberborn 1.1.2.4's blueprints and code and pinned in parity-values.json by
// feature/parity tools/export-parity.ts (the extractor remains on that branch). Everything here is a fact of the game, in our own
// words; the game's files are not in the repository.
//
// Where each value comes from (blueprints under `MapEditor/`, and the decompiled assemblies):
// - a water object's footprint, the tiles its strength is spread over, its default strength and its
//   contamination: `MapEditor/Water/*` (`WaterSourceSpec`, `BlockObjectSpec`, `WaterSourceContaminationSpec`);
// - the ceiling of 8 for each emitting tile: `Configurations/WaterStrength` (`MaxWaterSourceStrength`); the game
//   only limits a source's strength from above (`WaterSource.LimitStrength`), so a negative strength is legal:
//   the water column loses that much each second (`UpdateWaterSourcesTask`, `WaterDepthSetter`, floored at 0);
// - a seep switches off while the water over its anchor is deeper than 0.8 and back on below 0.72 (0.9 of the
//   limit): `WaterDepthStrengthModifier`;
// - the start delay: `TimedComponentActivator` (a countdown of `DaysUntilActivation` days starts on the first
//   day of cycle `CyclesUntilCountdownActivation`; the editor's fields take cycles of 1 or more and days of 0
//   or more); the spec's defaults are 5 cycles and 10 days, and a source is optionally activable except an
//   aquifer, which has none;
// - an unstable core: its radius runs 0 to 5 (default 5), it explodes a sphere of `radius + 1` (`InnerRadius`)
//   round its footprint's centre at the height of its base, in the first day of cycle `cycles` plus 10.5 days
//   (its countdown is not optional); `Explosions/ExplosionOutcomeGatherer`;
// - the reserves: `StockpileSpec` (capacity and the type of good it holds) and the map editor's fixed-stockpile
//   panel (`FixedStockpileInventorySetter`: a new one holds the first good of its type, in full).

import data from "./parity-values.json" with { type: "json" };

/** The most a water object emits for each tile it emits into (`MaxWaterSourceStrength`). */
export const MAX_STRENGTH_PER_TILE: number = data.maxStrengthPerTile;

export interface FluidSpec {
  /** The block object's size (x, y, z). */
  size: readonly [number, number, number];
  flippable: boolean;
  /** Has the start delay (the game's `TimedComponentActivator`). */
  timed: boolean;
  /** The local tiles its strength is spread over (none: it emits nothing, the drill). */
  tiles?: readonly (readonly [number, number])[];
  defaultStrength?: number;
  /** 0 clean, 1 badwater. */
  contamination?: number;
  /** A seep stops while the water over it is deeper than this. */
  depthLimit?: number;
  /** It runs only in these weathers (the drain: badtides). */
  activeIn?: readonly string[];
  /** It gives no water until a powered drill stands on it (an aquifer). */
  needsDrill?: boolean;
  /** It stands on one of these objects (the drill on an aquifer). */
  on?: readonly string[];
}

export const FLUIDS: Readonly<Record<string, FluidSpec>> = data.fluids as unknown as Record<string, FluidSpec>;

/** The objects that carry a `WaterSource` component and emit water or badwater. */
export const EMITTING = Object.keys(FLUIDS).filter((t) => FLUIDS[t].tiles);

export const isFluid = (template: string): boolean => template in FLUIDS;

/** The most an object's strength may be (8 for each emitting tile: 72 for a badwater source, 32 for a seep). */
export function maxStrength(template: string): number {
  return MAX_STRENGTH_PER_TILE * (FLUIDS[template]?.tiles?.length ?? 1);
}

/** The game's default strength for a new object (water 1, badwater 3, the rest 1). */
export function defaultStrength(template: string): number {
  return FLUIDS[template]?.defaultStrength ?? 1;
}

/** A seep's restart depth: back on below this (0.9 of the limit: 0.72). */
export const SEEP_RESTART_SCALE: number = data.seepRestartScale;

/** The start delay's defaults and least values (`TimedComponentActivator`). */
export const TIMED: { cycles: number; days: number; minCycles: number; minDays: number } = data.timed;

/** The start delay of a water object or a core: `enabled` false means it starts at once (the numbers are what
 *  the game keeps meanwhile, the spec's defaults). */
export interface Timed {
  enabled: boolean;
  cycles: number;
  days: number;
}

export const NO_DELAY: Timed = { enabled: false, cycles: TIMED.cycles, days: TIMED.days };

/** Unstable cores: radius range, the sphere added to it, the countdown. */
export const CORE: { minRadius: number; maxRadius: number; defaultRadius: number; innerRadius: number; cycles: number; days: number; optional: boolean; minCycles: number; minDays: number } = data.core;

export interface ReserveSpec {
  /** What it holds: the type of good. */
  type: "Pileable" | "Box" | "Liquid";
  capacity: number;
  /** The building cost the game keeps in its construction inventory (a finished reserve stores it). */
  cost: Readonly<Record<string, number>>;
  size: readonly [number, number, number];
}

export const RESERVES: Readonly<Record<string, ReserveSpec>> = data.reserves as unknown as Record<string, ReserveSpec>;
export const isReserve = (template: string): boolean => template in RESERVES;

/** The goods a reserve of this template may hold, the ones every faction has first. */
export function goodsFor(template: string): { id: string; common: boolean }[] {
  const t = RESERVES[template]?.type;
  if (!t) return [];
  const g = data.goods[t];
  return [...g.common.map((id) => ({ id, common: true })), ...g.other.map((id) => ({ id, common: false }))];
}

/** The good a new reserve holds and how much: the first good of its type the game offers, in full
 *  (`FixedStockpileInventorySetter`). */
export function defaultStock(template: string): { good: string; amount: number } {
  const r = RESERVES[template];
  return { good: data.defaultGood[r.type], amount: r.capacity };
}

/** A good's name for the options: its id in words ("PineResin" → "Pine resin"). */
export function goodName(id: string): string {
  const words = id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
