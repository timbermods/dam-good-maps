// The left shelf's objects (PLAN §20 D184): the game's placeable objects, each a small render of itself in
// the map's look. Picking one shows its ghost under the pointer, green where it fits and red where
// it doesn't, with the reason in a quiet word; a click places it, R turns it, Esc puts it back.
// Trees and bushes: a click places one, a drag paints many, clustered as the generator's groves
// and patches are. The two sources come right after the start (D212): a click places one, and its
// water spreads at once.

import { hash32 } from "../core/math/hash";

export interface ShelfItem {
  id: string;
  name: string;
  /** The object it places (its icon and ghost); a ruin's and a relic's follow their option. */
  template: string;
  /** A drag paints many (trees and bushes), this share of the tiles under the brush. */
  fill?: number;
  /** R turns it (a quarter turn each time). */
  turns: boolean;
  /** Words for its button's tooltip. */
  hint: string;
  /** A water source: clean or bad (its strength in the options). */
  source?: "clean" | "bad";
  /** Its key, when it has one. */
  key?: string;
}

export const SHELF: readonly ShelfItem[] = [
  { id: "start", name: "Start", template: "StartingLocation", turns: true, hint: "the district center: click where the colony starts; R turns its door" },
  { id: "water-source", name: "Water source", template: "WaterSource", source: "clean", key: "6", turns: false, hint: "click where the water starts; its strength in the options. Over a source, Shift+scroll sets its strength; drag it to move it" },
  { id: "badwater-source", name: "Badwater source", template: "BadwaterSource", source: "bad", turns: false, hint: "click where badwater starts; its strength in the options. Over a source, Shift+scroll sets its strength; drag it to move it" },
  { id: "Pine", name: "Pine", template: "Pine", fill: 0.8, turns: true, hint: "click one, or drag to plant a grove" },
  { id: "Birch", name: "Birch", template: "Birch", fill: 0.8, turns: true, hint: "click one, or drag to plant a grove" },
  { id: "Oak", name: "Oak", template: "Oak", fill: 0.8, turns: true, hint: "click one, or drag to plant a grove" },
  { id: "BlueberryBush", name: "Berry bush", template: "BlueberryBush", fill: 0.55, turns: true, hint: "click one, or drag to plant a patch" },
  { id: "ruin", name: "Ruin", template: "RuinColumnH3", turns: true, hint: "a ruined tower; its height in the options" },
  { id: "UndergroundRuins", name: "Mine site", template: "UndergroundRuins", turns: true, hint: "the scrap mine is built on it late in the game" },
  { id: "relic", name: "Relic", template: "SmallRelic", turns: true, hint: "demolished for science; its size in the options" },
  { id: "Slope", name: "Slope", template: "Slope", turns: true, hint: "a natural slope up a 1-level step: R turns it to face the step" },
  { id: "Thorns", name: "Thorns", template: "Thorns", turns: true, hint: "blocks walking until builders clear it" },
  { id: "NaturalDam", name: "Natural dam", template: "NaturalDam", turns: true, hint: "holds water back until it is demolished" },
  { id: "Blockage", name: "Blockage", template: "Blockage", turns: true, hint: "closes a channel until it is demolished" },
  { id: "GeothermalField", name: "Geothermal field", template: "GeothermalField", turns: true, hint: "a geothermal engine on it makes free power" },
];

export interface ShelfOptions {
  /** A ruin's height, 1–8 levels. */
  ruinHeight: number;
  relicSize: "small" | "medium" | "large";
}

export const DEFAULT_SHELF_OPTIONS: ShelfOptions = { ruinHeight: 3, relicSize: "small" };

/** The object an item places with its options. */
export function templateOf(item: ShelfItem, o: ShelfOptions): string {
  if (item.id === "ruin") return `RuinColumnH${Math.max(1, Math.min(8, Math.round(o.ruinHeight)))}`;
  if (item.id === "relic") return o.relicSize === "large" ? "LargeRelic" : o.relicSize === "medium" ? "MediumRelic" : "SmallRelic";
  return item.template;
}

/** The tiles a drag paints round (x, y), `r` tiles across its radius: `fill` of them, picked by a
 *  hash of the tile and the drag's seed, so a grove is dense in its middle and ragged at its edge,
 *  as the generator's are. */
export function paintTiles(x: number, y: number, r: number, fill: number, seed: number, W: number, H: number): number[] {
  const out: number[] = [];
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const tx = Math.floor(x) + dx;
      const ty = Math.floor(y) + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d > r) continue;
      // denser in the middle, thinning to the edge
      const p = fill * (1 - 0.5 * (d / Math.max(0.5, r)) ** 2);
      if ((hash32(seed, tx, ty) >>> 0) / 4294967296 < p) out.push(ty * W + tx);
    }
  return out;
}

/** Why an object can't stand somewhere, in a quiet word or two beside the pointer (D184: "needs
 *  flat ground"): the worker's and the start's reasons, shortened. */
export function quietWord(problem: string): string {
  const p = problem.toLowerCase();
  if (/inside the ground|not level|would float|level ground/.test(p)) return "needs level ground";
  if (/district center/.test(p)) return "the start stands there";
  if (/off the map|does not fit on the map|map edge/.test(p)) return "too near the edge";
  if (/cave|overhang/.test(p)) return "a cave is there";
  if (/under water|in a river/.test(p)) return "under water";
  const stands = /^(an? [a-z ]+) stands there/.exec(p);
  if (stands) return `${stands[1]} is there`;
  if (/on an object|another object/.test(p)) return "something is there";
  return p.replace(/^it can't stand there: /, "");
}
