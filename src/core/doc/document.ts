// The map document (EDITOR_PLAN §3, PLAN §19.6) and its project file (`.damgoodmaps.json`, the
// document as JSON, gzip-compressed).
//
// A document is a generation plus an edit log:
// - the generation: the spec (null for imported maps), the features the generator planned
//   (`baseFeatures`), what an old regeneration kept under a lock (`kept`; locks and the retired
//   regenerateRegion operation were removed, D253, D270, but an old project's kept content still
//   opens as it was), and the built `base`: the generated map, or the imported file after
//   normalization, stored whole and never mutated, so a document opens exactly even after the
//   generator has changed (PLAN §19.7);
// - the log: every applied edit operation, oldest first, with its undo data (ops.ts).
// `features` is the current state, the log applied to the generation. It is stored for readers of
// the file (the Python validator reads `spec` and `features`) and checked against the log when the
// file is opened. `dropRetired` migrates a project file that still holds a lock, a `setLock` or
// `regenerateRegion` operation, a "stamp" origin or one of the editor's retired set pieces (all
// removed): they are dropped or converted quietly, and the land the saved map holds stays as it was.
// `upgradeCarves` turns a project's `carve` operations, from before the forces shared `forceResult`
// (D220), into that one; they build exactly as they did.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Feature } from "../features/schema";
import type { BuildResult } from "../features/build";
import { readTimber, type TimberFile } from "../format/timber";
import { normalizeImport, type ImportReport } from "../format/normalize";
import type { Runs } from "../math/grid";
import { GENERATOR_VERSION, upgradeHighestTerrain, upgradeMineSites, upgradeRetiredFields, upgradeSpec, upgradeVariety, upgradeVerticality, type Difficulty, type MapSpec } from "../spec/mapspec";
import { jsonEqual } from "../spec/mergepatch";
import { validateFeatures, validateSpec } from "../spec/schema";
import { description, fileName, mapName, namedFile, toTimberFile } from "../gen/pack";
import { baseFromFile, runsOfColumns, type BaseMap } from "./base";
import type { TerrainData } from "../terrain/runs";
import { forceOfCarve, type SavedCarve } from "../forces/op";
import { replay, type AppliedOp } from "./ops";
import type { StoredState } from "./stored";

export { fromBase64, toBase64 } from "../format/base64";

/** Format 3 (M9a): the terrain as heights plus runs (D119, I-1), and a generated map's field. */
export const DOCUMENT_FORMAT_VERSION = 3;

export interface DocMeta {
  name: string;
  premise: string;
  designedFor: Difficulty;
  /** The app version that made or last changed the document. */
  appVersion?: string;
  /** A seed typed as a word: the saved file is named with it (D345, B10); the spec holds its number. */
  seedWord?: string;
  /** The name the generator gave the map (M9b, D278 (1b)): until the player renames it (D443), the map
   *  is saved under its theme and seed (D345, B10). */
  generatedName?: string;
  /** An imported map: its file name and what normalization changed (PLAN §19.6). */
  source?: { fileName: string; report: ImportReport };
  /** Set by the app when it saves (ISO 8601); never part of a build. */
  created?: string;
  modified?: string;
  /** The editor's camera bookmarks (D205): a view per slot 1–9; never part of a build. */
  views?: SavedView[];
}

/** A camera bookmark: where the editor's view was, in the renderer's terms. */
export interface SavedView {
  slot: number;
  mode: "orbit" | "top";
  yaw: number;
  pitch: number;
  distance: number;
  target: [number, number, number];
}

/** What an old regeneration kept of the previous generation under a lock: locks and the retired
 *  regenerateRegion operation were removed (D253, D270), but an old project's kept content still
 *  opens as it was saved. */
export interface KeptContent {
  /** The locked tiles when the map was regenerated. */
  runs: Runs;
  /** Their surface, one byte per tile in run order, base64. */
  heights: string;
  /** The generated objects kept there, as world.json entities (exact text). */
  entities: string;
  /** The feature that placed each of them. */
  owners: string[];
  /** The kept tiles that are not one plain run from z = 0, with their solid runs (format 3, so a
   *  lock keeps a cave; none on the maps M9's generator makes). */
  solid?: [number, number[]][];
}

/** The land a generation's processes made (M9a, docs/m9-design.md §12): the build starts from it,
 *  so rebuilding a document never runs the processes again. */
