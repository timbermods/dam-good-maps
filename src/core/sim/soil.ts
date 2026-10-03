// The soil of a heightfield map by the game's own rules (PLAN §20 D298, D308): moisture and
// contamination at the steady state the game stores, from `sim/soil3d.ts`'s "game" mode on one run
// per tile (the module the 3D engine built, kept identical on both branches), or its "port" mode,
// which gives sim/moisture.ts's and sim/contamination.ts's numbers bit for bit (those approximate
// the game: moisture leaked through a badwater stream to the land beyond it). The build and both
// validators take it (prototype/soil.py is the Python validator's port); `DEFAULT_SOIL_RULES` says
// which rules a caller gets when it does not ask, as the water's rules do (sim/water.ts). The
// settler's first guess, on water the hydrology only planned, keeps the fast approximation.

import { heightMasks, waterColumns } from "./columns";
import { columnSaturation, soil3d } from "./soil3d";
import type { MapObject } from "./model";

/** Which soil rules: the game's (D298), or the port's (sim/moisture.ts's and sim/contamination.ts's
 *  numbers, bit for bit). */
export type SoilRules = "game" | "port";

/** The rules a caller gets when it does not ask: the game's, since M9b's switch (D298, D308). */
export const DEFAULT_SOIL_RULES: SoilRules = "game";

/** A process-wide override of the default, for comparing maps under both rules in one process
 *  (tools only: tools/soil-compare.ts). */
export const SOIL_MODE: { mode: SoilRules | null } = { mode: null };

export interface Soil {
  moisture: Float64Array;
  contamination: Float64Array;
}

/** The soil on a heightfield: `depth` and `contamination` per tile (a settle's), `sat` its cluster
 *  saturation (computed when absent), the map's objects (Thorns bar the soil; a Blockage lifts its
 *  tile's water above the ground), and the rules (the default when absent). */
export function gameSoil(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, contamination: ArrayLike<number>, objects: readonly MapObject[], sat?: Uint8Array, rules?: SoilRules): Soil {
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
  const out = soil3d(masks, wc, { depth: d, contamination: c, sat: s ?? columnSaturation(wc, d) }, objects, rules ?? SOIL_MODE.mode ?? DEFAULT_SOIL_RULES);
  // one run per tile: the first N values are the tiles'
  return { moisture: out.moisture.length === N ? out.moisture : out.moisture.slice(0, N), contamination: out.contamination.length === N ? out.contamination : out.contamination.slice(0, N) };
}
