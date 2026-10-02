import * as portable from './local/checkout/src/core/math/portable';
import {fixture} from './local/checkout/tests/contract/forceFixtures';
import {FOOTPRINTS} from './local/checkout/src/core/format/footprints';
import {ImpactPlan, CRATER_DEFAULTS} from './local/checkout/src/core/forces/craterize';
import {CraterRun, EruptRun, QuakeRun} from './local/checkout/src/core/forces/runs';
import {EruptPlan, ERUPT_DEFAULTS} from './local/checkout/src/core/forces/erupt';
import {QuakePlan, QUAKE_DEFAULTS} from './local/checkout/src/core/forces/quake';
import {GlaciateRun} from './local/checkout/src/core/forces/glaciate/run';
import {GLACIATE_DEFAULTS} from './local/checkout/src/core/forces/glaciate/model';
import {footprint} from './local/checkout/src/core/forces/objects';
import {snapshotMap} from './local/checkout/src/core/forces/force';
import {literalOf} from './local/checkout/src/core/forces/result';
import {forceFloor,holdAtFloor} from './local/checkout/src/core/forces/floor';
import {trimRock,transportRock} from './local/checkout/src/core/forces/rock';
import {settleKnocked} from './local/checkout/src/core/forces/objects';
import {respectKeep} from './local/checkout/src/core/forces/runs';
import {CarveRun,DEFAULTS as CARVE_DEFAULTS} from './local/checkout/src/core/forces/carve/run';
import {CarvePlay} from './local/checkout/src/core/forces/carve/play';
export {encode,decode,bridge} from './protocol';
export {portable,fixture,FOOTPRINTS,CRATER_DEFAULTS,ERUPT_DEFAULTS,QUAKE_DEFAULTS,GLACIATE_DEFAULTS};
export function job(verb:string,n=128,k=0):any {
 const map=fixture(k%4===0?'lake':k%4===1?'slide':k%4===2?'plain':'river',n);
 const origin=Math.floor(n*.38)*n+Math.floor(n*.48),path=[{x:n*.3,y:n*.3},{x:n*.5,y:n*.7},{x:n*.7,y:n*.5}];
 const shared={verb,map,footprints:FOOTPRINTS,keep:new Uint8Array(n*n)};
 if(verb==='carve')return {...shared,settings:{...CARVE_DEFAULTS,power:100,seed:k},intent:{origin}};
 if(verb==='erupt')return {...shared,settings:{...ERUPT_DEFAULTS,power:k%3===0?100:k%3===1?0:55,size:k%2?null:48,seed:k,shape:k%2?'steep':'broad',summit:['auto','peak','crater','caldera'][k%4],flows:k%2?'heavy':'light',ridges:k%3!==0,floor:1+k%9,mode:k%2?'fissure':'vent'},intent:{origin,path}};
 if(verb==='quake')return {...shared,settings:{...QUAKE_DEFAULTS,power:k%3===0?100:k%3===1?0:55,seed:k,scarp:k%2?'sheer':'stepped',floor:1+k%9,mode:k%2?'slide':'lift'},intent:{path,side:k%3===0?-1:1}};
 if(verb==='glaciate')return {...shared,settings:{...GLACIATE_DEFAULTS,power:k%3===0?100:k%3===1?0:55,seed:k},intent:{origin}};
 const settings={...CRATER_DEFAULTS,power:k%3===0?100:k%3===1?0:55,size:k%2?null:48,seed:k,walls:k%2?'steep':'terraced',centre:['auto','bowl','peak','ring','flat'][k%5],debris:k%2?'heavy':'light',rays:k%3!==0,floor:1+k%9,mode:k%2?'aim':'strike'};
 return {...shared,settings,intent:k%2?{origin,end:Math.floor(n*.6)*n+Math.floor(n*.8)}:{origin}};
}
export function reference(j:any):any {
 if(j.verb==='footprint')return j.map.entities.map((e:any)=>footprint(j.map,e,j.margin??0));
 if(j.verb==='erupt'){
  const p=new EruptPlan(j.map,j.settings,j.intent,j.keep);while(!p.advance(8)){}
  const raw=snapshotMap(p.map);holdAtFloor(j.map.heights,p.map.heights,forceFloor(j.settings));trimRock(p.map);respectKeep(j.map,p.map,j.keep);settleKnocked(j.map,p.map);
  const view=Object.assign(Object.create(EruptRun.prototype),{plan0:p,before:j.map,settings:j.settings,mask:null});
  return {raw,map:p.map,anatomy:p.anatomy,stats:p.stats,strength:p.strength,keep:p.keep,flows:p.flows,heat:view.heat(),total:30};
 }
 if(j.verb==='quake'){
  const p=new QuakePlan(j.map,j.settings,j.intent);while(!p.advance(8)){}
  const raw=snapshotMap(p.map);holdAtFloor(j.map.heights,p.map.heights,forceFloor(j.settings));transportRock(j.map,p.map,p.source,j.settings.mode==='lift');respectKeep(j.map,p.map,j.keep);settleKnocked(j.map,p.map);
  const f=p.fault as any;
  const fault={points:f.points,segments:f.segments,length:f.length,reach:f.reach,lift:f.lift,slide:f.slide,heading:f.heading,directions:f.directions};
  return {raw,map:p.map,fault,stats:p.stats,arrival:p.arrival,dx:p.dx,dy:p.dy,source:p.source,total:1+(j.settings.mode==='slide'?Math.max(8,p.fault.slide+2):8)};
 }
 if(j.verb==='craterize'){
  const p=new ImpactPlan(j.map,j.settings,j.intent,j.keep);while(!p.advance(16)){}
  const raw=snapshotMap(p.map);holdAtFloor(j.map.heights,p.map.heights,forceFloor(j.settings));trimRock(p.map);respectKeep(j.map,p.map,j.keep);settleKnocked(j.map,p.map);
  const a=p.anatomy,out=new Float32Array(j.map.W*j.map.H),reach=(j.settings.debris==='heavy'?2.65:1.48)+(j.settings.rays?1.4:0),c=portable.cos(a.angle),s=portable.sin(a.angle);
  for(let y=0;y<j.map.H;y++)for(let x=0;x<j.map.W;x++){const dx=x-a.x,dy=y-a.y,r=portable.hypot((dx*c+dy*s)/a.a,(-dx*s+dy*c)/a.b);out[y*j.map.W+x]=r<1.05?0:Math.max(.125,Math.min(1,.125+((r-1.05)/Math.max(.5,reach-1.05))*.875));}
  return {raw,map:p.map,anatomy:p.anatomy,stats:p.stats,strength:p.strength,keep:p.keep,arrival:out,total:11};
 }
 throw Error('Unimplemented reference '+j.verb);
}
export function randomJob(verb:string,n:number,k:number):any {
 const j=job(verb,n,k);let state=(k+1)*15485863>>>0;
 const u=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;},pick=(a:any[])=>a[Math.floor(u()*a.length)],tile=()=>Math.floor(u()*n*n);
 const power=pick([0,100,100*u()]),seed=pick([0,0xffffffff,Math.floor(u()*4294967296)]);
 for(let i=0;i<j.map.heights.length;i++){if(i%37===k%37)j.map.heights[i]=Math.floor(u()*13);if(i%71===k%71){j.map.water.depth[i]=u()*3;j.map.water.contamination[i]=u();}j.map.lava[i]=(Math.floor(u()*8388608)&((1<<j.map.heights[i])-1))>>>0;if(i%997===k%997)j.keep[i]=pick([1,2]);}
 j.map.rockLayers=Array.from({length:23},()=>pick([0,1,u()]));
 const templates=Object.keys(FOOTPRINTS).filter(t=>FOOTPRINTS[t].size[0]<=8&&FOOTPRINTS[t].size[1]<=8);for(let i=0;i<24;i++){const template=pick(templates),fp=FOOTPRINTS[template],x=Math.floor(u()*(n-16))+8,y=Math.floor(u()*(n-16))+8;j.map.entities.push({id:'extra-'+i,owner:pick(['test','pinned:test','derived:slopes']),template,x,y,z:j.map.heights[y*n+x],orientation:pick(['Cw0','Cw90','Cw180','Cw270']),flipped:u()<.5,components:{LivingNaturalResource:{IsDead:false},WaterSource:{SpecifiedStrength:2.7}},raw:{sentinel:0.12345678901234567}});}
 j.map.fallen=j.map.entities.filter((e:any)=>e.template==='Pine').slice(0,3).map((e:any)=>({id:e.id,x:e.x+.5,y:e.y+.5,z:e.z,dx:.6,dy:-.8,length:2}));
 const origin=tile(),end=tile();
 if(verb==='craterize'){j.settings={...j.settings,power,seed,size:pick([null,4,180,4+u()*176]),walls:pick(['steep','terraced']),centre:pick(['auto','bowl','peak','ring','flat']),debris:pick(['light','heavy']),rays:u()<.5,mode:pick(['strike','aim']),floor:1+Math.floor(u()*22)};j.intent={origin,end};}
 if(verb==='erupt'){j.settings={...j.settings,power,seed,size:pick([null,6,140,6+u()*134]),shape:pick(['steep','broad']),summit:pick(['auto','peak','crater','caldera']),flows:pick(['light','heavy']),ridges:u()<.5,mode:pick(['vent','fissure']),floor:1+Math.floor(u()*22)};j.intent={origin,path:Array.from({length:2+Math.floor(u()*6)},()=>({x:2+u()*(n-5),y:2+u()*(n-5)}))};}
 if(verb==='quake'){j.settings={...j.settings,power,seed,scarp:pick(['sheer','stepped']),mode:pick(['lift','slide']),floor:1+Math.floor(u()*22)};j.intent={side:pick([-1,1]),path:Array.from({length:2+Math.floor(u()*6)},()=>({x:u()*(n-1),y:u()*(n-1)}))};}
 if(verb==='footprint')j.margin=Math.floor(u()*4);
 return j;
}
export function referenceWithRecord(j:any){const out=reference(j);if(j.verb!=='footprint')out.literal=literalOf(j.map,out.map);return out;}
export function baseline(j:any):any {
 if(j.verb==='carve'){const run=new CarveRun(j.map,j.settings,j.intent,{keep:j.keep}),play=new CarvePlay(run);play.plan(Infinity);return {map:run.map,metrics:run.metrics,total:play.total};}
 if(j.verb==='glaciate'){const run=new GlaciateRun(j.map,j.settings,j.intent,j.keep).planAll();return {map:run.final(),total:run.total};}
 return referenceWithRecord(j);
}
