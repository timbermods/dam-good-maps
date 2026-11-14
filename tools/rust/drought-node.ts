// The start's drought run of a premise map beside the map, in Node (worker_threads), for the tools that generate as
// the page does (tools/rust/page-path.ts): the browser's is src/worker/drought.worker.ts, the same loop. Its water on
// threads of its own where the budget it shares with the generating thread leaves them.

import { parentPort, Worker, workerData } from "node:worker_threads";
import { installParallelWater, shareWaterBudget, withSmallMapThreads } from "../../src/core/sim/parallel";
import { TICKS_PER_DAY } from "../../src/core/sim/water";
import { HazardRun } from "../../src/core/sim/weather";
import type { DroughtDay, DroughtJob } from "../../src/worker/drought.worker";

const { budget, threads } = workerData as { budget: SharedArrayBuffer; threads: number };
shareWaterBudget(budget);
if (threads >= 2)
  installParallelWater({
    threads,
    spawn: () => {
      const w = new Worker(new URL("./water-strip-node.ts", import.meta.url));
      w.unref();
      return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() };
    },
  });

let current: { id: number; run: HazardRun; day: number; days: number } | null = null;

function end(): void {
  current?.run.dispose();
  current = null;
}

function day(): void {
  const c = current;
  if (!c) return;
  try {
    withSmallMapThreads(() => c.run.step(TICKS_PER_DAY));
  } catch (e) {
    end();
    parentPort!.postMessage({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  c.day++;
  const w = c.run.water();
  const depth = Float64Array.from(w.depth);
  const contamination = Float64Array.from(w.contamination);
  parentPort!.postMessage({ id: c.id, day: c.day, depth, contamination } satisfies DroughtDay, [depth.buffer, contamination.buffer]);
  if (c.day >= c.days) end();
  else setTimeout(day, 0);
}

parentPort!.on("message", (m: Exclude<DroughtJob, { kind: "pool" }>) => {
  if (m.kind === "stop") {
    if (current?.id === m.id) end();
    return;
  }
  end();
  current = { id: m.id, run: new HazardRun(m.model, { depth: m.depth, contamination: m.contamination, stack: null } as never, "drought", m.days), day: 0, days: m.days };
  setTimeout(day, 0);
});
