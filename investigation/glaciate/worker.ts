import { Session } from './session';
import { loadMap } from './maps';
import { route,flatAt,sizeOf,waterRun,DEFAULTS,type Request } from './model';
import { snapshot,json,modelFor,type ForceMap } from '../forces-core/core/map';
import { protectedGround } from '../forces-core/core/objects';
import { changedChunks,frameContext,makeChunk } from '../forces-core/core/meshes';
import { skyVisibility,shadowMap,objectCasters,tileData } from '../../src/render3d/light';
import { entityView,soilView } from '../../src/render3d/model';
import { moisture } from '../../src/core/sim/moisture';
import { signature } from './operation';
import { timber } from './export';
let session:Session,last:ForceMap|null=null,epoch=0,busy=false;
const send=(m:any,e=epoch)=>postMessage({...m,epoch:e});
// MessageChannel yields to commands without accumulating Windows' nested timer floor.
const channel=new MessageChannel(),waiting:(()=>void)[]=[];channel.port1.onmessage=()=>waiting.shift()?.();
const pause=(ms=0)=>new Promise<void>(r=>{if(ms>0)setTimeout(r,ms);else{waiting.push(r);channel.port2.postMessage(0);}});
async function frame(e:number,fullLight=false){
 const m=snapshot(session.map),ctx=frameContext(m);send({type:'batch'},e);
 for(const c of changedChunks(m,last)){if(e!==epoch)return;send({type:'chunk',chunk:makeChunk(m,c.cx,c.cy,ctx,c.objects)},e);await pause();}
 if(e!==epoch)return;
 if(fullLight||!last){const sky=skyVisibility(m.W,m.H,m.heights),wet=moisture(m.heights,m.water.depth,m.water.contamination,m.W,m.H);
  const lighting={tiles:tileData(m.W,m.H,m.heights,sky,soilView(wet,m.water.contamination),ctx.surface),light:shadowMap(m.W,m.H,m.heights,objectCasters(m.W,m.H,entityView(m.entities)))};send({type:'lighting',lighting},e);}
 last=m;send({type:'frame',heights:m.heights,keep:protectedGround(m),signature:signature(m)},e);
}
self.onmessage=async({data:a})=>{
 if(a.type==='snapshot'){send({type:'snapshot',map:session.map});return;}
 if(a.type==='cancel'||a.type==='undo'){
  const cancelledEpoch=++epoch;session?.undo();busy=false;last=null;send({type:'cancelled',signature:signature(session.map)},cancelledEpoch);await frame(cancelledEpoch,true);if(cancelledEpoch===epoch)send({type:'ready'},cancelledEpoch);return;
 }
 if(a.type==='preview'){if(!busy&&session){try{const m=session.map,r=sizeOf(a.settings)/2,shallow=m.heights[a.intent.origin]<=2;
  const lobe=a.settings.mode==='flow'&&flatAt(m,a.intent.origin,r),path=lobe?Array.from({length:49},(_,k)=>({x:a.intent.origin%m.W+.5+Math.cos(k/48*Math.PI*2)*r*1.3,y:Math.floor(a.intent.origin/m.W)+.5+Math.sin(k/48*Math.PI*2)*r*1.3})):route(m,a.settings,a.intent,session.valley);
  send({type:'preview',id:a.id,path,shallow});}catch{}}return;}
 if(a.type==='load'){epoch++;session?.cancel();busy=false;last=null;}
 if(busy)return;busy=true;const e=++epoch;send({type:'begin'});
 try{
  if(a.type==='load'){const loaded=await loadMap(a.id);if(e!==epoch)return;session=new Session(loaded);last=null;send({type:'reset',map:session.map});await frame(e,true);}
  if(a.type==='show'){session=new Session(a.map);last=null;send({type:'reset',map:session.map});await frame(e,true);}
  if(a.type==='start'||a.type==='reroll'){
   const plannedAt=performance.now(),p=session.start(a.request,a.type==='reroll');send({type:'planned',path:p.path,mask:p.mask,baseHeights:p.before.heights,lobe:p.lobe,notice:p.notice,settings:p.request.settings,metrics:p.metrics,basins:p.basins,planningMs:performance.now()-plannedAt});
   const run=waterRun(p);let water:ReturnType<typeof run.advance>=null;const began=performance.now();
   for(let step=1;step<=30;step++){
    if(e!==epoch)return;
    // Bounded worker work; UI never waits for a water tick or a chunk mesh.
    if(!water)water=run.advance(32);
    if(water)p.map.water={depth:water.depth.slice(),contamination:water.contamination.slice()};
    session.frame(step/6);await frame(e);if(e!==epoch)return;send({type:'stage',t:step/6});
    await pause(Math.max(0,began+step*1000/6-performance.now()));
   }
   if(!water)send({type:'settling'});
   while(!water){if(e!==epoch)return;water=run.advance(8);await pause();}
   if(e!==epoch)return;p.map.water={depth:water.depth.slice(),contamination:water.contamination.slice()};
   const op=session.finish({settled:water.settled,ticks:water.ticks});await frame(e,true);if(e!==epoch)return;
   send({type:'finished',op,metrics:p.metrics,basins:p.basins,hanging:p.hanging.length,settled:water.settled,ticks:water.ticks,signature:signature(session.map)},e);
  }
  if(a.type==='redo'){session.redo();await frame(e,true);send({type:'redone'});}
  if(a.type==='export')send({type:'project',project:session.export()});
  if(a.type==='import'){session.import(a.project);last=null;send({type:'reset',map:session.map});await frame(e,true);}
  if(a.type==='timber'){
   if(session.map.entities.filter(e=>e.template==='StartingLocation').length!==1)throw Error('This terrain study has no playable start. Save study instead.');
   send({type:'timber',bytes:timber(session.map)});
  }
 }catch(err){if(e!==epoch)return;session?.cancel();last=null;if(session)await frame(e,true);if(e===epoch)send({type:'error',message:String(err)},e);}
 finally{if(e===epoch){busy=false;send({type:'ready'});}}
};