export interface FieldData extends TerrainData {
  /** The features read back from it (rivers, lakes, badwater hollows): they describe the field's
   *  ground and do not shape it again. */
  contains: string[];
  /** The natural ramps' steps as low tile, high tile pairs, flattened: slope targets (#62). */
  ramps?: number[];
  /** A tall map's top (Verticality 70+): edits may raise the ground to it. */
  top?: number;
  /** Sources: None (D330): where the soil was moist and contaminated as generated, as tile runs;
   *  the build then places none of the features' sources (features/build.ts `GeneratedField`). */
  dry?: { moist: Runs; poisoned: Runs };
}

export interface MapDocument {
  formatVersion: 3;
  app: "dam-good-maps";
  /** The generator that built `base` (for an import: the app version that normalized it). */
  generatorVersion: string;
  /** The spec, with `accepted` filled in; null for imported maps. */
  spec: MapSpec | null;
  base: BaseMap;
  /** A generated map's field (M9a); absent for imported maps and older generations. */
  field?: FieldData | null;
  /** The features `base` was built from; absent in the file when they equal `features`. */
  baseFeatures?: Feature[];
  kept: KeptContent | null;
  /** Current features: `baseFeatures` with the log applied. */
  features: Feature[];
  /** The edit log: applied operations, oldest first. */
  edits: AppliedOp[];
  /** The next operation's `seq`. */
  nextSeq: number;
  meta: DocMeta;
  /** The map as it was when the project was saved (Startup part 1, D367, D455; stored.ts): the
   *  session opens from it without rebuilding. Absent in older files and in projects saved while
   *  their water was still pending, which open by rebuilding. */
  stored?: StoredState;
}

export function baseFeaturesOf(doc: MapDocument): Feature[] {
  return doc.baseFeatures ?? doc.features;
}

/** The document of a freshly generated map (PLAN §7.10 `toDocument`). */
export function toDocument(spec: MapSpec, features: Feature[], built: BuildResult, file: TimberFile = toTimberFile(spec, built), field: FieldData | null = null, seedWord?: string): MapDocument {
  return {
    formatVersion: 3,
    app: "dam-good-maps",
    generatorVersion: spec.generatorVersion,
    spec,
    base: baseFromFile(file, "generated", built.entities.map((e) => e.owner)),
    ...(field ? { field } : {}),
    kept: null,
    features,
    edits: [],
    nextSeq: 1,
    meta: { name: mapName(spec), premise: description(spec), designedFor: spec.designedFor, appVersion: GENERATOR_VERSION, ...(seedWord ? { seedWord } : {}) },
  };
}

/** The document of a map the generator just made, with its field (format 3). */
export function generatedDocument(r: { spec: MapSpec; features: Feature[]; built: BuildResult; file?: TimberFile; field?: FieldData | null; seedWord?: string; name?: string; description?: string }): MapDocument {
  const doc = toDocument(r.spec, r.features, r.built, r.file ?? toTimberFile(r.spec, r.built), r.field ?? null, r.seedWord);
  // (M9b, D278 (1b): a generated map keeps its own name and how it plays)
  if (r.name) doc.meta.name = doc.meta.generatedName = r.name;
  if (r.description) doc.meta.premise = r.description;
  return doc;
}

/** The document of an imported map: normalized once, with the changes listed (PLAN §19.6).
 *  Throws ImportError for saves. */
export function importDocument(bytes: Uint8Array, fileName: string): MapDocument {
  const file = readTimber(bytes);
  const report = normalizeImport(file);
  const name = fileName.replace(/^.*[\\/]/, "").replace(/\.timber$/i, "") || "Imported map";
  const md = file.metadata ?? {};
  return {
    formatVersion: 3,
    app: "dam-good-maps",
    generatorVersion: GENERATOR_VERSION,
    spec: null,
    base: baseFromFile(file, "import"),
    kept: null,
    features: [],
    edits: [],
    nextSeq: 1,
    meta: {
      name,
      premise: typeof md.MapDescription === "string" ? md.MapDescription : "",
      designedFor: "normal",
      appVersion: GENERATOR_VERSION,
      source: { fileName: fileName.replace(/^.*[\\/]/, ""), report },
    },
  };
}

// ------------------------------------------------------------------------------- project file

/** The project file's bytes. `level` is the gzip level (9 for downloads; autosave may use a
 *  faster one): the JSON inside is the same either way. */
