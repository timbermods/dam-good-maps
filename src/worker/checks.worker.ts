// The editor's checks run here (live editing): a replica of the open map follows the editor's
// worker (the whole document when the generation changes, otherwise its log) and runs the instant
// checks after each edit, and the background check (the canonical settle in slices, then every
// check) when asked. The editor's worker never waits on a check, so edits, plans and the live
// water stay quick. It talks only to the editor's worker, over a port the page hands both.

import { expose } from "comlink";
// The replica (the whole editor core, the Rust checks among it) loads on its first request, so starting this
// worker costs next to nothing while the first map opens (D367).
const session = () => import("./checksReplica");

/** The water's threads for the canonical settle (src/core/sim/parallel.ts), from the budget the page shares with the
 *  editor's worker: made once, when the first map is followed (its helpers ready by its first edit's check), and kept
 *  warm for the session (helpers this worker starts itself). */
let waterBudget: SharedArrayBuffer | null = null;
let waterPool: Promise<void> | null = null;
const waterThreads = () =>
  (waterPool ??= waterBudget
    ? import("../core/sim/parallel").then((p) => {
        // (none on a machine whose budget's rest is under two threads: the settle runs on one, as before)
        if (p.restOf(new Int32Array(waterBudget!)[1]) < 2) return;
        p.shareWaterBudget(waterBudget!);
        // (what the editor's half of the budget leaves: on a small machine, none, and the settle runs on one thread)
        p.installParallelWater({ rest: true, spawn: () => new Worker(new URL("./waterStrip.worker.ts", import.meta.url), { type: "module" }) });
        // (a test hook, tests/e2e/isolation.spec.ts: the threads ready, and the ticks they ran)
        void import("../core/sim/stackParallel").then((q) => Object.assign(self, { dgmWater: () => ({ threads: p.parallelWaterThreads(), ticks: p.parallelWaterStats.ticks, stackTicks: q.stackParallelStats.ticks }) }));
      })
      // (no threads, then: the settle runs on one, as before)
      .catch(() => undefined)
    : Promise.resolve());

/** The follows in the order they came, each after the one before: a check waits for every follow sent before it, so it
 *  checks the map the editor asked about (each request awaits the replica's own load, and those loads can finish in any
 *  order: a check that ran first found the replica a version behind and answered nothing, and the page's dot stayed at
 *  "Checking the map", #829). */
let following: Promise<unknown> = Promise.resolve();

const api = {
  follow: (p: import("./session").FollowPayload) => {
    void waterThreads();
    const done = following.then(async () => (await session()).follow(p));
    following = done.catch(() => undefined);
    return done;
  },
  check: async (version: number, onProgress?: (p: import("./session").CheckProgress) => void) => {
    await waterThreads();
    // (a follow sent while the threads got ready is waited for too: the check then answers for the newest map)
    await following;
    return (await session()).replicaCheck(version, onProgress);
  },
};

export type ChecksApi = typeof api;

// the page sends the port the editor's worker talks on
self.addEventListener("message", (e: MessageEvent) => {
  const data = e.data as { checksPort?: MessagePort; waterBudget?: SharedArrayBuffer | null } | null;
  if (data?.waterBudget) waterBudget = data.waterBudget;
  if (data?.checksPort) expose(api, data.checksPort);
});
