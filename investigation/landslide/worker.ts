import { planLandslide, waterSim, type Intent, type Settings } from "./landslide";
import type { FullForceMap } from "../../src/core/forces/force";
import { SettleRun } from "../../src/core/sim/water";
let token = 0, final: FullForceMap | null = null;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
self.onmessage = async ({ data }) => {
  if (data.kind === "cancel") { token++; final = null; return; }
  const id: number = data.id;
  if (data.kind === "plan") {
    const own = ++token, t = performance.now();
    try {
      const g = planLandslide(data.map, data.settings as Settings, data.intent as Intent);
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
    const run=new SettleRun(sim); let result=null;
    while(!result) {
      if(token!==own)return;
      result=run.advance(32);
      self.postMessage({kind:"water",id,ticks:sim.ticks,water:{depth:sim.D.slice(),contamination:sim.C.slice()}});
      await pause();
    }
    self.postMessage({kind:"settled",id,...result});
  }
};
