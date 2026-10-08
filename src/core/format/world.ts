// world.json in memory (FORMAT.md §4). Terrain voxels live in a Uint8Array (index z·X·Y + y·X + x,
// 1 = solid); every other singleton and every entity is kept as parsed JSON, so unknown data passes
// through untouched and an unedited file re-serializes byte for byte.

import { F, formatFloat, isObject, num, parse, stringify, type JsonObject, type JsonValue } from "./json";
import { evapModifier } from "../sim/moisture";
import type { TerrainColumns, WaterColumns } from "../sim/columns";

export const GAME_VERSION = "1.1.2.4-52e959e-sw";
export const LAYERS = 23; // MaxGameTerrainHeight 22 + 1
export const MAX_OBJECT_Z = 33; // terrain layers + 10 above
export const EDITOR_MAX_HEIGHT = 16;
/** The highest surface a map may have: 22, with voxel layer 22 empty. Maps above 16 load and keep
 *  their terrain, water, sources, flow, objects and start (D172 (1), after probe run
 *  20260925-tall); the in-game map editor edits only up to `EDITOR_MAX_HEIGHT`. */
export const GAME_MAX_HEIGHT = 22;

/** The editor's one height ceiling, on every map (PLAN §20 D244): D172's tall maximum. The brushes,
 *  the forces, Select's levels and the build's integrity pass all stop here. */
export const CEILING = GAME_MAX_HEIGHT;

/** A map whose land goes above `EDITOR_MAX_HEIGHT` is a tall map (D172, D244); at or below it, a
 *  standard one again. */
export function isTall(heights: ArrayLike<number>): boolean {
  for (let i = 0; i < heights.length; i++) if (heights[i] > EDITOR_MAX_HEIGHT) return true;
  return false;
}

/** A tall map's note in its description (D172 (4), D244), in plain words: what the probe found the
 *  in-game editor does with it (run ceiling-20260927). */
export const TALL_NOTE = "Timberborn's map editor opens and saves this map as it is, but can't raise land above level 16.";

/** A generated map's own words for its tall land, a sentence of its description (pack.ts). They are
 *  its tall note: a generated map, exported and opened again as a file, carries one note, never
 *  two, and exports the same bytes (D244, D341). */
export function generatedTallSentence(top: number): string {
  return `The land rises to level ${top}: the game's map editor edits only up to level ${EDITOR_MAX_HEIGHT}.`;
}
const GENERATED_TALL = new RegExp(` ?The land rises to level (\\d+): the game's map editor edits only up to level ${EDITOR_MAX_HEIGHT}\\.`);

/** The description with the tall note when the map is tall, and without it when it isn't. A
 *  generated map's own words count as the note: kept while it is tall (their level following `top`
 *  when given), taken out when it is standard again. */
export function withTallNote(description: string, tall: boolean, top?: number): string {
  const own = GENERATED_TALL.exec(description);
  if (own) {
    if (!tall) return withTallNote(description.replace(GENERATED_TALL, ""), false);
    if (top === undefined || Number(own[1]) === top) return description;
    return description.replace(GENERATED_TALL, (m) => m.replace(`level ${own[1]}:`, `level ${top}:`));
  }
  const has = description.split("\n\n").some((p) => p.trim() === TALL_NOTE);
  // (a description that has it and should, or hasn't and shouldn't, stays exactly as it is)
  if (has === tall) return description;
  const bare = description
    .split("\n\n")
    .filter((p) => p.trim() !== TALL_NOTE)
    .join("\n\n")
    .trimEnd();
  if (!tall) return bare;
  return bare ? `${bare}\n\n${TALL_NOTE}` : TALL_NOTE;
}

export interface WorldModel {
  gameVersion: string;
  timestamp: string;
  sizeX: number;
  sizeY: number;
  layers: number;
  voxels: Uint8Array;
  /** Every singleton in file order. TerrainMap.Voxels.Array is rebuilt from `voxels` on write. */
  singletons: JsonObject;
  entities: JsonObject[];
  /** Read from a pre-0.7 heightmap map: readable, never written back. */
  legacy?: boolean;
}

// ---------------------------------------------------------------- voxels <-> text

