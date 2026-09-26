import { canonicalRun } from '../../../src/core/sim/prefill';
import { WaterSim,SettleRun } from '../../../src/core/sim/water';
import { modelFor,type ForceMap } from './map';
import { CarveRun } from '../verbs/carve/engine';
import { ImpactPlan } from '../verbs/craterize/engine';
import { carveWaterRun } from '../verbs/carve/water';
import type { Plan } from '../verbs';
import type { Slicer } from './scheduler';
export async function liveWater(previous:ForceMap,next:ForceMap,ticks:number,slicer:Slicer,token:number){
 const sim=new WaterSim(modelFor(next),previous.water);
 for(let k=0;k<ticks;k+=2){sim.run(Math.min(2,ticks-k));await slicer.yield(token);}
 next.water={depth:sim.D.slice(),contamination:sim.C.slice()};
}
export async function settle(m:ForceMap,p:Plan|null,slicer:Slicer,token:number,onProgress?:(ticks:number)=>Promise<void>){
 // Preserve the prototypes' deliberate initial conditions: Crater retains its
 // lake volume; Carve retains simulated oxbows; Erupt and Quake use canonical prefill.
 const retained=p instanceof ImpactPlan?new SettleRun(new WaterSim(modelFor(m),m.water)):null;
 const run=retained??(p instanceof CarveRun?carveWaterRun(m,p):canonicalRun(modelFor(m)));
 const warm=!retained?new WaterSim(modelFor(m),m.water):null;
 let result:any=null;
 while(!result){
  slicer.check(token);result=run.advance(2);if(warm)warm.run(2);
  if(run.ticks%128===0&&!result){
   const sim=retained?.sim??warm!;m.water={depth:sim.D.slice(),contamination:sim.C.slice()};
   await onProgress?.(run.ticks);
  }
  await slicer.yield(token);
 }
 slicer.check(token);
 m.water=retained?{depth:retained.sim.D.slice(),contamination:retained.sim.C.slice()}:
 {depth:result.depth.slice(),contamination:result.contamination.slice()};
 return {settled:result.settled as boolean,ticks:result.ticks as number};
}
