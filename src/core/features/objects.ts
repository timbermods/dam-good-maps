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
// keeps every object. Under a roof (a cave's floor, the ground under a ledge, a roof's top) an object
// stands where Timberborn 1.1.2.7 keeps it (D491): `standProblem` is the game's own rule there, block
// by block, the very rule rust/checks applies to every object of a map file.

import { coordinatesForMinCorner, FOOTPRINTS, footprintTiles, ORIENTATIONS, worldBlocks, type Orientation } from "../format/footprints";
import { blockObject, unstableCore, type EntitySpec } from "../format/entities";
import { EMITTING, FLUIDS } from "../data/parity";
import { hash32, tileHash01 } from "../math/hash";
import { runsToTiles } from "../math/grid";
import { entityId } from "./ids";
import { itemName, withArticle } from "../doc/labels";
import type { MapObjectFeature, MapObjectKind } from "./schema";

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
 *  a single object at the highest level under its footprint, a line's objects each on its tile; under
 *  a roof, at the level its placement names (`z`: a cave's floor, the ground under a ledge). */
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
    if (f.params.placement.z !== undefined) z = f.params.placement.z;
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
  heights: ArrayLike<number>;
  /** Settled water depth (null: not known yet, e.g. before the settle). */
  water?: ArrayLike<number> | null;
  /** River channel tiles. */
  channel?: Uint8Array | null;
  /** Tiles other objects take (resources excluded: they make room). */
  occupied?: Uint8Array | null;
  /** The start's zone: nothing stands on it. */
  start?: { x: number; y: number; radius: number } | null;
  /** The ground voxel by voxel, on a map with caves or overhangs (bit z of `masks[i]` set: voxel z of
   *  tile i is solid; terrain/runs.ts `ColumnTerrain`). A placement on a tile that is not one plain
   *  run, or at a placement's `z`, is held to the game's own rule (`standProblem`) instead of the
   *  level ground a heightfield needs. */
  masks?: ArrayLike<number> | null;
  /** Tiles no object may take (locked regions). */
  locked?: Uint8Array | null;
}

/** Water deeper than this counts as a water tile (validate/playability.ts WET). */
const WET = 0.05;

/** Where a placement stands, beyond its tiles (a map object feature's `placement` fits as it is): a
 *  single object's south-west corner and facing, which the game's rule needs on a tile with caves or
 *  overhangs; `z`, the level it stands on under a roof (a cave's floor, the ground under a ledge: a
 *  run's top below the tile's surface), omitted for the top. A `z` needs the ground's `masks`. */
export type FitAt = { x: number; y: number; orientation: Orientation; z?: number } | { z?: number };

/** Why a placement does not fit, in plain words (empty when it fits). `tiles` are the tiles it
 *  covers: a single object's footprint, or a line's tiles; `at`, where it stands (`FitAt`). */