export function encodeProject(doc: MapDocument, level = 9): Uint8Array {
  const out: MapDocument = { ...doc };
  if (doc.baseFeatures && jsonEqual(doc.baseFeatures, doc.features)) delete out.baseFeatures;
  return gzipSync(strToU8(JSON.stringify(out)), { level: level as 9, mtime: 0 });
}

export class ProjectError extends Error {}

interface DocumentV1 {
  formatVersion: 1;
  app: "dam-good-maps";
  generatorVersion: string;
  spec: MapSpec | null;
  base: { sizeX: number; sizeY: number; heights: string };
  features: Feature[];
  meta: { name: string; premise: string; designedFor: Difficulty };
}

/** A retired-content note, stashed on a decoded document for `MapSession` to read once and turn
 *  into a quiet notice; never part of the document type, never saved back. */
export interface RetiredNotes {
  __retiredNotes?: string[];
}

/** An old project may hold a lock, a `setLock` or `regenerateRegion` operation, or a "stamp"
 *  origin: all removed (D253, D270); or one of the editor's retired set pieces (D462,
 *  `dropRetiredPieces`). Dropped or converted here, quietly; the land they held stays as it was
 *  saved (`kept` and the stored `base` are untouched). Mutates `raw` in place; returns a note for
 *  each thing changed. */
function dropRetired(raw: Record<string, unknown>): string[] {
  const notes: string[] = [];
  // (a spec's locks went with its constraints and requested set pieces, which nothing read)
  upgradeRetiredFields(raw.spec);
  if ("locks" in raw) {
    const locks = raw.locks;
    delete raw.locks;
    if (Array.isArray(locks) && locks.length) notes.push("This project held a lock, which is no longer a feature. Its land stays as it was.");
  }
  const edits = raw.edits;
  if (Array.isArray(edits)) {
    const before = edits.length;
    const kept = edits.filter((e: { op?: string }) => e?.op !== "setLock" && e?.op !== "regenerateRegion");
    if (kept.length !== before) {
      raw.edits = kept;
      notes.push("This project held a lock or a setLock/regenerateRegion edit, which are no longer features. Its land stays as it was.");
    }
  }
  let stamped = false;
  for (const list of [raw.baseFeatures, raw.features]) {
    if (!Array.isArray(list)) continue;
    for (const f of list) if (f && typeof f === "object" && (f as { origin?: string }).origin === "stamp") {
      (f as { origin?: string }).origin = "user";
      stamped = true;
    }
  }
  if (stamped) notes.push("This project held features placed by the stamp tool, which is no longer a feature. They open as the player's own.");
  const pieces = dropRetiredPieces(raw);
  if (pieces) notes.push(pieces);
  return notes;
}

/** The editor's set pieces retired with its drawing tools (D462), and what the note calls each. */
const RETIRED_PIECES: Record<string, string> = {
  waterfall: "a waterfall",
  damSite: "a dam site",
  gorge: "a gorge",
  terracedCliffs: "terraced cliffs",
  plugSpillway: "a plugged spillway",
  naturalNarrows: "a natural narrows",
};

/** An old project may hold one of the editor's retired set pieces (D462): it is left out of the
 *  generation's features, the current ones and the log (the operations that added, changed, moved
 *  or deleted it), and a river's bed step keeps its drop but no longer names it. The land a stored
 *  map holds stays as it was saved (an older generation's map, `MapSession`'s frozen mode); a piece
 *  the build made (one the player placed) no longer builds, its ground and its sources gone. Mutates
 *  `raw`; returns the note, or null when there was none. */
