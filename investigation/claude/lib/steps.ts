// Claude's operation schema: the steps a proposal is made of, and how the app turns each one into
// the engine's own operations (core/doc/ops.ts, via the planners of core/doc/tools.ts).
//
// Claude never writes a feature's params, a set piece's plan or tile runs: those are the builders'
// work (PLAN §19.3). A step names what it wants in the terms the tools speak: a kind, a request for
// its builder, or a place and a size for the app to resolve, exactly as find_sites would. So every
// step is bounded, the app checks it, and the same step gives the same edit from a proposal, a
// reference solution or a tool.
//
// Every step checks its own arguments (neither delivery route enforces numeric bounds, EDITOR_PLAN
// §7 "Safety"), and a proposal is capped at MAX_STEPS steps and MAX_AREA_SHARE of the map.

import type { EditOp } from "../../../src/core/doc/ops";
import type { MapSession } from "../../../src/core/doc/session";
import { cornerFor, deleteEdit, landformTop, moveEdit, objectsOnNewGround, planContextOf, planLake, planLandform, planPiece, planRiver, replacePatch, startCentre, type PlannedEdit } from "../../../src/core/doc/tools";
import { applyBrush, BRUSH_MAX_LEVEL, BRUSH_TOOLS, MAX_DABS, type BrushParams, type BrushTool } from "../../../src/core/features/raster/brush";
import { polygonMask } from "../../../src/core/features/geometry";
import { fmix32 } from "../../../src/core/math/hash";
import { hollowAt } from "../../../src/core/features/hollow";
import { entityProblem, planEntity } from "../../../src/core/doc/placing";
import { OFFICIAL_FLOW } from "../../../src/core/gen/calibrated";
import { FOREST, RUIN_HEIGHT_SHARES, RUINS } from "../../../src/core/gen/calibrated";
import type { Feature, LandformFeature, Point, SetPieceFeature, SetPieceKind, StartFeature } from "../../../src/core/features/schema";
import { BUILT_KINDS, type PlanRecord } from "../../../src/core/features/setpieces";
import { local, type Facing } from "../../../src/core/features/setpieces/common";
import { tilesToRuns } from "../../../src/core/math/grid";
import { TREE_LOGS } from "../../../src/core/format/entities";
import { LOGS_PER_TREE } from "../../../src/core/spec/mapspec";
import { rulesFor } from "../../../src/core/validate/playability";
import { newHandle, newId, refContext, type Conversation } from "./conversation";
import { entityTiles } from "../../../src/core/features/edits";
import { DERIVED_SLOPES } from "../../../src/core/features/ids";
import { removeKindOf, type RemoveKind } from "../../../src/core/features/objects";
import { FOOTPRINTS } from "../../../src/core/format/footprints";
import { locate, network } from "./flow";
import { SOURCE_PREFIX } from "./metrics";
import { nearExtras, patchStrokes } from "./dig";
import { anchorOf } from "./metrics";
import { compassWords, resolve, resolveRef, type Place } from "./places";
import { findSites, resourceArea, setVerifier, type SiteKind, type SitesResult } from "./sites";
import { guardsOf } from "./metrics";
import { newConversation } from "./conversation";
import { comparative, findWord, JUDGEMENT, leverPatch, sizeWordOf, type SizeWord } from "./words";
import { viewOf } from "./view";
import { carveParams, forceMapOf } from "../../../src/core/forces/carve/result";
import { CarveRun, type CarveSettings } from "../../../src/core/forces/carve/run";
import { protectedGround, STEPS_PER_SECOND } from "../../../src/core/forces/force";

export const MAX_STEPS = 12;
/** Set pieces a step can place: the kinds with a site search. Kinds the engine builds beyond these
 *  (M7's plugSpillway, obstaclePayoff, secondDistrict) are refused with the reason until they get one. */
export const STEP_PIECES: readonly SetPieceKind[] = ["waterfall", "damSite", "gorge", "terracedCliffs", "badwaterBasin"];
/** The share of the map one proposal may change (tiles of areas, outlines and sculpts). */
export const MAX_AREA_SHARE = 0.3;

export type Where = Place | string;

export type Step =
  | { op: "changeSettings"; word?: string; degree?: number; patch?: { designedFor?: string; settings?: Record<string, Record<string, unknown>> } }
  | { op: "addSetPiece"; kind: SetPieceKind; request?: PlanRecord; where?: Where; size?: SizeWord | number; handle?: string; keepReservoirsClean?: boolean; nearStart?: boolean; awayFromStart?: number }
  | { op: "changeSetPiece"; target: string; request?: PlanRecord; change?: string }
  | { op: "changeFeature"; target: string; set: { level?: number; floorDepth?: number; spring?: number; flow?: number; width?: number; height?: number; edgeStyle?: "gentle" | "terraced" | "cliff"; density?: number } }
  /** Setups only (a corpus map with a drawn creek, as documents from before D184 hold them). */
  | { op: "addRiver"; points: Point[]; flow?: number | "gentle" | "steady" | "strong"; width?: number; bedDepth?: number; badwater?: boolean; handle?: string }
  /** A water or badwater source (the editor's Source, live editing): where water starts, or, with
   *  fillHollow, a spring at the lowest point of the hollow there, which fills it into a lake. */
  | { op: "addSource"; kind: "water" | "badwater"; where?: Where; at?: [number, number]; strength?: number; fillHollow?: boolean; handle?: string }
  /** Setups only (a corpus map with a lake, as documents from before D184 hold them). */
  | { op: "addLake"; outline?: Point[]; where?: Where; size?: SizeWord | number; level?: number; floorDepth?: number; spring?: number; handle?: string }
  | { op: "addResource"; kind: "forest" | "berryPatch" | "ruinField"; where: Where; amount?: number; size?: SizeWord; at?: [number, number]; handle?: string }
  | { op: "removeResources"; kind: "trees" | "bushes" | "ruins"; where: Where }
  /** An object from the editor's left shelf (D184): at a tile, or where it fits in a place (nearest
   *  its middle); `turn` quarter turns; a relic's size, a ruin's height. */
  | { op: "placeObject"; object: ShelfObject; at?: [number, number]; where?: Where; turn?: number; size?: "small" | "medium" | "large"; height?: number }
  /** The editor's Remove (D184): the objects standing in a place that `kinds` names (all of them
   *  but the start when absent); it never changes the ground, and the start stays. */
  | { op: "remove"; where: Where; kinds?: RemoveKind[] }
  | { op: "moveFeature"; target: string; by?: [number, number]; to?: [number, number] | Where }
  /** The start moved (to a tile or the best spot in a place), and its door turned to face a way (the
   *  shelf's R, D184); with only `facing`, it turns where it stands. */
  | { op: "moveStart"; to?: [number, number] | Where; facing?: "north" | "east" | "south" | "west"; bringFood?: boolean }
  | { op: "deleteFeature"; target: string }
  /** Refused (D196: water is never an object); kept for the refusal's advice. */
  | { op: "setRiverBadwater"; target: string; badwater: boolean }
  /** Sources' strength (D196: a river's flow is its sources' strength): the sources of a river (its
   *  mouth on the map's edge), at a tile, or in a place; each set to `strength`, or `flow` shared
   *  among them. */
  | { op: "changeSource"; river?: string; at?: [number, number]; where?: Where; strength?: number; flow?: number }
  | { op: "sculpt"; mode: "raise" | "lower" | "flatten" | "smooth"; where: Where; amount?: number; level?: number }
  /** The editor's terrain brushes (live editing; the brush kit is the editor's core, D182),
   *  painted over a place: all of it, or with `size` a round patch of it near its middle; edges
   *  "slope" (the brushes' own: a level a tile) or "cliff" (every tile the full amount). Or one
   *  stroke along a `path`, `size` tiles wide: a Lower stroke that starts in or beside water, or
   *  beside a source, carves a bed that keeps flowing downhill, and the water follows it (smart
   *  Lower, D184). The brush kit's options (D184, D204): flatten `steps` (terraces every so many
   *  levels) and `edges` "ramped" (the rim's steps get the game's natural slopes, so beavers walk
   *  up); smooth `walkable` (steps worn to one level, with the natural slopes on them). */
  | { op: "brush"; tool: BrushTool; where?: Where; path?: Point[]; amount?: number; level?: number; passes?: number; size?: SizeWord | number; edges?: "slope" | "cliff" | "ramped"; steps?: number; walkable?: boolean }
  /** Carve (D194, D199): a river unleashed from a spot (from, or the highest dry ground of where),
   *  or aimed at an end (to); run to its end, or for `seconds`. */
  | { op: "carve"; from?: [number, number]; where?: Where; to?: [number, number] | Where; power?: number | keyof typeof POWER_WORDS; width?: number; wander?: number; walls?: "steep" | "wide"; river?: "keep" | "dry"; defyGravity?: boolean; seconds?: number; path?: number; handle?: string }
  | { op: "undoLast" };

export const STEP_OPS = ["changeSettings", "addSetPiece", "changeSetPiece", "changeFeature", "addSource", "changeSource", "addResource", "removeResources", "placeObject", "remove", "moveFeature", "moveStart", "deleteFeature", "sculpt", "brush", "carve", "undoLast"] as const;

/** The shelf's objects, as a step names them, and the object each places (D184). */
export const SHELF_OBJECTS = { pine: "Pine", birch: "Birch", oak: "Oak", berryBush: "BlueberryBush", ruin: "RuinColumnH", mineSite: "UndergroundRuins", relic: "Relic", slope: "Slope", thorns: "Thorns", naturalDam: "NaturalDam", blockage: "Blockage", geothermal: "GeothermalField" } as const;
export type ShelfObject = keyof typeof SHELF_OBJECTS;
const REMOVE_KINDS: readonly RemoveKind[] = ["trees", "bushes", "ruins", "objects", "slopes", "sources"];

/** Steps only a corpus map's setup may use: its drawn creeks and lakes, as saved documents from
 *  before D184 hold them. Claude is never offered them. */
const SETUP_OPS: readonly string[] = ["addRiver", "addLake"];
let setupSteps = false;
/** Run `fn` with the setup-only steps allowed (building a corpus map). */
export function withSetupSteps<T>(fn: () => T): T {
  const was = setupSteps;
  setupSteps = true;
  try {
    return fn();
  } finally {
    setupSteps = was;
  }
}

/** Hills and valleys come from the brushes (PLAN §20 D182): what a step that asks for a shape
 *  object is told. */
const NO_LANDFORMS = "hills, plateaus, ridges, canyons and valleys come from the brushes: use the brush step (raise, lower, flatten, smooth, naturalize), with where, size, amount or level, and edges slope or cliff";
/** Water is never an object (D196): what a step that treats a river or a lake as one is told. */
const NO_WATER_OBJECTS = "water is never an object: a river's flow is its sources' strength (changeSource), clean or bad belongs to each source (to make water bad, add a badwater source where it should start, with addSource kind badwater), and water changes only through its sources and its land (brush)";

/** Rivers and lakes come from the land and the water (D184). */
const NO_RIVERS = "rivers and lakes come from the land and the water: carve a river with a brush step, tool lower, along a path that starts in or beside water or beside a source (its bed keeps flowing downhill and the water follows it); for a lake, dig a hollow with a lower brush and fill it with addSource and fillHollow";

export interface Expanded {
  ok: boolean;
  step: Step;
  /** The engine's operations, applied as one group (a settings change is a `specPatch` alone). */
  ops: EditOp[];
  /** Features this step makes: handle → id. */
  made: { handle: string; id: string; kind: string }[];
  /** What the builders reported: reductions, what was cleared, what was added. */
  report: string[];
  /** How the app read the step: the place, the site chosen, the settings moved. */
  resolved: Record<string, unknown>;
  errors: string[];
  /** When the step cannot be done: the nearest feasible alternative, as a step, never applied. */
  alternative?: { note: string; step: Record<string, unknown> | null };
  /** Tiles the step changes (for the proposal's area cap). */
  tiles: number;
}

const fail = (step: Step, errors: string[], alternative?: Expanded["alternative"], resolved: Record<string, unknown> = {}): Expanded => ({ ok: false, step, ops: [], made: [], report: [], resolved, errors, alternative, tiles: 0 });

