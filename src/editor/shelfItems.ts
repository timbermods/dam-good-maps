// The left shelf's objects (PLAN §20 D184): the game's placeable objects, each a small render of itself in
// the map's look. Picking one shows its ghost under the pointer, green where it fits and red where
// it doesn't, with the reason in a quiet word; a click places it, R turns it, Esc puts it back.
// Trees and bushes: a click places one, a drag paints many, clustered as the generator's groves
// and patches are. The two sources come first, then the start (D212, D226's order: Water source,
// Badwater source, Start, Pine, then the rest): a click places a source, and its water spreads at once.

import { hash32 } from "../core/math/hash";
import { defaultOptions, type ObjectOptions } from "../core/doc/objectOps";
import { tip } from "../ui/Tooltip";

/** What a drag from the shelf paints (core/doc/paintParams.ts): its size and density are the object window's. */
export type PaintedKind = "trees" | "bushes" | "succulents" | "woods" | "thorns";

export interface ShelfItem {
  id: string;
  name: string;
  /** The object it places (its icon and ghost); a ruin's and a relic's follow their option. */
  template: string;
  /** A drag paints many (trees, bushes, thorns): what it paints, as the core's `paintObjects` names it. */
  paint?: PaintedKind;
  /** R turns it (a quarter turn each time). */
  turns: boolean;
  /** Words for its button's tooltip. */
  hint: string;
  /** A water source: clean or bad (its strength in the options). */
  source?: "clean" | "bad";
  /** Its picture is these objects side by side (Mixed woods), drawn from their own pictures. */
  picture?: readonly string[];
}

/** The objects menu's order (Layout 2, Kyler, 2026-10-03). */
export const SHELF: readonly ShelfItem[] = [
  { id: "start", name: "Start", template: "StartingLocation", turns: true, hint: "where the colony starts" },
  { id: "water-source", name: "Water source", template: "WaterSource", source: "clean", turns: false, hint: "where water starts" },
  { id: "badwater-source", name: "Badwater source", template: "BadwaterSource", source: "bad", turns: false, hint: "where badwater starts" },
  { id: "WaterSeep", name: "Water seep", template: "WaterSeep", turns: false, hint: "water that seeps up until it is deep" },
  { id: "BadwaterSeep", name: "Badwater seep", template: "BadwaterSeep", turns: false, hint: "badwater that seeps up until it is deep" },
  { id: "Aquifer", name: "Aquifer", template: "Aquifer", turns: false, hint: "water that waits for a drill" },
  { id: "AncientAquiferDrill", name: "Aquifer drill", template: "AncientAquiferDrill", turns: false, hint: "an ancient drill that taps the aquifer under it" },
  { id: "BadtideDrain", name: "Badtide drain", template: "BadtideDrain", turns: true, hint: "badwater that flows in a badtide" },
  { id: "NaturalDam", name: "Natural dam", template: "NaturalDam", turns: true, hint: "holds water back" },
  { id: "Pine", name: "Pine", template: "Pine", paint: "trees", turns: false, hint: "plant pines" },
  { id: "Birch", name: "Birch", template: "Birch", paint: "trees", turns: false, hint: "plant birches" },
  { id: "Oak", name: "Oak", template: "Oak", paint: "trees", turns: false, hint: "plant oaks" },
  { id: "Succulent", name: "Succulent", template: "Succulent", paint: "succulents", turns: false, hint: "plant succulents" },
  { id: "Woods", name: "Mixed woods", template: "Pine", picture: ["Pine", "Birch", "Oak"], paint: "woods", turns: false, hint: "plant pines, birches and oaks together" },
  { id: "BlueberryBush", name: "Berry bush", template: "BlueberryBush", paint: "bushes", turns: false, hint: "plant berry bushes" },
  { id: "ruin", name: "Ruin", template: "RuinColumnH3", turns: true, hint: "a ruined tower" },
  { id: "UndergroundRuins", name: "Mine site", template: "UndergroundRuins", turns: true, hint: "where a scrap mine goes" },
  { id: "relic", name: "Relic", template: "SmallRelic", turns: true, hint: "a relic to demolish for science" },
  { id: "Slope", name: "Slope", template: "Slope", turns: true, hint: "a slope up one level" },
  { id: "Thorns", name: "Thorns", template: "Thorns", paint: "thorns", turns: false, hint: "blocks the way until cleared" },
  { id: "Blockage", name: "Blockage", template: "Blockage", turns: true, hint: "closes a channel" },
  { id: "GeothermalField", name: "Geothermal field", template: "GeothermalField", turns: true, hint: "a spot for free power" },
  { id: "UnstableCore", name: "Unstable core", template: "UnstableCore", turns: false, hint: "blasts the land when it goes off" },
  { id: "ReservePile", name: "Reserve pile", template: "ReservePile", turns: false, hint: "a pile of goods the map starts with" },
  { id: "ReserveWarehouse", name: "Reserve warehouse", template: "ReserveWarehouse", turns: false, hint: "boxed goods the map starts with" },
  { id: "ReserveTank", name: "Reserve tank", template: "ReserveTank", turns: false, hint: "a liquid the map starts with" },
];

