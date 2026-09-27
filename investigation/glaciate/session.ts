import { snapshot,storedMap,json,type ForceMap } from '../forces-core/core/map';
import { makePlan,reveal,Valley,nextSeed,waterRun,type Plan,type Request } from './model';
import { operation,applyOperation,type ForceOperation } from './operation';
export class Session {
 past:{op:ForceOperation;base:ForceMap;next:number}[]=[];
 future:typeof this.past=[];
 active:{before:ForceMap;plan:Plan;replaces?:string;step:number}|null=null;
 valley:Valley;
 constructor(public map:ForceMap){this.valley=new Valley(map);}
 start(req:Request,reroll=false){
  if(this.active)throw Error('Ice is already flowing');const before=snapshot(this.map),prior=this.past.at(-1),base=reroll?prior?.base:before;
  if(!base)throw Error('Make a glacier first');
  if(reroll)req={...structuredClone(prior!.op.params.request),settings:{...prior!.op.params.request.settings,seed:prior!.next=nextSeed(prior!.next)}};
  const plan=makePlan(base,req.settings,req.intent,reroll?new Valley(base):this.valley);
  this.active={before,plan,replaces:reroll?prior!.op.params.id:undefined,step:0};return plan;
 }
 frame(seconds:number){if(this.active){this.active.step=Math.round(seconds*10);this.map=reveal(this.active.plan,seconds);}return this.map;}
 finish(water:{settled:boolean;ticks:number}){
  const a=this.active;if(!a)throw Error('No glacier');this.map=snapshot(a.plan.map);
  const op=operation(a.before,this.map,a.plan.request,50,water,a.replaces);
  op.params.lake=structuredClone(a.plan.retained); // fresh canonical settle and export preserve the basin initial state
  this.past.push({op,base:snapshot(a.plan.before),next:a.plan.request.settings.seed});this.future=[];this.active=null;this.valley=new Valley(this.map);return op;
 }
 cancel(){if(!this.active)return false;this.map=this.active.before;this.active=null;this.valley=new Valley(this.map);return true;}
 undo(){if(this.cancel())return;const a=this.past.pop();if(a){this.map=applyOperation(this.map,a.op,true);this.future.push(a);this.valley=new Valley(this.map);}}
 redo(){if(this.active)throw Error('Esc reverts the ice first');const a=this.future.pop();if(a){this.map=applyOperation(this.map,a.op);this.past.push(a);this.valley=new Valley(this.map);}}
 export(){let base=snapshot(this.map);for(const e of this.past.toReversed())base=applyOperation(base,e.op,true);return json({format:'dgm-glaciate',version:1,base,operations:this.past.map(e=>e.op),nextSeeds:this.past.map(e=>e.next)});}
 import(raw:any){if(raw?.format!=='dgm-glaciate'||raw.version!==1||!Array.isArray(raw.operations)||raw.operations.length>1000)throw Error('Invalid Glaciate project');
  let m=storedMap(raw.base);const entries:Session['past']=[];
  for(const [k,op] of raw.operations.entries()){const prev=entries.at(-1);if(op.params.replaces&&op.params.replaces!==prev?.op.params.id)throw Error('Invalid predecessor');
   const base=op.params.replaces?prev!.base:snapshot(m);m=applyOperation(m,op);const next=raw.nextSeeds?.[k]??op.params.request.settings.seed;
   if(!Number.isInteger(next)||next<0||next>0xffffffff)throw Error('Invalid seed');entries.push({op,base,next});}
  this.map=m;this.past=entries;this.future=[];this.active=null;this.valley=new Valley(m);
 }
}