export function encodeVoxels(voxels: Uint8Array): string {
  const n = voxels.length;
  if (n === 0) return "";
  const bytes = new Uint8Array(2 * n - 1);
  for (let i = 0, j = 0; i < n; i++, j += 2) {
    bytes[j] = voxels[i] ? 49 : 48;
    if (j + 1 < bytes.length) bytes[j + 1] = 32;
  }
  return new TextDecoder("latin1").decode(bytes);
}

export function decodeVoxels(text: string): Uint8Array {
  // tokens are single "0"/"1" separated by single spaces
  const n = (text.length + 1) >> 1;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 2) {
    const c = text.charCodeAt(j);
    if (c === 49) out[i] = 1;
    else if (c !== 48) throw new Error(`voxel token ${text[j]} at ${i}`);
  }
  return out;
}

/** Surface: the first free layer above the topmost solid voxel of each column (entity Z). */
export function surfaceOf(w: Pick<WorldModel, "sizeX" | "sizeY" | "layers" | "voxels">): Uint8Array {
  const { sizeX: X, sizeY: Y, layers: L, voxels } = w;
  const out = new Uint8Array(X * Y);
  const plane = X * Y;
  for (let i = 0; i < plane; i++) {
    for (let z = L - 1; z >= 0; z--) {
      if (voxels[z * plane + i]) {
        out[i] = z + 1;
        break;
      }
    }
  }
  return out;
}

/** Solid-to-air transitions per column (a column solid to the top counts one). */
export function floorsOf(w: Pick<WorldModel, "sizeX" | "sizeY" | "layers" | "voxels">): Uint8Array {
  const { sizeX: X, sizeY: Y, layers: L, voxels } = w;
  const plane = X * Y;
  const out = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    let n = 0;
    for (let z = 0; z < L - 1; z++) if (voxels[z * plane + i] && !voxels[(z + 1) * plane + i]) n++;
    if (voxels[(L - 1) * plane + i]) n++;
    out[i] = n;
  }
  return out;
}

export function voxelsFromHeights(heights: Uint8Array, sizeX: number, sizeY: number, layers = LAYERS): Uint8Array {
  const plane = sizeX * sizeY;
  const out = new Uint8Array(plane * layers);
  for (let i = 0; i < plane; i++) {
    const h = Math.min(heights[i], layers);
    for (let z = 0; z < h; z++) out[z * plane + i] = 1;
  }
  return out;
}

// ---------------------------------------------------------------- simulation state singletons

/** Fresh singletons for a new heightfield map (FORMAT.md §4.3): no water, no moisture, no
 *  contamination, neutral evaporation. `WaterSimulationMigrator.IsMigrated` must be true or the
 *  game halves every source's strength. The editor-only thumbnail camera is left out. */
export function emptySimulationSingletons(sizeX: number, sizeY: number, levels = 1): JsonObject {
  const n = levels * sizeX * sizeY;
  const zeros = repeatToken("0", n);
  return {
    MapSize: { Size: { X: sizeX, Y: sizeY } },
    TerrainMap: { Voxels: { Array: "" } },
    HazardousWeatherHistory: { HistoryData: [] },
    WaterEvaporationMap: { Levels: levels, EvaporationModifiers: { Array: repeatToken("1", n) } },
    WaterSimulationMigrator: { IsMigrated: true },
    WaterMapNew: { Levels: levels, WaterColumns: { Array: zeros }, ColumnOutflows: { Array: zeros } },
    SoilMoistureSimulator: { Size: levels, MoistureLevels: { Array: zeros } },
    SoilContaminationSimulator: {
      Size: levels,
      ContaminationCandidates: { Array: zeros },
      ContaminationLevels: { Array: zeros },
    },
    NumberedEntityNamerService: { NextNumbers: [] },
    WindService: { WindStrength: F(0), WindDirection: { X: F(0), Y: F(0) }, NextWindChangeTime: F(0) },
  };
}

/** A packed-array number the way the game writes it: whole values 0–16 as bare integers, other
 *  values with 7 significant digits in C# style (prototype tbmap `_num`). */
export function numToken(v: number): string {
  if (Number.isInteger(v) && v >= 0 && v <= 16) return String(v);
  return formatFloat(Number(v.toPrecision(7)));
}

/** A water depth or contamination token: nine significant places of the Single the view is sent, so a
 *  .timber download reopens to the very water shown (#310 F3, investigation/page-qa). */
