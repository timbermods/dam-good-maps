// Deterministic numbers (the forces core's integer mixers, src/core/forces/random.ts on
// feature/forces): the same value on every machine and at every pace.

export function hash(seed: number, k: number): number {
  let x = Math.imul((seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0, 0x85ebca6b);
  x ^= x >>> 13;
  return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296;
}

/** A number in [0, 1) for a lattice point. */
export function hash3(seed: number, x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth 3D value noise in [0, 1), with lattice spacing `scale`. */
export function noise3(seed: number, x: number, y: number, z: number, scale: number): number {
  const fx = x / scale, fy = y / scale, fz = z / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const u = fade(fx - x0), v = fade(fy - y0), w = fade(fz - z0);
  const c000 = hash3(seed, x0, y0, z0), c100 = hash3(seed, x0 + 1, y0, z0);
  const c010 = hash3(seed, x0, y0 + 1, z0), c110 = hash3(seed, x0 + 1, y0 + 1, z0);
  const c001 = hash3(seed, x0, y0, z0 + 1), c101 = hash3(seed, x0 + 1, y0, z0 + 1);
  const c011 = hash3(seed, x0, y0 + 1, z0 + 1), c111 = hash3(seed, x0 + 1, y0 + 1, z0 + 1);
  const a = c000 + (c100 - c000) * u;
  const b = c010 + (c110 - c010) * u;
  const d = c001 + (c101 - c001) * u;
  const e = c011 + (c111 - c011) * u;
  const lo = a + (b - a) * v;
  return lo + (d + (e - d) * v - lo) * w;
}

/** The map's hidden rock, as the forces core derives it (`geology`): 23 horizontal beds, every
 *  fourth one hard, fixed by the map as it was opened. */
export function geology(h: ArrayLike<number>): number[] {
  let s = 2166136261;
  for (let i = 0; i < h.length; i++) s = Math.imul(s ^ h[i], 16777619);
  s >>>= 0;
  return Array.from({ length: 23 }, (_, z) => ((z + (s % 4)) % 4 === 0 ? 1 : 0));
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const smooth = (v: number) => {
  v = clamp(v, 0, 1);
  return v * v * (3 - 2 * v);
};
