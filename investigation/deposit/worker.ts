import { planDeposit, waterJob, reveal, type Intent, type Settings, type Plan } from "./deposit";
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
        if (r.done) { final = r.value; self.postMessage({ kind: "plan", id, plan: r.value, ms: performance.now() - t }); break; }
        await pause();
      }
      if (data.watch && final?.stats.wet) for (const progress of [.24, .52, .78]) {
        if (token !== own || !final) return;
        const shown = reveal(final, progress), job = waterJob({ before: final.before, map: shown });
        // Real source-driven water for each avulsion pose. This is a moving preview, never
        // called settled; the final literal map uses its independent full convergence job.
        for (let k = 0; k < 16; k++) { if (token !== own) return; if (job.advance(16)) break; await pause(); }
        self.postMessage({ kind: "waterStage", id, progress, heights: shown.heights, water: { depth: job.sim.D.slice(), contamination: job.sim.C.slice() } });
      }
    } catch (e) { self.postMessage({ kind: "error", id, message: String(e) }); }
  }
  if (data.kind === "water" && final) {
    const own = ++token, job = waterJob(final);
    for (;;) {
      if (token !== own) return;
      const result = job.advance(16);
      if (job.ticks % 64 === 0 || result) self.postMessage({ kind: "water", id, ticks: job.ticks, water: { depth: job.sim.D.slice(), contamination: job.sim.C.slice() } });
      if (result) { self.postMessage({ kind: "settled", id, ticks: job.ticks, settled: result.settled || result.steadyTicks !== undefined }); return; }
      await pause();
    }
  }
};
