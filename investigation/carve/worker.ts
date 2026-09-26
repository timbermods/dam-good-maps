import { CarveRun, DEFAULTS, modelFor, type CarveMap, type Settings, type Intent } from './engine';
import { loadMap } from './maps';
import { carveWaterRun } from './water';
import { applyOperation, operation, type CarveOperation } from './operation';
import { changedChunks, frameContext, makeChunk, snapshot } from './meshes';
import { consequences } from './consequences';
import { skyVisibility, shadowMap, objectCasters, tileData } from '../../src/render3d/light';
import { entityView, soilView } from '../../src/render3d/model';
import { moisture } from '../../src/core/sim/moisture';
let map:CarveMap,before:CarveMap,run:CarveRun|null=null,last:CarveMap|null=null;
interface Variation {base:CarveMap;intent:Intent;settings:Settings;nextSeed:number}
let variations=new WeakMap<CarveOperation,Variation>(),series:Variation|null=null,carveBase:CarveMap;
let undo:CarveOperation[]=[],redo:CarveOperation[]=[];
let settings:Settings={...DEFAULTS},busy=false,epoch=0,restore=false;
const send=(data:Record<string,unknown>)=>postMessage({...data,epoch});
const yieldSlice=()=>new Promise<void>(r=>setTimeout(r,0));
class Cancelled extends Error {}
const check=(token:number)=>{if(token!==epoch)throw new Cancelled();};
async function frame(reset=false,token=epoch) {
  check(token);
  const context=frameContext(map),chunks=changedChunks(map,reset?null:last);
  if(reset)send({type:'reset',W:map.W,H:map.H,name:map.name});
  const checks=consequences(map);await yieldSlice();check(token);
  const sky=skyVisibility(map.W,map.H,map.heights);await yieldSlice();check(token);
  const wet=moisture(map.heights,map.water.depth,map.water.contamination,map.W,map.H);
  const tiles=tileData(map.W,map.H,map.heights,sky,soilView(wet,map.water.contamination),context.surface);
  await yieldSlice();check(token);
  const light=shadowMap(map.W,map.H,map.heights,objectCasters(map.W,map.H,entityView(map.entities)));
  send({type:'lighting',tiles,light,checks});
  for(const c of chunks){
    check(token);const chunk=makeChunk(map,c.cx,c.cy,context,c.objects),buffers=new Set<ArrayBuffer>();
    const collect=(v:unknown):void=>{
      if(ArrayBuffer.isView(v))buffers.add(v.buffer as ArrayBuffer);
      else if(v&&typeof v==='object')for(const child of Object.values(v))collect(child);
    };collect(chunk);
    (postMessage as unknown as (data:unknown,transfer:Transferable[])=>void)({type:'chunk',chunk,epoch},[...buffers]);
    await yieldSlice();
  }
  check(token);last=snapshot(map);
  send({type:'frame',heights:map.heights,metrics:run?.metrics??null,head:run?.head??null,
    trail:run?.path.slice(-28)??[],undo:undo.length,redo:redo.length,checks,
    canReroll:!!variations.get(undo[undo.length-1]),seed:run?.settings.seed??variations.get(undo[undo.length-1])?.settings.seed??null});
}
async function settle(token:number) {
  const r=carveWaterRun(map,run);let result=null;
  while(!result){
    check(token);result=r.advance(2);
    if(r.ticks%128===0)send({type:'status',text:'Settling the river · '+Math.round(100*r.ticks/r.maxTicks)+'% · Esc still reverts'});
    await yieldSlice();
  }
  check(token);map.water={depth:result.depth,contamination:result.contamination};return result;
}
async function finish(reason:string,token:number) {
  if(!run)return;
  const current=run;map=current.map;send({type:'settling'});
  const water=await settle(token);
  const op=operation(before,map,settings,current.metrics.steps,reason,water);
  op.params.intent={...current.intent};op.params.reroll=carveBase!==before;
  await frame(false,token);check(token);
  undo.push(op);redo=[];if(series)variations.set(op,{...series,settings:{...settings}});run=null;
  send({type:'operation',op,base:before,carveBase,metrics:current.metrics});
  send({type:'finished',reason,settled:water.settled,ticks:water.ticks,undo:undo.length,canReroll:true,seed:settings.seed});
}
function storedMap(raw:any):CarveMap {
  const N=raw?.W*raw?.H;
  if(!Number.isInteger(raw?.W)||!Number.isInteger(raw?.H)||raw.W<1||raw.H<1||raw.W>256||raw.H>256||
     ![16,22].includes(raw.maxHeight)||raw.heights?.length!==N||
     !raw.heights.every((v:number)=>Number.isInteger(v)&&v>=0&&v<=raw.maxHeight)||!Array.isArray(raw.entities)||
     raw.water?.depth?.length!==N||raw.water?.contamination?.length!==N||
     !raw.water.depth.every((v:number)=>Number.isFinite(v)&&v>=0)||
     !raw.water.contamination.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Invalid stored map.');
  return {...raw,heights:Uint8Array.from(raw.heights),water:{depth:Float64Array.from(raw.water.depth),contamination:Float64Array.from(raw.water.contamination)}};
}
self.onmessage=async(event:MessageEvent)=>{
  const msg=event.data;
  // Interrupt at the next yield, even during canonical settle or mesh construction.
  if((msg.type==='cancel'||msg.type==='undo')&&run){
    epoch++;map=snapshot(before);run=null;restore=true;send({type:'cancelled'});
    if(busy)return;
  }
  if(busy){send({type:'error',text:'A map operation is still finishing.'});return;}
  busy=true;const t=performance.now(),token=epoch;
  try{
    if(restore){restore=false;last=null;await frame(false,token);}
    else{
      if(run&&!['advance','stop','snapshot'].includes(msg.type))throw new Error('Stop or cancel this carve first.');
      switch(msg.type){
        case 'load':
          run=null;undo=[];redo=[];variations=new WeakMap();series=null;last=null;send({type:'status',text:'Loading land…'});
          map=await loadMap(msg.id);if(msg.id.startsWith('place:'))await settle(token);
          await frame(true,token);break;
        case 'start':
          settings={...DEFAULTS,...msg.settings};before=snapshot(map);carveBase=before;
          run=new CarveRun(carveBase,settings,msg.intent);map=run.map;
          series={base:carveBase,intent:{...msg.intent},settings:{...settings},nextSeed:settings.seed??0};
          send({type:'started',seed:settings.seed,settings});break;
        case 'reroll':{
          const prior=variations.get(undo[undo.length-1]);
          if(!prior)throw new Error('Finish a carve before trying another path.');
          before=snapshot(map);carveBase=prior.base;
          prior.nextSeed=(prior.nextSeed+1)>>>0;settings={...prior.settings,seed:prior.nextSeed};series=prior;
          run=new CarveRun(carveBase,settings,prior.intent);map=run.map;
          send({type:'started',seed:settings.seed,settings});await frame(false,token);break;
        }
        case 'advance':
          if(run){run.step();map=run.map;await frame(false,token);if(run?.metrics.stable)await finish(run.metrics.reason,token);}
          break;
        case 'stop':await finish('stopped',token);break;
        case 'undo':
          if(undo.length){const op=undo.pop()!;map=applyOperation(map,op,true);redo.push(op);await frame(false,token);}break;
        case 'redo':
          if(redo.length){const op=redo.pop()!;map=applyOperation(map,op);undo.push(op);await frame(false,token);}break;
        case 'replay':{
          const b=msg.bundle,raw=b?.base,N=raw?.W*raw?.H;
          if(b?.format!==1||!raw||!b.operation||!Number.isInteger(raw.W)||!Number.isInteger(raw.H)||raw.W<1||raw.H<1||raw.W>256||raw.H>256||
              ![16,22].includes(raw.maxHeight)||raw.heights?.length!==N||
              !raw.heights.every((v:number)=>Number.isInteger(v)&&v>=0&&v<=raw.maxHeight)||!Array.isArray(raw.entities))throw new Error('Invalid saved carve run.');
          const base=storedMap(raw);
          const result=applyOperation(base,b.operation);
          const original=b.carveBase?storedMap(b.carveBase):!b.operation.params.reroll?base:null;
          if(original&&(original.W!==base.W||original.H!==base.H))throw new Error('Wrong variation base size.');
          before=base;map=result;undo=[b.operation];redo=[];variations=new WeakMap();last=null;
          if(original&&b.operation.params.intent)variations.set(b.operation,{base:original,intent:b.operation.params.intent,settings:{...DEFAULTS,...b.operation.params.settings},nextSeed:b.operation.params.settings.seed??0});
          await frame(true,token);send({type:'replayed'});break;
        }
        case 'snapshot':send({type:'snapshot',map});break;
      }
    }
  }catch(error){
    if(!(error instanceof Cancelled))send({type:'error',text:error instanceof Error?error.message:String(error)});
  }finally{
    if(restore){restore=false;last=null;await frame(false,epoch);}
    busy=false;send({type:'ready',ms:performance.now()-t});
  }
};
