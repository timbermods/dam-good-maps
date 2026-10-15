// Crop map to selection (D340): the map becomes exactly a rectangle of itself. The rule lives here as plain
// functions on plain data (D342): which rectangles are refused, what the edge cuts, and the cropped file. The
// session turns the cropped file into the map's next generation (doc/session.ts), so the operation is one undo step
// and the full map comes back exactly.

import { entityTiles } from "../features/edits";
import type { EntitySpec } from "../format/entities";
import { rawEntity } from "../format/entities";
import { isObject, num, type JsonObject, type JsonValue } from "../format/json";
import type { TimberFile } from "../format/timber";
import { LAYERS, storedWater, surfaceOf, type WorldModel } from "../format/world";
import { MAX_SIDE, MIN_SIDE } from "../spec/mapspec";
import { thumbnailJpeg } from "../render/shade";

/** The rectangle to keep, in tiles: its top-left tile and its size. */
export interface CropParams {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Why a rectangle cannot be the map's crop, in one line, or null when it can (the same size as the map is
 *  "nothing to crop"). */
export function cropRectProblem(r: CropParams, W: number, H: number): string | null {
  if (r.w < MIN_SIDE || r.h < MIN_SIDE) return `A map is at least ${MIN_SIDE}×${MIN_SIDE}: the selection is ${r.w}×${r.h}`;
  if (r.w > MAX_SIDE || r.h > MAX_SIDE) return `A map is at most ${MAX_SIDE} tiles a side: the selection is ${r.w}×${r.h}`;
  if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) return `The selection reaches off the ${W}×${H} map`;
  if (r.w === W && r.h === H) return "The selection is the whole map: nothing to crop";
  return null;
}

/** The tiles an object stands on (its footprint; the one tile it stands on for an object with none). Null for an
 *  object without a place (no BlockObject): it is not on the ground. */
function tilesOf(e: EntitySpec): [number, number][] | null {
  const tiles = entityTiles(e);
  if (tiles.length) return tiles;
  if (e.raw) {
    const comps = e.raw.Components;
    if (!isObject(comps) || !isObject(comps.BlockObject) || !isObject(comps.BlockObject.Coordinates)) return null;
  }
  return [[e.x, e.y]];
}

export interface CropObjects {
  /** The ids of the objects that stay (all their tiles inside the rectangle), in the order given. */
  kept: string[];
  /** The objects the edge cuts: some of their tiles inside the rectangle, some outside. */
  crossing: string[];
  /** The objects wholly outside it. */
  outside: string[];
  /** A start (StartingLocation) the edge would cut, or that stands outside. */
  cutStart: string | null;
}

/** What the rectangle does to the objects: which stay, which the edge cuts and which stand outside. */
export function cropObjects(entities: readonly EntitySpec[], r: CropParams): CropObjects {
  const out: CropObjects = { kept: [], crossing: [], outside: [], cutStart: null };
  for (const e of entities) {
    const tiles = tilesOf(e);
    if (!tiles) {
      out.kept.push(e.id);
      continue;
    }
    let inside = 0;
    for (const [x, y] of tiles) if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) inside++;
    if (inside === tiles.length) out.kept.push(e.id);
    else {
      (inside ? out.crossing : out.outside).push(e.id);
      if (e.template === "StartingLocation") out.cutStart ??= e.id;
    }
  }
  return out;
}

/** The start's refusal: a start the rectangle would cut off (or leave outside) is never lost silently. */
export const START_CUT = "The start would be cut off: move it inside the selection first";

/** What cropping the map to `r` would do, as the page shows it before and after: the refusal (one line), or the
 *  objects the edge cuts, as a count and their ids. Reads only the map's size and objects. */
export type CropPlan = { ok: false; reason: string } | { ok: true; removedObjects: number; removed: string[]; width: number; height: number };

export function planCrop(entities: readonly EntitySpec[], W: number, H: number, r: CropParams): CropPlan {
  const rect = cropRectProblem(r, W, H);
  if (rect) return { ok: false, reason: rect };
  const o = cropObjects(entities, r);
  if (o.cutStart) return { ok: false, reason: START_CUT };
  return { ok: true, removedObjects: o.crossing.length, removed: [...o.crossing, ...o.outside], width: r.w, height: r.h };
}

// ---------------------------------------------------------------------------------------- the file

/** Per-tile arrays a world file holds (FORMAT.md §4.3): the singleton, its array's key, and what a tile that no
 *  longer fits reads as. A plane is the map's tiles once; a tile may have several (water columns and soil runs
 *  under roofs), laid out plane after plane. */
const TILE_ARRAYS: readonly [singleton: string, key: string, empty: string][] = [
  ["WaterEvaporationMap", "EvaporationModifiers", "1"],
  ["WaterMapNew", "WaterColumns", "0"],
  ["WaterMapNew", "ColumnOutflows", "0"],
  ["SoilMoistureSimulator", "MoistureLevels", "0"],
  ["SoilContaminationSimulator", "ContaminationCandidates", "0"],
  ["SoilContaminationSimulator", "ContaminationLevels", "0"],
];

