// The editor's side of the worker (EDITOR_PLAN §8): one open map document (a `MapSession`), and
// what the page needs of it. Messages stay small: after an edit the page gets the document's
// summary (features, history, orphans) and only the parts of the map view that changed, as
// compact typed arrays; never the document itself.
//
// Export follows the `export` profile (PLAN §19.5): load problems block, playability and design
// problems warn and are noted in the map's description when the player exports anyway. An
// imported map's own problems (those it already had when it was opened) are listed but never
// blamed on the player's edits, so an unedited import always exports unchanged (PLAN §20, D43).

import { decodeProject, documentFileName, type MapDocument, type NameResult, type SavedView } from "../core/doc/document";
import { MapSession, type DocOrphan, type HistoryItem, type HistoryMark } from "../core/doc/session";
import type { AppliedOp, EditOp, OpOrigin } from "../core/doc/ops";
import { planStart } from "../core/doc/tools";
import { applySelection as applySelectionStep, startCarriedBack, startCarry } from "../core/doc/start";
import { EVERY_KIND, planRemove, type RemoveKind } from "../core/doc/remove";
export type { RemoveKind };
import { footprintCheck as checkFootprint, planEntity, planMoveEntity, planPlant, withSpringPools, type EntityRequest, type PlannedOps } from "../core/doc/placing";
import { newRampedStroke, planStrokeClearing } from "../core/doc/strokes";
import { groupChecks, instantChecks, NO_START, NO_START_REFUSAL, type CheckGroups, type CheckItem, type TileRect } from "../core/doc/checkItems";
export type { CheckItem };
import type { Runs } from "../core/math/grid";
import { hash32 } from "../core/math/hash";
import { componentsOf, placementOf, type EntitySpec } from "../core/format/entities";
import { plainJson } from "../core/format/json";
import type { Orientation } from "../core/format/footprints";
import { describeTileOf, entitiesAtTile, type EntityInfo, type TileDescription } from "../core/doc/describeTile";
export type { EntityInfo };
import { objectsIn } from "../core/doc/inArea";
import type { ImportReport } from "../core/format/normalize";
import type { Feature } from "../core/features/schema";
import { bakeLandforms } from "../core/doc/bake";
import { HazardRun, hazardDays, type Hazard } from "../core/sim/weather";
import { moisture } from "../core/sim/moisture";
import { soilContamination } from "../core/sim/contamination";
import type { Difficulty, MapSpec } from "../core/spec/mapspec";
import type { Validation } from "../core/validate/checks";
import { canonicalRun, type CanonicalWater } from "../core/sim/prefill";
import { PreviewJob, TICKS_PER_DAY, type WarmState } from "../core/sim/preview";
import { StrokePreview, type TerrainState } from "../core/features/raster/strokePreview";
import type { BrushParams, Rect } from "../core/features/raster/brush";
import type { WeatheredLand } from "../core/features/raster/remoteStroke";
import { mapObjects, waterModel } from "../core/sim/model";
import { WaterSim, type WaterModel } from "../core/sim/water";
import { surfaceOf } from "../core/format/world";
import { changedRect } from "../render3d/mesh";
import type { CarveRun } from "../core/forces/carve/run";
import { CarvePlay } from "../core/forces/carve/play";
import type { Point } from "../core/forces/erupt";
import type { ForceHead, FullForceMap, Lane } from "../core/forces/force";
import type { ForceResultParams, Verb } from "../core/forces/op";
import { geology } from "../core/forces/random";
import { modelOf, QuakeRun, type ForceCue, type StagedRun } from "../core/forces/runs";
import { againRequest, autoPicked, fullForceMapOf, lavaOf, nextForceSeed, planForce, type AnyForceSettings, type ForcePoint, type ForceRequest } from "../core/forces/start";
import { keptForceParams } from "../core/forces/keep";
import { emittersById, type ClearedSource } from "../core/forces/clear";
import { areaDepth } from "../core/features/raster/brush";
import { outflowsOf } from "../render3d/current";
import { emptyColumns, entityView, LAYERS, soilView, waterFromDepth, type EntityView, type MapView, type SoilView, type WaterView } from "../render3d/model";
import { lastGenerated, lastGeneratedSeedWord, lifeOf, responseOf, variantOf, type GenerateResponse } from "./api";

