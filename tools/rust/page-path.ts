// The premise mode as the page's generator runs it, in Node, for the tools that time it (tools/premise-map.ts): the
// water on the threads the page gives it on this machine (`waterThreadBudget`, a budget shared with the drought as the
// page's workers share theirs, platform/index.ts) and the start's drought run beside the map in a worker of its own
// (`generatePremiseAsync`, worker/drought.worker.ts; here tools/rust/drought-node.ts). The same map, byte for byte,
// as on one thread (D455; tests/contract/premiseThreads.heavy.test.ts).

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { DroughtRunner } from "../../src/core/premise/generate";
import type { GateDay } from "../../src/core/premise/hold";
import { installParallelWater, parallelWaterThreads, shareWaterBudget, uninstallParallelWater } from "../../src/core/sim/parallel";
import { newWaterBudget, waterThreadBudget } from "../../src/core/sim/parallelPolicy";
import type { DroughtDay, DroughtJob } from "../../src/worker/drought.worker";

/** Starts the water's threads (the page's budget on this machine) and the drought's worker; resolves once the
 *  threads are ready, with the runner `generatePremiseAsync` takes, the threads' count and `close`, which ends them. */
export async function pagePath(): Promise<{ runner: DroughtRunner; threads: number; close(): Promise<void> }> {
  const threads = waterThreadBudget(availableParallelism());
  const budget = newWaterBudget(threads);
  shareWaterBudget(budget);
  if (threads >= 2) {
    const ok = installParallelWater({
      threads,
      spawn: () => {
        const w = new Worker(new URL("./water-strip-node.ts", import.meta.url));
        w.unref();
        return { postMessage: (m) => w.postMessage(m), terminate: () => void w.terminate() };
      },
    });
    if (!ok) throw new Error("the multi-core water could not start");
    for (let k = 0; parallelWaterThreads() < threads; k++) {
      if (k > 600) throw new Error("the multi-core water's helpers did not start");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  const worker = new Worker(new URL("./drought-node.ts", import.meta.url), { workerData: { budget, threads } });
  worker.unref();
  let ids = 0;
  let on = 0;
  const days = new Map<number, GateDay>();
  const waits = new Map<number, { done: (d: GateDay) => void; fail: (e: Error) => void }>();
  let broken: Error | null = null;
  const failAll = (e: Error) => {
    broken ??= e;
    for (const w of waits.values()) w.fail(broken);
    waits.clear();
  };
  worker.on("error", (e: Error) => failAll(e));
  worker.on("message", (d: DroughtDay | { id: number; error: string }) => {
    if ("error" in d) return failAll(new Error(`the drought worker failed: ${d.error}`));
    if (d.id !== on) return;
    const w = waits.get(d.day);
    if (w) {
      waits.delete(d.day);
      w.done({ depth: d.depth, contamination: d.contamination });
    } else days.set(d.day, { depth: d.depth, contamination: d.contamination });
  });
  const runner: DroughtRunner = {
    start(model, depth, contamination, n) {
      if (broken) throw broken;
      const id = ++ids;
      on = id;
      days.clear();
      waits.clear();
      worker.postMessage({ kind: "start", id, model, depth: depth.slice(), contamination: contamination.slice(), days: n } satisfies DroughtJob);
      return {
        day: (k) => {
          if (broken) return Promise.reject(broken);
          const d = days.get(k);
          if (d) return Promise.resolve(d);
          return new Promise((done, fail) => waits.set(k, { done, fail }));
        },
        stop: () => {
          if (on === id) on = 0;
          worker.postMessage({ kind: "stop", id } satisfies DroughtJob);
        },
      };
    },
  };
  const close = async () => {
    uninstallParallelWater();
    await worker.terminate();
  };
  return { runner, threads, close };
}
