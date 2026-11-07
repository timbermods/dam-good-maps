// The time-lapse's recorder (D205, D285 (4); D505): the map's history replayed in a worker of its
// own (worker/timelapse.worker.ts), drawn frame by frame on a renderer of its own, off screen, as the map's picture is
// (render3d/hero.ts): the player's view, its camera, look and size, is never touched. Each frame goes to the browser's
// video encoder (WebCodecs, VP9 where it can, else VP8) with its own time, so the video is the same frames whatever
// the machine's speed, and is written as a WebM (webm.ts). The page never freezes: a frame is drawn, handed to the
// encoder, and the page's thread let go before the next (the encoder and the replay work elsewhere).

import { wrap, type Remote } from "comlink";
import { heightsAt } from "../../core/doc/timelapse";
import { MapRenderer } from "../../render3d/renderer";
import type { MapView, WaterView } from "../../render3d/model";
import type { LapseStepShown, TimelapseApi } from "../../worker/timelapse.worker";
import { lapseCamera, LAPSE_FOV } from "./camera";
import { FPS, lapsePlan, TICKS_PER_SECOND, WATER_EVERY, type LapsePlan } from "./plan";
import { WebmWriter, type WebmCodec } from "./webm";

/** The video's size: 720p, sharp enough to post and small enough to send (about a megabyte every four seconds). */
export const LAPSE_W = 1280;
export const LAPSE_H = 720;
const BITS_PER_SECOND = 1_600_000;
/** A key frame every two seconds: a player seeks at once. */
const KEY_EVERY = 2 * FPS;
/** The water and the wind's clock where the video starts (seconds; hero.ts holds its picture at 6). */
const CLOCK = 6;
/** The longest the first frame waits for its programs (compiled off the page's thread), and for the High look's
 *  occlusion, before it is drawn anyway (hero.ts's waits). */
const PROGRAMS_MS = 20_000;
const SETTLE_MS = 3_000;
/** Steps asked of the replay ahead of the one playing. */
const AHEAD = 4;

/** Where a recording stands, for its progress line. */
export interface LapseProgress {
  /** "prepare": the replay and the renderer made ready; "record": frames drawn; "finish": the file written. */
  phase: "prepare" | "record" | "finish";
  frame: number;
  frames: number;
  steps: number;
}

export interface LapseResult {
  blob: Blob;
  frames: number;
  durationMs: number;
  width: number;
  height: number;
  codec: WebmCodec;
  /** Whether the replay ended as the map itself, byte for byte (the last frame is drawn from the map either way). */
  same: boolean;
  plan: LapsePlan;
}

export interface LapseOptions {
  /** The project's bytes, as Download project writes them. */
  project: Uint8Array;
  onProgress?: (p: LapseProgress) => void;
  signal?: AbortSignal;
  /** The video's size (default 1280×720; the browser spec records a small one). */
  width?: number;
  height?: number;
}

/** The page's thread let go, as a task of its own (a message, never throttled as a hidden tab's timers are). */
const breathe = (() => {
  if (typeof MessageChannel === "undefined") return () => new Promise<void>((done) => setTimeout(done, 0));
  const ch = new MessageChannel();
  const waiting: (() => void)[] = [];
  ch.port1.onmessage = () => waiting.shift()?.();
  return () =>
    new Promise<void>((done) => {
      waiting.push(done);
      ch.port2.postMessage(0);
    });
})();

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The encoder took a frame (or a moment passed, where it never says so). */
const dequeued = (enc: VideoEncoder) =>
  new Promise<void>((done) => {
    const t = setTimeout(done, 50);
    enc.addEventListener(
      "dequeue",
      () => {
        clearTimeout(t);
        done();
      },
      { once: true },
    );
  });

function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("The time-lapse was cancelled", "AbortError");
}

/** The codec this browser encodes at this size: VP9, else VP8; null when neither. */
async function pickCodec(width: number, height: number): Promise<{ config: VideoEncoderConfig; codec: WebmCodec } | null> {
  const base = { width, height, bitrate: BITS_PER_SECOND, framerate: FPS, latencyMode: "quality" as const };
  for (const [codec, name] of [
    ["vp09.00.10.08", "V_VP9"],
    ["vp8", "V_VP8"],
  ] as const) {
    const config: VideoEncoderConfig = { ...base, codec };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, codec: name };
    } catch {
      // (not this one)
    }
  }
  return null;
}