/** The tokens of a per-tile array on the rectangle: plane after plane, each tile's token where it moves to. A
 *  flow token (`Bottom:Left:Top:Right`, each "0" or `target|flow`) names its targets in the game's grid padded by
 *  one tile on every side: they follow the tile to its new place (`flows`). */
function cropTokens(text: string, W: number, H: number, r: CropParams, empty: string, flows: boolean): string {
  const plane = W * H;
  const tokens = text.split(" ");
  const planes = tokens.length / plane;
  const n = r.w * r.h;
  if (!Number.isInteger(planes) || planes < 1) return Array<string>(n).fill(empty).join(" ");
  const out: string[] = new Array(planes * n);
  for (let p = 0; p < planes; p++)
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const t = tokens[p * plane + (y + r.y) * W + x + r.x];
        out[p * n + y * r.w + x] = flows && t !== "0" ? moveFlows(t, x, y, r) : t;
      }
  return out.join(" ");
}

/** A flow token of the tile now at (x, y): its flows go where they went, to the neighbour in each direction (the
 *  simulation's order: −y, −x, +y, +x), now numbered in the cropped map's padded grid; a neighbour the crop cut
 *  off is the padding, where water leaves the map. */
function moveFlows(token: string, x: number, y: number, r: CropParams): string {
  const stride = r.w + 2;
  const target = (tx: number, ty: number) => (ty + 1) * stride + tx + 1;
  const to = [target(x, y - 1), target(x - 1, y), target(x, y + 1), target(x + 1, y)];
  const parts = token.split(":");
  return parts.map((p, d) => (p === "0" || d > 3 ? p : `${to[d]}|${p.split("|")[1]}`)).join(":");
}

/** The singletons on the rectangle: the per-tile arrays cropped, everything else as it is. */
function cropSingletons(s: JsonObject, W: number, H: number, r: CropParams): JsonObject {
  const out: JsonObject = { ...s };
  for (const [name, key, empty] of TILE_ARRAYS) {
    const single = out[name];
    if (!isObject(single) || !isObject(single[key])) continue;
    const array = String((single[key] as JsonObject).Array);
    out[name] = { ...single, [key]: { ...(single[key] as JsonObject), Array: cropTokens(array, W, H, r, empty, key === "ColumnOutflows") } };
  }
  return out;
}

/** An object moved by (−dx, −dy): its BlockObject coordinates; everything else is shared with the original. */
function shifted(e: JsonObject, dx: number, dy: number): JsonObject {
  const comps = e.Components as JsonObject;
  const bo = comps.BlockObject as JsonObject;
  const c = bo.Coordinates as JsonObject;
  const moved: JsonValue = { ...c, X: num(c.X) - dx, Y: num(c.Y) - dy };
  return { ...e, Components: { ...comps, BlockObject: { ...bo, Coordinates: moved } } };
}

/** A world on the rectangle: its terrain as runs and every column kept exactly (caves and overhangs stay), its
 *  water and soil, and the objects wholly inside it, moved to the new origin. */
export function cropWorld(w: WorldModel, r: CropParams): { world: WorldModel; objects: CropObjects } {
  if (w.layers !== LAYERS) throw new Error(`expected ${LAYERS} layers, got ${w.layers}`);
  const problem = cropRectProblem(r, w.sizeX, w.sizeY);
  if (problem) throw new Error(problem);
  const { sizeX: W, sizeY: H, layers } = w;
  const n = r.w * r.h;
  const voxels = new Uint8Array(layers * n);
  for (let z = 0; z < layers; z++)
    for (let y = 0; y < r.h; y++) {
      const from = z * W * H + (y + r.y) * W + r.x;
      voxels.set(w.voxels.subarray(from, from + r.w), z * n + y * r.w);
    }
  const specs = w.entities.map((e) => rawEntity(e, "import"));
  const objects = cropObjects(specs, r);
  const keep = new Set(objects.kept);
  const entities: JsonObject[] = [];
  w.entities.forEach((e, k) => {
    if (!keep.has(specs[k].id)) return;
    const comps = e.Components;
    entities.push(isObject(comps) && isObject(comps.BlockObject) && isObject(comps.BlockObject.Coordinates) ? shifted(e, r.x, r.y) : e);
  });
  return { world: { ...w, sizeX: r.w, sizeY: r.h, voxels, singletons: cropSingletons(w.singletons, W, H, r), entities }, objects };
}

/** A file on the rectangle (`cropWorld`), with a thumbnail of the land that is left. */
export function cropFile(file: TimberFile, r: CropParams): { file: TimberFile; objects: CropObjects } {
  const { world, objects } = cropWorld(file.world, r);
  const heights = surfaceOf(world);
  const wet = new Float64Array(r.w * r.h);
  const stored = storedWater(world.singletons, r.w, r.h);
  for (let k = 0; k < stored.tile.length; k++) wet[stored.tile[k]] = Math.max(wet[stored.tile[k]], stored.depth[k]);
  return {
    file: { ...file, metadata: file.metadata ? { ...file.metadata, Width: r.w, Height: r.h } : file.metadata, thumbnail: thumbnailJpeg(heights, r.w, r.h, wet), world },
    objects,
  };
}
