// The renderer's per-map fields, as plain arrays (no three.js), so a worker can make them off the
// page's thread (bake.worker.ts): for both looks the water's flow, contamination and rough water (#38, #67) with the moving water's shapes (D353,
// motionShapes.ts). fields.ts and motion.ts turn them into textures and meshes.

import { columnMap, type MapView, type SurfaceWater, type WaterView } from "../model";
import { caveCurrent, type CaveCurrent } from "../caveCurrent";
import { currentOf, gameFlowOf } from "../current";
import { makeWaterTexture, WATER_FLOW, WATER_TEXTURE_SIZE } from "../waterTextures";
import { motionShapes, type MotionShapes } from "../motionShapes";
import { roughWater, surfaceContamination, type RoughCounts } from "./flow";
import { shadowMap, withCasterLevels, type ShadowRock, type Sun } from "../light";

/** The water's current as the looks draw it: the settle's current runs up to about 3.3 tiles a second
 *  in a river (current.ts), and the looks' moving surface and rough water were tuned to rivers at 7.5
 *  (the High look's first flow, estimated from the surface's slope). */
export const FLOW_DISPLAY = 2.25;

/** A flow (−1…1, the game's: outflow ÷ 14) as the flow texture's byte: 128 + 127 × sign × √|f|, so a slow drift keeps
 *  its precision (`flowByte`; the shaders' `waterFlowOf` squares it back). */
export function flowByte(f: number): number {
  const c = Math.max(-1, Math.min(1, f));
  return Math.round(128 + 127 * Math.sign(c) * Math.sqrt(Math.abs(c)));
}

/** The water's textures (RGBA, one texel a tile): the flow the water's textures ride (RG, the game's: each column's
 *  outflows ÷ 14, current.ts `gameFlowOf`, as `flowByte`, 128 still) with the smoothed contamination (B); the rough
 *  water (R). `out`: the outflows, four a tile (none: still). */
export function bakeFlow(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, current: Float32Array, out?: ArrayLike<number> | null): { flow: Uint8Array; rough: Uint8Array; counts: RoughCounts } {
  const velocity = new Float32Array(W * H * 2);
  for (let k = 0; k < velocity.length; k++) velocity[k] = current[k] * FLOW_DISPLAY;
  const cont = surfaceContamination(W, H, sw);
  const r = roughWater(W, H, heights, sw, velocity);
  const game = out ? gameFlowOf(W, H, out, sw.depth, WATER_FLOW.maxOutflow) : null;
  const flow = new Uint8Array(W * H * 4);
  const rough = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    flow[i * 4] = game ? flowByte(game[i * 2]) : 128;
    flow[i * 4 + 1] = game ? flowByte(game[i * 2 + 1]) : 128;
    flow[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, cont[i])) * 255);
    flow[i * 4 + 3] = 255;
    rough[i * 4] = Math.round(Math.max(0, Math.min(1, r.field[i])) * 255);
    rough[i * 4 + 3] = 255;
  }
  return { flow, rough, counts: r.counts };
}

/** The smoothed contamination alone, a byte a tile (the flow texture's B, as `bakeFlow` packs it): where nothing
 *  moves (stillFlow.ts). */
export function shareBytes(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">): Uint8Array {
  const cont = surfaceContamination(W, H, sw);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round(Math.max(0, Math.min(1, cont[i])) * 255);
  return out;
}

/** On a map with water per column (waterLayers.ts): the view (each column's own outflows) and the map's columns, with
 *  their version; the job's surface water then carries its `top`. */
export interface LayeredWater {
  view: WaterView;
  columns: MapView["columns"] & { key: number };
}

/** The map's columns as last sent, while their version holds (their gaps are kept with them, waterLayers.ts). */
let columnsKept: { key: number; map: Map<number, Uint8Array> } | null = null;

/** A job for the worker, and its answer. */
export type BakeJob =
  | { id: number; kind: "flow"; W: number; H: number; heights: Uint8Array; sw: SurfaceWater; out: Float32Array | null; layered?: LayeredWater }
  | { id: number; kind: "share"; W: number; H: number; sw: Pick<SurfaceWater, "surface" | "depth" | "contamination"> }
  | { id: number; kind: "shadows"; W: number; H: number; heights: Uint8Array; casters: Float32Array | null; levels: Uint8Array | null; rock: ShadowRock | null; sun: Sun }
  | { id: number; kind: "waterTexture" };
export type BakeResult =
  | { id: number; kind: "flow"; flow: Uint8Array; rough: Uint8Array; counts: RoughCounts; shapes: MotionShapes; cave: CaveCurrent | null; ms: number }
  | { id: number; kind: "share"; share: Uint8Array; ms: number }
  | { id: number; kind: "shadows"; bytes: Uint8Array; hi: Float32Array; lo: Float32Array; ms: number }
  | { id: number; kind: "waterTexture"; data: Uint8Array; ms: number };
/** What the worker sends back: the answer, or why the job failed. */
export type BakeReply = BakeResult | { id: number; kind: "error"; error: string };

export function runBake(job: BakeJob): BakeResult {
  const t0 = performance.now();
  // the textures the water's flow carries (waterTextures.ts), made once a page, here rather than on its thread
  if (job.kind === "waterTexture") return { id: job.id, kind: "waterTexture", data: makeWaterTexture(WATER_TEXTURE_SIZE), ms: performance.now() - t0 };
  if (job.kind === "share") return { id: job.id, kind: "share", share: shareBytes(job.W, job.H, job.sw), ms: performance.now() - t0 };
  // the baked shadows for the sun turned with the camera (light.ts; the renderer's `turnSun`)
  if (job.kind === "shadows") {
    const keep = { hi: new Float32Array(0), lo: new Float32Array(0) };
    const casters = job.casters ? withCasterLevels(job.casters, job.levels ?? undefined) : null;
    const bytes = shadowMap(job.W, job.H, job.heights, casters, keep, job.rock, job.sun);
    return { id: job.id, kind: "shadows", bytes, hi: keep.hi, lo: keep.lo, ms: performance.now() - t0 };
  }
  // the current from the outflows (current.ts), here rather than on the page's thread
  const current = job.out ? currentOf(job.W, job.H, job.out, job.sw.depth) : new Float32Array(job.W * job.H * 2);
  const { flow, rough, counts } = bakeFlow(job.W, job.H, job.heights, job.sw, current, job.out);
  const shapes = motionShapes(job.W, job.H, job.sw, current);
  // the current of water below its tile's surface water, each column its own (caveCurrent.ts)
  let cave: CaveCurrent | null = null;
  const l = job.layered;
  if (l) {
    if (columnsKept?.key !== l.columns.key) columnsKept = { key: l.columns.key, map: columnMap(l.columns) };
    cave = caveCurrent(job.W, job.H, job.heights, columnsKept.map, l.view, job.sw, flow, rough, bakeFlow);
  }
  return { id: job.id, kind: "flow", flow, rough, counts, shapes, cave, ms: performance.now() - t0 };
}
