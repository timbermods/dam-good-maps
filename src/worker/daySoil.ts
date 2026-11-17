// A hazard day's soil, worked out off the session worker (the Weather view's visible seasons, D250): the game's soil on the day's
// water (`gameSoil` over the map's objects: Thorns, soil per run top, the very rules the map's own soil is built with) is one
// whole-map pass, 150 to 350 ms on a 256² map, so the session never does it itself: it sends the day's water and gets the soil
// back (daySoil.worker.ts), or runs this inline where there is no worker to send it to (Node, the tests). On a map with caves
// or overhangs the day's water is every column's (the stacked engine's), and the soil is `stackedSoil`'s, each tile's top and
// every run top below it (`runs`), so a plant in a cave withers by its own ground (core/sim/withering.ts `plantGround`).

import { waterColumns } from "../core/sim/columns";
import { gameSoil, stackedSoil, topRuns, type StackSoilWater } from "../core/sim/soil";
import type { MapObject } from "../core/sim/model";
import { ColumnTerrain } from "../core/terrain/runs";
import { runSoilView, soilView, type SoilView } from "../render3d/model";

/** What the soil reads of the map and does not change from one day to the next: sent once per run, not per day. */
export interface SoilBase {
  W: number;
  H: number;
  heights: Uint8Array;
  objects: MapObject[];
  /** A map with caves or overhangs: its voxel masks (the stacked water model's) and its columns (tile → voxels, 1 solid), what
   *  its soil per run top is laid out by. */
  stacked?: { mask: Uint32Array; columns: Map<number, Uint8Array> };
}

/** One day: the map (`base`, the same object for every day of a run) and the day's water: per tile on a heightfield, every
 *  column's on a map with caves or overhangs (`stack`). */
export interface SoilJob {
  base: SoilBase;
  depth: Float64Array;
  contamination: Float64Array;
  stack?: StackSoilWater | null;
}

/** Runs a job somewhere that does not hold the session worker. */
export type SoilRunner = (job: SoilJob) => Promise<SoilView>;

/** The soil as the view holds it (bytes): the game's soil on that day's water. */
export function computeDaySoil(j: SoilJob): SoilView {
  const { W, H, heights, objects, stacked } = j.base;
  if (stacked && j.stack) {
    // (core/sim/weather.ts `hazardSoil` on every column's water, with every run top's, as the session's `withRuns` gives the
    // map's own)
    const t = new ColumnTerrain(W, H, stacked.mask);
    const s = stackedSoil(t, waterColumns(t, objects), j.stack, objects);
    const soil = soilView(topRuns(s, s.moisture), topRuns(s, s.contamination));
    if (stacked.columns.size) soil.runs = runSoilView(stacked.columns, W * H, { slots: s.runs.T, values: s.moisture }, { slots: s.runs.T, values: s.contamination });
    return soil;
  }
  const s = gameSoil(W, H, heights, j.depth, j.contamination, objects);
  return soilView(s.moisture, s.contamination);
}
