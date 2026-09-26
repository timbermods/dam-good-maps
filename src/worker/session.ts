// The editor's side of the worker (EDITOR_PLAN §8): one open map document (a `MapSession`), and
// what the page needs of it. Messages stay small: after an edit the page gets the document's
// summary (features, history, orphans) and only the parts of the map view that changed, as
// compact typed arrays; never the document itself.
//
// Export follows the `export` profile (PLAN §19.5): load problems block, playability and design
// problems warn and are noted in the map's description when the player exports anyway. An
// imported map's own problems (those it already had when it was opened) are listed but never
// blamed on the player's edits, so an unedited import always exports unchanged (PLAN §20, D43).

import { damSites as findDamSites } from "../core/analysis/damsites";
import { decodeProject, documentFileName, type MapDocument, type SavedView } from "../core/doc/document";
import { MapSession, type DocOrphan, type HistoryItem, type SessionMode } from "../core/doc/session";
import type { AppliedOp, EditOp, OpOrigin } from "../core/doc/ops";
import {
  deleteEdit,
  kindName,
  objectsOnNewGround,
  moveEdit,
  moveStartNear,
  planContextOf,
  planLake,
  planPiece,
  planRiver,
  replacePatch,
  withObjectsOnNewGround,
  cornerFor,
  startCentre,
  type LakeRequest,
  type PlannedEdit,
  type RiverRequest,
} from "../core/doc/tools";
import type { PlanRecord } from "../core/features/setpieces";
import { removeKindOf, type RemoveKind } from "../core/features/objects";
export type { RemoveKind };
import { entityProblem, footprintCheck as checkFootprint, lakeAt, moveObject, planEntity, planObject, planRiverBadwater, type AreaPreview, type EntityRequest, type ObjectRequest, type PlannedOps } from "../core/doc/placing";
import type { SetPieceKind } from "../core/features/schema";
import { distanceFrom } from "../core/math/grid";
import { hash32 } from "../core/math/hash";
import { toTimberFile } from "../core/gen/pack";
import { thumbnailJpeg } from "../core/render/shade";
import type { EntitySpec } from "../core/format/entities";
import { JsonFloat } from "../core/format/json";
import type { Orientation } from "../core/format/footprints";
import { entityTiles } from "../core/features/edits";
import { DERIVED_SLOPES } from "../core/features/ids";
import { placementOf } from "../core/format/entities";
import type { ImportReport } from "../core/format/normalize";
import type { Feature } from "../core/features/schema";
import { OFFICIAL_FLOW } from "../core/gen/calibrated";
import { bakeLandforms } from "../core/doc/bake";
import { badtideContamination, hazardDays, type Hazard } from "../core/sim/weather";
import { moisture } from "../core/sim/moisture";
import { soilContamination } from "../core/sim/contamination";
import { patchFeature } from "../core/doc/ops";
import type { Difficulty, MapSpec } from "../core/spec/mapspec";
import { applyMergePatch } from "../core/spec/mergepatch";
import { validateMap, type Validation } from "../core/validate/checks";
import { canonicalRun, canonicalSettle, type CanonicalWater } from "../core/sim/prefill";
import { PreviewJob, TICKS_PER_DAY, type WarmState } from "../core/sim/preview";
import type { TerrainState } from "../core/features/raster/strokePreview";
import { droughtStorage } from "../core/sim/drought";
import { rulesFor } from "../core/validate/playability";
import { mapObjects, waterModel } from "../core/sim/model";
import { WaterSim, type WaterModel } from "../core/sim/water";
import { surfaceOf } from "../core/format/world";
import { blocks, type CheckClass, type CheckResult, type FixOp } from "../core/validate/report";
import { changedRect } from "../render3d/mesh";
import { carveForceParams, forceMapOf } from "../core/forces/carve/result";
import { CarveRun, type CarveIntent, type CarveSettings } from "../core/forces/carve/run";
import type { CraterSettings } from "../core/forces/craterize";
import type { EruptSettings, Point } from "../core/forces/erupt";
import type { ForceHead, FullForceMap, Lane } from "../core/forces/force";
import { START_REASON, startProblem } from "../core/forces/objects";
import type { ForceResultParams, ForceSettingsRecord, ForceWhere, Verb } from "../core/forces/op";
import type { QuakeSettings } from "../core/forces/quake";
import { geology, nextSeed } from "../core/forces/random";
import { forceParamsOf, pathRecord } from "../core/forces/result";
import { trimRock } from "../core/forces/rock";
import { CraterRun, EruptRun, QuakeRun, type Finalize, type ForceCue, type StagedRun } from "../core/forces/runs";
import { plainEntities } from "../core/forces/force";
import { integrityAt } from "../core/features/raster/terrain";
import { emptyColumns, entityView, LAYERS, soilView, waterFromDepth, type EntityView, type MapView, type SoilView, type WaterView } from "../render3d/model";
import { lastGenerated, lifeOf, responseOf, variantOf, type GenerateResponse } from "./api";

export interface SessionInfo {
  kind: "generated" | "import";
  mode: SessionMode;
  name: string;
  premise: string;
  spec: MapSpec | null;
  /** The difficulty the map is designed for (an import's comes from its document, default Normal). */
  designedFor: Difficulty;
  W: number;
  H: number;
  features: Feature[];
  history: HistoryItem[];
  canUndo: boolean;
  canRedo: boolean;
  /** Operations in the log: the player's edits on this generation. */
  edits: number;
  orphans: DocOrphan[];
  notices: string[];
  importReport: ImportReport | null;
  timberName: string;
  projectName: string;
  /** Bumped on every change (the page's autosave and checks key on it). */
  version: number;
  /** Changes only when the features do (the page keeps its copy, and its index, meanwhile). */
  featuresKey: string;
  /** The editor's camera bookmarks (D205), saved with the document. */
  views: SavedView[];
  /** Try another path is there: the last kept carve is the latest step (D199). */
  carveAgain: boolean;
  /** The force Try another would run again (the last one kept is the latest step), or null. */
  forceAgain: Verb | null;
}

/** The parts of the map view that changed. */
export interface ViewUpdate {
  heights?: Uint8Array;
  /** What the build's last terrain steps start from, when it changed (the page paints strokes on
   *  its own copy, exactly as the build applies them). */
  terrain?: TerrainState;
  terrainRect?: { x0: number; y0: number; x1: number; y1: number } | null;
  water?: WaterView;
  entities?: EntityView;
  /** The soil the ground's colours show; it follows the water (Map look, D86). */
  soil?: SoilView;
}

export interface SessionUpdate {
  ok: boolean;
  errors: string[];
  info: SessionInfo;
  view: ViewUpdate;
  ms: number;
  /** The instant checks after the change (PLAN §19.5): null when nothing changed. */
  instant?: InstantCheck | null;
}

/** The instant checks (EDITOR_PLAN §6): the load and design classes, run after every edit on the
 *  map as it now stands; `here` marks the problems in the region the edit changed. */
export interface InstantCheck {
  items: CheckItem[];
  /** The rectangle the edit changed (terrain or objects), or null. */
  region: { x0: number; y0: number; x1: number; y1: number } | null;
  ms: number;
}

export interface SessionOpen {
  info: SessionInfo;
  view: MapView;
  /** The terrain the page paints strokes on (see ViewUpdate.terrain). */
  terrain: TerrainState;
  ms: number;
}

export interface CheckItem {
  id: string;
  class: CheckClass;
  message: string;
  where?: CheckResult["where"];
  /** A one-click fix: edit operations applied together as one undo step. */
  fix?: FixOp[];
  /** The problem lies in the region the last edit changed. */
  here?: boolean;
}

/** The export check (PLAN §19.5, `export` profile). */
export interface ExportCheck {
  /** Load problems the edits made: export is blocked until they are fixed. */
  blocking: CheckItem[];
  /** Playability and design problems the edits made: the player confirms, and they are noted in
   *  the map's description. */
  warnings: CheckItem[];
  /** Advice that never blocks (plants.drought). */
  advisory: CheckItem[];
  /** Problems an imported map already had when it was opened: listed, never blamed on edits. */
  existing: CheckItem[];
  /** Water and colony checks ran (true since M8, imported maps too). */
  playability: boolean;
  /** Why the water and start checks are only approximate on this map, or null (PLAN §11, D98). */
  approximate: string | null;
  checks: number;
  version: number;
  ms: number;
}

let session: MapSession | null = null;
let version = 0;
/** What the page last received, to send only what changed. */
let sent: { heights: Uint8Array; water: unknown; stored: boolean; entities: unknown; soil: unknown; terrain: unknown } | null = null;
/** The imported map as it was opened, with every check (the problems it had already, D43). */
let originalFull: Validation | null = null;
let lastCheck: ExportCheck | null = null;

function need(): MapSession {
  if (!session) throw new Error("no map is open in the editor");
  return session;
}

/** A key for the features as they are (the page keeps its own copy while it stays the same). */
let featuresMemo: { json: string; key: string } | null = null;
function featuresKeyOf(features: readonly Feature[]): string {
  const json = JSON.stringify(features);
  if (featuresMemo?.json === json) return featuresMemo.key;
  featuresMemo = { json, key: `${json.length}:${hash32(json)}` };
  return featuresMemo.key;
}

export function sessionInfo(s: MapSession = need()): SessionInfo {
  const { x: W, y: H } = s.size;
  const doc = s.document;
  const history = s.history();
  return {
    kind: s.spec ? "generated" : "import",
    mode: s.mode,
    name: s.meta.name,
    premise: s.meta.premise,
    spec: s.spec,
    designedFor: s.spec?.designedFor ?? s.meta.designedFor ?? "normal",
    W,
    H,
    features: s.features as Feature[],
    history,
    canUndo: s.canUndo,
    canRedo: s.canRedo,
    edits: s.editCount,
    orphans: s.orphans(),
    notices: [...s.notices],
    importReport: s.meta.source?.report ?? null,
    timberName: s.exportTimberName(),
    projectName: documentFileName(doc),
    featuresKey: featuresKeyOf(s.features),
    views: s.views,
    carveAgain: againReady(s, history),
    forceAgain: againVerb(s, history),
    version,
  };
}

/** Keep the editor's camera bookmarks with the document (D205): no edit, no undo step; the page's
 *  autosave takes them. */
export function setViews(views: SavedView[]): SessionInfo {
  const s = need();
  s.setViews(views);
  return sessionInfo(s);
}

// ------------------------------------------------------------------------------------ the view

/** A source's strength, for the page's markers (D196). */
function strengthOf(comps: Record<string, unknown>): { strength?: number } {
  const w = comps.WaterSource as { SpecifiedStrength?: unknown } | undefined;
  if (!w) return {};
  const v = plainJson(w.SpecifiedStrength);
  return typeof v === "number" ? { strength: v } : {};
}

/** The objects as the view draws them; `down`: the trees a force knocked down, and which way each
 *  lies (D202). */
function entityInputs(list: readonly EntitySpec[], down?: ReadonlyMap<string, { dx: number; dy: number }>) {
  const out = [];
  for (const e of list) {
    if (e.raw && !placementOf(e.raw)) continue;
    const comps = e.raw ? (e.raw.Components as Record<string, unknown>) : { ...(e.before ?? {}), ...e.components };
    const fall = down?.get(e.id);
    out.push({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, owner: e.owner, flipped: e.flipped, ...lifeOf(comps), ...variantOf(comps), ...strengthOf(comps), ...(fall ? { fallen: fall } : {}) });
  }
  return out;
}

