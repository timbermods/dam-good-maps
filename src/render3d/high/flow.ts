// The water's flow and contamination as the looks read them (#38, investigation/maplook2 flow.ts; #67
// river.ts), from the water the view shows:
// - the flow: the settle's own outflows (current.ts, D353), carried with every water view; bake.ts packs
//   them as the game's flow (`gameFlowOf`). It moves the water's surface and the moving water's foam
//   and the Flow view; nothing plays by it. (Until D353 it was estimated from the water's surface:
//   decisions-pending #111.)
// - the contamination, smoothed through neighbouring water on the same surface only (never across
//   a fall or dry ground), so a front is soft over a few tiles.
// Plain arrays, no three.js: bake.ts packs them into textures' data, in a worker.

import type { SurfaceWater } from "../model";

const WET = 0.001;
/** Neighbours on the same surface: a step larger than this is a fall. */
const SAME = 0.35;

/** The contamination, smoothed twice through adjacent water on the same surface, and carried a
 *  tile into dry ground so filtering never shows a false clean rim along a badwater bank. */
export function surfaceContamination(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">): Float32Array {
  let field = sw.contamination.slice();
  for (let i = 0; i < field.length; i++) if (!(field[i] === field[i])) field[i] = 0;
  const { depth, surface } = sw;
  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!(depth[i] > WET)) continue;
        let sum = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!(depth[j] > WET) || Math.abs(surface[j] - surface[i]) > SAME) continue;
            if (dx && dy && (!(depth[y * W + xx] > WET) || !(depth[yy * W + x] > WET))) continue;
            const wgt = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            sum += field[j] * wgt;
            weight += wgt;
          }
        next[i] = sum / weight;
      }
    field = next;
  }
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
