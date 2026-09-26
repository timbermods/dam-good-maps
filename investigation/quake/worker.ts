import { QuakePlan,DEFAULTS,modelFor,snapshot,reveal,paintWater,protectedGround,validateObjects,startProblem,type QuakeMap,type Settings,type Intent } from './engine';
import { loadMap } from './maps';
import { canonicalRun } from '../../src/core/sim/prefill';
import { WaterSim } from '../../src/core/sim/water';
import { operation,applyOperation,type QuakeOperation } from './operation';
import { changedChunks,frameContext,makeChunk,slideMotion,type SlideMotion } from './meshes';
import { consequences } from './consequences';
import { skyVisibility,shadowMap,objectCasters,tileData } from '../../src/render3d/light';
import { entityView,soilView } from '../../src/render3d/model';
import { moisture } from '../../src/core/sim/moisture';

let map:QuakeMap,before:QuakeMap,base:QuakeMap,last:QuakeMap|null=null,plan:QuakePlan|null=null;
let busy=false,epoch=0,restore=false,step=0,settings={...DEFAULTS},intent:Intent;
let undo:QuakeOperation[]=[],redo:QuakeOperation[]=[];
interface Variation {base:QuakeMap;settings:Settings;intent:Intent;nextSeed:number}
let variations=new WeakMap<QuakeOperation,Variation>(),series:Variation|null=null;
interface BrushSession {id:number;revision:number;applied:number;intent:Intent;released:boolean;offset:QuakePlan|null}
let brush:BrushSession|null=null;
const send=(m:Record<string,unknown>)=>postMessage({...m,epoch});
// MessageChannel yields to incoming cancellation without the 4–16 ms timer floor
// that accumulates into seconds when slicing a 256² map on Windows.
const scheduler=new MessageChannel(),waiting:(()=>void)[]=[];
scheduler.port1.onmessage=()=>waiting.shift()?.();
let slices=0;
const yieldSlice=()=>new Promise<void>(r=>{if(++slices%4===0)setTimeout(r,0);else{waiting.push(r);scheduler.port2.postMessage(0);}});
class Cancelled extends Error{}
const check=(token:number)=>{if(token!==epoch)throw new Cancelled();};
let checks:ReturnType<typeof consequences>|null=null;
async function frame(reset=false,token=epoch,light=true,motion?:SlideMotion){
 // Keep tile faces separate until the glide has finished, including water
 // settling remeshes. Zero travel preserves the view's current animation clock.
 if(!motion&&plan?.settings.mode==='slide')motion={id:0,tiles:new Float32Array(map.W*map.H*3),objects:new Map()};
 check(token);const context=frameContext(map),chunks=changedChunks(map,reset?null:last,motion);
 if(reset)send({type:'reset',W:map.W,H:map.H,name:map.name,rockLayers:map.rockLayers});
 // Geometry goes first: checks and lighting never delay the first visible ground change.
 for(const c of chunks){
  check(token);const chunk=makeChunk(map,c.cx,c.cy,context,c.objects,motion),buffers=new Set<ArrayBuffer>();
  const collect=(v:unknown):void=>{if(ArrayBuffer.isView(v))buffers.add(v.buffer as ArrayBuffer);else if(v&&typeof v==='object')for(const a of Object.values(v))collect(a);};collect(chunk);
  (postMessage as unknown as (m:unknown,t:Transferable[])=>void)({type:'chunk',chunk,epoch},[...buffers]);await yieldSlice();
 }
 if(light){
  check(token);const sky=skyVisibility(map.W,map.H,map.heights);await yieldSlice();check(token);
  const wet=moisture(map.heights,map.water.depth,map.water.contamination,map.W,map.H);
  const tiles=tileData(map.W,map.H,map.heights,sky,soilView(wet,map.water.contamination),context.surface);await yieldSlice();check(token);
  const light=shadowMap(map.W,map.H,map.heights,objectCasters(map.W,map.H,entityView(map.entities)));await yieldSlice();check(token);
  checks=consequences(map);send({type:'lighting',tiles,light,checks});
 }
 check(token);last=snapshot(map);
 const points=plan?.fault.points??[],progress=step/8,front=points[Math.min(points.length-1,Math.floor(progress*(points.length-1)))];
 send({type:'frame',heights:map.heights,keep:protectedGround(map),metrics:plan?{...plan.stats,steps:step}:null,
  head:front?{...front,z:map.heights[Math.max(0,Math.min(map.heights.length-1,Math.round(front.y)*map.W+Math.round(front.x)))],progress}:null,
  path:points,undo:undo.length,redo:redo.length,canReroll:!!variations.get(undo[undo.length-1]),seed:plan?.settings.seed??variations.get(undo[undo.length-1])?.settings.seed??null});
}
async function liveStep(token:number){
 if(!plan)return;step++;map=reveal(plan,map,step);const sim=new WaterSim(modelFor(map),map.water);
 for(let k=0;k<6;k++){check(token);sim.run(2);await yieldSlice();}
 map.water={depth:sim.D,contamination:sim.C};await frame(false,token,step===1||step===8);
}
async function settle(token:number,live=false){
 const run=canonicalRun(modelFor(map)),warm=live?new WaterSim(modelFor(map),map.water):null;let result=null;
 while(!result){
  check(token);result=run.advance(2);if(warm)warm.run(2);
  if(run.ticks%128===0){
   send({type:'status',text:'Water finding its level · Esc reverts'});
   if(warm){map.water={depth:warm.D.slice(),contamination:warm.C.slice()};await frame(false,token,false);}
  }
  await yieldSlice();
 }
 check(token);map.water={depth:result.depth,contamination:result.contamination};return result;
}
async function finish(token:number){
 const p=plan!;send({type:'settling'});const water=await settle(token,true);
 const problem=startProblem(map);if(problem)throw Error(problem+' · quake reverted');
 const op=operation(before,map,settings,intent,water,base!==before);
 await frame(false,token);check(token);undo.push(op);redo=[];if(series)variations.set(op,{...series,settings:{...settings}});
 plan=null;send({type:'operation',op,base:before,quakeBase:base});send({type:'finished',undo:undo.length,canReroll:true,seed:settings.seed,settled:water.settled,ticks:water.ticks,stats:p.stats});
}
async function start(token:number){
 plan=new QuakePlan(base,settings,intent);map=snapshot(base);step=0;send({type:'started',settings,seed:settings.seed,path:plan.fault.points});
 while(!plan.advance(4)){await yieldSlice();check(token);}
 check(token);await liveStep(token);
}
/** Latest input wins, but an in-flight slice finishes so rapid input cannot
 * starve the visible ground. Every revision is planned from the same base. */