export interface SessionInfo {
  kind: "generated" | "import";
  name: string;
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
  /** Bumped on every change (the page's autosave and checks key on it). */
  version: number;
  /** Changes only when the features do (the page keeps its copy, and its index, meanwhile). */
  featuresKey: string;
  /** The editor's camera bookmarks (D205), saved with the document. */
  views: SavedView[];
  /** The force Try another would run again (the last one kept is the latest step), or null. */
  forceAgain: Verb | null;
  /** The player removed the map's last badwater spring: it is a No badwater map now (D213). */
  badwaterRemoved: boolean;
  /** True until the canonical water can be carried in a saved project (D367). */
  waterPending?: boolean;
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

/** What changed on the map, for the page: the parts of the view that changed and the session's news.
 *  An edit's answer (`SessionUpdate`), a background check's (`BackgroundResult`) and the `settled`
 *  event share it. (A force taken back, `ForceTakenBack`, carries the view's parts at its top level,
 *  as the page reads it.) */
export interface ViewNews {
  view: ViewUpdate;
  info: SessionInfo;
  /** The map's water is settled as this answer leaves (D345, B14): no settle is running for it, so no
   *  journey will follow. False while the worker is settling the water after this change: its frames,
   *  then its settled water, come as events. The water bar reads this, never a guess. */
  waterSettled?: boolean;
}

export interface SessionUpdate extends ViewNews {
  ok: boolean;
  errors: string[];
  ms: number;
  /** The instant checks after the change (PLAN §19.5): null when nothing changed. */
  instant?: InstantCheck | null;
}

/** The instant checks (EDITOR_PLAN §6): the load and design classes, run after every edit on the
 *  map as it now stands; `here` marks the problems in the region the edit changed
 *  (core/doc/checkItems.ts `instantChecks`). */
export interface InstantCheck {
  items: CheckItem[];
  /** The rectangle the edit changed (terrain or objects), or null. */
  region: TileRect | null;
  ms: number;
}

export interface SessionOpen {
  info: SessionInfo;
  view: MapView;
  /** The terrain the page paints strokes on (see ViewUpdate.terrain). */
  terrain: TerrainState;
  ms: number;
}

/** The export check (PLAN §19.5, `export` profile): the validation grouped as the export dialog shows
 *  it (core/doc/checkItems.ts `groupChecks`), at the session's version. */
export interface ExportCheck extends CheckGroups {
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
  const history = s.history();
  return {
    kind: s.spec ? "generated" : "import",
    name: s.meta.name,
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
    featuresKey: featuresKeyOf(s.features),
    views: s.views,
    forceAgain: againVerb(s, history),
    badwaterRemoved: s.badwaterRemoved(),
    waterPending: s.waterPending,
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

/** Rename the map (D443): stored data set by the core, never an operation or an undo step; a blank name is
 *  refused with the core's one-line reason. */
export function setName(name: string): { result: NameResult; info: SessionInfo } {
  const s = need();
  const result = s.setName(name);
  return { result, info: sessionInfo(s) };
}

// ------------------------------------------------------------------------------------ the view

/** A source's strength, for the page's markers (D196). */
function strengthOf(comps: Record<string, unknown>): { strength?: number } {
  const w = comps.WaterSource as { SpecifiedStrength?: unknown } | undefined;
  if (!w) return {};
  const v = plainJson(w.SpecifiedStrength);
  return typeof v === "number" ? { strength: v } : {};
}

/** The objects as the view draws them: every tree upright on its tile, a knocked-down one dead
 *  (D321, item 7: no force leaves a tree leaning). */
function entityInputs(list: readonly EntitySpec[]) {
  const out = [];
  for (const e of list) {
    if (e.raw && !placementOf(e.raw)) continue;
    const comps = componentsOf(e) as Record<string, unknown>;
    out.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, owner: e.owner, flipped: e.flipped, ...lifeOf(comps), ...variantOf(comps), ...strengthOf(comps) });
  }
  return out;
}

/** The water the view shows, with its outflows (the moving water and the falls, current.ts): the live
 *  water's own, else the settle's, else the stored file's. */
function waterOf(s: MapSession, live?: { depth: ArrayLike<number>; contamination: ArrayLike<number>; out: ArrayLike<number> }, ground: Uint8Array = s.built.heights): WaterView {
  const view = columnsWaterOf(s, live, ground);
  // (a build without the outflows, for measuring their own cost: tools/smooth)
  if (import.meta.env?.VITE_DGM_CURRENT === "off") return view;
  const out = live ? live.out : s.showsStoredWater ? s.storedOutflows() : s.built.settle.out;
  const outflow = outflowsOf(view, s.size.x, s.size.y, out);
  if (outflow) view.outflow = outflow;
  return view;
}

function columnsWaterOf(s: MapSession, live?: { depth: ArrayLike<number>; contamination: ArrayLike<number> }, ground: Uint8Array = s.built.heights): WaterView {
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
  return { ...v, templates: [...v.templates], owners: [...v.owners], template: v.template.slice(), x: v.x.slice(), y: v.y.slice(), z: v.z.slice(), orientation: v.orientation.slice(), flags: v.flags.slice(), owner: v.owner.slice(), variant: v.variant.slice(), strength: v.strength.slice(), ids: [...v.ids] };
}

/** The page has these objects already: every field it reads the same, a source's strength and a ruin's
 *  model among them (D368 (4): a strength changed alone was once not sent, and the source's label and
 *  row stayed on the old number). */
function sameEntityView(a: EntityView, b: EntityView | null): boolean {
  if (!b || a.count !== b.count || a.templates.join() !== b.templates.join() || a.owners.join() !== b.owners.join() || a.ids.join() !== b.ids.join()) return false;
  const eq = (p: ArrayLike<number>, q: ArrayLike<number>) => {
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
    return true;
  };
  return eq(a.template, b.template) && eq(a.x, b.x) && eq(a.y, b.y) && eq(a.z, b.z) && eq(a.orientation, b.orientation) && eq(a.flags, b.flags) && eq(a.owner, b.owner) && eq(a.variant, b.variant) && eq(a.strength, b.strength);
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

/** The whole map view (opening a map, or returning to it). */
export function sessionView(): SessionOpen {
  const t0 = performance.now();
  const s = need();
  const b = s.built;
  const view: MapView = { W: b.W, H: b.H, heights: b.heights.slice(), columns: columnsOf(s), water: waterOf(s), entities: entityView(entityInputs(b.entities)), soil: soilOf(s) };
  sentEntities = copyEntityView(view.entities);
  markSent(s);
  return { info: sessionInfo(s), view, terrain: s.terrainState(), ms: Math.round(performance.now() - t0) };
}

function viewUpdate(s: MapSession): ViewUpdate {
  const b = s.built;
  const out: ViewUpdate = {};
  const prev = sent;
  if (!prev || prev.heights.length !== b.heights.length) {
    const all: ViewUpdate = { heights: b.heights.slice(), terrainRect: null, water: waterOf(s), entities: entityView(entityInputs(b.entities)), soil: soilOf(s), terrain: s.terrainState() };
    sentEntities = copyEntityView(all.entities!);
    markSent(s);
    return all;
  }
  const water = s.showsStoredWater ? "stored" : b.water;
  // (the terrain the page paints on carries the settled water too: a Naturalize stroke keeps it, D399)
  if (prev.terrain !== b.cache.terrain || water !== prev.water) out.terrain = s.terrainState();
  if (prev.heights !== b.heights) {
    const rect = changedRect(b.W, b.H, prev.heights, b.heights);
    if (rect) {
      out.heights = b.heights.slice();
      out.terrainRect = rect;
    }
  }
  if (water !== prev.water) out.water = waterOf(s);
  if (water !== prev.water || soilKey(s) !== prev.soil) out.soil = soilOf(s);
  // (a rebuild that placed the same objects again sends none: the page keeps its own)
  if (b.entities !== prev.entities) {
    const v = entityView(entityInputs(b.entities));
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
  return { ok, errors, info: sessionInfo(s), view, ms: Math.round(performance.now() - t0), instant, waterSettled: !(waterJob && waterJob.session === s) };
}

// ------------------------------------------------------------------------------ the checks worker

/** The page's checks run in a worker of their own on a replica of the open map (live editing:
 *  the editor's worker never waits on a check). It follows this worker's map: the document when
 *  the generation changes, otherwise the log. Without one (Node tests) they run here. */
export interface ChecksWorker {
  follow(p: FollowPayload): Promise<FollowResult>;
  check(version: number, onProgress?: (p: CheckProgress) => void): Promise<ReplicaCheck | null>;
}

/** What the replica needs to follow the open map. */
export interface FollowPayload {
  version: number;
  /** The whole document, when the generation changed (or the replica has none yet). With its
   *  stored map (`doc.stored`) while the editor's map still owes D455's replay comparison: the
   *  replica, which opens by rebuilding, compares and answers `stored`. */
  doc?: MapDocument;
  /** Otherwise: keep the first `keep` operations of the replica's log and apply `add`. */
  keep: number;
  add: AppliedOp[];
}

/** The replica's answer to `follow`: the instant checks, and D455's verdict when the document
 *  came with its stored map: whether its log replayed with this code gives that map, byte for byte. */
export interface FollowResult {
  instant: InstantCheck | null;
  stored?: "same" | "differs";
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
    // (a map opened from its stored map, its replay not yet compared: the replica compares, D455)
    const stored = s.storedState;
    p = { version, doc: stored ? { ...s.document, stored } : s.document, keep: 0, add: [] };
  } else {
    let keep = 0;
    while (keep < seqs.length && keep < followed.seqs.length && seqs[keep] === followed.seqs[keep]) keep++;
    p = { version, keep, add: log.slice(keep) as AppliedOp[] };
  }
  followed = { gen: s.generationKey, seqs };
  const v = version;
  void c.follow(p).then(
    (r) => {
      // (the verdict holds whatever was edited since: it is about the map as saved)
      if (r.stored !== undefined && session === s) s.confirmReplay(r.stored === "same");
      if (r.instant && v === version && session === s) listener?.({ kind: "instant", version: v, instant: r.instant });
    },
    () => {
      // the replica lost track: send the whole document next time
      followed = null;
    },
  );
}

// the replica's side (the checks worker)

/** Follow the editor's map (the checks worker's replica), and run the instant checks on it. The
 *  replica opens by rebuilding (the log replayed with this code): with a document that came with
 *  its stored map, that replay is D455's comparison, answered as `stored`. */
export function follow(p: FollowPayload): FollowResult {
  let stored: FollowResult["stored"];
  if (p.doc) {
    const s = MapSession.open(p.doc, { rebuild: true });
    if (p.doc.stored) stored = MapSession.replayMatchesStored(p.doc, s.built) ? "same" : "differs";
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
  return { instant: instantCheck(need()), ...(stored ? { stored } : {}) };
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
  | { kind: "weather"; version: number; phase: "computing" | "day"; hazard: Hazard; day: number; days: number; water?: WaterView; soil?: SoilView }
  /** The water has settled after an edit: the water, the soil and the plants on it. */
  | ({ kind: "settled"; version: number } & ViewNews)
  /** The instant checks of an edit (with a checks worker, they come a moment after the edit). */
  | { kind: "instant"; version: number; instant: InstantCheck };

let listener: ((e: EditorEvent) => void) | null = null;

/** Where the worker sends its events (the page's editor, through the worker's entry). */
export function listen(fn: ((e: EditorEvent) => void) | null): void {
  listener = fn;
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
let draft: { session: MapSession; job: PreviewJob; model: WaterModel; ground: Uint8Array; sent?: Float64Array; fresh: boolean; touched: boolean } | null = null;
let draftToken = 0;
/** How often a stroke's water goes to the page: every frame once the stroke's ground reaches water;
 *  while it doesn't, only the water still settling elsewhere moves, at the journey's pace (each
 *  frame is the whole map's water: sent every frame, it cost the page a frame's time, D244's
 *  measurements). */
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
    draft?.job.dispose();
    draft = { session: s, job: new PreviewJob(from, model), model, ground: s.built.heights.slice(), fresh: false, touched: false };
    const token = ++draftToken;
    setTimeout(() => void runDraft(token), 0);
  }
  // the stroke's ground: the water's floor moves with it (objects on it stay as they are)
  const d = draft;
  const H = s.size.y;
  const D = d.job.sim.D;
  const bw = rect.x1 - rect.x0 + 1;
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * W + x;
      const h = heights[(y - rect.y0) * bw + (x - rect.x0)];
      if (h === d.ground[i]) continue;
      d.model.floor[i] += h - d.ground[i];
      d.ground[i] = h;
      // new ground at the water: the next frame goes out as soon as the water has answered it
      if (!d.fresh)
        for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1) && !d.fresh; yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++)
            if (D[yy * W + xx] > 0.001) {
              d.fresh = true;
              d.touched = true;
              break;
            }
    }
}

/** The stroke was taken back (Esc): its water goes, and the map's water settles on as before. */
export function cancelDraft(): void {
  if (!draft) return;
  const s = draft.session;
  draft.job.dispose();
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
      if (fresh || performance.now() - last >= (d.touched ? DRAFT_FRAME_MS : WATER_FRAME_MS)) break;
    }
    if (listener && (fresh || performance.now() - last >= (d.touched ? DRAFT_FRAME_MS : WATER_FRAME_MS))) {
      fresh = false;
      last = performance.now();
      // only when the water has moved (a stroke far from water sends nothing)
      const D = d.job.sim.D;
      let moved = !d.sent || d.sent.length !== D.length;
      for (let i = 0; !moved && i < D.length; i++) if (Math.abs(D[i] - d.sent![i]) > 0.01) moved = true;
      if (moved) {
        d.sent = D.slice();
        listener({ kind: "water", version, water: waterOf(d.session, { depth: D, contamination: d.job.sim.C, out: d.job.sim.out }, d.ground), done: 0, ticks: d.job.ticks, draft: true });
      }
    }
    await breathe();
  }
}

function stopWater(): void {
  waterToken++;
  waterJob?.job.dispose();
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
  draft?.job.dispose();
  draft = null;
  draftToken++;
  const inflight = painted ?? (waterJob && waterJob.session === s ? waterJob.job.state() : null);
  const from: WarmState | null = inflight ?? s.lastSettled();
  if (!from) return;
  const token = ++waterToken;
  waterJob?.job.dispose();
  waterJob = { token, job: new PreviewJob(from, s.built.waterModel), version, session: s };
  if (autoWater) setTimeout(() => void runWater(token), 0);
}

/** How many ticks the shown water's average spans (a thin sheet's waves, crest to crest, are about twelve). */
const SEEN_TICKS = 12;
/** Closer than this to the simulation, the shown water is the simulation's. */
const SEEN_SNAP = 1e-4;