// ------------------------------------------------------------------------------ argument checks

const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;

function checkPlace(w: unknown, name: string, W: number, H: number): string[] {
  if (w === undefined) return [];
  if (typeof w === "string") return w.length <= 200 ? [] : [`${name} is longer than 200 characters`];
  if (typeof w !== "object" || w === null) return [`${name} must be a phrase or a place object`];
  const s = JSON.stringify(w);
  if (s.length > 1500) return [`${name} is too large`];
  // tile references inside must be on the map
  const bad = s.match(/\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/g)?.find((m) => {
    const [x, y] = JSON.parse(m) as number[];
    return x < 0 || y < 0 || x >= Math.max(W, 4096) || y >= Math.max(H, 4096);
  });
  return bad ? [`${name} has a tile off the map: ${bad}`] : [];
}

function checkPoints(p: unknown, W: number, H: number, name: string, min: number, max: number): string[] {
  if (!Array.isArray(p) || p.length < min || p.length > max) return [`${name} needs ${min}–${max} points`];
  for (const q of p) if (!Array.isArray(q) || q.length !== 2 || !num(q[0], -1, W) || !num(q[1], -1, H)) return [`${name}: ${JSON.stringify(q)} is not a tile on the ${W}×${H} map`];
  return [];
}

function checkRequest(r: unknown): string[] {
  if (r === undefined) return [];
  if (typeof r !== "object" || r === null || Array.isArray(r)) return ["request must be an object"];
  const keys = Object.keys(r);
  if (keys.length > 16) return ["request has too many fields"];
  for (const k of keys) {
    const v = (r as Record<string, unknown>)[k];
    const ok =
      (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 4096) ||
      (typeof v === "string" && v.length <= 64) ||
      typeof v === "boolean" ||
      (Array.isArray(v) && v.length <= 4 && v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 4096));
    if (!ok) return [`request.${k} must be a number, a short word, a flag or a tile`];
  }
  return [];
}

/** Why a step's arguments are malformed or out of bounds (empty when they are fine). */
export function checkStep(step: unknown, W: number, H: number): string[] {
  if (typeof step !== "object" || step === null || Array.isArray(step)) return ["each step is an object with an op"];
  const s = step as Record<string, unknown>;
  if (s.op === "addLandform" || s.op === "resizeFeature") return [NO_LANDFORMS];
  if (SETUP_OPS.includes(String(s.op)) && !setupSteps) return [NO_RIVERS];
  if (s.op === "setRiverBadwater") return [NO_WATER_OBJECTS];
  if (!STEP_OPS.includes(s.op as (typeof STEP_OPS)[number]) && !SETUP_OPS.includes(String(s.op))) return [`unknown op ${String(s.op).slice(0, 40)}: use one of ${STEP_OPS.join(", ")}`];
  if (JSON.stringify(s).length > 4000) return [`the ${s.op} step is too large`];
  if (s.handle !== undefined && !(str(s.handle, 40) && /^[a-z0-9][a-z0-9-]*$/i.test(String(s.handle)))) return ["handle is a short name of letters, digits and dashes"];
  if (s.size !== undefined && !(num(s.size, 1, 4096) || (typeof s.size === "string" && ["tiny", "small", "medium", "large", "huge"].includes(s.size)))) return ["size is tiny, small, medium, large, huge or a number"];
  const errs: string[] = [];
  switch (s.op) {
    case "changeSettings":
      if (s.word === undefined && s.patch === undefined) return ["changeSettings needs a word (harsher, lush, …) or a patch"];
      if (s.word !== undefined && !str(s.word, 40)) return ["word is a short judgement word"];
      if (s.degree !== undefined && !num(s.degree, 0.5, 2)) return ["degree is 0.5 (a bit), 1 or 2 (much)"];
      if (s.patch !== undefined) {
        const p = s.patch as Record<string, unknown>;
        if (typeof p !== "object" || p === null) return ["patch must be an object"];
        const extra = Object.keys(p).filter((k) => k !== "designedFor" && k !== "settings");
        if (extra.length) return [`patch may change designedFor and settings only, not ${extra.join(", ")}`];
      }
      return [];
    case "addSetPiece":
      if (!STEP_PIECES.includes(s.kind as SetPieceKind)) return [`kind must be one of ${STEP_PIECES.join(", ")} (${BUILT_KINDS.includes(s.kind as SetPieceKind) ? `the engine builds ${String(s.kind)}, but no step places it yet` : "the others are not built yet"})`];
      errs.push(...checkRequest(s.request), ...checkPlace(s.where, "where", W, H));
      if (s.request === undefined && s.where === undefined) errs.push("addSetPiece needs a request or a where");
      if (s.awayFromStart !== undefined && !num(s.awayFromStart, 0, 256)) errs.push("awayFromStart is 0–256 tiles");
      return errs;
    case "changeSetPiece":
      if (!str(s.target, 80)) return ["target names the set piece (a handle or an id)"];
      if (s.request === undefined && s.change === undefined) return ["changeSetPiece needs a request patch or a change (\"wider\", \"a bit taller\")"];
      return [...checkRequest(s.request), ...(s.change !== undefined && !str(s.change, 80) ? ["change is a short phrase"] : [])];
    case "changeFeature": {
      if (!str(s.target, 80)) return ["target names the feature"];
      const set = s.set as Record<string, unknown> | undefined;
      if (!set || typeof set !== "object" || Array.isArray(set) || !Object.keys(set).length) return ["set holds the values to change: level, floorDepth, spring, flow, width, height, edgeStyle or density"];
      const bounds: Record<string, [number, number]> = { level: [1, 15], floorDepth: [1, 4], spring: [0, 8], flow: [0.1, 64], width: [1, 9], height: [0, 16], density: [0, 1] };
      for (const [k, x] of Object.entries(set)) {
        if (k === "edgeStyle") {
          if (!["gentle", "terraced", "cliff"].includes(String(x))) errs.push("edgeStyle is gentle, terraced or cliff");
        } else if (!bounds[k]) errs.push(`${k} cannot be changed here`);
        else if (!num(x, bounds[k][0], bounds[k][1])) errs.push(`${k} is ${bounds[k][0]}–${bounds[k][1]}`);
      }
      return errs;
    }
    case "addSource":
      if (s.kind !== "water" && s.kind !== "badwater") return ["kind is water or badwater"];
      if (s.at === undefined && s.where === undefined) errs.push("addSource needs at [x, y] or a where");
      if (s.at !== undefined && !(Array.isArray(s.at) && s.at.length === 2 && num(s.at[0], 0, W - 1) && num(s.at[1], 0, H - 1))) errs.push("at is a tile [x, y] on the map");
      if (s.strength !== undefined && !num(s.strength, 0.25, s.kind === "badwater" ? 72 : 8)) errs.push(`strength is 0.25–${s.kind === "badwater" ? 72 : 8} blocks of water a second (a water source's one tile holds 8 at most; a badwater source's 3×3, 72)`);
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "addRiver":
      errs.push(...checkPoints(s.points, W, H, "points", 2, 24));
      if (s.flow !== undefined && !(num(s.flow, 0.1, 64) || ["gentle", "steady", "strong"].includes(String(s.flow)))) errs.push("flow is 0.1–64 blocks/s or gentle, steady, strong");
      if (s.width !== undefined && !num(s.width, 1, 9)) errs.push("width is 1–9 tiles");
      if (s.bedDepth !== undefined && !num(s.bedDepth, 1, 4)) errs.push("bedDepth is 1–4");
      return errs;
    case "addLake":
      if (s.outline !== undefined) errs.push(...checkPoints(s.outline, W, H, "outline", 3, 32));
      else if (s.where === undefined) errs.push("addLake needs an outline or a where");
      errs.push(...checkPlace(s.where, "where", W, H));
      if (s.level !== undefined && !num(s.level, 1, 15)) errs.push("level is 1–15");
      if (s.floorDepth !== undefined && !num(s.floorDepth, 1, 4)) errs.push("floorDepth is 1–4");
      if (s.spring !== undefined && !num(s.spring, 0, 8)) errs.push("spring is 0–8 blocks/s");
      return errs;
    case "addResource":
      if (!["forest", "berryPatch", "ruinField"].includes(String(s.kind))) return ["kind is forest, berryPatch or ruinField"];
      if (s.amount !== undefined && !num(s.amount, 1, 20000)) errs.push("amount is 1–20,000 (trees, bushes or scrap)");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "removeResources":
      if (!["trees", "bushes", "ruins"].includes(String(s.kind))) return ["kind is trees, bushes or ruins"];
      return checkPlace(s.where, "where", W, H);
    case "placeObject":
      if (!(String(s.object) in SHELF_OBJECTS)) return [`object is ${Object.keys(SHELF_OBJECTS).join(", ")}`];
      if (s.at === undefined && s.where === undefined) return ["placeObject needs at [x, y] or a where"];
      if (s.at !== undefined && !(Array.isArray(s.at) && s.at.length === 2 && num(s.at[0], 0, W - 1) && num(s.at[1], 0, H - 1))) errs.push("at is a tile [x, y] on the map");
      if (s.turn !== undefined && !(Number.isInteger(s.turn) && num(s.turn, 0, 3))) errs.push("turn is 0–3 quarter turns");
      if (s.size !== undefined && !["small", "medium", "large"].includes(String(s.size))) errs.push("size is small, medium or large (a relic)");
      if (s.height !== undefined && !(Number.isInteger(s.height) && num(s.height, 1, 8))) errs.push("height is 1–8 levels (a ruin)");
      return s.where === undefined ? errs : [...errs, ...checkPlace(s.where, "where", W, H)];
    case "remove":
      if (s.kinds !== undefined && !(Array.isArray(s.kinds) && s.kinds.every((k) => REMOVE_KINDS.includes(k as RemoveKind)))) errs.push(`kinds are ${REMOVE_KINDS.join(", ")}`);
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "moveFeature":
      if (!str(s.target, 80)) return ["target names the feature"];
      if (s.by !== undefined && !(Array.isArray(s.by) && s.by.length === 2 && num(s.by[0], -W, W) && num(s.by[1], -H, H))) return ["by is [dx, dy] in tiles"];
      if (s.by === undefined && s.to === undefined) return ["moveFeature needs by or to"];
      if (Array.isArray(s.to)) return s.to.length === 2 && num(s.to[0], 0, W - 1) && num(s.to[1], 0, H - 1) ? [] : ["to is a tile [x, y] on the map, or a place"];
      return checkPlace(s.to, "to", W, H);
    case "moveStart":
      if (s.facing !== undefined && !["north", "east", "south", "west"].includes(String(s.facing))) return ["facing is north, east, south or west (where the start's door looks)"];
      if (s.to === undefined) return s.facing === undefined ? ["moveStart needs to (a tile or a place) or facing"] : [];
      if (Array.isArray(s.to)) return s.to.length === 2 && num(s.to[0], 0, W - 1) && num(s.to[1], 0, H - 1) ? [] : ["to is a tile [x, y] on the map, or a place"];
      return checkPlace(s.to, "to", W, H);
    case "deleteFeature":
      return str(s.target, 80) ? [] : ["target names the feature"];
    case "changeSource":
      if (s.river === undefined && s.at === undefined && s.where === undefined) return ["changeSource needs a river (its sources), at [x, y] or a where"];
      if (s.river !== undefined && !str(s.river, 80)) return ["river names a river"];
      if (s.at !== undefined && !(Array.isArray(s.at) && s.at.length === 2 && num(s.at[0], 0, W - 1) && num(s.at[1], 0, H - 1))) return ["at is a tile [x, y] on the map"];
      if (s.strength === undefined && s.flow === undefined) return ["changeSource needs a strength (each source's) or a flow (shared among them)"];
      if (s.strength !== undefined && !num(s.strength, 0.25, 72)) errs.push("strength is 0.25–8 blocks/s for a water source (its one tile holds 8 at most), 0.25–72 for a badwater source");
      if (s.flow !== undefined && !num(s.flow, 0.1, 64)) errs.push("flow is 0.1–64 blocks/s in all");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "sculpt":
      if (!["raise", "lower", "flatten", "smooth"].includes(String(s.mode))) return ["mode is raise, lower, flatten or smooth"];
      if (s.amount !== undefined && !num(s.amount, 1, 8)) errs.push("amount is 1–8 levels");
      if (s.level !== undefined && !num(s.level, 0, 16)) errs.push("level is 0–16");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "brush":
      if (!BRUSH_TOOLS.includes(s.tool as BrushTool)) return [`tool is ${BRUSH_TOOLS.join(", ")}`];
      if (s.where === undefined && s.path === undefined) errs.push("brush needs a where (the place it paints) or a path (one stroke along it)");
      if (s.path !== undefined) errs.push(...checkPoints(s.path, W, H, "path", 2, 24));
      if (s.path !== undefined && typeof s.size === "number" && !num(s.size, 1, 9)) errs.push("along a path, size is the stroke's width: 1–9 tiles, or tiny, small, medium, large, huge");
      if (s.amount !== undefined && !(Number.isInteger(s.amount) && num(s.amount, 1, 8))) errs.push("amount is 1–8 whole levels (raise and lower)");
      if (s.level !== undefined && !(Number.isInteger(s.level) && num(s.level, 0, BRUSH_MAX_LEVEL))) errs.push(`level is a whole level, 0–${BRUSH_MAX_LEVEL} (flatten)`);
      if (s.passes !== undefined && !(Number.isInteger(s.passes) && num(s.passes, 1, 8))) errs.push("passes is 1–8 (smooth and naturalize)");
      if (s.edges !== undefined && s.edges !== "slope" && s.edges !== "cliff" && s.edges !== "ramped") errs.push("edges is slope, cliff or ramped (flatten)");
      if (s.edges === "ramped" && s.tool !== "flatten") errs.push("ramped edges are flatten's: its rim steps down to the ground round it with the game's natural slopes");
      if (s.steps !== undefined && (s.tool !== "flatten" || !(Number.isInteger(s.steps) && num(s.steps, 2, 8)))) errs.push("steps is flatten's: terraces every 2–8 levels");
      if (s.walkable !== undefined && (s.tool !== "smooth" || typeof s.walkable !== "boolean")) errs.push("walkable is smooth's: true wears steps to one level and puts the game's natural slopes on them");
      return [...errs, ...checkPlace(s.where, "where", W, H)];
    case "carve":
      if (s.from === undefined && s.where === undefined) return ["carve needs from [x, y] or a where (its start: the highest dry ground there)"];
      if (s.from !== undefined && !(Array.isArray(s.from) && s.from.length === 2 && num(s.from[0], 0, W - 1) && num(s.from[1], 0, H - 1))) errs.push("from is a tile [x, y] on the map");
      if (Array.isArray(s.to) && !(s.to.length === 2 && num(s.to[0], 0, W - 1) && num(s.to[1], 0, H - 1))) errs.push("to is a tile [x, y] on the map, or a place");
      if (s.power !== undefined && !(num(s.power, 0, 100) || String(s.power) in POWER_WORDS)) errs.push("power is 0–100, or creek, torrent, river, catastrophe");
      if (s.width !== undefined && !num(s.width, 2, 24)) errs.push("width is 2–24 tiles (left out, it follows power)");
      if (s.wander !== undefined && !num(s.wander, 0, 100)) errs.push("wander is 0 (straight) to 100 (winding)");
      if (s.walls !== undefined && s.walls !== "steep" && s.walls !== "wide") errs.push("walls is steep (a gorge) or wide (terraces)");
      if (s.river !== undefined && s.river !== "keep" && s.river !== "dry") errs.push("river is keep (a source at its start keeps it flowing) or dry (a dry canyon)");
      if (s.defyGravity !== undefined && typeof s.defyGravity !== "boolean") errs.push("defyGravity is true or false (aimed carves: it cuts to an end uphill)");
      if (s.defyGravity === true && s.to === undefined) errs.push("defyGravity is for an aimed carve: give it a to");
      if (s.seconds !== undefined && !num(s.seconds, 0.5, 120)) errs.push("seconds is 0.5–120 (left out, it runs until it ends by itself)");
      if (s.path !== undefined && !(Number.isInteger(s.path) && num(s.path, 0, 99))) errs.push("path is 0–99: 0 the first course, 1, 2, … the editor's Try another path");
      return [...errs, ...(s.where !== undefined ? checkPlace(s.where, "where", W, H) : []), ...(s.to !== undefined && !Array.isArray(s.to) ? checkPlace(s.to, "to", W, H) : [])];
    case "undoLast":
      return [];
  }
  return [];
}

