// What is on a tile, in plain data (PLAN §20 D347, item B11; D342): the ground under the pointer and
// every object standing on it, each with its key fact where one is useful ("Ruin, 5 levels, 75 scrap
// metal", "Water source, 1 water/s", "Pine, grown"). The hover readout only formats and shows this.
//
// `describeTile` works on plain facts (`TileFacts`), so the page can hand it its own view of the map
// and the core can hand it a session's: `describeTileOf` is the session's. Contract tests call it
// directly (tests/contract/describeTile.test.ts).

import { isDead, isSapling } from "../analysis/wood";
import { entityTiles } from "../features/edits";
import { isObject, JsonFloat, num, plainJson } from "../format/json";
import type { Orientation } from "../format/footprints";
import type { EntitySpec } from "../format/entities";
import { componentsOf, placementOf } from "../format/entities";
import type { MapSession } from "./session";
import { kindName } from "./tools";

/** An object standing on a tile, as far as its description goes. */
export interface TileObject {
  template: string;
  dead?: boolean;
  /** A sapling (growth below 1). */
  young?: boolean;
  /** A source's strength, blocks per second. */
  strength?: number;
}

/** What `describeTile` needs to know about a map, one tile at a time. */
export interface TileFacts {
  W: number;
  H: number;
  height(i: number): number;
  /** The water on the tile, or null when it is dry. `contamination` is 0–1. */
  water(i: number): { depth: number; contamination: number } | null;
  /** The soil on the tile's top, or null when the map has none to say. */
  soil(i: number): "moist" | "dry" | "contaminated" | null;
  /** The objects whose footprint covers the tile. */
  objects(i: number): TileObject[];
}

export interface TileGround {
  height: number;
  water: { depth: number; badwater: boolean; percentBad: number } | null;
  soil: "moist" | "dry" | "contaminated" | null;
}

/** One object on the tile: its plain name, its fact where it has one, and the words for both. */
export interface DescribedObject {
  template: string;
  /** "Pine", "Ruin", "Mine site", "Water source" … */
  name: string;
  /** "grown", "5 levels, 75 scrap metal", "1 water/s", "medium" … or null. */
  fact: string | null;
  text: string;
}

export interface TileDescription {
  x: number;
  y: number;
  ground: TileGround;
  objects: DescribedObject[];
}

/** Scrap metal in one ruin column per level of its height (a field's target is 15 per level a column). */
export const SCRAP_PER_LEVEL = 15;

/** The game's names of the objects that have their own (the checks' messages read them too: rust/checks, tools/rust/checks-tables.ts). */
export const NAMES: Record<string, string> = {
  Pine: "Pine",
  Birch: "Birch",
  Oak: "Oak",
  Maple: "Maple",
  ChestnutTree: "Chestnut tree",
  Mangrove: "Mangrove",
  Succulent: "Succulent",
  BlueberryBush: "Blueberry bush",
  Slope: "Slope",
  WaterSource: "Water source",
  BadwaterSource: "Badwater source",
  StartingLocation: "Start",
  Blockage: "Blockage",
  NaturalDam: "Natural dam",
  Thorns: "Thorns",
  GeothermalField: "Geothermal field",
  UndergroundRuins: "Mine site",
  UnstableCore: "Unstable core",
};

const TREES = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent)$/;

/** The number of levels in "1 level" / "5 levels". */
const levels = (n: number) => `${n} level${n === 1 ? "" : "s"}`;

/** Describe one object: its name and its key fact. */
export function describeObject(o: TileObject): DescribedObject {
  const template = o.template;
  const ruin = /^RuinColumnH(\d+)$/.exec(template);
  const relic = /^(Small|Medium|Large)Relic$/.exec(template);
  let name = NAMES[template] ?? template.replace(/([a-z])([A-Z])/g, "$1 $2");
  let fact: string | null = null;
  if (ruin) {
    const h = Number(ruin[1]);
    name = "Ruin";
    fact = `${levels(h)}, ${(h * SCRAP_PER_LEVEL).toLocaleString("en-GB")} scrap metal`;
  } else if (relic) {
    name = "Relic";
    fact = relic[1].toLowerCase();
  } else if (TREES.test(template) || template === "BlueberryBush") {
    fact = o.dead ? "dead" : o.young ? "young" : "grown";
  } else if (template === "WaterSource" || template === "BadwaterSource") {
    if (o.strength !== undefined) fact = `${o.strength} ${template === "BadwaterSource" ? "badwater" : "water"}/s`;
  }
  return { template, name, fact, text: fact ? `${name}, ${fact}` : name };
}

/** The ground of tile i: its height, its water, and its soil once dry. */
function groundOf(f: TileFacts, i: number): TileGround {
  const w = f.water(i);
  const percent = w ? Math.round(w.contamination * 100) : 0;
  return {
    height: f.height(i),
    water: w ? { depth: w.depth, badwater: w.contamination >= 0.95, percentBad: w.contamination > 0.05 && w.contamination < 0.95 ? percent : 0 } : null,
    soil: w ? null : f.soil(i),
  };
}

/** What is on tile (x, y): its ground and each object standing on it. */
export function describeTile(f: TileFacts, x: number, y: number): TileDescription | null {
  if (x < 0 || y < 0 || x >= f.W || y >= f.H) return null;
  const i = y * f.W + x;
  return { x, y, ground: groundOf(f, i), objects: f.objects(i).map(describeObject) };
}

// ------------------------------------------------------------------- the water-changed signal

