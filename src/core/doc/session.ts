// An open map document (EDITOR_PLAN §3): the operations engine, undo and redo, regeneration with
// constraints, export, and the built map, rebuilt incrementally after every change. The editor (M4)
// runs one session in its worker; everything here is headless and runs in Node too.
//
// - `apply` checks an operation, applies it to the state, appends it to the log and rebuilds the
//   dirty region. Invalid operations are rejected with reasons, never clamped.
// - `undo` and `redo` step through the history: operations invert with their undo data, and a
//   regeneration restores the generation before it. Built maps are kept as snapshots every few
//   steps and around regenerations, so stepping back is instant on 256² maps.
// - `regenerate` (the `specPatch` operation) plans a new generation around the player's features,
//   locks and keep-out regions (PLAN §7.0), replays the log on it, and flags what no longer
//   applies (PLAN §19.4).
// - Documents opened by a newer generator open from their stored base, exactly, until
//   `rebuildWithCurrentGenerator` (PLAN §19.7).

import { buildMap, previewBuild, previewTerrain, rebuild, SettleCache, type BaseLayer, type BuildInput, type BuildResult, type DirtyInfo, type LockedLayer } from "../features/build";
import type { TerrainState } from "../features/raster/strokePreview";
import { storedWetMask } from "../analysis/mechanics";
import { canonicalRun, type CanonicalWater } from "../sim/prefill";
import { sameRetained, type WaterModel } from "../sim/water";
import { pathField, polygonMask } from "../features/geometry";
import { entityJson, placementOf, rawEntity } from "../format/entities";
import { fromBase64, toBase64 } from "../format/base64";
import { parse, stringify, type JsonObject } from "../format/json";
import { writeTimber, type TimberFile } from "../format/timber";
import { mixedSimulationSingletons, settledSimulationSingletons, storedSoil, storedWater, type WorldModel } from "../format/world";
import type { Feature } from "../features/schema";
import { MAX_ATTEMPTS, planFeatures, type GenerateResult } from "../gen/generate";
import { description, fileName as timberFileName, mapName, toTimberFile } from "../gen/pack";
import { PlanConflict } from "../gen/riverValley";
import { tilesToRuns, runsToTiles, type Runs } from "../math/grid";
import { thumbnailJpeg } from "../render/shade";
import { GENERATOR_VERSION, type MapSpec, type Region } from "../spec/mapspec";
import { applyMergePatch, clone } from "../spec/mergepatch";
import { validateSpec } from "../spec/schema";
import { validateMap, type Validation } from "../validate/checks";
import type { PlayabilityAnalysis } from "../validate/playability";
import { blocks, type Profile, type ValidationReport } from "../validate/report";
import { baseFromFile, baseTerrain, fileFromBase, joinTerrain, type BaseMap, type BaseTerrain } from "./base";
import { entityProblem } from "./placing";
import { baseFeaturesOf, checkDocument, encodeProject, importDocument, toDocument, type DocMeta, type KeptContent, type MapDocument, type SavedView } from "./document";
import {
  applyOp,
  invertOp,
  opFitsMap,
  replay,
  validateOp,
  type AppliedOp,
  type DocState,
  type EditOp,
  type Lock,
  type OpName,
  type OpOrigin,
} from "./ops";

export type SessionMode = "live" | "frozen" | "import";
export type WaterMode = "canonical" | "preview" | "defer";

interface Generation {
  spec: MapSpec | null;
  generatorVersion: string;
  base: BaseMap;
  baseFeatures: Feature[];
  kept: KeptContent | null;
  meta: DocMeta;
}

interface GenerationRecord {
  gen: Generation;
  log: AppliedOp[];
}

/** One undo step: one operation, a group applied together (a fix, a proposal), or a regeneration. */
type HistoryEntry = { kind: "ops"; ops: AppliedOp[]; label?: string } | { kind: "generation"; label: string; before: GenerationRecord; after: GenerationRecord };

