// Import normalization (PLAN §19.6): the one-time changes that turn any map the game can load
// (0.6 heightmaps, 0.7, 1.0, 1.1) into a native 1.1 map, each listed for the player. Every rule
// is the game's own load-time migration, applied once in the file so the exported map loads the
// same way without it (investigation/notes/format_1_1.md, "Migrations"):
//
// - 0.6 `TerrainMap.Heights` becomes voxels;
// - more than 23 voxel layers: layers 0–21 are kept and the rest dropped, as the game does (its
//   truncation drops layer 22 too), with a warning; fewer than 23 (which crashes) are padded;
// - no `WaterSimulationMigrator`, or `IsMigrated:false`: every `SpecifiedStrength` and
//   `CurrentStrength`, and every saved outflow, is halved, then `IsMigrated:true` is written;
// - 4-field water tokens get `OldWaterDepth = WaterDepth` (3-field ones also `Floor = 0`);
// - old key shapes: enums as {"Value": …}, goods as {"Id": …}, `CoordinatesOffseter`,
//   `DryingProgress`, `TimeBomb`, the renamed templates, `MapSize.MapHeight`, missing `Size` and
//   `Levels`, and the metadata's missing `IsUnconventional`;
// - components 1.1 never reads (`DryObject`, `ContaminatedObject`,
//   `NaturalResourceModelRandomizer`) are dropped. `StartingLocationPlayer` is kept: vanilla
//   ignores it and Timber Together reads it (PLAN §20, D5, D36);
// - the version becomes the native 1.1.2.4 stamp.
//
// Everything else (unknown components and singletons, multi-slot water and moisture arrays, key
// order, float text) passes through verbatim. Faction-only plants are flagged, not removed: the
// player removes them with one click. Saves are refused.

import { F, isObject, JsonFloat, num, type JsonObject, type JsonValue } from "./json";
import { GAME_VERSION, LAYERS, numToken, type WorldModel } from "./world";
import type { TimberFile } from "./timber";
import { counted, nameOf } from "../validate/words";

export class ImportError extends Error {}

export interface ImportChange {
  id: string;
  /** warning: the map changes in a way the player should know about; info: bookkeeping. */
  level: "warning" | "info";
  message: string;
  count?: number;
}

export interface ImportFlag {
  id: string;
  message: string;
  entities: string[];
  /** A one-click fix: an edit operation (core/doc/ops.ts). */
  fix: { op: "deleteEntities"; label: string; params: { entities: string[] } };
}

export interface ImportReport {
  /** The file's own version stamp before normalization. */
  sourceVersion: string;
  changes: ImportChange[];
  flags: ImportFlag[];
}

/** Plants that exist for one faction only: they fail to load for the other faction and in the map
 *  editor (FORMAT.md §4.4). The game maps Maple and ChestnutTree to Oak and Pine only when the
 *  faction's own template is missing, so they stay flagged. */
export const FACTION_ONLY_PLANTS = new Set(["Maple", "ChestnutTree", "Mangrove", "Dandelion", "CoffeeBush", "Spadderdock", "Cattail"]);

/** TemplateNameMapper's legacy names that map for every faction. */
const TEMPLATE_RENAMES: Record<string, string> = { Barrier: "Blockage", Bramble: "Thorns", Bomb: "UnstableCore", Cactus: "Succulent" };

/** Components 1.1 never reads. */
const OBSOLETE_COMPONENTS = ["DryObject", "ContaminatedObject", "NaturalResourceModelRandomizer"];

const METADATA_KEYS: [string, JsonValue][] = [
  ["Width", 0],
  ["Height", 0],
  ["MapNameLocKey", ""],
  ["MapDescriptionLocKey", ""],
  ["MapDescription", ""],
  ["IsRecommended", false],
  ["IsUnconventional", false],
  ["IsDev", false],
];

/** A copy of `obj` with key `from` replaced by `to` (and `value`), at the same position. */
export function renameKey(obj: JsonObject, from: string, to: string, value: JsonValue = obj[from]): JsonObject {
  const out: JsonObject = {};
  for (const k in obj) {
    if (k === from) out[to] = value;
    else if (k !== to) out[k] = obj[k];
  }
  return out;
}

/** A copy of `obj` with `key: value` inserted before `before` (or at the end). */
export function insertKey(obj: JsonObject, key: string, value: JsonValue, before?: string): JsonObject {
  const out: JsonObject = {};
  let done = false;
  for (const k in obj) {
    if (k === key) continue;
    if (!done && k === before) {
      out[key] = value;
      done = true;
    }
    out[k] = obj[k];
  }
  if (!done) out[key] = value;
  return out;
}

