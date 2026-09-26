import {ForceSession,type Notice} from './core/session';
import {snapshot,type ForceMap} from './core/map';
import {Cancelled} from './core/scheduler';
import {changedChunks,frameContext,makeChunk,slideMotion,type SlideMotion} from './core/meshes';
import {protectedGround} from './core/objects';
import {loadMap} from './demo/maps';
import {quake,erupt,crater,type ForceRequest} from './verbs';
import {skyVisibility,shadowMap,objectCasters,tileData} from '../../src/render3d/light';
import {entityView,soilView} from '../../src/render3d/model';
import {moisture} from '../../src/core/sim/moisture';
let session:ForceSession,last:ForceMap|null=null,busy=false,reset=true;
let actionId=0,completedAction=-1,completedOperation='';const pending:any[]=[];
let brush:{id:number;request:ForceRequest;revision:number;applied:number;released:boolean}|null=null;
const send=(m:Notice)=>postMessage({...m,epoch:session?.slicer.epoch??0});
async function emit(m:Notice){
 if(m.type!=='frame'){if(m.type==='operation'){completedAction=actionId;completedOperation=m.op.params.id;}send({...m,action:actionId});return;}
 const map=m.map as ForceMap,token=session.slicer.epoch;
 if(m.metadataOnly){send({...m,map:undefined,heights:map.heights,keep:protectedGround(map),water:map.water.depth});return;}
 const ctx=frameContext(map);
 let motion:SlideMotion|undefined;
 const plan=session.active?.plan;
 if(plan instanceof quake.QuakePlan&&plan.settings.mode==='slide'){
  motion=m.painted?slideMotion(plan,m.previousPlan instanceof quake.QuakePlan?m.previousPlan:null,m.previousMap):
   {id:0,tiles:new Float32Array(map.W*map.H*3),objects:new Map()};
 }
 if(reset){send({type:'reset',W:map.W,H:map.H,name:map.name,layers:map.rockLayers});reset=false;}
 const transition=!!last&&(plan instanceof erupt.EruptPlan||plan instanceof crater.ImpactPlan);
 send({type:'batch',transition});
 for(const c of changedChunks(map,last,motion)){
  session.slicer.check(token);const chunk=makeChunk(map,c.cx,c.cy,ctx,c.objects,motion,transition?last!:undefined),buffers=new Set<ArrayBuffer>();
  const collect=(v:any)=>{if(ArrayBuffer.isView(v))buffers.add(v.buffer as ArrayBuffer);else if(v&&typeof v==='object')Object.values(v).forEach(collect);};collect(chunk);
  (postMessage as unknown as (m:unknown,t:Transferable[])=>void)({type:'chunk',chunk,epoch:token},[...buffers]);await session.slicer.yield(token);
 }
 const sky=skyVisibility(map.W,map.H,map.heights);await session.slicer.yield(token);
 const wet=moisture(map.heights,map.water.depth,map.water.contamination,map.W,map.H);
 const tiles=tileData(map.W,map.H,map.heights,sky,soilView(wet,map.water.contamination),ctx.surface);await session.slicer.yield(token);
 const light=shadowMap(map.W,map.H,map.heights,objectCasters(map.W,map.H,entityView(map.entities.filter(e=>!map.fallen.some(f=>f.id===e.id)))));
 session.slicer.check(token);send({type:'lighting',tiles,light});last=snapshot(map);
 send({...m,map:undefined,previousMap:undefined,previousPlan:undefined,heights:map.heights,keep:protectedGround(map),water:map.water.depth});
}
async function paint(){
 while(brush&&brush.applied!==brush.revision){
  const b=brush,rev=b.revision;await session.paint(b.request);b.applied=rev;
  if(b.released&&rev===b.revision){await session.finish();brush=null;}
 }
}
self.onmessage=async({data:m}:MessageEvent)=>{
 if(m.type==='cancel'&&m.action!==undefined&&m.action!==actionId)return;
 if(m.type==='cancel'&&!session?.active&&m.action===completedAction&&session?.past.at(-1)?.op.params.id===completedOperation){
  session.slicer.cancel();session.undo();last=null;send({type:'cancelled'});m.type='refresh';
 }
 if(m.type==='snapshot'){send({type:'snapshot',map:session.map});return;}
 if(m.type==='brush-update'||m.type==='brush-end'){
  if(!brush||brush.id!==m.id)return;brush.request=structuredClone(m.request);brush.revision++;brush.released=m.type==='brush-end';
  if(busy)return;
 }
 if((m.type==='cancel'||m.type==='undo')&&session?.active){
  session.cancel();brush=null;last=null;send({type:'cancelled'});if(busy)return;m.type='cancel';
 }
 if(busy){if(['undo','redo','finish','refresh'].includes(m.type)){pending.push(m);return;}send({type:'error',text:'Land is still finishing'});return;}
 busy=true;session?.slicer.begin();
 if(['start','reroll','brush-begin'].includes(m.type))actionId=m.action??actionId+1;
 try{
  switch(m.type){
   case 'load':{
    const map=await loadMap(m.id);session=new ForceSession(map,emit);last=null;reset=true;brush=null;await session.frame();break;
   }
   case 'start':await session.start(m.request);break;
   case 'reroll':await session.start(session.past.at(-1)!.op.params.request,true);break;
   case 'advance':await session.advance();break;
   case 'finish':await session.finish();break;
   case 'brush-begin':
    brush={id:m.id,request:m.request,revision:0,applied:-1,released:false};
    await session.start(m.request,false,true);if(brush){brush.applied=0;if(brush.released&&brush.revision===0){await session.finish();brush=null;}else await paint();}break;
   case 'brush-update':case 'brush-end':await paint();break;
   case 'refresh':case 'cancel':await session.frame();break;
   case 'undo':session.undo();await session.frame();break;
   case 'redo':session.redo();await session.frame();break;
   case 'export':send({type:'project',project:session.export()});break;
   case 'import':session.import(m.project);last=null;reset=true;await session.frame();break;
   default:throw Error('Unknown force command');
  }
 }catch(e){
  if(e instanceof Cancelled){last=null;await session.frame();}
  else{session?.cancel();brush=null;last=null;if(session)await session.frame();send({type:'error',text:e instanceof Error?e.message:String(e)});}
 }finally{busy=false;send({type:'ready',active:!!session?.active,painting:!!brush,maxSliceMs:session?.slicer.maxSliceMs});const next=pending.shift();if(next)setTimeout(()=>self.onmessage!({data:next} as MessageEvent),0);}
};
