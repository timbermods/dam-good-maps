// The minimap's size on the page for a map of any shape (D357): the map's longer side is `SIZE` pixels and the shorter
// keeps the map's proportions, but never under `LEAST` pixels, so a strip such as 7x300 stays a picture to see and
// to click (at its exact proportions it would be 4 pixels wide).

/** The minimap's longer side, in pixels. */
export const MINIMAP_SIZE = 168;
/** The least its shorter side is, in pixels. */
export const MINIMAP_LEAST = 14;

export function minimapSize(W: number, H: number): { w: number; h: number } {
  const scale = MINIMAP_SIZE / Math.max(W, H);
  return { w: Math.max(MINIMAP_LEAST, Math.round(W * scale)), h: Math.max(MINIMAP_LEAST, Math.round(H * scale)) };
}