function dropRetiredPieces(raw: Record<string, unknown>): string | null {
  const retired = (f: unknown): f is { id: string; params: { kind: string } } => {
    const g = f as { kind?: unknown; id?: unknown; params?: { kind?: unknown } } | null;
    return !!g && g.kind === "setPiece" && typeof g.id === "string" && typeof g.params?.kind === "string" && g.params.kind in RETIRED_PIECES;
  };
  const ids = new Set<string>();
  const kinds = new Set<string>();
  const edits = Array.isArray(raw.edits) ? (raw.edits as { op?: string; params?: { id?: unknown; feature?: unknown } }[]) : [];
  for (const f of [...(Array.isArray(raw.baseFeatures) ? raw.baseFeatures : []), ...(Array.isArray(raw.features) ? raw.features : []), ...edits.map((e) => (e?.op === "addFeature" ? e.params?.feature : null))]) {
    if (!retired(f)) continue;
    ids.add(f.id);
    kinds.add(f.params.kind);
  }
  if (!ids.size) return null;
  for (const key of ["baseFeatures", "features"]) if (Array.isArray(raw[key])) raw[key] = (raw[key] as unknown[]).filter((f) => !retired(f));
  if (Array.isArray(raw.edits))
    raw.edits = edits.filter((e) => {
      if (e?.op === "addFeature") return !retired(e.params?.feature);
      if (e?.op === "updateFeature" || e?.op === "deleteFeature" || e?.op === "reorderFeature") return !ids.has(e.params?.id as string);
      return true;
    });
  // a river's bed step that an on-river piece put there keeps its drop, without the piece's name
  const unlink = (v: unknown): void => {
    if (Array.isArray(v)) for (const x of v) unlink(x);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.setPiece === "string" && ids.has(o.setPiece)) delete o.setPiece;
      for (const k of Object.keys(o)) unlink(o[k]);
    }
  };
  unlink(raw.baseFeatures);
  unlink(raw.features);
  unlink(raw.edits);
  const names = [...kinds].map((k) => RETIRED_PIECES[k]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `This project held ${list}, which the editor no longer makes. ${ids.size > 1 ? "They are" : "It is"} left out; land the saved map holds stays as it was.`;
}

/** A project saved before D220 keeps its carves as the `carve` operation: each becomes the forces'
 *  one operation, `forceResult` (forces/op.ts `forceOfCarve`, the conversion the build always made of
 *  it), in the log and in a Try another's undo data. Quiet: the map is the same. Mutates `raw`. */
function upgradeCarves(raw: Record<string, unknown>): void {
  const upgrade = (op: unknown) => {
    const o = op as { op?: string; params?: unknown } | null;
    if (o?.op === "carve" && o.params && typeof o.params === "object") {
      o.op = "forceResult";
      o.params = forceOfCarve(o.params as SavedCarve);
    }
  };
  if (!Array.isArray(raw.edits)) return;
  for (const e of raw.edits as { undo?: { replaced?: { op?: unknown } } }[]) {
    upgrade(e);
    upgrade(e?.undo?.replaced?.op);
  }
}

/** Open a project file. Version 1 files (M1, M2) hold the spec, the features and the heights; they
 *  open with a base that has no stored map, and the session rebuilds it from the features. */
export function decodeProject(bytes: Uint8Array): MapDocument {
  let text: string;
  try {
    text = bytes[0] === 0x1f && bytes[1] === 0x8b ? strFromU8(gunzipSync(bytes)) : strFromU8(bytes);
  } catch {
    throw new ProjectError("not a Dam Good Maps project file");
  }
  let raw: { app?: string; formatVersion?: number };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("not a Dam Good Maps project file");
  }
  if (raw.app !== "dam-good-maps") throw new ProjectError("not a Dam Good Maps project file");
  const notes = dropRetired(raw as Record<string, unknown>);
  upgradeCarves(raw as Record<string, unknown>);
  // a spec saved before D164 counts starting trees; it opens with the same wood in logs
  upgradeSpec((raw as { spec?: unknown }).spec);
  // a spec saved before every map had two mine sites may ask for fewer; it opens asking for two
  upgradeMineSites((raw as { spec?: unknown }).spec);
  // a spec saved before M9a has no Verticality: it opens with its theme's default
  upgradeVerticality((raw as { spec?: unknown }).spec);
  // a spec saved before M9b has no Variety: it opens with the default
  upgradeVariety((raw as { spec?: unknown }).spec);
  // a tall map's spec saved before 0.8.0 (M9b) with Highest terrain at 16 meant no cap (item 36)
  upgradeHighestTerrain((raw as { spec?: unknown }).spec);
  if (raw.formatVersion === 1) return fromV1(raw as unknown as DocumentV1);
  if (raw.formatVersion === 2) fromV2(raw as unknown as Record<string, unknown>);
  else if (raw.formatVersion !== 3) throw new ProjectError(`project file format ${String(raw.formatVersion)} is newer than this app understands`);
  const doc = raw as MapDocument;
  // a stored map that is not one (a hand-edited file) is left out: the project opens by rebuilding
  if ("stored" in doc && (!doc.stored || typeof doc.stored !== "object")) delete doc.stored;
  // a project saved without a stored name opens with the name it has always had (D382)
  const meta = ((doc as { meta?: Partial<DocMeta> }).meta ??= {} as DocMeta);
  if (typeof meta.name !== "string" || !meta.name.trim()) meta.name = meta.generatedName ?? (doc.spec ? mapName(doc.spec) : "Imported map");
  checkDocument(doc);
  if (notes.length) (doc as MapDocument & RetiredNotes).__retiredNotes = notes;
  return doc;
}

