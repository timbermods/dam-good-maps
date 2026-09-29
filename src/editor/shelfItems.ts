// The left shelf's objects (PLAN §20 D184): the game's placeable objects, each a small render of itself in
// the map's look. Picking one shows its ghost under the pointer, green where it fits and red where
// it doesn't, with the reason in a quiet word; a click places it, R turns it, Esc puts it back.
// Trees and bushes: a click places one, a drag paints many, clustered as the generator's groves
// and patches are. The two sources come first, then the start (D212, D226's order: Water source,
// Badwater source, Start, Pine, then the rest): a click places a source, and its water spreads at once.

import { defaultOptions, type ObjectOptions } from "../core/doc/objectOps";
import type { PaintAge, PaintKind } from "../core/doc/paintParams";
import { DEFAULT_DENSITY } from "../core/gen/paint";
import { hash32 } from "../core/math/hash";

export interface ShelfItem {
  id: string;
  name: string;
  /** The object it places (its icon and ghost); a ruin's and a relic's follow their option. */
  template: string;
  /** A drag paints this kind of object (D235, D338): a stroke of trees, bushes, succulents, mixed woods, ruin
   *  fields or thorn patches, sized like the terrain brushes; a click places one. */
  brush?: PaintKind;
  /** R turns it (a quarter turn each time). */
  turns: boolean;
  /** Words for its button's tooltip. */
  hint: string;
  /** A water source: clean or bad (its strength in the options). */
  source?: "clean" | "bad";
  /** The game's other objects with options of their own: a water object (strength, start delay), an unstable core
   *  (radius, cycle) or a reserve (its good and how much): PLAN §20 D337, D338. */
  options?: "fluid" | "core" | "reserve";
  /** Its key, when it has one. */
  key?: string;
}

const GROVE = "click one, or drag to plant a grove";
const PATCH = "click one, or drag to plant a patch";

