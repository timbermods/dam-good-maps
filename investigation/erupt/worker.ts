import { EruptPlan, DEFAULTS, snapshot, waterRun, protectedGround, liveWater, stageMap, type EruptMap, type Settings, type Intent } from './engine';
import { loadMap } from './maps';
import { operation, applyOperation, type EruptOperation } from './operation';
import { changedChunks, frameContext, makeChunk } from './meshes';
import { skyVisibility, shadowMap, objectCasters, tileData } from '../../src/render3d/light';
import { entityView, soilView } from '../../src/render3d/model';
import { moisture } from '../../src/core/sim/moisture';
import { CarveRun, DEFAULTS as CARVE } from './carve/engine';
let map:EruptMap,last:EruptMap|null=null,epoch=0,busy=false,active=false;
let before:EruptMap,eruptionBase:EruptMap,plan:EruptPlan|null=null,settings:Settings={...DEFAULTS},intent:Intent={origin:0};
interface Entry {op:EruptOperation;base:EruptMap;intent:Intent;settings:Settings;nextSeed:number}
let undo:Entry[]=[],redo:Entry[]=[],series:Entry|null=null,reroll=false;
const send=(v:Record<string,unknown>)=>postMessage({...v,epoch});
const yieldSlice=()=>new Promise<void>(r=>setTimeout(r,0));
class Cancelled extends Error{}
function check(token:number){if(token!==epoch)throw new Cancelled();}
async function frame(token:number,reset=false,transition?:EruptMap){
  check(token);const context=frameContext(map),chunks=changedChunks(map,reset?null:last);
  if(reset)send({type:'reset',W:map.W,H:map.H,name:map.name,rockLayers:map.rockLayers});
  send({type:'batch',transition:!!transition});
  const sky=skyVisibility(map.W,map.H,map.heights);await yieldSlice();check(token);
  const wet=moisture(map.heights,map.water.depth,map.water.contamination,map.W,map.H);
  const tiles=tileData(map.W,map.H,map.heights,sky,soilView(wet,map.water.contamination),context.surface);
  await yieldSlice();check(token);
  const light=shadowMap(map.W,map.H,map.heights,objectCasters(map.W,map.H,entityView(map.entities.filter(e=>!map.fallen.some(f=>f.id===e.id)))));
  send({type:'lighting',tiles,light});
  await yieldSlice();check(token);
  for(const c of chunks){
    check(token);const chunk=makeChunk(map,c.cx,c.cy,context,c.objects,transition),buffers=new Set<ArrayBuffer>();
    const collect=(v:unknown):void=>{if(ArrayBuffer.isView(v))buffers.add(v.buffer as ArrayBuffer);else if(v&&typeof v==='object')Object.values(v).forEach(collect);};
    collect(chunk);(postMessage as unknown as (data:unknown,transfer:Transferable[])=>void)({type:'chunk',chunk,epoch},[...buffers]);await yieldSlice();
  }
  check(token);last=snapshot(map);
  send({type:'frame',heights:map.heights,protected:protectedGround(map),undo:undo.length,redo:redo.length,canReroll:undo.at(-1)?.op.op==='eruptResult',name:map.name});
}
async function settle(token:number,live=false){
  const run=waterRun(map);let result=null;
  while(!result){
    check(token);result=run.advance(8);await yieldSlice();
    if(live&&run.ticks%128===0&&!result){
      send({type:'status',text:'Water finding its level…'});
    }
  }
  check(token);map.water={depth:result.depth.slice(),contamination:result.contamination.slice()};return result;
}
function storedMap(raw:any):EruptMap{
  const N=raw?.W*raw?.H;
  if(!Number.isInteger(raw?.W)||!Number.isInteger(raw?.H)||raw.W<4||raw.W>256||raw.H<4||raw.H>256||
    raw.heights?.length!==N||!raw.heights.every((v:number)=>Number.isInteger(v)&&v>=0&&v<=22)||
    raw.water?.depth?.length!==N||raw.water?.contamination?.length!==N||
    !raw.water.depth.every((v:number)=>Number.isFinite(v)&&v>=0)||!raw.water.contamination.every((v:number)=>Number.isFinite(v)&&v>=0&&v<=1)||
    !Array.isArray(raw.entities)||!Array.isArray(raw.fallen)||raw.rockLayers?.length!==23||raw.lava?.length!==N||
    !raw.lava.every((v:number)=>Number.isInteger(v)&&v>=0&&v<(1<<22)))throw Error('Invalid saved land');
  return {...raw,maxHeight:22,heights:Uint8Array.from(raw.heights),lava:Uint32Array.from(raw.lava),water:{depth:Float64Array.from(raw.water.depth),contamination:Float64Array.from(raw.water.contamination)}};
}
self.onmessage=async(event:MessageEvent)=>{
  const msg=event.data;
  // The UI can still be displaying its last frame when completion crosses in flight.
  if(msg.type==='cancel'&&!active&&!busy){
    epoch++;
    if(undo.length){const entry=undo.pop()!;map=applyOperation(map,entry.op,true);last=snapshot(map);}
    send({type:'cancelled'});send({type:'ready'});return;
  }
  if((msg.type==='cancel'||msg.type==='undo')&&active){
    epoch++;map=snapshot(before);last=snapshot(map);active=false;plan=null;send({type:'cancelled'});
    if(!busy)send({type:'ready'});return;
  }
  if(busy){send({type:'error',text:'Land is still finishing'});return;}
  busy=true;const token=epoch,t=performance.now();
  try{
    if(active&&!['advance','finish','snapshot'].includes(msg.type))throw Error('Let this eruption finish first');
    switch(msg.type){
      case 'load':
        undo=[];redo=[];plan=null;active=false;last=null;send({type:'status',text:'Loading land…'});
        map=await loadMap(msg.id);check(token);
        if(msg.id.startsWith('place:')||msg.id.startsWith('fixture:river'))await settle(token);
        await frame(token,true);break;
      case 'start':
      case 'reroll':{
        reroll=msg.type==='reroll';series=reroll?undo[undo.length-1]:null;
        if(reroll&&(!series||series.op.op!=='eruptResult'))throw Error('Make an eruption first');
        before=snapshot(map);eruptionBase=reroll?series!.base:before;
        settings=reroll?{...series!.settings,seed:series!.nextSeed=(series!.nextSeed+1)>>>0}:{...DEFAULTS,...msg.settings};
        intent=reroll?{...series!.intent}:{...msg.intent};
        const next=new EruptPlan(eruptionBase,settings,intent);plan=next;active=true;
        send({type:'started',settings,intent,anatomy:plan.anatomy});
        while(!next.advance(4)){await yieldSlice();check(token);}
        check(token);
        send({type:'impactReady',anatomy:next.anatomy,stats:next.stats});break;
      }
      case 'advance':{
        if(!active||!plan)break;
        const previous=map;map=stageMap(eruptionBase,plan.map,Math.max(0,Math.min(1,msg.progress)));
        liveWater(previous,map,8);await frame(token,false,previous);break;
      }
      case 'finish':{
        if(!active||!plan)break;
        map={...plan.map,water:map.water};
        send({type:'settling'});const result=await settle(token,true);check(token);
        const op=operation(before,map,settings,intent,result,reroll);
        const entry:Entry={op,base:eruptionBase,intent:{...intent},settings:{...settings},nextSeed:settings.seed};
        await frame(token);check(token);
        undo.push(entry);redo=[];if(undo.length>16)undo.shift();active=false;plan=null;
        send({type:'operation',op,base:before,eruptionBase});
        send({type:'finished',settled:result.settled,ticks:result.ticks,seed:settings.seed,undo:undo.length,canReroll:true});break;
      }
      case 'carve':{
        before=snapshot(map);eruptionBase=before;active=true;settings={...DEFAULTS,seed:18};intent={origin:msg.intent.origin};
        const carve=new CarveRun(map,{...CARVE,mode:'aim',power:60,seed:18,wander:0,width:4,dry:true,defyGravity:true},msg.intent);
        for(let k=0;k<240&&!carve.metrics.stable;k++){
          check(token);carve.step();await yieldSlice();
          if(k%16===0){map={...map,...carve.map};map.fallen=map.fallen.filter(f=>map.entities.some(e=>e.id===f.id));await frame(token);}
        }
        map={...map,...carve.map};map.fallen=map.fallen.filter(f=>map.entities.some(e=>e.id===f.id));
        const result=await settle(token),op=operation(before,map,settings,intent,result);op.op='carveStudyResult';
        await frame(token);check(token);undo.push({op,base:before,intent,settings,nextSeed:18});redo=[];active=false;
        send({type:'operation',op,base:before,eruptionBase:before});send({type:'finished',settled:result.settled,ticks:result.ticks,seed:18,canReroll:false});break;
      }
      case 'undo':
        if(undo.length){const entry=undo.pop()!;map=applyOperation(map,entry.op,true);redo.push(entry);await frame(token);}break;
      case 'redo':
        if(redo.length){const entry=redo.pop()!;map=applyOperation(map,entry.op);undo.push(entry);await frame(token);}break;
      case 'snapshot':send({type:'snapshot',map});break;
      case 'replay':{
        const b=msg.bundle;if(b?.format!==1)throw Error('Unknown saved impact');
        const base=storedMap(b.base),original=storedMap(b.eruptionBase??b.base),op=b.operation as EruptOperation;
        const restored=applyOperation(base,op);
        map=base;before=base;eruptionBase=original;undo=[];redo=[];last=null;
        await frame(token,true);send({type:'replayBase'});
        map=restored;await frame(token);
        undo=[{op,base:original,intent:op.params.intent,settings:op.params.settings,nextSeed:op.params.settings.seed}];
        send({type:'operation',op,base,eruptionBase:original});
        send({type:'finished',settled:op.params.settled,ticks:op.params.settleTicks,seed:op.params.settings.seed,undo:1});break;
      }
    }
  }catch(e){
    if(!(e instanceof Cancelled)){
      if(active){map=snapshot(before);last=snapshot(map);active=false;plan=null;send({type:'cancelled'});}
      send({type:'error',text:e instanceof Error?e.message:String(e)});
    }
  }finally{busy=false;send({type:'ready',workMs:performance.now()-t});}
};
