// Soil per run top (3D view, part 3; D126, D280 (2)): the tile data (light.ts `tileData`) holds one top per
// tile, so a cave's floor under a dry roof took the roof's moisture and contamination. Here every run top
// below its tile's top (a cave's floor, a ledge under an overhang, the map's floor under air) has its own:
// two bytes a cell, W × H × RUN_LEVELS cells (x fastest, then y, then the level), a 3D texture the terrain
// shader reads with `texelFetch` at the floor's own tile and level (materials.ts `runAt`):
// - R, the run top's soil as the tile data's G (light.ts `soilNibbles`: moisture above contamination);
// - G, RUN_TOP where a run top is (dry), RUN_WET where water stands on it; 0 everywhere else.
// The soil is the worker's (model.ts `SoilView.runs`: the file's own per run, as the export keeps it,
// which is the game's soil on that water, sim/soil3d.ts); the water is the view's own column on the floor.
//
// The shader's rule (mirrored by `runSoilAt` for the tests): a top face below its tile's top takes its
// level's cell where it holds a run top, blending toward neighbours with a run top at the same level, as a
// tile's top blends toward neighbours of the same height; anywhere else (a cap at a layer cut, a map
// without terrain above terrain) nothing changes. A map without runs below a top has no texture at all and
// the shader's branch is not compiled (`RUN_SOIL`). A change of soil or water rewrites only the cells that
// changed and gives their box (`refresh`), which goes to the GPU by itself (rowUploads.ts `BoxUploads`).
// Pure TypeScript.

import { soilNibbles } from "./light";
import { LAYERS, WET, type RunSoilView, type WaterView } from "./model";

/** Levels in the texture: a run top below its tile's top is at most level 22. */
export const RUN_LEVELS = LAYERS;
/** G: a run top here, dry; a run top with water standing on it. */
export const RUN_TOP = 1;
export const RUN_WET = 2;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export class RunSoil {
  readonly W: number;
  readonly H: number;
  readonly D = RUN_LEVELS;
  /** RG bytes per cell (the texture's data). */
  readonly data: Uint8Array;
  /** The cells written now (level·N + tile). */
  private cells = new Set<number>();
  /** Scratch: 1 on the tiles with run tops, while a refresh reads the water. */
  private tiles: Uint8Array | null = null;

  private constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.data = new Uint8Array(W * H * RUN_LEVELS * 2);
  }

  /** The run tops of a map's soil, with the water on them; null when the soil has none (every map without
   *  terrain above terrain). */
  static build(W: number, H: number, runs: RunSoilView | null, water: WaterView | null): RunSoil | null {
    if (!runs?.tile.length) return null;
    const r = new RunSoil(W, H);
    r.refresh(runs, water);
    return r;
  }

  /** The run tops `runs` and the water on them in place of what was written: the box of the tiles whose cells
   *  changed, or null when none did. */
  refresh(runs: RunSoilView | null, water: WaterView | null): Rect | null {
    const { W, data } = this;
    const N = W * this.H;
    let box: Rect | null = null;
    const grow = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      if (!box) box = { x0: x, y0: y, x1: x, y1: y };
      else {
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
      }
    };
    const now = new Set<number>();
    if (runs) {
      // the water standing on a run top: a column of the view whose floor is that level
      const wet = new Set<number>();
      if (water?.count) {
        const tiles = (this.tiles ??= new Uint8Array(N));
        for (let r = 0; r < runs.tile.length; r++) tiles[runs.tile[r]] = 1;
        for (let k = 0; k < water.count; k++) {
          const i = water.tile[k];
          if (!tiles[i] || !(water.depth[k] > WET)) continue;
          const z = Math.round(water.floor[k]);
          if (Math.abs(water.floor[k] - z) < 0.01 && z >= 0 && z < RUN_LEVELS) wet.add(z * N + i);
        }
        for (let r = 0; r < runs.tile.length; r++) tiles[runs.tile[r]] = 0;
      }
      for (let r = 0; r < runs.tile.length; r++) {
        const z = runs.level[r];
        if (z >= RUN_LEVELS) continue;
        const i = runs.tile[r];
        const cell = z * N + i;
        const soilByte = soilNibbles(runs.moisture[r], runs.contamination[r]);
        const g = wet.has(cell) ? RUN_WET : RUN_TOP;
        now.add(cell);
        if (data[cell * 2] !== soilByte || data[cell * 2 + 1] !== g) {
          data[cell * 2] = soilByte;
          data[cell * 2 + 1] = g;
          grow(i);
        }
      }
    }
    for (const cell of this.cells) {
      if (now.has(cell)) continue;
      data[cell * 2] = 0;
      data[cell * 2 + 1] = 0;
      grow(cell % N);
    }
    this.cells = now;
    return box;
  }
}

/** Whether a map's terrain needs the run texture: it has run tops below a tile's top whose soil the worker
 *  sent. Elsewhere the shader's branch is not compiled. */
export function runSoilOn(columns: number, runs: RunSoilView | null | undefined): boolean {
  return columns > 0 && !!runs?.tile.length;
}

/** What the terrain shader reads for a top face at level `z` of tile (x, y), below the tile's top, at the
 *  tile's middle (materials.ts, the floor's soil): the run top's own soil byte (the tile data's G form) and
 *  whether water stands on it, or null where no run top is there (the shader keeps the tile top's soil). */
export function runSoilAt(r: RunSoil | null, x: number, y: number, z: number): { soil: number; wet: boolean } | null {
  if (!r || x < 0 || y < 0 || x >= r.W || y >= r.H || z < 0 || z >= r.D) return null;
  const cell = z * r.W * r.H + y * r.W + x;
  const g = r.data[cell * 2 + 1];
  if (!g) return null;
  return { soil: r.data[cell * 2], wet: g === RUN_WET };
}
