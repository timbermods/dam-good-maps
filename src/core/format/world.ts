// world.json in memory (FORMAT.md §4). Terrain voxels live in a Uint8Array (index z·X·Y + y·X + x,
// 1 = solid); every other singleton and every entity is kept as parsed JSON, so unknown data passes
// through untouched and an unedited file re-serializes byte for byte.

import { F, formatFloat, isObject, num, parse, stringify, type JsonObject, type JsonValue } from "./json";

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

/** The description with the tall note when the map is tall, and without it when it isn't. */
export function withTallNote(description: string, tall: boolean): string {
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

export interface SettledState {
  /** Surface (water column floor) per tile. */
  floor: Uint8Array;
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  /** Cluster saturation of the water (for the evaporation modifiers). */
  sat: ArrayLike<number>;
}

/** Simulation singletons holding settled water, the way official maps ship (FORMAT.md §4.3): one
 *  water column per tile (slot 0, a heightfield), `depth:contamination:0:floor:depth` tokens,
 *  outflows 0 (momentum rebuilds within a few ticks), soil moisture and contamination at steady
 *  state, and the evaporation modifiers of the settled water. Depths under 1e-6 are written as dry. */
export function settledSimulationSingletons(sizeX: number, sizeY: number, st: SettledState): JsonObject {
  const n = sizeX * sizeY;
  const s = emptySimulationSingletons(sizeX, sizeY, 1);
  const water: string[] = new Array(n);
  const moist: string[] = new Array(n);
  const soil: string[] = new Array(n);
  const evap: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const d = st.depth[i];
    if (d > 1e-6) {
      const ds = numToken(d);
      const c = st.contamination[i];
      water[i] = `${ds}:${c > 1e-6 ? numToken(c) : "0"}:0:${st.floor[i]}:${ds}`;
    } else water[i] = "0";
    moist[i] = numToken(st.moisture[i]);
    soil[i] = numToken(st.soilContamination[i]);
    const sat = st.sat[i];
    if (sat > 0) {
      const t = 10 - sat;
      evap[i] = numToken(0.0595 * (t * t) + 0.101 * t + 0.72);
    } else evap[i] = "1";
  }
  (s.WaterMapNew as JsonObject).WaterColumns = { Array: water.join(" ") };
  (s.WaterEvaporationMap as JsonObject).EvaporationModifiers = { Array: evap.join(" ") };
  (s.SoilMoistureSimulator as JsonObject).MoistureLevels = { Array: moist.join(" ") };
  const soilText = soil.join(" ");
  (s.SoilContaminationSimulator as JsonObject).ContaminationCandidates = { Array: soilText };
  (s.SoilContaminationSimulator as JsonObject).ContaminationLevels = { Array: soilText };
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

/** The outflows a file stores for the water on each tile's first column (`WaterMapNew.ColumnOutflows`,
 *  FORMAT.md §4.3: `"0"` or `Bottom:Left:Top:Right`, each part `"0"` or `targetIndex|flow` with the
 *  target in the game's grid padded by one tile), four per tile in the simulation's order (−y, −x,
 *  +y, +x, as `WaterSim.out` holds them); a flow to anywhere but the tile's own neighbour on the
 *  same column is left out. Null when the file stores none. */
export function storedOutflows(singletons: JsonObject, W: number, H: number): Float64Array | null {
  const wm = singletons.WaterMapNew;
  if (!isObject(wm) || !isObject(wm.ColumnOutflows)) return null;
  const tokens = String(wm.ColumnOutflows.Array).split(" ");
  const plane = W * H;
  if (tokens.length < plane) return null;
  const out = new Float64Array(4 * plane);
  const stride = W + 2;
  let any = false;
  for (let i = 0; i < plane; i++) {
    const t = tokens[i];
    if (t === "0") continue;
    const x = i % W;
    const y = (i - x) / W;
    const want = [(y - 1 + 1) * stride + x + 1, (y + 1) * stride + x, (y + 2) * stride + x + 1, (y + 1) * stride + x + 2];
    const parts = t.split(":");
    for (let k = 0; k < 4 && k < parts.length; k++) {
      const p = parts[k];
      if (p === "0") continue;
      const [target, flow] = p.split("|");
      const v = Number(flow);
      if (Number(target) !== want[k] || !(v > 0)) continue;
      out[4 * i + k] = v;
      any = true;
    }
  }
  return any ? out : null;
}
