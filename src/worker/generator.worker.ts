// The generator and the editor's document run here, off the main thread, so the page stays
// responsive on 256² maps (PLAN §2.2, EDITOR_PLAN §8). The same core runs in Node for tests and
// batch runs.

import { expose, proxy, releaseProxy, transfer, wrap } from "comlink";
import type { ChecksApi } from "./checks.worker";
import type { EditOp, OpOrigin } from "../core/doc/ops";
import type { PaintParams } from "../core/doc/paintParams";
import type { BlocksParams } from "../core/doc/blockTool";
import type { BrushParams } from "../core/features/raster/brush";
import { decodePlaceFile, placeTimber } from "../core/places/place";
import { replaceThumbnail } from "../core/format/timber";
import type { MapSpec } from "../core/spec/mapspec";
import type { Orientation } from "../core/format/footprints";
import type { SavedView } from "../core/doc/document";
import { viewBuffers, type MapView, type SoilView, type WaterView } from "../render3d/model";
import type { SoilBase, SoilJob } from "./daySoil";
import { emptyWaterFile, runFindVersion, runGenerate, type GenerateResponse, type GenProgress } from "./api";
import * as ed from "./session";
import { collabActive, collabApi } from "./collab";
import { collabEditApi } from "./collabEdit";
import { installParallelWater, parallelWaterStats, parallelWaterThreads, portHelper } from "../core/sim/parallel";

function responseBuffers(r: GenerateResponse): Transferable[] {
  return [r.heights, r.water, r.contamination, r.moisture, r.soilContamination, r.reach, r.timber, r.project].map((a) => a.buffer) as Transferable[];
}

function sendUpdate<T extends ed.SessionUpdate>(u: T): T {
  return transfer(u, viewBuffers(u.view) as Transferable[]);
}

function sendOpen(o: ed.SessionOpen): ed.SessionOpen {
  return transfer(o, viewBuffers({ ...o.view, terrain: o.terrain }) as Transferable[]);
}

function frameBuffers(f: ed.ForceFrame): Transferable[] {
  const out = viewBuffers({ heights: f.heights, entities: f.entities }) as Transferable[];
  if (f.heat) out.push(f.heat.buffer as Transferable);
  if (f.heightPatch) out.push(f.heightPatch.buffer as Transferable);
  return out;
}

function sendFrame(f: ed.ForceFrame | null): ed.ForceFrame | null {
  return f ? transfer(f, frameBuffers(f)) : null;
}

function sendStarted(r: ed.ForceStarted): ed.ForceStarted {
  return r.frame ? transfer(r, frameBuffers(r.frame)) : r;
}

function eventBuffers(e: ed.EditorEvent): Transferable[] {
  if (e.kind === "instant" || e.kind === "withered") return [];
  if (e.kind === "weather") return [...(e.water ? (viewBuffers({ water: e.water }) as Transferable[]) : []), ...[e.firstDry, e.firstDryWet0, e.firstBad].flatMap((a) => (a ? [a.buffer as ArrayBuffer] : []))];
  return viewBuffers(e.kind === "water" ? { water: e.water } : e.view) as Transferable[];
}

// the page's worker settles the water by itself after each edit, and tells the page as it flows
ed.setAutoWater(true);

// A hazard day's soil (the Weather view's soil and withered plants, D250) is one whole-map pass of the game's soil, 150 to 350 ms
// on a 256² map: it is worked out in a worker of its own, started when first needed, so a stroke, a force or a water message
// never waits behind it (daySoil.ts). The run's map goes over once, then each day's water. A failing worker is made again and the job tried once more;
// failing twice, the session sends the day without its soil, never working it out itself.
if (typeof Worker !== "undefined") {
  let soilWorker: Worker | null = null;
  let jobs = 0;
  let sent: { id: number; base: SoilBase } | null = null;
  const waiting = new Map<number, { resolve: (s: SoilView) => void; reject: (e: unknown) => void }>();
  const failed = (e: unknown) => {
    for (const w of waiting.values()) w.reject(e);
    waiting.clear();
    soilWorker?.terminate();
    soilWorker = null;
    sent = null;
  };
  const attempt = (job: SoilJob) =>
    new Promise<SoilView>((resolve, reject) => {
        if (!soilWorker) {
          soilWorker = new Worker(new URL("./daySoil.worker.ts", import.meta.url), { type: "module" });
          soilWorker.onmessage = (m: MessageEvent<{ id: number; soil?: SoilView; error?: string }>) => {
            const w = waiting.get(m.data.id);
            waiting.delete(m.data.id);
            if (m.data.soil) w?.resolve(m.data.soil);
            else w?.reject(new Error(m.data.error ?? "soil failed"));
          };
          soilWorker.onerror = failed;
        }
        const id = ++jobs;
        waiting.set(id, { resolve, reject });
        const first = sent?.base !== job.base;
        if (first) sent = { id: (sent?.id ?? 0) + 1, base: job.base };
        soilWorker.postMessage({ id, baseId: sent!.id, ...(first ? { base: job.base } : {}), depth: job.depth, contamination: job.contamination });
      });
  // (a failed worker is made again and the job tried once more; failing twice, the session sends the day without soil)
  ed.setSoilRunner((job) => attempt(job).catch(() => attempt(job)));
}