function waterOf(s: MapSession, live?: { depth: ArrayLike<number>; contamination: ArrayLike<number> }, ground: Uint8Array = s.built.heights): WaterView {
  const b = live ? { ...s.built, heights: ground, water: live.depth, contamination: live.contamination } : s.built;
  const roofed = s.roofedTiles;
  if (!s.showsStoredWater && !roofed.size) return waterFromDepth(b.heights, b.water, b.contamination);
  const w = s.storedWater();
  const floor = Float32Array.from(w.floor, (f, k) => (f < 0 ? b.heights[w.tile[k]] : f));
  if (s.showsStoredWater) return { count: w.tile.length, tile: w.tile.slice(), floor, depth: w.depth.slice(), contamination: w.contamination.slice() };
  // an edited import with caves: the settled water off the roofs, the file's own under them
  // (EDITOR_PLAN §6: the preview is approximate there, and the export keeps the file's water)
  const settled = waterFromDepth(b.heights, b.water, b.contamination);
  const keep: number[] = [];
  for (let k = 0; k < settled.count; k++) if (!roofed.has(settled.tile[k])) keep.push(k);
  const under: number[] = [];
  for (let k = 0; k < w.tile.length; k++) if (roofed.has(w.tile[k])) under.push(k);
  const n = keep.length + under.length;
  const out: WaterView = { count: n, tile: new Int32Array(n), floor: new Float32Array(n), depth: new Float32Array(n), contamination: new Float32Array(n) };
  let q = 0;
  for (const k of keep) {
    out.tile[q] = settled.tile[k];
    out.floor[q] = settled.floor[k];
    out.depth[q] = settled.depth[k];
    out.contamination[q] = settled.contamination[k];
    q++;
  }
  for (const k of under) {
    out.tile[q] = w.tile[k];
    out.floor[q] = floor[k];
    out.depth[q] = w.depth[k];
    out.contamination[q] = w.contamination[k];
    q++;
  }
  return out;
}

/** The soil the view shows: the map's settled soil, or the file's own where the view shows the
 *  file's water (an unedited import everywhere, an edited one under its roofs). */
function soilOf(s: MapSession): SoilView {
  const b = s.built;
  const roofed = s.roofedTiles;
  if (!s.showsStoredWater && !roofed.size) return soilView(b.moisture, b.soilContamination);
  const file = s.storedSoil();
  if (s.showsStoredWater) return soilView(file.moisture, file.contamination);
  const moisture = Float32Array.from(b.moisture);
  const contamination = Float32Array.from(b.soilContamination);
  for (const i of roofed) {
    moisture[i] = file.moisture[i];
    contamination[i] = file.contamination[i];
  }
  return soilView(moisture, contamination);
}

/** What the sent soil depends on: the settled soil arrays, or the file's. */
function soilKey(s: MapSession): unknown {
  return s.showsStoredWater ? "stored" : s.built.moisture;
}

function columnsOf(s: MapSession): MapView["columns"] {
  const cols = s.columns;
  if (!cols.size) return emptyColumns();
  const tiles = new Int32Array(cols.size);
  const voxels = new Uint8Array(cols.size * LAYERS);
  let k = 0;
  for (const [i, c] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    tiles[k] = i;
    voxels.set(c.subarray(0, LAYERS), k * LAYERS);
    k++;
  }
  return { tiles, voxels };
}

/** The objects the page has (to send only what changed). */
let sentEntities: EntityView | null = null;

/** A copy that stays here (the view itself is handed over to the page, its arrays with it). */
function copyEntityView(v: EntityView): EntityView {
  return { ...v, templates: [...v.templates], owners: [...v.owners], template: v.template.slice(), x: v.x.slice(), y: v.y.slice(), z: v.z.slice(), orientation: v.orientation.slice(), flags: v.flags.slice(), owner: v.owner.slice(), ...(v.fall ? { fall: v.fall.slice() } : {}) };
}

function sameEntityView(a: EntityView, b: EntityView | null): boolean {
  if (!b || a.count !== b.count || a.templates.join() !== b.templates.join() || a.owners.join() !== b.owners.join()) return false;
  const eq = (p: ArrayLike<number>, q: ArrayLike<number>) => {
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
    return true;
  };
  return eq(a.template, b.template) && eq(a.x, b.x) && eq(a.y, b.y) && eq(a.z, b.z) && eq(a.orientation, b.orientation) && eq(a.flags, b.flags) && eq(a.owner, b.owner) && !a.fall === !b.fall && (!a.fall || eq(a.fall, b.fall!));
}

function markSent(s: MapSession): void {
  const b = s.built;
  sent = { heights: b.heights, water: s.showsStoredWater ? "stored" : b.water, stored: s.showsStoredWater, entities: b.entities, soil: soilKey(s), terrain: b.cache.terrain };
}

/** The map's heights and the terrain the page paints on, as they stand (the page takes them
 *  again when the worker refused a stroke it had shown). */
export function terrainNow(): { heights: Uint8Array; terrain: TerrainState } {
  const s = need();
  return { heights: s.built.heights.slice(), terrain: s.terrainState() };
}

/** The whole map view (opening a map, or after a regeneration). */
export function sessionView(): SessionOpen {
  const t0 = performance.now();
  const s = need();
  const b = s.built;
  const view: MapView = { W: b.W, H: b.H, heights: b.heights.slice(), columns: columnsOf(s), water: waterOf(s), entities: entityView(entityInputs(b.entities, fallenOf(s))), soil: soilOf(s) };
  sentEntities = copyEntityView(view.entities);
  markSent(s);
  return { info: sessionInfo(s), view, terrain: s.terrainState(), ms: Math.round(performance.now() - t0) };
}

function viewUpdate(s: MapSession): ViewUpdate {
  const b = s.built;
  const out: ViewUpdate = {};
  const prev = sent;
  if (!prev || prev.heights.length !== b.heights.length) {
    const all: ViewUpdate = { heights: b.heights.slice(), terrainRect: null, water: waterOf(s), entities: entityView(entityInputs(b.entities, fallenOf(s))), soil: soilOf(s), terrain: s.terrainState() };
    sentEntities = copyEntityView(all.entities!);
    markSent(s);
    return all;
  }
  if (prev.terrain !== b.cache.terrain) out.terrain = s.terrainState();
  if (prev.heights !== b.heights) {
    const rect = changedRect(b.W, b.H, prev.heights, b.heights);
    if (rect) {
      out.heights = b.heights.slice();
      out.terrainRect = rect;
    }
  }
  const water = s.showsStoredWater ? "stored" : b.water;
  if (water !== prev.water) out.water = waterOf(s);
  if (water !== prev.water || soilKey(s) !== prev.soil) out.soil = soilOf(s);
  // (a rebuild that placed the same objects again sends none: the page keeps its own)
  if (b.entities !== prev.entities) {
    const v = entityView(entityInputs(b.entities, fallenOf(s)));
    if (!sameEntityView(v, sentEntities)) out.entities = v;
    sentEntities = copyEntityView(v);
  }
  markSent(s);
  return out;
}

function changed(s: MapSession, ok: boolean, errors: string[], t0: number): SessionUpdate {
  if (ok) {
    version++;
    lastCheck = null;
  }
  const view = ok ? viewUpdate(s) : {};
  // with a checks worker the instant checks come as an event a moment later, off this worker
  const instant = ok && !checks ? instantCheck(s) : null;
  if (ok) {
    kickWater();
    syncChecks();
  }
  return { ok, errors, info: sessionInfo(s), view, ms: Math.round(performance.now() - t0), instant };
}

// ------------------------------------------------------------------------------ the checks worker

/** The page's checks run in a worker of their own on a replica of the open map (live editing:
 *  the editor's worker never waits on a check). It follows this worker's map: the document when
 *  the generation changes, otherwise the log. Without one (Node tests) they run here. */
export interface ChecksWorker {
  follow(p: FollowPayload): Promise<InstantCheck | null>;
  check(version: number, onProgress?: (p: CheckProgress) => void): Promise<ReplicaCheck | null>;
}

/** What the replica needs to follow the open map. */
export interface FollowPayload {
  version: number;
  /** The whole document, when the generation changed (or the replica has none yet). */
  doc?: MapDocument;
  /** Otherwise: keep the first `keep` operations of the replica's log and apply `add`. */
  keep: number;
  add: AppliedOp[];
}

/** The replica's check, with the canonical water it settled (for this worker to put in place). */
export interface ReplicaCheck {
  check: ExportCheck;
  water: { model: WaterModel; water: CanonicalWater } | null;
  /** An unedited import's water layers (its build keeps the file's water): the check's settle. */
  layers?: { depth: Float64Array; contamination: Float64Array; moist: Float64Array; soil: Float64Array; model: WaterModel };
}

let checks: ChecksWorker | null = null;
/** What the replica has: the generation it follows and the seqs of its log. */
let followed: { gen: object; seqs: number[] } | null = null;

export function useChecksWorker(c: ChecksWorker | null): void {
  checks = c;
  followed = null;
  syncChecks();
}

/** Tell the checks worker what changed; its instant checks come back as an event. */
function syncChecks(): void {
  const s = session;
  const c = checks;
  if (!s || !c) return;
  const log = s.logOps;
  const seqs = log.map((o) => o.seq);
  let p: FollowPayload;
  if (!followed || followed.gen !== s.generationKey) {
    p = { version, doc: s.document, keep: 0, add: [] };
  } else {
    let keep = 0;
    while (keep < seqs.length && keep < followed.seqs.length && seqs[keep] === followed.seqs[keep]) keep++;
    p = { version, keep, add: log.slice(keep) as AppliedOp[] };
  }
  followed = { gen: s.generationKey, seqs };
  const v = version;
  void c.follow(p).then(
    (instant) => {
      if (instant && v === version && session === s) listener?.({ kind: "instant", version: v, instant });
    },
    () => {
      // the replica lost track: send the whole document next time
      followed = null;
    },
  );
}

// the replica's side (the checks worker)

/** Follow the editor's map (the checks worker's replica), and run the instant checks on it. */
export function follow(p: FollowPayload): InstantCheck | null {
  if (p.doc) {
    const s = MapSession.open(p.doc);
    s.setWaterMode("defer");
    session = s;
    sent = null;
    originalFull = null;
  } else {
    const s = need();
    const all = [...s.logOps.slice(0, p.keep), ...p.add];
    s.followLog(all, all.reduce((m, o) => Math.max(m, o.seq + 1), 0));
  }
  version = p.version;
  lastCheck = null;
  return instantCheck(need());
}

/** The background check on the replica, with the canonical water it settled. */
export async function replicaCheck(v: number, onProgress?: (p: CheckProgress) => void): Promise<ReplicaCheck | null> {
  if (v !== version) return null;
  const r = await backgroundCheck(onProgress);
  if (!r) return null;
  const s = need();
  const water = !s.waterPending && !s.showsStoredWater && !s.built.waterFromFile ? { model: s.built.waterModel, water: s.built.settle } : null;
  const lw = lastWater && lastWater.version === version ? lastWater : null;
  return { check: r.check, water, ...(lw ? { layers: { depth: lw.depth, contamination: lw.contamination, moist: lw.moist, soil: lw.soil, model: lw.model } } : {}) };
}

// ------------------------------------------------------------------------------ the live water

/** What the worker tells the page by itself, between its answers (`listen`). */
export type EditorEvent =
  /** The water as it flows after an edit (D133's live water): the whole view, a frame every few
   *  ticks of the game (close together at first, where the water moves most), for the page to play
   *  at a pace the eye can follow. `done` is how far the settle has come (0–1). */
  | { kind: "water"; version: number; water: WaterView; done: number; ticks: number; draft?: boolean }
  /** A weather run (a drought, then the water coming back): its frames, the day, and the end (the
   *  map's own water, exactly). */
  | { kind: "weather"; version: number; water: WaterView; phase: "drought" | "badtide" | "return" | "end"; day: number; days: number; soil?: SoilView }
  /** The water has settled after an edit: the water, the soil and the plants on it. */
  | { kind: "settled"; version: number; view: ViewUpdate; info: SessionInfo }
  /** The instant checks of an edit (with a checks worker, they come a moment after the edit). */
  | { kind: "instant"; version: number; instant: InstantCheck };

