// The soil of a heightfield map by the game's own rules (PLAN §20 D298): moisture and contamination
// at the steady state the game stores, from `sim/soil3d.ts`'s "game" mode on one run per tile (the
// module the 3D engine built, kept identical on both branches). It replaces sim/moisture.ts and
// sim/contamination.ts wherever a map's soil is built or checked, since those approximate the game
// (moisture leaked through a badwater stream to the land beyond it): the build, both validators
// (prototype/soil.py is the Python validator's port), the Real places conversion and the editor's
// soil view. The settler's first guess, on water the hydrology only planned, keeps the fast
// approximation.

import { heightMasks, waterColumns } from "./columns";
import { columnSaturation, soil3d } from "./soil3d";
import type { MapObject } from "./model";

export interface Soil {
  moisture: Float64Array;
  contamination: Float64Array;
}

/** The game's soil on a heightfield: `depth` and `contamination` per tile (a settle's), `sat` its
 *  cluster saturation (computed when absent), and the map's objects (Thorns bar the soil; a
 *  Blockage lifts its tile's water above the ground). */
export function gameSoil(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, contamination: ArrayLike<number>, objects: readonly MapObject[], sat?: Uint8Array): Soil {
  const N = W * H;
  const masks = heightMasks(W, H, heights);
  const wc = waterColumns(masks, objects);
  // (water per column id: a tile with more than one column, under an overhang, holds none above)
  const M = wc.L * N;
  let d: ArrayLike<number> = depth;
  let c: ArrayLike<number> = contamination;
  if (M > N) {
    const dd = new Float64Array(M);
    const cc = new Float64Array(M);
    for (let i = 0; i < N; i++) {
      dd[i] = depth[i];
      cc[i] = contamination[i];
    }
    d = dd;
    c = cc;
  }
  let s = sat;
  if (s && M > N) {
    const ss = new Uint8Array(M);
    ss.set(s.subarray(0, N));
    s = ss;
  }
  const out = soil3d(masks, wc, { depth: d, contamination: c, sat: s ?? columnSaturation(wc, d) }, objects, "game");
  // one run per tile: the first N values are the tiles'
  return { moisture: out.moisture.length === N ? out.moisture : out.moisture.slice(0, N), contamination: out.contamination.length === N ? out.contamination : out.contamination.slice(0, N) };
}
