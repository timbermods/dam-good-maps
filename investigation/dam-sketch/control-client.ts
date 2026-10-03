import {raster} from './wall';
(window as any).runControl=(config:any)=>new Promise(resolve=>{
 const canvas=document.querySelector('#wall') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
 canvas.width=canvas.height=config.size;const frames:any[]=[];let previous=0,frame=0,current=0,nextChange=0,started=0;
 function raf(timestamp:number){const start=performance.now();frame++;
  if(!started)started=timestamp;
  if(current<12&&timestamp>=nextChange){
   current++;nextChange=timestamp+100;const strokes=structuredClone(config.strokes),path=strokes.at(-1).path;path.at(-1)[1]+=current%3-1;
   ctx.clearRect(0,0,config.size,config.size);ctx.fillStyle='#f5d241';
   for(const stroke of strokes)for(const i of raster(stroke.path,config.size,config.size))ctx.fillRect(i%config.size,Math.floor(i/config.size),1,1);
   document.querySelector('#status')!.textContent='Control drag · request '+current;
  }
  frames.push({workMs:performance.now()-start,intervalMs:previous?timestamp-previous:0});previous=timestamp;
  if(timestamp-started>=2000&&current===12)resolve({frames});else requestAnimationFrame(raf);
 }
 requestAnimationFrame(raf);
});
