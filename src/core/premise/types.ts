// The premise model (docs/PREMISES.md §1): a premise is a problem the player solves, with the water that makes it
// true; its plan is the map before any terrain (MAPCRAFT's steps 1 to 5 as data). Every later stage reads the plan
// and nothing else decides where things go. Plain data only: a plan is JSON (the fixture
// tests/fixtures/four-lakes.plan.json is one).
//
// Coordinates are tiles: x east, y north (the game's grid), a tile (i, j) covering [i, i + 1) × [j, j + 1). A body's
// outline and a path are in the same units; the camera reads a tile at its middle (i + 0.5, j + 0.5).

import type { Orientation } from "../format/footprints";
import type { MapSpec } from "../spec/mapspec";
import type { StageWater } from "./water";

export type PremiseId = "lakeStair";

/** A point in tiles. */
export type Point = [number, number];
/** A chain of capsules: each entry [x, y, radius], the radius running linearly between entries (four-lakes-design's
 *  `Sp[]`). A tile is inside when its distance to the chain is under the radius there. */
export type Spine = [number, number, number][];
/** The eight headings a fall may face (the way its water falls), x east, y north. */
export type Heading = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Edge = "N" | "E" | "S" | "W";

/** A source of water: every source runs bad in a badtide; `bad` marks the permanent badwater source (D200). */
export interface Source {
  id: string;
  at: Point;
  strength: number;
  /** The body (or, for the badwater source in the gorge, the link) it stands in. */
  into: string;
  bad?: boolean;
}

export type BodyKind = "lake" | "tarn" | "pool" | "basin" | "kettle";

export interface Body {
  id: string;
  kind: BodyKind;
  /** Its sill's crest: the water stands 0.1 to 0.6 over it. */
  sill: number;
  /** Its outline: chains of capsules. The first is the main arm. */
  arms: Spine[];
  /** Land inside the outline, a level over the water. */
  islands?: Spine[];
  /** The width of its level meadow, in tiles. */
  meadow: number;
  /** A lake's floor below its sill (its drowned river's line a level deeper where the floor leaves room); a pool's,
   *  a tarn's or a basin's deepest. */
  deep: number;
  /** An empty basin on day 1: a work fills it. */
  dry: boolean;
  region: string;
}

export type LinkKind = "fall" | "channel" | "leat" | "brook" | "gorge" | "bypass";

/** A fall over the sill of its link's `from` (four-lakes-design's `Fall`, generalised: any of eight headings, the lip
 *  a line at any angle, built later as unequal runs about it). */
export interface Fall {
  /** Crest over the water below: a stair fall's `f`, the landmark's `H`, the lowest sill's own over the gorge. */
  height: number;
  /** The crest's level (the upper body's sill; the hanging valley's bed at its lip). */
  crest: number;
  /** The lip's length in tiles. */
  width: number;
  face: Heading;
  /** The crest line, end to end. */
  lip: [Point, Point];
  /** Tiles of the notch a level deep (where the upper body drains in a drought): 1 on every sill but the lowest. */
  notch: number;
  /** The ruined weir's piers. */
  piers: number;
  /** Tiles of the weir's breach, a level deep (the first reservoir, once mended). */
  breach: number;
}

export interface Link {
  id: string;
  /** Body ids, or an exit id for `to`. */
  from: string;
  to: string;
  kind: LinkKind;
  /** A fall: over the sill of `from` (a landmark's crest is the end of its `path`, the hanging valley). */
  fall?: Fall;
  /** A channel: along a path, `from` first. */
  path?: Point[];
  /** Half the bed's width, in tiles. */
  half?: number;
  /** The mouth's full width where it differs from 2 × `half` (the bypass's 10). */
  mouth?: number;
  /** The bed's level at each point of `path`, or following the land `under` levels beneath it. */
  bed?: number[] | { under: number };
  /** Carries water on day 1. */
  wet: boolean;
  /** Tiles along `path` where a dam of its width shuts it (the player's). */
  gates: number[];
  /** Tiles along `path` where a row of Blockages spans it (the generator's). */
  rows: number[];
}

/** Where water leaves the map. */
export interface Exit {
  id: string;
  edge: Edge;
  at: Point;
}

export type RegionRole = "home" | "low" | "wet" | "top" | "dry";

export interface Region {
  id: string;
  role: RegionRole;
  problem: string;
  prize: string;
  dayOne: "green" | "dry" | "dryForGood";
  /** Where its name stands on the diagram. */
  at: Point;
}

export type RidgeRole = "skyline" | "spur" | "wall";

/** Rock along a line (four-lakes-design's `Ridge`): `top` high within `half` tiles of it, one ledge `drop` below
 *  the crest and `ledge` wide, the crest going up and down by `rough`. */
