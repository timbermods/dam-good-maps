// The renderer's per-map fields, as plain arrays (no three.js), so a worker can make them off the
// page's thread (bake.worker.ts): for both looks the water's flow and contamination (#38) with the moving water's shapes (D353,
// motionShapes.ts). fields.ts and motion.ts turn them into textures and meshes.

import { columnMap, type MapView, type SurfaceWater, type WaterView } from "../model";
import { caveCurrent, type CaveCurrent } from "../caveCurrent";
import { currentOf, gameFlowOf } from "../current";
import { DETAIL_TEXTURE_SIZE, makeBadwaterTexture, makeDetailField, makeSourceShape, makeWaterTexture, WATER_FLOW, WATER_TEXTURE_SIZE } from "../waterTextures";
import { makeSoilTexture, SOIL_TEXTURE_SIZE } from "../soilTexture";
import { motionShapes, noShapes, type MotionShapes } from "../motionShapes";
import { surfaceContamination } from "./flow";
import { fallBytes } from "../fallMask";
import { handedWater } from "../fallSlope";
import { shadowMap, withCasterLevels, type ShadowRock, type Sun } from "../light";

/** A flow (−1…1, the game's: outflow ÷ 14) as the flow texture's byte: 128 + 127 × sign × √|f|, so a slow drift keeps
 *  its precision (`flowByte`; the shaders' `waterFlowOf` squares it back). */
export function flowByte(f: number): number {
  const c = Math.max(-1, Math.min(1, f));
  return Math.round(128 + 127 * Math.sign(c) * Math.sqrt(Math.abs(c)));
}

/** The water's texture (RGBA, one texel a tile): the flow the water's textures ride (RG, the game's: each column's
 *  outflows ÷ 14, current.ts `gameFlowOf`, as `flowByte`, 128 still) with the smoothed contamination (B) and the game's
 *  waterfall mask (A, fallMask.ts `fallBytes`: 0 dry, 1 + 254 × the mask wet). `out`: the outflows, four a tile (none:
 *  still). */
export function bakeFlow(W: number, H: number, sw: SurfaceWater, out?: ArrayLike<number> | null): { flow: Uint8Array } {
  // (the water below a fall takes the fall's badwater share and outflow, as the game's FindBestProperties hands them on:
  // fallSlope.ts, so a fall's slope is the fall's colour and runs with its current)
  const cont = surfaceContamination(W, H, handedWater(W, H, sw));
  const game = out ? gameFlowOf(W, H, out, sw.depth, WATER_FLOW.maxOutflow, sw) : null;
  const fall = fallBytes(W, H, sw);
  const flow = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    flow[i * 4] = game ? flowByte(game[i * 2]) : 128;
    flow[i * 4 + 1] = game ? flowByte(game[i * 2 + 1]) : 128;
    flow[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, cont[i])) * 255);
    flow[i * 4 + 3] = fall[i];
  }
  return { flow };
}

/** The smoothed contamination alone, a byte a tile (the flow texture's B, as `bakeFlow` packs it): where nothing
 *  moves (stillFlow.ts), with the waterfall mask (its A, `stillBytes`). */
export function shareBytes(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">): Uint8Array {
  const cont = surfaceContamination(W, H, handedWater(W, H, sw));
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = Math.round(Math.max(0, Math.min(1, cont[i])) * 255);
  return out;
}

/** What a still view's flow texture takes from the water (stillFlow.ts): the share (B, `shareBytes`) and the waterfall
 *  mask (A, fallMask.ts `fallBytes`). */