async function paint(token:number){
 while(brush&&brush.applied!==brush.revision){
  const session=brush,revision=session.revision;intent=structuredClone(session.intent);
  const p=new QuakePlan(base,settings,intent);plan=p;
  while(!p.advance(4)){await yieldSlice();check(token);}
  check(token);const old=map;map=snapshot(p.map);
  map.water=paintWater(old,p,session.offset);
  const sim=new WaterSim(modelFor(map),map.water);
  for(let k=0;k<6;k++){check(token);sim.run(2);await yieldSlice();}
  map.water={depth:sim.D,contamination:sim.C};step=session.released&&revision===session.revision?8:7;
  await frame(false,token,true,settings.mode==='slide'?slideMotion(p,session.offset,old):undefined);check(token);session.offset=p;session.applied=revision;
  send({type:'painted',revision,id:session.id});
  if(session.released&&revision===session.revision){
   series={base,settings,intent,nextSeed:settings.seed};await finish(token);brush=null;
  }
 }
}
export function storedMap(raw:any):QuakeMap{
 const N=raw?.W*raw?.H;
 if(!Number.isInteger(raw?.W)||!Number.isInteger(raw?.H)||raw.W<8||raw.H<8||raw.W>256||raw.H>256||![16,22].includes(raw.maxHeight)||
 raw.heights?.length!==N||!raw.heights.every((v:number)=>Number.isInteger(v)&&v>=0&&v<=raw.maxHeight)||!Array.isArray(raw.entities)||
 raw.water?.depth?.length!==N||raw.water?.contamination?.length!==N||!raw.water.depth.every((v:number)=>Number.isFinite(v)&&v>=0)||!raw.water.contamination.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)||
 !Array.isArray(raw.rockLayers)||raw.rockLayers.length!==23||!raw.rockLayers.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)||!Array.isArray(raw.fallen))throw Error('Invalid stored map');
 const m={...raw,heights:Uint8Array.from(raw.heights),water:{depth:Float64Array.from(raw.water.depth),contamination:Float64Array.from(raw.water.contamination)}};validateObjects(m);return m;
}
self.onmessage=async(event:MessageEvent)=>{
 const msg=event.data;
 if(msg.type==='brush-update'||msg.type==='brush-end'){
  if(!brush||msg.id!==brush.id)return;
  brush.intent=structuredClone(msg.intent);brush.revision++;brush.released=msg.type==='brush-end';
  if(busy)return;
 }
 if((msg.type==='cancel'||msg.type==='undo')&&(plan||brush)){epoch++;map=snapshot(before);plan=null;brush=null;restore=true;send({type:'cancelled'});if(busy)return;}
 if(busy){send({type:'error',text:'Land is still loading'});return;}
 busy=true;const token=epoch,t=performance.now();
 try{
  if(restore){restore=false;last=null;await frame(false,token);}
  else{
   if(plan&&!['advance','snapshot','brush-update','brush-end'].includes(msg.type))throw Error('Esc reverts the current quake');
   switch(msg.type){
    case 'load':map=await loadMap(msg.id);plan=null;undo=[];redo=[];variations=new WeakMap();last=null;send({type:'status',text:'Loading land…'});if(msg.id.startsWith('place:'))await settle(token);await frame(true,token);break;
    case 'start':settings={...DEFAULTS,...msg.settings};intent=structuredClone(msg.intent);before=snapshot(map);base=before;series={base,settings,intent,nextSeed:settings.seed};await start(token);break;
    case 'brush-begin':
     settings={...DEFAULTS,...msg.settings};before=snapshot(map);base=before;intent=structuredClone(msg.intent);
     brush={id:msg.id,revision:0,applied:-1,intent,released:false,offset:null};
     send({type:'started',brush:true,settings,seed:settings.seed,path:intent.path});await paint(token);break;
    case 'brush-update':case 'brush-end':await paint(token);break;
    case 'reroll':{
     const prior=variations.get(undo[undo.length-1]);if(!prior)throw Error('Make a fault first');before=snapshot(map);base=prior.base;prior.nextSeed=(prior.nextSeed+1)>>>0;
     settings={...prior.settings,seed:prior.nextSeed};intent=structuredClone(prior.intent);series=prior;await start(token);break;
    }
    case 'advance':if(plan){await liveStep(token);if(step===8)await finish(token);}break;
    case 'undo':if(undo.length){const op=undo.pop()!;map=applyOperation(map,op,true);redo.push(op);await frame(false,token);}break;
    case 'redo':if(redo.length){const op=redo.pop()!;map=applyOperation(map,op);undo.push(op);await frame(false,token);}break;
    case 'replay':{
     const b=msg.bundle;if(b?.format!==1)throw Error('Invalid saved quake');const startMap=storedMap(b.base),op=b.operation as QuakeOperation;
     const result=applyOperation(startMap,op),original=storedMap(b.quakeBase??b.base);
     // Prebuild the replay's original view too, so its first undo is also a cache swap.
     map=startMap;before=startMap;base=original;undo=[];redo=[];variations=new WeakMap();
     await frame(true,token);send({type:'checkpoint'});map=result;undo=[op];
     variations.set(op,{base,settings:op.params.settings,intent:op.params.intent,nextSeed:op.params.settings.seed});await frame(false,token);
     send({type:'operation',op,base:before,quakeBase:base});send({type:'replayed'});break;
    }
    case 'snapshot':send({type:'snapshot',map});break;
   }
  }
 }catch(error){if(!(error instanceof Cancelled)){if(plan||brush){map=snapshot(before);plan=null;brush=null;restore=true;}send({type:'error',text:error instanceof Error?error.message:String(error)});}}
 finally{if(restore){restore=false;last=null;await frame(false,epoch);}busy=false;send({type:'ready',ms:performance.now()-t});}
};