export interface Ridge {
  id: string;
  role: RidgeRole;
  path: Point[];
  top: number;
  half: number;
  drop: number;
  ledge: number;
  rough: number;
}

/** The start and its first frame, placed together before any land exists (PREMISES §4.3). */
export interface FrameGroup {
  /** The start's middle tile, its level and its turn. */
  start: { x: number; y: number; z: number; orientation: Orientation };
  /** The landmark: a link of kind `fall`. */
  landmark: string;
  /** How far the lip stands in front of the start's middle along the camera's look, in tiles. */
  lipAhead: number;
  /** The level tiles the start's bench should hold. */
  bench: number;
}

export type WorkRung = "first" | "small" | "medium" | "large";
export type WorkKind = "breach" | "notch" | "damToPond" | "levee" | "leat" | "raisedSill" | "bypass" | "megadam" | "canal";

export interface Work {
  id: string;
  rung: WorkRung;
  kind: WorkKind;
  /** The link or body it is built on. */
  on: string;
  /** Where it stands, for the diagram and the start's walk. */
  at: Point;
  /** What the player builds or clears, in tiles. */
  tiles: number;
  /** Works that must come first. */
  needs: string[];
  /** Tiles turned green or wet, as a range the later stages must hit; water held. */
  gives: { green: [number, number]; reservoir?: [number, number] };
  /** One line, when the work has a cost (a notch from a spring tarn runs red). */
  tradeoff?: string;
  region: string;
}

export type SetPieceKind = "ruinedWeir" | "stillPool" | "cave" | "relic" | "aquifer" | "drill" | "geothermal" | "aqueduct";

export interface SetPiece {
  id: string;
  kind: SetPieceKind;
  /** The body, link or work it is tied to. */
  on: string;
}

/** The lake stair's own numbers (PREMISES §4.1), kept so the invariants and the diagram read them directly. */
export interface StairPlan {
  /** Lakes `n`, and their ids from the lowest up. */
  n: number;
  lakes: string[];
  /** Levels between sills. */
  f: number;
  /** The start's lake and the landmark's height and source (the springs' pool or a lake `H` or more above). */
  startLake: string;
  H: number;
  landmarkSource: string;
  /** The valley's line, exit to springs, its shape and the turn (0–7: four rotations, mirrored from 4) it was laid
   *  out with. */
  valley: Point[];
  shape: "diagonal" | "S" | "hook";
  turn: number;
  /** The springs' pool, the neck, the bypass and the gorge. */
  pool: string;
  neck: string;
  bypass: string;
  gorge: string;
  /** The springs' total strength (River flow) and the meadow's base width (Buildable land). */
  flow: number;
  meadow: number;
}

export interface PremisePlan {
  premise: PremiseId;
  seed: number;
  W: number;
  H: number;
  /** The highest ground allowed (settings.terrain.highestTerrain). */
  top: number;
  /** The one-line problem, in this map's own names. */
  line: string;
  // the water story
  sources: Source[];
  bodies: Body[];
  links: Link[];
  exits: Exit[];
  // the skeleton
  regions: Region[];
  ridges: Ridge[];
  edges: Record<Edge, "falls away" | "ridge" | "water leaves">;
  // the start and its first frame
  frame: FrameGroup;
  // the ladder
  works: Work[];
  // set pieces and secrets
  setPieces: SetPiece[];
  names: Record<string, string>;
  /** The lake stair's numbers (other premises add their own). */
  stair?: StairPlan;
}

/** What a stage hands an invariant: stage 1 its water; later stages add the heights, the settle and the proofs. */
export interface StageContext {
  spec: MapSpec;
  plan: PremisePlan;
  /** Stage 1's water by number (water.ts), for the `land` invariants. */
  water?: StageWater;
}

/** The repair to try before a re-roll (stages 3 to 5 define them). */
export interface Repair {
  kind: string;
  detail?: string;
}

export type InvariantResult = { ok: true } | { ok: false; reason: string; repair?: Repair };

export type Stage = "plan" | "land" | "settled" | "proof" | "game";

export interface Invariant {
  /** "stair.levels", "frame.lip", "premise.open" … */
  id: string;
  at: Stage;
  /** Passed, or a one-line reason and, where one exists, the repair to try before a re-roll. */
  test(ctx: StageContext): InvariantResult;
}

export interface PremiseDef {
  id: PremiseId;
  /** Why a spec can't have this premise, in one line, or null (size, lakes: none, waterfalls: off …). */
  eligible(spec: MapSpec): string | null;
  /** The plan for this seed and these settings; `attempt` draws the next one. Pure arithmetic, no terrain. */
  draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string };
  /** Every rule a map of this premise must pass, each with the stage that can judge it. */
  invariants: Invariant[];
}
