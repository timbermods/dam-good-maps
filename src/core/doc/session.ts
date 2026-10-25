// An open map document (EDITOR_PLAN §3): the operations engine, undo and redo, export, and the built map, rebuilt incrementally after every change. The editor (M4)
// runs one session in its worker; everything here is headless and runs in Node too.
//
// - `apply` checks an operation, applies it to the state, appends it to the log and rebuilds the
//   dirty region. Invalid operations are rejected with reasons, never clamped.
// - `undo` and `redo` step through the history: operations invert with their undo data. The built map
//   of every step near where the history stands is kept (one every few steps further back), so
//   undo and redo put it back as it was, its own water with it, never rebuilding it.
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

import { generatedTallSentence, isTall, surfaceOf, TALL_NOTE, withTallNote } from "../format/world";
import { mapObjects } from "../sim/model";
import { mineSitesCutAt } from "../validate/playability";
import { buildMap, groundDropped, masksOf, previewBuild, previewTerrain, rebuild, SettleCache, modelOf, toMapObject, type BaseLayer, type BuildInput, type BuildResult, type DirtyInfo, type GeneratedField, type KeptSource, type LockedLayer } from "../features/build";
import type { TerrainState } from "../features/raster/strokePreview";
import { isResource } from "../features/raster/resources";
import { weatherKeep } from "../features/raster/objectGround";
import { placedEntity, entityTiles, ridingPieces } from "../features/edits";
import { objectHolds, standProblem, type StandGround } from "../features/objects";
import { brushBounds, byDabRule, limitRuns, markBrushTiles, tiltedPieces, WEATHERING, waterLimits, weatherBox, weatherRim } from "../features/raster/brush";
import { shoreOf, waterLevels } from "../features/raster/weather";
import { MAX_TERRAIN } from "../features/raster/terrain";
import { ColumnTerrain, isPlainMask, terrainColumns } from "../terrain/runs";
import { blockEffect, blockGround, cellPairs, layeredMasks, terrainUnder, withBlocks, type BlockGround } from "../terrain/blocks";
import { fallsReason, newFalls, placeOf, stackableTops, unsupportedVoxels } from "../terrain/support";
import { LAYERS } from "../format/world";
import { storedWetMask } from "../analysis/mechanics";
import { clusterSaturation } from "../sim/moisture";
import { canonicalRun, type CanonicalWater } from "../sim/prefill";
import { sameKeptWater, type WaterModel } from "../sim/water";
import { terrainColumns as runColumns, waterColumns } from "../sim/columns";
import { runGround, stackedSoil, stackSoilOf, type RunGround } from "../sim/soil";
import type { Soil3d } from "../sim/soil3d";
import { storedStack, type StackSettle } from "../sim/stackWater";
import { rawEntity } from "../format/entities";
import { fromBase64 } from "../format/base64";
import { parse, type JsonObject } from "../format/json";
import { writeTimber, type TimberFile } from "../format/timber";
import { stackedSimulationSingletons, storedColumnOutflows, storedSoilRuns, storedSoilTops, storedWater } from "../format/world";
import type { Feature, StartFeature } from "../features/schema";
import { DERIVED_SLOPES } from "../features/ids";
import { FOOTPRINTS, worldBlocks, type Orientation, type Placement } from "../format/footprints";
import type { GenerateResult } from "../gen/generate";
import { builtWater, description as generatedText, fileName as timberFileName, NO_SOURCES_NOTE, namedFile, toTimberFile, withWaterSingletons, worldOf } from "../gen/pack";
import { placeCredits } from "./description";
import { NO_BADWATER_NOTE } from "../resources/badwater";
import { runsToTiles, type Runs } from "../math/grid";
import { thumbnailJpeg } from "../render/shade";
import { GENERATOR_VERSION, type MapSpec } from "../spec/mapspec";
import { clone } from "../spec/mergepatch";
import { validateMap, type Validation } from "../validate/checks";
import type { Profile } from "../validate/report";
import { baseFromFile, baseTerrain, fileFromBase, type BaseMap, type BaseTerrain } from "./base";
import { cropFile, cropObjects, START_CUT, type CropParams } from "./crop";
import { entityProblem, objectCells, resourceOwners } from "./placing";
import { applyPaintObjects } from "./paint";
import { forceLabel } from "../forces/op";
import { versionName } from "../library/keptVersions";
import { baseFeaturesOf, checkDocument, cleanMapName, documentAt, isRenamed, type NameResult, encodeProject, importDocument, toDocument, type DocMeta, type FieldData, type KeptContent, type MapDocument, type RetiredNotes, type SavedView, type VersionParent } from "./document";
import { itemName, placeLabel, withArticle } from "./labels";
import { restoreBuilt, sameMap, storeBuilt, storedFits, type StoredState } from "./stored";
import {
  applyOp,
  emptyState,
  invertOp,
  isCrop,
  replay,
  validateOp,
  schemaProblems,
  type AppliedOp,
  type DocState,
  type EditOp,
  type OpName,
  type OpParams,
  type OpOrigin,
} from "./ops";

export type SessionMode = "live" | "frozen" | "import";

/** What the Block tool's operation would do (`MapSession.blockFalls`): the blocks it adds and removes
 *  and the blocks of ground the support rule would drop because of it, each [x, y, layer]. */
export interface BlockFalls {
  /** The one line the operation is refused with, or null when it would be taken. */
  reason: string | null;
  errors: string[];
  added: [number, number, number][];
  removed: [number, number, number][];
  falls: [number, number, number][];
  /** The plants its blocks fill in or take the ground from, which the build removes, and the plants on a
   *  tile's top that rise or sink with it. */
  plantsRemoved: number;
  plantsRiding: number;
}
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
  /** The generation a crop made (D340): its base is the cropped map, and its water settles again. */
  cropped?: boolean;
}

/** One undo step: one operation, or a group applied together (a fix, a proposal). `cropped`: the generation a
 *  crop step made, kept while the step is undone so redo is that very map again. */
type HistoryEntry = { kind: "ops"; ops: AppliedOp[]; label?: string; cropped?: Generation };

/** The generation a document holds (not its earlier generations, `MapDocument.prior`). */
function generationOf(doc: MapDocument): Generation {
  return { spec: doc.spec, generatorVersion: doc.generatorVersion, base: doc.base, field: doc.field ?? null, baseFeatures: clone(baseFeaturesOf(doc)), kept: doc.kept, meta: doc.meta, ...(doc.prior ? { cropped: true } : {}) };
}

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
  /** The next operation number at the mark: a step taken back leaves it as it was. */
  readonly seq: number;
}

/** A step of the history kept to be put back exactly (`MapSession.keptStep`, `putStep`): a force's
 *  roll (core/forces/rolls.ts). */
export interface KeptStep {
  readonly ops: readonly AppliedOp[];
  readonly label?: string;
  /** The next operation number after the step. */
  readonly nextSeq: number;
  /** The map the step built, as it stood. */
  readonly built: BuildResult;
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

/** A map's description for the page (`MapSession.description`). */
export interface MapDescription {
  text: string;
  written: boolean;
  /** What follows the text in the file whatever is written, one paragraph each: the no-badwater or no-sources note,
   *  the tall note and a real place's credits. Shown, not edited. */
  kept: string | null;
}

export interface ApplyResult {
  ok: boolean;
  errors: string[];
  applied: AppliedOp[];
  dirty: DirtyInfo | null;
  /** A crop (D340): how many objects the new edge cut and removed. */
  removedObjects?: number;
}

/** An operation with no effect, and why (PLAN §19.4): shown to the player, never dropped. */
export interface DocOrphan {
  seq: number;
  op: OpName;
  label: string;
  reason: string;
}

/** Built maps kept for undo and redo: every step's within reach of where the history stands (undo and
 *  redo put the map back as it was, a copy, never a rebuild: D158, D453), and one every eight steps
 *  further back (at most eight of those). A kept build holds about 92 bytes a tile beyond the builds
 *  round it (6 MB at 256²): `NEAR_TILES` keeps 8 steps either side at 256² (about 50 MB with the
 *  history at its latest step, 100 MB at most, half way back), 32 at 128², 2 at 512². */
const SNAPSHOT_EVERY = 8;
const MAX_SNAPSHOTS = 8;
const NEAR_TILES = 8 * 256 * 256;
const MIN_NEAR = 2;

export class MapSession {
  private gen: Generation;
  /** The generations before the current one, oldest first, each with its state and where its operations start
   *  in the log: a crop (D340) makes the map's next generation, and undo of the crop is the one before. */
  private past: { gen: Generation; st: DocState; start: number }[] = [];
  /** Where the current generation's operations start in `log` (its first is the crop that made it). */
  private segStart = 0;
  /** The log of every generation, oldest first (the document splits it at each crop). */
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
  private springsCache: { key: BaseMap; features: readonly Feature[]; all: Map<string, KeptSource[]> | null; rows: Map<string, KeptSource[]> | null } | null = null;
  private storedWaterCache: { key: BaseMap; water: ReturnType<typeof storedWater> } | null = null;
  private storedOutflowsCache: { key: BaseMap; out: Float32Array | null } | null = null;
  private storedSoilCache: { key: BaseMap; soil: ReturnType<typeof storedSoilRuns> } | null = null;
  /** Things the player should know about how the document was opened. */
  readonly notices: string[] = [];
  /** "preview": edits re-settle the water from its previous state (the editor's preview); the
   *  canonical settle follows with `settleCanonical` or `canonicalWater` (EDITOR_PLAN §6).
   *  "defer" (live editing): edits never wait on the water. The last settled water is carried
   *  over to the new ground (`waterStale`), the editor settles it in the background from
   *  `lastSettled` and puts it in place with `adoptWater`. */
  private waterMode: WaterMode = "canonical";

