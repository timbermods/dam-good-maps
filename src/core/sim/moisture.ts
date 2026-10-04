// Soil moisture at steady state, the game's rules on a heightfield (notes/water_and_soil.md Q3;
// port of prototype/watersim.py `moisture`, which reproduces the game's saved moisture exactly).
// The build applies it to the canonical settle (sim/prefill.ts); validation to the same water.

import { MinHeap, N4 } from "../math/grid";

/** Cluster saturation of every wet tile: WN = 1 + wet 8-neighbours, sat = min(8, max(WN, max over
 *  4-neighbours of WN − 1)); 0 on dry tiles. */
export function clusterSaturation(wet: Uint8Array, W: number, H: number): Uint8Array {
  const wn = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!wet[i]) continue;
      let c = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H && wet[yy * W + xx]) c++;
        }
      }
      wn[i] = c;
    }
  }
  const sat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!wet[i]) continue;
      let best = wn[i];
      if (x > 0 && wn[i - 1] - 1 > best) best = wn[i - 1] - 1;
      if (x + 1 < W && wn[i + 1] - 1 > best) best = wn[i + 1] - 1;
      if (y > 0 && wn[i - W] - 1 > best) best = wn[i - W] - 1;
      if (y + 1 < H && wn[i + W] - 1 > best) best = wn[i + W] - 1;
      sat[i] = Math.min(8, best);
    }
  }
  return sat;
}

/** The game's evaporation modifier of a wet tile from its cluster saturation (1–8): t = 10 − sat,
 *  0.0595·t² + 0.101·t + 0.72 (a dry tile's is 1). The simulation (water.ts), the file's
 *  `EvaporationModifiers` (format/world.ts), drought (drought.ts) and a Fill's days (fill.ts) all
 *  read it from here. */
export function evapModifier(sat: number): number {
  const t = 10 - sat;
  return 0.0595 * (t * t) + 0.101 * t + 0.72;
}

/** Steady-state moisture per tile. `depth` > 0 marks water; `contamination` 0–1 per tile.
 *  Clean water gets 2·sat; a tile beside water gets range − 6·(levels above the ceiled water
 *  surface); spreading costs 1 orthogonal, √2 diagonal and 6 per level climbed. `barrier` tiles
 *  (Thorns: BlockFullMoisture) stay at 0 and pass nothing on. */
export function moisture(
  floor: Uint8Array,
  depth: ArrayLike<number>,
  contamination: ArrayLike<number>,
  W: number,
  H: number,
  barrier?: Uint8Array | null,
): Float64Array {
  const wet = new Uint8Array(W * H);
  for (let i = 0; i < wet.length; i++) wet[i] = depth[i] > 0 ? 1 : 0;
  const sat = clusterSaturation(wet, W, H);
  const range = new Float64Array(W * H);
  const surfCeil = new Int32Array(W * H);
  for (let i = 0; i < wet.length; i++) {
    const c = contamination[i];
    const r = 2 * sat[i];
    range[i] = c >= 0.01 ? Math.floor(r * Math.min(1, Math.max(0, 1 - c / 0.53))) : r;
    surfCeil[i] = Math.ceil(floor[i] + depth[i] - 1e-9);
  }
  const M = new Float64Array(W * H);
  const fixed = new Uint8Array(W * H);
  const heap = new MinHeap();
  for (let i = 0; i < wet.length; i++) {
    if (wet[i] && contamination[i] <= 0.01) {
      M[i] = 2 * sat[i];
      fixed[i] = 1;
    }
  }
  if (barrier) {
    for (let i = 0; i < wet.length; i++) {
      if (barrier[i]) {
        M[i] = 0;
        fixed[i] = 1;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (fixed[i]) {
        if (M[i] > 0) heap.push(-M[i], i);
        continue;
      }
      let best = 0;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        if (!wet[j]) continue;
        const v = range[j] - 6 * Math.max(0, floor[i] - surfCeil[j]);
        if (v > best) best = v;
      }
      if (best > 0) {
        M[i] = best;
        heap.push(-best, i);
      }
    }
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const m = -heap.lastKey;
    if (m < M[i] - 1e-9) continue;
    const x = i % W;
    const y = (i - x) / W;
    const climbBase = floor[i] + Math.ceil(depth[i] - 1e-9);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
        const j = yy * W + xx;
        if (fixed[j]) continue;
        const cost = dx && dy ? Math.SQRT2 : 1;
        const climb = Math.max(0, floor[j] - climbBase);
        const v = m - cost - 6 * climb;
        if (v > M[j] + 1e-9) {
          M[j] = v;
          heap.push(-v, j);
        }
      }
    }
  }
  const out = new Float64Array(W * H);
  for (let i = 0; i < out.length; i++) {
    let v = M[i] * (wet[i] ? 1 - contamination[i] : 1);
    if (v < 0.01) v = 0;
    out[i] = v;
  }
  return out;
}
