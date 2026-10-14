// The worker a hazard day's soil is worked out in (daySoil.ts): the session worker sends a day's water, this answers with the
// soil, so the session never waits behind a whole-map pass.

import { computeDaySoil, type SoilJob } from "./daySoil";

self.onmessage = (e: MessageEvent<{ id: number; job: SoilJob }>) => {
  const { id, job } = e.data;
  const soil = computeDaySoil(job);
  (self as unknown as Worker).postMessage({ id, soil }, [soil.moisture.buffer, soil.contamination.buffer]);
};
