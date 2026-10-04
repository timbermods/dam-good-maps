import * as fast from './local/reference-water';
import * as before from './local/before-water';
import * as current from './water';
import {decodeJob,snapshot,packSnapshots} from './protocol';
function same(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)throw Error('Length');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Byte '+i);}
let ready=false;
onmessage=async({data})=>{try{
 if(!ready){for(const [api,url] of [[before,'before-water.wasm'],[current,'water.wasm']] as const){const bytes=await(await fetch(url)).arrayBuffer();if(!await api.installRustWater(bytes)){await WebAssembly.compile(bytes);throw Error('Install '+url);} }ready=true;}
 const prefix=data.prefix??'checks';const input=new Uint8Array(await(await fetch(prefix+'/'+data.id+'.in')).arrayBuffer()),job=decodeJob(input),expected=new Uint8Array(await(await fetch(prefix+'/'+data.id+'.expected')).arrayBuffer());
 const api={fast,before,current}[data.variant as 'fast'],metrics={construct:0,kernel:0,run:0,saturation:0,calls:0,ticks:0,total:0,serialize:0,bytesPerCall:0};
 const start=performance.now(),sim:any=new api.WaterSim(structuredClone(job.model),job.initial,job.opts);sim.out.set(job.out);metrics.construct=performance.now()-start;
 if(data.variant!=='fast'&&sim.backend!=='wasm')throw Error('Fallback '+sim.fallbackReason);
 if(sim.rust){const r=sim.rust;sim.rust={...r,water_run:(...args:any[])=>{const t=performance.now();r.water_run(...args);metrics.kernel+=performance.now()-t;},water_sat:(...args:any[])=>{const t=performance.now();r.water_sat(...args);metrics.saturation+=performance.now()-t;}};metrics.bytesPerCall=(sim.N*(sim.dam?13:12))*8;}
 const run=sim.run.bind(sim);sim.run=(t:number,scale=1)=>{const start=performance.now();run(t,scale);metrics.run+=performance.now()-start;metrics.calls++;metrics.ticks+=Math.ceil(t);return sim;};
 const snaps:Uint8Array[]=[];
 if(data.fixed){const steps=(s:any)=>{for(let left=data.fixed;left>0;){const ticks=Math.min(left,data.chunk??left);if(!(ticks>0))throw Error('Invalid profiling chunk');s.run(ticks);left-=ticks;}};steps(sim);metrics.total=performance.now()-start;const ref=new fast.WaterSim(structuredClone(job.model),job.initial,job.opts);ref.out.set(job.out);steps(ref);same(snapshot(sim),snapshot(ref));}
 else {for(const cmd of job.commands){let result:ReturnType<typeof fast.settle>|null=null;if('settle' in cmd)result=api.settle(sim,cmd.settle);else{if(cmd.emitters)for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],cmd.emitters[i]);for(const [i,v] of cmd.floors??[])sim.F[i]=v;sim.run(cmd.ticks,cmd.scale??1);}if(!('capture'in cmd)||cmd.capture!==false){const t=performance.now();snaps.push(snapshot(sim,result));metrics.serialize+=performance.now()-t;}}same(packSnapshots(snaps),expected);}
 if(!data.fixed)metrics.total=performance.now()-start;metrics.ticks=sim.ticks;sim.dispose?.();postMessage({ok:true,id:data.id,variant:data.variant,metrics});
 }catch(e){postMessage({ok:false,error:String(e)+'\n'+(e as Error).stack});}};