let listener: ((e: EditorEvent) => void) | null = null;

/** Where the worker sends its events (the page's editor, through the worker's entry). */
export function listen(fn: ((e: EditorEvent) => void) | null): void {
  listener = fn;
}

/** How the open map's edits treat the water: "defer" in the page (edits never wait on it), or
 *  "preview" (each edit re-settles before it answers; tests of the older flow). */
let waterMode: "defer" | "preview" = "defer";
export function setEditorWaterMode(mode: "defer" | "preview"): void {
  waterMode = mode;
  session?.setWaterMode(mode);
}

/** Whether the worker settles the water by itself after each edit (the page's worker). Node tests
 *  run `settleWater()` themselves. */
let autoWater = false;
export function setAutoWater(on: boolean): void {
  autoWater = on;
}

/** The water settling in the background, and a token that a newer edit changes. */
let waterJob: { token: number; job: PreviewJob; version: number; session: MapSession } | null = null;
let waterToken = 0;
/** Ticks per slice, and how often the page gets the water as it flows. */
const WATER_SLICE_MS = 10;
const WATER_FRAME_MS = 150;


// ---------------------------------------------------------------------- water on a stroke (D197)

/** A stroke being painted: the ground it has made so far, and the water flowing on it. The page
 *  sends the stroke's ground as it paints (`draftStroke`); the water around it starts moving at
 *  once, a tick or two after the ground changes, and the page shows each frame as it comes. On
 *  release the stroke's operation carries this water on (`kickWater`); Esc drops it. */
let draft: { session: MapSession; job: PreviewJob; model: WaterModel; ground: Uint8Array; sent?: Float64Array; fresh: boolean } | null = null;
let draftToken = 0;
/** How often a stroke's water goes to the page. */
const DRAFT_FRAME_MS = 16;

export function draftStroke(rect: { x0: number; y0: number; x1: number; y1: number }, heights: Uint8Array): void {
  const s = session;
  if (!s) return;
  const W = s.size.x;
  if (!draft || draft.session !== s) {
    const from = (waterJob && waterJob.session === s ? waterJob.job.state() : null) ?? s.lastSettled();
    if (!from) return;
    const src = s.built.waterModel;
    const model: WaterModel = { ...src, floor: src.floor.slice() };
    // the edit's own settle waits: the stroke's water takes over from it
    stopWater();
    draft = { session: s, job: new PreviewJob(from, model), model, ground: s.built.heights.slice(), fresh: true };
    const token = ++draftToken;
    setTimeout(() => void runDraft(token), 0);
  }
  // the stroke's ground: the water's floor moves with it (objects on it stay as they are)
  const d = draft;
  // new ground: the next frame goes out as soon as the water has answered it
  d.fresh = true;
  const bw = rect.x1 - rect.x0 + 1;
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * W + x;
      const h = heights[(y - rect.y0) * bw + (x - rect.x0)];
      if (h === d.ground[i]) continue;
      d.model.floor[i] += h - d.ground[i];
      d.ground[i] = h;
    }
}

/** The stroke was taken back (Esc): its water goes, and the map's water settles on as before. */
export function cancelDraft(): void {
  if (!draft) return;
  const s = draft.session;
  draft = null;
  draftToken++;
  if (s !== session) return;
  listener?.({ kind: "water", version, water: waterOf(s), done: 1, ticks: 0, draft: true });
  kickWater();
}

async function runDraft(token: number): Promise<void> {
  let last = 0;
  for (;;) {
    const d = draft;
    if (!d || token !== draftToken || d.session !== session) return;
    const t0 = performance.now();
    // a couple of ticks at a time, the frame out as soon as the ground has moved the water
    let fresh = d.fresh;
    d.fresh = false;
    while (performance.now() - t0 < WATER_SLICE_MS) {
      d.job.sim.run(2);
      if (fresh || performance.now() - last >= DRAFT_FRAME_MS) break;
    }
    if (listener && (fresh || performance.now() - last >= DRAFT_FRAME_MS)) {
      fresh = false;
      last = performance.now();
      // only when the water has moved (a stroke far from water sends nothing)
      const D = d.job.sim.D;
      let moved = !d.sent || d.sent.length !== D.length;
      for (let i = 0; !moved && i < D.length; i++) if (Math.abs(D[i] - d.sent![i]) > 0.01) moved = true;
      if (moved) {
        d.sent = D.slice();
        listener({ kind: "water", version, water: waterOf(d.session, { depth: D, contamination: d.job.sim.C }, d.ground), done: 0, ticks: d.job.ticks, draft: true });
      }
    }
    await breathe();
  }
}

function stopWater(): void {
  waterToken++;
  waterJob = null;
}

/** Start settling the open map's water again, from the water in flight when there is one (so it
 *  keeps flowing: a placed draft's water flows on), else from the last settled water. */
function kickWater(): void {
  const s = session;
  if (!s || !s.waterStale) {
    stopWater();
    return;
  }
  // a kept force's water, or the water flowing on a stroke being painted, carries on (D197); else
  // the water in flight
  const painted = handoff ?? (draft && draft.session === s ? draft.job.state() : null);
  handoff = null;
  draft = null;
  draftToken++;
  const inflight = painted ?? (waterJob && waterJob.session === s ? waterJob.job.state() : null);
  const from: WarmState | null = inflight ?? s.lastSettled();
  if (!from) return;
  const token = ++waterToken;
  waterJob = { token, job: new PreviewJob(from, s.built.waterModel), version, session: s };
  if (autoWater) setTimeout(() => void runWater(token), 0);
}

/** The background settle: a slice at a time, the water to the page as it flows, then the settled
 *  water in place (the plants follow it). Stops when a newer edit takes over. */
/** Ticks between the frames of the water's journey: close together at first, where the water moves
 *  most (a new channel filling), wider apart as it settles. */
function frameGap(ticks: number): number {
  return ticks < 240 ? 4 : ticks < 960 ? 12 : 48;
}

async function runWater(token: number): Promise<void> {
  let lastTicks = -Infinity;
  for (;;) {
    const j = waterJob;
    if (!j || j.token !== token || session !== j.session) return;
    const t0 = performance.now();
    let r: CanonicalWater | null = null;
    while (!r && performance.now() - t0 < WATER_SLICE_MS) {
      r = j.job.advance(4);
      if (r || !listener) continue;
      // a frame every few ticks: the page plays them at a pace the eye can follow
      const ticks = j.job.ticks;
      if (ticks - lastTicks < frameGap(ticks)) continue;
      lastTicks = ticks;
      const done = Math.min(0.99, ticks / TICKS_PER_DAY);
      listener({ kind: "water", version, water: waterOf(j.session, { depth: j.job.sim.D, contamination: j.job.sim.C }), done, ticks });
    }
    if (r) {
      finishWater(j, r);
      return;
    }
    await breathe();
  }
}

function finishWater(j: NonNullable<typeof waterJob>, water: CanonicalWater): void {
  waterJob = null;
  const s = j.session;
  if (session !== s || !s.adoptWater(j.job.model, water)) return;
  const view = viewUpdate(s);
  listener?.({ kind: "settled", version, view, info: sessionInfo(s) });
}

// ------------------------------------------------------------------------------------ weather

/** A hazard to watch (D180 (8), D181 (3)), the map's own length by its difficulty
 *  (core/sim/weather.ts). A drought: every source stops, the rivers drain, the pools evaporate. A
 *  badtide: the clean sources give badwater along the game's curve, and it spreads through the
 *  water and poisons the ground. Then the sources run as before and the water comes back. A frame
 *  every 12 ticks the first day, every 96 after; the soil each day; the end is the map's own water
 *  and soil, exactly. The map never changes. */
let weatherToken = 0;
export function startWeather(hazard: Hazard): void {
  const s = need();
  const token = ++weatherToken;
  const days = hazardDays(s.meta.designedFor ?? "normal", hazard);
  const base = s.built.waterModel;
  // the sources' own copies: a badtide changes what the clean ones give
  const model: WaterModel = { ...base, emitters: base.emitters.map((e) => ({ ...e })) };
  const clean = model.emitters.filter((e) => e.contamination === 0);
  const sim = new WaterSim(model, { depth: Float64Array.from(s.built.water), contamination: Float64Array.from(s.built.contamination) });
  const v = version;
  const { x: W, y: H } = s.size;
  const total = days * TICKS_PER_DAY;
  const send = (phase: "drought" | "badtide" | "return" | "end", water: WaterView, day: number, soil?: SoilView) => listener?.({ kind: "weather", version: v, water, phase, day, days, ...(soil ? { soil } : {}) });
  const soilNow = (depth: Float64Array, contamination: Float64Array) => soilView(moisture(s.built.heights, depth, contamination, W, H, null), soilContamination(s.built.heights, depth, contamination, W, H, null));
  void (async () => {
    let nextSoil = TICKS_PER_DAY;
    for (let t = 0; t < total; ) {
      if (token !== weatherToken || session !== s) return;
      const t0 = performance.now();
      while (t < total && performance.now() - t0 < WATER_SLICE_MS) {
        // closer frames the first day, while the rivers drain or the badwater surges
        const gap = t < TICKS_PER_DAY ? 12 : 96;
        if (hazard === "badtide") for (const e of clean) e.contamination = badtideContamination(t / TICKS_PER_DAY, days);
        sim.run(gap, hazard === "drought" ? 0 : 1);
        t += gap;
        const soil = t >= nextSoil ? soilNow(sim.D, sim.C) : undefined;
        if (soil) nextSoil += TICKS_PER_DAY;
        send(hazard, waterOf(s, { depth: sim.D, contamination: sim.C }), Math.min(days, t / TICKS_PER_DAY), soil);
      }
      await breathe();
    }
    // then the sources run as the map has them, and the water comes back to the settled water
    const back = new PreviewJob({ model: base, water: { settled: false, ticks: 0, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } }, base);
    let last = 0;
    for (;;) {
      if (token !== weatherToken || session !== s) return;
      const t0 = performance.now();
      let r: CanonicalWater | null = null;
      while (!r && performance.now() - t0 < WATER_SLICE_MS) {
        r = back.advance(4);
        if (!r && back.ticks - last >= frameGap(back.ticks)) {
          last = back.ticks;
          send("return", waterOf(s, { depth: back.sim.D, contamination: back.sim.C }), days);
        }
      }
      if (r) break;
      await breathe();
    }
    if (token === weatherToken && session === s) send("end", waterOf(s), days, soilOf(s));
  })();
}

/** Stop a weather run: the map's own water. */
export function stopWeather(): ViewUpdate {
  weatherToken++;
  const s = session;
  return s ? { water: waterOf(s) } : {};
}

/** Settle the open map's water now (Node tests, and anything that must not wait for the
 *  background): the same settle the background runs, in one go. */
export function settleWater(): ViewUpdate {
  const j = waterJob;
  if (!j || session !== j.session) return {};
  let r = j.job.advance(Infinity);
  while (!r) r = j.job.advance(Infinity);
  waterJob = null;
  if (!j.session.adoptWater(j.job.model, r)) return {};
  return viewUpdate(j.session);
}

/** Whether the water is still settling after an edit. */
export function waterSettling(): boolean {
  return !!waterJob && waterJob.session === session;
}

/** Resolves once the water has settled after the latest edit (at once when it has): tests and
 *  benchmarks time the live water with it. */
export function whenWaterSettles(): Promise<void> {
  return new Promise((resolve) => {
    const poll = () => (waterSettling() ? setTimeout(poll, 20) : resolve());
    poll();
  });
}

// ---------------------------------------------------------------------------------- instant checks

/** The load and design checks of the map as it now stands (about 25 ms at 256²), without the
 *  water settle or the thumbnail; `here` marks the problems in the region the edit changed. */
