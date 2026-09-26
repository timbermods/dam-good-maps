import { canonicalRun, prefill, type CanonicalWater } from '../../src/core/sim/prefill';
import { WaterSim, SettleRun } from '../../src/core/sim/water';
import { modelFor, type CarveMap, type CarveRun } from './engine';

export interface CarveWater extends CanonicalWater {
 method?:'retained-oxbow';
 preClosure?:{settled:boolean;ticks:number};
}

/** Connected low ground behind both mouth bars; never include the live river. */
export function oxbowBasin(run:CarveRun):number[] {
 const cut=run.oxbows[0];if(!cut)return [];
 const m=run.map,level=Math.min(...cut.bars.map(b=>b.level));
 const at=(p:{x:number;y:number})=>Math.round(p.y)*m.W+Math.round(p.x);
 const start=at(cut.pool[Math.floor(cut.pool.length/2)]),seen=new Set([start]),queue=[start];
 if(m.heights[start]>=level)return [];
 for(let k=0;k<queue.length;k++){
  const i=queue[k],x=i%m.W,y=Math.floor(i/m.W);
  for(const j of [y?i-m.W:-1,x?i-1:-1,x<m.W-1?i+1:-1,y<m.H-1?i+m.W:-1])
   if(j>=0&&!seen.has(j)&&m.heights[j]<level){seen.add(j);queue.push(j);}
 }
 if(cut.neck.some(p=>seen.has(at(p)))||seen.has(run.intent.origin))return [];
 return queue;
}
/** Ordinary rivers keep canonical water. A sealed oxbow inherits only water
 * actually simulated before closure, then the repo solver settles the result.
 * No preview ribbon, prescribed lake level, extra source or perpetual refill. */
export function carveWaterRun(map:CarveMap,run?:CarveRun|null):{advance(ticks:number):CarveWater|null;readonly ticks:number;readonly maxTicks:number}{
 const basin=run?.closure&&!run.settings.dry?oxbowBasin(run):[];
 if(!basin.length)return canonicalRun(modelFor(map));
 const before=canonicalRun(modelFor(run!.closure!));
 let final:SettleRun|null=null,first:CanonicalWater|null=null,done:CarveWater|null=null;
 return {
  advance(ticks:number):CarveWater|null {
   if(done)return done;
   if(!first){
    first=before.advance(ticks);if(!first)return null;
    const model=modelFor(map),initial=prefill(model);
    for(const i of basin){initial.depth[i]=first.depth[i];initial.contamination[i]=first.contamination[i];}
    final=new SettleRun(new WaterSim(model,initial));
    return null;
   }
   const r=final!.advance(ticks);
   if(r){const sim=final!.sim;done={settled:r.settled,ticks:first.ticks+r.ticks,method:'retained-oxbow',preClosure:{settled:first.settled,ticks:first.ticks},
    depth:sim.D,contamination:sim.C,sat:sim.saturation(),out:sim.out.slice()};}
   return done;
  },
  get ticks(){return before.ticks+(final?.ticks??0);},
  get maxTicks(){return before.maxTicks*2;},
 };
}
export function carveWaterSettle(map:CarveMap,run?:CarveRun|null):CarveWater {
 const r=carveWaterRun(map,run);let done=null;while(!done)done=r.advance(Infinity);return done;
}
