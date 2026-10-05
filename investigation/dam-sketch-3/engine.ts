import type { Kernel, State } from './kernel.ts';
import { compileWall, remapWater, type Snapshot, type Stroke } from './wall.ts';
import { spillLabels } from './spill.ts';
export const TICKS_PER_DAY=768;
export interface Options {
 fillTicks?:number;
 /** Explicit observed drought forcing, in the Rust model's emitter order. No random weather. */
 drought?:{ticks:number;provenance:string;strengths:readonly number[];contamination:readonly number[]};
}
export function createJob(kernel:Kernel,input:Snapshot,strokes:readonly Stroke[],options:Options={}) {
 const map=structuredClone(input),opts=structuredClone(options),N=map.W*map.H;
 if(!Number.isInteger(map.W)||!Number.isInteger(map.H)||map.W<1||map.H<1||N>1048576||map.masks.length!==N)throw Error('Invalid map dimensions');
 const fillTicks=opts.fillTicks??6*TICKS_PER_DAY;
 if(!Number.isInteger(fillTicks)||fillTicks<128||fillTicks%128)throw Error('Fill budget must be a positive multiple of 128 ticks');
 for(const o of map.occupants??[])if(!o.id||!Number.isInteger(o.z)||!Number.isInteger(o.height)||o.z<0||o.height<1||o.z+o.height>34||o.tiles.some(i=>!Number.isInteger(i)||i<0||i>=N))throw Error('Invalid occupancy record');
 const wall=compileWall(map,strokes),control=kernel.create(map.W,map.H,map.masks,map.objects);
 let sim:ReturnType<Kernel['create']>|undefined;
 try {
  if(map.water)control.setState(map.water);
  sim=kernel.create(map.W,map.H,map.masks,wall.objects);
  sim.setState(remapWater(control.state(),sim!.state(),map.W,map.H));
 }catch(e){sim?.dispose();control.dispose();throw e;}
 try {
  const drought=opts.drought;
  if(drought&&(!Number.isInteger(drought.ticks)||drought.ticks<1||!drought.provenance||drought.strengths.some(s=>!Number.isFinite(s)||s<0||s>1000000)||drought.contamination.some(c=>!Number.isFinite(c)||c<0||c>1)||drought.strengths.length*4!==sim.read(15).length||drought.contamination.length!==drought.strengths.length))throw Error('Invalid explicit drought forcing');
  for(const p of [...map.start??[],...map.farmland??[]])if(!Number.isInteger(p.tile)||p.tile<0||p.tile>=N||!Number.isInteger(p.z)||p.z<0||p.z>=34)throw Error('Invalid exposure point');
 }catch(e){sim!.dispose();control.dispose();throw e;}
 const active=sim;
 const before=control.state(),after=active.state(),oldSpill=spillLabels(map.W,map.H,before,map.objects),newSpill=spillLabels(map.W,map.H,after,wall.objects);
 const wallTiles=new Set(wall.tiles),reservoirColumns:number[]=[];
 for(let i=0;i<N;i++)if(!wallTiles.has(i))for(let k=0;k<after.count[i];k++){
  const c=k*N+i;
  for(let s=0;s<before.count[i];s++){const old=s*N+i;if(before.floor[old]<=after.floor[c]&&before.ceiling[old]>=after.ceiling[c]&&newSpill[c]>oldSpill[old]){reservoirColumns.push(c);break;}}
 }
 let phase:'filling'|'drought'|'complete'|'cancelled'='filling',fill:{ticks:number;settled:boolean;capped:boolean}|null=null;
 let previous=after.depth.map((d,i)=>d+after.overflow[i]),previousVolume=volume(after),dryTicks=0,firstDry:number|null=null,stored:number[]=[];
 let released=false;
 const held=(s:State,columns=reservoirColumns)=>columns.reduce((sum,c)=>sum+s.depth[c]+s.overflow[c],0);
 function volume(s:State){return s.depth.reduce((sum,d,i)=>sum+d+s.overflow[i],0);}
 function result(){
  const water=sim!.state(),baseline=control.state();
  const tileWet=(s:State,i:number)=>{for(let k=0;k<s.count[i];k++)if(s.depth[k*N+i]+s.overflow[k*N+i]>0)return true;return false;};
  const wetAt=(i:number,z:number)=>{for(let k=0;k<water.count[i];k++){const c=k*N+i;if(water.floor[c]<=z&&z<water.ceiling[c]&&water.floor[c]+water.depth[c]>z)return true;}return false;};
  const wet:number[]=[],newlyWet:number[]=[];for(let i=0;i<N;i++){if(tileWet(water,i))wet.push(i);if(tileWet(water,i)&&!tileWet(baseline,i))newlyWet.push(i);}
  const pools=reservoirColumns.filter(c=>water.depth[c]+water.overflow[c]>0).map(c=>({column:c,tile:c%N,floor:water.floor[c],ceiling:water.ceiling[c],surface:water.floor[c]+water.depth[c],volumeM3:water.depth[c]+water.overflow[c]}));
  return {phase,ticks:sim!.info(0),backend:sim!.info(1)===0?'rust-flat':'rust-stacked',fill:fill&&{...fill},
   wall:{tiles:[...wall.tiles],pieces:structuredClone(wall.pieces),counts:{...wall.counts}},water,
   waterHeldM3:held(water),reservoirColumns:[...reservoirColumns],reservoir:pools,
   totalWaterM3:volume(water),controlWaterM3:volume(baseline),additionalWaterM3:volume(water)-volume(baseline),
   floods:{wet,newlyWet,start:(map.start??[]).filter(p=>wetAt(p.tile,p.z)),farmland:map.farmland?.filter(p=>wetAt(p.tile,p.z))??null,
    objects:(map.occupants??[]).map(o=>({id:o.id,tiles:o.tiles.filter(i=>wetAt(i,o.z))})).filter(o=>o.tiles.length)},
   drought:opts.drought?{provenance:opts.drought.provenance,coveredDays:(firstDry??dryTicks)/TICKS_PER_DAY,observedDays:dryTicks/TICKS_PER_DAY,exhausted:firstDry!==null,censored:firstDry===null,started:fill!==null}:null};
 }
 let cached:ReturnType<typeof result>|null=null;
 const publish=()=>cached?structuredClone(cached):result();
 const release=()=>{if(!released){cached=result();sim!.dispose();control.dispose();released=true;}};
 function advance(budget:number){
  if(!Number.isInteger(budget)||budget<1)throw Error('Positive integer tick budget required');
  if(released)return publish();
  while(budget--&&(phase==='filling'||phase==='drought')){
   // One exact kernel tick is the smallest atomic water operation.
   sim!.run(1);control.run(1);
   if(phase==='filling'&&sim!.info(0)%128===0){
    const s=sim!.state(),v=volume(s);let moved=0;
    for(let c=0;c<s.depth.length;c++)if(Math.abs(s.depth[c]+s.overflow[c]-previous[c])>.005)moved++;
    const settled=Math.abs(v-previousVolume)/Math.max(v,1e-9)<.002&&moved<=.005*N;
    previous=s.depth.map((d,i)=>d+s.overflow[i]);previousVolume=v;
    if(settled||sim!.info(0)===fillTicks){
     fill={ticks:sim!.info(0),settled,capped:!settled};
     stored=reservoirColumns.filter(c=>s.depth[c]+s.overflow[c]>0);
     if(opts.drought){phase='drought';firstDry=held(s,stored)===0?0:null;sim!.force(opts.drought.strengths,opts.drought.contamination);control.force(opts.drought.strengths,opts.drought.contamination);}
     else phase='complete';
    }
   }else if(phase==='drought'){
    dryTicks++;if(firstDry===null&&held(sim!.state(),stored)===0)firstDry=dryTicks;
    if(firstDry!==null||dryTicks===opts.drought!.ticks)phase='complete';
   }
  }
  const r=result();if(phase==='complete')release();return r;
 }
 return {advance,result:publish,cancel(){if(!released){phase='cancelled';release();}return publish();},dispose(){if(phase==='filling'||phase==='drought')phase='cancelled';release();}};
}
export type Job=ReturnType<typeof createJob>;
export type Result=ReturnType<Job['result']>;
/** Cooperative runner. Each publication is a detached plain-data snapshot. */
export async function fillProgressively(job:Job,publish:(result:Result)=>void,signal?:AbortSignal){
 const cancel=()=>job.cancel();signal?.addEventListener('abort',cancel,{once:true});
 try {if(signal?.aborted)job.cancel();while(['filling','drought'].includes(job.result().phase)){publish(job.advance(8));await new Promise<void>(resolve=>setTimeout(resolve,0));}return job.result();}
 finally {signal?.removeEventListener('abort',cancel);}
}
