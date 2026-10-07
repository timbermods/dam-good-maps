// The generator and the editor's document run here, off the main thread, so the page stays
// responsive on 256² maps (PLAN §2.2, EDITOR_PLAN §8). The same core runs in Node for tests and
// batch runs.

import { expose, proxy, transfer, wrap } from "comlink";
import type { ChecksApi } from "./checks.worker";
import type { EditOp, OpOrigin } from "../core/doc/ops";
import type { BrushParams } from "../core/features/raster/brush";
import { decodePlaceFile, placeTimber } from "../core/places/place";
import type { MapSpec } from "../core/spec/mapspec";
import type { Orientation } from "../core/format/footprints";
import type { SavedView } from "../core/doc/document";
import { viewBuffers } from "../render3d/model";
import { emptyWaterFile, runFindVersion, runGenerate, type GenerateResponse, type GenProgress } from "./api";
import * as ed from "./session";
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
  return out;
}

function sendFrame(f: ed.ForceFrame | null): ed.ForceFrame | null {
  return f ? transfer(f, frameBuffers(f)) : null;
}

function sendStarted(r: ed.ForceStarted): ed.ForceStarted {
  return r.frame ? transfer(r, frameBuffers(r.frame)) : r;
}

function eventBuffers(e: ed.EditorEvent): Transferable[] {
  if (e.kind === "instant") return [];
  if (e.kind === "weather") return e.water ? (viewBuffers({ water: e.water }) as Transferable[]) : [];
  return viewBuffers(e.kind === "water" ? { water: e.water } : e.view) as Transferable[];
}

// the page's worker settles the water by itself after each edit, and tells the page as it flows
ed.setAutoWater(true);

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
    return sendOpen(ed.openTimber(r.bytes, `${place.name}.timber`));
  },
  sessionView: () => sendOpen(ed.sessionView()),
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
  sessionInfo: () => (ed.hasSession() ? ed.sessionInfo() : null),
  closeSession: () => ed.closeSession(),
  apply: (op: EditOp, origin?: OpOrigin, label?: string) => sendUpdate(ed.apply(op, origin, label)),
  /** A slider's step: steps a moment apart with the same key are one undo step. */
  applyStep: (op: EditOp, label: string, key: string) => sendUpdate(ed.applyStep(op, label, key)),
  applyAll: (ops: EditOp[], label: string, origin?: OpOrigin) => sendUpdate(ed.applyAll(ops, label, origin)),
  undo: () => sendUpdate(ed.undo()),
  redo: () => sendUpdate(ed.redo()),
  jump: (index: number) => sendUpdate(ed.jump(index)),
  // the shelf: an object or a source placed, as one step
  applyTool: (req: ed.ToolRequest, id: string) => sendUpdate(ed.applyTool(req, id)),
  /** A drought or a badtide to watch, then the water coming back (weather events); stop it at any time. */
  showWeatherDay: (hazard: "drought" | "badtide", day: number | null) => ed.showWeatherDay(hazard, day),
  prepareWeather: () => ed.prepareWeather(),
  stopWeatherPrep: () => ed.stopWeatherPrep(),
  stopWeather: () => ed.stopWeather(),
  moveStartTo: (x: number, y: number, orientation?: Orientation) => sendUpdate(ed.moveStartTo(x, y, orientation)),
  entitiesAt: (x: number, y: number) => ed.entitiesAt(x, y),
  footprintCheck: (req: ed.ToolRequest) => ed.footprintCheck(req),
  plantAt: (template: string, tiles: number[]) => sendUpdate(ed.plantAt(template, tiles)),
  setViews: (views: SavedView[]) => ed.setViews(views),
  setName: (name: string) => ed.setName(name),
  removeAt: (tiles: number[], kinds: ed.RemoveKind[]) => sendUpdate(ed.removeAt(tiles, kinds)),
  objectsInArea: (tiles: number[]) => ed.objectsInArea(tiles),
  moveObjectBy: (id: string, dx: number, dy: number) => sendUpdate(ed.moveObjectBy(id, dx, dy)),
  clearEverything: () => sendUpdate(ed.clearEverything()),
  /** A Select action (D259, D264): exact, one step, the start carried if its ground broke. */
  applySelection: (ops: EditOp[], label: string, tiles: number[]) => sendUpdate(ed.applySelection(ops, label, tiles)),
  /** A brush stroke that clears the sources it passed over (D249): one undo step. */
  strokeClearing: (op: EditOp, label: string, tiles: number[]) => sendUpdate(ed.strokeClearing(op, label, tiles)),
  // the forces (D194, D202, D203, D206): one at work, a frame at a time; Stop (or its end) keeps it,
  // Esc drops it
  forceStart: (req: ed.ForceRequest) => sendStarted(ed.forceStart(req)),
  /** Try another: the last kept force again, with the next seed. `pins`: the row's current
   *  per-detail state (D309); left out, every detail re-rolls. */
  forceAgain: (pins?: Record<string, unknown>, gesture?: number) => sendStarted(ed.forceAgain(pins, gesture)),
  forceAdvance: (steps: number) => sendFrame(ed.forceAdvance(steps)),
  /** A painted Lift's fault as it is painted now. */
  forcePaint: (path: ed.ForcePoint[], side: 1 | -1, power?: number) => sendFrame(ed.forcePaint(path, side, power)),
  /** Keep the force at work (`gesture`: only if it is that one, D341). */
  forceStop: (gesture?: number) => sendUpdate(ed.forceStop(gesture)),
  /** Esc or undo for a force (D341): at work, dropped; kept and still the latest step, taken back. */
  forceCancel(gesture?: number) {
    const v = ed.forceCancel(gesture);
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
  async exportTimber(confirmWarnings: boolean, onProgress?: (p: ed.CheckProgress) => void) {
    const r = await ed.exportTimber(confirmWarnings, onProgress);
    return transfer(r, [r.bytes.buffer as Transferable]);
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
