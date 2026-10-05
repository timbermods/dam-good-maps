// The browser page's entry: the cases, for run.ts to call through Playwright; `runCaseThreaded` runs one in a
// worker whose water runs on several threads (threads.ts).
import { cases, dump, runCase, type Case, type Row } from "./cases";

let worker: Worker | null = null;
let next = 0;
let threadedTicks = 0;
const waiting = new Map<number, { done: (rows: Row[]) => void; fail: (e: Error) => void }>();

function runCaseThreaded(c: Case): Promise<Row[]> {
  if (!worker) {
    worker = new Worker("/threads.js", { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; rows?: Row[]; ticks?: number; progress?: string; error?: string }>) => {
      const { id, rows, ticks, progress, error } = e.data;
      if (progress) return console.info(`DETERMINISM_PROGRESS ${progress}`);
      const w = waiting.get(id);
      waiting.delete(id);
      if (ticks !== undefined) threadedTicks = ticks;
      if (rows) w?.done(rows);
      else w?.fail(Error(error ?? "the threaded worker failed"));
    };
  }
  const id = ++next;
  return new Promise((done, fail) => {
    waiting.set(id, { done, fail });
    worker!.postMessage({ id, case: c });
  });
}

Object.assign(window, {
  determinism: {
    cases,
    dump,
    runCase: (c: Parameters<typeof runCase>[0]) => runCase(c, (s) => console.info(`DETERMINISM_PROGRESS ${s}`)),
    runCaseThreaded,
    threadedTicks: () => threadedTicks,
  },
});