/** Moving water as it is shown: the simulation's, averaged over the last few ticks of its own time. It
 *  plays many times faster than the game (a force's at about a hundred and twenty times, the water's
 *  journey after an edit faster still), so the slow waves of a thin sheet over flat ground (seconds in the
 *  game) would come round faster than the frames that show them, and the sheet would strobe from frame to
 *  frame; averaged, it moves as it would to the eye. What a force keeps is what was shown; the settled
 *  water at a journey's end is the simulation's own. */
class SeenWater {
  readonly depth: Float64Array;
  readonly contamination: Float64Array;

  constructor(D: Float64Array, C: Float64Array) {
    this.depth = D.slice();
    this.contamination = C.slice();
  }

  /** `ticks` more of the simulation, now at `D` and `C`. */
  see(D: Float64Array, C: Float64Array, ticks: number): void {
    if (ticks <= 0) return;
    // (each tick keeps 1 − 1/SEEN_TICKS of the gap: plain arithmetic, the same in every engine, D401)
    let keep = 1;
    for (let k = 0; k < ticks; k++) keep *= 1 - 1 / SEEN_TICKS;
    const a = 1 - keep;
    const { depth, contamination } = this;
    // (within a hair of the simulation it is the simulation's: still water stays exactly as it was, and
    // only the chunks the water really moves in are drawn again)
    for (let i = 0; i < D.length; i++) {
      const dd = D[i] - depth[i];
      depth[i] = Math.abs(dd) < SEEN_SNAP ? D[i] : depth[i] + a * dd;
      const dc = C[i] - contamination[i];
      contamination[i] = Math.abs(dc) < SEEN_SNAP ? C[i] : contamination[i] + a * dc;
    }
  }
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
  let seen: SeenWater | null = null;
  for (;;) {
    const j = waterJob;
    if (!j || j.token !== token || session !== j.session) return;
    const t0 = performance.now();
    let r: CanonicalWater | null = null;
    while (!r && performance.now() - t0 < WATER_SLICE_MS) {
      const before = j.job.ticks;
      r = j.job.advance(4);
      if (r || !listener) continue;
      const sim = j.job.sim;
      if (seen) seen.see(sim.D, sim.C, j.job.ticks - before);
      else seen = new SeenWater(sim.D, sim.C);
      // a frame every few ticks: the page plays them at a pace the eye can follow
      const ticks = j.job.ticks;
      if (ticks - lastTicks < frameGap(ticks)) continue;
      lastTicks = ticks;
      const done = Math.min(0.99, ticks / TICKS_PER_DAY);
      listener({ kind: "water", version, water: waterOf(j.session, { depth: seen.depth, contamination: seen.contamination, out: sim.out }), done, ticks });
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
  j.job.dispose();
  const s = j.session;
  if (session !== s || !s.adoptWater(j.job.model, water)) return;
  settledNews(s, viewUpdate(s));
}

/** The map's water is settled and in place: tell the page, on the channel its frames came on, so that its
 *  journey ends after them whichever of the worker's paths put the water there (the settle itself, or a
 *  background check that stopped it, D345 B14). */
function settledNews(s: MapSession, view: ViewUpdate): ViewUpdate {
  if (!listener) return view;
  // (the page takes the event's arrays over when it is sent: the answer that follows has its own copy, made first)
  const copy = structuredClone(view);
  listener({ kind: "settled", version, view, info: sessionInfo(s) });
  return copy;
}

// ------------------------------------------------------------------------------------ weather

/** A held weather view (D180 (8), D181 (3); Kyler, 2026-10-04): a drought or a badtide simulated day by day from the
 *  map's settled water, every day's water and soil kept as it is computed, so any day shows at once once reached
 *  and the player can hold it, inspect it and plan against it. Day 0 is the map's own water; the last day by
 *  default is the hazard's length for the map's difficulty (core/sim/weather.ts), and further days are simulated on
 *  request, without a cap (the game's lengths depend on its difficulty). A drought: every source stops, the rivers
 *  drain, the pools evaporate. A badtide: the clean sources give badwater along the game's opening curve, then at
 *  full strength (a held badtide never ends, so its sources never ease back), and it spreads through the water and
 *  poisons the ground. Nothing plays and nothing comes back: the page shows the day it asks for. After an edit the
 *  page asks again; the map's version has changed, so the run starts again from the edited map's settled water.
 *  The map never changes. */
interface WeatherRun {
  session: MapSession;
  version: number;
  hazard: Hazard;
  /** The hazard's default length (its last day by default). */
  days: number;
  /** The hazard's own simulation (its sources' own copies), stepped a day at a time. */
  run: HazardRun;
  sim: WaterSim;
  /** Each day's water as the simulation leaves it, from day 1 on (day 0 is the map's own): only the water is kept;
   *  the ground's moisture and contamination are worked out for the day shown (Kyler, 2026-10-04). */
  kept: (WaterDay | null)[];
  /** How far the run simulates: the day to show, or the default last day for the background's work. */
  want: number;
  /** The day the page asked to see, while it waits for it, or null. */
  show: number | null;
  /** The background work this run does now (its token), or null. */
  prep: number | null;
  running: boolean;
}
/** A day's water, exactly as the simulation left it. */
interface WaterDay {
  depth: Float64Array;
  contamination: Float64Array;
  out: Float64Array;
}
/** Each hazard's run, kept until the map changes (Kyler, 2026-10-04: switching back is instant). */
const weatherRuns: Partial<Record<Hazard, WeatherRun>> = {};
/** The background work's token: a new one starts it, and an edit, a stroke or a force stops it (the page says so the
 *  moment Kyler acts). */
let prepToken = 0;

/** A run still good for the map as it is. */
function currentRun(run: WeatherRun): boolean {
  return weatherRuns[run.hazard] === run && run.session === session && run.version === version;
}

/** The hazard's run for the map as it is: the kept one, or a new one from the map's settled water. */
function runFor(hazard: Hazard): WeatherRun {
  const s = need();
  const old = weatherRuns[hazard];
  if (old && currentRun(old)) return old;
  old?.sim.dispose();
  const base = s.built.waterModel;
  // the hazard's steps are the core's (sim/weather.ts `HazardRun`), held without an end: a held badtide never eases back
  const hazardRun = new HazardRun(base, { depth: Float64Array.from(s.built.water), contamination: Float64Array.from(s.built.contamination) }, hazard, Infinity);
  const run: WeatherRun = { session: s, version, hazard, days: hazardDays(s.meta.designedFor ?? "normal", hazard), run: hazardRun, sim: hazardRun.sim, kept: [null], want: 0, show: null, prep: null, running: false };
  weatherRuns[hazard] = run;
  return run;
}

/** Show day `day` (null: the hazard's default last day) of a drought or a badtide: at once when it is kept, or after
 *  simulating the days up to it, the page told each day as it is reached ("computing") and the day itself at the end
 *  ("day"). Each hazard's days are kept until the map changes, so switching back is instant. */
export function showWeatherDay(hazard: Hazard, day: number | null): void {
  const run = runFor(hazard);
  const target = Math.max(0, day ?? run.days);
  for (const other of Object.values(weatherRuns)) if (other && other !== run) other.show = null;
  if (target < run.kept.length) {
    run.show = null;
    return sendWeatherDay(run, target);
  }
  run.show = target;
  run.want = Math.max(run.want, target);
  void driveWeather(run);
}

/** Work out both hazards' default days in the background, from the map's settled water (Kyler, 2026-10-04: then the
 *  first click is instant too). The page asks only while Kyler is idle and the water has settled, and stops it the
 *  moment he edits, paints or uses a force; it runs a few milliseconds at a time between his messages. */
export async function prepareWeather(): Promise<void> {
  if (!session || (waterJob && waterJob.session === session)) return;
  const token = ++prepToken;
  for (const hazard of ["drought", "badtide"] as const) {
    if (token !== prepToken || !session) return;
    const run = runFor(hazard);
    if (run.kept.length > run.days) continue;
    run.prep = token;
    run.want = Math.max(run.want, run.days);
    await driveWeather(run);
  }
}

/** Stop the background work now (Kyler edits, paints or uses a force). */
export function stopWeatherPrep(): void {
  prepToken++;
}

/** The page is told the day it asked for: its water exactly as kept, and the ground's moisture and contamination
 *  worked out for it now (day 0: the map's own water and soil). */
function sendWeatherDay(run: WeatherRun, day: number): void {
  const s = run.session;
  const k = run.kept[day];
  if (!k) return void listener?.({ kind: "weather", version: run.version, phase: "day", hazard: run.hazard, day, days: run.days, water: waterOf(s), soil: soilOf(s) });
  const { x: W, y: H } = s.size;
  const soil = soilView(moisture(s.built.heights, k.depth, k.contamination, W, H, null), soilContamination(s.built.heights, k.depth, k.contamination, W, H, null));
  listener?.({ kind: "weather", version: run.version, phase: "day", hazard: run.hazard, day, days: run.days, water: waterOf(s, { depth: k.depth.slice(), contamination: k.contamination.slice(), out: k.out.slice() }), soil });
}

/** Simulate the run's days up to what it wants, a slice at a time, keeping each day; the day the page waits for is
 *  sent as soon as it is reached. It goes on while the page waits for a day, or while its background work is still
 *  wanted; one drive per run at a time. */
async function driveWeather(run: WeatherRun): Promise<void> {
  if (run.running) return;
  const wanted = () => currentRun(run) && (run.show !== null || (run.prep !== null && run.prep === prepToken));
  let lastNews = 0;
  run.running = true;
  try {
    while (run.kept.length - 1 < run.want) {
      const day = run.kept.length;
      let t = 0;
      while (t < TICKS_PER_DAY) {
        if (!wanted()) return;
        const t0 = performance.now();
        while (t < TICKS_PER_DAY && performance.now() - t0 < WATER_SLICE_MS) {
          const gap = Math.min(24, TICKS_PER_DAY - t);
          run.run.step(gap);
          t += gap;
        }
        // (how far the day the page waits for is, for the fill in its day box: a few times a second)
        if (run.show !== null && performance.now() - lastNews > 120) {
          lastNews = performance.now();
          listener?.({ kind: "weather", version: run.version, phase: "computing", hazard: run.hazard, day: day - 1 + t / TICKS_PER_DAY, days: run.show });
        }
        await breathe();
      }
      if (!currentRun(run)) return;
      const { D, C, out } = run.sim;
      run.kept.push({ depth: D.slice(), contamination: C.slice(), out: out.slice() });
      if (run.show !== null) {
        if (day >= run.show) {
          const shown = run.show;
          run.show = null;
          sendWeatherDay(run, shown);
        }
      }
    }
  } finally {
    run.running = false;
    if (run.prep !== null && run.kept.length > run.days) run.prep = null;
  }
}

/** Stop the weather view: the map's own water (each hazard's kept days stay, until the map changes). */
export function stopWeather(): ViewUpdate {
  for (const run of Object.values(weatherRuns)) if (run) run.show = null;
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
  j.job.dispose();
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
 *  water settle or the thumbnail; `here` marks the problems in the region the edit changed
 *  (core/doc/checkItems.ts `instantChecks`). */
export function instantCheck(s: MapSession = need()): InstantCheck {
  const t0 = performance.now();
  const { items, region } = instantChecks(s);
  return { items, region, ms: Math.round(performance.now() - t0) };
}

// ------------------------------------------------------------------------------------ opening

/** Dropping a map drops every job that still owns its water and force state. */
function discardSessionWork(): void {
  stopWater();
  draft?.job.dispose();
  draft = null;
  draftToken++;
  handoff = null;
  endForceWater();
  // (each hazard's held days go with the map, their simulations freed)
  prepToken++;
  for (const h of ["drought", "badtide"] as const) {
    weatherRuns[h]?.sim.dispose();
    delete weatherRuns[h];
  }
  force = null;
  series = null;
  lastKept = null;
  takenBack.clear();
}

function opened(s: MapSession): SessionOpen {
  // an edit never waits on the water (live editing): it shows the last settled water on the new
  // ground at once, the water settles again in the background and flows into the new shape
  // (`kickWater`), and the canonical settle follows, always before an export (EDITOR_PLAN §6)
  // (edits never wait on the water: the page's flow)
  s.setWaterMode("defer");
  discardSessionWork();
  session = s;
  sent = null;
  originalFull = null;
  lastCheck = null;
  version++;
  followed = null;
  syncChecks();
  return sessionView();
}

/** Opens the map the generator just made in the editor. */
export function refine(): SessionOpen {
  const r = lastGenerated();
  if (!r) throw new Error("generate a map first");
  if (!r.report.passed) throw new Error("this map did not pass its checks: generate another one first");
  return opened(MapSession.fromGenerated(r, r.file, lastGeneratedSeedWord()));
}

/** Open any .timber (PLAN §19.6). Saves are refused with a message (ImportError). */
export function openTimber(bytes: Uint8Array, fileName: string): SessionOpen {
  return opened(MapSession.importMap(bytes, fileName));
}

/** Open a project file (.damgoodmaps.json). */
export function openProject(bytes: Uint8Array): SessionOpen {
  // (a project saved before its water settled shows its saved base water while the checks replica builds
  // the canonical water)
  const s = MapSession.open(decodeProject(bytes), { deferWater: true });
  // landforms drawn with the old tools become terrain, the land exactly as it was (D182)
  bakeLandforms(s);
  return opened(s);
}

export function closeSession(): void {
  discardSessionWork();
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

export function apply(op: EditOp, origin: OpOrigin = "user", label?: string): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const refused = newRampedStroke(op);
  if (refused) return changed(s, false, [refused], t0);
  const r = s.apply(op, origin, label);
  return changed(s, r.ok, r.errors, t0);
}

// (a new ramped Flatten is refused: core/doc/strokes.ts `newRampedStroke`)

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
  // (a badwater source in the group cuts its spring pool: core/doc/placing.ts `withSpringPools`)
  const r = s.applyAll(withSpringPools(s, ops), origin, label);
  return changed(s, r.ok, r.errors, t0);
}

export function undo(): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const ok = s.undo();
  // (refused at the save point of a map opened from its stored map: the reason, D455)
  const stopped = ok ? null : s.undoStopped;
  return changed(s, ok, stopped ? [stopped] : [], t0);
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

// ------------------------------------------------------------------------------ settings page

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
  });
}

