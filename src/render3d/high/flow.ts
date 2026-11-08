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

/** Whether a tile holds water, as the flow texture's A has it (fallMask.ts `fallBytes`: 0 dry, 1 or more wet). */
const wet = (sw: Pick<SurfaceWater, "surface" | "depth">, i: number) => sw.surface[i] === sw.surface[i] && sw.depth[i] > 0;

/** A share as the flow texture's B byte. */
export const shareByte = (c: number) => Math.round(Math.max(0, Math.min(1, c || 0)) * 255);

/** Each tile's badwater share, carried a tile into dry ground (the mean of the water round it) for the ground under a
 *  film, which reads the texture through its filter. The water's own shaders leave a dry tile out, as the game's blend
 *  leaves out a column with no water (Q9 P9: its four taps weighted by the texture's A, `waterShareFrom`). No smoothing
 *  of its own: the shaders blend it between tiles as the game does, about a tile wide (waterPalette.ts `gameShareAt`;
 *  D154 as amended 2026-11-08, its "soft gradient over several tiles" gone). */
export function surfaceContamination(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">): Float32Array {
  const field = sw.contamination.slice();
  for (let i = 0; i < field.length; i++) if (!(field[i] === field[i])) field[i] = 0;
  const out = field.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (wet(sw, i)) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (wet(sw, j)) {
            sum += field[j];
            count++;
          }
        }
      if (count) out[i] = sum / count;
    }
  return out;
}

/** The water's share and wetness into a flow texture's bytes (RGBA, a texel a tile) at once, on the page's thread, so
 *  badwater is drawn with the water it came with, never a bake behind it: a wet tile's B its own share and its A at
 *  least 1 (its waterfall mask, the bake's, kept), a dry tile's A 0 (its B, the bake's carry for the ground under a film,
 *  kept). The bake's own bytes for the same water are the same. The rows that changed (y0…y1), or null. */
export function writeShare(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">, data: Uint8Array): { y0: number; y1: number } | null {
  let y0 = H;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let i = y * W, end = i + W; i < end; i++) {
      const k = i * 4;
      if (wet(sw, i)) {
        const b = shareByte(sw.contamination[i]);
        if (data[k + 2] === b && data[k + 3] !== 0) continue;
        data[k + 2] = b;
        if (data[k + 3] === 0) data[k + 3] = 1;
      } else {
        if (data[k + 3] === 0) continue;
        data[k + 3] = 0;
      }
      if (y < y0) y0 = y;
      y1 = y;
    }
  return y1 < 0 ? null : { y0, y1 };
}
