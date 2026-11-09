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
 *  badwater is drawn with the water it came with, never a bake behind it: a wet tile's B its own share (handed over
 *  down a fall, fallSlope.ts `handOver`) and its A at
 *  least 1 (its waterfall mask, the bake's, kept), a dry tile's A 0 (its B, the bake's carry for the ground under a film,
 *  kept). The bake's own bytes for the same water are the same. The rows that changed (y0…y1), or null. */
export function writeShare(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth" | "contamination">, data: Uint8Array): { y0: number; y1: number } | null {
  const { surface, depth, contamination } = sw;
  let y0 = H;
  let y1 = -1;
  // (one pass a water change on the page's thread, so plain arithmetic: shareByte inlined. The hand-over changes a
  // share only where some water within a row has badwater, so the rows with none round them take their own shares as
  // they are; elsewhere the surfaces round each tile are carried along the row, three read a tile, NaN where dry or off
  // the map, which fails every comparison)
  const bad = (y: number): boolean => {
    if (y >= H) return false;
    for (let i = y * W, end = i + W; i < end; i++) if (contamination[i] > 0) return true;
    return false;
  };
  let badBelow = false;
  let badHere = bad(0);
  for (let y = 0; y < H; y++) {
    let changed = false;
    const badAbove = bad(y + 1);
    const plain = !badBelow && !badHere && !badAbove;
    badBelow = badHere;
    badHere = badAbove;
    if (plain) {
      for (let i = y * W, k = i * 4 + 2, end = i + W; i < end; i++, k += 4) {
        const s = surface[i];
        if (s === s && depth[i] > 0) {
          const c = contamination[i];
          const b = c > 0 ? (c < 1 ? (c * 255 + 0.5) | 0 : 255) : 0;
          if (data[k] === b && data[k + 1] !== 0) continue;
          data[k] = b;
          if (data[k + 1] === 0) data[k + 1] = 1;
        } else {
          if (data[k + 1] === 0) continue;
          data[k + 1] = 0;
        }
        changed = true;
      }
      if (changed) {
        if (y < y0) y0 = y;
        y1 = y;
      }
      continue;
    }
    const up = y + 1 < H;
    const down = y > 0;
    const r = y * W;
    let sW = NaN;
    let sC = surface[r];
    let sNW = NaN;
    let sN = up ? surface[r + W] : NaN;
    let sSW = NaN;
    let sS = down ? surface[r - W] : NaN;
    let sE = NaN;
    let sNE = NaN;
    let sSE = NaN;
    for (let i = r, k = i * 4 + 2, end = i + W; i < end; i++, k += 4, sW = sC, sC = sE, sNW = sN, sN = sNE, sSW = sS, sS = sSE) {
      const last = i + 1 === end;
      sE = last ? NaN : surface[i + 1];
      sNE = up && !last ? surface[i + W + 1] : NaN;
      sSE = down && !last ? surface[i - W + 1] : NaN;
      const s = sC;
      if (s === s && depth[i] > 0) {
        let c = contamination[i];
        // a fall's slope and the water below it take the share of their highest linked neighbour over them, by
        // saturate(the rise), as the game's FindBestProperties hands it (fallSlope.ts `handOver`, the same order and
        // ties, rounded as its Float32Array is): edges, then the corners linked across two wet tiles
        let best = s;
        let from = -1;
        if (sE > best && depth[i + 1] > 0) {
          best = sE;
          from = i + 1;
        }
        if (sW > best && depth[i - 1] > 0) {
          best = sW;
          from = i - 1;
        }
        if (sN > best && depth[i + W] > 0) {
          best = sN;
          from = i + W;
        }
        if (sS > best && depth[i - W] > 0) {
          best = sS;
          from = i - W;
        }
        if (sSW > best && depth[i - W - 1] > 0 && sW === sW && depth[i - 1] > 0 && sS === sS && depth[i - W] > 0) {
          best = sSW;
          from = i - W - 1;
        }
        if (sSE > best && depth[i - W + 1] > 0 && sE === sE && depth[i + 1] > 0 && sS === sS && depth[i - W] > 0) {
          best = sSE;
          from = i - W + 1;
        }
        if (sNW > best && depth[i + W - 1] > 0 && sW === sW && depth[i - 1] > 0 && sN === sN && depth[i + W] > 0) {
          best = sNW;
          from = i + W - 1;
        }
        if (sNE > best && depth[i + W + 1] > 0 && sE === sE && depth[i + 1] > 0 && sN === sN && depth[i + W] > 0) {
          best = sNE;
          from = i + W + 1;
        }
        if (from >= 0) c = Math.fround(c + Math.min(1, best - s) * (contamination[from] - c));
        const b = c > 0 ? (c < 1 ? (c * 255 + 0.5) | 0 : 255) : 0;
        if (data[k] === b && data[k + 1] !== 0) continue;
        data[k] = b;
        if (data[k + 1] === 0) data[k + 1] = 1;
      } else {
        if (data[k + 1] === 0) continue;
        data[k + 1] = 0;
      }
      changed = true;
    }
    if (changed) {
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return y1 < 0 ? null : { y0, y1 };
}
