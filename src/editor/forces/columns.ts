// A force that writes voxels under the surface (Erode, D281) sends each frame the tiles whose voxels changed since the
// last one (`ForceFrame.columns`); the renderer's `updateTerrain` takes the map's whole set of voxel columns. This adds
// a frame's tiles to the set held so far (plain data in, plain data out; tests/unit/forceColumns.test.ts).

import { LAYERS } from "../../core/format/world";
import type { MapView } from "../../render3d/model";

export type Columns = MapView["columns"];

/** `base` with the tiles of `changed` put in (a tile in both takes `changed`'s voxels), tiles ascending. */
export function mergeColumns(base: Columns, changed: Columns): Columns {
  const at = new Map<number, number>();
  for (let k = 0; k < base.tiles.length; k++) at.set(base.tiles[k], k);
  const tiles = Array.from(base.tiles);
  const voxels = Array.from({ length: base.tiles.length }, (_, k) => base.voxels.subarray(k * LAYERS, (k + 1) * LAYERS));
  for (let k = 0; k < changed.tiles.length; k++) {
    const mine = changed.voxels.subarray(k * LAYERS, (k + 1) * LAYERS);
    const had = at.get(changed.tiles[k]);
    if (had === undefined) {
      at.set(changed.tiles[k], tiles.length);
      tiles.push(changed.tiles[k]);
      voxels.push(mine);
    } else voxels[had] = mine;
  }
  const order = tiles.map((_, k) => k).sort((a, b) => tiles[a] - tiles[b]);
  const out = new Uint8Array(order.length * LAYERS);
  order.forEach((from, k) => out.set(voxels[from], k * LAYERS));
  return { tiles: Int32Array.from(order, (k) => tiles[k]), voxels: out };
}