function waterToken(v: number): string {
  return formatFloat(Number(Math.fround(v).toPrecision(9)));
}

export interface SettledState {
  /** Surface (water column floor) per tile. */
  floor: Uint8Array;
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** Cluster saturation of the water (for the evaporation modifiers). */
  sat: ArrayLike<number>;
  /** The settled water's outflows, four per tile in the simulation's order (−y, −x, +y, +x: the
   *  game's Bottom, Left, Top and Right), as `WaterSim.out` holds them; none writes all `"0"`. */
  out?: ArrayLike<number>;
}

/** One tile's `ColumnOutflows` token (FORMAT.md §4.3): `"0"`, or `Bottom:Left:Top:Right` with each
 *  part `"0"` or `targetIndex|flow`, the target being the neighbour's index in the game's grid
 *  padded by one tile on every side (`MapIndexService`: `(y + 1) · (X + 2) + x + 1`, slot 0). */
function outflowToken(out: ArrayLike<number>, i: number, sizeX: number): string {
  const x = i % sizeX;
  const y = (i - x) / sizeX;
  const stride = sizeX + 2;
  const target = (tx: number, ty: number) => (ty + 1) * stride + tx + 1;
  const parts = [
    [out[4 * i], target(x, y - 1)],
    [out[4 * i + 1], target(x - 1, y)],
    [out[4 * i + 2], target(x, y + 1)],
    [out[4 * i + 3], target(x + 1, y)],
  ].map(([f, t]) => (f > 1e-6 ? `${t}|${numToken(f)}` : "0"));
  return parts.every((p) => p === "0") ? "0" : parts.join(":");
}

/** Simulation singletons holding settled water, the way official maps ship (FORMAT.md §4.3): one
 *  water column per tile (slot 0, a heightfield), `depth:contamination:0:floor:depth` tokens, the
 *  settled water's outflows (its momentum: without them the game rebuilds the flow from rest, and a
 *  map whose flow can settle more than one way, a delta's channels, may not come back to the water
 *  it shipped with), soil moisture and contamination at steady state, and the evaporation
 *  modifiers of the settled water. Depths under 1e-6 are written as dry. */
export function settledSimulationSingletons(sizeX: number, sizeY: number, st: SettledState): JsonObject {
  const n = sizeX * sizeY;
  const s = emptySimulationSingletons(sizeX, sizeY, 1);
  const water: string[] = new Array(n);
  const flows: string[] | null = st.out && st.out.length === 4 * n ? new Array(n) : null;
  const moist: string[] = new Array(n);
  const soil: string[] = new Array(n);
  const evap: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const d = st.depth[i];
    if (d > 1e-6) {
      const ds = waterToken(d);
      const c = st.contamination[i];
      water[i] = `${ds}:${c > 1e-6 ? waterToken(c) : "0"}:0:${st.floor[i]}:${ds}`;
      if (flows) flows[i] = outflowToken(st.out!, i, sizeX);
    } else {
      water[i] = "0";
      if (flows) flows[i] = "0";
    }
    moist[i] = numToken(st.moisture[i]);
    soil[i] = numToken(st.soilContamination[i]);
    const sat = st.sat[i];
    evap[i] = sat > 0 ? numToken(evapModifier(sat)) : "1";
  }
  (s.WaterMapNew as JsonObject).WaterColumns = { Array: water.join(" ") };
  if (flows) (s.WaterMapNew as JsonObject).ColumnOutflows = { Array: flows.join(" ") };
  (s.WaterEvaporationMap as JsonObject).EvaporationModifiers = { Array: evap.join(" ") };
  (s.SoilMoistureSimulator as JsonObject).MoistureLevels = { Array: moist.join(" ") };
  const soilText = soil.join(" ");
  (s.SoilContaminationSimulator as JsonObject).ContaminationCandidates = { Array: soilText };
  (s.SoilContaminationSimulator as JsonObject).ContaminationLevels = { Array: soilText };
  return s;
}

/** Settled water and soil on terrain above terrain, per slot (D120; FORMAT.md §4.3): what
 *  `stackedSimulationSingletons` writes. */