/** The legend's object lines and the objects menu's picture each shows (Kyler, 2026-10-03): the same pictures as
 *  the menu. Trees and bushes shows the pine's. */
export const LEGEND_TEMPLATES: Record<string, string> = {
  "Trees and bushes": "Pine",
  Start: "StartingLocation",
  Slope: "Slope",
  Ruins: "RuinColumnH3",
  "Mine site": "UndergroundRuins",
  "Water source": "WaterSource",
  "Badwater source": "BadwaterSource",
  "Geothermal field": "GeothermalField",
  Relic: "SmallRelic",
  Thorns: "Thorns",
  Blockage: "Blockage",
};

/** An item's tooltip (D368 (6)): what it is for, nothing more (Kyler, 2026-10-06: no keys on the shelf, and R's turn
 *  goes unsaid; R still turns a held item). */
export function shelfTip(it: ShelfItem) {
  return tip(it.hint.charAt(0).toUpperCase() + it.hint.slice(1));
}

/** What a plant's drag covers: how wide the brush is (tiles across) and how densely it plants (the core's 0.05 to 1). */
export interface PaintSettings {
  size: number;
  density: number;
}

export const PAINT_SIZE_MIN = 2;
export const PAINT_SIZE_MAX = 24;
export const PAINT_DENSITY_MIN = 0.05;

export interface ShelfOptions {
  /** A ruin's height, 1–8 levels. */
  ruinHeight: number;
  relicSize: "small" | "medium" | "large";
  /** Each kind's brush: its size and density, starting at the core's defaults (core/gen/paint.ts DEFAULT_DENSITY); a thorn patch is about seven tiles, so its brush starts wider. */
  paint: Record<PaintedKind, PaintSettings>;
  /** Trees, succulents and mixed woods: all grown, or mixed with saplings (the core's `age`). */
  treeAge: "grown" | "mixed";
  /** The water objects', the unstable core's and the reserves' options for the next one placed (core/doc/objectOps.ts), by template; what is not here is the game's default. */
  objects: Record<string, ObjectOptions>;
}

/** The options of the next `template` placed: what the player set, else the game's defaults. */
export function objectOptionsOf(o: ShelfOptions, template: string): ObjectOptions {
  return { ...defaultOptions(template), ...(o.objects[template] ?? {}) };
}

/** Whether a drag paints this item with a tree's age. */
export const hasAge = (kind: PaintedKind): boolean => kind === "trees" || kind === "succulents" || kind === "woods";

export const DEFAULT_SHELF_OPTIONS: ShelfOptions = {
  ruinHeight: 3,
  relicSize: "small",
  paint: {
    trees: { size: 4, density: 0.8 },
    bushes: { size: 4, density: 0.55 },
    succulents: { size: 4, density: 0.5 },
    woods: { size: 4, density: 0.8 },
    thorns: { size: 8, density: 0.6 },
  },
  treeAge: "grown",
  objects: {},
};

/** The object an item places with its options. */
export function templateOf(item: ShelfItem, o: ShelfOptions): string {
  if (item.id === "ruin") return `RuinColumnH${Math.max(1, Math.min(8, Math.round(o.ruinHeight)))}`;
  if (item.id === "relic") return o.relicSize === "large" ? "LargeRelic" : o.relicSize === "medium" ? "MediumRelic" : "SmallRelic";
  return item.template;
}

/** The tiles under the brush at (x, y): the disc `r` tiles across its radius, whole (the core thins it by the
 *  density). */
export function paintDisc(x: number, y: number, r: number, W: number, H: number): number[] {
  const out: number[] = [];
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const tx = Math.floor(x) + dx;
      const ty = Math.floor(y) + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= r) out.push(ty * W + tx);
    }
  return out;
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
  if (/water is in the way/.test(p)) return "water is in the way";
  if (/under water|in a river/.test(p)) return "under water";
  const stands = /^(an? [a-z ]+) stands there/.exec(p);
  if (stands) return `${stands[1]} is there`;
  if (/on an object|another object/.test(p)) return "something is there";
  return p.replace(/^it can't stand there: /, "");
}
