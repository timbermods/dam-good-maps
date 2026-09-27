// Starting wood (Kyler, 2026-09-25, D164): the start requirement counts logs, not trees. Species
// yield very different wood (the game's specs: oak 8 logs, pine 2 and resin, birch 1), so a count
// of trees misjudges the opening. Only a grown tree's logs count: a lumberjack cannot cut a
// sapling until it has grown (the game releases a tree's yield then), so a sapling's logs are shown
// apart, as wood still growing. A dead tree keeps its logs, and so does a tree that dies (only a
// succulent loses its yield). prototype/playability.py `growth_of` and `tree_logs` are the same
// rules.

import { DEAD_TREES_KEEP_LOGS, LOGS_PER_TREE_SPECIES } from "../data/logFloor";
import { isObject, JsonFloat, num, type JsonObject, type JsonValue } from "../format/json";

/** The species that give logs, most wood first. */
export const WOOD_SPECIES = ["Oak", "Pine", "Birch"] as const;
export type WoodSpecies = (typeof WOOD_SPECIES)[number];
export type WoodBySpecies = Record<WoodSpecies, number>;

export function noWood(): WoodBySpecies {
  return { Oak: 0, Pine: 0, Birch: 0 };
}

/** A number as a file stores it: a plain number, the parser's float, or the older {"Value": …}
 *  wrapper; null for anything else (never a number made up from a missing value). */
function numberOf(v: JsonValue | undefined): number | null {
  if (isObject(v) && Object.keys(v).length === 1 && "Value" in v) v = v.Value;
  if (typeof v !== "number" && !(v instanceof JsonFloat)) return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

/** How far a tree has grown, 0–1: its `Growable.GrowthProgress`. The game writes a Growable only
 *  while a tree grows, so no Growable, or no readable value, is a grown tree (null). */
export function growthOf(components: JsonObject | undefined): number | null {
  const g = components?.Growable;
  return isObject(g) ? numberOf(g.GrowthProgress) : null;
}

/** Whether the object is dead: its `LivingNaturalResource.IsDead`. */
export function isDead(components: JsonObject | undefined): boolean {
  const l = components?.LivingNaturalResource;
  return isObject(l) && l.IsDead === true;
}

/** Whether the tree is still a sapling: its growth is below 1. */
export function isSapling(components: JsonObject | undefined): boolean {
  const g = growthOf(components);
  return g !== null && g < 1;
}

/** The logs a lumberjack cuts from this object once it has grown: a tree that gives logs (Pine,
 *  Birch, Oak, and Maple, ChestnutTree and Mangrove on imported maps; the game's blueprints, pinned
 *  in data/log-floor.json, D224) gives what its `Yielder:Cuttable` holds when that is logs, else its
 *  species' yield (the game's default); anything else gives none, and so does a dead tree of a
 *  species that loses its yield when it dies (none of these in 1.1.2.4). */
export function treeLogs(template: string, components: JsonObject): number {
  const spec = LOGS_PER_TREE_SPECIES[template];
  if (spec === undefined) return 0;
  if (DEAD_TREES_KEEP_LOGS[template] === false && isDead(components)) return 0;
  const y = components["Yielder:Cuttable"];
  if (isObject(y) && isObject(y.Yield) && y.Yield.Good === "Log") {
    const n = numberOf(y.Yield.Amount);
    if (n !== null) return n > 0 ? n : 0;
  }
  return spec;
}

/** The wood in plain words by the species that give it: "all oak" from one species, "mostly oak"
 *  when one gives 60% or more, else the two that give most ("pine and oak"); empty without wood. */
export function woodWords(by: WoodBySpecies): string {
  const total = by.Oak + by.Pine + by.Birch;
  if (!(total > 0)) return "";
  const order = WOOD_SPECIES.filter((s) => by[s] > 0).sort((a, b) => by[b] - by[a]);
  if (order.length === 1) return `all ${order[0].toLowerCase()}`;
  if (by[order[0]] >= 0.6 * total) return `mostly ${order[0].toLowerCase()}`;
  return `${order[0].toLowerCase()} and ${order[1].toLowerCase()}`;
}

/** Starting wood in words, after its number of logs: the species, then the saplings' logs still
 *  growing (", mostly oak, plus about 40 growing"); empty without either. */
export function woodDetail(by: WoodBySpecies, growing: number): string {
  const parts = [woodWords(by), growing > 0 ? `plus about ${Math.round(growing)} growing` : ""].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}
