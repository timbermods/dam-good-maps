// A helper thread of the multi-core water for the tests (worker_threads under Vitest, which can't load a .ts
// worker itself): src/core/sim/parallel.ts's `stripHelper`, loaded through tsx. `inspect` answers how many
// jobs (simulations' strips) it still holds, so the tests can see a job released.
import { parentPort } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";

const { stripHelper } = await tsImport("../../../src/core/sim/parallel.ts", import.meta.url);
const handle = stripHelper();
const jobs = new Set();
parentPort.on("message", (m) => {
  if (m.kind === "inspect") return parentPort.postMessage({ jobs: jobs.size });
  handle(m);
  if (m.kind === "init") jobs.add(m.job);
  if (m.kind === "free") jobs.delete(m.job);
});
process.on("uncaughtException", () => handle.died());
