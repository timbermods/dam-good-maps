// The built base of a document (PLAN §19.6, EDITOR_PLAN §3): the map a generation produced, or
// the imported file after normalization. It is stored in the project file and never mutated, so a
// document opens exactly even after the generator has changed (PLAN §19.7), and an unedited import
// exports its normalized world byte for byte.
//
// Terrain is stored as format 3's terrain (D119, I-1; terrain/runs.ts): the surface height of every
// tile plus the solid runs of the tiles that are not one plain run from z = 0 (caves, overhangs,
// floating ground), kept exactly: the editor's tools edit the surface only, and those columns export
// unchanged (EDITOR_PLAN §3, "working representation"). Format 1 and 2 files stored those columns
// as 23-character strings; they convert to runs when read (the same voxels).
// In memory the base's terrain is a `ColumnTerrain` (a voxel mask per tile), its surface derived.
// Everything else of world.json is stored as its exact text with an empty terrain array, so floats
// keep the digits they were written with.

import { fromBase64, toBase64 } from "../format/base64";
import { parse, stringify, type JsonObject } from "../format/json";
import type { TimberFile } from "../format/timber";
import { decodeWorld, encodeWorld, LAYERS, type WorldModel } from "../format/world";
import { ColumnTerrain, runsOfColumn, type TerrainData } from "../terrain/runs";

/** The base's terrain is format 3's (`TerrainData`): `heights`, the surface height per tile (the
 *  first free layer above the top solid voxel), base64 of one byte per tile, row-major; `runs`, the
 *  tiles that are not a single solid run from z = 0, in index order, with their solid runs bottom to
 *  top (D119). */
export interface BaseMap extends TerrainData {
  source: "generated" | "import";
  sizeX: number;
  sizeY: number;
  /** world.json with an empty terrain array, exact text; null in documents from project files of
   *  format 1, which stored the heights only (their map is rebuilt from the features). */
  world: string | null;
  /** map_metadata.json, exact text. */
  metadata: string;
  /** map_thumbnail.jpg, base64, or null. */
  thumbnail: string | null;
  versionTxt: string;
  /** The feature that placed each entity of `world`, in entity order (generated maps). */
  owners?: string[];
}

/** The terrain of a base, decoded. */
export interface BaseTerrain {
  W: number;
  H: number;
  /** The terrain itself: a voxel mask per tile (D119). */
  terrain: ColumnTerrain;
  /** Its surface per tile, derived from it. */
  heights: Uint8Array;
  /** Tile index → its voxel column (LAYERS entries), for the tiles that are not a plain run, derived
   *  from it: the form the 3D view's voxel mesher takes. */
  columns: Map<number, Uint8Array>;
}

function decoded(terrain: ColumnTerrain): BaseTerrain {
  const columns = new Map<number, Uint8Array>();
  for (const i of terrain.notPlain()) columns.set(i, terrain.column(i, LAYERS));
  return { W: terrain.W, H: terrain.H, terrain, heights: terrain.heights(), columns };
}

/** A normalized world's voxels as the terrain: its runs per tile, with the surface heights. */
export function splitTerrain(w: Pick<WorldModel, "sizeX" | "sizeY" | "layers" | "voxels">): BaseTerrain {
  if (w.layers !== LAYERS) throw new Error(`expected ${LAYERS} layers, got ${w.layers}`);
  return decoded(ColumnTerrain.fromVoxels(w.voxels, w.sizeX, w.sizeY, LAYERS));
}

export function baseFromFile(file: TimberFile, source: BaseMap["source"], owners?: string[]): BaseMap {
  const w = file.world;
  if (w.legacy) throw new Error("normalize the map before storing it");
  const t = splitTerrain(w);
  const base: BaseMap = {
    source,
    sizeX: w.sizeX,
    sizeY: w.sizeY,
    ...t.terrain.toData(),
    world: encodeWorld({ ...w, voxels: new Uint8Array(0) }),
    metadata: stringify(file.metadata ?? {}),
    thumbnail: file.thumbnail ? toBase64(file.thumbnail) : null,
    versionTxt: file.versionTxt,
  };
  if (owners) base.owners = owners;
  return base;
}

/** Tolerant of a stored run that names a tile off the map (it is never drawn), as saved projects
 *  always opened; `terrain/runs.ts` `terrainColumns` refuses one. */
export function baseTerrain(base: BaseMap): BaseTerrain {
  return decoded(ColumnTerrain.fromData(base, base.sizeX, base.sizeY));
}

/** Format 1 and 2's columns ([tile, 23 voxels "0"/"1"]) as format 3's runs. */
export function runsOfColumns(columns: readonly [number, string][]): [number, number[]][] {
  const out: [number, number[]][] = [];
  for (const [i, text] of columns) {
    const col = new Uint8Array(LAYERS);
    for (let z = 0; z < LAYERS; z++) col[z] = text.charCodeAt(z) === 49 ? 1 : 0;
    out.push([i, runsOfColumn(col)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** The base as a .timber file (a fresh copy: callers may change it). */
export function fileFromBase(base: BaseMap, terrain = baseTerrain(base)): TimberFile {
  if (base.world === null) throw new Error("this document stores no map: rebuild it from its features");
  const voxels = terrain.terrain.voxels(LAYERS);
  return {
    metadata: parse(base.metadata) as JsonObject,
    thumbnail: base.thumbnail ? fromBase64(base.thumbnail) : null,
    versionTxt: base.versionTxt,
    world: decodeWorld(base.world, { voxels, layers: LAYERS }),
    extraFiles: [],
  };
}
