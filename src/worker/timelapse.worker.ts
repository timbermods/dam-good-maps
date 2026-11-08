// The build time-lapse's worker (D205, D285 (4)): the history replayed from the generated map (core/doc/timelapse.ts
// `TimelapseReplay`), a step at a time as the page's recorder asks for it, with the water flowing on each step's land
// as the editor's live water flows. In a worker of its own, like Showcase mode's search, so the editor never slows
// and the page never freezes while a video records; its views are the editor's own (session.ts `wholeView`,
// `waterOf`). Its water stays on one thread (no helpers are installed here), paced to a time budget a view. The page
// starts it with src/editor/timelapse/record.ts.

import { expose, transfer } from "comlink";
import { decodeProject } from "../core/doc/document";
import { TimelapseReplay, type LapseChange, type LapseStep } from "../core/doc/timelapse";
import { viewBuffers, type EntityView, type MapView, type WaterView } from "../render3d/model";
import { waterOf, wholeView } from "./session";

/** The replay opened: the map's size, its steps, the generated map it starts from and the map itself it ends as. */
export interface LapseOpened {
  W: number;
  H: number;
  steps: LapseStep[];
  start: MapView;
  end: MapView;
}

/** One step: what it changed, the columns and the objects after it when they changed, and the water flowing after it,
 *  a view a frame of the water asked for. */
export interface LapseStepShown {
  change: LapseChange;
  columns?: MapView["columns"];
  entities?: EntityView;
  water: WaterView[];
}

let replay: TimelapseReplay | null = null;

function need(): TimelapseReplay {
  if (!replay) throw new Error("No time-lapse is open");
  return replay;
}

/** The most of the worker's time a view of the water takes (ms). Its water runs on one thread here, and on a map with
 *  caves or overhangs a tick can cost tens of milliseconds: there the water flows slower in the video rather than the
 *  recording slowing (D453), never fewer than `LEAST_TICKS` a view. */
const VIEW_MS = 25;
const LEAST_TICKS = 2;
/** What a tick of the water costs on this map, learned as it runs (ms; 0 before the first). */
let tickMs = 0;

/** `frames` views of the water flowing on the map as it stands, `ticks` apart (fewer on a heavy map: `VIEW_MS`). */
function flowing(r: TimelapseReplay, frames: number, ticks: number): WaterView[] {
  const out: WaterView[] = [];
  for (let k = 0; k < frames; k++) {
    const n = Math.max(1, Math.min(ticks, tickMs > 0 ? Math.max(LEAST_TICKS, Math.floor(VIEW_MS / tickMs)) : LEAST_TICKS));
    const t0 = performance.now();
    const live = r.flow(n);
    if (!live) break;
    const ms = (performance.now() - t0) / n;
    tickMs = tickMs > 0 ? tickMs * 0.7 + ms * 0.3 : ms;
    out.push(waterOf(r.map, live));
  }
  return out;
}

function waterBuffers(list: readonly WaterView[]): Transferable[] {
  return list.flatMap((w) => viewBuffers({ water: w }) as Transferable[]);
}

const api = {
  /** Open a project's bytes (the editor's `project()`): the map itself, and the generated map built (seconds at 256²). */
  open(bytes: Uint8Array): LapseOpened {
    replay = null;
    tickMs = 0;
    const r = TimelapseReplay.open(decodeProject(bytes));
    replay = r;
    const start = wholeView(r.map);
    const end = wholeView(r.target);
    const out: LapseOpened = { W: r.W, H: r.H, steps: [...r.steps], start, end };
    return transfer(out, [...viewBuffers(start), ...viewBuffers(end)] as Transferable[]);
  },

  /** The next step, and `frames` views of the water after it, `ticks` apart; null after the last. */
  step(frames: number, ticks: number): LapseStepShown | null {
    const r = need();
    const change = r.next();
    if (!change) return null;
    const out: LapseStepShown = { change, water: flowing(r, frames, ticks) };
    if (change.columns || change.objects) {
      const v = wholeView(r.map);
      if (change.columns) out.columns = v.columns;
      if (change.objects) out.entities = v.entities;
    }
    const buffers: Transferable[] = [change.tiles.buffer, change.before.buffer, change.after.buffer, change.start.buffer, ...waterBuffers(out.water)] as Transferable[];
    if (out.columns) buffers.push(...(viewBuffers({ columns: out.columns }) as Transferable[]));
    if (out.entities) buffers.push(...(viewBuffers({ entities: out.entities }) as Transferable[]));
    return transfer(out, buffers);
  },

  /** More of the water flowing on the map as it stands (after the last step: the ending). */
  water(frames: number, ticks: number): WaterView[] {
    const list = flowing(need(), frames, ticks);
    return transfer(list, waterBuffers(list));
  },

  /** After the last step: whether the replay is the map itself, its land, blocks and objects byte for byte (D455's
   *  comparison without the water, which would take seconds to settle; the video's last frame is drawn from the map
   *  itself either way, and tests/contract/timelapse.test.ts holds the whole comparison). */
  finish(): boolean {
    return need().finish({ water: false });
  },

  close(): void {
    replay = null;
  },
};

export type TimelapseApi = typeof api;

expose(api);