// ------------------------------------------------------------------------------------ export

/** A validation grouped as the export dialog shows it (PLAN §19.5, D43; core/doc/checkItems.ts
 *  `groupChecks`), kept as the session's last check. */
function grouped(s: MapSession, v: Validation, t0: number): ExportCheck {
  const out: ExportCheck = { ...groupChecks(s, v, s.mode === "import" ? originalFull : null), version, ms: 0 };
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
  // and the unfed water Remove unfed water took stays gone (D387 (2))
  const drained = opened ? undefined : s.built.waterModel.drained;
  if (drained?.length) m.drained = drained;
  return m;
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

/** A background check's answer; its view is the one after the canonical water replaced the preview's
 *  (water, and the plants on it). */
export interface BackgroundResult extends ViewNews {
  check: ExportCheck;
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
  if (lastCheck && lastCheck.version === version && !s.waterPending) return { check: lastCheck, view: {}, info: sessionInfo(s), waterSettled: !waterSettling() };
  const t0 = performance.now();
  let view: ViewUpdate = {};
  // a map opened from its stored map, with no checks worker to replay its log: the replay here,
  // once (a full build), before the checks; undo below the save point waits on it (D455)
  if (s.replayPending) {
    await breathe();
    if (!current()) return null;
    s.checkReplay();
  }
  if (s.waterPending) {
    const model = s.built.waterModel;
    const w = await settleInSlices(model, current, onProgress);
    if (!w) return null;
    s.adoptWater(model, w);
    // the canonical water replaces the preview's: the background preview has nothing left to do
    stopWater();
    view = settledNews(s, viewUpdate(s));
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
      return { check: grouped(s, originalFull, t0), view, info: sessionInfo(s), waterSettled: !waterSettling() };
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
  return { check: grouped(s, v, t0), view, info: sessionInfo(s), waterSettled: !waterSettling() };
}

/** The background check in the checks worker: its canonical water goes in place here (the view
 *  and the export need it), with an unedited import's water layers. */
async function remoteCheck(c: ChecksWorker, onProgress?: (p: CheckProgress) => void): Promise<BackgroundResult | null> {
  const s = need();
  const v0 = version;
  if (lastCheck && lastCheck.version === version && !s.waterPending) return { check: lastCheck, view: {}, info: sessionInfo(s), waterSettled: !waterSettling() };
  const r = await c.check(v0, onProgress);
  if (!r || version !== v0 || session !== s) return null;
  let view: ViewUpdate = {};
  if (r.water && s.waterPending && s.adoptWater(r.water.model, r.water.water)) {
    stopWater();
    view = settledNews(s, viewUpdate(s));
  }
  if (r.layers) lastWater = { version: v0, ...r.layers };
  lastCheck = r.check;
  return { check: r.check, view, info: sessionInfo(s), waterSettled: !waterSettling() };
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
  if (c.blocking.length) return { ok: false, errors: c.blocking.map((b) => (b.id === "start.count" && b.message === NO_START ? NO_START_REFUSAL : b.message)), bytes: new Uint8Array(), fileName: "" };
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

/** What the shelf places (D184): an object or a source, one entity (EDITOR_PLAN §4). */
export type ToolRequest = { tool: "entity" } & EntityRequest;

export interface ToolPlan {
  ok: boolean;
  errors: string[];
  /** What the edit does, in plain words. */
  report: string[];
  label: string;
  ops: EditOp[];
  /** The tiles it covers, for the preview. */
  tiles: number[];
}

/** Plan a shelf placement on the open map without applying it. */
function planTool(req: ToolRequest, id: string): ToolPlan {
  const { tool: _t, ...r } = req;
  const p: PlannedOps = planEntity(need(), r, id);
  if (!p.ok) return { ok: false, errors: p.errors, report: [], label: "", ops: [], tiles: [] };
  return { ok: true, errors: [], report: p.report, label: p.label, ops: p.ops, tiles: p.tiles };
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
 *  it can stand, as one step (core/doc/placing.ts `planPlant`). The tiles it planted. */
export function plantAt(template: string, tiles: readonly number[]): SessionUpdate & { planted: number[] } {
  const t0 = performance.now();
  const s = need();
  const p = planPlant(s, template, tiles, () => crypto.randomUUID());
  if (!p.ok) return { ...changed(s, false, p.errors, t0), planted: [] };
  const r = s.applyAll(p.ops, "user", p.label);
  return { ...changed(s, r.ok, r.errors, t0), planted: r.ok ? p.planted : [] };
}

/** Remove (D184): the objects standing on `tiles` that `kinds` names, as one step; it never changes
 *  the ground (core/doc/remove.ts `planRemove`). The tiles the removed objects stood on. */
export function removeAt(tiles: readonly number[], kinds: readonly RemoveKind[], label?: string): SessionUpdate & { removed: number[] } {
  const t0 = performance.now();
  const s = need();
  const p = planRemove(s, tiles, kinds, label);
  if (!p.ok) return { ...changed(s, false, p.errors, t0), removed: [] };
  const r = s.applyAll(p.ops, "user", p.label);
  return { ...changed(s, r.ok, r.errors, t0), removed: r.ok ? p.removed : [] };
}

/** What is on tile (x, y): its ground and every object standing on it (D347, B11). */
export function describeTileAt(x: number, y: number): TileDescription | null {
  return describeTileOf(need(), x, y);
}

/** What stands in `tiles`, by template, and how much of it is under water (D345, B5): Delete's menu. */
export function objectsInArea(tiles: readonly number[]): { counts: Record<string, number>; submerged: Record<string, number> } {
  return objectsIn(need(), tiles);
}

/** Clear everything (D323 item 44): every source, badwater source, tree, bush, ruin, object, slope
 *  and the start, as one undo step, leaving only the terrain; the water drains as its sources go
 *  (D260). */
export function clearEverything(): SessionUpdate & { removed: number[] } {
  const s = need();
  const all = Array.from({ length: s.size.x * s.size.y }, (_, i) => i);
  return removeAt(all, EVERY_KIND, "Clear everything");
}

/** A Select action (D259, D264): its operations as one step, exact; objects and sources on the
 *  changed ground ride it (the build stands them on their ground), and the start, only if its own
 *  ground (`tiles` changed) can no longer hold it, is carried to the nearest level ground in the same
 *  step (D257's rule). */
export function applySelection(ops: EditOp[], label: string, tiles: readonly number[]): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  // (the step and its carry are the core's: core/doc/start.ts `applySelection`)
  const r = applySelectionStep(s, ops, label, tiles);
  if (!r.ok) return changed(s, false, r.errors, t0);
  return changed(s, true, [], t0);
}

/** A brush stroke with **Clear sources** on (D249): the stroke and the removal of every water or
 *  badwater source standing on `tiles` (the tiles it pressed), one undo step; the water recedes
 *  live. Without a source there it is the stroke alone (core/doc/strokes.ts `planStrokeClearing`). */
export function strokeClearing(op: EditOp, label: string, tiles: readonly number[]): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const p = planStrokeClearing(s, op, label, tiles);
  if (!p.ok) return changed(s, false, p.errors, t0);
  const r = p.cleared ? s.applyAll(p.ops, "user", p.label) : s.apply(op, "user", label);
  return changed(s, r.ok, r.errors, t0);
}

/** Move a placed object (a mine site, a relic, a geothermal field, a natural dam, a blockage) by (dx, dy)
 *  tiles, its ground levelled as a placement's is: one step (D345, B7). */
export function moveObjectBy(id: string, dx: number, dy: number): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const p = planMoveEntity(s, id, dx, dy);
  if (!p.ok) return changed(s, false, p.errors, t0);
  const r = s.applyAll(p.ops, "user", p.label);
  return changed(s, r.ok, r.errors, t0);
}

/** Move the map's start so its middle is at (x, y): the start feature of a generated map, or an
 *  imported map's own StartingLocation; with none, the shelf's Start places one (core/doc/tools.ts
 *  `planStart`). */
export function moveStartTo(x: number, y: number, orientation?: Orientation): SessionUpdate {
  const t0 = performance.now();
  const s = need();
  const p = planStart(s, x, y, orientation, () => crypto.randomUUID());
  if (!p.ok) return changed(s, false, p.errors, t0);
  const r = s.applyAll(p.ops, "user", p.label);
  return changed(s, r.ok, r.errors, t0);
}

// ------------------------------------------------------------------------------ entities (advanced)

/** The entities whose footprint covers tile (x, y), topmost last (advanced mode's inspector;
 *  core/doc/describeTile.ts `entitiesAtTile`). */
export function entitiesAt(x: number, y: number): EntityInfo[] {
  return entitiesAtTile(need(), x, y);
}

/** The hover preview of an object or a source from the shelf: its tiles, and why it can't stand there. */
export function footprintCheck(req: ToolRequest): { tiles: number[]; problem: string | null; level?: number } {
  return checkFootprint(need(), req);
}

// ------------------------------------------------------------------------------ the water layers

/** The editor's water layers (EDITOR_PLAN §3 view buttons, D287): badwater and the soil it spoils,
 *  and the tiles under roofs where the preview is approximate. Per-tile codes, for the page's
 *  overlay texture. (No moisture or drought layer: the land shows moisture, and the water bar's
 *  Drought shows a drought day by day.) */
export interface WaterLayers {
  W: number;
  H: number;
  /** 1 badwater, 2 soil its contamination spoils. */
  badwater: Uint8Array;
  /** Tiles under roofs of an imported map: the preview keeps the file's water there. */
  roofed: Int32Array;
  /** Why the water checks are approximate on this map (null: they are not). */
  approximate: string | null;
  /** The water these layers show is the preview's (the canonical settle is still running). */
  preview: boolean;
  version: number;
}

/** The water layers of the map as it now stands. An unedited import keeps the file's water and
 *  has no settle: its badwater soil comes from the background check's canonical settle, once it
 *  has run. */
export function waterLayers(): WaterLayers {
  const s = need();
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  let depth: ArrayLike<number> = b.water;
  let contamination: ArrayLike<number> = b.contamination;
  let soil: ArrayLike<number> = b.soilContamination;
  const fromCheck = b.waterFromFile && lastWater && lastWater.version === version ? lastWater : null;
  if (fromCheck) ({ depth, contamination, soil } = fromCheck);
  const badwater = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (depth[i] > 0.05 && contamination[i] >= 0.05) badwater[i] = 1;
    else if (soil[i] > 0) badwater[i] = 2;
  }
  const roofed = Int32Array.from([...s.roofedTiles].sort((a, c) => a - c));
  return {
    W,
    H,
    badwater,
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

// ------------------------------------------------------------- the forces (D194, D202, D203, D206)

// (the request, its planning and its operation are the core's: forces/start.ts, forces/keep.ts)
export type { AnyForceSettings, ForcePoint, ForceRequest };

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
 *  (the heights and the rectangle they changed in; the objects, when they changed; an eruption's heat
 *  on the land, once). No water: it stays as it was until the land is final (D321, item 30). Once
 *  the force is worked out (`planned`), `total` steps show it and `shown` of them have: the page
 *  paces them (Fast or Slow forces, item 29). */
export interface ForceFrame {
  verb: Verb;
  steps: number;
  done: boolean;
  reason: string;
  planned: boolean;
  total: number;
  shown: number;
  head: ForceHead;
  trail: TrailPoint[];
  cue: ForceCue;
  heights?: Uint8Array;
  rect?: { x0: number; y0: number; x1: number; y1: number };
  entities?: EntityView;
  heat?: Uint8Array;
  /** Sources set to Clear (D474): every source the force has cleared by this frame, each with the
   *  step (`shown`) that took it; absent when none has gone yet. A source listed here is gone from this
   *  frame on, even before `entities` (sent a few times a second) drops it. Carve and Glaciate take the
   *  sources they reach themselves (as any object they take, not listed here). A carve's own water stops
   *  the emitter of any source that leaves the land shown, so its water drains; a riding one runs on. */
  cleared?: ClearedSource[];
}

export interface ForceStarted {
  ok: boolean;
  errors: string[];
  frame: ForceFrame | null;
  /** The settings it runs with (Try another: the kept force's, with the next seed). */
  settings: AnyForceSettings | null;
  /** Which force (Try another: the kept one's). */
  verb?: Verb;
  /** Its gesture (D341): what `forceCancel` names to take it back. */
  gesture?: number;
}

/** What Esc or undo took back (`forceCancel`): the force at work, a force already kept (as if it had
 *  never been: its step gone from the history, what Redo held back as it was), or nothing; the map's
 *  view as it now stands, and the session's news when the history changed. */
export interface ForceTakenBack extends ViewUpdate {
  taken: "work" | "kept" | null;
  info?: SessionInfo;
  /** Why nothing was taken back, when a kept force was named. */
  reason?: string;
  /** As `SessionUpdate.waterSettled`, for the history that changed (D345, B14). */
  waterSettled?: boolean;
}

/** The force at work: its run on its own copy of the map, the map it started from (its result is
 *  against it), and what the page shows of it. */
let force: {
  session: MapSession;
  /** Its gesture (D341). */
  gesture: number;
  verb: Verb;
  carve: CarveRun | null;
  /** A carve as the page is shown it: worked out first, then played back (carve/play.ts). */
  play: CarvePlay | null;
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
  /** When the page last got the force's water and objects (they go at most every FORCE_VIEW_MS). */
  viewAt: number;
} | null = null;

/** A force's objects go to the page at most this often (and always with its last frame): each is a
 *  whole map's update on the page, so the land's own changes keep the page's frames free. */
const FORCE_VIEW_MS = 120;

/** The last force kept, and the others tried for it (their operations' seqs): Try another runs it
 *  again from its original land, with the next seed, while one of them is the latest step of the
 *  history. */
interface ForceSeries {
  session: MapSession;
  seqs: Set<number>;
  base: FullForceMap;
  state: TerrainState;
  request: ForceRequest;
  nextSeed: number;
}
let series: ForceSeries | null = null;

/** Esc or undo leaves the map exactly as it was before the gesture, whenever it arrives, and nothing
 *  lands afterwards (PLAN §20 D341). The page names each force it starts (its gesture), so the rule
 *  holds here, whatever the order the calls arrive in: a gesture taken back before its start reached
 *  the worker never starts; one at work is dropped; one already kept (its keep was on its way when
 *  Esc came) is taken back as if it had never been kept, while its step is still the latest. */
let gestureLast = 0;
const takenBack = new Set<number>();
let lastKept: { gesture: number; session: MapSession; mark: HistoryMark; series: ForceSeries | null; seq: number } | null = null;

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
  const lava = lavaOf(s.state.sculpts, b.heights, b.W, b.H);
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
    const dead = new Set(b.entities.filter((e) => lifeOf(componentsOf(e) as Record<string, unknown>).dead).map((e) => e.id));
    for (const id of [...out.keys()]) if (!dead.has(id)) out.delete(id);
  }
  poses.set(b, out);
  return out;
}

