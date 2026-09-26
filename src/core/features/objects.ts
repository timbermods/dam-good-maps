// Map objects (PLAN §5.7, §19.2 `mapObject`): the 1.0 objects a map carries as features. Single
// objects (mine sites, relics, geothermal fields, unstable cores) stand with the south-west corner
// of their rotated footprint at (x, y); lines and belts (thorn belts, NaturalDam weirs, Blockage
// plugs) put one object on every tile of their area. They are placed at build step 9, with the
// water sources and before the water settle (a weir and a plug hold water, thorns stop moisture),
// and they take their tiles before the resources (PLAN §20, D69).
//
// `fitProblems` is the one placement rule the generator, the editor's tools and the editor's
// footprint preview use: on the map, on level ground, dry, off rivers, free of other objects and
// clear of the start; the load checks (validate/checks.ts `entities.placement`) then prove the game
// keeps every object.

import { coordinatesForMinCorner, FOOTPRINTS, footprintTiles, ORIENTATIONS, type Orientation } from "../format/footprints";
import { blockObject, unstableCore, type EntitySpec } from "../format/entities";
import { hash32, tileHash01 } from "../math/hash";
import { runsToTiles } from "../math/grid";
import { entityId } from "./ids";
import type { MapObjectFeature, MapObjectKind, MapObjectParams } from "./schema";

/** The template each kind places. */
export const OBJECT_TEMPLATE: Record<MapObjectKind, string> = {
  mineSite: "UndergroundRuins",
  relicSmall: "SmallRelic",
  relicMedium: "MediumRelic",
  relicLarge: "LargeRelic",
  geothermal: "GeothermalField",
  thornBelt: "Thorns",
  weir: "NaturalDam",
  plug: "Blockage",
  bridge: "NaturalOverhang3x1",
  unstableCore: "UnstableCore",
};

/** Kinds this version builds. Natural bridges (NaturalOverhang pairs) come later (ROADMAP, Later). */
export const BUILT_OBJECTS: readonly MapObjectKind[] = ["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal", "thornBelt", "weir", "plug", "unstableCore"];
/** Kinds placed one per tile over an area. */
export const LINE_OBJECTS: readonly MapObjectKind[] = ["thornBelt", "weir", "plug"];
/** Kinds that need dry ground (a weir and a plug stand in water). */
const DRY_OBJECTS: readonly MapObjectKind[] = ["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal", "thornBelt", "unstableCore"];

/** Plain names, as the player sees them. */
export const OBJECT_NAMES: Record<MapObjectKind, string> = {
  mineSite: "Mine site",
  relicSmall: "Small relic",
  relicMedium: "Medium relic",
  relicLarge: "Large relic",
  geothermal: "Geothermal field",
  thornBelt: "Thorn belt",
  weir: "Weir",
  plug: "Plug",
  bridge: "Natural bridge",
  unstableCore: "Unstable core",
};

export function isLine(kind: MapObjectKind): boolean {
  return LINE_OBJECTS.includes(kind);
}

/** The rotated footprint's size (x, y) of a single object's template. */
export function rotatedSize(kind: MapObjectKind, o: Orientation): [number, number] {
  const s = FOOTPRINTS[OBJECT_TEMPLATE[kind]].size;
  return o === "Cw90" || o === "Cw270" ? [s[1], s[0]] : [s[0], s[1]];
}

export interface ObjectPlacement {
  template: string;
  /** Coordinates (FORMAT.md §4.4). */
  x: number;
  y: number;
  orientation: Orientation;
  flipped: boolean;
  /** Tile index of the Coordinates (the entity's local index, PLAN §19.4). */
  tile: number;
}

/** Where a feature's objects stand: one for a single object, one per tile for a line or belt.
 *  Lines and belts turn and flip each object by a hash of its tile, as the map editor does at
 *  random (notes/navigation_ruins_entities.md §12). */
export function placementsOf(f: MapObjectFeature, W: number, H: number): ObjectPlacement[] {
  const p = f.params;
  const template = OBJECT_TEMPLATE[p.kind];
  const out: ObjectPlacement[] = [];
  if ("area" in p.placement) {
    const sO = hash32(f.id, "orientation");
    const sF = hash32(f.id, "flip");
    for (const i of runsToTiles(p.placement.area, W)) {
      if (i < 0 || i >= W * H) continue;
      const x = i % W;
      const y = (i - x) / W;
      const orientation = ORIENTATIONS[Math.floor(tileHash01(sO, x, y) * 4)];
      out.push({ template, x, y, orientation, flipped: tileHash01(sF, x, y) < 0.5, tile: i });
    }
    return out;
  }
  const { x, y, orientation } = p.placement;
  const s = FOOTPRINTS[template].size;
  const [cx, cy] = coordinatesForMinCorner(s[0], s[1], x, y, orientation);
  out.push({ template, x: cx, y: cy, orientation, flipped: false, tile: cy * W + cx });
  return out;
}

/** The 2-D tiles a feature's objects cover (some may lie off the map when it no longer fits). */
export function objectTiles(f: MapObjectFeature, W: number, H: number): [number, number][] {
  if ("area" in f.params.placement) return placementsOf(f, W, H).map((p) => [p.x, p.y]);
  const p = placementsOf(f, W, H)[0];
  return footprintTiles(p.template, { template: p.template, x: p.x, y: p.y, z: 0, orientation: p.orientation, flipped: p.flipped });
}