/** A format 2 file: its base's columns become runs (the same voxels). Changes it in place. */
function fromV2(doc: Record<string, unknown>): void {
  const base = doc.base as Record<string, unknown> | undefined;
  if (!base || typeof base !== "object") throw new ProjectError("the project file is damaged: it has no base");
  const cols = base.columns;
  if (cols !== undefined && !Array.isArray(cols)) throw new ProjectError("the project file is damaged: its base columns are not a list");
  base.runs = runsOfColumns((cols ?? []) as [number, string][]);
  delete base.columns;
  doc.formatVersion = 3;
}

function fromV1(v1: DocumentV1): MapDocument {
  return {
    formatVersion: 3,
    app: "dam-good-maps",
    generatorVersion: v1.generatorVersion,
    spec: v1.spec,
    base: { source: "generated", sizeX: v1.base.sizeX, sizeY: v1.base.sizeY, heights: v1.base.heights, runs: [], world: null, metadata: "{}", thumbnail: null, versionTxt: "" },
    kept: null,
    features: v1.features,
    edits: [],
    nextSeq: 1,
    meta: { ...v1.meta },
  };
}

/** The stored current state must be the log applied to the generation. */
export function checkDocument(doc: MapDocument): void {
  const bad = [...(doc.spec ? validateSpec(doc.spec) : []), ...validateFeatures(baseFeaturesOf(doc)), ...validateFeatures(doc.features)];
  if (bad.length) throw new ProjectError(`the project file is damaged: ${bad[0].path || "/"} ${bad[0].message}`);
  const { state } = replay(baseFeaturesOf(doc), doc.edits);
  if (!jsonEqual(state.features, doc.features)) throw new ProjectError("the project file is damaged: its features do not match its edits");
  const top = doc.edits.reduce((m, e) => Math.max(m, e.seq), 0);
  if (doc.nextSeq <= top) throw new ProjectError("the project file is damaged: its edits are numbered past nextSeq");
}

/** The document as it stood after its first `edits` operations (the save point of a stored map):
 *  the log cut there, the features replayed to it. For the replay comparison of a project whose
 *  log grew since it was opened (D455). */
export function documentAt(doc: MapDocument, edits: number): MapDocument {
  if (edits >= doc.edits.length) return doc;
  const cut = doc.edits.slice(0, edits);
  const { state } = replay(baseFeaturesOf(doc), cut);
  const { stored: _s, ...rest } = doc;
  return { ...rest, baseFeatures: baseFeaturesOf(doc), features: state.features, edits: cut };
}

/** A map's name as the player typed it, trimmed; an empty one is refused with a one-line reason (D443). */
export type NameResult = { ok: true; name: string } | { ok: false; reason: string };
export function cleanMapName(name: string): NameResult {
  const t = name.trim();
  return t ? { ok: true, name: t } : { ok: false, reason: "A map needs a name" };
}

/** Whether a map's name is no longer the one it was given: a generated map's own name (its theme's)
 *  keeps its seed-based file name; a renamed one is named like any named map (D443). */
export function isRenamed(spec: MapSpec | null, name: string, generatedName?: string): boolean {
  return !spec || (name !== mapName(spec) && name !== generatedName);
}

/** The project file's name: the map's saved name (D345, B10) with its own extension. */
export function projectFileName(spec: MapSpec, seedWord?: string): string {
  return fileName(spec, seedWord).replace(/\.timber$/, ".damgoodmaps.json");
}

/** The project file's name for any document. */
export function documentFileName(doc: MapDocument): string {
  return doc.spec && !isRenamed(doc.spec, doc.meta.name, doc.meta.generatedName) ? projectFileName(doc.spec, doc.meta.seedWord) : namedFile(doc.meta.name).replace(/\.timber$/, ".damgoodmaps.json");
}