export function instantCheck(s: MapSession = need()): InstantCheck {
  const t0 = performance.now();
  const d = s.built.dirty;
  // what the edit touched: the features it changed, old and new, and the ground that changed
  const parts = d ? [d.region, d.terrain, d.objects].filter((r): r is NonNullable<typeof r> => !!r) : [];
  const region = parts.length ? { x0: Math.min(...parts.map((r) => r.x0)), y0: Math.min(...parts.map((r) => r.y0)), x1: Math.max(...parts.map((r) => r.x1)), y1: Math.max(...parts.map((r) => r.y1)) } : null;
  const file = s.mode === "live" ? toTimberFile(s.spec!, s.built, { thumbnail: blankThumbnail() }) : s.exportFile(s.built, { thumbnail: false });
  const v = validateMap(file, { profile: "export", external: s.mode !== "live", spec: s.spec, designedFor: s.meta.designedFor, features: s.features, loadOnly: true });
  const items: CheckItem[] = [];
  const at = entityPositions(s);
  for (const c of v.report.checks) {
    if (c.ok || c.applicable === false || c.advisory) continue;
    const item = itemOf(c, s);
    if (region) item.here = inRegion(c.where, region, at);
    items.push(item);
  }
  return { items, region: region ? { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 } : null, ms: Math.round(performance.now() - t0) };
}

let blank: Uint8Array | null = null;
/** A 960×540 thumbnail for the instant checks, which only read its size. */
function blankThumbnail(): Uint8Array {
  blank ??= thumbnailJpeg(new Uint8Array(1), 1, 1, null);
  return blank;
}

function entityPositions(s: MapSession): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const e of s.built.entities) out.set(e.id, [e.x, e.y]);
  return out;
}

function inRegion(where: CheckResult["where"], r: { x0: number; y0: number; x1: number; y1: number }, at: Map<string, [number, number]>): boolean {
  const pts: [number, number][] = [...(where?.tiles ?? [])];
  for (const id of where?.entities ?? []) {
    const p = at.get(id);
    if (p) pts.push(p);
  }
  return pts.some(([x, y]) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1);
}

// ------------------------------------------------------------------------------------ opening

function opened(s: MapSession): SessionOpen {
  // an edit never waits on the water (live editing): it shows the last settled water on the new
  // ground at once, the water settles again in the background and flows into the new shape
  // (`kickWater`), and the canonical settle follows, always before an export (EDITOR_PLAN §6)
  s.setWaterMode(waterMode);
  stopWater();
  session = s;
  sent = null;
  originalFull = null;
  lastCheck = null;
  version++;
  followed = null;
  syncChecks();
  return sessionView();
}

/** "Refine this map": open the map the generator just made. */
export function refine(): SessionOpen {
  const r = lastGenerated();
  if (!r) throw new Error("generate a map first");
  if (!r.report.passed) throw new Error("this map did not pass its checks: generate another one first");
  return opened(MapSession.fromGenerated(r, r.file));
}

/** Open any .timber (PLAN §19.6). Saves are refused with a message (ImportError). */
export function openTimber(bytes: Uint8Array, fileName: string): SessionOpen {
  return opened(MapSession.importMap(bytes, fileName));
}

/** Open a project file (.damgoodmaps.json). */
export function openProject(bytes: Uint8Array): SessionOpen {
  const s = MapSession.open(decodeProject(bytes));
  // landforms drawn with the old tools become terrain, the land exactly as it was (D182)
  bakeLandforms(s);
  return opened(s);
}

export function closeSession(): void {
  stopWater();
  force = null;
  series = null;
  session = null;
  sent = null;
  originalFull = null;
  lastCheck = null;
  version++;
}

export function hasSession(): boolean {
  return session !== null;
}

// ------------------------------------------------------------------------------------ editing

export function check(op: EditOp): string[] {
  return need().check(op);
}

export function apply(op: EditOp, origin: OpOrigin = "user", label?: string): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const r = s.apply(op, origin, label);
  return changed(s, r.ok, r.errors, t0);
}

/** The last change a control made step by step (a strength slider moved with the arrow keys):
 *  its key, when, and how long the history was after it. */
let lastStep: { key: string; at: number; length: number; session: MapSession } | null = null;
const STEP_JOIN_MS = 1500;

/** Apply a change a control makes in steps (a slider): shown at once, and steps a moment apart
 *  with the same `key` are one undo step (the latest replaces the one before). */
export function applyStep(op: EditOp, label: string, key: string): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const n = s.history().filter((h) => h.applied).length;
  const joins = lastStep && lastStep.session === s && lastStep.key === key && lastStep.length === n && performance.now() - lastStep.at < STEP_JOIN_MS;
  if (joins) s.undo();
  const r = s.apply(op, "user", label);
  if (!r.ok && joins) s.redo();
  lastStep = r.ok ? { key, at: performance.now(), length: s.history().filter((h) => h.applied).length, session: s } : null;
  return changed(s, r.ok, r.errors, t0);
}

export function applyAll(ops: EditOp[], label: string, origin: OpOrigin = "user"): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const r = s.applyAll(ops, origin, label);
  return changed(s, r.ok, r.errors, t0);
}

export function undo(): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  return changed(s, s.undo(), [], t0);
}

export function redo(): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  return changed(s, s.redo(), [], t0);
}

/** Step back or forward to history entry `index` (the state after it; −1: before the first). */
export function jump(index: number): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  let applied = s.history().filter((h) => h.applied).length - 1;
  let moved = false;
  while (applied > index && s.undo()) {
    applied--;
    moved = true;
  }
  while (applied < index && s.redo()) {
    applied++;
    moved = true;
  }
  return changed(s, moved, [], t0);
}

// ------------------------------------------------------------------------------ regeneration

/** The settings page's view of the open document: its current map, validated. */
export async function settingsResponse(): Promise<GenerateResponse> {
  const t0 = performance.now();
  const s = need();
  if (!s.spec) throw new Error("an imported map has no settings");
  // the canonical water from the checks worker, when it has it, spares settling it here
  if (checks && s.waterPending) await backgroundCheck().catch(() => null);
  const v = s.validate("export");
  return responseOf({
    spec: s.spec,
    features: s.features as Feature[],
    built: s.built,
    checks: v.report.checks,
    passed: v.report.passed,
    analysis: v.analysis,
    attempts: 1,
    ms: Math.round(performance.now() - t0),
    timber: new Uint8Array(),
    project: new Uint8Array(),
    edits: s.editCount,
  });
}

/** Change the settings and regenerate, keeping the player's edits (a `specPatch`, PLAN §19.1). */
export async function regenerate(target: MapSpec): Promise<{ ok: boolean; errors: string[]; response: GenerateResponse | null; info: SessionInfo; orphans: DocOrphan[]; unfit: { id: string; reason: string }[]; editProblems: { id: string; message: string }[] }> {
  const t0 = performance.now();
  const s = need();
  const old = s.spec;
  if (!old) throw new Error("an imported map has no settings to change");
  const patch = specPatch(old, target);
  const r = s.regenerate(patch);
  if (r.ok) {
    version++;
    lastCheck = null;
    stopWater();
    syncChecks();
  }
  const response = r.ok
    ? await responseOf({
        spec: s.spec!,
        features: s.features as Feature[],
        built: s.built,
        checks: r.report!.checks,
        passed: r.report!.passed,
        analysis: r.analysis,
        attempts: r.attempts,
        ms: Math.round(performance.now() - t0),
        timber: new Uint8Array(),
        project: new Uint8Array(),
        edits: s.editCount,
      })
    : null;
  return { ok: r.ok, errors: r.errors, response, info: sessionInfo(s), orphans: r.orphans, unfit: r.unfit, editProblems: r.editProblems };
}

/** The merge patch that turns the document's settings into the settings page's (seed, size,
 *  theme, difficulty and the settings they imply). */
export function specPatch(from: MapSpec, to: MapSpec): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of ["seed", "size", "theme", "archetype", "designedFor", "settings"] as const) {
    if (JSON.stringify(from[k]) !== JSON.stringify(to[k])) patch[k] = to[k];
  }
  // a check that the patch gives the target (it is what the session applies)
  const merged = applyMergePatch(from, patch) as MapSpec;
  for (const k of ["seed", "size", "theme", "designedFor", "settings"] as const) {
    if (JSON.stringify(merged[k]) !== JSON.stringify(to[k])) throw new Error(`the settings patch does not reach ${k}`);
  }
  return patch;
}

// ------------------------------------------------------------------------------------ export

/** The start checks a move fixes: its ground, its door, its dry ring, what covers it. */
const START_FIXABLE = new Set(["start.flat", "start.entrance", "start.dry", "start.clear"]);

function itemOf(c: CheckResult, s: MapSession | null = session): CheckItem {
  let fix = c.fix?.length ? c.fix : undefined;
  if (!fix && s && START_FIXABLE.has(c.id)) {
    const at = startAt(s);
    const ops = at ? moveStartNear(s, at[0], at[1]) : null;
    if (ops) fix = ops.map((op, k) => ({ ...op, label: k === 0 ? "Move the start to the nearest good spot" : "" }) as FixOp);
  }
  // entities are named by id; the page finds them by their tiles
  let where = c.where;
  if (s && where?.entities?.length && !where.tiles?.length) {
    const want = new Set(where.entities.slice(0, 50));
    const tiles: [number, number][] = [];
    for (const e of s.built.entities) if (want.has(e.id)) tiles.push([e.x, e.y]);
    if (tiles.length) where = { ...where, tiles };
  }
  return { id: c.id, class: c.class, message: c.message, ...(where ? { where } : {}), ...(fix ? { fix } : {}) };
}

/** The middle of the map's start, from its feature or its StartingLocation. */
function startAt(s: MapSession): [number, number] | null {
  const f = s.features.find((g) => g.kind === "start");
  if (f && f.kind === "start") return [f.params.position[0], f.params.position[1]];
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  return e ? startCentre(e.x, e.y, e.orientation) : null;
}

/** Whether a failing check was already failing, over the same things, when the map was opened. */
function existedBefore(c: CheckResult, before: Validation): boolean {
  const o = before.report.checks.find((x) => x.id === c.id);
  if (!o || o.ok || o.applicable === false) return false;
  const keys = (w: CheckResult["where"]) => [...(w?.entities ?? []), ...(w?.tiles ?? []).map((t) => t.join(",")), ...(w?.feature ? [w.feature] : [])];
  const now = keys(c.where);
  if (!now.length) return String(c.value) === String(o.value) && c.message === o.message;
  const had = new Set(keys(o.where));
  return now.every((k) => had.has(k));
}

/** Validate the open map for export (PLAN §19.5), in one go: the water settles canonically here
 *  when the preview's water is showing (the background check does the same in slices). */
export function exportCheck(): ExportCheck {
  const t0 = performance.now();
  const s = need();
  if (lastCheck && lastCheck.version === version) return lastCheck;
  const imported = s.mode === "import";
  const v = imported ? s.validate("export", { water: settleNow(importModel(s)) }) : s.validate("export");
  if (imported && !originalFull) originalFull = s.validateOriginal(settleNow(importModel(s, true)));
  return grouped(s, v, t0);
}

/** A validation grouped as the export dialog shows it (PLAN §19.5, D43). */
function grouped(s: MapSession, v: Validation, t0: number): ExportCheck {
  const imported = s.mode === "import";
  const before = imported ? originalFull : null;
  const out: ExportCheck = {
    blocking: [],
    warnings: [],
    advisory: [],
    existing: [],
    playability: true,
    approximate: v.report.checks.find((c) => c.approximate)?.approximate ?? null,
    checks: 0,
    version,
    ms: 0,
  };
  for (const c of v.report.checks) {
    if (c.applicable === false) continue;
    out.checks++;
    if (c.ok) continue;
    if (before && existedBefore(c, before)) out.existing.push(itemOf(c, s));
    else if (c.advisory) out.advisory.push(itemOf(c, s));
    else if (blocks("export", c)) out.blocking.push(itemOf(c, s));
    else out.warnings.push(itemOf(c, s));
  }
  out.ms = Math.round(performance.now() - t0);
  lastCheck = out;
  return out;
}

