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
// Everything else of world.json is stored as its exact text with an empty terrain array, so floats
// keep the digits they were written with.

import { fromBase64, toBase64 } from "../format/base64";
import { parse, stringify, type JsonObject } from "../format/json";
import type { TimberFile } from "../format/timber";
import { decodeWorld, encodeWorld, LAYERS, surfaceOf, type WorldModel } from "../format/world";
import { columnOfRuns, runsOfColumn } from "../terrain/runs";

export interface BaseMap {
  source: "generated" | "import";
  sizeX: number;
  sizeY: number;
  /** Surface height per tile (the first free layer above the top solid voxel), base64 of one byte
   *  per tile, row-major. */
  heights: string;
  /** Tiles that are not a single solid run from z = 0, in index order: [tile index, their solid
   *  runs floor0, ceil0, floor1, ceil1, …, bottom to top] (format 3; D119). */
  runs: [number, number[]][];
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
  heights: Uint8Array;
  /** Tile index → its voxel column (LAYERS entries), for columns that are not a plain run. */
  columns: Map<number, Uint8Array>;
}

function columnOf(voxels: Uint8Array, plane: number, i: number): Uint8Array {
  const col = new Uint8Array(LAYERS);
  for (let z = 0; z < LAYERS; z++) col[z] = voxels[z * plane + i];
  return col;
}

/** Split a normalized world's voxels into surface heights and the multi-run columns. */
export function splitTerrain(w: Pick<WorldModel, "sizeX" | "sizeY" | "layers" | "voxels">): BaseTerrain {
  if (w.layers !== LAYERS) throw new Error(`expected ${LAYERS} layers, got ${w.layers}`);
  const W = w.sizeX;
  const H = w.sizeY;
  const plane = W * H;
  const heights = surfaceOf(w);
  const columns = new Map<number, Uint8Array>();
  for (let i = 0; i < plane; i++) {
    const h = heights[i];
    let plain = true;
    for (let z = 0; z < h && plain; z++) if (!w.voxels[z * plane + i]) plain = false;
    if (!plain) columns.set(i, columnOf(w.voxels, plane, i));
  }
  return { W, H, heights, columns };
}

/** Voxels of surface heights, with the stored columns put back verbatim. */
export function joinTerrain(W: number, H: number, heights: Uint8Array, columns: ReadonlyMap<number, Uint8Array>): Uint8Array {
  const plane = W * H;
  const out = new Uint8Array(plane * LAYERS);
  for (let i = 0; i < plane; i++) {
    const col = columns.get(i);
    if (col) {
      for (let z = 0; z < LAYERS; z++) out[z * plane + i] = col[z];
      continue;
    }
    const h = Math.min(heights[i], LAYERS);
    for (let z = 0; z < h; z++) out[z * plane + i] = 1;
  }
  return out;
}

export function baseFromFile(file: TimberFile, source: BaseMap["source"], owners?: string[]): BaseMap {
  const w = file.world;
  if (w.legacy) throw new Error("normalize the map before storing it");
  const t = splitTerrain(w);
  const runs: [number, number[]][] = [];
  for (const [i, col] of t.columns) runs.push([i, runsOfColumn(col)]);
  runs.sort((a, b) => a[0] - b[0]);
  const base: BaseMap = {
    source,
    sizeX: w.sizeX,
    sizeY: w.sizeY,
    heights: toBase64(t.heights),
    runs,
    world: encodeWorld({ ...w, voxels: new Uint8Array(0) }),
    metadata: stringify(file.metadata ?? {}),
    thumbnail: file.thumbnail ? toBase64(file.thumbnail) : null,
    versionTxt: file.versionTxt,
  };
  if (owners) base.owners = owners;
  return base;
}

export function baseTerrain(base: BaseMap): BaseTerrain {
  const heights = fromBase64(base.heights);
  if (heights.length !== base.sizeX * base.sizeY) throw new Error("base heights have the wrong size");
  const columns = new Map<number, Uint8Array>();
  for (const [i, r] of base.runs) columns.set(i, columnOfRuns(r, LAYERS));
  return { W: base.sizeX, H: base.sizeY, heights, columns };
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
  const voxels = joinTerrain(base.sizeX, base.sizeY, terrain.heights, terrain.columns);
  return {
    metadata: parse(base.metadata) as JsonObject,
    thumbnail: base.thumbnail ? fromBase64(base.thumbnail) : null,
    versionTxt: base.versionTxt,
    world: decodeWorld(base.world, { voxels, layers: LAYERS }),
    extraFiles: [],
  };
}
