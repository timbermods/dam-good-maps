// A hazard day's soil, worked out off the session worker (the Weather view's visible seasons, D250): the core's moisture and
// contamination rules over the whole map are one synchronous pass, about 35 ms on a 256² map (9 to 208), so the session
// never does them itself: it sends the day's water and gets the soil back (daySoil.worker.ts), or runs this inline where
// there is no worker to send it to (Node, the tests).

import { soilContamination } from "../core/sim/contamination";
import { moisture } from "../core/sim/moisture";
import { soilView, type SoilView } from "../render3d/model";

/** What the day's soil is worked out from: the ground, the day's water, and the tiles Thorns shield. */
export interface SoilJob {
  heights: Uint8Array;
  depth: Float64Array;
  contamination: Float64Array;
  barrier: Uint8Array | null;
  W: number;
  H: number;
}

/** Runs a job somewhere that does not hold the session worker. */
export type SoilRunner = (job: SoilJob) => Promise<SoilView>;

/** The soil as the view holds it (bytes), exactly as the page's own held day computed it. */
export function computeDaySoil(j: SoilJob): SoilView {
  return soilView(moisture(j.heights, j.depth, j.contamination, j.W, j.H, j.barrier), soilContamination(j.heights, j.depth, j.contamination, j.W, j.H, j.barrier));
}
