// The water's current, as the moving water and the Flow view read it (investigation/flow-arrows, D353):
// the settle's own outflows (`WaterSim.out`, four a tile in the simulation's order −y, −x, +y, +x, already
// a rate: the simulation multiplies by its time step), net across each face, averaged over the tile's two
// opposite faces and divided by the water's depth. It is the simulation's balanced momentum, not an exact
// transport flux, and there is no estimate from the surface's slope: water without outflows is still.
// Made in the water worker for every view it sends (a few operations a wet tile); only drawn, never fed
// back into the water, a map or an operation.

import type { WaterView } from "./model";

/** Below this depth a column has no current (a film of water). */
const SHALLOW = 0.001;

/** The current at each column of `view` (x then y, tiles a second, x east and y toward increasing
 *  rows), from the outflows `out` (four a tile) of the map the view shows; undefined without them. */
export function currentOf(view: WaterView, W: number, H: number, out: ArrayLike<number> | null | undefined): Float32Array | undefined {
  if (!out || out.length !== W * H * 4) return undefined;
  const c = new Float32Array(view.count * 2);
  for (let k = 0; k < view.count; k++) {
    const d = view.depth[k];
    if (!(d > SHALLOW)) continue;
    const i = view.tile[k];
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
      c[k * 2] = vx;
      c[k * 2 + 1] = vy;
    }
  }
  return c;
}
