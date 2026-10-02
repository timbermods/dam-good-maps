// The renderer's per-map fields, as plain arrays (no three.js), so a worker can make them off the
// page's thread (bake.worker.ts): the High look's ambient occlusion (#65), and for both looks the
// water's flow, contamination and rough water (#38, #67) with the moving water's shapes (D353,
// motionShapes.ts). fields.ts and motion.ts turn them into textures and meshes.

import type { SurfaceWater } from "../model";
import { motionShapes, type MotionShapes } from "../motionShapes";
import { roughWater, surfaceContamination, type RoughCounts } from "./flow";

/** The water's current as the looks draw it: the settle's current runs up to about 3.3 tiles a second
 *  in a river (current.ts), and the looks' moving surface and rough water were tuned to rivers at 7.5
 *  (the High look's first flow, estimated from the surface's slope). */
export const FLOW_DISPLAY = 2.25;

const RADII = [1, 2, 4, 8];
/** How far a height change moves the ambient occlusion's terrain term. */
export const AMBIENT_REACH = RADII[RADII.length - 1];

/** What shades the ground round an object: 1 a pine or birch, 2 an oak (a broader crown), 3 a ruin,
 *  0 nothing (dead trees have no canopy). */
export function canopyKind(template: string, dead: boolean): number {
  if (/^(Pine|Birch)/.test(template)) return dead ? 0 : 1;
  if (template.startsWith("Oak")) return dead ? 0 : 2;
  return template.startsWith("RuinColumnH") ? 3 : 0;
}

export interface Canopies {
  kind: Uint8Array;
  x: Int16Array;
  y: Int16Array;
  z: Int16Array;
}

/** The canopies' soft footprints (#65 ambient.ts): how much of the sky each tile loses to them. */
export function canopyCover(W: number, H: number, heights: Uint8Array, c: Canopies): Float32Array {
  const cover = new Float32Array(W * H);
  for (let k = 0; k < c.kind.length; k++) {
    const kind = c.kind[k];
    if (!kind) continue;
    const tree = kind < 3;
    const radius = kind === 2 ? 2.3 : tree ? 1.55 : 1.25;
    const reach = Math.ceil(radius);
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const x = c.x[k] + dx;
        const y = c.y[k] + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const d = Math.hypot(dx, dy) / radius;
        if (d >= 1 || Math.abs(heights[i] - c.z[k]) > 1) continue;
        // multiplied, so a dense grove saturates gently
        const occlusion = (tree ? 0.27 : 0.18) * (1 - d * d) ** 2;
        cover[i] = 1 - (1 - cover[i]) * (1 - occlusion);
      }
  }
  return cover;
}

/** The eight horizons' steps at each radius (x, y), as `Math.round(cos · r)` and `Math.round(sin · r)`. */
const STEPS_AT: Int8Array = (() => {
  const s = new Int8Array(8 * RADII.length * 2);
  for (let a = 0; a < 8; a++) {
    const angle = (a * Math.PI) / 4;
    RADII.forEach((r, k) => {
      s[(a * RADII.length + k) * 2] = Math.round(Math.cos(angle) * r);
      s[(a * RADII.length + k) * 2 + 1] = Math.round(Math.sin(angle) * r);
    });
  }
  return s;
})();
/** A horizon's height for each rise (0–255 levels) at each radius: rise / hypot(rise, r) · (1 − r / 16). */
const HORIZON: Float64Array = (() => {
  const h = new Float64Array(256 * RADII.length);
  for (let rise = 0; rise < 256; rise++) RADII.forEach((r, k) => (h[rise * RADII.length + k] = (rise / Math.hypot(rise, r)) * (1 - r / 16)));
  return h;
})();

/** The ambient occlusion's texels (RGBA, one a tile) over a rectangle: R how much of the sky the
 *  ground sees past the terrain round it (eight horizons at four radii), G past the canopies. (The
 *  steps and horizons come from tables made once: the same numbers, a brush's rectangle many times
 *  faster, R1.) */
