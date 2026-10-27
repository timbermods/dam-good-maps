// Holding a value to a range, the one copy the land and the water use (the forces keep theirs,
// `forces/random.ts` `clamp`, which answers differently when the range is empty: there `lo` wins).

/** `v` held to [lo, hi]: `lo` below it, `hi` above it, `v` itself otherwise (NaN stays NaN). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smoothstep on [0, 1]: 0 at or below 0, 1 at or above 1, 3t² − 2t³ between. */
export function smoothstep(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
