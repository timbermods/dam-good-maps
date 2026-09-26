// Parametric features, schema v1 (PLAN §19.2). The generator's planner emits them, the build
// pipeline (build.ts, PLAN §19.8) rasterizes them, and the editor will edit their params. Sizes are
// in tiles, heights in terrain levels.

import type { Orientation } from "../format/footprints";
import type { Runs } from "../math/grid";

export const FEATURE_SCHEMA_VERSION = 1;

export type FeatureKind = "river" | "lake" | "landform" | "setPiece" | "forest" | "berryPatch" | "ruinField" | "mapObject" | "start";
export type Origin = "generated" | "user" | "claude" | "stamp";
export type Edge = "west" | "east" | "south" | "north";
export type Point = [number, number];

interface Base<K extends FeatureKind, P> {
  id: string;
  kind: K;
  origin: Origin;
  /** The feature's role in the generated plan (PLAN §19.4); ids are hashed from it. */
  role?: string;
  locked: boolean;
  params: P;
}

// ------------------------------------------------------------------------------------------ river

export interface BedStep {
  /** Arc length along the path, in tiles from the source end. */
  at: number;
  /** Levels the bed drops at this point. */
  drop: number;
  /** The on-river waterfall set piece this step belongs to. */
  setPiece?: string;
}

export interface RiverParams {
  /** Control points from source to outlet (tile coordinates; straight segments between them). */
  path: Point[];
  /** Channel width in tiles, 1–9. A tile is in the channel when its distance to the path is
   *  under width / 2. */
  width: number;
  /** Levels the bed sits below the floodplain, 1–4 (moisture band 16 / 10 / 4 / 0 tiles). */
  bedDepth: number;
  bedProfile: { start: number; steps: BedStep[] };
  /** Blocks of water per second entering at the source. */
  flow: number;
  style: "straight" | "meandering" | "braided";
  meander?: number;
  /** Where its water comes from: the map edge (a sealed mouth), a spring, a lake, or (drawn in
   *  the editor from existing water) a branch of that water at this point, with no source of its
   *  own. */
  entry: { edge: Edge } | { spring: Point } | { lake: string } | { branch: Point };
  /** Where its water goes: the map edge, a lake, a river, or (drawn in the editor) the ground at
   *  its end, where it fills the hollow there or runs on downhill. */
  exit: { edge: Edge } | { lake: string } | { river: string } | { basin: Point };
  badwater: boolean;
  /** Raise the ground beside the channel to its banks (bed + bedDepth) where it is lower: rivers
   *  drawn in the editor keep their water on any terrain. Generated rivers run in their valley. */
  banks?: boolean;
}

// ------------------------------------------------------------------------------------------- lake

export interface LakeParams {
  /** Basin outline, a closed polygon in tile coordinates. */
  outline: Point[];
  /** The basin floor, as levels above the river bed it sits on (1 = the floodplain). */
  floorDepth: number;
  outlet: {
    at: Point;
    sill: number;
    to: "edge" | "river" | "lake" | "none";
    target?: string;
    /** The outlet channel, planned once on the map (route.ts): tiles x0, y0, …, their bed levels,
     *  and its width. Lakes drawn in the editor have one; a planned basin drains by its river. */
    path?: number[];
    levels?: number[];
    width?: number;
  };
  inflow: { rivers: string[] } | { spring: number };
  /** A planned basin is a reservoir site: dry until the player dams its outlet. */
  planned: boolean;
  /** The river whose bed profile sets the floor level. */
  river?: string;
  /** Islands in the lake (the Islands theme's sea): each rises from the lake's floor to its height,
   *  with a cliff round it. */
  islands?: { outline: Point[]; height: number }[];
}

// --------------------------------------------------------------------------------------- landform

export interface TerraceBand {
  /** Distance past the valley floor edge where this band starts. */
  at: number;
  /** Levels it rises. */
  rise: number;
}

export interface LandformParams {
  kind: "hill" | "plateau" | "ridge" | "canyon" | "valley" | "island" | "terraces";
  edgeStyle: "gentle" | "terraced" | "cliff";
  /** Free-standing landforms (editor): outline and height. */
  outline?: Point[];
  height?: number;
  /** The ground level the edge starts from (the lowest ground round the outline when it was drawn).
   *  Gentle and terraced edges step from it toward `height`: gentle 1 level every 3 tiles,
   *  terraced every `bandDepth` tiles (6–12). Without it, every edge is a cliff. */
  base?: number;
  bandDepth?: number;
  /** The landform stands on the ground under it (the ones the player draws): it only ever raises
   *  the ground (a hill, a plateau, a ridge, an island) or only ever lowers it (a canyon, a valley),
   *  so ground higher than a hill's steps stays, and nothing is dug into the ground beside it.
   *  Without it (generated layouts), the landform sets the ground to its levels. */
  onGround?: boolean;
  /** Landforms of a generated layout follow a river: the valley floor and the terrace bands on
   *  each side of it. */
  along?: {
    river: string;
    /** Valley floor half-width in tiles. */
    halfWidth: number;
    /** Valley floor level above the river bed (the floodplain), usually 1. */
    floorAboveBed: number;
    /** Terraces only: which side of the path (+1 left of the flow direction, −1 right). */
    side?: 1 | -1;
    /** Terraces only: the level the first band starts from. */
    baseLevel?: number;
    bands?: TerraceBand[];
    /** Terraces only: noise that wiggles band edges (amplitude in tiles, feature size). */
    wobble?: { amp: number; cell: number; amp2: number; cell2: number };
    /** Terraces only: never above this level (PLAN §5.2, at most 16). */
    maxLevel?: number;
  };
}

