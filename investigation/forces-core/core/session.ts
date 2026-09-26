import {normalize,snapshot,storedMap,validateMap,json,type ForceMap,type Land} from './map';
import {Slicer,Cancelled} from './scheduler';
import {operation,applyOperation,type ForceOperation} from './operation';
import {prepare,reveal,complete,event,carve,crater,quake,type ForceRequest,type Plan} from '../verbs';
import {liveWater,settle} from './water';
import {reconcile,startProblem} from './objects';
import {nextSeed} from './random';
import {trimRock} from './rock';
export interface Entry {op:ForceOperation;base:ForceMap;nextSeed:number}
export interface Active {before:ForceMap;base:ForceMap;request:ForceRequest;plan:Plan;step:number;replaces?:string;painting:boolean}
export type Notice={type:string;[key:string]:any};
export class ForceSession {
 map:ForceMap;readonly slicer=new Slicer();past:Entry[]=[];future:Entry[]=[];active:Active|null=null;
 constructor(map:Land,readonly emit:(event:Notice)=>Promise<void>=async()=>{}){validateMap(map);this.map=normalize(map);}
 async frame(extra:Notice={type:'frame'}){
  await this.emit({...extra,type:'frame',map:this.map,epoch:this.slicer.epoch,event:this.active?event(this.active.plan,this.active.step):null,
   undo:this.past.length,redo:this.future.length,active:!!this.active,canReroll:!!this.past.length});
 }
 async start(request:ForceRequest,reroll=false,painting=false){
  if(this.active)throw Error('Esc reverts the current force');
  const before=snapshot(this.map),prior=this.past.at(-1),base=reroll?prior?.base:before;
  if(!base)throw Error('Make a force first');
  if(reroll)request={...structuredClone(prior!.op.params.request),settings:{...prior!.op.params.request.settings,seed:prior!.nextSeed=nextSeed(prior!.nextSeed)}} as ForceRequest;
  const token=this.slicer.epoch;
  // Mark preparation active before yielding, so Esc can always restore.
  this.active={before,base,request:structuredClone(request),plan:null as unknown as Plan,step:0,replaces:reroll?prior!.op.params.id:undefined,painting};
  await this.emit({type:'started',request,epoch:token});
  try{
   const plan=await prepare(base,request,this.slicer,token);this.slicer.check(token);this.active!.plan=plan;
   await this.emit({type:'planned',event:event(plan,0),epoch:token});
   if(painting)await this.paint(request,plan);
   else await this.advance();
  }catch(e){if(!(e instanceof Cancelled)){this.cancel();}throw e;}
 }
 async advance(){
  const a=this.active;if(!a||!a.plan)return;const token=this.slicer.epoch;
  a.step++;const previous=this.map;this.map=reveal(a.plan,previous,a.step);
  if(a.plan instanceof quake.QuakePlan)await liveWater(this.map,this.map,12,this.slicer,token);
  else if(!(a.plan instanceof carve.CarveRun))await liveWater(previous,this.map,8,this.slicer,token);
  trimRock(this.map);await this.frame();
  if(complete(a.plan,a.step))await this.finish();
 }
 async paint(request:ForceRequest,prepared?:Plan){
  const a=this.active;if(!a)throw Error('No painted force');const token=this.slicer.epoch,old=this.map,previous=a.plan;
  const p=prepared??await prepare(a.base,request,this.slicer,token);this.slicer.check(token);
  a.plan=p;a.request=structuredClone(request);a.painting=true;a.step=8;
  this.map=reveal(p,old,8,true);
  if(p instanceof quake.QuakePlan){
   this.map.water=quake.paintWater(old,p,!prepared&&previous instanceof quake.QuakePlan?previous:null);
   await liveWater(this.map,this.map,12,this.slicer,token);
  }else await liveWater(old,this.map,8,this.slicer,token);
  trimRock(this.map);await this.frame({type:'frame',painted:true,previousPlan:prepared?null:previous,previousMap:old});await this.emit({type:'painted',epoch:token});
 }
 async finish(){
  const a=this.active;if(!a?.plan)return;const token=this.slicer.epoch;
  try {
  await this.emit({type:'settling',epoch:token});
  const water=await settle(this.map,a.plan,this.slicer,token,async ticks=>{await this.frame();await this.emit({type:'status',text:'Water finding its level…',ticks,epoch:token});});
  this.slicer.check(token);reconcile(this.map,a.before);trimRock(this.map);
  const problem=startProblem(this.map);if(problem&&(a.request.verb==='quake'||problem==='Start needs flat ground'))throw Error(problem+' · force reverted');
  if(problem)await this.emit({type:'warning',text:problem,epoch:token});
  const op=operation(a.before,this.map,a.request,a.step,water,a.replaces);
  await this.frame();this.slicer.check(token);
  this.past.push({op,base:snapshot(a.base),nextSeed:a.request.settings.seed??0});this.future=[];this.active=null;
  await this.frame({type:'frame',metadataOnly:true});await this.emit({type:'operation',op,epoch:token});
  await this.emit({type:'finished',...water,warning:problem,epoch:token});
  }catch(e){if(!(e instanceof Cancelled))this.cancel();throw e;}
 }
 cancel(){if(this.active){this.slicer.cancel();this.map=snapshot(this.active.before);this.active=null;return true;}return false;}
 undo(){if(this.cancel())return;if(this.past.length){const e=this.past.pop()!;this.map=applyOperation(this.map,e.op,true);this.future.push(e);}}
 redo(){if(this.active)throw Error('Esc reverts the current force');if(this.future.length){const e=this.future.pop()!;this.map=applyOperation(this.map,e.op);this.past.push(e);}}
 export(){
  let base=snapshot(this.map);for(let k=this.past.length-1;k>=0;k--)base=applyOperation(base,this.past[k].op,true);
  return json({format:'dgm-forces',version:1,base,operations:this.past.map(e=>e.op),nextSeeds:this.past.map(e=>e.nextSeed)});
 }
 import(raw:any){
  if(raw?.format!=='dgm-forces'||raw.version!==1||!Array.isArray(raw.operations)||raw.operations.length>10000)throw Error('Invalid forces project');
  let m=storedMap(raw.base);const entries:Entry[]=[];
  for(const op of raw.operations as ForceOperation[]){
   const prior=entries.at(-1);
   if(op.params?.replaces&&op.params.replaces!==prior?.op.params.id)throw Error('Invalid variation predecessor');
   const base=op.params?.replaces&&op.params.replaces===prior?.op.params.id?prior.base:snapshot(m);
   m=applyOperation(m,op);const seed=raw.nextSeeds?.[entries.length]??op.params.request.settings.seed??0;
   if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error("Invalid variation seed");
   entries.push({op,base,nextSeed:seed});
  }
  this.slicer.cancel();this.active=null;this.map=m;this.past=entries;this.future=[];
 }
}
