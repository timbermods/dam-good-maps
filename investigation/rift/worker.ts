import { planRift, waterSim, type Intent, type Settings } from "./rift";
import type { FullForceMap } from "../../src/core/forces/force";
let token = 0, final: FullForceMap | null = null;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
self.onmessage = async ({ data }) => {
  if (data.kind === "cancel") { token++; final = null; return; }
  const id: number = data.id;
  if (data.kind === "plan") {
    const own = ++token, t = performance.now();
    try {
      const g = planRift(data.map, data.settings as Settings, data.intent as Intent);
      for (;;) {
        if (token !== own) return;
        const r = g.next();
        if (r.done) { final = r.value.map; self.postMessage({ kind: "plan", id, plan: r.value, ms: performance.now() - t }); return; }
        await pause();
      }
    } catch (e) { self.postMessage({ kind: "error", id, message: String(e) }); }
  }
  if (data.kind === "water" && final) {
    const own = token, m = final, sim = waterSim(m);
    // The final land is already interactive. Water continues at fixed ticks, in small slices.
    for (let ticks = 0; ticks < 768; ticks += 8) {
      if (token !== own) return;
      sim.run(8);
      if (ticks % 32 === 0 || ticks === 760) self.postMessage({ kind: "water", id, ticks: ticks + 8, water: { depth: sim.D.slice(), contamination: sim.C.slice() } });
      await pause();
    }
    self.postMessage({ kind: "settled", id, ticks: 768 });
  }
};