// -------------------------------------------------------------------------------------- set piece

export type SetPieceKind =
  | "waterfall"
  | "damSite"
  | "gorge"
  | "terracedCliffs"
  | "badwaterBasin"
  | "plugSpillway"
  | "obstaclePayoff"
  | "secondDistrict";

export interface SetPieceParams {
  kind: SetPieceKind;
  /** What was asked for. */
  request: Record<string, number | string | boolean | number[]>;
  /** The resolved plan the rasterizer uses (PLAN §19.3). Rebuilds never plan again. */
  plan: Record<string, number | string | boolean | number[]>;
  /** Every value the builder reduced, and what it cleared or added. */
  report: string[];
}

// -------------------------------------------------------------------------------------- resources

export interface ForestParams {
  area: Runs;
  /** Share of the area's tiles that carry a tree, 0–1. */
  density: number;
  speciesMix: Partial<Record<"Pine" | "Birch" | "Oak" | "Succulent", number>>;
  groveSize?: number;
  /** auto: alive where the soil stays moist, stored dead on dry soil (as official maps do). */
  life: "auto" | "alive" | "dead";
  /** Share of living trees stored as saplings. */
  youngShare: number;
}

export interface BerryPatchParams {
  area: Runs;
  density: number;
  /** Share of bushes with berries ready at the start. */
  ripeShare: number;
}

export interface RuinFieldParams {
  area: Runs;
  scrapTarget: number;
  /** Shares of column heights H1…H8. */
  heightMix: number[];
  /** Lean of tall columns toward the middle (PLAN §9.7). */
  centerBias: number;
  /** The official maps' look (resources/baseline.ts `ruinColumns`): the field's own storey mix,
   *  tilted from the official shares by `tallness` (−1 short, 1 tall), a few towers among shorter
   *  columns, and the official shares of models and turns. Without it, heights follow `heightMix`
   *  and `centerBias` and the models are even. */
  layout?: { tallness: number };
}

export type MapObjectKind = "mineSite" | "relicSmall" | "relicMedium" | "relicLarge" | "geothermal" | "thornBelt" | "weir" | "plug" | "bridge" | "unstableCore";

/** A map object (PLAN §19.2, objects.ts). Single objects (mine sites, relics, geothermal fields,
 *  unstable cores) stand with their rotated footprint's south-west corner at (x, y). Lines and belts
 *  (thorn belts, NaturalDam weirs, Blockage plugs) put one object on every tile of their area. */
export interface MapObjectParams {
  kind: MapObjectKind;
  placement: { x: number; y: number; orientation: Orientation } | { area: Runs };
  /** An unstable core: its explosion radius (0–5) and the cycle its countdown starts (1–99). */
  core?: { radius: number; cycles: number };
}

// ------------------------------------------------------------------------------------------ start

export interface StartParams {
  /** Centre tile of the 3×3 district center. */
  position: Point;
  orientation: Orientation;
  benchRadius: number;
  benchLevel: number;
  /** Where the bench runs to the water (D85, D97): a point on a river's course. The bench's strip
   *  from the start to it stops at the channel, so the start's own level touches the river. */
  bank?: Point;
  /** Timber Together colonies are numbered from 0 (PLAN §20, D5). Vanilla maps have one start
   *  with player 0, and the writer never writes the player. */
  player: number;
}

export type RiverFeature = Base<"river", RiverParams>;
export type LakeFeature = Base<"lake", LakeParams>;
export type LandformFeature = Base<"landform", LandformParams>;
export type SetPieceFeature = Base<"setPiece", SetPieceParams>;
export type ForestFeature = Base<"forest", ForestParams>;
export type BerryPatchFeature = Base<"berryPatch", BerryPatchParams>;
export type RuinFieldFeature = Base<"ruinField", RuinFieldParams>;
export type MapObjectFeature = Base<"mapObject", MapObjectParams>;
export type StartFeature = Base<"start", StartParams>;

export type Feature =
  | RiverFeature
  | LakeFeature
  | LandformFeature
  | SetPieceFeature
  | ForestFeature
  | BerryPatchFeature
  | RuinFieldFeature
  | MapObjectFeature
  | StartFeature;

export function byKind<K extends FeatureKind>(features: readonly Feature[], kind: K): Extract<Feature, { kind: K }>[] {
  return features.filter((f) => f.kind === kind) as Extract<Feature, { kind: K }>[];
}
