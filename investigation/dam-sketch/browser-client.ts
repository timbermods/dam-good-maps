export {};
import {raster} from './wall';
const canvas=document.querySelector('canvas')!,ctx=canvas.getContext('2d')!,status=document.querySelector('#status')!;
const wallCanvas=document.querySelector('#wall') as HTMLCanvasElement,wallCtx=wallCanvas.getContext('2d')!;
let worker:Worker;
(window as any).runSketch=async(config:any)=>{
 worker?.terminate();worker=new Worker('worker.js');
 await new Promise<void>((resolve,reject)=>{worker.onmessage=e=>e.data.kind==='ready'?resolve():e.data.kind==='error'?reject(Error(e.data.error)):null;worker.onerror=e=>reject(Error(e.message));worker.postMessage({kind:'init',mapUrl:config.mapUrl,strokes:config.strokes});});
 canvas.width=canvas.height=config.size;
 wallCanvas.width=wallCanvas.height=config.size;
 return new Promise((resolve,reject)=>{
  const changes:any[]=[],frames:any[]=[],messages:any[]=[],cancellations:any[]=[],longTasks:any[]=[];
  let current=0,pending:any=null,frameWork=0,previous=0,frame=0,nextChange=0,lastPaint=0,fillAt:number|null=null,weatherAt:number|null=null,staleDisplayed=0,staleDropped=0,done=false;
  const observer=typeof PerformanceObserver!=='undefined'?new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({start:e.startTime,duration:e.duration});}):null;
  try{observer?.observe({entryTypes:['longtask']});}catch{}
  worker.onmessage=e=>{const start=performance.now(),m=e.data;
   if(m.kind==='error'){done=true;reject(Error(m.error));return;}
   if(m.kind==='cancelled'||m.kind==='superseded'){const old=changes.find(c=>c.id===m.id),next=changes.find(c=>c.id===m.replacement);cancellations.push({id:m.id,replacement:m.replacement,kind:m.kind,ackMs:next?performance.now()-next.at:null,afterTicks:old?.lastTicks??0});}
   if(m.kind==='water'){messages.push({id:m.id,at:performance.now(),ticks:m.ticks,phase:m.phase,sliceMs:m.sliceMs});if(m.id===current){pending=m;}else staleDropped++;}
   frameWork+=performance.now()-start;
  };
  function raf(timestamp:number){
   if(done)return;const start=performance.now();frame++;
   if(current<12&&timestamp>=nextChange){
    current++;nextChange=timestamp+100;pending=null;lastPaint=0;fillAt=null;weatherAt=null;const strokes=structuredClone(config.strokes);
    // Move the authored last endpoint along y, back and forth by at most two tiles.
    const path=strokes.at(-1).path;path.at(-1)[1]+=current%3-1;
    changes.push({id:current,at:performance.now(),firstVisibleMs:null,paintGaps:[],lastTicks:0});
    wallCtx.clearRect(0,0,config.size,config.size);wallCtx.fillStyle='#f5d241';
    for(const stroke of strokes)for(const i of raster(stroke.path,config.size,config.size))wallCtx.fillRect(i%config.size,Math.floor(i/config.size),1,1);
    worker.postMessage({kind:'change',id:current,strokes});
    status.textContent='Dragging wall · request '+current;
   }
   if(pending){const m=pending;pending=null;if(m.id!==current)staleDisplayed++;
    ctx.putImageData(new ImageData(m.pixels,m.width,m.height),0,0);
    const c=changes.at(-1),now=performance.now();if(c.firstVisibleMs===null)c.firstVisibleMs=now-c.at;
    if(lastPaint)c.paintGaps.push(now-lastPaint);lastPaint=now;c.lastTicks=m.ticks;
    status.textContent='Request '+current+' · '+m.phase+' · tick '+m.ticks+' · '+m.totalWaterM3.toFixed(2)+' m³';
    if(m.phase!=='filling'&&fillAt===null){fillAt=now-c.at;weatherAt=now;}
    if(m.phase==='complete'&&current===12){
     done=true;observer?.disconnect();
     frames.push({workMs:frameWork+performance.now()-start,intervalMs:previous?timestamp-previous:0});
     resolve({changes:changes.map(c=>({...c,at:undefined})),frames,messages,cancellations,longTasks,staleDisplayed,staleDropped,fillMs:fillAt,droughtMs:now-weatherAt!,totalMs:now-c.at,final:{fill:m.fill,drought:m.drought,totalWaterM3:m.totalWaterM3}});return;
    }
   }
   frames.push({workMs:frameWork+performance.now()-start,intervalMs:previous?timestamp-previous:0});frameWork=0;previous=timestamp;requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
 });
};