/** The open map as a force starts from it: its ground, its objects, the water as it stands (the
 *  water in flight, when it is still settling), its rock and the trees already down. */
function sessionForceMap(s: MapSession): FullForceMap {
  const sim = waterJob && waterJob.session === s ? waterJob.job.sim : null;
  return fullForceMapOf(s.built, { ...(sim ? { water: { depth: sim.D, contamination: sim.C } } : {}), rockLayers: geologyOf(s), lava: rockOf(s), down: fallenOf(s), usedIds: s.usedEntityIds() });
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

const refuse = (text: string): ForceStarted => ({ ok: false, errors: [text], frame: null, settings: null });

function startForce(s: MapSession, base: FullForceMap, req: ForceRequest, replaces?: number, state: TerrainState = s.terrainState()): ForceStarted {
  // (its gesture, D341: one taken back before it got here never starts)
  const gesture = req.gesture ?? gestureLast + 1;
  if (takenBack.delete(gesture)) return refuse("That force was taken back");
  gestureLast = Math.max(gestureLast, gesture);
  // (planned in the core, forces/start.ts; the worker names a carve's source)
  const plan = planForce({ base, request: req, caves: s.columns.keys(), state, newId: () => crypto.randomUUID() });
  if (!plan.ok) return refuse(plan.error);
  req = plan.request;
  const carve = plan.carve;
  // the map's own water waits: the force's water takes over from it (a weather run stops; the page asks for its held
  // day again once the force's water has settled)
  stopWater();
  prepToken++;
  for (const run of Object.values(weatherRuns)) if (run) run.show = null;
  draft?.job.dispose();
  draft = null;
  draftToken++;
  force = {
    session: s,
    gesture,
    verb: req.verb,
    carve,
    // (a river drawn uphill is shown from its end, the way it was drawn: D344, A5; its land the same)
    play: carve ? new CarvePlay(carve, req.verb === "carve" && req.shownFrom === "end") : null,
    staged: plan.staged,
    before: plan.before,
    state,
    request: req,
    ...(replaces !== undefined ? { replaces } : {}),
    shown: s.built.heights.slice(),
    shownEntities: sentEntities,
    lastEntities: s.built.entities,
    heatSent: false,
    viewAt: -Infinity,
  };
  startForceWater(force);
  // (the settings it ran with, and what its Auto picked in the run, for the row to show: D309)
  return { ok: true, errors: [], frame: forceFrame(force), settings: { ...req.settings, ...autoPicked(plan.staged) } as AnyForceSettings, verb: req.verb, gesture };
}

/** Start a force on the map as it stands: a new series, at its seed. */
export function forceStart(req: ForceRequest): ForceStarted {
  const s = need();
  if (force) return refuse("A force is already at work: let it finish, or press Esc");
  return startForce(s, sessionForceMap(s), { ...req, settings: { ...req.settings, seed: req.settings.seed ?? 0 } } as ForceRequest);
}

/** Try another: the last kept force again, from its original land, with the next seed. `pins`
 *  (D309): for a force whose row drew its details from nature (`natural`), the row's current
 *  per-detail state, `null` for a detail still on Auto (so nature draws it again) or its pinned value
 *  (so it keeps it); left out, every detail resets to Auto (Unleash, and callers outside the row). A
 *  force started without `natural` (a plain caller, its settings already exact) keeps them exactly,
 *  as before D309: nature.ts never ran for it, so there is nothing to reset. Kept, it replaces that
 *  one (one undo step brings the earlier one back); every try takes a seed. */
export function forceAgain(pins?: Record<string, unknown>, gesture?: number): ForceStarted {
  const s = need();
  const sr = series;
  if (!sr || !againVerb(s)) return refuse(sr?.request.verb === "carve" || !sr ? "Carve somewhere first: Try another path runs the last carve again" : "Use a force first: Try another runs the last one again");
  sr.nextSeed = nextForceSeed(sr.request.verb, sr.nextSeed);
  return startForce(s, sr.base, againRequest(sr.request, sr.nextSeed, pins, gesture), lastSeq(s), sr.state);
}

/** A carve's cue (its head where the land shown has it, cutting). */
function carveCue(p: CarvePlay): ForceCue {
  const h = p.head;
  return { verb: "carve", phase: p.done ? "done" : "carve", progress: p.total ? p.shown / p.total : 0, x: h.x, y: h.y, z: h.z, size: h.width, power: p.run.settings.power };
}

function forceFrame(f: NonNullable<typeof force>): ForceFrame {
  const map = f.play ? f.play.map : f.staged!.map;
  const { W, H } = map;
  let head: ForceHead;
  let trail: TrailPoint[] = [];
  let cue: ForceCue;
  let out: ForceFrame;
  if (f.play) {
    const p = f.play;
    const h = p.head;
    head = { ...h, ...(h.lanes ? { lanes: h.lanes.map((l) => ({ ...l })) } : {}), ...(p.run.badwater ? { bad: true } : {}) };
    trail = p.trail().map((q) => ({ x: q.x, y: q.y, dx: q.dx, dy: q.dy, width: q.width, lanes: q.lanes.map((l) => ({ ...l })) }));
    cue = carveCue(p);
    out = { verb: f.verb, steps: p.shown, done: p.done, reason: p.done ? p.run.reason : "", planned: p.planned, total: p.planned ? p.total : 0, shown: p.shown, head, trail, cue };
  } else {
    const r = f.staged!;
    cue = r.cue();
    head = { x: cue.x, y: cue.y, z: cue.z, dx: 1, dy: 0, width: Math.min(24, cue.size), event: "surge", cut: 0 };
    out = { verb: f.verb, steps: r.steps, done: r.done, reason: r.reason, planned: r.planned, total: r.planned ? r.total : 0, shown: r.shown, head, trail, cue };
  }
  // the sources it has cleared by this frame (D474): gone from it, whether or not its objects are sent
  const cleared = (f.play ? f.play.cleared : f.staged!.cleared).filter((c) => c.step <= out.shown);
  if (cleared.length) out.cleared = cleared.map((c) => ({ ...c }));
  const rect = changedRect(W, H, f.shown, map.heights);
  if (rect) {
    f.shown = map.heights.slice();
    out.heights = map.heights.slice();
    out.rect = rect;
  }
  const now = performance.now();
  const view = out.done || now - f.viewAt >= FORCE_VIEW_MS;
  if (view) f.viewAt = now;
  if (view && map.entities !== f.lastEntities) {
    f.lastEntities = map.entities;
    const v = entityView(entityInputs(map.entities));
    if (!sameEntityView(v, f.shownEntities)) {
      out.entities = v;
      f.shownEntities = copyEntityView(v);
    }
  }
  if (!f.heatSent && f.staged?.heat && f.staged.planned) {
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
  if (f.play) {
    // (worked out a slice at a time first, then shown `steps` at a time)
    if (!f.play.planned) f.play.plan();
    else f.play.advance(steps);
  } else {
    const r = f.staged!;
    // (a planning slice a call until it is planned; then `steps` of its showing)
    if (!r.planned) r.step();
    else for (let k = 0; k < steps && !r.done; k++) r.step();
  }
  return forceFrame(f);
}

// ------------------------------------------------------------- a force's own water (D371)

/** The water flowing on a carve's land as it is shown (D371): the map's own water, the carve's source
 *  running from its first step, on the ground as each frame has it, so the river is born as it cuts,
 *  just behind the cutting edge. Its frames go to the page as a stroke's water does (D197); kept, this
 *  water is what the map's water flows on from, so nothing jumps; the settle that follows ends on the
 *  settled water, as after any edit. A dry canyon has none. */
let forceWater: { force: Parameters<typeof forceFrame>[0]; sim: WaterSim; model: WaterModel; ground: Uint8Array; front: CarveFront; seen: SeenWater; sent?: Float64Array; emitters: Map<string, number>; objects: readonly EntitySpec[] } | null = null;

/** The shown water catches up with the force's simulation after `ticks` more of them. */
function seeWater(w: NonNullable<typeof forceWater>, ticks: number): void {
  w.seen.see(w.sim.D, w.sim.C, ticks);
}
let forceWaterToken = 0;

function startForceWater(f: NonNullable<typeof force>): void {
  forceWater?.sim.dispose();
  forceWater = null;
  const token = ++forceWaterToken;
  const p = f.play;
  if (!p || p.run.settings.dry) return;
  const m = p.map;
  const model = modelOf(m);
  const depth = Float64Array.from(m.water.depth);
  const contamination = Float64Array.from(m.water.contamination);
  const flows = mapFlows(f.session, m.water.depth);
  const front = carveFront(p, model, depth, contamination);
  const sim = new WaterSim(model, { depth, contamination });
  // the map's water carries on as it flowed (its outflows), so only what the carve does changes it: from
  // a standstill, every river on the map would start again and ripple everywhere while the carve plays
  if (flows) {
    for (let i = 0; i < front.held.length; i++) if (front.held[i]) flows.fill(0, 4 * i, 4 * i + 4);
    sim.setOut(flows);
  }
  forceWater = { force: f, sim, model, ground: m.heights.slice(), front, seen: new SeenWater(sim.D, sim.C), emitters: emittersById(m.W, m.H, m.entities), objects: m.entities };
  if (autoWater) setTimeout(() => void runForceWater(token), 0);
}

/** The outflows of the map's water as it stands (the water in flight, or the last settle's), when that
 *  is the water `depth` holds; else null. */
function mapFlows(s: MapSession, depth: ArrayLike<number>): Float64Array | null {
  const now = (waterJob && waterJob.session === s ? waterJob.job.state() : null) ?? s.lastSettled();
  const w = now?.water;
  if (!w?.out || w.depth.length !== depth.length) return null;
  for (let i = 0; i < depth.length; i++) if (Math.abs(w.depth[i] - depth[i]) > 1e-6) return null;
  return Float64Array.from(w.out);
}

/** A carve's cutting front, for its water (D371: the river follows the cut, never leads it). Its source
 *  runs from the first step, and the land its course takes mostly runs downhill already, so its water
 *  would race down it ahead of the cut; instead each dry tile is held, a wall to the water, until the
 *  front reaches it: the step of the showing at which the tile's ground first changes as shown (shown
 *  from its end, A5: its last change, the first shown), and for a tile the carve never changes, its
 *  nearest changed tile's. A held tile's own film of water (a damp tile's) is set aside, shown as it
 *  was, and goes when the front arrives; deeper water ahead (a lake, a river) flows on as it does. */
interface CarveFront {
  /** The step of the showing at which the front reaches each tile. */
  reach: Int32Array;
  /** Tiles still held, the floor each has under its wall, and its own water set aside. */
  held: Uint8Array;
  base: Float64Array;
  film: Float64Array;
  filmBad: Float64Array;
  /** The step at which the front reaches the carve's origin (its source flows from then). */
  origin: number;
}

/** A floor no water climbs: a wall round the tiles the front hasn't reached. */
const FRONT_WALL = 1024;
/** Water up to this deep ahead of the front is a film on damp ground, held with its tile. */
const FRONT_FILM = 0.05;

/** The front for a carve's water, its held tiles taken out of `depth` and `contamination` (the water the
 *  simulation starts from) and walled off in `model`. */
function carveFront(p: CarvePlay, model: WaterModel, depth: Float64Array, contamination: Float64Array): CarveFront {
  const changes = p.run.records.changes;
  const total = changes.length - 1;
  const { W, H } = model;
  const N = W * H;
  const reach = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let tail = 0;
  // (a change that leaves a tile at its own level doesn't reach it: the ground there shows no cut yet)
  const before = p.map.heights;
  if (p.fromEnd) {
    // each tile shown once, at the level its last change left: the first of them shown
    const last = new Int32Array(N);
    const level = new Int32Array(N);
    for (let s = 1; s <= total; s++)
      for (let j = 0; j < changes[s].length; j += 2) {
        last[changes[s][j]] = s;
        level[changes[s][j]] = changes[s][j + 1];
      }
    for (let i = 0; i < N; i++) if (last[i] && level[i] !== before[i]) reach[i] = total - last[i] + 1;
  } else
    for (let s = 1; s <= total; s++)
      for (let j = 0; j < changes[s].length; j += 2) {
        const i = changes[s][j];
        if (reach[i] < 0 && changes[s][j + 1] !== before[i]) reach[i] = s;
      }
  for (let i = 0; i < N; i++) if (reach[i] >= 0) queue[tail++] = i;
  if (!tail) reach.fill(0);
  // (each other tile: its nearest changed tile's step, breadth first over the eight neighbours)
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (reach[j] >= 0) continue;
        reach[j] = reach[i];
        queue[tail++] = j;
      }
  }
  const held = new Uint8Array(N);
  const base = new Float64Array(N);
  const film = new Float64Array(N);
  const filmBad = new Float64Array(N);
  for (let i = 0; i < N; i++)
    if (reach[i] > 0 && !(depth[i] > FRONT_FILM)) {
      held[i] = 1;
      base[i] = model.floor[i];
      model.floor[i] = FRONT_WALL;
      film[i] = depth[i];
      filmBad[i] = contamination[i];
      depth[i] = 0;
      contamination[i] = 0;
    }
  return { reach, held, base, film, filmBad, origin: Math.max(1, reach[p.run.intent.origin]) };
}