// ---------------------------------------------------------------------------------- expansion

function targetFeature(s: MapSession, conv: Conversation, target: string): Feature | string {
  const t = resolveRef(viewOf(s), target, refContext(conv));
  if (typeof t === "string") return t;
  if (!t.id) return `${target} is not a feature`;
  const f = s.features.find((g) => g.id === t.id);
  return f ?? `${target} no longer exists`;
}

function fromPlanned(step: Step, r: PlannedEdit, conv: Conversation, kind: string, handle: string | undefined, id: string, resolved: Record<string, unknown> = {}): Expanded {
  if (!r.ok) return fail(step, r.errors, undefined, resolved);
  const h = newHandle(conv, kind, handle);
  return { ok: true, step, ops: r.ops, made: [{ handle: h, id, kind }], report: r.report, resolved, errors: [], tiles: r.tiles.length };
}

const SITE_OF: Partial<Record<SetPieceKind, SiteKind>> = { damSite: "damSite", gorge: "gorge", terracedCliffs: "terracedCliffs", badwaterBasin: "badwaterBasin" };

function siteSummary(r: SitesResult): Record<string, unknown> {
  const site = r.sites[0];
  return {
    place: r.region.reading,
    placeTiles: r.region.tiles,
    assumptions: r.region.assumptions,
    ...(r.region.ignored.length ? { ignoredWords: r.region.ignored } : {}),
    ...(site ? { site: { at: site.at, where: site.where, course: site.course, measured: site.measured } } : {}),
    ...(r.target ? { sizeTarget: r.target } : {}),
  };
}

function alternativeOf(r: SitesResult): Expanded["alternative"] {
  if (!r.alternative) return undefined;
  const note = r.alsoPossible ? `${r.alternative.note}; or ${r.alsoPossible.note}` : r.alternative.note;
  return { note, step: r.alternative.site.step };
}

