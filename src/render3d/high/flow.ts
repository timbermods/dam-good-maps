// The water's flow and contamination as the looks read them (#38, investigation/maplook2 flow.ts; #67
// river.ts), from the water the view shows:
// - the flow: the settle's own outflows (current.ts, D353), carried with every water view; bake.ts packs
//   them as the game's flow (`gameFlowOf`). It moves the water's surface and the moving water's foam
//   and the Flow view; nothing plays by it. (Until D353 it was estimated from the water's surface:
//   decisions-pending #111.)
// - the contamination, each tile's own share: the shaders blend it between tiles as the game's water shader blends its
//   per-column contamination, about a tile wide across a front (waterPalette.ts `gameShareAt`, D154 as amended).
// Plain arrays, no three.js: bake.ts packs them into textures' data, in a worker.

import type { SurfaceWater } from "../model";

const WET = 0.001;

/** Each tile's badwater share, carried a tile into dry ground (the mean of the water round it) so the texture's
 *  filtering never shows a false clean rim along a badwater bank: the game's blend leaves a column with no water out
 *  (Q9 P9). No smoothing of its own: the shaders blend it between tiles as the game does, about a tile wide
 *  (waterPalette.ts `gameShareAt`; D154 as amended 2026-11-08, its "soft gradient over several tiles" gone). */
export function surfaceContamination(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">): Float32Array {
  const field = sw.contamination.slice();
  for (let i = 0; i < field.length; i++) if (!(field[i] === field[i])) field[i] = 0;
  const { depth } = sw;
  const out = field.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (depth[i] > WET) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (depth[j] > WET) {
            sum += field[j];
            count++;
          }
        }
      if (count) out[i] = sum / count;
    }
  return out;
}
