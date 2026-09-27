import { WaterSim, TICKS_PER_DAY, type WaterModel } from '../../src/core/sim/water';
import { badtideContamination, hazardDays, type Hazard } from '../../src/core/sim/weather';
import { moisture } from '../../src/core/sim/moisture';
import { soilContamination } from '../../src/core/sim/contamination';
import { soilView, waterFromDepth, type MapView } from '../../src/render3d/model';
import type { Difficulty } from '../../src/core/spec/mapspec';
import { surfaceVelocity } from './flow';
export interface WeatherBase { model:WaterModel; depth:Float64Array; contamination:Float64Array; view:MapView; difficulty:Difficulty; }
export function weatherSimulation(base:WeatherBase){
 const model={...base.model,emitters:base.model.emitters.map(e=>({...e}))};
 return {sim:new WaterSim(model,{depth:base.depth.slice(),contamination:base.contamination.slice()}),clean:model.emitters.filter(e=>e.contamination===0)};
}
/** Same hazard duration, source curve, evaporation, tick spacing and soil calls as
 * worker/session.ts startWeather. Read the live simulator rather than waterOf's
 * unedited-import display override. No analytic recession or invented front. */
export async function weatherSnapshots(base:WeatherBase,hazard:Hazard,send:(frame:ReturnType<typeof snapshot>)=>void,cancelled:()=>boolean){
 const {sim,clean}=weatherSimulation(base),days=hazardDays(base.difficulty,hazard),total=days*TICKS_PER_DAY;
 let nextSoil=TICKS_PER_DAY;
 for(let tick=0;tick<total;){
  if(cancelled())return;
  const start=performance.now();
  while(tick<total&&performance.now()-start<8){
   const gap=tick<TICKS_PER_DAY?12:96;
   if(hazard==='badtide')for(const e of clean)e.contamination=badtideContamination(tick/TICKS_PER_DAY,days);
   sim.run(gap,hazard==='drought'?0:1);tick+=gap;
   if(tick>=nextSoil){send(snapshot(base,sim,hazard,tick/TICKS_PER_DAY,days));nextSoil+=TICKS_PER_DAY;}
  }
  await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
}
export function snapshot(base:WeatherBase,sim:WaterSim,phase:Hazard,day:number,days:number){
 const {view}=base,{W,H,heights}=view;
 const water=waterFromDepth(heights,sim.D,sim.C);
 // These demo generators/places are heightfields. Fail rather than pretend a
 // multi-floor map can use the same surface solver.
 if(view.columns.tiles.length)throw Error('Weather study currently requires a heightfield.');
 const soil=soilView(moisture(heights,sim.D,sim.C,W,H,null),soilContamination(heights,sim.D,sim.C,W,H,null));
 return {water,soil,phase,day,days,velocity:surfaceVelocity(W,H,sim.D,sim.out)};
}