/** An off-screen host and the renderer drawn on it (hero.ts `make`): the video's size in device pixels. */
function makeRenderer(w: number, h: number): { r: MapRenderer; host: HTMLElement } {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-${w * 4}px;top:0;width:${w}px;height:${h}px;pointer-events:none;opacity:0`;
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  host.append(canvas);
  document.body.append(host);
  try {
    const r = new MapRenderer(canvas, { still: true, fov: LAPSE_FOV, pixels: 1 });
    r.holdShowcase();
    return { r, host };
  } catch (e) {
    canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    host.remove();
    throw e;
  }
}

/** The tiles of a step's changed ground, as a rectangle (null when none). */
function tileRect(tiles: Int32Array, W: number): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!tiles.length) return null;
  let x0 = W;
  let x1 = 0;
  for (const i of tiles) {
    const x = i % W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return { x0, y0: Math.floor(tiles[0] / W), x1, y1: Math.floor(tiles[tiles.length - 1] / W) };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Record the time-lapse of a project. Throws an AbortError when cancelled. */
export async function recordTimelapse(o: LapseOptions): Promise<LapseResult> {
  const width = o.width ?? LAPSE_W;
  const height = o.height ?? LAPSE_H;
  const report = (p: LapseProgress) => o.onProgress?.(p);
  const codec = await pickCodec(width, height);
  if (!codec) throw new Error("This browser can't make videos: try Chrome or Edge");
  const worker = new Worker(new URL("../../worker/timelapse.worker.ts", import.meta.url), { type: "module", name: "timelapse" });
  const api: Remote<TimelapseApi> = wrap<TimelapseApi>(worker);
  let made: { r: MapRenderer; host: HTMLElement } | null = null;
  let encoder: VideoEncoder | null = null;
  try {
    const opened = await api.open(o.project);
    aborted(o.signal);
    const { W, H, steps, start, end } = opened;
    const plan = lapsePlan(steps, W, H);
    const camera = lapseCamera(plan, start.heights, W, H, end.entities);
    report({ phase: "prepare", frame: 0, frames: plan.frames, steps: steps.length });

    // the renderer, its programs compiled first (off the page's thread where the browser can)
    made = makeRenderer(width, height);
    const r = made.r;
    r.setClock(CLOCK);
    r.setMap(start, false, true);
    r.setView({ mode: "orbit", ...camera(0) });
    const p0 = performance.now();
    while (!r.programsSettled && performance.now() - p0 < PROGRAMS_MS) {
      aborted(o.signal);
      await wait(30);
    }
    await r.compileAhead();
    const t0 = performance.now();
    while (!r.highSettled && performance.now() - t0 < SETTLE_MS) {
      aborted(o.signal);
      r.renderNow();
      await wait(30);
    }

    // the encoder and the file
    const writer = new WebmWriter({ codec: codec.codec, width, height, fps: FPS });
    const state: { failed: Error | null } = { failed: null };
    const enc = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        writer.add(data, chunk.timestamp, chunk.type === "key");
      },
      error: (e) => {
        state.failed = e instanceof Error ? e : new Error(String(e));
      },
    });
    encoder = enc;
    enc.configure(codec.config);

    // the steps, each asked of the worker ahead of its frames (the replay runs while the frames before it are drawn)
    const tickEvery = (WATER_EVERY * TICKS_PER_SECOND) / FPS;
    const ask = (k: number): Promise<LapseStepShown | null> => {
      const s = plan.steps[k];
      return api.step(Math.ceil((s.until - s.from) / WATER_EVERY), tickEvery) as Promise<LapseStepShown | null>;
    };
    const asked: Promise<LapseStepShown | null>[] = [];
    const stepData = (k: number) => (asked[k] ??= ask(k));
    // the ending's water: the last step's flowing on through the glide to the finished map's view
    let endWater: Promise<WaterView[]> | null = null;

    const shown = start.heights.slice();
    let cur: { k: number; data: LapseStepShown; switched: boolean; water: number } | null = null;
    let next = 0;
    let ended = false;
    let outroWater: WaterView[] = [];
    let outroShown = -1;
    for (let f = 0; f < plan.frames; f++) {
      aborted(o.signal);
      if (state.failed) throw state.failed;
      // every step whose frames have begun is put in place: the one before it finished exactly, a step that shows
      // nothing applied at once
      while (next < plan.steps.length && plan.steps[next].from <= f) {
        if (cur) finishStep(cur);
        const data = await stepData(next);
        if (!data) throw new Error("The time-lapse lost its place in the history");
        // (a few steps ahead: a long history plays several steps to a frame)
        for (let a = next + 1; a < Math.min(plan.steps.length, next + 1 + AHEAD); a++) void stepData(a);
        if (next + 1 >= plan.steps.length) endWater ??= api.water(Math.ceil((plan.outro.hold - plan.outro.tail) / WATER_EVERY), tickEvery) as Promise<WaterView[]>;
        cur = { k: next, data, switched: false, water: -1 };
        next++;
      }
      if (cur && f < plan.outro.tail) playStep(cur, f);
      else if (f >= plan.outro.tail && !ended) {
        if (cur) finishStep(cur);
        cur = null;
        if (f < plan.outro.hold) {
          outroWater = endWater ? await endWater : [];
          const v = Math.min(outroWater.length - 1, Math.floor((f - plan.outro.tail) / WATER_EVERY));
          if (v >= 0 && v !== outroShown) {
            outroShown = v;
            r.updateWater(outroWater[v], true);
          }
        } else {
          // the finished map itself: its land, objects, water and soil as the map holds them
          showEnd(end);
          ended = true;
        }
      }
      r.setView({ mode: "orbit", ...camera(f) });
      r.setClock(CLOCK + f / FPS);
      r.renderNow();
      const frame = new VideoFrame(r.canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(frame, { keyFrame: f % KEY_EVERY === 0 });
      frame.close();
      report({ phase: "record", frame: f + 1, frames: plan.frames, steps: steps.length });
      // (the encoder keeps up: a few frames waiting at most; its own word when one is taken, never a timer a hidden
      // tab would slow)
      while (enc.encodeQueueSize > 2) await dequeued(enc);
      await breathe();
    }
    report({ phase: "finish", frame: plan.frames, frames: plan.frames, steps: steps.length });
    await enc.flush();
    if (state.failed) throw state.failed;
    enc.close();
    encoder = null;
    const same = await api.finish();
    if (!same) console.warn("The time-lapse's replay did not end as the map itself; its last frame is the map's own.");
    return { blob: writer.finish(), frames: writer.count, durationMs: (writer.count * 1000) / FPS, width, height, codec: codec.codec, same, plan };

    function playStep(c: { k: number; data: LapseStepShown; switched: boolean; water: number }, f: number): void {
      const s = plan.steps[c.k];
      const ch = c.data.change;
      const p = s.to > s.from ? (f - s.from + 1) / (s.to - s.from) : 1;
      const rect = tileRect(ch.tiles, W);
      if (rect && heightsAt(ch, p, shown)) r.updateTerrainRect(shown, rect);
      if (!c.switched && p >= ch.switchAt) switchStep(c);
      const v = Math.min(c.data.water.length - 1, Math.floor((f - s.from) / WATER_EVERY));
      if (v >= 0 && v !== c.water) {
        c.water = v;
        r.updateWater(c.data.water[v], true);
      }
    }

    function switchStep(c: { data: LapseStepShown; switched: boolean }): void {
      c.switched = true;
      if (c.data.columns) r.updateTerrain(shown, c.data.columns);
      if (c.data.entities) r.updateEntities(c.data.entities);
    }

    function finishStep(c: { k: number; data: LapseStepShown; switched: boolean }): void {
      const ch = c.data.change;
      const rect = tileRect(ch.tiles, W);
      if (rect && heightsAt(ch, 1, shown)) r.updateTerrainRect(shown, rect);
      if (!c.switched) switchStep(c);
    }

    function showEnd(v: MapView): void {
      if (!sameBytes(shown, v.heights) || v.columns.tiles.length) {
        shown.set(v.heights);
        r.updateTerrain(shown, v.columns.tiles.length ? v.columns : undefined);
      }
      r.updateEntities(v.entities);
      r.updateWater(v.water, true);
      if (v.soil) r.updateSoil(v.soil);
    }
  } finally {
    try {
      if (encoder && encoder.state !== "closed") encoder.close();
    } catch {
      // (closed already)
    }
    api.close().catch(() => undefined);
    worker.terminate();
    if (made) {
      made.r.dispose();
      made.host.remove();
    }
  }
}