/** The water model an imported map settles on: its export file's, or (`opened`) the map's as it
 *  was opened. */
function importModel(s: MapSession, opened = false): WaterModel {
  const w = (opened ? s.openedFile() : s.exportFile(s.built, { thumbnail: false })).world;
  const m = waterModel(w.sizeX, w.sizeY, surfaceOf(w), mapObjects(w));
  // the oxbow lakes the map's carves sealed keep their water here too (as the build's model does)
  const kept = opened ? undefined : s.built.waterModel.retained;
  if (kept?.length) m.retained = kept;
  return m;
}

function settleNow(model: WaterModel): { model: WaterModel; settled: CanonicalWater } {
  return { model, settled: canonicalSettle(model) };
}

// ---------------------------------------------------------------------------- background checks

/** A slice of the canonical settle between answers to the page (about 30 ms on a 256² map). */
const SLICE_TICKS = 16;

/** Progress of a background check or an export, for the page. */
export interface CheckProgress {
  stage: "water" | "checks";
  /** 0–1 (the settle's share of its longest possible run). */
  done: number;
}

export interface BackgroundResult {
  check: ExportCheck;
  /** The view after the canonical water replaced the preview's (water, and the plants on it). */
  view: ViewUpdate;
  info: SessionInfo;
}

let bgToken = 0;

/** Let the page's messages in (edits, hover checks) between slices of work: a message to itself,
 *  queued behind any the page sent, without the few milliseconds a timer waits. */
const yieldChannel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
const yielding: (() => void)[] = [];
if (yieldChannel) {
  yieldChannel.port1.onmessage = () => yielding.shift()?.();
  // (in Node the port must not keep the process alive)
  (yieldChannel.port1 as unknown as { unref?: () => void }).unref?.();
  (yieldChannel.port2 as unknown as { unref?: () => void }).unref?.();
}
function breathe(): Promise<void> {
  return new Promise((r) => {
    if (!yieldChannel) return void setTimeout(r, 0);
    yielding.push(r);
    yieldChannel.port2.postMessage(0);
  });
}

/** Run a canonical settle a slice at a time; null when `current` turns false (a newer edit). */
async function settleInSlices(model: WaterModel, current: () => boolean, onProgress?: (p: CheckProgress) => void): Promise<CanonicalWater | null> {
  const run = canonicalRun(model);
  for (;;) {
    const w = run.advance(SLICE_TICKS);
    if (w) return w;
    onProgress?.({ stage: "water", done: Math.min(0.99, run.ticks / run.maxTicks) });
    await breathe();
    if (!current()) return null;
  }
}

/** The full validation in the background (EDITOR_PLAN §6), debounced by the page and dropped when
 *  a newer edit arrives. The canonical settle runs in slices and replaces the preview's water; then
 *  every check runs, water and colony checks included, imported maps too (their own problems, D43,
 *  compare with the map as it was opened, checked the same way). Null when a newer edit made it
 *  stale. */
export async function backgroundCheck(onProgress?: (p: CheckProgress) => void): Promise<BackgroundResult | null> {
  if (checks) return remoteCheck(checks, onProgress);
  const s = need();
  const v0 = version;
  const token = ++bgToken;
  const current = () => session === s && version === v0 && token === bgToken;
  if (lastCheck && lastCheck.version === version && !s.waterPending) return { check: lastCheck, view: {}, info: sessionInfo(s) };
  const t0 = performance.now();
  let view: ViewUpdate = {};
  if (s.waterPending) {
    const run = s.canonicalRun();
    const w = await settleInSlices(run.model, current, onProgress);
    if (!w) return null;
    s.adoptWater(run.model, w);
    // the canonical water replaces the preview's: the background preview has nothing left to do
    stopWater();
    view = viewUpdate(s);
  }
  onProgress?.({ stage: "checks", done: 1 });
  let v: Validation;
  if (s.mode === "import") {
    const model = importModel(s);
    const w = await settleInSlices(model, current, onProgress);
    if (!w) return null;
    // unedited, the map is the map as it was opened: one settle and one validation serve both
    if (!originalFull && s.editCount === 0 && !s.waterPending) {
      originalFull = s.validateOriginal({ model, settled: w });
      lastWaterOf(originalFull, v0, w, model);
      return { check: grouped(s, originalFull, t0), view, info: sessionInfo(s) };
    }
    if (!originalFull) {
      const om = importModel(s, true);
      const ow = await settleInSlices(om, () => session === s, onProgress);
      if (!ow) return null;
      originalFull = s.validateOriginal({ model: om, settled: ow });
      if (!current()) return null;
    }
    v = s.validate("export", { water: { model, settled: w } });
    lastWaterOf(v, v0, w, model);
  } else {
    await breathe();
    if (!current()) return null;
    v = s.validate("export");
  }
  return { check: grouped(s, v, t0), view, info: sessionInfo(s) };
}

/** The background check in the checks worker: its canonical water goes in place here (the view
 *  and the export need it), with an unedited import's water layers. */
async function remoteCheck(c: ChecksWorker, onProgress?: (p: CheckProgress) => void): Promise<BackgroundResult | null> {
  const s = need();
  const v0 = version;
  if (lastCheck && lastCheck.version === version && !s.waterPending) return { check: lastCheck, view: {}, info: sessionInfo(s) };
  const r = await c.check(v0, onProgress);
  if (!r || version !== v0 || session !== s) return null;
  let view: ViewUpdate = {};
  if (r.water && s.waterPending && s.adoptWater(r.water.model, r.water.water)) {
    stopWater();
    view = viewUpdate(s);
  }
  if (r.layers) lastWater = { version: v0, ...r.layers };
  lastCheck = r.check;
  return { check: r.check, view, info: sessionInfo(s) };
}

/** Export the open map. Refused while load problems block it, or while warnings are not
 *  confirmed; confirmed warnings are noted in the map's description. The water settles
 *  canonically first, in slices with progress (PLAN §19.7: a file never gets the preview's water). */
export async function exportTimber(confirmWarnings: boolean, onProgress?: (p: CheckProgress) => void): Promise<{ ok: boolean; errors: string[]; bytes: Uint8Array; fileName: string }> {
  const s = need();
  const v0 = version;
  let bg = await backgroundCheck(onProgress);
  // a newer check of the same map (the page's own, started just after the map opened) takes this
  // one's place: check again, and give up only when the map itself changed
  for (let k = 0; !bg && k < 4 && session === s && version === v0; k++) bg = await backgroundCheck(onProgress);
  if (!bg) return { ok: false, errors: ["the map changed while it was checked: export again"], bytes: new Uint8Array(), fileName: "" };
  const c = bg.check;
  if (c.blocking.length) return { ok: false, errors: c.blocking.map((b) => b.message), bytes: new Uint8Array(), fileName: "" };
  if (c.warnings.length && !confirmWarnings) return { ok: false, errors: ["confirm the warnings first"], bytes: new Uint8Array(), fileName: "" };
  const { bytes, fileName } = s.exportTimber({ warnings: c.warnings.map((w) => w.message) });
  return { ok: true, errors: [], bytes, fileName };
}

/** The project file (downloads use gzip level 9; autosave a faster level). */
export function project(level = 9): { bytes: Uint8Array; fileName: string; name: string; version: number } {
  const s = need();
  return { bytes: s.project(level), fileName: documentFileName(s.document), name: s.meta.name, version };
}

// ------------------------------------------------------------------------------------ the tools

export type ToolRequest =
  | ({ tool: "river" } & RiverRequest)
  | ({ tool: "lake" } & LakeRequest)
  | { tool: "setPiece"; piece: SetPieceKind; request: PlanRecord }
  | ({ tool: "object" } & ObjectRequest)
  | ({ tool: "entity" } & EntityRequest)
  | { tool: "spillway"; at: [number, number]; width?: number }
  | { tool: "riverBadwater"; river: string; on: boolean };

export interface ToolPlan {
  ok: boolean;
  errors: string[];
  /** What the edit does, in plain words: every value reduced, what it clears and adds. */
  report: string[];
  label: string;
  ops: EditOp[];
  /** The tiles the planned feature covers, for the preview. */
  tiles: number[];
  /** A resource area's preview: where plants live, where they would stand dead, what stays bare. */
  area?: AreaPreview;
  featureId: string | null;
}

function toolPlan(r: PlannedEdit | PlannedOps, area?: AreaPreview): ToolPlan {
  if (!r.ok) return { ok: false, errors: r.errors, report: [], label: "", ops: [], tiles: [], featureId: null };
  return { ok: true, errors: [], report: r.report, label: r.label, ops: r.ops, tiles: r.tiles, ...(area ? { area } : {}), featureId: "feature" in r ? r.feature.id : null };
}

/** Plan a tool's edit on the open map without applying it (the preview). `id` is the new
 *  feature's id, or the id of the set piece planned again. */
export function planTool(req: ToolRequest, id: string): ToolPlan {
  const s = need();
  if (req.tool === "setPiece") return toolPlan(planPiece(s, req.piece, req.request, id));
  if (req.tool === "object") {
    const { tool: _t, ...r } = req;
    return toolPlan(planObject(s, r, id));
  }
  if (req.tool === "entity") {
    const { tool: _t, ...r } = req;
    return toolPlan(planEntity(s, r, id));
  }
  if (req.tool === "riverBadwater") return toolPlan(planRiverBadwater(s, req.river, req.on));
  if (req.tool === "spillway") {
    const lake = lakeAt(s, req.at[0], req.at[1]);
    if (!lake) return toolPlan({ ok: false, errors: ["click a lake's shore: a spillway drains a lake"] });
    return toolPlan(planPiece(s, "plugSpillway", { lake, at: req.at, width: req.width ?? 3 }, id));
  }
  // a feature on the map is planned again on the map without it, and changed in place
  const existing = s.features.find((f) => f.id === id) ?? null;
  const ctx = planContextOf(s, existing ? id : null);
  const origin = existing?.origin ?? "user";
  const r = req.tool === "river" ? planRiver(req, ctx, id, origin) : planLake(req, ctx, id, origin);
  if (!r.ok) return toolPlan(r);
  // the objects on the ground it reshapes move with it, or are cleared (EDITOR_PLAN §3, D87)
  if (!existing) return toolPlan(withObjectsOnNewGround(s, r, id));
  const patch = { params: replacePatch(existing.params, r.feature.params) as Record<string, unknown> };
  return toolPlan(withObjectsOnNewGround(s, { ...r, ops: [{ op: "updateFeature", params: { id, patch } }, ...r.ops.slice(1)], label: `Change ${r.label.replace(/^Add /, "")}` }, id));
}

/** Plan and apply a tool's edit as one undo step. */
export function applyTool(req: ToolRequest, id: string): SessionUpdate & { plan: ToolPlan } {
  const t0 = performance.now();
  const s = need();
  const plan = planTool(req, id);
  // (a refused draft's water goes, and the map's own shows again)
  if (!plan.ok) return { ...changed(s, false, plan.errors, t0), plan };
  const r = s.applyAll(plan.ops, "user", plan.label);
  if (!r.ok) return { ...changed(s, false, r.errors, t0), plan };
  return { ...changed(s, r.ok, r.errors, t0), plan };
}

// --------------------------------------------------------------------- the shelf and Remove

/** Trees or bushes painted by a drag from the shelf (D184): one `template` on each of `tiles` where
 *  it can stand (on the map's ground, dry, no object there), as one step. The tiles it planted. */