export function fitProblems(kind: MapObjectKind, tiles: readonly (readonly [number, number])[], g: FitGround, at?: FitAt): string[] {
  const { W, H, heights } = g;
  const z0 = at?.z;
  const corner = at && "x" in at ? at : null;
  const out: string[] = [];
  if (!BUILT_OBJECTS.includes(kind)) return [`${OBJECT_NAMES[kind].toLowerCase()}s come in a later version`];
  if (!tiles.length) return ["it covers no tiles"];
  const single = !isLine(kind);
  const masks = g.masks ?? null;
  if (z0 !== undefined && !masks) throw new Error("fitProblems: a placement at a given z needs the ground's masks");
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // under a roof: the game's rule, block by block, at the level it stands on (D491)
  const roofed = !!masks && (z0 !== undefined || tiles.some(([x, y]) => inMap(x, y) && !isPlainColumn(masks[y * W + x])));
  const stand: StandGround | null = roofed ? { W, H, mask: masks! } : null;
  const template = OBJECT_TEMPLATE[kind];
  let level = -1;
  const add = (why: string) => {
    if (!out.includes(why)) out.push(why);
  };
  // (an object at a given level stands wholly under the roof: its ground is then out of every tool's reach
  // but the Block tool's, so no later edit buries it or leaves it floating)
  if (z0 !== undefined) {
    const open = openPart(tiles, z0, g);
    if (open) add(open);
  }
  if (stand && single) {
    if (!corner) throw new Error("fitProblems: a single object under a roof needs its corner and facing");
    const s = FOOTPRINTS[template].size;
    const [cx, cy] = coordinatesForMinCorner(s[0], s[1], corner.x, corner.y, corner.orientation);
    let z = z0 ?? -1;
    if (z < 0) for (const [x, y] of tiles) if (inMap(x, y)) z = Math.max(z, heights[y * W + x]);
    const why = standProblem(template, { x: cx, y: cy, z, orientation: corner.orientation }, stand);
    if (why) add(why);
  }
  for (const [x, y] of tiles) {
    if (!inMap(x, y)) {
      add("it does not fit on the map");
      continue;
    }
    const i = y * W + x;
    if (stand && !single) {
      // (a line's objects are one block each, each on its own tile's ground)
      const why = standProblem(template, { x, y, z: z0 ?? heights[i], orientation: "Cw0" }, stand);
      if (why) add(why);
    } else if (single && !stand) {
      if (level < 0) level = heights[i];
      else if (heights[i] !== level) add("the ground under it is not level");
    }
    // (the settled water and the rivers are the top's: under a roof the game's rule alone decides)
    const top = z0 === undefined || z0 >= heights[i];
    if (top && DRY_OBJECTS.includes(kind) && g.water && g.water[i] > WET) add("it would stand in water");
    if (top && g.channel?.[i] && kind !== "weir" && kind !== "plug") add("it would stand in a river");
    if (g.occupied?.[i]) add("another object stands there");
    if (g.locked?.[i]) add("that area is locked");
    const st = g.start;
    if (st && Math.abs(x - st.x) <= st.radius && Math.abs(y - st.y) <= st.radius) add("it is too close to the start");
  }
  return out;
}

// --------------------------------------------------------------------------- under a roof (D491)

/** Why an object standing at level `z` (a cave's floor, the ground under a ledge) is not wholly under a
 *  roof, or null when it is: every tile it covers has ground above `z` (its surface higher). The part in
 *  the open would be the brushes' and the forces' ground, which a later stroke could raise into it or
 *  cut from under it; on the roofed part the tools shape only the roof's top (D487). The game would keep
 *  such an object; the editor refuses it so that no edit buries it or leaves it floating (D491). */
export function openPart(tiles: readonly (readonly [number, number])[], z: number, g: { W: number; H: number; heights: ArrayLike<number> }): string | null {
  for (const [x, y] of tiles) {
    if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue;
    if (g.heights[y * g.W + x] <= z) return "part of it would stand in the open: under a roof it stands wholly under it";
  }
  return null;
}

/** The ground that holds the objects set under a roof where they stand (D491): for each tile one of
 *  them reaches outside its roof (a badtide drain set in a cliff, its mouth over open ground; a ruin
 *  under a ledge, its top above the ground beside it), the lowest and highest the tile's surface may
 *  go, as [tile, low, high], ascending by tile. A stroke, a sculpt and a force keep each tile within
 *  them and shape the rest as normal (the brushes' `hold`), so no edit buries such an object or
 *  leaves it floating: under its own block the ground stays (low = high), beside a block above the
 *  ground the surface may rise up to it. The objects are those standing below the ground's top at
 *  their Coordinates (an object on a top rides it, as on open ground) that the game keeps there.
 *  `entities` carry their placement (x, y, z, orientation, flipped). */