/** Turn one step into the engine's operations on the map as it stands now. */
export function expandStep(s: MapSession, conv: Conversation, step: Step): Expanded {
  const { x: W, y: H } = s.size;
  const errs = checkStep(step, W, H);
  if (errs.length) return fail(step, errs);
  const v = viewOf(s);
  const refs = refContext(conv);
  switch (step.op) {
    case "changeSettings": {
      if (!s.spec) return fail(step, ["an imported map has no settings to change"]);
      if (step.word) {
        const w = JUDGEMENT.find((j) => j.word === step.word) ?? findWord(step.word)?.word;
        if (!w) return fail(step, [`"${step.word}" is not in the judgement-word table (${JUDGEMENT.map((j) => j.word).join(", ")})`]);
        const { patch, moved, atBound } = leverPatch(s.spec, w.levers, step.degree ?? 1);
        if (!moved.length) return fail(step, [`the map is already as ${w.word} as its settings go (${atBound.join(", ")} at their limits)`]);
        const weak = w.weakOn?.includes(s.spec.theme) ? { weakHere: `on a ${s.spec.theme} map these settings barely move ${w.targets.map((t) => t.metric).join(", ")}` } : {};
        return { ok: true, step, ops: [{ op: "specPatch", params: { patch: { settings: patch } } }], made: [], report: [], resolved: { word: w.word, means: w.means, moved, ...(atBound.length ? { atBound } : {}), levers: w.levers.map((l) => l.setting.join(".")), ...weak }, errors: [], tiles: 0 };
      }
      return { ok: true, step, ops: [{ op: "specPatch", params: { patch: step.patch as Record<string, unknown> } }], made: [], report: [], resolved: { patch: step.patch }, errors: [], tiles: 0 };
    }
    case "addSetPiece": {
      const id = newId(conv, step.kind);
      hintIds({ ...conv, counter: conv.counter - 1 });
      let request = step.request;
      let resolved: Record<string, unknown> = {};
      if (!request || step.where !== undefined) {
        const kind: SiteKind = step.kind === "waterfall" ? (request?.mode === "on-river" ? "riverFall" : "waterfall") : (SITE_OF[step.kind] ?? "damSite");
        const r = findSites(s, { kind, where: step.where, size: step.size, request, keepReservoirsClean: step.keepReservoirsClean, nearStart: step.nearStart, awayFromStart: step.awayFromStart, limit: 1 }, refs);
        resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no site fits"], alternativeOf(r), resolved);
        const site = r.sites[0];
        if (site.step.existing) {
          return { ok: true, step, ops: [], made: [], report: [`the dam site ${String(site.step.existing)} already here meets it: nothing to build`], resolved: { ...resolved, existing: site.step.existing }, errors: [], tiles: 0 };
        }
        request = { ...(site.step.request as PlanRecord) };
      }
      const planned = planPiece(s, step.kind, request, id, "claude");
      return fromPlanned(step, planned, conv, step.kind, step.handle, id, { ...resolved, request });
    }
    case "changeSetPiece": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind !== "setPiece") return fail(step, [`${step.target} is a ${f.kind}, not a set piece`]);
      let req: PlanRecord = { ...f.params.request, ...(f.params.plan.mode === "standalone" ? { lip: f.params.plan.lip as number[] } : {}), ...(step.request ?? {}) };
      let gained = 0;
      if (step.change) {
        const c = comparative(step.change);
        if (!c) return fail(step, [`"${step.change}" is not a change the app knows (wider, narrower, taller, bigger, a bit …)`]);
        const key = c.param === "size" ? (f.params.kind === "waterfall" ? "width" : f.params.kind === "damSite" ? "crest" : "width") : c.param === "depth" ? "crest" : c.param;
        const cur = Number(f.params.plan[key] ?? req[key]);
        if (!Number.isFinite(cur)) return fail(step, [`a ${f.params.kind} has no ${c.param} to change`]);
        let next = key === "flow" ? Math.round(cur * c.factor * 100) / 100 : Math.round(cur * c.factor);
        if (key !== "flow" && next === cur) next = cur + (c.factor > 1 ? 1 : -1);
        req[key] = next;
        if (key === "width" && f.params.kind === "waterfall") gained = next - cur;
      }
      let planned = planPiece(s, f.params.kind, req, f.id, f.origin);
      // a standalone fall that grows into a river grows away from it instead: its lip moves along
      // itself, at most the width it gains
      const moves: string[] = [];
      const lip = req.lip as number[] | undefined;
      if (!planned.ok && gained > 0 && f.params.plan.mode === "standalone" && lip && planned.errors.some((e) => e.startsWith("it would dam a river"))) {
        const facing = String(req.facing ?? f.params.plan.facing) as Facing;
        for (let k = 1; k <= gained && !planned.ok; k++)
          for (const v of [k, -k]) {
            const [dx, dy] = local(0, 0, facing, 0, v);
            const moved = { ...req, lip: [lip[0] + dx, lip[1] + dy] };
            const r = planPiece(s, f.params.kind, moved, f.id, f.origin);
            if (!r.ok) continue;
            planned = r;
            req = moved;
            moves.push(`moved ${k} tile${k > 1 ? "s" : ""} along its lip, away from the river, to grow`);
            break;
          }
      }
      if (!planned.ok) return fail(step, planned.errors);
      return { ok: true, step, ops: planned.ops, made: [], report: [...planned.report, ...moves], resolved: { target: f.id, request: req }, errors: [], tiles: planned.tiles.length };
    }
    case "changeFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      const set = step.set;
      const done = (ops: EditOp[], report: string[]): Expanded => ({ ok: true, step, ops, made: [], report, resolved: { target: f.id, set }, errors: [], tiles: 0 });
      // water is never an object (D196): a lake is deepened with the brush, a river through its sources
      if (f.kind === "river" || f.kind === "lake") return fail(step, [NO_WATER_OBJECTS]);
      if (f.kind === "landform") return fail(step, [NO_LANDFORMS]);
      if ((f.kind === "forest" || f.kind === "berryPatch") && set.density !== undefined) return done([{ op: "updateFeature", params: { id: f.id, patch: { params: { density: set.density } } } }], [`density ${set.density}`]);
      return fail(step, [`a ${f.kind} has none of these to change: ${Object.keys(set).join(", ")}`]);
    }
    case "addSource":
      return expandSource(s, conv, step);
    case "addRiver": {
      const id = newId(conv, "river");
      const flow = typeof step.flow === "string" ? { gentle: 1, steady: 2, strong: 4 }[step.flow] : (step.flow ?? 2);
      const r = planRiver({ points: step.points, flow, ...(step.width ? { width: step.width } : {}), ...(step.bedDepth ? { bedDepth: step.bedDepth } : {}) }, planContextOf(s), id, "claude");
      if (step.badwater) return fail(step, ["a river's badwater switch is not built yet: draw the river clean and add a badwater spring that drains into it"]);
      if (r.ok && step.badwater && r.feature.kind === "river") {
        r.feature.params.badwater = true;
        const op = r.ops[0];
        if (op.op === "addFeature") op.params.feature = r.feature;
        r.report.push("it carries badwater: it stops moistening the soil, and trees along it die");
      }
      return fromPlanned(step, r, conv, "river", step.handle, id);
    }
    case "addLake": {
      const id = newId(conv, "lake");
      hintIds({ ...conv, counter: conv.counter - 1 });
      let outline = step.outline;
      let spring = step.spring;
      let resolved: Record<string, unknown> = {};
      if (!outline) {
        const r = findSites(s, { kind: "lake", where: step.where, size: step.size, request: { ...(step.level ? { level: step.level } : {}), ...(step.spring !== undefined ? { spring: step.spring } : {}) }, limit: 1, planned: true }, refs);
        resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no place for the lake"], alternativeOf(r), resolved);
        outline = r.sites[0].step.outline as Point[];
        // a site a river fills comes without a spring (D171)
        if (spring === undefined && typeof r.sites[0].step.spring === "number") spring = r.sites[0].step.spring;
      }
      const r = planLake({ outline, ...(step.level ? { level: step.level } : {}), ...(step.floorDepth ? { floorDepth: step.floorDepth } : {}), ...(spring !== undefined ? { spring } : {}) }, planContextOf(s), id, "claude");
      if (r.ok && spring === 0 && step.spring === undefined) r.report = r.report.map((l) => (l.startsWith("no spring") ? "the river beside it fills it, so it has no spring of its own (a source starts water, never stands in a flow)" : l));
      return fromPlanned(step, r, conv, "lake", step.handle, id, resolved);
    }
    case "addResource": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors, undefined, { place: where.place });
      const size = step.size ?? (step.amount === undefined ? "medium" : undefined);
      const perTile = step.kind === "ruinField" ? 42 : 1;
      const perSize: Record<string, number> = { tiny: 14, small: 35, medium: 85, large: 210, huge: 550 };
      const wanted = step.amount ?? (perSize[typeof size === "string" ? size : "medium"] ?? 85) * (step.kind === "ruinField" ? 16 : 1);
      const tiles = resourceArea(s, step.kind, where.mask, Math.max(4, Math.round(wanted / perTile)), step.at);
      if (!tiles.length) return fail(step, [step.kind === "ruinField" ? "no dry ground there for ruins (they keep off moist soil and away from the start)" : "no moist soil there: trees and berries only live where the water keeps the soil moist"], undefined, { place: where.place, assumptions: where.assumptions });
      const id = newId(conv, step.kind);
      const area = tilesToRuns(tiles, W);
      let feature: Feature;
      if (step.kind === "forest") feature = { id, kind: "forest", origin: "claude", locked: false, params: { area, density: 1, speciesMix: { Pine: 47, Birch: 27, Oak: 20 }, groveSize: tiles.length, life: "auto", youngShare: FOREST.youngShare } };
      else if (step.kind === "berryPatch") feature = { id, kind: "berryPatch", origin: "claude", locked: false, params: { area, density: 1, ripeShare: 0.5 } };
      else feature = { id, kind: "ruinField", origin: "claude", locked: false, params: { area, scrapTarget: Math.round(tiles.length * perTile), heightMix: [...RUIN_HEIGHT_SHARES], centerBias: RUINS.centerBias } };
      const h = newHandle(conv, step.kind, step.handle);
      const got = tiles.length * perTile;
      const unit = step.kind === "ruinField" ? "scrap" : step.kind === "forest" ? "trees" : "bushes";
      const short = got < wanted * 0.8 ? ` (asked for ${Math.round(wanted)}: that is all the suitable ground there)` : "";
      return { ok: true, step, ops: [{ op: "addFeature", params: { feature } }], made: [{ handle: h, id, kind: step.kind }], report: [`about ${Math.round(got)} ${unit} on ${tiles.length} tiles${short}`], resolved: { place: where.place, assumptions: where.assumptions, tiles: tiles.length }, errors: [], tiles: tiles.length };
    }
    case "removeResources": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors);
      const test = step.kind === "trees" ? /^(Pine|Birch|Oak|Succulent)$/ : step.kind === "bushes" ? /^BlueberryBush$/ : /^RuinColumnH\d$/;
      const ids = s.built.entities.filter((e) => test.test(e.template) && e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && where.mask[e.y * W + e.x]).map((e) => e.id);
      if (!ids.length) return fail(step, [`there are no ${step.kind} there`]);
      return { ok: true, step, ops: [{ op: "deleteEntities", params: { entities: ids } }], made: [], report: [`removes ${ids.length} ${step.kind}`], resolved: { place: where.place, assumptions: where.assumptions, count: ids.length }, errors: [], tiles: ids.length };
    }
    case "placeObject":
      return expandPlaceObject(s, conv, step);
    case "remove":
      return expandRemove(s, conv, step);
    case "moveFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind === "river" || f.kind === "lake") return fail(step, [NO_WATER_OBJECTS]);
      if (f.kind === "start") return expandStep(s, conv, { op: "moveStart", to: step.to ?? [anchorOf(v, f)[0] + step.by![0], anchorOf(v, f)[1] + step.by![1]] });
      // a set piece moved to a place: the app picks a site there with the piece's own builder
      // values (a spring keeps its strength, a fall its width and drop), checked like any site,
      // and rebuilds the piece there under the same id
      if (step.to !== undefined && !Array.isArray(step.to) && f.kind === "setPiece") {
        const kind = f.params.kind;
        const siteKind: SiteKind | undefined = kind === "waterfall" ? (f.params.plan.mode === "on-river" ? "riverFall" : "waterfall") : SITE_OF[kind];
        if (!siteKind) return fail(step, [`a ${kind} cannot be moved to a place yet: give to as a tile [x, y] or by [dx, dy]`]);
        const keep: PlanRecord = { ...f.params.request };
        for (const k of ["at", "lip", "centre", "center", "position"]) delete keep[k];
        const r = findSites(s, { kind: siteKind, where: step.to, request: keep, limit: 1, replaces: f.id }, refs);
        const resolved = siteSummary(r);
        if (!r.ok) return fail(step, [r.reason ?? "no site fits"], alternativeOf(r), resolved);
        const planned = planPiece(s, kind, { ...keep, ...(r.sites[0].step.request as PlanRecord) }, f.id, f.origin);
        if (!planned.ok) return fail(step, planned.errors, undefined, resolved);
        return { ok: true, step, ops: planned.ops, made: [], report: planned.report, resolved: { ...resolved, target: f.id, to: r.sites[0].at }, errors: [], tiles: planned.tiles.length };
      }
      if (step.to !== undefined && !Array.isArray(step.to)) return fail(step, ["only a set piece moves to a place; give to as a tile [x, y] or by [dx, dy]"]);
      const a = anchorOf(v, f);
      const [dx, dy] = step.by ?? [(step.to as [number, number])[0] - a[0], (step.to as [number, number])[1] - a[1]];
      const r = moveEdit(s, f.id, Math.round(dx), Math.round(dy));
      if (!r.ok) return fail(step, r.errors);
      return { ok: true, step, ops: r.ops, made: [], report: r.report, resolved: { target: f.id, by: [Math.round(dx), Math.round(dy)] }, errors: [], tiles: r.tiles.length };
    }
    case "moveStart":
      return expandMoveStart(s, conv, step);
    case "deleteFeature": {
      const f = targetFeature(s, conv, step.target);
      if (typeof f === "string") return fail(step, [f]);
      if (f.kind === "river" || f.kind === "lake") return fail(step, [NO_WATER_OBJECTS]);
      if (f.kind === "start") return fail(step, ["the start cannot be deleted: every map needs exactly one; move it instead"]);
      const r = deleteEdit(s, f.id);
      if (!r.ok) return fail(step, r.errors);
      return { ok: true, step, ops: r.ops, made: [], report: [], resolved: { target: f.id, kind: f.kind === "setPiece" ? f.params.kind : f.kind }, errors: [], tiles: 0 };
    }
    case "setRiverBadwater":
      return fail(step, [NO_WATER_OBJECTS]);
    case "changeSource":
      return expandChangeSource(s, conv, step);
    case "brush":
      return expandBrush(s, conv, step);
    case "carve":
      return expandCarve(s, conv, step);
    case "sculpt": {
      const where = resolve(v, step.where, refs);
      if (!where.ok) return fail(step, where.errors);
      if (where.tiles > MAX_AREA_SHARE * W * H) return fail(step, [`that area is ${where.tiles} tiles; one proposal may sculpt at most ${Math.floor(MAX_AREA_SHARE * W * H)}`]);
      const tiles: number[] = [];
      for (let i = 0; i < where.mask.length; i++) if (where.mask[i]) tiles.push(i);
      const params = { mode: step.mode, cells: tilesToRuns(tiles, W), ...(step.mode === "raise" || step.mode === "lower" ? { amount: step.amount ?? 1 } : {}), ...(step.mode === "flatten" ? { level: step.level ?? v.heights[tiles[0]] } : {}) };
      return { ok: true, step, ops: [{ op: "sculpt", params } as EditOp], made: [], report: [`${step.mode} ${tiles.length} tiles`], resolved: { place: where.place, assumptions: where.assumptions }, errors: [], tiles: tiles.length };
    }
    case "undoLast":
      return { ok: true, step, ops: [], made: [], report: [], resolved: conv.accepted.length ? { undoes: conv.accepted[conv.accepted.length - 1].text } : {}, errors: conv.accepted.length ? [] : ["nothing to undo in this conversation"], tiles: 0 };
  }
}

// ---------------------------------------------------------------------------------- Carve

/** Carve's Power words (D194): a creek to a catastrophe. */
export const POWER_WORDS = { creek: 15, torrent: 40, river: 65, catastrophe: 95 } as const;
/** A carve given a place tries at most this many starts there, this many tiles apart at least. */
const CARVE_STARTS = 5;
const CARVE_START_APART = 6;
/** …and these paths from each (Try another path's seeds). */
const CARVE_PATHS = [0, 1, 2];

/** A carve (D194, D199), as the editor's Carve button makes it: Unleash from a spot (its start: the
 *  given tile, or the highest dry ground of the place, nearest its middle), or Aim to an end (a
 *  tile, or the place's middle), run to its end (or for `seconds`), and kept as one operation. */