// The checks worker joins once the map is editable (D367): a page that calls `deferChecks` before opening a map
// keeps its replica (and the checks code it loads) out of the way until `editorReady`; a page that never calls it
// has the checks worker from the start. Without one the checks run here, so export's full check never waits on it.
let checksPort: MessagePort | null = null;
let editable = true;
let connected = false;
let client: ed.ChecksWorker | null = null;
function connectChecksWhenEditable() {
  if (!editable || !checksPort || connected) return;
  const port = checksPort;
  if (!client) {
    const c = wrap<ChecksApi>(port);
    client = {
      follow: (p) => c.follow(p),
      check: (v, onProgress) => c.check(v, onProgress ? proxy(onProgress) : undefined),
    };
  }
  connected = true;
  ed.useChecksWorker(client);
}
let droughtFn: ((n: ed.DroughtLineNews) => void) | null = null;

/** While a shared session is on (collabActive), an edit is ordered through it instead of applied here (worker/collabEdit.ts);
 *  its answer carries no news of the map, which comes as the session's own update. */
function routed<A extends unknown[], D, S>(direct: (...a: A) => D, shared: (...a: A) => S): (...a: A) => D | S {
  return (...a) => (collabActive() ? shared(...a) : direct(...a));
}
const api = {
  /** `onProgress` (a Comlink proxy) hears each attempt's stage and its first look as they happen. */
  async generate(spec: MapSpec, onProgress?: (p: GenProgress) => void, seedWord?: string): Promise<GenerateResponse> {
    const r = await runGenerate(spec, onProgress ? (p) => void onProgress(p) : undefined, seedWord);
    return transfer(r, responseBuffers(r));
  },
  /** D329's background search (a worker of its own): a sibling of the map that meets all three
   *  outcomes, or null. */
  async findVersion(from: { spec: MapSpec; intentions: string[]; heights: Uint8Array }): Promise<GenerateResponse | null> {
    const r = await runFindVersion(from);
    return r ? transfer(r, responseBuffers(r)) : null;
  },
  /** The last generated map without pre-filled water, or null. */
  emptyWater(): { bytes: Uint8Array; name: string } | null {
    const f = emptyWaterFile();
    return f ? transfer(f, [f.bytes.buffer as Transferable]) : null;
  },

  // --- the editor's document
  refine: () => sendOpen(ed.refine()),
  openTimber: (bytes: Uint8Array, fileName: string) => sendOpen(ed.openTimber(bytes, fileName)),
  openProject: (bytes: Uint8Array) => sendOpen(ed.openProject(bytes)),
  /** A real place (its data file): built into its .timber, then opened as any .timber is. */
  openPlace(data: Uint8Array) {
    const place = decodePlaceFile(data);
    const r = placeTimber(place);
    // (opened under the place's own name; the file it is saved as is named after it, D345 B10)
    // (marked as the place, so its checks follow the place's rules: D245, D331)
    return sendOpen(ed.openTimber(r.bytes, `${place.name}.timber`, place.id));
  },
  sessionView: () => sendOpen(ed.sessionView()),
  /** The Block tool's preview: what a click or a drag would add, take and drop (no build). */
  blockFalls: (params: BlocksParams) => ed.blockFalls(params),
  terrainNow() {
    const t = ed.terrainNow();
    return transfer(t, viewBuffers({ heights: t.heights, terrain: t.terrain }) as Transferable[]);
  },
  /** Where the worker sends the live water and the settled water after each edit. */
  listen(fn: ((e: ed.EditorEvent) => void) | null) {
    ed.listen(fn ? (e) => void fn(transfer(e, eventBuffers(e))) : null);
  },
  /** Hold the background water while the player paints (the option for very large maps). */
  /** A stroke being painted: its ground so far (the rect's heights, row by row); its water flows at
   *  once (D197). */
  draftStroke: (rect: { x0: number; y0: number; x1: number; y1: number }, heights: Uint8Array) => ed.draftStroke(rect, heights),
  /** The stroke was taken back: its water goes. */
  cancelDraft: () => ed.cancelDraft(),
  /** A Naturalize stroke weathered here (D422): it begins, its dabs come and their land goes back (the
   *  changed rectangle's heights, transferred), its riding pieces, its end (the heights before the
   *  integrity pass and the protected tiles), or Esc. */
  weatherBegin: (settings: Omit<BrushParams, "dabs">, ground: [number, number, number][]) => ed.weatherBegin(settings, ground),
  weatherAdd(dabs: number[], pressure?: number[]) {
    const r = ed.weatherAdd(dabs, pressure);
    return r ? transfer(r, [r.heights.buffer as ArrayBuffer]) : null;
  },
  weatherFinish(rigid: [number, number, number, number][]) {
    const r = ed.weatherFinish(rigid);
    return r ? transfer(r, [r.heights.buffer as ArrayBuffer]) : null;
  },
  weatherEnd() {
    const r = ed.weatherEnd();
    return r ? transfer(r, [r.pre.buffer as ArrayBuffer, r.protect.buffer as ArrayBuffer]) : null;
  },
  weatherCancel: () => ed.weatherCancel(),
  /** Resolves when the water has settled after the latest edit (tests and benchmarks). */
  whenWaterSettles: () => ed.whenWaterSettles(),
  /** The checks worker (a port to it): the checks run there, on a replica of the open map. */
  connectChecks(port: MessagePort) {
    checksPort?.close();
    checksPort = port;
    client = null;
    connected = false;
    connectChecksWhenEditable();
  },
  /** Hold the checks worker back until `editorReady` (called before a map opens or generates). */
  deferChecks() {
    editable = false;
    connected = false;
    ed.useChecksWorker(null);
  },
  /** The map is drawn and the page's editing handlers are attached: the checks worker follows it from here. */
  editorReady() {
    editable = true;
    connectChecksWhenEditable();
  },
  /** The water's helper threads (src/core/sim/parallel.ts), started by the page (platform/index.ts) so they start
   *  while this worker is busy: its water runs on several threads where that helps. More are started from here
   *  for bigger maps. The page sends them before anything else; the background search's worker gets none. */
  waterHelpers(ports: MessagePort[]) {
    installParallelWater({
      helpers: ports.map(portHelper),
      spawn: () => new Worker(new URL("./waterStrip.worker.ts", import.meta.url), { type: "module" }),
    });
  },
  /** Collaborative editing's side in the worker (worker/collab.ts). */
  collab: proxy(collabApi),
  sessionInfo: () => (ed.hasSession() ? ed.sessionInfo() : null),
  closeSession: () => ed.closeSession(),
  apply: routed((op: EditOp, origin?: OpOrigin, label?: string) => sendUpdate(ed.apply(op, origin, label)), (...a) => collabEditApi.apply(...a).then(sendUpdate)),
  /** A slider's step: steps a moment apart with the same key are one undo step. */
  applyStep: routed((op: EditOp, label: string, key: string) => sendUpdate(ed.applyStep(op, label, key)), (...a) => collabEditApi.applyStep(...a).then(sendUpdate)),
  applyAll: routed((ops: EditOp[], label: string, origin?: OpOrigin) => sendUpdate(ed.applyAll(ops, label, origin)), (...a) => collabEditApi.applyAll(...a).then(sendUpdate)),
  undo: routed(() => sendUpdate(ed.undo()), () => collabEditApi.undo().then(sendUpdate)),
  redo: routed(() => sendUpdate(ed.redo()), () => collabEditApi.redo().then(sendUpdate)),
  jump: routed((index: number) => sendUpdate(ed.jump(index)), (...a) => sendUpdate(collabEditApi.jump(...a))),
  /** A version of the open map at History step `k`, for Your maps (Keep this version, Branch from here). */
  keepVersion(k: number, parentId?: string) {
    const v = ed.keepVersion(k, parentId);
    return v ? transfer(v, [v.bytes.buffer as ArrayBuffer, ...(v.picture ? [v.picture.heights.buffer as ArrayBuffer, v.picture.water.buffer as ArrayBuffer] : [])]) : null;
  },
  /** A version's project opened by replaying it (a worker of the page's own), settled: `project` then has its stored map. */
  openVersion: (bytes: Uint8Array) => ed.openVersion(bytes),
  // the shelf: an object or a source placed, as one step
  applyTool: routed((req: ed.ToolRequest, id: string) => sendUpdate(ed.applyTool(req, id)), (...a) => collabEditApi.applyTool(...a).then(sendUpdate)),
  /** A drought or a badtide to watch, then the water coming back (weather events); stop it at any time. */
  showWeatherDay: (hazard: "drought" | "badtide", day: number | null) => ed.showWeatherDay(hazard, day),
  prepareWeather: () => ed.prepareWeather(),
  /** Where the worker sends the drought line (D133), or nowhere (null); the line of the map as it is, when there is
   *  one. (Small, and the worker keeps its own: copied, not taken over.) */
  watchDroughtLine(fn: ((n: ed.DroughtLineNews) => void) | null) {
    // (the page's last callback is let go, or its port stays open for good; each crossing makes a new proxy, so the
    // check is only against releasing the one kept)
    if (fn !== droughtFn) (droughtFn as { [releaseProxy]?: () => void } | null)?.[releaseProxy]?.();
    droughtFn = fn;
    return ed.watchDroughtLine(fn ? (n) => void fn(n) : null);
  },
  stopWeatherPrep: () => ed.stopWeatherPrep(),
  stopWeather: () => ed.stopWeather(),
  moveStartTo: routed((x: number, y: number, orientation?: Orientation, z?: number) => sendUpdate(ed.moveStartTo(x, y, orientation, z)), (...a) => collabEditApi.moveStartTo(...a).then(sendUpdate)),
  entitiesAt: (x: number, y: number) => ed.entitiesAt(x, y),
  footprintCheck: (req: ed.ToolRequest) => ed.footprintCheck(req),
  plantAt: routed((template: string, tiles: number[]) => sendUpdate(ed.plantAt(template, tiles)), (...a) => collabEditApi.plantAt(...a).then(sendUpdate)),
  paintAt: routed((params: PaintParams, z?: number) => sendUpdate(ed.paintAt(params, z)), (...a) => collabEditApi.paintAt(...a).then(sendUpdate)),
  paintDryAt: (params: PaintParams, z?: number) => ed.paintDryAt(params, z),
  setViews: (views: SavedView[]) => ed.setViews(views),
  setName: (name: string) => ed.setName(name),
  removeAt: routed((tiles: number[], kinds: ed.RemoveKind[]) => sendUpdate(ed.removeAt(tiles, kinds)), (...a) => collabEditApi.removeAt(...a).then(sendUpdate)),
  objectsInArea: (tiles: number[]) => ed.objectsInArea(tiles),
  selectionHeld: () => ed.selectionHeldTiles(),
  /** Remove unfed water and Fill (D387, D394): what they would do, then doing it, one undo step. */
  unfedWaterIn: (tiles: number[] | null) => ed.unfedWaterIn(tiles),
  removeUnfedWater: routed((tiles: number[] | null) => sendUpdate(ed.removeUnfedWater(tiles)), (...a) => collabEditApi.removeUnfedWater(...a).then(sendUpdate)),
  fillPlanAt: (x: number, y: number, level: number) => ed.fillPlanAt(x, y, level),
  /** Crop map to selection (D340): what it would do (or why not), then doing it, one undo step. A crop changes the map's size, which
   *  a shared session cannot carry: refused with a plain line while one is on. */
  cropPlanAt: (r: { x: number; y: number; w: number; h: number }) => ed.cropPlanAt(r),
  cropTo: routed((r: { x: number; y: number; w: number; h: number }) => sendUpdate(ed.cropTo(r)), () => sendUpdate(collabEditApi.cropTo())),
  fillAt: routed((x: number, y: number, level: number) => sendUpdate(ed.fillAt(x, y, level)), (...a) => collabEditApi.fillAt(...a).then(sendUpdate)),
  moveObjectBy: routed((id: string, dx: number, dy: number, z?: number) => sendUpdate(ed.moveObjectBy(id, dx, dy, z)), (...a) => collabEditApi.moveObjectBy(...a).then(sendUpdate)),
  clearEverything: routed(() => sendUpdate(ed.clearEverything()), () => collabEditApi.clearEverything().then(sendUpdate)),
  /** A Select action (D259, D264): exact, one step, the start carried if its ground broke. */
  applySelection: routed((ops: EditOp[], label: string, tiles: number[]) => sendUpdate(ed.applySelection(ops, label, tiles)), (...a) => collabEditApi.applySelection(...a).then(sendUpdate)),
  /** A brush stroke that clears the sources it passed over (D249): one undo step. */
  strokeClearing: routed((op: EditOp, label: string, tiles: number[]) => sendUpdate(ed.strokeClearing(op, label, tiles)), (...a) => collabEditApi.strokeClearing(...a).then(sendUpdate)),
  // the forces (D194, D202, D203, D206): one at work, a frame at a time; Stop (or its end) keeps it,
  // Esc drops it
  /** The water the page shows as it starts a force: the force's water starts from it. */
  forceShows: routed((water: WaterView | null) => ed.forceShows(water), (...a) => collabEditApi.forceShows(...a)),
  forceStart: routed((req: ed.ForceRequest) => sendStarted(ed.forceStart(req)), (...a) => collabEditApi.forceStart(...a)),
  /** Try another: the last kept force again, with the next seed. `pins`: the row's current
   *  per-detail state (D309); left out, every detail re-rolls. */
  forceAgain: routed((pins?: Record<string, unknown>, gesture?: number) => sendStarted(ed.forceAgain(pins, gesture)), (...a) => collabEditApi.forceAgain(...a)),
  // (the browser takes the changed rows only, written into its own copy, #312)
  forceAdvance: routed((steps: number) => sendFrame(ed.forceAdvance(steps, true)), (...a) => collabEditApi.forceAdvance(...a)),
  /** A painted Lift's fault as it is painted now. */
  forcePaint: routed((path: ed.ForcePoint[], side: 1 | -1, power?: number) => sendFrame(ed.forcePaint(path, side, power, true)), (...a) => collabEditApi.forcePaint(...a)),
  /** Keep the force at work (`gesture`: only if it is that one, D341). */
  forceStop: routed((gesture?: number) => sendUpdate(ed.forceStop(gesture)), (...a) => collabEditApi.forceStop(...a).then(sendUpdate)),
  /** Another of the force's rolls (D488): the next or the one before (`step`), or roll `index`. */
  forceRoll: routed((to: { step: 1 | -1 } | { index: number }) => sendUpdate(ed.forceRoll(to)), (...a) => collabEditApi.forceRoll(...a).then(sendUpdate)),
  /** The player moved on from the rolls (another tool, Esc, a save): only the roll shown stays. */
  forceSettle: routed(() => ed.forceSettle(), () => collabEditApi.forceSettle()),
  /** Esc or undo for a force (D341): at work, dropped; kept and still the latest step, taken back. */
  forceCancel(gesture?: number) {
    const v = collabActive() ? collabEditApi.forceCancel(gesture) : ed.forceCancel(gesture);
    return transfer(v, viewBuffers(v) as Transferable[]);
  },
  async settingsResponse(): Promise<GenerateResponse> {
    const r = await ed.settingsResponse();
    return transfer(r, responseBuffers(r));
  },
  waterLayers() {
    const r = ed.waterLayers();
    return transfer(r, [r.badwater.buffer, r.roofed.buffer] as Transferable[]);
  },
  async backgroundCheck(onProgress?: (p: ed.CheckProgress) => void) {
    return ed.backgroundCheck(onProgress);
  },
  async exportTimber(confirmWarnings: boolean, onProgress?: (p: ed.CheckProgress) => void, opts?: { picture?: boolean }, onPicture?: (view: MapView) => void) {
    // (the page's answer is not waited for: it draws while the checks run)
    const early = onPicture && ((v: MapView) => void Promise.resolve(onPicture(transfer(v, viewBuffers(v) as Transferable[]))).catch(() => undefined));
    const r = await ed.exportTimber(confirmWarnings, onProgress, opts, early);
    return transfer(r, [r.bytes.buffer as Transferable, ...((r.picture ? viewBuffers(r.picture) : []) as Transferable[])]);
  },
  /** A .timber file with another map_thumbnail.jpg (the page's 3D picture, D488), or the reason it can't take it. */
  replaceThumbnail(timber: Uint8Array, jpeg: Uint8Array) {
    const r = replaceThumbnail(timber, jpeg);
    return r.ok ? transfer(r, [r.bytes.buffer as Transferable]) : r;
  },
  project(level?: number) {
    const r = ed.project(level);
    return transfer(r, [r.bytes.buffer as Transferable]);
  },
};

export type GeneratorApi = typeof api;
// a test hook (tests/e2e/isolation.spec.ts): the water's threads ready, and the ticks they ran
Object.assign(self, { dgmWater: () => ({ threads: parallelWaterThreads(), ticks: parallelWaterStats.ticks }) });
expose(api);
