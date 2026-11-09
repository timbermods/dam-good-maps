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
