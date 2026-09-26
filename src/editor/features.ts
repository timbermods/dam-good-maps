// What the editor knows about features on the page (EDITOR_PLAN §4): their plain names, which tiles
// each covers (for hover, selection and highlights), what stands on a tile in plain language, and
// how a feature moves. Pure TypeScript on the map view and the feature list the worker sends.

import { pathField, pointAtArc, polygonMask, type PathField } from "../core/features/geometry";
import { BUILDERS } from "../core/features/setpieces";
import type { Feature, Point, RiverFeature, StartFeature } from "../core/features/schema";
import { runsToTiles, tilesToRuns, type Runs } from "../core/math/grid";
import { outlineBounds, type OpParams } from "../core/doc/ops";
import { movePatch as corePatch } from "../core/doc/tools";
import { OBJECT_NAMES as OBJECT_KIND_NAMES, objectTiles } from "../core/features/objects";
import { DEAD, FLIPPED, ORIENTATION_NAMES, YOUNG, type EntityView, type SoilView, type SurfaceWater } from "../render3d/model";
import { walkRegions } from "../core/analysis/regions";
import { pumpShoreDistance, reachAt, walkDistance } from "../core/analysis/walk";
import { noWood, type WoodBySpecies, type WoodSpecies } from "../core/analysis/wood";
import { DERIVED_SLOPES } from "../core/features/ids";
import { inBench } from "../core/features/raster/terrain";
import { placeSlopes, SLOPE_RULES, START_CLEAR_RADIUS } from "../core/features/slopes";
import { TREE_LOGS } from "../core/format/entities";
import { FOOTPRINTS, footprintTiles, slopeHighSide, type Orientation } from "../core/format/footprints";
import { WALK_BLOCKERS } from "../core/validate/playability";

// ------------------------------------------------------------------------------------- names

const LANDFORMS: Record<string, string> = {
  hill: "Hill",
  plateau: "Plateau",
  ridge: "Ridge",
  canyon: "Canyon",
  valley: "Valley floor",
  island: "Island",
  terraces: "Terraces",
};

const SET_PIECES: Record<string, string> = {
  waterfall: "Waterfall",
  damSite: "Dam site",
  gorge: "Gorge",
  terracedCliffs: "Terraced cliffs",
  badwaterBasin: "Badwater spring",
  plugSpillway: "Plugged spillway",
  obstaclePayoff: "Obstacle",
  secondDistrict: "Second district site",
};

const SPECIES: Record<string, string> = { Pine: "pine", Birch: "birch", Oak: "oak", Succulent: "succulent" };

