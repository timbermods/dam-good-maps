// Where on the map an action was, in the few plain words a refusal uses ("in the north-east"). North is +y,
// as everywhere in the core (gen/names.ts). Worked out from the tiles an action wrote, or touched when it
// wrote none; a map-wide reach names no place.

import type { Mask } from "./mask";

export function placeWords(W: number, H: number, m: Mask): string {
  const n = m.size;
  if (!n || n === W * H) return "";
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (const i of m.tiles()) {
    const x = i % W;
    const y = Math.floor(i / W);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if ((x1 - x0 + 1) / W >= 0.6 && (y1 - y0 + 1) / H >= 0.6) return "across the map";
  const cx = (x0 + x1 + 1) / 2 / W;
  const cy = (y0 + y1 + 1) / 2 / H;
  const col = cx < 1 / 3 ? "west" : cx > 2 / 3 ? "east" : "";
  const row = cy < 1 / 3 ? "south" : cy > 2 / 3 ? "north" : "";
  const name = row && col ? `${row}-${col}` : row || col;
  return name ? `in the ${name}` : "in the middle";
}