export interface StackedSettledState {
  /** The water columns (sim/columns.ts `waterColumns`), and per column id (slot·N + tile) the settled
   *  water: its depth, the pressure of a full cave (0 in the open), its contamination. */
  cols: WaterColumns;
  depth: ArrayLike<number>;
  overflow: ArrayLike<number>;
  contamination: ArrayLike<number>;
  /** Cluster saturation per column id (for the evaporation modifiers). */
  sat: ArrayLike<number>;
  /** The terrain runs (sim/columns.ts `terrainColumns`), and per run id (slot·N + tile) the soil. */
  runs: TerrainColumns;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
}

/** Simulation singletons holding settled water and soil per slot, the way the game saves a map with
 *  caves and overhangs (D120; FORMAT.md §4.3):
 *  - `WaterMapNew.Levels` is the most water columns of any tile, and each (slot, tile) token is the
 *    column's `depth:contamination:overflow:floor:depth`, "0" when dry or when the tile has no such
 *    slot; `WaterEvaporationMap` has the same levels;
 *  - `SoilMoistureSimulator` and `SoilContaminationSimulator` have `Size` = the most terrain runs of
 *    any tile, one value per run top.
 *  Outflows are all "0": the game rebuilds the flow within a few ticks (the T1–T6 probe maps were
 *  played so). On a heightfield (one run and one water column per tile) this is
 *  `settledSimulationSingletons` without its outflows, byte for byte: such a tile's token names its
 *  terrain's surface as the floor, as that writer does (a Blockage lifts the column's floor above it;
 *  the game recomputes the field on load), and every other tile its column's own floor. */
export function stackedSimulationSingletons(sizeX: number, sizeY: number, st: StackedSettledState): JsonObject {
  const { cols, runs } = st;
  const N = sizeX * sizeY;
  if (cols.N !== N || runs.N !== N) throw new Error("the water columns and runs do not fit the map");
  const L = cols.L;
  const T = runs.T;
  const s = emptySimulationSingletons(sizeX, sizeY, L);
  const water: string[] = new Array(L * N).fill("0");
  const evap: string[] = new Array(L * N).fill("1");
  for (let i = 0; i < N; i++) {
    const heightfield = cols.count[i] === 1 && runs.count[i] === 1;
    for (let k = 0; k < cols.count[i]; k++) {
      const c = k * N + i;
      const d = st.depth[c];
      if (d > 1e-6) {
        const ds = waterToken(d);
        const cn = st.contamination[c];
        const o = st.overflow[c];
        const floor = heightfield ? runs.ceil[i] : cols.floor[c];
        water[c] = `${ds}:${cn > 1e-6 ? waterToken(cn) : "0"}:${o > 1e-6 ? waterToken(o) : "0"}:${floor}:${ds}`;
      }
      const sat = st.sat[c];
      if (sat > 0) evap[c] = numToken(evapModifier(sat));
    }
  }
  const moist: string[] = new Array(T * N).fill("0");
  const soil: string[] = new Array(T * N).fill("0");
  for (let i = 0; i < N; i++)
    for (let k = 0; k < runs.count[i]; k++) {
      const n = k * N + i;
      moist[n] = numToken(st.moisture[n]);
      soil[n] = numToken(st.soilContamination[n]);
    }
  (s.WaterMapNew as JsonObject).WaterColumns = { Array: water.join(" ") };
  (s.WaterEvaporationMap as JsonObject).EvaporationModifiers = { Array: evap.join(" ") };
  const soilText = soil.join(" ");
  s.SoilMoistureSimulator = { Size: T, MoistureLevels: { Array: moist.join(" ") } };
  s.SoilContaminationSimulator = { Size: T, ContaminationCandidates: { Array: soilText }, ContaminationLevels: { Array: soilText } };
  return s;
}

/** An edited import's simulation singletons (EDITOR_PLAN §6, the roofed-water rule): the settled
 *  water of the heightfield on every tile with one floor (slot 0, the other slots empty), and the
 *  file's own water, outflows, moisture, contamination and evaporation, every slot, on the tiles
 *  under roofs (`roofed`: caves, tunnels, overhangs), which the heightfield model cannot simulate.
 *  An array whose length does not fit its own size field is written as the settled one alone. */
