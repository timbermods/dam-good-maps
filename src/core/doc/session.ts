// An open map document (EDITOR_PLAN §3): the operations engine, undo and redo, export, and the built map, rebuilt incrementally after every change. The editor (M4)
// runs one session in its worker; everything here is headless and runs in Node too.
//
// - `apply` checks an operation, applies it to the state, appends it to the log and rebuilds the
//   dirty region. Invalid operations are rejected with reasons, never clamped.
// - `undo` and `redo` step through the history: operations invert with their undo data. Built maps
//   are kept as snapshots every few steps, so stepping back is instant on 256² maps.
// - Edits never replay onto new land (PLAN §20, D336): a document keeps the generation it was
//   made on. Generate makes a new map; the log replays only onto the same land (undo and redo,
//   reopening a project, share links).
// - Documents made by another generator open from their stored base, exactly (PLAN §19.7).
// - A project with a stored map (stored.ts, D367, D455) opens from it without rebuilding. Its log
//   is replayed once (`checkReplay`, or the page's checks worker) and compared with the stored map,
//   byte for byte: the same, and undo below the save point works as normal; different (the code
//   changed since the save), and undo stops at the save point, so the map as saved is the earliest
//   state, never an approximate replay. An undo that would cross the save point before the
//   comparison is in does the comparison first, right there.

import { isTall, surfaceOf, withTallNote } from "../format/world";
import { mapObjects } from "../sim/model";
import { mineSitesCutAt } from "../validate/playability";
import { buildMap, previewBuild, previewTerrain, rebuild, SettleCache, type BaseLayer, type BuildInput, type BuildResult, type DirtyInfo, type GeneratedField, type LockedLayer } from "../features/build";
import type { TerrainState } from "../features/raster/strokePreview";
import { isResource } from "../features/raster/resources";
import { weatherKeep } from "../features/raster/objectGround";
import { entityTiles } from "../features/edits";
import { limitRuns, waterLimits, weatherBox, weatherRim } from "../features/raster/brush";
import { shoreOf, waterLevels } from "../features/raster/weather";
import { MAX_TERRAIN } from "../features/raster/terrain";
import { terrainColumns } from "../terrain/runs";
import { storedWetMask } from "../analysis/mechanics";
import { canonicalRun, type CanonicalWater } from "../sim/prefill";
import { sameKeptWater, type WaterModel } from "../sim/water";
import { rawEntity } from "../format/entities";
import { fromBase64 } from "../format/base64";
import { parse, type JsonObject } from "../format/json";
import { writeTimber, type TimberFile } from "../format/timber";
import { storedOutflows, storedSoil, storedWater } from "../format/world";
import type { Feature, StartFeature } from "../features/schema";
import { DERIVED_SLOPES } from "../features/ids";
import type { Orientation } from "../format/footprints";
import type { GenerateResult } from "../gen/generate";
import { builtWater, fileName as timberFileName, namedFile, toTimberFile, worldOf } from "../gen/pack";
import { NO_BADWATER_NOTE } from "../resources/badwater";
import { runsToTiles, type Runs } from "../math/grid";
import { thumbnailJpeg } from "../render/shade";
import { GENERATOR_VERSION, type MapSpec } from "../spec/mapspec";
import { clone } from "../spec/mergepatch";
import { validateMap, type Validation } from "../validate/checks";
import type { Profile } from "../validate/report";
import { baseFromFile, baseTerrain, fileFromBase, joinTerrain, type BaseMap, type BaseTerrain } from "./base";
import { entityProblem } from "./placing";
import { forceLabel } from "../forces/op";
import { baseFeaturesOf, checkDocument, cleanMapName, documentAt, isRenamed, type NameResult, encodeProject, importDocument, toDocument, type DocMeta, type FieldData, type KeptContent, type MapDocument, type RetiredNotes, type SavedView } from "./document";
import { restoreBuilt, sameMap, storeBuilt, storedFits, type StoredState } from "./stored";
import {
  applyOp,
  invertOp,
  replay,
  validateOp,
  type AppliedOp,
  type DocState,
  type EditOp,
  type OpName,
  type OpOrigin,
} from "./ops";

export type SessionMode = "live" | "frozen" | "import";
export type WaterMode = "canonical" | "preview" | "defer";

interface Generation {
  spec: MapSpec | null;
  generatorVersion: string;
  base: BaseMap;
  /** A generated map's field (M9a): the build starts from it. */
  field: FieldData | null;
  baseFeatures: Feature[];
  kept: KeptContent | null;
  meta: DocMeta;
}

/** One undo step: one operation, or a group applied together (a fix, a proposal). */
type HistoryEntry = { kind: "ops"; ops: AppliedOp[]; label?: string };

/** A log as its history: the operations of a step of several (`step`, D456) one entry, every other
 *  operation one of its own (a project saved before D456 undoes operation by operation). */
function stepsOf(log: readonly AppliedOp[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const op of log) {
    const last = out.at(-1);
    if (op.step !== undefined && op.step !== op.seq && last && last.ops[0].seq === op.step) last.ops.push(op);
    else out.push({ kind: "ops", ops: [op] });
  }
  return out;
}

/** A place in the history (`MapSession.mark`), and the one step taken since it (`stepSince`): what
 *  `takeBack` needs to take that step back exactly. Opaque outside the session. */
export interface HistoryMark {
  readonly depth: number;
  readonly below: unknown;
  readonly redo: readonly unknown[];
  readonly step: unknown;
}

export interface HistoryItem {
  label: string;
  /** The (first) operation of the step. */
  op: OpName;
  seq?: number;
  /** Operations in the step (a fix or a proposal may hold several). */
  count?: number;
  /** False for entries that were undone (redo would apply them again). */
  applied: boolean;
  orphaned?: string;
}

export interface ApplyResult {
  ok: boolean;
  errors: string[];
  applied: AppliedOp[];
  dirty: DirtyInfo | null;
}

/** An operation with no effect, and why (PLAN §19.4): shown to the player, never dropped. */
export interface DocOrphan {
  seq: number;
  op: OpName;
  label: string;
  reason: string;
}

/** Built maps kept for undo and redo. */
const SNAPSHOT_EVERY = 8;
const MAX_SNAPSHOTS = 8;

export class MapSession {
  private gen: Generation;
  private log: AppliedOp[];
  private st: DocState;
  private seqNext: number;
  private cur: BuildResult;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  /** The save point of a project opened from its stored map, as steps of the history: undo below
   *  it waits on the replay comparison (`checkReplay`, `confirmReplay`; an undo that would cross it
   *  first does the comparison itself), and stops there for good when the replay differs (D455).
   *  0: undo goes all the way back. */
  private floor = 0;
  /** A project opened from its stored map, until its replay is compared: the state as decoded
   *  (the checks worker compares against it), the map it restored, and the document as saved. */
  private pending: { state: StoredState; built: BuildResult; saved: MapDocument } | null = null;
  private storedOpen = false;
  private snaps = new Map<number, BuildResult>();
  private baseCache: { key: BaseMap; layer: BaseLayer; terrain: BaseTerrain; file: TimberFile } | null = null;
  private frozenCache: { key: BaseLayer; touched: string; layer: BaseLayer } | null = null;
  private fieldCache: { key: FieldData; edited: string; field: GeneratedField } | null = null;
  private keptCache: { key: KeptContent; layer: LockedLayer } | null = null;
  private cutCache: { key: BaseMap; cut: ReadonlySet<number> } | null = null;
  private slopesCache: { key: BaseMap; slopes: { x: number; y: number; orientation: Orientation }[] } | null = null;
  private resourcesCache: { key: BaseMap; features: readonly Feature[]; all: Map<string, Set<number>> | null; tiles: Map<string, Set<number>> | null } | null = null;
  private storedWaterCache: { key: BaseMap; water: ReturnType<typeof storedWater> } | null = null;
  private storedOutflowsCache: { key: BaseMap; out: Float64Array | null } | null = null;
  /** Things the player should know about how the document was opened. */
  readonly notices: string[] = [];
  /** "preview": edits re-settle the water from its previous state (the editor's preview); the
   *  canonical settle follows with `settleCanonical` or `canonicalWater` (EDITOR_PLAN §6).
   *  "defer" (live editing): edits never wait on the water. The last settled water is carried
   *  over to the new ground (`waterStale`), the editor settles it in the background from
   *  `lastSettled` and puts it in place with `adoptWater`. */
  private waterMode: WaterMode = "canonical";