/** The force's water as shown: the simulation's, with the held tiles' own films as they were; a tile
 *  let go keeps its film until its ground changes or the water there is deeper (the simulation started it
 *  dry: its film never blinks out as the front passes). */
function frontWater(w: NonNullable<typeof forceWater>): { depth: Float64Array; contamination: Float64Array } {
  const depth = w.seen.depth.slice();
  const contamination = w.seen.contamination.slice();
  const { held, film, filmBad } = w.front;
  for (let i = 0; i < held.length; i++)
    if (held[i] || film[i] > depth[i]) {
      depth[i] = film[i];
      contamination[i] = filmBad[i];
    }
  return { depth, contamination };
}

/** The walls the front has passed (all of them, `all`: the force kept or skipped to its end) let go. */
function frontPassed(w: NonNullable<typeof forceWater>, shown: number, all = false): void {
  const { reach, held, base } = w.front;
  for (let i = 0; i < held.length; i++)
    if (held[i] && (all || reach[i] <= shown)) {
      held[i] = 0;
      w.model.floor[i] = base[i];
    }
}

/** The force's water now, to flow on from (null: it has none). */
function forceWaterState(f: NonNullable<typeof force>): WarmState | null {
  const w = forceWater;
  if (!w || w.force !== f) return null;
  // (kept: the map's water flows on from it over all of the land, the films still held with it)
  const { depth, contamination } = frontWater(w);
  frontPassed(w, Infinity, true);
  const sim = w.sim;
  return { model: w.model, water: { settled: false, ticks: sim.ticks, depth, contamination, sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
}

function endForceWater(): void {
  forceWater?.sim.dispose();
  forceWater = null;
  forceWaterToken++;
}

/** Whether the force's water flows now (still being worked out, nothing is cut yet, and no water
 *  flows before the cut reaches its source); its floor brought to the ground shown, the tiles the
 *  front has reached let go (`carveFront`), and every source or seep gone from the land shown stopped
 *  (D474: taken by the carve or cleared, its water drains from that step, as the game's would; one that
 *  rides runs on, on its new ground). */
function forceWaterFlows(w: NonNullable<typeof forceWater>): boolean {
  const p = w.force.play!;
  if (p.shown === 0) return false;
  const h = p.map.heights;
  const { held, base } = w.front;
  for (let i = 0; i < h.length; i++)
    if (h[i] !== w.ground[i]) {
      if (held[i]) base[i] += h[i] - w.ground[i];
      else w.model.floor[i] += h[i] - w.ground[i];
      w.ground[i] = h[i];
      // (new ground: the film it had goes with it)
      w.front.film[i] = 0;
    }
  if (p.map.entities !== w.objects) {
    w.objects = p.map.entities;
    const here = new Set(p.map.entities.map((e) => e.id));
    for (const [id, k] of w.emitters)
      if (!here.has(id)) {
        w.model.emitters[k].strength = 0;
        w.emitters.delete(id);
      }
  }
  frontPassed(w, p.shown);
  return p.shown >= w.front.origin;
}

/** The force's water `ticks` on, on the ground shown now, and its depths (Node tests run it
 *  themselves, as they run `settleWater`); null when the force has none. */
export function flowForceWater(ticks: number): Float64Array | null {
  const w = forceWater;
  if (!w || force !== w.force) return null;
  if (forceWaterFlows(w) && ticks > 0) {
    w.sim.run(ticks);
    seeWater(w, ticks);
  }
  return frontWater(w).depth;
}

/** How fast a force's own water flows: substeps a second (two game minutes a second), whatever the map's
 *  size or the machine, so a carve's breakthrough drains its sheet at a pace the eye follows rather than at
 *  once (#247). A machine that can't keep up flows as fast as it can, never catching up in a burst. */
const FORCE_WATER_PACE = 400;

async function runForceWater(token: number): Promise<void> {
  let last = 0;
  let owed = 0;
  let at = performance.now();
  for (;;) {
    const w = forceWater;
    if (!w || token !== forceWaterToken || force !== w.force || w.force.session !== session) return;
    const now = performance.now();
    // (at most a tenth of a second's water owed: a stall is never made up at once)
    owed = Math.min(owed + ((now - at) / 1000) * FORCE_WATER_PACE, FORCE_WATER_PACE / 10);
    at = now;
    if (forceWaterFlows(w)) {
      let ran = 0;
      while (owed >= 2 && performance.now() - now < WATER_SLICE_MS) {
        w.sim.run(2);
        owed -= 2;
        ran += 2;
      }
      seeWater(w, ran);
      if (listener && performance.now() - last >= DRAFT_FRAME_MS) {
        last = performance.now();
        const D = w.sim.D;
        let moved = !w.sent;
        for (let i = 0; !moved && i < D.length; i++) if (Math.abs(D[i] - w.sent![i]) > 0.01) moved = true;
        if (moved) {
          w.sent = D.slice();
          listener({ kind: "water", version, water: waterOf(w.force.session, { ...frontWater(w), out: w.sim.out }, w.ground), done: 0, ticks: w.sim.ticks, draft: true });
        }
      }
    } else owed = 0;
    // (ahead of the pace: wait a few milliseconds rather than spin)
    await (owed < 2 ? new Promise<void>((r) => setTimeout(r, 4)) : breathe());
  }
}

/** A painted Lift: the fault as it is painted now (the page sends the latest stroke when the worker
 *  is free); the whole result shows at once. */
export function forcePaint(path: Point[], side: 1 | -1, power?: number): ForceFrame | null {
  const f = force;
  if (!f || f.session !== session || !(f.staged instanceof QuakeRun) || f.request.verb !== "quake") return null;
  try {
    f.staged.repaint({ path, side }, power);
    f.request = { ...f.request, path, side, ...(power !== undefined ? { settings: { ...f.request.settings, power } } : {}) } as typeof f.request;
  } catch {
    // (a stroke that reaches the start's ground: the last good one stays)
  }
  return forceFrame(f);
}

/** The page's view back to the map as it stands (a force dropped, or refused). */
function restoreView(s: MapSession): ViewUpdate {
  const b = s.built;
  const view: ViewUpdate = { heights: b.heights.slice(), terrainRect: null, water: waterOf(s), entities: entityView(entityInputs(b.entities)) };
  sentEntities = copyEntityView(view.entities!);
  markSent(s);
  return view;
}

/** Esc (or undo) for a force (D341): all of it goes at once, whenever it arrives, and the map's water
 *  carries on. `gesture` names the force (the page's); left out, the force at work. At work, it is
 *  dropped; already kept and still the latest step (its keep was on its way when Esc came), it is
 *  taken back as if it had never been kept; not started yet, it never will. */
export function forceCancel(gesture?: number): ForceTakenBack {
  const t0 = performance.now();
  const f = force;
  const s = session;
  if (f && (gesture === undefined || f.gesture === gesture)) {
    force = null;
    const flowing = forceWater?.force === f;
    endForceWater();
    if (!s || f.session !== s) return { taken: null };
    // (the force's water frames still on their way give way to the map's water)
    if (flowing) listener?.({ kind: "water", version, water: waterOf(s), done: 1, ticks: 0, draft: true });
    const view = restoreView(s);
    kickWater();
    return { ...view, taken: "work" };
  }
  if (gesture === undefined) return { taken: null };
  const k = lastKept;
  if (k && k.gesture === gesture && s && k.session === s) {
    lastKept = null;
    if (!s.takeBack(k.mark)) return { taken: null, reason: "Something changed the map since: undo takes it back" };
    // (Try another's series as it was before it)
    if (series && series === k.series) series.seqs.delete(k.seq);
    else series = k.series;
    // (the map's water flows on from the water before the force, not the force's)
    stopWater();
    const u = changed(s, true, [], t0);
    // (the whole view, not what changed since the keep: the page may never have shown the keep)
    return { ...u.view, ...restoreView(s), taken: "kept", info: u.info, waterSettled: u.waterSettled };
  }
  if (gesture > gestureLast) takenBack.add(gesture);
  return { taken: null };
}

/** Keep the force (Stop, or it ended by itself; a painted Lift let go): what it has done, as one
 *  operation and one undo step. The water it shows flows on into the map's settled water. */
export function forceStop(gesture?: number): SessionUpdate & { kept: boolean } {
  const t0 = performance.now();
  const s = need();
  const f = force;
  if (f && f.session !== s) force = null;
  // (a gesture taken back is never kept, D341: nothing lands after Esc)
  if (!f || f.session !== s || (gesture !== undefined && f.gesture !== gesture)) return { ...changed(s, false, ["There is no force at work"], t0), kept: false };
  force = null;
  // (the water it flowed as it worked: the map's water flows on from it, D371)
  const flowed = forceWaterState(f);
  endForceWater();
  const refused = (errors: string[]) => {
    // (the force's water frames still on their way give way to the map's water)
    if (flowed) listener?.({ kind: "water", version, water: waterOf(s), done: 1, ticks: 0, draft: true });
    const view = restoreView(s);
    kickWater();
    return { ok: false, errors, info: sessionInfo(s), view, ms: Math.round(performance.now() - t0), kept: false };
  };
  // a force kept part way keeps its whole result: its showing only shows it (a carve's playback, Slow
  // forces' jump to the end, D321; a staged force's stages, Esc aside)
  if (f.carve) f.play?.plan();
  else if (!f.staged!.done && !(f.staged instanceof QuakeRun && f.staged.painting)) f.staged!.finishAll();
  // (its operation assembled in the core, forces/keep.ts)
  const kept = keptForceParams({ before: f.before, request: f.request, carve: f.carve, staged: f.staged, ...(f.replaces !== undefined ? { replaces: f.replaces } : {}), standing: new Set(s.built.entities.map((e) => e.id)), ...(f.play ? { shownCleared: f.play.cleared } : {}) });
  if (!kept.ok) return refused([kept.error]);
  const params = kept.params;
  const water: WarmState = f.carve ? (flowed ?? f.carve.liveWater()) : f.staged!.liveWater();
  handoff = water;
  // (where the history stood: its Esc, arriving after this keep, takes it back exactly, D341)
  const mark = s.mark();
  // (Try another replaces the force's start carry too: the start goes back where it stood, D220)
  const back = f.replaces !== undefined ? startCarriedBack(s, f.replaces, f.before.entities) : [];
  const res = s.applyAll([{ op: "forceResult", params }, ...back], "user");
  if (!res.ok) {
    handoff = null;
    return refused(res.errors);
  }
  carryStart(s, params, back, { inside: f.request.area ? areaDepth(f.request.area, f.before.W, f.before.H) : null, cut: f.request.cut });
  const seq = lastSeq(s)!;
  const seriesBefore = series;
  if (f.replaces !== undefined && series?.seqs.has(f.replaces)) series.seqs.add(seq);
  else series = { session: s, seqs: new Set([seq]), base: f.before, state: f.state, request: f.request, nextSeed: f.request.settings.seed ?? 0 };
  const step = s.stepSince(mark);
  lastKept = step ? { gesture: f.gesture, session: s, mark: step, series: seriesBefore, seq } : null;
  const u = changed(s, true, [], t0);
  handoff = null;
  // the page shows the force's water: the map's water flows on from it, not from the water before
  if (u.view.water && !s.showsStoredWater) u.view.water = waterFromDepth(s.built.heights, water.water.depth, water.water.contamination);
  return { ...u, kept: true };
}

/** A force that broke the start's own ground (carved it, buried it, moved it: off level ground, on
 *  an object) carries the start to the nearest level ground where it stands well, in the same undo
 *  step (D257: a force is bound only by nature; the editor keeps the map playable). With no such
 *  ground within reach it stays, and the checks say what is wrong. */
function carryStart(s: MapSession, params: ForceResultParams, back: EditOp[], limits: { inside: Uint8Array | null; cut: number | null }): boolean {
  const carry = startCarry(s, params, limits);
  if (!carry) return false;
  const label = s.history().filter((h) => h.applied).at(-1)?.label;
  s.undo();
  const r = s.applyAll([{ op: "forceResult", params: carry.params }, ...back, ...carry.ops], "user", label);
  if (r.ok) return true;
  s.applyAll([{ op: "forceResult", params }, ...back], "user", label);
  return false;
}

/** A force is at work. */
export function forcing(): boolean {
  return !!force && force.session === session;
}

export const carving = forcing;

// ------------------------------------------------- Naturalize, weathered here (PLAN §20 D422)

/** A Naturalize stroke weathered in the worker (D422): the page sends its dabs as they come and shows
 *  the land that comes back (core/features/raster/remoteStroke.ts); the worker runs the preview the
 *  page would, on the same land, so what is shown is what the operation builds. */
let weathering: { session: MapSession; preview: StrokePreview; shown: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null = null;

/** A stroke begins, with the page's settings and the ground under sources and objects it leaves. */
export function weatherBegin(settings: Omit<BrushParams, "dabs">, ground: Runs): void {
  const s = need();
  const shown = s.built.heights.slice();
  const own = { ...settings };
  weathering = { session: s, preview: new StrokePreview(own, s.terrainState(), shown, s.size.x, s.size.y, ground), shown, settings: own };
}

/** What a stroke's dabs (or its riding pieces) changed: the shown heights in the rectangle, and its
 *  settings as recorded so far; the water answers it at once (D197). */
function weathered(r: Rect | null): WeatheredLand | null {
  const w = weathering;
  if (!r || !w) return null;
  const W = w.session.size.x;
  const bw = r.x1 - r.x0 + 1;
  const heights = new Uint8Array(bw * (r.y1 - r.y0 + 1));
  for (let y = r.y0; y <= r.y1; y++) heights.set(w.shown.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * bw);
  draftStroke(r, heights);
  return { rect: r, heights, settings: { ...w.settings } };
}

export function weatherAdd(dabs: number[], pressure?: number[]): WeatheredLand | null {
  const w = weathering;
  if (!w || w.session !== session) return null;
  return weathered(w.preview.add(dabs, pressure));
}

export function weatherFinish(rigid: [number, number, number, number][]): WeatheredLand | null {
  const w = weathering;
  if (!w || w.session !== session) return null;
  return weathered(w.preview.finish(rigid));
}

/** The stroke's dabs are all in: its heights before the integrity pass and its protected tiles. */
export function weatherEnd(): { pre: Uint8Array; protect: Uint8Array } | null {
  const w = weathering;
  weathering = null;
  if (!w || w.session !== session) return null;
  return { pre: w.preview.pre.slice(), protect: w.preview.protect.slice() };
}

export function weatherCancel(): void {
  weathering = null;
}