export interface HistoryItem {
  label: string;
  /** The (first) operation of the step. */
  op: OpName | "regenerate";
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
  /** Set when the operation was a `specPatch`. */
  regeneration?: RegenerateResult;
}

/** An operation with no effect, and why (PLAN §19.4): shown to the player, never dropped. */
export interface DocOrphan {
  seq: number;
  op: OpName;
  label: string;
  reason: string;
}

export interface RegenerateResult {
  ok: boolean;
  errors: string[];
  /** Attempts the generator made, and why the rejected ones failed. */
  attempts: number;
  failures: { attempt: number; reason: string }[];
  /** The regenerated map's validation (generate profile), null when nothing was generated. */
  report: ValidationReport | null;
  /** What that validation measured (reach, dam sites, distances), for the map card. */
  analysis: PlayabilityAnalysis | null;
  /** The player's own features (user, Claude, stamps): every one is still in the document. */
  kept: string[];
  /** Kept features that no longer fit the new terrain (nothing of them could be placed). */
  unfit: { id: string; reason: string }[];
  orphans: DocOrphan[];
  /** The checks the player's edits fail on the new map, when the generator's own map passes
   *  them (retrying another layout cannot fix those: the edits are kept as they are). */
  editProblems: { id: string; message: string }[];
}

/** More layouts tried after one whose own map passes but the player's edits fail on it. */
const EDIT_RETRIES = 1;

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
  private snaps = new Map<number, BuildResult>();
  private baseCache: { key: BaseMap; frozen: boolean; layer: BaseLayer; terrain: BaseTerrain; file: TimberFile } | null = null;
  private keptCache: { key: KeptContent; layer: LockedLayer } | null = null;
  private storedWaterCache: { key: BaseMap; water: ReturnType<typeof storedWater> } | null = null;
  /** Things the player should know about how the document was opened. */
  readonly notices: string[] = [];
  /** "preview": edits re-settle the water from its previous state (the editor's preview); the
   *  canonical settle follows with `settleCanonical` or `canonicalWater` (EDITOR_PLAN §6).
   *  "defer" (live editing): edits never wait on the water. The last settled water is carried
   *  over to the new ground (`waterStale`), the editor settles it in the background from
   *  `lastSettled` and puts it in place with `adoptWater`. */
  private waterMode: WaterMode = "canonical";

  private constructor(doc: MapDocument, built?: BuildResult) {
    this.gen = { spec: doc.spec, generatorVersion: doc.generatorVersion, base: doc.base, baseFeatures: clone(baseFeaturesOf(doc)), kept: doc.kept, meta: doc.meta };
    const r = replay(this.gen.baseFeatures, doc.edits);
    this.log = r.log;
    this.st = r.state;
    this.seqNext = doc.nextSeq;
    if (doc.spec && doc.base.world === null) {
      // a format-1 project file: no stored map, so the base is built with this generator
      if (doc.generatorVersion !== GENERATOR_VERSION) {
        this.notices.push(`This project was made with generator ${doc.generatorVersion} and stores no map, so it was rebuilt with generator ${GENERATOR_VERSION}.`);
      }
      const spec = { ...doc.spec, generatorVersion: GENERATOR_VERSION };
      const baseBuilt = buildMap({ W: spec.size.x, H: spec.size.y, seed: spec.seed, features: this.gen.baseFeatures });
      this.gen = { ...this.gen, spec, generatorVersion: GENERATOR_VERSION, base: baseFromFile(toTimberFile(spec, baseBuilt), "generated", baseBuilt.entities.map((e) => e.owner)) };
    }
    if (this.mode === "frozen") {
      this.notices.push(
        `This map was made with generator ${this.gen.generatorVersion}. It opens exactly as it was saved; ` +
          `rebuilding it with generator ${GENERATOR_VERSION} lets you edit what the generator made.`,
      );
    }
    this.cur = built ?? buildMap(this.input());
    if (this.mode !== "live" && this.baseStuff().terrain.columns.size) {
      this.notices.push("This map has caves or overhangs. Water under them keeps the map's own: the preview is approximate there. Show → Water under roofs marks them.");
    }
    // the log is the history of an opened document: its operations undo one by one (a
    // regeneration's earlier generation is not stored, so the history starts at this one)
    this.undoStack = this.log.map((op) => ({ kind: "ops", ops: [op] }));
    this.snaps.set(this.undoStack.length, this.cur);
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

  setViews(views: SavedView[]): void {
    this.gen = { ...this.gen, meta: { ...this.gen.meta, views: views.length ? views.map((v) => ({ ...v, target: [...v.target] as [number, number, number] })) : undefined } };
    if (!views.length) delete (this.gen.meta as { views?: SavedView[] }).views;
  }

  /** The generation the map is built on: the same object until a regeneration, an undo or redo
   *  across one, or a rebuild with the current generator replaces it. */
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
    this.undoStack = this.log.map((op) => ({ kind: "ops", ops: [op] }));
    this.redoStack = [];
    this.snaps.clear();
    this.cur = this.rebuilt();
  }

  /** Open a document (from `decodeProject`, `toDocument` or `importDocument`). */
  static open(doc: MapDocument): MapSession {
    checkDocument(doc);
    return new MapSession(doc);
  }

  /** The session of a map the generator just made: its own build is the starting map. */
  static fromGenerated(r: GenerateResult, file?: TimberFile): MapSession {
    return new MapSession(toDocument(r.spec, r.features, r.built, file), r.built);
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
    return {
      pre: t.pre7.slice(),
      protect: t.protect.slice(),
      channel: t.channel.slice(),
      base: base ? base.heights.slice() : null,
      locked: locked ? locked.slice() : null,
      columns: base ? Int32Array.from([...base.columns.keys()].sort((a, b) => a - b)) : new Int32Array(0),
    };
  }

  /** The water the base file stores (every level), for the 3D view. */
  storedWater(): ReturnType<typeof storedWater> {
    const b = this.baseStuff();
    if (this.storedWaterCache?.key !== this.gen.base) this.storedWaterCache = { key: this.gen.base, water: storedWater(b.file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY) };
    return this.storedWaterCache.water;
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
      formatVersion: 2,
      app: "dam-good-maps",
      generatorVersion: this.gen.generatorVersion,
      spec: this.gen.spec,
      base: this.gen.base,
      baseFeatures: this.gen.baseFeatures,
      kept: this.gen.kept,
      features: clone(this.st.features),
      edits: clone(this.log),
      locks: clone(this.st.locks),
      nextSeq: this.seqNext,
      meta: this.gen.meta,
    };
  }

  /** The project file. `level` is the gzip level (autosave uses a faster one; any level opens). */
  project(level?: number): Uint8Array {
    return encodeProject(this.document, level);
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
    if (this.mode === "frozen") {
      const frozen = new Set(this.gen.baseFeatures.map((f) => f.id));
      for (const o of this.log) {
        const target = o.op === "updateFeature" || o.op === "deleteFeature" || o.op === "reorderFeature" ? o.params.id : null;
        if (target && frozen.has(target) && !o.orphaned) {
          out.push({ seq: o.seq, op: o.op, label: labelOf(o), reason: `waits for a rebuild with generator ${GENERATOR_VERSION}: the map shows what generator ${this.gen.generatorVersion} made` });
        }
      }
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  history(): HistoryItem[] {
    const item = (e: HistoryEntry, applied: boolean): HistoryItem => {
      if (e.kind === "generation") return { label: e.label, op: "regenerate", applied };
      const first = e.ops[0];
      const orphaned = e.ops.find((o) => o.orphaned)?.orphaned;
      return { label: e.label ?? labelOf(first), op: first.op, seq: first.seq, count: e.ops.length, applied, ...(orphaned ? { orphaned } : {}) };
    };
    return [...this.undoStack.map((e) => item(e, true)), ...this.redoStack.slice().reverse().map((e) => item(e, false))];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
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
    for (const e of this.cur.entities) {
      entityIds.add(e.id);
      if (e.template === "Slope") slopeTiles.add(e.y * W + e.x);
      else if (e.template === "StartingLocation" && !starts.has(e.owner)) otherStarts++;
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
      placement: (p) => {
        const e = p.id ? this.cur.entities.find((g) => g.id === p.id) : undefined;
        const template = p.template ?? e?.template;
        if (!template) return null;
        return entityProblem(this, { template, x: p.x, y: p.y, orientation: p.orientation ?? e?.orientation ?? "Cw0", flipped: p.flipped ?? e?.flipped ?? false }, p.id ?? null);
      },
    });
    if (errors.length || this.mode !== "frozen") return errors;
    const frozen = new Set(this.gen.baseFeatures.map((f) => f.id));
    const target = op.op === "updateFeature" || op.op === "deleteFeature" || op.op === "reorderFeature" ? op.params.id : null;
    if (target && frozen.has(target)) return [`rebuild the map with generator ${GENERATOR_VERSION} first: it shows what generator ${this.gen.generatorVersion} made`];
    return [];
  }

  /** Apply one operation. `specPatch` regenerates the map (see `regenerate`). */
  apply(op: EditOp, origin: OpOrigin = "user", label?: string): ApplyResult {
    if (op.op === "specPatch") {
      const r = this.regenerate(op.params.patch, label);
      return { ok: r.ok, errors: r.errors, applied: [], dirty: r.ok ? this.cur.dirty : null, regeneration: r };
    }
    const errors = this.check(op);
    if (errors.length) return { ok: false, errors, applied: [], dirty: null };
    const applied = this.applyChecked(op, origin, label);
    this.pushHistory({ kind: "ops", ops: [applied] });
    this.cur = this.rebuilt();
    this.snapshot();
    return { ok: true, errors: [], applied: [applied], dirty: this.cur.dirty };
  }

  /** Apply several operations as one step (a fix, or an accepted proposal): all or none, and
   *  one undo takes them all back. */
  applyAll(ops: readonly EditOp[], origin: OpOrigin = "user", label?: string): ApplyResult {
    const done: AppliedOp[] = [];
    for (const op of ops) {
      const errors = op.op === "specPatch" ? ["a settings change cannot be part of a group of edits"] : this.check(op);
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
    this.pushHistory({ kind: "ops", ops: done, ...(label ? { label } : {}) });
    this.snapshot();
    return { ok: true, errors: [], applied: done, dirty: this.cur.dirty };
  }

  private applyChecked(op: EditOp, origin: OpOrigin, label?: string): AppliedOp {
    const text = label ?? (op as { label?: string }).label;
    const applied = { op: op.op, params: clone(op.params), seq: this.seqNext++, origin, ...(text ? { label: text } : {}) } as AppliedOp;
    applyOp(this.st, applied);
    if (applied.orphaned) throw new Error(`operation passed its check but did not apply: ${applied.orphaned}`);
    this.log.push(applied);
    return applied;
  }

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    if (e.kind === "ops") {
      for (let k = e.ops.length - 1; k >= 0; k--) {
        const last = this.log.pop();
        if (last?.seq !== e.ops[k].seq) throw new Error("the log and the history disagree");
        invertOp(this.st, last);
      }
    } else this.setGeneration(e.before);
    this.redoStack.push(e);
    this.cur = this.snaps.get(this.undoStack.length) ?? this.rebuilt();
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    if (e.kind === "ops") {
      for (const op of e.ops) {
        applyOp(this.st, op);
        this.log.push(op);
      }
    } else this.setGeneration(e.after);
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

  // --------------------------------------------------------------------------- regeneration

  /** Change the settings and regenerate (`specPatch`, PLAN §19.1): the generated features are
   *  planned again around the player's features, locks and keep-out regions (PLAN §7.0), the
   *  log is replayed on them, and whatever no longer applies is flagged. The generator retries
   *  until the generate profile passes, as for a new map; when no attempt passes, the last one is
   *  kept with its report. */
  regenerate(patch: Record<string, unknown>, label = "Change settings and regenerate"): RegenerateResult {
    const fail = (errors: string[], failures: RegenerateResult["failures"] = []): RegenerateResult => ({
      ok: false,
      errors,
      attempts: failures.length,
      failures,
      report: null,
      analysis: null,
      kept: [],
      unfit: [],
      orphans: this.orphans(),
      editProblems: [],
    });
    const old = this.gen.spec;
    if (!old) return fail(["an imported map has no settings to change"]);
    let spec = applyMergePatch(old, patch) as MapSpec;
    const kept = this.st.features.filter((f) => f.origin !== "generated");
    spec = {
      ...spec,
      generatorVersion: GENERATOR_VERSION,
      constraints: { ...spec.constraints, keep: kept.map((f) => f.id), locks: this.st.locks.map((l) => clone(l.region)) },
    };
    delete spec.accepted;
    const specErrors = validateSpec(spec);
    if (specErrors.length) return fail(specErrors.map((e) => `settings${e.path}: ${e.message}`));
    const W = spec.size.x;
    const H = spec.size.y;
    if ((W !== old.size.x || H !== old.size.y) && this.st.locks.length) return fail(["locked areas keep their tiles: unlock them before changing the map size"]);
    const keptContent = this.captureKept(W, H);
    const keptLayer = keptContent ? keptLayerOf(keptContent, W, H) : null;
    const protect = protectMask(W, H, kept, this.st.locks, spec.constraints.keepOut);
    const fits = (op: AppliedOp) => opFitsMap(op, W, H);
    const failures: RegenerateResult["failures"] = [];
    type Attempt = { spec: MapSpec; planned: Feature[]; state: DocState; log: AppliedOp[]; built: BuildResult; report: ValidationReport; analysis: PlayabilityAnalysis | null; cache: SettleCache; base?: BuildResult };
    let best: Attempt | null = null;
    let editProblems: RegenerateResult["editProblems"] = [];
    let fallback: (Attempt & { base: BuildResult; attempt: number; problems: RegenerateResult["editProblems"] }) | null = null as (Attempt & { base: BuildResult; attempt: number; problems: RegenerateResult["editProblems"] }) | null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const specA: MapSpec = { ...spec, accepted: { attempt, candidate: 0 } };
      const cache = new SettleCache();
      let planned: Feature[];
      try {
        planned = planFeatures(specA, attempt, 0, cache, { protect, features: kept, locked: keptLayer });
      } catch (e) {
        if (e instanceof PlanConflict) {
          failures.push({ attempt, reason: e.message });
          continue;
        }
        if (e instanceof Error) return fail([e.message], failures);
        throw e;
      }
      const r = replay(planned, this.log, fits);
      const built = buildMap(this.inputFor(W, H, spec.seed, r.state, null, keptLayer), { settleCache: cache });
      const v = validateMap(toTimberFile(specA, built), { profile: "generate", spec: specA, features: r.state.features, water: { model: built.waterModel, settled: built.settle } });
      const report = v.report;
      best = { spec: specA, planned, state: r.state, log: r.log, built, report, analysis: v.analysis, cache };
      if (report.passed) {
        editProblems = [];
        break;
      }
      // when the generator's own map passes, the player's edits are what fails (a start moved
      // off its water, say): a couple more layouts may suit the edits, then that map is kept with
      // the edits' problems named (retrying every layout took a minute at 256² and never helped)
      if (this.log.length && !fallback) {
        const base = buildMap({ W, H, seed: spec.seed, features: planned, locked: keptLayer }, { settleCache: cache });
        const bv = validateMap(toTimberFile(specA, base), { profile: "generate", spec: specA, features: planned, water: { model: base.waterModel, settled: base.settle } });
        if (bv.report.passed) fallback = { ...best, base, attempt, problems: report.checks.filter((c) => blocks("generate", c)).map((c) => ({ id: c.id, message: c.message })) };
      }
      failures.push({ attempt, reason: report.checks.filter((c) => blocks("generate", c)).map((c) => c.id).join(", ") });
      if (fallback && attempt >= fallback.attempt + EDIT_RETRIES) {
        best = fallback;
        editProblems = fallback.problems;
        failures.length = fallback.attempt;
        break;
      }
    }
    if (best && !best.report.passed && fallback && best !== fallback) {
      best = fallback;
      editProblems = fallback.problems;
    }
    if (!best) return fail(failures.length ? [`no layout fits: ${failures[failures.length - 1].reason}`] : ["no layout fits"], failures);
    // the new generation: the generated features alone, built and stored as the base
    const baseBuilt = best.base ?? buildMap({ W, H, seed: spec.seed, features: best.planned, locked: keptLayer }, { settleCache: best.cache });
    const gen: Generation = {
      spec: best.spec,
      generatorVersion: GENERATOR_VERSION,
      base: baseFromFile(toTimberFile(best.spec, baseBuilt), "generated", baseBuilt.entities.map((e) => e.owner)),
      baseFeatures: best.planned,
      kept: keptContent,
      meta: { ...this.gen.meta, name: mapName(best.spec), premise: description(best.spec), designedFor: best.spec.designedFor },
    };
    const before = this.record();
    const beforeBuilt = this.cur;
    this.gen = gen;
    this.log = best.log;
    this.st = best.state;
    this.cur = best.built;
    this.pushHistory({ kind: "generation", label, before, after: this.record() });
    this.snaps.set(this.undoStack.length - 1, beforeBuilt);
    this.snapshot(true);
    const unfit: RegenerateResult["unfit"] = [];
    for (const f of kept) {
      if (f.kind !== "forest" && f.kind !== "berryPatch" && f.kind !== "ruinField") continue;
      if (!this.cur.entities.some((e) => e.owner === f.id)) unfit.push({ id: f.id, reason: `nothing of this ${f.kind} fits the new terrain: its area is under water, taken or on unsuitable soil` });
    }
    return {
      ok: true,
      errors: [],
      attempts: failures.length + 1,
      failures,
      report: best.report,
      analysis: best.analysis,
      kept: kept.map((f) => f.id).filter((id) => this.st.features.some((f) => f.id === id)),
      unfit,
      orphans: this.orphans(),
      editProblems,
    };
  }

  /** A document from another generator version: rebuild what the generator made with this one
   *  (PLAN §19.7). The log is replayed and whatever no longer applies is flagged. */
  rebuildWithCurrentGenerator(): boolean {
    if (this.mode !== "frozen" || !this.gen.spec) return false;
    const spec = { ...this.gen.spec, generatorVersion: GENERATOR_VERSION };
    const { x: W, y: H } = spec.size;
    const keptLayer = this.gen.kept ? keptLayerOf(this.gen.kept, W, H) : null;
    const baseBuilt = buildMap({ W, H, seed: spec.seed, features: this.gen.baseFeatures, locked: keptLayer });
    const before = this.record();
    const beforeBuilt = this.cur;
    this.gen = {
      ...this.gen,
      spec,
      generatorVersion: GENERATOR_VERSION,
      base: baseFromFile(toTimberFile(spec, baseBuilt), "generated", baseBuilt.entities.map((e) => e.owner)),
    };
    this.setGeneration({ gen: this.gen, log: this.log });
    this.cur = this.rebuilt();
    this.pushHistory({ kind: "generation", label: `Rebuild with generator ${GENERATOR_VERSION}`, before, after: this.record() });
    this.snaps.set(this.undoStack.length - 1, beforeBuilt);
    this.snapshot(true);
    return true;
  }

  private record(): GenerationRecord {
    return { gen: this.gen, log: clone(this.log) };
  }

  private setGeneration(r: GenerationRecord): void {
    this.gen = r.gen;
    const rep = replay(r.gen.baseFeatures, r.log);
    this.log = rep.log;
    this.st = rep.state;
  }

  /** What locks keep of the current generation's generated content (EDITOR_PLAN §3). */
  private captureKept(W: number, H: number): KeptContent | null {
    if (!this.st.locks.length) return null;
    const mask = new Uint8Array(W * H);
    for (const l of this.st.locks) for (const i of runsToTiles(l.region.runs, W)) mask[i] = 1;
    const tiles: number[] = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) tiles.push(i);
    const base = this.baseStuff();
    const bytes = new Uint8Array(tiles.length);
    tiles.forEach((i, k) => (bytes[k] = base.terrain.heights[i]));
    const entities: JsonObject[] = [];
    const owners: string[] = [];
    base.file.world.entities.forEach((e, k) => {
      const p = placementOf(e);
      if (!p || p.template === "Slope" || p.template === "StartingLocation") return;
      if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H || !mask[p.y * W + p.x]) return;
      entities.push(e);
      owners.push(this.gen.base.owners?.[k] ?? "kept");
    });
    return { runs: tilesToRuns(tiles, W), heights: toBase64(bytes), entities: stringify(entities), owners };
  }

  // ------------------------------------------------------------------------------ building

  private baseStuff(): { layer: BaseLayer; terrain: BaseTerrain; file: TimberFile } {
    const frozen = this.mode === "frozen";
    const c = this.baseCache;
    if (c && c.key === this.gen.base && c.frozen === frozen) return c;
    const terrain = baseTerrain(this.gen.base);
    const file = fileFromBase(this.gen.base, terrain);
    const owners = this.gen.base.owners;
    const layer: BaseLayer = {
      heights: terrain.heights,
      columns: terrain.columns,
      entities: file.world.entities.map((e, k) => rawEntity(e, owners?.[k] ?? "import")),
      frozen: frozen ? new Set(this.gen.baseFeatures.map((f) => f.id)) : undefined,
      water: topWater(file.world.singletons, this.gen.base.sizeX, this.gen.base.sizeY, terrain.heights),
    };
    this.baseCache = { key: this.gen.base, frozen, layer, terrain, file };
    return this.baseCache;
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
    const base = this.mode === "live" ? null : this.baseStuff().layer;
    return this.inputFor(this.gen.base.sizeX, this.gen.base.sizeY, this.gen.spec?.seed ?? 0, this.st, base, this.keptLayer());
  }

  private inputFor(W: number, H: number, seed: number, st: DocState, base: BaseLayer | null, locked: LockedLayer | null): BuildInput {
    return { W, H, seed, features: st.features, base, sculpts: st.sculpts, slopeEdits: st.slopeEdits, entityEdits: st.entityEdits, locked };
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

  /** The map as a .timber file. A generated map is written the way the generator writes it; an
   *  imported one is its normalized file with the edits: unedited, it is the same file, byte for
   *  byte (PLAN §19.6). */
  exportFile(built: BuildResult = this.cur, opts: { thumbnail?: boolean } = {}): TimberFile {
    // without a thumbnail (checks read only its size): a blank one, not drawn
    const blank = opts.thumbnail === false ? blankThumbnail() : undefined;
    if (this.mode === "live") return toTimberFile(this.gen.spec!, built, blank ? { thumbnail: blank } : {});
    const b = this.baseStuff();
    const { x: W, y: H } = this.size;
    const w = b.file.world;
    const terrainChanged = !sameBytes(built.heights, b.terrain.heights);
    let singletons = w.singletons;
    if (!built.waterFromFile) {
      // under roofs (caves, tunnels, overhangs) the file's own water is kept: the heightfield
      // model cannot simulate it (EDITOR_PLAN §6); everywhere else the settled water is written
      if (b.terrain.columns.size) singletons = withSettledWater(w.singletons, W, H, built, new Set(b.terrain.columns.keys()));
      else singletons = withSettledWater(w.singletons, W, H, built);
    }
    const world: WorldModel = { ...w, voxels: joinTerrain(W, H, built.heights, b.terrain.columns), singletons, entities: built.entities.map(entityJson) };
    // the thumbnail shows terrain and water: a new one when either changed
    const redraw = terrainChanged || !built.waterFromFile;
    return {
      metadata: parse(this.gen.base.metadata) as JsonObject,
      thumbnail: blank ?? (redraw ? thumbnailJpeg(built.heights, W, H, built.waterFromFile ? null : built.water) : b.file.thumbnail),
      versionTxt: this.gen.base.versionTxt,
      world,
      extraFiles: [],
    };
  }

  /** The .timber file. `warnings` are the problems the player confirmed at export (the `export`
   *  profile, PLAN §19.5): they are noted at the end of the map's description. */
  /** The exported file's name. */
  exportTimberName(): string {
    return this.gen.spec ? timberFileName(this.gen.spec) : `${this.gen.meta.name}.timber`;
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
      spec: this.gen.spec,
      designedFor: this.gen.meta.designedFor,
      features: this.st.features,
      water: opts.water ?? (live ? { model: this.cur.waterModel, settled: this.cur.settle } : undefined),
      loadOnly: opts.loadOnly,
      // an edited import's approximate-water rule compares the settle with the water it was opened with
      storedWet: live ? undefined : this.openedWet(),
    });
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
  return JSON.stringify(a.emitters) === JSON.stringify(b.emitters) && sameRetained(a.retained, b.retained);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** An imported map's singletons with the settled water, moisture and contamination of a
 *  heightfield map (one slot per tile), every other singleton as it was. With `roofed`, the tiles
 *  under roofs keep the file's own water and soil (every slot; world.ts mixedSimulationSingletons). */
