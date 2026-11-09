// The water's outflows and current, as the moving water, the Flow view and the falls read them
// (investigation/flow-arrows, D353; the outflows rather than the current since Kyler's yes on
// 2026-10-02):
// - the water worker sends, with every water view, the settle's own outflows of each column (four, in
//   the simulation's order −y, −x, +y, +x, already a rate: the simulation multiplies by its time step):
//   `outflowsOf`, a copy of four numbers a wet column, handed to the page with the view's other arrays;
// - the renderer's bake worker works out the current from them (`currentOf`, a bake at a time, never with
//   each water update on the page's thread): each face's net flow, averaged over the
//   tile's two opposite faces and divided by the water's depth. It is the simulation's balanced
//   momentum, not an exact transport flux, and there is no estimate from the surface's slope: water
//   without outflows is still; a fall's slope takes the current over its lip, as the game's FindBestProperties hands it
//   (fallSlope.ts `handOver`, `gameFlowOf`).
// Only drawn, never fed back into the water, a map or an operation.

import type { SurfaceWater, WaterView } from "./model";
import { handOver } from "./fallSlope";

/** Below this depth a column has no current (a film of water). */
const SHALLOW = 0.001;

/** The outflows of each column of `view` (four a column), from the outflows `out` (four a tile) of the
 *  map the view shows; undefined without them. */
export function outflowsOf(view: WaterView, W: number, H: number, out: ArrayLike<number> | null | undefined): Float32Array | undefined {
  if (!out || out.length !== W * H * 4) return undefined;
  const o = new Float32Array(view.count * 4);
  for (let k = 0; k < view.count; k++) {
    const i = view.tile[k] * 4;
    for (let d = 0; d < 4; d++) {
      const v = out[i + d];
      o[k * 4 + d] = v === v && v > 0 ? v : 0;
    }
  }
  return o;
}

/** The current at each tile (x then y, tiles a second, x east and y toward increasing rows) from the
 *  tiles' outflows (four a tile) and depths. */
export function currentOf(W: number, H: number, out: ArrayLike<number>, depth: ArrayLike<number>): Float32Array {
  const c = new Float32Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    const d = depth[i];
    if (!(d > SHALLOW)) continue;
    const x = i % W;
    const y = (i - x) / W;
    const o = i * 4;
    // each face's net current: what leaves across it, less what the neighbour sends back across it
    const north = out[o] - (y > 0 ? out[(i - W) * 4 + 2] : 0);
    const west = out[o + 1] - (x > 0 ? out[(i - 1) * 4 + 3] : 0);
    const south = out[o + 2] - (y + 1 < H ? out[(i + W) * 4] : 0);
    const east = out[o + 3] - (x + 1 < W ? out[(i + 1) * 4 + 1] : 0);
    const vx = ((east - west) * 0.5) / d;
    const vy = ((south - north) * 0.5) / d;
    if (vx === vx && vy === vy && Math.abs(vx) < 1e6 && Math.abs(vy) < 1e6) {
      c[i * 2] = vx;
      c[i * 2 + 1] = vy;
    }
  }
  return c;
}

/** The flow the water's textures ride, as the game's water hands it to its shader (Q9 V1, P5): each column's own
 *  outflows, right less left and down the rows less up them (decompiled `Timberborn.WaterSystem`
 *  `GetFlowVectorAtTop`), ÷ `maxOutflow` (14, `Timberborn.WaterSystemRendering` `MaxOutflow`), then averaged with
 *  the wet tiles round it, as the game's vertex averages its column's with its linked neighbours' (the texture's
 *  filtering then blends it across the tile as the triangles do). With `falls` (the water's surfaces), a fall's slope
 *  first takes the fall's outflow, as the game's FindBestProperties hands it on. Two a tile, x then y; zero where dry. */
export function gameFlowOf(W: number, H: number, out: ArrayLike<number>, depth: ArrayLike<number>, maxOutflow: number, falls?: Pick<SurfaceWater, "surface" | "depth">): Float32Array {
  let own = new Float32Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    if (!(depth[i] > SHALLOW)) continue;
    const o = i * 4;
    const x = (out[o + 3] - out[o + 1]) / maxOutflow;
    const y = (out[o + 2] - out[o]) / maxOutflow;
    if (x === x && y === y) {
      own[i * 2] = x;
      own[i * 2 + 1] = y;
    }
  }
  // (with `falls`, the water's surfaces: the water below a step takes the outflow of its highest neighbour over it by
  // saturate(the rise), as the game's FindBestProperties hands it on, so a fall's slope runs with the fall's current,
  // fallSlope.ts `handOver`)
  if (falls) {
    const handed = new Float32Array(W * H * 2);
    handOver(W, H, falls, own, handed, 2, false);
    own = handed;
  }
  const f = new Float32Array(W * H * 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(depth[i] > SHALLOW)) continue;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (!(depth[j] > SHALLOW)) continue;
          sx += own[j * 2];
          sy += own[j * 2 + 1];
          n++;
        }
      f[i * 2] = sx / n;
      f[i * 2 + 1] = sy / n;
    }
  return f;
}

/** The surface water's outflows as four a tile (zero where dry or where the view has none), for
 *  `currentOf`: made once a bake, not with every water update. */
export function outflowGrid(W: number, H: number, sw: SurfaceWater, into?: Float32Array): Float32Array | null {
  const o = sw.outflow;
  if (!o) return null;
  const out = into?.length === W * H * 4 ? into.fill(0) : new Float32Array(W * H * 4);
  const top = sw.top;
  for (let i = 0; i < W * H; i++) {
    const k = top[i];
    if (k < 0) continue;
    // (the four by hand: a view of them for each wet tile cost the page a millisecond or more a bake)
    out[i * 4] = o[k * 4];
    out[i * 4 + 1] = o[k * 4 + 1];
    out[i * 4 + 2] = o[k * 4 + 2];
    out[i * 4 + 3] = o[k * 4 + 3];
  }
  return out;
}

/** The surface water's current (two a tile; zero without outflows). */
export function surfaceCurrent(W: number, H: number, sw: SurfaceWater): Float32Array {
  const out = outflowGrid(W, H, sw);
  return out ? currentOf(W, H, out, sw.depth) : new Float32Array(W * H * 2);
}