function withoutKey(obj: JsonObject, key: string): JsonObject {
  const out: JsonObject = {};
  for (const k in obj) if (k !== key) out[k] = obj[k];
  return out;
}

class Changes {
  readonly list: ImportChange[] = [];
  private readonly counts = new Map<string, ImportChange>();
  add(id: string, level: ImportChange["level"], message: string): void {
    this.list.push({ id, level, message });
  }
  /** One line per kind, with a count. */
  count(id: string, level: ImportChange["level"], message: (n: number) => string, n = 1): void {
    const c = this.counts.get(id);
    if (c) {
      c.count = (c.count ?? 0) + n;
      c.message = message(c.count);
    } else {
      const fresh = { id, level, message: message(n), count: n };
      this.counts.set(id, fresh);
      this.list.push(fresh);
    }
  }
}

// ------------------------------------------------------------------------------------------ terrain

function normalizeTerrain(w: WorldModel, ch: Changes): void {
  const plane = w.sizeX * w.sizeY;
  if (w.legacy) {
    const tm = w.singletons.TerrainMap as JsonObject;
    const out: JsonObject = {};
    for (const k in tm) {
      if (k === "Heights") out.Voxels = { Array: "" };
      else out[k] = tm[k];
    }
    w.singletons.TerrainMap = out;
    w.legacy = false;
    ch.add("terrain.heights", "info", "Converted the old terrain format to the current one");
  }
  if (w.layers > LAYERS) {
    // the game copies X·Y·22 values and warns "Terrain data height exceeds map size, truncating"
    let dropped = 0;
    for (let v = (LAYERS - 1) * plane; v < w.voxels.length; v++) dropped += w.voxels[v];
    const vox = new Uint8Array(plane * LAYERS);
    vox.set(w.voxels.subarray(0, plane * (LAYERS - 1)));
    ch.add(
      "terrain.layers",
      "warning",
      `The map has ${w.layers} terrain layers, the game keeps ${LAYERS - 1}: dropped ${counted(dropped, "block")} of ground above them`,
    );
    w.voxels = vox;
    w.layers = LAYERS;
  } else if (w.layers < LAYERS) {
    const vox = new Uint8Array(plane * LAYERS);
    vox.set(w.voxels);
    ch.add("terrain.layers", "warning", `The map has only ${w.layers} terrain layers: added empty ones up to ${LAYERS}`);
    w.voxels = vox;
    w.layers = LAYERS;
  }
  const ms = w.singletons.MapSize as JsonObject;
  if ("MapHeight" in ms) {
    w.singletons.MapSize = withoutKey(ms, "MapHeight");
    ch.add("mapsize.mapheight", "info", "Dropped an old height setting the game ignores");
  }
}

// -------------------------------------------------------------------------------------------- water

/** "d:c:o" → "d:c:o:0:d"; "d:c:o:f" → "d:c:o:f:d". */
function fiveFieldToken(t: string): string {
  if (t === "0") return t;
  const parts = t.split(":");
  if (parts.length === 4) return `${t}:${parts[0]}`;
  if (parts.length === 3) return `${t}:0:${parts[0]}`;
  return t;
}

function halveFlowPart(p: string): string {
  if (p === "0") return p;
  const bar = p.indexOf("|");
  if (bar < 0) return p;
  const v = Number(p.slice(bar + 1));
  return `${p.slice(0, bar)}|${numToken(v * 0.5)}`;
}