  private constructor(doc: MapDocument, built?: BuildResult, opts: { rebuild?: boolean } = {}) {
    this.gen = { spec: doc.spec, generatorVersion: doc.generatorVersion, base: doc.base, field: doc.field ?? null, baseFeatures: clone(baseFeaturesOf(doc)), kept: doc.kept, meta: doc.meta };
    const r = replay(this.gen.baseFeatures, doc.edits);
    this.log = r.log;
    this.st = r.state;
    this.seqNext = doc.nextSeq;
    for (const n of (doc as MapDocument & RetiredNotes).__retiredNotes ?? []) this.notices.push(n);
    if (doc.spec && doc.base.world === null) {
      // a format-1 project file: no stored map, so the base is built with this generator, on the
      // heights the file stored as its field (the land it had; its features place the rest)
      if (doc.generatorVersion !== GENERATOR_VERSION) {
        this.notices.push(`This project was made with generator ${doc.generatorVersion} and stores no map, so it was rebuilt with generator ${GENERATOR_VERSION}.`);
      }
      const spec = { ...doc.spec, generatorVersion: GENERATOR_VERSION };
      const carved = (f: Feature) => f.origin === "generated" && (f.kind === "river" || f.kind === "lake" || f.kind === "landform" || f.kind === "setPiece");
      const field: FieldData = { heights: doc.base.heights, runs: [], contains: this.gen.baseFeatures.filter(carved).map((f) => f.id) };
      const baseBuilt = buildMap({ W: spec.size.x, H: spec.size.y, seed: spec.seed, features: this.gen.baseFeatures, field: generatedField(field, spec.size.x, spec.size.y) });
      this.gen = { ...this.gen, spec, generatorVersion: GENERATOR_VERSION, field, base: baseFromFile(toTimberFile(spec, baseBuilt), "generated", baseBuilt.entities.map((e) => e.owner)) };
    }
    if (this.mode === "frozen") {
      this.notices.push(`This map was made with generator ${this.gen.generatorVersion}. It opens exactly as it was saved.`);
    }
    const stored = built || opts.rebuild ? null : this.restored(doc);
    this.cur = built ?? stored ?? buildMap(this.input());
    if (this.mode !== "live" && this.baseStuff().terrain.columns.size) {
      this.notices.push("This map has caves or overhangs. Water under them keeps the map's own: the preview is approximate there. \"Under roofs\" in the view bar marks them.");
    }
    // the log is the history of an opened document: its operations undo step by step (D456)
    this.undoStack = stepsOf(this.log);
    if (stored) {
      // (opened from the stored map: undo stops at the save point until the replay is compared)
      this.floor = this.undoStack.length;
      const { stored: state, ...saved } = doc;
      this.pending = { state: state!, built: stored, saved };
    }
    this.snaps.set(this.undoStack.length, this.cur);
  }

  /** The document's stored map, when it fits this document and this app (stored.ts), with the
   *  generation's layers bound to this session's (the incremental build compares them by identity);
   *  null when the project opens by rebuilding. Only for a document with a stored base. */
  private restored(doc: MapDocument): BuildResult | null {
    if (!storedFits(doc.stored, this.log.length, this.seqNext) || this.gen.base.world === null) return null;
    const b = restoreBuilt(doc.stored, this.gen.base.sizeX, this.gen.base.sizeY, this.gen.spec?.seed ?? 0);
    if (!b) return null;
    const input = this.input();
    const slopes = input.generatedSlopes ?? null;
    const list = b.cache.terrain.slopeList;
    // (the generation's slopes the build checked: the same list as this session's, bound to it)
    const slopeList = list && slopes && JSON.stringify(list) === JSON.stringify(slopes) ? slopes : list;
    b.cache = { ...b.cache, base: input.base ?? null, field: input.field ?? null, locked: input.locked ?? null, terrain: { ...b.cache.terrain, slopeList } };
    return b;
  }

  /** Whether the map opened from its stored map, without rebuilding (D367). */
  get openedFromStored(): boolean {
    return this.pending !== null || this.storedOpen;
  }

  /** Whether the replay comparison of a map opened from its stored map is still owed (D455): the
   *  checks worker does it on its replica (`replayMatchesStored`), a headless caller with
   *  `checkReplay`; an undo that would cross the save point first does it itself. */
  get replayPending(): boolean {
    return this.pending !== null;
  }

  /** Why undo cannot go below the save point now, or null (the replay differed, D455). */
  get undoStopped(): string | null {
    return !this.pending && this.floor > 0 && this.undoStack.length <= this.floor ? UNDO_STOPPED : null;
  }

  /** The stored map as decoded, for the checks worker's comparison; null once compared. */
  get storedState(): StoredState | null {
    return this.pending?.state ?? null;
  }

  /** The replay comparison, here and now (a full build of the document as saved, as a project
   *  without a stored map opens; seconds at 256²): whether the saved log, replayed with this code,
   *  gives the stored map byte for byte. True when none was owed. */
  checkReplay(): boolean {
    const p = this.pending;
    if (!p) return true;
    const same = MapSession.replayMatchesStored({ ...p.saved, stored: p.state });
    this.confirmReplay(same);
    return same;
  }

  /** The verdict of the replay comparison, from wherever it ran: the same, and undo below the save
   *  point works as normal; different, and it stops there for good, with a notice (D455). */
  confirmReplay(same: boolean): void {
    if (!this.pending) return;
    this.pending = null;
    this.storedOpen = true;
    if (same) this.floor = 0;
    else this.notice(UNDO_STOPPED);
  }

  /** D455's comparison for a document with a stored map: its log up to the save point, replayed
   *  with this code (a full build, the way a project without a stored map opens), against the
   *  stored map, byte for byte. `replayed` is that build when the caller has it already (the checks
   *  worker opened the same document by rebuilding). A stored map that does not fit, or cannot be
   *  restored, never matches. */
  static replayMatchesStored(doc: MapDocument, replayed?: BuildResult): boolean {
    const st = doc.stored;
    if (!st || !storedFits(st, st.edits, st.nextSeq)) return false;
    const stored = restoreBuilt(st, doc.base.sizeX, doc.base.sizeY, doc.spec?.seed ?? 0);
    if (!stored) return false;
    const atSave = st.edits === doc.edits.length;
    const built = replayed && atSave ? replayed : new MapSession(documentAt(doc, st.edits), undefined, { rebuild: true }).cur;
    return sameMap(built, stored);
  }

  /** Warm-start the water after each edit (the editor), or settle it canonically (default). */
  setPreviewWater(on: boolean): void {
    this.waterMode = on ? "preview" : "canonical";
  }

  /** How edits treat the water (see `waterMode`). */
  setWaterMode(mode: WaterMode): void {
    this.waterMode = mode;
  }

  /** Whether the map's water is the preview's, not yet the canonical settle. */
  get waterPending(): boolean {
    return this.cur.settle.preview === true;
  }

  /** Whether the map shows the last settled water carried over to changed ground: the water has
   *  not settled on the map as it now stands (the "defer" mode). */
  get waterStale(): boolean {
    return this.cur.settle.stale === true;
  }

  /** The last water that settled, and the water model it settled on (a background settle warm
   *  starts from it); null when the map has no water to settle. */
  lastSettled(): { model: WaterModel; water: CanonicalWater } | null {
    const e = this.cur.cache.settle;
    return e ? { model: e.model, water: e.water } : null;
  }

