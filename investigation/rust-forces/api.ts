import {F,JsonFloat} from './local/checkout/src/core/format/json';
import {entityJson} from './local/checkout/src/core/format/entities';
import {mapMetadata,writeTimber} from './local/checkout/src/core/format/timber';
import {GAME_VERSION,voxelsFromHeights,settledSimulationSingletons} from './local/checkout/src/core/format/world';
import * as portable from './local/checkout/src/core/math/portable';
import {fixture} from './local/checkout/tests/contract/forceFixtures';
import {FOOTPRINTS} from './local/checkout/src/core/format/footprints';
import {ImpactPlan, CRATER_DEFAULTS} from './local/checkout/src/core/forces/craterize';
import {CraterRun, EruptRun, QuakeRun} from './local/checkout/src/core/forces/runs';
import {EruptPlan, ERUPT_DEFAULTS} from './local/checkout/src/core/forces/erupt';
import {QuakePlan, QUAKE_DEFAULTS} from './local/checkout/src/core/forces/quake';
import {GlaciateRun} from './local/checkout/src/core/forces/glaciate/run';
import {GLACIATE_DEFAULTS} from './local/checkout/src/core/forces/glaciate/model';
import {planGlaciate} from './local/checkout/src/core/forces/glaciate/plan';
import {footprint} from './local/checkout/src/core/forces/objects';
import {plainEntities,snapshotMap} from './local/checkout/src/core/forces/force';
import {literalOf} from './local/checkout/src/core/forces/result';
import {forceFloor,holdAtFloor} from './local/checkout/src/core/forces/floor';
import {trimRock,transportRock} from './local/checkout/src/core/forces/rock';
import {settleKnocked} from './local/checkout/src/core/forces/objects';
import {respectKeep} from './local/checkout/src/core/forces/runs';
import {CarveRun,DEFAULTS as CARVE_DEFAULTS} from './local/checkout/src/core/forces/carve/run';
import {oxbowBasin,oxbowLake} from './local/checkout/src/core/forces/carve/water';
import {CarvePlay} from './local/checkout/src/core/forces/carve/play';
export {typedResult} from './typed-result';
export {plainEntities,snapshotMap};
export {F};
export {encode,decode,bridge} from './protocol';
export {portable,fixture,FOOTPRINTS,CRATER_DEFAULTS,ERUPT_DEFAULTS,QUAKE_DEFAULTS,GLACIATE_DEFAULTS};
export function job(verb:string,n=128,k=0):any {
 const map=fixture(k%4===0?'lake':k%4===1?'slide':k%4===2?'plain':'river',n);
 const origin=Math.floor(n*.38)*n+Math.floor(n*.48),path=[{x:n*.3,y:n*.3},{x:n*.5,y:n*.7},{x:n*.7,y:n*.5}];
 const shared={verb,map,footprints:FOOTPRINTS,keep:new Uint8Array(n*n)};
 if(verb==='carve')return {...shared,settings:{...CARVE_DEFAULTS,power:100,seed:k,mode:k%2?'aim':'unleash',defyGravity:true},intent:k%2?{origin,end:Math.floor(n*.78)*n+Math.floor(n*.72)}:{origin}};
 if(verb==='erupt')return {...shared,settings:{...ERUPT_DEFAULTS,power:k%3===0?100:k%3===1?0:55,size:k%2?null:48,seed:k,shape:k%2?'steep':'broad',summit:['auto','peak','crater','caldera'][k%4],flows:k%2?'heavy':'light',ridges:k%3!==0,floor:1+k%9,mode:k%2?'fissure':'vent'},intent:{origin,path}};
 if(verb==='quake')return {...shared,settings:{...QUAKE_DEFAULTS,power:k%3===0?100:k%3===1?0:55,seed:k,scarp:k%2?'sheer':'stepped',floor:1+k%9,mode:k%2?'slide':'lift'},intent:{path,side:k%3===0?-1:1}};
 if(verb==='glaciate')return {...shared,settings:{...GLACIATE_DEFAULTS,power:k%3===0?100:k%3===1?0:55,seed:k,mode:k%2?'aim':'flow'},intent:k%2?{origin,end:Math.floor(n*.78)*n+Math.floor(n*.72)}:{origin}};
 const settings={...CRATER_DEFAULTS,power:k%3===0?100:k%3===1?0:55,size:k%2?null:48,seed:k,walls:k%2?'steep':'terraced',centre:['auto','bowl','peak','ring','flat'][k%5],debris:k%2?'heavy':'light',rays:k%3!==0,floor:1+k%9,mode:k%2?'aim':'strike'};
 return {...shared,settings,intent:k%2?{origin,end:Math.floor(n*.6)*n+Math.floor(n*.8)}:{origin}};
}
export function reference(j:any):any {
 if(j.verb==='glaciate'){
  const gen=planGlaciate(j.map,j.settings,j.intent);let next=gen.next();while(!next.done)next=gen.next();const p=next.value,raw=snapshotMap(p.map),run=new GlaciateRun(j.map,j.settings,j.intent,j.keep) as any;run.settle(p);
  const {path,reference,streamPath,arrival,mask,floor,nearest,stream,fan,retained,basins,hanging,metrics,finished,joins}=p;
  return {raw,map:p.map,path,reference,streamPath,arrival,mask,floor,nearest,stream,fan,retained,basins,hanging,metrics,finished,joins,total:50};
 }
 if(j.verb==='carve'){
  const r=new CarveRun(j.map,j.settings,j.intent,{...j.options,keep:j.keep}),p=new CarvePlay(r);const initialEntities=j.trace===false?[]:structuredClone(r.map.entities),rawChanges=[new Int32Array(0)],stepMetrics=j.trace===false?[]:[structuredClone(r.metrics)],stepObjectChanges:any[]=[],riders=new Set([...r.group.map(w=>w.id),r.unleashedId]),positions=new Map(r.map.entities.filter(e=>riders.has(e.id)).map(e=>[e.id,[e.x,e.y,e.z]])),step=r.step.bind(r);if(j.trace!==false)r.step=()=>{const c=step();rawChanges.push(Int32Array.from(c.flatMap(i=>[i,r.map.heights[i]])));stepMetrics.push(structuredClone(r.metrics));for(const e of r.map.entities){if(!riders.has(e.id))continue;const before=positions.get(e.id)!;if(before[0]!==e.x||before[1]!==e.y||before[2]!==e.z){stepObjectChanges.push({step:r.metrics.steps,id:e.id,x:e.x,y:e.y,z:e.z});positions.set(e.id,[e.x,e.y,e.z]);}}return c;};p.plan(Infinity);
  return {raw:r.map,map:r.map,metrics:r.metrics,total:p.total,changes:(p as any).changes,heads:(p as any).heads,lengths:(p as any).lengths,path:r.path,removedAt:[...r.removedAt],goneSpread:[...(p as any).goneSpread],group:r.group,closure:r.closure,strengthDepth:r.strengthDepth,retained:oxbowLake(r),...(j.trace===false?{}:{initialEntities,rawChanges,stepMetrics,stepObjectChanges,oxbows:r.oxbows,oxbowBasin:oxbowBasin(r),unleashedId:r.unleashedId,badwater:r.badwater})};
 }
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
  const stages=j.settings.mode==='slide'?Math.max(8,p.fault.slide+2):8;
  const view=Object.assign(Object.create(QuakeRun.prototype),{plan0:p,before:j.map,settings:j.settings,intent:j.intent,map:j.map,keep:j.keep});
  const extras=j.settings.mode==='slide'?view.extras():[];view.show(stages);
  return {raw,map:p.map,fault,stats:p.stats,arrival:p.arrival,dx:p.dx,dy:p.dy,source:p.source,total:1+stages,extras,finalWater:view.map.water};
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
 for(let i=0;i<j.map.heights.length;i++){if(i%37===k%37)j.map.heights[i]=Math.floor(u()*23);if(i%71===k%71){j.map.water.depth[i]=u()*3;j.map.water.contamination[i]=u();}j.map.lava[i]=(Math.floor(u()*8388608)&((1<<j.map.heights[i])-1))>>>0;if(i%997===k%997)j.keep[i]=pick([1,2]);}
 j.map.rockLayers=Array.from({length:23},()=>pick([0,1,u()]));
 const templates=Object.keys(FOOTPRINTS).filter(t=>FOOTPRINTS[t].size[0]<=8&&FOOTPRINTS[t].size[1]<=8);for(let i=0;i<24;i++){const template=pick(templates),fp=FOOTPRINTS[template],x=Math.floor(u()*(n-16))+8,y=Math.floor(u()*(n-16))+8;const e:any={id:'extra-'+i,owner:pick(['test','pinned:test','derived:slopes']),template,x,y,z:j.map.heights[y*n+x],orientation:pick(['Cw0','Cw90','Cw180','Cw270']),flipped:u()<.5,components:{LivingNaturalResource:{IsDead:false},WaterSource:{SpecifiedStrength:2.7}}};e.raw={Id:e.id,Template:template,Components:{UnknownFixture:{sentinel:F(0.12345678901234567)},BlockObject:{Coordinates:{X:x,Y:y,Z:e.z},Orientation:e.orientation,Flipped:e.flipped},LivingNaturalResource:{IsDead:false},WaterSource:{SpecifiedStrength:F(2.7)}}};j.map.entities.push(e);}
 j.map.fallen=j.map.entities.filter((e:any)=>e.template==='Pine').slice(0,3).map((e:any)=>({id:e.id,x:e.x+.5,y:e.y+.5,z:e.z,dx:.6,dy:-.8,length:2}));
 const origin=tile(),end=tile();
 if(verb==='craterize'){j.settings={...j.settings,power,seed,size:pick([null,4,180,4+u()*176]),walls:pick(['steep','terraced']),centre:pick(['auto','bowl','peak','ring','flat']),debris:pick(['light','heavy']),rays:u()<.5,mode:pick(['strike','aim']),floor:1+Math.floor(u()*22)};j.intent={origin,end};}
 if(verb==='erupt'){j.settings={...j.settings,power,seed,size:pick([null,6,140,6+u()*134]),shape:pick(['steep','broad']),summit:pick(['auto','peak','crater','caldera']),flows:pick(['light','heavy']),ridges:u()<.5,mode:pick(['vent','fissure']),floor:1+Math.floor(u()*22)};j.intent={origin,path:Array.from({length:2+Math.floor(u()*6)},()=>({x:2+u()*(n-5),y:2+u()*(n-5)}))};}
 if(verb==='quake'){j.settings={...j.settings,power,seed,scarp:pick(['sheer','stepped']),mode:pick(['lift','slide']),floor:1+Math.floor(u()*22)};j.intent={side:pick([-1,1]),path:Array.from({length:2+Math.floor(u()*6)},()=>({x:u()*(n-1),y:u()*(n-1)}))};}
 if(verb==='footprint')j.margin=Math.floor(u()*4);
 if(verb==='carve'){
  const aimed=u()<.5,via=aimed&&u()<.5?Array.from({length:Math.floor(u()*5)},tile):undefined;
  j.settings={...j.settings,power,seed,mode:aimed?'aim':'unleash',wander:pick([0,35,85,100,100*u()]),width:pick([null,2,24,2+u()*22]),depth:pick([null,1,12,1+Math.floor(u()*12)]),walls:pick(['steep','wide']),defyGravity:u()<.5,dry:u()<.5,layers:u()<.5,floor:1+Math.floor(u()*22),riverDepth:pick([null,1,22,1+Math.floor(u()*22)]),banks:pick([null,0,10,10*u()])};
  j.intent=aimed?{origin,end:end===origin?(end+1)%(n*n):end,...(via?{via}:{} )}:{origin};j.options={...(k%17===0?{sourceId:'start'}:{sourceId:'fixture-source-'+k})};const unleashed=j.map.entities.find((e:any)=>e.template==='WaterSource');if(unleashed&&k%13===0){j.options.unleashed=unleashed.id;j.options.bad=k%2===0;j.settings.dry=true;j.intent.origin=unleashed.y*n+unleashed.x;}for(const i of [origin,j.intent.end,...(via??[])])if(i!==undefined)j.keep[i]=0;
 }
 if(verb==='glaciate'){
  const aimed=u()<.5,via=aimed&&u()<.5?Array.from({length:Math.floor(u()*5)},tile):undefined;
  j.settings={...j.settings,power,seed,size:pick([null,4,64,4+u()*60]),mode:aimed?'aim':'flow',meltwater:u()<.5,benches:pick(['none','some','many']),steps:pick(['few','some','many']),tarn:u()<.5,scree:u()<.5,floor:1+Math.floor(u()*22)};
  j.intent=aimed?{origin,end:end===origin?(end+1)%(n*n):end,...(via?{via}:{} )}:{origin};
 }
 j.plainEntities=plainEntities(j.map.entities);
 return j;
}
export function referenceWithRecord(j:any){let out;try{out=reference(j);}catch(error){return {error:(error as Error).message};}if(j.verb!=='footprint')out.literal=literalOf(j.map,out.map);return out;}
export function baseline(j:any):any {
 if(j.verb==='carve'){const run=new CarveRun(j.map,j.settings,j.intent,{keep:j.keep}),play=new CarvePlay(run);play.plan(Infinity);return {map:run.map,metrics:run.metrics,total:play.total};}
 if(j.verb==='glaciate'){const run=new GlaciateRun(j.map,j.settings,j.intent,j.keep).planAll();return {map:run.final(),total:run.total};}
 return referenceWithRecord(j);
}

