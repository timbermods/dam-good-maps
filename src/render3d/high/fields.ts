// The page's bake worker (`Baker`: both looks' moving water, motion.ts).

import { runBake, type BakeJob, type BakeReply, type BakeResult } from "./bake";

type Job = BakeJob extends infer J ? (J extends { id: number } ? Omit<J, "id"> : never) : never;

let warned = false;
/** A worker's failure, said once a page (the look carries on without it). */
function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  console.warn(`The renderer's bake worker failed (${why}); its fields are made on the page's thread.`);
}

/** The worker the fields are made in (one per view), or the page's thread where a worker can't
 *  start. A job always settles: the worker's jobs are kept until they come back, and if the worker
 *  fails they and every later job are made on the page's thread; a job that itself throws rejects. */
export class Baker {
  private worker: Worker | null = null;
  private next = 1;
  private inFlight = new Map<number, { job: BakeJob; resolve: (r: BakeResult) => void; reject: (e: Error) => void }>();

  constructor() {
    try {
      this.worker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<BakeReply>) => {
        const r = e.data;
        const j = this.inFlight.get(r.id);
        if (!j) return;
        this.inFlight.delete(r.id);
        if (r.kind === "error") j.reject(new Error(r.error));
        else j.resolve(r);
      };
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.fail(e.message || "it stopped");
      };
      this.worker.onmessageerror = () => this.fail("an answer couldn't be read");
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "it couldn't start");
    }
  }

  /** No worker from now on: what it had, and the rest, on the page's thread. */
  private fail(why: string): void {
    warnOnce(why);
    this.worker?.terminate();
    this.worker = null;
    const jobs = [...this.inFlight.values()];
    this.inFlight.clear();
    for (const j of jobs) this.here(j.job).then(j.resolve, j.reject);
  }

  private here(job: BakeJob): Promise<BakeResult> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(runBake(job));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }, 0),
    );
  }

  /** A job (its arrays the caller's own copies, kept until the answer comes back). */
  run(job: Job): Promise<BakeResult> {
    const id = this.next++;
    const full = { ...job, id } as BakeJob;
    if (!this.worker) return this.here(full);
    return new Promise((resolve, reject) => {
      this.inFlight.set(id, { job: full, resolve, reject });
      try {
        this.worker!.postMessage(full);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : "a job couldn't be sent");
      }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight.clear();
  }
}

let shared: Baker | null = null;
/** The page's bake worker, one for every view: started with the first map's (the warm-up's, D367) and
 *  kept, so no view waits for a worker to start. (On CI's software drawing a new worker took over 3 s
 *  to answer its first job, and each view started its own.) A job for a view since closed is answered
 *  and dropped. */
export function pageBaker(): Baker {
  return (shared ??= new Baker());
}

let sunShared: Baker | null = null;

/** The page's worker for the sun's shadows alone (the renderer's rolling bakes as the camera turns): its own, so a
 *  bake never waits behind the water's fields in the page's bake worker. */
export function sunBaker(): Baker {
  return (sunShared ??= new Baker());
}
