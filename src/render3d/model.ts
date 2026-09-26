// What the 3D view draws (EDITOR_PLAN §8): a map view of terrain, water and objects in compact
// typed arrays, so the worker sends it cheaply and the renderer never sees a document. Pure
// TypeScript with no three.js: the worker builds views, the renderer and the editor read them.
//
// Coordinates: tile (x, y) with x east and y north, as in the game. The renderer's world space is
// X = x, Y = height, Z = −y, so north is −Z and the top-down view has north up.

import { contaminationByte, moistureByte } from "./palette";

export const LAYERS = 23;
export const ORIENTATION_NAMES = ["Cw0", "Cw90", "Cw180", "Cw270"] as const;

/** Entity flags. */
export const DEAD = 1;
export const FLIPPED = 2;
export const YOUNG = 4;

/** A ruin's variant (its `RuinModels.VariantId`, "A" to "E") as an index, and the value for none:
 *  a file without one, or another object (the game picks one at random; the view picks one from
 *  the tile). */
export const RUIN_VARIANT_IDS = ["A", "B", "C", "D", "E"] as const;
export const NO_VARIANT = 255;

export function variantIndex(id: string | undefined): number {
  const k = RUIN_VARIANT_IDS.indexOf(id as (typeof RUIN_VARIANT_IDS)[number]);
  return k < 0 ? NO_VARIANT : k;
}

export interface EntityView {
  count: number;
  /** Template names; `template[k]` indexes this table. */
  templates: string[];
  /** Owning feature ids ("import" for an imported map's own objects); `owner[k]` indexes it. */
  owners: string[];
  template: Uint16Array;
  x: Int16Array;
  y: Int16Array;
  z: Int16Array;
  /** 0–3: Cw0, Cw90, Cw180, Cw270. */
  orientation: Uint8Array;
  flags: Uint8Array;
  owner: Uint16Array;
  /** A ruin's variant (0–4: A–E; NO_VARIANT: none given). */
  variant: Uint8Array;
  /** A water or badwater source's strength (blocks a second); 0 for anything else. */
  strength: Float32Array;
}

/** Water columns (sparse): one entry per wet column. Under caves a tile may hold several; the
 *  one with the highest floor is the tile's surface water. */
export interface WaterView {
  count: number;
  tile: Int32Array;
  /** Bottom of the water column (the terrain it stands on). */
  floor: Float32Array;
  depth: Float32Array;
  /** Badwater share, 0–1. */
  contamination: Float32Array;
}

/** Soil per tile, as bytes (palette.ts `moistureByte`, `contaminationByte`): moisture above 0
 *  where living plants grow, contamination above 0 where badwater spoils the soil. */
export interface SoilView {
  moisture: Uint8Array;
  contamination: Uint8Array;
}

export interface MapView {
  W: number;
  H: number;
  /** Surface height per tile: the first free layer above the top solid voxel. */
  heights: Uint8Array;
  /** Columns with caves or overhangs: their tile indices and 23 voxels each (1 = solid). */
  columns: { tiles: Int32Array; voxels: Uint8Array };
  water: WaterView;
  entities: EntityView;
  /** The soil the ground's colour shows (Map look, D86). Without it the ground reads as dry. */
  soil?: SoilView;
}

/** Soil moisture (the game's levels) and soil contamination (0–1) per tile as a soil view. */
export function soilView(moisture: ArrayLike<number>, contamination: ArrayLike<number>): SoilView {
  const n = moisture.length;
  const m = new Uint8Array(n);
  const c = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = moistureByte(moisture[i]);
    c[i] = contaminationByte(contamination[i] ?? 0);
  }
  return { moisture: m, contamination: c };
}

/** Wetter than this counts as water (the 2D preview's threshold). */
export const WET = 0.001;

