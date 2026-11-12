// The start's drought run of a premise map, beside the map (`premise/generate.ts` `generatePremiseAsync`, D453): the
// generator's worker starts it as soon as an attempt's first build is settled, and goes on with the map's life, second
// build and checks while this runs the drought (`HazardRun`, a day of `TICKS_PER_DAY` ticks at a time, as the editor's
// Drought view runs it, on threads of its own where the page's budget leaves them) and posts each day's water. The same water as on any thread (D455). A day at a time between
// messages, so a stop (the gate decided, or the attempt failed) ends it at once.

import { installParallelWater, shareWaterBudget, withSmallMapThreads } from "../core/sim/parallel";
import { HazardRun } from "../core/sim/weather";
import { TICKS_PER_DAY, type WaterModel } from "../core/sim/water";

export type DroughtJob = { kind: "pool"; budget: SharedArrayBuffer | null } | { kind: "start"; id: number; model: WaterModel; depth: Float64Array; contamination: Float64Array; days: number } | { kind: "stop"; id: number };
export interface DroughtDay {
  id: number;
  day: number;
  depth: Float64Array;
  contamination: Float64Array;
}

let current: { id: number; run: HazardRun; day: number; days: number } | null = null;

function end(): void {
  current?.run.dispose();
  current = null;
}

function next(): void {
  const c = current;
  if (!c) return;
  // (on the water's threads where the page has them, as the settle's: the same water on any count)
  withSmallMapThreads(() => c.run.step(TICKS_PER_DAY));
  c.day++;
  const w = c.run.water();
  const depth = Float64Array.from(w.depth);
  const contamination = Float64Array.from(w.contamination);
  (self as unknown as Worker).postMessage({ id: c.id, day: c.day, depth, contamination } satisfies DroughtDay, [depth.buffer, contamination.buffer]);
  if (c.day >= c.days) end();
  else setTimeout(next, 0);
}

self.onmessage = (e: MessageEvent<DroughtJob>) => {
  const m = e.data;
  if (m.kind === "pool") {
    // (the budget the page's workers share, so this run takes only the threads the map's own water leaves)
    if (m.budget) shareWaterBudget(m.budget);
    installParallelWater({ spawn: () => new Worker(new URL("./waterStrip.worker.ts", import.meta.url), { type: "module" }) });
    return;
  }
  if (m.kind === "stop") {
    if (current?.id === m.id) end();
    return;
  }
  end();
  current = { id: m.id, run: new HazardRun(m.model, { depth: m.depth, contamination: m.contamination, stack: null } as never, "drought", m.days), day: 0, days: m.days };
  setTimeout(next, 0);
};