export function mixedSimulationSingletons(file: JsonObject, W: number, H: number, st: SettledState, roofed: ReadonlySet<number>): JsonObject {
  const fresh = settledSimulationSingletons(W, H, st);
  const plane = W * H;
  const out: JsonObject = {};
  const mix = (singleton: string, slotsKey: string, keys: string[], empty: string): void => {
    const n = fresh[singleton] as JsonObject;
    const f = file[singleton];
    out[singleton] = n;
    if (!isObject(f)) return;
    const slots = slotsKey in f ? num(f[slotsKey]) : 1;
    const arrays = keys.map((k) => (isObject(f[k]) ? String((f[k] as JsonObject).Array).split(" ") : null));
    if (arrays.some((a) => !a || a.length !== slots * plane)) return;
    const o: JsonObject = { ...f, [slotsKey]: slots };
    keys.forEach((k, q) => {
      const tokens = arrays[q]!;
      const settled = String((n[k] as JsonObject).Array).split(" ");
      const merged: string[] = new Array(slots * plane);
      for (let s2 = 0; s2 < slots; s2++)
        for (let i = 0; i < plane; i++) merged[s2 * plane + i] = roofed.has(i) ? tokens[s2 * plane + i] : s2 === 0 ? settled[i] : empty;
      o[k] = { Array: merged.join(" ") };
    });
    out[singleton] = o;
  };
  mix("WaterMapNew", "Levels", ["WaterColumns", "ColumnOutflows"], "0");
  mix("SoilMoistureSimulator", "Size", ["MoistureLevels"], "0");
  mix("SoilContaminationSimulator", "Size", ["ContaminationCandidates", "ContaminationLevels"], "0");
  mix("WaterEvaporationMap", "Levels", ["EvaporationModifiers"], "1");
  out.WaterSimulationMigrator = fresh.WaterSimulationMigrator;
  return out;
}

export function repeatToken(token: string, n: number): string {
  if (n <= 0) return "";
  return (token + " ").repeat(n - 1) + token;
}

// ---------------------------------------------------------------- encode / decode

export function encodeWorld(w: WorldModel): string {
  if (w.legacy) throw new Error("pre-0.7 heightmap maps are read-only");
  const singletons: JsonObject = {};
  for (const k in w.singletons) singletons[k] = w.singletons[k];
  singletons.MapSize = { ...(w.singletons.MapSize as JsonObject), Size: { X: w.sizeX, Y: w.sizeY } };
  singletons.TerrainMap = { ...(w.singletons.TerrainMap as JsonObject), Voxels: { Array: encodeVoxels(w.voxels) } };
  return stringify({ GameVersion: w.gameVersion, Timestamp: w.timestamp, Singletons: singletons, Entities: w.entities });
}

/** Decode world.json. `terrain` supplies the voxels instead of TerrainMap (the project file stores
 *  a map's terrain as heights plus its multi-run columns, and its world.json without the array). */
export function decodeWorld(text: string, tv?: { voxels: Uint8Array; layers: number }): WorldModel {
  const root = parse(text);
  if (!isObject(root)) throw new Error("world.json is not an object");
  const s = root.Singletons;
  if (!isObject(s)) throw new Error("world.json has no Singletons");
  const ms = s.MapSize;
  if (!isObject(ms) || !isObject(ms.Size)) throw new Error("world.json has no MapSize");
  const sizeX = num(ms.Size.X);
  const sizeY = num(ms.Size.Y);
  const entities = (root.Entities ?? []) as JsonValue[];
  const terrain = s.TerrainMap;
  let voxels: Uint8Array;
  let layers: number;
  let legacy = false;
  if (tv) {
    voxels = tv.voxels;
    layers = tv.layers;
  } else if (isObject(terrain) && isObject(terrain.Voxels)) {
    voxels = decodeVoxels(String(terrain.Voxels.Array));
    if (voxels.length % (sizeX * sizeY)) throw new Error(`voxel count ${voxels.length} is not a multiple of ${sizeX}x${sizeY}`);
    layers = voxels.length / (sizeX * sizeY);
  } else if (isObject(terrain) && isObject(terrain.Heights)) {
    // 0.6 maps: Heights[y*X + x] is the surface layer (FORMAT.md §4.3)
    const heights = new Uint8Array(String(terrain.Heights.Array).split(" ").map(Number));
    layers = LAYERS;
    voxels = voxelsFromHeights(heights, sizeX, sizeY, layers);
    legacy = true;
  } else {
    throw new Error("world.json has no TerrainMap");
  }
  return {
    gameVersion: String(root.GameVersion ?? ""),
    timestamp: String(root.Timestamp ?? ""),
    sizeX,
    sizeY,
    layers,
    voxels,
    singletons: s,
    entities: entities as JsonObject[],
    legacy,
  };
}