function expandCarve(s: MapSession, conv: Conversation, step: Extract<Step, { op: "carve" }>): Expanded {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const refs = refContext(conv);
  const resolved: Record<string, unknown> = {};
  let moved: { first: [number, number]; why: string; start: boolean; path: number } | null = null;
  let firstWhy: string | null = null;
  let chosenPath: number | undefined;
  const map = forceMapOf(b);
  const keep = protectedGround(map);
  for (const i of s.columns.keys()) keep[i] = 1;
  // where it starts: rivers begin high
  let from = step.from ? ([Math.round(step.from[0]), Math.round(step.from[1])] as [number, number]) : null;
  if (!from) {
    const where = resolve(viewOf(s), step.where!, refs);
    Object.assign(resolved, { place: where.place, assumptions: where.assumptions });
    if (!where.ok) return fail(step, where.errors, undefined, resolved);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < where.mask.length; i++)
      if (where.mask[i]) {
        sx += i % W;
        sy += Math.floor(i / W);
        n++;
      }
    // (a river begun on the map's rim runs straight off it: the rim only when the place is all rim)
    let ranked: { i: number; v: number }[] = [];
    for (const rim of [8, 0]) {
      for (let i = 0; i < where.mask.length; i++) {
        const x = i % W;
        const y = Math.floor(i / W);
        if (!where.mask[i] || keep[i] || b.water[i] > 0.05 || x < rim || y < rim || x >= W - rim || y >= H - rim) continue;
        ranked.push({ i, v: b.heights[i] * 100 - Math.hypot(x - sx / n, y - sy / n) });
      }
      if (ranked.length) break;
    }
    if (!ranked.length) return fail(step, ["there is no dry ground there to start a carve (the start's own ground stays as it is)"], undefined, resolved);
    ranked = ranked.sort((a, c) => c.v - a.v || a.i - c.i);
    // the highest dry ground there, then the next highest a few tiles away from those before it
    const starts: [number, number][] = [];
    for (const { i } of ranked) {
      const p: [number, number] = [i % W, Math.floor(i / W)];
      if (starts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= CARVE_START_APART)) starts.push(p);
      if (starts.length >= CARVE_STARTS) break;
    }
    from = starts[0];
    // a carve that breaks a check passing now is not built (guards are never traded away): as a
    // player would, try another path from there (Try another path), then the next highest dry
    // ground there, each checked with a real build; none holding, the first stands and says why
    const paths = step.path !== undefined ? [step.path] : CARVE_PATHS;
    search: for (let k = 0; k < starts.length; k++)
      for (const path of paths) {
        const res = verifyStep(s, { ...step, where: undefined, from: starts[k], path } as unknown as Record<string, unknown>);
        if (!res.error && !res.broken.length) {
          if (k > 0 || path !== paths[0]) moved = { first: starts[0], why: firstWhy ?? "", start: k > 0, path };
          from = starts[k];
          chosenPath = path;
          break search;
        }
        firstWhy ??= res.error ?? `it would break ${res.broken.join(", ")}`;
      }
  }
  // where it ends (Aim): a tile, or the place's middle
  let to: [number, number] | undefined;
  if (Array.isArray(step.to)) to = [Math.round(step.to[0]), Math.round(step.to[1])];
  else if (step.to !== undefined) {
    const where = resolve(viewOf(s), step.to, refs);
    resolved.toPlace = where.place;
    if (!where.ok) return fail(step, where.errors, undefined, resolved);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < where.mask.length; i++)
      if (where.mask[i]) {
        sx += i % W;
        sy += Math.floor(i / W);
        n++;
      }
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < where.mask.length; i++) {
      if (!where.mask[i] || keep[i]) continue;
      const d = Math.hypot((i % W) - sx / n, Math.floor(i / W) - sy / n);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return fail(step, ["that end is all the start's own ground"], undefined, resolved);
    to = [best % W, Math.floor(best / W)];
  }
  if (chosenPath !== undefined) step = { ...step, path: chosenPath };
  const power = typeof step.power === "string" ? POWER_WORDS[step.power] : step.power ?? 65;
  const settings: CarveSettings = { mode: to ? "aim" : "unleash", power, wander: step.wander ?? 35, width: step.width ?? null, seed: step.path ?? 0, walls: step.walls ?? "steep", defyGravity: !!step.defyGravity, dry: step.river === "dry", layers: true };
  const at = (p: [number, number]) => p[1] * W + p[0];
  if (to && at(to) === at(from)) return fail(step, ["its end is where it starts: aim somewhere else"], undefined, { ...resolved, from });
  const id = newId(conv, "source");
  let run: CarveRun;
  try {
    run = new CarveRun(map, settings, { origin: at(from), ...(to ? { end: at(to) } : {}) }, { keep, sourceId: id });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    const uphill = /uphill/.test(text);
    return fail(step, [uphill ? "its end is uphill of its start: defyGravity true cuts through to it on a floor that never rises" : /protected/.test(text) ? "the start's own ground stays as it is: start the carve away from it" : text], uphill ? { note: "the same carve with Defy gravity", step: { ...step, defyGravity: true } } : undefined, { ...resolved, from, ...(to ? { to } : {}) });
  }
  const limit = step.seconds !== undefined ? Math.round(step.seconds * STEPS_PER_SECOND) : 1200;
  for (let k = 0; k < limit && !run.done; k++) run.step();
  const params = carveParams(map, run, { settings, origin: from, ...(to ? { end: to } : {}), cut: null });
  if (!params) return fail(step, ["nothing was carved there: the land held (more power, or another start)"], undefined, { ...resolved, from });
  const cap = Math.floor(MAX_AREA_SHARE * W * H);
  if (params.tiles.length > cap) return fail(step, [`that carve changes ${params.tiles.length} tiles; one proposal may change at most ${cap} (30% of the map): less power, or fewer seconds`], undefined, { ...resolved, from });
  let deepest = 0;
  let cut = 0;
  let low = Infinity;
  params.tiles.forEach((i, k) => {
    const d = map.heights[i] - params.heights[k];
    if (d > 0) cut += d;
    deepest = Math.max(deepest, d);
    if (d > 0) low = Math.min(low, params.heights[k]);
  });
  const secs = (run.steps / STEPS_PER_SECOND).toFixed(1);
  const ended = params.reason === "stopped" ? `stopped after ${secs} s` : `ran ${secs} s and ended at ${params.reason === "destination" ? "its end" : params.reason === "map edge" ? "the map's edge" : params.reason === "lake" ? "a lake" : params.reason}`;
  const word = Object.entries(POWER_WORDS).reduce((a, e) => (Math.abs(e[1] - power) < Math.abs(a[1] - power) ? e : a))[0];
  const report = [
    `carves ${settings.dry ? "a dry canyon" : "a river"} (${word}, power ${power}) from (${from[0]}, ${from[1]})${to ? ` toward (${to[0]}, ${to[1]})` : ""}: it ${ended}, cutting ${cut} blocks over ${params.tiles.length} tiles, ${deepest} levels deep at most${Number.isFinite(low) ? `, down to level ${low}` : ""}`,
  ];
  if (params.source) report.push(`keeps a water source of ${params.source.strength} blocks/s at (${params.source.x}, ${params.source.y}), its strength following the width: the river keeps flowing`);
  else report.push("a dry canyon: no source");
  if (params.removed.length) report.push(`${params.removed.length} object${params.removed.length > 1 ? "s" : ""} on the cut ground go with it`);
  if (moved)
    report.push(
      `${moved.start ? "starts at the next highest dry ground there" : "takes another path"}${moved.path ? ` (path ${moved.path})` : ""}: the first course from (${moved.first[0]}, ${moved.first[1]}), the highest, ${moved.why}`,
    );
  const made = params.source ? [{ handle: newHandle(conv, "source", step.handle), id: `${SOURCE_PREFIX}${params.source.id}`, kind: "source" }] : [];
  return {
    ok: true,
    step,
    ops: [{ op: "carve", params }],
    made,
    report,
    resolved: { ...resolved, from, ...(to ? { to } : {}), mode: settings.mode, power, width: params.width, seed: params.seed, reason: params.reason, seconds: Number(secs), cut, deepest, tiles: params.tiles.length, ...(params.source ? { source: params.source.strength } : {}) },
    errors: [],
    tiles: params.tiles.length,
  };
}

// ---------------------------------------------------------------------------------- sources

/** Sources' strength (D196): a river's flow is its sources' strength, so a river is changed through
 *  its sources (its mouth on the map's edge); a tile's source, or the sources in a place, the same.
 *  Each is set to `strength`, or `flow` is shared among them. */
function expandChangeSource(s: MapSession, conv: Conversation, step: Extract<Step, { op: "changeSource" }>): Expanded {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const isSource = (t: string) => t === "WaterSource" || t === "BadwaterSource";
  let list = b.entities.filter((e) => isSource(e.template));
  const resolved: Record<string, unknown> = {};
  if (step.river !== undefined) {
    const f = targetFeature(s, conv, step.river);
    if (typeof f === "string") return fail(step, [f]);
    if (f.kind !== "river") return fail(step, [`${step.river} is not a river`]);
    list = list.filter((e) => e.owner === f.id);
    resolved.river = f.id;
    if (!list.length) return fail(step, [`${step.river} has no source of its own: it is fed by the water it joins; change the sources upstream`]);
  } else if (step.at) {
    const [x, y] = [Math.round(step.at[0]), Math.round(step.at[1])];
    list = list.filter((e) => entityTiles(e).some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1));
    resolved.at = [x, y];
    if (!list.length) return fail(step, [`no source at (${x}, ${y})`]);
  } else {
    const where = resolve(viewOf(s), step.where!, refContext(conv));
    Object.assign(resolved, { place: where.place, assumptions: where.assumptions });
    if (!where.ok) return fail(step, where.errors, undefined, resolved);
    list = list.filter((e) => entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && where.mask[ty * W + tx]));
    if (!list.length) return fail(step, ["no source there"], undefined, resolved);
  }
  const each = step.strength ?? step.flow! / list.length;
  const bad = list.some((e) => e.template === "BadwaterSource");
  if (!bad && each > OFFICIAL_FLOW) return fail(step, [`each of the ${list.length} source${list.length > 1 ? "s" : ""} would need ${Math.round(each * 100) / 100} blocks/s; a water source's one tile holds 8 at most: add more sources (addSource) for more water`], undefined, resolved);
  const ops: EditOp[] = list.map((e) => ({ op: "setEntityProps", params: { id: e.id, components: { WaterSource: { SpecifiedStrength: each, CurrentStrength: each } } } }) as EditOp);
  const v = Math.round(each * 100) / 100;
  const total = Math.round(each * list.length * 100) / 100;
  const report = [`${list.length > 1 ? `${list.length} sources at ${v} blocks/s each, ${total} in all` : `the source at ${v} blocks/s`}${each > OFFICIAL_FLOW ? ": stronger than any official map" : ""}`];
  return { ok: true, step, ops, made: [], report, resolved: { ...resolved, sources: list.length, each: v, total }, errors: [], tiles: 0 };
}

/** A water or badwater source (the editor's source tools): on the tile given, or at a place: its
 *  middle-most dry tile, or with fillHollow the lowest point of the hollow there (a spring that
 *  fills it into a lake, then spills over its rim). */
