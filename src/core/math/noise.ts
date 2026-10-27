// Integer-hash value noise with a smoothstep fade (PLAN §2.1). Lattice values come from hashing
// the lattice coordinates, so the field depends only on (seed, x, y), not on evaluation order.

import { tileHash01 } from "./hash";

function lattice(seed: number, ix: number, iy: number): number {
  return tileHash01(seed, ix, iy) * 2 - 1;
}

/** Value noise in [-1, 1] with lattice spacing `cell` tiles. */
export function valueNoise(seed: number, x: number, y: number, cell: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = lattice(seed, ix, iy) * (1 - tx) + lattice(seed, ix + 1, iy) * tx;
  const b = lattice(seed, ix, iy + 1) * (1 - tx) + lattice(seed, ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

/** Fractal value noise: `octaves` layers, each at half the spacing and half the amplitude,
 *  normalised to [-1, 1] (the prototype's `value_noise`). */
export function fbm(seed: number, x: number, y: number, cell: number, octaves = 3): number {
  let out = 0;
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = Math.max(2, Math.floor(cell / (1 << o)));
    out += amp * valueNoise((seed + o * 0x9e3779b1) >>> 0, x, y, c);
    total += amp;
    amp *= 0.5;
  }
  return out / total;
}
