// The forces' shared numbers (PLAN §20 D220, from investigation/forces-core `core/random.ts`): integer
// mixers that give the same value on every machine and at every pace, and the map's hidden rock.
// Nothing here depends on wall time, frames or effects.

/** A number in [0, 1) from a seed and a key: the same on every machine. */
export function hash(seed: number, k: number): number {
  let x = Math.imul((seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0, 0x85ebca6b);
  x ^= x >>> 13;
  return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296;
}

export function mixSeed(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return (n ^ (n >>> 15)) >>> 0;
}

/** A hash of a height field. */
export function terrainSeed(h: ArrayLike<number>): number {
  let s = 2166136261;
  for (let i = 0; i < h.length; i++) s = Math.imul(s ^ h[i], 16777619);
  return s >>> 0;
}

/** The map's hidden rock: 23 horizontal beds (one per level 0–22), every fourth one hard. It is
 *  derived once from the map as it was opened (never from a force's seed, and never again after an
 *  edit), so every force on a map meets the same rock. */
export function geology(h: ArrayLike<number>): number[] {
  const s = terrainSeed(h);
  return Array.from({ length: 23 }, (_, z) => ((z + (s % 4)) % 4 === 0 ? 1 : 0));
}

/** The next personality after `seed` (Try another). */
export const nextSeed = (seed: number) => (seed + 1) >>> 0;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Smoothstep on [0, 1]. */
export const smooth = (v: number) => {
  v = clamp(v, 0, 1);
  return v * v * (3 - 2 * v);
};