export function objectHolds(
  entities: readonly { template: string; x: number; y: number; z: number; orientation: Orientation; flipped?: boolean }[],
  g: StandGround & { heights: ArrayLike<number> },
): [number, number, number][] {
  const { W, H, heights } = g;
  const lo = new Map<number, number>();
  const hi = new Map<number, number>();
  for (const e of entities) {
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || !(e.z < heights[e.y * W + e.x])) continue;
    const fp = FOOTPRINTS[e.template];
    if (!fp || standProblem(e.template, e, g)) continue;
    for (const b of worldBlocks(fp, { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: !!e.flipped })) {
      const i = b.y * W + b.x;
      const h = heights[i];
      // (a block under the tile's top run is under a roof there: the tools shape only the roof's top)
      if (b.z < h) continue;
      hi.set(i, Math.min(hi.get(i) ?? 255, b.z));
      if (b.z === h && (b.below === "ground" || b.below === "groundOrStackable")) lo.set(i, Math.max(lo.get(i) ?? 0, h));
    }
  }
  const tiles = [...new Set([...lo.keys(), ...hi.keys()])].sort((a, b) => a - b);
  return tiles.map((i) => [i, lo.get(i) ?? 0, hi.get(i) ?? 255]);
}

/** The ground an object stands on, voxel by voxel: bit z of `mask[i]` set when voxel z of tile i is
 *  solid (terrain/runs.ts `ColumnTerrain`). */
export interface StandGround {
  W: number;
  H: number;
  mask: ArrayLike<number>;
}

/** Objects whose ground blocks must stand on the top of run 0, the run that reaches down to z = 0
 *  (the game's `ContinuousTerrainConstraint`, investigation/terrain3d/GAME_RULES.md §3.4): a cave's
 *  floor with rock under it, never a roof's top, a ledge or the floor of a cave over another cave.
 *  rust/checks `continuous` is the same list. */
export const ON_BOTTOM_RUN: ReadonlySet<string> = new Set(["WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep", "Aquifer", "BadtideDrain", "GeothermalField", "UndergroundRuins"]);

/** No block of an object may reach this level (rust/checks `MAX_OBJECT_Z`: the map's total height). */
const MAX_OBJECT_Z = 33;
/** The terrain's layers (format/world.ts LAYERS): nothing is solid from here up. */
const TERRAIN_LAYERS = 23;

/** Whether a column's mask is one plain run from z = 0 (or empty): terrain/runs.ts `isPlainMask`. */
function isPlainColumn(m: number): boolean {
  return (m & (m + 1)) === 0;
}

/** The top of a column's run 0: the first air above the solid voxels that reach up from z = 0. */
export function bottomRunTop(m: number): number {
  let z = 0;
  while (z < TERRAIN_LAYERS && (m >>> z) & 1) z++;
  return z;
}

/** An object's height in levels: the air it needs from its floor up (a pine 3, a birch 2, a ruin its
 *  own height; GAME_RULES §5). */
export function objectHeight(template: string): number {
  let h = 0;
  for (const b of FOOTPRINTS[template]?.blocks ?? []) if (b[4] !== 0) h = Math.max(h, b[2] + 1);
  return h;
}

/** Why Timberborn would not keep `template` standing at (x, y, z) (its Coordinates) on this ground,
 *  in one plain line, or null when it would (D491). The game tests only the cells an object occupies
 *  (`BlockValidator`): each must be air and inside the map, every block that needs ground has solid
 *  ground under it (`MatterBelow.Ground`), and the water objects, geothermal fields and mine sites
 *  stand on the top of run 0 (`ON_BOTTOM_RUN`). Nothing looks for a roof, so an object fits under one
 *  when its height in air is free. `taken(x, y, z)` names the template of another object holding a
 *  cell, if any. It is rust/checks' `entities.placement` and `plants.clearance` for one object (a
 *  contract test holds them together on a cave map), except that ground made of objects (a stackable
 *  under a ruin) is not counted: it refuses there rather than ever keep what the game drops. */