function expandSource(s: MapSession, conv: Conversation, step: Extract<Step, { op: "addSource" }>): Expanded {
  const { x: W, y: H } = s.size;
  const b = s.built;
  let at = step.at ? ([Math.round(step.at[0]), Math.round(step.at[1])] as [number, number]) : null;
  const resolved: Record<string, unknown> = {};
  if (!at) {
    const where = resolve(viewOf(s), step.where!, refContext(conv));
    Object.assign(resolved, { place: where.place, assumptions: where.assumptions });
    if (!where.ok) return fail(step, where.errors, undefined, resolved);
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < where.mask.length; i++)
      if (where.mask[i]) {
        sx += i % W;
        sy += Math.floor(i / W);
        n++;
      }
    const cx = sx / n;
    const cy = sy / n;
    // a hollow's spring: the hollow nearest the middle (a dry hollow of 9 tiles or more, off the
    // start); any other source: the dry tile nearest the middle where it can stand (a badwater
    // source takes 3×3 level tiles)
    const order: [number, number][] = [];
    for (let i = 0; i < where.mask.length; i++) {
      if (!where.mask[i] || b.water[i] > 0.05) continue;
      order.push([Math.hypot((i % W) - cx, Math.floor(i / W) - cy), i]);
    }
    order.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    if (!order.length) return fail(step, ["that place is all water: a source goes on dry ground"], undefined, resolved);
    const template = step.kind === "badwater" ? "BadwaterSource" : "WaterSource";
    let best = -1;
    if (step.fillHollow) {
      const seen = new Set<number>();
      const start = b.start;
      for (const [, i] of order.slice(0, 3000)) {
        const h = hollowAt(b.heights, b.water, W, H, i % W, Math.floor(i / W));
        if (seen.has(h.low)) continue;
        seen.add(h.low);
        if (!h.fills || h.tiles < 9 || (start && Math.hypot((h.low % W) - start.x, Math.floor(h.low / W) - start.y) < 6)) continue;
        best = i;
        break;
      }
      if (best < 0) return fail(step, ["there is no hollow there: water from a spring runs on downhill (dig one first with a brush step, tool lower, size and amount 2 or more)"], undefined, resolved);
    } else {
      // the tile nearest the middle where it can stand, well clear of the map's extras (a relic or
      // a geothermal field keeps 2 tiles from water, D167: the water spreads from a source); failing
      // that, the nearest where it can stand
      const extras = nearExtras(s, 4);
      const far = nearExtras(s, 12);
      const stands = ([, i]: [number, number]) => !entityProblem(s, { template, x: i % W, y: Math.floor(i / W), orientation: "Cw0" });
      // well away from them, and its water running downhill (the steepest way down, to water or a
      // hollow) clear of them
      const clear = ([, i]: [number, number]) => !far[i] && !downhill(b.heights, b.water, W, H, i).some((t) => extras[t]);
      const pick = order.slice(0, 2000).find((o) => clear(o) && stands(o)) ?? order.slice(0, 2000).find((o) => !far[o[1]] && stands(o)) ?? order.slice(0, 400).find(stands) ?? order[0];
      best = pick[1];
      if (extras[best]) resolved.note = "every spot there is near a relic, a mine site or a geothermal field: its water may reach them";
    }
    at = [best % W, Math.floor(best / W)];
  }
  const report: string[] = [];
  if (step.fillHollow) {
    const h = hollowAt(b.heights, b.water, W, H, at[0], at[1]);
    if (!h.fills) return fail(step, ["there is no hollow there: water from a spring there runs on downhill (dig one with a lower brush first)"], undefined, { ...resolved, at });
    at = [h.low % W, Math.floor(h.low / W)];
    // a free tile of its floor (a thorn or a tree may stand on the lowest one)
    const floor = b.heights[h.low];
    const template = step.kind === "badwater" ? "BadwaterSource" : "WaterSource";
    if (entityProblem(s, { template, x: at[0], y: at[1], orientation: "Cw0" })) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = at[0] + dx;
          const y = at[1] + dy;
          if (x < 0 || y < 0 || x >= W || y >= H || b.heights[y * W + x] !== floor || dx * dx + dy * dy >= bd) continue;
          if (entityProblem(s, { template, x, y, orientation: "Cw0" })) continue;
          best = [x, y];
          bd = dx * dx + dy * dy;
        }
      if (best) at = best;
    }
    report.push(`fills the hollow to level ${h.level}, about ${h.tiles} tiles, then spills over its rim`);
  }
  const bad = step.kind === "badwater";
  const strength = step.strength ?? (bad ? 1 : 1.5);
  const req = { template: bad ? "BadwaterSource" : "WaterSource", x: at[0], y: at[1], orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } };
  const id = newId(conv, "source");
  const r = planEntity(s, req, id);
  if (!r.ok) return fail(step, r.errors, undefined, { ...resolved, at });
  report.unshift(`a ${bad ? "badwater" : "water"} source of ${strength} blocks/s at (${at[0]}, ${at[1]})${strength > OFFICIAL_FLOW ? ": stronger than any official map" : ""}`);
  // the lake it fills, or the source itself, measured as `new:lake`, `new:source` or `new:badwaterSource`
  const kind = step.fillHollow ? "lake" : bad ? "badwaterSource" : "source";
  const made = [{ handle: newHandle(conv, kind, step.handle), id: `${SOURCE_PREFIX}${id}`, kind }];
  return { ok: true, step, ops: r.ops, made, report, resolved: { ...resolved, at }, errors: [], tiles: bad ? 9 : 1 };
}

/** The way water runs from tile `i`: the steepest way down, tile by tile (a flat stretch spreads to
 *  its whole level ground), until it meets water, the map's edge or a hollow it fills. */
function downhill(heights: Uint8Array, water: ArrayLike<number>, W: number, H: number, i: number): number[] {
  const out = [i];
  const seen = new Set(out);
  let cur = i;
  for (let k = 0; k < 4 * (W + H); k++) {
    if (water[cur] > 0.05) break;
    const x = cur % W;
    const y = (cur - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) break;
    let next = -1;
    let lo = heights[cur];
    for (const j of [cur - 1, cur + 1, cur - W, cur + W]) if (heights[j] < lo || (heights[j] === lo && next < 0 && !seen.has(j))) {
      if (heights[j] < lo) lo = heights[j];
      next = j;
    }
    if (next < 0 || seen.has(next)) {
      // a hollow: the water fills its level ground round here
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && heights[(y + dy) * W + x + dx] <= heights[cur]) out.push((y + dy) * W + x + dx);
      break;
    }
    seen.add(next);
    out.push(next);
    cur = next;
  }
  return out;
}

// ------------------------------------------------------------------------------------ brushes

/** The editor's brushes over a place (live editing): the same operation a player's stroke makes
 *  (`brush`, core/doc/ops.ts), so a proposal's brushing shows in the history, undoes and replays
 *  like a stroke. The stroke presses once on the middle of each tile of the place, with the
 *  smallest brush (a dab presses its own tile only), so it paints exactly the place. Each stroke
 *  moves each tile it covers one level (the brush's first pass): raise, lower and flatten stroke
 *  once per level over the place worn in a tile each time, which gives exactly what one wide
 *  stroke gives, its edge sloping a level a tile to the ground round it (a brush makes no
 *  cliffs); smooth and naturalize stroke once per pass. A pass over a big place is split into
 *  strokes of at most MAX_DABS dabs (every tile of a pass moves one level either way). */
function expandBrush(s: MapSession, conv: Conversation, step: Extract<Step, { op: "brush" }>): Expanded {
  if (step.path) return expandBrushPath(s, step);
  const { x: W, y: H } = s.size;
  const where = resolve(viewOf(s), step.where!, refContext(conv));
  const resolved: Record<string, unknown> = { place: where.place, assumptions: where.assumptions };
  if (!where.ok) return fail(step, where.errors, undefined, resolved);
  const cap = Math.floor(MAX_AREA_SHARE * W * H);
  if (where.tiles > cap && step.size === undefined) return fail(step, [`that area is ${where.tiles} tiles; one proposal may brush at most ${cap} (30% of the map)`], undefined, resolved);
  const state = s.terrainState();
  const pre = state.pre;
  // an imported map's caves and overhangs: the brushes leave them as they are
  const roofed = new Uint8Array(W * H);
  for (const i of state.columns) roofed[i] = 1;
  const mask = where.mask.slice();
  let underRoof = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] && roofed[i]) {
      mask[i] = 0;
      underRoof++;
    }
  // a round patch of the place near its middle (a small hill in the south-west corner), clear of
  // the start's own area; a lowered one also clear of the water (a pond, not a bay)
  if (step.size !== undefined) {
    const radius = typeof step.size === "number" ? Math.max(1, Math.min(40, step.size / 2)) : ({ tiny: 3, small: 5, medium: 8, large: 12, huge: 18 } as Record<string, number>)[step.size];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < mask.length; i++)
      if (mask[i]) {
        sx += i % W;
        sy += Math.floor(i / W);
        n++;
      }
    const b = s.built;
    const start = b.start;
    const extras = step.tool === "lower" ? nearExtras(s, 3) : null;
    const clear = (i: number): boolean => {
      const x = i % W;
      const y = Math.floor(i / W);
      if (start && Math.hypot(x - start.x, y - start.y) < radius + 5) return false;
      if (step.tool !== "lower") return true;
      const r = Math.ceil(radius) + 1;
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
        for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r && (b.water[yy * W + xx] > 0.05 || b.channel[yy * W + xx] || extras![yy * W + xx])) return false;
      return true;
    };
    const byDistance: [number, number][] = [];
    for (let i = 0; i < mask.length && n; i++) if (mask[i]) byDistance.push([((i % W) - sx / n) ** 2 + (Math.floor(i / W) - sy / n) ** 2, i]);
    byDistance.sort((a, q) => a[0] - q[0] || a[1] - q[1]);
    // a lowered patch holds water: of the clear spots nearest the middle, the one with fewest
    // objects on it (a pond drowns the plants on it, and a ruin on changed ground floats); any
    // other patch, the clear spot nearest the middle
    const occ = new Uint8Array(W * H);
    if (step.tool === "lower") for (const e of b.entities) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < H) occ[ty * W + tx] = 1;
    const reach = Math.ceil(radius) + 1;
    const objectsOn = (i: number): number => {
      const x = i % W;
      const y = Math.floor(i / W);
      let k = 0;
      for (let yy = Math.max(0, y - reach); yy <= Math.min(H - 1, y + reach); yy++)
        for (let xx = Math.max(0, x - reach); xx <= Math.min(W - 1, x + reach); xx++) if ((xx - x) ** 2 + (yy - y) ** 2 <= reach * reach) k += occ[yy * W + xx];
      return k;
    };
    let c = -1;
    let fewest = Infinity;
    let looked = 0;
    for (const [, i] of byDistance) {
      if (!clear(i)) continue;
      if (++looked > 4000) break;
      const k = objectsOn(i);
      if (k < fewest) {
        fewest = k;
        c = i;
        if (!k) break;
      }
    }
    if (c < 0) {
      c = byDistance[0][1];
      resolved.note = step.tool === "lower" ? "no spot there is clear of the start and the water: the patch is at the place's middle" : "no spot there is clear of the start: the patch is at the place's middle";
    } else if (fewest) resolved.objectsOnPatch = fewest;
    const cx = c % W;
    const cy = Math.floor(c / W);
    for (let i = 0; i < mask.length; i++) if (mask[i] && ((i % W) - cx) ** 2 + (Math.floor(i / W) - cy) ** 2 > radius * radius) mask[i] = 0;
    resolved.patch = { at: [cx, cy], radius };
  }
  const tiles: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) tiles.push(i);
  if (!tiles.length) return fail(step, ["every tile there lies over a cave or an overhang of the imported map: the brushes leave those as they are"], undefined, resolved);
  const tool = step.tool;
  const amount = step.amount ?? 1;
  const level = tool === "flatten" ? (step.level ?? medianLevel(pre, tiles)) : undefined;
  if (tool === "flatten") resolved.level = level;
  // cliff edges: every tile the full amount (the brush's own edges slope a level a tile)
  const cliff = step.edges === "cliff";
  const seed = tool === "naturalize" ? fmix32(Math.imul(tiles[0] + 1, 0x9e3779b1) ^ tiles.length) : undefined;
  const made = patchStrokes(pre, mask, tiles, W, H, { tool, amount, level, cliff, passes: step.passes ?? 2, seed });
  const inward = made.inward;
  const strokes = made.strokes.map((p) => withKit(p, step));
  // what it does, measured by running the strokes on the build's own terrain
  const after = pre.slice();
  for (const p of strokes) applyBrush(p, after, W, H, (i) => !roofed[i]);
  const by = new Map<number, number>();
  let moved = 0;
  let reached = 0;
  let atTop = 0;
  for (const i of tiles) {
    const d = Math.abs(after[i] - pre[i]);
    if (d) {
      moved++;
      by.set(d, (by.get(d) ?? 0) + 1);
    }
    if (level !== undefined && (step.steps ? (after[i] - level) % step.steps === 0 : after[i] === level)) reached++;
    if (tool === "raise" && after[i] === BRUSH_MAX_LEVEL && pre[i] + amount > BRUSH_MAX_LEVEL) atTop++;
  }
  const report: string[] = [];
  const roof = underRoof ? `; ${underRoof} tiles over caves or overhangs stay as they are` : "";
  if (tool === "raise" || tool === "lower") {
    if (!moved) return fail(step, [tool === "raise" ? `the ground there is already level ${BRUSH_MAX_LEVEL}, the editor's limit` : "the ground there is already level 0, the lowest"], undefined, resolved);
    const counts = [...by.entries()].sort((a, b) => b[0] - a[0]).map(([d, n]) => `${n} by ${d}`);
    const verb = tool === "raise" ? "raises" : "lowers";
    report.push(`${verb} ${moved} tiles: ${counts.join(", ")}${by.size > 1 ? " (its edge slopes a level a tile to the ground round it: a brush makes no cliffs)" : ""}${roof}`);
    let deepest = cliff ? amount : 0;
    if (inward) for (const i of tiles) deepest = Math.max(deepest, inward[i]);
    if (cliff) report.push("with cliff edges: beavers need stairs to climb them");
    if (deepest < amount) report.push(`the place is too narrow to ${tool === "raise" ? "rise" : "sink"} ${amount} anywhere: its middle moves ${deepest}; a place about ${2 * amount - 1} tiles across moves ${amount}`);
    if (atTop) report.push(`${atTop} tiles stop at level ${BRUSH_MAX_LEVEL}, the editor's limit`);
  } else if (tool === "flatten") {
    if (!moved) return fail(step, [`it is already level ${level} there`], undefined, resolved);
    const rest = tiles.length - reached;
    report.push(`flattens ${reached} of ${tiles.length} tiles to ${step.steps ? `benches every ${step.steps} levels from level ${level}` : `level ${level}`}${step.level === undefined ? " (the place's middle level)" : ""}${rest && !step.steps ? `; the other ${rest} slope toward it from the ground round the place, a level a tile (a brush makes no cliffs)` : ""}${cliff ? " with cliff edges" : ""}${roof}`);
    if (step.edges === "ramped") report.push("with ramped edges: the game's natural slopes join its rim's steps, so beavers can walk up");
  } else {
    if (!moved) return fail(step, [tool === "smooth" ? "that ground is already smooth: no tile stands apart from its neighbours" : "that ground has no cliffs or straight edges for naturalize to wear"], undefined, resolved);
    const before = steepest(pre, tiles, W, H);
    const now = steepest(after, tiles, W, H);
    report.push(`${tool === "smooth" ? "smooths" : "weathers"} ${moved} of ${tiles.length} tiles in ${strokes.length} passes: the steepest step there ${now < before ? `goes from ${before} to ${now} levels` : `stays ${now} levels`}${roof}`);
    if (step.walkable) report.push("made walkable: the game's natural slopes join the steps it leaves, so beavers can walk up");
  }
  const ops = strokes.map((params) => ({ op: "brush", params }) as EditOp);
  return { ok: true, step, ops, made: [], report, resolved: { ...resolved, tiles: tiles.length, strokes: strokes.length }, errors: [], tiles: tiles.length };
}

