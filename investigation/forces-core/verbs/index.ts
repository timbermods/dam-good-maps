import * as carve from './carve/engine';
import * as crater from './craterize/engine';
import * as erupt from './erupt/engine';
import * as quake from './quake/engine';
import { normalize,type ForceMap } from '../core/map';
import { protectedGround,strokeReason,START_REASON } from '../core/objects';
import { transportRock,trimRock } from '../core/rock';
import type { Slicer } from '../core/scheduler';
export type Verb='carve'|'craterize'|'erupt'|'quake';
export type ForceRequest=
 |{verb:'carve';settings:carve.Settings;intent:carve.Intent}
 |{verb:'craterize';settings:crater.Settings;intent:crater.Intent}
 |{verb:'erupt';settings:erupt.Settings;intent:erupt.Intent}
 |{verb:'quake';settings:quake.Settings;intent:quake.Intent};
export const DEFAULTS={carve:carve.DEFAULTS,craterize:crater.DEFAULTS,erupt:erupt.DEFAULTS,quake:quake.DEFAULTS};
export function refusal(m:ForceMap,r:ForceRequest):string|null {
 if(r.verb==='quake')return quake.faultReason(m,r.intent);
 if(r.verb==='erupt')return erupt.eruptionReason(m,r.settings,r.intent);
 const keep=protectedGround(m),origin=r.intent.origin;
 if(keep[origin])return START_REASON;
 if(r.settings.mode==='aim'&&r.intent.end!==undefined){
  const points=[origin,r.intent.end].map(i=>({x:i%m.W,y:Math.floor(i/m.W)}));
  return strokeReason(points,keep,m.W);
 }return null;
}
export type Plan=carve.CarveRun|crater.ImpactPlan|erupt.EruptPlan|quake.QuakePlan;
/** Only the terrain planning, reveal and physical transport vary by verb. */
export async function prepare(m:ForceMap,r:ForceRequest,slicer:Slicer,token:number):Promise<Plan>{
 const why=refusal(m,r);if(why)throw Error(why);
 let p:Plan;
 switch(r.verb){
  case 'carve':p=new carve.CarveRun(m,r.settings,r.intent);break;
  case 'craterize':p=new crater.ImpactPlan(m,r.settings,r.intent);break;
  case 'erupt':p=new erupt.EruptPlan(m,r.settings,r.intent);break;
  case 'quake':p=new quake.QuakePlan(m,r.settings,r.intent);break;
 }
 if(!(p instanceof carve.CarveRun)){
  while(!p.advance(4))await slicer.yield(token);
  if(p instanceof quake.QuakePlan)transportRock(m,p.map as ForceMap,p.source,r.settings.mode==='lift');
  trimRock(p.map as ForceMap);
 }
 slicer.check(token);return p;
}
export function reveal(p:Plan,previous:ForceMap,step:number,paint=false):ForceMap {
 if(p instanceof carve.CarveRun){p.step();return normalize(p.map);}
 if(p instanceof crater.ImpactPlan){const m=normalize(p.map);m.water=previous.water;return m;}
 if(p instanceof erupt.EruptPlan)return normalize(erupt.stageMap(p.before,p.map,step/8));
 const m=normalize(paint?p.map:quake.reveal(p,previous,step)),target=p.map as ForceMap;
 for(let i=0;i<m.lava.length;i++)if(paint||p.arrival[i]<=step/8)m.lava[i]=target.lava[i];
 return m;
}
export function complete(p:Plan,step:number):boolean{return p instanceof carve.CarveRun?p.metrics.stable:step>=8;}
export function event(p:Plan,step:number){
 if(p instanceof carve.CarveRun)return {verb:'carve',head:p.head,trail:p.path.slice(-28),stats:p.metrics};
 if(p instanceof quake.QuakePlan)return {verb:'quake',path:p.fault.points,stats:p.stats,progress:step/8,mode:p.settings.mode};
 return {verb:p instanceof erupt.EruptPlan?'erupt':'craterize',anatomy:p.anatomy,stats:p.stats,progress:step/8,settings:p.settings};
}
export {carve,crater,erupt,quake};
