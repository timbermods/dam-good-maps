// A hazard day's soil, worked out off the session worker (the Weather view's visible seasons, D250): the game's soil on the day's
// water (`gameSoil` over the map's objects: Thorns, soil per run top, the very rules the map's own soil is built with) is one
// whole-map pass, 150 to 350 ms on a 256² map, so the session never does it itself: it sends the day's water and gets the soil
// back (daySoil.worker.ts), or runs this inline where there is no worker to send it to (Node, the tests).

import { gameSoil } from "../core/sim/soil";
import type { MapObject } from "../core/sim/model";
import { soilView, type SoilView } from "../render3d/model";

/** What the soil reads of the map and does not change from one day to the next: sent once per run, not per day. */
export interface SoilBase {
  W: number;
  H: number;
  heights: Uint8Array;
  objects: MapObject[];
}

/** One day: the map (`base`, the same object for every day of a run) and the day's water. */
export interface SoilJob {
  base: SoilBase;
  depth: Float64Array;
  contamination: Float64Array;
}

/** Runs a job somewhere that does not hold the session worker. */
export type SoilRunner = (job: SoilJob) => Promise<SoilView>;

/** The soil as the view holds it (bytes): the game's soil on that day's water. */
export function computeDaySoil(j: SoilJob): SoilView {
  const { W, H, heights, objects } = j.base;
  const s = gameSoil(W, H, heights, j.depth, j.contamination, objects);
  return soilView(s.moisture, s.contamination);
}