export function plantAt(template: string, tiles: readonly number[]): SessionUpdate & { planted: number[] } {
  const t0 = performance.now();
  const s = need();
  const { x: W } = s.size;
  const b = s.built;
  const taken = new Uint8Array(W * s.size.y);
  for (const e of b.entities) for (const [tx, ty] of entityTiles(e)) if (tx >= 0 && ty >= 0 && tx < W && ty < s.size.y) taken[ty * W + tx] = 1;
  const ops: EditOp[] = [];
  const planted: number[] = [];
  for (const i of new Set(tiles)) {
    if (i < 0 || i >= taken.length || taken[i] || b.water[i] > 0.05) continue;
    const x = i % W;
    const y = (i - x) / W;
    const p = { template, x, y, orientation: "Cw0" as Orientation };
    if (entityProblem(s, p)) continue;
    taken[i] = 1;
    planted.push(i);
    ops.push({ op: "placeEntity", params: { id: crypto.randomUUID(), ...p } });
  }
  if (!ops.length) return { ...changed(s, false, ["nothing can grow there: it needs dry ground with nothing on it"], t0), planted };
  const name = template === "BlueberryBush" ? "blueberry bush" : template.toLowerCase();
  const label = ops.length === 1 ? `Plant a ${name}` : `Plant ${ops.length} ${name === "blueberry bush" ? "blueberry bushes" : `${name}s`}`;
  const r = s.applyAll(ops, "user", label);
  return { ...changed(s, r.ok, r.errors, t0), planted: r.ok ? planted : [] };
}

/** Remove (D184): the objects standing on `tiles` that `kinds` names, as one step; it never changes
 *  the ground, and the start stays. The tiles the removed objects stood on (their corners). */
export function removeAt(tiles: readonly number[], kinds: readonly RemoveKind[]): SessionUpdate & { removed: number[] } {
  const t0 = performance.now();
  const s = need();
  const { x: W, y: H } = s.size;
  const want = new Set(tiles);
  const take = new Set(kinds);
  const ids: string[] = [];
  const slopes: { x: number; y: number }[] = [];
  const removed: number[] = [];
  let start = false;
  const counts = new Map<RemoveKind, number>();
  for (const e of s.built.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    if (!entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && want.has(ty * W + tx))) continue;
    const kind = removeKindOf(e.template);
    if (!kind) {
      start = true;
      continue;
    }
    if (!take.has(kind)) continue;
    if (kind === "slopes" && (e.owner === DERIVED_SLOPES || e.owner.startsWith("pinned:"))) slopes.push({ x: e.x, y: e.y });
    else ids.push(e.id);
    removed.push(e.y * W + e.x);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  if (!removed.length) return { ...changed(s, false, [start ? "the start stays: pick it on the shelf to move it" : "nothing to remove there"], t0), removed };
  const ops: EditOp[] = [];
  if (ids.length) ops.push({ op: "deleteEntities", params: { entities: ids } });
  for (const p of slopes) ops.push({ op: "removeSlope", params: p });
  const one: Record<RemoveKind, [string, string]> = { trees: ["a tree", "trees"], bushes: ["a bush", "bushes"], ruins: ["a ruin", "ruins"], sources: ["a source", "sources"], slopes: ["a slope", "slopes"], objects: ["an object", "objects"] };
  const label = counts.size === 1 ? (() => { const [k, n] = [...counts][0]; return n === 1 ? `Remove ${one[k][0]}` : `Remove ${n} ${one[k][1]}`; })() : `Remove ${removed.length} objects`;
  const r = s.applyAll(ops, "user", label);
  return { ...changed(s, r.ok, r.errors, t0), removed: r.ok ? removed : [] };
}

/** Move a feature by (dx, dy) tiles; rivers, lakes and set pieces are planned again there. */
export function moveFeature(id: string, dx: number, dy: number): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const r = s.features.find((f) => f.id === id)?.kind === "mapObject" ? moveObject(s, id, dx, dy) : moveEdit(s, id, dx, dy);
  if (!r.ok) return changed(s, false, r.errors, t0);
  const a = s.applyAll(r.ops, "user", r.label);
  return changed(s, a.ok, a.errors, t0);
}

/** Move the map's start so its middle is at (x, y): the start feature of a generated map, or an
 *  imported map's own StartingLocation. */
export function moveStartTo(x: number, y: number, orientation?: Orientation): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const f = s.features.find((g) => g.kind === "start");
  if (f && f.kind === "start") {
    const at = startAt(s)!;
    const moves = x !== at[0] || y !== at[1];
    if (!orientation || orientation === f.params.orientation) return moveFeature(f.id, x - at[0], y - at[1]);
    // turned too (the shelf's R): one step
    const moved = moves ? moveEdit(s, f.id, x - at[0], y - at[1]) : null;
    if (moved && !moved.ok) return changed(s, false, moved.errors, t0);
    const ops: EditOp[] = [...(moved && moved.ok ? moved.ops : []), { op: "updateFeature", params: { id: f.id, patch: { params: { orientation } } } }];
    const r = s.applyAll(ops, "user", moves ? "Move and turn the start" : "Turn the start");
    return changed(s, r.ok, r.errors, t0);
  }
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  if (!e) return changed(s, false, ["this map has no start to move"], t0);
  const o = orientation ?? e.orientation;
  const [cx, cy] = cornerFor(x, y, o);
  const r = s.apply({ op: "moveEntity", params: { id: e.id, x: cx, y: cy, ...(o !== e.orientation ? { orientation: o } : {}) } }, "user", o !== e.orientation ? "Move and turn the start" : "Move start");
  return changed(s, r.ok, r.errors, t0);
}

/** Delete a feature (an on-river fall takes its step out of its river). */
export function deleteFeature(id: string): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const r = deleteEdit(s, id);
  if (!r.ok) return changed(s, false, r.errors, t0);
  const a = s.applyAll(r.ops, "user", r.label);
  return changed(s, a.ok, a.errors, t0);
}

// ------------------------------------------------------------------------------ entities (advanced)

export interface EntityInfo {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  flipped: boolean;
  /** What placed it: a feature's plain name, "placed by hand", "slopes" or "the imported map". */
  from: string;
  /** Its components other than BlockObject, as plain JSON. */
  components: Record<string, unknown>;
}

function plainJson(v: unknown): unknown {
  if (v instanceof JsonFloat) return v.value;
  if (Array.isArray(v)) return v.map(plainJson);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = plainJson((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

/** The entities whose footprint covers tile (x, y), topmost last (advanced mode's inspector). */
export function entitiesAt(x: number, y: number): EntityInfo[] {
  const s = need();
  const names = new Map(s.features.map((f) => [f.id, kindName(f)]));
  const out: EntityInfo[] = [];
  for (const e of s.built.entities) {
    if (e.raw && !placementOf(e.raw)) continue;
    if (!entityTiles(e).some(([tx, ty]) => tx === x && ty === y)) continue;
    const comps = (e.raw ? e.raw.Components : { ...(e.before ?? {}), ...e.components }) as Record<string, unknown>;
    const { BlockObject: _bo, ...rest } = comps;
    const from = names.get(e.owner) ?? (e.owner === "placed" ? "placed by hand" : e.owner.startsWith("derived:") || e.owner.startsWith("pinned:") ? "slopes" : "the imported map");
    out.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, from, components: plainJson(rest) as Record<string, unknown> });
  }
  return out;
}

/** The hover preview of a single object or an entity: its tiles, and why it can't stand there. */
export function footprintCheck(req: ToolRequest): { tiles: number[]; problem: string | null } {
  const s = need();
  if (req.tool !== "object" && req.tool !== "entity") return { tiles: [], problem: null };
  return checkFootprint(s, req);
}

// ------------------------------------------------------------------------------ the water layers

/** The editor's water layers (EDITOR_PLAN §4 overlays, §6): soil moisture, badwater and the soil
 *  it spoils, the analytic drought view, and the tiles under roofs where the preview is
 *  approximate. Per-tile codes, for the page's overlay texture. */
export interface WaterLayers {
  W: number;
  H: number;
  /** Soil moisture bands: 0 dry, 1 moist (under 5), 2 wetter (5–9), 3 wettest (10 and up). */
  moisture: Uint8Array;
  /** 1 badwater, 2 soil its contamination spoils. */
  badwater: Uint8Array;
  /** The drought view: 1 water kept through the map's drought, 2 water that dries up. */
  drought: Uint8Array;
  droughtDays: number;
  /** Water kept through the drought (blocks), and water there now. */
  droughtKept: number;
  droughtNow: number;
  /** Tiles under roofs of an imported map: the preview keeps the file's water there. */
  roofed: Int32Array;
  /** Why the water checks are approximate on this map (null: they are not). */
  approximate: string | null;
  /** The water these layers show is the preview's (the canonical settle is still running). */
  preview: boolean;
  version: number;
}

/** The water layers of the map as it now stands. An unedited import keeps the file's water and
 *  has no settle: its moisture and drought come from the background check's canonical settle,
 *  once it has run (until then they are empty). */
export function waterLayers(): WaterLayers {
  const s = need();
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  const days = rulesFor(s.spec, s.meta.designedFor).droughtDays;
  let depth: ArrayLike<number> = b.water;
  let contamination: ArrayLike<number> = b.contamination;
  let moist: ArrayLike<number> = b.moisture;
  let soil: ArrayLike<number> = b.soilContamination;
  let model = b.waterModel;
  const fromCheck = b.waterFromFile && lastWater && lastWater.version === version ? lastWater : null;
  if (fromCheck) ({ depth, contamination, moist, soil, model } = fromCheck);
  const moisture = new Uint8Array(N);
  const badwater = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const m = moist[i];
    moisture[i] = !(m > 0) ? 0 : m < 5 ? 1 : m < 10 ? 2 : 3;
    if (depth[i] > 0.05 && contamination[i] >= 0.05) badwater[i] = 1;
    else if (soil[i] > 0) badwater[i] = 2;
  }
  const drought = new Uint8Array(N);
  let kept = 0;
  let now = 0;
  if (!b.waterFromFile || fromCheck) {
    const left = droughtStorage(model, depth, days);
    for (let i = 0; i < N; i++) {
      if (!(depth[i] > 0.05)) continue;
      now += depth[i];
      kept += left[i];
      drought[i] = left[i] > 0.05 ? 1 : 2;
    }
  }
  const roofed = Int32Array.from([...s.roofedTiles].sort((a, c) => a - c));
  return {
    W,
    H,
    moisture,
    badwater,
    drought,
    droughtDays: days,
    droughtKept: Math.round(kept),
    droughtNow: Math.round(now),
    roofed,
    approximate: lastCheck && lastCheck.version === version ? lastCheck.approximate : null,
    preview: s.waterPending,
    version,
  };
}

function lastWaterOf(v: Validation, at: number, w: CanonicalWater, model: WaterModel): void {
  if (v.analysis) lastWater = { version: at, depth: w.depth, contamination: w.contamination, moist: v.analysis.moisture, soil: v.analysis.soilContamination, model };
}

/** The canonical water and soil of the last background check of an imported map (the layers of an
 *  unedited import, whose build keeps the file's water). */
let lastWater: { version: number; depth: Float64Array; contamination: Float64Array; moist: Float64Array; soil: Float64Array; model: WaterModel } | null = null;

// ------------------------------------------------------------------------------ the dam-site layer

export interface DamSiteView {
  /** The dam line's tiles. */
  tiles: [number, number][];
  /** Crest above the channel, blocks held, tiles flooded, and the dam's length. */
  height: number;
  volume: number;
  area: number;
  length: number;
}

/** The dam-site layer (EDITOR_PLAN §4): the best straight dams across the map's clean water, the
 *  way `water.reservoir` measures them, best first; within 60 tiles of the start when it has one. */