function withSettledWater(singletons: JsonObject, W: number, H: number, b: BuildResult, roofed?: ReadonlySet<number>): JsonObject {
  const st = { floor: b.heights, depth: b.water, contamination: b.contamination, moisture: b.moisture, soilContamination: b.soilContamination, sat: b.settle.sat };
  const s = roofed ? mixedSimulationSingletons(singletons, W, H, st, roofed) : settledSimulationSingletons(W, H, st);
  const keys = ["WaterEvaporationMap", "WaterSimulationMigrator", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator"];
  const out: JsonObject = {};
  for (const k in singletons) out[k] = keys.includes(k) ? s[k] : singletons[k];
  for (const k of keys) if (!(k in out)) out[k] = s[k];
  return out;
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

/** Tiles the planner keeps off (PLAN §7.0): the player's features, locked and keep-out regions. */
export function protectMask(W: number, H: number, kept: readonly Feature[], locks: readonly Lock[], keepOut: readonly Region[]): Uint8Array | null {
  if (!kept.length && !locks.length && !keepOut.length) return null;
  const m = new Uint8Array(W * H);
  const runs = (r: Runs) => {
    for (const [y, x0, x1] of r) if (y >= 0 && y < H) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1;
  };
  for (const f of kept) {
    switch (f.kind) {
      case "landform":
        if (f.params.outline) polygonMask(f.params.outline, W, H).forEach((v, i) => v && (m[i] = 1));
        break;
      case "lake":
        polygonMask(f.params.outline, W, H).forEach((v, i) => v && (m[i] = 1));
        break;
      case "river": {
        const field = pathField(f.params.path, W, H);
        const bank = f.params.width / 2 + 1;
        for (let i = 0; i < W * H; i++) if (field.d[i] < bank) m[i] = 1;
        break;
      }
      case "forest":
      case "berryPatch":
      case "ruinField":
        runs(f.params.area);
        break;
      default:
        break;
    }
  }
  for (const l of locks) runs(l.region.runs);
  for (const r of keepOut) runs(r.runs);
  return m;
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
    case "carve":
      return op.params.replaces !== undefined ? "Try another path" : op.params.dry ? "Carve a dry canyon" : "Carve a river";
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
    case "setLock":
      return op.params.region ? "Lock an area" : "Unlock an area";
    default:
      return op.op;
  }
}

