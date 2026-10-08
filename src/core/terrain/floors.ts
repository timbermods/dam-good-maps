// The floor graph (D122; investigation/terrain3d/GAME_RULES.md §4): where beavers can stand, and what they
// reach on foot. A floor is air on solid ground (or on the map's bottom), at any level of a tile: the open
// surface, a cave's floor, a ledge, the top of an arch. There is no headroom rule. Floors of neighbouring
// tiles join only at the same level; levels are joined only by the map's Slope objects, each from its own
// tile at its level to the floor one level up on its high side, and by the stairs a player builds, which no
// map holds. An area is the floors one can walk between.
//
// Exact computation, so it runs in Rust (rust/checks/src/floors.rs, D381), bound by validate/rust.ts; this
// is its plain face. The checks' `walk.levels` row reads the same graph.

import { ORIENTATIONS, type Orientation } from "../format/footprints";
import { floorsInRust } from "../validate/rust";

/** A map's floors and the areas they make. */
export interface FloorGraph {
  W: number;
  H: number;
  /** Tile i's floors are `first[i]` up to `first[i + 1]`, bottom to top. */
  first: Uint32Array;
  /** Each floor's tile, its level, and its area (areas numbered in the order of each one's first floor). */
  tile: Int32Array;
  level: Uint8Array;
  area: Int32Array;
  /** How many areas. */
  areas: number;
}

/** The floors of a terrain given as a file holds it (`voxels[z·W·H + y·W + x]`, 1 solid;
 *  terrain/runs.ts `ColumnTerrain.voxels(layers)` gives one), joined by `slopes`. */
export function floorGraph(t: { W: number; H: number; layers: number; voxels: Uint8Array }, slopes: readonly { x: number; y: number; z: number; orientation: Orientation }[] = []): FloorGraph {
  const { W, H } = t;
  const quads = new Int32Array(slopes.length * 4);
  slopes.forEach((s, k) => quads.set([s.x, s.y, s.z, ORIENTATIONS.indexOf(s.orientation)], k * 4));
  const rows = floorsInRust(W, H, t.layers, t.voxels, quads);
  const n = rows.length / 3;
  const g: FloorGraph = { W, H, first: new Uint32Array(W * H + 1), tile: new Int32Array(n), level: new Uint8Array(n), area: new Int32Array(n), areas: 0 };
  for (let k = 0; k < n; k++) {
    g.tile[k] = rows[3 * k];
    g.level[k] = rows[3 * k + 1];
    g.area[k] = rows[3 * k + 2];
    g.first[g.tile[k] + 1] = k + 1;
    if (g.area[k] >= g.areas) g.areas = g.area[k] + 1;
  }
  // (every tile has a floor, so `first` is filled; kept safe for a tile without one)
  for (let i = 1; i <= W * H; i++) if (g.first[i] < g.first[i - 1]) g.first[i] = g.first[i - 1];
  return g;
}

/** The floor of tile (x, y) at level z, or −1 when the tile has no floor there. */
export function floorAt(g: FloorGraph, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || x >= g.W || y >= g.H) return -1;
  const i = y * g.W + x;
  for (let k = g.first[i]; k < g.first[i + 1]; k++) if (g.level[k] === z) return k;
  return -1;
}