export function standProblem(
  template: string,
  p: { x: number; y: number; z: number; orientation: Orientation; flipped?: boolean },
  g: StandGround,
  taken?: (x: number, y: number, z: number) => string | null,
): string | null {
  const fp = FOOTPRINTS[template];
  if (!fp) return `${template} can't be placed`;
  const { W, H, mask } = g;
  const solid = (x: number, y: number, z: number) => z < 0 || (z < TERRAIN_LAYERS && ((mask[y * W + x] >>> z) & 1) === 1);
  const name = itemName(template);
  for (const b of worldBlocks(fp, { template, x: p.x, y: p.y, z: p.z, orientation: p.orientation, flipped: !!p.flipped })) {
    if (b.x < 0 || b.y < 0 || b.x >= W || b.y >= H || b.z >= MAX_OBJECT_Z) return "it does not fit on the map";
    if (solid(b.x, b.y, b.z)) return b.localZ > 0 ? `not enough room under the roof here: the ${name} needs ${objectHeight(template)}` : "the ground under it is not level";
    const other = taken?.(b.x, b.y, b.z);
    if (other) return other === "StartingLocation" ? "the district center stands there" : `${withArticle(itemName(other))} stands there`;
    if ((b.below === "ground" || b.below === "groundOrStackable") && !solid(b.x, b.y, b.z - 1)) return "the ground under it is not level";
    if (ON_BOTTOM_RUN.has(template) && b.below === "ground" && b.z !== bottomRunTop(mask[b.y * W + b.x])) {
      return `the game keeps ${withArticle(name)} only on ground that goes down to the bottom of the map, not on a roof or a ledge`;
    }
  }
  return null;
}

// --------------------------------------------------------------------------------- Remove

/** What the editor's Remove takes (its filters, PLAN §20 D184). */
/** Whether the plain pointer picks and drags an object of this template (D360 a): every object on the map,
 *  trees, bushes and ruin columns included. Not the sources and the start, which have their own grab
 *  (D249, D184), and not a slope, which the ground derives. */
export function isPickable(template: string): boolean {
  return template !== "WaterSource" && template !== "BadwaterSource" && template !== "StartingLocation" && template !== "Slope" && !!FOOTPRINTS[template];
}

const PLANT = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent|BlueberryBush|Dandelion|Cattail|Spadderdock)$/;

/** Which of several objects under the pointer is the one picked (D360 a): the bigger object (more tiles)
 *  wins over a smaller one, and of equal size what is not a plant wins over a tree or a bush; of a tie the
 *  first. Returns its index in `templates`. */
export function pickWinner(templates: readonly string[]): number {
  const size = (t: string) => {
    const b = FOOTPRINTS[t]?.blocks ?? [];
    return new Set(b.filter((k) => k[4] !== 0).map((k) => `${k[0]},${k[1]}`)).size || 1;
  };
  let best = 0;
  for (let k = 1; k < templates.length; k++) {
    const a = size(templates[k]);
    const b = size(templates[best]);
    if (a > b || (a === b && PLANT.test(templates[best]) && !PLANT.test(templates[k]))) best = k;
  }
  return best;
}

export type RemoveKind = "trees" | "bushes" | "ruins" | "sources" | "water" | "badwater" | "slopes" | "objects" | "start";

/** The kind of object a template is, for Remove's filters. The start is the player's like any object
 *  (D323 item 44). `sources` names both kinds of source (`water`, `badwater` take one each). */
export function removeKindOf(template: string): RemoveKind | null {
  if (template === "StartingLocation") return "start";
  if (/^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent)$/.test(template)) return "trees";
  if (/Bush$|^(Dandelion|Cattail|Spadderdock)$/.test(template)) return "bushes";
  if (/^RuinColumnH/.test(template)) return "ruins";
  // the sources, and the game's other water objects that emit (the seeps, the aquifer, the badtide drain: D337)
  if (template === "WaterSource" || template === "BadwaterSource" || EMITTING.includes(template)) return "sources";
  if (template === "Slope") return "slopes";
  return "objects";
}

/** Whether a filter takes an object of this template: a kind takes its own, and `sources` both kinds. */
export function removeTakes(kinds: readonly RemoveKind[], template: string): boolean {
  const kind = removeKindOf(template);
  if (!kind) return false;
  if (kinds.includes(kind)) return true;
  if (kind === "sources") return kinds.includes(FLUIDS[template]?.contamination ? "badwater" : "water");
  return false;
}
