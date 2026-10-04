// The writer half of a real place's data (the product only reads it: src/core/places/place.ts `decodeHeights`,
// `decodeTiles`), for the tools that make place files.

/** Heights as the data stores them. */
export function encodeHeights(h: ArrayLike<number>): string {
  let s = "";
  for (let i = 0; i < h.length; i++) s += h[i].toString(36);
  return s;
}

/** Ascending tile indices as gaps, and back (`decodeTiles`, in src/core/places/place.ts). */
export function encodeTiles(tiles: readonly number[]): number[] {
  const sorted = [...tiles].sort((a, b) => a - b);
  return sorted.map((t, k) => (k ? t - sorted[k - 1] : t));
}
