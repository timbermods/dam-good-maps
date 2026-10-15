// The worker a hazard day's soil is worked out in (daySoil.ts): the session worker sends the run's map once (`base`, under a
// `baseId`) and then each day's water, and this answers with the soil, so the session never waits behind a whole-map pass.

import { computeDaySoil, type SoilBase } from "./daySoil";

let base: { id: number; base: SoilBase } | null = null;

self.onmessage = (e: MessageEvent<{ id: number; baseId: number; base?: SoilBase; depth: Float64Array; contamination: Float64Array }>) => {
  const { id, baseId, depth, contamination } = e.data;
  if (e.data.base) base = { id: baseId, base: e.data.base };
  if (!base || base.id !== baseId) return void (self as unknown as Worker).postMessage({ id, error: "no map for this soil" });
  const soil = computeDaySoil({ base: base.base, depth, contamination });
  (self as unknown as Worker).postMessage({ id, soil }, [soil.moisture.buffer, soil.contamination.buffer]);
};
