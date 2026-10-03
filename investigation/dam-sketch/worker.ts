import {SketchJob,install,type MapSnapshot} from './engine';
import {fromTimber} from './maps';
let map:MapSnapshot,job:SketchJob|null=null,id=0,timer:any=null,pending:any=null,nextTicks=8;
const send=(message:any,transfer:Transferable[]=[])=>postMessage(message,{transfer});
function draw(){
 const water=(job as any).sim.tileWater(),N=map.model.W*map.model.H,pixels=new Uint8ClampedArray(4*N);
 for(let i=0;i<N;i++){const wet=water.depth[i]>0,shade=Math.min(100,map.model.floor[i]*5);pixels[4*i]=wet?25:70+shade;pixels[4*i+1]=wet?130:90+shade;pixels[4*i+2]=wet?215:50+shade;pixels[4*i+3]=255;}
 return pixels;
}
function slice(){
 timer=null;if(!job)return;
 const start=performance.now(),r=job.advance(nextTicks),pixels=draw();
 nextTicks=r.phase==='weather'?128:8;
 send({id,kind:'water',pixels,width:map.model.W,height:map.model.H,ticks:r.ticks,phase:r.phase,fill:r.fill,drought:r.drought,totalWaterM3:r.totalWaterM3,sliceMs:performance.now()-start},[pixels.buffer]);
 if(r.phase==='filling'||r.phase==='weather')timer=setTimeout(slice,0);else{job.dispose();job=null;}
}
function begin(){
 timer=null;if(!pending)return;const request=pending;pending=null;id=request.id;nextTicks=8;
 job=new SketchJob(map,request.strokes,{provenance:'explicit round2 nine-day zero-source drought',frames:[{ticks:6912,kind:'drought',strengths:map.model.emitters.map(()=>0),contamination:map.model.emitters.map(e=>e.contamination)}]});slice();
}
onmessage=async event=>{
 try{
  const m=event.data;
  if(m.kind==='init'){
   install(await (await fetch('water.wasm')).arrayBuffer());map=fromTimber(new Uint8Array(await (await fetch(m.mapUrl)).arrayBuffer()),m.mapUrl);
   const warm=new SketchJob(map,m.strokes);warm.advance(128);warm.cancel();send({kind:'ready'});return;
  }
  if(m.kind==='change'){
   if(timer!==null){clearTimeout(timer);timer=null;}
   if(job){const old=id;job.cancel();job=null;send({kind:'cancelled',id:old,replacement:m.id});}
   if(pending)send({kind:'superseded',id:pending.id,replacement:m.id});
   pending=m;timer=setTimeout(begin,0);
  }
 }catch(error){send({kind:'error',error:String(error)});}
};