// Cold fixture export adapter. Use the actual product JSON/.timber writers and
// retain opaque component order. Force maps intentionally flatten JsonFloat;
// reconstruct their game float tokens from original metadata/schema fields.
export function exportedBytes(j:any,map:any,orderedEntities?:any[]):Uint8Array {
 const knownFloat=(path:string)=>/(WaterSource\.(SpecifiedStrength|CurrentStrength)|TimeActivatedComponent\.(DaysUntilActivation|DaysPassed))$/.test(path);
 const revive=(value:any,original:any,path=''):any=>{
  if(value instanceof JsonFloat)return value;
  if(original instanceof JsonFloat){const n=typeof value==='number'?value:value?.value;return n===original.value?original:new JsonFloat(n,value?.raw);}
  if(knownFloat(path)){const n=typeof value==='number'?value:value?.value;if(typeof n==='number')return F(n);}
  if(typeof value==='number')return Number.isInteger(value)?value:F(value);
  if(Array.isArray(value))return value.map((v,i)=>revive(v,original?.[i],path+'.'+i));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v,original?.[k],path+'.'+k)]));
  return value;
 };
 const originals=new Map<string,any>();for(const e of j.map.entities)if(!originals.has(e.id))originals.set(e.id,e);
 const es=(orderedEntities??map.entities).map((e:any)=>revive(e,originals.get(e.id))),N=j.map.W*j.map.H,zero=new Float64Array(N);
 const world={gameVersion:GAME_VERSION,timestamp:'2026-01-01 00:00:00',sizeX:j.map.W,sizeY:j.map.H,layers:23,voxels:voxelsFromHeights(Uint8Array.from(map.heights),j.map.W,j.map.H),singletons:settledSimulationSingletons(j.map.W,j.map.H,{floor:Uint8Array.from(map.heights),depth:map.water.depth,contamination:map.water.contamination,moisture:zero,soilContamination:zero,sat:zero}),entities:es.map(entityJson)};
 return writeTimber({metadata:mapMetadata(j.map.W,j.map.H,'Rust force identity fixture'),thumbnail:null,versionTxt:GAME_VERSION+'\r\n',world,extraFiles:[]});
}