// ------------------------------------------------------------------------- the shelf, Remove

const ORIENTS = ["Cw0", "Cw90", "Cw180", "Cw270"] as const;

/** An object from the editor's left shelf (D184): the same operation a click on the shelf makes
 *  (`placeEntity`), at a tile or at the spot in a place nearest its middle where it fits. */
function expandPlaceObject(s: MapSession, conv: Conversation, step: Extract<Step, { op: "placeObject" }>): Expanded {
  const { x: W, y: H } = s.size;
  const base = SHELF_OBJECTS[step.object];
  const template = base === "Relic" ? `${step.size === "large" ? "Large" : step.size === "medium" ? "Medium" : "Small"}Relic` : base === "RuinColumnH" ? `RuinColumnH${step.height ?? 3}` : base;
  const orientation = ORIENTS[(step.turn ?? 0) & 3];
  const name = template.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace("underground ruins", "mine site");
  const tryAt = (x: number, y: number) => {
    const [cx, cy] = shelfCorner(template, x, y, orientation);
    return { at: [cx, cy] as [number, number], why: entityProblem(s, { template, x: cx, y: cy, orientation }) };
  };
  let spot: { at: [number, number]; why: string | null } | null = null;
  const resolved: Record<string, unknown> = { template };
  if (step.at) spot = tryAt(Math.round(step.at[0]), Math.round(step.at[1]));
  else {
    const where = resolve(viewOf(s), step.where!, refContext(conv));
    if (!where.ok) return fail(step, where.errors, undefined, { place: where.place });
    resolved.place = where.place;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < where.mask.length; i++)
      if (where.mask[i]) {
        sx += i % W;
        sy += Math.floor(i / W);
        n++;
      }
    const tiles: [number, number, number][] = [];
    for (let i = 0; i < where.mask.length; i++) if (where.mask[i]) tiles.push([i % W, Math.floor(i / W), ((i % W) - sx / n) ** 2 + (Math.floor(i / W) - sy / n) ** 2]);
    tiles.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    const wet = s.built.water;
    let first: { at: [number, number]; why: string | null } | null = null;
    for (const [x, y] of tiles.slice(0, 4000)) {
      if (wet[y * W + x] > 0.05 && step.object !== "naturalDam" && step.object !== "blockage") continue;
      const t = tryAt(x, y);
      first ??= t;
      if (!t.why) {
        spot = t;
        break;
      }
    }
    spot ??= first;
  }
  if (!spot) return fail(step, ["there is no ground there for it"], undefined, resolved);
  if (spot.why) return fail(step, [`it can't stand at (${spot.at[0]}, ${spot.at[1]}): ${spot.why}`], undefined, { ...resolved, at: spot.at });
  const r = planEntity(s, { template, x: spot.at[0], y: spot.at[1], orientation }, crypto.randomUUID());
  if (!r.ok) return fail(step, r.errors, undefined, resolved);
  void H;
  return { ok: true, step, ops: r.ops, made: [], report: [`${/^[aeiou]/.test(name) ? "an" : "a"} ${name} at (${spot.at[0]}, ${spot.at[1]})${step.turn ? `, turned ${step.turn * 90}°` : ""}`], resolved: { ...resolved, at: spot.at, orientation }, errors: [], tiles: r.tiles.length };
}

/** The Coordinates that centre an object's turned footprint on tile (x, y) (the shelf's rule). */
function shelfCorner(template: string, x: number, y: number, o: (typeof ORIENTS)[number]): [number, number] {
  const fp = FOOTPRINTS[template];
  if (!fp) return [x, y];
  const [sx, sy] = fp.size;
  const a = o === "Cw90" || o === "Cw270" ? sy : sx;
  const b = o === "Cw90" || o === "Cw270" ? sx : sy;
  const mx = x - Math.floor((a - 1) / 2);
  const my = y - Math.floor((b - 1) / 2);
  return o === "Cw0" ? [mx, my] : o === "Cw90" ? [mx, my + sx - 1] : o === "Cw180" ? [mx + sx - 1, my + sy - 1] : [mx + sy - 1, my];
}

/** The editor's Remove over a place (D184): the same operations its drag makes (`deleteEntities`,
 *  and `removeSlope` for the slopes the build places), never the start, never the ground. */
function expandRemove(s: MapSession, conv: Conversation, step: Extract<Step, { op: "remove" }>): Expanded {
  const { x: W, y: H } = s.size;
  const where = resolve(viewOf(s), step.where, refContext(conv));
  if (!where.ok) return fail(step, where.errors, undefined, { place: where.place });
  const take = new Set(step.kinds ?? REMOVE_KINDS);
  const ids: string[] = [];
  const slopes: { x: number; y: number }[] = [];
  const counts = new Map<RemoveKind, number>();
  let start = false;
  for (const e of s.built.entities) {
    if (!entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && where.mask[ty * W + tx])) continue;
    const kind = removeKindOf(e.template);
    if (!kind) {
      start = true;
      continue;
    }
    if (!take.has(kind)) continue;
    if (kind === "slopes" && (e.owner === DERIVED_SLOPES || e.owner.startsWith("pinned:"))) slopes.push({ x: e.x, y: e.y });
    else ids.push(e.id);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const resolved = { place: where.place, assumptions: where.assumptions };
  if (!ids.length && !slopes.length) return fail(step, [start ? "only the start stands there, and it stays: move it instead" : `there is nothing of ${[...take].join(", ")} there`], undefined, resolved);
  const ops: EditOp[] = [];
  if (ids.length) ops.push({ op: "deleteEntities", params: { entities: ids } });
  for (const p of slopes) ops.push({ op: "removeSlope", params: p });
  const words = [...counts].map(([k, n]) => `${n} ${n === 1 ? k.replace(/es$|s$/, "") : k}`);
  const report = [`removes ${words.join(", ")}; the ground stays as it is`];
  if (start) report.push("the start stays (move it instead)");
  return { ok: true, step, ops, made: [], report, resolved: { ...resolved, count: ids.length + slopes.length }, errors: [], tiles: ids.length + slopes.length };
}

/** Whether water stands on tile (x, y) or beside it, or a source stands there or beside it: where
 *  a Lower stroke starts a bed the water follows (the page's rule, with sources). */
function besideWater(s: MapSession, x: number, y: number): "water" | "source" | null {
  const { x: W, y: H } = s.size;
  const b = s.built;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && b.water[ny * W + nx] > 0.05) return "water";
    }
  for (const e of b.entities) {
    if (e.template !== "WaterSource" && e.template !== "BadwaterSource") continue;
    if (entityTiles(e).some(([tx, ty]) => Math.abs(tx - x) <= 1 && Math.abs(ty - y) <= 1)) return "source";
  }
  return null;
}

/** One brush stroke along a path, the way a player paints it: a dab on each tile the path crosses,
 *  the brush `size` tiles wide. A Lower stroke that starts in or beside water, or beside a source,
 *  carves a bed that keeps flowing downhill, and the water follows it (smart Lower, D184); any
 *  other stroke moves the ground as the page's brush does, `amount` strokes for raise and lower. */
function expandBrushPath(s: MapSession, step: Extract<Step, { op: "brush" }>): Expanded {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const pts = step.path!.map(([x, y]) => [Math.max(0, Math.min(W - 1, Math.round(x))), Math.max(0, Math.min(H - 1, Math.round(y)))] as [number, number]);
  const line: number[] = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    for (let j = 0; j <= n; j++) {
      const i = Math.round(ay + ((by - ay) * j) / n) * W + Math.round(ax + ((bx - ax) * j) / n);
      if (line[line.length - 1] !== i) line.push(i);
    }
  }
  const width = typeof step.size === "number" ? Math.max(1, Math.min(9, Math.round(step.size))) : ({ tiny: 1, small: 2, medium: 3, large: 5, huge: 7 } as Record<string, number>)[step.size ?? "medium"];
  const size = Math.max(0.5, width / 2);
  const tool = step.tool;
  const state = s.terrainState();
  const pre = state.pre;
  const roofed = new Uint8Array(W * H);
  for (const i of state.columns) roofed[i] = 1;
  const [x0, y0] = pts[0];
  const from = tool === "lower" ? besideWater(s, x0, y0) : null;
  const channel = from !== null;
  const level = tool === "flatten" ? (step.level ?? pre[line[0]]) : undefined;
  const seed = tool === "naturalize" ? fmix32(Math.imul(line[0] + 1, 0x9e3779b1) ^ line.length) : undefined;
  const dabs = line.flatMap((i) => [4 * (i % W) + 2, 4 * Math.floor(i / W) + 2]);
  const stroke: BrushParams = withKit({ tool, size, strength: 5, ...(level !== undefined ? { level } : {}), ...(seed !== undefined ? { seed } : {}), ...(channel ? { channel: true } : {}), layer: "top", dabs }, step);
  // raise and lower: a stroke per level; flatten: strokes until the path reaches its level
  const passes = channel ? 1 : tool === "raise" || tool === "lower" ? (step.amount ?? 1) : tool === "flatten" ? BRUSH_MAX_LEVEL : (step.passes ?? 2);
  const after = pre.slice();
  const strokes: BrushParams[] = [];
  for (let k = 0; k < passes; k++) {
    const was = after.slice();
    applyBrush(stroke, after, W, H, (i) => !roofed[i]);
    let moved = false;
    for (const i of line) if (after[i] !== was[i]) moved = true;
    if (!moved && k > 0) break;
    strokes.push(stroke);
  }
  let changed = 0;
  let deepest = 0;
  for (let i = 0; i < after.length; i++)
    if (after[i] !== pre[i]) {
      changed++;
      deepest = Math.max(deepest, Math.abs(after[i] - pre[i]));
    }
  const resolved: Record<string, unknown> = { path: pts, tiles: line.length, width, strokes: strokes.length };
  if (!changed) return fail(step, [tool === "raise" ? `the ground along the path is already level ${BRUSH_MAX_LEVEL}, the editor's limit` : tool === "lower" ? "the ground along the path is already level 0, the lowest" : "the stroke changes nothing along that path"], undefined, resolved);
  const report: string[] = [];
  const last = line[line.length - 1];
  const lx = last % W;
  const ly = Math.floor(last / W);
  if (channel) {
    const net = network(viewOf(s));
    const nameAt = (x: number, y: number): string | null => {
      const l = locate(net, W, x, y);
      return l && l.d <= l.course.width / 2 + 1.5 ? l.course.name : null;
    };
    const fromName = from === "water" ? nameAt(x0, y0) : null;
    const endWet = besideWater(s, lx, ly) === "water";
    const joins = endWet ? (nameAt(lx, ly) ?? "water") : null;
    const edge = lx === 0 || ly === 0 || lx === W - 1 || ly === H - 1;
    let cut = 0;
    for (const i of line) cut = Math.max(cut, pre[i] - after[i]);
    resolved.channel = true;
    resolved.from = from === "source" ? "a source" : (fromName ?? "water");
    resolved.bed = [after[line[0]], after[last]];
    if (joins) resolved.joins = joins;
    else if (edge) resolved.joins = "the map edge";
    report.push(`carves a bed ${width} tile${width > 1 ? "s" : ""} wide from ${from === "source" ? "the source" : (fromName ?? "the water")} at (${x0}, ${y0}) along ${line.length} tiles, from level ${after[line[0]]} down to level ${after[last]}, never rising: the water follows it`);
    report.push(joins ? `it runs into ${joins === "water" ? "the water" : joins} at (${lx}, ${ly})` : edge ? `it runs off the map edge at (${lx}, ${ly}), where its water leaves the map` : `it ends on dry ground at (${lx}, ${ly}): the water pools there, then spills on downhill`);
    if (cut > 2) report.push(`it cuts up to ${cut} levels through higher ground: steep banks, beavers need stairs to cross`);
  } else {
    const verb = tool === "raise" ? "raises" : tool === "lower" ? "lowers" : tool === "flatten" ? `flattens toward level ${level}` : tool === "smooth" ? "smooths" : "weathers";
    report.push(`${verb} ${changed} tiles along ${line.length} tiles of path, ${width} tile${width > 1 ? "s" : ""} wide${tool === "raise" || tool === "lower" ? `, by up to ${deepest}` : ""}`);
    if (tool === "lower") report.push("it starts on dry ground, so it is a plain Lower stroke: for water to follow it, start it in or beside water, or put a source at its start first");
  }
  const ops = strokes.map((params) => ({ op: "brush", params }) as EditOp);
  return { ok: true, step, ops, made: [], report, resolved, errors: [], tiles: changed };
}

