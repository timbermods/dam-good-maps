// The water's outflows and current, as the moving water, the Flow view and the falls read them
// (investigation/flow-arrows, D353; the outflows rather than the current since Kyler's yes on
// 2026-10-02):
// - the water worker sends, with every water view, the settle's own outflows of each column (four, in
//   the simulation's order −y, −x, +y, +x, already a rate: the simulation multiplies by its time step):
//   `outflowsOf`, a copy of four numbers a wet column, handed to the page with the view's other arrays;
// - the renderer works out the current from them (`currentOf`): each face's net flow, averaged over the
//   tile's two opposite faces and divided by the water's depth. It is the simulation's balanced
//   momentum, not an exact transport flux, and there is no estimate from the surface's slope: water
//   without outflows is still;
// - a fall's lip pours the simulation's own outflow over that side (falls.ts `lipOutflow`).
// Only drawn, never fed back into the water, a map or an operation.

import type { WaterView } from "./model";

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