function speciesList(mix: Record<string, number | undefined>): string {
  const names = Object.entries(mix)
    .filter(([, v]) => (v ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => SPECIES[k] ?? k.toLowerCase());
  return names.length > 2 ? "mixed" : names.join(" and ");
}

/** A feature's plain name ("Plateau", "Pine forest", "River"). */
export function featureName(f: Feature): string {
  switch (f.kind) {
    case "landform":
      return LANDFORMS[f.params.kind] ?? "Landform";
    case "river":
      return f.params.badwater ? "Badwater river" : "River";
    case "lake":
      return f.params.planned ? "Reservoir site" : "Lake";
    case "setPiece":
      return SET_PIECES[f.params.kind] ?? "Set piece";
    case "forest": {
      const s = speciesList(f.params.speciesMix as Record<string, number>);
      return s ? `${s[0].toUpperCase()}${s.slice(1)} forest` : "Forest";
    }
    case "berryPatch":
      return "Berry patch";
    case "ruinField":
      return "Ruin field";
    case "mapObject":
      return OBJECT_KIND_NAMES[f.params.kind];
    case "start":
      return "Start";
  }
}

/** Which of the four tabs a feature belongs to (EDITOR_PLAN §4). */
export type Tab = "land" | "water" | "resources" | "start";

export function tabOf(f: Feature): Tab {
  switch (f.kind) {
    case "landform":
      return "land";
    case "river":
    case "lake":
    case "setPiece":
      return "water";
    case "start":
      return "start";
    case "mapObject":
      // thorn belts are drawn on the land; weirs and plugs sit in the water; the rest are resources
      return f.params.kind === "thornBelt" ? "land" : f.params.kind === "weir" || f.params.kind === "plug" ? "water" : "resources";
    default:
      return "resources";
  }
}

// ---------------------------------------------------------------------------------- tile index

/** The tiles each feature covers, cached by the feature's parameters. */
export class FeatureIndex {
  private cache = new Map<string, { key: string; tiles: Int32Array }>();
  private fields = new Map<string, { key: string; field: PathField }>();
  /** Per tile: the index (into `features`) of the area feature (forest, berries, ruins), the
   *  terrain feature (landform, lake) and the river covering it; −1 for none. */
  area: Int32Array;
  terrain: Int32Array;
  river: Int32Array;
  features: Feature[] = [];

  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.area = new Int32Array(W * H);
    this.terrain = new Int32Array(W * H);
    this.river = new Int32Array(W * H);
  }

  update(features: readonly Feature[]): void {
    this.features = features as Feature[];
    this.area.fill(-1);
    this.terrain.fill(-1);
    this.river.fill(-1);
    const seen = new Set<string>();
    features.forEach((f, k) => {
      seen.add(f.id);
      const tiles = this.tilesOf(f);
      const into = f.kind === "forest" || f.kind === "berryPatch" || f.kind === "ruinField" ? this.area : f.kind === "river" ? this.river : f.kind === "landform" || f.kind === "lake" ? this.terrain : null;
      if (!into) return;
      // later landforms and lakes are built over earlier ones: the last one wins
      for (const i of tiles) into[i] = k;
    });
    for (const id of [...this.cache.keys()]) if (!seen.has(id)) this.cache.delete(id);
  }

  riverField(f: RiverFeature): PathField {
    const key = JSON.stringify(f.params.path);
    const c = this.fields.get(f.id);
    if (c && c.key === key) return c.field;
    const field = pathField(f.params.path, this.W, this.H);
    this.fields.set(f.id, { key, field });
    return field;
  }

  /** The tiles a feature covers (the ones its outline, area or channel holds). */
  tilesOf(f: Feature): Int32Array {
    // features that follow a river (valley landforms, set pieces) change with it
    const dep = f.kind === "landform" ? f.params.along?.river : f.kind === "setPiece" ? (f.params.plan as { river?: unknown }).river : undefined;
    const depKey = typeof dep === "string" ? JSON.stringify(this.features.find((g) => g.id === dep)?.params ?? null) : "";
    const key = JSON.stringify(f.params) + depKey;
    const c = this.cache.get(f.id);
    if (c && c.key === key) return c.tiles;
    const tiles = Int32Array.from(this.computeTiles(f));
    this.cache.set(f.id, { key, tiles });
    return tiles;
  }

  private computeTiles(f: Feature): number[] {
    const { W, H } = this;
    const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
    const mask = (m: Uint8Array) => {
      const out: number[] = [];
      for (let i = 0; i < m.length; i++) if (m[i]) out.push(i);
      return out;
    };
    switch (f.kind) {
      case "forest":
      case "berryPatch":
      case "ruinField":
        return runsToTiles(f.params.area, W).filter((i) => i >= 0 && i < W * H);
      case "lake":
        return mask(polygonMask(f.params.outline, W, H));
      case "landform": {
        const p = f.params;
        if (p.outline) return mask(polygonMask(p.outline, W, H));
        if (!p.along) return [];
        const river = this.features.find((g): g is RiverFeature => g.id === p.along!.river && g.kind === "river");
        if (!river) return [];
        const field = this.riverField(river);
        const out: number[] = [];
        const hw = p.along.halfWidth;
        for (let i = 0; i < W * H; i++) {
          if (p.kind === "valley" ? field.d[i] < hw : field.side[i] === (p.along.side ?? 1) && field.d[i] >= hw) out.push(i);
        }
        return out;
      }
      case "river": {
        const field = this.riverField(f);
        const out: number[] = [];
        const half = f.params.width / 2;
        for (let i = 0; i < W * H; i++) if (field.d[i] < half) out.push(i);
        return out;
      }
      case "start": {
        const [cx, cy] = f.params.position;
        const out: number[] = [];
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (inMap(x, y)) out.push(y * W + x);
        return out;
      }
      case "setPiece":
        return this.setPieceTiles(f).filter(([x, y]) => inMap(x, y)).map(([x, y]) => y * W + x);
      case "mapObject":
        return objectTiles(f, W, H).filter(([x, y]) => inMap(x, y)).map(([x, y]) => y * W + x);
      default:
        return [];
    }
  }

  private setPieceTiles(f: Extract<Feature, { kind: "setPiece" }>): [number, number][] {
    const own = BUILDERS[f.params.kind]?.area?.(f, this.W, this.H, this.features);
    if (own?.length) return own.map((i) => [i % this.W, Math.floor(i / this.W)]);
    const plan = f.params.plan as Record<string, unknown>;
    if (f.params.kind === "badwaterBasin" && typeof plan.x === "number" && typeof plan.y === "number") {
      const out: [number, number][] = [];
      for (let y = plan.y; y < plan.y + 3; y++) for (let x = plan.x; x < plan.x + 3; x++) out.push([x, y]);
      return out;
    }
    const river = this.features.find((g): g is RiverFeature => g.kind === "river" && g.id === plan.river);
    if (!river || typeof plan.at !== "number") return [];
    const { p, normal } = pointAtArc(river.params.path, plan.at);
    if (f.params.kind === "damSite") {
      const half = Math.ceil(river.params.width / 2) + 2;
      const out: [number, number][] = [];
      for (let k = -half; k <= half; k++) out.push([Math.round(p[0] + normal[0] * k), Math.round(p[1] + normal[1] * k)]);
      return out;
    }
    const half = Math.ceil(river.params.width / 2);
    const out: [number, number][] = [];
    for (let k = -half; k <= half; k++) out.push([Math.round(p[0] + normal[0] * k), Math.round(p[1] + normal[1] * k)]);
    return out;
  }

  /** The features under a tile a click picks, most specific first: the start, map objects, set
   *  pieces and resource areas (never water or the generator's ground, D196). */
  candidatesAt(x: number, y: number): Feature[] {
    return this.allAt(x, y).filter(selectable);
  }

  /** Every feature under a tile, most specific first: the start, set pieces, resource areas,
   *  rivers, lakes and landforms. */
  allAt(x: number, y: number): Feature[] {
    const { W, H } = this;
    if (x < 0 || y < 0 || x >= W || y >= H) return [];
    const i = y * W + x;
    const out: Feature[] = [];
    for (const f of this.features) if (f.kind === "start" && this.tilesOf(f).includes(i)) out.push(f);
    for (const f of this.features) if (f.kind === "mapObject" && this.tilesOf(f).includes(i)) out.push(f);
    for (const f of this.features) if (f.kind === "setPiece" && this.tilesOf(f).includes(i)) out.push(f);
    if (this.area[i] >= 0) out.push(this.features[this.area[i]]);
    if (this.river[i] >= 0) out.push(this.features[this.river[i]]);
    if (this.terrain[i] >= 0) {
      const t = this.features[this.terrain[i]];
      out.push(t);
      // a free-standing landform over the valley: the valley too
      for (let k = this.features.length - 1; k >= 0; k--) {
        const f = this.features[k];
        if (f !== t && (f.kind === "landform" || f.kind === "lake") && this.tilesOf(f).includes(i)) out.push(f);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------- hover text

export interface TileContext {
  W: number;
  H: number;
  heights: Uint8Array;
  water: SurfaceWater;
  entities: EntityView;
  /** Tile index → entity indices on it. */
  entitiesAt: Map<number, number[]>;
  index: FeatureIndex | null;
  /** The soil the 3D view colours the ground by: the hover says which it is (Map look, D86). */
  soil?: SoilView;
  /** The editor: water and the generator's ground are never objects (D196), so the readout never
   *  names a river, a lake or a landform, and over water says its depth, its bed and its badwater. */
  editor?: boolean;
}

/** Whether a feature is something the player picks on the map. Water is never an object (D196),
 *  and what the generator made is its plan, never an editing object (D182, D184): it is shaped
 *  through sources and land, and never selected, moved or resized. The start is the one exception:
 *  every map has one, and the player moves it. */
export function selectable(f: Feature): boolean {
  if (f.kind === "river" || f.kind === "lake" || f.kind === "landform") return false;
  return f.kind === "start" || f.origin !== "generated";
}

export function entitiesByTile(v: EntityView, W: number): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let k = 0; k < v.count; k++) {
    const i = v.y[k] * W + v.x[k];
    const list = m.get(i);
    if (list) list.push(k);
    else m.set(i, [k]);
  }
  return m;
}

const OBJECT_NAMES: Record<string, string> = {
  Pine: "pine",
  Birch: "birch",
  Oak: "oak",
  Succulent: "succulent",
  BlueberryBush: "blueberry bush",
  Slope: "slope",
  WaterSource: "water source",
  BadwaterSource: "badwater source",
  StartingLocation: "district center",
  Blockage: "blockage",
  NaturalDam: "natural dam",
  Thorns: "thorns",
  GeothermalField: "geothermal field",
  UndergroundRuins: "underground ruins",
  UnstableCore: "unstable core",
  SmallRelic: "small relic",
  MediumRelic: "medium relic",
  LargeRelic: "large relic",
};

function objectName(template: string, flags: number): string {
  const ruin = /^RuinColumnH(\d)$/.exec(template);
  if (ruin) return `ruin column, ${ruin[1]} high`;
  const base = OBJECT_NAMES[template] ?? template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (flags & DEAD) return `dead ${base}`;
  if (flags & YOUNG) return `young ${base}`;
  return base;
}

/** What stands on a tile, in plain language: "Plateau, height 12, pine forest". */
export function describeTile(c: TileContext, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= c.W || y >= c.H) return "";
  const i = y * c.W + x;
  const parts: string[] = [];
  const idx = c.index;
  const terrain = idx && idx.terrain[i] >= 0 ? idx.features[idx.terrain[i]] : null;
  const river = idx && idx.river[i] >= 0 ? idx.features[idx.river[i]] : null;
  const area = idx && idx.area[i] >= 0 ? idx.features[idx.area[i]] : null;
  const start = idx?.features.find((f) => f.kind === "start" && idx.tilesOf(f).includes(i));
  if (start) parts.push("Start");
  const d = c.water.depth[i];
  const wet = c.water.surface[i] === c.water.surface[i] && d > 0.001;
  const deep = d < 0.1 ? d.toFixed(2) : d.toFixed(1);
  if (c.editor) {
    // the editor: water, not a river; its depth, its bed, and how much of it is bad
    if (wet) {
      const cont = c.water.contamination[i];
      parts.push(`${cont >= 0.95 ? "badwater" : "water"} ${deep} deep`, `bed level ${c.heights[i]}`);
      if (cont > 0.05 && cont < 0.95) parts.push(`${Math.round(cont * 100)}% badwater`);
    } else {
      parts.push(`height ${c.heights[i]}`);
      if (c.soil) parts.push(c.soil.contamination[i] > 0 ? "contaminated soil" : c.soil.moisture[i] > 0 ? "moist soil" : "dry soil");
    }
  } else {
    if (river) parts.push(featureName(river));
    else if (terrain) parts.push(featureName(terrain));
    parts.push(`height ${c.heights[i]}`);
    if (wet) parts.push(`${c.water.contamination[i] >= 0.05 ? "badwater" : "water"} ${deep} deep`);
    else if (c.soil) parts.push(c.soil.contamination[i] > 0 ? "contaminated soil" : c.soil.moisture[i] > 0 ? "moist soil" : "dry soil");
  }
  if (area) parts.push(featureName(area).toLowerCase());
  const here = c.entitiesAt.get(i);
  if (here?.length) {
    // the objects on the tile, unless the area already says it all (a living tree in a forest)
    const names = [...new Set(here.map((k) => objectName(c.entities.templates[c.entities.template[k]], c.entities.flags[k])))];
    const plain = /^(pine|birch|oak|succulent|blueberry bush)$/;
    if (!(area && names.length === 1 && plain.test(names[0]))) parts.push(...names.slice(0, 2));
  }
  const text = parts.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

// -------------------------------------------------------------------------------------- moving

/** Why a feature cannot be moved by its handle (null: it can). */
export function moveBlocked(f: Feature): string | null {
  switch (f.kind) {
    case "setPiece":
      if (f.params.kind === "badwaterBasin" && f.params.plan.mode === "marsh") return "The generated badwater marsh stays where the valley put it.";
      return null;
    case "mapObject":
      return null;
    case "landform":
      return "The generator's ground: shape it with the brushes.";
    case "lake":
      return f.params.river ? "This belongs to its river's dam site: it moves with the river." : null;
    default:
      return null;
  }
}

/** The bounding box of a feature's own coordinates (its path, outline, area or position). */
function coordsBounds(f: Feature, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let pts: Point[] = [];
  switch (f.kind) {
    case "forest":
    case "berryPatch":
    case "ruinField":
      for (const [y, a, b] of f.params.area) pts.push([a, y], [b, y]);
      break;
    case "mapObject":
      pts = objectTiles(f, W, H);
      break;
    case "start":
      pts = [[f.params.position[0] - 1, f.params.position[1] - 1], [f.params.position[0] + 1, f.params.position[1] + 1]];
      break;
    case "landform":
      pts = f.params.outline ?? [];
      break;
    case "lake":
      pts = f.params.outline;
      break;
    case "river":
      pts = f.params.path.filter(([x, y]) => x > 0 && y > 0 && x < W - 1 && y < H - 1);
      break;
    case "setPiece": {
      // a set piece is planned again where it lands; its builder fits it on the map
      const p = f.params.plan;
      const a = (Array.isArray(p.lip) ? p.lip : Array.isArray(p.at) ? p.at : typeof p.x === "number" ? [Number(p.x) + 1, Number(p.y) + 1] : null) as number[] | null;
      if (a) pts = [[a[0], a[1]]];
      else return { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
      break;
    }
    default:
      return null;
  }
  if (!pts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** Clamp a move so the feature stays on the map (the handle stops at the edge). A generated
 *  landform or lake whose outline reaches past the map (Lake Basin's terrace rings) may move as far
 *  as its outline stays within a map side of the edges (decisions-pending #30). */
export function clampMove(f: Feature, dx: number, dy: number, W: number, H: number): [number, number] {
  const b = coordsBounds(f, W, H);
  if (!b) return [0, 0];
  const ob = f.kind === "landform" || f.kind === "lake" ? outlineBounds(f, W, H) : { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  const cx = Math.max(Math.ceil(ob.x0 - b.x0), Math.min(Math.floor(ob.x1 - b.x1), dx));
  const cy = Math.max(Math.ceil(ob.y0 - b.y0), Math.min(Math.floor(ob.y1 - b.y1), dy));
  return [cx, cy];
}

const onEdge = (v: number, max: number) => v <= 0 || v >= max;

/** The `updateFeature` patch that moves a feature by (dx, dy) tiles (the core's rule: a river keeps
 *  its edge ends on their edge, the start's bench takes the ground level at its new place). */
export function movePatch(f: Feature, dx: number, dy: number, W: number, H: number, heights: Uint8Array): OpParams["updateFeature"]["patch"] {
  return corePatch(f, dx, dy, W, H, heights);
}

/** Where a feature's move handle sits: the middle of its tiles. */
export function anchorOf(index: FeatureIndex, f: Feature): [number, number] | null {
  if (f.kind === "start") return [f.params.position[0], f.params.position[1]];
  const tiles = index.tilesOf(f);
  if (!tiles.length) return null;
  let sx = 0;
  let sy = 0;
  for (const i of tiles) {
    sx += i % index.W;
    sy += Math.floor(i / index.W);
  }
  // the tile of the feature closest to its centroid (so the handle sits on the feature)
  const mx = sx / tiles.length;
  const my = sy / tiles.length;
  let best = tiles[0];
  let bd = Infinity;
  for (const i of tiles) {
    const d = (i % index.W - mx) ** 2 + (Math.floor(i / index.W) - my) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return [best % index.W, Math.floor(best / index.W)];
}

// ------------------------------------------------------------------------------------- drawing

/** A rectangle of tiles from two corners, clipped to the map. */
export function rectOf(a: [number, number], b: [number, number], W: number, H: number): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.min(a[0], b[0])),
    y0: Math.max(0, Math.min(a[1], b[1])),
    x1: Math.min(W - 1, Math.max(a[0], b[0])),
    y1: Math.min(H - 1, Math.max(a[1], b[1])),
  };
}

export function rectRuns(r: { x0: number; y0: number; x1: number; y1: number }, W: number): Runs {
  const tiles: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) tiles.push(y * W + x);
  return tilesToRuns(tiles, W);
}

/** An outline whose tiles (by the centre rule of the rasterizers) are exactly the rectangle's. */
export function rectOutline(r: { x0: number; y0: number; x1: number; y1: number }): Point[] {
  return [
    [r.x0 - 0.5, r.y0 - 0.5],
    [r.x1 + 0.5, r.y0 - 0.5],
    [r.x1 + 0.5, r.y1 + 0.5],
    [r.x0 - 0.5, r.y1 + 0.5],
  ];
}

/** A random id for a feature the player makes (PLAN §19.4). */
export function newId(): string {
  return crypto.randomUUID();
}

// ------------------------------------------------------------------------------------- the start

export interface StartCheck {
  /** Why the district center cannot stand there (null: it can). */
  problem: string | null;
  /** The 3×3 footprint and the tile at its door. */
  tiles: number[];
  door: number;
  /** The three start requirements (PLAN §5.6, D85, D164): the walk over the map's own ground and
   *  slopes, never player stairs, to a shore that touches clean water a pump on it reaches (null:
   *  none within the walk limit); the logs of the grown trees, by species, and the living berry
   *  bushes within 20 tiles' walk. */
  water: number | null;
  wood: number;
  woodBySpecies: WoodBySpecies;
  /** The saplings' logs within the walk: wood still growing, not counted. */
  woodGrowing: number;
  bushes: number;
  /** All three requirements hold with the map's rules. */
  meets: boolean;
  /** The start targets it misses (badwater and ruin distances, walkable land), in plain words. */
  warnings: string[];
}

export interface StartNeeds {
  rules: { waterWithin: number; woodWithin20: number; bushesWithin20: number; badwaterWithin: number; ruinsWithin: number };
  /** Dry land walkable from the start that the map aims for. */
  reachMin: number;
}

/** Objects the build places after the slopes (plants, ruins, the start): they never keep a slope
 *  away. */
const PLACED_AFTER_SLOPES = /^(Pine|Birch|Oak|Succulent|BlueberryBush|RuinColumnH\d|StartingLocation)$/;

/** The slopes the colony walks on from a start at (x, y) on the ground `h`, as (low tile, high
 *  tile) links. A generated map's start that moves gets its slopes derived again by the build
 *  (PLAN §7.5), so `derive` predicts them: the standing slopes that are not derived (a set piece's
 *  stairs), and the derived ones placed round the new start, clear of the objects and sources that
 *  stand. Otherwise the map's slopes as they stand. */
function startLinks(c: TileContext, h: Uint8Array, x: number, y: number, door: [number, number], derive: boolean): [number, number][] {
  const { W, H } = c;
  const e = c.entities;
  const own: [number, number][] = [];
  const occupied = derive ? new Uint8Array(W * H) : null;
  for (let k = 0; k < e.count; k++) {
    const t = e.templates[e.template[k]];
    const inMap = e.x[k] >= 0 && e.y[k] >= 0 && e.x[k] < W && e.y[k] < H;
    if (t === "Slope") {
      if (occupied && e.owners[e.owner[k]] === DERIVED_SLOPES) continue;
      const [dx, dy] = slopeHighSide(ORIENTATION_NAMES[e.orientation[k]] as Orientation);
      const hx = e.x[k] + dx;
      const hy = e.y[k] + dy;
      if (inMap && hx >= 0 && hy >= 0 && hx < W && hy < H) own.push([e.y[k] * W + e.x[k], hy * W + hx]);
      if (occupied && inMap) occupied[e.y[k] * W + e.x[k]] = 1;
      continue;
    }
    if (!occupied || PLACED_AFTER_SLOPES.test(t)) continue;
    const p = { template: t, x: e.x[k], y: e.y[k], z: e.z[k], orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 };
    const tiles: [number, number][] = FOOTPRINTS[t] ? footprintTiles(t, p) : [[e.x[k], e.y[k]]];
    for (const [tx, ty] of tiles) if (tx >= 0 && ty >= 0 && tx < W && ty < H) occupied[ty * W + tx] = 1;
  }
  if (!occupied) return own;
  // the start's clear zone, and the tiles in front of its door (features/build.ts)
  const mark = (cx: number, cy: number, r: number) => {
    for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) occupied[yy * W + xx] = 1;
  };
  mark(x, y, START_CLEAR_RADIUS);
  mark(Math.round(x + 1.5 * (door[0] - x)), Math.round(y + 1.5 * (door[1] - y)), 1);
  const links = own.slice();
  // the rivers' channels: the slopes out of the start's region go toward them, as the build's do
  let water: Uint8Array | null = null;
  if (c.index) {
    water = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (c.index.river[i] >= 0) water[i] = 1;
  }
  for (const sl of placeSlopes(h, W, H, { x, y }, occupied, { ...SLOPE_RULES, links: own, water })) {
    const [dx, dy] = slopeHighSide(sl.orientation);
    links.push([sl.y * W + sl.x, (sl.y + dy) * W + (sl.x + dx)]);
  }
  return links;
}

/** Why the district center cannot stand at (x, y) with its door at `door` (null: it can): the quick
 *  part of `checkStartAt`, without the walks. */
export function startProblemAt(c: TileContext, x: number, y: number, door: [number, number], bench: { level: number } | null, self: string | null): string | null {
  const { W, H } = c;
  const tiles: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push((y + dy) * W + (x + dx));
  const z = bench ? bench.level : c.heights[y * W + x];
  for (const i of [...tiles, door[1] * W + door[0]]) {
    const tx = i % W;
    const ty = Math.floor(i / W);
    if (tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2 || i < 0) return "too close to the map edge";
    if (c.index && c.index.river[i] >= 0) return "in a river";
    if (c.water.depth[i] > 0.05) return "under water";
    if (!bench && c.heights[i] !== z) return "not on level ground";
    const here = c.entitiesAt.get(i);
    if (here?.some((k) => c.entities.owners[c.entities.owner[k]] !== self && !PLACED_AFTER_SLOPES.test(c.entities.templates[c.entities.template[k]]))) return "on an object";
  }
  return null;
}

/** The start's footprint and the three start requirements at (x, y), from what the page shows
 *  (EDITOR_PLAN §4: the footprint preview, green or red, and simple indicators). `bench` is the
 *  bench a start that levels its ground (a generated map) would make there, or null for an
 *  imported start that stands on the ground as it is; `moved` says the start is away from where it
 *  stands, so a generated map's slopes are predicted there (`startLinks`). The walks are the
 *  validator's (analysis/walk.ts) on the ground as it would be; which plants live is the page's
 *  guess from their dead flags (the validator, after the move, also checks their soil). */
export function checkStartAt(
  c: TileContext,
  x: number,
  y: number,
  door: [number, number],
  bench: { level: number; radius: number; bank?: Point } | null,
  self: string | null,
  needs: StartNeeds,
  moved = true,
): StartCheck {
  const { W, H } = c;
  const tiles: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.push((y + dy) * W + (x + dx));
  const doorI = door[1] * W + door[0];
  const problem = startProblemAt(c, x, y, door, bench, self);
  const N = W * H;
  // the ground as it would be: a generated start's bench levels its disc (and, in a project saved
  // before the water rule changed, its strip to the bank)
  const h = c.heights.slice();
  if (bench) {
    const f = { kind: "start", params: { position: [x, y], orientation: "Cw0", benchRadius: bench.radius, benchLevel: bench.level, player: 0, ...(bench.bank ? { bank: bench.bank } : {}) } } as unknown as StartFeature;
    const r = bench.radius + 1;
    const bx = bench.bank ?? [x, y];
    const x0 = Math.max(0, Math.floor(Math.min(x - r, bx[0] - 3)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(x + r, bx[0] + 3)));
    const y0 = Math.max(0, Math.floor(Math.min(y - r, bx[1] - 3)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(y + r, bx[1] + 3)));
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const i = yy * W + xx;
        if (inBench(f, xx, yy) && !(c.index && c.index.river[i] >= 0)) h[i] = bench.level;
      }
  }
  // what blocks walking, and the slopes the colony walks on
  const blocked = new Uint8Array(N);
  const e = c.entities;
  for (let k = 0; k < e.count; k++) {
    const t = e.templates[e.template[k]];
    if (!WALK_BLOCKERS.has(t) || !FOOTPRINTS[t]) continue;
    const p = { template: t, x: e.x[k], y: e.y[k], z: e.z[k], orientation: ORIENTATION_NAMES[e.orientation[k]] as Orientation, flipped: (e.flags[k] & FLIPPED) !== 0 };
    for (const [tx, ty] of footprintTiles(t, p)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) blocked[ty * W + tx] = 1;
  }
  const links = startLinks(c, h, x, y, door, !!bench && moved);
  const walk = walkDistance(h, W, H, blocked, links, { x, y });
  // 1. water: a shore the walk reaches, touching clean water a pump there reaches
  let nearestBad = Infinity;
  for (let i = 0; i < N; i++) {
    if (!(c.water.depth[i] > 0.05) || c.water.contamination[i] < 0.05) continue;
    const dist = Math.hypot((i % W) - x, Math.floor(i / W) - y);
    if (dist < nearestBad) nearestBad = dist;
  }
  const shore = pumpShoreDistance(walk, h, W, H, c.water.depth, c.water.contamination);
  const water = Number.isFinite(shore.distance) ? Math.round(shore.distance * 10) / 10 : null;
  // 2 and 3: the logs of the grown trees (alive or dead: a tree keeps its logs when it dies; a
  // sapling's are still growing) and the berry bushes that are not dead, within 20 tiles' walk
  let wood = 0;
  let woodGrowing = 0;
  const woodBySpecies = noWood();
  let bushes = 0;
  let nearestRuin = Infinity;
  for (let k = 0; k < e.count; k++) {
    const t = e.templates[e.template[k]];
    const i = e.y[k] * W + e.x[k];
    if (t.startsWith("RuinColumnH")) {
      const dist = Math.hypot(e.x[k] - x, e.y[k] - y);
      if (dist < nearestRuin) nearestRuin = dist;
      continue;
    }
    const logs = TREE_LOGS[t];
    if ((logs === undefined && t !== "BlueberryBush") || i < 0 || i >= N) continue;
    if (reachAt(walk, W, H, i) > 20) continue;
    if (logs !== undefined) {
      if ((e.flags[k] & YOUNG) !== 0) woodGrowing += logs;
      else {
        wood += logs;
        woodBySpecies[t as WoodSpecies] += logs;
      }
    } else if ((e.flags[k] & DEAD) === 0) bushes++;
  }
  const r = needs.rules;
  const meets = water !== null && water <= r.waterWithin && wood >= r.woodWithin20 && bushes >= r.bushesWithin20;
  // the targets: badwater and ruins farther than their distances, enough land to walk on
  const warnings: string[] = [];
  if (nearestBad < r.badwaterWithin) warnings.push(`Badwater ${Math.round(nearestBad)} tiles away (the target is ${r.badwaterWithin})`);
  if (nearestRuin < r.ruinsWithin) warnings.push(`Ruins ${Math.round(nearestRuin)} tiles away (the target is ${r.ruinsWithin})`);
  const labels = walkRegions(h, W, H, blocked, links);
  const root = labels[y * W + x];
  let land = 0;
  if (root >= 0) for (let i = 0; i < N; i++) if (labels[i] === root && !(c.water.depth[i] > 0.05)) land++;
  if (land < needs.reachMin) warnings.push(`${land.toLocaleString()} tiles of land to walk on (the target is ${needs.reachMin.toLocaleString()})`);
  return { problem, tiles, door: doorI, water, wood, woodBySpecies, woodGrowing, bushes, meets, warnings };
}

/** The river whose channel holds tile (x, y), and the arc position there (a click on a river). */
export function riverAt(index: FeatureIndex, x: number, y: number): { id: string; at: number } | null {
  const { W, H } = index;
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const k = index.river[y * W + x];
  if (k < 0) return null;
  const f = index.features[k];
  if (f.kind !== "river") return null;
  const field = index.riverField(f);
  return { id: f.id, at: Math.round(field.s[y * W + x] * 100) / 100 };
}

// ------------------------------------------------------------------------------------ sources

/** Sources side by side (a river's mouth on the map's edge, a cluster at its head) are one marker. */
export interface SourceGroup {
  /** Entity indices in the view. */
  members: number[];
  /** The middle tile of each source. */
  tiles: number[];
  /** Where the marker stands: the group's middle, and the ground's level there. */
  x: number;
  y: number;
  z: number;
  strength: number;
  bad: boolean;
}

/** A source's middle tile (a badwater source is 3 × 3, turned with it). */
export function sourceMiddle(v: EntityView, k: number, W: number): number {
  let x = v.x[k];
  let y = v.y[k];
  if (v.templates[v.template[k]] === "BadwaterSource") {
    const o = v.orientation[k];
    x += o === 0 || o === 1 ? 1 : -1;
    y += o === 0 || o === 3 ? 1 : -1;
  }
  return y * W + x;
}

/** The map's sources, as markers: those within two tiles of each other in one group. */
export function sourceGroups(v: EntityView, W: number, heights: Uint8Array): SourceGroup[] {
  const list: number[] = [];
  for (let k = 0; k < v.count; k++) {
    const t = v.templates[v.template[k]];
    if (t === "WaterSource" || t === "BadwaterSource") list.push(k);
  }
  const mid = list.map((k) => sourceMiddle(v, k, W));
  const group = new Int32Array(list.length).fill(-1);
  const out: SourceGroup[] = [];
  for (let a = 0; a < list.length; a++) {
    if (group[a] >= 0) continue;
    const g = out.length;
    const members: number[] = [];
    const stack = [a];
    group[a] = g;
    while (stack.length) {
      const b = stack.pop()!;
      members.push(b);
      const bx = mid[b] % W;
      const by = Math.floor(mid[b] / W);
      for (let c = 0; c < list.length; c++) {
        if (group[c] >= 0) continue;
        if (Math.abs((mid[c] % W) - bx) <= 2 && Math.abs(Math.floor(mid[c] / W) - by) <= 2) {
          group[c] = g;
          stack.push(c);
        }
      }
    }
    let sx = 0;
    let sy = 0;
    let strength = 0;
    let bad = false;
    for (const m of members) {
      sx += mid[m] % W;
      sy += Math.floor(mid[m] / W);
      strength += v.strength[list[m]];
      if (v.templates[v.template[list[m]]] === "BadwaterSource") bad = true;
    }
    const x = sx / members.length;
    const y = sy / members.length;
    const i = Math.round(y) * W + Math.round(x);
    out.push({ members: members.map((m) => list[m]), tiles: members.map((m) => mid[m]), x, y, z: heights[i] ?? 0, strength: Math.round(strength * 100) / 100, bad });
  }
  return out;
}

/** The groups whose water reaches the wet tile (x, y): from it, upstream through the water, over
 *  tiles whose surface is no lower than the one before (a river's upper reach, a whole pool, never
 *  a tributary that joins below). Null when the tile is dry. */
export function feedingGroups(water: SurfaceWater, groups: readonly SourceGroup[], W: number, H: number, x: number, y: number, limit = 40000): number[] | null {
  const start = y * W + x;
  const wet = (i: number) => water.depth[i] > 0.02 && water.surface[i] === water.surface[i];
  if (!wet(start)) return null;
  const byTile = new Map<number, number>();
  groups.forEach((g, k) => g.tiles.forEach((t) => byTile.set(t, k)));
  const seen = new Uint8Array(W * H);
  const found = new Set<number>();
  const queue = [start];
  seen[start] = 1;
  for (let q = 0; q < queue.length && q < limit; q++) {
    const i = queue[q];
    const g = byTile.get(i);
    if (g !== undefined) found.add(g);
    const cx = i % W;
    const s0 = water.surface[i];
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= W * H || seen[j] || (j === i - 1 && cx === 0) || (j === i + 1 && cx === W - 1)) continue;
      // a source on dry ground beside the water (its own water gone in a moment) still counts
      const gj = byTile.get(j);
      if (gj !== undefined && !wet(j)) {
        found.add(gj);
        continue;
      }
      if (!wet(j) || water.surface[j] < s0 - 0.02) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return [...found].sort((a, b) => a - b);
}