export function ambientRect(W: number, H: number, heights: Uint8Array, cover: Float32Array, out: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  const R = RADII.length;
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      const z = heights[i];
      let occlusion = 0;
      for (let a = 0; a < 8; a++) {
        let horizon = 0;
        for (let k = 0; k < R; k++) {
          const xx = x + STEPS_AT[(a * R + k) * 2];
          const yy = y + STEPS_AT[(a * R + k) * 2 + 1];
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const rise = heights[yy * W + xx] - z;
          if (rise > 0) horizon = Math.max(horizon, HORIZON[rise * R + k]);
        }
        occlusion += horizon / 8;
      }
      out[i * 4] = Math.round(255 * (1 - Math.min(0.32, occlusion * 0.55)));
      out[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.4, cover[i])));
      out[i * 4 + 2] = z;
      out[i * 4 + 3] = 255;
    }
}

export function canopyInto(cover: Float32Array, out: Uint8Array): void {
  for (let i = 0; i < cover.length; i++) out[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.4, cover[i])));
}

/** The whole map's ambient occlusion. */
export function bakeAmbient(W: number, H: number, heights: Uint8Array, c: Canopies): { data: Uint8Array; cover: Float32Array } {
  const cover = canopyCover(W, H, heights, c);
  const data = new Uint8Array(W * H * 4);
  ambientRect(W, H, heights, cover, data, 0, 0, W - 1, H - 1);
  return { data, cover };
}

/** The water's textures (RGBA, one texel a tile): the flow (RG, the current as drawn, compressed to at
 *  most 2 tiles a second, 128 still) with the smoothed contamination (B); the rough water (R). */
export function bakeFlow(W: number, H: number, heights: Uint8Array, sw: SurfaceWater): { flow: Uint8Array; rough: Uint8Array; counts: RoughCounts } {
  const velocity = new Float32Array(W * H * 2);
  for (let k = 0; k < velocity.length; k++) velocity[k] = sw.current[k] * FLOW_DISPLAY;
  const cont = surfaceContamination(W, H, sw);
  const r = roughWater(W, H, heights, sw, velocity);
  const flow = new Uint8Array(W * H * 4);
  const rough = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = velocity[i * 2];
    const y = velocity[i * 2 + 1];
    const s = Math.hypot(x, y);
    const k = s > 0 ? (2 * (1 - Math.exp(-s * 0.3))) / s : 0;
    flow[i * 4] = Math.round(128 + x * k * 63.5);
    flow[i * 4 + 1] = Math.round(128 + y * k * 63.5);
    flow[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, cont[i])) * 255);
    flow[i * 4 + 3] = 255;
    rough[i * 4] = Math.round(Math.max(0, Math.min(1, r.field[i])) * 255);
    rough[i * 4 + 3] = 255;
  }
  return { flow, rough, counts: r.counts };
}

/** A job for the worker, and its answer. */
export type BakeJob =
  | { id: number; kind: "ambient"; W: number; H: number; heights: Uint8Array; canopies: Canopies }
  | { id: number; kind: "flow"; W: number; H: number; heights: Uint8Array; sw: SurfaceWater };
export type BakeResult =
  | { id: number; kind: "ambient"; data: Uint8Array; cover: Float32Array; ms: number }
  | { id: number; kind: "flow"; flow: Uint8Array; rough: Uint8Array; counts: RoughCounts; shapes: MotionShapes; ms: number };

export function runBake(job: BakeJob): BakeResult {
  const t0 = performance.now();
  if (job.kind === "ambient") {
    const { data, cover } = bakeAmbient(job.W, job.H, job.heights, job.canopies);
    return { id: job.id, kind: "ambient", data, cover, ms: performance.now() - t0 };
  }
  const { flow, rough, counts } = bakeFlow(job.W, job.H, job.heights, job.sw);
  const shapes = motionShapes(job.W, job.H, job.sw, job.sw.current);
  return { id: job.id, kind: "flow", flow, rough, counts, shapes, ms: performance.now() - t0 };
}