/** The soil a map stores (SoilMoistureSimulator, SoilContaminationSimulator) on each tile's top: the
 *  slot of its top column (`topSlot`, 0 on a tile of one column). Zeros where a singleton is
 *  missing or its array does not fit the map. For the 3D view's ground colours (Map look, D86). */
export function storedSoil(singletons: JsonObject, W: number, H: number, topSlot: (tile: number) => number = () => 0): { moisture: Float32Array; contamination: Float32Array } {
  const plane = W * H;
  const read = (name: string, key: string): Float32Array => {
    const out = new Float32Array(plane);
    const s = singletons[name];
    if (!isObject(s) || !isObject(s[key])) return out;
    const t = String((s[key] as JsonObject).Array).split(" ");
    if (!t.length || t.length % plane) return out;
    const slots = t.length / plane;
    for (let i = 0; i < plane; i++) out[i] = Number(t[Math.min(slots - 1, topSlot(i)) * plane + i]) || 0;
    return out;
  };
  return { moisture: read("SoilMoistureSimulator", "MoistureLevels"), contamination: read("SoilContaminationSimulator", "ContaminationLevels") };
}

/** The water a map stores (WaterMapNew, every level): one entry per wet column, with its floor
 *  (the token's fourth field; -1 when an old 3-field token has none), depth and badwater share.
 *  Empty when the singleton is missing or its array does not fit the map. */
export function storedWater(singletons: JsonObject, W: number, H: number): { tile: Int32Array; floor: Float32Array; depth: Float32Array; contamination: Float32Array } {
  const empty = { tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
  const wm = singletons.WaterMapNew;
  if (!isObject(wm) || !isObject(wm.WaterColumns)) return empty;
  const tokens = String(wm.WaterColumns.Array).split(" ");
  const plane = W * H;
  const levels = isObject(wm) && "Levels" in wm ? num(wm.Levels) : 1;
  if (tokens.length !== levels * plane) return empty;
  const tile: number[] = [];
  const floor: number[] = [];
  const depth: number[] = [];
  const contamination: number[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t === "0") continue;
    const f = t.split(":");
    const d = Number(f[0]);
    if (!(d > 0.001)) continue;
    tile.push(k % plane);
    depth.push(d);
    contamination.push(Number(f[1] ?? 0) || 0);
    floor.push(f.length >= 4 ? Number(f[3]) : -1);
  }
  return { tile: Int32Array.from(tile), floor: Float32Array.from(floor), depth: Float32Array.from(depth), contamination: Float32Array.from(contamination) };
}

/** The outflows a map stores (`ColumnOutflows`, FORMAT.md §4.3) of each tile's surface water (its
 *  highest wet level), four a tile in the simulation's order (−y, −x, +y, +x: the tokens' Bottom,
 *  Left, Top and Right; each `outflowToken`'s flow), for the view's moving water; null when the file
 *  has none that fit. */
export function storedOutflows(singletons: JsonObject, W: number, H: number): Float64Array | null {
  const wm = singletons.WaterMapNew;
  if (!isObject(wm) || !isObject(wm.WaterColumns) || !isObject(wm.ColumnOutflows)) return null;
  const plane = W * H;
  const levels = "Levels" in wm ? num(wm.Levels) : 1;
  const columns = String(wm.WaterColumns.Array).split(" ");
  const flows = String(wm.ColumnOutflows.Array).split(" ");
  if (columns.length !== levels * plane || flows.length !== columns.length) return null;
  const out = new Float64Array(plane * 4);
  for (let i = 0; i < plane; i++)
    for (let level = levels - 1; level >= 0; level--) {
      const k = level * plane + i;
      if (columns[k] === "0" || !(Number(columns[k].split(":")[0]) > 0.001)) continue;
      if (flows[k] !== "0") {
        // (each part "0" or "target|flow")
        const f = flows[k].split(":");
        for (let d = 0; d < 4; d++) out[i * 4 + d] = Number((f[d] ?? "0").split("|")[1]) || 0;
      }
      break;
    }
  return out;
}
