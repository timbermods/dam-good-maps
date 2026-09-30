import { planDeposit, waterJob, type Intent, type Settings, type Plan } from "./deposit";
let token = 0, final: Plan | null = null;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
self.onmessage = async ({ data }) => {
  if (data.kind === "cancel") { token++; final = null; return; }
  const id: number = data.id;
  if (data.kind === "plan") {
    const own = ++token, t = performance.now();
    try {
      const g = planDeposit(data.map, data.settings as Settings, data.intent as Intent);
      for (;;) {
        if (token !== own) return;
        const r = g.next();
        if (r.done) { final = r.value; self.postMessage({ kind: "plan", id, plan: r.value, ms: performance.now() - t }); return; }
        await pause();
      }
    } catch (e) { self.postMessage({ kind: "error", id, message: String(e) }); }
  }
  if (data.kind === "water" && final) {
    const own = token, job = waterJob(final);
    for (;;) {
      if (token !== own) return;
      const result = job.advance(16);
      if (job.ticks % 64 === 0 || result) self.postMessage({ kind: "water", id, ticks: job.ticks, water: { depth: job.sim.D.slice(), contamination: job.sim.C.slice() } });
      if (result) { self.postMessage({ kind: "settled", id, ticks: job.ticks, settled: result.settled || result.steadyTicks !== undefined }); return; }
      await pause();
    }
  }
};
