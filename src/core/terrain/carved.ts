// The voxels Erode leaves (D281; forces/erode.ts): a force's result that writes runs, not only
// levels. Its operation keeps, for each tile whose voxels it changed below the surface, the tile's
// whole mask (`ForceResultParams.runs`); the build applies them in the log's order with the other
// edits (features/build.ts, step 6), and the map's terrain is its base with those masks laid over it,
// each tile's top run then reshaped to the surface the later edits gave it (`ColumnTerrain.withSurface`,
// D487: the brushes shape only a cave's top). Plain functions on plain data.

import { ColumnTerrain, maskPlain } from "./runs";

/** The masks the log's Erode results left: each tile's last, in the log's order; null when none did. */
export function carvedOf(sculpts: readonly { params: unknown }[]): Map<number, number> | null {
  let out: Map<number, number> | null = null;
  for (const s of sculpts) {
    const runs = (s.params as { runs?: { tiles: readonly number[]; masks: readonly number[] } }).runs;
    if (!runs) continue;
    out ??= new Map();
    for (let k = 0; k < runs.tiles.length; k++) out.set(runs.tiles[k], runs.masks[k]);
  }
  return out;
}

/** `base` with the carved masks laid over it (a fresh terrain), or `base` itself when there are none.
 *  A heightfield's base is its plain terrain of `heights`. */
export function withCarved(base: ColumnTerrain, carved: ReadonlyMap<number, number> | null): ColumnTerrain {
  if (!carved?.size) return base;
  const mask = base.mask.slice();
  for (const [i, m] of carved) if (i >= 0 && i < mask.length) mask[i] = m;
  return new ColumnTerrain(base.W, base.H, mask);
}

/** The carved tiles that are not plain (every one Erode leaves: its hollows are under a roof). */
export function carvedTiles(carved: ReadonlyMap<number, number> | null): number[] {
  if (!carved) return [];
  const out: number[] = [];
  for (const [i, m] of carved) if (!maskPlain(m)) out.push(i);
  return out.sort((a, b) => a - b);
}