  /** The canonical settle of the current map's water, in slices (`advance`), for `adoptWater`. */
  canonicalRun(): { model: WaterModel; advance(ticks: number): CanonicalWater | null; readonly ticks: number; readonly maxTicks: number } {
    const model = this.cur.waterModel;
    const run = canonicalRun(model);
    return { model, advance: (t) => run.advance(t), get ticks() { return run.ticks; }, get maxTicks() { return run.maxTicks; } };
  }

  /** Put the canonical settle of `model` in place of the preview's water. False when the map
   *  changed since (its water model is another). */
  adoptWater(model: WaterModel, water: CanonicalWater): boolean {
    if (!this.waterPending) return true;
    if (!sameWaterModel(model, this.cur.waterModel)) return false;
    const cache = new SettleCache();
    cache.set(model, water);
    const before = this.cur;
    this.cur = rebuild(this.cur, this.input(), { settleCache: cache });
    for (const [k, b] of this.snaps) if (b === before) this.snaps.set(k, this.cur);
    return true;
  }

  /** Settle the water canonically now, when the map shows the preview's. */
  settleCanonical(): void {
    if (!this.waterPending) return;
    const run = this.canonicalRun();
    let w = run.advance(Infinity);
    while (!w) w = run.advance(Infinity);
    this.adoptWater(run.model, w);
  }

  /** The editor's camera bookmarks (D205): kept with the document, never an edit (no undo step, no
   *  rebuild). */
  get views(): SavedView[] {
    return this.gen.meta.views ?? [];
  }

  /** Rename the map (D443): not a map operation, so never on the history and never undone. The name
   *  is stored data: the project file, the .timber file's name and Your maps' entry follow it. An
   *  empty name is refused with a one-line reason; any other is trimmed. */
  setName(name: string): NameResult {
    const r = cleanMapName(name);
    if (r.ok) this.gen = { ...this.gen, meta: { ...this.gen.meta, name: r.name } };
    return r;
  }

  setViews(views: SavedView[]): void {
    this.gen = { ...this.gen, meta: { ...this.gen.meta, views: views.length ? views.map((v) => ({ ...v, target: [...v.target] as [number, number, number] })) : undefined } };
    if (!views.length) delete (this.gen.meta as { views?: SavedView[] }).views;
  }

  /** The generation the map is built on: one per document (edits never replay onto new land,
   *  D336). */
  get generationKey(): object {
    return this.gen;
  }

  /** The log of applied operations (read only). */
  get logOps(): readonly AppliedOp[] {
    return this.log;
  }

  /** Follow another session of the same generation (a replica: the editor's checks run on one in
   *  a worker of their own): its log becomes this one's, and the map is rebuilt incrementally from
   *  where it stood. The history is not kept; the replica never undoes. */
  followLog(log: readonly AppliedOp[], nextSeq: number): void {
    const r = replay(this.gen.baseFeatures, log);
    this.log = r.log;
    this.st = r.state;
    this.seqNext = nextSeq;
    this.undoStack = stepsOf(this.log);
    this.floor = 0;
    this.pending = null;
    this.redoStack = [];
    this.snaps.clear();
    this.cur = this.rebuilt();
  }

  /** Open a document (from `decodeProject`, `toDocument` or `importDocument`). A document with a
   *  stored map opens from it without rebuilding (D367); `rebuild` builds it from its generation and
   *  its log instead (the replay, D455). */
  static open(doc: MapDocument, opts: { rebuild?: boolean } = {}): MapSession {
    checkDocument(doc);
    return new MapSession(doc, undefined, opts);
  }

  /** The session of a map the generator just made: its own build is the starting map. */
  static fromGenerated(r: GenerateResult, file?: TimberFile, seedWord?: string): MapSession {
    const doc = toDocument(r.spec, r.features, r.built, file, r.field, seedWord);
    // (M9b, D278 (1b): the map's own name and how it plays)
    if (r.name) doc.meta.name = doc.meta.generatedName = r.name;
    if (r.description) doc.meta.premise = r.description;
    return new MapSession(doc, r.built);
  }

  /** Import any .timber map (PLAN §19.6). Throws ImportError for saves. */
  static importMap(bytes: Uint8Array, fileName: string): MapSession {
    return new MapSession(importDocument(bytes, fileName));
  }

  // --------------------------------------------------------------------------------- reading

  get mode(): SessionMode {
    if (!this.gen.spec) return "import";
    return this.gen.generatorVersion !== GENERATOR_VERSION && this.gen.base.world !== null ? "frozen" : "live";
  }

  get spec(): MapSpec | null {
    return this.gen.spec;
  }

  get meta(): DocMeta {
    return this.gen.meta;
  }

  get built(): BuildResult {
    return this.cur;
  }

  get state(): Readonly<DocState> {
    return this.st;
  }

  get features(): readonly Feature[] {
    return this.st.features;
  }

  get size(): { x: number; y: number } {
    return { x: this.gen.base.sizeX, y: this.gen.base.sizeY };
  }

  /** An imported map's columns with caves or overhangs (tile index → its 23 voxels), for the voxel
   *  mesher; they are left as they are by every tool. Empty for generated maps (heightfields). */
  get columns(): ReadonlyMap<number, Uint8Array> {
    return this.mode === "live" ? new Map() : this.baseStuff().terrain.columns;
  }

  /** The ground of the map as it was opened (its stored base, before the edits): the forces derive
   *  the map's hidden rock from it once, so every force on the map meets the same rock (D220). */
  get openedHeights(): Uint8Array {
    return this.baseStuff().terrain.heights;
  }

  /** Operations in the log (the player's edits on this generation). */
  get editCount(): number {
    return this.log.length;
  }

  /** Whether the map's water is the file's own (an unedited import, or one with caves, whose
   *  water export keeps): the 3D view then draws `storedWater()`, not `built.water`. */
  get showsStoredWater(): boolean {
    if (this.mode === "live") return false;
    return this.cur.waterFromFile;
  }

  /** The map's water model and the water it shows now, one depth per tile (an unedited import's own
   *  water while it keeps it, `showsStoredWater`; else the build's): what Remove unfed water and
   *  Fill measure and are checked against (doc/water.ts). */
  waterNow(): { model: WaterModel; depth: Float64Array } {
    const own = this.showsStoredWater ? this.baseStuff().layer.water : undefined;
    return { model: this.cur.waterModel, depth: own?.depth ?? this.cur.water };
  }

  /** Tiles under roofs (caves, tunnels, overhangs) of an imported map: there the file's own water
   *  is kept and the preview is approximate (EDITOR_PLAN §6). Empty for generated maps. */
  get roofedTiles(): ReadonlySet<number> {
    return this.mode === "live" ? new Set() : new Set(this.baseStuff().terrain.columns.keys());
  }

  /** What the build's last terrain steps start from (the page's copy, for strokes painted there
   *  to match the build exactly): copies, safe to hand on. */
  terrainState(): TerrainState {
    const t = this.cur.cache.terrain;
    const live = this.mode === "live";
    const base = live ? null : this.baseStuff().terrain;
    const locked = live ? (this.keptLayer()?.mask ?? null) : null;
    // a generated map's field: the build's integrity pass compares with it (M9a)
    const field = this.mode !== "import" ? (this.input().field ?? null) : null;
    return {
      field: field ? field.heights.slice() : null,
      top: Math.max(MAX_TERRAIN, field?.top ?? MAX_TERRAIN),
      pre: t.pre7.slice(),
      protect: t.protect.slice(),
      channel: t.channel.slice(),
      base: base ? base.heights.slice() : null,
      locked: locked ? locked.slice() : null,
      columns: base ? Int32Array.from([...base.columns.keys()].sort((a, b) => a - b)) : new Int32Array(0),
      starts: this.st.features.filter((f): f is StartFeature => f.kind === "start"),
      water: this.cur.water.slice(),
      moisture: this.cur.moisture.slice(),
    };
  }