function normalizeWater(w: WorldModel, ch: Changes): void {
  const s = w.singletons;
  const wm = s.WaterMapNew;
  if (isObject(wm) && isObject(wm.WaterColumns)) {
    const text = String(wm.WaterColumns.Array);
    const tokens = text.split(" ");
    let changed = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "0") continue;
      const f = fiveFieldToken(t);
      if (f !== t) {
        tokens[i] = f;
        changed++;
      }
    }
    if (changed) {
      s.WaterMapNew = { ...wm, WaterColumns: { ...wm.WaterColumns, Array: tokens.join(" ") } };
      ch.add("water.tokens", "info", `Updated ${counted(changed, "water column")} to the current format`);
    }
  }
  const mig = s.WaterSimulationMigrator;
  const migrated = isObject(mig) && mig.IsMigrated === true;
  if (!migrated) {
    // WaterSimulationMigrator.MigrateWaterSources and MigrateOutflows: × 0.5
    let sources = 0;
    for (let k = 0; k < w.entities.length; k++) {
      const e = w.entities[k];
      const comps = e.Components;
      if (!isObject(comps) || !isObject(comps.WaterSource)) continue;
      const ws = comps.WaterSource;
      const half: JsonObject = {};
      for (const key in ws) {
        const v = ws[key];
        half[key] = (key === "SpecifiedStrength" || key === "CurrentStrength") && (typeof v === "number" || v instanceof JsonFloat) ? F(num(v) * 0.5) : v;
      }
      w.entities[k] = { ...e, Components: { ...comps, WaterSource: half } };
      sources++;
    }
    const wm2 = s.WaterMapNew;
    let flows = 0;
    if (isObject(wm2) && isObject(wm2.ColumnOutflows)) {
      const tokens = String(wm2.ColumnOutflows.Array).split(" ");
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === "0") continue;
        tokens[i] = tokens[i].split(":").map(halveFlowPart).join(":");
        flows++;
      }
      if (flows) s.WaterMapNew = { ...wm2, ColumnOutflows: { ...wm2.ColumnOutflows, Array: tokens.join(" ") } };
    }
    if (isObject(mig)) s.WaterSimulationMigrator = { ...mig, IsMigrated: true };
    else w.singletons = insertKey(s, "WaterSimulationMigrator", { IsMigrated: true }, "WaterMapNew" in s ? "WaterMapNew" : undefined);
    ch.add(
      "water.migrator",
      "warning",
      `Made before Timberborn 1.0: halved the strength of ${counted(sources, "water source")}` + (flows ? ` and ${counted(flows, "saved water flow")}` : "") + ", as the game does on loading",
    );
  }
  // optional keys the loader defaults: write them the way the game saves them
  const sz = (key: string, field: string) => {
    const o = w.singletons[key];
    if (isObject(o) && !(field in o)) {
      w.singletons[key] = insertKey(o, field, 1, Object.keys(o)[0]);
      ch.count("singletons.defaults", "info", (n) => `Filled in ${counted(n, "missing size setting")}`);
    }
  };
  sz("SoilMoistureSimulator", "Size");
  sz("SoilContaminationSimulator", "Size");
  sz("WaterEvaporationMap", "Levels");
}

// ----------------------------------------------------------------------------------------- entities

/** {"Value": x} → x (PrimitiveTypeSerialization.DeserializeEnum, 2025-02-07). */
function unwrapValue(v: JsonValue): JsonValue {
  return isObject(v) && Object.keys(v).length === 1 && "Value" in v ? v.Value : v;
}

/** "Good":{"Id":"Log"} → "Good":"Log" anywhere below `v` (SerializedGoodValueSerializer, 2025-01-31). */
function migrateGoods(v: JsonValue, ch: Changes): JsonValue {
  if (Array.isArray(v)) return v.map((x) => migrateGoods(x, ch));
  if (!isObject(v)) return v;
  let out: JsonObject | null = null;
  for (const k in v) {
    const x = v[k];
    let y: JsonValue = x;
    if (k === "Good" && isObject(x) && Object.keys(x).length === 1 && typeof x.Id === "string") {
      y = x.Id;
      ch.count("entities.goods", "info", (n) => `Updated ${counted(n, "stored good")} to the current format`);
    } else if (isObject(x) || Array.isArray(x)) y = migrateGoods(x, ch);
    if (y !== x) {
      out ??= { ...v };
      out[k] = y;
    }
  }
  return out ?? v;
}

function normalizeEntity(e: JsonObject, ch: Changes): JsonObject {
  let entity = e;
  const t = typeof e.Template === "string" ? e.Template : "";
  if (TEMPLATE_RENAMES[t]) {
    entity = { ...entity, Template: TEMPLATE_RENAMES[t] };
    ch.count(`entities.template.${t}`, "info", (n) => `Renamed ${n} ${nameOf(t)} to ${nameOf(TEMPLATE_RENAMES[t])}, as the game does`);
  }
  const comps0 = entity.Components;
  if (!isObject(comps0)) return entity;
  let comps: JsonObject = comps0;
  const bo = comps.BlockObject;
  if (isObject(bo)) {
    let b2: JsonObject = bo;
    for (const key of ["Orientation", "Flipped"]) {
      if (key in b2) {
        const v = unwrapValue(b2[key]);
        if (v !== b2[key]) {
          b2 = { ...b2, [key]: v };
          ch.count("entities.enums", "info", (n) => `Updated ${counted(n, "object direction")} to the current format`);
        }
      }
    }
    if (b2 !== bo) comps = { ...comps, BlockObject: b2 };
  }
  if ("CoordinatesOffseter" in comps) {
    const old = comps.CoordinatesOffseter;
    if ("CoordinatesOffsetter" in comps) comps = withoutKey(comps, "CoordinatesOffseter");
    else {
      const off = isObject(old) && isObject(old.CoordinatesOffset) ? old.CoordinatesOffset : null;
      const moved = !!off && (num(off.X ?? 0) !== 0 || num(off.Y ?? 0) !== 0);
      comps = moved ? renameKey(comps, "CoordinatesOffseter", "CoordinatesOffsetter", { Random: true }) : withoutKey(comps, "CoordinatesOffseter");
    }
    ch.count("entities.offsetter", "info", (n) => `Fixed an old setting on ${counted(n, "object")}`);
  }
  const wnr = comps.WateredNaturalResource;
  if (isObject(wnr) && "DryingProgress" in wnr && !("DyingProgress" in wnr)) {
    comps = { ...comps, WateredNaturalResource: renameKey(wnr, "DryingProgress", "DyingProgress") };
    ch.count("entities.dying", "info", (n) => `Fixed an old setting on ${counted(n, "plant")}`);
  }
  if ("TimeBomb" in comps && !("UnstableCore" in comps)) {
    comps = renameKey(comps, "TimeBomb", "UnstableCore");
    ch.count("entities.timebomb", "info", (n) => `Updated ${counted(n, "unstable core")} to the current format`);
  }
  for (const key of OBSOLETE_COMPONENTS) {
    if (key in comps) {
      comps = withoutKey(comps, key);
      ch.count(`entities.obsolete.${key}`, "info", (n) => `Dropped ${counted(n, "old setting")} the game no longer reads`);
    }
  }
  comps = migrateGoods(comps, ch) as JsonObject;
  return comps === comps0 ? entity : { ...entity, Components: comps };
}

