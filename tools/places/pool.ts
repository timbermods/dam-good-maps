// Jobs on worker threads, for the real places tools (tools/places-convert.ts, tools/real-places.ts,
// tools/places-build.ts). The worker is a module that answers each job message with one result
// message (see `serve`); the tools run under tsx, whose loader the workers inherit.

import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker } from "node:worker_threads";

/** Run `jobs` on `threads` workers of the module at `url`, in any order; `done` sees each result
 *  as it comes. The results come back in the jobs' order. */
export async function runPool<J, R>(url: URL, jobs: readonly J[], threads: number, done?: (r: R, job: J, k: number) => void): Promise<R[]> {
  const out = new Array<R>(jobs.length);
  if (!jobs.length) return out;
  const n = Math.max(1, Math.min(jobs.length, threads));
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let running = n;
    for (let t = 0; t < n; t++) {
      const w = new Worker(url);
      let current = -1;
      const feed = () => {
        if (next < jobs.length) {
          current = next++;
          w.postMessage(jobs[current]);
        } else {
          void w.terminate();
          if (--running === 0) resolve();
        }
      };
      w.on("message", (r: R) => {
        out[current] = r;
        done?.(r, jobs[current], current);
        feed();
      });
      w.on("error", reject);
      feed();
    }
  });
  return out;
}

/** In a worker: answer each job with `work`'s result (transferring `transfer(result)`). */
export function serve<J, R>(work: (job: J) => R, transfer: (r: R) => ArrayBuffer[] = () => []): void {
  if (isMainThread) return;
  parentPort!.on("message", (job: J) => {
    const r = work(job);
    parentPort!.postMessage(r, transfer(r));
  });
}

/** Threads for heavy work: half the machine's, at most 8, so other work on it keeps going. */
export function defaultThreads(): number {
  return Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
}