/** The water-changed signal (D347, D387 (1)): the readout's water words for tile (x, y) exactly as
 *  shown ("Water 0.6 deep, bed level 4"; "Height 5, moist soil" once dry), or null off the map. For the
 *  page: keep it with the readout's text; after each water state it shows (a stroke's water, the
 *  journey's frames, the settled water, the weather's days, an edit's, undo's or redo's answer, an
 *  opened map) ask again for the hovered tile and re-describe only when it differs. One tile, about
 *  a microsecond (tests/contract/waterSignal.test.ts covers each path). */
export function readoutWater(f: TileFacts, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= f.W || y >= f.H) return null;
  return groundWords(groundOf(f, y * f.W + x));
}

/** Whether the readout's water words for tile (x, y) differ between two water states. */
export function readoutWaterChanged(before: TileFacts, after: TileFacts, x: number, y: number): boolean {
  return readoutWater(before, x, y) !== readoutWater(after, x, y);
}

/** The ground in words: "Height 5, dry soil", "Water 0.6 deep, bed level 4". */
export function groundWords(g: TileGround): string {
  if (g.water) {
    const d = g.water.depth;
    const deep = d < 0.1 ? d.toFixed(2) : d.toFixed(1);
    const parts = [`${g.water.badwater ? "badwater" : "water"} ${deep} deep`, `bed level ${g.height}`];
    if (g.water.percentBad) parts.push(`${g.water.percentBad}% badwater`);
    return capital(parts.join(", "));
  }
  const parts = [`height ${g.height}`];
  if (g.soil) parts.push(g.soil === "contaminated" ? "contaminated soil" : `${g.soil} soil`);
  return capital(parts.join(", "));
}

/** The readout: the objects, then the ground they stand on ("Geothermal field · Height 5, dry soil");
 *  the ground alone where nothing stands. */
export function tileWords(d: TileDescription | null): string {
  if (!d) return "";
  const ground = groundWords(d.ground);
  if (!d.objects.length) return ground;
  const shown = d.objects.slice(0, 3).map((o) => o.text);
  const more = d.objects.length - shown.length;
  return `${shown.join("; ")}${more > 0 ? ` and ${more} more` : ""} · ${ground}`;
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --------------------------------------------------------------------------------- a session's

const numeric = (v: unknown): number | undefined => (typeof v === "number" ? v : v instanceof JsonFloat ? num(v) : undefined);

/** An entity as a `TileObject`. */
export function objectOf(e: EntitySpec): TileObject {
  const comps = componentsOf(e);
  const out: TileObject = { template: e.template };
  if (isDead(comps)) out.dead = true;
  else if (isSapling(comps)) out.young = true;
  const w = comps?.WaterSource;
  if (isObject(w)) {
    const v = numeric(w.SpecifiedStrength);
    if (v !== undefined) out.strength = Math.round(v * 100) / 100;
  }
  return out;
}

/** A session's map as facts: the ground and the settled water it has now. */
export function tileFactsOf(s: MapSession): TileFacts {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const at = new Map<number, TileObject[]>();
  for (const e of b.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    const o = objectOf(e);
    for (const [tx, ty] of entityTiles(e)) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const i = ty * W + tx;
      const list = at.get(i);
      if (list) list.push(o);
      else at.set(i, [o]);
    }
  }
  // (an imported map's own water is the file's, `waterDepth` in placing.ts: the built water otherwise)
  const water = s.showsStoredWater ? storedDepth(s) : b.water;
  return {
    W,
    H,
    height: (i) => b.heights[i],
    water: (i) => (water[i] > 0.001 ? { depth: water[i], contamination: b.contamination[i] ?? 0 } : null),
    soil: (i) => (b.soilContamination[i] > 0 ? "contaminated" : b.moisture[i] > 0 ? "moist" : "dry"),
    objects: (i) => at.get(i) ?? [],
  };
}

function storedDepth(s: MapSession): ArrayLike<number> {
  const { x: W, y: H } = s.size;
  const out = new Float64Array(W * H);
  const w = s.storedWater();
  for (let k = 0; k < w.tile.length; k++) if (w.depth[k] > out[w.tile[k]]) out[w.tile[k]] = w.depth[k];
  return out;
}

/** What is on tile (x, y) of a session's map. */
export function describeTileOf(s: MapSession, x: number, y: number): TileDescription | null {
  return describeTile(tileFactsOf(s), x, y);
}

// ------------------------------------------------------------------- the entities on a tile

/** An entity as advanced mode's inspector and the source rows show it. */
export interface EntityInfo {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  flipped: boolean;
  /** What placed it: a feature's plain name, "placed by hand", "slopes" or "the imported map". */
  from: string;
  /** Its components other than BlockObject, as plain JSON. */
  components: Record<string, unknown>;
}

/** The entities whose footprint covers tile (x, y) of a session's map, topmost last. */
export function entitiesAtTile(s: MapSession, x: number, y: number): EntityInfo[] {
  const names = new Map(s.features.map((f) => [f.id, kindName(f)]));
  const out: EntityInfo[] = [];
  for (const e of s.built.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    if (!entityTiles(e).some(([tx, ty]) => tx === x && ty === y)) continue;
    const comps = componentsOf(e) as Record<string, unknown>;
    const { BlockObject: _bo, ...rest } = comps;
    const from = names.get(e.owner) ?? (e.owner === "placed" ? "placed by hand" : e.owner.startsWith("derived:") || e.owner.startsWith("pinned:") ? "slopes" : "the imported map");
    out.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, from, components: plainJson(rest) as Record<string, unknown> });
  }
  return out;
}
