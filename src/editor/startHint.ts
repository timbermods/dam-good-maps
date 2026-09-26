// "The start fits here" (PLAN §20 D204 (4)): after a Flatten stroke, where the flat ground it made
// could take the district center. The page looks for a spot quietly, once the stroke is on the map
// and nothing else is going on; the start's own check (features.ts, `checkStartAt`) then says
// whether the start's requirements would hold there too (water, wood and berries in reach).

import { cornerFor } from "../core/doc/tools";
import { markBrushTiles, type BrushParams } from "../core/features/raster/brush";
import { startEntranceTile, type Orientation } from "../core/format/footprints";

/** Spots for the district center on a Flatten stroke's level ground, nearest the stroke's middle
 *  first: its 3 × 3 footprint on tiles the stroke went over, all at the stroke's level and dry, and
 *  the tile at its door at that level too. At most `max`, none within `away` tiles of `not` (where
 *  the start stands already). */
export function startSpots(
  p: Pick<BrushParams, "size" | "dabs" | "shape" | "precise" | "level">,
  heights: Uint8Array,
  depth: Float32Array,
  W: number,
  H: number,
  orientation: Orientation,
  not: { x: number; y: number } | null,
  max = 3,
  away = 4,
): { x: number; y: number }[] {
  const level = p.level;
  if (level === undefined) return [];
  const mask = new Uint8Array(W * H);
  markBrushTiles(p, W, H, mask);
  let sx = 0;
  let sy = 0;
  let n = 0;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    sx += x;
    sy += y;
    n++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (!n) return [];
  const flat = (i: number) => mask[i] === 1 && heights[i] === level && !(depth[i] > 0.05);
  const found: { x: number; y: number; d: number }[] = [];
  for (let y = Math.max(2, y0 + 1); y <= Math.min(H - 3, y1 - 1); y++)
    for (let x = Math.max(2, x0 + 1); x <= Math.min(W - 3, x1 - 1); x++) {
      if (not && Math.max(Math.abs(x - not.x), Math.abs(y - not.y)) < away) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) ok = flat((y + dy) * W + x + dx);
      if (!ok) continue;
      const [cx, cy] = cornerFor(x, y, orientation);
      const [ex, ey] = startEntranceTile(cx, cy, orientation);
      if (ex < 1 || ey < 1 || ex > W - 2 || ey > H - 2) continue;
      const door = ey * W + ex;
      if (heights[door] !== level || depth[door] > 0.05) continue;
      found.push({ x, y, d: (x - sx / n) ** 2 + (y - sy / n) ** 2 });
    }
  found.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  return found.slice(0, max).map(({ x, y }) => ({ x, y }));
}
