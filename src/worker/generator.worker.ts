// The generator and the editor's document run here, off the main thread, so the page stays
// responsive on 256² maps (PLAN §2.2, EDITOR_PLAN §8). The same core runs in Node for tests and
// batch runs.

import { expose, proxy, transfer, wrap } from "comlink";
import type { ChecksApi } from "./checks.worker";
import type { EditOp, OpOrigin } from "../core/doc/ops";
import { decodePlaceFile, placeTimber } from "../core/places/place";
import type { MapSpec } from "../core/spec/mapspec";
import type { Orientation } from "../core/format/footprints";
import type { SavedView } from "../core/doc/document";
import { viewBuffers } from "../render3d/model";
import { emptyWaterFile, runGenerate, type GenerateResponse } from "./api";
import * as ed from "./session";

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
  return viewBuffers({ heights: f.heights, water: f.water, entities: f.entities }) as Transferable[];
}

function sendStarted(r: ed.ForceStarted): ed.ForceStarted {
  return r.frame ? transfer(r, frameBuffers(r.frame)) : r;
}

function eventBuffers(e: ed.EditorEvent): Transferable[] {
  if (e.kind === "instant") return [];
  return viewBuffers(e.kind === "water" || e.kind === "weather" ? { water: e.water } : e.view) as Transferable[];
}

// the page's worker settles the water by itself after each edit, and tells the page as it flows
ed.setAutoWater(true);

const api = {
  async generate(spec: MapSpec): Promise<GenerateResponse> {
    const r = await runGenerate(spec);
    return transfer(r, responseBuffers(r));
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
    const r = placeTimber(decodePlaceFile(data));
    return sendOpen(ed.openTimber(r.bytes, r.fileName));
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
  /** Resolves when the water has settled after the latest edit (tests and benchmarks). */
  whenWaterSettles: () => ed.whenWaterSettles(),
  /** The checks worker (a port to it): the checks run there, on a replica of the open map. */
  connectChecks(port: MessagePort) {
    const c = wrap<ChecksApi>(port);
    ed.useChecksWorker({
      follow: (p) => c.follow(p),
      check: (v, onProgress) => c.check(v, onProgress ? proxy(onProgress) : undefined),
    });
  },
  sessionInfo: () => (ed.hasSession() ? ed.sessionInfo() : null),
  closeSession: () => ed.closeSession(),
  check: (op: EditOp) => ed.check(op),
  apply: (op: EditOp, origin?: OpOrigin, label?: string) => sendUpdate(ed.apply(op, origin, label)),
  /** A slider's step: steps a moment apart with the same key are one undo step. */
  applyStep: (op: EditOp, label: string, key: string) => sendUpdate(ed.applyStep(op, label, key)),
  applyAll: (ops: EditOp[], label: string, origin?: OpOrigin) => sendUpdate(ed.applyAll(ops, label, origin)),
  undo: () => sendUpdate(ed.undo()),
  redo: () => sendUpdate(ed.redo()),
  jump: (index: number) => sendUpdate(ed.jump(index)),
  // the tools: plan (a preview), then apply; move and delete with planning again
  planTool: (req: ed.ToolRequest, id: string) => ed.planTool(req, id),
  applyTool: (req: ed.ToolRequest, id: string) => sendUpdate(ed.applyTool(req, id)),
  /** A drought or a badtide to watch, then the water coming back (weather events); stop it at any time. */
  startWeather: (hazard: "drought" | "badtide") => ed.startWeather(hazard),
  stopWeather: () => ed.stopWeather(),
  moveFeature: (id: string, dx: number, dy: number) => sendUpdate(ed.moveFeature(id, dx, dy)),
  deleteFeature: (id: string) => sendUpdate(ed.deleteFeature(id)),
  moveStartTo: (x: number, y: number, orientation?: Orientation) => sendUpdate(ed.moveStartTo(x, y, orientation)),
  damSites: () => ed.damSiteLayer(),
  entitiesAt: (x: number, y: number) => ed.entitiesAt(x, y),
  footprintCheck: (req: ed.ToolRequest) => ed.footprintCheck(req),
  plantAt: (template: string, tiles: number[]) => sendUpdate(ed.plantAt(template, tiles)),
  setViews: (views: SavedView[]) => ed.setViews(views),
  removeAt: (tiles: number[], kinds: ed.RemoveKind[]) => sendUpdate(ed.removeAt(tiles, kinds)),
  instantCheck: () => ed.instantCheck(),
  // the forces (D194, D203): a carve at work, a frame at a time; Stop keeps it, Esc drops it
  carveStart: (req: ed.CarveRequest) => sendStarted(ed.carveStart(req)),
  /** Try another path: the last kept carve again, with the next seed. */
  carveAgain: () => sendStarted(ed.carveAgain()),
  carveAdvance(steps: number) {
    const f = ed.carveAdvance(steps);
    return f ? transfer(f, frameBuffers(f)) : null;
  },
  carveStop: () => sendUpdate(ed.carveStop()),
  carveCancel() {
    const v = ed.carveCancel();
    return transfer(v, viewBuffers(v) as Transferable[]);
  },
  async settingsResponse(): Promise<GenerateResponse> {
    const r = await ed.settingsResponse();
    return transfer(r, responseBuffers(r));
  },
  async regenerate(spec: MapSpec) {
    const r = await ed.regenerate(spec);
    return r.response ? transfer(r, responseBuffers(r.response)) : r;
  },
  exportCheck: () => ed.exportCheck(),
  waterLayers() {
    const r = ed.waterLayers();
    return transfer(r, [r.moisture.buffer, r.badwater.buffer, r.drought.buffer, r.roofed.buffer] as Transferable[]);
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
expose(api);