export function damSiteLayer(): { sites: DamSiteView[]; ms: number } {
  const t0 = performance.now();
  const s = need();
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  if (s.showsStoredWater) return { sites: [], ms: 0 };
  const water = b.water;
  const clean = new Uint8Array(N);
  const surface = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    surface[i] = b.heights[i] + water[i];
    if (water[i] > 0.05 && b.contamination[i] < 0.05) clean[i] = 1;
  }
  const at = startAt(s);
  let dist: Float64Array | null = null;
  if (at) {
    const m = new Uint8Array(N);
    for (let y = at[1] - 1; y <= at[1] + 1; y++) for (let x = at[0] - 1; x <= at[0] + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1;
    dist = distanceFrom(m, W, H);
  }
  const sites = findDamSites(b.heights, clean, surface, W, H, dist).slice(0, 12);
  return {
    sites: sites.map((d) => {
      const half = Math.floor((d.length - 1) / 2);
      const tiles: [number, number][] = [];
      for (let k = -half; k <= d.length - 1 - half; k++) tiles.push([d.x + k * d.dir[1], d.y + k * d.dir[0]]);
      return { tiles, height: d.height, volume: Math.round(d.volume), area: d.area, length: d.length };
    }),
    ms: Math.round(performance.now() - t0),
  };
}

// ------------------------------------------------------------- the forces (D194, D202, D203, D206)

/** A force to start (D194, D202, D203, D206): which, its settings (the seed is the series', Try
 *  another takes the next), where (a carve's origin and aimed end, an impact and its aim, a vent or
 *  a painted fissure, a painted fault and the side that moves), and the layer showing (D207: the
 *  ground above it is left as it is). A painted Lift (`painting`) shows its result as it is painted
 *  (`forcePaint`), and is kept when the pointer lets go. */
export type ForceRequest =
  | { verb: "carve"; settings: CarveSettings; origin: [number, number]; end?: [number, number]; cut: number | null }
  | { verb: "craterize"; settings: CraterSettings; origin: [number, number]; end?: [number, number]; cut: number | null }
  | { verb: "erupt"; settings: EruptSettings; origin: [number, number]; path?: Point[]; cut: number | null }
  | { verb: "quake"; settings: QuakeSettings; path: Point[]; side: 1 | -1; cut: number | null; painting?: boolean };

/** A carve to start: the carve's own request (kept for the carve's calls). */
export type CarveRequest = Omit<Extract<ForceRequest, { verb: "carve" }>, "verb">;

export type AnyForceSettings = CarveSettings | CraterSettings | EruptSettings | QuakeSettings;
export type ForcePoint = Point;

/** The last stretch of a force's course (the effects' muddy ribbon, the camera). */
export interface TrailPoint {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  lanes: Lane[];
}

/** A frame of a force at work: how far it has come, its head (where it is: the camera follows it),
 *  what the effects and sounds need (its cue), and what changed on the map since the last frame
 *  (the heights and the rectangle they changed in; the water it shows; the objects, when they
 *  changed; an eruption's heat on the land, once). */
export interface ForceFrame {
  verb: Verb;
  steps: number;
  done: boolean;
  reason: string;
  head: ForceHead;
  trail: TrailPoint[];
  cue: ForceCue;
  heights?: Uint8Array;
  rect?: { x0: number; y0: number; x1: number; y1: number };
  water?: WaterView;
  entities?: EntityView;
  heat?: Uint8Array;
}

export interface ForceStarted {
  ok: boolean;
  errors: string[];
  frame: ForceFrame | null;
  /** The settings it runs with (Try another: the kept force's, with the next seed). */
  settings: AnyForceSettings | null;
  /** Which force (Try another: the kept one's). */
  verb?: Verb;
}

/** The force at work: its run on its own copy of the map, the map it started from (its result is
 *  against it), and what the page shows of it. */
let force: {
  session: MapSession;
  verb: Verb;
  carve: CarveRun | null;
  staged: StagedRun | null;
  before: FullForceMap;
  /** The terrain the build's last steps start from, before the force (buildTouches). */
  state: TerrainState;
  request: ForceRequest;
  replaces?: number;
  shown: Uint8Array;
  shownEntities: EntityView | null;
  lastEntities: EntitySpec[];
  heatSent: boolean;
} | null = null;

/** The last force kept, and the others tried for it (their operations' seqs): Try another runs it
 *  again from its original land, with the next seed, while one of them is the latest step of the
 *  history. */
let series: { session: MapSession; seqs: Set<number>; base: FullForceMap; state: TerrainState; request: ForceRequest; nextSeed: number } | null = null;

/** Water a kept force hands on: the map's water carries on flowing from it. */
let handoff: WarmState | null = null;

/** The map's hidden rock, derived once from the map as it was opened (D220: never rerolled). */
const geologies = new WeakMap<MapSession, number[]>();
function geologyOf(s: MapSession): number[] {
  let g = geologies.get(s);
  if (!g) geologies.set(s, (g = geology(s.openedHeights)));
  return g;
}

/** The fresh volcanic rock the forces laid (rock.ts), as their operations keep it, on the ground as
 *  it stands; null when there is none. */
const rocks = new WeakMap<object, Uint32Array | null>();
function rockOf(s: MapSession): Uint32Array | null {
  const b = s.built;
  if (rocks.has(b)) return rocks.get(b)!;
  let lava: Uint32Array | null = null;
  for (const op of s.state.sculpts)
    if (op.op === "forceResult" && op.params.rock) {
      lava ??= new Uint32Array(b.W * b.H);
      const { tiles, bits } = op.params.rock;
      for (let k = 0; k < tiles.length; k++) lava[tiles[k]] = bits[k];
    }
  if (lava) trimRock({ heights: b.heights, lava });
  rocks.set(b, lava);
  return lava;
}

/** The trees the forces knocked down (dead, lying away from the blow): the latest force's pose for
 *  each tree still on the map and dead. */
const poses = new WeakMap<object, Map<string, { dx: number; dy: number }>>();
function fallenOf(s: MapSession): Map<string, { dx: number; dy: number }> {
  const b = s.built;
  let out = poses.get(b);
  if (out) return out;
  out = new Map();
  for (const op of s.state.sculpts) if (op.op === "forceResult") for (const f of op.params.felled ?? []) out.set(f.id, { dx: f.dx, dy: f.dy });
  if (out.size) {
    const dead = new Set(b.entities.filter((e) => lifeOf(e.raw ? (e.raw.Components as Record<string, unknown>) : { ...(e.before ?? {}), ...e.components }).dead).map((e) => e.id));
    for (const id of [...out.keys()]) if (!dead.has(id)) out.delete(id);
  }
  poses.set(b, out);
  return out;
}

/** The open map as a force starts from it: its ground, its objects, the water as it stands (the
 *  water in flight, when it is still settling), its rock and the trees already down. */
function sessionForceMap(s: MapSession): FullForceMap {
  const sim = waterJob && waterJob.session === s ? waterJob.job.sim : null;
  const m = forceMapOf(s.built, sim ? { depth: sim.D, contamination: sim.C } : undefined);
  const lava = rockOf(s);
  const W = m.W;
  const down = fallenOf(s);
  const fallen = m.entities
    .filter((e) => down.has(e.id))
    .map((e) => ({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: m.heights[e.y * W + e.x], dx: down.get(e.id)!.dx, dy: down.get(e.id)!.dy, length: e.template === "Oak" ? 2.6 : 2 }));
  return { ...m, rockLayers: geologyOf(s), lava: lava ? lava.slice() : new Uint32Array(m.W * m.H), fallen };
}

/** The same map for Craterize, Erupt and Quake: they work on plain copies of the objects (an
 *  imported object's file entry stays with the map). */
function stagedForceMap(m: FullForceMap): FullForceMap {
  return { ...m, entities: plainEntities(m.entities.map((e) => (e.raw ? (({ raw: _raw, ...rest }) => rest)(e) : e))) };
}

/** The build's integrity pass (its step 7) on a force's final map, round what the force changed:
 *  the map then shows exactly what the build keeps (a one-tile pit or spike the force left beside
 *  its tiles is worn away, levels past the editor's limit are clipped). `state` is the terrain the
 *  build starts its last steps from, before the force; `ground` the heights the force started on. */
function buildTouches(state: TerrainState, ground: Uint8Array): Finalize {
  return (m) => {
    const { W, H } = m;
    const pre = state.pre.slice();
    const protect = state.protect.slice();
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < m.heights.length; i++)
      if (m.heights[i] !== ground[i]) {
        pre[i] = m.heights[i];
        protect[i] = 1;
        const x = i % W;
        const y = (i - x) / W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    if (x1 < 0) return;
    const base = state.base;
    const locked = state.locked;
    const candidate = base ? (i: number) => pre[i] !== base[i] : locked ? (i: number) => !locked[i] : () => true;
    integrityAt(pre, m.heights, W, H, protect, state.channel, candidate, Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(W - 1, x1 + 1), Math.min(H - 1, y1 + 1));
    trimRock(m);
  };
}

function lastSeq(s: MapSession, history: HistoryItem[] = s.history()): number | undefined {
  return history.filter((h) => h.applied).at(-1)?.seq;
}

/** The force Try another would run again: the last kept force (or another tried for it) is the
 *  latest step of the history. */
function againVerb(s: MapSession, history?: HistoryItem[]): Verb | null {
  if (!series || series.session !== s || force) return null;
  const last = lastSeq(s, history);
  return last !== undefined && series.seqs.has(last) ? series.request.verb : null;
}

function againReady(s: MapSession, history?: HistoryItem[]): boolean {
  return againVerb(s, history) === "carve";
}

/** Try another path is there: the last kept carve (or another path tried for it) is the latest
 *  step of the history. */
export function carveAgainReady(): boolean {
  return !!session && againReady(session);
}

const refuse = (text: string): ForceStarted => ({ ok: false, errors: [text], frame: null, settings: null });

/** The words for a force's refusal, from its run's (the start's ground is the quiet "Start here"). */
function refusal(verb: Verb, e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/protected|Start here/.test(text)) return verb === "carve" ? "The start's ground stays as it is: start the carve away from it" : START_REASON;
  return text;
}