/** The footprint tiles of a single object at (x, y) facing o, without a feature. */
export function footprintAt(kind: MapObjectKind, x: number, y: number, o: Orientation): [number, number][] {
  const template = OBJECT_TEMPLATE[kind];
  const s = FOOTPRINTS[template].size;
  const [cx, cy] = coordinatesForMinCorner(s[0], s[1], x, y, o);
  return footprintTiles(template, { template, x: cx, y: cy, z: 0, orientation: o, flipped: false });
}

/** The entities a map-object feature places (build step 9), each standing on the ground under it:
 *  a single object at the highest level under its footprint, a line's objects each on its tile. */
export function rasterizeObjects(f: MapObjectFeature, W: number, H: number, heights: Uint8Array, locked: Uint8Array | null = null): EntitySpec[] {
  const out: EntitySpec[] = [];
  if (!BUILT_OBJECTS.includes(f.params.kind)) return out;
  const tiles = objectTiles(f, W, H);
  // what a regeneration kept under a lock stays: generated objects leave locked tiles alone
  const keptOff = (x: number, y: number) => !!locked && f.origin === "generated" && x >= 0 && y >= 0 && x < W && y < H && locked[y * W + x] === 1;
  if (!("area" in f.params.placement) && tiles.some(([x, y]) => keptOff(x, y))) return out;
  for (const p of placementsOf(f, W, H)) {
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H || keptOff(p.x, p.y)) continue;
    let z = heights[p.tile];
    if (!("area" in f.params.placement)) for (const [tx, ty] of tiles) if (tx >= 0 && ty >= 0 && tx < W && ty < H) z = Math.max(z, heights[ty * W + tx]);
    const b = { id: entityId(f.id, p.template, p.tile), owner: f.id, x: p.x, y: p.y, z };
    if (f.params.kind === "unstableCore") {
      const c = f.params.core ?? { radius: 2, cycles: 5 };
      out.push(unstableCore({ ...b, orientation: p.orientation, radius: c.radius, cycles: c.cycles }));
    } else out.push(blockObject({ ...b, template: p.template, orientation: p.orientation, flipped: p.flipped }));
  }
  return out;
}

// ---------------------------------------------------------------------------------- the fit

/** What a placement is checked against: the map as it stands. */
export interface FitGround {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Settled water depth (null: not known yet, e.g. before the settle). */
  water?: ArrayLike<number> | null;
  /** River channel tiles. */
  channel?: Uint8Array | null;
  /** Tiles other objects take (resources excluded: they make room). */
  occupied?: Uint8Array | null;
  /** The start's zone: nothing stands on it. */
  start?: { x: number; y: number; radius: number } | null;
  /** Columns with caves or overhangs (an imported map's): objects that claim the whole column may
   *  not stand there. */
  columns?: { has(i: number): boolean } | null;
  /** Tiles no object may take (locked regions). */
  locked?: Uint8Array | null;
}

/** Water deeper than this counts as a water tile (validate/playability.ts WET). */
const WET = 0.05;

/** Why a placement does not fit, in plain words (empty when it fits). `tiles` are the tiles it
 *  covers: a single object's footprint, or a line's tiles. */
export function fitProblems(kind: MapObjectKind, tiles: readonly (readonly [number, number])[], g: FitGround): string[] {
  const { W, H, heights } = g;
  const out: string[] = [];
  if (!BUILT_OBJECTS.includes(kind)) return [`${OBJECT_NAMES[kind].toLowerCase()}s come in a later version`];
  if (!tiles.length) return ["it covers no tiles"];
  const single = !isLine(kind);
  let level = -1;
  const add = (why: string) => {
    if (!out.includes(why)) out.push(why);
  };
  for (const [x, y] of tiles) {
    if (x < 0 || y < 0 || x >= W || y >= H) {
      add("it does not fit on the map");
      continue;
    }
    const i = y * W + x;
    if (single) {
      if (level < 0) level = heights[i];
      else if (heights[i] !== level) add("the ground under it is not level");
    }
    if (DRY_OBJECTS.includes(kind) && g.water && g.water[i] > WET) add("it would stand in water");
    if (g.channel?.[i] && kind !== "weir" && kind !== "plug") add("it would stand in a river");
    if (g.occupied?.[i]) add("another object stands there");
    if (g.locked?.[i]) add("that area is locked");
    if (g.columns?.has(i)) add("there is a cave or overhang under it");
    const s = g.start;
    if (s && Math.abs(x - s.x) <= s.radius && Math.abs(y - s.y) <= s.radius) add("it is too close to the start");
  }
  return out;
}

/** The params of a single object at (x, y) facing o. */
export function singleParams(kind: MapObjectKind, x: number, y: number, o: Orientation, core?: { radius: number; cycles: number }): MapObjectParams {
  return { kind, placement: { x, y, orientation: o }, ...(core ? { core } : {}) };
}

// --------------------------------------------------------------------------------- Remove

/** What the editor's Remove takes (its filters, PLAN §20 D184). */
export type RemoveKind = "trees" | "bushes" | "ruins" | "sources" | "slopes" | "objects";

/** The kind of object a template is, for Remove's filters; null for the start, which stays. */
export function removeKindOf(template: string): RemoveKind | null {
  if (template === "StartingLocation") return null;
  if (/^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent)$/.test(template)) return "trees";
  if (/Bush$|^(Dandelion|Cattail|Spadderdock)$/.test(template)) return "bushes";
  if (/^RuinColumnH/.test(template)) return "ruins";
  if (template === "WaterSource" || template === "BadwaterSource") return "sources";
  if (template === "Slope") return "slopes";
  return "objects";
}