  private constructor(doc: MapDocument, built?: BuildResult, opts: { rebuild?: boolean; deferWater?: boolean } = {}) {
    this.gen = generationOf(doc);
    // a cropped map's earlier generations (D340), each with its own operations: a cheap replay of their state,
    // never a build; the map is built from the current generation's base
    const earlier: AppliedOp[] = [];
    const chain: MapDocument[] = [];
    for (let d = doc.prior; d; d = d.prior) chain.unshift(d);
    for (const d of chain) {
      const g = generationOf(d);
      const rp = replay(g.baseFeatures, d.edits);
      this.past.push({ gen: g, st: rp.state, start: earlier.length });
      earlier.push(...rp.log);
    }
    this.segStart = earlier.length;
    const r = replay(this.gen.baseFeatures, doc.edits);
    this.log = [...earlier, ...r.log];
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
    // A cacheless generated project saved during a settle need not settle twice at open:
    // its editor carries the saved base water, and the checks replica builds the exact result.
    // Stored maps, imports, old generators and explicit replay builds keep their existing path.
    const defer = opts.deferWater && !opts.rebuild && !built && !stored && this.mode === "live" && doc.base.world !== null;
    if (defer) {
      const { layer } = this.baseStuff();
      const W = this.gen.base.sizeX, H = this.gen.base.sizeY;
      this.cur = buildMap(this.input(), { water: "defer", initialWater: { model: modelOf({ W, H, heights: layer.heights, entities: layer.entities }), water: layer.water! } });
    } else this.cur = built ?? stored ?? buildMap(this.input());
    if (this.mode !== "live" && this.baseStuff().terrain.columns.size) {
      this.notices.push("This map has caves or overhangs. Brushes shape only their tops; the Block tool and Erode can change the rest.");
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
    if (!storedFits(doc.stored, doc.edits.length, this.seqNext) || this.gen.base.world === null) return null;
    const b = restoreBuilt(doc.stored, this.gen.base.sizeX, this.gen.base.sizeY, this.gen.spec?.seed ?? 0);
    if (!b) return null;
    const input = this.input();
    const slopes = input.generatedSlopes ?? null;
    const list = b.cache.terrain.slopeList;
    // (the generation's slopes the build checked: the same list as this session's, bound to it)
    const slopeList = list && slopes && JSON.stringify(list) === JSON.stringify(slopes) ? slopes : list;
    b.cache = { ...b.cache, base: input.base ?? null, field: input.field ?? null, locked: input.locked ?? null, terrain: { ...b.cache.terrain, slopeList } };
    const dropped = groundDropped(input.base?.terrain ?? input.field?.caves ?? null, b.heights, b.entities, masksOf(b.cache.terrain), b.W, b.H);
    if (dropped) b.dropped = dropped;
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

  /** Whether only the step the history stands at can be kept as a version: the replay differed, so the map as saved is the
   *  earliest state and no other step can be built (D455). */
  get keepOnlyHere(): boolean {
    return !this.pending && this.floor > 0;
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

  /** The canonical settle of the current map's water, in slices (`advance`), for `adoptWater`. On a
   *  map with caves an edit that left the water provably as it was settles at once (`lastSettled`,
   *  sim/stackWater.ts `settledAgain`). */
  canonicalRun(): { model: WaterModel; advance(ticks: number): CanonicalWater | null; readonly ticks: number; readonly maxTicks: number } {
    const model = this.cur.waterModel;
    const run = canonicalRun(model, {}, this.lastSettled());
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

  /** The map's own canonical settle when `model` is the water model it ran on, else null: a caller
   *  that built the model another way (from the exported file) need not settle it again. */
  settledFor(model: WaterModel): CanonicalWater | null {
    return !this.waterPending && !this.cur.waterFromFile && sameWaterModel(model, this.cur.waterModel) ? this.cur.settle : null;
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
   *  where it stood, as after an edit (`relog`). The history becomes the log's steps, with nothing to
   *  redo and no save point. The same map, byte for byte, as replaying the whole log (`replay`). */
  followLog(log: readonly AppliedOp[], nextSeq: number): void {
    this.floor = 0;
    this.pending = null;
    this.relog(log, nextSeq, null);
  }

  /** The log becomes `log`: the operations both logs share from the start stay as they are (their
   *  state, and the caches the build keys on them), those after are taken back and the new ones
   *  applied in order, and the map is rebuilt from where it stood, as after an edit. The history is
   *  `steps` (each step's operation numbers, and its label), or the log's own steps; nothing is left
   *  to redo. The kept maps stay for the leading steps that hold the very same operations as before
   *  (whether or not the log marks its steps), and only those. */
  private relog(log: readonly AppliedOp[], nextSeq: number, steps: readonly { seqs: readonly number[]; label?: string }[] | null): void {
    const before = this.undoStack;
    let keep = 0;
    while (keep < log.length && keep < this.log.length && sameOp(this.log[keep], log[keep])) keep++;
    // (a log that differs only by the description's operations leaves the map as it stands: nothing to build)
    let builds = false;
    for (let k = this.log.length - 1; k >= keep; k--) {
      builds ||= this.log[k].op !== "setDescription";
      invertOp(this.st, this.log[k]);
      if (isCrop(this.log[k])) this.leaveCrop();
    }
    this.log.length = keep;
    for (let k = keep; k < log.length; k++) {
      const copy = clone(log[k]) as AppliedOp;
      builds ||= copy.op !== "setDescription";
      applyOp(this.st, copy);
      this.log.push(copy);
      // (the map as it stands before the crop, then the crop)
      if (isCrop(copy)) {
        this.cur = this.rebuilt();
        this.enterCrop(this.cropGeneration(copy.params).gen);
      }
    }
    this.seqNext = nextSeq;
    const bySeq = new Map(this.log.map((o) => [o.seq, o]));
    this.undoStack = steps ? steps.map((g) => ({ kind: "ops" as const, ops: g.seqs.map((n) => bySeq.get(n)!), ...(g.label ? { label: g.label } : {}) })) : stepsOf(this.log);
    // (the leading steps of the very same operations: their maps stand as they were)
    let shared = 0;
    while (shared < before.length && shared < this.undoStack.length && sameItems(before[shared].ops, this.undoStack[shared].ops)) shared++;
    this.redoStack = [];
    for (const k of [...this.snaps.keys()]) if (k > shared) this.snaps.delete(k);
    if (builds) this.cur = this.rebuilt();
  }

  /** Take one step out of the log, or put it back where it stood (collaborative editing's undo and
   *  redo of a step that is not the latest, D362): `remove` names a step of the history by its first
   *  operation's number (`seq`), `insert` gives its operations as the log kept them (`stepOps`), with
   *  its label. The operations after it are applied again in order, and the map rebuilt from where it
   *  stood, as an edit is (`relog`): about one edit's cost, never a rebuild of the whole log. The other
   *  steps stay as they were, each one step; nothing is left to redo. A step below the save point of a
   *  map opened from its stored map waits on the replay comparison, as undo does (D455). False, and
   *  nothing changes, when there is no such step to take out, an operation to put back is in the log
   *  already, or the save point stops it. */
  spliceStep(change: { remove: number } | { insert: readonly AppliedOp[]; label?: string }): boolean {
    const steps = this.undoStack.map((e) => ({ seqs: e.ops.map((o) => o.seq), ...(e.label ? { label: e.label } : {}) }));
    let at: number;
    let log: AppliedOp[];
    if ("remove" in change) {
      at = steps.findIndex((g) => g.seqs[0] === change.remove);
      if (at < 0) return false;
      const gone = new Set(steps[at].seqs);
      steps.splice(at, 1);
      log = this.log.filter((o) => !gone.has(o.seq));
    } else {
      const ops = [...change.insert].sort((a, b) => a.seq - b.seq);
      const seqs = new Set(this.log.map((o) => o.seq));
      if (!ops.length || ops.some((o) => seqs.has(o.seq)) || new Set(ops.map((o) => o.seq)).size !== ops.length) return false;
      at = steps.findIndex((g) => g.seqs[0] > ops[0].seq);
      if (at < 0) at = steps.length;
      steps.splice(at, 0, { seqs: ops.map((o) => o.seq), ...(change.label ? { label: change.label } : {}) });
      log = [...this.log, ...ops].sort((a, b) => a.seq - b.seq);
    }
    // (below the save point: the replay comparison first, here, when it is owed; it decides, D455)
    if (at < this.floor && (!this.pending || !this.checkReplay())) return false;
    this.relog(log, Math.max(this.seqNext, ...log.map((o) => o.seq + 1)), steps);
    return true;
  }

  /** The operations of the history's step whose first operation is `seq`, as the log keeps them
   *  (for `spliceStep`'s `insert`); empty when there is none. Copies. */
  stepOps(seq: number): AppliedOp[] {
    const e = this.undoStack.find((s) => s.ops[0].seq === seq);
    return e ? (clone(e.ops) as AppliedOp[]) : [];
  }

  /** The label of the history's step whose first operation is `seq` (for `spliceStep`'s `insert`). */
  stepLabel(seq: number): string | undefined {
    return this.undoStack.find((s) => s.ops[0].seq === seq)?.label;
  }

  /** The map as it stood after History step `k` (the index `history()` lists; −1: before the first step, or at the save
   *  point of a map whose earlier steps cannot be undone), steps undone since included, as a project file of its own:
   *  the same land, the History's first steps replayed on it (the operations with their step grouping, so the copy opens
   *  with its History up to that step, D456), named "<map name> — <step label>", with where it came from in its meta.
   *  The project carries the stored map, so it reopens byte for byte (D455), when the session has that step's settled
   *  build (the one it stands at, or a kept one near it: no rebuild). Otherwise it is rebuilt here (`rebuild`, the default,
   *  a full build: seconds at 256²), or, with `rebuild: false`, the project comes without the stored map and `built` is null
   *  (the caller builds it elsewhere: it opens by replaying, as a project with no stored map does). A step other than where
   *  the history stands waits on the replay comparison of a map opened from its stored map, and once that replay differed
   *  there is none to give (D455). Null when there is no such step. */
  versionProject(k: number, from: { id?: string } = {}, level = 6, opts: { rebuild?: boolean } = {}): { bytes: Uint8Array; name: string; parent: VersionParent; built: BuildResult | null; stored: boolean } | null {
    const steps = [...this.undoStack, ...this.redoStack.slice().reverse()];
    const upto = this.reach + k + 1;
    if (k < -1 || upto > steps.length) return null;
    const here = upto === this.undoStack.length;
    if (!here) {
      if (this.pending && !this.checkReplay()) return null;
      if (!this.pending && this.floor > 0) return null;
    }
    const label = upto === 0 ? (this.gen.spec ? "The generated map" : "Opened the map") : upto === this.reach ? "The map as saved" : (steps[upto - 1].label ?? labelOf(steps[upto - 1].ops[0]));
    const parent: VersionParent = { ...(from.id ? { id: from.id } : {}), name: this.gen.meta.name, label, steps: upto };
    const name = versionName(this.gen.meta.name, label);
    const doc = this.document;
    const cut = clone(steps.slice(0, upto).flatMap((e) => e.ops)) as AppliedOp[];
    const { state } = replay(baseFeaturesOf(doc), cut);
    const meta = { ...doc.meta, name, parent };
    delete meta.views;
    const version: MapDocument = { ...doc, baseFeatures: baseFeaturesOf(doc), features: state.features, edits: cut, meta };
    const kept = here ? this.cur : this.snaps.get(upto);
    if (kept && kept.settle.preview !== true && kept.settle.stale !== true) {
      let stored: StoredState | null = null;
      try {
        stored = storeBuilt(kept, cut.length, this.seqNext);
      } catch {
        // a map the stored format cannot carry: kept without it, and reopened by rebuilding
      }
      return { bytes: encodeProject(stored ? { ...version, stored } : version, level), name, parent, built: kept, stored: !!stored };
    }
    if (opts.rebuild === false) return { bytes: encodeProject(version, level), name, parent, built: null, stored: false };
    const s = new MapSession(version, undefined, { rebuild: true });
    return { bytes: s.project(level), name, parent, built: s.built, stored: true };
  }

  /** Open a document (from `decodeProject`, `toDocument` or `importDocument`). A document with a
   *  stored map opens from it without rebuilding (D367); `rebuild` builds it from its generation and
   *  its log instead (the replay, D455). */
  static open(doc: MapDocument, opts: { rebuild?: boolean; deferWater?: boolean } = {}): MapSession {
    checkDocument(doc);
    return new MapSession(doc, undefined, opts);
  }

  /** The session of a map the generator just made: its own build is the starting map. */
  static fromGenerated(r: GenerateResult, file?: TimberFile, seedWord?: string): MapSession {
    const doc = toDocument(r.spec, r.features, r.built, file, r.field, seedWord);
    // (M9b, D278 (1b): the map's own name and how it plays)
    if (r.name) doc.meta.name = doc.meta.generatedName = r.name;
    if (r.description) doc.meta.premise = r.description;
    if (r.says?.length) doc.meta.says = [...r.says];
    return new MapSession(doc, r.built);
  }

  /** Import any .timber map (PLAN §19.6); `place`: a real place's (its id, `DocMeta.place`). Throws
   *  ImportError for saves. */
  static importMap(bytes: Uint8Array, fileName: string, place?: string): MapSession {
    return new MapSession(importDocument(bytes, fileName, place));
  }

  // --------------------------------------------------------------------------------- reading

  get mode(): SessionMode {
    if (!this.gen.spec) return "import";
    return this.gen.generatorVersion !== GENERATOR_VERSION && this.gen.base.world !== null ? "frozen" : "live";
  }

  /** Whether the map was cropped (D340): it is built from the cropped file, and has no "as opened" map to compare
   *  its problems with, so every problem it has is the player's own. */
  get cropped(): boolean {
    return !!this.gen.cropped;
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

  /** The map's terrain as it stands, as runs per tile (D119): the build's surface, an imported map's
   *  caves and overhangs with their top runs shaped as the edits left them and everything under a
   *  roof kept exactly (D280 (3)), and the ground the Block tool dug or built (D335). A fresh copy. */
  get terrain(): ColumnTerrain {
    const t = this.terrainOf(this.cur);
    return new ColumnTerrain(t.W, t.H, t.mask.slice());
  }

  private readonly terrains = new WeakMap<BuildResult, ColumnTerrain>();

  /** The ground of a build of this document (shared, never to be changed): its base under its surface
   *  with the Block tool's tiles as they left them (terrain/blocks.ts `terrainUnder`). */
  private terrainOf(b: BuildResult): ColumnTerrain {
    let t = this.terrains.get(b);
    if (!t) {
      const { x: W, y: H } = this.size;
      t = terrainUnder(this.caveBase(b), b.heights, masksOf(b.cache.terrain), W, H);
      this.terrains.set(b, t);
    }
    return t;
  }

  /** Whether a build's ground has any tile that is not one plain run from the bottom: an imported map's
   *  caves and overhangs, or ground the Block tool dug. A heightfield drops nothing, and none of the
   *  support rule's work is done on one. */
  private layered(b: BuildResult): boolean {
    return (this.mode !== "live" ? this.baseStuff().terrain.columns.size > 0 : !!b.cache.field?.caves) || layeredMasks(masksOf(b.cache.terrain));
  }

  /** The terrain a build's surface reshapes when it is not a heightfield: an imported (or frozen) map's
   *  base, or a generated map's field with the 3D forms the generation grew (D488); null otherwise. */
  private caveBase(b: BuildResult): ColumnTerrain | null {
    return this.mode === "live" ? (b.cache.field?.caves ?? null) : this.baseStuff().terrain.terrain;
  }

  /** The ground as it stands, voxel by voxel, for the placement rule under a roof (D491, features/objects.ts
   *  `standProblem`): shared, never to be changed. */
  standGround(): StandGround {
    const t = this.terrainOf(this.cur);
    return { W: t.W, H: t.H, mask: t.mask };
  }

  /** Whether a tile is one plain run from the bottom: no cave or overhang, so objects may stand there and
   *  the forces shape it (the brushes shape every tile's top run, D487).
   *  Every tile of a generated map until the Block tool digs one. */
  plainAt(i: number): boolean {
    const m = masksOf(this.cur.cache.terrain).get(i);
    if (m !== undefined) return isPlainMask(m);
    const caves = this.caveBase(this.cur);
    return !caves || caves.isPlain(i);
  }

  /** The map's voxel columns that are not one plain run (tile index → its 23 voxels) as they stand,
   *  for the voxel mesher: an imported map's caves and overhangs with their tops as the brushes left
   *  them (D280 (3)), and the ground the Block tool dug or built (D335). Empty for a heightfield. */
  get columns(): ReadonlyMap<number, Uint8Array> {
    const c = this.columnsCache;
    if (c && c.key === this.cur) return c.columns;
    const columns = new Map<number, Uint8Array>();
    if (this.layered(this.cur)) {
      const t = this.terrainOf(this.cur);
      for (const i of t.notPlain()) columns.set(i, t.column(i, LAYERS));
    }
    this.columnsCache = { key: this.cur, columns };
    return columns;
  }
  private columnsCache: { key: BuildResult; columns: Map<number, Uint8Array> } | null = null;

  /** The blocks of ground the map as it stands would lose that it did not lose as `before` (D121,
   *  D280 (3)): what the last step makes fall, by cell (z·N + tile). Empty on a heightfield, and
   *  when neither the ground nor the objects holding ground changed. */
  private fallsSince(before: BuildResult): number[] {
    const now = this.cur;
    if (!this.layered(before) && !this.layered(now)) return [];
    const { x: W, y: H } = this.size;
    const tops0 = this.topsOf(before.entities);
    const tops1 = this.topsOf(now.entities);
    if (sameBytes(before.heights, now.heights) && tops0.length === tops1.length && tops0.every((c, k) => c === tops1[k]) && sameMasks(masksOf(before.cache.terrain), masksOf(now.cache.terrain))) return [];
    return newFalls(this.terrainOf(before), this.terrainOf(now), tops0, tops1);
  }

  /** The ground holding objects set under a roof on the map as it stands (D491, objects.ts
   *  `objectHolds`): [tile, low, high]; empty on a heightfield and where no object reaches out of its
   *  roof. The same for a build. */
  holds(): [number, number, number][] {
    const c = this.holdsCache;
    if (c && c.key === this.cur) return c.holds;
    const holds = this.layered(this.cur) ? objectHolds(this.cur.entities, { ...this.standGround(), heights: this.cur.heights }) : [];
    this.holdsCache = { key: this.cur, holds };
    return holds;
  }
  private holdsCache: { key: BuildResult; holds: [number, number, number][] } | null = null;

  /** A stroke or a sculpt with the ground that holds objects set under a roof (D491): it keeps those
   *  tiles within their floor and ceiling and shapes the rest as normal, never refused for them (D270).
   *  Only the held tiles in its reach, and one tile round it (the integrity pass reads each tile's
   *  neighbours), go in the operation: the build keeps those, and only those, from the integrity pass,
   *  so a stroke never moves held ground elsewhere on the map, and the page's preview, which keeps every
   *  held tile, agrees inside the only ground the stroke changes. */
  private withHold(op: EditOp): EditOp {
    if ((op.op !== "brush" && op.op !== "sculpt") || op.params.hold) return op;
    const all = this.holds();
    if (!all.length) return op;
    const { x: W, y: H } = this.size;
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (op.op === "brush") box = brushBounds(op.params, W, H);
    else
      for (const [y, a, b] of op.params.cells)
        box = box ? { x0: Math.min(box.x0, a), y0: Math.min(box.y0, y), x1: Math.max(box.x1, b), y1: Math.max(box.y1, y) } : { x0: a, y0: y, x1: b, y1: y };
    if (!box) return op;
    const hold = all.filter(([i]) => {
      const x = i % W;
      const y = Math.floor(i / W);
      return x >= box.x0 - 1 && x <= box.x1 + 1 && y >= box.y0 - 1 && y <= box.y1 + 1;
    });
    if (!hold.length) return op;
    return { ...op, params: { ...op.params, hold: hold.map((h) => [...h] as [number, number, number]) } } as EditOp;
  }

  /** Why a held stroke or sculpt is refused (D491): only when holding leaves it nothing to shape, every
   *  tile it covers being ground that holds an object under a roof; null otherwise. */
  private heldOnly(op: EditOp, before: BuildResult): string | null {
    if ((op.op !== "brush" && op.op !== "sculpt") || !op.params.hold?.length) return null;
    if (!sameBytes(before.heights, this.cur.heights)) return null;
    const { x: W, y: H } = this.size;
    const held = new Set(op.params.hold.map(([i]) => i));
    const tiles: number[] = [];
    if (op.op === "brush") {
      const m = new Uint8Array(W * H);
      markBrushTiles(op.params, W, H, m);
      for (let i = 0; i < m.length; i++) if (m[i]) tiles.push(i);
    } else for (const [y, a, b] of op.params.cells) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) tiles.push(y * W + x);
    if (!tiles.length || !tiles.every((i) => held.has(i))) return null;
    return "nothing to shape here: this ground holds an object under a roof, which the edit leaves as it is";
  }

  /** The first object the map as it stands would lose that it kept as `before`, in one line, or null
   *  (D491): an object on a tile with a cave or an overhang that the game's rule held on `before`'s ground
   *  and no longer holds (inside the ground or floating: the game removes it on load). Nothing on open
   *  ground (its objects ride it), and nothing on a heightfield. A last guard: the strokes and sculpts hold
   *  that ground, the forces run round it, and Erode keeps the ground under every object (D270). And a
   *  spring's source the build now leaves out of its row where the game would not keep it (D342: an
   *  edit is refused with the reason, never takes a source away silently; build.ts `springsLeft`). */
  private lostSince(before: BuildResult): string | null {
    const now = this.cur;
    if (!this.layered(before) && !this.layered(now)) return null;
    const left = new Set((before.springsLeft ?? []).map((s) => s.id));
    const out = (now.springsLeft ?? []).find((s) => !left.has(s.id));
    if (out) return `it would leave out a spring's water source at (${out.x}, ${out.y}): ${out.why}`;
    const { x: W, y: H } = this.size;
    const t0 = this.terrainOf(before);
    const g0 = { W, H, mask: t0.mask };
    const g1 = this.standGround();
    const was = new Map(before.entities.map((e) => [e.id, e]));
    for (const e of now.entities) {
      const b = was.get(e.id);
      if (!b) continue;
      const tiles = entityTiles(e).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => y * W + x);
      if (tiles.every((i) => isPlainMask(g0.mask[i]) && isPlainMask(g1.mask[i]))) continue;
      if (standProblem(b.template, b, g0) || !standProblem(e.template, e, g1)) continue;
      return `it would leave ${withArticle(itemName(e.template))} at (${e.x}, ${e.y}) inside the ground or floating, and the game would remove it`;
    }
    return null;
  }

  /** How many blocks of ground an operation just put in the log would make fall, worked out from the
   *  build's terrain steps alone (`previewTerrain`), with the objects as they stand: 0 when it makes
   *  none, on a heightfield, or for an operation that reshapes no ground (the full build's check after
   *  it covers the rest, D280 (3)). */
  private fallsAhead(op: EditOp): number[] {
    if (op.op !== "brush" && op.op !== "sculpt" && op.op !== "forceResult") return [];
    if (!this.layered(this.cur)) return [];
    const { x: W, y: H } = this.size;
    const { heights } = previewTerrain(this.cur, this.input());
    if (sameBytes(heights, this.cur.heights)) return [];
    // (a stroke that tilts a piece riding it is given again with the piece level: the build's check)
    if (op.op === "brush" && !this.riding && tiltedPieces(ridingPieces(this.cur.entities, W, H), this.cur.heights, heights, W).length) return [];
    return this.forceFalls(heights);
  }

  /** The blocks of ground the map would lose with its surface at `heights` (and, for Erode's result,
   *  its voxels `masks`) and its objects `entities` (left out, as they stand), that it does not lose
   *  now: by cell (z·N + tile), ascending. A force asks it of its planned result before it plays, so
   *  it is never shown and then taken back (D487; forces/start.ts `fallsBeforePlay`): an object it took
   *  that held a roof holds it no more. Empty on a heightfield. */
  forceFalls(heights: ArrayLike<number>, masks?: Uint32Array | null, entities?: readonly Placement[]): number[] {
    if (!this.layered(this.cur)) return [];
    const { x: W, y: H } = this.size;
    const tops = this.topsOf(this.cur.entities);
    const after = entities ? stackableTops(W, H, entities) : tops;
    const base = this.caveBase(this.cur);
    const ground = masks ? new ColumnTerrain(W, H, masks) : terrainUnder(base, heights, masksOf(this.cur.cache.terrain), W, H);
    return newFalls(this.terrainOf(this.cur), ground, tops, after);
  }

  /** The refusal for ground that would fall: a force's names the place of the first block, as nothing
   *  on its showing marks it (a stroke's and a block's are drawn red first). */
  private fallsRefusal(ops: readonly EditOp[], falls: readonly number[]): string {
    const { x: W, y: H } = this.size;
    return fallsReason(falls.length, ops.some((o) => o.op === "forceResult") ? placeOf(falls[0], W, H) : undefined);
  }

  /** The Block tool's query (D335, docs/progress/3d-creating.md): what an operation would do to the
   *  ground as it stands, and what the game's support rule would drop because of it, before anything
   *  is applied. `added` and `removed` are the blocks it changes, as [x, y, layer]; `falls` the blocks
   *  of ground that would drop (nothing holding them up), the cells `apply` refuses with
   *  `fallsReason`. `errors` is the one line why it cannot be taken at all (a cell off the map or the
   *  layers, on an object, nothing to change); then the three are empty. Plain data, nothing changes. */
  blockFalls(params: OpParams["blocks"]): BlockFalls {
    const { x: W, y: H } = this.size;
    const none = (errors: string[]): BlockFalls => ({ reason: errors[0], errors, added: [], removed: [], falls: [], plantsRemoved: 0, plantsRiding: 0 });
    const bad = schemaProblems({ op: "blocks", params });
    if (bad.length) return none(bad);
    const t = this.terrainOf(this.cur);
    const effect = blockEffect(params, t, this.groundOf(this.cur.entities));
    if (effect.errors.length) return none(effect.errors);
    const after = withBlocks(t, effect.added, effect.removed);
    const cells = (list: readonly number[]) => list.map((c): [number, number, number] => [c % W, Math.floor((c % (W * H)) / W), Math.floor(c / (W * H))]);
    // (what falls now was falling before, or it is not this step's)
    const now = unsupportedVoxels(after, this.topsOf(this.cur.entities));
    const was = this.unsupportedOf(this.cur);
    const fell: number[] = [];
    for (let c = 0; c < now.length; c++) if (now[c] && !was[c]) fell.push(c);
    const falls = cells(fell);
    return { reason: falls.length ? fallsReason(falls.length) : null, errors: [], added: cells(effect.added), removed: cells(effect.removed), falls, plantsRemoved: effect.plants.length, plantsRiding: effect.riding };
  }

  // What a build's objects mean to the Block tool and the support rule, worked out once per build (the
  // page asks on every pointer tile).
  private readonly grounds = new WeakMap<object, BlockGround>();
  private readonly tops = new WeakMap<object, number[]>();
  private readonly unsupported = new WeakMap<BuildResult, Uint8Array>();

  private groundOf(entities: BuildResult["entities"]): BlockGround {
    let g = this.grounds.get(entities);
    if (!g) {
      const { x: W, y: H } = this.size;
      this.grounds.set(entities, (g = blockGround(entities, W, H)));
    }
    return g;
  }

  private topsOf(entities: BuildResult["entities"]): number[] {
    let t = this.tops.get(entities);
    if (!t) {
      const { x: W, y: H } = this.size;
      this.tops.set(entities, (t = stackableTops(W, H, entities)));
    }
    return t;
  }

  /** The blocks of a build's ground the game deletes (support.ts `unsupportedVoxels`), once per build. */
  private unsupportedOf(b: BuildResult): Uint8Array {
    let u = this.unsupported.get(b);
    if (!u) this.unsupported.set(b, (u = unsupportedVoxels(this.terrainOf(b), this.topsOf(b.entities))));
    return u;
  }

  /** Take back the step taken since `mark` (one that would make ground fall) as if it had never been
   *  taken, the map back to `before`. */
  private refuseStep(mark: HistoryMark, seq: number, before: BuildResult): void {
    const step = this.stepSince(mark);
    if (!step) return;
    this.snaps.set(mark.depth, before);
    if (this.takeBack(step)) this.seqNext = seq;
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

  /** Whether the map's water is the file's own (an unedited import, whose water export keeps): the
   *  3D view then draws `storedWater()`, not `built.water`. */
  get showsStoredWater(): boolean {
    if (this.mode === "live") return false;
    return this.cur.waterFromFile;
  }

  /** The map's water model and the water it shows now, one depth per tile (an unedited import's own
   *  water while it keeps it, `showsStoredWater`; else the build's), and on a map with caves or
   *  overhangs every column of it (`stack`): what Remove unfed water and Fill measure and are checked
   *  against (doc/waterEdits.ts). */
  waterNow(): { model: WaterModel; depth: Float64Array; stack?: StackSettle } {
    const own = this.showsStoredWater ? this.baseStuff().layer.water : undefined;
    const stack = (own ?? this.cur.settle).stack;
    return { model: this.cur.waterModel, depth: own?.depth ?? this.cur.water, ...(stack ? { stack } : {}) };
  }

  /** The water the map shows now, which a Drought or a Badtide starts from (sim/weather.ts `HazardRun`):
   *  an unedited import's own water while it keeps it (`showsStoredWater`), else the build's; per tile
   *  from above, and on a map with caves or overhangs every column of it (`stack`). The same object
   *  until the map's water changes. */
  waterShown(): CanonicalWater {
    return this.showsStoredWater ? this.baseStuff().layer.water! : this.cur.settle;
  }

  /** The tiles with a cave, tunnel or overhang (an imported map's, and the ground the Block tool
   *  dug), whose top runs the brushes shape and the rest only the Block tool and Erode change (D487;
   *  the "Caves and overhangs" layer marks them). An import's are simulated with the rest of its
   *  water (D120). Empty for a heightfield map. */
  get roofedTiles(): ReadonlySet<number> {
    return new Set(this.columns.keys());
  }

  /** The water an imported map holds under its roofs (the file's own, which the editor shows and the
   *  export keeps), a bit per level of each tile; null when it has none. Erode never wears rock that
   *  holds it back (D281). */
  caveWater(): Uint32Array | null {
    if (this.mode === "live") return null;
    const roofed = this.roofedTiles;
    if (!roofed.size) return null;
    const w = this.storedWater();
    const { x: W, y: H } = this.size;
    let out: Uint32Array | null = null;
    for (let k = 0; k < w.tile.length; k++) {
      const i = w.tile[k];
      if (!roofed.has(i) || !(w.depth[k] > 0.02) || w.floor[k] < 0) continue;
      out ??= new Uint32Array(W * H);
      const top = Math.min(LAYERS, Math.ceil(w.floor[k] + w.depth[k] - 0.02));
      for (let z = Math.floor(w.floor[k]); z < top; z++) out[i] |= 1 << z;
    }
    return out;
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
      // (the ground holding objects under a roof is left by the integrity pass, as the build leaves it, D491)
      protect: this.heldProtect(t.protect),
      channel: t.channel.slice(),
      base: base ? base.heights.slice() : null,
      locked: locked ? locked.slice() : null,
      columns: Int32Array.from([...this.columns.keys()].sort((a, b) => a - b)),
      ...(this.columns.size ? this.roofState() : {}),
      ...(this.holds().length ? { hold: this.holds().map((h) => [...h] as [number, number, number]) } : {}),
      starts: this.st.features.filter((f): f is StartFeature => f.kind === "start"),
      water: this.cur.water.slice(),
      moisture: this.cur.moisture.slice(),
    };
  }

  /** The build's protected tiles with the ground holding objects under a roof (D491). */
  private heldProtect(protect: Uint8Array): Uint8Array {
    const out = protect.slice();
    for (const [i] of this.holds()) if (i >= 0 && i < out.length) out[i] = 1;
    return out;
  }

  /** On a map with caves or overhangs, what the page's strokes need of them (D280 (3)): the lowest
   *  each roof's top may go, the terrain's masks of those tiles as they stand, and the objects' tops
   *  that hold ground (StrokePreview `falls`). The ground the Block tool dug counts as caves. */
  private roofState(): Pick<TerrainState, "floor" | "masks" | "stackTops"> {
    const t = this.terrainOf(this.cur);
    const { x: W, y: H } = this.size;
    const tiles = [...this.columns.keys()].sort((a, b) => a - b);
    return {
      floor: t.topFloors(),
      masks: Uint32Array.from(tiles, (i) => t.mask[i]),
      stackTops: Int32Array.from(this.topsOf(this.cur.entities)),
    };
  }

  /** The water the base file stores (every level), for the 3D view. */
  storedWater(): ReturnType<typeof storedWater> {
    const b = this.baseStuff();
    if (this.storedWaterCache?.key !== this.gen.base) this.storedWaterCache = { key: this.gen.base, water: storedWater(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedWaterCache.water;
  }

  /** The outflows the base file stores of every column `storedWater` lists (four an entry, each column its own), for
   *  the 3D view's moving water and falls. */
  storedColumnOutflows(): Float32Array | null {
    const b = this.baseStuff();
    if (this.storedOutflowsCache?.key !== this.gen.base) this.storedOutflowsCache = { key: this.gen.base, out: storedColumnOutflows(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedOutflowsCache.out;
  }

  /** The soil the base file stores on each tile's top (moisture and contamination), for the 3D
   *  view's ground colours (Map look, D86). */
  storedSoil(): ReturnType<typeof storedSoilTops> {
    const t = this.baseStuff().terrain.terrain;
    // a tile's top column is its last run of solid voxels; the game's runs start with an empty one under a
    // column whose bottom voxel is air (sim/columns.ts `terrainColumns`), so its top is one slot further
    const topSlot = (i: number): number => Math.max(0, t.runCount(i) - (t.mask[i] & 1 ? 1 : 0));
    return storedSoilTops(this.storedSoilRuns(), this.gen.base.sizeX * this.gen.base.sizeY, topSlot);
  }

  /** The soil the base file stores on every run top (slot j of tile i at j·N + i), read once a base: the 3D
   *  view's ground colours on caves' floors too (3D view, part 3). */
  storedSoilRuns(): ReturnType<typeof storedSoilRuns> {
    const b = this.baseStuff();
    if (this.storedSoilCache?.key !== this.gen.base) this.storedSoilCache = { key: this.gen.base, soil: storedSoilRuns(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedSoilCache.soil;
  }

  /** The soil on every run top of a map with caves or overhangs whose water is a settle (or water
   *  carried over to its ground), as the file stores it (slot j of tile i at j·N + i): the 3D view's
   *  ground colours on caves' floors (`stackedSoil`, the soil the export writes). Null on a heightfield
   *  and while the file's own water stands (`storedSoilRuns` then). */
  settledSoilRuns(built: BuildResult = this.cur): { moisture: { slots: number; values: Float64Array }; contamination: { slots: number; values: Float64Array } } | null {
    if (built.waterFromFile) return null;
    const cs = this.caveSoilOf(built);
    return cs ? { moisture: { slots: cs.soil.runs.T, values: cs.soil.moisture }, contamination: { slots: cs.soil.runs.T, values: cs.soil.contamination } } : null;
  }

  private readonly caveSoils = new WeakMap<BuildResult, { cols: ReturnType<typeof waterColumns>; soil: ReturnType<typeof stackedSoil> } | null>();

  /** A build's water columns and its soil per run when its water is on stacked columns that fit its
   *  ground (`settle.stack`), else null; worked out once a build. */
  private caveSoilOf(built: BuildResult): { cols: ReturnType<typeof waterColumns>; soil: ReturnType<typeof stackedSoil> } | null {
    if (this.caveSoils.has(built)) return this.caveSoils.get(built)!;
    const stack = built.settle.stack;
    let out: { cols: ReturnType<typeof waterColumns>; soil: ReturnType<typeof stackedSoil> } | null = null;
    if (stack) out = stackSoilOf(this.terrainOf(built), stack, built.entities.map(toMapObject));
    this.caveSoils.set(built, out);
    return out;
  }

  /** The soil and the water on each run top as the map stands (D235, D491): what a plant standing at level z of tile i
   *  lives or dies on, under a roof as on top (`RunGround`; null where no run's top is z). The game's soil rule on the
   *  map's water on stacked columns (sim/soil.ts `stackedSoil`, as the checks read it, validate/rust.ts): the settle's,
   *  or, while the file's own water stands, that water's. Null on a map without caves or overhangs (one run a tile:
   *  the build's `moisture`) or water on its stacked columns. */
  runGrounds(built: BuildResult = this.cur): ((i: number, z: number) => RunGround | null) | null {
    let r = this.runSoils.get(built);
    if (r === undefined) {
      r = null;
      if (this.layered(built)) {
        if (built.waterFromFile) {
          const terrain = this.terrainOf(built);
          const objects = built.entities.map(toMapObject);
          const cols = waterColumns(terrain, objects);
          const stack = storedStack(cols, storedWater(this.openedFile().world.singletons, this.size.x, this.size.y));
          r = { soil: stackedSoil(terrain, cols, stack, objects), stack };
        } else {
          const cs = this.caveSoilOf(built);
          if (cs && built.settle.stack) r = { soil: cs.soil, stack: built.settle.stack };
        }
      }
      this.runSoils.set(built, r);
    }
    const got = r;
    return got ? (i, z) => runGround(got.soil, got.stack, i, z) : null;
  }

  private readonly runSoils = new WeakMap<BuildResult, { soil: Soil3d; stack: StackSettle } | null>();

  /** The document as it stands, for the project file and autosave. */
  get document(): MapDocument {
    // one document per generation, each holding the one before it (a crop starts the next, D340)
    const gens = [...this.past, { gen: this.gen, st: this.st, start: this.segStart }];
    let prior: MapDocument | undefined;
    gens.forEach(({ gen, st, start }, k) => {
      const next = gens[k + 1];
      const doc: MapDocument = {
        formatVersion: 3,
        app: "dam-good-maps",
        generatorVersion: gen.generatorVersion,
        spec: gen.spec,
        base: gen.base,
        ...(gen.field ? { field: gen.field } : {}),
        baseFeatures: gen.baseFeatures,
        kept: gen.kept,
        features: clone(st.features),
        edits: clone(this.log.slice(start, next ? next.start : this.log.length)),
        nextSeq: next ? this.log[next.start].seq : this.seqNext,
        meta: gen.meta,
        ...(prior ? { prior } : {}),
      };
      prior = doc;
    });
    return prior!;
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
      const local = this.log.length - this.segStart;
      stored = p && p.built === this.cur && p.state.edits === local && p.state.nextSeq === this.seqNext ? p.state : storeBuilt(this.cur, local, this.seqNext);
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
    for (const st of [...this.past.map((p) => p.st), this.st]) for (const e of st.entityEdits) if (e.op === "placeEntity") ids.add(e.params.id);
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

  get nextSeq(): number { return this.seqNext; }

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
      templateOf: (id) => this.cur.entities.find((e) => e.id === id)?.template,
      componentsOf: (id) => {
        const e = this.cur.entities.find((e) => e.id === id);
        return e ? (e.raw ? e.raw.Components : { ...(e.before ?? {}), ...e.components }) as Record<string, unknown> : undefined;
      },
      state: this.st,
      W,
      H,
      generated: !!this.gen.spec,
      entityIds,
      slopeTiles,
      lockedColumns: this.layered(this.cur) ? new Set(this.columns.keys()) : null,
      ...(op.op === "blocks" ? { blocks: { terrain: this.terrainOf(this.cur), ground: this.groundOf(this.cur.entities) } } : {}),
      otherStarts,
      water: this.waterNow(),
      heights: this.cur.heights,
      masks: this.standGround().mask,
      objectCells: (owner) => {
        const skip = resourceOwners(this);
        return objectCells(this.cur.entities, this.size.x, this.size.y, (e) => e.owner === owner || skip.has(e.owner));
      },
      startObjects,
      cropObjects: (r) => (cropObjects(this.cur.entities, r).cutStart ? START_CUT : null),
      placement: (p) => {
        const e = p.id ? this.cur.entities.find((g) => g.id === p.id) : undefined;
        const template = p.template ?? e?.template;
        if (!template) return null;
        return entityProblem(this, { template, x: p.x, y: p.y, ...(p.z !== undefined ? { z: p.z } : {}), orientation: p.orientation ?? e?.orientation ?? "Cw0", flipped: p.flipped ?? e?.flipped ?? false }, p.id ?? null);
      },
    });
    return errors;
  }

  /** Apply one operation. */
  apply(op: EditOp, origin: OpOrigin = "user", label?: string): ApplyResult {
    op = this.withHold(op);
    const errors = this.check(op);
    if (errors.length) return { ok: false, errors, applied: [], dirty: null };
    if (op.op === "paintObjects") return applyPaintObjects(this, op.params, origin, label);
    // (the Block tool's ground that would fall is refused before anything is built: the query the page shows)
    if (op.op === "blocks") {
      const f = this.blockFalls(op.params);
      if (f.falls.length) return { ok: false, errors: [fallsReason(f.falls.length)], applied: [], dirty: null };
    }
    if (op.op === "crop") return this.applyCrop(op, origin, label);
    if (op.op === "setDescription") return this.applyDescription(op, origin, label);
    const before = this.cur;
    const mark = this.mark();
    const seq = this.seqNext;
    const applied = this.applyChecked(op, origin, label);
    // (a reshaping that would make ground fall is refused on its terrain alone, before a whole build)
    const ahead = this.fallsAhead(op);
    if (ahead.length) {
      invertOp(this.st, applied);
      this.log.pop();
      this.seqNext = seq;
      return { ok: false, errors: [this.fallsRefusal([op], ahead)], applied: [], dirty: null };
    }
    this.pushHistory({ kind: "ops", ops: [applied] });
    this.cur = this.rebuilt();
    this.snapshot();
    const again = this.rideTilted([op], before, mark, seq);
    if (again) return this.ridden(() => this.apply(again[0], origin, label));
    // nothing an edit does may leave ground the game would drop (D121, D280 (3)): refused, with why
    const falls = this.fallsSince(before);
    if (falls.length) {
      this.refuseStep(mark, seq, before);
      return { ok: false, errors: [this.fallsRefusal([op], falls)], applied: [], dirty: null };
    }
    // a stroke held whole by the ground under objects in a cliff or a cave (D491), and, as a last guard,
    // an object under a roof or on one that the game would then remove
    const lost = this.heldOnly(op, before) ?? this.lostSince(before);
    if (lost) {
      this.refuseStep(mark, seq, before);
      return { ok: false, errors: [lost], applied: [], dirty: null };
    }
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
    // (the page's preview asks the same, StrokePreview `rides`)
    const rects = tiltedPieces(ridingPieces(this.cur.entities, W, H), before.heights, this.cur.heights, W);
    if (!rects.length) return null;
    const step = this.stepSince(mark);
    if (!step || !this.takeBack(step)) return null;
    this.seqNext = seq;
    // (its hold is worked out again with the pieces in its reach)
    return ops.map((o) => {
      if (o.op !== "brush") return o;
      const { hold: _hold, ...params } = o.params;
      return { ...o, params: { ...params, rigid: [...(o.params.rigid ?? []), ...rects] } };
    });
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
   *  one undo takes them all back. An empty group is refused: it would be a step that changes nothing. */
  applyAll(ops: readonly EditOp[], origin: OpOrigin = "user", label?: string): ApplyResult {
    if (!ops.length) return { ok: false, errors: ["nothing to change"], applied: [], dirty: null };
    const before = this.cur;
    const mark = this.mark();
    const seq = this.seqNext;
    const done: AppliedOp[] = [];
    for (const given of ops) {
      const op = this.withHold(given);
      const errors = op.op === "paintObjects" ? ["a placement stroke cannot be part of a group of edits"] : op.op === "crop" ? ["a crop cannot be part of a group of edits"] : this.check(op);
      if (errors.length) {
        for (const a of done.reverse()) {
          invertOp(this.st, a);
          this.log.pop();
        }
        if (done.some((a) => a.op !== "setDescription")) this.cur = this.rebuilt();
        this.seqNext = seq;
        return { ok: false, errors, applied: [], dirty: null };
      }
      done.push(this.applyChecked(op, origin, label, ops.length > 1 ? seq : undefined));
      // later operations of the group may refer to what earlier ones made (a description makes nothing)
      if (op.op !== "setDescription") this.cur = this.rebuilt();
    }
    this.pushHistory({ kind: "ops", ops: done, ...(label ? { label } : {}) });
    this.snapshot();
    const again = this.rideTilted(ops, before, mark, seq);
    if (again) return this.ridden(() => this.applyAll(again, origin, label));
    const falls = this.fallsSince(before);
    if (falls.length) {
      this.refuseStep(mark, seq, before);
      return { ok: false, errors: [this.fallsRefusal(ops, falls)], applied: [], dirty: null };
    }
    const lost = this.lostSince(before);
    if (lost) {
      this.refuseStep(mark, seq, before);
      return { ok: false, errors: [lost], applied: [], dirty: null };
    }
    return { ok: true, errors: [], applied: done, dirty: this.cur.dirty };
  }

  /** Crop map to selection (D340): the map becomes the rectangle, as the next generation (the cropped map as an
   *  imported one, its water settling again) and one undo step; undo is the map as it was. */
  private applyCrop(op: EditOp & { op: "crop" }, origin: OpOrigin, label?: string): ApplyResult {
    const { gen, objects } = this.cropGeneration(op.params);
    const applied = this.applyChecked(op, origin, label);
    this.enterCrop(gen);
    this.pushHistory({ kind: "ops", ops: [applied], cropped: gen });
    this.cur = this.freshBuild();
    this.snapshot();
    return { ok: true, errors: [], applied: [applied], dirty: null, removedObjects: objects.crossing.length };
  }

  /** A description written or taken away: a step on the history like any other, but it changes nothing on the
   *  map, so nothing is built and the map's picture, water and checks stay as they are. */
  private applyDescription(op: EditOp & { op: "setDescription" }, origin: OpOrigin, label?: string): ApplyResult {
    const applied = this.applyChecked(op, origin, label);
    this.pushHistory({ kind: "ops", ops: [applied] });
    this.snapshot();
    return { ok: true, errors: [], applied: [applied], dirty: { terrain: null, region: null, water: false, entities: false, objects: null } };
  }

  /** The generation a crop makes of the map as it stands: its settled water (a file always gets the canonical
   *  settle, so every replay of the log makes the same bytes), cropped as a file, as an imported map. */
  private cropGeneration(r: CropParams): { gen: Generation; objects: ReturnType<typeof cropFile>["objects"] } {
    this.settleCanonical();
    const { file, objects } = cropFile(this.exportFile(this.cur, { thumbnail: false }), r);
    const meta = { ...this.gen.meta };
    // (camera bookmarks name places on the map as it was)
    delete meta.views;
    return { gen: { spec: null, generatorVersion: GENERATOR_VERSION, base: baseFromFile(file, "import"), field: null, baseFeatures: [], kept: null, meta, cropped: true }, objects };
  }

  /** The map goes on as `gen`: the crop is already the last operation of the log. The map's name goes with it
   *  (D443: a rename is never undone, so no crop or undo of one brings an older name back). */
  private enterCrop(gen: Generation): void {
    this.past.push({ gen: this.gen, st: this.st, start: this.segStart });
    this.gen = this.named(gen);
    this.st = emptyState(gen.baseFeatures);
    this.segStart = this.log.length - 1;
  }

  /** `gen` with the name the map has now. */
  private named(gen: Generation): Generation {
    return gen.meta.name === this.gen.meta.name ? gen : { ...gen, meta: { ...gen.meta, name: this.gen.meta.name } };
  }

  /** The map goes back to the generation before its crop; returns the one it leaves. */
  private leaveCrop(): Generation {
    const before = this.past.pop();
    if (!before) throw new Error("there is no map before this crop");
    const left = this.gen;
    this.gen = this.named(before.gen);
    this.st = before.st;
    this.segStart = before.start;
    return left;
  }

  /** A full build of the current generation (the map changed size), its water carried over to be settled in the
   *  background when edits do not wait on the water. */
  private freshBuild(): BuildResult {
    const input = this.input();
    if (this.waterMode !== "defer") return buildMap(input, { water: this.waterMode });
    const { layer } = this.baseStuff();
    const W = this.gen.base.sizeX, H = this.gen.base.sizeY;
    return buildMap(input, { water: "defer", initialWater: { model: modelOf({ W, H, heights: layer.heights, entities: layer.entities }), water: layer.water! } });
  }

  /** A player's scatter placement: validate all literal placements, then one rebuild and one undo step. */
  applyBatch(ops: readonly EditOp[], origin: OpOrigin = "user", label?: string): ApplyResult {
    const fail = (reason: string): ApplyResult => ({ ok: false, errors: [reason], applied: [], dirty: null });
    if (!ops.length) return fail("there are no objects to place");
    const { x: W, y: H } = this.size;
    const ids = new Set<string>();
    const taken = new Set<number>();
    for (const e of this.cur.entities) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) taken.add(y * W + x);
    // (under a roof, at a level: the check holds it to the game's rule against the map's objects cell by cell, D491; within
    // the batch its cells are kept apart here)
    const cells = new Set<number>();
    for (const op of ops) {
      if (op.op !== "placeEntity") return fail("a placement batch only takes placeEntity operations");
      const errors = this.check(op);
      if (errors.length) return { ok: false, errors, applied: [], dirty: null };
      if (ids.has(op.params.id)) return fail("two objects in the placement have the same id");
      ids.add(op.params.id);
      const p = op.params;
      const e = placedEntity(p, p.z ?? this.cur.heights[p.y * W + p.x]);
      if (p.z !== undefined) {
        for (const c of worldBlocks(FOOTPRINTS[p.template], { template: p.template, x: p.x, y: p.y, z: p.z, orientation: p.orientation, flipped: !!p.flipped })) {
          const k = (c.z * H + c.y) * W + c.x;
          if (cells.has(k)) return fail("another object stands in the placement's footprint");
          cells.add(k);
        }
        continue;
      }
      for (const [x, y] of entityTiles(e)) {
        const i = y * W + x;
        if (taken.has(i)) return fail("another object stands in the placement's footprint");
        taken.add(i);
      }
    }
    // (a batch of several is one step in the log too, so it stays one step when the project is reopened: D456)
    const first = this.seqNext;
    const done = ops.map((op) => this.applyChecked(op, origin, label, ops.length > 1 ? first : undefined));
    this.cur = this.rebuilt();
    this.pushHistory({ kind: "ops", ops: done, ...(label ? { label } : {}) });
    this.snapshot();
    return { ok: true, errors: [], applied: done, dirty: this.cur.dirty };
  }

  /** `step`: the `seq` of the first operation of the step, when the step holds several (D456). It is
   *  set here, before `applyOp` adds the undo data, so a log entry's keys come in one order live and
   *  after a reopen (which deletes and re-adds `undo`): a project saves byte for byte the same. */
  private applyChecked(op: EditOp, origin: OpOrigin, label?: string, step?: number): AppliedOp {
    const text = label ?? (op as { label?: string }).label;
    const applied = { op: op.op, params: clone(op.params), seq: this.seqNext++, origin, ...(text ? { label: text } : {}), ...(step !== undefined ? { step } : {}) } as AppliedOp;
    // a block operation keeps the blocks it changed, as it found them: the build and every replay apply those
    if (applied.op === "blocks") {
      const { x: W, y: H } = this.size;
      const e = blockEffect({ ...applied.params, cells: undefined }, this.terrainOf(this.cur), this.groundOf(this.cur.entities));
      const { plants: _asked, stands: _stands, ...rest } = applied.params;
      applied.params = { ...rest, cells: cellPairs(applied.params.mode === "add" ? e.added : e.removed, W * H), ...(e.plants.length ? { plants: e.plants } : {}), ...(e.stands.length ? { stands: e.stands } : {}) };
    }
    // a new weathering Naturalize stroke weathers like nature, dab by dab (D399, rule 5): its rule is
    // recorded in it, so it replays the same, and strokes saved before keep their rule (rule 4, the
    // top cut back whatever its foot took; rule 3, dab by dab with some scree slopes lost; rule 2,
    // the whole stroke at once, saved with where water would stand round it, `rim`)
    // (a rule painted on the page comes with its rule but never its ring: added here)
    if (applied.op === "brush" && applied.params.tool === "naturalize" && applied.params.weathers && (applied.params.weathering === undefined || (byDabRule(applied.params.weathering) && applied.params.rim === undefined))) {
      const pre = this.cur.cache.terrain.pre7;
      const rim = weatherRim(applied.params, pre, waterLevels(pre, this.size.x, this.size.y), this.size.x, this.size.y);
      applied.params = { ...applied.params, weathering: applied.params.weathering ?? WEATHERING, ...(rim.length ? { rim } : {}) };
    }
    // and where the settled water stood round it (rule 3: and the moist ground), unless the page
    // recorded the water it showed
    const p = applied.op === "brush" ? applied.params : null;
    if (p && (p.weathering === 2 || byDabRule(p.weathering)) && p.shore === undefined && p.pools === undefined && p.moist === undefined) {
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
      // (the map is the generation before the crop again)
      if (isCrop(last)) e.cropped = this.leaveCrop();
    }
    this.redoStack.push(e);
    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();
    this.snapshot();
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    for (const op of e.ops) {
      applyOp(this.st, op);
      this.log.push(op);
      if (isCrop(op)) this.enterCrop(e.cropped ?? this.cropGeneration(op.params).gen);
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
    return { depth: this.undoStack.length, below: this.undoStack.at(-1) ?? null, redo: this.redoStack.slice(), step: null, seq: this.seqNext };
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
    this.seqNext = mark.seq;
    this.redoStack = (mark.redo as HistoryEntry[]).slice();
    for (const k of [...this.snaps.keys()]) if (k > this.undoStack.length) this.snaps.delete(k);
    return true;
  }

  /** The latest step of the history, named for `takeBack` (as `stepSince` names one), with what
   *  Redo holds now; null when undo cannot reach a step. */
  latestStep(): HistoryMark | null {
    const depth = this.undoStack.length - 1;
    if (depth < this.reach) return null;
    const e = this.undoStack[depth];
    return { depth, below: this.undoStack[depth - 1] ?? null, redo: this.redoStack.slice(), step: e, seq: e.ops[0].seq };
  }

  /** The latest step kept as it stands, to put back later exactly (`putStep`): its operations as the
   *  log keeps them, its label, the next operation number after it, and the map it built (never
   *  rebuilt when put back). Null when undo cannot reach a step. */
  keptStep(): KeptStep | null {
    const top = this.latestStep();
    if (!top) return null;
    const e = top.step as HistoryEntry;
    return { ops: clone(e.ops) as AppliedOp[], ...(e.label ? { label: e.label } : {}), nextSeq: this.seqNext, built: this.cur };
  }

  /** Put a step kept with `keptStep` back as the latest step, exactly as it was: its operations (their
   *  numbers too), the map it built as it was (no rebuild: D453), the next operation number after it;
   *  `label` names it in the history (else its own). Only where it was made (a force's rolls,
   *  core/forces/rolls.ts): false, and nothing changes, when the log holds an operation numbered at or
   *  after its first. Nothing is left to redo. */
  putStep(step: KeptStep, label?: string): boolean {
    const first = step.ops[0]?.seq;
    if (first === undefined || (this.log.at(-1)?.seq ?? -Infinity) >= first) return false;
    const ops = clone(step.ops) as AppliedOp[];
    for (const op of ops) {
      delete op.undo;
      applyOp(this.st, op);
      this.log.push(op);
    }
    const text = label ?? step.label;
    this.pushHistory({ kind: "ops", ops, ...(text ? { label: text } : {}) });
    this.seqNext = step.nextSeq;
    this.cur = step.built;
    this.snapshot();
    return true;
  }

  private pushHistory(e: HistoryEntry): void {
    this.undoStack.push(e);
    this.redoStack = [];
    for (const k of [...this.snaps.keys()]) if (k >= this.undoStack.length) this.snaps.delete(k);
  }

  /** Keep the map as it stands for this place in the history (see `NEAR_TILES`). */
  private snapshot(): void {
    const at = this.undoStack.length;
    this.snaps.set(at, this.cur);
    const near = Math.max(MIN_NEAR, Math.floor(NEAR_TILES / (this.gen.base.sizeX * this.gen.base.sizeY)));
    // (the steps further away go, but the map as opened and one every few steps)
    for (const k of [...this.snaps.keys()]) if (k !== 0 && k % SNAPSHOT_EVERY !== 0 && Math.abs(k - at) > near) this.snaps.delete(k);
    const sparse = [...this.snaps.keys()].filter((k) => k !== 0 && k % SNAPSHOT_EVERY === 0 && Math.abs(k - at) > near).sort((a, b) => a - b);
    while (sparse.length > MAX_SNAPSHOTS) this.snaps.delete(sparse.shift()!);
  }

  // ------------------------------------------------------------------------------ building

  private baseStuff(): { layer: BaseLayer; terrain: BaseTerrain; file: TimberFile } {
    const c = this.baseCache;
    if (c && c.key === this.gen.base) return c;
    const terrain = baseTerrain(this.gen.base);
    const file = fileFromBase(this.gen.base, terrain);
    const owners = this.gen.base.owners;
    const entities = file.world.entities.map((e, k) => rawEntity(e, owners?.[k] ?? "import"));
    const water = topWater(file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY, terrain.heights);
    // with caves or overhangs: the file's water on every column, for the view and the water carried
    // over to the first edit's ground (sim/stackWater.ts)
    if (!terrain.terrain.allPlain()) water.stack = storedStack(waterColumns(terrain.terrain, entities.map(toMapObject)), storedWater(file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY));
    const layer: BaseLayer = { terrain: terrain.terrain, heights: terrain.heights, entities, water, ...(this.gen.cropped ? { resettle: true } : {}) };
    this.baseCache = { key: this.gen.base, layer, terrain, file };
    return this.baseCache;
  }

  /** A stored generation opened by a newer generator (D336 (2): it opens exactly as it was saved,
   *  edits included): the stored map is the ground and holds every generated feature, except the
   *  ones the log changed, deleted or reordered. Those leave the stored map, their objects with
   *  them, and are built as they now say, as they were when the edit was made; the rest stay as the
   *  generator that made them built them. Their slopes, trees and bushes stand exactly as stored,
   *  except where the edits changed a tile (its ground, or its water or soil against the stored
   *  map's): a slope whose step an edit took away is gone for good, a tree or bush there is judged
   *  again, dead or alive, by the build's rule (D368 (10), D404; build.ts, `BaseLayer.soil`). */
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
    const frozen: BaseLayer = { ...layer, frozen: ids, soil: this.storedSoil(), entities: touched.size ? layer.entities.filter((e) => !touched.has(e.owner)) : layer.entities };
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
    return this.inputFor(this.gen.base.sizeX, this.gen.base.sizeY, this.gen.spec?.seed ?? 0, this.st, base, this.keptLayer(), mode !== "import" ? this.fieldOf(this.gen.field) : null, this.keepsSlopes() ? this.generatedSlopes() : null, mode !== "import" ? this.generatedResources() : null, mode !== "import" ? this.generatedSprings() : null);
  }

  /** Whether the build keeps the generation's slopes (`generatedSlopes`), live or frozen: a
   *  generated map whose strokes never ask for slopes to be derived. */
  private keepsSlopes(): boolean {
    return this.mode !== "import" && !this.derivesSlopes();
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

  /** Where the generation placed each spring's row of sources (a river's head, a lake's spring),
   *  with their ids, from the map it stored: an edited map keeps that row, its count and its ids,
   *  whatever an edit does round it (a Quake carrying the start off ground its row could grow onto;
   *  D368 (10), D314: no edit or force adds a source). Only for the features the player has not
   *  changed; null for a document that stored no owners. */
  generatedSprings(): ReadonlyMap<string, readonly KeptSource[]> | null {
    const c = this.springsCache;
    if (c && c.key === this.gen.base && sameItems(c.features, this.st.features)) return c.rows;
    let all = c && c.key === this.gen.base ? c.all : null;
    if (!all && this.gen.base.owners) {
      all = new Map();
      for (const f of this.gen.baseFeatures) if ((f.kind === "river" && "spring" in f.params.entry) || (f.kind === "lake" && "spring" in f.params.inflow)) all.set(f.id, []);
      const W = this.gen.base.sizeX;
      for (const e of this.baseStuff().layer.entities) if (e.template === "WaterSource") all.get(e.owner)?.push({ tile: e.y * W + e.x, id: e.id });
    }
    let rows: Map<string, KeptSource[]> | null = null;
    if (all) {
      const base = new Map(this.gen.baseFeatures.map((f) => [f.id, f]));
      rows = new Map();
      for (const f of this.st.features) {
        const kept = all.get(f.id);
        const b = base.get(f.id);
        if (kept?.length && b && (b === f || JSON.stringify(b.params) === JSON.stringify(f.params))) rows.set(f.id, kept);
      }
    }
    this.springsCache = { key: this.gen.base, features: [...this.st.features], all, rows };
    return rows;
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

  private inputFor(W: number, H: number, seed: number, st: DocState, base: BaseLayer | null, locked: LockedLayer | null, field: GeneratedField | null = null, generatedSlopes: BuildInput["generatedSlopes"] = null, generatedResources: BuildInput["generatedResources"] = null, generatedSprings: BuildInput["generatedSprings"] = null): BuildInput {
    return { W, H, seed, features: st.features, base, ...(field ? { field } : {}), ...(generatedSlopes ? { generatedSlopes } : {}), ...(generatedResources ? { generatedResources } : {}), ...(generatedSprings ? { generatedSprings } : {}), sculpts: st.sculpts, ...(st.waterEdits.length ? { waterEdits: st.waterEdits } : {}), slopeEdits: st.slopeEdits, entityEdits: st.entityEdits, locked };
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
    const file = this.exportFileBase(built, opts);
    const written = this.st.description;
    if (written === null || !file.metadata) return file;
    // the description its player wrote, whole, with what must follow it (`keptParts`)
    const parts = [written, ...this.keptParts(built).filter((p) => !written.includes(p))];
    return { ...file, metadata: { ...file.metadata, MapDescription: parts.join("\n\n") } };
  }

  /** What every description of the map carries after the player's words, whatever they write: that it has no
   *  badwater (D200, D213) or no water sources (D330), that its land rises above 16 (D172), and a real place's
   *  credits (the data providers' required notices). Each is a paragraph. */
  private keptParts(built: BuildResult): string[] {
    const spec = this.effectiveSpec(built);
    const notes = spec ? (spec.settings.water.sources === "none" ? [NO_SOURCES_NOTE] : spec.settings.hazards.badwater === "off" ? [NO_BADWATER_NOTE] : []) : this.badwaterRemoved(built) ? [NO_BADWATER_NOTE] : [];
    const credits = this.mode === "live" ? null : placeCredits(this.baseText());
    // (a generated map says its tall land in its own words, as its file does; an opened one in the editor's note)
    let top = 0;
    for (let i = 0; i < built.heights.length; i++) if (built.heights[i] > top) top = built.heights[i];
    const tall = isTall(built.heights) ? [this.mode === "live" ? generatedTallSentence(top) : TALL_NOTE] : [];
    return [...notes, ...tall, ...(credits ? [credits] : [])];
  }

  /** The description the map was opened with: its file's. */
  private baseText(): string {
    const text = this.baseStuff().file.metadata?.MapDescription;
    return typeof text === "string" ? text : "";
  }

  /** The map's description, for the page (the operation `setDescription` writes it). `text` is what its player
   *  wrote, or else the generated one (a generated map's, from its theme, size and what it shows; an opened
   *  file's own, without what follows it); `written` says which. `kept` is what follows the text in the file
   *  whatever is written (`keptParts`), shown but not edited (null when nothing does). */
  description(built: BuildResult = this.cur): MapDescription {
    const parts = this.keptParts(built);
    const kept = parts.length ? parts.join("\n\n") : null;
    const written = this.st.description;
    if (written !== null) return { text: written, written: true, kept };
    let text: string;
    if (this.mode === "live") text = generatedText(this.effectiveSpec(built)!, built, this.gen.meta.says);
    else {
      const base = this.baseText();
      const credits = placeCredits(base);
      text = this.notedText(credits ? base.slice(0, base.length - credits.length).trimEnd() : base, built);
    }
    // (the generated words say those notes already: the field shows the words alone, and `kept` the notes)
    text = withTallNote(text, false);
    for (const p of parts) text = text.replace(p, "");
    return { text: text.replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(), written: false, kept };
  }

  /** An opened file's description with the notes the map earns: that it has no badwater (D213), and that its land
   *  rises above 16 (D172). */
  private notedText(text: string, built: BuildResult): string {
    if (this.badwaterRemoved(built)) text = text ? `${text}\n\n${NO_BADWATER_NOTE}` : NO_BADWATER_NOTE;
    let top = 0;
    for (let i = 0; i < built.heights.length; i++) if (built.heights[i] > top) top = built.heights[i];
    return withTallNote(text, isTall(built.heights), top);
  }

  private exportFileBase(built: BuildResult, opts: { thumbnail?: boolean }): TimberFile {
    // without a thumbnail (checks read only its size): a blank one, not drawn
    const blank = opts.thumbnail === false ? blankThumbnail() : undefined;
    // (a generated map's description follows its land already: pack.ts notes land above 16, D244)
    if (this.mode === "live") {
      // (ground the Block tool or Erode hollowed is written as it stands, with its water on every column
      // and its soil on every run: gen/pack.ts `stackedWorld`, #435)
      return toTimberFile(this.effectiveSpec(built)!, built, { ...(blank ? { thumbnail: blank } : {}), ...(this.gen.meta.says?.length ? { says: this.gen.meta.says } : {}) });
    }
    const b = this.baseStuff();
    const { x: W, y: H } = this.size;
    const w = b.file.world;
    // the settled water is written, unless the file's own still stands
    // (the ground as it stands: the file's caves and overhangs under the edits' surface, and the
    // ground the Block tool dug or built, the same the build's water settled on)
    const terrain = this.terrainOf(built);
    const stack = built.waterFromFile ? undefined : built.settle.stack;
    let world = worldOf(W, H, built.heights, built.entities, built.waterFromFile || stack ? null : builtWater(built), { world: w, voxels: terrain.voxels() });
    if (stack) {
      // a map with caves or overhangs: the settle on every water column and the soil on every run
      // (D120), the way the game saves such a map (world.ts `stackedSimulationSingletons`)
      const cs = this.caveSoilOf(built);
      if (!cs) throw new Error("the settled water does not fit the map's caves: settle the water again");
      const s = stackedSimulationSingletons(W, H, { cols: cs.cols, depth: stack.depth, overflow: stack.overflow, contamination: stack.contamination, sat: stack.sat, runs: runColumns(terrain), moisture: cs.soil.moisture, soilContamination: cs.soil.contamination });
      world = { ...world, singletons: withWaterSingletons(w.singletons, s) };
    }
    const redraw = this.drawsThumbnail(built);
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

  /** Whether the file's thumbnail is drawn (the core's top-down one): always for a generated map; for an
   *  imported one when its terrain or water changed, else the file keeps its own picture (PLAN §19.6). */
  drawsThumbnail(built: BuildResult = this.cur): boolean {
    if (this.mode === "live") return true;
    // the thumbnail shows terrain and water: a new one when either changed
    return !built.waterFromFile || !sameBytes(built.heights, this.baseStuff().terrain.heights);
  }

  /** The exported file's name. */
  exportTimberName(): string {
    // a generated map keeps its seed-based name until renamed; then, like any named map, `namedFile` (D443)
    return this.gen.spec && !isRenamed(this.gen.spec, this.gen.meta.name, this.gen.meta.generatedName) ? timberFileName(this.gen.spec, this.gen.meta.seedWord) : namedFile(this.gen.meta.name);
  }

  /** The .timber file. `warnings` are the problems the player confirmed at export (the `export`
   *  profile, PLAN §19.5): they are noted at the end of the map's description. `thumbnailDrawn`: the
   *  file carries the core's top-down thumbnail, which the page may replace with its 3D picture (D488). */
  exportTimber(opts: { warnings?: readonly string[] } = {}): { bytes: Uint8Array; fileName: string; thumbnailDrawn: boolean } {
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
    return { bytes: writeTimber(file), fileName: name, thumbnailDrawn: this.drawsThumbnail() };
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
   *  classes only (no water settle, and a blank thumbnail: they read only its size); the editor's
   *  instant checks are these (`checkItems.ts` `instantChecks`). */
  validate(profile?: Profile, opts: { loadOnly?: boolean; water?: { model: WaterModel; settled: CanonicalWater } } = {}): Validation {
    const live = this.mode === "live";
    if (!opts.loadOnly && !opts.water) this.settleCanonical();
    return validateMap(this.exportFile(this.cur, opts.loadOnly ? { thumbnail: false } : {}), {
      profile: profile ?? (this.gen.spec ? "export" : "import"),
      external: !live,
      // (the map is being edited: an edge wall warns, D323)
      editing: true,
      mineCutAtOpen: this.mineCutAtOpen(),
      // (what the build's support pass removed: a generated map's row, D121; an import has none)
      dropped: live ? (this.cur.dropped ?? 0) : undefined,
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
  // (its saturation, as the settle's own is worked out from where water stands: the soil the build
  // makes from this water before its first settle is the file's water's, not a dry map)
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = depth[i] > 0 ? 1 : 0;
  return { settled: true, ticks: 0, depth, contamination, sat: clusterSaturation(wet, W, H), preview: true };
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

/** The same tiles with the same masks (the Block tool's ground). */
function sameMasks(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [i, m] of a) if (b.get(i) !== m) return false;
  return true;
}

/** The same items in the same order (the same objects). */
function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The same logged operation: the very object, or its number, kind, step, origin and parameters alike. */
function sameOp(a: AppliedOp, b: AppliedOp): boolean {
  return a === b || (a.seq === b.seq && a.op === b.op && a.step === b.step && a.origin === b.origin && (a as { label?: string }).label === (b as { label?: string }).label && JSON.stringify(a.params) === JSON.stringify(b.params));
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
  // (the 3D forms the generation grew, D488: the field's runs)
  const caves = f.runs.length ? ColumnTerrain.fromData(f, W, H) : null;
  return { heights, contains: new Set(f.contains.filter((id) => !out.has(id))), ...(ramps.length ? { ramps } : {}), ...(f.top !== undefined ? { top: f.top } : {}), ...(f.dry ? { dry: { moist: mask(f.dry.moist), poisoned: mask(f.dry.poisoned) } } : {}), ...(caves ? { caves } : {}) };
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

/** A stroke's history label, when the page gave none ("Raise 38 tiles" when it did). */
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
    case "addFeature": {
      const name = KIND_NAMES[op.params.feature.kind] ?? op.params.feature.kind;
      return `Add ${name === "start" ? "the start" : withArticle(name)}`;
    }
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
      return placeLabel("Place", op.params.template);
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
      return op.params.pools ? `Remove unfed water from ${op.params.pools === 1 ? "1 pool" : `${op.params.pools} pools`}` : "Remove unfed water";
    case "fillHollow":
      return "Fill a hollow";
    case "setDescription":
      return op.params.text === "" ? "Clear the description" : "Write the description";
    case "crop":
      return `Crop to ${op.params.w}×${op.params.h}`;
    case "blocks":
      return op.params.mode === "add" ? "Add blocks" : "Remove blocks";
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