export const SHELF: readonly ShelfItem[] = [
  { id: "water-source", name: "Water source", template: "WaterSource", source: "clean", key: "6", turns: false, hint: "click where the water starts; its strength in the options. Over a source, Ctrl+scroll sets its strength; drag it to move it" },
  { id: "badwater-source", name: "Badwater source", template: "BadwaterSource", source: "bad", turns: false, hint: "click where badwater starts; its strength in the options. Over a source, Ctrl+scroll sets its strength; drag it to move it" },
  { id: "start", name: "Start", template: "StartingLocation", turns: true, hint: "the district center: click where the colony starts; R turns its door" },
  { id: "Pine", name: "Pine", template: "Pine", brush: "trees", turns: true, hint: GROVE },
  { id: "Birch", name: "Birch", template: "Birch", brush: "trees", turns: true, hint: GROVE },
  { id: "Oak", name: "Oak", template: "Oak", brush: "trees", turns: true, hint: GROVE },
  { id: "BlueberryBush", name: "Berry bush", template: "BlueberryBush", brush: "bushes", turns: true, hint: PATCH },
  { id: "Succulent", name: "Succulent", template: "Succulent", brush: "succulents", turns: true, hint: "it lives on dry ground only: click one, or drag to plant a stand" },
  { id: "woods", name: "Mixed woods", template: "Oak", brush: "woods", turns: true, hint: "the generator's own mix of pine, birch and oak: click one, or drag to plant woods" },
  { id: "ruin", name: "Ruin", template: "RuinColumnH3", brush: "ruins", turns: true, hint: "a ruined tower: click one (its height in the options), or drag to paint a ruin field as the generator grows one" },
  { id: "UndergroundRuins", name: "Mine site", template: "UndergroundRuins", turns: true, hint: "the scrap mine is built on it late in the game" },
  { id: "relic", name: "Relic", template: "SmallRelic", turns: true, hint: "demolished for science; its size in the options" },
  { id: "Slope", name: "Slope", template: "Slope", turns: true, hint: "a natural slope up a 1-level step: R turns it to face the step" },
  { id: "Thorns", name: "Thorns", template: "Thorns", brush: "thorns", turns: true, hint: "blocks walking until builders clear it: click one, or drag to paint patches shaped like the official maps'" },
  { id: "NaturalDam", name: "Natural dam", template: "NaturalDam", turns: true, hint: "holds water back until it is demolished" },
  { id: "Blockage", name: "Blockage", template: "Blockage", turns: true, hint: "closes a channel until it is demolished" },
  { id: "GeothermalField", name: "Geothermal field", template: "GeothermalField", turns: true, hint: "a geothermal engine on it makes free power" },
  { id: "WaterSeep", name: "Water seep", template: "WaterSeep", options: "fluid", turns: true, hint: "2 x 2: water seeps up, and stops while more than 0.8 deep stands over it, so it never fills a crater" },
  { id: "BadwaterSeep", name: "Badwater seep", template: "BadwaterSeep", options: "fluid", turns: true, hint: "2 x 2: badwater seeps up, and stops while more than 0.8 deep stands over it" },
  { id: "Aquifer", name: "Aquifer", template: "Aquifer", options: "fluid", turns: true, hint: "an underground source: it gives no water until a powered drill stands on it, so none at the map's start" },
  { id: "AncientAquiferDrill", name: "Aquifer drill", template: "AncientAquiferDrill", turns: true, hint: "stands on an aquifer; it starts without power, so the aquifer stays dry until the colony powers it" },
  { id: "BadtideDrain", name: "Badtide drain", template: "BadtideDrain", options: "fluid", turns: true, hint: "1 x 3, facing the way it flows (R turns it): it spews badwater only during a badtide; the day-by-day Badtide button will run it once it lands" },
  { id: "UnstableCore", name: "Unstable core", template: "UnstableCore", options: "core", turns: true, hint: "it explodes in its cycle: a sphere of its radius plus one clears the ground and what stands there. Select one to see what it will clear" },
  { id: "ReservePile", name: "Reserve pile", template: "ReservePile", options: "reserve", turns: true, hint: "a stock of one pileable good the colony can take (up to 160)" },
  { id: "ReserveWarehouse", name: "Reserve warehouse", template: "ReserveWarehouse", options: "reserve", turns: true, hint: "a stock of one boxed good the colony can take (up to 200)" },
  { id: "ReserveTank", name: "Reserve tank", template: "ReserveTank", options: "reserve", turns: true, hint: "a stock of one liquid the colony can take (up to 300)" },
];

export interface ShelfOptions {
  /** A ruin's height, 1–8 levels. */
  ruinHeight: number;
  relicSize: "small" | "medium" | "large";
  /** A brush item's radius in tiles: the terrain brushes' Size (the slider, F, [ and ]), shared by every brush
   *  item; 1 places exactly one. */
  size: number;
  /** How densely each kind of brush lands, remembered (a sparse scatter to a dense grove). */
  density: Record<PaintKind, number>;
  /** Trees, succulents and mixed woods: grown, or mixed with saplings. */
  age: PaintAge;
  /** The options of the objects with options, by template, over the game's defaults. */
  objects: Record<string, ObjectOptions>;
}

export const DEFAULT_SHELF_OPTIONS: ShelfOptions = { ruinHeight: 3, relicSize: "small", size: 3, density: { ...DEFAULT_DENSITY }, age: "grown", objects: {} };

/** The options an object will be placed with: the game's defaults, then what the player set. */
export function objectOptions(o: ShelfOptions, template: string): ObjectOptions {
  return { ...defaultOptions(template), ...(o.objects[template] ?? {}) };
}

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
  if (/aquifer under/.test(p)) return "needs an aquifer";
  if (/district center/.test(p)) return "the start stands there";
  if (/off the map|does not fit on the map|map edge/.test(p)) return "too near the edge";
  if (/cave|overhang/.test(p)) return "a cave is there";
  if (/under water|in a river/.test(p)) return "under water";
  const stands = /^(an? [a-z ]+) stands there/.exec(p);
  if (stands) return `${stands[1]} is there`;
  if (/on an object|another object/.test(p)) return "something is there";
  return p.replace(/^it can't stand there: /, "");
}