/** A stroke with the brush kit's options the step asks for (flatten's steps and ramped edges,
 *  smooth's make walkable), as a player's stroke carries them. */
function withKit(p: BrushParams, step: Extract<Step, { op: "brush" }>): BrushParams {
  return {
    ...p,
    ...(p.tool === "flatten" && step.steps ? { steps: step.steps } : {}),
    ...(p.tool === "flatten" && step.edges === "ramped" ? { edges: "ramped" as const } : {}),
    ...(p.tool === "smooth" && step.walkable ? { walkable: true } : {}),
  };
}

/** The middle level of a place (flatten's level when none is given). */
function medianLevel(heights: Uint8Array, tiles: readonly number[]): number {
  const n = new Array<number>(256).fill(0);
  for (const i of tiles) n[heights[i]]++;
  let seen = 0;
  for (let h = 0; h < 256; h++) {
    seen += n[h];
    if (2 * seen >= tiles.length) return Math.min(BRUSH_MAX_LEVEL, h);
  }
  return 0;
}

/** The biggest step in levels between neighbouring tiles of a place. */
function steepest(heights: Uint8Array, tiles: readonly number[], W: number, H: number): number {
  let m = 0;
  for (const i of tiles) {
    const x = i % W;
    if (x < W - 1) m = Math.max(m, Math.abs(heights[i] - heights[i + 1]));
    if (i + W < W * H) m = Math.max(m, Math.abs(heights[i] - heights[i + W]));
  }
  return m;
}

function expandMoveStart(s: MapSession, conv: Conversation, step: Extract<Step, { op: "moveStart" }>): Expanded {
  const v = viewOf(s);
  const refs = refContext(conv);
  const feat = s.features.find((f): f is StartFeature => f.kind === "start");
  let to: [number, number];
  let resolved: Record<string, unknown> = {};
  const orientation = step.facing ? ({ south: "Cw0", west: "Cw90", north: "Cw180", east: "Cw270" } as const)[step.facing] : undefined;
  const e0 = s.built.entities.find((g) => g.template === "StartingLocation");
  const here: [number, number] | null = feat ? [feat.params.position[0], feat.params.position[1]] : e0 ? startCentre(e0.x, e0.y, e0.orientation) : null;
  if (step.to === undefined) {
    if (!here) return fail(step, ["this map has no start to turn"]);
    to = here;
  } else if (Array.isArray(step.to) && step.to.length === 2 && typeof step.to[0] === "number") to = [Math.round(step.to[0]), Math.round(Number(step.to[1]))];
  else {
    hintIds(conv);
    const r = findSites(s, { kind: "start", where: step.to as Where, limit: 1 }, refs);
    resolved = siteSummary(r);
    if (!r.ok) return fail(step, [r.reason ?? "no spot meets the start rules there"], alternativeOf(r), resolved);
    to = r.sites[0].at;
  }
  const ops: EditOp[] = [];
  const report: string[] = [];
  const moves = step.to !== undefined;
  if (feat) ops.push({ op: "updateFeature", params: { id: feat.id, patch: { params: { ...(moves ? { position: to, benchLevel: Math.max(1, v.heights[to[1] * v.W + to[0]]) } : {}), ...(orientation ? { orientation } : {}) } } } });
  else {
    const e = s.built.entities.find((g) => g.template === "StartingLocation");
    if (!e) return fail(step, ["this map has no start to move"]);
    const [cx, cy] = cornerFor(to[0], to[1], orientation ?? e.orientation);
    ops.push({ op: "moveEntity", params: { id: e.id, x: cx, y: cy, ...(orientation ? { orientation } : {}) } });
  }
  if (moves) report.push(`the start moves to (${to[0]}, ${to[1]})`);
  if (step.facing) report.push(`its door faces ${step.facing}`);
  const made: Expanded["made"] = [];
  if (moves && step.bringFood !== false) {
    // bring trees and berries along when the new spot lacks them (the start rules, read from the
    // validator at HEAD): a grove and a berry patch on moist soil 7–16 tiles out
    const rules = rulesFor(s.spec, s.meta.designedFor);
    const near = (e: { x: number; y: number }) => Math.hypot(e.x - to[0], e.y - to[1]) <= 18;
    // starting wood in logs (D164): each tree by its species' yield
    const wood = s.built.entities.filter((e) => /^(Pine|Birch|Oak)$/.test(e.template) && near(e)).reduce((a, e) => a + TREE_LOGS[e.template], 0);
    const bushes = s.built.entities.filter((e) => e.template === "BlueberryBush" && near(e)).length;
    const ring = new Uint8Array(v.W * v.H);
    for (let y = 0; y < v.H; y++)
      for (let x = 0; x < v.W; x++) {
        const d = Math.hypot(x - to[0], y - to[1]);
        if (d >= 7 && d <= 16) ring[y * v.W + x] = 1;
      }
    const add = (kind: "berryPatch" | "forest", need: number) => {
      const tiles = resourceArea(s, kind, ring, need);
      if (tiles.length < need * 0.5) return;
      const id = newId(conv, kind);
      const area = tilesToRuns(tiles, v.W);
      const feature: Feature =
        kind === "berryPatch"
          ? { id, kind, origin: "claude", locked: false, params: { area, density: 1, ripeShare: 0.5 } }
          : { id, kind, origin: "claude", locked: false, params: { area, density: 1, speciesMix: { Pine: 47, Birch: 27, Oak: 20 }, groveSize: tiles.length, life: "alive", youngShare: 0 } };
      ops.push({ op: "addFeature", params: { feature } });
      for (const t of tiles) ring[t] = 0;
      const h = newHandle(conv, kind);
      made.push({ handle: h, id, kind });
      report.push(`plants ${kind === "berryPatch" ? `a berry patch of ${tiles.length} bushes` : `a grove of ${tiles.length} trees`} near the new start, for the start rules (${kind === "berryPatch" ? `${rules.bushesWithin20} bushes` : `${rules.woodWithin20} logs`} within 20 tiles)`);
    };
    const needB = Math.ceil(rules.bushesWithin20 * 1.25) - bushes;
    // the grove's mix gives about 3 logs a tree
    const needT = Math.ceil((Math.ceil(rules.woodWithin20 * 1.25) - wood) / LOGS_PER_TREE);
    if (needB > 0) add("berryPatch", needB);
    if (needT > 0) add("forest", needT);
  }
  return { ok: true, step, ops, made, report, resolved: { ...resolved, to, where: compassWords(v, to[0], to[1]) }, errors: [], tiles: 0 };
}

// ---------------------------------------------------------------------------- site verification

const guardCache = new Map<string, Map<string, boolean>>();

/** The id the next feature will get: builders shape some pieces from their id (a dam ridge's
 *  wobble), so a site is checked with the id the real step will use. */
let idHint: { seed: number; counter: number } | null = null;
export function hintIds(conv: Conversation | null): void {
  idHint = conv ? { seed: conv.seed, counter: conv.counter } : null;
}

/** Build a site's step on the session, validate, and take it back: which guards it breaks. */
function verifyStep(s: MapSession, raw: Record<string, unknown>): { broken: string[]; error?: string } {
  const step = raw as unknown as Step;
  const key = viewOf(s).key;
  let before = guardCache.get(key);
  if (!before) {
    before = new Map(guardsOf(s.validate().report).map((g) => [g.id, g.ok]));
    if (guardCache.size > 8) guardCache.clear();
    guardCache.set(key, before);
  }
  const scratch = newConversation(idHint?.seed ?? 7);
  scratch.counter = idHint?.counter ?? 0;
  // a site for moving a piece is checked as the piece rebuilt there, under its own id
  const replaces = typeof raw.replaces === "string" ? s.features.find((f): f is SetPieceFeature => f.kind === "setPiece" && f.id === raw.replaces) : undefined;
  const ex: Pick<Expanded, "ok" | "ops" | "errors"> = replaces
    ? (() => {
        const r = planPiece(s, replaces.params.kind, raw.request as PlanRecord, replaces.id, replaces.origin);
        return r.ok ? { ok: true, ops: r.ops, errors: [] } : { ok: false, ops: [], errors: r.errors };
      })()
    : expandStep(s, scratch, step);
  if (!ex.ok) return { broken: [], error: ex.errors[0] ?? "it cannot be built" };
  if (!ex.ops.length) return { broken: [] };
  const r = ex.ops[0].op === "specPatch" ? s.apply(ex.ops[0], "claude") : s.applyAll(ex.ops, "claude");
  if (!r.ok) return { broken: [], error: r.errors[0] ?? "it cannot be built" };
  // a site's second step (a lake's spring, after its hollow is dug) on the map the first left
  let applied = 1;
  if (raw.then && typeof raw.then === "object") {
    const next = expandStep(s, scratch, raw.then as unknown as Step);
    const r2 = next.ok && next.ops.length ? s.applyAll(next.ops, "claude") : null;
    if (!next.ok || (r2 && !r2.ok)) {
      s.undo();
      return { broken: [], error: next.errors[0] ?? r2?.errors[0] ?? "it cannot be built" };
    }
    if (r2) applied++;
  }
  const after = guardsOf(s.validate().report);
  for (let k = 0; k < applied; k++) s.undo();
  return { broken: after.filter((g) => !g.ok && g.applicable && before!.get(g.id) !== false).map((g) => g.id) };
}
setVerifier(verifyStep);

export function isSetPiece(f: Feature): f is SetPieceFeature {
  return f.kind === "setPiece";
}

export { sizeWordOf };