// Group 4 owns request resolution and result assembly. The Rust host drives these
// functions; it does not duplicate worker gesture/nature/Keep/source rules.
export {planForce,fullForceMapOf,stagedForceMap,buildTouches} from './local/checkout/src/core/forces/start';
export {forceRecordOf,keptForceParams} from './local/checkout/src/core/forces/keep';
export {natureOf} from './local/checkout/src/core/forces/nature';
export function attachRustPlan(selected:any, rust:any):any {
 if(!selected.ok)return selected;
 const run=selected.carve??selected.staged,before=selected.before,verb=selected.request.verb;
 const j={verb,map:before,plainEntities:plainEntities(before.entities),settings:run.settings,intent:run.intent,keep:run.keep??new Uint8Array(before.W*before.H),footprints:FOOTPRINTS,options:verb==='carve'?{sourceId:run.sourceId,unleashed:run.unleashedId,bad:run.badwater}:{}};
 const task=rust.create(j);let out:any;try{task.plan();out=clonePlan(typedPlan(task,j));}finally{task.dispose();}
 if(verb==='carve'){
  let at=0;run.map.entities=out.initialEntities;run.group=out.group;
  run.step=()=>{if(at>=out.total)return [];const k=++at,c=out.rawChanges[k];for(let t=0;t<c.length;t+=2){run.map.heights[c[t]]=c[t+1];if(run.map.lava)run.map.lava[c[t]]&=(1<<c[t+1])-1;}
   Object.assign(run.metrics,out.stepMetrics[k]);run.head=out.heads[k];run.path=out.path.slice(0,out.lengths[k]);
   const removed=new Map(out.removedAt);run.map.entities=run.map.entities.filter((e:any)=>(removed.get(e.id)??Infinity)>k);for(const change of out.stepObjectChanges)if(change.step===k){const e=run.map.entities.find((e:any)=>e.id===change.id);if(e)Object.assign(e,{x:change.x,y:change.y,z:change.z});}
   if(k===out.total){run.map=out.map;run.removedAt=new Map(out.removedAt);run.closure=out.closure;run.oxbows=out.oxbows;run.metrics=out.metrics;}
   return Array.from(c).filter((_:any,t:number)=>t%2===0);
  };
 }else if(verb==='glaciate'){
  run.planFor=()=>{if(!run.planned)run.settle({...out,map:out.raw,before,settings:run.settings,intent:run.intent});return true;};
 }else{
  const p=run.plan0;Object.assign(p,{map:out.raw,stats:out.stats,...(out.anatomy?{anatomy:out.anatomy}:{}),...(out.keep?{keep:out.keep}:{}),...(out.strength!==undefined?{strength:out.strength}:{}),...(out.flows?{flows:out.flows}:{})});
  if(verb==='quake'){Object.assign(p.fault,out.fault);Object.assign(p,{arrival:out.arrival,dx:out.dx,dy:out.dy,source:out.source});run.extras0=out.extras;}
  if(verb==='craterize')run.arrival=out.arrival;
  if(verb==='erupt')run.mask=out.heat;
  let shownReady=false;Object.defineProperty(p,'planned',{get:()=>shownReady});p.advance=()=>{shownReady=true;return true;};
  run.__rustAttachedPlan=p;
  const corePlanFor=run.__corePlanFor??run.planFor;run.__corePlanFor=corePlanFor;
  run.planFor=function(budget:number){if(this.plan0!==p)attachRustPlan(selected,rust);return corePlanFor.call(this,budget);};
 }
 return selected;
}
import {typedResult as typedPlan} from './typed-result';

import {planForce as corePlanForce} from './local/checkout/src/core/forces/start';
function clonePlan(v:any):any {if(v instanceof JsonFloat)return v;if(ArrayBuffer.isView(v))return (v as any).slice();if(Array.isArray(v))return v.map(clonePlan);if(v&&typeof v==='object'){if(v instanceof Set)return new Set(v);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clonePlan(x)]));}return v;}
export function planRustForce(input:Parameters<typeof corePlanForce>[0],rust:any){
 // Painted Lift plans inside core planForce. Install its typed planner while the
 // synchronous core call constructs/drives it; restore the independent TS oracle.
 const proto=QuakeRun.prototype as any,original=proto.planFor;
 if(input.request.verb==='quake'&&input.request.painting)proto.planFor=function(budget:number){this.__corePlanFor=original;attachRustPlan({ok:true,request:input.request,before:this.before,carve:null,staged:this},rust);return this.planFor(budget);};
 let selected:any;try{selected=corePlanForce(input);}finally{proto.planFor=original;}
 return selected.ok&&selected.staged&&selected.staged.__rustAttachedPlan===selected.staged.plan0?selected:attachRustPlan(selected,rust);
}