function startForce(s: MapSession, base: FullForceMap, req: ForceRequest, replaces?: number, state: TerrainState = s.terrainState()): ForceStarted {
  const { W, H } = base;
  const N = W * H;
  const cut = req.cut;
  const inMap = (p: [number, number]) => p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H;
  const at = (p: [number, number]) => p[1] * W + p[0];
  // the ground no force touches here: above the layer showing, and an imported map's caves
  const keep = new Uint8Array(N);
  if (cut !== null) for (let i = 0; i < N; i++) if (base.heights[i] > cut) keep[i] = 1;
  for (const i of s.columns.keys()) keep[i] = 1;
  const hidden = cut !== null ? "That ground is above the layer showing: show it to change it" : "A force leaves caves and overhangs as they are";
  const points = req.verb === "quake" ? [] : [req.origin, ...(req.verb !== "erupt" && req.end ? [req.end] : [])];
  if (points.some((p) => !inMap(p))) return refuse("Pick a spot on the map");
  if (points.some((p) => keep[at(p)])) return refuse(req.verb === "carve" ? (cut !== null ? "That ground is above the layer showing: show it to carve there" : "A carve leaves caves and overhangs as they are") : hidden);
  let carve: CarveRun | null = null;
  let staged: StagedRun | null = null;
  let map = base;
  try {
    switch (req.verb) {
      case "carve": {
        const aimed = req.settings.mode === "aim" && req.end ? req.end : undefined;
        const intent: CarveIntent = { origin: at(req.origin), ...(aimed ? { end: at(aimed) } : {}) };
        carve = new CarveRun(base, req.settings, intent, { keep, sourceId: crypto.randomUUID() });
        break;
      }
      case "craterize": {
        map = stagedForceMap(base);
        const aimed = req.settings.mode === "aim" && req.end && (req.end[0] !== req.origin[0] || req.end[1] !== req.origin[1]) ? req.end : undefined;
        const settings: CraterSettings = { ...req.settings, mode: aimed ? "aim" : "strike" };
        staged = new CraterRun(map, settings, { origin: at(req.origin), ...(aimed ? { end: at(aimed) } : {}) }, keep);
        staged.finalize = buildTouches(state, base.heights);
        break;
      }
      case "erupt": {
        map = stagedForceMap(base);
        const fissure = req.settings.mode === "fissure" && req.path && req.path.length >= 2;
        staged = new EruptRun(map, { ...req.settings, mode: fissure ? "fissure" : "vent" }, { origin: at(req.origin), ...(fissure ? { path: req.path } : {}) }, keep);
        staged.finalize = buildTouches(state, base.heights);
        break;
      }
      case "quake": {
        map = stagedForceMap(base);
        const run = new QuakeRun(map, req.settings, { path: req.path, side: req.side }, keep);
        run.finalize = buildTouches(state, base.heights);
        if (req.settings.mode === "slide") {
          // Slide carries the land; the start stays where it is: a block with the start on it is
          // refused (X flips which side moves)
          run.planAll();
          const start = map.entities.find((e) => e.template === "StartingLocation");
          const moved = start && run.final()!.entities.find((e) => e.id === start.id);
          if (start && moved && (moved.x !== start.x || moved.y !== start.y)) throw new Error(START_REASON);
        }
        if (req.painting) run.repaint({ path: req.path, side: req.side });
        staged = run;
        break;
      }
    }
  } catch (e) {
    return refuse(refusal(req.verb, e));
  }
  // the map's own water waits: the force's water takes over from it (a weather run ends)
  stopWater();
  weatherToken++;
  draft = null;
  draftToken++;
  force = {
    session: s,
    verb: req.verb,
    carve,
    staged,
    before: map,
    state,
    request: req,
    ...(replaces !== undefined ? { replaces } : {}),
    shown: s.built.heights.slice(),
    shownEntities: sentEntities,
    lastEntities: s.built.entities,
    heatSent: false,
  };
  return { ok: true, errors: [], frame: forceFrame(force), settings: { ...req.settings }, verb: req.verb };
}

/** Start a force on the map as it stands: a new series, at its seed. */
export function forceStart(req: ForceRequest): ForceStarted {
  const s = need();
  if (force) return refuse("A force is already at work: let it finish, or press Esc");
  return startForce(s, sessionForceMap(s), { ...req, settings: { ...req.settings, seed: req.settings.seed ?? 0 } } as ForceRequest);
}

/** Try another: the last kept force again, from its original land, with the next seed. Kept, it
 *  replaces that one (one undo step brings the earlier one back); every try takes a seed. */
export function forceAgain(): ForceStarted {
  const s = need();
  const sr = series;
  if (!sr || !againVerb(s)) return refuse(sr?.request.verb === "carve" || !sr ? "Carve somewhere first: Try another path runs the last carve again" : "Use a force first: Try another runs the last one again");
  sr.nextSeed = nextSeed(sr.nextSeed);
  const req = { ...sr.request, settings: { ...sr.request.settings, seed: sr.nextSeed }, ...(sr.request.verb === "quake" ? { painting: false } : {}) } as ForceRequest;
  return startForce(s, sr.base, req, lastSeq(s), sr.state);
}

/** Start a carve (the carve's own call). */
export function carveStart(req: CarveRequest): ForceStarted {
  return forceStart({ verb: "carve", ...req });
}

/** Try another path (the carve's own call): the last kept carve again. */
export function carveAgain(): ForceStarted {
  const s = need();
  if (!series || againVerb(s) !== "carve") return refuse("Carve somewhere first: Try another path runs the last carve again");
  return forceAgain();
}

function trailOf(run: CarveRun): TrailPoint[] {
  return run.path.slice(-28).map((p) => ({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, width: p.width, lanes: p.lanes.map((l) => ({ ...l })) }));
}

/** A carve's cue (its head, cutting). */
function carveCue(r: CarveRun): ForceCue {
  return { verb: "carve", phase: r.done ? "done" : "carve", progress: 0, x: r.head.x, y: r.head.y, z: r.head.z, size: r.head.width, power: r.settings.power };
}

function forceFrame(f: NonNullable<typeof force>): ForceFrame {
  const map = f.carve ? f.carve.map : f.staged!.map;
  const { W, H } = map;
  let head: ForceHead;
  let trail: TrailPoint[] = [];
  let cue: ForceCue;
  if (f.carve) {
    const r = f.carve;
    head = { ...r.head, ...(r.head.lanes ? { lanes: r.head.lanes.map((l) => ({ ...l })) } : {}) };
    trail = trailOf(r);
    cue = carveCue(r);
  } else {
    cue = f.staged!.cue();
    head = { x: cue.x, y: cue.y, z: cue.z, dx: 1, dy: 0, width: Math.min(24, cue.size), event: "surge", cut: 0 };
  }
  const run = f.carve ?? f.staged!;
  const out: ForceFrame = { verb: f.verb, steps: run.steps, done: run.done, reason: run.reason, head, trail, cue };
  const rect = changedRect(W, H, f.shown, map.heights);
  if (rect) {
    f.shown = map.heights.slice();
    out.heights = map.heights.slice();
    out.rect = rect;
  }
  out.water = waterFromDepth(map.heights, map.water.depth, map.water.contamination);
  if (map.entities !== f.lastEntities) {
    f.lastEntities = map.entities;
    const down = new Map((map.fallen ?? []).map((g) => [g.id, { dx: g.dx, dy: g.dy }]));
    const v = entityView(entityInputs(map.entities, down));
    if (!sameEntityView(v, f.shownEntities)) {
      out.entities = v;
      f.shownEntities = copyEntityView(v);
    }
  }
  if (!f.heatSent && f.staged?.heat) {
    const heat = f.staged.heat();
    if (heat) {
      out.heat = heat.slice();
      f.heatSent = true;
    }
  }
  return out;
}

/** Run the force `steps` steps more (ten are a second of a carve), and what changed. */
export function forceAdvance(steps: number): ForceFrame | null {
  const f = force;
  if (!f || f.session !== session) return null;
  if (f.carve) for (let k = 0; k < steps && !f.carve.done; k++) f.carve.step();
  else for (let k = 0; k < steps && !f.staged!.done; k++) f.staged!.step();
  return forceFrame(f);
}

/** A painted Lift: the fault as it is painted now (the page sends the latest stroke when the worker
 *  is free); the whole result shows at once. */
export function forcePaint(path: Point[], side: 1 | -1): ForceFrame | null {
  const f = force;
  if (!f || f.session !== session || !(f.staged instanceof QuakeRun) || f.request.verb !== "quake") return null;
  try {
    f.staged.repaint({ path, side });
    f.request = { ...f.request, path, side };
  } catch {
    // (a stroke that reaches the start's ground: the last good one stays)
  }
  return forceFrame(f);
}

/** Run the carve `steps` steps more (the carve's own call). */
export function carveAdvance(steps: number): ForceFrame | null {
  return forceAdvance(steps);
}

/** The page's view back to the map as it stands (a force dropped, or refused). */
function restoreView(s: MapSession): ViewUpdate {
  const b = s.built;
  const view: ViewUpdate = { heights: b.heights.slice(), terrainRect: null, water: waterOf(s), entities: entityView(entityInputs(b.entities, fallenOf(s))) };
  sentEntities = copyEntityView(view.entities!);
  markSent(s);
  return view;
}

/** Esc (or undo) while a force is at work: all of it goes at once, and the map's water carries on. */
export function forceCancel(): ViewUpdate {
  const f = force;
  force = null;
  const s = session;
  if (!f || !s || f.session !== s) return {};
  const view = restoreView(s);
  kickWater();
  return view;
}

export const carveCancel = forceCancel;

/** What a staged force asked for, as its operation keeps it. */
function recordOf(f: NonNullable<typeof force>): { settings: ForceSettingsRecord; where: ForceWhere } {
  const req = f.request;
  switch (req.verb) {
    case "craterize": {
      const r = f.staged as CraterRun;
      return { settings: { ...r.settings }, where: { origin: req.origin, ...(r.settings.mode === "aim" && req.end ? { end: req.end } : {}) } };
    }
    case "erupt": {
      const r = f.staged as EruptRun;
      return { settings: { ...r.settings }, where: { origin: req.origin, ...(r.settings.mode === "fissure" && req.path ? { path: pathRecord(req.path) } : {}) } };
    }
    case "quake": {
      const r = f.staged as QuakeRun;
      return { settings: { ...r.settings }, where: { path: pathRecord(r.intent.path), side: r.intent.side } };
    }
    default:
      throw new Error("a carve keeps its own record");
  }
}

/** Keep the force (Stop, or it ended by itself; a painted Lift let go): what it has done, as one
 *  operation and one undo step. The water it shows flows on into the map's settled water. */
export function forceStop(): SessionUpdate & { kept: boolean } {
  const t0 = performance.now();
  const s = need();
  const f = force;
  force = null;
  if (!f || f.session !== s) return { ...changed(s, false, ["There is no force at work"], t0), kept: false };
  const refused = (errors: string[]) => {
    const view = restoreView(s);
    kickWater();
    return { ok: false, errors, info: sessionInfo(s), view, ms: Math.round(performance.now() - t0), kept: false };
  };
  let params: ForceResultParams | null;
  let water: WarmState;
  if (f.carve) {
    const r = f.carve;
    const req = f.request as Extract<ForceRequest, { verb: "carve" }>;
    const aimed = req.settings.mode === "aim" && req.end ? req.end : undefined;
    params = carveForceParams(f.before, r, { settings: req.settings, origin: req.origin, ...(aimed ? { end: aimed } : {}), cut: req.cut, ...(f.replaces !== undefined ? { replaces: f.replaces } : {}) });
    if (!params) return refused(["Nothing was carved"]);
    water = r.liveWater();
  } else {
    const r = f.staged!;
    // a force stopped part way (Esc aside) keeps its whole result: the stages only show it
    if (!r.done && !(r instanceof QuakeRun && r.painting)) r.finishAll();
    const after = r.final();
    if (!after) return refused(["Nothing changed"]);
    if (r instanceof QuakeRun) {
      // the start rides the land; it must still stand flat and dry
      const problem = startProblem({ ...after, water: r.map.water });
      if (problem) return refused([`${problem}: the quake is taken back`]);
    }
    params = forceParamsOf(f.before, after, { verb: f.verb, ...recordOf(f), cut: f.request.cut, steps: r.steps, reason: "done", ...(f.replaces !== undefined ? { replaces: f.replaces } : {}) });
    if (!params) return refused(["Nothing changed"]);
    water = r.liveWater();
  }
  handoff = water;
  const res = s.apply({ op: "forceResult", params }, "user");
  if (!res.ok) {
    handoff = null;
    return refused(res.errors);
  }
  const seq = lastSeq(s)!;
  if (f.replaces !== undefined && series?.seqs.has(f.replaces)) series.seqs.add(seq);
  else series = { session: s, seqs: new Set([seq]), base: f.before, state: f.state, request: f.request, nextSeed: f.request.settings.seed ?? 0 };
  const u = changed(s, true, [], t0);
  handoff = null;
  // the page shows the force's water: the map's water flows on from it, not from the water before
  if (u.view.water && !s.showsStoredWater) u.view.water = waterFromDepth(s.built.heights, water.water.depth, water.water.contamination);
  return { ...u, kept: true };
}

export const carveStop = forceStop;

/** A force is at work. */
export function forcing(): boolean {
  return !!force && force.session === session;
}

export const carving = forcing;
