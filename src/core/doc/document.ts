// The map document (EDITOR_PLAN §3, PLAN §19.6) and its project file (`.damgoodmaps.json`, the
// document as JSON, gzip-compressed).
//
// A document is a generation plus an edit log:
// - the generation: the spec (null for imported maps), the features the generator planned
//   (`baseFeatures`), what a regeneration kept under locks (`kept`), and the built `base`: the
//   generated map, or the imported file after normalization, stored whole and never mutated, so a
//   document opens exactly even after the generator has changed (PLAN §19.7);
// - the log: every applied edit operation, oldest first, with its undo data (ops.ts).
// `features` and `locks` are the current state, the log applied to the generation. They are
// stored for readers of the file (the Python validator reads `spec` and `features`) and checked
// against the log when the file is opened.

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Feature } from "../features/schema";
import type { BuildResult } from "../features/build";
import { readTimber, type TimberFile } from "../format/timber";
import { normalizeImport, type ImportReport } from "../format/normalize";
import type { Runs } from "../math/grid";
import { GENERATOR_VERSION, upgradeMineSites, upgradeSpec, type Difficulty, type MapSpec } from "../spec/mapspec";
import { jsonEqual } from "../spec/mergepatch";
import { validateFeatures, validateSpec } from "../spec/schema";
import { description, mapName, toTimberFile } from "../gen/pack";
import { baseFromFile, type BaseMap } from "./base";
import { replay, type AppliedOp, type Lock } from "./ops";

export { fromBase64, toBase64 } from "../format/base64";

export const DOCUMENT_FORMAT_VERSION = 2;

export interface DocMeta {
  name: string;
  premise: string;
  designedFor: Difficulty;
  /** The app version that made or last changed the document. */
  appVersion?: string;
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

/** What a regeneration kept of the previous generation under locks (EDITOR_PLAN §3). */
export interface KeptContent {
  /** The locked tiles when the map was regenerated. */
  runs: Runs;
  /** Their surface, one byte per tile in run order, base64. */
  heights: string;
  /** The generated objects kept there, as world.json entities (exact text). */
  entities: string;
  /** The feature that placed each of them. */
  owners: string[];
}

export interface MapDocument {
  formatVersion: 2;
  app: "dam-good-maps";
  /** The generator that built `base` (for an import: the app version that normalized it). */
  generatorVersion: string;
  /** The spec, with `accepted` filled in; null for imported maps. */
  spec: MapSpec | null;
  base: BaseMap;
  /** The features `base` was built from; absent in the file when they equal `features`. */
  baseFeatures?: Feature[];
  kept: KeptContent | null;
  /** Current features: `baseFeatures` with the log applied. */
  features: Feature[];
  /** The edit log: applied operations, oldest first. */
  edits: AppliedOp[];
  /** Current locks (from the log's setLock operations). */
  locks: Lock[];
  /** The next operation's `seq`. */
  nextSeq: number;
  meta: DocMeta;
}

export function baseFeaturesOf(doc: MapDocument): Feature[] {
  return doc.baseFeatures ?? doc.features;
}

/** The document of a freshly generated map (PLAN §7.10 `toDocument`). */
export function toDocument(spec: MapSpec, features: Feature[], built: BuildResult, file: TimberFile = toTimberFile(spec, built)): MapDocument {
  return {
    formatVersion: 2,
    app: "dam-good-maps",
    generatorVersion: spec.generatorVersion,
    spec,
    base: baseFromFile(file, "generated", built.entities.map((e) => e.owner)),
    kept: null,
    features,
    edits: [],
    locks: [],
    nextSeq: 1,
    meta: { name: mapName(spec), premise: description(spec), designedFor: spec.designedFor, appVersion: GENERATOR_VERSION },
  };
}

/** The document of an imported map: normalized once, with the changes listed (PLAN §19.6).
 *  Throws ImportError for saves. */
export function importDocument(bytes: Uint8Array, fileName: string): MapDocument {
  const file = readTimber(bytes);
  const report = normalizeImport(file);
  const name = fileName.replace(/^.*[\\/]/, "").replace(/\.timber$/i, "") || "Imported map";
  const md = file.metadata ?? {};
  return {
    formatVersion: 2,
    app: "dam-good-maps",
    generatorVersion: GENERATOR_VERSION,
    spec: null,
    base: baseFromFile(file, "import"),
    kept: null,
    features: [],
    edits: [],
    locks: [],
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
  // a spec saved before D164 counts starting trees; it opens with the same wood in logs
  upgradeSpec((raw as { spec?: unknown }).spec);
  // a spec saved before every map had a mine site may ask for none; it opens asking for one
  upgradeMineSites((raw as { spec?: unknown }).spec);
  if (raw.formatVersion === 1) return fromV1(raw as unknown as DocumentV1);
  if (raw.formatVersion !== 2) throw new ProjectError(`project file format ${String(raw.formatVersion)} is newer than this app understands`);
  const doc = raw as MapDocument;
  checkDocument(doc);
  return doc;
}

function fromV1(v1: DocumentV1): MapDocument {
  return {
    formatVersion: 2,
    app: "dam-good-maps",
    generatorVersion: v1.generatorVersion,
    spec: v1.spec,
    base: { source: "generated", sizeX: v1.base.sizeX, sizeY: v1.base.sizeY, heights: v1.base.heights, columns: [], world: null, metadata: "{}", thumbnail: null, versionTxt: "" },
    kept: null,
    features: v1.features,
    edits: [],
    locks: [],
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
  if (!jsonEqual(state.locks, doc.locks)) throw new ProjectError("the project file is damaged: its locks do not match its edits");
  const top = doc.edits.reduce((m, e) => Math.max(m, e.seq), 0);
  if (doc.nextSeq <= top) throw new ProjectError("the project file is damaged: its edits are numbered past nextSeq");
}

export function projectFileName(spec: MapSpec): string {
  return `${mapName(spec)} (${spec.seed}).damgoodmaps.json`;
}

/** The project file's name for any document. */
export function documentFileName(doc: MapDocument): string {
  return doc.spec ? projectFileName(doc.spec) : `${doc.meta.name}.damgoodmaps.json`;
}
