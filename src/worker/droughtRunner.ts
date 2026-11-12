// The generator's worker's side of the start's drought run beside the map (drought.worker.ts): one worker kept for the
// page's life, a run at a time, each day's water as it comes (`premise/generate.ts` `DroughtRunner`).

import type { DroughtRunner } from "../core/premise/generate";
import type { GateDay } from "../core/premise/hold";
import { sharedWaterBudget } from "../core/sim/parallel";
import type { DroughtDay, DroughtJob } from "./drought.worker";

let worker: Worker | null = null;
let ids = 0;
/** The days posted for the run that is on, and those waited for. */
const days = new Map<number, GateDay>();
const waits = new Map<number, (d: GateDay) => void>();
let on = 0;

/** The drought runner of a worker that can start workers of its own, or null (Node, the tools: the run stays on the
 *  generating thread). */
export function droughtRunner(): DroughtRunner | null {
  if (typeof Worker === "undefined") return null;
  worker ??= (() => {
    const w = new Worker(new URL("./drought.worker.ts", import.meta.url), { type: "module", name: "drought" });
    w.postMessage({ kind: "pool", budget: sharedWaterBudget() } satisfies DroughtJob);
    w.onmessage = (e: MessageEvent<DroughtDay>) => {
      const d = e.data;
      if (d.id !== on) return;
      const w = waits.get(d.day);
      if (w) {
        waits.delete(d.day);
        w({ depth: d.depth, contamination: d.contamination });
      } else days.set(d.day, { depth: d.depth, contamination: d.contamination });
    };
    return w;
  })();
  return {
    start(model, depth, contamination, n) {
      const id = ++ids;
      on = id;
      days.clear();
      waits.clear();
      worker!.postMessage({ kind: "start", id, model, depth: depth.slice(), contamination: contamination.slice(), days: n } satisfies DroughtJob);
      return {
        day(k: number): Promise<GateDay> {
          const have = days.get(k);
          if (have) {
            days.delete(k);
            return Promise.resolve(have);
          }
          return new Promise((done) => waits.set(k, done));
        },
        stop() {
          if (on !== id) return;
          on = 0;
          days.clear();
          waits.clear();
          worker!.postMessage({ kind: "stop", id } satisfies DroughtJob);
        },
      };
    },
  };
}