export function stillBytes(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">, fall = true): { share: Uint8Array; fall: Uint8Array } {
  // (the light look draws no waterfall mask: it is not worked out for it, A only whether the tile is wet, 1 or 0, which
  // the badwater share's blend reads: waterPalette.ts waterShareFrom)
  if (!fall) {
    const wet = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) wet[i] = sw.surface[i] === sw.surface[i] && sw.depth[i] > 0 ? 1 : 0;
    return { share: shareBytes(W, H, sw), fall: wet };
  }
  return { share: shareBytes(W, H, sw), fall: fallBytes(W, H, sw) };
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
  | { id: number; kind: "flow"; W: number; H: number; heights: Uint8Array; sw: SurfaceWater; out: Float32Array | null; layered?: LayeredWater; shapes?: boolean }
  | { id: number; kind: "share"; W: number; H: number; sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">; fall?: boolean }
  | { id: number; kind: "shadows"; W: number; H: number; heights: Uint8Array; casters: Float32Array | null; levels: Uint8Array | null; rock: ShadowRock | null; sun: Sun }
  | { id: number; kind: "waterTexture" }
  | { id: number; kind: "detailTexture"; shape: boolean };
export type BakeResult =
  | { id: number; kind: "flow"; flow: Uint8Array; shapes: MotionShapes; cave: CaveCurrent | null; ms: number }
  | { id: number; kind: "share"; share: Uint8Array; fall: Uint8Array; ms: number }
  | { id: number; kind: "shadows"; bytes: Uint8Array; hi: Float32Array; lo: Float32Array; ms: number }
  | { id: number; kind: "waterTexture"; data: Uint8Array; bad: Uint8Array; soil: Uint8Array; ms: number }
  | { id: number; kind: "detailTexture"; detail: Uint8Array; size: number; shape: Uint8Array | null; ms: number };
/** What the worker sends back: the answer, or why the job failed. */
export type BakeReply = BakeResult | { id: number; kind: "error"; error: string };

export function runBake(job: BakeJob): BakeResult {
  const t0 = performance.now();
  // the textures the water's flow carries (waterTextures.ts), made once a page, here rather than on its thread
  if (job.kind === "waterTexture") return { id: job.id, kind: "waterTexture", data: makeWaterTexture(WATER_TEXTURE_SIZE), bad: makeBadwaterTexture(WATER_TEXTURE_SIZE), soil: makeSoilTexture(SOIL_TEXTURE_SIZE), ms: performance.now() - t0 };
  // the still detail albedo (Q9 P6), its own texture at the game's size, every look's; with the water sources' pattern
  // (badwater's texture's A, Q9 P7) for the light look, which makes none of the others
  if (job.kind === "detailTexture") return { id: job.id, kind: "detailTexture", detail: makeDetailField(DETAIL_TEXTURE_SIZE), size: DETAIL_TEXTURE_SIZE, shape: job.shape ? makeSourceShape(WATER_TEXTURE_SIZE) : null, ms: performance.now() - t0 };
  if (job.kind === "share") return { id: job.id, kind: "share", ...stillBytes(job.W, job.H, job.sw, job.fall ?? true), ms: performance.now() - t0 };
  // the baked shadows for the sun turned with the camera (light.ts; the renderer's `turnSun`)
  if (job.kind === "shadows") {
    const keep = { hi: new Float32Array(0), lo: new Float32Array(0) };
    const casters = job.casters ? withCasterLevels(job.casters, job.levels ?? undefined) : null;
    const bytes = shadowMap(job.W, job.H, job.heights, casters, keep, job.rock, job.sun);
    return { id: job.id, kind: "shadows", bytes, hi: keep.hi, lo: keep.lo, ms: performance.now() - t0 };
  }
  const { flow } = bakeFlow(job.W, job.H, job.sw, job.out);
  // the Flow view's foam and streaks, from the current of the outflows (current.ts), here rather than on the page's
  // thread; outside the Flow view none, nothing of them being drawn (`shapes` false)
  const current = job.shapes === false ? null : job.out ? currentOf(job.W, job.H, job.out, job.sw.depth) : new Float32Array(job.W * job.H * 2);
  const shapes = current ? motionShapes(job.W, job.H, job.sw, current) : noShapes();
  // the current of water below its tile's surface water, each column its own (caveCurrent.ts)
  let cave: CaveCurrent | null = null;
  const l = job.layered;
  if (l) {
    if (columnsKept?.key !== l.columns.key) columnsKept = { key: l.columns.key, map: columnMap(l.columns) };
    cave = caveCurrent(job.W, job.H, job.heights, columnsKept.map, l.view, job.sw, flow, bakeFlow);
  }
  return { id: job.id, kind: "flow", flow, shapes, cave, ms: performance.now() - t0 };
}
