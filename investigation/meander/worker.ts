import { planMeander, waterJob, carryStart, type Settings, type Intent, type Plan } from './meander';
let token = 0, final: Plan | null = null;
const pause = () => new Promise<void>(r => setTimeout(r, 0));
self.onmessage = async ({ data }) => {
  if (data.kind === 'cancel') {
    token++;
    final = null;
    return;
  }
  const id: number = data.id;
  if (data.kind === 'plan') {
    const own = ++token, t = performance.now();
    try {
      const g = planMeander(data.map, data.settings as Settings, data.intent as Intent);
      for (;;) {
        if (token !== own)
          return;
        const r = g.next();
        if (r.done) {
          final = r.value;
          self.postMessage({ kind: 'plan', id, plan: final, ms: performance.now() - t });
          return;
        }
        await pause();
      }
    }
    catch (e) {
      self.postMessage({ kind: 'error', id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (data.kind === 'water' && final) {
    const own = token, { sim, run } = waterJob(final.map, final.retained);
    for (;;) {
      if (own !== token)
        return;
      const result = run.advance(8);
      if (sim.ticks % 32 === 0 || result)
        self.postMessage({ kind: 'water', id, ticks: sim.ticks, water: { depth: sim.D.slice(), contamination: sim.C.slice() } });
      if (result) {
        final.map.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
        carryStart(final.map, final.before);
        self.postMessage({ kind: result.settled || result.steadyTicks !== undefined ? 'settled' : 'unsettled', id, ticks: sim.ticks, entities: final.map.entities });
        return;
      }
      await pause();
    }
  }
};
