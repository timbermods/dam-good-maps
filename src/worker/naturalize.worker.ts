// Naturalize's weathering, in a worker of its own (PLAN §20 D422, #868): the page sends a stroke's start with
// its own terrain and shown heights, then its dabs as they come, and shows the land each answer carries. The
// preview is the core's (core/features/raster/remoteStroke.ts `WeatherStroke`); this only holds the stroke.
// Never the map's worker: there the stroke's water ran on the same thread, and on a map with caves each dab's
// answer waited behind it for a fifth of a second. The page sends the stroke's land to the map's worker for its
// water, as for the other brushes.

import { expose, transfer } from "comlink";
import type { BrushParams } from "../core/features/raster/brush";
import { WeatherStroke, type WeatheredLand } from "../core/features/raster/remoteStroke";
import type { TerrainState } from "../core/features/raster/strokePreview";

let stroke: WeatherStroke | null = null;

const sendLand = (r: WeatheredLand | null) => (r ? transfer(r, [r.heights.buffer as ArrayBuffer]) : null);

const api = {
  /** A stroke begins: its settings, the ground under sources and objects it leaves, and the page's terrain and
   *  shown heights (`heights` taken over). */
  weatherBegin(settings: Omit<BrushParams, "dabs">, ground: [number, number, number][], state: TerrainState, heights: Uint8Array, W: number, H: number): void {
    stroke = new WeatherStroke(settings, state, heights, W, H, ground);
  },
  weatherAdd: (dabs: number[], pressure?: number[]) => sendLand(stroke?.add(dabs, pressure) ?? null),
  weatherFinish: (rigid: [number, number, number, number][]) => sendLand(stroke?.finish(rigid) ?? null),
  /** The stroke's end: the heights before the integrity pass, the protected tiles and the whole record. */
  weatherEnd() {
    const r = stroke?.end() ?? null;
    stroke = null;
    return r ? transfer(r, [r.pre.buffer as ArrayBuffer, r.protect.buffer as ArrayBuffer]) : null;
  },
  weatherCancel(): void {
    stroke = null;
  },
};

export type NaturalizeApi = typeof api;

expose(api);

/** The weathering's code made ready before the first stroke: a few strokes over a small hill beside a pond, thrown
 *  away. Cold, a 256² stroke's first dab came back in 33 ms instead of 1 to 3, and its land was the stroke's slowest
 *  (#868). */
function warm(): void {
  const N = 48;
  const pre = new Uint8Array(N * N);
  const water = new Float64Array(N * N);
  const moisture = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      pre[i] = 3 + Math.max(0, 9 - Math.round(Math.hypot(x - 16, y - 20) / 2)) + ((x * 7 + y * 13) % 3 === 0 ? 1 : 0);
      if (Math.hypot(x - 34, y - 22) < 5) {
        pre[i] = 2;
        water[i] = 1.5;
      }
      moisture[i] = Math.max(0, 1 - Math.hypot(x - 34, y - 22) / 12);
    }
  const state: TerrainState = { pre, protect: new Uint8Array(N * N), channel: new Uint8Array(N * N), base: null, locked: null, columns: new Int32Array(0), water, moisture, top: 16 };
  for (let k = 0; k < 4; k++) {
    const w = new WeatherStroke({ tool: "naturalize", size: 5, strength: 5 + k, seed: 17 + k, weathers: true }, state, pre.slice(), N, N, []);
    for (let d = 0; d < 24; d++) w.add([Math.round((6 + d * 1.2) * 4), Math.round((18 + 4 * Math.sin(d / 3)) * 4)]);
    w.finish([[14, 18, 16, 20]]);
    w.end();
  }
}

// (after the first messages are taken: a stroke that comes meanwhile waits for it)
setTimeout(warm, 0);
