// The brush step's strokes over a patch of ground (live editing's brushes, D182), shared by the
// brush step and by find_sites, which digs a lake's hollow on a copy of the ground to measure it.

import type { MapSession } from "../../../src/core/doc/session";
import { entityTiles } from "../../../src/core/features/edits";
import { BRUSH_MAX_LEVEL, MAX_DABS, type BrushParams, type BrushTool } from "../../../src/core/features/raster/brush";

/** Each tile's distance in from the place's edge (4 neighbours; 1 on the edge), the map's edge
 *  counting as outside: the brush's own edge rule. */
export function inwardDistance(mask: Uint8Array, W: number, H: number): Uint16Array {
  const d = new Uint16Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      d[i] = 1 + Math.min(x > 0 ? d[i - 1] : 0, y > 0 ? d[i - W] : 0);
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], 1 + (x < W - 1 ? d[i + 1] : 0), 1 + (y < H - 1 ? d[i + W] : 0));
    }
  return d;
}

export interface PatchBrush {
  tool: BrushTool;
  /** Levels (raise, lower). */
  amount: number;
  /** Flatten's level. */
  level?: number;
  /** Every tile the full amount (the brushes' own edge slopes a level a tile). */
  cliff?: boolean;
  /** Smooth and naturalize. */
  passes: number;
  /** Naturalize's noise. */
  seed?: number;
}

/** The strokes that paint a patch (`tiles`, the tiles of `mask`): a dab on the middle of each tile,
 *  with the smallest brush, so it paints exactly the patch. Raise, lower and flatten stroke once
 *  per level over the patch worn in a tile each time, which gives exactly what one wide stroke
 *  gives, its edge sloping a level a tile; smooth and naturalize stroke once per pass. A pass over
 *  a big patch is split into strokes of at most MAX_DABS dabs. */
export function patchStrokes(pre: Uint8Array, mask: Uint8Array, tiles: readonly number[], W: number, H: number, b: PatchBrush): { strokes: BrushParams[]; inward: Uint16Array | null } {
  const { tool, amount, level, cliff, seed } = b;
  const pointwise = tool === "raise" || tool === "lower" || tool === "flatten";
  const inward = pointwise && !cliff ? inwardDistance(mask, W, H) : null;
  const moves = (i: number, k: number): boolean => {
    if (!pointwise) return true;
    if (inward && inward[i] <= k) return false;
    if (tool === "raise") return k < amount && pre[i] + k < BRUSH_MAX_LEVEL;
    if (tool === "lower") return k < amount && pre[i] - k > 0;
    return Math.abs(pre[i] - level!) > k;
  };
  const passes = pointwise ? (tool === "flatten" ? BRUSH_MAX_LEVEL : amount) : b.passes;
  const strokes: BrushParams[] = [];
  for (let k = 0; k < passes; k++) {
    const dabs: number[] = [];
    for (const i of tiles) if (moves(i, k)) dabs.push(4 * (i % W) + 2, 4 * Math.floor(i / W) + 2);
    if (!dabs.length) break;
    for (let a = 0; a < dabs.length; a += 2 * MAX_DABS)
      strokes.push({ tool, size: 0.5, strength: 5, ...(level !== undefined ? { level } : {}), ...(seed !== undefined ? { seed } : {}), layer: "top", dabs: dabs.slice(a, a + 2 * MAX_DABS) });
  }
  return { strokes, inward };
}

/** The tiles within `margin` of a map object the rules keep off water (relics, geothermal fields,
 *  mine sites: `extras.placement` wants no water within 2 tiles of them). A pond keeps off them. */
export function nearExtras(s: MapSession, margin: number): Uint8Array {
  const { x: W, y: H } = s.size;
  const out = new Uint8Array(W * H);
  const owners = new Set(s.features.filter((f) => f.kind === "mapObject").map((f) => f.id));
  for (const e of s.built.entities) {
    if (!owners.has(e.owner)) continue;
    for (const [x, y] of entityTiles(e))
      for (let dy = -margin; dy <= margin; dy++)
        for (let dx = -margin; dx <= margin; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
        }
  }
  return out;
}
