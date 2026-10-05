// The multi-core water in Node, for the identity checks only (tools/rust/water-identity.ts --threads): Node and
// the tools otherwise run the water on one thread (or natively). Each helper is a worker_threads Worker running
// tools/rust/water-strip-node.ts (under tsx, which the workers inherit from this process).

import { Worker } from "node:worker_threads";
import { installParallelWater, uninstallParallelWater } from "../../src/core/sim/parallel";

/** Runs WaterSim on `threads` threads (the coordinator's own included) at every map size from now on. */
export function installNodeThreads(threads: number): void {
  const url = new URL("./water-strip-node.ts", import.meta.url);
  const ok = installParallelWater({
    threads,
    spawn: () => {
      const w = new Worker(url);
      w.unref();
      return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() };
    },
  });
  if (!ok) throw new Error("the multi-core water could not start");
}

export { uninstallParallelWater };

/** Waits until every helper can run strips. */
export async function nodeThreadsReady(threads: number): Promise<void> {
  const { parallelWaterThreads } = await import("../../src/core/sim/parallel");
  for (let k = 0; parallelWaterThreads() < threads; k++) {
    if (k > 600) throw new Error("the multi-core water's helpers did not start");
    await new Promise((r) => setTimeout(r, 50));
  }
}
