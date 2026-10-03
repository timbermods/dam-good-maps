// How far a mine site stands from the start, read one way by the pads, the room checks and the
// placement (#153, D342): the same octile transform as distanceFrom, from the start's 3×3 to the
// nearest tile of the site's 5×5 footprint, never the corner of its 7×7 ring.

/** The octile distance from the start's middle (sx, sy) to a site whose footprint's middle is (cx, cy). */
export function mineDistance(sx: number, sy: number, cx: number, cy: number): number {
  const dx = Math.max(0, Math.abs(cx - sx) - 3);
  const dy = Math.max(0, Math.abs(cy - sy) - 3);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** Nearest footprint tile, given its minimum corner and the start distance field. */
export function mineFootDistance(sd: ArrayLike<number>, W: number, x: number, y: number): number {
  let d = Infinity;
  for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) d = Math.min(d, sd[(y + dy) * W + x + dx]);
  return d;
}