function flagFactionPlants(w: WorldModel): ImportFlag[] {
  const byTemplate = new Map<string, string[]>();
  for (const e of w.entities) {
    const t = String(e.Template);
    if (!FACTION_ONLY_PLANTS.has(t)) continue;
    const list = byTemplate.get(t) ?? [];
    list.push(String(e.Id));
    byTemplate.set(t, list);
  }
  const ids: string[] = [];
  const names: string[] = [];
  for (const [t, list] of [...byTemplate].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    ids.push(...list);
    names.push(`${list.length} ${nameOf(t)}`);
  }
  if (!ids.length) return [];
  return [
    {
      id: "entities.faction_plants",
      message: `${names.join(", ")}: plants only one faction can load`,
      entities: ids,
      fix: { op: "deleteEntities", label: "Remove the plants of one faction", params: { entities: ids } },
    },
  ];
}

// ----------------------------------------------------------------------------------------- metadata

function normalizeMetadata(md: JsonObject, ch: Changes): JsonObject {
  const missing = METADATA_KEYS.filter(([k]) => !(k in md)).map(([k]) => k);
  if (!missing.length) return md;
  const out: JsonObject = {};
  for (const [k, def] of METADATA_KEYS) out[k] = k in md ? md[k] : def;
  for (const k in md) if (!(k in out)) out[k] = md[k];
  ch.add("metadata.keys", "info", `Filled in ${counted(missing.length, "missing map detail")}`);
  return out;
}

// ------------------------------------------------------------------------------------------- import

/** True for a saved game (save_metadata.json instead of map_metadata.json). */
export function isSave(file: TimberFile): boolean {
  return file.metadata === null || file.extraFiles.some(([n]) => n.split("/").pop() === "save_metadata.json");
}

/** Normalize a freshly read map in place and report every change. Throws ImportError for saves. */
export function normalizeImport(file: TimberFile): ImportReport {
  if (isSave(file)) {
    throw new ImportError("This is a saved game, not a map. Open a map file: a .timber file from the Maps folder, or one made by Dam Good Maps.");
  }
  const w = file.world;
  const ch = new Changes();
  const sourceVersion = w.gameVersion;
  normalizeTerrain(w, ch);
  normalizeWater(w, ch);
  for (let k = 0; k < w.entities.length; k++) w.entities[k] = normalizeEntity(w.entities[k], ch);
  for (const key in w.singletons) {
    const v = w.singletons[key];
    if (key !== "TerrainMap" && key !== "WaterMapNew" && (isObject(v) || Array.isArray(v))) w.singletons[key] = migrateGoods(v, ch);
  }
  file.metadata = normalizeMetadata(file.metadata!, ch);
  const versionLine = file.versionTxt.split(/\r?\n/)[0].trim();
  if (w.gameVersion !== GAME_VERSION || versionLine !== GAME_VERSION || file.versionTxt !== GAME_VERSION + "\r\n") {
    ch.add("file.version", "info", `Updated to Timberborn ${GAME_VERSION} (it was ${sourceVersion || "unversioned"})`);
    w.gameVersion = GAME_VERSION;
    file.versionTxt = GAME_VERSION + "\r\n";
  }
  return { sourceVersion, changes: ch.list, flags: flagFactionPlants(w) };
}