  /** The water the base file stores (every level), for the 3D view. */
  storedWater(): ReturnType<typeof storedWater> {
    const b = this.baseStuff();
    if (this.storedWaterCache?.key !== this.gen.base) this.storedWaterCache = { key: this.gen.base, water: storedWater(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedWaterCache.water;
  }

  /** The outflows the base file stores (its surface water's), for the 3D view's moving water. */
  storedOutflows(): Float64Array | null {
    const b = this.baseStuff();
    if (this.storedOutflowsCache?.key !== this.gen.base) this.storedOutflowsCache = { key: this.gen.base, out: storedOutflows(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedOutflowsCache.out;
  }

  /** The soil the base file stores on each tile's top (moisture and contamination), for the 3D
   *  view's ground colours (Map look, D86). */
  storedSoil(): ReturnType<typeof storedSoil> {
    const b = this.baseStuff();
    const cols = b.terrain.columns;
    // a tile's top column is its last run of solid voxels
    const topSlot = (i: number): number => {
      const c = cols.get(i);
      if (!c) return 0;
      let runs = 0;
      for (let z = 0; z < c.length; z++) if (c[z] && (z === 0 || !c[z - 1])) runs++;
      return Math.max(0, runs - 1);
    };
    return storedSoil(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY, topSlot);
  }

  /** The document as it stands, for the project file and autosave. */
  get document(): MapDocument {
    return {
      formatVersion: 3,
      app: "dam-good-maps",
      generatorVersion: this.gen.generatorVersion,
      spec: this.gen.spec,
      base: this.gen.base,
      ...(this.gen.field ? { field: this.gen.field } : {}),
      baseFeatures: this.gen.baseFeatures,
      kept: this.gen.kept,
      features: clone(this.st.features),
      edits: clone(this.log),
      nextSeq: this.seqNext,
      meta: this.gen.meta,
    };
  }

  /** The project file. `level` is the gzip level (autosave uses a faster one; any level opens).
   *  It carries the map as it stands (`stored`, D367), unless the water is still the preview's: a
   *  file never gets preview water (PLAN §19.7), and such a project opens by rebuilding. */
  project(level?: number): Uint8Array {
    const doc = this.document;
    if (this.waterPending) return encodeProject(doc, level);
    const p = this.pending;
    let stored: StoredState | null = null;
    try {
      // (unchanged since it opened from its stored map: that map again, as decoded)
      stored = p && p.built === this.cur && p.state.edits === this.log.length && p.state.nextSeq === this.seqNext ? p.state : storeBuilt(this.cur, this.log.length, this.seqNext);
    } catch {
      // a map the stored format cannot carry: saved without it, and reopened by rebuilding
    }
    return encodeProject(stored ? { ...doc, stored } : doc, level);
  }

  /** Every object id the document has used: the objects standing and every object an operation
   *  placed, though removed since (a force's springs, a placed object). A new object takes none of
   *  them (the operations' check refuses them). */
  usedEntityIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const e of this.cur.entities) ids.add(e.id);
    for (const e of this.st.entityEdits) if (e.op === "placeEntity") ids.add(e.params.id);
    return ids;
  }

  /** Operations that have no effect now, and why. */
  orphans(): DocOrphan[] {
    const bySeq = new Map(this.log.map((o) => [o.seq, o]));
    const out: DocOrphan[] = [];
    for (const o of this.log) if (o.orphaned) out.push({ seq: o.seq, op: o.op, label: labelOf(o), reason: o.orphaned });
    for (const o of this.cur.orphans) {
      const op = bySeq.get(o.seq);
      if (op) out.push({ seq: o.seq, op: op.op, label: labelOf(op), reason: o.reason });
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  /** The steps undo can take back and redo bring back (the steps below the save point, once the
   *  replay differed, are not listed: the map as saved is the earliest state, D455). */
  history(): HistoryItem[] {
    const item = (e: HistoryEntry, applied: boolean): HistoryItem => {
      const first = e.ops[0];
      const orphaned = e.ops.find((o) => o.orphaned)?.orphaned;
      return { label: e.label ?? labelOf(first), op: first.op, seq: first.seq, count: e.ops.length, applied, ...(orphaned ? { orphaned } : {}) };
    };
    return [...this.undoStack.slice(this.reach).map((e) => item(e, true)), ...this.redoStack.slice().reverse().map((e) => item(e, false))];
  }

  /** The steps undo may reach: all of them until the replay differed (D455). */
  private get reach(): number {
    return this.pending ? 0 : this.floor;
  }

  get canUndo(): boolean {
    return this.undoStack.length > this.reach;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ------------------------------------------------------------------------------- editing

  /** Why `op` cannot be applied now (empty when it can). */
  check(op: EditOp): string[] {
    const { x: W, y: H } = this.size;
    const entityIds = new Set<string>();
    const slopeTiles = new Set<number>();
    const starts = new Set(this.st.features.filter((f) => f.kind === "start").map((f) => f.id));
    let otherStarts = 0;
    const startObjects = new Map<string, string>();
    for (const e of this.cur.entities) {
      entityIds.add(e.id);
      if (e.template === "Slope") slopeTiles.add(e.y * W + e.x);
      else if (e.template === "StartingLocation") {
        if (starts.has(e.owner)) startObjects.set(e.id, e.owner);
        else otherStarts++;
      }
    }
    const errors = validateOp(op, {
      state: this.st,
      W,
      H,
      generated: !!this.gen.spec,
      entityIds,
      slopeTiles,
      lockedColumns: this.mode === "live" ? null : new Set(this.baseStuff().terrain.columns.keys()),
      otherStarts,
      water: this.waterNow(),
      heights: this.cur.heights,
      startObjects,
      placement: (p) => {
        const e = p.id ? this.cur.entities.find((g) => g.id === p.id) : undefined;
        const template = p.template ?? e?.template;
        if (!template) return null;
        return entityProblem(this, { template, x: p.x, y: p.y, orientation: p.orientation ?? e?.orientation ?? "Cw0", flipped: p.flipped ?? e?.flipped ?? false }, p.id ?? null);
      },
    });
    return errors;
  }

  /** Apply one operation. */
  apply(op: EditOp, origin: OpOrigin = "user", label?: string): ApplyResult {
    const errors = this.check(op);
    if (errors.length) return { ok: false, errors, applied: [], dirty: null };
    const before = this.cur;
    const mark = this.mark();
    const seq = this.seqNext;
    const applied = this.applyChecked(op, origin, label);
    this.pushHistory({ kind: "ops", ops: [applied] });
    this.cur = this.rebuilt();
    this.snapshot();
    const again = this.rideTilted([op], before, mark, seq);
    if (again) return this.ridden(() => this.apply(again[0], origin, label));
    return { ok: true, errors: [], applied: [applied], dirty: this.cur.dirty };
  }

  /** A step whose brush stroke left a source of several tiles (a BadwaterSource) off level ground,
   *  its ground changed under it, is taken back and given again with that source riding the stroke
   *  whole (its rectangle among the stroke's `rigid` pieces, taking its middle tile's level): D249,
   *  a source rides the ground under a brush, never left floating (the game would not load it), and
   *  D270, a brush stroke over a source is never refused. The page lists the pieces that ride; this
   *  covers any other caller of the operation. The operations to give again, or null when the step
   *  stands (it is never given again twice). */
  private rideTilted(ops: readonly EditOp[], before: BuildResult, mark: HistoryMark, seq: number): EditOp[] | null {
    if (this.riding || !ops.some((o) => o.op === "brush")) return null;
    const { W, H } = this.cur;
    const now = this.cur.heights;
    const rects: [number, number, number, number][] = [];
    for (const e of this.cur.entities) {
      if (e.template !== "WaterSource" && e.template !== "BadwaterSource") continue;
      const cells = entityTiles(e).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
      const tiles = cells.map(([x, y]) => y * W + x);
      if (tiles.length < 2 || tiles.every((i) => now[i] === now[tiles[0]])) continue;
      if (!tiles.some((i) => before.heights[i] !== now[i])) continue;
      const xs = cells.map(([x]) => x);
      const ys = cells.map(([, y]) => y);
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    if (!rects.length) return null;
    const step = this.stepSince(mark);
    if (!step || !this.takeBack(step)) return null;
    this.seqNext = seq;
    return ops.map((o) => (o.op === "brush" ? { ...o, params: { ...o.params, rigid: [...(o.params.rigid ?? []), ...rects] } } : o));
  }

  private riding = false;
  private ridden(give: () => ApplyResult): ApplyResult {
    this.riding = true;
    try {
      return give();
    } finally {
      this.riding = false;
    }
  }

  /** Apply several operations as one step (a fix, or an accepted proposal): all or none, and
   *  one undo takes them all back. */
  applyAll(ops: readonly EditOp[], origin: OpOrigin = "user", label?: string): ApplyResult {
    const before = this.cur;
    const mark = this.mark();
    const seq = this.seqNext;
    const done: AppliedOp[] = [];
    for (const op of ops) {
      const errors = this.check(op);
      if (errors.length) {
        for (const a of done.reverse()) {
          invertOp(this.st, a);
          this.log.pop();
        }
        if (done.length) this.cur = this.rebuilt();
        return { ok: false, errors, applied: [], dirty: null };
      }
      done.push(this.applyChecked(op, origin, label));
      // later operations of the group may refer to what earlier ones made
      this.cur = this.rebuilt();
    }
    // (a step of several is marked in the log, so it stays one step when the project is reopened)
    if (done.length > 1) for (const a of done) a.step = done[0].seq;
    this.pushHistory({ kind: "ops", ops: done, ...(label ? { label } : {}) });
    this.snapshot();
    const again = this.rideTilted(ops, before, mark, seq);
    if (again) return this.ridden(() => this.applyAll(again, origin, label));
    return { ok: true, errors: [], applied: done, dirty: this.cur.dirty };
  }

  private applyChecked(op: EditOp, origin: OpOrigin, label?: string): AppliedOp {
    const text = label ?? (op as { label?: string }).label;
    const applied = { op: op.op, params: clone(op.params), seq: this.seqNext++, origin, ...(text ? { label: text } : {}) } as AppliedOp;
    // a new weathering Naturalize stroke weathers like nature, dab by dab (D399, rule 3): its rule is
    // recorded in it, so it replays the same, and strokes saved before keep their rule (rule 2, the
    // whole stroke at once, saved with where water would stand round it, `rim`)
    // (rule 3 painted on the page comes with its rule but never its ring: added here)
    if (applied.op === "brush" && applied.params.tool === "naturalize" && applied.params.weathers && (applied.params.weathering === undefined || (applied.params.weathering === 3 && applied.params.rim === undefined))) {
      const pre = this.cur.cache.terrain.pre7;
      const rim = weatherRim(applied.params, pre, waterLevels(pre, this.size.x, this.size.y), this.size.x, this.size.y);
      applied.params = { ...applied.params, weathering: 3, ...(rim.length ? { rim } : {}) };
    }
    // and where the settled water stood round it (rule 3: and the moist ground), unless the page
    // recorded the water it showed
    const p = applied.op === "brush" ? applied.params : null;
    if (p && (p.weathering === 2 || p.weathering === 3) && p.shore === undefined && p.pools === undefined && p.moist === undefined) {
      const box = weatherBox(p, this.size.x, this.size.y);
      if (box) {
        if (p.weathering === 2) {
          const { shore, pools } = shoreOf(box, this.cur.heights, this.cur.water, this.size.x);
          applied.params = { ...p, shore, pools };
        } else {
          const runs = limitRuns(waterLimits(this.cur.heights, this.cur.water, this.cur.moisture, this.size.x, this.size.y), box, this.size.x);
          applied.params = { ...p, ...runs };
        }
      }
    }
    // a weathering Naturalize stroke leaves the ground under the sources and objects standing now: the
    // runs are recorded in it, so it replays the same whatever moves later (D368 (8), D342)
    if (applied.op === "brush") {
      const runs = weatherKeep(applied.params, this.cur.entities, this.size.x, this.size.y);
      if (runs.length) applied.params = { ...applied.params, keep: [...(applied.params.keep ?? []), ...runs] };
    }
    applyOp(this.st, applied);
    if (applied.orphaned) throw new Error(`operation passed its check but did not apply: ${applied.orphaned}`);
    this.log.push(applied);
    return applied;
  }

  undo(): boolean {
    // (crossing the save point of a map opened from its stored map: the replay comparison first,
    // here, when the checks have not done it yet; it decides whether undo may go on, D455)
    if (this.undoStack.length <= this.floor && (!this.pending || !this.checkReplay())) return false;
    const e = this.undoStack.pop();
    if (!e) return false;
    for (let k = e.ops.length - 1; k >= 0; k--) {
      const last = this.log.pop();
      if (last?.seq !== e.ops[k].seq) throw new Error("the log and the history disagree");
      invertOp(this.st, last);
    }
    this.redoStack.push(e);
    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    for (const op of e.ops) {
      applyOp(this.st, op);
      this.log.push(op);
    }
    this.undoStack.push(e);
    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();
    this.snapshot();
    return true;
  }

  /** Forget the steps Redo would bring back (a step taken back that must not return). */
  forgetRedo(): void {
    this.redoStack = [];
    for (const k of [...this.snaps.keys()]) if (k > this.undoStack.length) this.snaps.delete(k);
  }

  /** Where the history stands now, before a step that may have to be taken back as if it had never
   *  been taken (a force whose Esc arrives after its keep, PLAN §20 D341). */
  mark(): HistoryMark {
    return { depth: this.undoStack.length, below: this.undoStack.at(-1) ?? null, redo: this.redoStack.slice(), step: null };
  }

  /** The operations of the latest step on the history (empty when there is none undo can reach). */
  lastStepOps(): readonly AppliedOp[] {
    return this.undoStack.length > this.reach ? (this.undoStack.at(-1)?.ops ?? []) : [];
  }

  /** `mark` with the one step taken since it; null when not exactly one step was (nothing to name). */
  stepSince(mark: HistoryMark): HistoryMark | null {
    if (this.undoStack.length !== mark.depth + 1 || (this.undoStack[mark.depth - 1] ?? null) !== mark.below) return null;
    return { ...mark, step: this.undoStack[mark.depth] };
  }

  /** Take back the step `mark` names (from `stepSince`) as if it had never been taken: the map, the
   *  history and what Redo would bring back are exactly as they were at the mark. False, and nothing
   *  changes, when that step is no longer the latest (another step since, or it was undone). */
  takeBack(mark: HistoryMark): boolean {
    const top = this.undoStack.length;
    if (!mark.step || top !== mark.depth + 1 || this.undoStack[mark.depth] !== mark.step || (this.undoStack[mark.depth - 1] ?? null) !== mark.below) return false;
    this.undo();
    this.redoStack = (mark.redo as HistoryEntry[]).slice();
    for (const k of [...this.snaps.keys()]) if (k > this.undoStack.length) this.snaps.delete(k);
    return true;
  }

  private pushHistory(e: HistoryEntry): void {
    this.undoStack.push(e);
    this.redoStack = [];
    for (const k of [...this.snaps.keys()]) if (k >= this.undoStack.length) this.snaps.delete(k);
  }

  private snapshot(force = false): void {
    const at = this.undoStack.length;
    if (!force && at % SNAPSHOT_EVERY !== 0) return;
    this.snaps.set(at, this.cur);
    while (this.snaps.size > MAX_SNAPSHOTS) {
      const oldest = [...this.snaps.keys()].filter((k) => k !== 0).sort((a, b) => a - b)[0];
      this.snaps.delete(oldest);
    }
  }

  // ------------------------------------------------------------------------------ building

  private baseStuff(): { layer: BaseLayer; terrain: BaseTerrain; file: TimberFile } {
    const c = this.baseCache;
    if (c && c.key === this.gen.base) return c;
    const terrain = baseTerrain(this.gen.base);
    const file = fileFromBase(this.gen.base, terrain);
    const owners = this.gen.base.owners;
    const layer: BaseLayer = {
      heights: terrain.heights,
      columns: terrain.columns,
      entities: file.world.entities.map((e, k) => rawEntity(e, owners?.[k] ?? "import")),
      water: topWater(file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY, terrain.heights),
    };
    this.baseCache = { key: this.gen.base, layer, terrain, file };
    return this.baseCache;
  }

  /** A stored generation opened by a newer generator (D336 (2): it opens exactly as it was saved,
   *  edits included): the stored map is the ground and holds every generated feature, except the
   *  ones the log changed, deleted or reordered. Those leave the stored map, their objects with
   *  them, and are built as they now say, as they were when the edit was made; the rest stay as the
   *  generator that made them built them. */
  private frozenLayer(): BaseLayer {
    const layer = this.baseStuff().layer;
    const ids = new Set(this.gen.baseFeatures.map((f) => f.id));
    const touched = new Set<string>();
    for (const o of this.log) {
      if (o.orphaned || (o.op !== "updateFeature" && o.op !== "deleteFeature" && o.op !== "reorderFeature")) continue;
      if (ids.has(o.params.id)) touched.add(o.params.id);
    }
    const key = [...touched].sort().join(",");
    const c = this.frozenCache;
    if (c && c.key === layer && c.touched === key) return c.layer;
    for (const id of touched) ids.delete(id);
    const frozen: BaseLayer = { ...layer, frozen: ids, entities: touched.size ? layer.entities.filter((e) => !touched.has(e.owner)) : layer.entities };
    this.frozenCache = { key: layer, touched: key, layer: frozen };
    return frozen;
  }

  private keptLayer(): LockedLayer | null {
    const k = this.gen.kept;
    if (!k) return null;
    if (this.keptCache?.key === k) return this.keptCache.layer;
    const layer = keptLayerOf(k, this.gen.base.sizeX, this.gen.base.sizeY);
    this.keptCache = { key: k, layer };
    return layer;
  }

  /** The incremental build of the document as it now stands, with the session's water mode. */
  private rebuilt(): BuildResult {
    return rebuild(this.cur, this.input(), { water: this.waterMode });
  }

  private input(): BuildInput {
    const mode = this.mode;
    const live = mode === "live";
    const base = live ? null : mode === "frozen" ? this.frozenLayer() : this.baseStuff().layer;
    // (a frozen generation takes the field too: the features read back from it, so one the player
    // changed is not carved again unless its shape changed, and a tall map's top)
    return this.inputFor(this.gen.base.sizeX, this.gen.base.sizeY, this.gen.spec?.seed ?? 0, this.st, base, this.keptLayer(), mode !== "import" ? this.fieldOf(this.gen.field) : null, live && !this.derivesSlopes() ? this.generatedSlopes() : null, live ? this.generatedResources() : null);
  }

  /** A stroke saved before D247 or D270 asks the slope planner for slopes along its steps (a walkable
   *  Smooth, a ramped Flatten that recorded none): a document that holds one opens as it always did,
   *  its slopes derived from its ground. No stroke the editor makes can ask (D368 (10)). */
  private derivesSlopes(): boolean {
    return this.st.sculpts.some((sc) => {
      const p = sc.params as { tool?: string; walkable?: boolean; edges?: string; slopes?: unknown; dabs?: unknown };
      return !!p.dabs && ((p.tool === "smooth" && !!p.walkable) || (p.tool === "flatten" && p.edges === "ramped" && p.slopes === undefined));
    });
  }

  /** The slopes the generation placed, from the map it stored: an edited map keeps them and never
   *  derives slopes again (D368 (10): only the player places objects). A document that stored no
   *  owners keeps every slope of its stored map. */
  private generatedSlopes(): { x: number; y: number; orientation: Orientation }[] {
    const c = this.slopesCache;
    if (c && c.key === this.gen.base) return c.slopes;
    const owned = !!this.gen.base.owners;
    const slopes = this.baseStuff().layer.entities.filter((e) => e.template === "Slope" && (!owned || e.owner === DERIVED_SLOPES)).map((e) => ({ x: e.x, y: e.y, orientation: e.orientation }));
    this.slopesCache = { key: this.gen.base, slopes };
    return slopes;
  }

  /** Where the generation placed each of its resource features' objects (berry patches, forests,
   *  ruin fields), from the map it stored: an edited map keeps only those, whatever the water does
   *  under them (D368 (10), D404). Only for the features the player has not changed (a ruin field's
   *  deleted tiles aside, which it leaves out itself): one the player changed is built as it now
   *  says. Null for a document that stored no owners (it builds them as before). */
  generatedResources(): ReadonlyMap<string, ReadonlySet<number>> | null {
    const c = this.resourcesCache;
    // (keyed on the features themselves, not on their list: an operation changes the list in place,
    // and each feature it changes is a new object, ops.ts `applyOp`; keyed on the list, a feature
    // changed after the first build kept the generation's tiles until the project was reopened)
    if (c && c.key === this.gen.base && sameItems(c.features, this.st.features)) return c.tiles;
    let all = c && c.key === this.gen.base ? c.all : null;
    if (!all && this.gen.base.owners) {
      all = new Map();
      for (const f of this.gen.baseFeatures) if (isResource(f)) all.set(f.id, new Set());
      const W = this.gen.base.sizeX;
      for (const e of this.baseStuff().layer.entities) all.get(e.owner)?.add(e.y * W + e.x);
    }
    let tiles: Map<string, Set<number>> | null = null;
    if (all) {
      const shape = (f: Feature) => JSON.stringify({ kind: f.kind, params: { ...(f.params as unknown as Record<string, unknown>), cleared: undefined } });
      const base = new Map(this.gen.baseFeatures.map((f) => [f.id, f]));
      tiles = new Map();
      for (const f of this.st.features) {
        const kept = all.get(f.id);
        const b = base.get(f.id);
        if (kept && b && (b === f || shape(b) === shape(f))) tiles.set(f.id, kept);
      }
    }
    this.resourcesCache = { key: this.gen.base, features: [...this.st.features], all, tiles };
    return tiles;
  }

  /** The generation's field as the build takes it, decoded once (the same object across rebuilds,
   *  so incremental rebuilds see it unchanged). A feature read back from the field that the player
   *  has since changed is the field's no longer: it is built as the feature says. */
  private fieldOf(f: FieldData | null): GeneratedField | null {
    if (!f) return null;
    const base = new Map(this.gen.baseFeatures.map((x) => [x.id, x]));
    const inField = new Set(f.contains);
    const edited: string[] = [];
    for (const x of this.st.features) {
      if (!inField.has(x.id)) continue;
      const b = base.get(x.id);
      // (its shape: locking it, renaming it, or a river's water turning bad or its flow changing,
      // leaves it the field's)
      if (!b || b.kind !== x.kind || JSON.stringify(shapeOf(b)) !== JSON.stringify(shapeOf(x))) edited.push(x.id);
    }
    const key = edited.join(",");
    if (this.fieldCache?.key === f && this.fieldCache.edited === key) return this.fieldCache.field;
    const field = generatedField(f, this.gen.base.sizeX, this.gen.base.sizeY, edited);
    this.fieldCache = { key: f, edited: key, field };
    return field;
  }

  private inputFor(W: number, H: number, seed: number, st: DocState, base: BaseLayer | null, locked: LockedLayer | null, field: GeneratedField | null = null, generatedSlopes: BuildInput["generatedSlopes"] = null, generatedResources: BuildInput["generatedResources"] = null): BuildInput {
    return { W, H, seed, features: st.features, base, ...(field ? { field } : {}), ...(generatedSlopes ? { generatedSlopes } : {}), ...(generatedResources ? { generatedResources } : {}), sculpts: st.sculpts, ...(st.waterEdits.length ? { waterEdits: st.waterEdits } : {}), slopeEdits: st.slopeEdits, entityEdits: st.entityEdits, locked };
  }

  /** The terrain the map would have with these features instead of its own (a shape tool's live
   *  result): the heights, and the tiles that can differ from the map's. */
  previewFeatures(features: readonly Feature[]): { heights: Uint8Array; rect: { x0: number; y0: number; x1: number; y1: number } | null } {
    return previewTerrain(this.cur, { ...this.input(), features });
  }

  /** The whole map with these features instead of its own (a water tool's draft): its terrain,
   *  objects and water model; the document and its caches stay as they are. */
  previewBuild(features: readonly Feature[]): BuildResult {
    return previewBuild(this.cur, { ...this.input(), features });
  }

  /** A full build of the document, from scratch (the reference for the incremental one). */
  fullBuild(): BuildResult {
    return buildMap(this.input());
  }

  /** The document's terrain, slopes and objects with other features (no water): the map a tool
   *  plans an edit on, without the feature it is editing. */
  terrainWith(features: readonly Feature[]): BuildResult {
    return buildMap({ ...this.input(), features }, { stopBeforeWater: true });
  }

  // ------------------------------------------------------------------------------- exporting

  /** Kyler's D213: a map whose player removed its last badwater spring is a No badwater map (a
   *  peaceful one; badtides still come). Removing it is never refused: the map says so in its
   *  description, its checks treat it as No badwater, and undoing the removal brings the spring and
   *  the setting back. A generated map asks for badwater unless its player chose No badwater; an
   *  imported one did when it was opened with a badwater source. */
  badwaterRemoved(built: BuildResult = this.cur): boolean {
    if (built.entities.some((e) => e.template === "BadwaterSource")) return false;
    const spec = this.gen.spec;
    // (a map made with Sources: None has no badwater of its own to remove, D330)
    if (spec) return spec.settings.hazards.badwater !== "off" && spec.settings.water.sources !== "none";
    return this.baseStuff().file.world.entities.some((e) => e.Template === "BadwaterSource");
  }

  /** The spec the map is written and checked with: the generation's, set to No badwater once its
   *  player removed the last badwater spring (D213, `badwaterRemoved`). */
  effectiveSpec(built: BuildResult = this.cur): MapSpec | null {
    const spec = this.gen.spec;
    if (!spec || !this.badwaterRemoved(built)) return spec;
    return { ...spec, settings: { ...spec.settings, hazards: { ...spec.settings.hazards, badwater: "off" } } };
  }

  /** The map as a .timber file. A generated map is written the way the generator writes it; an
   *  imported one is its normalized file with the edits: unedited, it is the same file, byte for
   *  byte (PLAN §19.6). */
  exportFile(built: BuildResult = this.cur, opts: { thumbnail?: boolean } = {}): TimberFile {
    // without a thumbnail (checks read only its size): a blank one, not drawn
    const blank = opts.thumbnail === false ? blankThumbnail() : undefined;
    // (a generated map's description follows its land already: pack.ts notes land above 16, D244)
    if (this.mode === "live") return toTimberFile(this.effectiveSpec(built)!, built, blank ? { thumbnail: blank } : {});
    const b = this.baseStuff();
    const { x: W, y: H } = this.size;
    const w = b.file.world;
    const terrainChanged = !sameBytes(built.heights, b.terrain.heights);
    // the settled water is written, unless the file's own still stands; under roofs (caves, tunnels,
    // overhangs) the file's own water is kept: the heightfield model cannot simulate it (EDITOR_PLAN §6)
    const roofed = b.terrain.columns.size ? new Set(b.terrain.columns.keys()) : null;
    const world = worldOf(W, H, built.heights, built.entities, built.waterFromFile ? null : builtWater(built), { world: w, voxels: joinTerrain(W, H, built.heights, b.terrain.columns), roofed });
    // the thumbnail shows terrain and water: a new one when either changed
    const redraw = terrainChanged || !built.waterFromFile;
    let metadata = parse(this.gen.base.metadata) as JsonObject;
    // its player removed its last badwater spring: it says it is a No badwater map (D213)
    if (this.badwaterRemoved(built)) {
      const text = typeof metadata.MapDescription === "string" ? metadata.MapDescription : "";
      metadata = { ...metadata, MapDescription: text ? `${text}\n\n${NO_BADWATER_NOTE}` : NO_BADWATER_NOTE };
    }
    return tallNoted({
      metadata,
      thumbnail: blank ?? (redraw ? thumbnailJpeg(built.heights, W, H, built.waterFromFile ? null : built.water) : b.file.thumbnail),
      versionTxt: this.gen.base.versionTxt,
      world,
      extraFiles: [],
    }, built.heights);
  }

  /** The .timber file. `warnings` are the problems the player confirmed at export (the `export`
   *  profile, PLAN §19.5): they are noted at the end of the map's description. */
  /** The exported file's name. */
  exportTimberName(): string {
    // a generated map keeps its seed-based name until renamed; then, like any named map, `namedFile` (D443)
    return this.gen.spec && !isRenamed(this.gen.spec, this.gen.meta.name, this.gen.meta.generatedName) ? timberFileName(this.gen.spec, this.gen.meta.seedWord) : namedFile(this.gen.meta.name);
  }

  exportTimber(opts: { warnings?: readonly string[] } = {}): { bytes: Uint8Array; fileName: string } {
    // a file always gets the canonical settle, never the preview's water (PLAN §19.7)
    this.settleCanonical();
    const name = this.exportTimberName();
    const file = this.exportFile();
    if (opts.warnings?.length && file.metadata) {
      const md = file.metadata;
      const text = typeof md.MapDescription === "string" ? md.MapDescription : "";
      const note = `Exported with ${opts.warnings.length === 1 ? "a warning" : `${opts.warnings.length} warnings`}: ${opts.warnings.join("; ")}.`;
      file.metadata = { ...md, MapDescription: text ? `${text}\n\n${note}` : note };
    }
    return { bytes: writeTimber(file), fileName: name };
  }

  /** The map as it was opened, before any edit: the load and design checks of an imported
   *  file's normalized base (its own problems, which the export gate does not blame on edits). */
  validateOriginal(water?: { model: WaterModel; settled: CanonicalWater }): Validation {
    return validateMap(this.baseStuff().file, {
      profile: "export",
      external: true,
      loadOnly: !water,
      spec: null,
      designedFor: this.gen.meta.designedFor,
      water,
      storedWet: water ? this.openedWet() : undefined,
    });
  }

  /** The imported map's file as it was opened (normalized). */
  openedFile(): TimberFile {
    return this.baseStuff().file;
  }

  /** Validate the map as it would be exported: the `export` profile for generated maps, `import`
   *  for imported ones (PLAN §19.5), or the profile given. `loadOnly` runs the load and design
   *  classes only (no water settle). */
  validate(profile?: Profile, opts: { loadOnly?: boolean; water?: { model: WaterModel; settled: CanonicalWater } } = {}): Validation {
    const live = this.mode === "live";
    if (!opts.loadOnly && !opts.water) this.settleCanonical();
    return validateMap(this.exportFile(), {
      profile: profile ?? (this.gen.spec ? "export" : "import"),
      external: !live,
      // (the map is being edited: an edge wall warns, D323)
      editing: true,
      mineCutAtOpen: this.mineCutAtOpen(),
      spec: this.effectiveSpec(),
      designedFor: this.gen.meta.designedFor,
      features: this.st.features,
      water: opts.water ?? (live ? { model: this.cur.waterModel, settled: this.cur.settle } : undefined),
      loadOnly: opts.loadOnly,
      // an edited import's approximate-water rule compares the settle with the water it was opened with
      storedWet: live ? undefined : this.openedWet(),
    });
  }

  /** The mine sites out of the colony's reach when the map was opened (its stored map): the checks
   *  blame only what edits cut off since (D368 (10)). */
  private mineCutAtOpen(): ReadonlySet<number> {
    const b = this.baseStuff();
    if (this.cutCache?.key === this.gen.base) return this.cutCache.cut;
    const w = b.file.world;
    const cut = mineSitesCutAt(mapObjects(w), surfaceOf(w), storedWetMask(storedWater(w.singletons, w.sizeX, w.sizeY), w.sizeX * w.sizeY), w.sizeX, w.sizeY);
    this.cutCache = { key: this.gen.base, cut };
    return cut;
  }

  /** The wet tiles of the imported map as it was opened (its own stored water). */
  openedWet(): Uint8Array {
    const b = this.baseStuff();
    const { x: W, y: H } = this.size;
    return storedWetMask(storedWater(b.file.world.singletons, W, H), W * H);
  }

  private notice(msg: string): void {
    if (!this.notices.includes(msg)) this.notices.push(msg);
  }
}

// ------------------------------------------------------------------------------------ helpers

/** Why undo stops at the save point (D455): the notice, and a refused undo's reason. */
const UNDO_STOPPED = "This map opens as it was saved. Its earlier edits cannot be undone: the editor has changed since they were made, so taking them back could not give the map they were made on.";

let blank: Uint8Array | null = null;
/** A 960×540 thumbnail for checks, which read only its size. */
function blankThumbnail(): Uint8Array {
  blank ??= thumbnailJpeg(new Uint8Array(1), 1, 1, null);
  return blank;
}

/** The water a file stores on each tile's top (the water standing on the surface, not under a
 *  roof), as a settle to warm-start from; marked `preview`: it is not a canonical settle. */
function topWater(singletons: JsonObject, W: number, H: number, heights: Uint8Array): CanonicalWater {
  const N = W * H;
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  const w = storedWater(singletons, W, H);
  for (let k = 0; k < w.tile.length; k++) {
    const i = w.tile[k];
    const f = w.floor[k];
    if (f >= 0 && Math.abs(f - heights[i]) > 0.01) continue;
    depth[i] = w.depth[k];
    contamination[i] = w.contamination[k];
  }
  return { settled: true, ticks: 0, depth, contamination, sat: new Uint8Array(N), preview: true };
}

/** Whether two water models are the same map for the water (floors, obstacles and emitters). */
function sameWaterModel(a: WaterModel, b: WaterModel): boolean {
  if (a === b) return true;
  if (a.W !== b.W || a.H !== b.H || a.floor.length !== b.floor.length) return false;
  for (let i = 0; i < a.floor.length; i++) if (a.floor[i] !== b.floor[i]) return false;
  if (!!a.dam !== !!b.dam) return false;
  if (a.dam && b.dam) for (let i = 0; i < a.dam.length; i++) if (a.dam[i] !== b.dam[i]) return false;
  return JSON.stringify(a.emitters) === JSON.stringify(b.emitters) && sameKeptWater(a, b);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The same items in the same order (the same objects). */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A stored field as the build takes it. */
/** What of a feature the field holds: its params, less a river's water (badwater or clean, its
 *  flow), which never changes the ground. */
function shapeOf(f: Feature): unknown {
  if (f.kind !== "river") return f.params;
  const { badwater: _b, flow: _f, ...rest } = f.params;
  return rest;
}

export function generatedField(f: FieldData, W: number, H: number, except: readonly string[] = []): GeneratedField {
  const { heights } = terrainColumns(f, W * H);
  const out = new Set(except);
  const ramps: [number, number][] = [];
  const r = f.ramps ?? [];
  for (let k = 0; k + 1 < r.length; k += 2) ramps.push([r[k], r[k + 1]]);
  const mask = (runs: Runs) => {
    const m = new Uint8Array(W * H);
    for (const i of runsToTiles(runs, W)) m[i] = 1;
    return m;
  };
  return { heights, contains: new Set(f.contains.filter((id) => !out.has(id))), ...(ramps.length ? { ramps } : {}), ...(f.top !== undefined ? { top: f.top } : {}), ...(f.dry ? { dry: { moist: mask(f.dry.moist), poisoned: mask(f.dry.poisoned) } } : {}) };
}

export function keptLayerOf(k: KeptContent, W: number, H: number): LockedLayer {
  const mask = new Uint8Array(W * H);
  const heights = new Uint8Array(W * H);
  const bytes = fromBase64(k.heights);
  runsToTiles(k.runs, W).forEach((i, n) => {
    mask[i] = 1;
    heights[i] = bytes[n];
  });
  const entities = (parse(k.entities) as JsonObject[]).map((e, n) => rawEntity(e, k.owners[n] ?? "kept"));
  return { mask, heights, entities };
}

/** A stroke's history label, when the page gave none ("Raise, 38 tiles" when it did). */
const BRUSH_NAMES: Record<string, string> = { raise: "Raise", lower: "Lower", flatten: "Flatten", smooth: "Smooth", naturalize: "Naturalize" };

const KIND_NAMES: Record<string, string> = {
  river: "river",
  lake: "lake",
  landform: "landform",
  setPiece: "set piece",
  forest: "forest",
  berryPatch: "berry patch",
  ruinField: "ruin field",
  mapObject: "map object",
  start: "start",
};

/** A plain-language label for the history list. */
export function labelOf(op: AppliedOp): string {
  if (op.label) return op.label;
  switch (op.op) {
    case "addFeature":
      return `Add ${KIND_NAMES[op.params.feature.kind] ?? op.params.feature.kind}`;
    case "updateFeature":
      return `Change a feature`;
    case "deleteFeature":
      return "Delete a feature";
    case "reorderFeature":
      return "Reorder a feature";
    case "sculpt":
      return op.params.mode === "raise" ? "Raise terrain" : op.params.mode === "lower" ? "Lower terrain" : op.params.mode === "flatten" ? "Flatten terrain" : op.params.mode === "terrace" ? "Terrace terrain" : "Smooth terrain";
    case "brush":
      return BRUSH_NAMES[op.params.tool] ?? "Brush";
    case "forceResult":
      return forceLabel(op.params);
    case "placeEntity":
      return `Place ${op.params.template}`;
    case "moveEntity":
      return "Move an object";
    case "deleteEntities":
      return op.params.entities.length === 1 ? "Remove an object" : `Remove ${op.params.entities.length} objects`;
    case "setEntityProps":
      return "Change an object";
    case "pinSlope":
      return "Place a slope";
    case "removeSlope":
      return "Remove a slope";
    case "removeUnfedWater":
      return op.params.pools ? `Remove unfed water, ${op.params.pools === 1 ? "1 pool" : `${op.params.pools} pools`}` : "Remove unfed water";
    case "fillHollow":
      return "Fill a hollow";
    default:
      return (op as { op: string }).op;
  }
}

/** A map whose land goes above 16 is tall, with the tall note in its description; back at 16 or
 *  below, a standard map again, without it (D172 (4), D244). A description that needs no change
 *  stays byte for byte. */
function tallNoted(file: TimberFile, heights: ArrayLike<number>): TimberFile {
  const md = file.metadata;
  if (!md) return file;
  const text = typeof md.MapDescription === "string" ? md.MapDescription : "";
  let top = 0;
  for (let i = 0; i < heights.length; i++) if (heights[i] > top) top = heights[i];
  const described = withTallNote(text, isTall(heights), top);
  return described === text ? file : { ...file, metadata: { ...md, MapDescription: described } };
}
