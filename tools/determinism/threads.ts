// The determinism check's threaded engines (`chromium-threads`, `firefox-threads`; run.ts): the same cases in a
// worker whose water runs on the multi-core path (src/core/sim/parallel.ts) at every map size, four threads,
// each helper a worker of strip.ts. Its rows must be the other engines' byte for byte.

import { installParallelWater, parallelWaterStats, parallelWaterThreads } from "../../src/core/sim/parallel";
import { runCase, type Case } from "./cases";

const THREADS = 4;
const started = installParallelWater({ threads: THREADS, spawn: () => new Worker("/strip.js", { type: "module" }) });

async function ready(): Promise<void> {
  if (!started || !(self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated) throw Error("the threaded engine needs a cross-origin isolated page");
  for (let k = 0; parallelWaterThreads() < THREADS; k++) {
    if (k > 600) throw Error("the water's helper threads did not start");
    await new Promise((r) => setTimeout(r, 50));
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; case: Case }>) => {
  const { id } = e.data;
  try {
    await ready();
    const rows = await runCase(e.data.case, (s) => self.postMessage({ id, progress: s }));
    self.postMessage({ id, rows, ticks: parallelWaterStats.ticks });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