export function emptyWater(): WaterView {
  return { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
}

export function emptyColumns(): MapView["columns"] {
  return { tiles: new Int32Array(0), voxels: new Uint8Array(0) };
}

/** A heightfield's settled water (depth per tile over the surface) as a water view. */
export function waterFromDepth(heights: Uint8Array, depth: ArrayLike<number>, contamination: ArrayLike<number>): WaterView {
  let n = 0;
  for (let i = 0; i < heights.length; i++) if (depth[i] > WET) n++;
  const w: WaterView = { count: n, tile: new Int32Array(n), floor: new Float32Array(n), depth: new Float32Array(n), contamination: new Float32Array(n) };
  let k = 0;
  for (let i = 0; i < heights.length; i++) {
    if (!(depth[i] > WET)) continue;
    w.tile[k] = i;
    w.floor[k] = heights[i];
    w.depth[k] = depth[i];
    w.contamination[k] = contamination[i] ?? 0;
    k++;
  }
  return w;
}

/** Per-tile surface water: the column with the highest floor (NaN where dry). */
export interface SurfaceWater {
  surface: Float32Array;
  floor: Float32Array;
  depth: Float32Array;
  contamination: Float32Array;
  /** Columns below the surface one (water in caves), as indices into the view. */
  lower: number[];
}

export function surfaceWater(W: number, H: number, w: WaterView): SurfaceWater {
  const N = W * H;
  const surface = new Float32Array(N).fill(NaN);
  const floor = new Float32Array(N).fill(NaN);
  const depth = new Float32Array(N);
  const contamination = new Float32Array(N);
  const top = new Int32Array(N).fill(-1);
  const lower: number[] = [];
  for (let k = 0; k < w.count; k++) {
    const i = w.tile[k];
    const j = top[i];
    if (j >= 0 && w.floor[j] >= w.floor[k]) {
      lower.push(k);
      continue;
    }
    if (j >= 0) lower.push(j);
    top[i] = k;
    floor[i] = w.floor[k];
    depth[i] = w.depth[k];
    surface[i] = w.floor[k] + w.depth[k];
    contamination[i] = w.contamination[k];
  }
  return { surface, floor, depth, contamination, lower };
}

/** The voxel columns as a map from tile index to its 23 voxels. */
export function columnMap(c: MapView["columns"]): Map<number, Uint8Array> {
  const m = new Map<number, Uint8Array>();
  for (let k = 0; k < c.tiles.length; k++) m.set(c.tiles[k], c.voxels.subarray(k * LAYERS, (k + 1) * LAYERS));
  return m;
}

export interface EntityInput {
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: string;
  owner: string;
  dead?: boolean;
  flipped?: boolean;
  young?: boolean;
  /** A ruin's `RuinModels.VariantId` ("A" to "E"). */
  variant?: string;
  /** A source's strength. */
  strength?: number;
}

export function entityView(list: readonly EntityInput[]): EntityView {
  const n = list.length;
  const templates: string[] = [];
  const owners: string[] = [];
  const tIndex = new Map<string, number>();
  const oIndex = new Map<string, number>();
  const v: EntityView = {
    count: n,
    templates,
    owners,
    template: new Uint16Array(n),
    x: new Int16Array(n),
    y: new Int16Array(n),
    z: new Int16Array(n),
    orientation: new Uint8Array(n),
    flags: new Uint8Array(n),
    owner: new Uint16Array(n),
    variant: new Uint8Array(n),
    strength: new Float32Array(n),
  };
  list.forEach((e, k) => {
    let t = tIndex.get(e.template);
    if (t === undefined) {
      t = templates.length;
      templates.push(e.template);
      tIndex.set(e.template, t);
    }
    let o = oIndex.get(e.owner);
    if (o === undefined) {
      o = owners.length;
      owners.push(e.owner);
      oIndex.set(e.owner, o);
    }
    v.template[k] = t;
    v.owner[k] = o;
    v.x[k] = e.x;
    v.y[k] = e.y;
    v.z[k] = e.z;
    const oi = ORIENTATION_NAMES.indexOf(e.orientation as (typeof ORIENTATION_NAMES)[number]);
    v.orientation[k] = oi < 0 ? 0 : oi;
    v.flags[k] = (e.dead ? DEAD : 0) | (e.flipped ? FLIPPED : 0) | (e.young ? YOUNG : 0);
    v.variant[k] = variantIndex(e.variant);
    v.strength[k] = e.strength ?? 0;
  });
  return v;
}

/** The buffers of a view, for Comlink's transfer list. */
export function viewBuffers(v: Partial<MapView> & { terrain?: { pre: Uint8Array; protect: Uint8Array; channel: Uint8Array; base: Uint8Array | null; locked: Uint8Array | null; columns: Int32Array } }): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const add = (a: ArrayBufferView | undefined | null) => {
    if (a && !out.includes(a.buffer as ArrayBuffer)) out.push(a.buffer as ArrayBuffer);
  };
  add(v.heights);
  if (v.terrain) for (const a of [v.terrain.pre, v.terrain.protect, v.terrain.channel, v.terrain.base, v.terrain.locked, v.terrain.columns]) add(a);
  if (v.columns) {
    add(v.columns.tiles);
    add(v.columns.voxels);
  }
  if (v.water) for (const a of [v.water.tile, v.water.floor, v.water.depth, v.water.contamination]) add(a);
  if (v.soil) for (const a of [v.soil.moisture, v.soil.contamination]) add(a);
  if (v.entities) for (const a of [v.entities.template, v.entities.x, v.entities.y, v.entities.z, v.entities.orientation, v.entities.flags, v.entities.owner, v.entities.variant, v.entities.strength]) add(a);
  return out;
}
